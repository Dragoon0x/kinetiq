"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  project,
  rubberband,
  useDrag,
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type CrestLine = string | { text: string; meta?: string };

export type CrestReaderProps = {
  /** The rows: a string, or text with a short tag shown before it. */
  lines?: CrestLine[];
  /** The line on the crest. */
  value?: number;
  /** The line on the crest at first, when uncontrolled. @default 0 */
  defaultValue?: number;
  /** From the wheel, drag, tap or key that carried a new line onto the crest. */
  onValueChange?: (index: number) => void;
  /** How high the crest stands and how far the rest sink, 0 to 1. @default 0.6 */
  swell?: number;
  /** Blur of the farthest rows, px. @default 1.5 */
  blur?: number;
  /** Gap between rows on the surface, em. @default 0.9 */
  lineGap?: number;
  /** Angle of the sea's surface, degrees: low lies flat and far, high stands rows up. @default 62 */
  tilt?: number;
  /** Where the crest sits, as a fraction of the height. @default 0.62 */
  crestAt?: number;
  /** Speed of the slow swell passing through, 0 (still) to 2. @default 1 */
  speed?: number;
  /** The stage's height, px. @default 420 */
  height?: number;
  /** The mouse wheel moves the crest; at either end it scrolls the page again. @default true */
  wheel?: boolean;
  /** Row alignment. @default "center" */
  align?: "center" | "start";
  /** Hold the swell still. @default false */
  paused?: boolean;
  /** No input. @default false */
  disabled?: boolean;
  /** Accessible name of the list. @default "Lines" */
  label?: string;
  className?: string;
};

export const defaultCrestLines: CrestLine[] = [
  { meta: "4.2", text: "Exports finish in the background" },
  { meta: "Sync", text: "Drafts sync the moment you reconnect" },
  { meta: "Search", text: "Search reads inside attachments" },
  { meta: "Teams", text: "Guests can comment without an account" },
  { meta: "Maps", text: "Basin maps load twice as fast" },
  { meta: "Fix", text: "Dates no longer drift across time zones" },
  { meta: "Fix", text: "Long names wrap instead of clipping" },
  { meta: "Admin", text: "The audit log keeps a full year" },
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Rows measured before the page has laid them out: a nominal line, px. */
const NOMINAL = 26;
/** A swell takes this long to pass, s at speed 1. */
const PERIOD = 5.5;

type Row = {
  y: MotionValue<number>;
  scaleX: MotionValue<number>;
  scaleY: MotionValue<number>;
  opacity: MotionValue<number>;
  filter: MotionValue<string>;
  color: MotionValue<string>;
};

type Pose = {
  y: number;
  sx: number;
  sy: number;
  opacity: number;
  blur: number;
  ink: number;
  /** How much of a crest it is on, 0 to 1. */
  sigma: number;
  h: number;
};

type Knobs = {
  swell: number;
  blur: number;
  gap: number;
  tilt: number;
  crestAt: number;
  height: number;
};

/**
 * Every row's pose for a crest at `c` and swell time `t`. Rows are stacked
 * outward from the crest by their on-screen heights, so nothing overlaps
 * however the surface tilts: ahead, each row recedes (perspective scale) and
 * lies back (vertical foreshortening); behind, it sinks into the trough.
 */
function poses(
  heights: number[],
  c: number,
  t: number,
  k: Knobs,
  out: Pose[],
  along: Float64Array,
  centres: Float64Array,
): Pose[] {
  const n = heights.length;
  const gap = k.gap;
  const sinT = Math.sin((k.tilt * Math.PI) / 180);
  const cosT = Math.cos((k.tilt * Math.PI) / 180);
  const lying = 1 - (1 - cosT) * 0.65;
  const focal = k.height * 2;
  // Distance along the surface to each row's centre.
  let at = 0;
  for (let i = 0; i < n; i += 1) {
    const h = heights[i] ?? NOMINAL;
    along[i] = at + h / 2;
    at += h + gap;
  }
  const k0 = clamp(Math.floor(c), 0, Math.max(0, n - 1));
  const k1 = Math.min(n - 1, k0 + 1);
  const frac = clamp01(c - k0);
  const crest = (along[k0] ?? 0) + ((along[k1] ?? 0) - (along[k0] ?? 0)) * frac;
  const pitch = (heights[k0] ?? NOMINAL) + gap;
  for (let i = 0; i < n; i += 1) {
    const h = heights[i] ?? NOMINAL;
    const d = (along[i] ?? 0) - crest;
    const u = d / pitch;
    const sigma = Math.exp(-((u / 0.85) ** 2));
    const ahead = d >= 0;
    const persp = ahead
      ? 1 / (1 + (d * sinT) / focal)
      : 1 - 0.1 * Math.min(1, -u);
    const sx = persp * (1 - k.swell * 0.16 * (1 - sigma));
    const sy = sx * (lying + (1 - lying) * sigma);
    const haze = ahead ? 1 - 0.075 * u : 1 + u / 1.8;
    const pose = out[i] ?? {
      y: 0,
      sx: 1,
      sy: 1,
      opacity: 1,
      blur: 0,
      ink: 1,
      sigma: 1,
      h,
    };
    pose.sx = sx;
    pose.sy = sy;
    pose.h = h;
    pose.opacity = ahead ? Math.max(0.3, haze) : Math.max(0, haze);
    pose.blur = k.blur * Math.min(1, Math.abs(u) / 2.2) * (1 - sigma);
    pose.ink = 0.3 + 0.7 * sigma;
    pose.sigma = sigma;
    // The slow swell passing through: a gentle rise and fall, toward you.
    const bob =
      k.swell * 0.14 * pitch * Math.sin(Math.PI * 2 * (d / (pitch * 3.4) + t));
    pose.y = bob * sx - k.swell * 0.22 * pitch * sigma;
    if (!ahead) pose.y += k.swell * 0.35 * pitch * (1 - sigma);
    out[i] = pose;
  }
  // Stack outward from the row before the crest, so rows never overlap.
  centres.fill(0);
  const screenH = (i: number) => (out[i]?.h ?? NOMINAL) * (out[i]?.sy ?? 1);
  for (let i = k0 + 1; i < n; i += 1) {
    const s = ((out[i]?.sx ?? 1) + (out[i - 1]?.sx ?? 1)) / 2;
    centres[i] =
      (centres[i - 1] ?? 0) -
      (screenH(i - 1) / 2 + gap * s * (cosT * 0.6 + 0.4) + screenH(i) / 2);
  }
  for (let i = k0 - 1; i >= 0; i -= 1) {
    const s = ((out[i]?.sx ?? 1) + (out[i + 1]?.sx ?? 1)) / 2;
    centres[i] =
      (centres[i + 1] ?? 0) + (screenH(i + 1) / 2 + gap * s + screenH(i) / 2);
  }
  const anchor =
    (centres[k0] ?? 0) + ((centres[k1] ?? 0) - (centres[k0] ?? 0)) * frac;
  const crestY = k.height * k.crestAt;
  for (let i = 0; i < n; i += 1) {
    const pose = out[i] as Pose;
    pose.y += crestY + (centres[i] ?? 0) - anchor - pose.h / 2;
  }
  return out;
}

const textOf = (line: CrestLine) =>
  typeof line === "string" ? line : line.text;
const metaOf = (line: CrestLine) =>
  typeof line === "string" ? undefined : line.meta;

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  tick: (now: number) => void;
  kick: () => void;
  pose: () => void;
  measure: () => void;
  wheel: (event: WheelEvent) => void;
  stop: () => void;
};

/**
 * A list read off the sea. The rows lie on a gently rolling surface seen in
 * perspective: the current line rides the crest of a swell a little below the
 * middle — lifted, standing up to face you, full size, sharp and in full ink
 * — while the lines still to come lie ahead on the water, each further one
 * smaller, lying back, softer and fainter toward a hazy horizon, and the line
 * just read sinks past into the trough below. A slow swell keeps passing
 * through, so the far rows rise and fall and the crest line bobs.
 *
 * The crest is one continuous value: the wheel and a drag move it 1:1, a
 * release projects the throw and settles on a line on springs.glide with the
 * release velocity, a tap carries that row to the crest, and the keys glide
 * from line to line. It is a listbox — the crest line is the active option —
 * and the wheel lets the page scroll again at either end. One loop runs while
 * the swell is on screen or the crest is moving. Under reduced motion there is
 * no swell and no glide: the crest jumps, and the rows' ink and focus fade.
 */
export function CrestReader({
  lines = defaultCrestLines,
  value,
  defaultValue = 0,
  onValueChange,
  swell = 0.6,
  blur = 1.5,
  lineGap = 0.9,
  tilt = 62,
  crestAt = 0.62,
  speed = 1,
  height = 420,
  wheel = true,
  align = "center",
  paused = false,
  disabled = false,
  label = "Lines",
  className,
}: CrestReaderProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const n = lines.length;
  const last = Math.max(0, n - 1);
  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, last),
  );
  const current = clamp(Math.round(value ?? own), 0, last);
  const [onScreen, setOnScreen] = React.useState(false);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const stageH = Math.round(clamp(height, 160, 1200));

  const k: Knobs = {
    swell: clamp01(swell),
    blur: clamp(blur, 0, 8),
    gap: 0,
    tilt: clamp(tilt, 20, 80),
    crestAt: clamp(crestAt, 0.25, 0.85),
    height: stageH,
  };
  const ambient =
    motionSafe && !paused && speed > 0 && k.swell > 0 && onScreen && !hidden;

  const crest = useMotionValue(current);
  // Keyed by content, so a host passing a fresh array each render keeps its sea.
  const sig = lines
    .map((l) => `${metaOf(l) ?? ""}\u0001${textOf(l)}`)
    .join("\u0000");
  /** The sea rising in around the crest line, once measured. */
  const arrive = useMotionValue(0);
  // Each row's pose as motion values, starting from the server's frame:
  // nominal heights, the swell at rest. The loop takes over once measured.
  const rows = React.useMemo(() => {
    const first: Pose[] = [];
    poses(
      lines.map(() => NOMINAL),
      current,
      0,
      { ...k, gap: lineGap * 16 },
      first,
      new Float64Array(lines.length),
      new Float64Array(lines.length),
    );
    return lines.map((_, i): Row => {
      const p = first[i];
      return {
        y: motionValue(r2(p?.y ?? 0)),
        scaleX: motionValue(r3(p?.sx ?? 1)),
        scaleY: motionValue(r3(p?.sy ?? 1)),
        // Only the crest line is drawn before the rows are measured; the
        // rest of the sea rises in once they are.
        opacity: motionValue(i === current ? 1 : 0),
        filter: motionValue("none"),
        color: motionValue(
          (p?.ink ?? 1) >= 0.99
            ? "var(--foreground)"
            : `color-mix(in oklab, var(--foreground) ${Math.round((p?.ink ?? 1) * 20) * 5}%, var(--ink-3))`,
        ),
      };
    });
    // Built per list; later frames come from the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const scratch = React.useMemo(
    () => ({
      along: new Float64Array(n),
      centres: new Float64Array(n),
    }),
    [n],
  );

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLDivElement>());
  const geo = React.useRef({ heights: [] as number[], em: 16 });
  const out = React.useRef<Pose[]>([]);
  const frame = React.useRef(0);
  const clock = React.useRef({ t: 0, last: 0 });
  const glide = React.useRef<AnimationPlaybackControls | null>(null);
  const wheelState = React.useRef({ target: current, timer: 0 });
  const dragStart = React.useRef(0);
  const dragging = React.useRef(false);
  const reported = React.useRef(current);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onValueChange);
  const loopCb = React.useCallback((now: number) => api.current?.tick(now), []);

  const knobs = (): Knobs => ({
    ...k,
    gap: lineGap * geo.current.em,
  });

  /** Writes every row's pose for the crest and swell as they stand. */
  const pose = () => {
    const heights = geo.current.heights.length
      ? geo.current.heights
      : lines.map(() => NOMINAL);
    poses(
      heights,
      crest.get(),
      clock.current.t,
      knobs(),
      out.current,
      scratch.along,
      scratch.centres,
    );
    out.current.forEach((p, i) => {
      const row = rows[i];
      if (!row) return;
      row.y.set(r2(p.y));
      row.scaleX.set(r3(p.sx));
      row.scaleY.set(r3(p.sy));
      const a = arrive.get();
      row.opacity.set(r3(clamp01(p.opacity) * (a + (1 - a) * p.sigma)));
      const b = Math.round(p.blur * 4) / 4;
      row.filter.set(b >= 0.25 ? `blur(${b}px)` : "none");
      const ink = Math.round(p.ink * 20) * 5;
      row.color.set(
        ink >= 100
          ? "var(--foreground)"
          : `color-mix(in oklab, var(--foreground) ${ink}%, var(--ink-3))`,
      );
    });
  };

  const moving = () =>
    dragging.current ||
    Boolean(glide.current) ||
    crest.isAnimating() ||
    arrive.isAnimating();

  const tick = (now: number) => {
    frame.current = 0;
    const c = clock.current;
    const dt = c.last ? Math.min(0.05, (now - c.last) / 1000) : 0;
    c.last = now;
    if (ambient) c.t += (dt * clamp(speed, 0, 2)) / PERIOD;
    pose();
    // A kick during this frame may already have queued the next one.
    if (frame.current) return;
    if ((ambient || moving()) && onScreen && !hidden) {
      frame.current = window.requestAnimationFrame(loopCb);
    } else {
      c.last = 0;
    }
  };

  const kick = () => {
    if (frame.current) return;
    if (!onScreen || hidden) {
      pose();
      return;
    }
    clock.current.last = 0;
    frame.current = window.requestAnimationFrame(loopCb);
  };

  /** Reports a new line on the crest, from whatever carried it there. */
  const commit = (index: number) => {
    const next = clamp(Math.round(index), 0, last);
    if (next === reported.current) return next;
    reported.current = next;
    if (value === undefined) setOwn(next);
    report.current?.(next);
    return next;
  };

  /** Glides the crest to a line, carrying any velocity it already has. */
  const settle = (to: number, velocity = 0) => {
    glide.current?.stop();
    wheelState.current.target = to;
    if (!motionSafe) {
      crest.jump(to);
      glide.current = null;
      kick();
      return;
    }
    glide.current = animate(crest, to, {
      ...springs.glide,
      velocity,
      onComplete: () => {
        glide.current = null;
      },
    });
    kick();
  };

  const step = (by: number) => {
    if (disabled || n === 0) return;
    const to = clamp(reported.current + by, 0, last);
    commit(to);
    settle(to);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        step(1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        step(-1);
        break;
      case "PageDown":
        step(3);
        break;
      case "PageUp":
        step(-3);
        break;
      case "Home":
        step(-reported.current);
        break;
      case "End":
        step(last - reported.current);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const pitchPx = () => {
    const hs = geo.current.heights;
    const h = hs[reported.current] ?? NOMINAL;
    return Math.max(12, (h + lineGap * geo.current.em) * 0.9);
  };

  const onWheel = (event: WheelEvent) => {
    if (!wheel || disabled || n < 2) return;
    const dy = wheelPixels(event).y;
    if (Math.abs(dy) < 0.5) return;
    const w = wheelState.current;
    const base = glide.current || crest.isAnimating() ? w.target : crest.get();
    // At either end the page scrolls on, as it would past any list.
    if ((base >= last - 0.01 && dy > 0) || (base <= 0.01 && dy < 0)) return;
    event.preventDefault();
    w.target = clamp(base + dy / (pitchPx() * 1.15), 0, last);
    commit(w.target);
    glide.current?.stop();
    if (!motionSafe) {
      crest.jump(Math.round(w.target));
    } else {
      glide.current = animate(crest, w.target, {
        ...springs.flick,
        onComplete: () => {
          glide.current = null;
        },
      });
    }
    window.clearTimeout(w.timer);
    w.timer = window.setTimeout(() => {
      const to = Math.round(w.target);
      w.target = to;
      commit(to);
      settle(to);
    }, 140);
    kick();
  };

  const rowAt = (clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return -1;
    const y = clientY - stage.getBoundingClientRect().top;
    let best = -1;
    let bestD = Infinity;
    out.current.forEach((p, i) => {
      if (p.opacity < 0.15) return;
      const top = p.y + (p.h * (1 - p.sy)) / 2;
      const bottom = top + p.h * p.sy;
      const mid = (top + bottom) / 2;
      const inside = y >= top - 3 && y <= bottom + 3;
      const d = Math.abs(y - mid);
      if (inside && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  };

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: disabled || n < 2,
    onStart: () => {
      glide.current?.stop();
      glide.current = null;
      dragging.current = true;
      dragStart.current = crest.get();
      kick();
    },
    onMove: ({ offset }) => {
      // Pulling the water toward you brings the lines ahead down to the crest.
      const c = rubberClamp01(dragStart.current + offset.y / pitchPx(), last);
      crest.set(r3(c));
      commit(c);
      kick();
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const v = velocity.y / pitchPx();
      const landing = project(crest.get(), v, 0.995);
      const to = clamp(Math.round(landing), 0, last);
      commit(to);
      settle(to, motionSafe ? v : 0);
    },
    onCancel: () => {
      dragging.current = false;
      settle(reported.current);
    },
    onTap: (event) => {
      const i = rowAt(event.clientY);
      if (i < 0 || disabled) return;
      commit(i);
      settle(i);
    },
  });

  const measure = () => {
    const stage = stageRef.current;
    if (!stage) return;
    geo.current.em = parseFloat(getComputedStyle(stage).fontSize) || 16;
    geo.current.heights = lines.map(
      (_, i) => nodes.current.get(i)?.offsetHeight || NOMINAL,
    );
  };

  React.useLayoutEffect(() => {
    api.current = {
      tick,
      kick,
      pose,
      measure,
      wheel: onWheel,
      stop: () => {
        glide.current?.stop();
        glide.current = null;
        window.clearTimeout(wheelState.current.timer);
      },
    };
    report.current = onValueChange;
  });

  // A host that moves the value glides the crest there too.
  React.useEffect(() => {
    if (current === reported.current && Math.abs(crest.get() - current) < 0.01)
      return;
    reported.current = current;
    if (!dragging.current) {
      glide.current?.stop();
      if (motionSafe) {
        glide.current = animate(crest, current, {
          ...springs.glide,
          onComplete: () => {
            glide.current = null;
          },
        });
      } else {
        crest.jump(current);
      }
      api.current?.kick();
    }
  }, [current, crest, motionSafe]);

  React.useEffect(() => {
    api.current?.measure();
    api.current?.pose();
    api.current?.kick();
  }, [
    ambient,
    onScreen,
    hidden,
    k.swell,
    k.blur,
    k.tilt,
    k.crestAt,
    lineGap,
    stageH,
    rows,
  ]);

  // Measured: the rest of the sea rises in around the crest line.
  React.useEffect(() => {
    api.current?.measure();
    const run = animate(arrive, 1, {
      duration: durations.slow,
      ease: easings.enter,
    });
    api.current?.kick();
    return () => run.stop();
  }, [arrive, rows]);

  // The crest moving by any means keeps the loop alive.
  React.useEffect(() => crest.on("change", () => api.current?.kick()), [crest]);

  React.useEffect(() => {
    const loopRef = frame;
    return () => {
      if (loopRef.current) window.cancelAnimationFrame(loopRef.current);
      loopRef.current = 0;
      api.current?.stop();
    };
  }, []);

  const bindStage = React.useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    // The wheel has to be able to say no to the page scrolling.
    const wheelHandler = (event: WheelEvent) => api.current?.wheel(event);
    node.addEventListener("wheel", wheelHandler, { passive: false });
    void document.fonts?.ready.then(() => {
      api.current?.measure();
      api.current?.pose();
    });
    return () => {
      watcher.disconnect();
      node.removeEventListener("wheel", wheelHandler);
    };
  }, []);

  // Rows that wrap or change size re-stack.
  const sizer = React.useRef<ResizeObserver | null>(null);
  // One stable binder per row, so a render never re-observes them.
  const binders = React.useMemo(
    () =>
      Array.from({ length: n }, (_, i) => (node: HTMLDivElement | null) => {
        if (!sizer.current && typeof ResizeObserver !== "undefined") {
          sizer.current = new ResizeObserver(() => {
            api.current?.measure();
            api.current?.pose();
          });
        }
        const prev = nodes.current.get(i);
        if (prev && prev !== node) sizer.current?.unobserve(prev);
        if (node) {
          nodes.current.set(i, node);
          sizer.current?.observe(node);
        } else {
          nodes.current.delete(i);
        }
      }),
    [n],
  );
  React.useEffect(() => {
    const ro = sizer;
    return () => {
      ro.current?.disconnect();
      ro.current = null;
    };
  }, []);

  const optionId = (i: number) => `${uid}-line-${i}`;

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={bindStage}
        role="listbox"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={hintId}
        aria-activedescendant={n ? optionId(current) : undefined}
        aria-disabled={disabled || undefined}
        {...drag}
        onKeyDown={onKeyDown}
        className={cn(
          "relative block w-full touch-pan-x rounded-3 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-default opacity-60"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{ height: stageH }}
      >
        {/* The haze: rows fade into the horizon above and the trough below. */}
        <div className="absolute inset-0 overflow-hidden rounded-3 [mask-image:linear-gradient(to_bottom,transparent,black_16%,black_80%,transparent)]">
          {lines.map((line, i) => {
            const row = rows[i] as Row;
            const meta = metaOf(line);
            return (
              <motion.div
                key={i}
                id={optionId(i)}
                ref={binders[i]}
                role="option"
                aria-selected={i === current}
                className={cn(
                  "absolute inset-x-0 top-0 px-4 leading-snug",
                  align === "center" ? "text-center" : "text-left",
                  !motionSafe &&
                    "transition-[opacity,filter,color] duration-200",
                )}
                style={{
                  y: row.y,
                  scaleX: row.scaleX,
                  scaleY: row.scaleY,
                  opacity: row.opacity,
                  filter: row.filter,
                  color: row.color,
                  originX: align === "center" ? 0.5 : 0,
                  originY: 0.5,
                }}
              >
                {meta ? (
                  <span
                    className={cn(
                      "mr-2 inline-block -translate-y-[0.1em] rounded-1 border px-1.5 py-px align-middle font-mono text-[0.62em] tracking-[0.06em] uppercase",
                      i === current
                        ? "border-cobalt-bright/40 text-cobalt-bright"
                        : "border-hairline-strong",
                    )}
                  >
                    {meta}
                  </span>
                ) : null}
                {textOf(line)}
              </motion.div>
            );
          })}
        </div>
      </div>
      <span id={hintId} className="sr-only">
        Scroll, drag, or use the arrow keys to bring the next line onto the
        crest.
      </span>
    </div>
  );
}

/** Rubber-banded past the first and last line. */
function rubberClamp01(v: number, last: number) {
  if (v < 0) return rubberband(v, 1.5);
  if (v > last) return last + rubberband(v - last, 1.5);
  return v;
}
