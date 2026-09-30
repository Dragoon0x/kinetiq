"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RibbonTone = "info" | "success" | "warn" | "danger";

export type RibbonNotice = {
  id: string;
  title: string;
  body?: string;
  /** @default "info" */
  tone?: RibbonTone;
};

export type RibbonFabric = "satin" | "canvas" | "paper";

export type RibbonUnfurlProps = {
  /** The notices, in the order they drop. One is on the roller at a time. */
  notices: RibbonNotice[];
  /** Fires as a ribbon starts to roll away: by the hand, a key, its button, or its time running out. */
  onDismiss?: (id: string) => void;
  /** Fires when the visitor pins a ribbon open (true) or lets it go again (false). */
  onPin?: (id: string, pinned: boolean) => void;
  /** Seconds a ribbon stays down, 3 to 12. It is also its leader: 7px of stitched fabric per second. @default 6 */
  duration?: number;
  /** How much the ribbon bounces and sways as it lands, 0 to 1. @default 0.5 */
  swing?: number;
  /** The cloth, and its weight: light satin, heavy canvas, stiff paper. @default "satin" */
  fabric?: RibbonFabric;
  /** The notice region's accessible name. @default "Notices" */
  label?: string;
  /** The surface the roller is mounted on. The ribbon hangs over it and never outgrows it. */
  children?: React.ReactNode;
  /** Play the roll-up and the ratchet. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The roller's axis, from the top edge. The fabric leaves the roll here. */
const AXIS = 9;
/** The bare core's radius; the roll grows from it with every wound pixel. */
const CORE = 5;
/** How much radius a pixel of wound fabric adds, as area: thin cloth. */
const THICK = 0.36;
/** Leader per second of `duration`: one stitch every 7px. */
const STITCH = 7;
const MIN_LEADER = 12;
const HEM = 10;
/** Fabric kept on the roll past the leader, so a pull past full length has cloth to give. */
const RESERVE = 40;
/** How far past full length a pull must go before the ratchet catches. */
const PIN_PULL = 20;
/** Room left under the hem inside the surface, for the landing bounce. */
const ROOM = 12;

type Cloth = {
  /** The cloth's own colour, over the card. */
  cloth: string;
  /** Its face, over the cloth colour: sheen, weave or rules. */
  face: string;
  /** The drop: stiffness, and the damping ratio at full `swing`. */
  drop: number;
  dropRatio: number;
  /** The sway: stiffness, damping ratio at full `swing`, amplitude in degrees. */
  swayK: number;
  swayRatio: number;
  amp: number;
};

// Cloth colours are the card mixed with the notice's tone, so the ribbon is a
// surface of the theme it hangs in. Shading mixes toward white and black in
// oklab, which keeps the hue.
const FABRICS: Record<RibbonFabric, Cloth> = {
  satin: {
    cloth: "color-mix(in oklab, var(--card) 82%, var(--tone))",
    face: "linear-gradient(90deg, color-mix(in oklab, var(--cloth) 86%, white) 0%, var(--cloth) 14%, color-mix(in oklab, var(--cloth) 90%, black) 34%, var(--cloth) 50%, color-mix(in oklab, var(--cloth) 84%, white) 68%, var(--cloth) 84%, color-mix(in oklab, var(--cloth) 92%, black) 100%)",
    drop: 240,
    dropRatio: 0.3,
    swayK: 60,
    swayRatio: 0.1,
    amp: 2.4,
  },
  canvas: {
    cloth: "color-mix(in oklab, var(--card) 86%, var(--tone))",
    face: "repeating-linear-gradient(0deg, color-mix(in oklab, var(--cloth) 90%, black) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, color-mix(in oklab, var(--cloth) 92%, black) 0 1px, transparent 1px 3px)",
    drop: 320,
    dropRatio: 0.55,
    swayK: 110,
    swayRatio: 0.34,
    amp: 1.2,
  },
  paper: {
    cloth: "color-mix(in oklab, var(--card) 93%, var(--tone))",
    // Fibres at two coprime pitches, so the grain never reads as a grid.
    face: "repeating-linear-gradient(180deg, transparent 0 4px, color-mix(in oklab, var(--cloth) 95%, black) 4px 5px), repeating-linear-gradient(180deg, transparent 0 6px, color-mix(in oklab, var(--cloth) 94%, white) 6px 7px), linear-gradient(180deg, color-mix(in oklab, var(--cloth) 96%, black), transparent 40%)",
    drop: 420,
    dropRatio: 0.42,
    swayK: 150,
    swayRatio: 0.28,
    amp: 1,
  },
};

const TONES: Record<RibbonTone, string> = {
  info: "var(--accent)",
  success: "var(--success)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

/** The tone as pigment: a filled shape that reads the same in both themes. */
const PIGMENT = "oklch(from var(--tone) 0.64 calc(c * 0.9) h)";
const METAL =
  "linear-gradient(180deg, color-mix(in oklab, var(--ink-3) 45%, white), var(--ink-3) 55%, color-mix(in oklab, var(--ink-3) 60%, black))";
const ROLL =
  "linear-gradient(180deg, color-mix(in oklab, var(--cloth) 70%, white), var(--cloth) 42%, color-mix(in oklab, var(--cloth) 66%, black))";
const STITCHES =
  "repeating-linear-gradient(to top, color-mix(in oklab, var(--cloth) 45%, var(--foreground)) 0 3px, transparent 3px 7px)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: r2(2 * ratio * Math.sqrt(stiffness)),
  mass: 1,
});

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** Ends a sentence once: never a second full stop after the quoted words' own. */
const sentence = (text: string) =>
  /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

function ToneGlyph({ tone }: { tone: RibbonTone }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {tone === "success" ? <path d="M3.2 6.2 5.1 8l3.7-4" /> : null}
      {tone === "danger" ? <path d="M4 4l4 4M8 4 4 8" /> : null}
      {tone === "warn" ? (
        <>
          <path d="M6 2.8v3.8" />
          <circle cx={6} cy={9} r={0.9} fill="currentColor" stroke="none" />
        </>
      ) : null}
      {tone === "info" ? (
        <>
          <path d="M6 5.4v3.8" />
          <circle cx={6} cy={3.1} r={0.9} fill="currentColor" stroke="none" />
        </>
      ) : null}
    </svg>
  );
}

type Phase =
  | "idle"
  | "waiting"
  | "arriving"
  | "timing"
  | "pinned"
  | "dragging"
  | "leaving";

type Leaving = "user" | "timer" | "host" | null;

type Run = {
  /** The notice whose fabric is on the roller. */
  id: string;
  phase: Phase;
  /** Share of the leader still out: the time left, 0 to 1. */
  frac: number;
  counting: boolean;
  pinned: boolean;
  /** The phase a drag interrupted, to go back to. */
  prev: Phase;
  start: number;
  /** Why the countdown is held: hover, focus, hidden, offscreen. */
  holds: Set<string>;
  /** Focus was on the ribbon as it left: give it to the next one. */
  refocus: boolean;
};

type Geometry = { base: number; leader: number; full: number };

type Api = {
  revive: () => void;
  shown: RibbonNotice | null;
  live: RibbonNotice[];
  measure: () => void;
  landed: () => void;
  settled: () => void;
  expire: () => void;
  finish: (id: string) => void;
  rollUp: (velocity: number, id: string) => void;
  hold: (reason: string) => void;
  letGo: (reason: string) => void;
  pause: () => void;
};

/**
 * A banner notice on a spring roller along the top edge of a surface. A notice
 * drops as a length of fabric: the roll turns and slims as it pays out, the
 * weighted hem lands on a spring and the cloth sways to rest, and the message
 * hangs just above the hem. Between the roller and the message runs a plain
 * leader, stitched once per second of `duration`; while the notice waits the
 * roller winds the leader back in at a steady 7px a second, so the message
 * rises and the stitches vanish into the roll one by one. The time left is how
 * much leader is still out. When it is gone the roller takes the rest in.
 *
 * The ribbon drags vertically 1:1: thrown up, it rolls away; pulled past its
 * full length and let go, a ratchet catches and it stays open (the same pull
 * lets it go again). The end caps turn with every pixel of fabric, the
 * countdown holds while the ribbon is hovered, focused, off screen or in a
 * hidden page, and a brush of the pointer sways the cloth.
 *
 * Each ribbon is a focusable group: ArrowUp, Delete or Escape rolls it away,
 * ArrowDown pins it, and a visible button dismisses it. Under reduced motion
 * the ribbon fades in and out at full length and the leader's stitches fade
 * from the roller end, one a second, instead of winding.
 */
export function RibbonUnfurl({
  notices,
  onDismiss,
  onPin,
  duration = 6,
  swing = 0.5,
  fabric = "satin",
  label = "Notices",
  children,
  sound = false,
  disabled = false,
  className,
}: RibbonUnfurlProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const seconds = clamp(duration, 3, 12);
  const sw = clamp01(swing);
  const cloth = FABRICS[fabric] ?? FABRICS.satin;
  const surface = children !== undefined && children !== null;

  const [gone, setGone] = React.useState<string[]>([]);
  const [held, setHeld] = React.useState<RibbonNotice | null>(null);
  const [leaving, setLeaving] = React.useState<Leaving>(null);
  const [pinned, setPinned] = React.useState(false);
  const [said, setSaid] = React.useState({
    n: 0,
    id: "",
    text: "",
    urgent: false,
  });

  // The ribbon on the roller is latched: if the host drops it from the list,
  // it still rolls away instead of vanishing.
  const live = notices.filter((n) => !gone.includes(n.id));
  const inList = held ? live.find((n) => n.id === held.id) : undefined;
  if (gone.some((id) => !notices.some((n) => n.id === id))) {
    setGone(gone.filter((id) => notices.some((n) => n.id === id)));
  }
  if (!held && !leaving && live[0]) setHeld(live[0]);
  if (held && !leaving && !inList) setLeaving("host");
  const shown = held ? (inList ?? held) : (live[0] ?? null);
  const shownId = shown?.id ?? null;
  const waiting = shown ? live.filter((n) => n.id !== shown.id).length : 0;
  const tone = shown?.tone ?? "info";

  if (shown && said.id !== shown.id) {
    setSaid({
      n: said.n + 1,
      id: shown.id,
      text: [
        sentence(shown.title),
        shown.body ? sentence(shown.body) : "",
        waiting > 0 ? `${waiting} more waiting.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      urgent: shown.tone === "danger",
    });
  }

  const len = useMotionValue(0);
  const fullMV = useMotionValue(0);
  const leaderMV = useMotionValue(Math.round(seconds * STITCH));
  const clock = useMotionValue(1);
  const sway = useMotionValue(0);
  const grip = useMotionValue(0);
  const fabricOpacity = useMotionValue(0);
  const boxH = useMotionValue(AXIS * 2);

  const rootNode = React.useRef<HTMLDivElement | null>(null);
  const regionNode = React.useRef<HTMLDivElement | null>(null);
  const fabricNode = React.useRef<HTMLDivElement | null>(null);
  const contentNode = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const geo = React.useRef<Geometry>({ base: 0, leader: 0, full: 0 });
  const s = React.useRef<Run>({
    id: "",
    phase: "idle",
    frac: 1,
    counting: false,
    pinned: false,
    prev: "timing",
    start: 0,
    holds: new Set(),
    refocus: false,
  });
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const dropRatio = lerp(1, cloth.dropRatio, sw);
  const swayRatio = lerp(0.9, cloth.swayRatio, sw);

  /**
   * A push on the cloth: the sway spring takes it as velocity, capped so the
   * swing never passes the fabric's own amplitude at this `swing`.
   */
  const kick = (degreesPerSecond: number, delay = 0) => {
    if (!motionSafe || sw <= 0) return;
    const most = cloth.amp * sw * Math.sqrt(cloth.swayK);
    run(
      "sway",
      animate(sway, 0, {
        ...spring(cloth.swayK, swayRatio),
        velocity: r2(clamp(sway.getVelocity() + degreesPerSecond, -most, most)),
        delay,
      }),
    );
  };

  const pause = () => {
    const st = s.current;
    if (!st.counting) return;
    st.counting = false;
    halt("len");
    halt("clock");
    const g = geo.current;
    st.frac = motionSafe
      ? clamp01(g.leader > 0 ? (len.get() - g.base) / g.leader : 0)
      : clamp01(clock.get());
  };

  const resume = () => {
    const st = s.current;
    const g = geo.current;
    if (st.phase !== "timing" || st.counting || st.holds.size > 0) return;
    if (st.frac <= 0.001) {
      beginLeave("timer");
      return;
    }
    st.counting = true;
    const secs = seconds * st.frac;
    const done = () => api.current?.expire();
    // The roller winds at one steady rate: linear is the physics here.
    if (motionSafe) {
      run(
        "len",
        animate(len, g.base, {
          duration: secs,
          ease: "linear",
          onComplete: done,
        }),
      );
    } else {
      run(
        "clock",
        animate(clock, 0, { duration: secs, ease: "linear", onComplete: done }),
      );
    }
  };

  const hold = (reason: string) => {
    s.current.holds.add(reason);
    pause();
  };
  const letGo = (reason: string) => {
    if (!s.current.holds.delete(reason)) return;
    resume();
  };

  const arrive = () => {
    const st = s.current;
    const g = geo.current;
    if (g.full <= 0) return;
    st.phase = "arriving";
    st.frac = 1;
    st.counting = false;
    clock.set(1);
    const landed = () => api.current?.landed();
    if (!motionSafe) {
      halt("len");
      len.set(g.full);
      run(
        "fade",
        animate(fabricOpacity, 1, {
          duration: durations.base,
          ease: easings.enter,
          onComplete: landed,
        }),
      );
      return;
    }
    fabricOpacity.set(1);
    run(
      "len",
      animate(len, g.full, {
        ...spring(cloth.drop, dropRatio),
        onComplete: landed,
      }),
    );
    // The hem swings when the drop is caught, in a direction of its own.
    const dir = hash(st.id) & 1 ? 1 : -1;
    kick(dir * cloth.amp * sw * Math.sqrt(cloth.swayK), 0.16);
  };

  const landed = () => {
    const st = s.current;
    if (st.phase !== "arriving") return;
    st.phase = st.pinned ? "pinned" : "timing";
    resume();
  };

  const revive = () => {
    const st = s.current;
    const g = geo.current;
    if (st.phase === "arriving") {
      if (!motionSafe) {
        len.set(g.full);
        fabricOpacity.set(1);
        landed();
        return;
      }
      run(
        "len",
        animate(len, g.full, {
          ...spring(cloth.drop, dropRatio),
          onComplete: () => api.current?.landed(),
        }),
      );
    } else if (st.phase === "timing") {
      resume();
    } else if (st.phase === "pinned" && Math.abs(len.get() - g.full) > 0.5) {
      run("len", animate(len, g.full, springs.snap));
    } else if (st.phase === "leaving") {
      rollUp(0, st.id);
    }
  };

  const settled = () => {
    const st = s.current;
    if (st.phase === "arriving") landed();
    else if (st.phase === "timing") resume();
  };

  const expire = () => {
    const st = s.current;
    if (!st.counting) return;
    st.counting = false;
    st.frac = 0;
    beginLeave("timer");
  };

  const measure = () => {
    const content = contentNode.current;
    const root = rootNode.current;
    const st = s.current;
    if (!content || !root || st.phase === "idle") return;
    const contentH = Math.round(content.offsetHeight);
    const want = Math.round(seconds * STITCH);
    const room = surface
      ? Math.floor(root.clientHeight - AXIS - contentH - HEM - ROOM)
      : want;
    const leader = Math.max(MIN_LEADER, Math.min(want, room));
    const base = contentH + HEM;
    const next: Geometry = { base, leader, full: base + leader };
    const prev = geo.current;
    const changed = prev.full !== next.full || prev.base !== next.base;
    const wasCounting = st.counting;
    if (changed && st.phase === "timing") pause();
    geo.current = next;
    leaderMV.set(leader);
    fullMV.set(next.full);
    if (!surface) {
      const h = AXIS + next.full + ROOM;
      if (motionSafe && boxH.get() > AXIS * 2) {
        run("box", animate(boxH, h, springs.glide));
      } else {
        boxH.set(h);
      }
    }
    if (st.phase === "waiting") {
      arrive();
      return;
    }
    if (!changed) return;
    if (st.phase === "arriving" && motionSafe) {
      run(
        "len",
        animate(len, next.full, {
          ...spring(cloth.drop, dropRatio),
          velocity: len.getVelocity(),
          onComplete: () => api.current?.landed(),
        }),
      );
    } else if (st.phase === "timing") {
      len.set(motionSafe ? r2(base + leader * st.frac) : next.full);
      if (wasCounting) resume();
    } else if (st.phase === "pinned") {
      len.set(next.full);
    }
  };

  /** The roller takes the fabric in, accelerating as its spring unwinds. */
  const rollUp = (velocity: number, id: string) => {
    halt("sway");
    const done = () => api.current?.finish(id);
    if (!motionSafe) {
      run(
        "fade",
        animate(fabricOpacity, 0, { ...exitFor(), onComplete: done }),
      );
      return;
    }
    const from = len.get();
    if (from <= 0.5) {
      done();
      return;
    }
    const time = clamp(0.22 + from / 1000, 0.28, 0.55);
    // A throw starts the wind at the speed it was thrown: the curve's first
    // handle is tilted to match, then the spring's pull accelerates it.
    const speed = Math.max(0, -velocity);
    const y1 = r2(Math.min(0.9, (0.3 * speed * time) / from));
    run(
      "len",
      animate(len, 0, {
        duration: time,
        ease: [0.3, y1, 0.75, 0.2] as [number, number, number, number],
        onComplete: done,
      }),
    );
    run("sway", animate(sway, 0, { duration: time * 0.6, ease: easings.exit }));
  };

  const beginLeave = (reason: "user" | "timer", velocity = 0, pan = 0) => {
    const st = s.current;
    const notice = api.current?.shown ?? shown;
    if (!notice || notice.id !== st.id) return;
    if (st.phase === "leaving" || st.phase === "idle" || st.phase === "waiting")
      return;
    pause();
    st.phase = "leaving";
    st.counting = false;
    st.refocus = Boolean(
      fabricNode.current?.contains(document.activeElement ?? null),
    );
    setLeaving(reason);
    onDismiss?.(notice.id);
    if (reason === "user") {
      audio.play("swish", {
        pitch: r2(0.85 + Math.min(0.55, Math.abs(velocity) / 2800)),
        gain: 0.5,
        pan,
      });
    }
    rollUp(velocity, notice.id);
  };

  const finish = (id: string) => {
    const st = s.current;
    if (st.id !== id || st.phase !== "leaving") return;
    st.phase = "idle";
    st.pinned = false;
    st.counting = false;
    st.holds.delete("hover");
    st.holds.delete("focus");
    halt("len");
    halt("sway");
    len.jump(0);
    sway.jump(0);
    clock.set(1);
    fabricOpacity.set(0);
    setGone((g) => (g.includes(id) ? g : [...g, id]));
    setHeld(null);
    setLeaving(null);
    setPinned(false);
    const next = api.current?.live.some((n) => n.id !== id) ?? false;
    if (!next) {
      if (!surface) {
        if (motionSafe) run("box", animate(boxH, AXIS * 2, springs.glide));
        else boxH.set(AXIS * 2);
      }
      if (st.refocus) {
        st.refocus = false;
        regionNode.current?.focus({ preventScroll: true });
      }
    }
  };

  const togglePin = (velocity = 0, pan = 0) => {
    const st = s.current;
    const notice = api.current?.shown ?? shown;
    if (!notice || notice.id !== st.id) return;
    if (
      st.phase !== "timing" &&
      st.phase !== "pinned" &&
      st.phase !== "arriving"
    )
      return;
    const next = !st.pinned;
    pause();
    st.pinned = next;
    st.phase = next ? "pinned" : "timing";
    st.frac = 1;
    clock.set(1);
    setPinned(next);
    setSaid((p) => ({
      n: p.n + 1,
      id: p.id,
      text: next
        ? "Kept open."
        : `Rolls up in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`,
      urgent: false,
    }));
    onPin?.(notice.id, next);
    audio.play("click", { pitch: next ? 1.2 : 0.8, gain: 0.6, pan });
    const g = geo.current;
    const onDone = () => api.current?.settled();
    if (!motionSafe) {
      halt("len");
      len.set(g.full);
      onDone();
      return;
    }
    // The leader pays back out to full length and the catch holds it there.
    run(
      "len",
      animate(len, g.full, { ...springs.snap, velocity, onComplete: onDone }),
    );
  };

  const settleBack = (velocity: number) => {
    const st = s.current;
    const g = geo.current;
    const target =
      st.phase === "timing" && motionSafe
        ? r2(g.base + g.leader * st.frac)
        : g.full;
    const onDone = () => api.current?.settled();
    if (!motionSafe) {
      run(
        "len",
        animate(len, target, {
          duration: durations.fast,
          ease: easings.enter,
          onComplete: onDone,
        }),
      );
      return;
    }
    run(
      "len",
      animate(len, target, { ...springs.glide, velocity, onComplete: onDone }),
    );
  };

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: disabled || !shown || leaving !== null,
    onStart: () => {
      const st = s.current;
      if (
        st.phase !== "timing" &&
        st.phase !== "pinned" &&
        st.phase !== "arriving"
      )
        return;
      pause();
      st.prev = st.phase;
      st.phase = "dragging";
      st.start = len.get();
      halt("len");
      grip.set(1);
    },
    onMove: ({ offset }) => {
      const st = s.current;
      if (st.phase !== "dragging") return;
      const g = geo.current;
      len.set(
        r2(Math.max(0, rubberClamp(st.start + offset.y, 0, g.full, g.full))),
      );
    },
    onEnd: ({ velocity, point }) => {
      const st = s.current;
      if (st.phase !== "dragging") return;
      grip.set(0);
      st.phase = st.prev;
      const g = geo.current;
      const at = len.get();
      const pan = panFrom(point.x, rootNode.current);
      const landing = project(at, velocity.y, 0.99);
      if (velocity.y < -650 || landing < g.base * 0.5) {
        beginLeave("user", velocity.y, pan);
      } else if (at > g.full + PIN_PULL) {
        togglePin(velocity.y, pan);
      } else {
        settleBack(velocity.y);
      }
    },
    onCancel: () => {
      const st = s.current;
      if (st.phase !== "dragging") return;
      grip.set(0);
      st.phase = st.prev;
      settleBack(0);
    },
  });

  React.useEffect(() => {
    api.current = {
      revive,
      shown,
      live,
      measure,
      landed,
      settled,
      expire,
      finish,
      rollUp,
      hold,
      letGo,
      pause,
    };
  });

  // A new duration moves the leader, and with it where the countdown is.
  React.useEffect(() => {
    api.current?.measure();
  }, [seconds, surface]);

  // The host dropped the ribbon that was down: it rolls away, silently.
  React.useEffect(() => {
    if (leaving !== "host") return;
    const st = s.current;
    const now = api.current;
    if (!now) return;
    now.pause();
    st.phase = "leaving";
    st.refocus = Boolean(
      fabricNode.current?.contains(document.activeElement ?? null),
    );
    now.rollUp(0, st.id);
    const running = anims.current;
    return () => {
      running.get("len")?.stop();
      running.get("fade")?.stop();
    };
  }, [leaving]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) api.current?.hold("hidden");
      else api.current?.letGo("hidden");
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // A re-run (StrictMode, or the component moving) stops what was in flight;
  // it picks up again from where it was, rather than freezing there.
  React.useEffect(() => {
    api.current?.revive();
    const running = anims.current;
    return () => {
      api.current?.pause();
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // The surface's height caps the leader; whether it is on screen holds the
  // countdown. Both bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootNode.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry?.isIntersecting) api.current?.letGo("offscreen");
      else api.current?.hold("offscreen");
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  // A new notice's fabric: it waits, rolled up, until its message is measured.
  const bindFabric = React.useCallback(
    (node: HTMLDivElement | null) => {
      fabricNode.current = node;
      if (!node || !shownId) return;
      const st = s.current;
      if (st.id !== shownId) {
        st.id = shownId;
        st.phase = "waiting";
        st.frac = 1;
        st.pinned = false;
        st.counting = false;
        len.jump(0);
        fabricOpacity.set(0);
      }
      if (st.refocus) {
        st.refocus = false;
        node.focus({ preventScroll: true });
      }
      return () => {
        if (fabricNode.current === node) fabricNode.current = null;
      };
    },
    [shownId, len, fabricOpacity],
  );

  const bindContent = React.useCallback((node: HTMLDivElement | null) => {
    contentNode.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const fabricY = useTransform(
    [len, fullMV] as MotionValue<number>[],
    ([l = 0, f = 0]: number[]) => r2(l - f - RESERVE),
  );
  // The roll slims as it pays out: its radius comes from the area of cloth
  // still wound on the core.
  const rollH = useTransform(
    [len, fullMV] as MotionValue<number>[],
    ([l = 0, f = 0]: number[]) =>
      r2(
        2 *
          Math.sqrt(
            CORE * CORE + (Math.max(0, f + RESERVE - l) * THICK) / Math.PI,
          ),
      ),
  );
  const rollTop = useTransform(rollH, (h) => r2(AXIS - h / 2));
  // The end caps are seen edge-on: three grooves go round each one, as far as
  // the fabric has moved, and only the ones on the near side show.
  const grooves = useTransform(len, (l) => {
    const turn = l / CORE;
    let d = "";
    for (let k = 0; k < 3; k += 1) {
      const a = turn + (k * 2 * Math.PI) / 3;
      if (Math.cos(a) <= 0.08) continue;
      d += `M1.5 ${r2(9 + 7 * Math.sin(a))}H6.5`;
    }
    return d;
  });
  const clothX = useTransform(sway, (v) => `${r2(50 + v * 9)}% 0%`);
  const upward = useTransform(
    [len, grip, fullMV, leaderMV] as MotionValue<number>[],
    ([l = 0, h = 0, f = 0, ld = 0]: number[]) => {
      const base = f - ld;
      return r2(1 - 0.45 * h * clamp01((base * 0.5 + 16 - l) / 16));
    },
  );
  const pullHint = useTransform(
    [len, grip, fullMV] as MotionValue<number>[],
    ([l = 0, h = 0, f = 0]: number[]) =>
      r2(h * clamp01((l - f - PIN_PULL + 12) / 12)),
  );
  const stitchClip = useTransform(
    clock,
    (c) => `inset(${r2((1 - c) * 100)}% 0 0 0)`,
  );

  const toneStyle = {
    "--tone": TONES[tone] ?? TONES.info,
    "--cloth": cloth.cloth,
  } as React.CSSProperties;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || leaving) return;
    switch (event.key) {
      case "ArrowUp":
      case "Delete":
      case "Backspace":
      case "Escape":
        // Handled here, where focus is: the stage must not also see Escape.
        event.preventDefault();
        beginLeave("user");
        return;
      case "ArrowDown":
        event.preventDefault();
        togglePin();
        return;
    }
  };

  return (
    <motion.div
      ref={bindRoot}
      className={cn("relative isolate w-full overflow-clip", className)}
      style={surface ? undefined : { height: boxH }}
    >
      {surface ? <div className="relative">{children}</div> : null}

      <div
        ref={regionNode}
        role="region"
        aria-label={label}
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 z-10 outline-none"
        style={toneStyle}
      >
        <p id={hintId} className="sr-only">
          Arrow Up or Delete rolls it away. Arrow Down keeps it open.
        </p>
        <p className="sr-only">
          {waiting > 0 ? `${waiting} more waiting.` : ""}
        </p>

        <motion.div
          className="absolute top-[9px] right-3.5 bottom-0 left-3.5 overflow-y-clip"
          style={{ skewX: sway, originY: 0 }}
        >
          {shown ? (
            <motion.div
              key={shown.id}
              ref={bindFabric}
              role="group"
              tabIndex={disabled ? -1 : 0}
              aria-labelledby={`${uid}-title`}
              aria-describedby={`${shown.body ? `${uid}-body ` : ""}${hintId}`}
              aria-disabled={disabled || undefined}
              onKeyDown={onKeyDown}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") hold("hover");
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") letGo("hover");
              }}
              onFocus={() => hold("focus")}
              onBlur={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && event.currentTarget.contains(next))
                  return;
                letGo("focus");
              }}
              {...drag}
              onPointerMove={(event) => {
                drag.onPointerMove(event);
                // A brush of the pointer sways the cloth by its sideways speed.
                if (event.pointerType !== "mouse" || event.buttons !== 0)
                  return;
                if (Math.abs(event.movementX) < 2) return;
                kick(
                  clamp(event.movementX, -24, 24) *
                    0.04 *
                    sw *
                    cloth.amp *
                    Math.sqrt(cloth.swayK),
                );
              }}
              className={cn(
                "pointer-events-auto absolute inset-x-0 top-0 touch-pan-x select-none",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                disabled
                  ? "cursor-not-allowed"
                  : "cursor-grab active:cursor-grabbing",
              )}
              style={{
                y: fabricY,
                opacity: fabricOpacity,
                backgroundColor: "var(--cloth)",
                backgroundImage: cloth.face,
                // Satin's sheen is wider than the cloth and slides as it sways.
                backgroundSize: fabric === "satin" ? "160% 100%" : "auto",
                backgroundPosition: fabric === "satin" ? clothX : "0% 0%",
                boxShadow:
                  "inset 1px 0 color-mix(in oklab, var(--cloth) 78%, black), inset -1px 0 color-mix(in oklab, var(--cloth) 78%, black), 0 8px 16px -10px color-mix(in oklab, black 45%, transparent)",
              }}
            >
              <div aria-hidden style={{ height: RESERVE }} />
              <motion.div
                aria-hidden
                className="relative"
                style={{ height: leaderMV }}
              >
                <motion.div
                  className={cn(
                    "absolute inset-0 transition-opacity",
                    pinned && "opacity-35",
                  )}
                  style={{ clipPath: stitchClip }}
                >
                  {["left-1.5", "right-1.5"].map((side) => (
                    <span
                      key={side}
                      className={cn(
                        "absolute inset-y-0",
                        side,
                        fabric === "canvas" ? "w-0.5" : "w-px",
                      )}
                      style={{ background: STITCHES }}
                    />
                  ))}
                </motion.div>
                <motion.span
                  className="absolute inset-0 flex items-center justify-center font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
                  style={{ opacity: pullHint }}
                >
                  {pinned ? "Release to let go" : "Release to keep open"}
                </motion.span>
              </motion.div>

              <motion.div
                ref={bindContent}
                className="flex items-start gap-2.5 border-t border-dashed px-3 pt-2.5 pb-3"
                style={{
                  opacity: upward,
                  borderColor:
                    "color-mix(in oklab, var(--cloth) 55%, var(--foreground))",
                }}
              >
                <span
                  aria-hidden
                  className="flex size-5 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: PIGMENT,
                    color: "color-mix(in oklab, var(--tone) 6%, white)",
                  }}
                >
                  <ToneGlyph tone={tone} />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    id={`${uid}-title`}
                    className="text-sm leading-5 font-medium text-foreground"
                  >
                    {shown.title}
                  </p>
                  {shown.body ? (
                    <p
                      id={`${uid}-body`}
                      className="line-clamp-2 text-xs leading-4 text-ink-2"
                    >
                      {shown.body}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label={`Dismiss: ${shown.title}`}
                  disabled={disabled || leaving !== null}
                  onClick={(event) =>
                    beginLeave(
                      "user",
                      0,
                      event.detail === 0
                        ? 0
                        : panFrom(event.clientX, rootNode.current),
                    )
                  }
                  className={cn(
                    "-my-1 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-2 text-ink-2 transition-colors",
                    "hover:bg-foreground/[0.07] hover:text-foreground",
                    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  >
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </motion.div>

              <div aria-hidden className="relative" style={{ height: HEM }}>
                {fabric === "satin" ? (
                  <span
                    className="absolute -inset-x-[3px] bottom-0.5 h-2 rounded-full"
                    style={{
                      background: `linear-gradient(180deg, color-mix(in oklab, ${PIGMENT} 62%, white), ${PIGMENT} 48%, color-mix(in oklab, ${PIGMENT} 68%, black))`,
                    }}
                  />
                ) : fabric === "canvas" ? (
                  <span
                    className="absolute inset-0 border-t border-dashed"
                    style={{
                      background: `color-mix(in oklab, ${PIGMENT} 78%, black)`,
                      borderColor: `color-mix(in oklab, ${PIGMENT} 45%, white)`,
                    }}
                  />
                ) : (
                  <span
                    className="absolute inset-0"
                    style={{
                      background: `color-mix(in oklab, var(--cloth) 62%, ${PIGMENT})`,
                      boxShadow:
                        "inset 0 1px color-mix(in oklab, var(--cloth) 60%, black)",
                    }}
                  />
                )}
                {pinned ? (
                  <motion.svg
                    viewBox="0 0 10 14"
                    className="absolute -top-1 left-1/2 h-3.5 w-2.5 -translate-x-1/2"
                    initial={motionSafe ? { scale: 0.4, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  >
                    <rect
                      x={0.5}
                      y={0.5}
                      width={9}
                      height={13}
                      rx={2}
                      style={{ fill: "var(--ink-3)" }}
                    />
                    <rect
                      x={3}
                      y={3}
                      width={4}
                      height={6}
                      rx={1}
                      style={{
                        fill: "color-mix(in oklab, var(--ink-3) 40%, black)",
                      }}
                    />
                  </motion.svg>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </motion.div>

        <div aria-hidden className="absolute inset-x-0 top-0 h-[18px]">
          <div
            className="absolute inset-x-2 top-[5px] h-2 rounded-full"
            style={{ background: METAL }}
          />
          {shown ? (
            <motion.div
              className="absolute inset-x-3 rounded-[3px]"
              style={{ top: rollTop, height: rollH, background: ROLL }}
            />
          ) : null}
          {["left-1", "right-1"].map((side) => (
            <div
              key={side}
              className={cn(
                "absolute top-0 h-[18px] w-2 overflow-clip rounded-[2px]",
                side,
              )}
              style={{ background: METAL }}
            >
              <svg viewBox="0 0 8 18" className="block h-[18px] w-2">
                <motion.path
                  d={grooves}
                  strokeWidth={1}
                  strokeLinecap="round"
                  style={{
                    stroke: "color-mix(in oklab, var(--ink-3) 45%, black)",
                  }}
                />
              </svg>
            </div>
          ))}
          {waiting > 0 ? (
            <span className="absolute top-0.5 right-4 h-3.5 rounded-full border border-hairline-strong bg-popover px-1.5 font-mono text-[9px] leading-3 text-ink-2 tabular-nums">
              +{waiting}
            </span>
          ) : null}
        </div>

        <p role="status" className="sr-only">
          <span key={said.n}>{said.urgent ? "" : said.text}</span>
        </p>
        <p role="alert" aria-live="assertive" className="sr-only">
          <span key={said.n}>{said.urgent ? said.text : ""}</span>
        </p>
      </div>
    </motion.div>
  );
}
