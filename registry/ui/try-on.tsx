"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TryOnWipe = "side" | "radial";
export type TryOnSample = "card" | "button" | "badge";

export type TryOnOption = {
  value: string;
  /** Its name: the swatch's accessible name and the caption while it is tried. */
  label: string;
  /** Any CSS colour. Text laid on it uses `var(--background)`. */
  color: string;
};

export type TryOnProps = {
  /** What can be tried on. @default five token colours: Ink, Cobalt, Moss, Amber, Ember */
  options?: TryOnOption[];
  /** The kept option (controlled). */
  value?: string;
  /** The kept option when uncontrolled. @default the first option */
  defaultValue?: string;
  /** Fires from the click, key or tap that kept a new option. */
  onValueChange?: (value: string) => void;
  /**
   * The option being tried on, as it changes; `null` when the sample is back
   * to the kept one. For previewing the choice somewhere else as well.
   */
  onPreviewChange?: (value: string | null) => void;
  /** Names the list of swatches and heads the caption. @default "Colour" */
  label?: string;
  /** The card's title, the button's label, the badge's text. @default "Preview" */
  sampleText?: string;
  /** Draw your own sample for an option instead of the built-in ones. */
  renderSample?: (option: TryOnOption, sample: TryOnSample) => React.ReactNode;
  /** How a preview arrives: a straight edge from the swatch's side, or a circle grown from it. @default "side" */
  wipe?: TryOnWipe;
  /** Wipe speed as a multiple of the house pace, 0.5 to 2. @default 1 */
  speed?: number;
  /** What the options are tried on. @default "card" */
  sample?: TryOnSample;
  /** Play the swish of each preview and the click of each keep. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const FALLBACK: TryOnOption = {
  value: "ink",
  label: "Ink",
  color: "var(--ink)",
};

const DEFAULT_OPTIONS: TryOnOption[] = [
  FALLBACK,
  { value: "cobalt", label: "Cobalt", color: "var(--accent)" },
  { value: "moss", label: "Moss", color: "var(--success)" },
  { value: "amber", label: "Amber", color: "var(--warn)" },
  { value: "ember", label: "Ember", color: "var(--danger)" },
];

/** Text laid on a filled colour. The colour tokens are tuned to read as text on
 * the background; contrast is symmetric, so the background reads on them. */
const ON = "var(--background)";

/**
 * A tint of `color` over the card. Mixed in oklab, not oklch: the card is
 * achromatic with a nominal hue, and a polar mix would swing the tint through
 * that hue (a green wash turning pink on white).
 */
const tint = (color: string, amount: number) =>
  `color-mix(in oklab, ${color} ${amount}%, var(--card))`;

type Layer = {
  id: number;
  value: string;
  /** Wiping in, or drawing back into its swatch. */
  phase: "in" | "out";
  /** A keep finishing a preview: complete it quickly rather than at pace. */
  fast: boolean;
  /** Bumped every time the layer is brought to the top, so it re-settles. */
  turn: number;
};

type Geometry = {
  width: number;
  height: number;
  /** The swatch's centre, in the mirror's own pixels. */
  ox: number;
  oy: number;
  /** Unit vector from the swatch toward the mirror's centre. */
  dx: number;
  dy: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const EMPTY = "polygon(0px 0px, 0px 0px, 0px 0px)";

/**
 * The mirror rectangle clipped against the half-plane the wipe has covered:
 * everything within `t` of the way from the corner nearest the swatch to the
 * corner farthest from it, measured along the swatch's direction.
 */
function sideClip(g: Geometry, t: number): string {
  const corners = [
    [0, 0],
    [g.width, 0],
    [g.width, g.height],
    [0, g.height],
  ] as const;
  const along = corners.map(([x, y]) => (x - g.ox) * g.dx + (y - g.oy) * g.dy);
  const lo = Math.min(...along);
  const hi = Math.max(...along);
  const reach = lo + (hi - lo) * Math.min(1, Math.max(0, t));
  const points: [number, number][] = [];
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const da = (along[i] ?? 0) - reach;
    const db = (along[(i + 1) % 4] ?? 0) - reach;
    if (!a || !b) continue;
    if (da <= 0) points.push([a[0], a[1]]);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const k = da / (da - db);
      points.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    }
  }
  if (points.length < 3) return EMPTY;
  return `polygon(${points.map(([x, y]) => `${r2(x)}px ${r2(y)}px`).join(", ")})`;
}

/** A circle grown from the swatch until it reaches the farthest corner. */
function radialClip(g: Geometry, t: number): string {
  const far = Math.max(
    Math.hypot(g.ox, g.oy),
    Math.hypot(g.width - g.ox, g.oy),
    Math.hypot(g.ox, g.height - g.oy),
    Math.hypot(g.width - g.ox, g.height - g.oy),
  );
  return `circle(${r2(far * Math.min(1, Math.max(0, t)))}px at ${r2(g.ox)}px ${r2(g.oy)}px)`;
}

const userActivated = (): boolean =>
  typeof navigator !== "undefined" &&
  (navigator.userActivation?.hasBeenActive ?? true);

function Check({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

function BuiltInSample({
  kind,
  option,
  text,
}: {
  kind: TryOnSample;
  option: TryOnOption;
  text: string;
}) {
  const { color } = option;
  if (kind === "button") {
    return (
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-9 items-center gap-2 rounded-2 px-4 text-sm font-medium"
          style={{ backgroundColor: color, color: ON }}
        >
          {text}
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8h9.5M8.5 4l4 4-4 4" />
          </svg>
        </span>
        <span
          className="inline-flex size-9 items-center justify-center rounded-2 border"
          style={{
            color,
            borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
            backgroundColor: tint(color, 12),
          }}
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
          >
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
        </span>
      </div>
    );
  }
  if (kind === "badge") {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span
          className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
          style={{ backgroundColor: color, color: ON }}
        >
          <Check className="size-3 shrink-0" />
          {text}
        </span>
        <span
          className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium"
          style={{
            color,
            borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
            backgroundColor: tint(color, 12),
          }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          {option.label}
        </span>
      </div>
    );
  }
  return (
    <div className="w-full overflow-clip rounded-2 border border-hairline bg-card">
      <div
        className="h-10"
        style={{
          backgroundImage: `linear-gradient(120deg, ${color}, ${tint(color, 45)})`,
        }}
      />
      <div className="flex items-center gap-3 px-3 pt-1.5 pb-2.5">
        <span
          className="-mt-6 inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-card text-sm font-semibold"
          style={{ backgroundColor: color, color: ON }}
        >
          {text.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p
            className="truncate text-sm font-medium text-foreground"
            title={text}
          >
            {text}
          </p>
          <p className="text-xs" style={{ color }}>
            {option.label}
          </p>
        </div>
      </div>
    </div>
  );
}

/** The mirror's backdrop and padding, shared by the base and every preview so they align exactly. */
function Face({
  option,
  sample,
  sampleText,
  renderSample,
  className,
}: {
  option: TryOnOption;
  sample: TryOnSample;
  sampleText: string;
  renderSample?: TryOnProps["renderSample"];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        sample === "card" ? "p-3" : "px-4 py-8",
        className,
      )}
      style={{
        backgroundColor: tint(option.color, 10),
      }}
    >
      {renderSample ? (
        renderSample(option, sample)
      ) : (
        <BuiltInSample kind={sample} option={option} text={sampleText} />
      )}
    </div>
  );
}

/**
 * One preview over the mirror. It owns its own wipe: geometry is read from
 * the swatch and the mirror when it arrives, and its progress runs whenever
 * its phase changes, reporting back when it lands so the stack can drop what
 * it has covered.
 */
function WipeLayer({
  layer,
  wipe,
  speed,
  motionSafe,
  locate,
  onSettled,
  children,
}: {
  layer: Layer;
  wipe: TryOnWipe;
  speed: number;
  motionSafe: boolean;
  locate: (value: string) => Geometry | null;
  onSettled: (id: number, phase: Layer["phase"]) => void;
  children: React.ReactNode;
}) {
  const progress = useMotionValue(0);
  const geometry = useMotionValue<Geometry | null>(null);
  const settled = React.useRef(onSettled);
  React.useEffect(() => {
    settled.current = onSettled;
  });

  React.useLayoutEffect(() => {
    geometry.set(locate(layer.value));
    // Read once, on arrival: the wipe keeps the shape it started with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const target = layer.phase === "in" ? 1 : 0;
    const from = progress.get();
    if (from === target) {
      settled.current(layer.id, layer.phase);
      return;
    }
    const pace = durations.slow / Math.min(2, Math.max(0.5, speed));
    const left = Math.abs(target - from);
    const transition =
      layer.phase === "in"
        ? {
            // The wipe in runs at the chosen pace; reduced motion shortens
            // it to a quick fade rather than a travel.
            duration: layer.fast
              ? durations.fast * left
              : motionSafe
                ? Math.max(durations.blink, pace * left)
                : durations.fast,
            ease: easings.enter,
          }
        : exitFor(
            motionSafe
              ? Math.max(durations.blink, pace * left)
              : durations.fast,
          );
    const controls = animate(progress, target, {
      ...transition,
      onComplete: () => settled.current(layer.id, layer.phase),
    });
    return () => controls.stop();
  }, [
    layer.fast,
    layer.id,
    layer.phase,
    layer.turn,
    motionSafe,
    progress,
    speed,
  ]);

  const clipPath = useTransform(() => {
    const p = progress.get();
    const g = geometry.get();
    if (!motionSafe) return "none";
    if (!g) return EMPTY;
    return wipe === "radial" ? radialClip(g, p) : sideClip(g, p);
  });
  // Reduced motion trades the travelling edge for a cross-fade.
  const opacity = useTransform(progress, (p) => (motionSafe ? 1 : r2(p)));

  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      style={{ clipPath, opacity }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A picker that lets you try an option on before you keep it. Point at a
 * swatch and its look wipes over the sample from the swatch's own side — a
 * straight edge sweeping away from it, or a circle grown from it; move off and
 * the look draws back into its swatch; click and a stamp lands on the sample
 * and the preview becomes the resting state.
 *
 * Each preview is a full copy of the sample clipped by a `clip-path` built per
 * frame from its own progress, on tweens (a clip has no mass): in on the enter
 * curve, out at 0.6× on the exit curve. Hopping between swatches stacks each
 * new wipe over the last. The stamp lands on the recoil spring and the sample
 * dips under it. Swatches are a real listbox: arrow keys move focus and focus
 * previews, Enter or Space keeps, and on touch the first tap tries and the
 * second keeps. Under reduced motion previews cross-fade.
 */
export function TryOn({
  options = DEFAULT_OPTIONS,
  value,
  defaultValue,
  onValueChange,
  onPreviewChange,
  label = "Colour",
  sampleText = "Preview",
  renderSample,
  wipe = "side",
  speed = 1,
  sample = "card",
  sound = false,
  disabled = false,
  className,
}: TryOnProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();

  const first = options[0]?.value ?? "";
  const [own, setOwn] = React.useState(defaultValue ?? first);
  const committed = value ?? own;
  const find = (v: string) =>
    options.find((o) => o.value === v) ?? options[0] ?? FALLBACK;

  const [base, setBase] = React.useState(committed);
  const [stack, setStack] = React.useState<{ next: number; layers: Layer[] }>({
    next: 1,
    layers: [],
  });
  const [asked, setAsked] = React.useState<string | null>(null);
  const [stamp, setStamp] = React.useState<{ n: number; value: string } | null>(
    null,
  );
  const [seen, setSeen] = React.useState({ value: committed, n: 0 });
  const [rover, setRover] = React.useState<string | null>(null);

  const mirrorRef = React.useRef<HTMLDivElement | null>(null);
  const swatches = React.useRef(new Map<string, HTMLButtonElement>());
  const lastPointer = React.useRef("mouse");
  const touchTry = React.useRef<string | null>(null);
  const lastSwish = React.useRef(-Infinity);
  const reported = React.useRef<string | null>(null);
  const scale = useMotionValue(1);

  const report = (v: string | null) => {
    if (reported.current === v) return;
    reported.current = v;
    onPreviewChange?.(v);
  };

  /** Brings a layer for `v` to the top, wiping in; makes one if there is none. */
  const lift = (
    s: { next: number; layers: Layer[] },
    v: string,
    fast: boolean,
  ) => {
    let found: Layer | undefined;
    for (const l of s.layers) if (l.value === v) found = l;
    const rest = s.layers.filter((l) => l !== found);
    const layer: Layer = found
      ? { ...found, phase: "in", fast, turn: s.next }
      : { id: s.next, value: v, phase: "in", fast: false, turn: s.next };
    return { next: s.next + 1, layers: [...rest, layer] };
  };

  // The kept value moved — from a keep, or from the host. Its preview (or a
  // fresh wipe from its swatch) finishes and becomes the base when it lands;
  // a keep that the host took gets its stamp now.
  if (seen.value !== committed) {
    const keep = asked === committed;
    setSeen({ value: committed, n: seen.n + 1 });
    setStack((s) => lift(s, committed, keep));
    if (keep) {
      setStamp({ n: seen.n + 1, value: committed });
      setAsked(null);
    }
  }

  // What the sample shows over the kept look, if anything: the top preview.
  const upper = stack.layers[stack.layers.length - 1];
  const trying =
    upper && upper.phase === "in" && upper.value !== committed
      ? find(upper.value)
      : null;

  // Pitch carries the swatch's place in the row, pan its place on screen.
  // Throttled per picker, and silent until the page has been pressed, so a
  // pointer sweeping the row never wakes audio or stacks swishes into a hiss.
  const swish = React.useCallback(
    (v: string, soft: boolean) => {
      if (!sound || !userActivated()) return;
      const now = performance.now();
      if (now - lastSwish.current < 90) return;
      lastSwish.current = now;
      const index = Math.max(
        0,
        options.findIndex((o) => o.value === v),
      );
      const rect = swatches.current.get(v)?.getBoundingClientRect();
      const pan = rect ? panFrom(rect.left + rect.width / 2, null) : 0;
      audio.play(
        "swish",
        soft
          ? { gain: 0.16, pitch: 0.7, pan }
          : {
              gain: 0.3,
              pitch: 0.85 + (index / Math.max(1, options.length - 1)) * 0.35,
              pan,
            },
      );
    },
    [audio, options, sound],
  );

  const retract = () => {
    report(null);
    const leaving = stack.layers.filter(
      (l) => l.phase === "in" && l.value !== committed,
    );
    if (leaving.length === 0) return;
    const top = leaving[leaving.length - 1];
    if (top) swish(top.value, true);
    setStack((s) => ({
      ...s,
      layers: s.layers.map((l) =>
        l.value === committed ? l : { ...l, phase: "out" as const },
      ),
    }));
  };

  const preview = (v: string) => {
    if (disabled) return;
    if (v === committed) {
      retract();
      return;
    }
    report(v);
    const top = stack.layers[stack.layers.length - 1];
    if (top?.value === v && top.phase === "in") return;
    swish(v, false);
    setStack((s) => lift(s, v, false));
  };

  const keep = (v: string) => {
    if (disabled) return;
    touchTry.current = null;
    if (v === committed) {
      retract();
      return;
    }
    setAsked(v);
    // Uncontrolled, the keep lands now. Controlled, the preview stays a
    // preview until the host answers (see the stamp below), so a refusal
    // never reports a look the sample is still showing as gone.
    if (value === undefined) {
      report(null);
      setOwn(v);
    }
    onValueChange?.(v);
  };

  const onSettled = (id: number, phase: Layer["phase"]) => {
    if (phase === "out") {
      setStack((s) => ({ ...s, layers: s.layers.filter((l) => l.id !== id) }));
      return;
    }
    const layer = stack.layers.find((l) => l.id === id);
    if (!layer) return;
    const landed = layer.value === committed;
    // Once a wipe has covered the mirror, everything under it is hidden:
    // drop it. A wipe of the kept value becomes the base and goes too.
    if (landed) setBase(committed);
    setStack((s) => {
      const at = s.layers.findIndex((l) => l.id === id);
      if (at < 0) return s;
      return { ...s, layers: s.layers.slice(landed ? at + 1 : at) };
    });
  };

  const locate = (v: string): Geometry | null => {
    const mirror = mirrorRef.current;
    const swatch = swatches.current.get(v);
    if (!mirror || !swatch) return null;
    const box = mirror.getBoundingClientRect();
    const sx = mirror.offsetWidth > 0 ? box.width / mirror.offsetWidth : 1;
    const sy = mirror.offsetHeight > 0 ? box.height / mirror.offsetHeight : 1;
    if (!sx || !sy) return null;
    const s = swatch.getBoundingClientRect();
    const width = mirror.clientWidth;
    const height = mirror.clientHeight;
    const ox = (s.left + s.width / 2 - box.left) / sx - mirror.clientLeft;
    const oy = (s.top + s.height / 2 - box.top) / sy - mirror.clientTop;
    const vx = width / 2 - ox;
    const vy = height / 2 - oy;
    const length = Math.hypot(vx, vy);
    return {
      width,
      height,
      ox: r2(ox),
      oy: r2(oy),
      dx: length > 1 ? vx / length : 0,
      dy: length > 1 ? vy / length : -1,
    };
  };

  // The stamp lands: the click is heard on the same frame, the mirror dips
  // under it (flick down, snap back — two springs, never three keyframes on
  // one), and the stamp lifts off after a beat.
  const stampN = stamp?.n;
  React.useEffect(() => {
    if (stampN === undefined) return;
    report(null);
    const rect = mirrorRef.current?.getBoundingClientRect();
    audio.play("click", {
      gain: 0.5,
      pan: rect ? panFrom(rect.right - 24, null) : 0,
    });
    let back: { stop: () => void } | null = null;
    const press = motionSafe
      ? animate(scale, 0.97, {
          ...springs.flick,
          onComplete: () => {
            back = animate(scale, 1, springs.snap);
          },
        })
      : null;
    const leave = window.setTimeout(() => setStamp(null), 1200);
    return () => {
      press?.stop();
      back?.stop();
      scale.set(1);
      window.clearTimeout(leave);
    };
    // Keyed to the stamp itself; audio and motion preferences are read as they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stampN]);

  // On touch there is no leaving: a press anywhere else puts the tried look back.
  React.useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (touchTry.current === null) return;
      const root = mirrorRef.current?.parentElement;
      if (event.target instanceof Node && root?.contains(event.target)) return;
      touchTry.current = null;
      if (reported.current !== null) {
        reported.current = null;
        onPreviewChange?.(null);
      }
      setStack((s) => ({
        ...s,
        layers: s.layers.map((l) =>
          l.value === committed ? l : { ...l, phase: "out" as const },
        ),
      }));
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [committed, onPreviewChange]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Escape puts a tried look back and returns to the kept swatch. With
    // nothing being tried it is left alone, for whatever holds this picker.
    if (event.key === "Escape") {
      if (!trying) return;
      event.preventDefault();
      touchTry.current = null;
      retract();
      swatches.current.get(committed)?.focus();
      return;
    }
    const at = options.findIndex((o) => o.value === (rover ?? committed));
    const n = options.length;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (at + 1) % n;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (at - 1 + n) % n;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = options[next];
    if (target) swatches.current.get(target.value)?.focus();
  };

  const onPress = (v: string, event: React.MouseEvent) => {
    // Space and Enter arrive as clicks with no pointer behind them: a keep.
    if (event.detail === 0 || lastPointer.current !== "touch") {
      keep(v);
      return;
    }
    // Touch has no hover: the first tap tries it on, the second keeps it.
    if (touchTry.current === v) {
      keep(v);
      return;
    }
    touchTry.current = v;
    preview(v);
  };

  const rove = rover ?? committed;
  const baseOption = find(base);
  const stampOption = stamp ? find(stamp.value) : null;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3",
        disabled && "opacity-50",
        className,
      )}
    >
      <motion.div
        ref={mirrorRef}
        aria-hidden
        className="relative overflow-clip rounded-3 border border-hairline [contain:paint]"
        style={{ scale }}
      >
        <Face
          option={baseOption}
          sample={sample}
          sampleText={sampleText}
          renderSample={renderSample}
        />
        {stack.layers.map((layer) => (
          <WipeLayer
            key={layer.id}
            layer={layer}
            wipe={wipe}
            speed={speed}
            motionSafe={motionSafe}
            locate={locate}
            onSettled={onSettled}
          >
            <Face
              option={find(layer.value)}
              sample={sample}
              sampleText={sampleText}
              renderSample={renderSample}
              className="size-full"
            />
          </WipeLayer>
        ))}
        <AnimatePresence>
          {stamp && stampOption ? (
            <motion.span
              key={stamp.n}
              className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-full border-2 border-card"
              style={{
                backgroundColor: stampOption.color,
                color: ON,
                rotate: -8,
              }}
              initial={motionSafe ? { scale: 1.4, opacity: 0 } : { opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                transition: motionSafe
                  ? {
                      scale: springs.recoil,
                      opacity: {
                        duration: durations.fast,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.fast },
              }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            >
              <Check className="size-3.5" />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-ink-3">{label}</span>
          <span
            className="truncate text-foreground"
            title={trying ? `Trying ${trying.label}` : find(committed).label}
          >
            {trying ? `Trying ${trying.label}` : find(committed).label}
          </span>
        </div>
        <div
          role="listbox"
          aria-label={label}
          aria-orientation="horizontal"
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") retract();
          }}
          onBlur={(event) => {
            const to = event.relatedTarget;
            if (to instanceof Node && event.currentTarget.contains(to)) return;
            // The next visit by Tab lands on the kept swatch again.
            setRover(null);
            if (touchTry.current === null) retract();
          }}
          // Spread across the sample's width, so each swatch's wipe comes
          // from a visibly different side.
          className="flex flex-wrap items-center justify-between gap-2"
        >
          {options.map((option) => {
            const kept = option.value === committed;
            const tried = trying?.value === option.value;
            return (
              <button
                key={option.value}
                ref={(node) => {
                  if (node) swatches.current.set(option.value, node);
                  else swatches.current.delete(option.value);
                }}
                type="button"
                role="option"
                aria-selected={kept}
                aria-label={option.label}
                title={option.label}
                tabIndex={option.value === rove ? 0 : -1}
                disabled={disabled}
                onPointerDown={(event) => {
                  lastPointer.current = event.pointerType;
                }}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") preview(option.value);
                }}
                onFocus={() => {
                  setRover(option.value);
                  preview(option.value);
                }}
                onClick={(event) => onPress(option.value, event)}
                className="relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
              >
                {kept ? (
                  <motion.span
                    layoutId={`${uid}-kept`}
                    aria-hidden
                    className="absolute inset-0 rounded-full border-2 border-foreground"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <motion.span
                  aria-hidden
                  className="size-5 rounded-full ring-1 ring-hairline-strong ring-inset"
                  style={{ backgroundColor: option.color }}
                  animate={{ scale: tried && motionSafe ? 1.15 : 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
