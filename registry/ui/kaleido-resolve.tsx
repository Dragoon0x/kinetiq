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
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type KaleidoResolveProps = {
  /** What the picture shows. It is on the picture from the first frame, loading or not. */
  alt: string;
  /** An image to load. Without it, `children` is the picture. */
  src?: string;
  /** The finished picture when there is no `src`: an illustration, a figure. */
  children?: React.ReactNode;
  /**
   * Controlled: whether the picture is ready. Uncontrolled, an image is ready
   * once it has loaded, and children after a short run of turning.
   */
  ready?: boolean;
  /** How far the load has got, 0 to 1: that share of the pieces turns into place. The last waits for `ready`. */
  progress?: number;
  /** Fires once per load, when the last piece has landed. */
  onReady?: () => void;
  /** The pace of the turning and of the pieces opening, 0.5 to 2. @default 1 */
  speed?: number;
  /** How many mirrored pieces the kaleidoscope is cut into: 6, 8, 10 or 12. @default 8 */
  wedges?: number;
  /** How briskly the kaleidoscope turns while it waits, 0 (a still mandala) to 1. @default 0.4 */
  spin?: number;
  /** A shimmer as a hand turns the pattern past each piece. Off unless asked for. @default false */
  sound?: boolean;
  /** It still resolves; it cannot be turned. */
  disabled?: boolean;
  className?: string;
};

/** Degrees a second of spin at `spin` 1 and speed 1. */
const SPIN = 72;
/** Seconds of turning shown before children are ready, and at least before any picture opens. */
const MIN_RUN = 1.6;
const MIN_SHOW = 0.6;
/** Each piece's wedge reaches a hair past its neighbours, so no seam shows. */
const OVERLAP = 0.4;
/** Far points of a wedge, in units of the box's longer side: past every corner. */
const REACH = 150;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const wrap180 = (d: number) => {
  const w = (((d + 180) % 360) + 360) % 360;
  return w - 180;
};
const mod360 = (d: number) => ((d % 360) + 360) % 360;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A point `REACH` out from the centre at `deg`, in container units. */
const far = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  const x = r3(REACH * Number(Math.cos(a).toFixed(5)));
  const y = r3(REACH * Number(Math.sin(a).toFixed(5)));
  return `calc(50% + ${x}cqmax) calc(50% + ${y}cqmax)`;
};

const wedgeOf = (start: number, alpha: number) =>
  `polygon(50% 50%, ${far(start - OVERLAP)}, ${far(start + alpha / 2)}, ${far(start + alpha + OVERLAP)})`;

/** Where a wedge starts: the first at twelve o'clock, then clockwise. */
const startOf = (index: number, alpha: number) => -90 + index * alpha;

function Piece({
  index,
  count,
  theta,
  open,
  lock,
  zoom,
  motionSafe,
  children,
}: {
  index: number;
  count: number;
  theta: MotionValue<number>;
  open: MotionValue<number>;
  lock: MotionValue<number>;
  zoom: number;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const alpha = 360 / count;
  const a = startOf(index, alpha);
  const odd = index % 2 === 1;
  // The source slice, at θ, is turned into the even wedges and reflected
  // into the odd ones, so every seam meets its neighbour. Opening, an even
  // piece turns back upright and an odd one flips over on its hinge, while
  // the zoom relaxes to the picture's own scale.
  const transform = useTransform(
    [theta, open, lock] as MotionValue<number>[],
    ([t = 0, o = 0, l = Number.NaN]: number[]) => {
      const u = motionSafe ? o : 0;
      const th = Number.isNaN(l) ? t : l;
      const s = r3(zoom + (1 - zoom) * u);
      if (!odd)
        return `rotate(${r3(wrap180(a - th) * (1 - u))}deg) scale(${s})`;
      const hinge = r3(wrap180((th + alpha + a) / 2));
      return `rotate(${hinge}deg) scaleY(${r3(-1 + 2 * u)}) rotate(${-hinge}deg) scale(${s})`;
    },
  );
  // Under reduced motion a piece does not turn: it fades off the picture.
  const opacity = useTransform(open, (o) =>
    motionSafe ? 1 : r3(1 - clamp01(o)),
  );
  return (
    <motion.div
      className="absolute inset-0"
      style={{ clipPath: wedgeOf(a, alpha), opacity }}
    >
      <motion.div
        className="absolute inset-0 will-change-transform"
        style={{ transform }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function Mirror({ angle, fade }: { angle: number; fade: MotionValue<number> }) {
  return (
    <motion.div
      className="absolute top-1/2 left-1/2 h-px w-[75cqmax] origin-left"
      style={{
        rotate: angle,
        opacity: fade,
        backgroundImage:
          "linear-gradient(90deg, oklch(1 0 0 / 0.75), oklch(1 0 0 / 0.35) 40%, oklch(1 0 0 / 0.12))",
        boxShadow: "0 1px 0 oklch(0 0 0 / 0.14)",
      }}
    />
  );
}

/** A seam fades once both pieces either side of it have opened. */
function Seam({
  angle,
  before,
  after,
  veil,
}: {
  angle: number;
  before: MotionValue<number>;
  after: MotionValue<number>;
  veil: MotionValue<number>;
}) {
  const fade = useTransform(
    [before, after, veil] as MotionValue<number>[],
    ([b = 0, c = 0, v = 1]: number[]) =>
      r3(clamp01(1 - Math.min(clamp01(b), clamp01(c))) * v),
  );
  return <Mirror angle={angle} fade={fade} />;
}

type Phase = "turning" | "resolving" | "settled";

type Api = {
  grab: (x: number, y: number) => void;
  follow: (x: number, y: number, t: number) => void;
  letGo: () => void;
  tap: () => void;
  turnBy: (delta: number) => void;
  turnTo: (deg: number) => void;
  onTurn: (v: number) => void;
  reset: () => void;
  settleReady: () => void;
  followProgress: () => void;
  setVisible: (v: boolean) => void;
  stop: () => void;
};

/**
 * A picture that loads as a kaleidoscope made of itself. The box is cut
 * into mirrored wedges around its centre, and one slice of the picture is
 * shown in every one — turned into the even wedges, reflected into the odd —
 * so the seams meet exactly and the pattern is a mandala of the picture's own
 * colours. While it waits the slice turns behind the mirrors, so the pattern
 * keeps changing. When the picture is ready the pieces open one by one,
 * clockwise from twelve: an even piece turns back upright, an odd one flips
 * over on its hinge, each landing with one crisp overshoot exactly on the
 * plain picture beneath, until the picture itself remains.
 *
 * Circling the pointer around the centre turns it by hand, 1:1, and a throw
 * carries on with its velocity. It is a real slider: arrow keys turn it a
 * step, Page keys a whole piece, Home turns it back. Under reduced motion the
 * mandala holds still and the pieces fade away in the same order instead.
 */
export function KaleidoResolve({
  alt,
  src,
  children,
  ready,
  progress,
  onReady,
  speed = 1,
  wedges = 8,
  spin = 0.4,
  sound = false,
  disabled = false,
  className,
}: KaleidoResolveProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const count = Math.max(4, Math.min(16, Math.round(wedges / 2) * 2));
  const alpha = 360 / count;
  const pace = Math.min(2, Math.max(0.5, speed));
  const rate = clamp01(spin) * SPIN * pace;
  const base = hash(alt) % 360;

  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const [ranOut, setRanOut] = React.useState(false);
  const isReady = ready ?? (src !== undefined ? loadedSrc === src : ranOut);

  const [settled, setSettled] = React.useState(false);
  const [turned, setTurned] = React.useState(0);
  const [zoom, setZoom] = React.useState(1.803);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const [opens] = React.useState(() =>
    Array.from({ length: 16 }, () => motionValue(0)),
  );
  const [locks] = React.useState(() =>
    Array.from({ length: 16 }, () => motionValue(Number.NaN)),
  );
  const auto = useMotionValue(0);
  const turn = useMotionValue(0);
  const gain = useMotionValue(1);
  const veil = useMotionValue(1);
  const theta = useTransform(
    [auto, turn] as MotionValue<number>[],
    ([a = 0, t = 0]: number[]) => a + t + base,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pictureRef = React.useRef<HTMLElement | null>(null);
  const refocus = React.useRef(false);
  const phase = React.useRef<Phase>("turning");
  const opened = React.useRef(0);
  const landed = React.useRef(0);
  const readyRef = React.useRef(isReady);
  const progressRef = React.useRef(progress);
  const visible = React.useRef(true);
  const clock = React.useRef({ since: 0, banked: 0 });
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const runTimer = React.useRef(0);
  const reported = React.useRef(false);
  const hand = React.useRef<{
    last: number;
    samples: { t: number; v: number }[];
  } | null>(null);
  const turning = React.useRef(false);
  const aim = React.useRef(0);
  const cell = React.useRef(0);
  const lastShimmer = React.useRef(0);
  const api = React.useRef<Api | null>(null);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };

  const wait = (seconds: number, fn: () => void) => {
    const id = window.setTimeout(
      () => {
        timers.current.delete(id);
        fn();
      },
      Math.round(seconds * 1000),
    );
    timers.current.add(id);
  };

  const elapsed = () =>
    clock.current.banked +
    (clock.current.since
      ? (performance.now() - clock.current.since) / 1000
      : 0);

  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || phase.current === "settled") return;
    const dt = Math.min(0.05, (now - (last.current || now)) / 1000);
    last.current = now;
    const w = rate * gain.get();
    if (w > 0) auto.set(r3(mod360(auto.get() + w * dt)));
    if (w > 0.01) frame.current = window.requestAnimationFrame(tick);
    else last.current = 0;
  };

  const startSpin = () => {
    if (frame.current || !motionSafe || rate <= 0) return;
    if (!visible.current || phase.current === "settled") return;
    if (gain.get() <= 0.001) return;
    last.current = 0;
    frame.current = window.requestAnimationFrame(tick);
  };

  const stopSpin = () => {
    if (frame.current) window.cancelAnimationFrame(frame.current);
    frame.current = 0;
    last.current = 0;
  };

  /** Children are ready after a short run of on-screen turning. */
  const armRun = () => {
    window.clearTimeout(runTimer.current);
    runTimer.current = 0;
    if (ready !== undefined || src !== undefined || !visible.current) return;
    const left = MIN_RUN / pace - elapsed();
    runTimer.current = window.setTimeout(
      () => setRanOut(true),
      Math.max(0, Math.round(left * 1000)),
    );
  };

  const finish = () => {
    phase.current = "settled";
    stopSpin();
    setSettled(true);
    say("Picture in place.");
    if (!reported.current) {
      reported.current = true;
      onReady?.();
    }
  };

  /** One piece turns (or, reduced, fades) into place. */
  const openPiece = (i: number, delay: number) => {
    const o = opens[i];
    const l = locks[i];
    if (!o || !l) return;
    wait(delay, () => {
      // It keeps the angle it had: from here it only turns into place.
      l.set(theta.get());
      // The picture is in place when the last piece has come to rest, not
      // at its overshoot: the copies leave only once nothing is moving.
      const onComplete = () => {
        landed.current += 1;
        if (phase.current === "resolving" && landed.current >= count) {
          finish();
        }
      };
      run(
        `open-${i}`,
        animate(
          o,
          1,
          motionSafe
            ? { ...springs.snap, onComplete }
            : { duration: durations.base, ease: easings.enter, onComplete },
        ),
      );
    });
  };

  // Not a list's cascade: this sweep is the component's one motion idea, so
  // it takes about 0.9 s at speed 1 whatever the count, and `speed` sets it.
  const stagger = () => Math.min(0.12, 0.9 / count) / pace;

  const openTo = (target: number) => {
    const from = opened.current;
    if (target <= from) return;
    opened.current = target;
    for (let i = from; i < target; i += 1) {
      openPiece(i, (i - from) * stagger());
    }
  };

  const resolve = () => {
    if (phase.current !== "turning") return;
    phase.current = "resolving";
    if (motionSafe) run("gain", animate(gain, 0, springs.drift));
    run(
      "veil",
      animate(veil, 0, {
        duration: Math.max(durations.slow, count * stagger()),
        ease: easings.enter,
      }),
    );
    openTo(count);
  };

  const settleReady = () => {
    if (!readyRef.current || phase.current !== "turning") return;
    const left = MIN_SHOW / pace - elapsed();
    if (left > 0) wait(left, resolve);
    else resolve();
  };

  const followProgress = () => {
    if (phase.current !== "turning") return;
    const p = progressRef.current;
    if (p === undefined) return;
    openTo(Math.min(count - 1, Math.floor(clamp01(p) * count)));
  };

  const stop = () => {
    for (const c of running.current.values()) c.stop();
    running.current.clear();
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    window.clearTimeout(runTimer.current);
    runTimer.current = 0;
    stopSpin();
  };

  const reset = () => {
    stop();
    phase.current = "turning";
    opened.current = 0;
    landed.current = 0;
    reported.current = false;
    clock.current = {
      since: visible.current ? performance.now() : 0,
      banked: 0,
    };
    for (const o of opens) o.set(0);
    for (const l of locks) l.set(Number.NaN);
    gain.set(1);
    veil.set(1);
    setSettled(false);
    setRanOut(false);
    startSpin();
    armRun();
    followProgress();
    settleReady();
  };

  const setVisible = (v: boolean) => {
    if (v === visible.current) return;
    visible.current = v;
    if (v) {
      clock.current.since = performance.now();
      startSpin();
      armRun();
    } else {
      clock.current.banked = elapsed();
      clock.current.since = 0;
      stopSpin();
      window.clearTimeout(runTimer.current);
      runTimer.current = 0;
    }
  };

  /** The pattern passing another piece under a hand rings once. */
  const onTurn = (v: number) => {
    const now = Math.floor(v / alpha);
    if (now === cell.current) return;
    const dir = now > cell.current ? 1 : -1;
    cell.current = now;
    if (!turning.current) return;
    const t = performance.now();
    if (t - lastShimmer.current < 160) return;
    lastShimmer.current = t;
    const rect = rootRef.current?.getBoundingClientRect();
    audio.play("shimmer", {
      pitch: dir > 0 ? 1.12 : 0.89,
      gain: 0.4,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  const angleAt = (x: number, y: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const dx = x - (rect.left + rect.width / 2);
    const dy = y - (rect.top + rect.height / 2);
    // Too near the centre the angle swings wildly under a still finger.
    if (Math.hypot(dx, dy) < 10) return null;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const grab = (x: number, y: number) => {
    running.current.get("turn")?.stop();
    turning.current = true;
    hand.current = { last: angleAt(x, y) ?? Number.NaN, samples: [] };
  };

  const follow = (x: number, y: number, t: number) => {
    const h = hand.current;
    if (!h) return;
    const at = angleAt(x, y);
    if (at === null) return;
    if (!Number.isNaN(h.last)) {
      turn.set(r3(turn.get() + wrap180(at - h.last)));
    }
    h.last = at;
    aim.current = turn.get();
    h.samples.push({ t, v: turn.get() });
    while (h.samples.length > 2 && t - (h.samples[0]?.t ?? t) > 80) {
      h.samples.shift();
    }
  };

  const report = (deg: number) => setTurned(Math.round(mod360(deg)) % 360);

  const letGo = () => {
    const h = hand.current;
    hand.current = null;
    const first = h?.samples[0];
    const lastSample = h?.samples[h.samples.length - 1];
    const dt = first && lastSample ? (lastSample.t - first.t) / 1000 : 0;
    const w =
      first && lastSample && dt > 0.008 ? (lastSample.v - first.v) / dt : 0;
    if (!motionSafe || Math.abs(w) < 20) {
      turning.current = false;
      report(turn.get());
      return;
    }
    // A throw carries on to where it would come to rest.
    const target = r3(project(turn.get(), w, 0.995));
    aim.current = target;
    run(
      "turn",
      animate(turn, target, {
        ...springs.drift,
        velocity: w,
        onComplete: () => {
          turning.current = false;
          report(target);
        },
      }),
    );
  };

  const turnTo = (deg: number) => {
    aim.current = deg;
    turning.current = true;
    report(deg);
    if (!motionSafe) {
      turn.set(deg);
      turning.current = false;
      return;
    }
    run(
      "turn",
      animate(turn, deg, {
        ...springs.snap,
        onComplete: () => {
          turning.current = false;
        },
      }),
    );
  };

  // Keys pressed in quick succession add up: each counts from where the
  // last one was headed, not from where the pattern has got to.
  const turnBy = (delta: number) =>
    turnTo(r3((turning.current ? aim.current : turn.get()) + delta));

  const tap = () => turnBy(alpha);

  React.useEffect(() => {
    api.current = {
      grab,
      follow,
      letGo,
      tap,
      turnBy,
      turnTo,
      onTurn,
      reset,
      settleReady,
      followProgress,
      setVisible,
      stop,
    };
  });

  React.useEffect(
    () => turn.on("change", (v) => api.current?.onTurn(v)),
    [turn],
  );

  // Readiness from the host or the load; taken away, it starts over.
  const shownReady = React.useRef(isReady);
  React.useEffect(() => {
    readyRef.current = isReady;
    if (shownReady.current === isReady) return;
    const was = shownReady.current;
    shownReady.current = isReady;
    if (was && !isReady) api.current?.reset();
    else api.current?.settleReady();
  }, [isReady]);

  React.useEffect(() => {
    progressRef.current = progress;
    api.current?.followProgress();
  }, [progress]);

  // A different cut is a different kaleidoscope.
  const shownCount = React.useRef(count);
  React.useEffect(() => {
    if (shownCount.current === count) return;
    shownCount.current = count;
    api.current?.reset();
  }, [count]);

  // Start, or after StrictMode's rehearsal carry on, from where things stand.
  React.useEffect(() => {
    const a = api.current;
    if (!a) return;
    if (phase.current === "turning") {
      a.setVisible(false);
      a.setVisible(!document.hidden);
      a.followProgress();
      a.settleReady();
    }
    return () => api.current?.stop();
  }, []);

  // A new spin rate (or a newly allowed one) restarts the loop.
  React.useEffect(() => {
    if (!visible.current || phase.current === "settled") return;
    api.current?.setVisible(false);
    api.current?.setVisible(true);
  }, [rate, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => api.current?.setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    // The zoom that keeps the slice inside the picture: half-diagonal over
    // half the shorter side.
    const sizer = new ResizeObserver(() => {
      const w = node.clientWidth;
      const h = node.clientHeight;
      if (w < 1 || h < 1) return;
      setZoom(r3(Math.hypot(w, h) / Math.min(w, h)));
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      api.current?.setVisible(
        Boolean(entry?.isIntersecting) && !document.hidden,
      );
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindDial = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    return () => {
      if (document.activeElement === node) refocus.current = true;
    };
  }, []);

  React.useEffect(() => {
    if (!settled || !refocus.current) return;
    refocus.current = false;
    pictureRef.current?.focus({ preventScroll: true });
  }, [settled]);

  const bindImage = React.useCallback(
    (node: HTMLImageElement | null) => {
      pictureRef.current = node;
      // Settled before hydration: its load (or error) event has been and gone.
      if (node && src !== undefined && node.complete) setLoadedSrc(src);
    },
    [src],
  );
  const bindPicture = React.useCallback((node: HTMLDivElement | null) => {
    pictureRef.current = node;
  }, []);

  const drag = useDrag({
    threshold: 3,
    disabled: disabled || settled,
    onStart: ({ point, offset }) =>
      api.current?.grab(point.x - offset.x, point.y - offset.y),
    onMove: ({ point, event }) =>
      api.current?.follow(point.x, point.y, event.timeStamp),
    onEnd: () => api.current?.letGo(),
    onCancel: () => api.current?.letGo(),
    onTap: () => api.current?.tap(),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const a = api.current;
    if (!a) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        a.turnBy(15);
        return;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        a.turnBy(-15);
        return;
      case "PageUp":
        event.preventDefault();
        a.turnBy(alpha);
        return;
      case "PageDown":
        event.preventDefault();
        a.turnBy(-alpha);
        return;
      case "Home":
        event.preventDefault();
        a.turnTo(r3(turn.get() - wrap180(turn.get())));
        return;
      case "End":
        event.preventDefault();
        a.turnTo(r3(turn.get() - wrap180(turn.get()) - 15));
        return;
    }
  };

  const copy =
    src !== undefined ? (
      // A registry component cannot depend on a framework's image loader.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        draggable={false}
        className="block size-full object-cover"
      />
    ) : (
      children
    );

  const pieces = [];
  const seams = [];
  for (let i = 0; i < count; i += 1) {
    const open = opens[i];
    const lock = locks[i];
    const before = opens[(i + count - 1) % count];
    if (!open || !lock || !before) continue;
    pieces.push(
      <Piece
        key={`${count}-${i}`}
        index={i}
        count={count}
        theta={theta}
        open={open}
        lock={lock}
        zoom={zoom}
        motionSafe={motionSafe}
      >
        {copy}
      </Piece>,
    );
    seams.push(
      <Seam
        key={`${count}-${i}`}
        angle={startOf(i, alpha)}
        before={before}
        after={open}
        veil={veil}
      />,
    );
  }

  const valueText = `Turned ${turned} ${turned === 1 ? "degree" : "degrees"}`;

  return (
    <div
      ref={bindRoot}
      aria-busy={!settled || undefined}
      className={cn(
        "group/kaleido-resolve [container-type:size] relative isolate block aspect-[3/2] w-full overflow-clip rounded-3 border border-hairline bg-surface-2 select-none",
        className,
      )}
    >
      <div className="absolute inset-0">
        {src !== undefined ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={bindImage}
            src={src}
            alt={alt}
            tabIndex={-1}
            draggable={false}
            // A picture that fails to arrive resolves too: its alt is all
            // there is to show, and a loader must not turn forever.
            onLoad={() => setLoadedSrc(src)}
            onError={() => setLoadedSrc(src)}
            className="block size-full object-cover outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
        ) : (
          <div
            ref={bindPicture}
            role="img"
            aria-label={alt}
            tabIndex={-1}
            className="size-full outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {children}
          </div>
        )}
      </div>

      {settled ? null : (
        <>
          <div
            aria-hidden
            inert
            className="pointer-events-none absolute inset-0"
          >
            {pieces}
          </div>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: veil,
              backgroundImage:
                "radial-gradient(closest-corner circle at 50% 50%, transparent 55%, oklch(0.2 0.02 270 / 0.32))",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-80 transition-opacity duration-200 group-hover/kaleido-resolve:opacity-100"
          >
            {seams}
            <motion.span
              className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                opacity: veil,
                background: "oklch(1 0 0 / 0.85)",
                boxShadow: "0 0 6px 1px oklch(1 0 0 / 0.6)",
              }}
            />
          </div>

          <div
            ref={bindDial}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="Turn the kaleidoscope"
            aria-describedby={hintId}
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuenow={turned}
            aria-valuetext={valueText}
            aria-disabled={disabled || undefined}
            onKeyDown={onKeyDown}
            {...drag}
            className={cn(
              "absolute inset-0 touch-none rounded-[inherit] outline-none select-none [-webkit-touch-callout:none]",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled
                ? "cursor-default"
                : "cursor-grab active:cursor-grabbing",
            )}
          />
          <p id={hintId} className="sr-only">
            Circle the pointer around the centre, or use the arrow keys, to turn
            it.
          </p>
        </>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
