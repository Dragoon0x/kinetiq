"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CorkNotesTone = "info" | "success" | "warn" | "danger";

export type CorkNotesNotice = {
  id: string;
  title: string;
  body?: string;
  /** @default "info" */
  tone?: CorkNotesTone;
};

export type CorkNotesPin = "round" | "flat" | "tack";
export type CorkNotesCork = "light" | "dark";

export type CorkNotesProps = {
  /** Every notice, oldest first. Only the newest `max` are pinned. */
  notices: CorkNotesNotice[];
  /** Fires the moment a pin comes out, from the pull or the key that pulled it. */
  onDismiss?: (id: string) => void;
  /** The board's name. @default "Board" */
  label?: string;
  /** How crooked the cards hang, in degrees, 0 to 12. @default 5 */
  tilt?: number;
  /** The pin each card hangs from. @default "round" */
  pins?: CorkNotesPin;
  /** The board's cork and frame. @default "light" */
  cork?: CorkNotesCork;
  /** How many cards are pinned at once, 2 to 6. @default 4 */
  max?: number;
  /** The pins and the paper. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Entry = "still" | "land" | "reveal";

type Corkwork = {
  frame: string;
  cork: string;
  grain: string;
  fleck: string;
  hole: string;
  empty: string;
};

// Cork, wood and paper are pigments: the board is the same board on a light
// page and a dark one.
const CORKS: Record<CorkNotesCork, Corkwork> = {
  light: {
    frame: "oklch(0.64 0.07 64)",
    cork: "oklch(0.77 0.072 72)",
    grain: "oklch(0.63 0.085 60)",
    fleck: "oklch(0.86 0.05 82)",
    hole: "oklch(0.32 0.05 55)",
    empty: "oklch(0.4 0.05 58)",
  },
  dark: {
    frame: "oklch(0.36 0.04 50)",
    cork: "oklch(0.52 0.07 56)",
    grain: "oklch(0.41 0.07 50)",
    fleck: "oklch(0.63 0.06 64)",
    hole: "oklch(0.2 0.03 50)",
    empty: "oklch(0.8 0.04 70)",
  },
};

const PAPERS: Record<CorkNotesTone, string> = {
  info: "oklch(0.965 0.022 95)",
  success: "oklch(0.93 0.065 150)",
  warn: "oklch(0.945 0.095 100)",
  danger: "oklch(0.915 0.055 20)",
};
const INK = "oklch(0.3 0.025 60)";
const INK_SOFT = "oklch(0.44 0.03 60)";

const TONES: Record<CorkNotesTone, string> = {
  info: "Notice",
  success: "Done",
  warn: "Warning",
  danger: "Alert",
};

/** Plastic pin heads, and the brass of a flat tack. */
const PIN_COLOURS = [
  "oklch(0.6 0.19 25)",
  "oklch(0.57 0.15 255)",
  "oklch(0.63 0.15 150)",
  "oklch(0.8 0.15 88)",
];
const BRASS = "oklch(0.78 0.1 85)";

/**
 * Where cards hang (left and top of the card, as % of the cork), filled in
 * this order so the board is balanced at any count: the corners first, then
 * the middle over them.
 */
const PLACES: readonly (readonly [number, number])[] = [
  [5, 8],
  [57, 44],
  [56, 5],
  [6, 47],
  [31, 25],
  [32, 54],
];

/** Pull, in px, that brings a pin out of the cork, and how much it gives first. */
const PULL = 30;
const HOLD = 9;
/** The pin's point, down from the card's top edge. */
const PIN_AT = 7;
const HEARD_WITHIN = 2500;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const stop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A circle as path data, so a thousand specks are two paths, not a thousand nodes. */
const dot = (x: number, y: number, r: number) =>
  `M${r2(x - r)} ${r2(y)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0`;

/** The cork's grain: seeded once, the same on the server and in every browser. */
const GRAIN = (() => {
  const rand = lcg(0x5eed_c0c5);
  let dark = "";
  let light = "";
  for (let i = 0; i < 220; i += 1) {
    const x = rand() * 320;
    const y = rand() * 200;
    const r = 0.45 + rand() * 1.15;
    if (i % 3 === 0) light += dot(x, y, r * 0.8);
    else dark += dot(x, y, r);
  }
  let holes = "";
  for (let i = 0; i < 9; i += 1) {
    holes += dot(10 + rand() * 300, 8 + rand() * 184, 0.8);
  }
  return { dark, light, holes };
})();

/**
 * When the visitor last pressed something on the page. An arrival is the
 * host's doing; it is only heard when a press of the visitor's came just
 * before it — a Pin button, a key — never when a timer pushes it alone.
 */
function useVisitorPress() {
  const last = React.useRef(-Infinity);
  React.useEffect(() => {
    const mark = () => {
      last.current = performance.now();
    };
    const onKey = (event: KeyboardEvent) => {
      if (["Enter", " ", "Delete", "Backspace"].includes(event.key)) mark();
    };
    document.addEventListener("pointerdown", mark, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", mark, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return React.useCallback(
    (within: number) => performance.now() - last.current < within,
    [],
  );
}

function Glyph({ tone }: { tone: CorkNotesTone }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="size-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {tone === "success" ? (
        <path d="M2.5 6.3 5 8.6 9.6 3.6" />
      ) : tone === "warn" ? (
        <>
          <path d="M6 1.6 10.8 10H1.2Z" />
          <path d="M6 4.8v2.4M6 8.6v.1" />
        </>
      ) : tone === "danger" ? (
        <>
          <circle cx={6} cy={6} r={4.6} />
          <path d="m4.2 4.2 3.6 3.6m0-3.6L4.2 7.8" />
        </>
      ) : (
        <>
          <circle cx={6} cy={6} r={4.6} />
          <path d="M6 5.4v3M6 3.6v.1" />
        </>
      )}
    </svg>
  );
}

/** A pin head seen from above, its point at (14, 14). */
function PinHead({
  kind,
  colour,
  gid,
}: {
  kind: CorkNotesPin;
  colour: string;
  gid: string;
}) {
  if (kind === "flat") {
    return (
      <svg aria-hidden viewBox="0 0 28 28" className="size-7 overflow-visible">
        <defs>
          <radialGradient id={gid} cx="38%" cy="34%" r="70%">
            <stop offset="0%" stopColor="oklch(0.95 0.05 90)" />
            <stop offset="45%" stopColor={BRASS} />
            <stop offset="100%" stopColor="oklch(0.55 0.09 75)" />
          </radialGradient>
        </defs>
        <circle cx={14} cy={14} r={7} fill={`url(#${gid})`} />
        <circle
          cx={14}
          cy={14}
          r={5}
          fill="none"
          stroke="oklch(0.55 0.09 75 / 0.6)"
          strokeWidth={0.8}
        />
        <circle cx={14} cy={14} r={1.1} fill="oklch(0.5 0.08 75)" />
      </svg>
    );
  }
  if (kind === "tack") {
    return (
      <svg aria-hidden viewBox="0 0 28 28" className="size-7 overflow-visible">
        <defs>
          <linearGradient id={gid} x1="0" x2="1" y1="0" y2="0">
            <stop
              offset="0%"
              stopColor={`color-mix(in oklab, ${colour} 70%, black)`}
            />
            <stop
              offset="35%"
              stopColor={`color-mix(in oklab, ${colour} 70%, white)`}
            />
            <stop
              offset="100%"
              stopColor={`color-mix(in oklab, ${colour} 75%, black)`}
            />
          </linearGradient>
        </defs>
        <ellipse cx={14} cy={14} rx={6.4} ry={3.2} fill={`url(#${gid})`} />
        <path d="M10.6 7.2h6.8v6.4h-6.8Z" fill={`url(#${gid})`} />
        <ellipse cx={14} cy={7.2} rx={4.6} ry={2.3} fill={`url(#${gid})`} />
        <ellipse
          cx={13.2}
          cy={6.8}
          rx={2}
          ry={0.9}
          fill="oklch(1 0 0 / 0.55)"
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 28 28" className="size-7 overflow-visible">
      <defs>
        <radialGradient id={gid} cx="36%" cy="32%" r="72%">
          <stop
            offset="0%"
            stopColor={`color-mix(in oklab, ${colour} 45%, white)`}
          />
          <stop offset="50%" stopColor={colour} />
          <stop
            offset="100%"
            stopColor={`color-mix(in oklab, ${colour} 60%, black)`}
          />
        </radialGradient>
      </defs>
      <circle cx={14} cy={13} r={5.6} fill={`url(#${gid})`} />
      <circle cx={12.2} cy={11} r={1.3} fill="oklch(1 0 0 / 0.7)" />
    </svg>
  );
}

type NoteProps = {
  notice: CorkNotesNotice;
  entry: Entry;
  place: readonly [number, number];
  order: number;
  tilt: number;
  pins: CorkNotesPin;
  corkwork: Corkwork;
  focusable: boolean;
  motionSafe: boolean;
  disabled: boolean;
  audio: TactileSound;
  heard: (within: number) => boolean;
  hintId: string;
  isListed: (id: string) => boolean;
  boardRect: () => DOMRect | null;
  setNode: (id: string, node: HTMLElement | null) => void;
  onFocus: (id: string) => void;
  onKeyMove: (id: string, key: string) => void;
  /** A card is going: focus leaves it, and a pull is reported. */
  onLeave: (id: string, report: boolean) => void;
};

function Note(props: NoteProps) {
  const { notice, motionSafe, pins } = props;
  const tone = notice.tone ?? "info";
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const bodyId = `${uid}-body`;
  const gid = `cork-pin-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [isPresent, safeToRemove] = usePresence();
  const seed = hash(notice.id);
  const sway = ((seed >>> 3) % 1000) / 500 - 1;
  const nudgeX = (((seed >>> 13) % 100) / 100 - 0.5) * 4;
  const nudgeY = (((seed >>> 19) % 100) / 100 - 0.5) * 4;
  const colour = PIN_COLOURS[seed % PIN_COLOURS.length] ?? BRASS;
  const pinPitch = pins === "flat" ? 1.25 : pins === "tack" ? 0.82 : 1;
  const arriving = props.entry !== "still";

  const angle = useMotionValue(r2(sway * props.tilt));
  const noteX = useMotionValue(0);
  const noteY = useMotionValue(arriving && motionSafe ? -12 : 0);
  const noteTurn = useMotionValue(
    arriving && motionSafe ? r2(sway >= 0 ? 5 : -5) : 0,
  );
  const noteScale = useMotionValue(arriving && motionSafe ? 1.08 : 1);
  const noteTilt = useMotionValue(0);
  const noteOpacity = useMotionValue(arriving ? 0 : 1);
  const lifted = useMotionValue(0);
  const pinX = useMotionValue(0);
  const pinY = useMotionValue(0);
  const pinLift = useMotionValue(arriving && motionSafe ? 26 : 0);
  const pinScale = useMotionValue(1);
  const pinTurn = useMotionValue(0);
  const pinOpacity = useMotionValue(arriving ? 0 : 1);
  const holeOpacity = useMotionValue(1);

  const [raised, setRaised] = React.useState(false);
  const [held, setHeld] = React.useState(false);
  const articleRef = React.useRef<HTMLElement | null>(null);
  const pinRef = React.useRef<HTMLButtonElement | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const pull = React.useRef({
    out: false,
    fallen: false,
    quiet: false,
    base: { x: 0, y: 0 },
    at: { x: 0, y: 0 },
    last: { x: 0, y: 0 },
  });
  const onFallen = React.useRef<(() => void) | null>(null);
  const latest = React.useRef(props);
  React.useEffect(() => {
    latest.current = props;
  });

  const run = (...controls: AnimationPlaybackControls[]) => {
    runs.current = [...runs.current.slice(-16), ...controls];
  };
  const halt = React.useCallback(() => {
    for (const c of runs.current) c.stop();
    runs.current = [];
  }, []);

  const panOf = () => {
    const rect = pinRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** The card lets go of the board and flutters down off it. */
  const fall = (audible: boolean) => {
    const board = latest.current.boardRect();
    const rect = articleRef.current?.getBoundingClientRect();
    const drop =
      board && rect ? Math.max(40, board.bottom - rect.top + 12) : 260;
    const done = () => {
      pull.current.fallen = true;
      const next = onFallen.current;
      onFallen.current = null;
      if (next) next();
      else if (latest.current.isListed(notice.id)) repin();
    };
    if (audible) {
      props.audio.play("paper", { pitch: 0.95, gain: 0.5, pan: panOf() });
    }
    if (!latest.current.motionSafe) {
      run(
        animate(noteOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: done,
        }),
      );
      return;
    }
    const dir = sway >= 0 ? 1 : -1;
    const x0 = noteX.get();
    const t0 = noteTurn.get();
    const duration = r2(clamp(0.55 + drop / 900, 0.6, 1));
    run(
      animate(noteY, r2(noteY.get() + drop), {
        duration,
        ease: easings.exit,
        onComplete: done,
      }),
      animate(
        noteX,
        [x0, r2(x0 + dir * 16), r2(x0 - dir * 7), r2(x0 + dir * 24)],
        {
          duration,
          ease: easings.move,
        },
      ),
      animate(
        noteTurn,
        [t0, r2(t0 + dir * 14), r2(t0 - dir * 6), r2(t0 + dir * 28)],
        { duration, ease: easings.move },
      ),
      animate(noteTilt, [0, 28, -12, 46], { duration, ease: easings.move }),
      animate(noteOpacity, [1, 1, 0], { duration, times: [0, 0.7, 1] }),
    );
  };

  /** Out of the cork: the card is free, the pin is in the hand. */
  const popOut = (audible: boolean) => {
    const p = pull.current;
    if (p.out) return;
    p.out = true;
    p.base = { x: pinX.get(), y: pinY.get() };
    p.at = { ...p.last };
    if (audible) {
      props.audio.play("thock", {
        pitch: r2(1.7 * pinPitch),
        gain: 0.32,
        pan: panOf(),
      });
    }
    if (latest.current.motionSafe) {
      run(
        animate(pinLift, 14, springs.snap),
        animate(pinScale, 1.12, springs.snap),
      );
    }
    latest.current.onLeave(notice.id, !p.quiet);
    fall(audible);
  };

  /** The pin, let go: it carries on a little along its throw and is gone. */
  const dropPin = (vx: number, vy: number) => {
    const safe = latest.current.motionSafe;
    const fade = { duration: durations.base, ease: easings.exit };
    run(animate(pinOpacity, 0, fade));
    if (!safe) return;
    run(
      animate(pinX, r2(pinX.get() + clamp(vx * 0.08, -60, 60)), fade),
      animate(pinY, r2(pinY.get() + clamp(vy * 0.08, -60, 60)), fade),
      animate(pinScale, 0.7, fade),
    );
  };

  /** A pull, in px from the pin's hole, on the pin and the card it holds. */
  const pullTo = (ox: number, oy: number, audible: boolean) => {
    const p = pull.current;
    p.last = { x: ox, y: oy };
    if (p.out) {
      pinX.set(r2(p.base.x + ox - p.at.x));
      pinY.set(r2(p.base.y + oy - p.at.y));
      return;
    }
    const d = Math.hypot(ox, oy);
    const give = rubberband(d, HOLD);
    const k = d > 0 ? give / d : 0;
    pinX.set(r2(ox * k));
    pinY.set(r2(oy * k));
    pinLift.set(r2(give * 0.4));
    pinTurn.set(r2(clamp(ox * k * 1.6, -18, 18)));
    // The card's top goes with its pin, a little, and turns toward the pull.
    noteX.set(r2(ox * k * 0.3));
    noteY.set(r2(oy * k * 0.3));
    noteTurn.set(r2(ox * k * 0.35));
    if (d >= PULL) popOut(audible);
  };

  const settleBack = (moved: number) => {
    if (moved > 4) {
      props.audio.play("thock", {
        pitch: r2(1.3 * pinPitch),
        gain: 0.2,
        pan: panOf(),
      });
    }
    const safe = latest.current.motionSafe;
    const back = safe
      ? springs.snap
      : { duration: durations.fast, ease: easings.enter };
    run(
      ...[pinX, pinY, pinLift, pinTurn, noteX, noteY, noteTurn].map((mv) =>
        animate(mv, 0, back),
      ),
    );
    pull.current.last = { x: 0, y: 0 };
  };

  /** The keyboard's pull, and the host's: the same pull, driven upward. */
  const autoPull = (audible: boolean, quiet = false) => {
    const p = pull.current;
    if (p.out) return;
    p.quiet = quiet;
    halt();
    if (!latest.current.motionSafe) {
      pullTo(0, -PULL, audible);
      dropPin(0, 0);
      return;
    }
    run(
      animate(0, PULL + 2, {
        duration: 0.2,
        ease: [0.55, 0, 0.9, 0.55],
        onUpdate: (v) => pullTo(0, -v, audible),
        onComplete: () => {
          pullTo(0, -PULL - 2, audible);
          dropPin(0, -420);
        },
      }),
    );
  };

  /** Pinned again: the host kept the notice. */
  const repin = () => {
    halt();
    const p = pull.current;
    p.out = false;
    p.fallen = false;
    p.quiet = false;
    for (const mv of [noteX, noteY, noteTurn, noteTilt, pinX, pinY, pinTurn]) {
      mv.set(0);
    }
    pinScale.set(1);
    land(0, latest.current.heard(HEARD_WITHIN));
  };

  /** A card arrives: it lands, then its pin drops in and bites. */
  const land = (delay: number, audible: boolean) => {
    const safe = latest.current.motionSafe;
    const fade = { duration: durations.base, ease: easings.enter, delay };
    if (!safe) {
      noteY.set(0);
      noteTurn.set(0);
      noteScale.set(1);
      pinLift.set(0);
      run(animate(noteOpacity, 1, fade), animate(pinOpacity, 1, fade));
      return;
    }
    noteOpacity.set(0);
    pinOpacity.set(0);
    noteY.set(-12);
    noteScale.set(1.08);
    noteTurn.set(r2(sway >= 0 ? 5 : -5));
    pinLift.set(26);
    run(
      animate(noteOpacity, 1, fade),
      animate(noteY, 0, { ...springs.glide, delay }),
      animate(noteScale, 1, { ...springs.glide, delay }),
      animate(noteTurn, 0, { ...springs.glide, delay }),
      animate(pinOpacity, 1, { duration: durations.blink, delay: delay + 0.2 }),
      animate(pinLift, 0, {
        duration: 0.17,
        ease: easings.exit,
        delay: delay + 0.2,
        onComplete: () => {
          // The bite: the head takes the hit, the card jolts on its pin.
          if (audible) {
            props.audio.play("thock", {
              pitch: pinPitch,
              gain: 0.6,
              pan: panOf(),
            });
          }
          pinScale.set(1.14);
          noteY.set(2);
          run(
            animate(pinScale, 1, springs.recoil),
            animate(noteY, 0, springs.recoil),
          );
        },
      }),
    );
  };

  // Arrival. A re-run (StrictMode) lands it again from the top: the first
  // run's cleanup stopped it partway, and a landing is only whole from above.
  React.useEffect(() => {
    if (props.entry === "still") return;
    land(
      props.entry === "reveal" ? 0.3 : 0,
      latest.current.heard(HEARD_WITHIN),
    );
    return halt;
    // Mount only: a card arrives once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new tilt from the host: the card swings to its new hang.
  React.useEffect(() => {
    const to = r2(sway * props.tilt);
    if (angle.get() === to) return;
    if (!motionSafe) angle.set(to);
    else run(animate(angle, to, springs.glide));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.tilt]);

  // Hovered or focused: lifted toward you, in front of its neighbours.
  React.useEffect(() => {
    const to = raised || held ? 1 : 0;
    if (!motionSafe) {
      lifted.set(to);
      return;
    }
    const c = animate(lifted, to, springs.snap);
    return () => c.stop();
  }, [raised, held, motionSafe, lifted]);

  // Leaving. Pulled: the card finishes falling, then its pin hole fades.
  // Pushed out or taken away by the host: it unpins itself first.
  React.useEffect(() => {
    if (isPresent) return;
    let live = true;
    const done = () => {
      if (!live) return;
      const c = animate(holeOpacity, 0, {
        duration: durations.slow,
        ease: easings.exit,
        onComplete: () => {
          if (live) safeToRemove?.();
        },
      });
      runs.current.push(c);
    };
    const p = pull.current;
    if (p.out) {
      if (p.fallen) done();
      else onFallen.current = done;
    } else {
      onFallen.current = done;
      latest.current.onLeave(notice.id, false);
      autoPull(latest.current.heard(HEARD_WITHIN), true);
    }
    return () => {
      live = false;
      onFallen.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  React.useEffect(() => halt, [halt]);

  const drag = useDrag({
    threshold: 3,
    disabled: props.disabled || !isPresent,
    onStart: () => {
      halt();
      setHeld(true);
    },
    onMove: ({ offset }) => pullTo(offset.x, offset.y, true),
    onEnd: ({ velocity }) => {
      setHeld(false);
      const p = pull.current;
      if (!p.out) {
        const far = Math.hypot(
          project(p.last.x, velocity.x, 0.99),
          project(p.last.y, velocity.y, 0.99),
        );
        // A flick pulls it if the pull it throws would have.
        if (far >= PULL && Math.hypot(velocity.x, velocity.y) > 250) {
          popOut(true);
        }
      }
      if (p.out) dropPin(velocity.x, velocity.y);
      else settleBack(Math.hypot(p.last.x, p.last.y));
    },
    onCancel: () => {
      setHeld(false);
      if (pull.current.out) dropPin(0, 0);
      else settleBack(0);
    },
    onTap: () => {
      // A tap wiggles the pin in its hole: it wants pulling.
      props.audio.play("thock", {
        pitch: r2(1.9 * pinPitch),
        gain: 0.12,
        pan: panOf(),
      });
      if (!latest.current.motionSafe) return;
      run(
        animate(pinTurn, [0, -14, 10, -5, 0], {
          duration: 0.4,
          ease: easings.move,
        }),
        animate(pinLift, [0, 2.5, 0], { duration: 0.3, ease: easings.move }),
      );
    },
  });

  const rotate = useTransform(
    [angle, noteTurn] as MotionValue<number>[],
    ([a = 0, t = 0]: number[]) => r2(a + t),
  );
  const scale = useTransform(
    [noteScale, lifted] as MotionValue<number>[],
    ([s = 1, l = 0]: number[]) => r2(s * (1 + (motionSafe ? 0.035 : 0) * l)),
  );
  const shadow = useTransform(lifted, (l) => {
    const e = clamp(l, 0, 1.2);
    return `0 1px 1px oklch(0.2 0.03 60 / 0.3), 0 ${r2(2 + e * 5)}px ${r2(4 + e * 9)}px oklch(0.2 0.03 60 / ${r2(0.2 + e * 0.12)})`;
  });
  // Height above the board is seen from nearly overhead: the head rises a
  // little, grows, and its shadow slides away from it down and right.
  const headX = pinX;
  const headY = useTransform(
    [pinY, pinLift] as MotionValue<number>[],
    ([y = 0, l = 0]: number[]) => r2(y - l * 0.45),
  );
  const headScale = useTransform(
    [pinScale, pinLift] as MotionValue<number>[],
    ([s = 1, l = 0]: number[]) => r2(s * (1 + l * 0.024)),
  );
  const tall = pins === "tack" ? 1.6 : pins === "flat" ? 0.5 : 1;
  const shadowX = useTransform(
    [pinX, pinLift] as MotionValue<number>[],
    ([x = 0, l = 0]: number[]) => r2(x + 2 * tall + l * 0.4),
  );
  const shadowY = useTransform(
    [pinY, pinLift] as MotionValue<number>[],
    ([y = 0, l = 0]: number[]) => r2(y + 2.5 * tall + l * 0.3),
  );
  const shadowOpacity = useTransform(
    [pinOpacity, pinLift] as MotionValue<number>[],
    ([o = 1, l = 0]: number[]) => r2(o * clamp(0.5 - l * 0.012, 0.15, 0.5)),
  );

  const leaving = !isPresent;
  const word = TONES[tone];
  const [left, top] = props.place;

  return (
    <li
      className="absolute w-[38%]"
      style={{
        left: `${r2(left + nudgeX)}%`,
        top: `${r2(top + nudgeY)}%`,
        zIndex: held ? 60 : leaving ? 55 : raised ? 50 : props.order + 1,
      }}
    >
      {/* The pin's hole, under the card: seen once the card has gone. */}
      <motion.span
        aria-hidden
        className="absolute left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          top: PIN_AT,
          background: props.corkwork.hole,
          opacity: holeOpacity,
        }}
      />
      <motion.article
        ref={(node: HTMLElement | null) => {
          articleRef.current = node;
          props.setNode(notice.id, node);
        }}
        tabIndex={props.focusable && !leaving ? 0 : -1}
        aria-labelledby={titleId}
        aria-describedby={
          notice.body ? `${bodyId} ${props.hintId}` : props.hintId
        }
        aria-disabled={props.disabled || undefined}
        aria-hidden={leaving || undefined}
        onFocus={() => {
          setRaised(true);
          props.onFocus(notice.id);
        }}
        onBlur={() => setRaised(false)}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setRaised(true);
        }}
        onPointerLeave={(event) => {
          if (
            event.pointerType === "mouse" &&
            document.activeElement !== articleRef.current
          ) {
            setRaised(false);
          }
        }}
        onKeyDown={(event) => {
          if (leaving) return;
          const key = event.key;
          if (key === "Delete" || key === "Backspace") {
            event.preventDefault();
            if (!event.repeat && !props.disabled) autoPull(true);
            return;
          }
          if (
            key === "ArrowUp" ||
            key === "ArrowDown" ||
            key === "ArrowLeft" ||
            key === "ArrowRight" ||
            key === "Home" ||
            key === "End"
          ) {
            event.preventDefault();
            props.onKeyMove(notice.id, key);
          }
        }}
        className={cn(
          "relative block rounded-1 px-2.5 pt-3.5 pb-2 font-sans outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{
          background: PAPERS[tone],
          color: INK,
          boxShadow: shadow,
          x: noteX,
          y: noteY,
          rotate,
          scale,
          rotateX: noteTilt,
          transformPerspective: 500,
          transformOrigin: `50% ${PIN_AT}px`,
          opacity: noteOpacity,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            background:
              "linear-gradient(168deg, transparent 62%, oklch(0.2 0.03 60 / 0.07))",
          }}
        />
        <p
          id={titleId}
          className="relative flex min-w-0 items-start gap-1 text-[11px] leading-4 font-semibold"
        >
          <span className="flex h-4 shrink-0 items-center">
            <Glyph tone={tone} />
          </span>
          <span className="sr-only">{word}: </span>
          <span className="line-clamp-2" title={notice.title}>
            {notice.title}
          </span>
        </p>
        {notice.body ? (
          <p
            id={bodyId}
            className="relative mt-0.5 line-clamp-2 text-[10px] leading-[13px]"
            style={{ color: INK_SOFT }}
            title={notice.body}
          >
            {notice.body}
          </p>
        ) : null}
      </motion.article>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          top: PIN_AT,
          x: shadowX,
          y: shadowY,
          opacity: shadowOpacity,
          background:
            "radial-gradient(closest-side, oklch(0.15 0.03 50 / 0.9), transparent)",
        }}
      />
      <motion.button
        ref={pinRef}
        type="button"
        tabIndex={-1}
        disabled={props.disabled || leaving}
        aria-label={`Unpin ${notice.title}`}
        onClick={(event) => {
          // Pointer pulls arrive through the drag; a click with no pointer
          // behind it is assistive technology pressing the pin.
          if (event.detail === 0) autoPull(true);
        }}
        {...drag}
        className={cn(
          "absolute left-1/2 flex size-9 touch-none items-center justify-center rounded-full outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid",
          props.disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{
          top: PIN_AT - 18,
          marginLeft: -18,
          x: headX,
          y: headY,
          scale: headScale,
          rotate: pinTurn,
          opacity: pinOpacity,
        }}
      >
        <PinHead kind={pins} colour={colour} gid={gid} />
      </motion.button>
    </li>
  );
}

type Book = {
  key: string;
  ids: string[];
  titles: Record<string, string>;
  places: Record<string, number>;
  entry: Record<string, Entry>;
  said: { n: number; polite: string; assertive: string };
};

const spoken = (n: CorkNotesNotice) =>
  `${TONES[n.tone ?? "info"]}: ${stop(n.title)}${n.body ? ` ${stop(n.body)}` : ""}`;

/** Places for the pinned cards: a card keeps its place for as long as it hangs. */
function placeAll(
  visible: string[],
  count: number,
  had: Record<string, number>,
  freed: Set<number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const id of visible) {
    const at = had[id];
    if (at !== undefined && at < count && !used.has(at)) {
      out[id] = at;
      used.add(at);
    }
  }
  const free = Array.from({ length: count }, (_, i) => i)
    .filter((i) => !used.has(i))
    // A place a card is still falling from is taken last.
    .sort((a, b) => Number(freed.has(a)) - Number(freed.has(b)) || a - b);
  for (const id of visible) {
    if (out[id] !== undefined) continue;
    const at = free.shift() ?? 0;
    out[id] = at;
  }
  return out;
}

/**
 * A notifier pinned to a cork board. Each notice lands as a small paper card,
 * hanging crooked by its seeded angle, and its pushpin drops in after it —
 * falling on the exit ease and biting with a thock, the head taking the hit on
 * the recoil spring while the card jolts. Cards overlap like a real board;
 * hovering or focusing one lifts it to the front on the snap spring.
 *
 * Pull a pin up and away to take a card down: in the cork the pin gives only a
 * little, rubber-banded, tugging the card's top with it; past its hold it
 * comes out with the pointer 1:1 and the card, let go, flutters down off the
 * board — falling on the exit ease, swaying and turning over — leaving its pin
 * hole for a moment. A flick pulls; a short pull springs back on snap.
 *
 * Cards are articles in a list with one tab stop: arrows move, Delete pulls
 * the focused card's pin (the same pull, driven), and every pin is a real
 * button for assistive technology. Under reduced motion cards and pins fade
 * in and out where they hang; a dragged pin still follows the pointer.
 */
export function CorkNotes({
  notices,
  onDismiss,
  label = "Board",
  tilt = 5,
  pins = "round",
  cork = "light",
  max = 4,
  sound = false,
  disabled = false,
  className,
}: CorkNotesProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const heard = useVisitorPress();
  const hintId = React.useId();
  const corkwork = CORKS[cork] ?? CORKS.light;
  const pin: CorkNotesPin = pins === "flat" || pins === "tack" ? pins : "round";
  const count = clamp(Math.round(Number.isFinite(max) ? max : 4), 2, 6);
  const lean = clamp(Number.isFinite(tilt) ? tilt : 5, 0, 12);

  const list = React.useMemo(() => {
    const seen = new Set<string>();
    return notices.filter((n) => !seen.has(n.id) && (seen.add(n.id), true));
  }, [notices]);
  const visible = list.slice(-count);
  const earlier = list.length - visible.length;
  const ids = list.map((n) => n.id);
  const shownIds = visible.map((n) => n.id);
  const key = `${count}|${ids.join("|")}`;

  const [book, setBook] = React.useState<Book>(() => ({
    key,
    ids,
    titles: Object.fromEntries(list.map((n) => [n.id, n.title])),
    places: placeAll(shownIds, count, {}, new Set()),
    entry: Object.fromEntries(shownIds.map((id) => [id, "still" as Entry])),
    said: { n: 0, polite: "", assertive: "" },
  }));
  if (book.key !== key) {
    const known = new Set(book.ids);
    const now = new Set(ids);
    const shown = new Set(shownIds);
    const freed = new Set(
      Object.entries(book.places)
        .filter(([id]) => !shown.has(id))
        .map(([, at]) => at),
    );
    const entry: Record<string, Entry> = {};
    for (const id of shownIds) {
      entry[id] = book.entry[id] ?? (known.has(id) ? "reveal" : "land");
    }
    const arrived = list.filter((n) => !known.has(n.id));
    const gone = book.ids.filter((id) => !now.has(id));
    const newest = arrived[arrived.length - 1];
    const polite: string[] = [];
    let assertive = "";
    if (gone.length > 0) {
      polite.push(
        `Unpinned: ${stop(gone.map((id) => book.titles[id] ?? "a card").join(", "))}`,
      );
    }
    if (newest) {
      const text = `Pinned. ${spoken(newest)}`;
      if (newest.tone === "danger") assertive = text;
      else polite.push(text);
    }
    setBook({
      key,
      ids,
      titles: Object.fromEntries(list.map((n) => [n.id, n.title])),
      places: placeAll(shownIds, count, book.places, freed),
      entry,
      said:
        polite.length > 0 || assertive
          ? { n: book.said.n + 1, polite: polite.join(" "), assertive }
          : book.said,
    });
  }

  const [focusId, setFocusId] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<string, HTMLElement>());
  const listed = React.useRef(new Set(ids));
  // Before any passive effect: a leaving card asks this in its own effect,
  // and children's effects run before their parent's.
  React.useLayoutEffect(() => {
    listed.current = new Set(ids);
  });

  const tabStop =
    focusId && shownIds.includes(focusId)
      ? focusId
      : (shownIds[shownIds.length - 1] ?? null);

  const onLeave = (id: string, report: boolean) => {
    const i = shownIds.indexOf(id);
    const rest = shownIds.filter((other) => other !== id);
    const neighbour =
      (i < 0 ? rest[rest.length - 1] : (rest[i] ?? rest[i - 1])) ?? null;
    const held = nodes.current.get(id);
    if (held && held.contains(document.activeElement)) {
      if (neighbour) {
        setFocusId(neighbour);
        nodes.current.get(neighbour)?.focus({ preventScroll: true });
      } else {
        rootRef.current?.focus({ preventScroll: true });
      }
    }
    if (report) onDismiss?.(id);
  };

  const onKeyMove = (id: string, keyName: string) => {
    const i = shownIds.indexOf(id);
    if (i < 0) return;
    const to =
      keyName === "ArrowUp" || keyName === "ArrowLeft"
        ? i - 1
        : keyName === "ArrowDown" || keyName === "ArrowRight"
          ? i + 1
          : keyName === "Home"
            ? 0
            : shownIds.length - 1;
    const target = shownIds[clamp(to, 0, shownIds.length - 1)];
    if (!target) return;
    setFocusId(target);
    nodes.current.get(target)?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={label}
      tabIndex={-1}
      className={cn(
        "relative w-full max-w-80 rounded-3 outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        ref={boardRef}
        className="relative isolate aspect-[8/5] w-full overflow-clip rounded-3"
        style={{
          background: corkwork.frame,
          boxShadow:
            "inset 0 1px 0 oklch(1 0 0 / 0.18), inset 0 -1px 0 oklch(0.2 0.03 50 / 0.3)",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-[5px] overflow-clip rounded-2"
          style={{
            background: corkwork.cork,
            boxShadow: "inset 0 1px 3px oklch(0.2 0.03 50 / 0.4)",
          }}
        >
          <svg
            viewBox="0 0 320 200"
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 size-full"
          >
            <path d={GRAIN.dark} fill={corkwork.grain} opacity={0.55} />
            <path d={GRAIN.light} fill={corkwork.fleck} opacity={0.6} />
            <path d={GRAIN.holes} fill={corkwork.hole} opacity={0.5} />
          </svg>
          {list.length === 0 ? (
            <p
              className="absolute inset-0 flex items-center justify-center font-mono text-[10px] tracking-[0.08em] uppercase"
              style={{ color: corkwork.empty }}
            >
              Nothing pinned
            </p>
          ) : null}
        </div>
        <ol aria-label={label} className="absolute inset-[5px]">
          <AnimatePresence initial={false}>
            {visible.map((n, i) => (
              <Note
                key={n.id}
                notice={n}
                entry={book.entry[n.id] ?? "still"}
                place={PLACES[book.places[n.id] ?? i] ?? PLACES[0] ?? [5, 8]}
                order={i}
                tilt={lean}
                pins={pin}
                corkwork={corkwork}
                focusable={tabStop === n.id}
                motionSafe={motionSafe}
                disabled={disabled}
                audio={audio}
                heard={heard}
                hintId={hintId}
                isListed={(id) => listed.current.has(id)}
                boardRect={() =>
                  boardRef.current?.getBoundingClientRect() ?? null
                }
                setNode={(id, node) => {
                  if (node) nodes.current.set(id, node);
                  else nodes.current.delete(id);
                }}
                onFocus={setFocusId}
                onKeyMove={onKeyMove}
                onLeave={onLeave}
              />
            ))}
          </AnimatePresence>
        </ol>
        {earlier > 0 ? (
          <span
            className="absolute right-2.5 bottom-[3px] z-[70] rounded-1 px-1.5 font-mono text-[9px] leading-[14px] tracking-[0.06em] uppercase tabular-nums"
            style={{ background: PAPERS.info, color: INK }}
          >
            +{earlier} more
          </span>
        ) : null}
      </div>

      <p id={hintId} className="sr-only">
        Pull a card&apos;s pin up and away to take it down, or press Delete.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        <span key={book.said.n}>{book.said.polite}</span>
      </p>
      <p aria-live="assertive" className="sr-only">
        <span key={book.said.n}>{book.said.assertive}</span>
      </p>
    </div>
  );
}
