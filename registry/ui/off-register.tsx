"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OffRegisterElement = "h1" | "h2" | "h3" | "p" | "div";
export type OffRegisterPaper = "cream" | "white" | "kraft" | "slate";

export type OffRegisterProps = {
  /** The headline, as a string. Wins over `text`. */
  children?: string;
  /** The headline, when it is not given as children. @default "Printed in four inks" */
  text?: string;
  /** The element that carries the headline. @default "h2" */
  as?: OffRegisterElement;
  /** How many inks print the line, 2 to 4: key and magenta, then cyan, then yellow. @default 4 */
  plates?: number;
  /** How far the plates slip apart near the pointer, 0 (they hold) to 1. @default 0.5 */
  slip?: number;
  /** The stock it is printed on; slate is a dark sheet printed in light inks. @default "cream" */
  paperTone?: OffRegisterPaper;
  /** The inks, key first, as CSS colours; overrides the paper's own set. */
  inks?: string[];
  /** How far from the pointer the plates feel it, em. @default 2.4 */
  radius?: number;
  /** How much the pointer's speed shakes the plates, 0 (speed adds nothing) to 1. @default 0.6 */
  shake?: number;
  /** How long the plates take to ease back into register, ms. @default 800 */
  settle?: number;
  /** Draw register marks in the sheet's margins; they slip with the letters nearest them. @default true */
  marks?: boolean;
  /** Give the paper a fine tooth. @default true */
  grain?: boolean;
  /** Keyboard focus slips the whole line once; Enter slips it again. @default true */
  focusSlip?: boolean;
  /** A small imprint line printed under the headline, in the key ink. */
  caption?: React.ReactNode;
  /** The pointer and keys move the plates. @default true */
  interactive?: boolean;
  /** No slipping by pointer or key, and no focus stop. @default false */
  disabled?: boolean;
  /** The plates left register (false) or came back into it (true), with the largest slip of that excursion, px. */
  onRegisterChange?: (inRegister: boolean, slip: number) => void;
  className?: string;
};

type Paper = {
  sheet: string;
  blend: "multiply" | "screen";
  inks: readonly string[];
  grain: number;
};

/**
 * The stocks and their inks. Fixed pigments, like the paper and ink they
 * are, so the sheet reads the same on either theme.
 */
const PAPERS: Record<OffRegisterPaper, Paper> = {
  cream: {
    sheet: "oklch(0.965 0.022 85)",
    blend: "multiply",
    inks: [
      "oklch(0.24 0.012 260)",
      "oklch(0.62 0.23 355)",
      "oklch(0.74 0.13 222)",
      "oklch(0.9 0.16 98)",
    ],
    grain: 0.1,
  },
  white: {
    sheet: "oklch(0.988 0.003 95)",
    blend: "multiply",
    inks: [
      "oklch(0.22 0.01 260)",
      "oklch(0.6 0.24 355)",
      "oklch(0.72 0.14 225)",
      "oklch(0.9 0.17 98)",
    ],
    grain: 0.06,
  },
  kraft: {
    sheet: "oklch(0.79 0.055 70)",
    blend: "multiply",
    inks: [
      "oklch(0.22 0.02 40)",
      "oklch(0.6 0.2 20)",
      "oklch(0.66 0.11 230)",
      "oklch(0.88 0.13 95)",
    ],
    grain: 0.14,
  },
  slate: {
    sheet: "oklch(0.27 0.014 255)",
    blend: "screen",
    inks: [
      "oklch(0.9 0.012 90)",
      "oklch(0.58 0.21 355)",
      "oklch(0.64 0.13 222)",
      "oklch(0.76 0.15 95)",
    ],
    grain: 0.12,
  },
};

/** Each plate's direction of slip, how far it goes, and how much it turns (deg). */
const PLATES = [
  { dx: 0.35, dy: 0.25, gain: 0.3, turn: 0.4 },
  { dx: 1, dy: -0.2, gain: 1, turn: 1.8 },
  { dx: -0.72, dy: -0.66, gain: 0.95, turn: -2.2 },
  { dx: 0.18, dy: 1, gain: 0.85, turn: 1.3 },
] as const;

const STEP = 1 / 120;
/** Slip at full `slip`, as a share of the em. */
const REACH = 0.16;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

function graphemes(text: string): string[] {
  const Seg = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => { segment: (t: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

/** The headline as words of letters; each letter keeps its index in the line. */
function wordsOf(text: string) {
  const words: { letters: string[]; start: number }[] = [];
  let index = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const letters = graphemes(word);
    words.push({ letters, start: index });
    index += letters.length;
  }
  return { words, count: index };
}

type Knobs = {
  plates: number;
  slip: number;
  radius: number;
  shake: number;
  settle: number;
  motionSafe: boolean;
  live: boolean;
};

/**
 * A headline printed in up to four inks on a sheet of paper. Each plate is a
 * real copy of the line in one ink, stacked in register and blended like
 * ink on paper — multiplied on light stock, screened on dark — so in
 * register the line reads as one rich colour, and where plates part their
 * edges show and their crossings overprint.
 *
 * Near the pointer every letter of every plate slips along that plate's own
 * direction, with a small turn, as far as `slip` and the distance allow.
 * Each letter of each plate is a mass on a spring: going out it rides the
 * recoil calibration, so a fast pass — whose speed raises both the reach and
 * a judder in the targets — shakes the plates and lets them overshoot;
 * coming home it rides a critically damped spring, so the line eases back
 * into register without a bounce. Register marks in the margins slip with
 * the letters nearest them. Keyboard focus slips the whole line once, left
 * to right; Enter does it again. Under reduced motion the plates step to a
 * hairline off register while pointed at or focused, and step back.
 */
export function OffRegister({
  children,
  text,
  as = "h2",
  plates = 4,
  slip = 0.5,
  paperTone = "cream",
  inks,
  radius = 2.4,
  shake = 0.6,
  settle = 800,
  marks = true,
  grain = true,
  focusSlip = true,
  caption,
  interactive = true,
  disabled = false,
  onRegisterChange,
  className,
}: OffRegisterProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const grainId = `${uid}-grain`;
  const line =
    (typeof children === "string" ? children : text) ?? "Printed in four inks";
  const model = React.useMemo(() => wordsOf(line), [line]);
  const n = model.count;
  const paper = PAPERS[paperTone] ?? PAPERS.cream;
  const plateCount = clamp(Math.round(plates), 2, 4);
  const colours = React.useMemo(() => {
    const own = paper.inks;
    return Array.from(
      { length: plateCount },
      (_, p) => inks?.[p] ?? own[p] ?? own[0] ?? "currentColor",
    );
  }, [inks, paper, plateCount]);
  const live = interactive && !disabled;

  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const keyRef = React.useRef<HTMLSpanElement | null>(null);
  /** Letter spans per plate, and the register marks per plate (left, right). */
  const letters = React.useRef<(HTMLSpanElement | null)[][]>([]);
  const markEls = React.useRef<(SVGSVGElement | null)[][]>([]);
  const report = React.useRef(onRegisterChange);
  const knobs = React.useRef<Knobs>({
    plates: plateCount,
    slip,
    radius,
    shake,
    settle,
    motionSafe,
    live,
  });

  /** The simulation: per letter per plate, offset and velocity in x, y and turn. */
  const sim = React.useRef({
    cx: new Float64Array(0),
    cy: new Float64Array(0),
    x: new Float64Array(0),
    y: new Float64Array(0),
    r: new Float64Array(0),
    vx: new Float64Array(0),
    vy: new Float64Array(0),
    vr: new Float64Array(0),
    kick: new Float64Array(0),
    em: 16,
    pointer: null as { x: number; y: number; t: number } | null,
    speed: 0,
    clock: 0,
    wave: -1,
    still: false,
    inRegister: true,
    peak: 0,
  });
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const visible = React.useRef(false);
  const api = React.useRef<{ kick: () => void; paint: () => void } | null>(
    null,
  );

  React.useLayoutEffect(() => {
    report.current = onRegisterChange;
    knobs.current = {
      plates: plateCount,
      slip,
      radius,
      shake,
      settle,
      motionSafe,
      live,
    };
  });

  const measure = React.useCallback(() => {
    const key = keyRef.current;
    const s = sim.current;
    if (!key) return;
    s.em = parseFloat(getComputedStyle(key).fontSize) || 16;
    const spans = letters.current[0] ?? [];
    if (s.cx.length !== n) {
      s.cx = new Float64Array(n);
      s.cy = new Float64Array(n);
      for (const k of ["x", "y", "r", "vx", "vy", "vr"] as const) {
        s[k] = new Float64Array(n * 4);
      }
      s.kick = new Float64Array(n);
    }
    for (let i = 0; i < n; i += 1) {
      const el = spans[i];
      if (!el) continue;
      // Offsets ignore transforms, so a slipping plate never moves its own centre.
      let x = el.offsetWidth / 2;
      let y = el.offsetHeight / 2;
      let node: HTMLElement | null = el;
      while (node && node !== key) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      s.cx[i] = x;
      s.cy[i] = y;
    }
  }, [n]);

  React.useEffect(() => {
    const s = sim.current;

    const paint = () => {
      const P = knobs.current.plates;
      for (let p = 0; p < 4; p += 1) {
        const spans = letters.current[p];
        if (!spans) continue;
        for (let i = 0; i < n; i += 1) {
          const el = spans[i];
          if (!el) continue;
          const o = p * n + i;
          const x = p < P ? (s.x[o] ?? 0) : 0;
          const y = p < P ? (s.y[o] ?? 0) : 0;
          const r = p < P ? (s.r[o] ?? 0) : 0;
          el.style.transform =
            x === 0 && y === 0 && r === 0
              ? ""
              : `translate(${r2(x)}px, ${r2(y)}px) rotate(${r2(r)}deg)`;
        }
        // The marks follow the first and last letters of their plate.
        const pair = markEls.current[p];
        if (pair) {
          for (let side = 0; side < 2; side += 1) {
            const mark = pair[side];
            if (!mark) continue;
            const o = p * n + (side === 0 ? 0 : Math.max(0, n - 1));
            const x = (s.x[o] ?? 0) * 1.3;
            const y = (s.y[o] ?? 0) * 1.3;
            mark.style.transform =
              x === 0 && y === 0 ? "" : `translate(${r2(x)}px, ${r2(y)}px)`;
          }
        }
      }
    };

    const registerCheck = () => {
      let worst = 0;
      const len = n * knobs.current.plates;
      for (let o = 0; o < len; o += 1) {
        const d = Math.hypot(s.x[o] ?? 0, s.y[o] ?? 0);
        if (d > worst) worst = d;
      }
      if (s.inRegister && worst > 0.6) {
        s.inRegister = false;
        s.peak = worst;
        report.current?.(false, Number(worst.toFixed(2)));
      } else if (!s.inRegister) {
        s.peak = Math.max(s.peak, worst);
        if (worst < 0.12) {
          s.inRegister = true;
          report.current?.(true, Number(s.peak.toFixed(2)));
          s.peak = 0;
        }
      }
    };

    const step = (dt: number): boolean => {
      const k = knobs.current;
      const em = s.em;
      const R = Math.max(0.3, k.radius) * em;
      const reach = clamp01(k.slip) * REACH * em;
      // Speed raises the reach and puts a judder into the targets.
      const e = Math.min(1.6, s.speed / 1100) * clamp01(k.shake);
      const back = 5.8 / Math.max(0.12, k.settle / 1000);
      const kb = back * back;
      const cb = 2 * back;
      const out = springs.recoil;
      s.clock += dt;
      let moving = false;
      const pt = s.pointer;
      for (let i = 0; i < n; i += 1) {
        let f = 0;
        if (pt) {
          const dx = (s.cx[i] ?? 0) - pt.x;
          const dy = ((s.cy[i] ?? 0) - pt.y) * 1.25;
          f = Math.exp(-(dx * dx + dy * dy) / (R * R));
        }
        // The keyboard's wave: each letter gets one push as it passes.
        if (s.wave >= 0 && (s.kick[i] ?? 0) === 0) {
          const at = i * cascade(n);
          if (s.clock - s.wave >= at) {
            s.kick[i] = 1;
            for (let p = 0; p < k.plates; p += 1) {
              const pl = PLATES[p];
              if (!pl) continue;
              const o = p * n + i;
              const push = reach * 18 * pl.gain;
              s.vx[o] = (s.vx[o] ?? 0) + pl.dx * push;
              s.vy[o] = (s.vy[o] ?? 0) + pl.dy * push;
              s.vr[o] = (s.vr[o] ?? 0) + pl.turn * 9;
            }
          }
        }
        for (let p = 0; p < k.plates; p += 1) {
          const pl = PLATES[p];
          if (!pl) continue;
          const o = p * n + i;
          const amp = reach * pl.gain * f * (1 + e * 0.9);
          const jitter =
            e > 0.01 && f > 0.01
              ? reach *
                0.55 *
                e *
                f *
                Math.sin(s.clock * 33 + i * 1.7 + p * 2.3)
              : 0;
          const tx = pl.dx * amp + jitter * -pl.dy;
          const ty = pl.dy * amp + jitter * pl.dx;
          const tr = pl.turn * f * (0.6 + e * 0.8) * clamp01(k.slip) * 2;
          const x = s.x[o] ?? 0;
          const y = s.y[o] ?? 0;
          const r = s.r[o] ?? 0;
          const outward = tx * tx + ty * ty > x * x + y * y;
          const kk = outward ? out.stiffness / out.mass : kb;
          const cc = outward ? out.damping / out.mass : cb;
          let vx = s.vx[o] ?? 0;
          let vy = s.vy[o] ?? 0;
          let vr = s.vr[o] ?? 0;
          vx += (kk * (tx - x) - cc * vx) * dt;
          vy += (kk * (ty - y) - cc * vy) * dt;
          vr += (kk * (tr - r) - cc * vr) * dt;
          const nx = x + vx * dt;
          const ny = y + vy * dt;
          const nr = r + vr * dt;
          const resting =
            Math.abs(nx - tx) < 0.01 &&
            Math.abs(ny - ty) < 0.01 &&
            Math.abs(nr - tr) < 0.01 &&
            Math.abs(vx) + Math.abs(vy) + Math.abs(vr) < 0.05;
          if (resting) {
            s.x[o] = tx;
            s.y[o] = ty;
            s.r[o] = tr;
            s.vx[o] = 0;
            s.vy[o] = 0;
            s.vr[o] = 0;
          } else {
            moving = true;
            s.x[o] = nx;
            s.y[o] = ny;
            s.r[o] = nr;
            s.vx[o] = vx;
            s.vy[o] = vy;
            s.vr[o] = vr;
          }
        }
      }
      if (s.wave >= 0) {
        if (s.clock - s.wave < n * cascade(n) + 0.05) moving = true;
        else s.wave = -1;
      }
      s.speed *= Math.exp(-dt * 7);
      if (s.speed > 4) moving = true;
      else s.speed = 0;
      return moving;
    };

    /** Reduced motion: a hairline off register while pointed at or focused, at once. */
    const still = () => {
      const k = knobs.current;
      const off = s.still ? 0.045 * s.em * Math.max(0.3, clamp01(k.slip)) : 0;
      for (let p = 0; p < 4; p += 1) {
        const pl = PLATES[p];
        for (let i = 0; i < n; i += 1) {
          const o = p * n + i;
          s.x[o] = p < k.plates && pl ? pl.dx * off * pl.gain : 0;
          s.y[o] = p < k.plates && pl ? pl.dy * off * pl.gain : 0;
          s.r[o] = 0;
          s.vx[o] = 0;
          s.vy[o] = 0;
          s.vr[o] = 0;
        }
      }
    };

    const tick = (now: number) => {
      raf.current = 0;
      if (!visible.current || document.hidden) {
        last.current = 0;
        return;
      }
      const dt = last.current
        ? Math.min(0.05, (now - last.current) / 1000)
        : 1 / 60;
      last.current = now;
      let moving = false;
      if (knobs.current.motionSafe) {
        const steps = Math.max(1, Math.round(dt / STEP));
        for (let i = 0; i < steps; i += 1) moving = step(dt / steps) || moving;
      } else {
        still();
      }
      paint();
      registerCheck();
      if (moving) raf.current = window.requestAnimationFrame(tick);
      else last.current = 0;
    };

    const kick = () => {
      if (raf.current || !visible.current || document.hidden) return;
      raf.current = window.requestAnimationFrame(tick);
    };

    api.current = { kick, paint };
    return () => {
      if (raf.current) window.cancelAnimationFrame(raf.current);
      raf.current = 0;
      api.current = null;
    };
  }, [n]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // A change of plates, slip or motion preference repaints at once.
  React.useEffect(() => {
    api.current?.paint();
    api.current?.kick();
  }, [plateCount, slip, motionSafe]);

  const bindSheet = React.useCallback(
    (node: HTMLDivElement | null) => {
      sheetRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => measure());
      sizer.observe(node);
      void document.fonts?.ready.then(() => measure());
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        if (visible.current) api.current?.kick();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        visible.current = false;
      };
    },
    [measure],
  );

  React.useLayoutEffect(() => {
    measure();
  }, [measure, line]);

  const pointAt = (clientX: number, clientY: number, t: number) => {
    const key = keyRef.current;
    const s = sim.current;
    if (!key || !live) return;
    const rect = key.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const prev = s.pointer;
    if (prev) {
      const dt = Math.max(8, t - prev.t) / 1000;
      const v = Math.hypot(x - prev.x, y - prev.y) / dt;
      s.speed = Math.max(s.speed * 0.6, Math.min(4000, v));
    }
    s.pointer = { x, y, t };
    if (!knobs.current.motionSafe) s.still = true;
    api.current?.kick();
  };

  const letGo = () => {
    const s = sim.current;
    s.pointer = null;
    if (!knobs.current.motionSafe) s.still = false;
    api.current?.kick();
  };

  const wave = () => {
    const s = sim.current;
    if (!live || !focusSlip) return;
    if (!knobs.current.motionSafe) {
      s.still = true;
      api.current?.kick();
      return;
    }
    s.wave = s.clock;
    s.kick.fill(0);
    api.current?.kick();
  };

  const Tag = as;

  return (
    <div
      ref={bindSheet}
      onPointerMove={(event) => {
        if (event.pointerType === "touch" && event.buttons === 0) return;
        pointAt(event.clientX, event.clientY, event.timeStamp);
      }}
      onPointerDown={(event) =>
        pointAt(event.clientX, event.clientY, event.timeStamp)
      }
      onPointerUp={(event) => {
        if (event.pointerType === "touch") letGo();
      }}
      onPointerCancel={letGo}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") letGo();
      }}
      className={cn(
        "relative isolate overflow-clip rounded-3 border border-hairline px-8 py-6 shadow-[0_1px_2px_color-mix(in_oklab,black_12%,transparent)]",
        live && "touch-pan-y",
        className,
      )}
      style={{ background: paper.sheet }}
    >
      <Tag className="relative m-0">
        <span className="sr-only">{line}</span>
        <span ref={keyRef} className="relative grid">
          {colours.map((ink, p) => (
            <span
              key={p}
              aria-hidden
              className={cn(
                "relative col-start-1 row-start-1 block",
                p === 0
                  ? "z-10 select-text"
                  : "pointer-events-none select-none",
              )}
              style={{ color: ink, mixBlendMode: paper.blend }}
            >
              {model.words.map((word, w) => (
                <React.Fragment key={w}>
                  {w > 0 ? " " : null}
                  <span className="inline-block whitespace-nowrap">
                    {word.letters.map((letter, j) => {
                      const i = word.start + j;
                      return (
                        <span
                          key={j}
                          ref={(node) => {
                            const row = (letters.current[p] ??= []);
                            row[i] = node;
                          }}
                          className="inline-block"
                        >
                          {letter}
                        </span>
                      );
                    })}
                  </span>
                </React.Fragment>
              ))}
            </span>
          ))}
        </span>
      </Tag>
      {caption ? (
        <div
          className="relative mt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
          style={{ color: colours[0], opacity: 0.7 }}
        >
          {caption}
        </div>
      ) : null}
      {marks
        ? colours.map((ink, p) => (
            <React.Fragment key={p}>
              {[0, 1].map((side) => (
                <svg
                  key={side}
                  ref={(node) => {
                    const pair = (markEls.current[p] ??= [null, null]);
                    pair[side] = node;
                  }}
                  aria-hidden
                  viewBox="0 0 16 16"
                  className={cn(
                    "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2",
                    side === 0 ? "left-2" : "right-2",
                  )}
                  style={{ color: ink, mixBlendMode: paper.blend }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1}
                >
                  <circle cx={8} cy={8} r={4.5} />
                  <path d="M8 0.5 V15.5 M0.5 8 H15.5" />
                </svg>
              ))}
            </React.Fragment>
          ))
        : null}
      {grain ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
          style={{ opacity: paper.grain, mixBlendMode: paper.blend }}
        >
          <filter id={grainId}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves={2}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${grainId})`} />
        </svg>
      ) : null}
      {live && focusSlip ? (
        <>
          <button
            type="button"
            aria-label="Slip the plates"
            aria-describedby={hintId}
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible")) wave();
            }}
            onBlur={() => {
              if (!knobs.current.motionSafe) letGo();
            }}
            onClick={(event) => {
              if (event.detail === 0) wave();
            }}
            className="pointer-events-none absolute inset-0 rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Focus slips the ink plates across the line once; Enter slips them
            again.
          </span>
        </>
      ) : null}
    </div>
  );
}
