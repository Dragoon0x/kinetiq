"use client";

import * as React from "react";

import { animate, type AnimationPlaybackControls } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  durations,
  easings,
  springs,
  type SpringName,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type EnterStagePreset = "rise" | "settle" | "unfold" | "iris";
export type EnterStageCurve = "decelerate" | "accelerate" | "linear";
export type EnterStageOrigin = "start" | "center" | "end";
export type EnterStageTrigger = "inView" | "mount" | "manual";
export type EnterStageElement =
  | "div"
  | "section"
  | "article"
  | "ul"
  | "ol"
  | "header"
  | "footer"
  | "main"
  | "aside"
  | "nav";

export type EnterStageProps = {
  /** What comes on stage. With `scope="children"` each direct child moves on its own. */
  children?: React.ReactNode;
  /** The element the stage renders — the only node it adds, so a list stays a list. @default "div" */
  as?: EnterStageElement;
  /** How each piece arrives: rises, is set down, swings down on a top hinge, or opens through an iris. @default "rise" */
  preset?: EnterStagePreset;
  /** Gap between neighbouring pieces, ms; the whole cascade is held to the 600 ms budget. @default 60 */
  stagger?: number;
  /** How far the pieces travel, px — also the hinge angle of `unfold` and the zoom of `iris`. @default 16 */
  distance?: number;
  /** Move each direct child, or the stage as one piece. @default "children" */
  scope?: "children" | "self";
  /** How the delays are spaced through the order: gaps that open as it lands, close up, or stay even. @default "decelerate" */
  curve?: EnterStageCurve;
  /** Where the wave starts; pieces are ranked by where they actually sit, so a grid enters as a diagonal. @default "start" */
  origin?: EnterStageOrigin;
  /** What starts the entrance. @default "inView" */
  trigger?: EnterStageTrigger;
  /** False sends the pieces off with the exit choreography; with trigger "manual", true brings them on. */
  show?: boolean;
  /** True: the entrance plays once. False: leaving view plays the exit and coming back plays it again. @default true */
  once?: boolean;
  /** Share of the stage that must be visible before an inView entrance starts, 0 to 1. @default 0.2 */
  amount?: number;
  /** Wait before the first piece moves, ms. @default 0 */
  delay?: number;
  /** Override the preset's spring from the calibration set. @default per preset */
  spring?: SpringName;
  /** Length of the tweened parts (opacity, the iris clip), ms. @default 400 */
  duration?: number;
  /** Order of the exit: last in leaves first, or the entrance order again. @default "reverse" */
  exitOrder?: "reverse" | "same";
  /** Change it to play the entrance again from the start. */
  replayKey?: string | number;
  /** The entrance has landed, or the exit has finished. */
  onComplete?: (state: "entered" | "exited") => void;
  /** Classes for the stage element; lay out the list or grid here. */
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "className">;

type Stage = "waiting" | "entering" | "entered" | "exiting" | "exited";

type Pose = {
  opacity?: number;
  y?: number;
  scale?: number;
  rotateX?: number;
  clipPath?: string;
};

type PresetSpec = {
  spring: SpringName;
  from: (d: number) => Pose;
  exit: (d: number) => Pose;
  rest: Pose;
  hinge?: boolean;
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const IRIS_SHUT = "circle(0% at 50% 50%)";
// 72% of the reference radius reaches the corners of any rectangle.
const IRIS_OPEN = "circle(72% at 50% 50%)";
const BUDGET = 0.6;

const unfoldAngle = (d: number) => Math.min(88, 36 + d * 2.5);

/**
 * Each preset carries its own spring from the calibration set: a rise
 * glides, a piece set down snaps with one overshoot, a flap glides on its
 * hinge, and the iris drifts because it is the largest, slowest surface.
 */
const PRESETS: Record<EnterStagePreset, PresetSpec> = {
  rise: {
    spring: "glide",
    from: (d) => ({ y: r3(d) }),
    exit: (d) => ({ y: r3(-d / 2) }),
    rest: { y: 0 },
  },
  settle: {
    spring: "snap",
    from: (d) => ({ y: r3(-d * 0.75), scale: r3(1 + d / 400) }),
    exit: (d) => ({ y: r3(d / 2), scale: r3(1 - d / 800) }),
    rest: { y: 0, scale: 1 },
  },
  unfold: {
    spring: "glide",
    from: (d) => ({ rotateX: r3(-unfoldAngle(d)), y: r3(-d / 2) }),
    exit: (d) => ({ rotateX: r3(unfoldAngle(d) * 0.5), y: r3(d / 4) }),
    rest: { rotateX: 0, y: 0 },
    hinge: true,
  },
  iris: {
    spring: "drift",
    from: (d) => ({ scale: r3(1 - d / 200), clipPath: IRIS_SHUT }),
    exit: (d) => ({ scale: r3(1 - d / 400), clipPath: IRIS_SHUT }),
    rest: { scale: 1, clipPath: IRIS_OPEN },
  },
};

/** Delay share for a piece at `t` (0..1) through the order. */
function curveAt(curve: EnterStageCurve, t: number): number {
  if (curve === "linear") return t;
  // Delays on an ease-in: the first pieces arrive close together and the
  // gaps open as the cascade lands — the way a sentence slows at its end.
  if (curve === "decelerate") return Math.pow(t, 1.7);
  return 1 - Math.pow(1 - t, 1.7);
}

type Target = HTMLElement | SVGElement;

function targetsOf(root: HTMLElement, scope: "children" | "self"): Target[] {
  if (scope === "self") return [root];
  const out: Target[] = [];
  for (const child of Array.from(root.children)) {
    if (child instanceof HTMLElement || child instanceof SVGElement) {
      out.push(child);
    }
  }
  return out;
}

/**
 * Ranks pieces by where they sit, not where they come in the markup: each
 * centre's distance from the origin, in the stage's own proportions, scaled
 * to 0..1. Pieces on the same diagonal share a rank and arrive together.
 */
function ranksOf(
  root: HTMLElement,
  targets: Target[],
  origin: EnterStageOrigin,
): number[] {
  const n = targets.length;
  if (n <= 1) return targets.map(() => 0);
  const box = root.getBoundingClientRect();
  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  const rtl = getComputedStyle(root).direction === "rtl";
  const ox = origin === "center" ? 0.5 : (origin === "start") !== rtl ? 0 : 1;
  const oy = origin === "center" ? 0.5 : origin === "start" ? 0 : 1;
  const d = targets.map((el) => {
    const r = el.getBoundingClientRect();
    const cx = (r.left + r.width / 2 - box.left) / w;
    const cy = (r.top + r.height / 2 - box.top) / h;
    return Math.hypot(cx - ox, cy - oy);
  });
  const min = Math.min(...d);
  const span = Math.max(...d) - min;
  // Stacked pieces (one on another, or a stage with no layout yet) fall
  // back to their order in the markup.
  if (span < 0.001) return targets.map((_, i) => i / (n - 1));
  return d.map((v) => (v - min) / span);
}

/**
 * The reduced-motion fade, as a plain value animation written to the
 * element's opacity: motion's element animator would read the OS preference
 * itself, and the stage has already decided what reduced motion means.
 */
function fadeOpacity(
  el: Target,
  from: number,
  to: number,
  options: { duration: number; delay: number; ease: readonly number[] },
): AnimationPlaybackControls {
  return animate(from, to, {
    duration: options.duration,
    delay: options.delay,
    ease: options.ease as [number, number, number, number],
    onUpdate: (v) => {
      el.style.opacity = String(Math.round(v * 1000) / 1000);
    },
  });
}

function clearPose(el: Target) {
  el.style.removeProperty("opacity");
  el.style.removeProperty("transform");
  el.style.removeProperty("clip-path");
  el.style.removeProperty("transform-origin");
  el.style.removeProperty("will-change");
}

const both = (pose: Pose, rest: Pose) => {
  const frames: Record<string, [number, number] | [string, string]> = {};
  for (const key of Object.keys(pose) as (keyof Pose)[]) {
    const from = pose[key];
    const to = rest[key];
    if (from === undefined || to === undefined) continue;
    frames[key] = [from, to] as [number, number] | [string, string];
  }
  return frames;
};

/**
 * Brings children on stage with choreography and takes them off again. The
 * stage renders one element (`as`) and writes motion straight onto its
 * direct children with motion's DOM `animate()`, so a list stays a list, a
 * grid keeps its placement, and at rest the children carry none of its
 * styles.
 *
 * The cascade follows the layout: children are ranked by their distance
 * from `origin` as they actually sit, so a grid arrives as a diagonal wave
 * and a row from its inline start, and the delays run on a curve inside the
 * 600 ms budget. Each preset has its own spring — rise glides, settle snaps
 * with one overshoot, unfold swings on a top hinge, iris opens a clip while
 * the piece drifts up to size. Exits never spring: they run in reverse on
 * the exit ease at 0.6× the timings, and an exited stage is inert. Children
 * added after the entrance come on by themselves.
 *
 * Reduced motion: no travel, scale, hinge or clip — each piece fades in on a
 * compressed cascade, and exits fade out.
 */
export function EnterStage({
  children,
  as = "div",
  preset = "rise",
  stagger = 60,
  distance = 16,
  scope = "children",
  curve = "decelerate",
  origin = "start",
  trigger = "inView",
  show,
  once = true,
  amount = 0.2,
  delay = 0,
  spring,
  duration = 400,
  exitOrder = "reverse",
  replayKey,
  onComplete,
  className,
  ...rest
}: EnterStageProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLElement | null>(null);
  // The stage's phase lives on the element (data-stage) and in this ref,
  // never in React state: it changes inside effects and animation callbacks,
  // and the markup React renders always says "waiting", so a re-render can
  // never undo a phase the choreography has already moved past.
  const stageRef = React.useRef<{ node: HTMLElement | null; stage: Stage }>({
    node: null,
    stage: "waiting",
  });
  const lastKey = React.useRef<string | null>(null);
  const [seen, setSeen] = React.useState(false);
  const [inView, setInView] = React.useState(false);

  const completeRef = React.useRef(onComplete);
  React.useEffect(() => {
    completeRef.current = onComplete;
  });

  const offByProps = show === false || (trigger === "manual" && show !== true);
  const wanted =
    !offByProps && (trigger !== "inView" || (once ? seen : inView));

  const setStage = React.useCallback((root: HTMLElement, stage: Stage) => {
    stageRef.current = { node: root, stage };
    root.dataset.stage = stage;
  }, []);

  // In view: one observer until the entrance has been seen (kept while
  // `once` is off, so leaving view can send the pieces off again).
  React.useEffect(() => {
    if (trigger !== "inView") return;
    const root = rootRef.current;
    if (!root) return;
    if (once && seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (!last) return;
        setInView(last.isIntersecting);
        if (last.isIntersecting) setSeen(true);
      },
      { threshold: Math.min(1, Math.max(0, amount)) },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [trigger, once, seen, amount]);

  // The choreography. Every run either finishes what it starts or stops it
  // in cleanup and starts again from a defined pose, so StrictMode's second
  // run (and a prop change mid-flight) lands the pieces, never freezes them.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (stageRef.current.node !== root) {
      stageRef.current = { node: root, stage: "waiting" };
    }
    const spec = PRESETS[preset] ?? PRESETS.rise;
    const d = Math.max(0, distance);
    const key = String(replayKey ?? "");
    const current = stageRef.current.stage;
    const controls: AnimationPlaybackControls[] = [];
    let cancelled = false;

    const finish = (state: "entered" | "exited", targets: Target[]) => {
      Promise.all(controls.map((c) => c.finished)).then(
        () => {
          if (cancelled) return;
          if (state === "entered") for (const el of targets) clearPose(el);
          setStage(root, state);
          completeRef.current?.(state);
        },
        () => {},
      );
    };

    if (wanted) {
      if (current === "entered" && lastKey.current === key) return;
      lastKey.current = key;
      const targets = targetsOf(root, scope);
      // Hidden by inline style before the stage stops hiding them by rule,
      // and measured at rest (a replay clears any pose still in flight), all
      // in one task so nothing paints in between.
      for (const el of targets) {
        clearPose(el);
        el.style.opacity = "0";
      }
      const ranks = ranksOf(root, targets, scope === "self" ? "start" : origin);
      const n = targets.length;
      const spread = Math.min(BUDGET, (Math.max(0, stagger) / 1000) * (n - 1));
      const fade = Math.max(0.05, duration / 1000);
      for (const el of targets) {
        if (motionSafe && spec.hinge) el.style.transformOrigin = "50% 0%";
        if (motionSafe && preset === "iris") el.style.clipPath = IRIS_SHUT;
      }
      setStage(root, "entering");
      targets.forEach((el, i) => {
        const t = curveAt(curve, ranks[i] ?? 0);
        const at = Math.max(0, delay) / 1000;
        if (!motionSafe) {
          controls.push(
            fadeOpacity(el, 0, 1, {
              duration: durations.slow,
              ease: easings.enter,
              delay: at + spread * 0.25 * t,
            }),
          );
          return;
        }
        const wait = at + spread * t;
        const physics = springs[spring ?? spec.spring];
        controls.push(
          animate(
            el,
            {
              opacity: [0, 1],
              ...both(spec.from(d), spec.rest),
              ...(spec.hinge ? { transformPerspective: [900, 900] } : {}),
            },
            {
              ...physics,
              delay: wait,
              opacity: {
                duration: preset === "iris" ? fade * 0.5 : fade,
                ease: easings.enter,
                delay: wait,
              },
              clipPath: {
                duration: fade * 1.5,
                ease: easings.enter,
                delay: wait,
              },
            },
          ),
        );
      });
      finish("entered", targets);
      return () => {
        cancelled = true;
        for (const c of controls) c.stop();
      };
    }

    if (current === "waiting" || current === "exited") return;
    // Exits never spring: reverse order, the exit ease, 0.6× the timings.
    const targets = targetsOf(root, scope);
    const ranks = ranksOf(root, targets, scope === "self" ? "start" : origin);
    const n = targets.length;
    const spread =
      Math.min(BUDGET, (Math.max(0, stagger) / 1000) * (n - 1)) * 0.5;
    const fade = Math.max(0.05, duration / 1000) * 0.6;
    setStage(root, "exiting");
    targets.forEach((el, i) => {
      const rank = ranks[i] ?? 0;
      const t = curveAt(curve, exitOrder === "reverse" ? 1 - rank : rank);
      const wait = (motionSafe ? spread : spread * 0.25) * t;
      const tween = { duration: fade, ease: easings.exit, delay: wait };
      if (motionSafe && spec.hinge) el.style.transformOrigin = "50% 0%";
      if (!motionSafe) {
        const from = Number(getComputedStyle(el).opacity) || 0;
        controls.push(fadeOpacity(el, from, 0, tween));
        return;
      }
      controls.push(animate(el, { opacity: 0, ...spec.exit(d) }, tween));
    });
    finish("exited", targets);
    return () => {
      cancelled = true;
      for (const c of controls) c.stop();
    };
  }, [
    wanted,
    replayKey,
    preset,
    stagger,
    distance,
    scope,
    curve,
    origin,
    delay,
    spring,
    duration,
    exitOrder,
    motionSafe,
    setStage,
    as,
  ]);

  // Late arrivals: a child added while the stage is up comes on by itself,
  // hidden before its first paint (observer callbacks run before paint).
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || scope !== "children") return;
    const spec = PRESETS[preset] ?? PRESETS.rise;
    const d = Math.max(0, distance);
    const running = new Set<AnimationPlaybackControls>();
    const observer = new MutationObserver((records) => {
      const stage = stageRef.current.stage;
      if (stage !== "entering" && stage !== "entered") return;
      // A keyed reorder moves nodes (removed and added in one batch): those
      // are already on stage and stay as they are.
      const moved = new Set<Node>();
      for (const record of records) {
        for (const node of Array.from(record.removedNodes)) moved.add(node);
      }
      const added: Target[] = [];
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (
            (node instanceof HTMLElement || node instanceof SVGElement) &&
            node.parentElement === root &&
            !moved.has(node)
          ) {
            added.push(node);
          }
        }
      }
      const gap = Math.min(0.06, BUDGET / Math.max(1, added.length));
      added.forEach((el, i) => {
        el.style.opacity = "0";
        if (motionSafe && spec.hinge) el.style.transformOrigin = "50% 0%";
        const wait = i * gap;
        const c = motionSafe
          ? animate(
              el,
              {
                opacity: [0, 1],
                ...both(spec.from(d), spec.rest),
                ...(spec.hinge ? { transformPerspective: [900, 900] } : {}),
              },
              {
                ...springs[spring ?? spec.spring],
                delay: wait,
                opacity: {
                  duration: duration / 1000,
                  ease: easings.enter,
                  delay: wait,
                },
                clipPath: {
                  duration: (duration / 1000) * 1.5,
                  ease: easings.enter,
                  delay: wait,
                },
              },
            )
          : fadeOpacity(el, 0, 1, {
              duration: durations.slow,
              ease: easings.enter,
              delay: wait,
            });
        running.add(c);
        c.finished.then(
          () => {
            running.delete(c);
            if (el.isConnected) clearPose(el);
          },
          () => {},
        );
      });
    });
    observer.observe(root, { childList: true });
    return () => {
      observer.disconnect();
      // Finish, never freeze: a late arrival caught mid-entrance by a prop
      // change (or StrictMode) lands at once and drops its inline styles.
      for (const c of running) c.complete();
      running.clear();
    };
  }, [scope, preset, distance, spring, duration, motionSafe]);

  return React.createElement(
    as,
    {
      ...rest,
      ref: rootRef,
      "data-stage": "waiting",
      inert: offByProps || undefined,
      onFocus: (event: React.FocusEvent<HTMLElement>) => {
        rest.onFocus?.(event);
        if (trigger !== "inView") return;
        // A keyboard visitor tabbing into waiting content brings it on at
        // once rather than focusing something invisible.
        setSeen(true);
        setInView(true);
      },
      className: cn(
        scope === "self"
          ? "data-[stage=waiting]:opacity-0"
          : "data-[stage=waiting]:*:opacity-0",
        className,
      ),
    },
    children,
  );
}
