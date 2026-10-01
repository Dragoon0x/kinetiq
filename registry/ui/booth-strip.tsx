"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BoothStripTone = "bw" | "sepia" | "colour";

/** Where the booth is: no strip yet, taking a strip, a wet strip, a dry one. */
export type BoothStripPhase = "idle" | "shooting" | "wet" | "dry";

export type BoothStripProps = {
  /** Printed on the strip's tail, e.g. "Fernworks · 01.10.26". */
  caption?: string;
  /** Your own frame contents, used in turn; by default each frame is a drawn booth portrait. */
  photos?: React.ReactNode[];
  /** The booth's accessible name. @default "Photo booth" */
  label?: string;
  /** Controlled: the shot shown enlarged (0 is the first shot), or null. */
  value?: number | null;
  /** Initial enlarged shot when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the pick, key or button that opened or closed a shot. */
  onValueChange?: (shot: number | null) => void;
  /** A dry strip already hangs from the slot at first. @default true */
  defaultPrinted?: boolean;
  /** Fires when a new strip has finished printing. */
  onPrint?: () => void;
  /** Fires as the booth moves between phases: shooting, wet, dry. */
  onPhaseChange?: (phase: BoothStripPhase) => void;
  /** Shots per strip, 3 or 4. @default 4 */
  frames?: number;
  /** The print's chemistry. @default "bw" */
  tone?: BoothStripTone;
  /** The booth flashes white on each shot. Off: only the reflector lights. @default true */
  flash?: boolean;
  /** Play the shutter and the print feed. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The strip, in px: it is a physical object and keeps its size. */
const FRAME_W = 116;
const FRAME_H = 92;
const GAP = 6;
const MARGIN = 8;
const TAIL = 26;
const STRIP_W = FRAME_W + 2 * MARGIN;
const PITCH = FRAME_H + GAP;
/** The swing: a strip this long sweeps a lot of room, so it swings small. */
const SWING_MAX = 9;
const PENDULUM = {
  type: "spring" as const,
  stiffness: 42,
  damping: 1.8,
  mass: 1,
};
/** Seconds for a wet strip to dry by itself. */
const DRY_TIME = 7;

const stripHeight = (n: number) =>
  MARGIN + n * FRAME_H + (n - 1) * GAP + MARGIN + TAIL;
/** How much of the strip is out of the slot after `k` shots (0 = the leader only). */
const emergedAfter = (k: number, n: number) =>
  k >= n ? stripHeight(n) : TAIL + MARGIN + k * PITCH;

const PAPER = "oklch(0.985 0.004 90)";
const PAPER_INK = "oklch(0.42 0.01 260)";
const SCREEN = "oklch(0.16 0.02 260)";
const SCREEN_INK = "oklch(0.84 0.13 75)";
const SLOT = "oklch(0.14 0.01 260)";

const TONES: Record<BoothStripTone, string> = {
  bw: "grayscale(1) contrast(1.08)",
  sepia: "grayscale(1) sepia(0.78) contrast(1.02) brightness(1.02)",
  colour: "saturate(0.9) contrast(1.03)",
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A feed is stepped into roller lines: a quick move, a hold, a move. */
const rollerEase = (t: number) => {
  const lines = 7;
  const at = clamp(t, 0, 1) * lines;
  const i = Math.floor(at);
  const f = at - i;
  const s = f < 0.62 ? (f / 0.62) * (f / 0.62) * (3 - (2 * f) / 0.62) : 1;
  return Math.min(1, (i + s) / lines);
};

type Expression = "smile" | "wink" | "laugh" | "surprise" | "glance";
const EXPRESSIONS: Expression[] = [
  "smile",
  "wink",
  "laugh",
  "surprise",
  "glance",
];
const SKIN = [
  "oklch(0.84 0.06 60)",
  "oklch(0.72 0.08 55)",
  "oklch(0.58 0.08 50)",
  "oklch(0.45 0.07 45)",
];
const HAIR = [
  "oklch(0.25 0.02 50)",
  "oklch(0.45 0.08 55)",
  "oklch(0.7 0.1 80)",
  "oklch(0.35 0.1 30)",
];
const SWEATER = [
  "oklch(0.55 0.12 250)",
  "oklch(0.6 0.13 30)",
  "oklch(0.62 0.1 150)",
  "oklch(0.7 0.11 85)",
];

type Person = {
  cx: number;
  r: number;
  skin: string;
  hair: string;
  sweater: string;
  style: number;
  glasses: boolean;
};

/** Who is in this strip's booth: one or two people, seeded per run. */
function castOf(run: number) {
  const rand = lcg(0x9e3779b9 ^ (run * 2654435761));
  const pair = rand() < 0.55;
  const pick = <T,>(list: T[]) =>
    list[Math.floor(rand() * list.length)] ?? (list[0] as T);
  const person = (cx: number, r: number): Person => ({
    cx,
    r,
    skin: pick(SKIN),
    hair: pick(HAIR),
    sweater: pick(SWEATER),
    style: Math.floor(rand() * 4),
    glasses: rand() < 0.3,
  });
  const people = pair ? [person(38, 12.5), person(78, 12.5)] : [person(58, 15)];
  // Every shot gets its own face: the list is shuffled per run.
  const order = [...EXPRESSIONS];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = order[i] as Expression;
    order[i] = order[j] as Expression;
    order[j] = a;
  }
  const tilts = Array.from({ length: 5 }, () =>
    Math.round((rand() - 0.5) * 16),
  );
  const leans = Array.from({ length: 5 }, () => Math.round((rand() - 0.5) * 8));
  return { people, order, tilts, leans };
}

function Face({
  p,
  expression,
  tilt,
  lean,
}: {
  p: Person;
  expression: Expression;
  tilt: number;
  lean: number;
}) {
  const cx = p.cx + lean;
  const cy = 44;
  const r = p.r;
  const e = r * 0.36;
  const eyeY = cy - r * 0.05;
  const ink = "oklch(0.2 0.02 40)";
  const eye = (x: number, kind: "dot" | "shut" | "round") =>
    kind === "dot" ? (
      <circle cx={r2(x)} cy={r2(eyeY)} r={r2(r * 0.09)} style={{ fill: ink }} />
    ) : kind === "round" ? (
      // Wide eyes; behind glasses a ring would echo the frame, so a big dot.
      <circle
        cx={r2(x)}
        cy={r2(eyeY)}
        r={r2(r * (p.glasses ? 0.12 : 0.13))}
        fill={p.glasses ? undefined : "none"}
        strokeWidth={1.1}
        style={p.glasses ? { fill: ink } : { stroke: ink }}
      />
    ) : (
      <path
        d={`M${r2(x - r * 0.12)} ${r2(eyeY)}Q${r2(x)} ${r2(eyeY - r * 0.14)} ${r2(x + r * 0.12)} ${r2(eyeY)}`}
        fill="none"
        strokeWidth={1.1}
        strokeLinecap="round"
        style={{ stroke: ink }}
      />
    );
  const look = expression === "glance" ? r * 0.08 : 0;
  const mouthY = cy + r * 0.42;
  const mouth =
    expression === "laugh" ? (
      <path
        d={`M${r2(cx - r * 0.32)} ${r2(mouthY - r * 0.05)}Q${r2(cx)} ${r2(mouthY + r * 0.5)} ${r2(cx + r * 0.32)} ${r2(mouthY - r * 0.05)}Z`}
        style={{ fill: "oklch(0.35 0.08 25)" }}
      />
    ) : expression === "surprise" ? (
      <ellipse
        cx={r2(cx)}
        cy={r2(mouthY + r * 0.06)}
        rx={r2(r * 0.12)}
        ry={r2(r * 0.17)}
        style={{ fill: "oklch(0.35 0.08 25)" }}
      />
    ) : (
      <path
        d={`M${r2(cx - r * 0.3 + look)} ${r2(mouthY)}Q${r2(cx + look)} ${r2(mouthY + r * 0.28)} ${r2(cx + r * 0.3 + look)} ${r2(mouthY)}`}
        fill="none"
        strokeWidth={1.2}
        strokeLinecap="round"
        style={{ stroke: ink }}
      />
    );
  return (
    <g>
      <path
        d={`M${r2(cx - r * 2.1)} 92Q${r2(cx - r * 2)} ${r2(cy + r * 1.35)} ${r2(cx)} ${r2(cy + r * 1.3)}Q${r2(cx + r * 2)} ${r2(cy + r * 1.35)} ${r2(cx + r * 2.1)} 92Z`}
        style={{ fill: p.sweater }}
      />
      <rect
        x={r2(cx - r * 0.28)}
        y={r2(cy + r * 0.7)}
        width={r2(r * 0.56)}
        height={r2(r * 0.7)}
        style={{ fill: p.skin }}
      />
      <g transform={`rotate(${tilt} ${r2(cx)} ${r2(cy + r)})`}>
        {p.style === 1 ? (
          <circle
            cx={r2(cx)}
            cy={r2(cy - r * 1.05)}
            r={r2(r * 0.42)}
            style={{ fill: p.hair }}
          />
        ) : null}
        {p.style === 2 ? (
          <ellipse
            cx={r2(cx)}
            cy={r2(cy + r * 0.1)}
            rx={r2(r * 1.22)}
            ry={r2(r * 1.25)}
            style={{ fill: p.hair }}
          />
        ) : null}
        <ellipse
          cx={r2(cx)}
          cy={cy}
          rx={r2(r * 0.88)}
          ry={r}
          style={{ fill: p.skin }}
        />
        <path
          d={
            p.style === 3
              ? `M${r2(cx - r * 0.9)} ${r2(cy - r * 0.2)}Q${r2(cx - r * 0.8)} ${r2(cy - r * 1.15)} ${r2(cx)} ${r2(cy - r * 1.1)}Q${r2(cx + r * 0.8)} ${r2(cy - r * 1.15)} ${r2(cx + r * 0.9)} ${r2(cy - r * 0.2)}Q${r2(cx + r * 0.5)} ${r2(cy - r * 0.75)} ${r2(cx)} ${r2(cy - r * 0.72)}Q${r2(cx - r * 0.5)} ${r2(cy - r * 0.75)} ${r2(cx - r * 0.9)} ${r2(cy - r * 0.2)}Z`
              : `M${r2(cx - r * 0.95)} ${r2(cy + r * 0.25)}Q${r2(cx - r * 1.05)} ${r2(cy - r * 1.25)} ${r2(cx)} ${r2(cy - r * 1.12)}Q${r2(cx + r * 1.05)} ${r2(cy - r * 1.25)} ${r2(cx + r * 0.95)} ${r2(cy + r * 0.25)}Q${r2(cx + r * 0.7)} ${r2(cy - r * 0.6)} ${r2(cx + r * 0.1)} ${r2(cy - r * 0.62)}Q${r2(cx - r * 0.55)} ${r2(cy - r * 0.55)} ${r2(cx - r * 0.95)} ${r2(cy + r * 0.25)}Z`
          }
          style={{ fill: p.hair }}
        />
        {eye(
          cx - e + look,
          expression === "laugh"
            ? "shut"
            : expression === "surprise"
              ? "round"
              : "dot",
        )}
        {eye(
          cx + e + look,
          expression === "wink" || expression === "laugh"
            ? "shut"
            : expression === "surprise"
              ? "round"
              : "dot",
        )}
        {p.glasses ? (
          <g fill="none" strokeWidth={0.9} style={{ stroke: ink }}>
            <circle cx={r2(cx - e)} cy={r2(eyeY)} r={r2(r * 0.27)} />
            <circle cx={r2(cx + e)} cy={r2(eyeY)} r={r2(r * 0.27)} />
            <path
              d={`M${r2(cx - e + r * 0.27)} ${r2(eyeY)}H${r2(cx + e - r * 0.27)}`}
            />
          </g>
        ) : null}
        <circle
          cx={r2(cx - r * 0.5)}
          cy={r2(cy + r * 0.28)}
          r={r2(r * 0.15)}
          style={{ fill: "oklch(0.7 0.12 20 / 0.35)" }}
        />
        <circle
          cx={r2(cx + r * 0.5)}
          cy={r2(cy + r * 0.28)}
          r={r2(r * 0.15)}
          style={{ fill: "oklch(0.7 0.12 20 / 0.35)" }}
        />
        {mouth}
      </g>
    </g>
  );
}

/** A booth portrait: the curtain, and whoever is in the booth this run. */
function Portrait({ run, shot }: { run: number; shot: number }) {
  const cast = React.useMemo(() => castOf(run), [run]);
  const expression = cast.order[shot % cast.order.length] ?? "smile";
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
      className="block size-full"
    >
      <rect
        width={FRAME_W}
        height={FRAME_H}
        style={{ fill: "oklch(0.52 0.1 25)" }}
      />
      {Array.from({ length: 9 }, (_, i) => (
        <rect
          key={i}
          x={r2(i * 13 - 2)}
          width={6}
          height={FRAME_H}
          style={{ fill: "oklch(0.44 0.1 25 / 0.55)" }}
        />
      ))}
      {cast.people.map((p, i) => (
        <Face
          key={i}
          p={p}
          expression={
            (i === 0
              ? expression
              : cast.order[(shot + 2) % cast.order.length]) ?? "smile"
          }
          tilt={
            (cast.tilts[(shot + i) % cast.tilts.length] ?? 0) * (i ? -1 : 1)
          }
          lean={cast.leans[(shot + i) % cast.leans.length] ?? 0}
        />
      ))}
    </svg>
  );
}

function CameraGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
    >
      <path d="M3 6.5h3l1.4-2h5.2l1.4 2h3v9H3z" />
      <circle cx={10} cy={11} r={2.8} />
    </svg>
  );
}

type Phase = BoothStripPhase;

type Step = { delay: number; fn: () => void };

/**
 * Steps on a chain of timeouts that can pause with the page: the step that
 * was waiting is kept, and re-armed with what was left of its delay.
 */
function createTimeline() {
  let steps: Step[] = [];
  let current: Step | null = null;
  let timer = 0;
  let due = 0;
  let left = 0;
  let epoch = 0;
  const arm = (step: Step, delay: number) => {
    const mine = epoch;
    current = step;
    due = performance.now() + delay;
    timer = window.setTimeout(() => {
      timer = 0;
      current = null;
      step.fn();
      const following = steps.shift();
      if (following && mine === epoch) arm(following, following.delay);
    }, delay);
  };
  return {
    schedule(next: Step[]) {
      this.clear();
      steps = [...next];
      const first = steps.shift();
      if (first) arm(first, first.delay);
    },
    pause() {
      if (!timer || !current) return;
      window.clearTimeout(timer);
      timer = 0;
      left = Math.max(0, due - performance.now());
    },
    resume() {
      if (timer || !current) return;
      arm(current, left);
    },
    clear() {
      epoch += 1;
      window.clearTimeout(timer);
      timer = 0;
      steps = [];
      current = null;
    },
  };
}

/**
 * A photo booth's front panel and the strip it prints. Press the shutter:
 * for each shot the readout counts down, the reflector charges and fires —
 * a white wash over the booth and a shutter `snap` — and the strip feeds out
 * of the slot by one frame on a tween stepped into roller lines while the
 * feed whirs. The newest shot is always nearest the slot, the way a strip
 * leaves a printer.
 *
 * A fresh strip is wet: darker and glossy, the gloss shrinking from the
 * edges as it dries. Grab it and shake it — it pivots at the slot, follows
 * the finger 1:1 and rubber-bands at the edge of its swing, then swings as a
 * pendulum taking the release velocity — and every degree of travel dries it
 * faster. Any frame enlarges into a viewer that grows out of the frame on the
 * glide spring. The frames are buttons in one tab stop: Up and Down move,
 * Enter enlarges, Left and Right shake. Under reduced motion nothing travels
 * or flashes; the shots fade into their frames.
 */
export function BoothStrip({
  caption,
  photos,
  label = "Photo booth",
  value,
  defaultValue = null,
  onValueChange,
  defaultPrinted = true,
  onPrint,
  onPhaseChange,
  frames = 4,
  tone = "bw",
  flash = true,
  sound = false,
  disabled = false,
  className,
}: BoothStripProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const n = Math.round(clamp(frames, 3, 4));
  const stripH = stripHeight(n);

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const picked = value === undefined ? own : value;
  const open = picked !== null && picked >= 0 && picked < n ? picked : null;

  const [run, setRun] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>(
    defaultPrinted ? "dry" : "idle",
  );
  const [printed, setPrinted] = React.useState(defaultPrinted ? n : 0);
  const [display, setDisplay] = React.useState(
    defaultPrinted ? "Dry" : "Ready",
  );
  const [focusShot, setFocusShot] = React.useState(n - 1);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // The viewer stays for its closing move after the value has gone.
  const [viewing, setViewing] = React.useState<number | null>(open);
  const [leaving, setLeaving] = React.useState(false);
  if (open !== null && (viewing !== open || leaving)) {
    setViewing(open);
    setLeaving(false);
  }
  if (open === null && viewing !== null && !leaving) setLeaving(true);

  const hasStrip = phase !== "idle";
  const shown = phase === "shooting" ? printed : hasStrip ? n : 0;

  const stripY = useMotionValue(defaultPrinted ? 0 : -stripH);
  const stripOpacity = useMotionValue(1);
  const angle = useMotionValue(0);
  const wetness = useMotionValue(0);
  const flashOpacity = useMotionValue(0);
  const charge = useMotionValue(0);
  const photoX = useMotionValue(0);
  const photoY = useMotionValue(0);
  const photoScale = useMotionValue(1);
  const scrim = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const areaRef = React.useRef<HTMLDivElement | null>(null);
  const shotRefs = React.useRef(new Map<number, HTMLButtonElement>());
  const photoRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const [timeline] = React.useState(createTimeline);
  const phaseNow = React.useRef<Phase>(phase);
  const whir = React.useRef<LoopHandle | null>(null);
  const visible = React.useRef(true);
  const drying = React.useRef(0);
  const lastTick = React.useRef(0);
  const grab = React.useRef<{ r: number; last: number } | null>(null);
  const [closeNode, setCloseNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const returnFocus = React.useRef<number | null>(null);
  const api = React.useRef<{
    dryTick: (now: number) => void;
    resume: () => void;
    pause: () => void;
    dryBy: (amount: number) => void;
  } | null>(null);

  const run1 = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const stopWhir = () => {
    whir.current?.stop();
    whir.current = null;
  };

  const pause = () => {
    timeline.pause();
    stopWhir();
  };
  const resume = () => timeline.resume();

  // ── Drying: a clock that runs only while wet, on screen and visible.
  const dryTick = (now: number) => {
    drying.current = 0;
    if (phaseNow.current !== "wet") return;
    if (!visible.current || document.hidden) {
      lastTick.current = 0;
      return;
    }
    const dt = lastTick.current
      ? Math.min(0.1, (now - lastTick.current) / 1000)
      : 0;
    lastTick.current = now;
    const w = Math.max(0, wetness.get() - dt / DRY_TIME);
    wetness.set(r2(w * 1000) / 1000);
    if (w <= 0) {
      dried();
      return;
    }
    drying.current = window.requestAnimationFrame((t) =>
      api.current?.dryTick(t),
    );
  };
  const startDrying = () => {
    if (drying.current || phaseNow.current !== "wet") return;
    lastTick.current = 0;
    drying.current = window.requestAnimationFrame((t) =>
      api.current?.dryTick(t),
    );
  };
  const dried = () => {
    lastTick.current = 0;
    if (phaseNow.current !== "wet") return;
    phaseNow.current = "dry";
    setPhase("dry");
    onPhaseChange?.("dry");
    setDisplay("Dry");
    say("Strip dry.");
  };
  const dryBy = (amount: number) => {
    if (phaseNow.current !== "wet") return;
    const w = Math.max(0, wetness.get() - amount);
    wetness.set(Math.round(w * 1000) / 1000);
    if (w <= 0) {
      if (drying.current) window.cancelAnimationFrame(drying.current);
      drying.current = 0;
      dried();
    }
  };

  React.useEffect(() => {
    api.current = { dryTick, resume, pause, dryBy };
    phaseNow.current = phase;
  });

  const feedTo = (k: number, voiced: boolean, ms = 380) => {
    const target = emergedAfter(k, n) - stripH;
    if (!motionSafe) {
      stripY.jump(0);
      return;
    }
    if (voiced) {
      stopWhir();
      whir.current = audio.start("whir", {
        pitch: 1.25,
        gain: 0.5,
        pan: panOf(areaRef.current),
      });
    }
    run1(
      "feed",
      animate(stripY, target, {
        duration: ms / 1000,
        ease: rollerEase,
        onComplete: stopWhir,
      }),
    );
  };

  const fire = () => {
    audio.play("snap", { gain: 0.6, pan: panOf(rootRef.current) });
    run1("charge", animate(charge, 0, { duration: 0.5, ease: easings.enter }));
    if (flash && motionSafe) {
      flashOpacity.set(0.82);
      run1(
        "flash",
        animate(flashOpacity, 0, { duration: 0.42, ease: [0.2, 0.7, 0.4, 1] }),
      );
    }
  };

  const shoot = () => {
    if (disabled || phase === "shooting") return;
    for (const key of ["swing", "feed", "drop"]) anims.current.get(key)?.stop();
    if (drying.current) window.cancelAnimationFrame(drying.current);
    drying.current = 0;
    angle.jump(0);
    if (open !== null) close(false);
    const nextRun = run + 1;
    const steps: Step[] = [];
    const hadStrip = hasStrip;
    phaseNow.current = "shooting";
    setPhase("shooting");
    onPhaseChange?.("shooting");
    setDisplay("Ready");
    say(`Taking ${n} photos.`);
    // The last strip drops away first.
    if (hadStrip && motionSafe) {
      run1(
        "drop",
        animate(stripOpacity, 0, { duration: 0.28, ease: easings.exit }),
      );
      run1(
        "dropY",
        animate(stripY, 24, { duration: 0.28, ease: easings.exit }),
      );
    }
    steps.push({
      delay: hadStrip && motionSafe ? 300 : 40,
      fn: () => {
        anims.current.get("dropY")?.stop();
        setRun(nextRun);
        setPrinted(0);
        stripOpacity.set(1);
        wetness.set(1);
        stripY.jump(motionSafe ? -stripH : 0);
        feedTo(0, true, 420);
      },
    });
    for (let k = 1; k <= n; k += 1) {
      const shot = k;
      steps.push({ delay: 520, fn: () => setDisplay("3") });
      steps.push({
        delay: 240,
        fn: () => {
          setDisplay("2");
          if (motionSafe) {
            run1(
              "charge",
              animate(charge, 1, { duration: 0.5, ease: easings.linear }),
            );
          } else {
            charge.set(1);
          }
        },
      });
      steps.push({ delay: 240, fn: () => setDisplay("1") });
      steps.push({
        delay: 260,
        fn: () => {
          fire();
          setPrinted(shot);
          setDisplay(`Shot ${shot}/${n}`);
          say(`Shot ${shot} of ${n}.`);
        },
      });
      steps.push({ delay: 120, fn: () => feedTo(shot, true) });
    }
    steps.push({
      delay: 420,
      fn: () => {
        phaseNow.current = "wet";
        setPhase("wet");
        onPhaseChange?.("wet");
        setDisplay("Drying");
        say("Strip printed. Shake it to dry it faster.");
        setFocusShot(n - 1);
        onPrint?.();
        startDrying();
      },
    });
    timeline.schedule(steps);
  };

  // ── Shaking: the strip pivots at the slot.
  const swingFree = (velocity: number) => {
    if (!motionSafe) {
      angle.jump(0);
      return;
    }
    const v = clamp(velocity, -60, 60);
    run1("swing", animate(angle, 0, { ...PENDULUM, velocity: v }));
  };

  const shake = (direction: number) => {
    if (disabled || phase === "shooting" || !hasStrip) return;
    dryBy(0.09);
    swingFree(angle.getVelocity() + direction * 42);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || phase === "shooting" || !hasStrip || open !== null,
    onStart: ({ point }) => {
      const rect = areaRef.current?.getBoundingClientRect();
      anims.current.get("swing")?.stop();
      grab.current = {
        r: Math.max(40, rect ? point.y - rect.top : 200),
        last: angle.get(),
      };
    },
    onMove: ({ offset }) => {
      const g = grab.current;
      if (!g) return;
      const raw = (Math.asin(clamp(offset.x / g.r, -1, 1)) * 180) / Math.PI;
      const a = rubberClamp(raw, -SWING_MAX, SWING_MAX, 10);
      dryBy(Math.abs(a - g.last) * 0.0045);
      g.last = a;
      if (motionSafe) angle.set(r2(a));
    },
    onEnd: ({ velocity }) => {
      const g = grab.current;
      grab.current = null;
      if (!g) return;
      swingFree(((velocity.x / g.r) * 180) / Math.PI);
    },
    onCancel: () => {
      grab.current = null;
      swingFree(0);
    },
    onTap: (event) => {
      const target =
        event.target instanceof Element
          ? event.target.closest("[data-shot]")
          : null;
      const shot = Number(target?.getAttribute("data-shot") ?? NaN);
      if (Number.isFinite(shot)) pick(shot);
    },
  });

  // Free swinging dries it a little too.
  React.useEffect(() => {
    let last = angle.get();
    return angle.on("change", (a) => {
      const moved = Math.abs(a - last);
      last = a;
      if (!grab.current && moved > 0.01) api.current?.dryBy(moved * 0.0015);
    });
  }, [angle]);

  // ── Picking a frame.
  const report = (shot: number | null) => {
    if (value === undefined) setOwn(shot);
    onValueChange?.(shot);
  };
  const pick = (shot: number) => {
    if (disabled || phase === "shooting" || shot >= shown) return;
    returnFocus.current = shot;
    report(shot);
  };
  const close = (refocus = true) => {
    if (open === null) return;
    returnFocus.current = refocus ? open : null;
    report(null);
  };

  // The viewer grows out of its frame: measured by hand, both boxes, and
  // carried from one to the other on the glide spring.
  const flipFrom = () => {
    const photo = photoRef.current;
    const source = viewing === null ? null : shotRefs.current.get(viewing);
    if (!photo || !source) return null;
    const a = source.getBoundingClientRect();
    const b = photo.getBoundingClientRect();
    if (b.width < 1) return null;
    return {
      x: r2(a.left - b.left),
      y: r2(a.top - b.top),
      s: r2(a.width / b.width),
    };
  };

  const isViewing = viewing !== null;
  React.useLayoutEffect(() => {
    if (viewing === null) return;
    if (leaving) {
      const from = flipFrom();
      const done = () => {
        setViewing(null);
        setLeaving(false);
      };
      const out = { duration: 0.22, ease: easings.exit };
      run1("scrim", animate(scrim, 0, { ...out, onComplete: done }));
      if (motionSafe && from) {
        run1("px", animate(photoX, from.x, out));
        run1("py", animate(photoY, from.y, out));
        run1("ps", animate(photoScale, from.s, out));
      }
      return;
    }
    const from = flipFrom();
    run1(
      "scrim",
      animate(scrim, 1, { duration: durations.base, ease: easings.enter }),
    );
    if (motionSafe && from && scrim.get() < 0.05) {
      photoX.jump(from.x);
      photoY.jump(from.y);
      photoScale.jump(from.s);
      run1("px", animate(photoX, 0, springs.glide));
      run1("py", animate(photoY, 0, springs.glide));
      run1("ps", animate(photoScale, 1, springs.glide));
    } else {
      photoX.jump(0);
      photoY.jump(0);
      photoScale.jump(1);
    }
    // Measured once per arrival or departure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewing, leaving]);

  // Focus goes to the viewer's Close when it arrives; back to the frame when
  // it leaves.
  React.useEffect(() => {
    if (closeNode && !leaving) closeNode.focus({ preventScroll: true });
  }, [closeNode, leaving]);
  React.useEffect(() => {
    if (viewing !== null || returnFocus.current === null) return;
    const shot = returnFocus.current;
    returnFocus.current = null;
    shotRefs.current.get(shot)?.focus({ preventScroll: true });
  }, [viewing]);

  // On screen and visible: the drying clock and the timeline run; off, they
  // wait.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current && phaseNow.current === "wet" && !drying.current) {
        lastTick.current = 0;
        drying.current = window.requestAnimationFrame((t) =>
          api.current?.dryTick(t),
        );
      }
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        api.current?.pause();
      } else {
        api.current?.resume();
        lastTick.current = 0;
        if (phaseNow.current === "wet" && !drying.current) {
          drying.current = window.requestAnimationFrame((t) =>
            api.current?.dryTick(t),
          );
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      timeline.clear();
      for (const c of running.values()) c.stop();
      running.clear();
      if (drying.current) window.cancelAnimationFrame(drying.current);
      drying.current = 0;
      whir.current?.stop();
      whir.current = null;
    };
  }, [timeline]);

  // A wet strip that is not drying (fresh out, or back on screen) starts.
  React.useEffect(() => {
    if (phase !== "wet") return;
    const id = window.requestAnimationFrame((t) => {
      if (!drying.current) api.current?.dryTick(t);
    });
    return () => window.cancelAnimationFrame(id);
  }, [phase]);

  const onShotKey = (event: React.KeyboardEvent, shot: number) => {
    const to = (i: number) => {
      const target = clamp(i, 0, shown - 1);
      setFocusShot(target);
      shotRefs.current.get(target)?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        to(shot + 1);
        return;
      case "ArrowDown":
        event.preventDefault();
        to(shot - 1);
        return;
      case "Home":
        event.preventDefault();
        to(shown - 1);
        return;
      case "End":
        event.preventDefault();
        to(0);
        return;
      case "ArrowLeft":
      case "ArrowRight":
        event.preventDefault();
        shake(event.key === "ArrowLeft" ? -1 : 1);
        return;
    }
  };

  const onViewerKey = (event: React.KeyboardEvent) => {
    if (open === null) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      report((open + step + shown) % shown);
    }
  };

  const veil = useTransform(wetness, (w) => {
    const k = clamp(w, 0, 1);
    const size = Math.round(28 + 120 * k);
    return `radial-gradient(ellipse ${size}% ${size}% at 50% 50%, black 52%, transparent 100%)`;
  });
  const veilOpacity = useTransform(wetness, (w) => r2(clamp(w, 0, 1)));
  const dryReadout = useTransform(
    wetness,
    (w) => `Drying ${Math.round((1 - clamp(w, 0, 1)) * 100)}%`,
  );
  const lampGlow = useTransform(charge, (c) =>
    c < 0.01
      ? "inset 0 0 0 1px oklch(1 0 0 / 0.5)"
      : `inset 0 0 0 1px oklch(1 0 0 / 0.5), 0 0 ${r2(4 + c * 16)}px ${r2(c * 5)}px oklch(0.97 0.05 90 / ${r2(0.25 + c * 0.6)})`,
  );
  const bulb = useTransform(
    charge,
    (c) => `oklch(${r2(0.82 + c * 0.17)} ${r2(0.06 - c * 0.04)} 85)`,
  );
  const filter = TONES[tone] ?? TONES.bw;
  const shooting = phase === "shooting";
  const shotName = (i: number) => `Shot ${i + 1} of ${n}`;
  const photoOf = (i: number) =>
    photos && photos.length ? (
      photos[i % photos.length]
    ) : (
      <Portrait run={run} shot={i} />
    );

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-label={label}
      className={cn(
        "relative isolate flex w-full max-w-80 flex-col items-center overflow-clip",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="relative z-10 flex h-21 w-full items-center gap-3 rounded-3 border border-hairline bg-surface-2 px-3 pb-2">
        <motion.span
          aria-hidden
          className="relative flex size-11 shrink-0 items-center justify-center rounded-full"
          style={{
            background:
              "radial-gradient(circle at 40% 35%, oklch(0.98 0 0), oklch(0.82 0.005 260) 55%, oklch(0.62 0.01 260))",
            boxShadow: lampGlow,
          }}
        >
          <motion.span
            className="block size-4 rounded-full"
            style={{
              backgroundColor: bulb,
              boxShadow: "inset 0 -1px 2px oklch(0.4 0.02 80 / 0.4)",
            }}
          />
        </motion.span>
        <div
          aria-hidden
          className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-2 px-2 font-mono text-[13px] tracking-[0.06em] uppercase tabular-nums"
          style={{
            backgroundColor: SCREEN,
            color: SCREEN_INK,
            boxShadow:
              "inset 0 1px 3px oklch(0 0 0 / 0.5), 0 0 0 1px oklch(1 0 0 / 0.06)",
          }}
        >
          {phase === "wet" ? (
            <motion.span className="truncate">{dryReadout}</motion.span>
          ) : (
            <span className="truncate">{display}</span>
          )}
        </div>
        <button
          type="button"
          aria-label={`Take ${n} photos`}
          aria-disabled={shooting || disabled || undefined}
          disabled={disabled}
          onClick={shoot}
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[inset_0_-2px_0_oklch(0_0_0/0.25)] transition-[transform,opacity] outline-none active:translate-y-px",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed aria-disabled:cursor-progress aria-disabled:opacity-60",
          )}
        >
          <CameraGlyph />
        </button>
        <span
          aria-hidden
          className="absolute bottom-[7px] left-1/2 h-1.5 w-[148px] -translate-x-1/2 rounded-full"
          style={{
            backgroundColor: SLOT,
            boxShadow: "inset 0 1px 1px oklch(0 0 0 / 0.6)",
          }}
        />
      </div>

      <div
        ref={areaRef}
        className="relative z-20 -mt-[11px] w-full overflow-clip"
        style={{ height: stripH + 10 }}
      >
        <motion.div
          inert={open !== null}
          {...drag}
          className={cn(
            "absolute top-0 left-1/2 -ml-[66px] touch-pan-y select-none [-webkit-touch-callout:none]",
            hasStrip && !shooting && !disabled
              ? "cursor-grab active:cursor-grabbing"
              : "",
          )}
          style={{
            width: STRIP_W,
            height: stripH,
            y: stripY,
            rotate: angle,
            originX: 0.5,
            originY: 0,
            opacity: stripOpacity,
          }}
        >
          <div
            className="relative flex size-full flex-col"
            style={{
              backgroundColor: PAPER,
              padding: MARGIN,
              boxShadow:
                "0 1px 2px oklch(0.2 0.02 260 / 0.25), 0 6px 14px -6px oklch(0.2 0.02 260 / 0.35)",
            }}
          >
            <div
              role="group"
              aria-label={`Strip, ${n} shots`}
              aria-describedby={hintId}
              className="flex flex-col-reverse gap-1.5"
            >
              {Array.from({ length: n }, (_, i) => {
                const ready = i < shown;
                return (
                  <button
                    key={i}
                    ref={(node) => {
                      if (node) shotRefs.current.set(i, node);
                      else shotRefs.current.delete(i);
                    }}
                    type="button"
                    data-shot={i}
                    tabIndex={
                      i === clamp(focusShot, 0, Math.max(0, shown - 1)) && ready
                        ? 0
                        : -1
                    }
                    aria-label={shotName(i)}
                    aria-disabled={!ready || shooting || disabled || undefined}
                    onFocus={() => setFocusShot(i)}
                    onClick={(event) => {
                      // Pointer picks arrive through the drag's tap; a click
                      // with no pointer behind it is the keyboard's.
                      if (event.detail === 0 && ready) pick(i);
                    }}
                    onKeyDown={(event) => onShotKey(event, i)}
                    className={cn(
                      "relative block shrink-0 overflow-clip outline-none",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                      ready && !shooting ? "cursor-zoom-in" : "cursor-default",
                    )}
                    style={{
                      width: FRAME_W,
                      height: FRAME_H,
                      backgroundColor: "oklch(0.94 0.004 90)",
                    }}
                  >
                    <span
                      className={cn(
                        "absolute inset-0 block transition-opacity",
                        motionSafe ? "duration-150" : "duration-300",
                        ready ? "opacity-100" : "opacity-0",
                      )}
                      style={{ filter }}
                    >
                      {photoOf(i)}
                    </span>
                  </button>
                );
              })}
            </div>
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0"
              style={{
                height: stripH - TAIL,
                opacity: veilOpacity,
                maskImage: veil,
                WebkitMaskImage: veil,
                background:
                  "linear-gradient(118deg, oklch(0.15 0.02 260 / 0.24) 0%, oklch(0.15 0.02 260 / 0.24) 34%, oklch(1 0 0 / 0.42) 46%, oklch(0.15 0.02 260 / 0.2) 58%, oklch(0.15 0.02 260 / 0.24) 100%)",
              }}
            />
            <div
              className="mt-auto flex h-[26px] items-end justify-center pb-0.5 font-mono text-[8px] tracking-[0.02em] uppercase"
              style={{ color: PAPER_INK }}
            >
              <span className="min-w-0 truncate" title={caption}>
                {caption ?? "Photo booth"}
              </span>
            </div>
          </div>
        </motion.div>

        {viewing !== null ? (
          <motion.div
            role="group"
            aria-label={shotName(viewing)}
            onKeyDown={onViewerKey}
            className="absolute inset-0 z-30 flex flex-col items-center justify-start gap-3 bg-background/90 px-4 pt-6"
            style={{ opacity: scrim }}
          >
            <motion.div
              ref={photoRef}
              className="w-full max-w-[17.5rem] overflow-clip rounded-1 shadow-lg"
              style={{
                aspectRatio: `${FRAME_W} / ${FRAME_H}`,
                x: photoX,
                y: photoY,
                scale: photoScale,
                originX: 0,
                originY: 0,
                outline: `6px solid ${PAPER}`,
              }}
            >
              <motion.div
                key={viewing}
                className="size-full"
                style={{ filter }}
                initial={{ opacity: 0.35 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                {photoOf(viewing)}
              </motion.div>
            </motion.div>
            <div className="mt-1.5 flex w-full max-w-[17.5rem] items-center justify-between gap-2">
              <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {shotName(viewing)}
              </p>
              <div className="flex items-center gap-1.5">
                {(["Previous shot", "Next shot"] as const).map((name, k) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    disabled={leaving}
                    onClick={() => {
                      if (open === null) return;
                      report((open + (k ? 1 : -1) + shown) % shown);
                    }}
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-2 border border-hairline bg-card text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    )}
                  >
                    <svg
                      aria-hidden
                      viewBox="0 0 16 16"
                      className="size-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path
                        d={k ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"}
                      />
                    </svg>
                  </button>
                ))}
                <button
                  ref={setCloseNode}
                  type="button"
                  disabled={leaving}
                  onClick={() => close()}
                  className={cn(
                    "inline-flex h-8 items-center rounded-2 border border-hairline bg-card px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  )}
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </div>

      {flash ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-40 bg-white"
          style={{ opacity: flashOpacity }}
        />
      ) : null}

      <p id={hintId} className="sr-only">
        Up and Down move between shots, Enter enlarges one, Left and Right shake
        the strip to dry it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
