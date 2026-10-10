"use client";

import * as React from "react";

import {
  motion,
  motionValue,
  useTransform,
  type MotionStyle,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DepthOfFieldElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type DepthOfFieldTrigger = "mount" | "inView" | "hover" | "manual";

export type DepthOfFieldProps = {
  /** The line, as a string. Wins over `text`. */
  children?: string;
  /** The line, when it is not given as children. */
  text?: string;
  /** The element that carries the line. @default "p" */
  as?: DepthOfFieldElement;
  /** The lens's f-number, 1 to 16: lower is a wider aperture and softer out-of-focus words. @default 2.8 */
  aperture?: number;
  /** How long the focal plane takes to cross the whole line, ms. @default 1100 */
  sweep?: number;
  /** How far focus breathes past each word before it settles: 0 lands dead on (the snap spring), 1 breathes twice (the recoil spring). @default 0.5 */
  breath?: number;
  /** Depth of field on a re-rack, in words: how many words either side of the focused one stay partly sharp. @default 1.5 */
  depth?: number;
  /** Lens breathing: how much smaller a fully soft word reads, 0 to 0.12. @default 0.04 */
  shrink?: number;
  /** How much opacity a fully soft word loses, 0 to 1. @default 0.4 */
  fade?: number;
  /** Flash a focus-peaking edge on a word as it comes sharp. @default true */
  peaking?: boolean;
  /** The peaking colour, any CSS colour. @default "var(--accent-bright)" */
  peakColor?: string;
  /** Pointing at a word, tapping it, or the arrow keys rack focus to it. @default true */
  interactive?: boolean;
  /** What leaving the line does: "deep" stops down so every word is sharp, "hold" keeps the pull. @default "deep" */
  rest?: "deep" | "hold";
  /** The focused word's index, or null for everything sharp. Controlled. */
  value?: number | null;
  /** The focused word when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the hover, tap or key that moved the focus, with the new index. */
  onValueChange?: (index: number | null) => void;
  /** When the sweep plays. @default "inView" */
  trigger?: DepthOfFieldTrigger;
  /** Play once, or again each time the line re-enters view or is hovered. @default true */
  once?: boolean;
  /** Wait before the sweep, ms. @default 0 */
  delay?: number;
  /** With trigger "manual": true plays the sweep, false returns the line to soft. @default false */
  play?: boolean;
  /** The sweep has settled. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** A circle of confusion grows fast off focus: small defocus still reads. */
const softOf = (d: number) => Math.pow(Math.min(1, Math.abs(d)), 0.6);

/** Fixed integration step: stiff springs stay stable at any frame rate. */
const STEP = 1 / 240;
/** How long a peaking flash takes to fade, s. */
const PEAK_FADE = 0.16;

type Word = { text: string; at: number; label: string };

/** Words, and where each sits along the line as a fraction of its length. */
function wordsOf(text: string): Word[] {
  const out: Word[] = [];
  const total = Math.max(1, text.length);
  for (const match of text.matchAll(/\S+/g)) {
    const start = match.index ?? 0;
    const word = match[0];
    out.push({
      text: word,
      at: (start + word.length / 2) / total,
      label: word.replace(/^[“"'‘(]+|[.,;:!?…”"’')]+$/g, "") || word,
    });
  }
  return out;
}

/** A CSS custom property carried by a motion value. */
const cssVar = (name: `--${string}`, value: MotionValue<string>) =>
  ({ [name]: value }) as MotionStyle;

type Cell = { d: MotionValue<number>; peak: MotionValue<number> };

type Sim = {
  d: Float64Array;
  v: Float64Array;
  peak: Float64Array;
  /** Each word has been soft since it last came sharp. */
  soft: Uint8Array;
  /** Each word has had its kick this sweep. */
  kicked: Uint8Array;
  mode: "rest" | "sweep" | "rack" | "deep";
  /** Seconds into the sweep. */
  t: number;
  /** The focal plane in word-index space, and its velocity. */
  plane: number;
  planeV: number;
  aim: number;
  /** A rack asked for during the sweep, applied when it settles. */
  pending: number | null | undefined;
};

const simOf = (n: number): Sim => ({
  d: new Float64Array(n).fill(1),
  v: new Float64Array(n),
  peak: new Float64Array(n),
  soft: new Uint8Array(n).fill(1),
  kicked: new Uint8Array(n),
  mode: "rest",
  t: 0,
  plane: 0,
  planeV: 0,
  aim: 0,
  pending: undefined,
});

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function LensWord({
  text,
  index,
  cell,
  blur,
  shrink,
  fade,
  peakColor,
  motionSafe,
}: {
  text: string;
  index: number;
  cell: Cell;
  blur: number;
  shrink: number;
  fade: number;
  peakColor: string;
  motionSafe: boolean;
}) {
  const filter = useTransform(cell.d, (d) => {
    const b = softOf(d) * blur;
    return b < 0.002 ? "none" : `blur(${r3(b)}em)`;
  });
  // Shrinking, never growing, so a soft word never reaches past its box.
  const scale = useTransform(cell.d, (d) =>
    motionSafe ? r4(1 - softOf(d) * shrink) : 1,
  );
  const opacity = useTransform(cell.d, (d) => r3(1 - softOf(d) * fade));
  const edge = useTransform(cell.peak, (p) =>
    p < 0.01
      ? "transparent"
      : `color-mix(in oklab, ${peakColor} ${Math.round(p * 100)}%, transparent)`,
  );
  return (
    <motion.span
      data-dof-word={index}
      className="inline-block [-webkit-text-stroke:0.024em_var(--dof-peak)]"
      style={{ filter, scale, opacity, ...cssVar("--dof-peak", edge) }}
    >
      {text}
    </motion.span>
  );
}

type Api = {
  sweep: () => void;
  soften: () => void;
  rack: (to: number | null) => void;
  wake: () => void;
  halt: () => void;
};

/**
 * A line of type shot through a fast lens. Every word starts out of focus —
 * soft, a little smaller, a little faded — and a focal plane sweeps along the
 * line in reading order; as it reaches each word, the word's defocus is
 * kicked to zero on its own spring, and because that spring is slightly
 * under-damped, focus breathes past the word before it settles sharp. A
 * peaking edge flashes on the glyphs the moment they come sharp.
 *
 * Once played, pointing at a word racks focus to it: the focal plane is a
 * spring travelling through the line, so a long pull passes through the words
 * between, each sharpening for an instant, and settles on the target with
 * the words around it falling off with distance. Leaving stops the lens down
 * again. One integrator drives the plane and every word through motion
 * values; it runs only while something is moving, on screen, in a visible
 * page.
 *
 * The line is read once from an sr-only copy; the word spans are hidden from
 * assistive technology and still copy as the real words. A keyboard handle
 * (a slider over the line) racks word to word with the arrow keys. Under
 * reduced motion the words cross-fade from soft to sharp without travel,
 * scale or breathing, and a re-rack fades straight to the new depth.
 */
export function DepthOfField({
  children,
  text,
  as = "p",
  aperture = 2.8,
  sweep = 1100,
  breath = 0.5,
  depth = 1.5,
  shrink = 0.04,
  fade = 0.4,
  peaking = true,
  peakColor = "var(--accent-bright)",
  interactive = true,
  rest = "deep",
  value,
  defaultValue = null,
  onValueChange,
  trigger = "inView",
  once = true,
  delay = 0,
  play = false,
  onComplete,
  className,
}: DepthOfFieldProps) {
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
  const running = onScreen && !hidden;

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const focus = value === undefined ? own : value;

  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);

  const model = React.useMemo(() => {
    const words = wordsOf(line);
    return {
      words,
      cells: words.map((): Cell => ({
        d: motionValue(1),
        peak: motionValue(0),
      })),
    };
  }, [line]);
  const n = model.words.length;
  const shownFocus =
    focus === null || focus === undefined || n === 0
      ? null
      : clamp(Math.round(focus), 0, n - 1);

  const sim = React.useRef<Sim>(simOf(0));
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const api = React.useRef<Api | null>(null);
  const timer = React.useRef<number | null>(null);
  const cfg = React.useRef({
    sweep,
    breath,
    depth,
    motionSafe,
    peaking,
    onComplete,
  });

  const blur = 0.32 / clamp(aperture, 1, 16);

  /** Advances the lens by dt seconds; returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const s = sim.current;
    const c = cfg.current;
    const safe = c.motionSafe;
    const b = clamp(c.breath, 0, 1);
    // Breath runs the calibrated set from snap (lands dead on) to recoil
    // (two visible breaths past focus).
    const k = lerp(springs.snap.stiffness, springs.recoil.stiffness, b);
    const damp = lerp(springs.snap.damping, springs.recoil.damping, b);
    // The plane is a glide-weight spring whose damping loosens with breath,
    // so a pull overshoots the word and comes back.
    const planeK = springs.glide.stiffness;
    const planeC = lerp(springs.glide.damping, 18, b);
    // Racking, the words follow the plane on flick: the plane is the physics.
    const followK = springs.flick.stiffness / springs.flick.mass;
    const followC = springs.flick.damping / springs.flick.mass;
    const span = Math.max(0.25, c.depth);
    const sweepS = Math.max(0.05, c.sweep / 1000);
    const count = s.d.length;
    let left = dt;
    while (left > 1e-7) {
      const h = Math.min(STEP, left);
      left -= h;
      if (s.mode === "sweep") s.t += h;
      if (s.mode === "rack") {
        if (safe) {
          const a = -planeK * (s.plane - s.aim) - planeC * s.planeV;
          s.planeV += a * h;
          s.plane += s.planeV * h;
        } else {
          s.plane = s.aim;
          s.planeV = 0;
        }
      }
      for (let i = 0; i < count; i += 1) {
        let target = 0;
        if (s.mode === "rest") target = 1;
        else if (s.mode === "sweep") {
          const at = model.words[i]?.at ?? 0;
          if (s.t >= at * sweepS) {
            if (!s.kicked[i]) {
              s.kicked[i] = 1;
              // The plane arrives moving: focus is slammed onto the word.
              if (safe) s.v[i] = (s.v[i] ?? 0) - (2 + 6 * b);
            }
          } else target = 1;
        } else if (s.mode === "rack") {
          target = clamp((i - s.plane) / span, -1, 1);
        }
        const d = s.d[i] ?? 0;
        const v = s.v[i] ?? 0;
        if (!safe) {
          s.d[i] = d + (target - d) * (1 - Math.exp(-h / 0.09));
          s.v[i] = 0;
        } else if (s.mode === "rack") {
          const a = -followK * (d - target) - followC * v;
          s.v[i] = v + a * h;
          s.d[i] = d + (v + a * h) * h;
        } else {
          const a = -k * (d - target) - damp * v;
          s.v[i] = v + a * h;
          s.d[i] = d + (v + a * h) * h;
        }
      }
    }
    let busy = s.mode === "sweep" && s.t < sweepS;
    if (s.mode === "rack") {
      busy ||= Math.abs(s.plane - s.aim) > 1e-3 || Math.abs(s.planeV) > 1e-3;
    }
    const fall = Math.exp(-dt / PEAK_FADE);
    for (let i = 0; i < count; i += 1) {
      const d = s.d[i] ?? 0;
      const cell = model.cells[i];
      const ad = Math.abs(d);
      if (ad > 0.35) s.soft[i] = 1;
      let peak = (s.peak[i] ?? 0) * fall;
      if (s.soft[i] && ad < 0.06 && s.mode !== "rest") {
        s.soft[i] = 0;
        if (c.peaking) peak = 1;
      }
      if (peak < 0.01) peak = 0;
      s.peak[i] = peak;
      const target =
        s.mode === "rest"
          ? 1
          : s.mode === "rack"
            ? clamp((i - s.plane) / span, -1, 1)
            : s.mode === "sweep" && !s.kicked[i]
              ? 1
              : 0;
      if (
        Math.abs(d - target) > 1e-3 ||
        Math.abs(s.v[i] ?? 0) > 1e-3 ||
        peak > 0
      ) {
        busy = true;
      }
      cell?.d.set(r4(d));
      cell?.peak.set(r3(peak));
    }
    if (s.mode === "sweep" && !busy) {
      s.mode = "deep";
      c.onComplete?.();
      const pending = s.pending;
      s.pending = undefined;
      if (pending !== undefined && pending !== null) {
        api.current?.rack(pending);
        return true;
      }
    }
    return busy;
  };

  const frame = (now: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    const busy = step(dt);
    if (busy && live.current) {
      raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
    }
  };
  const frameRef = React.useRef(frame);

  const wake = () => {
    if (raf.current || !live.current) return;
    last.current = performance.now();
    raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
  };

  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  const startSweep = () => {
    const s = sim.current;
    s.mode = "sweep";
    s.t = 0;
    s.kicked.fill(0);
    s.pending = shownFocus ?? undefined;
    // A line already sharp goes soft first, so a replay reads as a pull.
    for (let i = 0; i < s.d.length; i += 1) {
      s.d[i] = Math.max(s.d[i] ?? 0, 1);
      s.v[i] = 0;
      s.soft[i] = 1;
    }
    wake();
  };

  const soften = () => {
    const s = sim.current;
    s.mode = "rest";
    s.pending = undefined;
    wake();
  };

  const rack = (to: number | null) => {
    const s = sim.current;
    if (s.mode === "sweep") {
      s.pending = to;
      return;
    }
    // A line that has not played stays soft; the sweep picks the focus up
    // when it lands. (Keys wake a soft line themselves.)
    if (s.mode === "rest") return;
    if (to === null) {
      s.mode = "deep";
      wake();
      return;
    }
    if (s.mode !== "rack") {
      // From everything sharp, the plane starts on the word itself: a
      // stop-down to shallow focus, not a pull from the start of the line.
      s.plane = to;
      s.planeV = 0;
    }
    s.mode = "rack";
    s.aim = to;
    wake();
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      sweep,
      breath,
      depth,
      motionSafe,
      peaking,
      onComplete,
    };
    frameRef.current = frame;
    live.current = running;
    api.current = { sweep: startSweep, soften, rack, wake, halt };
  });

  // A new line starts soft, and plays again if the old one had played.
  React.useLayoutEffect(() => {
    sim.current = simOf(model.cells.length);
    for (const cell of model.cells) {
      cell.d.set(1);
      cell.peak.set(0);
    }
  }, [model]);

  React.useEffect(() => {
    if (started) api.current?.sweep();
    else api.current?.soften();
  }, [started, entrance.n, model]);

  React.useEffect(() => {
    api.current?.rack(shownFocus);
  }, [shownFocus]);

  // Off screen or hidden the lens stops where it is and picks up from there.
  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
    return () => api.current?.halt();
  }, [running]);

  // A tweak (aperture, breath, depth) re-renders the words; anything that
  // changes where the lens is heading also needs the loop awake.
  React.useEffect(() => {
    api.current?.wake();
  }, [depth, breath, motionSafe]);

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

  const seen = React.useRef({ trigger, once, delay, played: false });
  React.useLayoutEffect(() => {
    seen.current = { ...seen.current, trigger, once, delay };
    if (started) seen.current.played = true;
  });

  const bindRoot = React.useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        const t = seen.current;
        if (t.trigger !== "inView") return;
        if (visible) begin(false, t.delay);
        else if (!t.once && t.played) reset();
      });
      watcher.observe(node);
      return () => watcher.disconnect();
    },
    [begin, reset],
  );

  const enter = () => {
    if (trigger === "hover") begin(!once, delay);
  };

  const choose = (next: number | null) => {
    if (next === shownFocus) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const wordAt = (target: EventTarget | null) => {
    const node =
      target instanceof Element ? target.closest("[data-dof-word]") : null;
    const raw = node?.getAttribute("data-dof-word");
    return raw === null || raw === undefined ? null : Number(raw);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (n === 0) return;
    let next: number | null | undefined;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = shownFocus === null ? 0 : Math.min(n - 1, shownFocus + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = shownFocus === null ? n - 1 : Math.max(0, shownFocus - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = n - 1;
        break;
      case "Escape":
        if (shownFocus === null) return;
        next = null;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        api.current?.sweep();
        return;
      default:
        return;
    }
    event.preventDefault();
    const s = sim.current;
    if (s.mode === "rest") {
      // Keys before the sweep has played: the lens racks straight out of
      // the soft line.
      s.mode = "rack";
      s.plane = next ?? 0;
      s.planeV = 0;
      s.aim = next ?? 0;
      wake();
    }
    choose(next ?? null);
  };

  const Wrapper = as === "span" ? "span" : "div";
  const Tag = as;
  const focusedWord = shownFocus === null ? null : model.words[shownFocus];

  return (
    <Wrapper
      ref={bindRoot}
      className={cn(
        "relative",
        as === "span" ? "inline-block" : "block",
        className,
      )}
      onPointerEnter={enter}
      onPointerLeave={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        if (rest === "deep") choose(null);
      }}
    >
      <Tag className="m-0">
        <span className="sr-only select-none">{line}</span>
        <span
          aria-hidden
          onPointerOver={(event) => {
            if (!interactive || event.pointerType === "touch") return;
            // The pointer re-racks a line that has played, never a soft one.
            if (sim.current.mode === "rest") return;
            const i = wordAt(event.target);
            if (i !== null) choose(i);
          }}
          onPointerDown={(event) => {
            if (!interactive || event.pointerType !== "touch") return;
            if (sim.current.mode === "rest") return;
            const i = wordAt(event.target);
            // A tap racks to the word; a second tap on it stops down.
            if (i !== null) choose(i === shownFocus ? null : i);
          }}
        >
          {model.words.map((word, i) => (
            <React.Fragment key={i}>
              {i > 0 ? " " : null}
              <LensWord
                text={word.text}
                index={i}
                cell={model.cells[i] as Cell}
                blur={blur}
                shrink={clamp(shrink, 0, 0.12)}
                fade={clamp(fade, 0, 1)}
                peakColor={peakColor}
                motionSafe={motionSafe}
              />
            </React.Fragment>
          ))}
        </span>
      </Tag>
      {interactive && n > 0 ? (
        <>
          <span
            role="slider"
            tabIndex={0}
            aria-label="Focus"
            aria-describedby={hintId}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={n}
            aria-valuenow={shownFocus === null ? 0 : shownFocus + 1}
            aria-valuetext={
              focusedWord
                ? `“${focusedWord.label}”, word ${(shownFocus ?? 0) + 1} of ${n}`
                : "Everything in focus"
            }
            onKeyDown={onKeyDown}
            onFocus={enter}
            onBlur={() => {
              if (rest === "deep") choose(null);
            }}
            className="pointer-events-none absolute inset-0 rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Left and Right rack the focus from word to word, Escape brings
            everything into focus, Enter plays the focus pull again.
          </span>
        </>
      ) : null}
    </Wrapper>
  );
}
