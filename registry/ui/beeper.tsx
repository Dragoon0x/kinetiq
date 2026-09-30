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
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BeeperTone = "info" | "success" | "warn" | "danger";

export type BeeperNotice = {
  id: string;
  title: string;
  body?: string;
  /** How urgent it is: the buzz pattern and the announcement follow it. @default "info" */
  tone?: BeeperTone;
};

export type BeeperLcd = "green" | "amber" | "ice";

export type BeeperProps = {
  /** The messages waiting, oldest first. The newest arrival is the one shown. */
  notices: BeeperNotice[];
  /** A message was acknowledged: the button's press, or Delete on the display. */
  onDismiss?: (id: string) => void;
  /** Every message was cleared by holding the button. Without it, `onDismiss` fires for each. */
  onClearAll?: () => void;
  /** The pager's accessible name. @default "Pager" */
  label?: string;
  /** What the display reads when nothing waits. @default "No messages" */
  emptyText?: string;
  /** How hard it buzzes, 0 to 1: the shake, how far it walks, how loud. 0 is silent mode. @default 0.6 */
  buzz?: number;
  /** The display's glass. @default "green" */
  lcd?: BeeperLcd;
  /** How fast the characters step across the display, 0.5 to 2. @default 1 */
  scroll?: number;
  /** Play the button and the buzz. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------------------------------------------ *
 * The segment display
 * ------------------------------------------------------------------ */

/** Character cells on the display. */
const CELLS = 12;
/** A cell's width and the step between cells, in the drawing's units. */
const CELL_W = 12;
const PITCH = 15.6;
/** Where the first cell sits: centred on the glass once the slant is allowed for. */
const ROW_X = 31;
const ROW_Y = 47;

type Seg =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * One segment: a bar from p1 to p2 with pointed ends, the shape LCD segments
 * have so that neighbours meet at a corner without touching.
 */
function bar(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const h = t / 2;
  const pts: [number, number][] = [
    [x1, y1],
    [x1 + ux * h - uy * h, y1 + uy * h + ux * h],
    [x2 - ux * h - uy * h, y2 - uy * h + ux * h],
    [x2, y2],
    [x2 - ux * h + uy * h, y2 - uy * h - ux * h],
    [x1 + ux * h + uy * h, y1 + uy * h - ux * h],
  ];
  return pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" ");
}

const T = 2.2;
const D = 1.7;
/** A 14-segment cell: four horizontals, six verticals, four diagonals. */
const SEGMENTS: readonly [Seg, string][] = [
  ["a", bar(1.5, 1.1, 10.5, 1.1, T)],
  ["b", bar(10.9, 1.5, 10.9, 11.55, T)],
  ["c", bar(10.9, 12.45, 10.9, 22.5, T)],
  ["d", bar(1.5, 22.9, 10.5, 22.9, T)],
  ["e", bar(1.1, 12.45, 1.1, 22.5, T)],
  ["f", bar(1.1, 1.5, 1.1, 11.55, T)],
  ["g", bar(1.5, 12, 5.55, 12, T)],
  ["h", bar(6.45, 12, 10.5, 12, T)],
  ["i", bar(2.9, 3.1, 5.1, 10.4, D)],
  ["j", bar(6, 2.9, 6, 10.6, T)],
  ["k", bar(9.1, 3.1, 6.9, 10.4, D)],
  ["l", bar(5.1, 13.6, 2.9, 20.9, D)],
  ["m", bar(6, 13.4, 6, 21.1, T)],
  ["n", bar(6.9, 13.6, 9.1, 20.9, D)],
];

/** Which segments draw each character; `p` is the point beside the cell. */
const FONT: Record<string, string> = {
  A: "abcefgh",
  B: "abcdhjm",
  C: "adef",
  D: "abcdjm",
  E: "adefg",
  F: "aefg",
  G: "acdefh",
  H: "bcefgh",
  I: "adjm",
  J: "bcde",
  K: "efgkn",
  L: "def",
  M: "bcefik",
  N: "bcefin",
  O: "abcdef",
  P: "abefgh",
  Q: "abcdefn",
  R: "abefghn",
  S: "acdfgh",
  T: "ajm",
  U: "bcdef",
  V: "efkl",
  W: "bcefln",
  X: "ikln",
  Y: "ikm",
  Z: "adkl",
  "0": "abcdefkl",
  "1": "bck",
  "2": "abdegh",
  "3": "abcdh",
  "4": "bcfgh",
  "5": "adfgn",
  "6": "acdefgh",
  "7": "abc",
  "8": "abcdefgh",
  "9": "abcdfgh",
  "-": "gh",
  "+": "ghjm",
  "/": "kl",
  "\\": "in",
  "'": "j",
  '"': "fj",
  ",": "l",
  _: "d",
  "=": "dgh",
  "*": "ghijklmn",
  "(": "kn",
  ")": "il",
  "<": "kn",
  ">": "il",
  "?": "abhm",
  "!": "jp",
  ".": "p",
  ":": "p",
  "%": "cfkl",
  "#": "bcdghjm",
  $: "acdfghjm",
  "@": "abdefhj",
  "&": "adeghin",
};

/** Text as the display can draw it: capitals, no accents, one space between words. */
function toSegments(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—·•]/g, "-")
    .replace(/…/g, "...")
    .replace(/×/g, "X")
    .toUpperCase()
    .split("")
    .map((ch) => (ch === " " || FONT[ch] ? ch : " "))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** The small 7-segment digits of the waiting count. */
const MINI: readonly [string, string][] = [
  ["a", bar(1, 0.7, 5, 0.7, 1.3)],
  ["b", bar(5.3, 1, 5.3, 5.2, 1.3)],
  ["c", bar(5.3, 5.8, 5.3, 10, 1.3)],
  ["d", bar(1, 10.3, 5, 10.3, 1.3)],
  ["e", bar(0.7, 5.8, 0.7, 10, 1.3)],
  ["f", bar(0.7, 1, 0.7, 5.2, 1.3)],
  ["g", bar(1, 5.5, 5, 5.5, 1.3)],
];
const DIGITS = [
  "abcdef",
  "bc",
  "abdeg",
  "abcdg",
  "bcfg",
  "acdfg",
  "acdefg",
  "abc",
  "abcdefg",
  "abcdfg",
];

/* ------------------------------------------------------------------ *
 * Colour: pigments at fixed lightness from token hues, so the glass
 * reads the same in both themes.
 * ------------------------------------------------------------------ */

type Vars = React.CSSProperties & Record<`--${string}`, string>;

const GLASS: Record<BeeperLcd, Vars> = {
  green: {
    "--lcd-off": "oklch(from var(--success) 0.6 0.05 calc(h - 38))",
    "--lcd-on": "oklch(from var(--success) 0.87 0.14 calc(h - 38))",
    "--lcd-ink": "oklch(from var(--success) 0.24 0.05 calc(h - 20))",
  },
  amber: {
    "--lcd-off": "oklch(from var(--warn) 0.58 0.06 calc(h - 10))",
    "--lcd-on": "oklch(from var(--warn) 0.84 0.15 calc(h - 12))",
    "--lcd-ink": "oklch(from var(--warn) 0.25 0.05 calc(h - 20))",
  },
  ice: {
    "--lcd-off": "oklch(from var(--accent-bright) 0.6 0.03 calc(h - 40))",
    "--lcd-on": "oklch(from var(--accent-bright) 0.9 0.07 calc(h - 45))",
    "--lcd-ink": "oklch(from var(--accent-bright) 0.26 0.07 h)",
  },
};

const BODY: Vars = {
  "--pager": "oklch(from var(--ink-3) 0.3 0.012 h)",
  "--pager-edge": "oklch(from var(--ink-3) 0.44 0.014 h)",
  "--pager-deep": "oklch(from var(--ink-3) 0.19 0.01 h)",
  "--pager-key": "oklch(from var(--ink-3) 0.37 0.012 h)",
  "--pager-emboss": "oklch(from var(--ink-3) 0.5 0.012 h)",
};

/* ------------------------------------------------------------------ *
 * Behaviour constants
 * ------------------------------------------------------------------ */

/** Buzz patterns, in ms: on, off, on… Urgency is heard and felt. */
const PATTERNS: Record<BeeperTone, number[]> = {
  info: [380],
  success: [220],
  warn: [240, 140, 240],
  danger: [200, 110, 200, 110, 280],
};
/** A press this long starts charging the clear-all. */
const HOLD_DELAY = 200;
/** A press this long clears everything. */
const HOLD_TIME = 900;
/** The backlight goes out this long after the last thing happened. */
const IDLE_DARK = 7000;
const FLASH_FOR = 1400;
/** Characters a second at `scroll` 1. */
const STEP_RATE = 8;
/** The largest turn the walk may give it, in degrees. */
const MOST_TURN = 3.5;

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

/** One sentence from a title and a body, never doubling a full stop. */
const sentence = (title: string, body?: string) => {
  const t = title.trim();
  if (!body?.trim()) return t;
  return `${t}${/[.!?]$/.test(t) ? " " : ". "}${body.trim()}`;
};

/** Twelve-character pages broken at spaces, for the reduced-motion display. */
function pagesOf(text: string): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const pieces: string[] = [];
    for (let i = 0; i < word.length; i += CELLS) {
      pieces.push(word.slice(i, i + CELLS));
    }
    for (const piece of pieces) {
      if (!line) line = piece;
      else if (line.length + 1 + piece.length <= CELLS) line += ` ${piece}`;
      else {
        out.push(line);
        line = piece;
      }
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

const centre = (text: string) => {
  const pad = Math.max(0, Math.floor((CELLS - text.length) / 2));
  return `${" ".repeat(pad)}${text}`;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverVisible = () => false;

/** True while the visitor has just pressed or typed: the page has user activation. */
const visitorActed = () =>
  typeof navigator !== "undefined" &&
  navigator.userActivation?.isActive === true;

type Run = {
  /** What the run is showing; a new key starts it from the beginning. */
  key: string;
  /** Scroll: the window's first character; page: the page; reveal: cells shown. */
  pos: number;
  /** Full passes finished. */
  pass: number;
  done: boolean;
};

type Press = {
  source: "pointer" | "key";
  timer: number;
  charging: boolean;
  done: boolean;
};

type Api = {
  completeHold: () => void;
  release: (source: Press["source"], cancelled?: boolean) => void;
  darken: () => void;
};

/**
 * A pocket pager on the desk. A notice that arrives buzzes it: the body
 * shakes at 28Hz in pulses whose count says how urgent the notice is, and
 * during each pulse it walks a seeded step across the surface and turns a
 * little, then stays where it walked. The backlight comes up and the message
 * steps across a 14-segment display one whole character at a time, as
 * segment displays do; the waiting count sits in the display's corner.
 *
 * The one button acknowledges the message on the display and loads the next.
 * Held, it charges: the display reads CLEAR ALL over a bar that fills cell by
 * cell, and at 900ms everything is cleared. Every frame is motion values; the
 * marquee is a stepped timer that runs only on screen in a visible page.
 *
 * The display is a focusable message whose name is the whole text: arrow keys
 * show other messages, Delete acknowledges, Shift+Delete clears all. The
 * button is a real button — Space or Enter pressed and released acknowledges,
 * held clears. Under reduced motion nothing shakes or walks: an arrival
 * flashes the backlight, and long messages page in twelve-character chunks
 * instead of travelling.
 */
export function Beeper({
  notices,
  onDismiss,
  onClearAll,
  label = "Pager",
  emptyText = "No messages",
  buzz = 0.6,
  lcd = "green",
  scroll = 1,
  sound = false,
  disabled = false,
  className,
}: BeeperProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const seed = hash(uid);
  const displayHint = `${uid}-display`;
  const buttonHint = `${uid}-button`;
  const sheenId = `beeper-sheen-${safeId}`;
  const barClipId = `beeper-bar-${safeId}`;
  const strength = clamp(buzz, 0, 1);
  const rate = STEP_RATE * clamp(scroll, 0.5, 2);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverVisible,
  );

  // --- which message is on the display, and what just arrived ------------
  const ids = notices.map((n) => n.id);
  const idsKey = ids.join("\u0001");
  const [seen, setSeen] = React.useState({ key: idsKey, ids });
  const [shownId, setShownId] = React.useState<string | null>(null);
  const [restart, setRestart] = React.useState(0);
  const [arrival, setArrival] = React.useState({
    n: 0,
    tone: "info" as BeeperTone,
  });
  const [polite, setPolite] = React.useState({ n: 0, text: "" });
  const [urgent, setUrgent] = React.useState({ n: 0, text: "" });
  if (seen.key !== idsKey) {
    const fresh = notices.filter((n) => !seen.ids.includes(n.id));
    setSeen({ key: idsKey, ids });
    const newest = fresh[fresh.length - 1];
    if (newest) {
      setShownId(newest.id);
      setRestart((r) => r + 1);
      setArrival((a) => ({ n: a.n + 1, tone: newest.tone ?? "info" }));
      const said =
        fresh.length > 1
          ? `${fresh.length} new messages. Newest: ${sentence(newest.title, newest.body)}`
          : `${newest.tone === "danger" ? "Urgent message" : "New message"}: ${sentence(newest.title, newest.body)}`;
      if (newest.tone === "danger") {
        setUrgent((u) => ({ n: u.n + 1, text: said }));
      } else {
        setPolite((p) => ({ n: p.n + 1, text: said }));
      }
    }
  }

  // A new scroll speed replays the message at that speed.
  const [lastScroll, setLastScroll] = React.useState(scroll);
  if (scroll !== lastScroll) {
    setLastScroll(scroll);
    setRestart((r) => r + 1);
  }

  let shownIndex = shownId ? ids.indexOf(shownId) : -1;
  if (shownIndex === -1) shownIndex = notices.length - 1;
  const shown = notices[shownIndex];
  const count = notices.length;

  const [charging, setCharging] = React.useState(false);
  const [flash, setFlash] = React.useState<{ n: number; text: string } | null>(
    null,
  );
  const [onScreen, setOnScreen] = React.useState(true);

  // --- the display's text and its run --------------------------------------
  const message = shown
    ? toSegments(
        shown.body?.trim()
          ? `${shown.title} - ${shown.body}`
          : `${shown.title}`,
      )
    : "";
  const mode: "hold" | "flash" | "empty" | "scroll" | "page" | "static" =
    charging
      ? "hold"
      : flash
        ? "flash"
        : !shown
          ? "empty"
          : message.length <= CELLS
            ? "static"
            : motionSafe
              ? "scroll"
              : "page";
  const pages = React.useMemo(
    () => (mode === "page" ? pagesOf(message) : []),
    [mode, message],
  );
  // Scrolling and paging are one run: a reduced-motion switch mid-way does
  // not start the message over.
  const kind = mode === "scroll" || mode === "page" ? "message" : mode;
  const runKey = `${kind}|${shown?.id ?? ""}|${message}|${restart}`;
  const [run, setRun] = React.useState<Run>({
    key: runKey,
    pos: mode === "static" ? CELLS : 0,
    pass: 1,
    done: true,
  });
  if (run.key !== runKey) {
    const instant = mode === "static" && !motionSafe;
    setRun({
      key: runKey,
      pos: mode === "scroll" ? -CELLS : instant ? CELLS : 0,
      pass: 0,
      done: instant || mode === "hold" || mode === "flash" || mode === "empty",
    });
  }

  const stepping =
    !run.done &&
    onScreen &&
    !hidden &&
    (mode === "scroll" || mode === "page" || mode === "static");
  const stepMs =
    mode === "static"
      ? 28
      : mode === "page"
        ? Math.max(1100, (CELLS / rate) * 1000)
        : 1000 / rate;

  React.useEffect(() => {
    if (!stepping) return;
    const timer = window.setTimeout(() => {
      setRun((r) => {
        if (r.key !== runKey || r.done) return r;
        if (mode === "static") {
          const pos = r.pos + 1;
          return { ...r, pos, done: pos >= CELLS };
        }
        if (mode === "page") {
          const next = r.pos + 1;
          if (next < pages.length) return { ...r, pos: next };
          // Twice through the pages, then rest on the first.
          return r.pass >= 1
            ? { ...r, pos: 0, pass: 2, done: true }
            : { ...r, pos: 0, pass: 1 };
        }
        const pos = r.pos + 1;
        // The second pass comes to rest on the message's start.
        if (r.pass >= 1 && pos >= 0) return { ...r, pos: 0, done: true };
        if (pos > message.length) return { ...r, pos: -CELLS, pass: 1 };
        return { ...r, pos };
      });
    }, stepMs);
    return () => window.clearTimeout(timer);
  }, [stepping, stepMs, run, runKey, mode, pages.length, message.length]);

  const cells: string =
    mode === "hold"
      ? centre("CLEAR ALL")
      : mode === "flash"
        ? centre(toSegments(flash?.text ?? ""))
        : mode === "empty"
          ? centre(toSegments(emptyText).slice(0, CELLS))
          : mode === "static"
            ? centre(message).slice(0, run.pos)
            : mode === "page"
              ? centre(pages[clamp(run.pos, 0, pages.length - 1)] ?? "")
              : Array.from(
                  { length: CELLS },
                  (_, i) => message[run.pos + i] ?? " ",
                ).join("");

  // --- motion values -------------------------------------------------------
  const lit = useMotionValue(0);
  const press = useMotionValue(0);
  const charge = useMotionValue(0);
  const posX = useMotionValue(0);
  const posY = useMotionValue(0);
  const turn = useMotionValue(0);
  const shakeX = useMotionValue(0);
  const shakeY = useMotionValue(0);
  const shakeR = useMotionValue(0);

  const x = useTransform([posX, shakeX] as MotionValue<number>[], ([a, b]) =>
    r2((a as number) + (b as number)),
  );
  const y = useTransform([posY, shakeY] as MotionValue<number>[], ([a, b]) =>
    r2((a as number) + (b as number)),
  );
  const rotate = useTransform(
    [turn, shakeR] as MotionValue<number>[],
    ([a, b]) => r2((a as number) + (b as number)),
  );
  const glass = useTransform(
    lit,
    (l) =>
      `color-mix(in oklab, var(--lcd-on) ${Math.round(clamp(l, 0, 1) * 100)}%, var(--lcd-off))`,
  );
  const halo = useTransform(lit, (l) => r2(clamp(l, 0, 1)));
  const keyY = useTransform(press, (p) => r2(p * 1.6));
  const keyShade = useTransform(press, (p) => r2(0.35 * p));
  const ringOffset = useTransform(charge, (c) => r2(1 - clamp(c, 0, 1)));
  const ringOpacity = useTransform(charge, (c) => (c > 0.001 ? 1 : 0));
  const barWidth = useTransform(charge, (c) =>
    r2(Math.floor(clamp(c, 0, 1) * CELLS + 0.001) * PITCH),
  );

  // --- plumbing --------------------------------------------------------------
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pagerRef = React.useRef<HTMLDivElement | null>(null);
  const room = React.useRef({ x: 0, y: 4 });
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const idle = React.useRef(0);
  const walks = React.useRef(0);
  const pressing = React.useRef<Press | null>(null);
  const detach = React.useRef<(() => void) | null>(null);
  const api = React.useRef<Api | null>(null);

  const runAnim = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const pan = () => {
    const rect = pagerRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const darken = () => {
    window.clearTimeout(idle.current);
    idle.current = 0;
    runAnim(
      "lit",
      animate(lit, 0, { duration: durations.slow, ease: easings.exit }),
    );
  };

  /** The backlight comes up, and goes out again once things are quiet. */
  const wake = () => {
    runAnim(
      "lit",
      animate(lit, 1, { duration: durations.base, ease: easings.enter }),
    );
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => api.current?.darken(), IDLE_DARK);
  };

  const stopBuzz = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    for (const key of ["shakeX", "shakeY", "shakeR"]) {
      anims.current.get(key)?.stop();
      anims.current.delete(key);
    }
    shakeX.set(0);
    shakeY.set(0);
    shakeR.set(0);
  };

  /** One pulse: a 28Hz shake, and a step across the desk while it lasts. */
  const pulse = (ms: number, loud: boolean) => {
    if (document.hidden) return;
    const rand = lcg(seed ^ Math.imul(walks.current + 1, 0x9e3779b1));
    walks.current += 1;
    const seconds = ms / 1000;
    const swings = Math.max(4, Math.round(seconds * 28 * 2));
    const amp = 0.6 + 1.6 * strength;
    const sx: number[] = [0];
    const sy: number[] = [0];
    const sr: number[] = [0];
    for (let i = 1; i < swings; i += 1) {
      const side = i % 2 ? 1 : -1;
      sx.push(r2(side * amp * (0.7 + 0.3 * rand())));
      sy.push(r2((rand() - 0.5) * amp * 0.5));
      sr.push(r2(side * 0.45 * strength * (0.6 + 0.4 * rand())));
    }
    sx.push(0);
    sy.push(0);
    sr.push(0);
    const shake = { duration: seconds, ease: easings.linear };
    runAnim("shakeX", animate(shakeX, sx, shake));
    runAnim("shakeY", animate(shakeY, sy, shake));
    runAnim("shakeR", animate(shakeR, sr, shake));

    // The walk: a seeded step, pulled back toward the middle near the edges.
    const { x: roomX, y: roomY } = room.current;
    const angle = rand() * Math.PI * 2;
    const len = (6 + 12 * rand()) * strength;
    let dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len * 0.3;
    const from = posX.get();
    if (
      Math.abs(from + dx) > roomX * 0.6 &&
      Math.sign(dx) === Math.sign(from)
    ) {
      dx = -dx;
    }
    const toX = r2(clamp(from + dx, -roomX, roomX));
    const toY = r2(clamp(posY.get() + dy, -roomY, roomY));
    let dr = (rand() - 0.5) * 3 * strength;
    if (Math.abs(turn.get() + dr) > MOST_TURN * 0.6) {
      dr = -Math.sign(turn.get()) * Math.abs(dr);
    }
    const toR = r2(clamp(turn.get() + dr, -MOST_TURN, MOST_TURN));
    const walk = { duration: seconds, ease: easings.move };
    runAnim("posX", animate(posX, toX, walk));
    runAnim("posY", animate(posY, toY, walk));
    runAnim("turn", animate(turn, toR, walk));
    if (loud) {
      audio.play("buzz", { gain: r2(0.25 + 0.45 * strength), pan: pan() });
    }
  };

  /** An arrival: the pattern for its tone, and the light. */
  const buzzFor = (tone: BeeperTone) => {
    stopBuzz();
    wake();
    const pattern = PATTERNS[tone] ?? PATTERNS.info;
    const loud = strength > 0 && visitorActed();
    if (!motionSafe) {
      // Nothing travels: the backlight flashes once per pulse instead. The
      // buzz is still heard — sound is not motion.
      const frames: number[] = [];
      for (let i = 0; i < pattern.length; i += 2) frames.push(0.25, 1);
      runAnim(
        "lit",
        animate(lit, [lit.get(), ...frames], {
          duration: durations.slow * frames.length * 0.5,
          ease: easings.linear,
        }),
      );
    } else if (strength <= 0) {
      return;
    }
    let at = 0;
    pattern.forEach((ms, i) => {
      if (i % 2 === 0) {
        timers.current.push(
          window.setTimeout(() => {
            if (motionSafe) pulse(ms, loud);
            else if (loud) {
              audio.play("buzz", {
                gain: r2(0.25 + 0.45 * strength),
                pan: pan(),
              });
            }
          }, at),
        );
      }
      at += ms;
    });
  };

  const say = (text: string) => setPolite((p) => ({ n: p.n + 1, text }));

  const acknowledge = () => {
    if (disabled) return;
    wake();
    if (!shown) return;
    const next = notices[shownIndex - 1] ?? notices[shownIndex + 1] ?? null;
    setShownId(next?.id ?? null);
    setRestart((r) => r + 1);
    const left = count - 1;
    say(
      left > 0
        ? `Acknowledged. ${left} ${left === 1 ? "message" : "messages"} waiting.`
        : "Acknowledged. No messages waiting.",
    );
    onDismiss?.(shown.id);
  };

  const clearAll = () => {
    if (disabled || count === 0) return;
    setShownId(null);
    setFlash((f) => ({ n: (f?.n ?? 0) + 1, text: "Cleared" }));
    say("All messages cleared.");
    if (onClearAll) onClearAll();
    else for (const id of ids) onDismiss?.(id);
  };

  const browse = (to: number) => {
    if (count === 0) return;
    const index = ((to % count) + count) % count;
    const target = notices[index];
    if (!target) return;
    wake();
    setShownId(target.id);
    setRestart((r) => r + 1);
    say(
      `Message ${count - index} of ${count}: ${sentence(target.title, target.body)}`,
    );
  };

  // --- the button: a press acknowledges, a hold clears ---------------------
  const begin = (source: Press["source"]) => {
    if (disabled || pressing.current) return;
    wake();
    if (motionSafe) runAnim("press", animate(press, 1, springs.flick));
    else {
      anims.current.get("press")?.stop();
      press.jump(1);
    }
    audio.play("click", { pitch: 1.05, gain: 0.55, pan: pan() });
    pressing.current = {
      source,
      charging: false,
      done: false,
      timer:
        count > 0
          ? window.setTimeout(() => {
              const p = pressing.current;
              if (!p) return;
              p.charging = true;
              setCharging(true);
              runAnim(
                "charge",
                animate(charge, 1, {
                  duration: (HOLD_TIME - HOLD_DELAY) / 1000,
                  ease: easings.linear,
                  onComplete: () => api.current?.completeHold(),
                }),
              );
            }, HOLD_DELAY)
          : 0,
    };
  };

  const completeHold = () => {
    const p = pressing.current;
    if (!p || p.done) return;
    // Latched: nothing that follows (a stray leave, the release) undoes it.
    p.done = true;
    setCharging(false);
    runAnim(
      "charge",
      animate(charge, 0, { duration: durations.base, ease: easings.exit }),
    );
    audio.play("buzz", { pitch: 1.5, gain: 0.3, pan: pan() });
    clearAll();
  };

  const release = (source: Press["source"], cancelled = false) => {
    const p = pressing.current;
    if (!p || p.source !== source) return;
    pressing.current = null;
    detach.current?.();
    detach.current = null;
    window.clearTimeout(p.timer);
    if (motionSafe) runAnim("press", animate(press, 0, springs.flick));
    else {
      anims.current.get("press")?.stop();
      press.jump(0);
    }
    if (p.done) return;
    if (p.charging) {
      setCharging(false);
      runAnim(
        "charge",
        animate(charge, 0, { duration: durations.fast, ease: easings.exit }),
      );
      audio.play("click", { pitch: 0.7, gain: 0.35, pan: pan() });
      return;
    }
    if (!cancelled) acknowledge();
  };

  React.useEffect(() => {
    api.current = { completeHold, release, darken };
  });

  // An arrival buzzes. Keyed by the arrival's serial, so it runs once each.
  const lastBuzz = React.useRef(0);
  React.useEffect(() => {
    if (arrival.n === 0 || arrival.n === lastBuzz.current) return;
    lastBuzz.current = arrival.n;
    buzzFor(arrival.tone);
    // Only a new arrival starts a buzz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival]);

  // The "cleared" reading stays a moment, then the display goes quiet.
  React.useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), FLASH_FOR);
    return () => window.clearTimeout(t);
  }, [flash]);

  // A hidden page stops the light's clock and any buzz; it starts again when
  // the page comes back.
  React.useEffect(() => {
    if (hidden) {
      window.clearTimeout(idle.current);
      idle.current = 0;
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      api.current?.release("pointer", true);
      api.current?.release("key", true);
    } else if (lit.get() > 0.01 && !idle.current) {
      idle.current = window.setTimeout(() => api.current?.darken(), IDLE_DARK);
    }
  }, [hidden, lit]);

  React.useEffect(() => {
    if (disabled) {
      api.current?.release("pointer", true);
      api.current?.release("key", true);
    }
  }, [disabled]);

  // Mounted (again, under StrictMode): a light left on gets its clock back.
  // Unmounted: everything stops, and a shake cut short settles to rest
  // rather than freezing the body off its spot.
  React.useEffect(() => {
    const running = anims.current;
    if (lit.get() > 0.01 && !idle.current) {
      idle.current = window.setTimeout(() => api.current?.darken(), IDLE_DARK);
    }
    return () => {
      detach.current?.();
      detach.current = null;
      if (pressing.current) window.clearTimeout(pressing.current.timer);
      pressing.current = null;
      window.clearTimeout(idle.current);
      idle.current = 0;
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      for (const c of running.values()) c.stop();
      running.clear();
      shakeX.set(0);
      shakeY.set(0);
      shakeR.set(0);
      press.set(0);
      charge.set(0);
    };
  }, [lit, shakeX, shakeY, shakeR, press, charge]);

  // The room it may walk in, and whether it is on screen, bound to the node
  // when it arrives.
  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const measure = () => {
        const w = node.clientWidth;
        const pagerW = Math.min(380, Math.max(0, w - 24));
        const pagerH = pagerW * 0.4;
        const roomX = Math.max(
          0,
          Math.min(80, (w - pagerW) / 2 - pagerH * 0.035 - 4),
        );
        room.current = { x: r2(roomX), y: 4 };
        if (Math.abs(posX.get()) > roomX) {
          posX.set(r2(clamp(posX.get(), -roomX, roomX)));
        }
      };
      measure();
      const sizer = new ResizeObserver(measure);
      sizer.observe(node);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        setOnScreen(Boolean(entry?.isIntersecting));
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
      };
    },
    [posX],
  );

  const onButtonPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const id = event.pointerId;
    begin("pointer");
    detach.current?.();
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) api.current?.release("pointer");
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === id) api.current?.release("pointer", true);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    detach.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  };

  const onButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === " " || event.key === "Enter") {
      // Handled here, so the native click never doubles the press.
      event.preventDefault();
      if (!event.repeat) begin("key");
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (event.shiftKey) clearAll();
      else acknowledge();
    }
  };

  const onDisplayKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        browse(shownIndex - 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        browse(shownIndex + 1);
        return;
      case "Home":
        event.preventDefault();
        browse(count - 1);
        return;
      case "End":
        event.preventDefault();
        browse(0);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        wake();
        setRestart((r) => r + 1);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        if (event.shiftKey) clearAll();
        else acknowledge();
        return;
    }
  };

  const displayName = shown
    ? `Message ${count - shownIndex} of ${count}: ${sentence(shown.title, shown.body)}`
    : emptyText;
  const tone = shown?.tone ?? "info";
  const alarming = tone === "danger" || tone === "warn";
  const countText = String(Math.min(99, count)).padStart(2, " ");

  return (
    <div
      ref={bindRoot}
      role="region"
      aria-label={label}
      className={cn(
        "relative isolate flex w-full justify-center overflow-clip py-5 select-none",
        disabled && "opacity-50",
        className,
      )}
      style={{ ...BODY, ...(GLASS[lcd] ?? GLASS.green) }}
    >
      <motion.div
        ref={pagerRef}
        className="relative aspect-[320/128] w-[min(380px,calc(100%-24px))] shrink-0"
        style={{ x, y, rotate }}
      >
        <svg
          aria-hidden
          viewBox="0 0 320 128"
          className="absolute inset-0 block size-full"
        >
          <defs>
            <linearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="white" stopOpacity={0.22} />
              <stop offset="0.45" stopColor="white" stopOpacity={0.04} />
              <stop offset="1" stopColor="white" stopOpacity={0} />
            </linearGradient>
            <clipPath id={barClipId}>
              <motion.rect x={ROW_X - 4} y={72} height={6} width={barWidth} />
            </clipPath>
          </defs>

          {/* The desk under it. */}
          <ellipse
            cx={160}
            cy={122.5}
            rx={148}
            ry={4.5}
            className="fill-ink-3/20"
          />
          {/* Lanyard eye, then the body. */}
          <rect
            x={30}
            y={3}
            width={30}
            height={14}
            rx={7}
            fill="none"
            strokeWidth={4}
            style={{ stroke: "var(--pager-deep)" }}
          />
          <rect
            x={4}
            y={10}
            width={312}
            height={110}
            rx={26}
            style={{ fill: "var(--pager)" }}
          />
          <path
            d="M 30 11.5 H 290 A 24.5 24.5 0 0 1 314 30"
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            style={{ stroke: "var(--pager-edge)" }}
          />
          {/* Grip ribs at the tail. */}
          {[0, 1, 2, 3].map((i) => (
            <line
              key={i}
              x1={244 + i * 12}
              x2={244 + i * 12}
              y1={98}
              y2={110}
              strokeWidth={2}
              strokeLinecap="round"
              style={{ stroke: "var(--pager-deep)" }}
            />
          ))}

          {/* Bezel, the backlight's spill onto it, and the glass. */}
          <rect
            x={16}
            y={20}
            width={210}
            height={72}
            rx={11}
            style={{ fill: "var(--pager-deep)" }}
          />
          <motion.g style={{ opacity: halo }}>
            {[
              [3, 0.34],
              [6, 0.16],
              [9, 0.07],
            ].map(([grow, alpha]) => (
              <rect
                key={grow}
                x={22 - (grow as number) / 2}
                y={26 - (grow as number) / 2}
                width={198 + (grow as number)}
                height={60 + (grow as number)}
                rx={7 + (grow as number) / 2}
                fill="none"
                strokeWidth={3}
                strokeOpacity={alpha}
                style={{ stroke: "var(--lcd-on)" }}
              />
            ))}
          </motion.g>
          <motion.rect
            x={22}
            y={26}
            width={198}
            height={60}
            rx={6}
            style={{ fill: glass }}
          />

          {/* The status strip: vibrate, urgency, envelope and the count. */}
          <g style={{ fill: "var(--lcd-ink)", stroke: "var(--lcd-ink)" }}>
            <g
              className="transition-[fill-opacity,stroke-opacity] duration-100"
              fillOpacity={0.9}
              strokeOpacity={0.9}
            >
              <rect
                x={31.5}
                y={30.5}
                width={4.5}
                height={8.5}
                rx={1}
                fill="none"
                strokeWidth={1.2}
              />
              {[28.8, 38.7].map((lx) => (
                <line
                  key={lx}
                  x1={lx}
                  x2={lx}
                  y1={32}
                  y2={37.5}
                  strokeWidth={1.1}
                  strokeOpacity={strength > 0 ? 0.9 : 0.12}
                />
              ))}
              {strength > 0 ? null : (
                <line x1={28.5} y1={39.5} x2={39.5} y2={30} strokeWidth={1.3} />
              )}
            </g>
            <g
              className="transition-[fill-opacity,stroke-opacity] duration-100"
              fillOpacity={alarming ? 0.9 : 0.08}
              strokeOpacity={alarming ? 0.9 : 0.08}
            >
              <line x1={47} x2={47} y1={30.5} y2={36} strokeWidth={1.8} />
              <circle cx={47} cy={38.3} r={0.95} stroke="none" />
            </g>
            <g
              className="transition-[stroke-opacity] duration-100"
              fill="none"
              strokeWidth={1.1}
              strokeOpacity={count > 0 ? 0.9 : 0.08}
            >
              <rect x={186} y={31.2} width={10.5} height={7.3} rx={0.8} />
              <path d="M 186.4 31.8 L 191.25 35.6 L 196.1 31.8" />
            </g>
            {[0, 1].map((slot) => {
              const ch = countText[slot] ?? " ";
              const on = ch === " " ? "" : (DIGITS[Number(ch)] ?? "");
              return (
                <g key={slot} transform={`translate(${201 + slot * 7.5} 29.2)`}>
                  {MINI.map(([name, points]) => (
                    <polygon
                      key={name}
                      points={points}
                      stroke="none"
                      className="transition-[fill-opacity] duration-100"
                      fillOpacity={on.includes(name) ? 0.92 : 0.07}
                    />
                  ))}
                </g>
              );
            })}
          </g>

          {/* The character row: unlit segments still show faintly. */}
          <g style={{ fill: "var(--lcd-ink)" }}>
            {Array.from({ length: CELLS }, (_, i) => {
              const ch = cells[i] ?? " ";
              const on = FONT[ch] ?? "";
              return (
                <g
                  key={i}
                  transform={`translate(${r2(ROW_X + i * PITCH)} ${ROW_Y}) skewX(-8)`}
                >
                  {SEGMENTS.map(([name, points]) => (
                    <polygon
                      key={name}
                      points={points}
                      className="transition-[fill-opacity] duration-100"
                      fillOpacity={on.includes(name) ? 0.92 : 0.06}
                    />
                  ))}
                  <circle
                    cx={13.3}
                    cy={22.9}
                    r={1.1}
                    className="transition-[fill-opacity] duration-100"
                    fillOpacity={on.includes("p") ? 0.92 : 0.06}
                  />
                </g>
              );
            })}
            {/* The hold's bar: one underline per cell, stepping on. */}
            {Array.from({ length: CELLS }, (_, i) => (
              <rect
                key={i}
                x={r2(ROW_X - 3 + i * PITCH)}
                y={74.4}
                width={CELL_W}
                height={1.8}
                rx={0.9}
                fillOpacity={0.06}
              />
            ))}
            <g clipPath={`url(#${barClipId})`}>
              {Array.from({ length: CELLS }, (_, i) => (
                <rect
                  key={i}
                  x={r2(ROW_X - 3 + i * PITCH)}
                  y={74.4}
                  width={CELL_W}
                  height={1.8}
                  rx={0.9}
                  fillOpacity={0.92}
                />
              ))}
            </g>
          </g>
          <rect
            x={22}
            y={26}
            width={198}
            height={60}
            rx={6}
            fill={`url(#${sheenId})`}
          />

          {/* Embossed instructions under the glass. */}
          <text
            x={22}
            y={106}
            fontSize={6.5}
            letterSpacing={0.8}
            className="font-mono"
            style={{ fill: "var(--pager-emboss)" }}
          >
            PRESS · READ — HOLD · CLEAR ALL
          </text>

          {/* The button: bezel, the hold's ring, and the rubber key. */}
          <circle
            cx={270}
            cy={54}
            r={31}
            style={{ fill: "var(--pager-deep)" }}
          />
          <g transform="rotate(-90 270 54)">
            <motion.circle
              cx={270}
              cy={54}
              r={28.2}
              fill="none"
              strokeWidth={2.4}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              style={{
                stroke: "var(--lcd-on)",
                strokeDashoffset: ringOffset,
                opacity: ringOpacity,
              }}
            />
          </g>
          <motion.g style={{ y: keyY }}>
            <circle
              cx={270}
              cy={55.5}
              r={24}
              style={{ fill: "var(--pager-deep)" }}
            />
            <circle
              cx={270}
              cy={54}
              r={24}
              style={{ fill: "var(--pager-key)" }}
            />
            <path
              d="M 250.5 46 A 21 21 0 0 1 289.5 46"
              fill="none"
              strokeWidth={1.4}
              strokeLinecap="round"
              style={{ stroke: "var(--pager-edge)" }}
            />
            <motion.circle
              cx={270}
              cy={54}
              r={24}
              style={{ fill: "var(--pager-deep)", opacity: keyShade }}
            />
            <text
              x={270}
              y={56.5}
              fontSize={7}
              letterSpacing={1}
              textAnchor="middle"
              className="font-mono"
              style={{ fill: "var(--pager-emboss)" }}
            >
              READ
            </text>
          </motion.g>
        </svg>

        <div
          role="article"
          tabIndex={disabled ? -1 : 0}
          aria-label={displayName}
          aria-describedby={displayHint}
          onKeyDown={onDisplayKeyDown}
          onClick={() => {
            if (!disabled) browse(shownIndex - 1);
          }}
          className={cn(
            "absolute top-[20.31%] left-[6.88%] h-[46.88%] w-[61.88%] rounded-1 outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        />
        <button
          type="button"
          aria-label="Read and acknowledge"
          aria-describedby={buttonHint}
          aria-keyshortcuts="Delete Shift+Delete"
          disabled={disabled}
          onPointerDown={onButtonPointerDown}
          onKeyDown={onButtonKeyDown}
          onKeyUp={(event) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              release("key");
            }
          }}
          onBlur={() => release("key", true)}
          onClick={(event) => {
            // Presses arrive through the pointer and the keys above. A click
            // with nothing behind it is assistive technology: a press.
            if (event.detail === 0 && !pressing.current) acknowledge();
          }}
          onContextMenu={(event) => event.preventDefault()}
          className={cn(
            "absolute top-[20.31%] left-[75.63%] h-[43.75%] w-[17.5%] touch-manipulation rounded-full outline-none [-webkit-touch-callout:none]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "enabled:cursor-pointer disabled:cursor-not-allowed",
          )}
        />
      </motion.div>

      <p id={displayHint} className="sr-only">
        Arrow keys show other messages. Delete acknowledges this one; Shift and
        Delete clears all.
      </p>
      <p id={buttonHint} className="sr-only">
        Press to acknowledge the message on the display and read the next. Hold
        to clear all.
      </p>
      <p role="status" className="sr-only">
        <span key={polite.n}>{polite.text}</span>
      </p>
      <p role="alert" className="sr-only">
        <span key={urgent.n}>{urgent.text}</span>
      </p>
    </div>
  );
}
