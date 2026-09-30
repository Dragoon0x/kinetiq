"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  usePresence,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import {
  useTactileSound,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PneumaticTubeTone = "info" | "success" | "warn" | "danger";

export type PneumaticTubeNotice = {
  id: string;
  title: string;
  body?: string;
  /** @default "info" */
  tone?: PneumaticTubeTone;
};

export type PneumaticTubeGlass = "clear" | "frosted" | "amber";
export type PneumaticTubeCapsule = "brass" | "copper" | "steel";

export type PneumaticTubeProps = {
  /** Every notice, oldest first: delivered one at a time, in this order. */
  notices: PneumaticTubeNotice[];
  /** Fires when the reader sends a note back, or drops a waiting capsule unread. */
  onDismiss?: (id: string) => void;
  /** The station's name. @default "Tube mail" */
  label?: string;
  /** How fast capsules travel, 0.5 to 2. @default 1 */
  speed?: number;
  /** The tube's glass, and the fog it holds. @default "clear" */
  glass?: PneumaticTubeGlass;
  /** The capsules' metal. @default "brass" */
  capsule?: PneumaticTubeCapsule;
  /** The whoosh, the landing and the cap. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

// The whole station lives in one 320×440 space that scales with the width.
const W = 320;
const H = 440;
/** Queued capsules stand here in the send tube, 38 units apart, head on top. */
const QUEUE_X = 34;
const QUEUE_Y = 328;
const QUEUE_STEP = 38;
const QUEUE_SHOWN = 3;
/** The drop from the tube's mouth into the cup. */
const DROP = 34;
const HEARD_WITHIN = 2500;
/** The note hangs from just under the cup. */
const SHEET_Y = 142;
/** The air gauge, under the note. */
const GAUGE = { x: 166, y: 382, r: 24 };
/** Its needle's sweep, in degrees from straight up. */
const SWEEP = { from: -125, span: 190 };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pctX = (x: number) => `${r3((x / W) * 100)}%`;
const pctY = (y: number) => `${r3((y / H) * 100)}%`;
const stop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

type Seg =
  | { kind: "line"; from: [number, number]; to: [number, number] }
  | {
      kind: "arc";
      cx: number;
      cy: number;
      r: number;
      a0: number;
      a1: number;
    };

type Sample = { s: number; x: number; y: number; heading: number };

/**
 * A route sampled every ~2 units: position and heading (degrees clockwise from
 * up) by distance along it. Built once; every value rounded, so the server
 * and the browser place a capsule identically.
 */
function route(segs: Seg[]): { samples: Sample[]; length: number } {
  const pts: [number, number][] = [];
  for (const seg of segs) {
    if (seg.kind === "line") {
      const [x0, y0] = seg.from;
      const [x1, y1] = seg.to;
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
      for (let i = pts.length ? 1 : 0; i <= n; i += 1) {
        pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
      }
    } else {
      const n = Math.max(2, Math.ceil((Math.abs(seg.a1 - seg.a0) * seg.r) / 2));
      for (let i = 1; i <= n; i += 1) {
        const a = seg.a0 + ((seg.a1 - seg.a0) * i) / n;
        pts.push([seg.cx + seg.r * Math.cos(a), seg.cy + seg.r * Math.sin(a)]);
      }
    }
  }
  const samples: Sample[] = [];
  let s = 0;
  pts.forEach(([x, y], i) => {
    const prev = pts[i - 1];
    const next = pts[i + 1] ?? pts[i];
    const back = prev ?? pts[i];
    if (prev) s += Math.hypot(x - prev[0], y - prev[1]);
    const dx = (next?.[0] ?? x) - (back?.[0] ?? x);
    const dy = (next?.[1] ?? y) - (back?.[1] ?? y);
    samples.push({
      s: r3(s),
      x: r3(x),
      y: r3(y),
      heading: r3((Math.atan2(dx, -dy) * 180) / Math.PI),
    });
  });
  return { samples, length: r3(s) };
}

const PI = Math.PI;
/** Up the left side, over the top, down into the cup. */
const SEND = route([
  { kind: "line", from: [QUEUE_X, QUEUE_Y], to: [34, 78] },
  { kind: "arc", cx: 68, cy: 78, r: 34, a0: PI, a1: 1.5 * PI },
  { kind: "line", from: [68, 44], to: [132, 44] },
  { kind: "arc", cx: 132, cy: 78, r: 34, a0: 1.5 * PI, a1: 2 * PI },
  { kind: "line", from: [166, 78], to: [166, 112] },
]);
/** Down through the cup's floor, right behind the sheet, down and out. */
const RETURN = route([
  { kind: "line", from: [166, 112], to: [166, 140] },
  { kind: "arc", cx: 196, cy: 140, r: 30, a0: PI, a1: 0.5 * PI },
  { kind: "line", from: [196, 170], to: [262, 170] },
  { kind: "arc", cx: 262, cy: 200, r: 30, a0: 1.5 * PI, a1: 2 * PI },
  { kind: "line", from: [292, 200], to: [292, 492] },
]);
const LA = SEND.length;
const LB = RETURN.length;

const TUBE_SEND =
  "M34 470L34 78A34 34 0 0 1 68 44L132 44A34 34 0 0 1 166 78L166 92";
const TUBE_RETURN =
  "M166 128L166 140A30 30 0 0 0 196 170L262 170A30 30 0 0 1 292 200L292 470";

function at(r: { samples: Sample[] }, s: number): Sample {
  const list = r.samples;
  const first = list[0] as Sample;
  const last = list[list.length - 1] as Sample;
  if (s <= first.s) return first;
  if (s >= last.s) return last;
  let lo = 0;
  let hi = list.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((list[mid] as Sample).s < s) lo = mid;
    else hi = mid;
  }
  const a = list[lo] as Sample;
  const b = list[hi] as Sample;
  const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return {
    s,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    heading: a.heading + (b.heading - a.heading) * t,
  };
}

/** Lengths of a route as path data, for the fog that forms along it. */
function pieces(r: { samples: Sample[] }, from: number, to: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const s0 = from + ((to - from) * i) / n;
    const s1 = from + ((to - from) * (i + 1)) / n;
    const pts = r.samples.filter((p) => p.s > s0 && p.s < s1);
    const all = [at(r, s0), ...pts, at(r, s1)];
    return {
      mid: r2((s0 + s1) / 2),
      d: `M${all.map((p) => `${r2(p.x)} ${r2(p.y)}`).join("L")}`,
    };
  });
}
const FOG_SEND = pieces(SEND, 4, LA - DROP - 6, 20);
const FOG_RETURN = pieces(RETURN, 8, LB - 20, 20);

type Metal = { base: string; light: string; dark: string };
// Metal, glass, paper and fog are pigments: the station is the same object
// on a light page and a dark one.
const METALS: Record<PneumaticTubeCapsule, Metal> = {
  brass: {
    base: "oklch(0.76 0.11 85)",
    light: "oklch(0.93 0.07 92)",
    dark: "oklch(0.5 0.09 70)",
  },
  copper: {
    base: "oklch(0.64 0.13 48)",
    light: "oklch(0.85 0.09 55)",
    dark: "oklch(0.42 0.1 40)",
  },
  steel: {
    base: "oklch(0.72 0.015 250)",
    light: "oklch(0.93 0.01 250)",
    dark: "oklch(0.47 0.02 250)",
  },
};

type Glass = {
  back: string;
  front: string;
  edge: string;
  fog: string;
  shine: number;
};
const GLASSES: Record<PneumaticTubeGlass, Glass> = {
  clear: {
    back: "oklch(0.88 0.03 220 / 0.1)",
    front: "oklch(0.97 0.01 220 / 0.06)",
    edge: "oklch(0.6 0.03 230 / 0.55)",
    fog: "oklch(0.96 0.01 230)",
    shine: 0.55,
  },
  frosted: {
    back: "oklch(0.95 0.005 250 / 0.22)",
    front: "oklch(0.97 0.005 250 / 0.52)",
    edge: "oklch(0.7 0.01 250 / 0.6)",
    fog: "oklch(0.99 0 0)",
    shine: 0.3,
  },
  amber: {
    back: "oklch(0.78 0.13 70 / 0.14)",
    front: "oklch(0.8 0.13 72 / 0.3)",
    edge: "oklch(0.6 0.12 60 / 0.65)",
    fog: "oklch(0.93 0.06 85)",
    shine: 0.45,
  },
};

const PAPER = "oklch(0.968 0.018 92)";
const INK = "oklch(0.28 0.02 260)";
const INK_SOFT = "oklch(0.48 0.02 260)";
const FELT = "oklch(0.3 0.03 30)";

const TONES: Record<PneumaticTubeTone, { word: string; mark: string }> = {
  info: { word: "Notice", mark: "oklch(0.6 0.13 250)" },
  success: { word: "Done", mark: "oklch(0.64 0.15 150)" },
  warn: { word: "Warning", mark: "oklch(0.78 0.15 80)" },
  danger: { word: "Alert", mark: "oklch(0.6 0.2 25)" },
};

/**
 * When the visitor last pressed something on the page. A delivery is the
 * host's doing (or follows a send-back); it is only heard when a press of the
 * visitor's came just before it, never when a timer pushes it alone.
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

function Glyph({ tone }: { tone: PneumaticTubeTone }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="size-3.5 shrink-0"
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

/**
 * A capsule, centred on (0, 0), 18 by 36: symmetric end to end, so it looks
 * the same whichever way round the tube turns it. The top cap is hinged at
 * its right-hand corner.
 */
function CapsuleArt({
  gid,
  tone,
  cap,
}: {
  gid: string;
  tone: PneumaticTubeTone;
  cap?: MotionValue<number>;
}) {
  return (
    <>
      <rect
        x={-9}
        y={-14}
        width={18}
        height={28}
        rx={1.5}
        fill={`url(#${gid}-body)`}
      />
      <rect
        x={-9.5}
        y={12}
        width={19}
        height={6}
        rx={3}
        fill={`url(#${gid}-cap)`}
      />
      <rect x={-9} y={-11.6} width={18} height={1.6} fill={FELT} />
      <rect x={-9} y={10} width={18} height={1.6} fill={FELT} />
      <rect x={-4} y={-5} width={8} height={10} rx={1} fill={PAPER} />
      <rect
        x={-2.5}
        y={-3}
        width={5}
        height={6}
        rx={0.6}
        fill={TONES[tone].mark}
      />
      <motion.rect
        x={-9.5}
        y={-18}
        width={19}
        height={6}
        rx={3}
        fill={`url(#${gid}-cap)`}
        style={{ rotate: cap, originX: 1, originY: 1 }}
      />
    </>
  );
}

type Phase = "up" | "open" | "read" | "close" | "down";
type Lane = { id: string; notice: PneumaticTubeNotice; phase: Phase } | null;

type LaneValues = {
  travel: MotionValue<number>;
  back: MotionValue<number>;
  upright: MotionValue<number>;
  squash: MotionValue<number>;
  cap: MotionValue<number>;
  unroll: MotionValue<number>;
  /** The sheet's revealed height in px; −1 is its natural height. */
  revealed: MotionValue<number>;
  seen: MotionValue<number>;
  sheet: MotionValue<number>;
};

function useLaneValues(reading: boolean): LaneValues {
  return {
    travel: useMotionValue(reading ? LA : 0),
    back: useMotionValue(0),
    upright: useMotionValue(reading ? 1 : 0),
    squash: useMotionValue(1),
    cap: useMotionValue(reading ? 1 : 0),
    unroll: useMotionValue(reading ? 1 : 0),
    revealed: useMotionValue(reading ? -1 : 0),
    seen: useMotionValue(reading ? 1 : 0),
    sheet: useMotionValue(1),
  };
}

type Fog = { head: MotionValue<number>; level: MotionValue<number> };

type Driver = {
  motionSafe: boolean;
  pace: number;
  audio: TactileSound;
  heard: (within: number) => boolean;
  fogSend: Fog;
  fogReturn: Fog;
  sheetNode: (id: string) => HTMLElement | undefined;
  setPhase: (id: string, phase: Phase) => void;
  clear: (id: string) => void;
  fadeFog: (fog: Fog) => void;
  lightFog: (fog: Fog) => void;
};

/**
 * Runs one lane's current phase. Each phase is one effect: a re-run
 * (StrictMode) carries on from wherever the values are, and a phase ends by
 * naming the next one.
 */
function useLaneDriver(
  lane: Lane,
  v: LaneValues,
  driver: React.RefObject<Driver | null>,
) {
  const id = lane?.id ?? null;
  const phase = lane?.phase ?? null;
  // Whether this capsule's trip is heard is decided once, when it sets off
  // (a visitor's press just before it), and holds for its landing and its
  // cap, however slow the trip.
  const heardTrip = React.useRef(false);

  // A lane given a new capsule starts it at the head of the queue.
  React.useLayoutEffect(() => {
    if (!id || phase !== "up") return;
    const d = driver.current;
    if (!d) return;
    v.travel.set(0);
    v.back.set(0);
    v.upright.set(0);
    v.squash.set(1);
    v.cap.set(0);
    v.unroll.set(0);
    v.revealed.set(0);
    v.sheet.set(1);
    v.seen.set(d.motionSafe ? 1 : 0);
    // Only a new capsule resets; its later phases run on what this set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  React.useEffect(() => {
    const d = driver.current;
    if (!id || !phase || !d) return;
    const running: AnimationPlaybackControls[] = [];
    const timers: number[] = [];
    const go = (c: AnimationPlaybackControls) => {
      running.push(c);
      return c;
    };
    const later = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const pace = clamp(d.pace, 0.5, 2);
    const loud = () => heardTrip.current;

    if (phase === "up") {
      if (!d.motionSafe) {
        v.travel.set(LA);
        v.upright.set(1);
        go(
          animate(v.seen, 1, {
            duration: durations.fast,
            onComplete: () => d.setPhase(id, "open"),
          }),
        );
      } else {
        const land = () => {
          if (loud()) d.audio.play("thud", { gain: 0.6, pitch: 1.1 });
          v.upright.set(1);
          v.squash.set(0.86);
          d.fadeFog(d.fogSend);
          d.setPhase(id, "open");
        };
        const drop = () =>
          go(
            animate(v.travel, LA, {
              duration: r2(0.16 / Math.sqrt(pace)),
              ease: easings.exit,
              onComplete: land,
            }),
          );
        const from = v.travel.get();
        if (from < 1) heardTrip.current = d.heard(HEARD_WITHIN);
        if (from < LA - DROP - 0.5) {
          if (from < 1 && loud()) {
            d.audio.play("whoosh", {
              pitch: r2(0.85 + 0.25 * pace),
              gain: 0.6,
            });
          }
          d.lightFog(d.fogSend);
          go(
            animate(v.travel, LA - DROP, {
              duration: r2((0.85 / pace) * (1 - from / (LA - DROP))),
              // Off the queue it gathers speed; at the mouth the air
              // cushions it.
              ease: [0.6, 0, 0.3, 1],
              onUpdate: (s) => d.fogSend.head.set(s),
              onComplete: drop,
            }),
          );
        } else if (from < LA) {
          drop();
        } else {
          land();
        }
      }
    } else if (phase === "open") {
      const unroll = () => {
        const node = d.sheetNode(id);
        const natural = node ? node.offsetHeight : 0;
        if (!d.motionSafe || natural <= 0) {
          v.unroll.set(1);
          v.revealed.set(-1);
          if (!d.motionSafe) v.sheet.set(0);
          go(
            animate(v.sheet, 1, {
              duration: durations.base,
              ease: easings.enter,
              onComplete: () => d.setPhase(id, "read"),
            }),
          );
          return;
        }
        go(
          animate(v.unroll, 1, {
            ...springs.glide,
            onUpdate: (u) =>
              v.revealed.set(Math.max(0, Math.round(u * natural))),
            onComplete: () => {
              v.revealed.set(-1);
              d.setPhase(id, "read");
            },
          }),
        );
      };
      if (d.motionSafe && v.squash.get() < 0.999) {
        go(animate(v.squash, 1, springs.recoil));
      }
      if (v.cap.get() > 0.99) {
        unroll();
      } else if (!d.motionSafe) {
        v.cap.set(1);
        unroll();
      } else {
        later(90, () => {
          if (loud()) d.audio.play("pop", { gain: 0.55 });
          go(animate(v.cap, 1, springs.snap));
          later(110, unroll);
        });
      }
    } else if (phase === "close") {
      const shut = () => {
        if (!d.motionSafe) {
          v.cap.set(0);
          d.setPhase(id, "down");
          return;
        }
        go(
          animate(v.cap, 0, {
            ...springs.flick,
            onComplete: () => d.setPhase(id, "down"),
          }),
        );
      };
      const rollUp = () => {
        if (!d.motionSafe) {
          go(
            animate(v.sheet, 0, {
              duration: durations.fast,
              ease: easings.exit,
              onComplete: () => {
                v.unroll.set(0);
                v.revealed.set(0);
                shut();
              },
            }),
          );
          return;
        }
        const node = d.sheetNode(id);
        const natural = node ? node.offsetHeight : 0;
        if (v.unroll.get() < 0.001 || natural <= 0) {
          v.unroll.set(0);
          v.revealed.set(0);
          shut();
          return;
        }
        go(
          animate(v.unroll, 0, {
            ...springs.glide,
            onUpdate: (u) =>
              v.revealed.set(Math.max(0, Math.round(u * natural))),
            onComplete: () => {
              v.revealed.set(0);
              shut();
            },
          }),
        );
      };
      if (v.travel.get() < LA - 0.01) {
        // Taken back while still in the air: it arrives first.
        go(
          animate(v.travel, LA, {
            duration: durations.base,
            ease: easings.exit,
            onComplete: () => {
              v.upright.set(1);
              d.fadeFog(d.fogSend);
              rollUp();
            },
          }),
        );
      } else {
        rollUp();
      }
    } else if (phase === "down") {
      if (!d.motionSafe) {
        go(
          animate(v.seen, 0, {
            duration: durations.fast,
            ease: easings.exit,
            onComplete: () => d.clear(id),
          }),
        );
      } else {
        const from = v.back.get();
        if (from < 1) heardTrip.current = d.heard(HEARD_WITHIN);
        if (from < 1 && loud()) {
          d.audio.play("whoosh", { pitch: r2(0.6 + 0.15 * pace), gain: 0.45 });
        }
        v.upright.set(0);
        d.lightFog(d.fogReturn);
        go(
          animate(v.back, LB, {
            duration: r2((0.75 / pace) * (1 - from / LB)),
            // Exits never spring: it accelerates away down the tube.
            ease: easings.exit,
            onUpdate: (s) => d.fogReturn.head.set(s),
            onComplete: () => {
              d.fadeFog(d.fogReturn);
              d.clear(id);
            },
          }),
        );
      }
    }
    return () => {
      for (const c of running) c.stop();
      for (const t of timers) window.clearTimeout(t);
    };
    // One run per phase of each capsule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, phase]);
}

function LaneCapsule({
  v,
  gid,
  tone,
}: {
  v: LaneValues;
  gid: string;
  tone: PneumaticTubeTone;
}) {
  const place = useTransform(
    [v.travel, v.back, v.upright] as MotionValue<number>[],
    ([t = 0, b = 0, u = 0]: number[]) => {
      const p = b > 0.01 ? at(RETURN, b) : at(SEND, t);
      return { x: r2(p.x), y: r2(p.y), turn: u > 0.5 ? 0 : r2(p.heading) };
    },
  );
  const x = useTransform(place, (p) => p.x);
  const y = useTransform(place, (p) => p.y);
  const rotate = useTransform(place, (p) => p.turn);
  const capTurn = useTransform(v.cap, (c) => r2(c * 118));
  return (
    <motion.g style={{ x, y, opacity: v.seen }}>
      <motion.g style={{ rotate, originX: 0.5, originY: 0.5 }}>
        <motion.g style={{ scaleY: v.squash, originX: 0.5, originY: 1 }}>
          <CapsuleArt gid={gid} tone={tone} cap={capTurn} />
        </motion.g>
      </motion.g>
    </motion.g>
  );
}

function FogPiece({
  d,
  mid,
  fog,
  colour,
}: {
  d: string;
  mid: number;
  fog: Fog;
  colour: string;
}) {
  const opacity = useTransform(
    [fog.head, fog.level] as MotionValue<number>[],
    ([h = 0, l = 0]: number[]) =>
      h > mid && l > 0.005 ? r2(0.7 * l * Math.exp(-(h - mid) / 110)) : 0,
  );
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={colour}
      strokeWidth={21}
      strokeLinecap="butt"
      style={{ opacity }}
    />
  );
}

const GAUGE_TICKS = (() => {
  let d = "";
  for (let i = 0; i <= 8; i += 1) {
    const a = ((SWEEP.from + (SWEEP.span * i) / 8) * Math.PI) / 180;
    const inner = i % 2 ? 17.5 : 16;
    d += `M${r3(GAUGE.x + Math.sin(a) * inner)} ${r3(GAUGE.y - Math.cos(a) * inner)}L${r3(GAUGE.x + Math.sin(a) * 20.5)} ${r3(GAUGE.y - Math.cos(a) * 20.5)}`;
  }
  return d;
})();
const GAUGE_RED = (() => {
  const a0 = ((SWEEP.from + SWEEP.span * 0.82) * Math.PI) / 180;
  const a1 = ((SWEEP.from + SWEEP.span) * Math.PI) / 180;
  const r = 19;
  return `M${r3(GAUGE.x + Math.sin(a0) * r)} ${r3(GAUGE.y - Math.cos(a0) * r)}A${r} ${r} 0 0 1 ${r3(GAUGE.x + Math.sin(a1) * r)} ${r3(GAUGE.y - Math.cos(a1) * r)}`;
})();

/**
 * The line's air pressure: the needle swings up as a capsule is blown along a
 * tube and sinks back as the fog clears. It moves only when a capsule does.
 */
function Gauge({ pressure }: { pressure: MotionValue<number> }) {
  const turn = useTransform(pressure, (p) =>
    r2(SWEEP.from + clamp(p, 0, 1.12) * SWEEP.span),
  );
  const { x, y, r } = GAUGE;
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={r}
        className="fill-surface-2 stroke-ink-3/60"
        strokeWidth={1.5}
      />
      <path d={GAUGE_TICKS} className="stroke-ink-3/70" strokeWidth={1} />
      <path
        d={GAUGE_RED}
        fill="none"
        stroke="oklch(0.6 0.2 25)"
        strokeWidth={2.4}
      />
      <text
        x={x}
        y={y + 13}
        textAnchor="middle"
        fontSize={5.5}
        letterSpacing={0.6}
        className="fill-ink-3 font-mono"
      >
        AIR
      </text>
      <motion.g style={{ rotate: turn, originX: 0.5, originY: 0.5 }}>
        {/* Invisible: it makes the group's box the dial, so it turns about the hub. */}
        <circle cx={x} cy={y} r={20} fill="transparent" />
        <path
          d={`M${x} ${y + 4}L${x} ${y - 17}`}
          className="stroke-ink-2"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </motion.g>
      <circle cx={x} cy={y} r={2.6} className="fill-ink-2" />
    </g>
  );
}

function LaneSheet({
  lane,
  notice,
  v,
  focusable,
  disabled,
  hintId,
  setNode,
  onFocus,
  onSend,
  onKeyMove,
}: {
  lane: NonNullable<Lane>;
  notice: PneumaticTubeNotice;
  v: LaneValues;
  focusable: boolean;
  disabled: boolean;
  hintId: string;
  setNode: (id: string, node: HTMLElement | null) => void;
  onFocus: (id: string) => void;
  onSend: (id: string) => void;
  onKeyMove: (id: string, key: string) => void;
}) {
  const uid = React.useId();
  const bodyId = `${uid}-body`;
  const tone = notice.tone ?? "info";
  const height = useTransform(v.revealed, (h) => (h < 0 ? "auto" : `${h}px`));
  const rollH = useTransform(v.unroll, (u) => r2(12 - 6 * clamp(u, 0, 1)));
  const rollBottom = useTransform(rollH, (h) => r2(-h / 2));
  const rollOpacity = useTransform(
    [v.cap, v.sheet] as MotionValue<number>[],
    ([c = 0, s = 1]: number[]) => r2(clamp(c * 1.6, 0, 1) * s),
  );
  const serial = String((hash(notice.id) % 9000) + 1000);
  const live = lane.phase === "open" || lane.phase === "read";
  return (
    <motion.div
      className="absolute"
      style={{
        left: pctX(58),
        top: pctY(SHEET_Y),
        width: pctX(216),
        opacity: v.sheet,
        filter:
          "drop-shadow(0 0 0.5px oklch(0.25 0.02 260 / 0.45)) drop-shadow(0 2px 3px oklch(0.2 0.02 260 / 0.22))",
      }}
    >
      <motion.div className="relative overflow-clip" style={{ height }}>
        <button
          ref={(node) => setNode(lane.id, node)}
          type="button"
          tabIndex={focusable && live ? 0 : -1}
          aria-label={`Send back: ${notice.title}`}
          aria-describedby={notice.body ? `${bodyId} ${hintId}` : hintId}
          aria-disabled={disabled || !live || undefined}
          onFocus={() => onFocus(lane.id)}
          onClick={() => {
            if (!disabled && live) onSend(lane.id);
          }}
          onKeyDown={(event) => {
            const key = event.key;
            if (key === "Delete" || key === "Backspace") {
              event.preventDefault();
              if (!event.repeat && !disabled && live) onSend(lane.id);
              return;
            }
            if (
              key === "ArrowUp" ||
              key === "ArrowDown" ||
              key === "Home" ||
              key === "End"
            ) {
              event.preventDefault();
              onKeyMove(lane.id, key);
            }
          }}
          className={cn(
            "group/pneumatic-tube relative block w-full px-3.5 pt-3 pb-3 text-left outline-none",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
          style={{ background: PAPER, color: INK }}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1"
            style={{ background: TONES[tone].mark }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-ink-3/[0.06] opacity-0 transition-opacity group-hover/pneumatic-tube:opacity-100"
          />
          <span
            aria-hidden
            className="flex items-center justify-between gap-2 font-mono text-[9px] leading-3 tracking-[0.1em] uppercase"
            style={{ color: INK_SOFT }}
          >
            <span className="truncate">№ {serial}</span>
            <span className="shrink-0">{TONES[tone].word}</span>
          </span>
          <span className="mt-2 flex items-start gap-1.5 text-[13px] leading-5 font-semibold">
            <span className="flex h-5 shrink-0 items-center">
              <Glyph tone={tone} />
            </span>
            <span className="line-clamp-2">{notice.title}</span>
          </span>
          {notice.body ? (
            <span
              id={bodyId}
              className="mt-1 line-clamp-5 block text-xs leading-[18px]"
              style={{ color: INK_SOFT }}
            >
              {notice.body}
            </span>
          ) : null}
          <span
            aria-hidden
            className="mt-2.5 flex items-center gap-1 border-t border-dashed pt-2 font-mono text-[9px] leading-3 tracking-[0.1em] uppercase"
            style={{ color: INK_SOFT, borderColor: "oklch(0.8 0.02 90)" }}
          >
            <svg
              viewBox="0 0 8 8"
              className="size-2 transition-transform group-hover/pneumatic-tube:-translate-y-px"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
              strokeLinecap="round"
            >
              <path d="M4 7V1.8M1.8 3.8 4 1.6l2.2 2.2" />
            </svg>
            Tap to send back
          </span>
        </button>
      </motion.div>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-x-1 rounded-full"
        style={{
          height: rollH,
          bottom: rollBottom,
          opacity: rollOpacity,
          background: `linear-gradient(to bottom, oklch(0.99 0.01 92), ${PAPER} 40%, oklch(0.82 0.03 85))`,
          boxShadow: "0 1px 1.5px oklch(0.2 0.02 260 / 0.3)",
        }}
      />
    </motion.div>
  );
}

function QueueItem({
  notice,
  index,
  total,
  entry,
  gid,
  focusable,
  motionSafe,
  disabled,
  isAloft,
  setNode,
  onFocus,
  onDrop,
  onKeyMove,
}: {
  notice: PneumaticTubeNotice;
  index: number;
  total: number;
  entry: "still" | "join";
  gid: string;
  focusable: boolean;
  motionSafe: boolean;
  disabled: boolean;
  isAloft: (id: string) => boolean;
  setNode: (id: string, node: HTMLElement | null) => void;
  onFocus: (id: string) => void;
  onDrop: (id: string) => void;
  onKeyMove: (id: string, key: string) => void;
}) {
  const [isPresent, safeToRemove] = usePresence();
  const target = QUEUE_Y + QUEUE_STEP * index;
  const y = useMotionValue(entry === "join" && motionSafe ? H + 40 : target);
  const fade = useMotionValue(entry === "join" && !motionSafe ? 0 : 1);
  const nudge = useMotionValue(0);
  const top = useTransform(y, (v) => pctY(v - 20));
  const tone = notice.tone ?? "info";
  const latest = React.useRef({ motionSafe, isAloft });
  React.useEffect(() => {
    latest.current = { motionSafe, isAloft };
  });

  // It rises to its place in the queue, and moves up as the queue does.
  React.useEffect(() => {
    if (!isPresent) return;
    const runs: AnimationPlaybackControls[] = [];
    // Moving up a place waits a beat, so the head is clear of the queue
    // before the rest close up behind it.
    const moving = y.get() > target + 1 && y.get() < H;
    if (latest.current.motionSafe) {
      runs.push(
        animate(y, target, { ...springs.glide, delay: moving ? 0.22 : 0 }),
      );
    } else y.set(target);
    if (fade.get() < 1) {
      runs.push(
        animate(fade, 1, { duration: durations.base, ease: easings.enter }),
      );
    }
    return () => {
      for (const c of runs) c.stop();
    };
  }, [target, isPresent, y, fade]);

  // Leaving: sent up the tube (the lane takes over where it stands), or
  // dropped out of the bottom unread.
  React.useEffect(() => {
    if (isPresent) return;
    if (latest.current.isAloft(notice.id)) {
      safeToRemove?.();
      return;
    }
    const safe = latest.current.motionSafe;
    const runs = [
      animate(fade, 0, exitFor(durations.base)),
      safe ? animate(y, y.get() + 16, exitFor(durations.base)) : null,
    ];
    const timer = window.setTimeout(
      () => safeToRemove?.(),
      durations.base * 600 + 20,
    );
    return () => {
      for (const c of runs) c?.stop();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  const jiggle = () => {
    if (!latest.current.motionSafe) return;
    animate(nudge, [0, -3, 3, -2, 0], { duration: 0.32, ease: easings.move });
  };

  const word = TONES[tone].word;
  return (
    <motion.button
      ref={(node: HTMLButtonElement | null) => setNode(notice.id, node)}
      type="button"
      tabIndex={focusable && isPresent ? 0 : -1}
      aria-label={`Waiting, ${index + 1} of ${total}: ${word}: ${notice.title}`}
      aria-keyshortcuts="Delete"
      aria-hidden={!isPresent || undefined}
      aria-disabled={disabled || undefined}
      onFocus={() => onFocus(notice.id)}
      onClick={jiggle}
      onKeyDown={(event) => {
        if (!isPresent) return;
        const key = event.key;
        if (key === "Delete" || key === "Backspace") {
          event.preventDefault();
          if (!event.repeat && !disabled) onDrop(notice.id);
          return;
        }
        if (
          key === "ArrowUp" ||
          key === "ArrowDown" ||
          key === "Home" ||
          key === "End"
        ) {
          event.preventDefault();
          onKeyMove(notice.id, key);
        }
      }}
      className={cn(
        "absolute rounded-2 transition-colors outline-none hover:bg-ink-3/10 focus-visible:z-30",
        "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid",
        "cursor-pointer",
      )}
      style={{
        left: pctX(QUEUE_X - 16),
        top,
        width: pctX(32),
        height: pctY(40),
        x: nudge,
        opacity: fade,
      }}
    >
      <svg aria-hidden viewBox="-16 -20 32 40" className="block size-full">
        <CapsuleArt gid={gid} tone={tone} />
      </svg>
    </motion.button>
  );
}

type Book = {
  key: string;
  ids: string[];
  titles: Record<string, string>;
  joined: Record<string, "still" | "join">;
  said: { n: number; polite: string; assertive: string };
};

const spoken = (n: PneumaticTubeNotice) =>
  `${TONES[n.tone ?? "info"].word}: ${stop(n.title)}${n.body ? ` ${stop(n.body)}` : ""}`;

/**
 * Notices by tube mail. Each waits as a capsule standing in the bottom of a
 * glass tube; when the cup is free the next one shoots up — gathering speed
 * off the queue on an accelerating tween, turning with the tube round both
 * bends while the glass fogs behind it — drops out of the mouth into the cup,
 * squashes on landing on the recoil spring, pops its cap on snap, and the
 * note unrolls down from the cup on the glide spring.
 *
 * Tap the note to send it back: it rolls up (glide), the cap shuts (flick)
 * and the capsule drops through the cup's floor and away down the return tube
 * on the exit ease, fogging that glass, as the next one launches. Waiting
 * capsules can be dropped out of the bottom unread with Delete.
 *
 * The note and the waiting capsules are buttons in one tab stop (Up and Down
 * move); every arrival is announced once. Under reduced motion capsules and
 * notes fade in and out of the cup; nothing travels, squashes or fogs.
 */
export function PneumaticTube({
  notices,
  onDismiss,
  label = "Tube mail",
  speed = 1,
  glass = "clear",
  capsule = "brass",
  sound = false,
  disabled = false,
  className,
}: PneumaticTubeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const heard = useVisitorPress();
  const hintId = React.useId();
  const gid = `tube-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const pace = clamp(Number.isFinite(speed) ? speed : 1, 0.5, 2);
  const tint = GLASSES[glass] ?? GLASSES.clear;
  const metal = METALS[capsule] ?? METALS.brass;

  const list = React.useMemo(() => {
    const seen = new Set<string>();
    return notices.filter((n) => !seen.has(n.id) && (seen.add(n.id), true));
  }, [notices]);
  const ids = list.map((n) => n.id);
  const byId = new Map(list.map((n) => [n.id, n]));

  const [lanes, setLanes] = React.useState<[Lane, Lane]>(() => [
    list[0] ? { id: list[0].id, notice: list[0], phase: "read" } : null,
    null,
  ]);
  const laneA = useLaneValues(Boolean(list[0]) && lanes[0]?.phase === "read");
  const laneB = useLaneValues(false);
  const values: [LaneValues, LaneValues] = [laneA, laneB];

  // A capsule whose notice the host took away is rolled up and sent back.
  const gone = lanes.some(
    (l) =>
      l !== null &&
      !byId.has(l.id) &&
      (l.phase === "up" || l.phase === "open" || l.phase === "read"),
  );
  if (gone) {
    setLanes(
      (ls) =>
        ls.map((l) =>
          l &&
          !byId.has(l.id) &&
          (l.phase === "up" || l.phase === "open" || l.phase === "read")
            ? { ...l, phase: "close" }
            : l,
        ) as [Lane, Lane],
    );
  }

  const aloft = new Set(lanes.flatMap((l) => (l ? [l.id] : [])));
  const queue = list.filter((n) => !aloft.has(n.id));
  const busy = lanes.some((l) => l !== null && l.phase !== "down");
  const free = lanes.findIndex((l) => l === null);
  const next = queue[0];
  // The cup is free: the head of the queue goes up.
  if (!gone && !busy && free !== -1 && next) {
    setLanes((ls) => {
      const copy = [...ls] as [Lane, Lane];
      if (copy.some((l) => l?.id === next.id)) return ls;
      copy[free] = { id: next.id, notice: next, phase: "up" };
      return copy;
    });
  }

  const shownQueue = queue.slice(0, QUEUE_SHOWN);
  const waiting = queue.length;
  const key = ids.join("|");
  const [book, setBook] = React.useState<Book>(() => ({
    key,
    ids,
    titles: Object.fromEntries(list.map((n) => [n.id, n.title])),
    joined: Object.fromEntries(ids.map((id) => [id, "still" as const])),
    said: { n: 0, polite: "", assertive: "" },
  }));
  if (book.key !== key) {
    const known = new Set(book.ids);
    const now = new Set(ids);
    const arrived = list.filter((n) => !known.has(n.id));
    const left = book.ids.filter((id) => !now.has(id));
    const newest = arrived[arrived.length - 1];
    const polite: string[] = [];
    let assertive = "";
    if (left.length > 0) {
      polite.push(
        `Sent back: ${stop(left.map((id) => book.titles[id] ?? "a note").join(", "))}`,
      );
    }
    if (newest) {
      const text = `Tube mail. ${spoken(newest)}`;
      if (newest.tone === "danger") assertive = text;
      else polite.push(text);
    }
    const joined: Record<string, "still" | "join"> = {};
    for (const id of ids) joined[id] = book.joined[id] ?? "join";
    setBook({
      key,
      ids,
      titles: Object.fromEntries(list.map((n) => [n.id, n.title])),
      joined,
      said:
        polite.length > 0 || assertive
          ? { n: book.said.n + 1, polite: polite.join(" "), assertive }
          : book.said,
    });
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<string, HTMLElement>());
  const aloftRef = React.useRef(aloft);
  // Before any passive effect: a leaving queue capsule asks this in its own
  // effect, and children's effects run before their parent's.
  React.useLayoutEffect(() => {
    aloftRef.current = aloft;
  });
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const refocus = React.useRef(false);

  const fogSend: Fog = {
    head: useMotionValue(0),
    level: useMotionValue(0),
  };
  const fogReturn: Fog = {
    head: useMotionValue(0),
    level: useMotionValue(0),
  };
  // The needle follows the air on the snap spring: one overshoot as a
  // capsule is blown off, then down with the fog.
  const air = useTransform(
    [fogSend.level, fogReturn.level] as MotionValue<number>[],
    ([a = 0, b = 0]: number[]) => Math.min(1.12, a + b * 0.55),
  );
  const needle = useSpring(air, {
    stiffness: springs.snap.stiffness,
    damping: springs.snap.damping,
    mass: springs.snap.mass,
  });
  const fogRuns = React.useRef(
    new Map<MotionValue<number>, AnimationPlaybackControls>(),
  );
  React.useEffect(() => {
    const runs = fogRuns.current;
    return () => {
      for (const c of runs.values()) c.stop();
      runs.clear();
    };
  }, []);

  const setPhase = React.useCallback((id: string, phase: Phase) => {
    setLanes(
      (ls) =>
        ls.map((l) => (l && l.id === id ? { ...l, phase } : l)) as [Lane, Lane],
    );
  }, []);
  const clearLane = React.useCallback((id: string) => {
    setLanes(
      (ls) => ls.map((l) => (l && l.id === id ? null : l)) as [Lane, Lane],
    );
  }, []);

  const driver = React.useRef<Driver | null>(null);
  // Refreshed before any effect runs, so the lane drivers below always read
  // this render's values.
  React.useLayoutEffect(() => {
    const runs = fogRuns.current;
    driver.current = {
      motionSafe,
      pace,
      audio,
      heard,
      fogSend,
      fogReturn,
      sheetNode: (id) => nodes.current.get(id),
      setPhase,
      clear: clearLane,
      fadeFog: (fog) => {
        runs.get(fog.level)?.stop();
        runs.set(
          fog.level,
          animate(fog.level, 0, { duration: 1.4, ease: easings.enter }),
        );
      },
      lightFog: (fog) => {
        runs.get(fog.level)?.stop();
        runs.delete(fog.level);
        fog.level.set(1);
      },
    };
  });
  useLaneDriver(lanes[0], laneA, driver);
  useLaneDriver(lanes[1], laneB, driver);

  const reading =
    lanes.find((l) => l && (l.phase === "open" || l.phase === "read")) ?? null;
  const order = [
    ...(reading ? [reading.id] : []),
    ...shownQueue.map((n) => n.id),
  ];
  const tabStop =
    focusId && order.includes(focusId) ? focusId : (order[0] ?? null);

  // Focus that waited on the station moves onto the next note once it has
  // landed (its button arrives with the lane's "open") — if it is still
  // waiting there.
  const readingId = reading?.id ?? null;
  React.useEffect(() => {
    if (!refocus.current || !readingId) return;
    const root = rootRef.current;
    if (!root || document.activeElement !== root) {
      refocus.current = false;
      return;
    }
    const node = nodes.current.get(readingId);
    if (!node) return;
    refocus.current = false;
    setFocusId(readingId);
    node.focus({ preventScroll: true });
  }, [readingId]);

  const focusAway = (id: string) => {
    const node = nodes.current.get(id);
    if (!node || !node.contains(document.activeElement)) return;
    const rest = order.filter((o) => o !== id);
    const i = order.indexOf(id);
    const neighbour = rest[Math.max(0, i)] ?? rest[rest.length - 1];
    if (neighbour) {
      setFocusId(neighbour);
      nodes.current.get(neighbour)?.focus({ preventScroll: true });
    } else {
      refocus.current = true;
      rootRef.current?.focus({ preventScroll: true });
    }
  };

  const sendBack = (id: string) => {
    const lane = lanes.find((l) => l?.id === id);
    if (!lane || (lane.phase !== "open" && lane.phase !== "read")) return;
    const node = nodes.current.get(id);
    if (node && node.contains(document.activeElement)) {
      refocus.current = true;
      rootRef.current?.focus({ preventScroll: true });
    }
    setPhase(id, "close");
    onDismiss?.(id);
  };

  const dropQueued = (id: string) => {
    focusAway(id);
    onDismiss?.(id);
  };

  const onKeyMove = (id: string, keyName: string) => {
    const i = order.indexOf(id);
    if (i < 0) return;
    const to =
      keyName === "ArrowUp"
        ? i - 1
        : keyName === "ArrowDown"
          ? i + 1
          : keyName === "Home"
            ? 0
            : order.length - 1;
    const target = order[clamp(to, 0, order.length - 1)];
    if (!target) return;
    setFocusId(target);
    nodes.current.get(target)?.focus({ preventScroll: true });
  };

  const setNode = (id: string, node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };

  const glassMask = `${gid}-glass`;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={label}
      tabIndex={-1}
      className={cn(
        "relative isolate aspect-[8/11] w-full max-w-80 overflow-clip rounded-3 outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* Behind: the glass's far wall, the fog, capsules in flight, the cup. */}
      <svg
        aria-hidden
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 size-full"
      >
        <defs>
          <linearGradient id={`${gid}-body`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={metal.dark} />
            <stop offset="32%" stopColor={metal.base} />
            <stop offset="50%" stopColor={metal.light} />
            <stop offset="68%" stopColor={metal.base} />
            <stop offset="100%" stopColor={metal.dark} />
          </linearGradient>
          <linearGradient id={`${gid}-cap`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={metal.dark} />
            <stop offset="50%" stopColor={metal.base} />
            <stop offset="100%" stopColor={metal.dark} />
          </linearGradient>
          <mask
            id={glassMask}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={W}
            height={H}
          >
            <g fill="none">
              <path d={TUBE_SEND} stroke="white" strokeWidth={30} />
              <path d={TUBE_RETURN} stroke="white" strokeWidth={30} />
              <path d={TUBE_SEND} stroke="black" strokeWidth={27} />
              <path d={TUBE_RETURN} stroke="black" strokeWidth={27} />
            </g>
          </mask>
        </defs>
        <g fill="none" stroke={tint.back} strokeWidth={28}>
          <path d={TUBE_SEND} />
          <path d={TUBE_RETURN} />
        </g>
        {FOG_SEND.map((p) => (
          <FogPiece
            key={`s${p.mid}`}
            d={p.d}
            mid={p.mid}
            fog={fogSend}
            colour={tint.fog}
          />
        ))}
        {FOG_RETURN.map((p) => (
          <FogPiece
            key={`r${p.mid}`}
            d={p.d}
            mid={p.mid}
            fog={fogReturn}
            colour={tint.fog}
          />
        ))}
        <path
          d="M142 100L142 128Q142 136 150 136L182 136Q190 136 190 128L190 100Z"
          className="fill-ink-3/35"
        />
        <Gauge pressure={motionSafe ? needle : air} />
        {lanes.map((l, k) =>
          l ? (
            <LaneCapsule
              key={`${k}-${l.id}`}
              v={values[k] ?? laneA}
              gid={gid}
              tone={(byId.get(l.id) ?? l.notice).tone ?? "info"}
            />
          ) : null,
        )}
      </svg>

      {/* The queue: real buttons, drawn under the glass's near wall. */}
      <AnimatePresence initial={false}>
        {shownQueue.map((n, i) => (
          <QueueItem
            key={n.id}
            notice={n}
            index={i}
            total={waiting}
            entry={book.joined[n.id] ?? "join"}
            gid={gid}
            focusable={tabStop === n.id}
            motionSafe={motionSafe}
            disabled={disabled}
            isAloft={(id) => aloftRef.current.has(id)}
            setNode={setNode}
            onFocus={setFocusId}
            onDrop={dropQueued}
            onKeyMove={onKeyMove}
          />
        ))}
      </AnimatePresence>

      {/* In front: the near wall of the glass, its shine, the collars, the cup. */}
      <svg
        aria-hidden
        viewBox={`0 0 ${W} ${H}`}
        className="pointer-events-none absolute inset-0 z-10 size-full"
      >
        <g fill="none" stroke={tint.front} strokeWidth={27}>
          <path d={TUBE_SEND} />
          <path d={TUBE_RETURN} />
        </g>
        <g
          fill="none"
          stroke={tint.edge}
          strokeWidth={30}
          mask={`url(#${glassMask})`}
        >
          <path d={TUBE_SEND} />
          <path d={TUBE_RETURN} />
        </g>
        <g
          fill="none"
          stroke="white"
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={tint.shine}
          transform="translate(-7 -3)"
        >
          <path d={TUBE_SEND} />
          <path d={TUBE_RETURN} />
        </g>
        <g className="fill-ink-3/45">
          <rect x={16} y={296} width={36} height={6} rx={2} />
          <rect x={150} y={86} width={32} height={7} rx={2} />
          <rect x={274} y={214} width={36} height={6} rx={2} />
        </g>
        <path
          d="M138 108L194 108L194 128Q194 140 182 140L150 140Q138 140 138 128Z"
          className="fill-surface-2 stroke-ink-3/60"
          strokeWidth={1}
        />
        <path
          d="M146 113L186 113"
          className="stroke-ink-3/25"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <rect
          x={135}
          y={104}
          width={62}
          height={5}
          rx={2.5}
          className="fill-ink-3/55"
        />
      </svg>

      {/* The note, over everything, hanging from the cup. */}
      <div className="pointer-events-none absolute inset-0 z-20 [&>*]:pointer-events-auto">
        {lanes.map((l, k) =>
          l &&
          (l.phase === "open" || l.phase === "read" || l.phase === "close") ? (
            <LaneSheet
              key={`${k}-${l.id}`}
              lane={l}
              notice={byId.get(l.id) ?? l.notice}
              v={values[k] ?? laneA}
              focusable={tabStop === l.id}
              disabled={disabled}
              hintId={hintId}
              setNode={setNode}
              onFocus={setFocusId}
              onSend={sendBack}
              onKeyMove={onKeyMove}
            />
          ) : null,
        )}
      </div>

      <p className="absolute top-[3.5%] right-[3.5%] z-20 flex flex-col items-end gap-0.5 font-mono text-[9px] leading-3 tracking-[0.1em] uppercase">
        <span className="text-ink-3">{label}</span>
        <span className="text-ink-2 tabular-nums">{waiting} waiting</span>
      </p>
      {waiting > QUEUE_SHOWN ? (
        <p
          className="absolute z-20 font-mono text-[9px] leading-3 tracking-[0.1em] text-ink-3 uppercase tabular-nums"
          style={{ left: pctX(58), top: pctY(410) }}
        >
          +{waiting - QUEUE_SHOWN} below
        </p>
      ) : null}

      <p id={hintId} className="sr-only">
        Press the note to roll it up and send it back. Delete removes a waiting
        capsule unread.
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
