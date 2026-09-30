"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FuseState = "idle" | "burning" | "paused" | "fired";

export type FuseButtonProps = {
  /** What holding it does. The button's text and accessible name. */
  label: string;
  /** Fires once, on the frame the spark completes its last lap. */
  onConfirm?: () => void;
  /** Each change of state, with the share of the fuse burnt (0 to 1). Never per frame. */
  onStateChange?: (state: FuseState, progress: number) => void;
  /** How many times the spark goes round: two laps burn a second, inner strand. @default 1 */
  laps?: number;
  /** Seconds per lap. @default 2 */
  burn?: number;
  /** How fierce the spark is, 0 to 1: its glow, its embers, its crackle. @default 0.6 */
  spark?: number;
  /** Smoke curls up off the burning spark. @default true */
  smoke?: boolean;
  /** Play the sizzle and the flare. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The frame around the button: embers and smoke stay inside it. */
const FRAME = 12;
/** The strands' corner radii follow the button's (10px) at their insets. */
const OUTER = { inset: 1, radius: 9 };
const INNER = { inset: 5, radius: 5 };
/** Ember launches per ember per lap; smoke puffs per lap. */
const EMBER_CYCLES = 14;
const SMOKE_CYCLES = 4;
const MAX_EMBERS = 8;
const PUFFS = 3;
const SHARDS = 10;
/** Crackles per lap, of which a hashed third sound. */
const CRACKLES = 30;
/** How long a spent fuse waits after the hand leaves before it is re-laid. */
const RELAY_MS = 900;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const frac = (v: number) => v - Math.floor(v);
/** A stable pseudo-random 0–1 from two integers (unsigned, so never negative). */
const hash = (a: number, b: number) =>
  (((Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663)) >>> 0) % 1000) /
  1000;

type Seg =
  | {
      kind: "line";
      ax: number;
      ay: number;
      bx: number;
      by: number;
      len: number;
    }
  | { kind: "arc"; cx: number; cy: number; r: number; a0: number; len: number };

type Strand = { segs: Seg[]; length: number };

type Point = { x: number; y: number; tx: number; ty: number };

/**
 * A rounded rectangle as a walk, starting at the top centre and running
 * clockwise: straight runs and quarter arcs, each with its length, so any
 * distance along it is a point and any stretch of it a path.
 */
function strand(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
): Strand {
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  const cx = (x0 + x1) / 2;
  const segs: Seg[] = [];
  const line = (ax: number, ay: number, bx: number, by: number) =>
    segs.push({
      kind: "line",
      ax,
      ay,
      bx,
      by,
      len: Math.hypot(bx - ax, by - ay),
    });
  const arc = (ccx: number, ccy: number, a0: number) =>
    segs.push({ kind: "arc", cx: ccx, cy: ccy, r, a0, len: (r * Math.PI) / 2 });
  line(cx, y0, x1 - r, y0);
  arc(x1 - r, y0 + r, -Math.PI / 2);
  line(x1, y0 + r, x1, y1 - r);
  arc(x1 - r, y1 - r, 0);
  line(x1 - r, y1, x0 + r, y1);
  arc(x0 + r, y1 - r, Math.PI / 2);
  line(x0, y1 - r, x0, y0 + r);
  arc(x0 + r, y0 + r, Math.PI);
  line(x0 + r, y0, cx, y0);
  return { segs, length: segs.reduce((sum, s) => sum + s.len, 0) };
}

function pointOn(seg: Seg, d: number): Point {
  if (seg.kind === "line") {
    const t = seg.len > 0 ? d / seg.len : 0;
    const tx = seg.len > 0 ? (seg.bx - seg.ax) / seg.len : 1;
    const ty = seg.len > 0 ? (seg.by - seg.ay) / seg.len : 0;
    return {
      x: seg.ax + (seg.bx - seg.ax) * t,
      y: seg.ay + (seg.by - seg.ay) * t,
      tx,
      ty,
    };
  }
  const a = seg.a0 + (seg.r > 0 ? d / seg.r : 0);
  return {
    x: seg.cx + seg.r * Math.cos(a),
    y: seg.cy + seg.r * Math.sin(a),
    tx: -Math.sin(a),
    ty: Math.cos(a),
  };
}

function at(st: Strand, s: number): Point {
  let d = Math.min(Math.max(0, s), st.length);
  for (const seg of st.segs) {
    if (d <= seg.len) return pointOn(seg, d);
    d -= seg.len;
  }
  const last = st.segs[st.segs.length - 1];
  return last ? pointOn(last, last.len) : { x: 0, y: 0, tx: 1, ty: 0 };
}

/** The stretch of a strand from `a` to `b` (distances along it), as a path. */
function stretch(st: Strand, a: number, b: number): string {
  const from = Math.max(0, a);
  const to = Math.min(st.length, b);
  if (to - from < 0.05) return "";
  const start = at(st, from);
  const parts = [`M ${r2(start.x)} ${r2(start.y)}`];
  let run = 0;
  for (const seg of st.segs) {
    const lo = Math.max(from, run);
    const hi = Math.min(to, run + seg.len);
    if (hi > lo) {
      const end = pointOn(seg, hi - run);
      parts.push(
        seg.kind === "line"
          ? `L ${r2(end.x)} ${r2(end.y)}`
          : `A ${r2(seg.r)} ${r2(seg.r)} 0 0 1 ${r2(end.x)} ${r2(end.y)}`,
      );
    }
    run += seg.len;
    if (run >= to) break;
  }
  return parts.join(" ");
}

type Fuse = {
  width: number;
  height: number;
  strands: Strand[];
  laps: number;
  /** The spark's place at a progress (0 to laps). */
  spark: (p: number) => Point;
};

function makeFuse(w: number, h: number, laps: number): Fuse {
  const make = ({ inset, radius }: { inset: number; radius: number }) =>
    strand(
      FRAME + inset,
      FRAME + inset,
      FRAME + w - inset,
      FRAME + h - inset,
      radius,
    );
  const strands = laps > 1 ? [make(OUTER), make(INNER)] : [make(OUTER)];
  return {
    width: w + 2 * FRAME,
    height: h + 2 * FRAME,
    strands,
    laps: strands.length,
    spark: (p) => {
      const lap = Math.min(strands.length - 1, Math.max(0, Math.floor(p)));
      const st = strands[lap] ?? strands[0];
      return st ? at(st, (p - lap) * st.length) : { x: 0, y: 0, tx: 1, ty: 0 };
    },
  };
}

const inside = (fuse: Fuse, x: number, y: number) => ({
  x: r2(Math.min(fuse.width - 1, Math.max(1, x))),
  y: r2(Math.min(fuse.height - 1, Math.max(1, y))),
});

// Amber with alpha, not mixed with the blue-grey ink: that mix swings the
// hue through green on its way round.
const CORD = "color-mix(in oklch, var(--warn) 78%, transparent)";
const CHAR = "color-mix(in oklch, var(--ink-3) 90%, transparent)";
const EMBER = "color-mix(in oklch, var(--warn) 55%, white)";

/** One ember: launched from where the spark was when its cycle began. */
function Ember({
  index,
  count,
  fuse,
  reach,
  progress,
  glow,
}: {
  index: number;
  count: number;
  fuse: Fuse;
  reach: number;
  progress: MotionValue<number>;
  glow: MotionValue<number>;
}) {
  const place = useTransform(progress, (p) => {
    if (index >= count || p <= 0) return { x: 0, y: 0, r: 0 };
    const clock = p * EMBER_CYCLES + index / count;
    const cycle = Math.floor(clock);
    const life = frac(clock);
    const from = Math.max(0, (cycle - index / count) / EMBER_CYCLES);
    const o = fuse.spark(Math.min(p, from));
    // Out from the button, fanned by a hashed angle, and falling a little.
    const turn = (hash(index, cycle) - 0.5) * 2.2;
    const nx = o.ty;
    const ny = -o.tx;
    const dx = nx * Math.cos(turn) - ny * Math.sin(turn);
    const dy = nx * Math.sin(turn) + ny * Math.cos(turn);
    const far = reach * (0.55 + 0.45 * hash(cycle, index)) * life;
    const pos = inside(fuse, o.x + dx * far, o.y + dy * far + 5 * life * life);
    return { ...pos, r: r2(0.3 + 1.2 * (1 - life)) };
  });
  const cx = useTransform(place, (e) => e.x);
  const cy = useTransform(place, (e) => e.y);
  const r = useTransform(place, (e) => e.r);
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      style={{ fill: "var(--warn)", opacity: glow }}
    />
  );
}

/** One puff of smoke: rises off the spark, swells, and thins away. */
function Puff({
  index,
  fuse,
  progress,
  on,
  fill,
}: {
  index: number;
  fuse: Fuse;
  progress: MotionValue<number>;
  on: MotionValue<number>;
  fill: string;
}) {
  const place = useTransform(progress, (p) => {
    if (p <= 0) return { x: 0, y: 0, r: 0, o: 0 };
    const clock = p * SMOKE_CYCLES + index / PUFFS;
    const life = frac(clock);
    const from = Math.max(
      0,
      (Math.floor(clock) - index / PUFFS) / SMOKE_CYCLES,
    );
    const o = fuse.spark(Math.min(p, from));
    const sway = Math.sin(life * 5 + index * 2) * 2;
    const pos = inside(fuse, o.x + sway, o.y - 11 * life);
    return { ...pos, r: r2(2 + 4 * life), o: r2(0.55 * (1 - life)) };
  });
  const cx = useTransform(place, (e) => e.x);
  const cy = useTransform(place, (e) => e.y);
  const r = useTransform(place, (e) => e.r);
  const fading = useTransform(place, (e) => e.o);
  const opacity = useTransform(
    [fading, on] as MotionValue<number>[],
    ([f = 0, k = 0]: number[]) => r2(f * k),
  );
  return (
    <motion.circle cx={cx} cy={cy} r={r} fill={fill} style={{ opacity }} />
  );
}

/** One shard of the flare's burst, thrown from where the spark lands. */
function Shard({
  index,
  fuse,
  burst,
}: {
  index: number;
  fuse: Fuse;
  burst: MotionValue<number>;
}) {
  const place = useTransform(burst, (b) => {
    if (b <= 0 || b >= 1) return { x: 0, y: 0, r: 0 };
    const o = fuse.spark(fuse.laps);
    const a = -Math.PI * (0.08 + 0.84 * ((index + 0.5) / SHARDS));
    const far = (7 + 5 * hash(index, 3)) * Math.sqrt(b);
    const pos = inside(fuse, o.x + Math.cos(a) * far, o.y + Math.sin(a) * far);
    return { ...pos, r: r2(1.3 * (1 - b)) };
  });
  const cx = useTransform(place, (e) => e.x);
  const cy = useTransform(place, (e) => e.y);
  const r = useTransform(place, (e) => e.r);
  return <motion.circle cx={cx} cy={cy} r={r} style={{ fill: EMBER }} />;
}

type Held = "pointer" | "key" | "auto" | null;

type Api = {
  press: (source: Exclude<Held, null>) => void;
  release: (source: Exclude<Held, null>) => void;
  interrupt: () => void;
  fire: () => void;
  onProgress: (p: number) => void;
  douse: (quiet?: boolean) => void;
};

/**
 * A hold-to-confirm button whose own border is a fuse. Holding lights it at
 * the top centre and a spark runs clockwise round the button's edge, leaving
 * a charred thread behind it with a short stretch still glowing; letting go
 * pauses it, the burnt part stays burnt and the spark dims to an ember;
 * holding again relights it where it stopped. When the spark completes its
 * lap (or both), the whole edge flares and `onConfirm` fires. It is not a
 * ring and not a fill: the only progress is the burnt length of the edge.
 *
 * The perimeter is walked by arc length, so the char, the live cord, the
 * spark, its embers and its smoke all come from one progress value, rebuilt
 * per frame with every number rounded. It is a native button: Space or
 * Enter held burns it exactly as a held pointer does, a click from assistive
 * technology burns it through, Escape puts it out, and each change is spoken
 * once. Under reduced motion the spark still runs the edge — progress is the
 * information — without embers, smoke or a pressed face, and the flare is a
 * flash of colour.
 */
export function FuseButton({
  label,
  onConfirm,
  onStateChange,
  laps = 1,
  burn = 2,
  spark = 0.6,
  smoke = true,
  sound = false,
  disabled = false,
  className,
}: FuseButtonProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const glowId = `fuse-${hintId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const smokeId = `${glowId}-smoke`;
  const rounds = laps >= 2 ? 2 : 1;
  const perLap = Math.max(0.25, burn);
  const fierce = clamp01(spark);

  const [node, setNode] = React.useState<HTMLButtonElement | null>(null);
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const [state, setState] = React.useState<FuseState>("idle");
  const [said, setSaid] = React.useState("");

  const progress = useMotionValue(0);
  const heat = useMotionValue(0);
  const pressed = useMotionValue(0);
  const flash = useMotionValue(0);
  const burst = useMotionValue(0);
  const charOpacity = useMotionValue(1);
  const cordOpacity = useMotionValue(1);

  const held = React.useRef<Held>(null);
  const phase = React.useRef<FuseState>("idle");
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const loop = React.useRef<LoopHandle | null>(null);
  const detach = React.useRef<(() => void) | null>(null);
  const relayTimer = React.useRef(0);
  const crackle = React.useRef(0);
  const api = React.useRef<Api | null>(null);

  const fuse = React.useMemo(
    () => (size ? makeFuse(size.w, size.h, rounds) : null),
    [size, rounds],
  );

  // The drawing is measured from the button once it is on the page, and
  // again whenever its label or the type changes its size.
  React.useEffect(() => {
    if (!node) return;
    const measure = () =>
      setSize((prev) =>
        prev && prev.w === node.offsetWidth && prev.h === node.offsetHeight
          ? prev
          : { w: node.offsetWidth, h: node.offsetHeight },
      );
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const share = () => r2(clamp01(progress.get() / rounds));
  const pan = () => {
    const rect = node?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const become = (next: FuseState, sentence: string) => {
    phase.current = next;
    setState(next);
    setSaid(sentence);
    onStateChange?.(next, share());
  };

  const stopLoop = () => {
    loop.current?.stop();
    loop.current = null;
  };

  const press = (source: Exclude<Held, null>) => {
    if (disabled || held.current) return;
    if (phase.current === "fired") return;
    // A spent cord still being re-laid takes no hold: recording one here
    // would leave it held for good, and every later press would bail.
    const from = progress.get();
    if (from >= rounds) return;
    held.current = source;
    run(
      "burn",
      animate(progress, rounds, {
        duration: (rounds - from) * perLap,
        ease: "linear",
        onComplete: () => api.current?.fire(),
      }),
    );
    run(
      "heat",
      animate(heat, 1, { duration: durations.fast, ease: easings.enter }),
    );
    if (motionSafe) run("pressed", animate(pressed, 1, springs.flick));
    loop.current ??= audio.start("sizzle", {
      pitch: r2(0.9 + 0.25 * (from / rounds) + 0.2 * fierce),
      gain: r2(0.35 + 0.35 * fierce),
      pan: pan(),
    });
    become("burning", "Burning.");
  };

  const release = (source: Exclude<Held, null>) => {
    if (held.current !== source) return;
    held.current = null;
    detach.current?.();
    detach.current = null;
    if (phase.current === "fired") {
      window.clearTimeout(relayTimer.current);
      relayTimer.current = window.setTimeout(
        () => api.current?.douse(true),
        RELAY_MS,
      );
      return;
    }
    if (phase.current !== "burning") return;
    halt("burn");
    stopLoop();
    run(
      "heat",
      animate(heat, 0.3, { duration: durations.base, ease: easings.exit }),
    );
    run("pressed", animate(pressed, 0, springs.snap));
    const pct = Math.round(share() * 100);
    become("paused", `Paused at ${pct} percent. Hold to continue.`);
  };

  const fire = () => {
    if (phase.current === "fired") return;
    halt("burn");
    stopLoop();
    audio.play("flare", {
      pitch: r2(0.9 + 0.2 * fierce),
      gain: 0.62,
      pan: pan(),
    });
    run(
      "heat",
      animate(heat, 0, { duration: durations.base, ease: easings.exit }),
    );
    run(
      "flash",
      animate(flash, 1, {
        duration: durations.blink,
        ease: easings.enter,
        onComplete: () =>
          run(
            "flash",
            animate(flash, 0, { duration: durations.page, ease: easings.exit }),
          ),
      }),
    );
    if (motionSafe) {
      burst.jump(0);
      run("burst", animate(burst, 1, { duration: 0.55, ease: easings.enter }));
      run("pressed", animate(pressed, 0, { ...springs.recoil, velocity: -6 }));
    }
    become("fired", "Confirmed.");
    onConfirm?.();
    // Nothing is holding it (burnt through for assistive technology): it is
    // re-laid on its own.
    if (!held.current || held.current === "auto") {
      held.current = null;
      window.clearTimeout(relayTimer.current);
      relayTimer.current = window.setTimeout(
        () => api.current?.douse(true),
        RELAY_MS,
      );
    }
  };

  /**
   * Out: from a spent fuse the char fades and a fresh cord fades in; from a
   * lit or paused one (Escape), the char draws back to the start.
   */
  const douse = (quiet = false) => {
    window.clearTimeout(relayTimer.current);
    halt("burn");
    stopLoop();
    held.current = null;
    detach.current?.();
    detach.current = null;
    run(
      "heat",
      animate(heat, 0, { duration: durations.fast, ease: easings.exit }),
    );
    run("pressed", animate(pressed, 0, springs.snap));
    if (phase.current === "fired") {
      run(
        "char",
        animate(charOpacity, 0, {
          duration: durations.slow,
          ease: easings.exit,
          onComplete: () => {
            progress.jump(0);
            charOpacity.jump(1);
            cordOpacity.jump(0);
            run(
              "cord",
              animate(cordOpacity, 1, {
                duration: durations.base,
                ease: easings.enter,
              }),
            );
          },
        }),
      );
    } else if (motionSafe) {
      run("burn", animate(progress, 0, { ...springs.glide, velocity: 0 }));
    } else {
      progress.jump(0);
    }
    become("idle", quiet ? "" : "Fuse out.");
  };

  const interrupt = () => {
    const source = held.current;
    if (source && source !== "auto") release(source);
  };

  const onProgress = (p: number) => {
    if (phase.current !== "burning") return;
    loop.current?.set({ pitch: r2(0.9 + 0.25 * (p / rounds) + 0.2 * fierce) });
    const tick = Math.floor(p * CRACKLES);
    if (tick !== crackle.current) {
      crackle.current = tick;
      if (motionSafe && hash(tick, 11) < 0.34) {
        audio.play("snap", {
          pitch: r2(0.8 + 0.6 * hash(tick, 5)),
          gain: r2(0.08 + 0.1 * fierce),
          pan: pan(),
        });
      }
    }
  };

  React.useEffect(() => {
    api.current = { press, release, interrupt, fire, onProgress, douse };
  });

  React.useEffect(() => {
    const off = progress.on("change", (p) => api.current?.onProgress(p));
    return off;
  }, [progress]);

  React.useEffect(() => {
    const interrupted = () => api.current?.interrupt();
    const onVisibility = () => {
      if (document.hidden) interrupted();
    };
    window.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    if (disabled) api.current?.interrupt();
  }, [disabled]);

  // A different number of laps is a different fuse: it starts fresh.
  const shownRounds = React.useRef(rounds);
  React.useEffect(() => {
    if (shownRounds.current === rounds) return;
    shownRounds.current = rounds;
    api.current?.douse(true);
  }, [rounds]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      detach.current?.();
      detach.current = null;
      window.clearTimeout(relayTimer.current);
      for (const c of running.values()) c.stop();
      running.clear();
      loop.current?.stop();
      loop.current = null;
    };
  }, []);

  const hot = 16 + 14 * fierce;
  // Each strand is char up to the spark and live cord after it. A strand's
  // cord keeps its dash pattern pinned to the strand's start, so the dashes
  // stay where they are while the spark eats into them.
  const trails = useTransform(progress, (p) => {
    const empty = {
      char: "",
      cords: ["", ""],
      offsets: [0, 0],
      glow: "",
      core: "",
    };
    if (!fuse) return empty;
    const lap = Math.min(fuse.laps - 1, Math.max(0, Math.floor(p)));
    const char: string[] = [];
    fuse.strands.forEach((st, i) => {
      const s = i < lap ? st.length : i > lap ? 0 : (p - lap) * st.length;
      if (s > 0) char.push(stretch(st, 0, s));
      empty.cords[i] = stretch(st, s, st.length);
      empty.offsets[i] = r2(-s);
      if (i === lap) {
        empty.glow = stretch(st, s - hot, s);
        empty.core = stretch(st, s - hot * 0.4, s);
      }
    });
    return { ...empty, char: char.join(" ") };
  });
  const charPath = useTransform(trails, (t) => t.char);
  const cordPath = useTransform(trails, (t) => t.cords[0] ?? "");
  const cordPathInner = useTransform(trails, (t) => t.cords[1] ?? "");
  const cordOffset = useTransform(trails, (t) => t.offsets[0] ?? 0);
  const cordOffsetInner = useTransform(trails, (t) => t.offsets[1] ?? 0);
  const glowPath = useTransform(trails, (t) => t.glow);
  const corePath = useTransform(trails, (t) => t.core);
  const head = useTransform(progress, (p) => {
    if (!fuse) return { x: 0, y: 0 };
    const at = fuse.spark(Math.min(p, fuse.laps));
    return { x: r2(at.x), y: r2(at.y) };
  });
  const headX = useTransform(head, (h) => h.x);
  const headY = useTransform(head, (h) => h.y);
  const glowRadius = useTransform(heat, (h) =>
    r2((4 + 8 * fierce) * (0.45 + 0.55 * clamp01(h))),
  );
  const coreRadius = useTransform(heat, (h) =>
    r2((1.3 + 1.1 * fierce) * (0.6 + 0.4 * clamp01(h))),
  );
  const sparkOpacity = useTransform(
    [heat, progress] as MotionValue<number>[],
    ([h = 0, p = 0]: number[]) => (p <= 0 || p >= rounds ? 0 : r2(clamp01(h))),
  );
  const hotOpacity = useTransform(heat, (h) => r2(clamp01(h) * 0.9));
  // Embers only fly from a burning spark: they are gone before it dims.
  const emberOpacity = useTransform(heat, (h) => r2(clamp01((h - 0.4) / 0.6)));
  const smokeOn = useTransform(heat, (h) =>
    smoke ? r2(clamp01((h - 0.4) / 0.6)) : 0,
  );
  const flareWidth = useTransform(flash, (f) => r2(2 + 2.5 * f));
  const faceScale = useTransform(pressed, (k) => r2(1 - 0.015 * k));
  const flashOpacity = useTransform(flash, (f) => r2(f));
  const haloOpacity = useTransform(flash, (f) => r2(0.28 * f));

  const embers = Math.round(3 + 5 * fierce);
  const reach = 5 + 7 * fierce;
  const outer = fuse?.strands[0];
  const ring = outer ? stretch(outer, 0, outer.length) : "";
  const inner = fuse?.strands[1];
  const ringInner = inner ? stretch(inner, 0, inner.length) : "";

  return (
    <span
      className={cn(
        "group/fuse-button relative inline-flex shrink-0 select-none [-webkit-touch-callout:none]",
        disabled && "opacity-50",
        className,
      )}
      style={{ padding: FRAME }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span id={hintId} className="sr-only">
        Press and hold to confirm. Escape puts the fuse out.
      </span>
      {/* Smoke rises behind the button: off the top edge it curls up into
          the frame, off the others it slips out round the face. */}
      {fuse && smoke && motionSafe ? (
        <svg
          aria-hidden
          width={fuse.width}
          height={fuse.height}
          viewBox={`0 0 ${fuse.width} ${fuse.height}`}
          className="pointer-events-none absolute inset-0"
        >
          <defs>
            <radialGradient id={smokeId}>
              <stop offset="0%" stopColor="var(--ink-3)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--ink-3)" stopOpacity={0} />
            </radialGradient>
          </defs>
          {Array.from({ length: PUFFS }, (_, i) => (
            <Puff
              key={i}
              index={i}
              fuse={fuse}
              progress={progress}
              on={smokeOn}
              fill={`url(#${smokeId})`}
            />
          ))}
        </svg>
      ) : null}
      <button
        ref={setNode}
        type="button"
        disabled={disabled}
        aria-describedby={hintId}
        onPointerDown={(event) => {
          if (disabled) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          const id = event.pointerId;
          detach.current?.();
          const up = (e: PointerEvent) => {
            if (e.pointerId === id) api.current?.release("pointer");
          };
          const cancel = (e: PointerEvent) => {
            if (e.pointerId === id) api.current?.interrupt();
          };
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", cancel);
          detach.current = () => {
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel);
          };
          press("pointer");
        }}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            // Held keys are the hold; the native click they would make (and
            // Enter's repeats) are not presses of their own.
            event.preventDefault();
            if (!event.repeat) press("key");
            return;
          }
          if (event.key === "Escape") {
            if (phase.current === "burning" || phase.current === "paused") {
              event.preventDefault();
              douse();
            }
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") release("key");
        }}
        onBlur={() => release("key")}
        onClick={(event) => {
          // A click with no pointer and no key behind it is assistive
          // technology, whose user cannot hold: it burns through.
          if (event.detail !== 0 || held.current) return;
          press("auto");
        }}
        className={cn(
          "relative inline-flex h-11 touch-none items-center justify-center rounded-3 px-5 text-sm font-medium text-foreground outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "enabled:cursor-pointer disabled:cursor-not-allowed",
        )}
      >
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-3 bg-surface-2"
          style={motionSafe ? { scale: faceScale } : undefined}
        />
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-3 bg-warn/20"
          style={{ opacity: flashOpacity }}
        />
        {/* Until the drawn cord has a size to follow, these borders are the
            cord, on the same lines the drawing will use. */}
        {fuse ? null : (
          <>
            <span
              aria-hidden
              className="absolute inset-0 rounded-3 border-2 border-dashed border-warn/70"
            />
            {rounds > 1 ? (
              <span
                aria-hidden
                className="absolute inset-1 rounded-2 border-2 border-dashed border-warn/70"
              />
            ) : null}
          </>
        )}
        <motion.span
          className="relative whitespace-nowrap"
          style={motionSafe ? { scale: faceScale } : undefined}
        >
          {label}
        </motion.span>
      </button>

      {fuse ? (
        <svg
          aria-hidden
          width={fuse.width}
          height={fuse.height}
          viewBox={`0 0 ${fuse.width} ${fuse.height}`}
          className="pointer-events-none absolute inset-0 overflow-visible"
        >
          <defs>
            <radialGradient id={glowId}>
              <stop offset="0%" stopColor="var(--warn)" stopOpacity={0.95} />
              <stop offset="45%" stopColor="var(--warn)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--warn)" stopOpacity={0} />
            </radialGradient>
          </defs>
          <motion.g style={{ opacity: cordOpacity }}>
            <g
              className="opacity-80 transition-opacity group-hover/fuse-button:opacity-100"
              fill="none"
              strokeWidth={2}
              strokeDasharray="3.5 2"
              style={{ stroke: CORD }}
            >
              <motion.path d={cordPath} strokeDashoffset={cordOffset} />
              <motion.path
                d={cordPathInner}
                strokeDashoffset={cordOffsetInner}
              />
            </g>
          </motion.g>
          <motion.g style={{ opacity: charOpacity }}>
            <motion.path
              d={charPath}
              fill="none"
              strokeWidth={1.4}
              strokeLinecap="round"
              style={{ stroke: CHAR }}
            />
            <motion.g style={{ opacity: hotOpacity }}>
              <motion.path
                d={glowPath}
                fill="none"
                strokeWidth={2.2}
                strokeLinecap="round"
                style={{ stroke: "var(--danger)" }}
              />
              <motion.path
                d={corePath}
                fill="none"
                strokeWidth={2.2}
                strokeLinecap="round"
                style={{ stroke: "var(--warn)" }}
              />
            </motion.g>
          </motion.g>

          <motion.path
            d={ring}
            fill="none"
            strokeWidth={8}
            style={{ stroke: "var(--warn)", opacity: haloOpacity }}
          />
          <motion.path
            d={`${ring} ${ringInner}`}
            fill="none"
            strokeWidth={flareWidth}
            style={{ stroke: "var(--warn)", opacity: flashOpacity }}
          />

          {motionSafe ? (
            <>
              {Array.from({ length: MAX_EMBERS }, (_, i) => (
                <Ember
                  key={i}
                  index={i}
                  count={embers}
                  fuse={fuse}
                  reach={reach}
                  progress={progress}
                  glow={emberOpacity}
                />
              ))}
              {Array.from({ length: SHARDS }, (_, i) => (
                <Shard key={i} index={i} fuse={fuse} burst={burst} />
              ))}
            </>
          ) : null}

          <g
            className={
              state === "paused" && motionSafe ? "animate-pulse" : undefined
            }
          >
            <motion.g style={{ opacity: sparkOpacity }}>
              <motion.circle
                cx={headX}
                cy={headY}
                r={glowRadius}
                fill={`url(#${glowId})`}
              />
              <motion.circle
                cx={headX}
                cy={headY}
                r={coreRadius}
                style={{ fill: EMBER }}
              />
            </motion.g>
          </g>
        </svg>
      ) : null}

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </span>
  );
}
