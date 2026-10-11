"use client";

import * as React from "react";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ---------------------------------- types --------------------------------- */

export type GuestStep =
  /** Glide to an anchor (plus an offset), then hold there for `hold` ms. */
  | { kind: "move"; to: string; dx?: number; dy?: number; hold?: number }
  /** Drag-select the words from one anchor to another. */
  | { kind: "select"; from: string; to: string }
  /** Leave a short chat bubble for `hold` ms. */
  | { kind: "say"; text: string; hold?: number }
  /** Press a button or tick a box. */
  | { kind: "press"; on: string }
  /** Stay put. */
  | { kind: "wait"; ms: number };

export type GuestPointer = {
  /** Stable id, reported by onFollowingChange. */
  id: string;
  /** The name on the tag. */
  name: string;
  /** The guest's colour, any CSS colour; white text sits on it. Defaults to the next pigment of the house set. */
  color?: string;
  /** The recorded path, against the document's anchors. Defaults to a script of its own. */
  steps?: GuestStep[];
};

export type GuestTagStyle = "pill" | "flag" | "initials";

export type GuestPointersProps = {
  /** Who might be here. @default defaultGuests */
  guests?: GuestPointer[];
  /** How many of them are here, 1 to 5. @default 3 */
  count?: number;
  /** How a pointer's name is worn: a pill beside it, a flag at its tip, or initials. @default "pill" */
  tagStyle?: GuestTagStyle;
  /** How the pointers glide between the samples the network delivers, 0 (jumps) to 1 (buttery, a little behind). @default 0.6 */
  smoothing?: number;
  /** Controlled: the guest the view follows, or null for the overview. */
  following?: string | null;
  /** Initial guest to follow when uncontrolled. @default null */
  defaultFollowing?: string | null;
  /** Fires from the tag, button or Escape that started or stopped following. */
  onFollowingChange?: (id: string | null) => void;
  /** Replay speed, 0.5 to 2. @default 1 */
  speed?: number;
  /** Samples a second the network delivers per pointer. @default 12 */
  sampleRate?: number;
  /** Guests leave chat bubbles. @default true */
  bubbles?: boolean;
  /** Guests select text. @default true */
  selections?: boolean;
  /** Zoom while following; never less than the overview. @default 1 */
  followZoom?: number;
  /** The document's title. @default "Spring launch plan" */
  title?: string;
  /** Stop the replay where it is. @default false */
  paused?: boolean;
  /** The view's accessible name. @default "Shared document" */
  label?: string;
  /** Sizes the view. @default "h-[520px] w-full" */
  className?: string;
};

/* -------------------------------- defaults -------------------------------- */

/** Pigments dark enough for white type, the same in either theme. */
const PIGMENTS = [
  "oklch(from var(--accent-bright) 0.52 0.17 h)",
  "oklch(from var(--danger) 0.54 0.18 h)",
  "oklch(from var(--success) 0.52 0.13 h)",
  "oklch(from var(--warn) 0.56 0.13 calc(h - 25))",
  "oklch(from var(--accent-bright) 0.52 0.15 calc(h + 55))",
];

export const defaultGuests: GuestPointer[] = [
  {
    id: "mara",
    name: "Mara Lind",
    steps: [
      { kind: "move", to: "title.1", dx: 20, hold: 700 },
      { kind: "select", from: "p1.11", to: "p1.15" },
      { kind: "say", text: "Can we bring this a week earlier?", hold: 2600 },
      { kind: "move", to: "approve", hold: 900 },
      { kind: "move", to: "p2.4", dy: 6, hold: 1200 },
      { kind: "wait", ms: 900 },
    ],
  },
  {
    id: "theo",
    name: "Theo Park",
    steps: [
      { kind: "move", to: "chart", hold: 500 },
      { kind: "move", to: "bar3", dy: -6, hold: 900 },
      { kind: "say", text: "Week 4 jumped. The press piece?", hold: 2600 },
      { kind: "move", to: "note2", hold: 1300 },
      { kind: "select", from: "p2.0", to: "p2.3" },
      { kind: "wait", ms: 1100 },
    ],
  },
  {
    id: "ines",
    name: "Ines Okafor",
    steps: [
      { kind: "move", to: "check2", hold: 300 },
      { kind: "press", on: "check2" },
      { kind: "move", to: "p1.24", hold: 400 },
      { kind: "select", from: "p1.24", to: "p1.31" },
      { kind: "say", text: "4,200 now, confirmed today", hold: 2300 },
      { kind: "wait", ms: 1200 },
    ],
  },
  {
    id: "juno",
    name: "Juno Vale",
    steps: [
      { kind: "move", to: "check1", hold: 400 },
      { kind: "press", on: "check1" },
      { kind: "move", to: "note1", hold: 1100 },
      { kind: "move", to: "approve", hold: 500 },
      { kind: "press", on: "approve" },
      { kind: "say", text: "Approved from my side", hold: 2000 },
      { kind: "wait", ms: 1500 },
    ],
  },
  {
    id: "sami",
    name: "Sami Reyes",
    steps: [
      { kind: "move", to: "note1", dx: 10, hold: 800 },
      { kind: "say", text: "Love the new mug shot", hold: 2100 },
      { kind: "move", to: "title.0", hold: 400 },
      { kind: "select", from: "title.0", to: "title.2" },
      { kind: "move", to: "chart", hold: 1200 },
      { kind: "wait", ms: 1000 },
    ],
  },
];

const P1 =
  "We ship the Coldbrook travel mug on 14 March with a soft launch to newsletter readers, then open orders to everyone the following Thursday. Stock is confirmed for the first 4,000 units.";
const P2 =
  "Photography wraps on Friday. Pricing holds through launch week, with free shipping on two or more mugs.";
const CHECKS = [
  "Final photography",
  "Shipping rates for the EU",
  "Press kit",
  "Launch email",
];
const BARS = [22, 34, 30, 58, 46, 52];

/* -------------------------------- constants ------------------------------- */

type Layout = "wide" | "tall";

/** The board in its two shapes, in board px. */
const BOARD: Record<Layout, { w: number; h: number }> = {
  wide: { w: 960, h: 640 },
  tall: { w: 560, h: 980 },
};

const PLACE: Record<
  Layout,
  Record<
    "title" | "p1" | "p2" | "checks" | "buttons" | "chart" | "note1" | "note2",
    { x: number; y: number; w: number; h?: number; turn?: number }
  >
> = {
  wide: {
    title: { x: 56, y: 44, w: 520 },
    p1: { x: 56, y: 132, w: 520 },
    p2: { x: 56, y: 266, w: 520 },
    checks: { x: 56, y: 350, w: 320 },
    buttons: { x: 56, y: 540, w: 420 },
    chart: { x: 620, y: 48, w: 290, h: 232 },
    note1: { x: 630, y: 330, w: 156, h: 134, turn: -3 },
    note2: { x: 790, y: 372, w: 140, h: 124, turn: 2.5 },
  },
  tall: {
    title: { x: 36, y: 40, w: 488 },
    p1: { x: 36, y: 128, w: 488 },
    p2: { x: 36, y: 284, w: 488 },
    chart: { x: 36, y: 384, w: 488, h: 210 },
    checks: { x: 36, y: 628, w: 270 },
    note1: { x: 330, y: 626, w: 170, h: 124, turn: -2.5 },
    note2: { x: 346, y: 770, w: 150, h: 112, turn: 2 },
    buttons: { x: 36, y: 892, w: 420 },
  },
};

/** How far apart the stream's samples wander from the true path, board px. */
const JITTER = 1.6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A small seeded hash, 0–1. */
const hash = (a: number, b: number) => {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

const first = (name: string) => name.split(/\s+/)[0] ?? name;

/* -------------------------------- timeline -------------------------------- */

type Box = { x: number; y: number; w: number; h: number };
type Key = { t: number; x: number; y: number; move: boolean; arc: number };

type GuestEvent =
  | { t: number; kind: "select"; words: string[] }
  | { t: number; kind: "clear" }
  | { t: number; kind: "say"; text: string }
  | { t: number; kind: "hush" }
  | { t: number; kind: "press"; on: string };

type Timeline = {
  keys: Key[];
  events: GuestEvent[];
  length: number;
  phase: number;
};

/** The anchors of a selection, in reading order, from one word to another. */
const wordRange = (from: string, to: string, anchors: Map<string, Box>) => {
  const [fp, fi] = from.split(".");
  const [, ti] = to.split(".");
  const a = Number(fi);
  const b = Number(ti);
  if (!fp || !Number.isFinite(a) || !Number.isFinite(b)) return [];
  const out: string[] = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i += 1) {
    const id = `${fp}.${i}`;
    if (anchors.has(id)) out.push(id);
  }
  return out;
};

/**
 * Turns a guest's steps into keyframes and events against the measured
 * anchors. Moves take time by distance; a selection walks word by word;
 * the loop ends by gliding back to where it began.
 */
function compile(
  steps: GuestStep[],
  anchors: Map<string, Box>,
  seed: number,
): Timeline {
  const keys: Key[] = [];
  const events: GuestEvent[] = [];
  const centre = (id: string) => {
    const b = anchors.get(id);
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
  };
  let t = 0;
  let x = 0;
  let y = 0;
  let n = 0;
  const glide = (tx: number, ty: number) => {
    const d = Math.hypot(tx - x, ty - y);
    if (d < 0.5) return;
    const dur = clamp((d / 420) * 1000, 260, 1500);
    n += 1;
    const arc = (hash(seed, n) - 0.5) * 2 * Math.min(46, d * 0.14);
    t += dur;
    x = tx;
    y = ty;
    keys.push({ t, x, y, move: true, arc });
  };
  const hold = (ms: number) => {
    if (ms <= 0) return;
    t += ms;
    keys.push({ t, x, y, move: false, arc: 0 });
  };
  const start = steps.find((s) => s.kind === "move" || s.kind === "select");
  const startAt =
    start?.kind === "move"
      ? centre(start.to)
      : start?.kind === "select"
        ? centre(start.from)
        : null;
  x = (startAt?.x ?? 200) + (hash(seed, 99) - 0.5) * 120;
  y = (startAt?.y ?? 200) + 60 + hash(seed, 98) * 60;
  keys.push({ t: 0, x, y, move: false, arc: 0 });
  events.push({ t: 0, kind: "clear" });
  for (const step of steps) {
    if (step.kind === "move") {
      const c = centre(step.to);
      if (!c) continue;
      glide(c.x + (step.dx ?? 0), c.y + (step.dy ?? 0));
      hold(step.hold ?? 400);
    } else if (step.kind === "wait") {
      hold(step.ms);
    } else if (step.kind === "say") {
      events.push({ t, kind: "say", text: step.text });
      hold(step.hold ?? 2200);
      events.push({ t, kind: "hush" });
    } else if (step.kind === "press") {
      const c = centre(step.on);
      if (c) glide(c.x, c.y);
      hold(110);
      events.push({ t, kind: "press", on: step.on });
      hold(280);
    } else if (step.kind === "select") {
      const words = wordRange(step.from, step.to, anchors);
      const firstBox = words[0] ? anchors.get(words[0]) : undefined;
      if (!firstBox) continue;
      events.push({ t, kind: "clear" });
      glide(firstBox.x + 1, firstBox.y + firstBox.h * 0.55);
      hold(160);
      for (let i = 0; i < words.length; i += 1) {
        const id = words[i];
        const b = id ? anchors.get(id) : undefined;
        if (!b) continue;
        // A drag across text runs word by word, quicker than a reach.
        const tx = b.x + b.w;
        const ty = b.y + b.h * 0.55;
        const d = Math.hypot(tx - x, ty - y);
        t += clamp(d * 3.2, 70, 260);
        x = tx;
        y = ty;
        keys.push({ t, x, y, move: true, arc: 0 });
        events.push({ t, kind: "select", words: words.slice(0, i + 1) });
      }
      hold(500);
    }
  }
  const home = keys[0];
  if (home) {
    glide(home.x, home.y);
    hold(300);
  }
  return {
    keys,
    events: events.sort((a, b) => a.t - b.t),
    length: Math.max(1000, t),
    phase: hash(seed, 7) * Math.max(1000, t),
  };
}

const easeMove = (u: number) =>
  u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

/** Where a guest's hand truly is at time tau, and whether it is mid-glide. */
function positionAt(
  tl: Timeline,
  tau: number,
  out: Float64Array,
  jump: boolean,
) {
  const keys = tl.keys;
  let i = 0;
  while (i < keys.length - 1 && (keys[i + 1]?.t ?? Infinity) <= tau) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  if (!a) return;
  if (!b || jump) {
    out[0] = a.x;
    out[1] = a.y;
    return;
  }
  const u = clamp((tau - a.t) / Math.max(1, b.t - a.t), 0, 1);
  if (!b.move) {
    // Holding still, a hand is never quite still.
    out[0] = a.x + Math.sin(tau / 410 + a.t) * 1.2;
    out[1] = a.y + Math.cos(tau / 530 + a.t) * 0.9;
    return;
  }
  const e = easeMove(u);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const bow = Math.sin(Math.PI * e) * b.arc;
  out[0] = a.x + dx * e + (-dy / d) * bow;
  out[1] = a.y + dy * e + (dx / d) * bow;
}

/* --------------------------------- board --------------------------------- */

type BoardState = {
  /** Word anchor → guest colour. */
  marks: Record<string, string>;
  /** Anchor → guest colour, while pressed. */
  pressed: Record<string, string>;
  checks: boolean[];
  approved: boolean;
};

function Words({
  text,
  prefix,
  marks,
}: {
  text: string;
  prefix: string;
  marks: Record<string, string>;
}) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => {
        const id = `${prefix}.${i}`;
        const mark = marks[id];
        return (
          <React.Fragment key={id}>
            <span
              data-anchor={id}
              className="rounded-[2px] transition-colors duration-150"
              style={
                mark
                  ? {
                      backgroundColor: `color-mix(in oklab, ${mark} 26%, transparent)`,
                      boxShadow: `0 1.5px 0 ${mark}`,
                    }
                  : undefined
              }
            >
              {word}
            </span>
            {i < words.length - 1 ? " " : null}
          </React.Fragment>
        );
      })}
    </>
  );
}

/** The shared document: Coldbrook's launch plan, laid out for a wide or a tall view. */
function Board({
  layout,
  title,
  state,
  boardRef,
}: {
  layout: Layout;
  title: string;
  state: BoardState;
  boardRef: (node: HTMLDivElement | null) => void;
}) {
  const at = PLACE[layout];
  const box = (k: keyof (typeof PLACE)["wide"]) => {
    const p = at[k];
    return {
      left: p.x,
      top: p.y,
      width: p.w,
      height: p.h,
      rotate: p.turn ? `${p.turn}deg` : undefined,
    } as React.CSSProperties;
  };
  const press = (id: string) => state.pressed[id];
  return (
    <div
      ref={boardRef}
      className="relative rounded-4 border border-hairline bg-card text-foreground shadow-sm"
      style={{
        width: BOARD[layout].w,
        height: BOARD[layout].h,
        backgroundImage:
          "radial-gradient(circle, var(--hairline-strong) 1px, transparent 1.2px)",
        backgroundSize: "24px 24px",
      }}
    >
      <div className="absolute" style={box("title")}>
        <p className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook · planning
        </p>
        <h3 className="mt-1.5 text-[30px] leading-tight font-semibold tracking-tight">
          <Words text={title} prefix="title" marks={state.marks} />
        </h3>
        <p className="mt-1 text-[13px] text-ink-3">
          Updated this morning · 5 collaborators
        </p>
      </div>
      <p
        className="absolute text-[16px] leading-[1.65] text-ink-2"
        style={box("p1")}
      >
        <Words text={P1} prefix="p1" marks={state.marks} />
      </p>
      <p
        className="absolute text-[16px] leading-[1.65] text-ink-2"
        style={box("p2")}
      >
        <Words text={P2} prefix="p2" marks={state.marks} />
      </p>
      <ul className="absolute flex flex-col gap-2" style={box("checks")}>
        {CHECKS.map((label, i) => {
          const on = state.checks[i] ?? false;
          const by = press(`check${i}`);
          return (
            <li
              key={label}
              className="flex h-8 items-center gap-2.5 text-[15px]"
            >
              <span
                data-anchor={`check${i}`}
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-1 border transition-[background-color,border-color,transform] duration-150",
                  on
                    ? "border-transparent bg-primary"
                    : "border-hairline-strong bg-card",
                  by && "scale-90",
                )}
                style={
                  by
                    ? {
                        boxShadow: `0 0 0 4px color-mix(in oklab, ${by} 30%, transparent)`,
                      }
                    : undefined
                }
              >
                {on ? (
                  <svg
                    viewBox="0 0 12 12"
                    className="size-3 text-primary-foreground"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 6.4 5 8.6 9.5 3.6" />
                  </svg>
                ) : null}
              </span>
              <span
                className={cn(
                  on ? "text-ink-3 line-through" : "text-foreground",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="absolute flex items-center gap-3" style={box("buttons")}>
        <span
          data-anchor="approve"
          className={cn(
            "inline-flex h-10 items-center rounded-2 bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-transform duration-150",
            press("approve") && "translate-y-px scale-[0.97]",
          )}
          style={
            press("approve")
              ? {
                  boxShadow: `0 0 0 5px color-mix(in oklab, ${press("approve")} 28%, transparent)`,
                }
              : undefined
          }
        >
          {state.approved ? "Approved" : "Approve plan"}
        </span>
        <span
          data-anchor="changes"
          className="inline-flex h-10 items-center rounded-2 border border-hairline-strong bg-card px-4 text-[15px] font-medium text-foreground"
        >
          Request changes
        </span>
      </div>
      <div
        data-anchor="chart"
        className="absolute flex flex-col rounded-3 border border-hairline bg-surface-1 p-4"
        style={box("chart")}
      >
        <p className="text-[13px] font-medium text-foreground">
          Pre-orders by week
        </p>
        <p className="text-[12px] text-ink-3">Newsletter readers</p>
        <div className="mt-3 flex flex-1 items-end gap-2.5">
          {BARS.map((v, i) => (
            <div
              key={i}
              className="flex h-full flex-1 flex-col justify-end gap-1"
            >
              <span
                data-anchor={`bar${i}`}
                className="block rounded-t-1 bg-primary"
                style={{ height: `${v}%`, opacity: i === 3 ? 1 : 0.55 }}
              />
              <span className="text-center font-mono text-[10px] text-ink-3">
                W{i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div
        data-anchor="note1"
        className="absolute rounded-1 p-3 text-[14px] leading-snug shadow-md"
        style={{
          ...box("note1"),
          backgroundColor: "oklch(0.93 0.09 95)",
          color: "oklch(0.3 0.04 80)",
        }}
      >
        New mug shot is in the shared folder. Matte finish reads better.
      </div>
      <div
        data-anchor="note2"
        className="absolute rounded-1 p-3 text-[14px] leading-snug shadow-md"
        style={{
          ...box("note2"),
          backgroundColor: "oklch(0.9 0.06 350)",
          color: "oklch(0.32 0.05 350)",
        }}
      >
        Press piece ran in week 4. Ask about a follow-up.
      </div>
    </div>
  );
}

/* --------------------------------- pointer -------------------------------- */

type PointerHandles = { x: MotionValue<number>; y: MotionValue<number> };

function Pointer({
  guest,
  colour,
  handles,
  tagStyle,
  bubble,
  motionSafe,
  following,
  onFollow,
  bindTag,
}: {
  guest: GuestPointer;
  colour: string;
  handles: PointerHandles;
  tagStyle: GuestTagStyle;
  bubble: string | null;
  motionSafe: boolean;
  following: boolean;
  onFollow: (id: string) => void;
  bindTag: (id: string, node: HTMLDivElement | null) => void;
}) {
  // The tag trails the tip a touch, on the snap spring.
  const tagX = useSpring(
    handles.x,
    motionSafe ? springs.snap : { duration: 0 },
  );
  const tagY = useSpring(
    handles.y,
    motionSafe ? springs.snap : { duration: 0 },
  );
  const name = first(guest.name);
  const id = guest.id;
  const tagRef = React.useCallback(
    (node: HTMLDivElement | null) => bindTag(id, node),
    [bindTag, id],
  );
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-20"
        style={{ x: handles.x, y: handles.y }}
      >
        <svg
          viewBox="0 0 16 20"
          className="block h-5 w-4 -translate-x-px -translate-y-px drop-shadow-sm"
        >
          <path
            d="M1 1 L1 16.5 L5.1 12.7 L7.9 19 L10.6 17.8 L7.9 11.6 L13.6 11.6 Z"
            style={{ fill: colour }}
            stroke="white"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </motion.div>
      {/* Near the right edge the tag and bubble hang to the left of the tip. */}
      <motion.div
        ref={tagRef}
        className="group/guest-tag absolute top-0 left-0 z-20 flex flex-col items-start gap-1 data-flip:-translate-x-full data-flip:items-end"
        style={{ x: tagX, y: tagY }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => onFollow(guest.id)}
          title={following ? `Following ${guest.name}` : `Follow ${guest.name}`}
          className={cn(
            "cursor-pointer text-[11px] leading-none font-medium whitespace-nowrap text-white shadow-sm outline-none",
            tagStyle === "pill" &&
              "mt-4 ml-3 flex h-5 items-center rounded-full px-2 group-data-flip/guest-tag:mr-1 group-data-flip/guest-tag:ml-0",
            tagStyle === "flag" &&
              "mt-[15px] ml-[11px] flex h-5 items-center rounded-[2px_8px_8px_8px] px-2 group-data-flip/guest-tag:mr-px group-data-flip/guest-tag:ml-0 group-data-flip/guest-tag:rounded-[8px_2px_8px_8px]",
            tagStyle === "initials" &&
              "mt-4 ml-3 grid size-5 place-items-center rounded-full text-[9px] group-data-flip/guest-tag:mr-1 group-data-flip/guest-tag:ml-0",
            following && "ring-2 ring-white/80",
          )}
          style={{ backgroundColor: colour }}
        >
          {tagStyle === "initials" ? initials(guest.name) : name}
        </button>
        <AnimatePresence>
          {bubble ? (
            <motion.p
              key={bubble}
              aria-hidden
              className="ml-3 w-max max-w-44 rounded-3 rounded-tl-1 px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-md group-data-flip/guest-tag:mr-1 group-data-flip/guest-tag:ml-0 group-data-flip/guest-tag:rounded-tl-3 group-data-flip/guest-tag:rounded-tr-1"
              style={{ backgroundColor: colour, originX: 0, originY: 0 }}
              initial={
                motionSafe ? { opacity: 0, scale: 0.85, y: -4 } : { opacity: 0 }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={
                motionSafe
                  ? springs.snap
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              {bubble}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

/* --------------------------------- engine -------------------------------- */

type Config = {
  ids: string[];
  timelines: Map<string, Timeline>;
  smoothing: number;
  speed: number;
  sampleRate: number;
  following: string | null;
  followZoom: number;
  paused: boolean;
  motionSafe: boolean;
  board: { w: number; h: number };
};

type Follower = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  sample: number;
  ready: boolean;
  last: number;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  wake: () => void;
  dispose: () => void;
};

function createEngine(
  view: HTMLDivElement,
  world: {
    x: MotionValue<number>;
    y: MotionValue<number>;
    scale: MotionValue<number>;
  },
  pointers: Map<string, PointerHandles>,
  tags: Map<string, HTMLDivElement>,
  onEvent: (id: string, ev: GuestEvent) => void,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let clock = 0;
  let disposed = false;
  let vw = view.clientWidth;
  let vh = view.clientHeight;
  const followers = new Map<string, Follower>();
  const cam = { x: 0, y: 0, z: 1, vx: 0, vy: 0, vz: 0, ready: false };
  const at = new Float64Array(2);

  const fit = () => {
    const c = cfg;
    if (!c) return 1;
    return Math.min(vw / c.board.w, vh / c.board.h) * 0.94;
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const ms = dt * 1000 * clamp(c.speed, 0.25, 3);
    const before = clock;
    clock += ms;
    const rate = clamp(c.sampleRate, 2, 60);
    const smooth = clamp(c.smoothing, 0, 1);
    const omega = 64 - 57 * smooth;
    for (const id of c.ids) {
      const tl = c.timelines.get(id);
      if (!tl) continue;
      const tauBefore = (before + tl.phase) % tl.length;
      const tau = (clock + tl.phase) % tl.length;
      // Events between the last frame and this one, across the loop's seam.
      for (const ev of tl.events) {
        const crossed =
          tau >= tauBefore
            ? ev.t > tauBefore && ev.t <= tau
            : ev.t > tauBefore || ev.t <= tau;
        if (crossed && clock > 0) onEvent(id, ev);
      }
      let f = followers.get(id);
      if (!f) {
        positionAt(tl, tau, at, !c.motionSafe);
        f = {
          x: at[0] ?? 0,
          y: at[1] ?? 0,
          vx: 0,
          vy: 0,
          tx: at[0] ?? 0,
          ty: at[1] ?? 0,
          sample: -1,
          ready: true,
          last: 0,
        };
        followers.set(id, f);
      }
      // The network: a new sample a few times a second, a little off the true path.
      const k = Math.floor(((clock + tl.phase) / 1000) * rate);
      if (k !== f.sample) {
        f.sample = k;
        positionAt(tl, tau, at, !c.motionSafe);
        f.tx = (at[0] ?? 0) + (hash(k, id.length * 31) - 0.5) * 2 * JITTER;
        f.ty = (at[1] ?? 0) + (hash(k, id.length * 17 + 3) - 0.5) * 2 * JITTER;
      }
      if (!c.motionSafe || smooth <= 0.001) {
        f.x = f.tx;
        f.y = f.ty;
        f.vx = 0;
        f.vy = 0;
      } else {
        // A critically damped follower between samples: smoothing sets its pace.
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / steps;
        for (let s = 0; s < steps; s += 1) {
          f.vx += (omega * omega * (f.tx - f.x) - 2 * omega * f.vx) * h;
          f.vy += (omega * omega * (f.ty - f.y) - 2 * omega * f.vy) * h;
          f.x += f.vx * h;
          f.y += f.vy * h;
        }
      }
    }

    // The camera: the whole board, or the guest it follows.
    const zFit = fit();
    const target = c.following ? followers.get(c.following) : undefined;
    const tz = target ? Math.max(zFit, clamp(c.followZoom, 0.3, 3)) : zFit;
    let tx = c.board.w / 2;
    let ty = c.board.h / 2;
    if (target) {
      const hw = vw / (2 * tz);
      const hh = vh / (2 * tz);
      tx =
        c.board.w > hw * 2
          ? clamp(target.x, hw, c.board.w - hw)
          : c.board.w / 2;
      ty =
        c.board.h > hh * 2
          ? clamp(target.y, hh, c.board.h - hh)
          : c.board.h / 2;
    }
    if (!cam.ready || !c.motionSafe) {
      cam.x = tx;
      cam.y = ty;
      cam.z = tz;
      cam.vx = cam.vy = cam.vz = 0;
      cam.ready = true;
    } else {
      // The glide spring's stiffness, critically damped: a camera never bounces.
      const w = Math.sqrt(springs.glide.stiffness);
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let s = 0; s < steps; s += 1) {
        cam.vx += (w * w * (tx - cam.x) - 2 * w * cam.vx) * h;
        cam.vy += (w * w * (ty - cam.y) - 2 * w * cam.vy) * h;
        cam.vz += (w * w * (tz - cam.z) - 2 * w * cam.vz) * h;
        cam.x += cam.vx * h;
        cam.y += cam.vy * h;
        cam.z += cam.vz * h;
      }
    }
  };

  const place = () => {
    const c = cfg;
    if (!c) return;
    // The board sits centred in the view by CSS and scales about its own
    // centre; the camera is an offset from there.
    world.scale.set(Math.round(cam.z * 10000) / 10000);
    world.x.set(r2((c.board.w / 2 - cam.x) * cam.z));
    world.y.set(r2((c.board.h / 2 - cam.y) * cam.z));
    for (const id of c.ids) {
      const f = followers.get(id);
      const hd = pointers.get(id);
      if (!f || !hd) continue;
      const sx = (f.x - cam.x) * cam.z + vw / 2;
      hd.x.set(r2(sx));
      hd.y.set(r2((f.y - cam.y) * cam.z + vh / 2));
      const tag = tags.get(id);
      if (tag) {
        // Hysteresis, so a tag on the line does not flicker from side to side.
        const flipped = tag.hasAttribute("data-flip");
        const edge = Math.min(210, vw * 0.45);
        if (!flipped && sx > vw - edge) tag.setAttribute("data-flip", "");
        else if (flipped && sx < vw - edge - 24) {
          tag.removeAttribute("data-flip");
        }
      }
    }
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!c.paused) step(dt);
    else step(0);
    place();
    if (!c.paused) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !cfg)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was || was.timelines !== next.timelines) {
        followers.clear();
      }
      if (!was) {
        vw = view.clientWidth;
        vh = view.clientHeight;
        step(0);
        place();
      }
      kick();
      if (next.paused) {
        step(0);
        place();
      }
    },
    resize() {
      vw = view.clientWidth;
      vh = view.clientHeight;
      step(0);
      place();
      kick();
    },
    wake() {
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/* -------------------------------- component ------------------------------ */

/**
 * A shared document visited by named collaborator pointers replaying recorded
 * paths. Each guest's script — glide to a spot, hover, drag-select a run of
 * words, leave a short chat bubble, tick a box or press a button — is laid
 * against the document's measured anchors, and plays on a loop of its own.
 * Their positions arrive the way a network delivers them, as samples a few
 * times a second; `smoothing` is a critically damped follower between those
 * samples, from jumpy to buttery. Tags trail the tips on springs.snap.
 *
 * Clicking a guest's tag, or their button in the presence bar, follows them:
 * the view zooms into their pointer and pans with them on a glide-stiff,
 * critically damped camera, and the frame takes their colour; Escape or the
 * chip's button goes back to the overview. The board lays itself out wide or
 * tall to suit the view. The document is decoration; the presence bar is the
 * keyboard path (a toolbar with roving focus). Under reduced motion pointers
 * step between the places they stop and the camera cuts instead of panning.
 */
export function GuestPointers({
  guests = defaultGuests,
  count = 3,
  tagStyle = "pill",
  smoothing = 0.6,
  following,
  defaultFollowing = null,
  onFollowingChange,
  speed = 1,
  sampleRate = 12,
  bubbles = true,
  selections = true,
  followZoom = 1,
  title = "Spring launch plan",
  paused = false,
  label = "Shared document",
  className,
}: GuestPointersProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const here = guests.slice(
    0,
    clamp(Math.round(count), 1, Math.max(1, guests.length)),
  );
  const ids = here.map((g) => g.id);
  const colourOf = (id: string) => {
    const i = guests.findIndex((g) => g.id === id);
    const g = guests[i];
    return (
      g?.color ??
      PIGMENTS[Math.max(0, i) % PIGMENTS.length] ??
      PIGMENTS[0] ??
      ""
    );
  };

  const [own, setOwn] = React.useState<string | null>(defaultFollowing);
  const chosen = following === undefined ? own : following;
  const followed = chosen && ids.includes(chosen) ? chosen : null;
  const [said, setSaid] = React.useState({ text: "", n: 0 });
  const [layout, setLayout] = React.useState<Layout>("wide");
  const [anchors, setAnchors] = React.useState<Map<string, Box> | null>(null);
  const [board, setBoard] = React.useState<BoardState>({
    marks: {},
    pressed: {},
    checks: [true, false, false, false],
    approved: false,
  });
  const [bubbleOf, setBubbleOf] = React.useState<Record<string, string | null>>(
    {},
  );
  const [focusIndex, setFocusIndex] = React.useState(0);

  const viewRef = React.useRef<HTMLDivElement | null>(null);
  const boardNode = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const selectionsOf = React.useRef(new Map<string, string[]>());
  const pressTimers = React.useRef<number[]>([]);
  const presence = React.useRef<(HTMLButtonElement | null)[]>([]);

  const worldX = useMotionValue(0);
  const worldY = useMotionValue(0);
  // The first paint, before the view is measured: the board centred, at a
  // scale that suits the large card.
  const worldScale = useMotionValue(0.66);
  const handlesRef = React.useRef(new Map<string, PointerHandles>());
  const tagsRef = React.useRef(new Map<string, HTMLDivElement>());
  const bindTag = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) tagsRef.current.set(id, node);
      else tagsRef.current.delete(id);
    },
    [],
  );
  // One pair of motion values per possible guest, made once.
  const mvA = { x: useMotionValue(-100), y: useMotionValue(-100) };
  const mvB = { x: useMotionValue(-100), y: useMotionValue(-100) };
  const mvC = { x: useMotionValue(-100), y: useMotionValue(-100) };
  const mvD = { x: useMotionValue(-100), y: useMotionValue(-100) };
  const mvE = { x: useMotionValue(-100), y: useMotionValue(-100) };
  const slots = [mvA, mvB, mvC, mvD, mvE];

  const timelines = React.useMemo(() => {
    const map = new Map<string, Timeline>();
    if (!anchors) return map;
    guests.forEach((g, i) => {
      const fallback = defaultGuests[i % defaultGuests.length]?.steps ?? [];
      map.set(g.id, compile(g.steps ?? fallback, anchors, i * 101 + 7));
    });
    return map;
  }, [anchors, guests]);

  const setFollowing = (id: string | null) => {
    if (following === undefined) setOwn(id);
    onFollowingChange?.(id);
    const name = id ? guests.find((g) => g.id === id)?.name : null;
    setSaid((st) => ({
      text: name ? `Following ${name}.` : "Stopped following.",
      n: st.n + 1,
    }));
  };

  const toggleFollow = (id: string) =>
    setFollowing(followed === id ? null : id);

  /** A guest did something on the board: shown through React, a discrete event. */
  const onEvent = React.useCallback(
    (id: string, ev: GuestEvent) => {
      const colour = colourOf(id);
      if (ev.kind === "say") {
        setBubbleOf((b) => ({ ...b, [id]: ev.text }));
      } else if (ev.kind === "hush") {
        setBubbleOf((b) => ({ ...b, [id]: null }));
      } else if (ev.kind === "select" || ev.kind === "clear") {
        const words = ev.kind === "select" ? ev.words : [];
        selectionsOf.current.set(id, words);
        setBoard((b) => {
          const marks: Record<string, string> = {};
          for (const [gid, ws] of selectionsOf.current) {
            for (const w of ws) marks[w] = colourOf(gid);
          }
          return { ...b, marks };
        });
      } else if (ev.kind === "press") {
        setBoard((b) => {
          const next = { ...b, pressed: { ...b.pressed, [ev.on]: colour } };
          const m = /^check(\d)$/.exec(ev.on);
          if (m) {
            const i = Number(m[1]);
            next.checks = b.checks.map((v, k) => (k === i ? !v : v));
          }
          if (ev.on === "approve") next.approved = !b.approved;
          return next;
        });
        pressTimers.current.push(
          window.setTimeout(() => {
            setBoard((b) => {
              const pressed = { ...b.pressed };
              delete pressed[ev.on];
              return { ...b, pressed };
            });
          }, 240),
        );
      }
    },
    // colourOf reads guests only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guests],
  );
  const eventRef = React.useRef(onEvent);
  React.useEffect(() => {
    eventRef.current = onEvent;
  });

  // Register this render's guests against their motion values.
  React.useEffect(() => {
    const map = handlesRef.current;
    map.clear();
    here.forEach((g, i) => {
      const slot = slots[i];
      if (slot) map.set(g.id, slot);
    });
  });

  const config: Config = {
    ids,
    timelines,
    smoothing,
    speed,
    sampleRate,
    following: followed,
    followZoom,
    paused,
    motionSafe,
    board: BOARD[layout],
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const e = createEngine(
      view,
      { x: worldX, y: worldY, scale: worldScale },
      handlesRef.current,
      tagsRef.current,
      (id, ev) => eventRef.current(id, ev),
      visible,
    );
    engine.current = e;
    e.configure(latest.current);
    const timers = pressTimers.current;
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
      for (const t of timers) window.clearTimeout(t);
      timers.length = 0;
    };
  }, [worldScale, worldX, worldY]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /** Measures every anchor in board px: layout boxes, untouched by the zoom. */
  const measure = React.useCallback(() => {
    const root = boardNode.current;
    if (!root) return;
    const map = new Map<string, Box>();
    for (const el of root.querySelectorAll<HTMLElement>("[data-anchor]")) {
      let x = el.offsetLeft;
      let y = el.offsetTop;
      let p = el.offsetParent;
      while (p instanceof HTMLElement && p !== root) {
        x += p.offsetLeft;
        y += p.offsetTop;
        p = p.offsetParent;
      }
      const id = el.dataset.anchor;
      if (id) map.set(id, { x, y, w: el.offsetWidth, h: el.offsetHeight });
    }
    // The same boxes again (fonts settled, nothing moved): keep the timelines.
    setAnchors((was) => {
      if (was && was.size === map.size) {
        let same = true;
        for (const [id, b] of map) {
          const o = was.get(id);
          if (!o || o.x !== b.x || o.y !== b.y || o.w !== b.w || o.h !== b.h) {
            same = false;
            break;
          }
        }
        if (same) return was;
      }
      return map;
    });
  }, []);

  const bindBoard = React.useCallback(
    (node: HTMLDivElement | null) => {
      boardNode.current = node;
      if (!node) return;
      measure();
      let alive = true;
      void document.fonts?.ready.then(() => {
        if (alive) measure();
      });
      return () => {
        alive = false;
      };
    },
    [measure],
  );

  // The board's shape changes with the view's: re-measure once it has.
  React.useEffect(() => {
    measure();
  }, [layout, title, measure]);

  const bindView = React.useCallback((node: HTMLDivElement | null) => {
    viewRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const w = node.clientWidth;
      const h = node.clientHeight;
      if (w > 0 && h > 0) setLayout(h > w * 1.15 ? "tall" : "wide");
      engine.current?.resize();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && followed) {
      event.preventDefault();
      setFollowing(null);
    }
  };

  const onBarKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const n = here.length;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (focusIndex + 1) % n;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (focusIndex - 1 + n) % n;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    presence.current[next]?.focus();
  };

  const followedGuest = followed
    ? guests.find((g) => g.id === followed)
    : undefined;
  const followColour = followed ? colourOf(followed) : null;
  const shownBoard: BoardState = selections ? board : { ...board, marks: {} };

  return (
    <div
      ref={bindView}
      role="region"
      aria-label={label}
      aria-describedby={`${uid}-hint`}
      onKeyDown={onKeyDown}
      className={cn(
        "group/guest-pointers relative isolate h-[520px] w-full overflow-clip rounded-4 border border-hairline bg-surface-2",
        className,
      )}
    >
      <motion.div
        aria-hidden
        inert
        className="absolute top-1/2 left-1/2 select-none"
        style={{
          width: BOARD[layout].w,
          height: BOARD[layout].h,
          marginLeft: -BOARD[layout].w / 2,
          marginTop: -BOARD[layout].h / 2,
          x: worldX,
          y: worldY,
          scale: worldScale,
        }}
      >
        <Board
          layout={layout}
          title={title}
          state={shownBoard}
          boardRef={bindBoard}
        />
      </motion.div>

      {anchors
        ? here.map((g, i) => {
            const slot = slots[i];
            if (!slot) return null;
            return (
              <Pointer
                key={g.id}
                guest={g}
                colour={colourOf(g.id)}
                handles={slot}
                tagStyle={tagStyle}
                bubble={bubbles ? (bubbleOf[g.id] ?? null) : null}
                motionSafe={motionSafe}
                following={followed === g.id}
                onFollow={toggleFollow}
                bindTag={bindTag}
              />
            );
          })
        : null}

      {followColour ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] border-2"
          style={{ borderColor: followColour }}
        />
      ) : null}

      <div
        role="toolbar"
        aria-label="People here"
        onKeyDown={onBarKey}
        className="absolute top-2.5 right-2.5 z-40 flex items-center gap-1.5 rounded-full border border-hairline bg-background/85 py-1 pr-1 pl-2.5 shadow-sm backdrop-blur-sm"
      >
        <span className="font-mono text-[10px] tracking-[0.08em] whitespace-nowrap text-ink-3 uppercase">
          {here.length} here
        </span>
        <span className="flex items-center -space-x-1">
          {here.map((g, i) => {
            const on = followed === g.id;
            return (
              <button
                key={g.id}
                ref={(node) => {
                  presence.current[i] = node;
                }}
                type="button"
                tabIndex={i === focusIndex ? 0 : -1}
                aria-pressed={on}
                aria-label={`Follow ${g.name}`}
                title={g.name}
                onClick={() => {
                  setFocusIndex(i);
                  toggleFollow(g.id);
                }}
                onFocus={() => setFocusIndex(i)}
                className={cn(
                  "relative grid size-6 place-items-center rounded-full border-2 border-background text-[9px] font-semibold text-white transition-transform duration-150 outline-none hover:z-10 hover:-translate-y-px",
                  "focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  on && "z-10 ring-2 ring-foreground/70",
                )}
                style={{ backgroundColor: colourOf(g.id) }}
              >
                {initials(g.name)}
              </button>
            );
          })}
        </span>
      </div>

      <AnimatePresence>
        {followedGuest && followColour ? (
          <motion.div
            key="chip"
            className="absolute bottom-2.5 left-2.5 z-40 flex max-w-[calc(100%-1.25rem)] items-center gap-2 rounded-full py-1 pr-1 pl-3 text-[12px] font-medium text-white shadow-md"
            style={{ backgroundColor: followColour }}
            initial={motionSafe ? { opacity: 0, y: 8 } : { opacity: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
          >
            <span className="truncate">
              Following {first(followedGuest.name)}
            </span>
            <kbd className="hidden rounded-1 bg-white/20 px-1 font-mono text-[10px] leading-4 sm:inline">
              Esc
            </kbd>
            <button
              type="button"
              aria-label={`Stop following ${followedGuest.name}`}
              onClick={() => setFollowing(null)}
              className="grid size-6 shrink-0 place-items-center rounded-full bg-white/20 outline-none hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              <svg
                viewBox="0 0 12 12"
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p id={`${uid}-hint`} className="sr-only">
        A shared document with {here.length} people in it. Use the People here
        toolbar to follow someone; the view moves with them. Escape stops
        following.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
