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
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DrumWordsTrigger = "mount" | "inView" | "hover" | "manual";
export type DrumWordsWidth = "fit" | "widest";
export type DrumWordsAlign = "start" | "center";
export type DrumWordsElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type DrumWordsProps = {
  /** The words on the drum's faces, in turning order. */
  words: string[];
  /** The sentence before the slot. A space is added between it and the word; end it with "\n" to set the word on its own line, so a longer word never re-wraps the sentence. @default "" */
  before?: string;
  /** The sentence after the slot, including any leading space it needs. @default "" */
  after?: string;
  /** The element rendered. @default "h2" */
  as?: DrumWordsElement;
  /** Controlled: the word showing, an index into `words`. */
  index?: number;
  /** The word showing first when uncontrolled. @default 0 */
  defaultIndex?: number;
  /** Fires from the turn that changed it — the timer, a key, a tap or a throw — with the new index. */
  onIndexChange?: (index: number) => void;
  /** How long each word rests before the drum turns, ms. 0 turns only by hand. @default 2400 */
  interval?: number;
  /** Drum curvature, 0 to 1: 0 is a nearly flat roll, 1 a tight drum with deep foreshortening. @default 0.6 */
  depth?: number;
  /** "fit" springs the slot to each word so the sentence glides; "widest" holds the widest word so it never moves. @default "fit" */
  width?: DrumWordsWidth;
  /** Where a word sits in a slot wider than it. @default "start" */
  align?: DrumWordsAlign;
  /** The words' colour. @default "var(--accent-bright)" */
  color?: string;
  /** Hold the drum while the pointer rests on the word. @default true */
  pauseOnHover?: boolean;
  /** Stop turning on the timer. Keys, taps and throws still turn it. @default false */
  paused?: boolean;
  /** The word is a control: drag or throw it vertically, tap it, or use the arrow keys. @default true */
  interactive?: boolean;
  /** When the timer runs: from mount, once seen, only while the sentence is hovered or focused, or never (turn by `index`). @default "inView" */
  trigger?: DrumWordsTrigger;
  /** Turn through the words a single time and rest on the last. @default false */
  once?: boolean;
  /** Extra wait before the first turn, ms. @default 0 */
  delay?: number;
  /** Tick on every detent the visitor turns. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires when a `once` cycle comes to rest on the last word. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (a: number, n: number) => ((a % n) + n) % n;
/** Drag travel per detent, in line heights: a word's height and a little more. */
const PITCH = 1.15;

/**
 * The drum's shape from `depth`. Units are `lh` — the slot's own line height
 * — so the geometry is the same on the server and in the browser, and holds
 * from a caption to a hero without measuring anything.
 */
function geometryOf(depth: number) {
  const d = clamp01(depth);
  const theta = lerp(22, 74, d);
  const radius = 0.5 / Math.tan((theta * Math.PI) / 360);
  return {
    theta,
    radius: r3(radius),
    perspective: r3(lerp(7, 2.6, d)),
  };
}

type Geometry = ReturnType<typeof geometryOf>;

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function Face({
  k,
  rot,
  word,
  geo,
  align,
}: {
  k: number;
  rot: MotionValue<number>;
  word: string;
  geo: Geometry;
  align: DrumWordsAlign;
}) {
  // Every face hangs on the same axis, r behind the window: pushed back,
  // turned, brought forward again — so the resting face is exactly its
  // natural size and a turning one is truly foreshortened and keystoned.
  const transform = useTransform(rot, (v) => {
    const phi = clamp((v - k) * geo.theta, -120, 120);
    return `perspective(${geo.perspective}lh) translateZ(-${geo.radius}lh) rotateX(${r2(phi)}deg) translateZ(${geo.radius}lh)`;
  });
  // Shading: a face catches less light the further it turns from you, and
  // is gone before it rests a detent away, so no neighbour lingers in the
  // window's edge.
  const opacity = useTransform(rot, (v) => {
    const d = Math.abs(v - k);
    const phi = d * geo.theta;
    if (phi >= 90 || d >= 0.9) return 0;
    const fall = 1 - (d / 0.9) ** 2;
    return r3(fall * Math.cos((phi * Math.PI) / 180) ** 0.8);
  });
  return (
    <motion.span
      className={cn(
        "absolute top-[0.1em] whitespace-nowrap [backface-visibility:hidden]",
        align === "center" ? "inset-x-0 text-center" : "left-0",
      )}
      style={{ transform, opacity }}
    >
      {word}
    </motion.span>
  );
}

type Api = {
  turnBy: (delta: number, audible: boolean) => void;
  autoStep: () => void;
  measure: () => void;
  pan: () => number;
};

/**
 * One word of a sentence on a ratcheted drum. The slot is a window onto a
 * cylinder of faces, each placed with a real 3D transform about an axis
 * behind the line, so the outgoing word tips away over the top, the next one
 * comes up from below foreshortened, and the faces darken as they turn away.
 * Each change is one detent: the drum preloads a hair backwards on the flick
 * spring, as a pawl lifts, and ratchets forward on the snap spring, whose
 * single overshoot reads as the detent catching. The slot's width follows the
 * word on the glide spring, so the rest of the sentence glides instead of
 * jumping.
 *
 * The word is a spinbutton: Up/Right, Enter and Space turn forward, Down/Left
 * back, Home/End to the ends; a vertical drag turns the drum 1:1 and a throw
 * commits to the detent it was heading for; a tap advances it. The timer
 * pauses while the pointer rests on the word, while it has focus, while it is
 * dragged, off screen and in a hidden page. Visitor turns tick when `sound`
 * is on; the timer's never do. Under reduced motion the words crossfade and
 * the slot width changes at once.
 */
export function DrumWords({
  words,
  before = "",
  after = "",
  as = "h2",
  index,
  defaultIndex = 0,
  onIndexChange,
  interval = 2400,
  depth = 0.6,
  width = "fit",
  align = "start",
  color = "var(--accent-bright)",
  pauseOnHover = true,
  paused = false,
  interactive = true,
  trigger = "inView",
  once = false,
  delay = 0,
  sound = false,
  onComplete,
  className,
}: DrumWordsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const list = React.useMemo(() => (words.length > 0 ? words : [""]), [words]);
  const n = list.length;
  const geo = geometryOf(depth);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );

  const [own, setOwn] = React.useState(() => mod(defaultIndex, n));
  const current = mod(Math.round(index ?? own), n);

  const rot = useMotionValue(current);
  const slotWidth = useMotionValue(0);
  const fade = useMotionValue(1);
  const [measured, setMeasured] = React.useState(false);
  const [base, setBase] = React.useState(current);
  /** Under reduced motion: the face fading out, if any. */
  const [leaving, setLeaving] = React.useState<number | null>(null);
  const [onScreen, setOnScreen] = React.useState(true);
  const [seen, setSeen] = React.useState(false);
  const [rootHover, setRootHover] = React.useState(false);
  const [slotHover, setSlotHover] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [finished, setFinished] = React.useState(false);
  const [beat, setBeat] = React.useState(0);

  const slotRef = React.useRef<HTMLSpanElement | null>(null);
  const measurer = React.useRef<HTMLSpanElement | null>(null);
  const widths = React.useRef<number[]>([]);
  /** The detent the drum is at or heading for, unbounded: it only ever counts on. */
  const pos = React.useRef(current);
  /** The index the drum shows or is turning to. */
  const shown = React.useRef(current);
  /** The direction a visitor's step asked for, read when the new index lands. */
  const pending = React.useRef<{ dir: number; audible: boolean } | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const widthRun = React.useRef<AnimationPlaybackControls | null>(null);
  const drag = React.useRef({ start: 0, pitch: 40 });
  const audible = React.useRef(false);
  const lastTick = React.useRef(current);
  const started = React.useRef(false);
  const restCallback = React.useRef(false);
  const api = React.useRef<Api | null>(null);
  const latest = React.useRef({ onIndexChange, onComplete });

  const halt = () => {
    for (const c of running.current) c.stop();
    running.current = [];
  };

  const panHere = () => {
    const slot = slotRef.current;
    if (!slot) return 0;
    const r = slot.getBoundingClientRect();
    return panFrom(r.left + r.width / 2, null);
  };

  /** Moves the drum by whole detents, from wherever it stands. */
  const turnBy = (delta: number, heard: boolean) => {
    if (delta === 0) return;
    const from = pos.current;
    pos.current += delta;
    audible.current = heard;
    // Read before the halt: a turn that lands mid-turn chains on, it does
    // not kick back again.
    const turning = rot.isAnimating();
    halt();
    if (!motionSafe) {
      rot.jump(pos.current);
      setLeaving(from);
      fade.jump(0);
      running.current = [
        animate(fade, 1, {
          duration: durations.base,
          ease: easings.enter,
          onComplete: () => setLeaving(null),
        }),
      ];
      if (heard) audio.play("tick", { pitch: 1, gain: 0.5, pan: panHere() });
      if (restCallback.current) {
        restCallback.current = false;
        latest.current.onComplete?.();
      }
      return;
    }
    const target = pos.current;
    const settle = () =>
      animate(rot, target, {
        ...springs.snap,
        velocity: rot.getVelocity(),
        onComplete: () => {
          if (restCallback.current) {
            restCallback.current = false;
            latest.current.onComplete?.();
          }
        },
      });
    if (Math.abs(delta) === 1 && !turning) {
      // The pawl lifts: a hair backwards on flick, then the ratchet.
      const kick = animate(rot, rot.get() - Math.sign(delta) * 0.06, {
        ...springs.flick,
        restDelta: 0.004,
        onComplete: () => {
          running.current = [settle()];
        },
      });
      running.current = [kick];
    } else {
      running.current = [settle()];
    }
  };

  /** A step asked for by the timer or the visitor. */
  const step = (dir: number, heard: boolean) => {
    const next = mod(current + dir, n);
    if (next === current) return;
    pending.current = { dir, audible: heard };
    if (index === undefined) setOwn(next);
    latest.current.onIndexChange?.(next);
  };

  const goTo = (to: number, heard: boolean) => {
    const next = mod(to, n);
    if (next === current) return;
    pending.current = { dir: 0, audible: heard };
    if (index === undefined) setOwn(next);
    latest.current.onIndexChange?.(next);
  };

  const autoStep = () => {
    if (n < 2) return;
    started.current = true;
    const next = mod(current + 1, n);
    if (once && next === n - 1) {
      setFinished(true);
      restCallback.current = true;
    }
    step(1, false);
    setBeat((b) => b + 1);
  };

  const measure = () => {
    const box = measurer.current;
    if (!box) return;
    widths.current = Array.from(box.children, (child) =>
      r2((child as HTMLElement).getBoundingClientRect().width),
    );
    const target =
      width === "widest"
        ? Math.max(0, ...widths.current)
        : (widths.current[shown.current] ?? 0);
    if (!measured) {
      slotWidth.jump(target);
      setMeasured(true);
      return;
    }
    if (!slotWidth.isAnimating()) slotWidth.jump(target);
  };

  React.useLayoutEffect(() => {
    api.current = { turnBy, autoStep, measure, pan: panHere };
    latest.current = { onIndexChange, onComplete };
  });

  // The index is state: the host hears it from the first commit too.
  React.useEffect(() => {
    latest.current.onIndexChange?.(current);
    // Reported once, as the component arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The index landed (from a step, the host, or a throw): the drum turns to
  // it — the way the step asked, or the short way for a jump.
  React.useEffect(() => {
    if (current === shown.current) return;
    const asked = pending.current;
    pending.current = null;
    let delta = mod(current - shown.current, n);
    if (asked && asked.dir < 0) delta -= n;
    else if (!asked?.dir && delta > n / 2) delta -= n;
    shown.current = current;
    api.current?.turnBy(delta, asked?.audible ?? false);
  }, [current, n]);

  // The slot follows the word showing, on glide.
  React.useEffect(() => {
    if (!measured) return;
    const target =
      width === "widest"
        ? Math.max(0, ...widths.current)
        : (widths.current[current] ?? slotWidth.get());
    widthRun.current?.stop();
    if (!motionSafe) {
      slotWidth.jump(target);
      return;
    }
    widthRun.current = animate(slotWidth, target, springs.glide);
  }, [current, width, measured, motionSafe, slotWidth]);

  // The faces in the window follow the drum, one detent at a time.
  React.useEffect(() => {
    const unsubscribe = rot.on("change", (v) => {
      const b = Math.round(v);
      setBase((was) => (was === b ? was : b));
      const detent = Math.round(v);
      if (detent !== lastTick.current) {
        lastTick.current = detent;
        if (audible.current) {
          audio.play("tick", {
            pitch: r2(0.92 + (mod(detent, n) % 5) * 0.05),
            gain: 0.5,
            pan: api.current?.pan() ?? 0,
          });
        }
      }
    });
    return unsubscribe;
  }, [rot, audio, n]);

  React.useEffect(() => {
    const anims = running;
    const w = widthRun;
    return () => {
      for (const c of anims.current) c.stop();
      anims.current = [];
      w.current?.stop();
    };
  }, []);

  // The timer: armed by the trigger, held by a hand on the word, focus, a
  // drag, the viewport or a hidden page.
  const armed =
    trigger === "mount" ||
    (trigger === "inView" && seen) ||
    (trigger === "hover" && (rootHover || focused));
  const holding =
    dragging ||
    (trigger !== "hover" && (focused || (pauseOnHover && slotHover)));
  const auto =
    n > 1 &&
    interval > 0 &&
    !paused &&
    armed &&
    !holding &&
    onScreen &&
    !hidden &&
    !(once && finished);
  React.useEffect(() => {
    if (!auto) return;
    const wait = interval + (started.current ? 0 : Math.max(0, delay));
    const timer = window.setTimeout(() => api.current?.autoStep(), wait);
    return () => window.clearTimeout(timer);
  }, [auto, interval, delay, beat, current]);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        setOnScreen(entry.isIntersecting);
        if (entry.intersectionRatio >= 0.5) setSeen(true);
      },
      { threshold: [0, 0.5] },
    );
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  // Each word is observed on its own: the measurer is a zero-size box, so
  // nothing it holds can widen or scroll the page.
  const bindMeasurer = React.useCallback((node: HTMLSpanElement | null) => {
    measurer.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    for (const child of Array.from(node.children)) sizer.observe(child);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => sizer.disconnect();
  }, []);

  const gesture = useDrag({
    axis: "y",
    threshold: 4,
    disabled: !interactive,
    onStart: () => {
      const slot = slotRef.current;
      const h = slot ? slot.getBoundingClientRect().height : 40;
      drag.current = { start: rot.get(), pitch: Math.max(12, h * PITCH) };
      audible.current = true;
      halt();
      setDragging(true);
    },
    onMove: ({ offset }) => {
      if (!motionSafe) return;
      // Up turns the drum forward: the surface goes the way the hand goes.
      rot.set(r3(drag.current.start - offset.y / drag.current.pitch));
    },
    onEnd: ({ velocity, offset }) => {
      setDragging(false);
      const { pitch } = drag.current;
      if (!motionSafe) {
        const steps = Math.round(-offset.y / pitch);
        if (steps !== 0) step(clamp(steps, -1, 1), true);
        return;
      }
      const v = -velocity.y / pitch;
      const target = Math.round(project(rot.get(), v, 0.99));
      const next = mod(target, n);
      halt();
      if (index !== undefined) {
        // Controlled: back to where the host says it is. If the host takes
        // the new word, the index effect turns the drum on to it.
        running.current = [
          animate(rot, pos.current, { ...springs.snap, velocity: v }),
        ];
        if (next !== current) {
          pending.current = {
            dir: Math.sign(target - pos.current),
            audible: true,
          };
          latest.current.onIndexChange?.(next);
        }
        return;
      }
      pos.current = target;
      shown.current = next;
      running.current = [
        animate(rot, target, { ...springs.snap, velocity: v }),
      ];
      if (next !== current) {
        setOwn(next);
        latest.current.onIndexChange?.(next);
      }
    },
    onCancel: () => {
      setDragging(false);
      halt();
      if (motionSafe) {
        running.current = [animate(rot, pos.current, springs.snap)];
      }
    },
    onTap: () => step(1, true),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (!interactive) return;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
      case "Enter":
      case " ":
        step(1, true);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        step(-1, true);
        break;
      case "Home":
        goTo(0, true);
        break;
      case "End":
        goTo(n - 1, true);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const Tag = as as "h2";
  const word = list[current] ?? "";
  const lead = before.trimEnd();
  const breakAfter = /\n\s*$/.test(before);
  const faces: number[] = [];
  for (let k = base - 2; k <= base + 2; k += 1) faces.push(k);

  const fadeOut = useTransform(fade, (f) => r3(1 - f));

  return (
    <Tag
      ref={bindRoot}
      onPointerEnter={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType !== "touch") setRootHover(true);
      }}
      onPointerLeave={() => setRootHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={cn("relative", className)}
    >
      {lead ? (
        breakAfter ? (
          <>
            {lead}
            <br />
          </>
        ) : (
          `${lead} `
        )
      ) : null}
      <motion.span
        ref={slotRef}
        role="spinbutton"
        aria-label="Word"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={current + 1}
        aria-valuetext={word}
        aria-readonly={interactive ? undefined : true}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={onKeyDown}
        onPointerEnter={(event: React.PointerEvent<HTMLSpanElement>) => {
          if (event.pointerType !== "touch") setSlotHover(true);
        }}
        onPointerLeave={() => setSlotHover(false)}
        {...(interactive ? gesture : {})}
        className={cn(
          "relative inline-block rounded-1 align-baseline outline-none select-none [-webkit-touch-callout:none]",
          interactive &&
            "cursor-ns-resize touch-pan-x transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--drum-ink)_8%,transparent)] focus-visible:bg-[color-mix(in_oklab,var(--drum-ink)_8%,transparent)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={
          {
            width: measured ? slotWidth : undefined,
            "--drum-ink": color,
          } as React.ComponentProps<typeof motion.span>["style"]
        }
      >
        {/* The word in the flow: it holds the baseline, sizes the slot before
            it is measured, and is what selection and copy pick up. */}
        <span className="whitespace-nowrap text-transparent select-text">
          {word}
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-[0.1em] -bottom-[0.1em] overflow-clip select-none"
          style={{
            color,
            maskImage:
              "linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)",
          }}
        >
          {motionSafe ? (
            faces.map((k) => (
              <Face
                key={k}
                k={k}
                rot={rot}
                word={list[mod(k, n)] ?? ""}
                geo={geo}
                align={align}
              />
            ))
          ) : (
            <>
              {leaving !== null ? (
                <motion.span
                  key="out"
                  className={cn(
                    "absolute top-[0.1em] whitespace-nowrap",
                    align === "center" ? "inset-x-0 text-center" : "left-0",
                  )}
                  style={{ opacity: fadeOut }}
                >
                  {list[mod(leaving, n)]}
                </motion.span>
              ) : null}
              <motion.span
                key="in"
                className={cn(
                  "absolute top-[0.1em] whitespace-nowrap",
                  align === "center" ? "inset-x-0 text-center" : "left-0",
                )}
                style={{ opacity: fade }}
              >
                {word}
              </motion.span>
            </>
          )}
        </span>
        <span
          key={list.join("\n")}
          ref={bindMeasurer}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden whitespace-nowrap select-none"
        >
          {list.map((w, i) => (
            <span key={`${i}:${w}`} className="absolute top-0 left-0 w-max">
              {w}
            </span>
          ))}
        </span>
      </motion.span>
      {after}
    </Tag>
  );
}
