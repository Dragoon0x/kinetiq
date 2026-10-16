"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { Copy, RotateCw } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FirstEventProject = {
  name: string;
  /** Shown beside the name, e.g. "Production". */
  environment?: string;
};

export type FirstEventStep = {
  id: string;
  title: string;
  detail?: string;
  /** A snippet with a Copy button. Omit it for a step that is only an instruction. */
  code?: string;
};

export type FirstEventPoint = {
  /** When the bucket starts, in ms. */
  at: number;
  /** Events in the bucket. */
  count: number;
};

export type FirstEventTrouble = { id: string; title: string; detail?: string };
export type FirstEventPulseStyle = "rings" | "sweep" | "dot";
export type FirstEventAxisStyle = "grid" | "ticks" | "bare";

export type FirstEventProps = {
  /** The project being wired up. @default defaultFirstEventProject */
  project?: FirstEventProject;
  /** What to do to send the first event, in order. @default defaultFirstEventSteps */
  installSteps?: FirstEventStep[];
  /** Received buckets, oldest first. Empty while listening. @default [] */
  events?: FirstEventPoint[];
  /** When listening began, in ms. @default four minutes before `now` */
  listeningSince?: number;
  /** The moment the minutes count to, in ms — never read from the clock. @default defaultFirstEventNow */
  now?: number;
  /** Minutes of silence before the panel lists what usually goes wrong. @default 15 */
  timeoutMinutes?: number;
  /** What usually goes wrong, shown once listening times out. @default defaultFirstEventTroubleshooting */
  troubleshooting?: FirstEventTrouble[];
  /** Minutes the x-axis spans from the first event. @default 30 */
  windowMinutes?: number;
  /** What is being counted, in the chart's words. @default "events" */
  metric?: string;
  /** A step's snippet was copied (it is also written to the clipboard when one is available). */
  onCopy?: (stepId: string, text: string) => void;
  /** Check now was pressed. Return a promise to show the check in flight. */
  onCheckNow?: () => void | Promise<unknown>;
  /** How the origin listens: rings leaving it, a scanning sweep, or a breathing dot. @default "rings" */
  pulseStyle?: FirstEventPulseStyle;
  /** Full gridlines, tick marks only, or just the baseline. @default "grid" */
  axisStyle?: FirstEventAxisStyle;
  /** The pulse, the line, the points and the finished steps. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Tallest the surface grows before its body scrolls, px. @default 540 */
  maxHeight?: number;
  /** Nothing can be copied or checked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Monday 12 October 2026, 14:08 UTC — four minutes after the key was made. */
export const defaultFirstEventNow = Date.UTC(2026, 9, 12, 14, 8);

export const defaultFirstEventProject: FirstEventProject = {
  name: "Waylight",
  environment: "Production",
};

export const defaultFirstEventSteps: FirstEventStep[] = [
  {
    id: "import",
    title: "Add the tracker",
    detail: "Import it where your app starts.",
    code: 'import { track } from "waylight/track";',
  },
  {
    id: "init",
    title: "Initialise with your key",
    detail: "Once, before any event is sent.",
    code: 'track.init("wl_pub_7c2e91");',
  },
  {
    id: "send",
    title: "Send a test event",
    detail: "From anywhere a visitor acts.",
    code: 'track("signup", { plan: "trial" });',
  },
  {
    id: "open",
    title: "Open your app",
    detail: "Click around like a visitor. Events land here within a minute.",
  },
];

export const defaultFirstEventTroubleshooting: FirstEventTrouble[] = [
  {
    id: "key",
    title: "The key belongs to another project",
    detail: "Each wl_pub_ key sends to one project. Check it reads Waylight.",
  },
  {
    id: "blocker",
    title: "A content blocker dropped the request",
    detail: "Test in a private window with extensions off.",
  },
  {
    id: "order",
    title: "init runs after the first event",
    detail: "Events sent before init are dropped without a word.",
  },
  {
    id: "loaded",
    title: "The page never loaded the tracker",
    detail: "Look for waylight/track among the page's requests.",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const r3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;
const pad = (n: number) => String(n).padStart(2, "0");
/** A fixed 24-hour UTC clock: a locale lookup during render would not survive hydration. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/** The smallest round ceiling at or above `v`: 4, 5, 10, 20, 25, 50… */
const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return r3(m * p);
  return r3(10 * p);
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** The plot is drawn in a 1000 × 1000 box stretched over the chart. */
const VB = 1000;

/**
 * A monotone curve through the points (Fritsch–Carlson): it passes through
 * every reading and never swings below zero or above a peak between two of
 * them, so the line never claims a value the data does not hold.
 */
function monotonePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  const f = (v: number) => r3(v);
  const first = pts[0];
  if (!first) return "";
  if (pts.length === 1) return `M ${f(first.x)} ${f(first.y)}`;
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const h = Math.max(1e-6, b.x - a.x);
    dx.push(h);
    m.push((b.y - a.y) / h);
  }
  const t: number[] = new Array<number>(n).fill(0);
  t[0] = m[0] ?? 0;
  t[n - 1] = m[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i += 1) {
    const m0 = m[i - 1] ?? 0;
    const m1 = m[i] ?? 0;
    t[i] = m0 * m1 <= 0 ? 0 : (m0 + m1) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    const mi = m[i] ?? 0;
    if (mi === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = (t[i] ?? 0) / mi;
    const b = (t[i + 1] ?? 0) / mi;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * mi;
      t[i + 1] = k * b * mi;
    }
  }
  let d = `M ${f(first.x)} ${f(first.y)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const h = dx[i] ?? 0;
    if (!a || !b) continue;
    d += ` C ${f(a.x + h / 3)} ${f(a.y + ((t[i] ?? 0) * h) / 3)} ${f(b.x - h / 3)} ${f(b.y - ((t[i + 1] ?? 0) * h) / 3)} ${f(b.x)} ${f(b.y)}`;
  }
  return d;
}

/** In view and the tab showing: the only time the pulse may run. */
function useLive(node: Element | null): boolean {
  const [live, setLive] = React.useState(false);
  React.useEffect(() => {
    if (!node) return;
    let seen = false;
    let shown = !document.hidden;
    const update = () => setLive(seen && shown);
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) seen = entry.isIntersecting;
      update();
    });
    io.observe(node);
    const onVisibility = () => {
      shown = !document.hidden;
      update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [node]);
  return live;
}

/* ----------------------------------------------------------------------- */
/*                                 The pulse                                */
/* ----------------------------------------------------------------------- */

/**
 * The origin listening. Every loop here starts only while the chart is on
 * screen and still waiting, and stops the moment either changes; the still
 * frame it leaves behind is the reduced-motion design too.
 */
function Pulse({
  style,
  running,
  slow,
}: {
  style: FirstEventPulseStyle;
  running: boolean;
  slow: boolean;
}) {
  const ringA = useMotionValue(0);
  const ringB = useMotionValue(0);
  const ringC = useMotionValue(0);
  const sweep = useMotionValue(45);
  const breath = useMotionValue(0.5);

  React.useEffect(() => {
    if (!running) {
      ringA.jump(0.32);
      ringB.jump(0);
      ringC.jump(0);
      sweep.jump(45);
      breath.jump(0.5);
      return;
    }
    const k = slow ? 2 : 1;
    const running_: AnimationPlaybackControls[] = [];
    if (style === "rings") {
      [ringA, ringB, ringC].forEach((v, i) => {
        v.jump(0);
        running_.push(
          animate(v, [0, 1], {
            duration: 2.4 * k,
            ease: easings.enter,
            repeat: Infinity,
            delay: i * 0.8 * k,
          }),
        );
      });
    } else if (style === "sweep") {
      running_.push(
        animate(sweep, [6, 84], {
          duration: 1.6 * k,
          ease: easings.move,
          repeat: Infinity,
          repeatType: "mirror",
        }),
      );
    } else {
      running_.push(
        animate(breath, [0, 1], {
          duration: 1 * k,
          ease: easings.move,
          repeat: Infinity,
          repeatType: "mirror",
        }),
      );
    }
    return () => {
      for (const c of running_) c.stop();
    };
  }, [running, slow, style, ringA, ringB, ringC, sweep, breath]);

  const dim = slow ? 0.55 : 1;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-clip"
      style={{ opacity: dim }}
    >
      {style === "rings"
        ? [ringA, ringB, ringC].map((v, i) => <Ring key={i} t={v} />)
        : null}
      {style === "sweep" ? <Sweep angle={sweep} /> : null}
      {style === "dot" ? <Halo t={breath} /> : null}
      <span className="absolute bottom-0 left-0 size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-(--fe-accent)" />
    </span>
  );
}

/** A ring drawn by radius, not by scale, so its stroke stays a crisp 1.5px as it grows. */
function Ring({ t }: { t: MotionValue<number> }) {
  const r = useTransform(t, (v) => r3(5 + v * 92));
  const opacity = useTransform(t, (v) => r3((1 - v) * 0.7));
  return (
    <svg
      aria-hidden
      width={1}
      height={1}
      className="absolute bottom-0 left-0 overflow-visible"
    >
      <motion.circle
        cx={0}
        cy={1}
        r={r}
        fill="none"
        strokeWidth={1.5}
        className="stroke-(--fe-accent)"
        style={{ opacity }}
      />
    </svg>
  );
}

function Sweep({ angle }: { angle: MotionValue<number> }) {
  // The wedge's bright edge is the arm; the trail fades back behind it.
  const rotate = useTransform(angle, (a) => r3(a - 50));
  return (
    <motion.span
      className="absolute bottom-0 left-0 size-[260px] -translate-x-1/2 translate-y-1/2 rounded-full"
      style={{
        rotate,
        backgroundImage:
          "conic-gradient(transparent 0deg, color-mix(in oklab, var(--fe-accent) 26%, transparent) 49deg, color-mix(in oklab, var(--fe-accent) 70%, transparent) 50deg, transparent 50.6deg)",
        maskImage:
          "radial-gradient(circle, black 0%, black 40%, transparent 70%)",
      }}
    />
  );
}

function Halo({ t }: { t: MotionValue<number> }) {
  const scale = useTransform(t, (v) => r3(0.8 + v * 0.7));
  const opacity = useTransform(t, (v) => r3(0.42 - v * 0.26));
  return (
    <motion.span
      className="absolute bottom-0 left-0 size-7 -translate-x-1/2 translate-y-1/2 rounded-full bg-(--fe-accent)"
      style={{ scale, opacity }}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The chart                                */
/* ----------------------------------------------------------------------- */

function Dot({
  x,
  count,
  yMax,
  first,
  drop,
  motionSafe,
  delay,
}: {
  x: number;
  count: number;
  yMax: MotionValue<number>;
  first: boolean;
  drop: boolean;
  motionSafe: boolean;
  delay: number;
}) {
  const bottom = useTransform(
    yMax,
    (m) => `${r3(clamp01(count / Math.max(1, m)) * 100)}%`,
  );
  if (first && drop) {
    return (
      <motion.span
        className="absolute size-0"
        style={{ left: `${r3(x * 100)}%`, bottom }}
      >
        <motion.span
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-(--fe-accent) shadow-[0_0_0_1px_var(--fe-accent)]"
          initial={
            motionSafe
              ? { y: -48, opacity: 0, scaleY: 1.2 }
              : { y: 0, opacity: 0, scaleY: 1 }
          }
          animate={{ y: 0, opacity: 1, scaleY: 1 }}
          transition={
            motionSafe
              ? {
                  y: springs.recoil,
                  scaleY: springs.recoil,
                  opacity: { duration: durations.fast, ease: easings.enter },
                }
              : { duration: durations.base, ease: easings.enter }
          }
        />
        {motionSafe ? (
          <motion.span
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-(--fe-accent)"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 3.2], opacity: [0.7, 0] }}
            transition={{ duration: 0.6, ease: easings.enter, delay: 0.16 }}
          />
        ) : null}
      </motion.span>
    );
  }
  return (
    <motion.span
      className="absolute size-0"
      style={{ left: `${r3(x * 100)}%`, bottom }}
    >
      <motion.span
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-(--fe-accent)"
        initial={motionSafe ? { scale: 0 } : { opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={
          motionSafe
            ? { ...springs.flick, delay }
            : { duration: durations.fast, delay }
        }
      />
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The panel                                */
/* ----------------------------------------------------------------------- */

type Said = { n: number; text: string };

/**
 * An analytics panel with nothing in it yet, drawn honestly: the axes, the
 * gridlines and a listening pulse at the origin, with the install steps
 * beside it. When the first event arrives the pulse stops, the point drops
 * onto the y-axis and lands on `springs.recoil` with a ripple along the
 * baseline, and the line begins to draw from it — a clip sweeping right to
 * each new reading — while the scale rises on `springs.glide` and the steps
 * tick off on `springs.flick`. Silence past `timeoutMinutes` slows the pulse
 * and lists what usually goes wrong.
 *
 * The chart is one image with a sentence that stays current; the steps'
 * Copy buttons are one tab stop (Up, Down, Home, End) and Check now is a
 * button. Under reduced motion the pulse is still, the point fades in where
 * it lands and the line is drawn whole.
 */
export function FirstEvent({
  project = defaultFirstEventProject,
  installSteps = defaultFirstEventSteps,
  events = [],
  listeningSince,
  now = defaultFirstEventNow,
  timeoutMinutes = 15,
  troubleshooting = defaultFirstEventTroubleshooting,
  windowMinutes = 30,
  metric = "events",
  onCopy,
  onCheckNow,
  pulseStyle = "rings",
  axisStyle = "grid",
  accent = "var(--accent-bright)",
  maxHeight = 540,
  disabled = false,
  className,
}: FirstEventProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const clipId = `${uid}-clip`;
  const fadeId = `${uid}-fade`;
  const stepsId = `${uid}-steps`;

  const since = listeningSince ?? now - 4 * MIN;
  const minutes = Math.max(0, Math.floor((now - since) / MIN));
  const hasData = events.length > 0;
  const timedOut = !hasData && minutes >= timeoutMinutes;
  const total = events.reduce((t, e) => t + Math.max(0, e.count), 0);
  const peak = events.reduce((p, e) => Math.max(p, e.count), 0);

  /* ------------------------------ geometry ------------------------------ */

  const span = Math.max(1, windowMinutes) * MIN;
  const firstAt = events[0]?.at ?? 0;
  const lastAt = events[events.length - 1]?.at ?? 0;
  const x0 = Math.max(firstAt, lastAt - span);
  const pts = events
    .filter((e) => e.at >= x0)
    .map((e) => ({ x: r3(clamp01((e.at - x0) / span)), count: e.count }));
  const yTarget = niceMax(peak);
  const yMax = useMotionValue(yTarget);
  const reveal = useMotionValue(hasData ? (pts[pts.length - 1]?.x ?? 0) : 0);

  const line = useTransform(yMax, (m) =>
    monotonePath(
      pts.map((p) => ({
        x: p.x * VB,
        y: VB - clamp01(p.count / Math.max(1, m)) * VB,
      })),
    ),
  );
  const area = useTransform(line, (d) => {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (!d || !a || !b || pts.length < 2) return "";
    return `${d} L ${r3(b.x * VB)} ${VB} L ${r3(a.x * VB)} ${VB} Z`;
  });
  const revealWidth = useTransform(reveal, (v) => r3(v * VB + 6));

  /* -------------------------------- state ------------------------------- */

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [drop, setDrop] = React.useState(0);
  const [seen, setSeen] = React.useState({ count: events.length, timedOut });
  if (seen.count !== events.length || seen.timedOut !== timedOut) {
    if (seen.count === 0 && events.length > 0) {
      setDrop((d) => d + 1);
      const at = events[0]?.at ?? now;
      setSaid((s) => ({
        n: s.n + 1,
        text: `First event received at ${clock(at)}. The steps worked.`,
      }));
    } else if (!seen.timedOut && timedOut) {
      setSaid((s) => ({
        n: s.n + 1,
        text: `No ${metric} after ${timeoutMinutes} minutes. Here is what usually goes wrong.`,
      }));
    }
    setSeen({ count: events.length, timedOut });
  }

  const [checking, setChecking] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [activeStep, setActiveStep] = React.useState<string | null>(null);

  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  const live = useLive(root);

  // The scale rises on glide; the line reaches each new reading on a tween.
  React.useEffect(() => {
    if (!motionSafe) {
      yMax.jump(yTarget);
      return;
    }
    const c = animate(yMax, yTarget, springs.glide);
    return () => c.stop();
  }, [yTarget, motionSafe, yMax]);

  const lastX = pts[pts.length - 1]?.x ?? 0;
  React.useEffect(() => {
    if (!hasData) {
      reveal.jump(0);
      return;
    }
    if (!motionSafe) {
      reveal.jump(lastX);
      return;
    }
    // The first reading waits for its own landing before the line sets off.
    const c = animate(reveal, lastX, {
      duration: 0.5,
      ease: easings.enter,
      delay: events.length === 1 ? 0.35 : 0,
    });
    return () => c.complete();
    // events.length marks a new reading even when it lands on the same x.
  }, [hasData, lastX, motionSafe, reveal, events.length]);

  const timers = React.useRef(new Set<number>());
  const alive = React.useRef(true);
  const latestCount = React.useRef(events.length);
  React.useEffect(() => {
    latestCount.current = events.length;
  });
  React.useEffect(() => {
    alive.current = true;
    const list = timers.current;
    return () => {
      alive.current = false;
      for (const t of list) window.clearTimeout(t);
      list.clear();
    };
  }, []);

  const spin = useMotionValue(0);
  React.useEffect(() => {
    if (!checking || !live || !motionSafe) return;
    const c = animate(spin, spin.get() + 360, {
      duration: 0.9,
      ease: "linear",
      repeat: Infinity,
    });
    return () => {
      c.stop();
      spin.jump(0);
    };
  }, [checking, live, motionSafe, spin]);

  /* ------------------------------ actions ------------------------------- */

  const checkNow = () => {
    if (disabled || checking) return;
    let result: void | Promise<unknown>;
    try {
      result = onCheckNow?.();
    } catch (e) {
      result = Promise.reject(e);
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setChecking(true);
      const settle = (ok: boolean) => {
        if (!alive.current) return;
        setChecking(false);
        if (latestCount.current === 0) {
          say(
            ok
              ? `Checked. No ${metric} yet.`
              : "The check didn't go through. Try again in a moment.",
          );
        }
      };
      (result as Promise<unknown>).then(
        () => settle(true),
        () => settle(false),
      );
    } else if (!hasData) {
      say(`Checked. No ${metric} yet.`);
    }
  };

  const copyStep = (step: FirstEventStep) => {
    if (disabled || !step.code) return;
    try {
      void navigator.clipboard?.writeText(step.code).catch(() => {});
    } catch {
      // No clipboard here; the host still hears about the copy.
    }
    onCopy?.(step.id, step.code);
    setCopied(step.id);
    say(`Copied step ${installSteps.indexOf(step) + 1}.`);
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      setCopied(null);
    }, 1600);
    timers.current.add(t);
  };

  const copyButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const withCode = installSteps.filter((s) => s.code);
  const currentStep =
    activeStep && withCode.some((s) => s.id === activeStep)
      ? activeStep
      : (withCode[0]?.id ?? null);
  const onStepKey = (event: React.KeyboardEvent, id: string) => {
    const i = withCode.findIndex((s) => s.id === id);
    let to = -1;
    if (event.key === "ArrowDown") to = Math.min(withCode.length - 1, i + 1);
    else if (event.key === "ArrowUp") to = Math.max(0, i - 1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = withCode.length - 1;
    else return;
    event.preventDefault();
    const next = withCode[to]?.id;
    if (!next) return;
    setActiveStep(next);
    copyButtons.current.get(next)?.focus();
  };

  /* ------------------------------- render ------------------------------- */

  const figureLabel = hasData
    ? `${plural(total, metric === "events" ? "event" : metric)} since ${clock(firstAt)}, peaking at ${peak} a minute.`
    : timedOut
      ? `No ${metric} after ${minutes} minutes of listening.`
      : `No ${metric} yet. Listening for ${plural(minutes, "minute")}.`;

  const chip = hasData
    ? {
        tone: "text-success",
        dot: "bg-success",
        text: `Live · ${plural(total, "event")}`,
      }
    : timedOut
      ? {
          tone: "text-warn",
          dot: "bg-warn",
          text: `No ${metric} after ${minutes} min`,
        }
      : {
          tone: "text-ink-2",
          dot: "bg-(--fe-accent)",
          text: `Listening · ${minutes} min`,
        };

  const gridRows = [0, 0.25, 0.5, 0.75, 1];
  const yLabels = hasData
    ? [
        { at: 0, text: "0" },
        { at: 0.5, text: String(r3(yTarget / 2)) },
        { at: 1, text: String(yTarget) },
      ]
    : [{ at: 0, text: "0" }];
  const xLabels = hasData
    ? [
        { at: 0, text: clock(x0) },
        { at: 0.5, text: `+${Math.round(windowMinutes / 2)} min` },
        { at: 1, text: `+${windowMinutes} min` },
      ]
    : [{ at: 0, text: "now" }];
  const tickStep = cascade(installSteps.length);

  return (
    <section
      ref={setRoot}
      aria-labelledby={titleId}
      className={cn(
        "@container/first-event flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ maxHeight, ["--fe-accent" as string]: accent }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {project.name} events
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {project.environment ? `${project.environment} · ` : ""}
            {hasData
              ? `first event at ${clock(firstAt)}`
              : `listening since ${clock(since)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline px-2.5 text-[11px] tabular-nums transition-colors",
              chip.tone,
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full transition-colors",
                chip.dot,
              )}
            />
            {chip.text}
          </span>
          <button
            type="button"
            onClick={checkNow}
            aria-disabled={disabled || checking || undefined}
            aria-busy={checking || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors",
              disabled || checking ? "cursor-default" : "hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <motion.span
              aria-hidden
              className="flex size-3.5 shrink-0"
              style={{ rotate: spin }}
            >
              <RotateCw className="size-3.5" />
            </motion.span>
            {checking ? "Checking…" : "Check now"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-4 @min-[40rem]/first-event:flex-row @min-[40rem]/first-event:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <figure
            role="img"
            aria-label={figureLabel}
            className={cn(
              "relative shrink-0",
              motionSafe &&
                "transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              timedOut
                ? "h-[150px] @min-[40rem]/first-event:h-[176px]"
                : "h-[200px] @min-[40rem]/first-event:h-[252px]",
            )}
          >
            {/* y labels */}
            <div aria-hidden className="absolute top-2 bottom-6 left-0 w-7">
              <AnimatePresence initial={false}>
                {yLabels.map((l) => (
                  <motion.span
                    key={`${l.at}-${l.text}`}
                    className="absolute right-1.5 translate-y-1/2 font-mono text-[10px] leading-none text-ink-3 tabular-nums"
                    style={{ bottom: `${l.at * 100}%` }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{ duration: durations.base }}
                  >
                    {l.text}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>

            {/* the plot */}
            <div className="absolute top-2 right-1 bottom-6 left-7">
              {axisStyle === "grid"
                ? gridRows.map((g) => (
                    <span
                      key={`h-${g}`}
                      aria-hidden
                      className={cn(
                        "absolute inset-x-0 h-px",
                        g === 0 ? "bg-hairline-strong" : "bg-hairline",
                      )}
                      style={{ bottom: `${g * 100}%` }}
                    />
                  ))
                : null}
              {axisStyle === "grid"
                ? [0.25, 0.5, 0.75, 1].map((g) => (
                    <span
                      key={`v-${g}`}
                      aria-hidden
                      className="absolute inset-y-0 w-px border-l border-dashed border-hairline"
                      style={{ left: `${g * 100}%` }}
                    />
                  ))
                : null}
              {axisStyle !== "grid" ? (
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-px bg-hairline-strong"
                />
              ) : null}
              {axisStyle !== "bare" ? (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-px bg-hairline-strong"
                />
              ) : null}
              {axisStyle === "ticks"
                ? [0.25, 0.5, 0.75, 1].map((g) => (
                    <React.Fragment key={`t-${g}`}>
                      <span
                        aria-hidden
                        className="absolute -left-1 h-px w-1 bg-hairline-strong"
                        style={{ bottom: `${g * 100}%` }}
                      />
                      <span
                        aria-hidden
                        className="absolute -bottom-1 h-1 w-px bg-hairline-strong"
                        style={{ left: `${g * 100}%` }}
                      />
                    </React.Fragment>
                  ))
                : null}

              <AnimatePresence initial={false}>
                {!hasData ? (
                  <motion.p
                    key="empty"
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[12px] text-ink-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  >
                    {timedOut
                      ? "Still listening. Nothing has arrived yet."
                      : "Send an event and it lands here."}
                  </motion.p>
                ) : null}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {!hasData ? (
                  <motion.span
                    key="pulse"
                    aria-hidden
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.base) }}
                  >
                    <Pulse
                      style={pulseStyle}
                      running={live && motionSafe}
                      slow={timedOut}
                    />
                  </motion.span>
                ) : null}
              </AnimatePresence>

              {hasData ? (
                <>
                  <svg
                    aria-hidden
                    viewBox={`0 0 ${VB} ${VB}`}
                    preserveAspectRatio="none"
                    className="absolute inset-0 size-full overflow-visible"
                  >
                    <defs>
                      <clipPath id={clipId}>
                        <motion.rect
                          x={-6}
                          y={-20}
                          height={VB + 40}
                          width={revealWidth}
                        />
                      </clipPath>
                      <linearGradient id={fadeId} x1="0" x2="0" y1="0" y2="1">
                        <stop
                          offset="0"
                          style={{ stopColor: accent, stopOpacity: 0.2 }}
                        />
                        <stop
                          offset="1"
                          style={{ stopColor: accent, stopOpacity: 0 }}
                        />
                      </linearGradient>
                    </defs>
                    <g clipPath={`url(#${clipId})`}>
                      <motion.path d={area} fill={`url(#${fadeId})`} />
                      <motion.path
                        d={line}
                        fill="none"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        className="stroke-(--fe-accent)"
                      />
                    </g>
                  </svg>
                  {pts.map((p, i) => (
                    <Dot
                      key={`${events.length - pts.length + i}`}
                      x={p.x}
                      count={p.count}
                      yMax={yMax}
                      first={i === 0 && events.length - pts.length === 0}
                      drop={drop > 0}
                      motionSafe={motionSafe}
                      delay={i === pts.length - 1 && i > 0 ? 0.42 : 0}
                    />
                  ))}
                </>
              ) : null}
            </div>

            {/* x labels */}
            <div aria-hidden className="absolute right-1 bottom-0 left-7 h-4">
              {xLabels.map((l) => (
                <span
                  key={`${l.at}-${l.text}`}
                  className={cn(
                    "absolute bottom-0 font-mono text-[10px] leading-none whitespace-nowrap text-ink-3 tabular-nums",
                    l.at === 0
                      ? "left-0"
                      : l.at === 1
                        ? "right-0"
                        : "-translate-x-1/2",
                  )}
                  style={
                    l.at > 0 && l.at < 1
                      ? { left: `${l.at * 100}%` }
                      : undefined
                  }
                >
                  {l.text}
                </span>
              ))}
            </div>
          </figure>

          <AnimatePresence initial={false}>
            {timedOut ? (
              <motion.div
                key="trouble"
                className="shrink-0 overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0, transition: exitFor() }}
                transition={{
                  height: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.base, ease: easings.enter },
                }}
              >
                <div className="rounded-3 border border-hairline bg-surface-2 p-3">
                  <p className="text-[13px] font-medium">
                    Nothing yet after {timeoutMinutes} minutes. What usually
                    goes wrong:
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {troubleshooting.map((t) => (
                      <li key={t.id} className="flex gap-2.5">
                        <span
                          aria-hidden
                          className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warn"
                        />
                        <span className="min-w-0">
                          <span className="block text-[12px] font-medium text-foreground">
                            {t.title}
                          </span>
                          {t.detail ? (
                            <span className="block text-[12px] leading-snug text-ink-2">
                              {t.detail}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex shrink-0 flex-col gap-3 @min-[40rem]/first-event:w-[272px]">
          <p id={stepsId} className="text-[12px] font-medium text-ink-2">
            {hasData ? "Wired up" : "Send your first event"}
          </p>
          <ol aria-labelledby={stepsId} className="flex flex-col">
            {installSteps.map((step, i) => {
              const last = i === installSteps.length - 1;
              const isCopied = copied === step.id;
              return (
                <li
                  key={step.id}
                  className="relative flex gap-3 pb-4 last:pb-0"
                >
                  {!last ? (
                    <span
                      aria-hidden
                      className="absolute top-6 bottom-0 left-[11px] w-px bg-hairline"
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className="relative flex size-6 shrink-0 items-center justify-center rounded-full border border-hairline-strong bg-card font-mono text-[10px] text-ink-2 tabular-nums"
                  >
                    {i + 1}
                    <motion.span
                      className="absolute inset-[-1px] flex items-center justify-center rounded-full"
                      style={{
                        backgroundColor: `oklch(from ${accent} 0.6 calc(c * 0.9) h)`,
                      }}
                      initial={false}
                      animate={{
                        opacity: hasData ? 1 : 0,
                        scale: hasData || !motionSafe ? 1 : 0.6,
                      }}
                      transition={{
                        opacity: {
                          duration: durations.fast,
                          delay: hasData ? 0.5 + i * tickStep : 0,
                        },
                        scale: motionSafe
                          ? { ...springs.flick, delay: 0.5 + i * tickStep }
                          : { duration: 0 },
                      }}
                    >
                      <svg viewBox="0 0 16 16" className="size-3">
                        <motion.path
                          d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                          fill="none"
                          strokeWidth={2.2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="stroke-primary-foreground"
                          initial={false}
                          animate={{ pathLength: hasData ? 1 : 0 }}
                          transition={
                            motionSafe
                              ? {
                                  ...springs.flick,
                                  delay: hasData ? 0.56 + i * tickStep : 0,
                                }
                              : { duration: 0 }
                          }
                        />
                      </svg>
                    </motion.span>
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-[13px] leading-6 font-medium">
                      {step.title}
                    </p>
                    {step.detail ? (
                      <p className="text-[12px] leading-snug text-ink-2">
                        {step.detail}
                      </p>
                    ) : null}
                    {step.code ? (
                      <div className="mt-2 flex items-center gap-1 rounded-2 border border-hairline bg-surface-2">
                        <pre className="min-w-0 flex-1 [scrollbar-width:thin] overflow-x-auto px-2.5 py-1.5 font-mono text-[11px] leading-5 text-foreground">
                          <code>{step.code}</code>
                        </pre>
                        <button
                          ref={(node) => {
                            if (node) copyButtons.current.set(step.id, node);
                            else copyButtons.current.delete(step.id);
                          }}
                          type="button"
                          tabIndex={currentStep === step.id ? 0 : -1}
                          aria-label={
                            isCopied
                              ? `Step ${i + 1} code copied`
                              : `Copy step ${i + 1} code`
                          }
                          aria-disabled={disabled || undefined}
                          onFocus={() => setActiveStep(step.id)}
                          onKeyDown={(event) => onStepKey(event, step.id)}
                          onClick={() => copyStep(step)}
                          className={cn(
                            "mr-1 flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
                            !disabled && "hover:bg-card hover:text-foreground",
                            isCopied && "text-success",
                            FOCUS_RING,
                          )}
                        >
                          {isCopied ? (
                            <svg
                              aria-hidden
                              viewBox="0 0 16 16"
                              className="size-3.5"
                            >
                              <motion.path
                                d="M3 8.5 L6.5 12 L13 4.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: motionSafe ? 0 : 1 }}
                                animate={{ pathLength: 1 }}
                                transition={
                                  motionSafe ? springs.flick : { duration: 0 }
                                }
                              />
                            </svg>
                          ) : (
                            <Copy aria-hidden className="size-3.5" />
                          )}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="sr-only">Up and Down move between the copy buttons.</p>
        </div>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
