"use client";

import * as React from "react";

import { Check } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SwatchLadderSwatch = {
  /** The paint's name, read out when its strip is lifted. */
  name: string;
  /** OKLCH hue of the paint, degrees. */
  hue: number;
  /** OKLCH chroma at its strongest, about 0 to 0.16. */
  chroma: number;
  /** A colour code printed at the foot of the strip. */
  code?: string;
};

export type SwatchLadderCopyInfo = {
  name: string;
  code?: string;
  /** Which chip, 1 (palest) to `steps` (deepest). */
  step: number;
};

export type SwatchLadderProps = {
  /** The paints, one strip each. @default twelve invented paints */
  swatches?: SwatchLadderSwatch[];
  /** How many strips stand in the row, 3 to 12 (never more than `swatches`). @default 8 */
  strips?: number;
  /** Chips on each strip, palest to deepest, 4 to 9. @default 7 */
  steps?: number;
  /** How far the strips rise and fall in the travelling wave, 0 (still) to 1. @default 0.5 */
  wave?: number;
  /** Seconds for one swell to pass, 2 to 14. @default 6 */
  period?: number;
  /** How deep the darkest chip goes: 0 keeps to pale tints, 1 runs almost to black. @default 0.6 */
  shade?: number;
  /** How far a strip lifts clear when it is read, px, 6 to 28. @default 16 */
  lift?: number;
  /** Height of a strip, px. @default 144 */
  height?: number;
  /** Controlled: the strip being read, or null. */
  value?: number | null;
  /** Initial strip when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the hover, touch or key that lifted or lowered a strip. */
  onValueChange?: (index: number | null) => void;
  /** Fires when a chip is copied, with its colour as `oklch(L C H)`. */
  onCopy?: (color: string, info: SwatchLadderCopyInfo) => void;
  /** The strips' card stock; any CSS colour. @default a warm paper pigment */
  paper?: string;
  /** Show the line under the row that reads the lifted strip. @default true */
  showReadout?: boolean;
  /** The row's accessible name. @default "Paint swatches" */
  label?: string;
  /** Hold the wave still. @default false */
  paused?: boolean;
  /** No lifting or copying. @default false */
  disabled?: boolean;
  className?: string;
};

export const defaultSwatches: SwatchLadderSwatch[] = [
  { name: "Coldbrook Slate", hue: 250, chroma: 0.045, code: "CB-214" },
  { name: "Harbour Teal", hue: 205, chroma: 0.075, code: "HB-415" },
  { name: "Fieldline Sage", hue: 160, chroma: 0.05, code: "FL-241" },
  { name: "Fernworks Moss", hue: 132, chroma: 0.085, code: "FW-118" },
  { name: "Waylight Ochre", hue: 82, chroma: 0.11, code: "WL-077" },
  { name: "Basin Clay", hue: 58, chroma: 0.06, code: "BS-302" },
  { name: "Kiln Terracotta", hue: 38, chroma: 0.12, code: "KL-509" },
  { name: "Orchard Rose", hue: 12, chroma: 0.085, code: "OR-163" },
  { name: "Heather Mauve", hue: 320, chroma: 0.065, code: "HM-228" },
  { name: "Night Ink", hue: 272, chroma: 0.07, code: "NI-090" },
  { name: "Dune Sand", hue: 88, chroma: 0.045, code: "DS-332" },
  { name: "Gaugeworks Iron", hue: 28, chroma: 0.035, code: "GW-640" },
];

const PAPER = "oklch(0.975 0.006 85)";
/** How far each strip's swell lags its left neighbour, radians. */
const LAG = 0.72;
const HOLE = 12;
const FOOT = 13;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

type Chip = { l: number; c: number; h: number; css: string; lrv: number };

/** Light reflectance value (0–100): the chip's luminance, as paint cards print it. */
function lrvOf(L: number, C: number, hue: number): number {
  const h = (hue * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, 0, 1);
  const g = clamp(
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    0,
    1,
  );
  const bl = clamp(
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    0,
    1,
  );
  return Math.round((0.2126 * r + 0.7152 * g + 0.0722 * bl) * 100);
}

/** The ladder: palest at the top, deepest at the foot; chroma swells mid-tone. */
function ladderOf(
  sw: SwatchLadderSwatch,
  steps: number,
  shade: number,
): Chip[] {
  const floor = 0.66 - (0.66 - 0.24) * clamp(shade, 0, 1);
  const out: Chip[] = [];
  for (let j = 0; j < steps; j += 1) {
    const t = steps > 1 ? j / (steps - 1) : 0;
    const l = r3(0.955 - (0.955 - floor) * Math.pow(t, 0.9));
    const k = clamp(1.15 - 2.2 * Math.abs(l - 0.6), 0.22, 1.1);
    const c = r3(clamp(sw.chroma, 0, 0.3) * k);
    const h = Math.round(((sw.hue % 360) + 360) % 360);
    out.push({ l, c, h, css: `oklch(${l} ${c} ${h})`, lrv: lrvOf(l, c, h) });
  }
  return out;
}

const waveAt = (t: number, i: number, period: number) =>
  Math.sin((2 * Math.PI * t) / Math.max(2, period) - i * LAG);

type Copied = { strip: number; step: number; ok: boolean; n: number };

/**
 * A row of paint-chip strips, each a ladder of chips from the palest tint at
 * the top to the deepest shade at the foot, rising and falling in a slow wave
 * that travels across the row. Point at a strip, or arrow to it, and it lifts
 * clear on the snap spring — one crisp overshoot — stills, and grows a touch,
 * while its neighbours part on glide; the readout under the row gives its
 * name, code and the values of the chip under the pointer (OKLCH and the
 * light reflectance value). A click copies that chip as `oklch(L C H)` and a
 * check pops onto it on flick.
 *
 * It is a horizontal listbox with one tab stop: Left and Right move between
 * strips, Home and End jump, Up and Down step lighter and darker, Enter or
 * Space copies, Escape lowers the strip. The wave writes transforms in one
 * loop that runs only on screen, in a visible tab, and while something moves.
 * Under reduced motion the row holds a still, staggered arc and lifted strips
 * change at once; the readout and the copy still answer.
 */
export function SwatchLadder({
  swatches = defaultSwatches,
  strips = 8,
  steps = 7,
  wave = 0.5,
  period = 6,
  shade = 0.6,
  lift = 16,
  height = 144,
  value,
  defaultValue = null,
  onValueChange,
  onCopy,
  paper = PAPER,
  showReadout = true,
  label = "Paint swatches",
  paused = false,
  disabled = false,
  className,
}: SwatchLadderProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const count = Math.max(
    1,
    Math.min(Math.round(clamp(strips, 3, 12)), swatches.length),
  );
  const k = Math.round(clamp(steps, 4, 9));
  const amp = r2(clamp(wave, 0, 1) * 10);
  const rise = clamp(lift, 6, 28);
  const shown = swatches.slice(0, count);
  const ladders = shown.map((sw) => ladderOf(sw, k, shade));

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const active = value !== undefined ? value : own;
  const [chip, setChip] = React.useState(Math.floor(k / 2));
  const [copied, setCopied] = React.useState<Copied | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const stripRefs = React.useRef(new Map<string, HTMLDivElement>());
  const cardRefs = React.useRef(new Map<string, HTMLDivElement>());
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const keyboard = React.useRef(false);
  const copyTimer = React.useRef(0);
  const keyOf = (i: number) => `${i}:${shown[i]?.name ?? ""}`;

  const engine = React.useRef({
    t: 0,
    lift: new Float64Array(0),
    liftV: new Float64Array(0),
    dx: new Float64Array(0),
    dxV: new Float64Array(0),
    raf: 0,
    last: 0,
    visible: false,
  });

  const latest = React.useRef({
    count,
    amp,
    rise,
    period,
    active,
    motionSafe,
    paused,
    keyOf,
  });
  React.useLayoutEffect(() => {
    latest.current = {
      count,
      amp,
      rise,
      period,
      active,
      motionSafe,
      paused,
      keyOf,
    };
  });

  /** Writes every strip's place: the swell, the lift, the parting. */
  const paint = React.useCallback(() => {
    const e = engine.current;
    const L = latest.current;
    for (let i = 0; i < L.count; i += 1) {
      const key = L.keyOf(i);
      const node = stripRefs.current.get(key);
      if (!node) continue;
      const up = e.lift[i] ?? 0;
      const y =
        L.amp * waveAt(e.t, i, L.period) * (1 - clamp(up, 0, 1)) - up * L.rise;
      const s = 1 + 0.035 * up;
      const transform = `translate3d(${r2(e.dx[i] ?? 0)}px, ${r2(y)}px, 0px) scale(${r3(s)})`;
      if (node.style.transform !== transform) node.style.transform = transform;
      node.style.zIndex = up > 0.02 ? "2" : "";
      const card = cardRefs.current.get(key);
      if (card) {
        const u = clamp(up, 0, 1.2);
        const shadow = `0 ${r2(2 + 9 * u)}px ${r2(4 + 12 * u)}px -3px oklch(0 0 0 / ${r3(0.2 + 0.16 * u)})`;
        if (card.style.boxShadow !== shadow) card.style.boxShadow = shadow;
      }
    }
  }, []);

  const loopRef = React.useRef<FrameRequestCallback>(() => {});
  const step = React.useCallback(
    (now: number) => {
      const e = engine.current;
      e.raf = 0;
      if (!e.visible || document.hidden) return;
      const L = latest.current;
      const dt = Math.min(0.05, Math.max(0, (now - e.last) / 1000));
      e.last = now;
      let moving = false;
      const live = L.motionSafe && !L.paused && L.amp > 0;
      if (live) {
        e.t += dt;
        moving = true;
      }
      for (let i = 0; i < L.count; i += 1) {
        const a = L.active;
        const liftTo = a === i ? 1 : 0;
        const d = a === null ? 0 : i - a;
        const near = Math.abs(d);
        const part =
          a === null || d === 0
            ? 0
            : Math.sign(d) * 6 * Math.pow(0.5, near - 1);
        const dxTo = part * clamp(e.lift[a ?? 0] ?? 0, 0, 1);
        if (!L.motionSafe) {
          e.lift[i] = liftTo;
          e.liftV[i] = 0;
          e.dx[i] = 0;
          e.dxV[i] = 0;
          continue;
        }
        const n = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / n;
        let x = e.lift[i] ?? 0;
        let v = e.liftV[i] ?? 0;
        let p = e.dx[i] ?? 0;
        let pv = e.dxV[i] ?? 0;
        const S = springs.snap;
        const G = springs.glide;
        for (let s = 0; s < n; s += 1) {
          v += ((-S.stiffness * (x - liftTo) - S.damping * v) / S.mass) * h;
          x += v * h;
          pv += ((-G.stiffness * (p - dxTo) - G.damping * pv) / G.mass) * h;
          p += pv * h;
        }
        if (Math.abs(x - liftTo) < 0.001 && Math.abs(v) < 0.01) {
          x = liftTo;
          v = 0;
        } else moving = true;
        if (Math.abs(p - dxTo) < 0.01 && Math.abs(pv) < 0.05) {
          p = dxTo;
          pv = 0;
        } else moving = true;
        e.lift[i] = x;
        e.liftV[i] = v;
        e.dx[i] = p;
        e.dxV[i] = pv;
      }
      paint();
      if (moving) e.raf = window.requestAnimationFrame(loopRef.current);
    },
    [paint],
  );
  React.useLayoutEffect(() => {
    loopRef.current = step;
  }, [step]);

  const kick = React.useCallback(() => {
    const e = engine.current;
    if (e.raf || !e.visible || document.hidden) return;
    e.last = performance.now();
    e.raf = window.requestAnimationFrame(loopRef.current);
  }, []);

  // Spring state follows the number of strips; any change wakes the loop.
  React.useEffect(() => {
    const e = engine.current;
    if (e.lift.length !== count) {
      e.lift = new Float64Array(count);
      e.liftV = new Float64Array(count);
      e.dx = new Float64Array(count);
      e.dxV = new Float64Array(count);
    }
    if (!motionSafe) e.t = 0;
    paint();
    kick();
  }, [count, active, amp, rise, period, motionSafe, paused, paint, kick]);

  React.useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const e = engine.current;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      e.visible = Boolean(entry?.isIntersecting);
      if (e.visible) kick();
    });
    watcher.observe(row);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (e.raf) window.cancelAnimationFrame(e.raf);
      e.raf = 0;
    };
  }, [kick]);

  React.useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const choose = (next: number | null) => {
    if (disabled) return;
    const to = next === null ? null : Math.round(clamp(next, 0, count - 1));
    if (to === active) return;
    if (value === undefined) setOwn(to);
    onValueChange?.(to);
  };

  const describe = (i: number, j: number) => {
    const sw = shown[i];
    const c = ladders[i]?.[j];
    if (!sw || !c) return "";
    return `${sw.name}${sw.code ? `, ${sw.code}` : ""}, tint ${j + 1} of ${k}, ${c.css}, LRV ${c.lrv}`;
  };

  const copy = (i: number, j: number) => {
    if (disabled) return;
    const sw = shown[i];
    const c = ladders[i]?.[j];
    if (!sw || !c) return;
    const done = (ok: boolean) => {
      setCopied((prev) => ({ strip: i, step: j, ok, n: (prev?.n ?? 0) + 1 }));
      setSaid((s) => ({
        n: s.n + 1,
        text: ok
          ? `Copied ${sw.name}, tint ${j + 1}: ${c.css}.`
          : `Copy unavailable. ${c.css}.`,
      }));
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(null), 1600);
    };
    onCopy?.(c.css, { name: sw.name, code: sw.code, step: j + 1 });
    const clip =
      typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clip) {
      done(false);
      return;
    }
    clip.writeText(c.css).then(
      () => done(true),
      () => done(false),
    );
  };

  const chipFromPointer = (event: React.PointerEvent, i: number) => {
    const card = cardRefs.current.get(keyOf(i));
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const top = rect.top + HOLE;
    const span = Math.max(1, rect.height - HOLE - FOOT);
    const j = Math.floor(((event.clientY - top) / span) * k);
    const next = clamp(j, 0, k - 1);
    if (next !== chip) setChip(next);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    keyboard.current = true;
    const at = active ?? 0;
    let handled = true;
    if (event.key === "ArrowRight") choose(active === null ? 0 : at + 1);
    else if (event.key === "ArrowLeft") choose(active === null ? 0 : at - 1);
    else if (event.key === "Home") choose(0);
    else if (event.key === "End") choose(count - 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const j = clamp(chip + (event.key === "ArrowUp" ? -1 : 1), 0, k - 1);
      setChip(j);
      if (active === null) choose(0);
      setSaid((s) => ({ n: s.n + 1, text: `Tint ${j + 1} of ${k}.` }));
    } else if (event.key === "Enter" || event.key === " ") {
      if (active === null) choose(0);
      else copy(at, chip);
    } else if (event.key === "Escape") {
      if (active === null) handled = false;
      else choose(null);
    } else handled = false;
    if (handled) event.preventDefault();
  };

  const reading = active !== null ? shown[active] : undefined;
  const readChip = active !== null ? ladders[active]?.[chip] : undefined;
  const optionId = (i: number) => `${uid}-strip-${i}`;
  const headroom = Math.ceil(rise + amp + 2);
  const footroom = Math.ceil(amp + 8);

  return (
    <div className={cn("@container relative flex w-full flex-col", className)}>
      <div
        ref={rowRef}
        role="listbox"
        aria-orientation="horizontal"
        aria-label={label}
        aria-describedby={`${uid}-hint`}
        aria-activedescendant={active !== null ? optionId(active) : undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (event.target !== event.currentTarget) return;
          if (!event.currentTarget.matches(":focus-visible")) return;
          keyboard.current = true;
          if (active === null) choose(0);
        }}
        onBlur={() => {
          keyboard.current = false;
          choose(null);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          if (!keyboard.current) choose(null);
        }}
        className={cn(
          "relative flex touch-pan-y justify-center gap-1 overflow-clip rounded-3 outline-none select-none @[30rem]:gap-2",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled && "opacity-60",
        )}
        style={{ paddingTop: headroom, paddingBottom: footroom }}
      >
        {shown.map((sw, i) => {
          const ladder = ladders[i] ?? [];
          const isActive = active === i;
          const y = r2(amp * waveAt(0, i, period));
          return (
            <div
              key={keyOf(i)}
              id={optionId(i)}
              role="option"
              aria-selected={isActive}
              aria-label={describe(i, isActive ? chip : Math.floor(k / 2))}
              ref={(node) => {
                if (node) stripRefs.current.set(keyOf(i), node);
                else stripRefs.current.delete(keyOf(i));
              }}
              onPointerEnter={(event) => {
                if (disabled) return;
                if (event.pointerType !== "touch") keyboard.current = false;
                choose(i);
                chipFromPointer(event, i);
              }}
              onPointerMove={(event) => {
                if (disabled || active !== i) return;
                chipFromPointer(event, i);
              }}
              onPointerDown={(event) => {
                if (disabled || event.pointerType !== "touch") return;
                choose(i);
                chipFromPointer(event, i);
              }}
              onClick={(event) => {
                if (disabled) return;
                // A click from the keyboard has no pointer behind it; the
                // listbox's own Enter handles that.
                if (event.detail === 0) return;
                copy(i, chip);
              }}
              className={cn(
                "@container relative max-w-16 min-w-5 flex-1 origin-bottom",
                disabled ? "cursor-not-allowed" : "cursor-copy",
              )}
              style={{ transform: `translate3d(0px, ${y}px, 0px) scale(1)` }}
            >
              <div
                ref={(node) => {
                  if (node) cardRefs.current.set(keyOf(i), node);
                  else cardRefs.current.delete(keyOf(i));
                }}
                className="flex flex-col rounded-2 p-[3px]"
                style={{
                  height,
                  backgroundColor: paper,
                  boxShadow: "0 2px 4px -3px oklch(0 0 0 / 0.2)",
                }}
              >
                <div
                  aria-hidden
                  className="flex shrink-0 items-center justify-center"
                  style={{ height: HOLE - 3 }}
                >
                  <span
                    className="block size-[5px] rounded-full"
                    style={{
                      backgroundColor: "oklch(0.86 0.008 85)",
                      boxShadow: "inset 0 1px 1px oklch(0 0 0 / 0.3)",
                    }}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-px overflow-hidden rounded-1">
                  {ladder.map((c, j) => {
                    const lit = isActive && j === chip;
                    const ink =
                      c.l > 0.62
                        ? "oklch(0.25 0.02 260 / 0.75)"
                        : "oklch(1 0 0 / 0.85)";
                    const done =
                      copied &&
                      copied.strip === i &&
                      copied.step === j &&
                      copied.ok;
                    return (
                      <div
                        key={j}
                        aria-hidden
                        className="relative flex flex-1 items-center justify-center overflow-hidden"
                        style={{
                          backgroundColor: c.css,
                          boxShadow: lit
                            ? `inset 0 0 0 1.5px ${ink}`
                            : undefined,
                        }}
                      >
                        {done ? (
                          <motion.span
                            key={copied.n}
                            className="flex"
                            initial={
                              motionSafe
                                ? { scale: 0.4, opacity: 0 }
                                : { opacity: 0 }
                            }
                            animate={{ scale: 1, opacity: 1 }}
                            transition={
                              motionSafe ? springs.flick : { duration: 0.12 }
                            }
                            style={{ color: ink }}
                          >
                            <Check
                              className="size-3 shrink-0"
                              strokeWidth={2.5}
                            />
                          </motion.span>
                        ) : isActive ? (
                          <span
                            className="font-mono text-[8px] leading-none tabular-nums"
                            style={{ color: ink }}
                          >
                            {j + 1}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div
                  aria-hidden
                  className="flex shrink-0 items-end justify-center overflow-hidden"
                  style={{ height: FOOT - 3 }}
                >
                  <span
                    className="hidden truncate font-mono text-[7px] leading-none tracking-[0.04em] @[2.75rem]:block"
                    style={{ color: "oklch(0.42 0.015 260)" }}
                  >
                    {sw.code ?? ""}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {showReadout ? (
        <div aria-hidden className="flex flex-col gap-0.5 px-1 pt-2">
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs leading-snug">
            {reading ? (
              <>
                <span className="font-medium text-foreground">
                  {reading.name}
                </span>
                {reading.code ? (
                  <span className="font-mono text-[10px] text-ink-3">
                    {reading.code}
                  </span>
                ) : null}
                <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                  tint {chip + 1}/{k}
                </span>
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{label}</span>
                <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                  {count} colours
                </span>
              </>
            )}
          </p>
          <p className="font-mono text-[10px] leading-snug text-ink-3 tabular-nums">
            {copied && active !== null && copied.strip === active ? (
              <span className={copied.ok ? "text-signal" : "text-warn"}>
                {copied.ok ? "Copied" : "Copy unavailable"}{" "}
                {ladders[copied.strip]?.[copied.step]?.css}
              </span>
            ) : readChip ? (
              `L ${readChip.l.toFixed(3)} · C ${readChip.c.toFixed(3)} · H ${readChip.h} · LRV ${readChip.lrv}`
            ) : (
              "Point at a strip to read it; click to copy a tint"
            )}
          </p>
        </div>
      ) : null}
      <span id={`${uid}-hint`} className="sr-only">
        Left and Right move between paints, Up and Down step lighter and darker,
        Enter copies the tint, Escape lowers the strip.
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
