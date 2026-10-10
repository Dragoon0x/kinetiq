"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ScrambleBrushGlyphs = "symbols" | "binary" | "blocks" | "letters";
export type ScrambleBrushElement =
  "p" | "div" | "span" | "h1" | "h2" | "h3" | "h4";

export type ScrambleBrushProps = {
  /** The text. Read once by assistive technology, and copied as written. */
  text: string;
  /** The element the text renders as. @default "p" */
  as?: ScrambleBrushElement;
  /** How far from the pointer letters scramble, px. @default 48 */
  radius?: number;
  /** How long a letter stays scrambled after the pointer last touched it, ms. @default 420 */
  restore?: number;
  /** The noise a scrambled letter shows. @default "symbols" */
  glyphs?: ScrambleBrushGlyphs;
  /** A custom glyph set; overrides `glyphs`. */
  characters?: string;
  /** How often a scrambled letter re-rolls its glyph, ms. @default 70 */
  rate?: number;
  /** How much longer the brush's core holds its noise than its rim, 0 to 1. @default 0.6 */
  falloff?: number;
  /** The noise's colour at the brush's core; it cools toward muted ink. @default "var(--accent-bright)" */
  color?: string;
  /** The text is focusable and the arrow keys brush it word by word. @default true */
  keyboard?: boolean;
  /** Nothing scrambles. @default false */
  disabled?: boolean;
  /** Seeds the noise. @default 0 */
  seed?: number;
  /** How many letters are scrambled, as it changes. */
  onScrambleChange?: (count: number) => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

const SETS: Record<ScrambleBrushGlyphs, string> = {
  symbols: "!<>-_\\/[]{}=+*^?#%&@$~",
  binary: "01",
  blocks: "▖▗▘▙▚▛▜▝▞▟▀▄▌▐░▒▓",
  letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
};

/** Heat levels the noise is drawn in, from the core's colour to muted ink. */
const HEAT = 5;
/** The wake ripples back to type this many ms apart along a word. */
const RIPPLE = 28;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** User-perceived characters, so an emoji or an accent never splits in two. */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/** The frame clock, read only from events, effects and frames. */
const clockNow = () => performance.now();

type Letter = {
  scrambled: boolean;
  /** When it goes back to its letter, ms; Infinity while held by the keyboard. */
  until: number;
  /** How long the touch that last reached it holds, ms. */
  hold: number;
  /** When it next re-rolls, ms. */
  roll: number;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  brushAt: (x: number, y: number) => void;
  tick: (now: number) => void;
  kick: () => void;
  measure: () => void;
  hold: (word: number) => void;
  release: () => void;
};

/**
 * Text you can brush. Letters within `radius` of the pointer turn to noise —
 * a glyph from the chosen set that re-rolls as it sits, jittering a hair —
 * and each one returns to its letter `restore` ms after the pointer last
 * touched it, the brush's core holding longer than its rim, so the cursor
 * drags a tapering wake of noise through the paragraph. The noise is hot at
 * the core and cools toward muted ink as it waits. Each true letter drops
 * back in from a nudge above on the snap spring with one crisp overshoot, so
 * the wake settles behind the brush in a ripple.
 *
 * The text is focusable: keyboard focus scrambles the first word and holds it
 * while it is focused; Left and Right move to the next word and the one left
 * behind ripples back to type, Home and End jump to the ends. A horizontal
 * drag brushes on touch; vertical drags still scroll. Frames run only while
 * something is scrambled, writing straight to the letters' noise layer, and
 * stop when the last letter is back. The text is read once from an sr-only
 * copy and selects and copies as written. Under reduced motion a touched
 * letter shows one still glyph and cross-fades back to its letter.
 */
export function ScrambleBrush({
  text,
  as = "p",
  radius = 48,
  restore = 420,
  glyphs = "symbols",
  characters,
  rate = 70,
  falloff = 0.6,
  color = "var(--accent-bright)",
  keyboard = true,
  disabled = false,
  seed = 0,
  onScrambleChange,
  className,
}: ScrambleBrushProps) {
  const motionSafe = useMotionSafe();
  const hintId = `${React.useId()}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );

  const chars = React.useMemo(() => graphemes(text), [text]);
  const set = React.useMemo(
    () =>
      graphemes(
        characters && characters.length > 0
          ? characters
          : (SETS[glyphs] ?? SETS.symbols),
      ),
    [characters, glyphs],
  );
  /** Each word's letters (character indices), for the keyboard. */
  const words = React.useMemo(() => {
    const out: number[][] = [];
    let current: number[] = [];
    chars.forEach((char, i) => {
      if (char.trim() === "") {
        if (current.length) out.push(current);
        current = [];
        return;
      }
      current.push(i);
    });
    if (current.length) out.push(current);
    return out;
  }, [chars]);

  const markX = useMotionValue(0);
  const markY = useMotionValue(0);
  const markW = useMotionValue(0);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const trueNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const noiseNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const centres = React.useRef<({ x: number; y: number } | null)[]>([]);
  const letters = React.useRef<Letter[]>([]);
  const active = React.useRef(new Set<number>());
  const landings = React.useRef(new Map<number, AnimationPlaybackControls[]>());
  const frame = React.useRef(0);
  const later = React.useRef(0);
  const rand = React.useRef(lcg(hash(text) ^ (seed + 1)));
  const last = React.useRef<{ x: number; y: number } | null>(null);
  const focusWord = React.useRef(-1);
  const counted = React.useRef(0);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onScrambleChange);
  const live = React.useRef({ motionSafe, hidden });

  const heat = React.useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < HEAT; i += 1) {
      const hot = Math.round((1 - i / (HEAT - 1)) * 100);
      out.push(
        `color-mix(in oklab, ${color} ${hot}%, color-mix(in oklab, currentColor 55%, transparent))`,
      );
    }
    return out;
  }, [color]);

  const letterOf = (i: number): Letter => {
    let l = letters.current[i];
    if (!l) {
      l = { scrambled: false, until: 0, hold: 0, roll: 0 };
      letters.current[i] = l;
    }
    return l;
  };

  const tell = () => {
    const n = active.current.size;
    if (n === counted.current) return;
    counted.current = n;
    report.current?.(n);
  };

  /** A noise glyph for letter i, matching its case when the set is letters. */
  const pick = (i: number) => {
    const g = set[Math.floor(rand.current() * set.length)] ?? "#";
    const real = chars[i] ?? "";
    if (
      g.length === 1 &&
      /[A-Z]/.test(g) &&
      real.toLowerCase() === real &&
      real.toUpperCase() !== real
    ) {
      return g.toLowerCase();
    }
    return g;
  };

  const show = (i: number, now: number) => {
    const l = letterOf(i);
    const noise = noiseNodes.current.get(i);
    if (!noise) return;
    noise.textContent = pick(i);
    const cool =
      l.until === Infinity
        ? 0
        : clamp01(1 - (l.until - now) / Math.max(1, l.hold));
    noise.style.color = heat[Math.round(cool * (HEAT - 1))] ?? heat[0] ?? "";
    noise.style.transform = live.current.motionSafe
      ? `translateY(${r2((rand.current() - 0.5) * 0.08)}em)`
      : "";
  };

  const stopLanding = (i: number) => {
    const runs = landings.current.get(i);
    if (!runs) return;
    for (const c of runs) c.stop();
    landings.current.delete(i);
  };

  const scramble = (i: number, until: number, hold: number, now: number) => {
    const l = letterOf(i);
    l.until = Math.max(l.until, until);
    l.hold = Math.max(l.hold, hold);
    if (l.scrambled) return;
    l.scrambled = true;
    l.roll = now + rate;
    active.current.add(i);
    const real = trueNodes.current.get(i);
    stopLanding(i);
    if (real) {
      real.style.transition = "";
      real.style.opacity = "0";
      real.style.transform = "";
    }
    const noise = noiseNodes.current.get(i);
    if (noise) {
      noise.style.transition = "";
      noise.style.opacity = "1";
    }
    show(i, now);
  };

  /** The letter comes back: it drops in from a nudge above on snap. */
  const settle = (i: number) => {
    const l = letterOf(i);
    l.scrambled = false;
    l.until = 0;
    l.hold = 0;
    active.current.delete(i);
    const real = trueNodes.current.get(i);
    const noise = noiseNodes.current.get(i);
    if (!real || !noise) return;
    stopLanding(i);
    if (live.current.motionSafe) {
      noise.style.transition = "";
      real.style.transition = "";
      noise.textContent = "";
      noise.style.opacity = "0";
      // The landing's first frame is set now, so no frame shows neither glyph.
      real.style.opacity = "0.3";
      real.style.transform = `translateY(${-distances.nudge}px)`;
      landings.current.set(i, [
        animate(real, { y: [-distances.nudge, 0] }, springs.snap),
        animate(
          real,
          { opacity: [0.3, 1] },
          { duration: durations.fast, ease: easings.enter },
        ),
      ]);
    } else {
      // A cross-fade, and nothing that travels: plain transitions, so no
      // animation is kept for a letter that is simply coming back.
      const fade = `opacity ${durations.base * 1000}ms cubic-bezier(${easings.enter.join(",")})`;
      noise.style.transition = fade;
      real.style.transition = fade;
      noise.style.opacity = "0";
      real.style.opacity = "1";
    }
  };

  const tick = (now: number) => {
    frame.current = 0;
    let next = Infinity;
    for (const i of [...active.current]) {
      const l = letterOf(i);
      if (now >= l.until) {
        settle(i);
        continue;
      }
      next = Math.min(next, l.until);
      if (live.current.motionSafe && now >= l.roll) {
        l.roll = now + rate * (0.75 + rand.current() * 0.5);
        show(i, now);
      }
    }
    tell();
    if (active.current.size === 0 || live.current.hidden) return;
    if (live.current.motionSafe) {
      // The noise re-rolls: every frame while anything is scrambled.
      frame.current = requestAnimationFrame((t) => api.current?.tick(t));
    } else if (next < Infinity) {
      // Still noise changes nothing until a letter is due back: sleep till then.
      window.clearTimeout(later.current);
      later.current = window.setTimeout(
        () => api.current?.kick(),
        Math.max(0, Math.ceil(next - now)),
      );
    }
  };

  const kick = () => {
    if (frame.current || live.current.hidden) return;
    window.clearTimeout(later.current);
    frame.current = requestAnimationFrame((t) => api.current?.tick(t));
  };

  /** One dab of the brush, at a point in the text's own coordinates. */
  const dab = (x: number, y: number, now: number) => {
    const r = Math.max(4, radius);
    centres.current.forEach((c, i) => {
      if (!c) return;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d > r) return;
      const core = 1 - d / r;
      const hold = restore * (1 + clamp01(falloff) * core);
      scramble(i, now + hold, hold, now);
    });
  };

  /** The brush from where it last was to here, so a fast stroke leaves no gaps. */
  const brushAt = (x: number, y: number) => {
    const now = clockNow();
    const from = last.current;
    const r = Math.max(4, radius);
    if (from) {
      const d = Math.hypot(x - from.x, y - from.y);
      const steps = Math.min(24, Math.floor(d / (r / 2)));
      for (let s = 1; s <= steps; s += 1) {
        dab(
          from.x + ((x - from.x) * s) / (steps + 1),
          from.y + ((y - from.y) * s) / (steps + 1),
          now,
        );
      }
    }
    dab(x, y, now);
    last.current = { x, y };
    tell();
    kick();
  };

  const measure = () => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    centres.current = chars.map((_, i) => {
      const node = trueNodes.current.get(i);
      if (!node) return null;
      const b = node.getBoundingClientRect();
      return {
        x: b.left - rect.left - root.clientLeft + b.width / 2,
        y: b.top - rect.top - root.clientTop + b.height / 2,
      };
    });
    placeMark();
  };

  /** The keyboard's mark under the focused word. */
  const placeMark = () => {
    const word = words[focusWord.current];
    const root = rootRef.current;
    if (!word || !root) return;
    const first = trueNodes.current.get(word[0] ?? -1);
    const lastNode = trueNodes.current.get(word[word.length - 1] ?? -1);
    if (!first || !lastNode) return;
    const rect = root.getBoundingClientRect();
    const a = first.getBoundingClientRect();
    const b = lastNode.getBoundingClientRect();
    markX.set(r2(a.left - rect.left - root.clientLeft));
    markY.set(r2(a.bottom - rect.top - root.clientTop));
    markW.set(r2(Math.max(4, b.right - a.left)));
  };

  /** The keyboard holds one word scrambled; the word it leaves ripples back. */
  const hold = (w: number) => {
    const now = clockNow();
    const prev = words[focusWord.current];
    if (prev && focusWord.current !== w) {
      prev.forEach((i, k) => {
        const l = letterOf(i);
        if (l.scrambled) l.until = now + restore + k * RIPPLE;
        l.hold = restore + k * RIPPLE;
      });
    }
    focusWord.current = w;
    const word = words[w];
    if (word) for (const i of word) scramble(i, Infinity, restore, now);
    placeMark();
    tell();
    kick();
  };

  const release = () => {
    hold(-1);
  };

  React.useLayoutEffect(() => {
    api.current = { brushAt, tick, kick, measure, hold, release };
    report.current = onScrambleChange;
    live.current = { motionSafe, hidden };
  });

  // A hidden tab stops the frames; coming back resumes them.
  React.useEffect(() => {
    if (!hidden && active.current.size > 0) api.current?.kick();
  }, [hidden]);

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [chars]);

  // New text or a new glyph set starts clean; disabling lets everything settle.
  React.useEffect(() => {
    rand.current = lcg(hash(text) ^ (seed + 1));
  }, [text, seed]);

  React.useEffect(() => {
    if (!disabled) return;
    const now = clockNow();
    for (const i of active.current) letterOf(i).until = now;
    api.current?.release();
  }, [disabled]);

  React.useEffect(() => {
    const f = frame;
    const sleep = later;
    const runs = landings;
    return () => {
      if (f.current) cancelAnimationFrame(f.current);
      f.current = 0;
      window.clearTimeout(sleep.current);
      for (const list of runs.current.values()) for (const c of list) c.stop();
      runs.current.clear();
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => sizer.disconnect();
  }, []);

  const bindTrue = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) trueNodes.current.set(i, node);
    else trueNodes.current.delete(i);
  };
  const bindNoise = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) noiseNodes.current.set(i, node);
    else noiseNodes.current.delete(i);
  };

  const local = (event: React.PointerEvent) => {
    const root = rootRef.current;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - root.clientLeft,
      y: event.clientY - rect.top - root.clientTop,
    };
  };

  const focusable = keyboard && !disabled;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!focusable || !words.length) return;
    const at = focusWord.current;
    let to: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        to = Math.min(words.length - 1, at + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        to = Math.max(0, at - 1);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = words.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    hold(to);
  };

  const Tag = as;

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={focusable ? 0 : undefined}
        aria-describedby={focusable ? hintId : undefined}
        onPointerMove={(event: React.PointerEvent) => {
          if (disabled) return;
          const p = local(event);
          if (p) brushAt(p.x, p.y);
        }}
        onPointerDown={(event: React.PointerEvent) => {
          if (disabled) return;
          last.current = null;
          const p = local(event);
          if (p) brushAt(p.x, p.y);
        }}
        onPointerLeave={() => {
          last.current = null;
        }}
        onFocus={(event: React.FocusEvent<HTMLElement>) => {
          if (!focusable || event.target !== event.currentTarget) return;
          if (!event.currentTarget.matches(":focus-visible")) return;
          hold(Math.max(0, focusWord.current));
        }}
        onBlur={() => release()}
        onKeyDown={onKeyDown}
        className={cn(
          "group/scramble-brush relative touch-pan-y",
          focusable &&
            "rounded-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          className,
        )}
      >
        <span className="sr-only select-none">{text}</span>
        <span aria-hidden>
          {words.map((word, w) => (
            <React.Fragment key={w}>
              {w > 0 ? " " : null}
              <span className="inline-block whitespace-nowrap">
                {word.map((i) => {
                  return (
                    <span key={i} className="relative inline-block">
                      <span ref={bindTrue(i)} className="inline-block">
                        {chars[i]}
                      </span>
                      <span
                        ref={bindNoise(i)}
                        className="pointer-events-none absolute inset-0 flex justify-center whitespace-pre select-none"
                      />
                    </span>
                  );
                })}
              </span>
            </React.Fragment>
          ))}
        </span>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 h-[max(1.5px,0.06em)] rounded-full opacity-0 group-focus-visible/scramble-brush:opacity-100"
          style={{ x: markX, y: markY, width: markW, backgroundColor: color }}
        />
      </Tag>
      {focusable ? (
        <span id={hintId} className="sr-only select-none">
          Use the arrow keys to scramble the text word by word.
        </span>
      ) : null}
    </>
  );
}
