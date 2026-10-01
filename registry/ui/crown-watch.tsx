"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  project,
  rubberband,
  rubberClamp,
  useDrag,
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CrownWatchCase = "steel" | "gold" | "black";
export type CrownWatchBand = "sport" | "leather" | "mesh";

export type CrownWatchProps = {
  /** The screen: any content, scrolled by the crown. Real px, so text stays text-sized. */
  children?: React.ReactNode;
  /** The watch's accessible name. @default "Watch" */
  label?: string;
  /** The app's name, shown in the screen's header. */
  title?: string;
  /** The clock in the screen's header. @default "10:09" */
  time?: string;
  /** Controlled scroll offset, in px from the top of the content. */
  value?: number;
  /** Initial offset when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the turn, the swipe, the wheel or the key that scrolled it, with the new offset. */
  onValueChange?: (value: number) => void;
  /** Content per notch of the crown, in px: make it your row height. @default 32 */
  step?: number;
  /** The crown ratchets, a notch and a tick at a time. Off: it turns smoothly and coasts. @default true */
  detents?: boolean;
  /** The case and crown metal. @default "steel" */
  case?: CrownWatchCase;
  /** The strap. @default "sport" */
  band?: CrownWatchBand;
  /** The crown was pressed (it also takes the screen back to the top). */
  onCrownPress?: () => void;
  /** Play the crown's detents. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Notches in one revolution of the crown. */
const NOTCHES = 12;
/** Ridges of knurl around the crown. */
const RIDGES = 30;
/** The screen's header band, px: content starts under it. */
const HEADER = 22;
/** Where the content's clip begins, px: under the header, clear of the edge. */
const CLIP_TOP = 4;
/** Wheel travel per notch when the crown ratchets, px. */
const WHEEL_NOTCH = 36;
const MAX_LEAN = 5;
const GLOW_MS = 700;
const PRESS_MS = 110;

/* The crown, drawn in its own units (a tenth of a cqw): a collar into the
   case, then the knurled cylinder seen edge-on. */
const CW = 75;
const CH = 160;
const CY = 80;
const KNURL_R = 72;
const KNURL_X0 = 20;
const KNURL_X1 = 69;

type Metal = { base: string; light: string; dark: string };

/** Fixed pigments: a case is a material, the same in either theme. */
const CASES: Record<CrownWatchCase, Metal> = {
  steel: {
    base: "oklch(0.8 0.006 250)",
    light: "oklch(0.95 0.003 250)",
    dark: "oklch(0.56 0.008 250)",
  },
  gold: {
    base: "oklch(0.8 0.075 82)",
    light: "oklch(0.93 0.05 88)",
    dark: "oklch(0.58 0.08 70)",
  },
  black: {
    base: "oklch(0.33 0.006 260)",
    light: "oklch(0.52 0.006 260)",
    dark: "oklch(0.2 0.005 260)",
  },
};

const GLASS = "oklch(0.13 0.004 260)";
const SPORT = {
  base: "oklch(0.36 0.026 255)",
  edge: "oklch(0.26 0.02 255)",
  hole: "oklch(0.17 0.012 255)",
};
const LEATHER = {
  base: "oklch(0.52 0.085 52)",
  edge: "oklch(0.4 0.075 48)",
  thread: "oklch(0.84 0.035 80)",
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * The crown between notches: it sticks at each one and jumps through the
 * middle, so a slow turn reads as a ratchet. Continuous at every notch and at
 * every half, where the content steps.
 */
const warp = (raw: number) => {
  const n = Math.floor(raw);
  const f = raw - n;
  return n + f - (0.85 * Math.sin(2 * Math.PI * f)) / (2 * Math.PI);
};

/**
 * The knurl, one horizontal line per ridge that faces the viewer: a ridge at
 * angle φ sits at R·sin φ from the axis, so the lines crowd toward the top and
 * bottom as the cylinder turns away. Rebuilt from the turn, every number
 * rounded so the server and the browser agree.
 */
function knurl(turn: number, shift: number): string {
  const theta = (turn * 2 * Math.PI) / NOTCHES;
  let d = "";
  for (let i = 0; i < RIDGES; i += 1) {
    const phi = (i * 2 * Math.PI) / RIDGES + theta;
    if (Math.cos(phi) < 0.08) continue;
    const y = Number((CY - KNURL_R * Math.sin(phi) + shift).toFixed(2));
    d += `M${KNURL_X0} ${y}H${KNURL_X1}`;
  }
  return d;
}

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

type Held = "crown" | "glass" | null;
type How = "snap" | "glide" | "set";

type Api = {
  follow: (c: number, first: boolean) => void;
  onTurn: (t: number) => void;
  onScroll: () => void;
  wheel: (event: WheelEvent, where: "crown" | "glass") => void;
};

function Strap({
  edge,
  band,
  metal,
}: {
  edge: "top" | "bottom";
  band: CrownWatchBand;
  metal: Metal;
}) {
  const top = edge === "top";
  const base =
    band === "sport"
      ? `linear-gradient(90deg, ${SPORT.edge}, ${SPORT.base} 26%, ${SPORT.base} 74%, ${SPORT.edge})`
      : band === "leather"
        ? `linear-gradient(90deg, ${LEATHER.edge}, ${LEATHER.base} 18%, ${LEATHER.base} 82%, ${LEATHER.edge})`
        : `repeating-linear-gradient(0deg, color-mix(in oklab, ${metal.light} 55%, transparent) 0 0.45cqw, color-mix(in oklab, ${metal.dark} 45%, transparent) 0.45cqw 0.9cqw), linear-gradient(90deg, ${metal.dark}, ${metal.base} 22%, ${metal.light} 50%, ${metal.base} 78%, ${metal.dark})`;
  const holes =
    band === "sport" && !top
      ? `radial-gradient(circle, ${SPORT.hole} 0 0.85cqw, transparent 1.05cqw) center 9cqw / 100% 4.4cqw repeat-y, `
      : "";
  return (
    <div
      aria-hidden
      className="absolute"
      style={{
        left: "24cqw",
        width: "44cqw",
        top: top ? 0 : "86cqw",
        height: "22cqw",
        background: `${holes}${base}`,
        clipPath: top
          ? "polygon(3% 0, 97% 0, 100% 100%, 0 100%)"
          : "polygon(0 0, 100% 0, 97% 100%, 3% 100%)",
        maskImage: `linear-gradient(${top ? "to top" : "to bottom"}, black 45%, transparent)`,
        WebkitMaskImage: `linear-gradient(${top ? "to top" : "to bottom"}, black 45%, transparent)`,
      }}
    >
      {band === "leather" ? (
        <div
          className="absolute inset-y-0"
          style={{
            left: "2.4cqw",
            right: "2.4cqw",
            borderLeft: `0.35cqw dashed ${LEATHER.thread}`,
            borderRight: `0.35cqw dashed ${LEATHER.thread}`,
            opacity: 0.8,
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * A watch frame whose crown scrolls its screen. Drag the crown (or wheel
 * over it) and it turns 1:1 under the finger: its knurl is a real cylinder
 * seen edge-on, the ridges crowding toward its top and bottom. The screen and
 * the crown are geared — one notch is one `step` of content — so a swipe on
 * the glass turns the crown too.
 *
 * With detents the crown ratchets: it sticks at each notch and jumps through
 * the middle, and every notch moves the content one step on the snap spring,
 * with a tick. Without them it turns smoothly, the content follows it 1:1, and
 * a flick coasts to its projected landing on the glide spring. The ends
 * rubber-band. Pressing the crown sends the screen home, the crown unwinding
 * as it goes. The watch leans toward the pointer under a glare on its crystal.
 *
 * The crown is a real `role="slider"`: arrow keys turn it a notch, Page keys a
 * screen, Home and End jump, Enter and Space press it. Under reduced motion
 * nothing leans, springs or coasts: content and crown go straight to each
 * step, and the scroll indicator still shows where you are.
 */
export function CrownWatch({
  children,
  label = "Watch",
  title,
  time = "10:09",
  value,
  defaultValue = 0,
  onValueChange,
  step = 32,
  detents = true,
  case: caseFinish = "steel",
  band = "sport",
  onCrownPress,
  sound = false,
  disabled = false,
  className,
}: CrownWatchProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const svgId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const screenId = `${uid}-screen`;
  const hintId = `${uid}-hint`;
  const unit = Math.max(8, step);
  const metal = CASES[caseFinish] ?? CASES.steel;
  const lean = disabled || !motionSafe ? 0 : MAX_LEAN;

  const [own, setOwn] = React.useState(() => Math.max(0, defaultValue));
  const [size, setSize] = React.useState({ view: 0, content: 0 });
  const [check, setCheck] = React.useState(0);
  const controlled = value !== undefined;
  const current = Math.max(0, Math.round(value ?? own));
  const max = Math.max(0, size.content - size.view);
  const shownValue = Math.min(current, max);

  const scroll = useMotionValue(current);
  const turn = useMotionValue(current / unit);
  const press = useMotionValue(0);
  const hot = useMotionValue(0);
  const glow = useMotionValue(0);
  const aimX = useMotionValue(0);
  const aimY = useMotionValue(0);
  const leanSpring = {
    stiffness: springs.glide.stiffness,
    damping: springs.glide.damping,
    mass: springs.glide.mass,
  };
  const sx = useSpring(aimX, leanSpring);
  const sy = useSpring(aimY, leanSpring);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<HTMLDivElement | null>(null);
  const crownRef = React.useRef<SVGSVGElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const held = React.useRef<Held>(null);
  const voice = React.useRef(false);
  const edgeHit = React.useRef(false);
  const quiet = React.useRef(false);
  const target = React.useRef(current);
  const reported = React.useRef(current);
  const lastNotch = React.useRef(Math.round(current / unit));
  const startTurn = React.useRef(0);
  const startScroll = React.useRef(0);
  const notchPx = React.useRef(9);
  const wheelAcc = React.useRef(0);
  const glowing = React.useRef(false);
  const glowTimer = React.useRef(0);
  const pressTimer = React.useRef(0);
  const letGo = React.useRef<(() => void) | null>(null);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const clampPx = (v: number) => Math.min(max, Math.max(0, v));
  /** The nearest place the content may rest: a step with detents, anywhere without. */
  const restOf = (v: number) =>
    detents ? clampPx(Math.round(v / unit) * unit) : clampPx(v);

  const crownPan = () => {
    const rect = crownRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** One low knock per gesture against an end stop. */
  const bump = () => {
    if (edgeHit.current) return;
    edgeHit.current = true;
    if (voice.current) {
      audio.play("detent", { pitch: 0.55, gain: 0.6, pan: crownPan() });
    }
  };

  /** Content and crown move together, geared: one notch is one step. */
  const moveTo = (to: number, how: How, velocity = 0) => {
    if (!motionSafe || how === "set") {
      halt("scroll");
      halt("turn");
      scroll.set(r2(to));
      turn.set(r4(to / unit));
      return;
    }
    const spring = how === "snap" ? springs.snap : springs.glide;
    run("scroll", animate(scroll, to, { ...spring, velocity }));
    run(
      "turn",
      animate(turn, to / unit, { ...spring, velocity: velocity / unit }),
    );
  };

  const commit = (to: number) => {
    const v = Math.round(to);
    target.current = v;
    if (v === reported.current) return;
    reported.current = v;
    if (!controlled) setOwn(v);
    onValueChange?.(v);
  };

  /** A controlled host answers on its own schedule; then it gets its say. */
  const recheck = () => {
    if (controlled) React.startTransition(() => setCheck((c) => c + 1));
  };

  const goTo = (to: number, how: How) => {
    const next = clampPx(to);
    if (Math.round(next) === target.current) {
      bump();
      return;
    }
    moveTo(next, how);
    commit(next);
    recheck();
  };

  const stepBy = (n: number) => {
    voice.current = true;
    edgeHit.current = false;
    const base = target.current;
    let next: number;
    if (detents) {
      // From a resting place that is not a step (the last one usually is
      // not), the first notch goes to the step beside it.
      const k =
        n > 0
          ? Math.floor(base / unit + 1e-6) + n
          : Math.ceil(base / unit - 1e-6) + n;
      next = clampPx(k * unit);
    } else {
      next = clampPx(base + n * unit);
    }
    goTo(next, Math.abs(n) > 1 ? "glide" : detents ? "snap" : "glide");
  };

  const pressIn = () => {
    window.clearTimeout(pressTimer.current);
    if (!motionSafe) {
      halt("press");
      press.set(1);
      return;
    }
    run("press", animate(press, 1, springs.flick));
  };
  const pressOut = () => {
    window.clearTimeout(pressTimer.current);
    if (!motionSafe) {
      halt("press");
      press.set(0);
      return;
    }
    run("press", animate(press, 0, springs.snap));
  };

  /**
   * A pointer press holds the crown in until that pointer lifts, wherever it
   * lifts: a press that wanders off the crown sideways never starts a turn,
   * and must still let the crown back out.
   */
  const pressBy = (pointerId: number) => {
    letGo.current?.();
    pressIn();
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      letGo.current?.();
      letGo.current = null;
      pressOut();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    letGo.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  };

  /** Pressing the crown: the screen goes home, the crown unwinding to match. */
  const home = () => {
    voice.current = true;
    edgeHit.current = true;
    if (target.current !== 0 || Math.abs(scroll.get()) > 0.5) {
      moveTo(0, "glide");
      commit(0);
      recheck();
    }
    onCrownPress?.();
  };

  const crownDrag = useDrag({
    axis: "y",
    threshold: 2,
    disabled,
    onStart: () => {
      held.current = "crown";
      voice.current = true;
      edgeHit.current = false;
      halt("scroll");
      halt("turn");
      pressOut();
      // The notch is a twelfth of the crown's circumference as drawn now,
      // so the knurl stays under the finger at any size.
      const h = crownRef.current?.getBoundingClientRect().height ?? 32;
      notchPx.current = Math.max(3, (Math.PI * h) / NOTCHES);
      startTurn.current = turn.get();
    },
    onMove: ({ offset }) => {
      const raw = startTurn.current - offset.y / notchPx.current;
      const contentRaw = raw * unit;
      const room = Math.max(60, size.view);
      if (!detents) {
        turn.set(r4(raw));
        if (contentRaw < 0 || contentRaw > max) bump();
        scroll.set(
          r2(
            motionSafe
              ? rubberClamp(contentRaw, 0, max, room)
              : clampPx(contentRaw),
          ),
        );
        return;
      }
      turn.set(r4(warp(raw)));
      const lo = -unit / 2;
      const hi = max + unit / 2;
      if (contentRaw < lo || contentRaw > hi) {
        // Past the last notch the crown spins on and the content pulls
        // against the end; it is held there, not stepped.
        const edge = contentRaw < lo ? 0 : max;
        const over = contentRaw < lo ? contentRaw - lo : contentRaw - hi;
        halt("scroll");
        scroll.set(r2(motionSafe ? edge + rubberband(over, room) : edge));
        if (target.current !== Math.round(edge)) commit(edge);
        bump();
        return;
      }
      const stop = clampPx(Math.round(raw) * unit);
      if (Math.round(stop) !== target.current || !anims.current.has("scroll")) {
        if (Math.abs(scroll.get() - stop) > 0.5) {
          if (motionSafe) run("scroll", animate(scroll, stop, springs.snap));
          else scroll.set(stop);
        }
        commit(stop);
      }
    },
    onEnd: ({ velocity }) => {
      held.current = null;
      if (detents) {
        moveTo(target.current, "snap");
      } else {
        const now = scroll.get();
        const inside = now >= 0 && now <= max;
        const v = (-velocity.y / notchPx.current) * unit;
        const land =
          inside && motionSafe ? clampPx(project(now, v, 0.995)) : clampPx(now);
        moveTo(land, inside ? "glide" : "snap", inside ? v : 0);
        commit(land);
      }
      recheck();
    },
    onCancel: () => {
      held.current = null;
      pressOut();
      moveTo(restOf(target.current), "snap");
    },
    onTap: () => {
      pressOut();
      home();
    },
  });

  const glassDrag = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onStart: () => {
      held.current = "glass";
      voice.current = true;
      edgeHit.current = false;
      halt("scroll");
      halt("turn");
      startScroll.current = scroll.get();
    },
    onMove: ({ offset }) => {
      const raw = startScroll.current - offset.y;
      if (raw < 0 || raw > max) bump();
      const shown = motionSafe
        ? rubberClamp(raw, 0, max, Math.max(60, size.view))
        : clampPx(raw);
      scroll.set(r2(shown));
      turn.set(r4(shown / unit));
    },
    onEnd: ({ velocity }) => {
      held.current = null;
      const now = scroll.get();
      const inside = now >= 0 && now <= max;
      const v = -velocity.y;
      const land = restOf(inside && motionSafe ? project(now, v, 0.995) : now);
      moveTo(land, inside ? "glide" : "snap", inside ? v : 0);
      commit(land);
      recheck();
    },
    onCancel: () => {
      held.current = null;
      moveTo(restOf(scroll.get()), "snap");
    },
  });

  const wheel = (event: WheelEvent, where: "crown" | "glass") => {
    if (disabled || held.current) return;
    const dy = wheelPixels(event).y;
    if (dy === 0) return;
    const t = target.current;
    // Over the glass the wheel is only kept while there is somewhere to go,
    // so the page scrolls on past either end.
    if (where === "glass" && !(dy > 0 ? t < max - 0.5 : t > 0.5)) return;
    event.preventDefault();
    voice.current = true;
    if (detents) {
      if (Math.sign(dy) !== Math.sign(wheelAcc.current)) wheelAcc.current = 0;
      wheelAcc.current += dy;
      let n = 0;
      while (Math.abs(wheelAcc.current) >= WHEEL_NOTCH) {
        const s = Math.sign(wheelAcc.current);
        n += s;
        wheelAcc.current -= s * WHEEL_NOTCH;
      }
      if (n !== 0) stepBy(n);
      return;
    }
    const next = clampPx(t + dy);
    if (Math.round(next) === t) {
      bump();
      return;
    }
    edgeHit.current = false;
    moveTo(next, "set");
    commit(next);
    recheck();
  };

  /** The host's value: our own echo is not news; anything else is followed. */
  const follow = (c: number, first: boolean) => {
    if (held.current) return;
    const want = Math.round(clampPx(c));
    if (c === reported.current && want === target.current) return;
    reported.current = c;
    if (want === target.current) return;
    voice.current = false;
    target.current = want;
    if (first) quiet.current = true;
    moveTo(want, first ? "set" : "glide");
    quiet.current = false;
  };

  const onTurn = (t: number) => {
    const n = Math.round(t);
    const prev = lastNotch.current;
    if (n === prev) return;
    lastNotch.current = n;
    if (!voice.current || !detents) return;
    const px = n * unit;
    if (px < -unit / 2 || px > max + unit / 2) return;
    audio.play("detent", {
      pitch: n > prev ? 1.06 : 0.94,
      gain: 0.5,
      pan: crownPan(),
    });
  };

  const onScroll = () => {
    if (quiet.current) return;
    if (!glowing.current) {
      glowing.current = true;
      run(
        "glow",
        animate(glow, 1, { duration: durations.fast, ease: easings.enter }),
      );
    }
    window.clearTimeout(glowTimer.current);
    glowTimer.current = window.setTimeout(() => {
      glowing.current = false;
      run(
        "glow",
        animate(glow, 0, { duration: durations.base, ease: easings.exit }),
      );
    }, GLOW_MS);
  };

  React.useEffect(() => {
    api.current = { follow, onTurn, onScroll, wheel };
  });

  // What the host says the offset is, against the content's real height.
  // Equal on mount, so StrictMode's second run does nothing.
  const measured = React.useRef(false);
  React.useEffect(() => {
    const first = !measured.current && max > 0;
    if (max > 0) measured.current = true;
    api.current?.follow(current, first);
  }, [current, check, max]);

  React.useEffect(() => {
    const offTurn = turn.on("change", (t) => api.current?.onTurn(t));
    const offScroll = scroll.on("change", () => api.current?.onScroll());
    return () => {
      offTurn();
      offScroll();
    };
  }, [turn, scroll]);

  React.useEffect(() => {
    if (lean === 0) {
      aimX.set(0);
      aimY.set(0);
    }
  }, [lean, aimX, aimY]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      window.clearTimeout(glowTimer.current);
      window.clearTimeout(pressTimer.current);
      letGo.current?.();
      letGo.current = null;
      glowing.current = false;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // The content's height and the screen's, bound to the content when it
  // arrives; the wheel listeners need `passive: false` to keep the page still.
  const bindContent = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const view = node.parentElement?.parentElement;
    const measure = () => {
      const next = {
        view: Math.round(view?.clientHeight ?? 0),
        content: Math.round(node.offsetHeight),
      };
      setSize((s) =>
        s.view === next.view && s.content === next.content ? s : next,
      );
    };
    const sizer = new ResizeObserver(measure);
    sizer.observe(node);
    if (view) sizer.observe(view);
    return () => sizer.disconnect();
  }, []);

  const bindView = React.useCallback((node: HTMLDivElement | null) => {
    viewRef.current = node;
    if (!node) return;
    const onWheel = (event: WheelEvent) => api.current?.wheel(event, "glass");
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const bindCrown = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const onWheel = (event: WheelEvent) => api.current?.wheel(event, "crown");
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const aimAt = (x: number, y: number) => {
    if (lean === 0) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return;
    let nx = ((x - rect.left) / rect.width) * 2 - 1;
    let ny = ((y - rect.top) / rect.height) * 2 - 1;
    const m = Math.hypot(nx, ny);
    if (m > 1) {
      nx /= m;
      ny /= m;
    }
    aimX.set(Number(nx.toFixed(3)));
    aimY.set(Number(ny.toFixed(3)));
  };
  const rest = () => {
    aimX.set(0);
    aimY.set(0);
  };

  /** Focus that lands on content out of view brings it into view. */
  const onScreenFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const view = viewRef.current;
    const el: EventTarget = event.target;
    if (!view || !(el instanceof Element) || el === view || held.current) {
      return;
    }
    const a = view.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const top = b.top - a.top + scroll.get();
    const bottom = b.bottom - a.top + scroll.get();
    const t = target.current;
    let need: number | null = null;
    if (top < t + HEADER) need = top - HEADER - 2;
    else if (bottom > t + a.height) need = bottom - a.height + 4;
    if (need === null) return;
    const next = detents
      ? clampPx(
          (need > t ? Math.ceil(need / unit) : Math.floor(need / unit)) * unit,
        )
      : clampPx(need);
    voice.current = false;
    if (Math.round(next) === t) return;
    moveTo(next, "glide");
    commit(next);
    recheck();
  };

  const onCrownKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const page = Math.max(1, Math.floor((size.view - HEADER) / unit));
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        stepBy(1);
        return;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        stepBy(-1);
        return;
      case "PageDown":
        event.preventDefault();
        stepBy(page);
        return;
      case "PageUp":
        event.preventDefault();
        stepBy(-page);
        return;
      case "Home":
        event.preventDefault();
        voice.current = true;
        edgeHit.current = false;
        goTo(0, "glide");
        return;
      case "End":
        event.preventDefault();
        voice.current = true;
        edgeHit.current = false;
        goTo(max, "glide");
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (event.repeat) return;
        pressIn();
        pressTimer.current = window.setTimeout(pressOut, PRESS_MS);
        home();
        return;
    }
  };

  /* ---------------------------- derived values --------------------------- */

  const contentY = useTransform(scroll, (s) => r2(-s - CLIP_TOP));
  const ridgesDark = useTransform(turn, (t) => knurl(t, 0));
  const ridgesLight = useTransform(turn, (t) => knurl(t, 2.4));
  const crownX = useTransform(press, (p) =>
    motionSafe ? `${r2(-1.1 * p)}cqw` : "0cqw",
  );
  const crownShade = useTransform(
    [press, hot] as MotionValue<number>[],
    ([p = 0, h = 0]: number[]) => `brightness(${r2(1 - 0.22 * p + 0.1 * h)})`,
  );
  const rotX = useTransform(sy, (v) => r2(-v * lean));
  const rotY = useTransform(sx, (v) => r2(v * lean));
  const glareX = useTransform(sx, (v) => `${r2(-50 - v * 14)}%`);
  const glareY = useTransform(sy, (v) => `${r2(-50 - v * 14)}%`);
  const glareOpacity = useTransform(
    [sx, sy] as MotionValue<number>[],
    ([x = 0, y = 0]: number[]) =>
      r2(0.45 + 0.5 * Math.min(1, Math.hypot(x, y))),
  );
  const track = Math.max(0, size.view - HEADER - 10);
  const thumb =
    size.content > 0 && max > 0
      ? Math.max(12, Math.round((track * size.view) / size.content))
      : track;
  const thumbY = useTransform(scroll, (s) =>
    max > 0
      ? r2(Math.max(0, track - thumb) * Math.min(1, Math.max(0, s / max)))
      : 0,
  );

  const reading =
    shownValue <= 0
      ? "Top"
      : shownValue >= max
        ? "End"
        : `${Math.round((shownValue / max) * 100)}% down`;

  const metalFill = `linear-gradient(150deg, ${metal.light}, ${metal.base} 22%, ${metal.dark} 56%, ${metal.base} 80%, ${metal.light})`;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") aimAt(event.clientX, event.clientY);
      }}
      onPointerLeave={rest}
      className={cn(
        "[container-type:inline-size] relative aspect-[25/27] w-full overflow-clip select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="absolute inset-0 [perspective:300cqw]">
        <motion.div
          className="absolute inset-0"
          style={{ rotateX: rotX, rotateY: rotY }}
        >
          <Strap edge="top" band={band} metal={metal} />
          <Strap edge="bottom" band={band} metal={metal} />

          {/* The crown, under the case so a press sinks it into the side. */}
          <motion.svg
            ref={crownRef}
            aria-hidden
            viewBox={`0 0 ${CW} ${CH}`}
            className="absolute block"
            style={{
              left: "78.6cqw",
              top: "30cqw",
              width: "7.5cqw",
              height: "16cqw",
              x: crownX,
              filter: crownShade,
            }}
          >
            <defs>
              <linearGradient id={`${svgId}-roll`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="black" stopOpacity="0.55" />
                <stop offset="0.24" stopColor="black" stopOpacity="0" />
                <stop offset="0.4" stopColor="white" stopOpacity="0.3" />
                <stop offset="0.56" stopColor="white" stopOpacity="0" />
                <stop offset="1" stopColor="black" stopOpacity="0.6" />
              </linearGradient>
            </defs>
            <rect x={0} y={24} width={16} height={112} fill={metal.dark} />
            <rect
              x={10}
              y={2}
              width={63}
              height={156}
              rx={12}
              fill={metal.base}
            />
            <motion.path
              d={ridgesLight}
              stroke={metal.light}
              strokeWidth={2.2}
              strokeOpacity={0.8}
              fill="none"
            />
            <motion.path
              d={ridgesDark}
              stroke={metal.dark}
              strokeWidth={3.4}
              fill="none"
            />
            <rect
              x={10}
              y={2}
              width={63}
              height={156}
              rx={12}
              fill={`url(#${svgId}-roll)`}
            />
          </motion.svg>

          {/* The case: metal, then the black crystal edge to edge. */}
          <div
            aria-hidden
            className="absolute"
            style={{
              left: "13cqw",
              top: "15cqw",
              width: "66cqw",
              height: "78cqw",
              borderRadius: "16cqw",
              background: metalFill,
              boxShadow: `0 1.6cqw 4cqw color-mix(in oklab, black 30%, transparent), inset 0 0 0 0.35cqw color-mix(in oklab, white 34%, transparent)`,
            }}
          />
          <div
            className="absolute overflow-clip"
            style={{
              left: "14.7cqw",
              top: "16.7cqw",
              width: "62.6cqw",
              height: "74.6cqw",
              borderRadius: "14.4cqw",
              background: GLASS,
            }}
          >
            {/* A watch screen is black glass: its content wears the dark
                theme whatever the page does. */}
            <div
              ref={bindView}
              id={screenId}
              role="region"
              aria-label={`${label} screen`}
              inert={disabled}
              onFocus={onScreenFocus}
              {...glassDrag}
              className={cn(
                "dark absolute overflow-clip text-foreground",
                disabled ? "cursor-not-allowed" : "touch-pan-x",
              )}
              style={{
                left: "2.8cqw",
                top: "2.8cqw",
                right: "2.8cqw",
                bottom: "2.8cqw",
                borderRadius: "11cqw",
              }}
            >
              {/* The content's own clip starts under the header: where it
                  met the screen's rounded edge, the top row of a line
                  scrolled under the header could antialias through. */}
              <div
                className="absolute inset-x-0 bottom-0 overflow-clip"
                style={{ top: CLIP_TOP }}
              >
                <motion.div
                  ref={bindContent}
                  className="pb-2"
                  style={{ y: contentY, paddingTop: HEADER }}
                >
                  {children}
                </motion.div>
              </div>
              {/* Opaque behind the header (from just above the screen's edge,
                  where the clip antialiases), then a short fade, so a row
                  scrolling under it never shows through. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-0.5 pt-0.5"
                style={{
                  height: HEADER + 10,
                  background: `linear-gradient(${GLASS} ${HEADER + 2}px, transparent)`,
                }}
              >
                <div
                  className="flex items-center justify-between gap-2 px-3 text-[10px] leading-none"
                  style={{ height: HEADER }}
                >
                  <span className="min-w-0 truncate font-semibold text-cobalt-bright">
                    {title}
                  </span>
                  <span className="shrink-0 font-medium text-foreground tabular-nums">
                    {time}
                  </span>
                </div>
              </div>
              <motion.div
                aria-hidden
                className="pointer-events-none absolute right-[3px] w-[3px]"
                style={{ top: HEADER + 4, height: track, opacity: glow }}
              >
                <motion.div
                  className="w-full rounded-full bg-foreground/60"
                  style={{ height: thumb, y: thumbY }}
                />
              </motion.div>
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ borderRadius: "inherit" }}
            >
              <motion.div
                className="absolute top-1/2 left-1/2 h-[220%] w-[220%]"
                style={{
                  x: glareX,
                  y: glareY,
                  opacity: glareOpacity,
                  background:
                    "linear-gradient(118deg, transparent 38%, color-mix(in oklab, white 14%, transparent) 46%, color-mix(in oklab, white 5%, transparent) 51%, transparent 58%)",
                }}
              />
            </div>
          </div>

          <div
            ref={bindCrown}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="Crown"
            aria-orientation="vertical"
            aria-controls={screenId}
            aria-describedby={hintId}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={shownValue}
            aria-valuetext={reading}
            aria-disabled={disabled || undefined}
            {...crownDrag}
            onPointerDown={(event) => {
              crownDrag.onPointerDown(event);
              if (disabled) return;
              if (event.pointerType === "mouse" && event.button !== 0) return;
              pressBy(event.pointerId);
            }}
            onPointerEnter={() => {
              if (!disabled) hot.set(1);
            }}
            onPointerLeave={() => hot.set(0)}
            onKeyDown={onCrownKeyDown}
            className={cn(
              "absolute touch-pan-x rounded-3",
              FOCUS_RING,
              disabled ? "cursor-not-allowed" : "cursor-ns-resize",
            )}
            style={{
              left: "76cqw",
              top: "26cqw",
              width: "21cqw",
              height: "24cqw",
            }}
          />
        </motion.div>
      </div>
      <p id={hintId} className="sr-only">
        Drag or scroll over the crown to turn it. Arrow keys turn it a notch,
        Page keys a screen, Home and End go to the top and the end, and Enter
        presses it to go back to the top.
      </p>
    </div>
  );
}
