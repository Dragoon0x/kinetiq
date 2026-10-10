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
import { durations, easings } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DepotBoardRing = "letters" | "digits" | "full";
export type DepotBoardTrigger = "mount" | "inView" | "hover" | "manual";
export type DepotBoardAlign = "start" | "center";
export type DepotBoardElement = "div" | "section" | "aside" | "figure";

export type DepotBoardProps = {
  /** The messages the board cycles through. "\n" forces a new row; longer rows wrap between words. */
  messages: string[];
  /** Controlled: the message showing, an index into `messages`. */
  index?: number;
  /** The first message when uncontrolled. @default 0 */
  defaultIndex?: number;
  /** Fires from whatever changed the message — the timer, a press or a key — with the new index. */
  onIndexChange?: (index: number) => void;
  /** How long a settled message stays before the next, ms. 0 changes only by hand. @default 3600 */
  interval?: number;
  /** Flip speed, 0.5 to 2: how fast each flap falls and how fast the motor feeds the next. @default 1 */
  speed?: number;
  /** Columns on the board. The type scales so they always fit. @default 14 */
  cells?: number;
  /** Rows on the board. @default as many as the longest message needs */
  rows?: number;
  /** Delay from one column to the next, ms, so the board settles in a wave. @default 28 */
  ripple?: number;
  /** The characters each cell's flaps carry, in order. Letters, digits, or both with punctuation. @default "full" */
  ring?: DepotBoardRing;
  /** The tallest a cell may be, px. Narrow boards scale cells down to fit. @default 40 */
  size?: number;
  /** Where a row's words sit. @default "start" */
  align?: DepotBoardAlign;
  /** The letters. @default "var(--foreground)" */
  color?: string;
  /** The flaps. @default a little ink mixed into the card colour */
  flapColor?: string;
  /** Hold the current message: the timer stops, a press still changes it. @default false */
  paused?: boolean;
  /** The board is a button: a press or Enter shows the next message, Left and Right step through them. @default true */
  interactive?: boolean;
  /** When the first message clatters in from blank: on mount, when scrolled into view, on hover or keyboard focus, or — "manual" — when you control `index` or on the first press. @default "inView" */
  trigger?: DepotBoardTrigger;
  /** Cycle through the messages once and rest on the last. @default false */
  once?: boolean;
  /** Wait before the first clatter, ms. @default 150 */
  delay?: number;
  /** Clack each flap the visitor sets falling. Off unless asked for. @default false */
  sound?: boolean;
  /** A line set into the housing above the cells — a title, a clock. It takes the board's width and never widens it. */
  caption?: React.ReactNode;
  /** The board's accessible name. @default "Departures" */
  label?: string;
  /** The element rendered around the board. @default "div" */
  as?: DepotBoardElement;
  /** Fires each time the board settles on a message, with its index. */
  onComplete?: (index: number) => void;
  className?: string;
};

const RINGS: Record<DepotBoardRing, string> = {
  letters: " ABCDEFGHIJKLMNOPQRSTUVWXYZ.-",
  digits: " 0123456789:.-",
  full: " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-/&'",
};

/** Angular acceleration of a falling flap at speed 1, rad/s². */
const GRAVITY = 2400;
/** The motor's push as a flap is released, rad/s. */
const KICK = 4;
/** How much of its speed a flap keeps as it bounces off the stop. */
const RESTITUTION = 0.2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const RAD = Math.PI / 180;

/** Lays a message out on the board: forced rows, then words wrapped to the width. */
function gridOf(
  message: string,
  cells: number,
  rows: number,
  align: DepotBoardAlign,
  ring: string,
): string[] {
  const lines: string[] = [];
  for (const forced of message.toUpperCase().split("\n")) {
    let line = "";
    for (const raw of forced.split(/\s+/).filter(Boolean)) {
      let word = Array.from(raw)
        .map((ch) => (ring.includes(ch) ? ch : " "))
        .join("");
      while (word.length > cells) {
        if (line) lines.push(line);
        lines.push(word.slice(0, cells));
        line = "";
        word = word.slice(cells);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= cells) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  const out: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    const line = lines[r] ?? "";
    const pad = align === "center" ? Math.floor((cells - line.length) / 2) : 0;
    const row = `${" ".repeat(Math.max(0, pad))}${line}`.padEnd(cells, " ");
    out.push(...Array.from(row.slice(0, cells)));
  }
  return out;
}

function rowsNeeded(messages: string[], cells: number, ring: string): number {
  let most = 1;
  for (const m of messages) {
    const g = gridOf(m, cells, 12, "start", ring);
    let used = 0;
    for (let r = 0; r < 12; r += 1) {
      if (g.slice(r * cells, (r + 1) * cells).some((c) => c !== " ")) {
        used = r + 1;
      }
    }
    most = Math.max(most, used);
  }
  return Math.min(6, most);
}

type CellValues = {
  top: MotionValue<string>;
  bottom: MotionValue<string>;
  front: MotionValue<string>;
  back: MotionValue<string>;
  /** The falling flap's angle: 0 upright, 180 down on the stop. */
  theta: MotionValue<number>;
  /** Reduced motion's crossfade. */
  ink: MotionValue<number>;
};

type CellState = {
  cur: number;
  target: number;
  next: number;
  theta: number;
  omega: number;
  phase: "idle" | "wait" | "fall" | "bounce";
  waitUntil: number;
  audible: boolean;
};

const cellValues = (): CellValues => ({
  top: motionValue(" "),
  bottom: motionValue(" "),
  front: motionValue(" "),
  back: motionValue(" "),
  theta: motionValue(0),
  ink: motionValue(1),
});

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

const HALF = "absolute inset-x-0 h-1/2 overflow-hidden";
const GLYPH =
  "absolute inset-x-0 flex h-[200%] items-center justify-center leading-none";

function Cell({ v }: { v: CellValues }) {
  // Drawn in 2D so the type stays crisp: the flap is scaled about the hinge
  // by |cos θ|, swings a little wider as it comes toward you, and is shaded.
  const frontScale = useTransform(v.theta, (t) =>
    t < 90 ? r3(Math.cos(t * RAD)) : 0,
  );
  const backScale = useTransform(v.theta, (t) =>
    t > 90 ? r3(-Math.cos(t * RAD)) : 0,
  );
  const widen = useTransform(v.theta, (t) => r3(1 + 0.04 * Math.sin(t * RAD)));
  const frontShade = useTransform(v.theta, (t) =>
    t < 90 ? r3(0.22 * Math.sin(t * RAD)) : 0,
  );
  const backShade = useTransform(v.theta, (t) =>
    t > 90 ? r3(0.18 * Math.sin(t * RAD)) : 0,
  );
  const cast = useTransform(v.theta, (t) =>
    t > 30 && t < 180 ? r3(0.12 * Math.sin(t * RAD)) : 0,
  );
  return (
    <span className="relative block h-full rounded-[0.14em] bg-(--depot-flap) shadow-[inset_0_-1px_0_color-mix(in_oklab,black_14%,transparent)]">
      <motion.span
        className="absolute inset-0 block"
        style={{ opacity: v.ink }}
      >
        <span className={cn(HALF, "top-0 rounded-t-[0.14em]")}>
          <motion.span className={cn(GLYPH, "top-0")}>{v.top}</motion.span>
        </span>
        <span className={cn(HALF, "bottom-0 rounded-b-[0.14em]")}>
          <motion.span className={cn(GLYPH, "bottom-0")}>
            {v.bottom}
          </motion.span>
          <motion.span
            className="absolute inset-0 bg-[oklch(0_0_0)]"
            style={{ opacity: cast }}
          />
        </span>
        <motion.span
          className={cn(HALF, "top-0 rounded-t-[0.14em] bg-(--depot-flap)")}
          style={{
            scaleY: frontScale,
            scaleX: widen,
            originY: "100%",
          }}
        >
          <motion.span className={cn(GLYPH, "top-0")}>{v.front}</motion.span>
          <motion.span
            className="absolute inset-0 bg-[oklch(0_0_0)]"
            style={{ opacity: frontShade }}
          />
        </motion.span>
        <motion.span
          className={cn(HALF, "bottom-0 rounded-b-[0.14em] bg-(--depot-flap)")}
          style={{ scaleY: backScale, scaleX: widen, originY: "0%" }}
        >
          <motion.span className={cn(GLYPH, "bottom-0")}>{v.back}</motion.span>
          <motion.span
            className="absolute inset-0 bg-[oklch(1_0_0)]"
            style={{ opacity: backShade }}
          />
        </motion.span>
      </motion.span>
      {/* The hinge: a hairline of the housing between the halves. */}
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-(--depot-gap)" />
    </span>
  );
}

type Api = {
  show: (index: number, audible: boolean) => void;
  frame: (now: number) => void;
  wake: () => void;
};

/**
 * A departure board of split-flap cells. Each cell is two halves on a hinge
 * and one falling flap: as it flips, the next character's top half is
 * revealed behind the flap, the flap falls under gravity — slow off the top,
 * fast at the bottom — and past the vertical shows the next character's lower
 * half, lands on the stop and bounces a few degrees before it rests. Cells
 * walk forward through the character ring one flap at a time, as a motor
 * feeds them, so each takes as many flips as its new letter needs, and the
 * columns start a ripple apart: the board settles in a wave, and only the
 * cells whose letter changes move at all.
 *
 * The board is a button: a press, Enter or Space shows the next message,
 * Left and Right step back and forth; flips the visitor causes clack when
 * `sound` is on, and the message is announced once the board has settled.
 * One rAF loop integrates every moving flap and stops when the board is
 * still, off screen or hidden. Under reduced motion each changing cell
 * crossfades once to its character, still a ripple apart.
 */
export function DepotBoard({
  messages,
  index,
  defaultIndex = 0,
  onIndexChange,
  interval = 3600,
  speed = 1,
  cells = 14,
  rows,
  ripple = 28,
  ring = "full",
  size = 40,
  align = "start",
  color = "var(--foreground)",
  flapColor = "color-mix(in oklab, var(--foreground) 6%, var(--card))",
  paused = false,
  interactive = true,
  trigger = "inView",
  once = false,
  delay = 150,
  sound = false,
  caption,
  label = "Departures",
  as = "div",
  onComplete,
  className,
}: DepotBoardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const chars = RINGS[ring] ?? RINGS.full;
  const ringList = React.useMemo(() => Array.from(chars), [chars]);
  const columns = clamp(Math.round(cells), 2, 40);
  const list = messages.length > 0 ? messages : [""];
  const n = list.length;
  const rowCount = clamp(
    Math.round(rows ?? rowsNeeded(list, columns, chars)),
    1,
    6,
  );
  const total = columns * rowCount;
  const rate = clamp(speed, 0.25, 4);

  const [own, setOwn] = React.useState(() => mod(defaultIndex, n));
  const current = mod(Math.round(index ?? own), n);
  const [armed, setArmed] = React.useState(false);
  const [settled, setSettled] = React.useState(true);
  const [beat, setBeat] = React.useState(0);
  const [finished, setFinished] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  // The board's cells live as long as its shape does.
  const board = React.useMemo(
    () => Array.from({ length: total }, cellValues),
    [total],
  );
  const states = React.useRef<CellState[]>([]);
  const loop = React.useRef({ frame: 0, last: 0 });
  const timer = React.useRef<number | null>(null);
  const shown = React.useRef<number | null>(null);
  /** The next change was the visitor's. */
  const heard = React.useRef(false);
  const spoken = React.useRef(false);
  const lastClack = React.useRef(0);
  const fades = React.useRef<AnimationPlaybackControls[]>([]);
  const boardRef = React.useRef<HTMLElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const latest = React.useRef({ onIndexChange, onComplete });
  const pump = React.useCallback((now: number) => {
    loop.current.frame = 0;
    api.current?.frame(now);
  }, []);

  const charAt = (k: number) => ringList[mod(k, ringList.length)] ?? " ";
  const indexOf = (ch: string) => Math.max(0, ringList.indexOf(ch));

  const clack = (col: number, final: boolean) => {
    const now = performance.now();
    if (now - lastClack.current < 34) return;
    lastClack.current = now;
    const box = boardRef.current?.getBoundingClientRect();
    audio.play("clack", {
      pitch: r3(0.86 + (col / Math.max(1, columns - 1)) * 0.3),
      gain: final ? 0.5 : 0.22,
      pan: box
        ? panFrom(box.left + ((col + 0.5) / columns) * box.width, null)
        : 0,
    });
  };

  const startFlip = (i: number) => {
    const s = states.current[i];
    const v = board[i];
    if (!s || !v) return;
    s.next = mod(s.cur + 1, ringList.length);
    v.top.set(charAt(s.next));
    v.front.set(charAt(s.cur));
    v.back.set(charAt(s.next));
    v.bottom.set(charAt(s.cur));
    s.theta = 0;
    s.omega = KICK * rate;
    s.phase = "fall";
    v.theta.set(0);
  };

  const rest = (i: number) => {
    const s = states.current[i];
    const v = board[i];
    if (!s || !v) return;
    s.phase = "idle";
    s.theta = 0;
    s.omega = 0;
    // Upright again behind the scenes: the flap now shows the letter it
    // landed on, the same as the half beneath it.
    v.front.set(charAt(s.cur));
    v.top.set(charAt(s.cur));
    v.bottom.set(charAt(s.cur));
    v.theta.set(0);
  };

  const settle = () => {
    setSettled(true);
    setBeat((b) => b + 1);
    if (shown.current !== null) {
      latest.current.onComplete?.(shown.current);
      if (spoken.current) {
        spoken.current = false;
        setAnnounce(list[shown.current] ?? "");
      }
    }
  };

  const frame = (now: number) => {
    const L = loop.current;
    const dt = L.last ? Math.min(0.032, (now - L.last) / 1000) : 1 / 60;
    L.last = now;
    const g = GRAVITY * rate * rate;
    let busy = false;
    states.current.forEach((s, i) => {
      if (s.phase === "idle") return;
      busy = true;
      if (s.phase === "wait") {
        if (now >= s.waitUntil) startFlip(i);
        return;
      }
      // Two half steps: a flap at full tilt covers a lot of arc per frame.
      for (let k = 0; k < 2; k += 1) {
        const h = dt / 2;
        s.omega += g * (0.25 + Math.sin(s.theta * RAD)) * h;
        s.theta += (s.omega * h) / RAD;
        if (s.theta >= 180 && s.omega > 0) {
          if (s.phase === "fall") {
            s.cur = s.next;
            const v = board[i];
            v?.bottom.set(charAt(s.cur));
            const final = s.cur === s.target;
            if (s.audible) clack(i % columns, final);
            if (!final) {
              startFlip(i);
              return;
            }
            s.phase = "bounce";
          }
          if (s.omega < 3 * rate) {
            rest(i);
            return;
          }
          s.theta = 180;
          s.omega = -s.omega * RESTITUTION;
        }
      }
      board[i]?.theta.set(r3(s.theta));
    });
    if (busy) {
      L.frame = window.requestAnimationFrame(pump);
    } else {
      L.last = 0;
      settle();
    }
  };

  const wake = () => {
    const L = loop.current;
    if (L.frame || !running) return;
    if (!states.current.some((s) => s.phase !== "idle")) return;
    L.last = 0;
    L.frame = window.requestAnimationFrame(pump);
  };

  /** Sets the board flipping toward message `k`. */
  const show = (k: number, audible: boolean) => {
    const grid = gridOf(list[k] ?? "", columns, rowCount, align, chars);
    shown.current = k;
    spoken.current = audible;
    const now = performance.now();
    let moving = false;
    for (const c of fades.current) c.stop();
    fades.current = [];
    grid.forEach((ch, i) => {
      const s = states.current[i];
      const v = board[i];
      if (!s || !v) return;
      const target = indexOf(ch);
      const col = i % columns;
      if (!motionSafe) {
        if (target === s.cur) return;
        s.cur = target;
        s.target = target;
        rest(i);
        v.ink.jump(0.15);
        fades.current.push(
          animate(v.ink, 1, {
            duration: durations.base,
            delay: (col * Math.max(0, ripple)) / 1000,
            ease: easings.enter,
          }),
        );
        return;
      }
      if (target === s.target) return;
      s.target = target;
      s.audible = audible;
      moving = true;
      if (s.phase === "idle") {
        s.phase = "wait";
        s.waitUntil = now + col * Math.max(0, ripple);
      }
    });
    // Whether the board is still moving, not just whether this call moved
    // it: a repeat of the same message must not report a settle mid-flip.
    if (
      motionSafe &&
      (moving || states.current.some((c) => c.phase !== "idle"))
    ) {
      setSettled(false);
      wake();
    } else {
      settle();
    }
  };

  React.useLayoutEffect(() => {
    api.current = { show, frame, wake };
    latest.current = { onIndexChange, onComplete };
  });

  // The index is state: the host hears it from the first commit too.
  React.useEffect(() => {
    latest.current.onIndexChange?.(current);
    // Reported once, as the component arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new board shape starts blank.
  React.useLayoutEffect(() => {
    states.current = board.map(() => ({
      cur: 0,
      target: 0,
      next: 0,
      theta: 0,
      omega: 0,
      phase: "idle",
      waitUntil: 0,
      audible: false,
    }));
    shown.current = null;
  }, [board]);

  // The message showing follows the index once the board is armed; a
  // re-laid board (columns, rows, ring, alignment) re-sets it at once. A
  // change the visitor made is heard and announced.
  React.useEffect(() => {
    if (!armed) return;
    const audible = heard.current;
    heard.current = false;
    api.current?.show(current, audible);
  }, [armed, current, board, chars, align, columns, rowCount]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    const L = loop.current;
    return () => {
      if (L.frame) window.cancelAnimationFrame(L.frame);
      L.frame = 0;
      L.last = 0;
    };
  }, [running]);

  React.useEffect(() => {
    const L = loop.current;
    const fading = fades;
    const t = timer;
    return () => {
      if (L.frame) window.cancelAnimationFrame(L.frame);
      L.frame = 0;
      for (const c of fading.current) c.stop();
      fading.current = [];
      if (t.current !== null) window.clearTimeout(t.current);
      t.current = null;
    };
  }, []);

  // The first clatter: when the trigger arms the board.
  React.useEffect(() => {
    if (trigger !== "mount" && trigger !== "manual") return;
    if (trigger === "manual" && index === undefined) return;
    const wait = window.setTimeout(() => setArmed(true), Math.max(0, delay));
    return () => window.clearTimeout(wait);
  }, [trigger, delay, index]);

  const latestTrigger = React.useRef({ trigger, delay });
  React.useEffect(() => {
    latestTrigger.current = { trigger, delay };
  });
  const armSoon = React.useCallback(() => {
    if (timer.current !== null) return;
    timer.current = window.setTimeout(
      () => {
        timer.current = null;
        setArmed(true);
      },
      Math.max(0, latestTrigger.current.delay),
    );
  }, []);

  /** Steps the message as the visitor asks: heard, and announced once settled. */
  const step = (dir: number) => {
    heard.current = true;
    if (!armed) {
      setArmed(true);
      return;
    }
    const next = mod(current + dir, n);
    if (next === current) return;
    if (index === undefined) setOwn(next);
    latest.current.onIndexChange?.(next);
  };

  // The cycle: the next message once the board has settled and rested.
  const auto =
    armed &&
    settled &&
    n > 1 &&
    interval > 0 &&
    !paused &&
    running &&
    !(once && finished);
  React.useEffect(() => {
    if (!auto) return;
    const wait = window.setTimeout(() => {
      const next = mod(current + 1, n);
      heard.current = false;
      if (once && next === n - 1) setFinished(true);
      if (index === undefined) setOwn(next);
      latest.current.onIndexChange?.(next);
    }, interval);
    return () => window.clearTimeout(wait);
  }, [auto, beat, current, interval, n, once, index]);

  const bindRoot = React.useCallback(
    (node: HTMLElement | null) => {
      boardRef.current = node;
      if (!node) return;
      const watcher = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          setOnScreen(entry.isIntersecting);
          if (
            latestTrigger.current.trigger === "inView" &&
            entry.intersectionRatio >= 0.5
          ) {
            armSoon();
          }
        },
        { threshold: [0, 0.5] },
      );
      watcher.observe(node);
      return () => watcher.disconnect();
    },
    [armSoon],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!interactive) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      step(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      step(-1);
    } else {
      return;
    }
    event.preventDefault();
  };

  const Tag = as as "div";
  // Cells are sized from the board's own width (container units), so any
  // number of columns fits any width, up to `size`.
  const style = {
    "--depot-flap": flapColor,
    "--depot-housing": "color-mix(in oklab, var(--card) 86%, black)",
    "--depot-gap": "var(--depot-housing)",
    "--depot-gutter": "max(2px, 0.45cqi)",
    "--depot-pad": "max(6px, 1.2cqi)",
    "--depot-cell": `min(${r3(size * 0.76)}px, calc((100cqi - 2 * var(--depot-pad) - 2px - ${columns - 1} * var(--depot-gutter)) / ${columns}))`,
    color,
  } as React.CSSProperties;

  const cellsGrid = (
    <>
      {caption ? (
        // w-0 + min-w-full: as wide as the cells, never wider.
        <span className="mb-(--depot-pad) flex w-0 min-w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] leading-4 font-normal tracking-[0.08em] text-ink-3 uppercase">
          {caption}
        </span>
      ) : null}
      <span
        aria-hidden
        className="grid font-semibold uppercase select-none"
        style={{
          gridTemplateColumns: `repeat(${columns}, var(--depot-cell))`,
          gap: "calc(var(--depot-gutter) * 1.6) var(--depot-gutter)",
          fontSize: "calc(var(--depot-cell) * 0.9)",
        }}
      >
        {board.map((v, i) => (
          <span
            key={i}
            className="block"
            style={{ height: "calc(var(--depot-cell) * 1.32)" }}
          >
            <Cell v={v} />
          </span>
        ))}
      </span>
    </>
  );

  const message = list[current] ?? "";

  return (
    <Tag
      className={cn("@container w-full", className)}
      onPointerEnter={(event: React.PointerEvent<HTMLDivElement>) => {
        if (trigger === "hover" && event.pointerType !== "touch") armSoon();
      }}
      onFocus={() => {
        if (trigger === "hover") armSoon();
      }}
    >
      {interactive ? (
        <button
          ref={bindRoot}
          type="button"
          aria-label={label}
          aria-describedby={hintId}
          onClick={() => step(1)}
          onKeyDown={onKeyDown}
          className={cn(
            "block w-fit max-w-full cursor-pointer rounded-3 border border-hairline-strong bg-(--depot-housing) p-(--depot-pad) text-left shadow-[inset_0_1px_2px_color-mix(in_oklab,black_12%,transparent)] outline-none",
            "transition-[border-color] duration-150 hover:border-[color-mix(in_oklab,var(--foreground)_28%,transparent)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
          style={style}
        >
          {cellsGrid}
        </button>
      ) : (
        <div
          ref={bindRoot}
          role="group"
          aria-label={label}
          className="block w-fit max-w-full rounded-3 border border-hairline-strong bg-(--depot-housing) p-(--depot-pad) shadow-[inset_0_1px_2px_color-mix(in_oklab,black_12%,transparent)]"
          style={style}
        >
          {cellsGrid}
        </div>
      )}
      <p className="sr-only">{armed ? message : ""}</p>
      {interactive ? (
        <span id={hintId} className="sr-only">
          Press for the next message; Left and Right step through them.
        </span>
      ) : null}
      <p role="status" className="sr-only">
        {announce}
      </p>
    </Tag>
  );
}
