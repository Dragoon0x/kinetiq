"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CurtainCountVariant =
  "counter" | "word" | "bars" | "split" | "radial";

export type CurtainCountExit = "split" | "slats" | "shutter";

export type CurtainCountProps = {
  /** How far the page has loaded, 0 to 1. At 1 the curtain holds a beat, then splits and lifts away; below 1 again, it falls back in. @default 0 */
  progress?: number;
  /** Which way to hold the stage: a counter and rule, the brand word filling with colour, stacked bars, a split frame or a radial wipe — by name, or by its place 1–5 in that order. @default "counter" */
  variant?: CurtainCountVariant | number;
  /** How the frame leaves: two halves parting at the centre, vertical slats from the centre out, or horizontal bands from the top. @default "split" */
  exitMotion?: CurtainCountExit;
  /** The fill colour, any CSS colour; taken at a lightness that reads on the curtain. @default "var(--accent-bright)" */
  accent?: string;
  /** The page beneath: inert and marked busy until the curtain has gone. */
  children?: React.ReactNode;
  /** The brand on the curtain, and the word the word variant fills. @default "Fieldline" */
  brand?: string;
  /** A line of copy on the curtain; it reads "Ready" at 100 %. @default "Loading the season" */
  caption?: string;
  /** Labels for the bars variant's five bars. @default ["Fonts", "Pictures", "Routes", "Data", "Scripts"] */
  stages?: readonly string[];
  /** Names the progress bar for assistive technology. @default `Loading ${brand}` */
  label?: string;
  /** How long the curtain holds at 100 % before it splits, ms. @default 280 */
  hold?: number;
  /** How long the parts take to lift away, ms (each part; the cascade adds to it). @default 680 */
  exitDuration?: number;
  /** How many slats or bands the slats and shutter exits cut the frame into, 3 to 10. @default 6 */
  slats?: number;
  /** The curtain's colour. @default "var(--foreground)" */
  curtainColor?: string;
  /** The type on the curtain. @default "var(--background)" */
  inkColor?: string;
  /** Fires when the curtain has fully lifted (true), and when it falls back over the page (false). */
  onRevealChange?: (revealed: boolean) => void;
  /** Sizes the box; the curtain fills it. @default "h-full w-full" */
  className?: string;
};

type Phase = "loading" | "ready" | "lifting" | "revealed";

type PartValues = {
  /** Crack offsets, px. */
  cx: MotionValue<number>;
  cy: MotionValue<number>;
  /** Lift travel, % of the frame. */
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
};

const VARIANTS: readonly CurtainCountVariant[] = [
  "counter",
  "word",
  "bars",
  "split",
  "radial",
];
const MAX_PARTS = 10;
const DEFAULT_STAGES = ["Fonts", "Pictures", "Routes", "Data", "Scripts"];
/** Each bar's window of the whole load: they overlap, as real requests do. */
const WINDOWS: readonly (readonly [number, number])[] = [
  [0, 0.34],
  [0.08, 0.52],
  [0.26, 0.74],
  [0.46, 0.9],
  [0.62, 1],
];
/** The seams crack open on the flick spring before the parts lift. */
const CRACK = 0.11;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** How a wheel turns through the last stretch of a unit: at rest until 60 %, then over. */
const turn = (f: number) => {
  const t = clamp((f - 0.6) / 0.4, 0, 1);
  return t * t * (3 - 2 * t);
};

const variantOf = (v: CurtainCountVariant | number | undefined) => {
  if (typeof v === "number" && Number.isFinite(v)) {
    return VARIANTS[clamp(Math.round(v), 1, 5) - 1] ?? "counter";
  }
  return VARIANTS.includes(v as CurtainCountVariant)
    ? (v as CurtainCountVariant)
    : "counter";
};

/**
 * The accent as a pigment that reads on the default curtain, which is the
 * page's ink: brighter on the dark curtain of a light page, deeper on the
 * pale curtain of a dark one.
 */
const pigment = (accent: string, onDark: number, onLight: number) =>
  `light-dark(oklch(from ${accent} ${onDark} c h), oklch(from ${accent} ${onLight} c h))`;

/** Where each part's slice sits, as a clip-path, with half a pixel of overlap so no seam shows at rest. */
function clipOf(exit: CurtainCountExit, i: number, n: number): string {
  if (n === 1) return "none";
  const a = r3((i / n) * 100);
  const b = r3(100 - ((i + 1) / n) * 100);
  if (exit === "shutter") {
    return `inset(calc(${a}% - 0.5px) 0 calc(${b}% - 0.5px) 0)`;
  }
  return `inset(0 calc(${b}% - 0.5px) 0 calc(${a}% - 0.5px))`;
}

/** The odometer: one column of digits, turning continuously for the ones and carrying smoothly for the rest. */
function Digit({
  shown,
  place,
}: {
  shown: MotionValue<number>;
  place: 0 | 1 | 2;
}) {
  const unit = place === 2 ? 100 : place === 1 ? 10 : 1;
  const y = useTransform(shown, (s) => {
    const v = clamp(s, 0, 1) * 100;
    const whole = Math.floor(v / unit);
    // Each wheel rests on its digit and turns only through the last stretch
    // of its unit, the next wheel turning with it on the carry — so the
    // count reads crisply while it climbs, like a mechanical counter.
    const within = place === 0 ? v - whole : v - whole * unit - (unit - 1);
    const pos = (whole % 10) + turn(clamp(within, 0, 1));
    return `${r3(-pos)}em`;
  });
  // Leading zeros stay, dimmed: the count always has three places.
  const opacity = useTransform(shown, (s) =>
    place === 0 || clamp(s, 0, 1) * 100 >= unit - 0.5 ? 1 : 0.22,
  );
  return (
    <span
      className="relative inline-block overflow-hidden"
      style={{ height: "1em", width: "0.62em" }}
    >
      <motion.span
        className="absolute inset-x-0 top-0 block"
        style={{ y, opacity }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, i) => (
          <span
            key={i}
            className="block text-center"
            style={{ height: "1em", lineHeight: 1 }}
          >
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function Count({ shown }: { shown: MotionValue<number> }) {
  return (
    <span className="inline-flex tabular-nums" style={{ lineHeight: 1 }}>
      <Digit shown={shown} place={2} />
      <Digit shown={shown} place={1} />
      <Digit shown={shown} place={0} />
    </span>
  );
}

function Percent({ shown }: { shown: MotionValue<number> }) {
  const text = useTransform(shown, (s) =>
    String(Math.round(clamp(s, 0, 1) * 100)),
  );
  return <motion.span>{text}</motion.span>;
}

type FrameProps = {
  variant: CurtainCountVariant;
  shown: MotionValue<number>;
  brand: string;
  caption: string;
  stages: readonly string[];
  accent: string;
  curtainColor: string;
  inkColor: string;
  ready: boolean;
};

function Masthead({
  brand,
  caption,
  ready,
}: {
  brand: string;
  caption: string;
  ready: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.16em] uppercase @[480px]:text-[11px]">
      <span className="font-medium">{brand}</span>
      <span className="relative inline-grid opacity-70">
        <span
          className={cn(
            "col-start-1 row-start-1 transition-opacity duration-200",
            ready && "opacity-0",
          )}
        >
          {caption}
        </span>
        <span
          className={cn(
            "col-start-1 row-start-1 text-right transition-opacity duration-200",
            !ready && "opacity-0",
          )}
        >
          Ready
        </span>
      </span>
    </div>
  );
}

function CounterFrame({ shown, brand, caption, accent, ready }: FrameProps) {
  const fill = useTransform(shown, (s) => r3(clamp(s, 0, 1)));
  return (
    <div className="flex h-full flex-col justify-between p-5 @[480px]:p-9">
      <Masthead brand={brand} caption={caption} ready={ready} />
      <div className="flex flex-col gap-4">
        <div className="relative h-px w-full">
          <span className="absolute inset-0 bg-current opacity-20" />
          <motion.span
            className="absolute inset-0 origin-left"
            style={{ scaleX: fill, background: pigment(accent, 0.74, 0.58) }}
          />
        </div>
        <div className="flex items-end justify-between gap-4">
          <span
            className="font-light tracking-tight"
            style={{ fontSize: "clamp(4rem, 24cqw, 13rem)", lineHeight: 1 }}
          >
            <Count shown={shown} />
          </span>
          <span className="pb-[0.4em] font-mono text-[11px] tracking-[0.16em] uppercase opacity-60">
            %
          </span>
        </div>
      </div>
    </div>
  );
}

function WordFrame({ shown, brand, caption, accent, ready }: FrameProps) {
  const clip = useTransform(
    shown,
    (s) => `inset(${r3((1 - clamp(s, 0, 1)) * 100)}% 0 0 0)`,
  );
  const edge = useTransform(shown, (s) => `${r3((1 - clamp(s, 0, 1)) * 100)}%`);
  const edgeOpacity = useTransform(shown, (s) =>
    s > 0.01 && s < 0.99 ? 1 : 0,
  );
  const colour = pigment(accent, 0.74, 0.58);
  return (
    <div className="flex h-full flex-col justify-between p-5 @[480px]:p-9">
      <Masthead brand={brand} caption={caption} ready={ready} />
      <div className="flex justify-center">
        <span
          className="relative font-semibold tracking-tight whitespace-nowrap"
          // About four-fifths of the frame's width for any brand, and never
          // taller than a third of it.
          style={{
            fontSize: `min(${r3(136 / Math.max(4, brand.length))}cqw, 34cqh)`,
            lineHeight: 1,
          }}
        >
          <span
            style={{
              color: "color-mix(in oklab, currentColor 16%, transparent)",
            }}
          >
            {brand}
          </span>
          <motion.span
            className="absolute inset-0"
            style={{ clipPath: clip, color: colour }}
          >
            {brand}
          </motion.span>
          <motion.span
            className="absolute inset-x-0 h-px"
            style={{ top: edge, opacity: edgeOpacity, background: colour }}
          />
        </span>
      </div>
      <div className="font-mono text-[11px] tracking-[0.16em] uppercase opacity-70">
        <Percent shown={shown} /> %
      </div>
    </div>
  );
}

function Bar({
  shown,
  label,
  window,
  colour,
}: {
  shown: MotionValue<number>;
  label: string;
  window: readonly [number, number];
  colour: string;
}) {
  const [a, b] = window;
  const part = useTransform(shown, (s) =>
    r3(clamp((clamp(s, 0, 1) - a) / (b - a), 0, 1)),
  );
  const text = useTransform(part, (p) => String(Math.round(p * 100)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[10px] tracking-[0.14em] uppercase">
        <span className="truncate opacity-70">{label}</span>
        <span className="tabular-nums opacity-70">
          <motion.span>{text}</motion.span>
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full @[480px]:h-2">
        <span className="absolute inset-0 bg-current opacity-12" />
        <motion.span
          className="absolute inset-0 origin-left rounded-full"
          style={{ scaleX: part, background: colour }}
        />
      </div>
    </div>
  );
}

function BarsFrame({
  shown,
  brand,
  caption,
  stages,
  accent,
  ready,
}: FrameProps) {
  const colour = pigment(accent, 0.74, 0.58);
  return (
    <div className="flex h-full flex-col justify-between gap-6 p-5 @[480px]:p-9">
      <div className="flex flex-col gap-3">
        <Masthead brand={brand} caption={caption} ready={ready} />
        <span
          className="font-light tracking-tight"
          style={{ fontSize: "clamp(3rem, 15cqw, 8rem)", lineHeight: 1 }}
        >
          <Count shown={shown} />
        </span>
      </div>
      <div className="grid gap-3.5 @[480px]:grid-cols-2 @[480px]:gap-x-8">
        {WINDOWS.map((w, i) => (
          <Bar
            key={i}
            shown={shown}
            window={w}
            label={stages[i] ?? DEFAULT_STAGES[i] ?? ""}
            colour={colour}
          />
        ))}
      </div>
    </div>
  );
}

function SplitFrame({
  shown,
  brand,
  caption,
  accent,
  curtainColor,
  ready,
}: FrameProps) {
  const edge = useTransform(shown, (s) => `${r3(clamp(s, 0, 1) * 100)}%`);
  const clip = useTransform(
    shown,
    (s) => `inset(0 ${r3((1 - clamp(s, 0, 1)) * 100)}% 0 0)`,
  );
  // The same face twice: the curtain's, and the field's in the curtain's
  // own colour, clipped to the field — so the type inverts where the edge
  // crosses it.
  const face = (
    <>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-light tracking-tight"
          style={{ fontSize: "clamp(4.5rem, 30cqw, 16rem)", lineHeight: 1 }}
        >
          <Count shown={shown} />
        </span>
      </div>
      <div className="relative p-5 @[480px]:p-9">
        <Masthead brand={brand} caption={caption} ready={ready} />
      </div>
    </>
  );
  return (
    <div className="relative h-full">
      {face}
      <motion.div
        className="absolute inset-0"
        style={{
          clipPath: clip,
          background: pigment(accent, 0.74, 0.5),
          color: curtainColor,
        }}
      >
        {face}
      </motion.div>
      <motion.span
        className="absolute inset-y-0 w-px bg-current opacity-30"
        style={{ left: edge }}
      />
    </div>
  );
}

function RadialFrame({
  shown,
  brand,
  caption,
  accent,
  curtainColor,
  ready,
}: FrameProps) {
  const tint = `color-mix(in oklab, ${pigment(accent, 0.74, 0.58)} 26%, ${curtainColor})`;
  const sweep = useTransform(shown, (s) => {
    const deg = r3(clamp(s, 0, 1) * 360);
    return `conic-gradient(from 0deg at 50% 50%, ${tint} 0deg ${deg}deg, transparent ${deg}deg)`;
  });
  const hand = useTransform(shown, (s) => r3(180 + clamp(s, 0, 1) * 360));
  return (
    <div className="relative h-full">
      <motion.div className="absolute inset-0" style={{ background: sweep }} />
      <motion.div
        className="absolute top-1/2 left-1/2 w-px origin-top"
        style={{
          height: "80cqmax",
          rotate: hand,
          background: pigment(accent, 0.74, 0.58),
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-full border border-current/15"
          style={{
            width: "clamp(9rem, 40cqmin, 17rem)",
            background: curtainColor,
          }}
        >
          <span
            className="font-light tracking-tight"
            style={{
              fontSize: "clamp(2.5rem, 11cqmin, 5.5rem)",
              lineHeight: 1,
            }}
          >
            <Count shown={shown} />
          </span>
          <span className="font-mono text-[10px] tracking-[0.16em] uppercase opacity-60">
            percent
          </span>
        </div>
      </div>
      <div className="relative p-5 @[480px]:p-9">
        <Masthead brand={brand} caption={caption} ready={ready} />
      </div>
    </div>
  );
}

const FRAMES: Record<
  CurtainCountVariant,
  (props: FrameProps) => React.ReactNode
> = {
  counter: CounterFrame,
  word: WordFrame,
  bars: BarsFrame,
  split: SplitFrame,
  radial: RadialFrame,
};

/** One slice of the curtain as it leaves: a full copy of the frame, clipped to its share, that cracks and lifts on its own values. */
function Part({
  values,
  clip,
  children,
}: {
  values: PartValues;
  clip: string;
  children: React.ReactNode;
}) {
  const x = useTransform(
    [values.x, values.cx] as MotionValue<number>[],
    ([p, c]) => `calc(${r3(p as number)}% + ${r3(c as number)}px)`,
  );
  const y = useTransform(
    [values.y, values.cy] as MotionValue<number>[],
    ([p, c]) => `calc(${r3(p as number)}% + ${r3(c as number)}px)`,
  );
  return (
    <motion.div
      className="absolute inset-0"
      style={{
        x,
        y,
        rotate: values.rotate,
        // Parts exist only while they lift, so each carries its shadow.
        filter:
          "drop-shadow(0 12px 22px color-mix(in oklab, black 28%, transparent))",
      }}
    >
      <div className="absolute inset-0" style={{ clipPath: clip }}>
        {children}
      </div>
    </motion.div>
  );
}

/**
 * A full-frame loading screen over its own box, in five variants driven by
 * one progress value: a counter whose odometer digits roll beside a rule that
 * fills; the brand word filling with colour from its baseline; five stacked
 * bars, each filling over its own window of the load; a split frame whose
 * field sweeps across and inverts the giant percentage where it crosses; and
 * a radial wipe with a clock hand riding its edge. The readout follows the
 * progress on the glide spring, so a jumpy loader still reads as one
 * movement.
 *
 * All five end the same way. At 100 % the curtain holds a beat and says
 * Ready, its seams crack open on the flick spring, and the parts — two
 * halves, vertical slats or horizontal bands — lift out of the box on the
 * exit ease in a cascade while the page beneath settles from a hair's
 * scale on glide. The page is inert and marked busy until then; one
 * progress bar carries the value for assistive technology. Under reduced
 * motion the digits and fills change in place and the curtain fades out.
 */
export function CurtainCount({
  progress = 0,
  variant = "counter",
  exitMotion = "split",
  accent = "var(--accent-bright)",
  children,
  brand = "Fieldline",
  caption = "Loading the season",
  stages = DEFAULT_STAGES,
  label,
  hold = 280,
  exitDuration = 680,
  slats = 6,
  curtainColor = "var(--foreground)",
  inkColor = "var(--background)",
  onRevealChange,
  className,
}: CurtainCountProps) {
  const motionSafe = useMotionSafe();
  const kind = variantOf(variant);
  const exit: CurtainCountExit =
    exitMotion === "slats" || exitMotion === "shutter" ? exitMotion : "split";
  const target = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  const complete = target >= 1;
  const pct = Math.round(target * 100);
  const count = exit === "split" ? 2 : clamp(Math.round(slats), 3, MAX_PARTS);

  const [phase, setPhase] = React.useState<Phase>(
    complete ? "revealed" : "loading",
  );
  // A change of `progress` across 100 % moves the phase here, in render,
  // rather than in an effect that would paint the old phase first.
  const [wasComplete, setWasComplete] = React.useState(complete);
  if (wasComplete !== complete) {
    setWasComplete(complete);
    setPhase(complete ? "ready" : "loading");
  }

  const shown = useMotionValue(target);
  const veil = useMotionValue(complete ? 0 : 1);
  const pageScale = useMotionValue(1);
  const [parts] = React.useState<PartValues[]>(() =>
    Array.from({ length: MAX_PARTS }, () => ({
      cx: motionValue(0),
      cy: motionValue(0),
      x: motionValue(0),
      y: motionValue(0),
      rotate: motionValue(0),
    })),
  );
  const revealed = React.useRef(complete);
  const report = React.useRef(onRevealChange);
  React.useEffect(() => {
    report.current = onRevealChange;
  });

  // The readout follows the progress on glide; a drop is a new run, so it
  // starts there rather than rolling back down.
  React.useEffect(() => {
    if (!motionSafe || target < shown.get() - 0.2) {
      shown.jump(target);
      return;
    }
    const c = animate(shown, target, springs.glide);
    return () => c.stop();
  }, [target, motionSafe, shown]);

  React.useEffect(() => {
    if (phase === "ready") {
      const t = window.setTimeout(() => setPhase("lifting"), Math.max(0, hold));
      return () => window.clearTimeout(t);
    }

    if (phase === "loading") {
      // Back over the page: every part home, the curtain fading back in.
      if (revealed.current) {
        revealed.current = false;
        report.current?.(false);
      }
      for (const p of parts) {
        p.cx.jump(0);
        p.cy.jump(0);
        p.x.jump(0);
        p.y.jump(0);
        p.rotate.jump(0);
      }
      pageScale.jump(1);
      if (veil.get() >= 1) return;
      const c = animate(veil, 1, {
        duration: durations.fast,
        ease: easings.enter,
      });
      return () => c.stop();
    }

    if (phase === "lifting") {
      const running: AnimationPlaybackControls[] = [];
      let left = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        revealed.current = true;
        setPhase("revealed");
        report.current?.(true);
      };
      const settle = () => {
        left -= 1;
        if (left <= 0) finish();
      };

      if (!motionSafe) {
        left = 1;
        running.push(
          animate(veil, 0, {
            duration: durations.base,
            ease: easings.exit,
            onComplete: settle,
          }),
        );
        return () => {
          for (const c of running) c.stop();
        };
      }

      const lift = Math.max(0.2, exitDuration / 1000);
      const step = cascade(count);
      const mid = (count - 1) / 2;
      running.push(
        animate(pageScale, [1.015, 1], {
          ...springs.glide,
          delay: CRACK,
        }),
      );
      for (let i = 0; i < count; i += 1) {
        const p = parts[i];
        if (!p) continue;
        const off = i - mid;
        let crackX = 0;
        let crackY = 0;
        let toX = 0;
        let toY = -118;
        let turn = 0;
        let delay = CRACK;
        if (exit === "split") {
          crackX = off < 0 ? -3 : 3;
          toX = off < 0 ? -4 : 4;
          turn = off < 0 ? -3 : 3;
          delay += i * 0.04;
        } else if (exit === "slats") {
          crackX = off * 1.5;
          turn = off * 1.2;
          delay += Math.abs(off) * step;
        } else {
          crackY = off * 1.5;
          toY = -(((i + 1) / count) * 100 + 8);
          turn = i % 2 === 0 ? -0.6 : 0.6;
          delay += i * step;
        }
        left += 1;
        running.push(
          animate(p.cx, crackX, springs.flick),
          animate(p.cy, crackY, springs.flick),
          animate(p.x, toX, { duration: lift, ease: easings.exit, delay }),
          animate(p.rotate, turn, {
            duration: lift,
            ease: easings.exit,
            delay,
          }),
          animate(p.y, toY, {
            duration: lift,
            ease: easings.exit,
            delay,
            onComplete: settle,
          }),
        );
      }
      return () => {
        for (const c of running) c.stop();
      };
    }

    // Revealed: the curtain is gone; nothing runs.
    veil.jump(0);
  }, [
    phase,
    hold,
    motionSafe,
    exit,
    count,
    exitDuration,
    parts,
    veil,
    pageScale,
  ]);

  const covered = phase !== "revealed";
  const Frame = FRAMES[kind];
  const frameProps: FrameProps = {
    variant: kind,
    shown,
    brand,
    caption,
    stages,
    accent,
    curtainColor,
    inkColor,
    ready: phase !== "loading",
  };
  const name = label ?? `Loading ${brand}`;
  const face = (
    <div
      className="absolute inset-0"
      style={{ background: curtainColor, color: inkColor }}
    >
      <Frame {...frameProps} />
    </div>
  );

  return (
    <div
      className={cn(
        // A size container: the frames measure both its width and its height.
        "[container-type:size] relative isolate h-full w-full overflow-clip",
        className,
      )}
    >
      <motion.div
        inert={covered}
        aria-busy={covered || undefined}
        className="absolute inset-0"
        style={{ scale: pageScale }}
      >
        {children}
      </motion.div>
      <motion.div
        aria-hidden
        className={cn(
          "absolute inset-0 z-10 select-none",
          phase === "revealed" && "invisible",
        )}
        style={{ opacity: veil, color: inkColor }}
      >
        {phase === "lifting" && motionSafe
          ? Array.from({ length: count }, (_, i) => (
              <Part
                key={`${exit}-${count}-${i}`}
                values={parts[i] as PartValues}
                clip={clipOf(exit, i, count)}
              >
                {face}
              </Part>
            ))
          : // At rest the curtain is one sheet: parts would show their seams.
            face}
      </motion.div>
      {covered ? (
        <div
          role="progressbar"
          aria-label={name}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct} percent`}
          className="sr-only"
        />
      ) : null}
      <p role="status" className="sr-only">
        {phase === "revealed" ? `${brand} loaded.` : ""}
      </p>
    </div>
  );
}
