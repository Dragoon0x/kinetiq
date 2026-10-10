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
import { easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FoilSheenElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type FoilSheenTrigger = "mount" | "inView" | "hover" | "manual";

/** The foils the press keeps in stock; any CSS colour works too. */
export type FoilTint = "gold" | "silver" | "rose" | "bronze";

export type FoilSheenProps = {
  /** The line, as a string. Wins over `text`. */
  children?: string;
  /** The line, when it is not given as children. */
  text?: string;
  /** The element that carries the line. @default "p" */
  as?: FoilSheenElement;
  /** The foil: a preset, or any CSS colour, mixed at fixed lightnesses so it reads in both themes. @default "gold" */
  tint?: FoilTint | (string & {});
  /** How fast the light crosses the letters, 0.25 to 3 (1 takes 1.4s). @default 1 */
  speed?: number;
  /** The light band's lean off vertical, degrees. @default 18 */
  angle?: number;
  /** Rest between sweeps, ms. @default 3600 */
  interval?: number;
  /** The band's width, % of the line. @default 16 */
  band?: number;
  /** How bright the reflection runs, 0 to 1. @default 0.85 */
  intensity?: number;
  /** How much the foil's micro-texture breaks the reflection into grain, 0 to 1. @default 0.55 */
  grain?: number;
  /** How far the pointer tilts the light, degrees either way. @default 28 */
  tilt?: number;
  /** Seed for the foil's micro-texture. @default 7 */
  seed?: number;
  /** Seat the foil on the page with a faint pressed edge. @default true */
  emboss?: boolean;
  /** The pointer tilts the light and a press catches it; keys do the same. @default true */
  interactive?: boolean;
  /** Hold the light where it rests; no sweeps. @default false */
  paused?: boolean;
  /** Change it to send a sweep across now, as a press would. */
  sweepKey?: number | string;
  /** When the first sweep runs. @default "inView" */
  trigger?: FoilSheenTrigger;
  /** True: the trigger starts the sweeps once and they keep their interval. False: re-entering view or hovering also sends a sweep at once. @default true */
  once?: boolean;
  /** Wait before the first sweep, ms. @default 0 */
  delay?: number;
  /** With trigger "manual": true starts the sweeps, false rests the light. @default false */
  play?: boolean;
  /** The first sweep has crossed the line. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

const PRESETS: Record<FoilTint, string> = {
  gold: "oklch(0.78 0.13 84)",
  silver: "oklch(0.8 0.012 255)",
  rose: "oklch(0.76 0.085 25)",
  bronze: "oklch(0.7 0.1 58)",
};

/**
 * The foil's pigments at fixed lightnesses, then pulled a little toward the
 * page's ink: darker foil on a light page, brighter on a dark one, so the
 * letters hold their edge in both themes.
 */
function pigmentsOf(tint: string) {
  const base = (PRESETS as Record<string, string>)[tint] ?? tint;
  const at = (l: number, c: string) =>
    `color-mix(in oklab, oklch(from ${base} ${l} ${c} h) 82%, var(--foreground))`;
  return {
    dark: at(0.4, "calc(c * 0.9)"),
    deep: at(0.5, "c"),
    mid: at(0.62, "c"),
    light: at(0.79, "calc(c * 0.75)"),
    // The light itself, pulled toward the ink too: near white on a dark
    // page, a pale glint on a light one, so the letters never wash out.
    spec: `color-mix(in oklab, oklch(from ${base} 0.975 calc(c * 0.3) h) 80%, var(--foreground))`,
  };
}

/** Where the light rests between sweeps: off the line. */
const REST = -60;

/** The light follows the hand on glide's constants. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
};

/** A fine speckle tile drawn once per seed and shared by every instance. */
const textures = new Map<number, string>();
function textureOf(seed: number): string | null {
  const known = textures.get(seed);
  if (known) return known;
  if (typeof document === "undefined") return null;
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  let s = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < size * size; i += 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const u = s / 4294967296;
    // Mostly dark with sparse bright flecks: leaf crinkles, it does not hiss.
    const a = Math.round(Math.pow(u, 2.4) * 255);
    image.data[i * 4] = 255;
    image.data[i * 4 + 1] = 255;
    image.data[i * 4 + 2] = 255;
    image.data[i * 4 + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  const url = `url("${canvas.toDataURL("image/png")}")`;
  textures.set(seed, url);
  return url;
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

/**
 * Type hot-stamped in metal foil. The letters are painted with the foil
 * itself — the tint's pigments at fixed lightnesses in broad reflective
 * bands — and two layers of light ride over them, clipped to the same
 * glyphs: a soft, wide glow and a brighter core broken into grain by a
 * seeded micro-texture, the way light catches on real leaf. The band sweeps
 * across the line at an interval on the move ease; the pointer tilts the
 * light on the glide spring and shifts the foil's broad reflections, and a
 * press catches the light — a sweep runs at once from the side you pressed.
 *
 * The foil layer is the real text: it reads, selects and copies as itself,
 * and the light layers are hidden from assistive technology. A keyboard
 * handle tilts the light with the arrow keys and sends a sweep with Enter.
 * Between sweeps nothing runs; off screen or hidden, no sweep is scheduled.
 * Under reduced motion the light rests a third of the way across the line,
 * still and grainy, and Enter swells it in place.
 */
export function FoilSheen({
  children,
  text,
  as = "p",
  tint = "gold",
  speed = 1,
  angle = 18,
  interval = 3600,
  band = 16,
  intensity = 0.85,
  grain = 0.55,
  tilt = 28,
  seed = 7,
  emboss = true,
  interactive = true,
  paused = false,
  sweepKey,
  trigger = "inView",
  once = true,
  delay = 0,
  play = false,
  onComplete,
  className,
}: FoilSheenProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const line = (typeof children === "string" ? children : text) ?? "";
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);
  const active = started && onScreen && !hidden && !paused && motionSafe;
  const [lean, setLean] = React.useState(0);
  const [texture, setTexture] = React.useState<string | null>(null);

  const pig = React.useMemo(() => pigmentsOf(tint), [tint]);
  const reach = clamp(tilt, 0, 60);
  const lowest = -reach;
  const w = clamp(band, 4, 60);

  const pos = useMotionValue(motionSafe ? REST : 34);
  const swell = useMotionValue(0);
  const tiltTarget = useMotionValue(0);
  const shiftTarget = useMotionValue(0);
  const tiltNow = useSpring(tiltTarget, GLIDE);
  const shiftNow = useSpring(shiftTarget, GLIDE);

  const sweepRun = React.useRef<AnimationPlaybackControls | null>(null);
  const swellRun = React.useRef<AnimationPlaybackControls | null>(null);
  const firstDone = React.useRef(false);
  const report = React.useRef(onComplete);
  const safeRef = React.useRef(motionSafe);
  const cfg = React.useRef({ speed, w });
  React.useLayoutEffect(() => {
    report.current = onComplete;
    safeRef.current = motionSafe;
    cfg.current = { speed, w };
  });

  // The broad foil: bands lean with the light and drift as it moves.
  const foil = useTransform(
    [tiltNow, shiftNow] as MotionValue<number>[],
    ([t = 0, s = 0]: number[]) => {
      const a = r2(90 + angle * 0.6 + t * 0.5);
      const o = r2(s);
      return `repeating-linear-gradient(${a}deg, ${pig.dark} ${o}%, ${pig.mid} ${r2(o + 13)}%, ${pig.light} ${r2(o + 24)}%, ${pig.deep} ${r2(o + 38)}%, ${pig.mid} ${r2(o + 50)}%, ${pig.dark} ${r2(o + 64)}%)`;
    },
  );
  const lightAngle = useTransform(tiltNow, (t) => r2(90 + angle + t));
  const glow = useTransform(
    [pos, lightAngle] as MotionValue<number>[],
    ([p = REST, a = 90]: number[]) => {
      const half = w * 1.25;
      return `linear-gradient(${a}deg, transparent ${r2(p - half)}%, color-mix(in oklab, ${pig.spec} 28%, transparent) ${r2(p - half * 0.5)}%, color-mix(in oklab, ${pig.spec} 74%, transparent) ${r2(p)}%, color-mix(in oklab, ${pig.spec} 28%, transparent) ${r2(p + half * 0.5)}%, transparent ${r2(p + half)}%)`;
    },
  );
  const core = useTransform(
    [pos, lightAngle] as MotionValue<number>[],
    ([p = REST, a = 90]: number[]) => {
      const half = w * 0.4;
      return `linear-gradient(${a}deg, transparent ${r2(p - half)}%, ${pig.spec} ${r2(p)}%, transparent ${r2(p + half)}%)`;
    },
  );
  const level = clamp(intensity, 0, 1);
  const glowOpacity = useTransform(swell, (s) =>
    r2(level * (motionSafe ? 1 : 0.6 + 0.4 * s)),
  );
  const coreOpacity = useTransform(swell, (s) =>
    r2(level * (motionSafe ? 1 : 0.5 + 0.5 * s)),
  );

  // Under reduced motion the light rests where a still frame shows it best.
  React.useEffect(() => {
    sweepRun.current?.stop();
    pos.jump(motionSafe ? REST : 34);
  }, [motionSafe, pos]);

  /** One pass of the light; direction 1 runs left to right. */
  const sweep = React.useCallback(
    (direction: 1 | -1) => {
      const c = cfg.current;
      const from = direction > 0 ? -c.w * 1.8 : 100 + c.w * 1.8;
      const to = direction > 0 ? 100 + c.w * 1.8 : -c.w * 1.8;
      sweepRun.current?.stop();
      pos.jump(from);
      const run = animate(pos, to, {
        duration: 1.4 / clamp(c.speed, 0.25, 3),
        ease: easings.move,
      });
      sweepRun.current = run;
      void run.then(() => {
        if (sweepRun.current !== run) return;
        pos.jump(REST);
        sweepRun.current = null;
        if (!firstDone.current) {
          firstDone.current = true;
          report.current?.();
        }
      });
      return run;
    },
    [pos],
  );

  /** A press or a key: a sweep now, or under reduced motion a swell. */
  const catchLight = React.useCallback(
    (direction: 1 | -1) => {
      if (safeRef.current) {
        sweep(direction);
        return;
      }
      swellRun.current?.stop();
      swellRun.current = animate(swell, [0, 1, 0], {
        duration: 0.9,
        ease: easings.move,
      });
    },
    [sweep, swell],
  );

  // The sweeps: the first as soon as the trigger fires, then one every
  // interval, only while the line is on screen in a visible page.
  React.useEffect(() => {
    if (!active) return;
    let id = 0;
    const rest = Math.max(400, interval);
    const go = () => {
      // A sweep the visitor sent is still crossing: this one waits for it.
      if (sweepRun.current) {
        id = window.setTimeout(go, 250);
        return;
      }
      sweep(1);
      id = window.setTimeout(
        go,
        (1.4 / clamp(cfg.current.speed, 0.25, 3)) * 1000 + rest,
      );
    };
    // Coming back into view, a line that plays more than once sweeps at once.
    id = window.setTimeout(go, firstDone.current && once ? rest : 0);
    return () => window.clearTimeout(id);
  }, [active, interval, once, sweep]);

  // A still frame is the whole piece under reduced motion: it is complete as
  // soon as it is shown.
  React.useEffect(() => {
    if (!started || motionSafe || firstDone.current) return;
    firstDone.current = true;
    report.current?.();
  }, [started, motionSafe]);

  React.useEffect(
    () => () => {
      sweepRun.current?.stop();
      swellRun.current?.stop();
    },
    [],
  );

  // A host's sweep, as a press would send it.
  const lastKey = React.useRef(sweepKey);
  React.useEffect(() => {
    if (lastKey.current === sweepKey) return;
    lastKey.current = sweepKey;
    catchLight(1);
  }, [sweepKey, catchLight]);

  // The micro-texture is drawn on the client after mount.
  React.useEffect(() => {
    let cancelled = false;
    const id = window.requestAnimationFrame(() => {
      if (!cancelled) setTexture(textureOf(seed));
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [seed]);

  const timer = React.useRef<number | null>(null);
  const begin = React.useCallback((restart: boolean, wait: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on && !restart ? e : { n: e.n + 1, on: true }));
    }, wait);
  }, []);
  const reset = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin(false, delay);
    if (trigger === "manual") {
      if (play) begin(true, delay);
      else reset();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, delay, begin, reset]);

  const seen = React.useRef({ trigger, delay });
  React.useLayoutEffect(() => {
    seen.current = { trigger, delay };
  });

  const bindRoot = React.useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        const t = seen.current;
        if (t.trigger === "inView" && visible) begin(false, t.delay);
      });
      watcher.observe(node);
      return () => watcher.disconnect();
    },
    [begin],
  );

  const point = (event: React.PointerEvent<HTMLElement>) => {
    if (!interactive || !motionSafe) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / (rect.width || 1), 0, 1);
    const y = clamp((event.clientY - rect.top) / (rect.height || 1), 0, 1);
    tiltTarget.set(r2((x * 2 - 1) * reach));
    shiftTarget.set(r2((y - 0.5) * 24));
  };

  const settleLight = () => {
    tiltTarget.set(lean);
    shiftTarget.set(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    let next: number | undefined;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(reach, lean + 5);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = Math.max(-reach, lean - 5);
        break;
      case "Home":
        next = -reach;
        break;
      case "End":
        next = reach;
        break;
      case "Escape":
        if (lean === 0) return;
        next = 0;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        catchLight(lean > 0 ? -1 : 1);
        return;
      default:
        return;
    }
    event.preventDefault();
    setLean(next);
    tiltTarget.set(next);
    // Under reduced motion the light turns at once, without the spring.
    if (!motionSafe) tiltNow.jump(next);
  };

  const Wrapper = as === "span" ? "span" : "div";
  const Tag = as;
  const g = clamp(grain, 0, 1);
  const mask = texture
    ? `${texture}, linear-gradient(oklch(0 0 0 / ${r2(1 - g)}), oklch(0 0 0 / ${r2(1 - g)}))`
    : undefined;
  const layer =
    "pointer-events-none [grid-area:1/1] bg-clip-text text-transparent select-none";

  return (
    <Wrapper
      ref={bindRoot}
      className={cn(
        "relative",
        as === "span" ? "inline-block" : "block",
        className,
      )}
      onPointerEnter={() => {
        if (trigger !== "hover") return;
        // Hovering a line that plays every time catches the light at once.
        if (!once && started) catchLight(1);
        else begin(false, delay);
      }}
      onPointerMove={point}
      onPointerLeave={settleLight}
      onPointerDown={(event) => {
        if (!interactive) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        // The light comes from the side you pressed.
        catchLight(event.clientX - rect.left < rect.width / 2 ? 1 : -1);
      }}
    >
      <Tag
        className={cn("relative m-0", as === "span" ? "inline-grid" : "grid")}
      >
        <motion.span
          className="bg-clip-text text-transparent [grid-area:1/1] selection:bg-cobalt-wash selection:text-foreground"
          style={{
            backgroundImage: foil,
            filter: emboss
              ? "drop-shadow(0 0.035em 0 color-mix(in oklab, black 24%, transparent))"
              : undefined,
          }}
        >
          {line}
        </motion.span>
        <motion.span
          aria-hidden
          className={layer}
          style={{ backgroundImage: glow, opacity: glowOpacity }}
        >
          {line}
        </motion.span>
        <motion.span
          aria-hidden
          className={layer}
          style={{
            backgroundImage: core,
            opacity: coreOpacity,
            maskImage: mask,
            WebkitMaskImage: mask,
            maskSize: "56px 56px, 100% 100%",
            WebkitMaskSize: "56px 56px, 100% 100%",
          }}
        >
          {line}
        </motion.span>
      </Tag>
      {interactive ? (
        <>
          <span
            role="slider"
            tabIndex={0}
            aria-label="Light angle"
            aria-describedby={hintId}
            aria-orientation="horizontal"
            aria-valuemin={lowest}
            aria-valuemax={reach}
            aria-valuenow={lean}
            aria-valuetext={
              lean === 0
                ? `Light at ${Math.round(angle)} degrees`
                : `Light tilted ${Math.abs(lean)} degrees ${lean > 0 ? "right" : "left"}`
            }
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (trigger === "hover") begin(!once, delay);
            }}
            onBlur={() => {
              setLean(0);
              tiltTarget.set(0);
              if (!motionSafe) tiltNow.jump(0);
            }}
            className="pointer-events-none absolute inset-0 rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Left and Right tilt the light across the foil; Enter sends it across
            the letters.
          </span>
        </>
      ) : null}
    </Wrapper>
  );
}
