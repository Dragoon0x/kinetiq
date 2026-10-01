"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PunchCardShape = "round" | "star" | "heart";

export type PunchCardProps = {
  /** The café or shop, printed on the card's band. */
  brand: string;
  /** What a full card is worth. @default "One free drink" */
  reward?: string;
  /** The holder's name, printed at the foot of the card. */
  member?: string;
  /** The card's number, printed on the band. */
  number?: string;
  /** The redeem code on the back. @default a code made from the brand, the member and the cycle */
  code?: string;
  /** The card's accessible name. @default "{brand} loyalty card" */
  label?: string;
  /** Controlled: how many spots are punched, 0 to `holes`. */
  value?: number;
  /** Initial punches when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the press that punched a spot, or from Redeem (with 0). */
  onValueChange?: (value: number) => void;
  /** Fires when the reward is redeemed. */
  onRedeem?: () => void;
  /** How many punches earn the reward, 6 to 12. @default 9 */
  holes?: number;
  /** The printed spot, the hole and the chad. @default "round" */
  shape?: PunchCardShape;
  /** A paper chad pops out of each hole and falls away. @default true */
  chad?: boolean;
  /** Play the punch, the reward and Redeem. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The card's own drawing space: 7 by 4, like the card. */
const W = 350;
const H = 200;
const BAND = 40;
const ROWS = [70, 118] as const;
const GRID_X0 = 20;
const GRID_X1 = 330;

// The card is printed stock, the same in either theme: fixed pigments.
const PAPER = "oklch(0.968 0.014 84)";
const BAND_INK = "oklch(0.38 0.055 48)";
const ON_BAND = "oklch(0.95 0.02 82)";
const INK = "oklch(0.34 0.045 48)";
const FAINT = "oklch(0.5 0.035 50)";
const SPOT_LINE = "oklch(0.5 0.05 50 / 0.55)";
const CUT_EDGE = "oklch(0.84 0.025 78)";
const DIMPLE = "oklch(0.3 0.04 50)";
const REWARD = "oklch(0.8 0.14 72)";
const CARD_SHADOW =
  "drop-shadow(0 1.5px 1.5px oklch(0.2 0.02 260 / 0.28)) drop-shadow(0 4px 8px oklch(0.2 0.02 260 / 0.12))";

const NUMBER_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

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

/** A redeem code without the letters that read as digits. */
function codeOf(seed: number): string {
  const rand = lcg(seed);
  const set = "ABCDEFGHJKLMNPQRTUVWXY346789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += set[Math.floor(rand() * set.length)] ?? "A";
    if (i === 1) out += "-";
  }
  return out;
}

/** The spot's outline, centred on the origin, `r` its radius. */
function shapePath(shape: PunchCardShape, r: number): string {
  if (shape === "star") {
    const outer = r * 1.12;
    const inner = outer * 0.48;
    const pts: string[] = [];
    for (let k = 0; k < 10; k += 1) {
      const a = ((-90 + k * 36) * Math.PI) / 180;
      const rr = k % 2 ? inner : outer;
      pts.push(
        `${Number((Math.cos(a) * rr).toFixed(3))} ${Number((Math.sin(a) * rr + r * 0.08).toFixed(3))}`,
      );
    }
    return `M${pts.join("L")}Z`;
  }
  if (shape === "heart") {
    const p = (x: number, y: number) => `${r2(x * r)} ${r2(y * r)}`;
    return [
      `M${p(0, 0.92)}`,
      `C${p(-0.62, 0.48)} ${p(-1.08, 0.1)} ${p(-1.04, -0.36)}`,
      `C${p(-1, -0.82)} ${p(-0.42, -1)} ${p(0, -0.56)}`,
      `C${p(0.42, -1)} ${p(1, -0.82)} ${p(1.04, -0.36)}`,
      `C${p(1.08, 0.1)} ${p(0.62, 0.48)} ${p(0, 0.92)}Z`,
    ].join("");
  }
  return `M${r2(-r)} 0A${r2(r)} ${r2(r)} 0 1 0 ${r2(r)} 0A${r2(r)} ${r2(r)} 0 1 0 ${r2(-r)} 0Z`;
}

type Spot = { cx: number; cy: number };

/**
 * Spots in two rows across the card, the reward last in the second row's
 * final column; a short second row leaves a gap before it.
 */
function layout(holes: number) {
  const cols = Math.ceil((holes + 1) / 2);
  const pitch = (GRID_X1 - GRID_X0) / cols;
  const r = r2(Math.min(pitch * 0.36, 17));
  const at = (row: 0 | 1, col: number): Spot => ({
    cx: r2(GRID_X0 + pitch * (col + 0.5)),
    cy: ROWS[row],
  });
  const spots: Spot[] = [];
  for (let i = 0; i < holes; i += 1) {
    spots.push(i < cols ? at(0, i) : at(1, i - cols));
  }
  return { spots, reward: at(1, cols - 1), r };
}

function CupGlyph({ r }: { r: number }) {
  const k = r / 17;
  const p = (x: number, y: number) => `${r2(x * k)} ${r2(y * k)}`;
  return (
    <g
      fill="none"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d={`M${p(-7, -3)}L${p(-6, 6)}Q${p(-5.6, 8)} ${p(-3.6, 8)}L${p(2.6, 8)}Q${p(4.6, 8)} ${p(5, 6)}L${p(6, -3)}Z`}
      />
      <path
        d={`M${p(6, -1)}Q${p(10, -1)} ${p(9.6, 2.4)}Q${p(9.2, 4.6)} ${p(5.4, 4.2)}`}
      />
      <path
        d={`M${p(-3, -7)}Q${p(-4.4, -9)} ${p(-3, -11)}M${p(1, -7)}Q${p(-0.4, -9)} ${p(1, -11)}`}
      />
    </g>
  );
}

/** One chad: it pops toward you out of the hole, then gravity has it. */
function Chad({
  d,
  at,
  n,
  seed,
  motionSafe,
  onDone,
}: {
  d: string;
  at: Spot;
  n: number;
  seed: number;
  motionSafe: boolean;
  onDone: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useMotionValue(0);
  const scale = useMotionValue(1);
  const tumble = useMotionValue(1);
  const opacity = useMotionValue(1);
  const done = React.useRef(onDone);
  React.useEffect(() => {
    done.current = onDone;
  });

  React.useEffect(() => {
    // Every run starts the flight from the hole: a StrictMode re-run finishes
    // the same fall rather than freezing half of one.
    x.set(0);
    y.set(0);
    rotate.set(0);
    scale.set(1);
    tumble.set(1);
    opacity.set(1);
    const finish = () => done.current();
    let anims: AnimationPlaybackControls[];
    if (!motionSafe) {
      anims = [
        animate(opacity, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: finish,
        }),
      ];
    } else {
      const rand = lcg(seed);
      const t = 0.62 + rand() * 0.16;
      const side = rand() < 0.5 ? -1 : 1;
      anims = [
        animate(scale, [1, 1.18, 1.08], {
          duration: t,
          times: [0, 0.15, 1],
          ease: [easings.enter, easings.linear],
        }),
        // Up a hair as it leaves the die, then a fall that only accelerates:
        // gravity, not a spring.
        animate(y, [0, -7, 104], {
          duration: t,
          times: [0, 0.16, 1],
          ease: [easings.enter, [0.5, 0, 0.9, 0.55]],
        }),
        animate(x, side * (8 + rand() * 16), {
          duration: t,
          ease: easings.linear,
        }),
        animate(rotate, side * (140 + rand() * 220), {
          duration: t,
          ease: easings.enter,
        }),
        animate(tumble, [1, -0.8, 0.9, -0.6, 1], {
          duration: t,
          ease: easings.linear,
        }),
        animate(opacity, [1, 1, 0], {
          duration: t,
          times: [0, 0.6, 1],
          onComplete: finish,
        }),
      ];
    }
    return () => {
      for (const a of anims) a.stop();
    };
  }, [motionSafe, seed, x, y, rotate, scale, tumble, opacity]);

  return (
    <g transform={`translate(${at.cx} ${at.cy})`}>
      <motion.g
        style={{ x, y, rotate, scale, opacity, originX: 0.5, originY: 0.5 }}
      >
        <motion.g style={{ scaleY: tumble, originX: 0.5, originY: 0.5 }}>
          <path
            d={d}
            style={{ fill: PAPER, stroke: SPOT_LINE }}
            strokeWidth={1}
          />
          <text
            y={3}
            textAnchor="middle"
            className="font-mono"
            fontSize={8}
            style={{ fill: FAINT }}
          >
            {n}
          </text>
        </motion.g>
      </motion.g>
    </g>
  );
}

/** A count that rolls: the new figure rises into place on snap. */
function Count({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span className="inline-grid overflow-clip">
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          className="[grid-area:1/1]"
          initial={motionSafe ? { y: 8, opacity: 0 } : { opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={
            motionSafe
              ? {
                  y: -8,
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }
              : { opacity: 0, transition: { duration: durations.fast } }
          }
          transition={motionSafe ? springs.snap : { duration: durations.fast }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function TurnGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6.5a5.5 5.5 0 0 1 9.6-2.4" />
      <path d="M12.6 1.8v2.6H10" />
      <path d="M13.5 9.5a5.5 5.5 0 0 1-9.6 2.4" />
      <path d="M3.4 14.2v-2.6H6" />
    </svg>
  );
}

type ChadItem = { key: number; index: number };

/**
 * A loyalty card you punch. Each press sinks the next printed spot under the
 * die (the flick spring), then cuts it: a real hole through the card, so the
 * table — and the card's own shadow — show through it, the card jolts and
 * recovers on the recoil spring, and a paper chad carrying its piece of the
 * print pops toward you and falls away under gravity. The final punch lights
 * the reward and the card turns over on the snap spring to its redeem side;
 * Redeem turns it back, and at the instant it is edge-on the holes give way
 * to a fresh card.
 *
 * The count is a `role="meter"` and the punch is a real button: Space or
 * Enter presses and cuts through the same path as the pointer, and focus
 * follows the card when it turns. Under reduced motion nothing travels — the
 * chad fades in its hole and the faces cross-fade — while the hole, the
 * count, the reward and every sound still arrive.
 */
export function PunchCard({
  brand,
  reward = "One free drink",
  member,
  number,
  code,
  label,
  value,
  defaultValue = 0,
  onValueChange,
  onRedeem,
  holes = 9,
  shape = "round",
  chad = true,
  sound = false,
  disabled = false,
  className,
}: PunchCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const total = Math.round(clamp(holes, 6, 12));
  const grid = React.useMemo(() => layout(total), [total]);
  const d = React.useMemo(() => shapePath(shape, grid.r), [shape, grid.r]);

  const [own, setOwn] = React.useState(() =>
    Math.round(clamp(defaultValue, 0, total)),
  );
  const count = Math.round(clamp(value ?? own, 0, total));
  const full = count >= total;
  const [cycle, setCycle] = React.useState(0);
  const [face, setFace] = React.useState<"front" | "back">(() =>
    full ? "back" : "front",
  );
  const [chads, setChads] = React.useState<ChadItem[]>([]);
  // Holes still drawn while a redeemed card turns back over: the fresh card
  // takes their place when it is edge-on.
  const [held, setHeld] = React.useState<number | null>(null);
  const [seen, setSeen] = React.useState(count);
  if (seen !== count) {
    setSeen(count);
    if (count < seen && face === "back" && motionSafe) setHeld(seen);
  }
  // Only a full card shows its redeem side.
  if (!full && face === "back") setFace("front");
  const drawn = held ?? count;

  const [said, setSaid] = React.useState({ n: 0, key: count, text: "" });
  if (said.key !== count) {
    setSaid({
      n: said.n + 1,
      key: count,
      text:
        count >= total
          ? `Card full. ${reward} is ready to redeem.`
          : count === 0
            ? `A fresh card, 0 of ${total}.`
            : `Punched, ${count} of ${total}.`,
    });
  }

  const turn = useMotionValue(face === "back" ? 180 : 0);
  const jolt = useMotionValue(0);
  const dimple = useMotionValue(0);
  const glow = useMotionValue(full ? 1 : 0);
  const cupScale = useMotionValue(1);
  const ring = useMotionValue(0);
  const frontOpacity = useMotionValue(1);
  const backOpacity = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const punchRef = React.useRef<HTMLButtonElement | null>(null);
  const redeemRef = React.useRef<HTMLButtonElement | null>(null);
  const shown = React.useRef(count);
  const voicedAt = React.useRef(-Infinity);
  const timers = React.useRef<number[]>([]);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const chadKey = React.useRef(0);
  const refocus = React.useRef(false);
  const edgeWatch = React.useRef<(() => void) | null>(null);

  const run = React.useCallback(
    (key: string, controls: AnimationPlaybackControls) => {
      anims.current.get(key)?.stop();
      anims.current.set(key, controls);
    },
    [],
  );

  const panAt = React.useCallback((cx: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + (cx / W) * rect.width, null) : 0;
  }, []);

  const voiced = () => performance.now() - voicedAt.current < 900;

  const press = () => {
    if (disabled || full) return;
    if (!motionSafe) {
      dimple.set(1);
      return;
    }
    run("dimple", animate(dimple, 1, springs.flick));
  };

  const lift = () => {
    if (!motionSafe) {
      dimple.set(0);
      return;
    }
    run("dimple", animate(dimple, 0, springs.flick));
  };

  const cut = () => {
    if (disabled) return;
    if (full) {
      // Nothing left to punch: the button turns the card to its reward.
      refocus.current = document.activeElement === punchRef.current;
      setFace("back");
      return;
    }
    anims.current.get("dimple")?.stop();
    dimple.set(0);
    voicedAt.current = performance.now();
    const next = count + 1;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const redeem = () => {
    if (disabled || !full) return;
    audio.play("click", { pitch: 0.8, gain: 0.5, pan: panAt(W - 60) });
    voicedAt.current = performance.now();
    refocus.current = document.activeElement === redeemRef.current;
    onRedeem?.();
    if (value === undefined) setOwn(0);
    onValueChange?.(0);
    setCycle((c) => c + 1);
  };

  // A count that moves — from a press here or from the host — is punched,
  // lit or reset the same way either way; only a visitor's press is heard.
  React.useEffect(() => {
    const before = shown.current;
    if (before === count) return;
    shown.current = count;
    const loud = voiced();
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    if (count > before) {
      for (let i = before; i < count; i += 1) {
        const at = grid.spots[i];
        if (!at) continue;
        const delay = (i - before) * 110;
        timers.current.push(
          window.setTimeout(() => {
            if (loud) {
              audio.play("click", {
                pitch: r2(0.9 + 0.04 * i),
                gain: 0.55,
                pan: panAt(at.cx),
              });
            }
            if (motionSafe) {
              jolt.set(0);
              run(
                "jolt",
                animate(jolt, 0, { ...springs.recoil, velocity: 90 }),
              );
            }
            if (chad) {
              chadKey.current += 1;
              const key = chadKey.current;
              setChads((list) => [...list.slice(-11), { key, index: i }]);
            }
          }, delay),
        );
      }
      if (count >= total) {
        const lastAt = (count - before - 1) * 110;
        timers.current.push(
          window.setTimeout(() => {
            if (loud) {
              audio.play("pop", { gain: 0.6, pan: panAt(grid.reward.cx) });
            }
            if (!motionSafe) {
              run("glow", animate(glow, 1, { duration: durations.base }));
              return;
            }
            run(
              "glow",
              animate(glow, 1, {
                duration: durations.base,
                ease: easings.enter,
              }),
            );
            cupScale.set(1.22);
            run("cup", animate(cupScale, 1, springs.recoil));
            ring.set(0);
            run(
              "ring",
              animate(ring, 1, { duration: 0.7, ease: easings.enter }),
            );
          }, lastAt + 160),
          window.setTimeout(() => {
            refocus.current =
              refocus.current || document.activeElement === punchRef.current;
            setFace("back");
          }, lastAt + 810),
        );
      }
    } else {
      run("glow", animate(glow, 0, { duration: durations.fast }));
    }
    // The host's count is the only trigger; the rest is read as it stands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // The card turns to whichever face is up. Turning back over after a
  // redeem, the fresh card replaces the punched one when it is edge-on.
  const faceShown = React.useRef(face);
  React.useEffect(() => {
    if (faceShown.current === face) return;
    faceShown.current = face;
    edgeWatch.current?.();
    edgeWatch.current = null;
    const toBack = face === "back";
    if (!motionSafe) {
      const tween = { duration: durations.base, ease: easings.enter };
      run("front", animate(frontOpacity, toBack ? 0 : 1, tween));
      run("back", animate(backOpacity, toBack ? 1 : 0, tween));
      return;
    }
    const from = turn.get();
    const goal = toBack ? 180 : 360;
    edgeWatch.current = turn.on("change", (v) => {
      if (Math.abs(v - from) < 90) return;
      edgeWatch.current?.();
      edgeWatch.current = null;
      setHeld(null);
    });
    run(
      "turn",
      animate(turn, goal, {
        ...springs.snap,
        onComplete: () => {
          turn.jump(goal % 360);
          edgeWatch.current?.();
          edgeWatch.current = null;
          setHeld(null);
        },
      }),
    );
  }, [face, motionSafe, run, turn, frontOpacity, backOpacity]);

  // Focus that was on the face that turned away goes to the face that
  // arrived, once it is live.
  React.useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    const target = face === "back" ? redeemRef.current : punchRef.current;
    target?.focus({ preventScroll: true });
  }, [face]);

  // A change of motion preference puts everything at rest where it stands.
  React.useEffect(() => {
    const back = faceShown.current === "back";
    anims.current.get("turn")?.stop();
    if (motionSafe) {
      turn.jump(back ? 180 : 0);
      frontOpacity.jump(1);
      backOpacity.jump(1);
    } else {
      turn.jump(0);
      frontOpacity.jump(back ? 0 : 1);
      backOpacity.jump(back ? 1 : 0);
    }
  }, [motionSafe, turn, frontOpacity, backOpacity]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers;
    return () => {
      for (const t of pending.current) window.clearTimeout(t);
      pending.current = [];
      for (const c of running.values()) c.stop();
      running.clear();
      edgeWatch.current?.();
      edgeWatch.current = null;
    };
  }, []);

  // Under reduced motion the die's press is shade alone, no travel.
  const dimpleScale = useTransform(dimple, (v) =>
    motionSafe ? r2(1 - 0.07 * v) : 1,
  );
  const dimpleShade = useTransform(dimple, (v) => r2(0.2 * v));
  const lifted = useTransform(turn, (t) =>
    r2(1 + 0.02 * Math.abs(Math.sin((t * Math.PI) / 180))),
  );
  const ringR = useTransform(ring, (v) => r2(grid.r * (1 + 0.9 * v)));
  const ringOpacity = useTransform(ring, (v) =>
    v > 0 && v < 1 ? r2(0.7 * (1 - v)) : 0,
  );

  const next = grid.spots[count];
  const redeemCode =
    code ??
    codeOf(hash(`${brand}|${member ?? ""}|${cycle - (held !== null ? 1 : 0)}`));
  const rule = `${NUMBER_WORDS[total] ?? total} punches, one free`;
  const meterText = full
    ? `${total} of ${total} punched. ${reward} is ready.`
    : `${count} of ${total} punched, ${total - count} to go.`;

  const body = (mirror: boolean, holesMask: string) => {
    const place = (s: Spot) => (mirror ? r2(W - s.cx) : s.cx);
    return (
      <svg
        aria-hidden
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 size-full"
        style={{ filter: CARD_SHADOW }}
      >
        <defs>
          <mask
            id={holesMask}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={W}
            height={H}
          >
            <rect width={W} height={H} fill="white" />
            {grid.spots.slice(0, drawn).map((s, i) => (
              <path
                key={i}
                d={d}
                transform={`translate(${place(s)} ${s.cy})`}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <g mask={`url(#${holesMask})`}>
          <rect width={W} height={H} rx={11} style={{ fill: PAPER }} />
          <path
            d={`M0 ${BAND}V11A11 11 0 0 1 11 0H${W - 11}A11 11 0 0 1 ${W} 11V${BAND}Z`}
            style={{ fill: BAND_INK }}
          />
          <rect
            y={BAND}
            width={W}
            height={1.5}
            style={{ fill: "oklch(0.3 0.05 48 / 0.35)" }}
          />
          {mirror
            ? null
            : grid.spots.map((s, i) => (
                <g key={i} transform={`translate(${s.cx} ${s.cy})`}>
                  <path
                    d={d}
                    fill="none"
                    strokeWidth={1.1}
                    style={{ stroke: SPOT_LINE }}
                  />
                  <text
                    y={3}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={8}
                    style={{ fill: FAINT }}
                  >
                    {i + 1}
                  </text>
                </g>
              ))}
          {mirror ? null : (
            <g transform={`translate(${grid.reward.cx} ${grid.reward.cy})`}>
              <motion.circle
                r={ringR}
                fill="none"
                strokeWidth={1.4}
                style={{ stroke: REWARD, opacity: ringOpacity }}
              />
              <circle
                r={grid.r}
                fill="none"
                strokeWidth={1.1}
                style={{ stroke: SPOT_LINE }}
              />
              <motion.circle
                r={r2(grid.r - 2.2)}
                style={{ fill: REWARD, opacity: glow }}
              />
              <circle
                r={r2(grid.r - 2.2)}
                fill="none"
                strokeWidth={0.8}
                strokeDasharray="1.5 2"
                style={{ stroke: SPOT_LINE }}
              />
              <motion.g
                style={{
                  scale: cupScale,
                  originX: 0.5,
                  originY: 0.5,
                  stroke: full ? INK : FAINT,
                }}
              >
                <CupGlyph r={grid.r} />
              </motion.g>
            </g>
          )}
          {!mirror && next ? (
            <g transform={`translate(${next.cx} ${next.cy})`}>
              <motion.path
                d={d}
                style={{
                  fill: DIMPLE,
                  opacity: dimpleShade,
                  scale: dimpleScale,
                  originX: 0.5,
                  originY: 0.5,
                }}
              />
            </g>
          ) : null}
        </g>
        {grid.spots.slice(0, drawn).map((s, i) => (
          <path
            key={i}
            d={d}
            transform={`translate(${place(s)} ${s.cy})`}
            fill="none"
            strokeWidth={0.9}
            style={{ stroke: CUT_EDGE }}
          />
        ))}
      </svg>
    );
  };

  const faceBase = cn(
    "absolute inset-0 rounded-[3.2%/5.5%]",
    motionSafe && "backface-hidden",
  );

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label ?? `${brand} loyalty card`}
      className={cn(
        "relative w-full max-w-83 overflow-clip px-[4%] py-2.5",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="relative aspect-[7/4] w-full perspective-[2400px]">
        <motion.div
          className="absolute inset-0 transform-3d"
          style={{ rotateY: turn, y: jolt, scale: lifted }}
        >
          <motion.div
            aria-hidden={face === "back" || undefined}
            inert={face === "back"}
            className={faceBase}
            style={{ opacity: frontOpacity }}
          >
            {body(false, `${uid}-front`)}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[20%] items-center justify-between gap-3 px-[5%]">
              <p
                className="min-w-0 truncate text-xs leading-4 font-semibold tracking-[0.02em]"
                style={{ color: ON_BAND }}
              >
                {brand}
              </p>
              <p
                className="shrink-0 font-mono text-[9px] tracking-[0.14em] uppercase"
                style={{ color: ON_BAND }}
              >
                Loyalty{number ? ` · No. ${number}` : ""}
              </p>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[25%] items-center justify-between gap-3 px-[5%]">
              <div className="min-w-0">
                {member ? (
                  <p
                    className="truncate text-[11px] leading-4 font-medium"
                    style={{ color: INK }}
                  >
                    {member}
                  </p>
                ) : null}
                <p
                  className="truncate text-[9px] leading-3.5"
                  style={{ color: FAINT }}
                >
                  {rule}
                </p>
              </div>
              <p
                aria-hidden
                className="flex shrink-0 items-baseline font-mono text-[13px] leading-4 tabular-nums"
                style={{ color: INK }}
              >
                <Count value={count} motionSafe={motionSafe} />
                <span style={{ color: FAINT }}>/{total}</span>
              </p>
            </div>
            <button
              ref={punchRef}
              type="button"
              disabled={disabled}
              aria-describedby={hintId}
              aria-label={
                full ? "Card full. Turn over to redeem" : "Punch the next spot"
              }
              onPointerDown={(event) => {
                if (event.pointerType === "mouse" && event.button !== 0) return;
                press();
              }}
              onPointerUp={lift}
              onPointerLeave={lift}
              onPointerCancel={lift}
              onKeyDown={(event) => {
                if (
                  (event.key === " " || event.key === "Enter") &&
                  !event.repeat
                ) {
                  press();
                }
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") lift();
              }}
              onBlur={lift}
              onClick={cut}
              className={cn(
                "peer/punch-card absolute inset-x-[4%] top-[21%] bottom-[24%] rounded-2 outline-none select-none [-webkit-touch-callout:none]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
              )}
            />
            {!full && next ? (
              <svg
                aria-hidden
                viewBox={`0 0 ${W} ${H}`}
                className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-150 peer-hover/punch-card:opacity-100 peer-focus-visible/punch-card:opacity-100 peer-disabled/punch-card:hidden"
              >
                <g transform={`translate(${next.cx} ${next.cy})`}>
                  <path
                    d={d}
                    transform="scale(1.28)"
                    fill="none"
                    strokeWidth={0.9}
                    strokeDasharray="2.5 2.5"
                    style={{ stroke: INK }}
                  />
                  <path
                    d={`M${r2(-grid.r * 1.6)} 0H${r2(-grid.r * 1.35)}M${r2(grid.r * 1.35)} 0H${r2(grid.r * 1.6)}M0 ${r2(-grid.r * 1.6)}V${r2(-grid.r * 1.35)}M0 ${r2(grid.r * 1.35)}V${r2(grid.r * 1.6)}`}
                    strokeWidth={0.9}
                    style={{ stroke: INK }}
                  />
                </g>
              </svg>
            ) : null}
          </motion.div>

          <motion.div
            aria-hidden={face === "front" || undefined}
            inert={face === "front"}
            className={cn(faceBase, motionSafe && "rotate-y-180")}
            style={{ opacity: backOpacity }}
          >
            {body(true, `${uid}-back`)}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[20%] items-center justify-between gap-3 px-[5%]">
              <p
                className="shrink-0 text-xs leading-4 font-semibold"
                style={{ color: ON_BAND }}
              >
                Reward ready
              </p>
              <p
                className="min-w-0 truncate font-mono text-[9px] tracking-[0.14em] uppercase"
                style={{ color: ON_BAND }}
              >
                {brand}
              </p>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex h-[30%] items-center justify-between gap-2 px-[5%]">
              <div className="min-w-0">
                <p
                  className="truncate text-xs leading-4 font-semibold"
                  style={{ color: INK }}
                >
                  {reward}
                </p>
                <p
                  className="truncate font-mono text-[10px] leading-4 tracking-[0.08em]"
                  style={{ color: FAINT }}
                >
                  Code {redeemCode}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Turn the card back over"
                  disabled={disabled}
                  onClick={() => {
                    refocus.current = true;
                    setFace("front");
                  }}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-2 border transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    "disabled:cursor-not-allowed",
                  )}
                  style={{
                    color: INK,
                    borderColor: "oklch(0.34 0.045 48 / 0.25)",
                    backgroundColor: "oklch(1 0 0 / 0.5)",
                  }}
                >
                  <TurnGlyph />
                </button>
                <button
                  ref={redeemRef}
                  type="button"
                  disabled={disabled || !full}
                  onClick={redeem}
                  className={cn(
                    "inline-flex h-8 items-center rounded-2 px-3 text-xs font-semibold transition-[filter] outline-none hover:brightness-110",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                  style={{ backgroundColor: BAND_INK, color: ON_BAND }}
                >
                  Redeem
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>

        <svg
          aria-hidden
          viewBox={`0 0 ${W} ${H}`}
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          {chads.map((c) => {
            const at = grid.spots[c.index];
            if (!at) return null;
            return (
              <Chad
                key={c.key}
                d={d}
                at={at}
                n={c.index + 1}
                seed={hash(`${uid}-${c.key}`)}
                motionSafe={motionSafe}
                onDone={() =>
                  setChads((list) => list.filter((x) => x.key !== c.key))
                }
              />
            );
          })}
        </svg>
      </div>

      <div
        role="meter"
        aria-label="Punches"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={count}
        aria-valuetext={meterText}
        className="sr-only"
      >
        {meterText}
      </div>
      <p id={hintId} className="sr-only">
        Space or Enter punches the next spot.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
