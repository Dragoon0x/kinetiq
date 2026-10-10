"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CascadeSplitBy = "letter" | "word" | "line";
export type CascadeSplitMotion = "rise" | "drop" | "swing";
export type CascadeSplitCurve =
  "even" | "ease-in" | "ease-out" | "ease-in-out" | ((t: number) => number);
export type CascadeSplitSpring = "auto" | "snap" | "recoil" | "glide";
export type CascadeSplitTrigger = "mount" | "inView" | "hover" | "manual";
export type CascadeSplitElement = "h1" | "h2" | "h3" | "p" | "span" | "div";

export type CascadeSplitProps = {
  /** The words. */
  text: string;
  /** The element rendered. @default "p" */
  as?: CascadeSplitElement;
  /** What arrives as one piece: each letter, each word, or each line as it wraps. @default "letter" */
  by?: CascadeSplitBy;
  /** How the pieces enter: rise through the baseline, drop and settle, or swing down from a top-left pin. @default "rise" */
  motion?: CascadeSplitMotion;
  /** The base gap between pieces, ms, before the curve shapes it. @default 30 */
  stagger?: number;
  /** How the gaps are spread across the text: an easing name or your own curve from 0–1 to 0–1. @default "ease-in" */
  curve?: CascadeSplitCurve;
  /** Travel: a share of a line for rise and drop, of the safe swing angle for swing, 0 to 1.5. @default 1 */
  distance?: number;
  /** The spring the pieces land on; "auto" picks the one that suits the motion. @default "auto" */
  spring?: CascadeSplitSpring;
  /** Fade the pieces as they travel. @default true */
  fade?: boolean;
  /** What brings the text in. @default "inView" */
  trigger?: CascadeSplitTrigger;
  /** Arrive once; false leaves when it goes out of view or the hover ends. @default true */
  once?: boolean;
  /** Manual trigger: true arrives, false leaves in reverse. */
  play?: boolean;
  /** Wait before the first piece, ms. @default 0 */
  delay?: number;
  /** Time scale of the springs, ms; their damping ratios are kept. @default 300 */
  duration?: number;
  /** Hover nudges, a press (or Enter or Space) to replay, and the keyboard probe. @default true */
  interactive?: boolean;
  /** An arrival ("in") or an exit ("out") settled. */
  onComplete?: (state: "in" | "out") => void;
  className?: string;
};

/** The duration the calibration springs were tuned at, ms. */
const BASE = 300;
/** A rising piece starts this far below its line, em, past the clip. */
const RISE = 1.25;
/** A dropping piece starts this far above, em. */
const DROP = 0.6;
/** A swinging tile never lifts more than this above its line, em. */
const SWING_LIFT = 0.4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const em = (v: number) => `${r3(v)}em`;

type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

/** A calibration spring run `f` times slower, with its damping ratio kept. */
const timed = (s: Spring, f: number): Spring => ({
  ...s,
  stiffness: s.stiffness / (f * f),
  damping: s.damping / f,
});

const soften = (ms: number) =>
  ms <= 500 ? ms : 500 + (450 * (ms - 500)) / (ms - 500 + 450);

const CURVES: Record<
  Exclude<CascadeSplitCurve, (t: number) => number>,
  (t: number) => number
> = {
  even: (t) => t,
  "ease-in": (t) => t * t,
  "ease-out": (t) => 1 - (1 - t) * (1 - t),
  "ease-in-out": (t) => t * t * (3 - 2 * t),
};

/** The clock of the event loop, read from events only, never while rendering. */
const nowMs = () => performance.now();

function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/** A rough advance, em: enough to size a swing without measuring. */
const advance = (ch: string) =>
  /[iljtfI.,;:'!|]/.test(ch) ? 0.3 : /[mwMW@]/.test(ch) ? 0.85 : 0.56;

type Piece = {
  key: string;
  text: string;
  word: number;
  /** Estimated width, em. */
  width: number;
  p: MotionValue<number>;
  ny: MotionValue<number>;
  nr: MotionValue<number>;
};

type PieceProps = {
  piece: Piece;
  mode: CascadeSplitMotion;
  distance: number;
  fade: boolean;
  motionSafe: boolean;
  bind: (node: HTMLSpanElement | null) => void;
};

function PieceView({
  piece,
  mode,
  distance,
  fade,
  motionSafe,
  bind,
}: PieceProps) {
  const lift = SWING_LIFT * distance;
  const angle = r2(
    (Math.asin(clamp01(lift / Math.max(0.2, piece.width))) * 180) / Math.PI,
  );
  const y = useTransform(piece.p, (p) => {
    if (!motionSafe) return "0em";
    if (mode === "rise") return em((1 - p) * RISE * distance);
    if (mode === "drop") return em(-(1 - p) * DROP * distance);
    return "0em";
  });
  const rotate = useTransform(piece.p, (p) =>
    motionSafe && mode === "swing" ? r2(-(1 - p) * angle) : 0,
  );
  const opacity = useTransform(piece.p, (p) => {
    if (!motionSafe) return r3(clamp01(p));
    if (!fade) return p > 0.001 ? 1 : 0;
    const k = mode === "rise" ? 1.6 : mode === "drop" ? 2.4 : 3;
    return r3(clamp01(p * k));
  });
  const ny = useTransform(piece.ny, em);
  // The resting box is a plain element: hit tests and the probe read it,
  // and a rising piece comes up through an edge just under its descenders.
  return (
    <span
      ref={bind}
      className={cn(
        "inline-block",
        mode === "rise" &&
          motionSafe &&
          "[clip-path:inset(-1em_-0.5em_-0.14em_-0.5em)]",
      )}
    >
      <motion.span
        className="relative inline-block whitespace-pre"
        style={{ y, rotate, opacity, originX: 0, originY: 0 }}
      >
        <motion.span
          className="inline-block whitespace-pre"
          style={{ y: ny, rotate: piece.nr, originX: 0, originY: 0 }}
        >
          {piece.text}
        </motion.span>
      </motion.span>
    </span>
  );
}

type Api = {
  sync: () => void;
  replay: () => void;
  measure: () => void;
  halt: () => void;
};

/**
 * Split text with choreography. The text is cut into letters, words or the
 * lines it wraps to, and each piece arrives on a spring in one of three
 * ways: rising through an edge just under its baseline on snap, dropping in
 * and settling on recoil, or swinging down from a pin at its top-left corner
 * like a hanging tile, past rest and back. The gaps between pieces follow an
 * easing curve rather than a fixed step, and leaving runs the same curve in
 * reverse, last piece first, on the exit ease.
 *
 * The pointer passing over a piece nudges it in its own idiom — a hop, a
 * bounce, a swing by the pointer's speed — through a second transform that
 * never fights the entrance. A press, or Enter or Space, plays it again; Left
 * and Right walk a probe along the pieces and nudge each one. Under reduced
 * motion nothing travels: the pieces fade in along the same curve.
 */
export function CascadeSplit({
  text,
  as = "p",
  by = "letter",
  motion: mode = "rise",
  stagger = 30,
  curve = "ease-in",
  distance = 1,
  spring = "auto",
  fade = true,
  trigger = "inView",
  once = true,
  play,
  delay = 0,
  duration = BASE,
  interactive = true,
  onComplete,
  className,
}: CascadeSplitProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const travel = clamp(distance, 0, 1.5);
  const f = clamp(duration, 80, 2000) / BASE;

  const [seen, setSeen] = React.useState(false);
  const [probe, setProbe] = React.useState<{
    owner: Piece[];
    x: number;
    y: number;
    w: number;
  } | null>(null);
  const target =
    trigger === "manual" ? Boolean(play) : trigger === "mount" ? true : seen;

  const words = React.useMemo(
    () => text.split(/\s+/).filter((w) => w.length > 0),
    [text],
  );
  const pieces = React.useMemo<Piece[]>(() => {
    const make = (key: string, t: string, word: number): Piece => ({
      key,
      text: t,
      word,
      width: Array.from(t).reduce((sum, ch) => sum + advance(ch), 0),
      p: motionValue(0),
      ny: motionValue(0),
      nr: motionValue(0),
    });
    if (by === "letter") {
      return words.flatMap((w, i) =>
        graphemes(w).map((ch, j) => make(`${i}:${j}`, ch, i)),
      );
    }
    return words.map((w, i) => make(`${i}`, w, i));
  }, [words, by]);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLSpanElement>());
  const wordNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const nudges = React.useRef(new Map<number, AnimationPlaybackControls[]>());
  const cooled = React.useRef(new Map<number, number>());
  const state = React.useRef<"out" | "arriving" | "in" | "leaving">("out");
  const at = React.useRef(-1);
  const api = React.useRef<Api | null>(null);
  const latest = React.useRef({ onComplete, trigger, once });

  const shape =
    typeof curve === "function" ? curve : (CURVES[curve] ?? CURVES["ease-in"]);
  const springFor = (): Spring => {
    const name =
      spring === "auto" ? (mode === "rise" ? "snap" : "recoil") : spring;
    return timed(springs[name], f);
  };

  /**
   * Which beat each piece belongs to: its own, or — split by line — the line
   * its word sits on, read from the layout at the moment the cascade starts,
   * so a fresh wrap is always the one that plays.
   */
  const beatsNow = () => {
    if (by !== "line") return pieces.map((_, i) => i);
    const tops = words.map((_, w) =>
      Math.round(wordNodes.current.get(w)?.offsetTop ?? 0),
    );
    const rows = Array.from(new Set(tops)).sort((a, b) => a - b);
    return pieces.map((piece) => rows.indexOf(tops[piece.word] ?? 0));
  };

  /** When each piece starts, s: the curve spreads the gaps between beats. */
  const delays = (reverse: boolean, scale = 1) => {
    const beats = beatsNow();
    const n = beats.length ? Math.max(...beats) + 1 : 0;
    const span = (soften(stagger * Math.max(0, n - 1)) / 1000) * scale;
    return beats.map((b) => {
      const t = n > 1 ? b / (n - 1) : 0;
      const u = reverse ? 1 - t : t;
      return clamp(shape(clamp01(u)), 0, 1) * span;
    });
  };

  const halt = () => {
    for (const r of runs.current) r.stop();
    runs.current = [];
  };

  const arrive = () => {
    halt();
    state.current = "arriving";
    if (!pieces.length) return;
    const waits = delays(false, motionSafe ? 1 : 0.5);
    const last = waits.reduce((m, w, i) => (w >= (waits[m] ?? 0) ? i : m), 0);
    const done = () => {
      state.current = "in";
      latest.current.onComplete?.("in");
    };
    const land = springFor();
    pieces.forEach((piece, i) => {
      const wait = delay / 1000 + (waits[i] ?? 0);
      runs.current.push(
        motionSafe
          ? animate(piece.p, 1, {
              ...land,
              delay: wait,
              onComplete: i === last ? done : undefined,
            })
          : animate(piece.p, 1, {
              duration: durations.base,
              ease: easings.enter,
              delay: wait,
              onComplete: i === last ? done : undefined,
            }),
      );
    });
  };

  /** Out in reverse: last piece first, on the exit ease. */
  const leave = (then?: () => void) => {
    halt();
    state.current = "leaving";
    if (!pieces.length) return;
    const waits = delays(true, 0.5);
    const last = waits.reduce((m, w, i) => (w >= (waits[m] ?? 0) ? i : m), 0);
    const out = { duration: durations.base * 0.6, ease: easings.exit };
    pieces.forEach((piece, i) => {
      runs.current.push(
        animate(piece.p, 0, {
          ...out,
          delay: waits[i] ?? 0,
          onComplete:
            i === last
              ? () => {
                  state.current = "out";
                  if (then) then();
                  else latest.current.onComplete?.("out");
                }
              : undefined,
        }),
      );
    });
  };

  const sync = () => {
    const st = state.current;
    if (target) {
      if (
        st === "out" ||
        st === "leaving" ||
        (st === "arriving" && !runs.current.length)
      ) {
        arrive();
      }
    } else if (
      st === "in" ||
      st === "arriving" ||
      (st === "leaving" && !runs.current.length)
    ) {
      leave();
    }
  };

  const replay = () => {
    if (!target) return;
    if (state.current === "out") {
      arrive();
      return;
    }
    leave(() => api.current?.sync());
  };

  /** A nudge in the piece's own idiom, on recoil so it settles. */
  const nudge = (i: number, vx = 0) => {
    const piece = pieces[i];
    if (!piece || !motionSafe || state.current !== "in") return;
    const now = nowMs();
    if (now - (cooled.current.get(i) ?? -Infinity) < 260) return;
    cooled.current.set(i, now);
    for (const c of nudges.current.get(i) ?? []) c.stop();
    const runsFor: AnimationPlaybackControls[] = [];
    if (mode === "swing") {
      const v = clamp(vx * 0.12, -260, 260) || 140;
      runsFor.push(animate(piece.nr, 0, { ...springs.recoil, velocity: v }));
    } else {
      runsFor.push(
        animate(piece.ny, 0, {
          ...springs.recoil,
          velocity: mode === "rise" ? -3.2 : 2.6,
        }),
      );
    }
    nudges.current.set(i, runsFor);
  };

  const hit = (clientX: number, clientY: number) => {
    let found = -1;
    nodes.current.forEach((node, i) => {
      if (found >= 0) return;
      const r = node.getBoundingClientRect();
      if (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        found = i;
      }
    });
    return found;
  };

  const pointer = React.useRef({ x: 0, t: 0 });
  const brush = (event: React.PointerEvent) => {
    if (!interactive || event.pointerType !== "mouse") return;
    const p = pointer.current;
    const dt = Math.max(8, event.timeStamp - p.t);
    const vx = p.t ? ((event.clientX - p.x) / dt) * 1000 : 0;
    pointer.current = { x: event.clientX, t: event.timeStamp };
    const i = hit(event.clientX, event.clientY);
    if (i >= 0) nudge(i, vx);
  };

  /** The keyboard's probe: a tick under the piece it last touched. */
  const measure = () => {
    const root = rootRef.current;
    if (!root) return;
    const i = at.current;
    const node = nodes.current.get(i);
    if (i < 0 || !node) return;
    const box = root.getBoundingClientRect();
    const k = root.offsetWidth ? box.width / root.offsetWidth : 1;
    const r = node.getBoundingClientRect();
    setProbe({
      owner: pieces,
      x: r2((r.left - box.left) / k),
      y: r2((r.bottom - box.top) / k),
      w: r2(r.width / k),
    });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!interactive) return;
    const n = pieces.length;
    if (!n) return;
    let to = at.current;
    switch (event.key) {
      case "ArrowRight":
        to = to < 0 ? 0 : Math.min(n - 1, to + 1);
        break;
      case "ArrowLeft":
        to = to < 0 ? n - 1 : Math.max(0, to - 1);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = n - 1;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!event.repeat) replay();
        return;
      default:
        return;
    }
    event.preventDefault();
    at.current = to;
    cooled.current.delete(to);
    nudge(to, event.key === "ArrowLeft" ? -900 : 900);
    measure();
  };

  React.useLayoutEffect(() => {
    api.current = { sync, replay, measure, halt };
    latest.current = { onComplete, trigger, once };
  });

  React.useEffect(() => {
    api.current?.sync();
  }, [target, motionSafe]);

  // A new split starts its pieces where the text already is, before paint.
  // StrictMode runs this twice for one split; only a real re-split counts.
  const split = React.useRef<Piece[] | null>(null);
  React.useLayoutEffect(() => {
    const before = split.current;
    split.current = pieces;
    if (!before || before === pieces) return;
    const st = state.current;
    if (st === "in" || st === "arriving") {
      // The old pieces' springs drive nothing on screen any more.
      api.current?.halt();
      for (const piece of pieces) piece.p.jump(1);
      state.current = "in";
      if (st === "arriving") latest.current.onComplete?.("in");
    }
    at.current = -1;
    api.current?.measure();
  }, [pieces]);

  React.useEffect(() => {
    const running = nudges.current;
    return () => {
      api.current?.halt();
      for (const list of running.values()) for (const c of list) c.stop();
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const visible = Boolean(entry?.isIntersecting);
      if (latest.current.trigger === "inView") {
        setSeen((was) => (visible ? true : latest.current.once ? was : false));
      }
    });
    watcher.observe(node);
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    return () => {
      watcher.disconnect();
      sizer.disconnect();
    };
  }, []);

  const bindPiece = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) nodes.current.set(i, node);
    else nodes.current.delete(i);
  };
  const bindWord = (w: number) => (node: HTMLSpanElement | null) => {
    if (node) wordNodes.current.set(w, node);
    else wordNodes.current.delete(w);
  };

  const hover = (on: boolean) => {
    if (trigger !== "hover") return;
    setSeen((was) => (on ? true : once ? was : false));
  };

  const Tag: React.ElementType = as;

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={interactive ? 0 : undefined}
        aria-describedby={interactive ? hintId : undefined}
        onPointerEnter={() => hover(true)}
        onPointerLeave={() => {
          hover(false);
          pointer.current = { x: 0, t: 0 };
        }}
        onPointerMove={brush}
        onClick={() => {
          if (!interactive) return;
          const picked = window.getSelection()?.toString() ?? "";
          if (!picked.trim()) replay();
        }}
        onKeyDown={onKeyDown}
        onFocus={() => hover(true)}
        onBlur={() => {
          hover(false);
          at.current = -1;
          setProbe(null);
        }}
        className={cn(
          "group/cascade-split",
          as === "span" ? "inline-block" : "block",
          "relative",
          interactive &&
            "cursor-pointer rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          className,
        )}
      >
        <span className="sr-only select-none">{text}</span>
        <span aria-hidden>
          {words.map((word, w) => (
            <React.Fragment key={w}>
              {w > 0 ? " " : null}
              <span
                ref={bindWord(w)}
                className="inline-block whitespace-nowrap"
              >
                {pieces.map((piece, i) =>
                  piece.word === w ? (
                    <PieceView
                      key={piece.key}
                      piece={piece}
                      mode={mode}
                      distance={travel}
                      fade={fade}
                      motionSafe={motionSafe}
                      bind={bindPiece(i)}
                    />
                  ) : null,
                )}
              </span>
            </React.Fragment>
          ))}
        </span>
        {probe && probe.owner === pieces ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 h-[2px] rounded-full bg-cobalt-bright opacity-0 group-focus-visible/cascade-split:opacity-100"
            style={{
              width: probe.w,
              transform: `translate(${probe.x}px, ${probe.y + 2}px)`,
            }}
          />
        ) : null}
      </Tag>
      {interactive ? (
        <span id={hintId} className="sr-only">
          Left and Right nudge the pieces; Enter plays it again.
        </span>
      ) : null}
    </>
  );
}
