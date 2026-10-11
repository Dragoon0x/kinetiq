"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BoardTilesTone = "maple" | "walnut" | "ash" | "cherry";

export type BoardTilesProps = {
  /** The sentence the path spells, letter by letter; a space leaves an empty cell. @default "Every path spells something" */
  sentence?: string;
  /** Each tile's side, px. @default 30 */
  tileSize?: number;
  /** How much a tile bounces as it lands, 0 (sets down dead) to 1 (lively). @default 0.5 */
  bounce?: number;
  /** Snap tiles to a grid of cells; off, they are laid along the path itself, turned with it. @default true */
  grid?: boolean;
  /** The space between cells, px. @default 4 */
  gap?: number;
  /** How long a tile shows its letter before it flips face down, ms. @default 2600 */
  life?: number;
  /** The most tiles on the board; past it the oldest flips early. @default 48 */
  maxTiles?: number;
  /** The wood. @default "maple" */
  tone?: BoardTilesTone;
  /** Show the letters in capitals. @default true */
  uppercase?: boolean;
  /** The word laid out at rest, before anyone moves; "" leaves the board empty. @default the sentence's first word */
  restText?: string;
  /** The pointer and touch lay tiles. @default true */
  interactive?: boolean;
  /** Any change flips every tile on the board face down and clears it. */
  clearKey?: string | number;
  /** The board's accessible name. @default "Letter board" */
  label?: string;
  /** Play a wooden clack as each tile lands. Off unless asked for. @default false */
  sound?: boolean;
  /** A tile was laid, with its letter and how many so far. */
  onTile?: (letter: string, count: number) => void;
  /** The whole sentence was spelled, with how many times so far. */
  onSentence?: (times: number) => void;
  /** Nothing is laid and the keyboard's way in is off. @default false */
  disabled?: boolean;
  /** Sizes the board. @default "h-56 w-full" */
  className?: string;
};

/** Wood is pigment: fixed lightness from the theme's hues, the same on any page. */
const WOODS: Record<
  BoardTilesTone,
  { face: string; ink: string; lip: string }
> = {
  maple: {
    face: "oklch(from var(--warn) 0.83 0.07 h)",
    ink: "oklch(from var(--warn) 0.33 0.05 h)",
    lip: "oklch(from var(--warn) 0.95 0.03 h)",
  },
  walnut: {
    face: "oklch(from var(--warn) 0.5 0.06 calc(h - 28))",
    ink: "oklch(from var(--warn) 0.93 0.03 h)",
    lip: "oklch(from var(--warn) 0.28 0.04 calc(h - 28))",
  },
  ash: {
    face: "oklch(from var(--warn) 0.9 0.03 h)",
    ink: "oklch(from var(--warn) 0.36 0.03 h)",
    lip: "oklch(from var(--warn) 0.98 0.01 h)",
  },
  cherry: {
    face: "oklch(from var(--danger) 0.58 0.1 calc(h + 18))",
    ink: "oklch(from var(--warn) 0.94 0.03 h)",
    lip: "oklch(from var(--danger) 0.34 0.07 calc(h + 18))",
  },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(seed: number, i: number): number {
  let h = Math.imul(seed | 0, 374761393) ^ Math.imul(i + 1, 668265263);
  h = Math.imul(h, 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Splits text into graphemes, so an accented letter or a symbol is one tile. */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/** A spring for a landing: the recoil stiffness, its damping set by `bounce`. */
const landing = (bounce: number) => {
  const b = clamp(bounce, 0, 1);
  const ratio =
    b <= 0.5
      ? 0.99 - (0.99 - 0.53) * (b / 0.5)
      : 0.53 - 0.25 * ((b - 0.5) / 0.5);
  const k = springs.recoil.stiffness;
  return {
    type: "spring" as const,
    stiffness: k,
    damping: 2 * ratio * Math.sqrt(k),
    mass: 1,
  };
};

type TileData = {
  id: number;
  letter: string;
  x: number;
  y: number;
  rot: number;
  cell: string;
  grain: number;
  born: number;
};

type TileProps = {
  letter: string;
  size: number | null;
  rot: number;
  grain: number;
  tone: BoardTilesTone;
  bounce: number;
  life: number | null;
  away: boolean;
  settled: boolean;
  delay: number;
  motionSafe: boolean;
  onLand?: () => void;
  onGone?: () => void;
};

/**
 * One wooden tile: it drops in and lands, shows its letter for `life`, then
 * flips face down and fades. Its own motion values carry every frame; the
 * parent only ever adds or removes it.
 */
function Tile({
  letter,
  size,
  rot,
  grain,
  tone,
  bounce,
  life,
  away,
  settled,
  delay,
  motionSafe,
  onLand,
  onGone,
}: TileProps) {
  const lift = useMotionValue(settled || !motionSafe ? 0 : -14);
  const scale = useMotionValue(settled || !motionSafe ? 1 : 1.25);
  const opacity = useMotionValue(settled ? 1 : 0);
  const turn = useMotionValue(0);
  const shadowScale = useTransform(lift, (v) => r2(1 + Math.abs(v) * 0.04));
  const shadowOpacity = useTransform(lift, (v) =>
    r2(clamp(0.42 - Math.abs(v) * 0.018, 0.12, 0.42)),
  );
  const shadowY = useTransform(lift, (v) => r2(2 - v * 0.35));
  const latest = React.useRef({ onLand, onGone });
  React.useEffect(() => {
    latest.current = { onLand, onGone };
  });
  const flipped = React.useRef(false);

  // The landing. Idempotent: a rehearsal that stops it half way is finished
  // by the real run, from wherever it was left.
  React.useEffect(() => {
    if (settled) return;
    const runs: AnimationPlaybackControls[] = [];
    let landed = false;
    const start = () => {
      if (!motionSafe) {
        runs.push(
          animate(opacity, 1, {
            duration: durations.fast,
            ease: easings.enter,
          }),
        );
        latest.current.onLand?.();
        return;
      }
      runs.push(
        animate(opacity, 1, { duration: durations.blink, ease: easings.enter }),
      );
      runs.push(animate(scale, 1, landing(bounce)));
      runs.push(
        animate(lift, 0, {
          ...landing(bounce),
          onUpdate: (v) => {
            if (!landed && v > -0.6) {
              landed = true;
              latest.current.onLand?.();
            }
          },
        }),
      );
    };
    const timer = delay > 0 ? window.setTimeout(start, delay) : 0;
    if (delay <= 0) start();
    return () => {
      window.clearTimeout(timer);
      for (const r of runs) r.stop();
    };
  }, [settled, motionSafe, bounce, delay, lift, scale, opacity]);

  // Face down, then gone: after `life`, or at once when sent away.
  React.useEffect(() => {
    if (!away && life === null) return;
    const runs: AnimationPlaybackControls[] = [];
    const leave = () => {
      flipped.current = true;
      if (motionSafe) {
        runs.push(animate(turn, 180, springs.snap));
        runs.push(
          animate(opacity, 0, {
            duration: durations.slow,
            ease: easings.exit,
            delay: 0.32,
            onComplete: () => latest.current.onGone?.(),
          }),
        );
      } else {
        runs.push(
          animate(opacity, 0, {
            duration: durations.base,
            ease: easings.exit,
            onComplete: () => latest.current.onGone?.(),
          }),
        );
      }
    };
    const timer = away ? 0 : window.setTimeout(leave, life ?? 0);
    if (away) leave();
    return () => {
      window.clearTimeout(timer);
      for (const r of runs) r.stop();
    };
  }, [away, life, motionSafe, turn, opacity]);

  const wood = WOODS[tone];
  const angle = Math.round(grain * 40 - 20);
  const grainBg = `repeating-linear-gradient(${90 + angle}deg, color-mix(in oklab, ${wood.face} 90%, black) 0 1px, transparent 1px 4px, color-mix(in oklab, ${wood.face} 94%, black) 4px 5px, transparent 5px 9px)`;
  const faceBg = `linear-gradient(155deg, color-mix(in oklab, ${wood.face} 82%, white) 0%, ${wood.face} 45%, color-mix(in oklab, ${wood.face} 88%, black) 100%)`;
  const box: React.CSSProperties =
    size === null ? {} : { width: size, height: size };

  return (
    <motion.div
      className={cn(
        "[container-type:inline-size] relative shrink-0",
        size === null
          ? "aspect-square w-[min(var(--tile),100%)] flex-[0_1_var(--tile)]"
          : null,
      )}
      style={{ ...box, rotate: rot, opacity, perspective: 220 }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-[6%] rounded-[24%] bg-black blur-[2px]"
        style={{ y: shadowY, scale: shadowScale, opacity: shadowOpacity }}
      />
      <motion.div
        className="absolute inset-0 [transform-style:preserve-3d]"
        style={{ y: lift, scale, rotateY: turn }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center rounded-[22%] [backface-visibility:hidden]"
          style={{
            backgroundImage: `${grainBg}, ${faceBg}`,
            boxShadow: `inset 0 1px 0 color-mix(in oklab, ${wood.face} 60%, white), inset 0 -2px 0 color-mix(in oklab, ${wood.face} 72%, black)`,
          }}
        >
          <span
            className="leading-none font-semibold"
            style={{
              fontSize: "56cqw",
              color: wood.ink,
              textShadow: `0 1px 0 ${wood.lip}`,
            }}
          >
            {letter}
          </span>
        </div>
        <div
          className="absolute inset-0 flex [transform:rotateY(180deg)] items-center justify-center rounded-[22%] [backface-visibility:hidden]"
          style={{
            backgroundImage: `${grainBg}, ${faceBg}`,
            boxShadow: `inset 0 1px 0 color-mix(in oklab, ${wood.face} 60%, white), inset 0 -2px 0 color-mix(in oklab, ${wood.face} 72%, black)`,
          }}
        >
          <span
            className="size-[14%] rounded-full opacity-60"
            style={{ backgroundColor: wood.ink }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

type Geometry = {
  w: number;
  h: number;
  cols: number;
  rows: number;
  ox: number;
  oy: number;
  pitch: number;
};

/**
 * A board where the cursor's path spells a sentence in wooden letter tiles:
 * as it travels, a tile drops into each cell it leaves (or, with `grid` off,
 * one tile-pitch along the path itself, turned a little with it), falling
 * from a little above at a little larger, its shadow tightening as it lands
 * on a spring whose bounce is `bounce` — from a dead set-down through the
 * recoil spring's two bounces — with a wooden clack. Spaces leave gaps; the
 * sentence repeats. After `life` a tile flips face down on springs.snap and
 * fades. At rest the board shows a word laid in a row; your first tile flips
 * it away, and it drops back in on a cascade once your tiles are gone. On
 * touch, drag to lay tiles. The keyboard walks a caret across the cells,
 * laying a tile in each cell it leaves; Delete clears the board. Under
 * reduced motion tiles fade in and out in place.
 */
export function BoardTiles({
  sentence = "Every path spells something",
  tileSize = 30,
  bounce = 0.5,
  grid = true,
  gap = 4,
  life = 2600,
  maxTiles = 48,
  tone = "maple",
  uppercase = true,
  restText,
  interactive = true,
  clearKey,
  label = "Letter board",
  sound = false,
  onTile,
  onSentence,
  disabled = false,
  className,
}: BoardTilesProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [geo, setGeo] = React.useState<Geometry | null>(null);
  const [tiles, setTiles] = React.useState<TileData[]>([]);
  const [clearing, setClearing] = React.useState<number[]>([]);
  // The resting word: shown (and how it arrived), or sent away.
  const [rest, setRest] = React.useState({ on: true, round: 0, away: false });
  const [caret, setCaret] = React.useState<{ i: number; k: number } | null>(
    null,
  );
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const walk = React.useRef({
    cell: null as string | null,
    ci: -1,
    ck: -1,
    px: Number.NaN,
    py: Number.NaN,
    index: 0,
    gaps: 0,
    laid: 0,
    times: 0,
    serial: 0,
    inside: false,
  });
  const occupied = React.useRef(new Map<string, number>());
  const restTimer = React.useRef(0);

  const live = interactive && !disabled;
  const letters = React.useMemo(
    () => graphemes(uppercase ? sentence.toUpperCase() : sentence),
    [sentence, uppercase],
  );
  const restWord = (restText ?? sentence.trim().split(/\s+/)[0] ?? "").trim();
  const restLetters = graphemes(uppercase ? restWord.toUpperCase() : restWord);

  // Geometry: cells centred in the board, measured when the node arrives.
  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const measure = () => {
        const w = node.clientWidth;
        const h = node.clientHeight;
        const size = clamp(tileSize, 12, 80);
        const g = clamp(gap, 0, 24);
        const p = size + g;
        const pad = 8;
        const cols = Math.max(1, Math.floor((w - 2 * pad + g) / p));
        const rows = Math.max(1, Math.floor((h - 2 * pad + g) / p));
        setGeo({
          w,
          h,
          cols,
          rows,
          ox: (w - (cols * p - g)) / 2,
          oy: (h - (rows * p - g)) / 2,
          pitch: p,
        });
      };
      measure();
      const sizer = new ResizeObserver(measure);
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [tileSize, gap],
  );

  React.useEffect(() => () => window.clearTimeout(restTimer.current), []);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const clack = (x: number, letter: string) => {
    if (!sound) return;
    const nav = navigator as Navigator & {
      userActivation?: { hasBeenActive: boolean };
    };
    // Sound answers the visitor: never before the page has had a press or a key.
    if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
    const code = letter.codePointAt(0) ?? 65;
    const root = rootRef.current;
    const pan = root ? panFrom(root.getBoundingClientRect().left + x, root) : 0;
    audio.play("clack", { pitch: 0.82 + (code % 9) * 0.045, gain: 0.45, pan });
  };

  /** The next letter of the sentence, or null for a gap (a space, or the pause before it repeats). */
  const nextLetter = (): string | null => {
    const w = walk.current;
    if (letters.length === 0) return null;
    if (w.gaps > 0) {
      w.gaps -= 1;
      return null;
    }
    const ch = letters[w.index % letters.length] ?? "";
    w.index += 1;
    if (w.index % letters.length === 0) {
      w.gaps = 2;
      w.times += 1;
      onSentence?.(w.times);
      say(
        `Sentence spelled${w.times > 1 ? `, ${w.times} times` : ""}: ${sentence}`,
      );
    }
    return ch.trim() === "" ? null : ch;
  };

  const lay = (x: number, y: number, rot: number, cell: string) => {
    if (occupied.current.has(cell)) return;
    const letter = nextLetter();
    if (letter === null) return;
    const w = walk.current;
    w.serial += 1;
    w.laid += 1;
    const id = w.serial;
    occupied.current.set(cell, id);
    setTiles((prev) => [
      ...prev,
      {
        id,
        letter,
        x,
        y,
        rot,
        cell,
        grain: hash(id, 3),
        born: performance.now(),
      },
    ]);
    if (rest.on && !rest.away) setRest((r) => ({ ...r, away: true }));
    window.clearTimeout(restTimer.current);
    onTile?.(letter, w.laid);
  };

  const cellCentre = (i: number, k: number, g: Geometry) => ({
    x: g.ox + i * g.pitch + (g.pitch - clamp(gap, 0, 24)) / 2,
    y: g.oy + k * g.pitch + (g.pitch - clamp(gap, 0, 24)) / 2,
  });

  /** The pointer is here: lay tiles behind it. */
  const travel = (x: number, y: number) => {
    const g = geo;
    if (!g || !live) return;
    const w = walk.current;
    if (grid) {
      const i = clamp(
        Math.floor((x - g.ox + clamp(gap, 0, 24) / 2) / g.pitch),
        0,
        g.cols - 1,
      );
      const k = clamp(
        Math.floor((y - g.oy + clamp(gap, 0, 24) / 2) / g.pitch),
        0,
        g.rows - 1,
      );
      if (w.ci < 0) {
        w.ci = i;
        w.ck = k;
        return;
      }
      if (i === w.ci && k === w.ck) return;
      // Every cell between the last and this one gets its tile, in order, so
      // a fast stroke still spells without holes.
      let ci = w.ci;
      let ck = w.ck;
      let guard = 0;
      while ((ci !== i || ck !== k) && guard < 12) {
        const c = cellCentre(ci, ck, g);
        lay(c.x, c.y, 0, `${ci}:${ck}`);
        const di = i - ci;
        const dk = k - ck;
        if (Math.abs(di) >= Math.abs(dk)) ci += Math.sign(di);
        else ck += Math.sign(dk);
        guard += 1;
      }
      w.ci = i;
      w.ck = k;
      return;
    }
    // Off the grid: one tile every pitch along the path, turned with it.
    if (Number.isNaN(w.px)) {
      w.px = x;
      w.py = y;
      return;
    }
    let guard = 0;
    let dx = x - w.px;
    let dy = y - w.py;
    let d = Math.hypot(dx, dy);
    const half = clamp(tileSize, 12, 80) / 2 + 2;
    while (d >= g.pitch && guard < 12) {
      const ux = dx / d;
      const uy = dy / d;
      const deg = (Math.atan2(uy, ux) * 180) / Math.PI;
      const folded = deg > 90 ? deg - 180 : deg < -90 ? deg + 180 : deg;
      const id = walk.current.serial + 1;
      const rot = clamp(folded * 0.35, -22, 22) + (hash(id, 9) - 0.5) * 8;
      const px = clamp(w.px, half, g.w - half);
      const py = clamp(w.py, half, g.h - half);
      lay(
        px,
        py,
        r2(rot),
        `${Math.round(px / (g.pitch * 0.8))}:${Math.round(py / (g.pitch * 0.8))}`,
      );
      w.px += ux * g.pitch;
      w.py += uy * g.pitch;
      dx = x - w.px;
      dy = y - w.py;
      d = Math.hypot(dx, dy);
      guard += 1;
    }
  };

  const reset = () => {
    const w = walk.current;
    w.ci = -1;
    w.ck = -1;
    w.px = Number.NaN;
    w.py = Number.NaN;
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  // Touch and pen lay tiles by dragging; the mouse lays them by moving.
  const drag = useDrag({
    threshold: 2,
    disabled: !live,
    onStart: (info) => {
      if (info.event.pointerType === "mouse") return;
      reset();
      const at = local(
        info.point.x - info.offset.x,
        info.point.y - info.offset.y,
      );
      travel(at.x, at.y);
    },
    onMove: (info) => {
      if (info.event.pointerType === "mouse") return;
      const at = local(info.point.x, info.point.y);
      travel(at.x, at.y);
    },
    onEnd: () => reset(),
    onCancel: () => reset(),
  });

  // The tiles as last rendered, for timers and handlers that run later.
  const tilesRef = React.useRef(tiles);
  React.useLayoutEffect(() => {
    tilesRef.current = tiles;
  });

  const scheduleRest = () => {
    window.clearTimeout(restTimer.current);
    if (!restWord) return;
    restTimer.current = window.setTimeout(() => {
      if (walk.current.inside || tilesRef.current.length > 0) return;
      setRest((r) =>
        r.on && !r.away ? r : { on: true, round: r.round + 1, away: false },
      );
    }, 900);
  };

  const gone = (id: number, cell: string) => {
    if (occupied.current.get(cell) === id) occupied.current.delete(cell);
    const remaining = tilesRef.current.filter((t) => t.id !== id);
    tilesRef.current = remaining;
    setTiles((prev) => prev.filter((t) => t.id !== id));
    setClearing((prev) => prev.filter((c) => c !== id));
    if (remaining.length === 0) scheduleRest();
  };

  const clearAll = () => {
    setClearing(tilesRef.current.map((t) => t.id));
    if (rest.on && !rest.away) setRest((r) => ({ ...r, away: true }));
    say("Board cleared.");
  };

  // A changed clearKey clears — not the first value, nor StrictMode's rehearsal.
  const lastClear = React.useRef(clearKey);
  const clearRef = React.useRef(clearAll);
  React.useLayoutEffect(() => {
    clearRef.current = clearAll;
  });
  React.useEffect(() => {
    if (lastClear.current === clearKey) return;
    lastClear.current = clearKey;
    clearRef.current();
  }, [clearKey]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live || !geo) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      clearAll();
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    const here = caret ?? { i: 0, k: Math.floor(geo.rows / 2) };
    if (event.key === "Enter" || event.key === " ") {
      // Lay the next letter where the caret stands, and step on.
      event.preventDefault();
      const c = cellCentre(here.i, here.k, geo);
      lay(c.x, c.y, 0, `${here.i}:${here.k}`);
      setCaret({ i: Math.min(geo.cols - 1, here.i + 1), k: here.k });
      return;
    }
    if (!move) return;
    event.preventDefault();
    const next = {
      i: clamp(here.i + move[0], 0, geo.cols - 1),
      k: clamp(here.k + move[1], 0, geo.rows - 1),
    };
    if (next.i === here.i && next.k === here.k) return;
    // The cell you leave gets the tile, as it does behind a pointer.
    const c = cellCentre(here.i, here.k, geo);
    lay(c.x, c.y, 0, `${here.i}:${here.k}`);
    setCaret(next);
  };

  const cap = Math.max(1, Math.round(maxTiles));
  const overflow = Math.max(0, tiles.length - cap);
  const size = clamp(tileSize, 12, 80);
  const caretAt = caret && geo ? cellCentre(caret.i, caret.k, geo) : null;
  const onGrid = !!geo && grid && restLetters.length <= geo.cols;
  const restI = geo ? Math.floor((geo.cols - restLetters.length) / 2) : 0;
  const restK = geo ? Math.floor((geo.rows - 1) / 2) : 0;

  return (
    <div
      ref={bindRoot}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (event.pointerType !== "mouse") return;
        walk.current.inside = true;
        const at = local(event.clientX, event.clientY);
        travel(at.x, at.y);
      }}
      onPointerLeave={() => {
        walk.current.inside = false;
        reset();
        if (tiles.length === 0) scheduleRest();
      }}
      className={cn(
        "group/board-tiles relative isolate h-56 w-full overflow-clip bg-surface-1 select-none",
        live ? "touch-none" : "touch-auto",
        className,
      )}
      style={{ "--tile": `${size}px` } as React.CSSProperties}
    >
      {geo && grid ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--hairline) 1px, transparent 1px), linear-gradient(to bottom, var(--hairline) 1px, transparent 1px)",
            backgroundSize: `${geo.pitch}px ${geo.pitch}px`,
            backgroundPosition: `${r2(geo.ox - clamp(gap, 0, 24) / 2)}px ${r2(geo.oy - clamp(gap, 0, 24) / 2)}px`,
          }}
        />
      ) : null}
      <button
        type="button"
        aria-label={label}
        aria-describedby={live ? hintId : undefined}
        disabled={!live}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (!event.currentTarget.matches(":focus-visible") || !geo) return;
          setCaret((c) => c ?? { i: 0, k: Math.floor(geo.rows / 2) });
        }}
        onBlur={() => setCaret(null)}
        className={cn(
          "absolute inset-0 size-full cursor-default rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      {rest.on && restLetters.length > 0 ? (
        <div
          key={`${onGrid ? "g" : "r"}${rest.round}`}
          aria-hidden
          className={cn(
            "pointer-events-none absolute",
            onGrid
              ? "inset-0"
              : "inset-x-4 inset-y-0 flex items-center justify-center",
          )}
          style={onGrid ? undefined : { gap: clamp(gap, 0, 24) }}
        >
          {restLetters.map((letter, i) => {
            // On the grid, once it is measured, the word sits in its cells;
            // before that (and off the grid) it is a centred row.
            const c = onGrid && geo ? cellCentre(restI + i, restK, geo) : null;
            return (
              <div
                key={i}
                className={c ? "absolute" : "contents"}
                style={
                  c
                    ? { left: r2(c.x - size / 2), top: r2(c.y - size / 2) }
                    : undefined
                }
              >
                <Tile
                  letter={letter}
                  size={c ? size : null}
                  rot={0}
                  grain={hash(i + 1, 3)}
                  tone={tone}
                  bounce={bounce}
                  life={null}
                  away={rest.away}
                  settled={rest.round === 0}
                  delay={Math.round(i * cascade(restLetters.length) * 1000)}
                  motionSafe={motionSafe}
                  onLand={() => clack(0, letter)}
                  onGone={
                    i === restLetters.length - 1
                      ? () => setRest((r) => ({ ...r, on: false }))
                      : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      ) : null}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {tiles.map((t, n) => (
          <div
            key={t.id}
            className="absolute"
            style={{ left: r2(t.x - size / 2), top: r2(t.y - size / 2) }}
          >
            <Tile
              letter={t.letter}
              size={size}
              rot={t.rot}
              grain={t.grain}
              tone={tone}
              bounce={bounce}
              life={Math.max(300, life)}
              away={n < overflow || clearing.includes(t.id)}
              settled={false}
              delay={0}
              motionSafe={motionSafe}
              onLand={() => clack(t.x, t.letter)}
              onGone={() => gone(t.id, t.cell)}
            />
          </div>
        ))}
      </div>
      {caretAt ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[22%] border border-dashed border-cobalt-bright"
          style={{
            left: r2(caretAt.x - size / 2 - 2),
            top: r2(caretAt.y - size / 2 - 2),
            width: size + 4,
            height: size + 4,
          }}
        />
      ) : null}
      <span className="sr-only">{sentence}</span>
      {live ? (
        <p id={hintId} className="sr-only">
          Arrow keys walk across the board and lay the next tile in the cell you
          leave; Enter lays one where you stand; Delete clears the board.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
