"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  CheckCheck,
  CopyPlus,
  FolderInput,
  Replace,
  SkipForward,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type NameClashKind = "image" | "doc" | "sheet" | "slides" | "audio";

export type NameClashFile = {
  /** File name with its extension. Both sides of a conflict share it. */
  name: string;
  /** Bytes. */
  size: number;
  /** Last modified, in ms. */
  modified: number;
  /** Who saved it. */
  author: string;
  /** What the thumbnail draws. @default "doc" */
  kind?: NameClashKind;
  /** Varies the drawn thumbnail, so the two sides look like two files. */
  seed?: number;
};

export type NameClashConflict = {
  id: string;
  /** The file already in the folder. */
  existing: NameClashFile;
  /** The file being uploaded. */
  incoming: NameClashFile;
};

export type NameClashAction = "replace" | "keep" | "skip";

export type NameClashResult = {
  id: string;
  action: NameClashAction;
  /** The name the upload ends up with ("" when skipped). */
  name: string;
};

export type NameClashStatus = "ready" | "loading" | "error";
export type NameClashLayout = "pair" | "stacked" | "tilted";

export type NameClashProps = {
  /** The queue: every upload whose name is already taken. @default defaultNameClashConflicts */
  conflicts?: NameClashConflict[];
  /** Controlled action for the current conflict. */
  action?: NameClashAction;
  /** Initial action when uncontrolled. @default "keep" */
  defaultAction?: NameClashAction;
  /** Fires from the click or arrow key that picked an action. */
  onActionChange?: (action: NameClashAction) => void;
  /** Fires once per file as it is settled, with the name the upload ends up with. */
  onResolve?: (
    conflict: NameClashConflict,
    action: NameClashAction,
    name: string,
  ) => void;
  /** Fires when the queue empties, with every decision in order. */
  onDone?: (results: NameClashResult[]) => void;
  /** The close button was pressed: these conflicts are left unsettled. */
  onCancel?: (remaining: NameClashConflict[]) => void;
  /** Whether the two files have been compared. On error, Replace is unavailable. @default "ready" */
  status?: NameClashStatus;
  /** The moment ages count from, in ms — never read from the clock. @default defaultNameClashNow */
  now?: number;
  /** The destination folder, shown under the title. @default "Coldbrook / Brand / Exports" */
  folder?: string;
  /** The name Keep both gives the upload. @default inserts " (2)" before the extension */
  nextName?: (conflict: NameClashConflict) => string;
  /** How the two cards meet: side by side, one above the other, or turned toward each other. @default "pair" */
  cardLayout?: NameClashLayout;
  /** Thumbnail edge in px (capped at 48 on a phone). @default 80 */
  thumbSize?: number;
  /** The chosen action, the upload's edge and Apply, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The panel's heading and accessible name. @default "Name clash" */
  title?: string;
  /** Height of the open panel in px. @default 540 */
  height?: number;
  /** Nothing can be picked or applied. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Friday 9 October 2026, 11:30 UTC — an upload in progress. */
export const defaultNameClashNow = Date.UTC(2026, 9, 9, 11, 30);
const N = defaultNameClashNow;

const file = (
  name: string,
  kind: NameClashKind,
  mb: number,
  ago: number,
  author: string,
  seed: number,
): NameClashFile => ({
  name,
  kind,
  size: Math.round(mb * 1e6),
  modified: N - ago,
  author,
  seed,
});

/** Six of fourteen brand exports clash with files already in the folder. */
export const defaultNameClashConflicts: NameClashConflict[] = [
  {
    id: "nc-menu",
    existing: file("menu-board.png", "image", 2.1, 3 * DAY, "Mara", 3),
    incoming: file("menu-board.png", "image", 3.5, 4 * MIN, "Ines", 8),
  },
  {
    id: "nc-prices",
    existing: file("price-list.xlsx", "sheet", 0.084, 12 * DAY, "Tomas", 2),
    incoming: file("price-list.xlsx", "sheet", 0.091, 5 * MIN, "Ines", 5),
  },
  {
    id: "nc-story",
    existing: file("roastery-story.docx", "doc", 1.2, 2 * HOUR, "Priya", 4),
    incoming: file("roastery-story.docx", "doc", 1.1, 35 * DAY, "Ines", 9),
  },
  {
    id: "nc-deck",
    existing: file("q4-launch-deck.key", "slides", 18.4, 2 * DAY, "Kenji", 1),
    incoming: file("q4-launch-deck.key", "slides", 21.0, 6 * MIN, "Ines", 6),
  },
  {
    id: "nc-sound",
    existing: file("cafe-ambience.wav", "audio", 42.8, 60 * DAY, "Mara", 7),
    incoming: file("cafe-ambience.wav", "audio", 42.8, 7 * MIN, "Ines", 7),
  },
  {
    id: "nc-label",
    existing: file("label-front.png", "image", 0.86, 9 * DAY, "Tomas", 11),
    incoming: file("label-front.png", "image", 1.4, 8 * MIN, "Ines", 14),
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACTIONS: {
  id: NameClashAction;
  label: string;
  short: string;
  Icon: typeof Replace;
}[] = [
  { id: "replace", label: "Replace", short: "Replace", Icon: Replace },
  { id: "keep", label: "Keep both", short: "Keep both", Icon: CopyPlus },
  { id: "skip", label: "Skip", short: "Skip", Icon: SkipForward },
];

const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** The closed panel: one row, so the close can glide to a known height. */
const RECEIPT_H = 64;

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sizeOf(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function sizeDiff(a: number, b: number): string {
  const d = b - a;
  if (Math.abs(d) < 5e3) return "Same size";
  const sign = d > 0 ? "+" : "−";
  return `${sign}${sizeOf(Math.abs(d))}`;
}

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} d ago`;
  if (d < 60) return `${Math.round(d / 7)} wk ago`;
  return `${Math.round(d / 30.4)} mo ago`;
}

const splitName = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? { base: name.slice(0, dot), ext: name.slice(dot) }
    : { base: name, ext: "" };
};

const defaultNextName = (conflict: NameClashConflict) => {
  const { base, ext } = splitName(conflict.incoming.name);
  return `${base} (2)${ext}`;
};

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/* ----------------------------------------------------------------------- */
/*                                Thumbnails                                */
/* ----------------------------------------------------------------------- */

/**
 * A file's face, drawn in code from its kind and seed. Thumbnails are fixed
 * art — a photo looks the same on a light page and a dark one — so the art's
 * colours are literals; the frame around it takes the theme.
 */
function Thumb({
  kind = "doc",
  seed = 1,
  blank,
}: {
  kind?: NameClashKind;
  seed?: number;
  blank?: boolean;
}) {
  const rand = mulberry32(seed * 7919);
  const hue = Math.round(20 + rand() * 300);
  if (blank) return <span className="block size-full bg-surface-2" />;
  let art: React.ReactNode;
  if (kind === "image") {
    const sun = Math.round(18 + rand() * 28);
    const hill = Math.round(36 + rand() * 10);
    art = (
      <>
        <rect width="64" height="64" fill={`oklch(0.78 0.08 ${hue})`} />
        <circle cx={sun} cy="22" r="8" fill="oklch(0.93 0.12 90)" />
        <path
          d={`M0 64 L0 ${hill} Q 20 ${hill - 14} 36 ${hill - 2} T 64 ${hill - 6} L 64 64 Z`}
          fill={`oklch(0.45 0.08 ${(hue + 140) % 360})`}
        />
      </>
    );
  } else if (kind === "sheet") {
    art = (
      <>
        <rect width="64" height="64" fill="oklch(0.98 0.004 120)" />
        <rect width="64" height="10" fill="oklch(0.58 0.12 150)" />
        {[0, 1, 2, 3, 4].map((r) =>
          [0, 1, 2].map((c) => (
            <rect
              key={`${r}-${c}`}
              x={4 + c * 20}
              y={14 + r * 10}
              width={c === 0 ? 16 : Math.round(6 + rand() * 10)}
              height="3"
              rx="1"
              fill="oklch(0.62 0.02 250)"
            />
          )),
        )}
      </>
    );
  } else if (kind === "slides") {
    art = (
      <>
        <rect width="64" height="64" fill={`oklch(0.3 0.05 ${hue})`} />
        <rect
          x="8"
          y="12"
          width="34"
          height="5"
          rx="1"
          fill="oklch(0.96 0.01 90)"
        />
        <rect
          x="8"
          y="21"
          width="22"
          height="3"
          rx="1"
          fill="oklch(0.8 0.02 90)"
        />
        <rect
          x="8"
          y="32"
          width="48"
          height="22"
          rx="2"
          fill={`oklch(0.7 0.12 ${(hue + 60) % 360})`}
        />
      </>
    );
  } else if (kind === "audio") {
    art = (
      <>
        <rect width="64" height="64" fill="oklch(0.24 0.03 270)" />
        {Array.from({ length: 13 }, (_, i) => {
          const h = Math.round(6 + rand() * 30);
          return (
            <rect
              key={i}
              x={6 + i * 4}
              y={32 - h / 2}
              width="2.5"
              height={h}
              rx="1"
              fill={`oklch(0.8 0.12 ${hue})`}
            />
          );
        })}
      </>
    );
  } else {
    art = (
      <>
        <rect width="64" height="64" fill="oklch(0.98 0.004 90)" />
        <rect
          x="8"
          y="9"
          width="30"
          height="5"
          rx="1"
          fill="oklch(0.3 0.02 260)"
        />
        {Array.from({ length: 6 }, (_, i) => (
          <rect
            key={i}
            x="8"
            y={20 + i * 6}
            width={Math.round(30 + rand() * 18)}
            height="2.5"
            rx="1"
            fill="oklch(0.7 0.01 260)"
          />
        ))}
      </>
    );
  }
  return (
    <svg viewBox="0 0 64 64" aria-hidden className="block size-full">
      {art}
    </svg>
  );
}

function RolledCount({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const mv = useMotionValue(value);
  React.useEffect(() => {
    if (!motionSafe) {
      mv.jump(value);
      return;
    }
    const controls = animate(mv, value, springs.snap);
    return () => controls.stop();
  }, [value, motionSafe, mv]);
  const text = useTransform(mv, (v) => String(Math.max(0, Math.round(v))));
  return <motion.span className={className}>{text}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                                  Poses                                   */
/* ----------------------------------------------------------------------- */

type Pose = {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
  zIndex: number;
};

/**
 * Where each card stands for an action. `along` is the axis the two cards
 * meet on; the existing card is first along it. Touching is the resting
 * pose a conflict arrives in; each action then speaks on the cards.
 */
function posesFor(
  action: NameClashAction | "touch",
  layout: NameClashLayout,
  vertical: boolean,
  /** The card's extent along the meeting axis, px. */
  extent: number,
): [Pose, Pose] {
  const tilt = layout === "tilted" && !vertical;
  const lean = tilt ? 4 : 0;
  const at = (offset: number) =>
    vertical ? { x: 0, y: offset } : { x: offset, y: 0 };
  const base = (offset: number, rest: Partial<Pose> = {}): Pose => ({
    ...at(offset),
    scale: 1,
    rotate: 0,
    opacity: 1,
    zIndex: 1,
    ...rest,
  });
  switch (action) {
    case "keep":
      return [
        base(-10 + lean, { rotate: tilt ? -3 : 0 }),
        base(10 - lean, { rotate: tilt ? 3 : 0, zIndex: 2 }),
      ];
    case "replace":
      return [
        base(Math.round(extent * 0.42), {
          scale: 0.92,
          opacity: 0.6,
          zIndex: 0,
        }),
        base(-lean, { rotate: tilt ? 2 : 0, zIndex: 2 }),
      ];
    case "skip":
      return [
        base(lean, { rotate: tilt ? -3 : 0, zIndex: 2 }),
        base(distances.shift, {
          scale: 0.97,
          opacity: 0.45,
          rotate: tilt ? 5 : 0,
        }),
      ];
    default:
      return [
        base(lean, { rotate: tilt ? -3 : 0 }),
        base(-lean, { rotate: tilt ? 3 : 0, zIndex: 2 }),
      ];
  }
}

/* ----------------------------------------------------------------------- */
/*                                 The panel                                */
/* ----------------------------------------------------------------------- */

/**
 * An upload conflict resolver. One clash at a time: the file already in the
 * folder and the one being uploaded, side by side with their thumbnails,
 * sizes, ages and authors, the differences called out. A conflict arrives
 * with its two cards sliding together until they touch, on glide; picking
 * an action previews it on the cards themselves — Replace slides the old
 * card under the new one on glide, Keep both parts them on snap while the
 * upload's name grows its " (2)", Skip sets the upload aside. Apply sinks the
 * pair into the folder on the exit ease and deals the next; Apply to all
 * settles the rest of the queue in a cascade, and an empty queue closes the
 * panel to a one-line receipt.
 *
 * The actions are a radiogroup — arrows pick, and the cards answer — Enter
 * applies from anywhere in the panel and A applies to every remaining
 * conflict; the counter and every decision are announced. Below a 32rem
 * container the cards stack and meet vertically. Under reduced motion
 * nothing slides: the cards hold their places and say what will happen in
 * words and badges.
 */
export function NameClash({
  conflicts = defaultNameClashConflicts,
  action,
  defaultAction = "keep",
  onActionChange,
  onResolve,
  onDone,
  onCancel,
  status = "ready",
  now = defaultNameClashNow,
  folder = "Coldbrook / Brand / Exports",
  nextName = defaultNextName,
  cardLayout = "pair",
  thumbSize = 80,
  accent = "var(--accent-bright)",
  title = "Name clash",
  height = 540,
  disabled = false,
  className,
}: NameClashProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const outcomeId = `${uid}-outcome`;

  const [ownAction, setOwnAction] =
    React.useState<NameClashAction>(defaultAction);
  const picked = action ?? ownAction;
  const effective: NameClashAction =
    status === "error" && picked === "replace" ? "keep" : picked;

  const [results, setResults] = React.useState<NameClashResult[]>([]);
  const [cancelled, setCancelled] = React.useState(false);
  const [settling, setSettling] = React.useState(false);
  /** The conflicts Apply to all settled together, for the chips' cascade. */
  const [batch, setBatch] = React.useState<{
    ids: string[];
    step: number;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const settled = new Set(results.map((r) => r.id));
  const queue = conflicts.filter((c) => !settled.has(c.id));
  const current = settling ? undefined : queue[0];
  const open = !cancelled && (queue.length > 0 || settling);

  /* ---------------------------- measure width ---------------------------- */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState(720);
  React.useEffect(() => {
    if (!root) return;
    const measure = () => setBox(Math.round(root.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);
  const narrow = box < 512;
  const vertical = narrow || cardLayout === "stacked";

  /* -------------------------- arrival choreography ------------------------ */

  // A pair arrives touching; a beat later the picked action speaks.
  const [arrived, setArrived] = React.useState<string | null>(null);
  const currentId = current?.id ?? null;
  React.useEffect(() => {
    if (!currentId) return;
    const t = window.setTimeout(
      () => setArrived(currentId),
      motionSafe ? 420 : 0,
    );
    return () => window.clearTimeout(t);
  }, [currentId, motionSafe]);
  const speaking = arrived === currentId;

  /* ------------------------------- timers ------------------------------- */

  const timers = React.useRef<number[]>([]);
  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  /* ------------------------------- focus -------------------------------- */

  const [receipt, setReceipt] = React.useState<HTMLElement | null>(null);
  const wantReceiptFocus = React.useRef(false);
  React.useEffect(() => {
    if (receipt && wantReceiptFocus.current) {
      wantReceiptFocus.current = false;
      receipt.focus();
    }
  }, [receipt]);

  const radioNodes = React.useRef(new Map<NameClashAction, HTMLElement>());
  const chipStrip = React.useRef<HTMLOListElement | null>(null);
  React.useEffect(() => {
    const strip = chipStrip.current;
    if (!strip || !currentId) return;
    const chip = strip.querySelector<HTMLElement>(
      `[data-nc-chip="${CSS.escape(currentId)}"]`,
    );
    if (!chip) return;
    const left = chip.offsetLeft - strip.clientWidth / 2 + chip.offsetWidth / 2;
    strip.scrollTo({
      left: Math.max(0, left),
      behavior: motionSafe ? "smooth" : "auto",
    });
  }, [currentId, motionSafe]);

  /* ------------------------------ actions ------------------------------- */

  const available = (a: NameClashAction) =>
    !(a === "replace" && status === "error");
  const locked = disabled || status === "loading" || !current;

  const finalName = (c: NameClashConflict, a: NameClashAction) =>
    a === "keep" ? nextName(c) : a === "replace" ? c.incoming.name : "";

  const describe = (c: NameClashConflict, a: NameClashAction) =>
    a === "replace"
      ? `The upload replaces ${c.existing.name} in the folder.`
      : a === "keep"
        ? `The upload is saved as ${nextName(c)}.`
        : `The upload is skipped; the folder keeps its ${c.existing.name}.`;

  const pick = (a: NameClashAction) => {
    if (disabled || !available(a)) return;
    if (action === undefined) setOwnAction(a);
    onActionChange?.(a);
    const label = ACTIONS.find((x) => x.id === a)?.label ?? a;
    if (current) say(`${label}. ${describe(current, a)}`);
  };

  const finish = (all: NameClashResult[]) => {
    wantReceiptFocus.current = true;
    onDone?.(all);
  };

  const apply = () => {
    if (locked || !current) return;
    const a = effective;
    const name = finalName(current, a);
    const next = [...results, { id: current.id, action: a, name }];
    setResults(next);
    onResolve?.(current, a, name);
    const left = queue.length - 1;
    const verb =
      a === "replace" ? "Replaced" : a === "keep" ? "Kept both" : "Skipped";
    say(
      `${verb}: ${a === "keep" ? name : current.incoming.name}. ${
        left === 0 ? "All settled." : `${left} left.`
      }`,
    );
    if (left === 0) finish(next);
  };

  const applyAll = () => {
    if (locked) return;
    const a = effective;
    const added = queue.map((c) => ({
      id: c.id,
      action: a,
      name: finalName(c, a),
    }));
    const next = [...results, ...added];
    // The chips settle in a cascade; the panel closes once the last lands.
    setSettling(true);
    setBatch({ ids: added.map((r) => r.id), step: cascade(added.length) });
    setResults(next);
    queue.forEach((c, i) => {
      const r = added[i];
      if (r) onResolve?.(c, a, r.name);
    });
    const label = ACTIONS.find((x) => x.id === a)?.label.toLowerCase() ?? a;
    say(
      `Applied ${label} to ${plural(added.length, "file", "files")}. All settled.`,
    );
    const wait = motionSafe
      ? Math.round((added.length * cascade(added.length) + 0.5) * 1000)
      : 0;
    timers.current.push(
      window.setTimeout(() => {
        setSettling(false);
        finish(next);
      }, wait),
    );
  };

  const cancel = () => {
    if (disabled) return;
    setCancelled(true);
    wantReceiptFocus.current = true;
    say(
      `Upload cancelled. ${plural(queue.length, "file wasn't", "files weren't")} uploaded.`,
    );
    onCancel?.(queue);
  };

  const onPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    const typing =
      target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA";
    if (typing) return;
    if (event.key === "Enter") {
      // A real button's Enter is its own click; everywhere else Enter applies.
      if (
        target.tagName === "BUTTON" &&
        target.getAttribute("role") !== "radio"
      )
        return;
      event.preventDefault();
      apply();
    } else if (event.key === "a" || event.key === "A") {
      event.preventDefault();
      applyAll();
    }
  };

  const onRadioKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const order = ACTIONS.map((a) => a.id).filter(available);
    const at = order.indexOf(effective);
    let to: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = at + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = at - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = order.length - 1;
    if (to === null) return;
    event.preventDefault();
    const next = order[(to + order.length) % order.length];
    if (!next) return;
    pick(next);
    radioNodes.current.get(next)?.focus();
  };

  /* ------------------------------- render ------------------------------- */

  const thumbStyle = {
    ["--nc-thumb" as string]: `${Math.round(Math.min(160, Math.max(32, thumbSize)))}px`,
  };
  const remaining = queue.length;
  const total = conflicts.length;
  const counts = {
    replace: results.filter((r) => r.action === "replace").length,
    keep: results.filter((r) => r.action === "keep").length,
    skip: results.filter((r) => r.action === "skip").length,
  };
  const thumbPx = Math.round(Math.min(160, Math.max(32, thumbSize)));
  const extent = vertical
    ? (narrow ? Math.min(thumbPx, 48) : thumbPx) + 22
    : Math.min(280, box / 2 - 16);
  const spoken = posesFor(
    speaking ? effective : "touch",
    cardLayout,
    vertical,
    extent,
  );
  // Reduced motion: nothing travels. The cards keep their touching places and
  // the decision is carried by dimming and the badge alone.
  const resting = posesFor("touch", cardLayout, vertical, extent);
  const pose: [Pose, Pose] = motionSafe
    ? spoken
    : [
        { ...spoken[0], x: resting[0].x, y: resting[0].y, scale: 1 },
        { ...spoken[1], x: resting[1].x, y: resting[1].y, scale: 1 },
      ];
  const transformSpring =
    speaking && effective === "keep" ? springs.snap : springs.glide;
  const cardTransition = motionSafe
    ? {
        x: transformSpring,
        y: transformSpring,
        rotate: springs.glide,
        scale: springs.glide,
        opacity: { duration: durations.base, ease: easings.enter },
      }
    : { duration: 0, opacity: { duration: durations.fast } };

  const card = (side: 0 | 1, c: NameClashConflict) => {
    const f = side === 0 ? c.existing : c.incoming;
    const other = side === 0 ? c.incoming : c.existing;
    const { zIndex, ...p } = pose[side];
    const keep = side === 1 && speaking && effective === "keep";
    const { base, ext } = splitName(f.name);
    const renamed = side === 1 ? nextName(c) : f.name;
    const suffix =
      renamed.startsWith(base) && renamed.endsWith(ext)
        ? renamed.slice(base.length, renamed.length - ext.length)
        : "";
    const newer = f.modified > other.modified;
    const badge =
      speaking && side === 0 && effective === "replace"
        ? "Will be replaced"
        : speaking && side === 1 && effective === "skip"
          ? "Won't upload"
          : null;
    const loading = status === "loading";
    return (
      <motion.figure
        key={side}
        aria-label={`${side === 0 ? "In folder" : "Uploading"}: ${keep ? renamed : f.name}, ${sizeOf(f.size)}, modified ${ago(f.modified, now)} by ${f.author}`}
        initial={
          motionSafe
            ? {
                opacity: 0,
                ...(vertical
                  ? { x: 0, y: side === 0 ? -distances.shift : distances.shift }
                  : {
                      y: 0,
                      x: side === 0 ? -distances.shift : distances.shift,
                    }),
              }
            : { opacity: 0 }
        }
        animate={p}
        transition={cardTransition}
        className={cn(
          "relative flex items-center gap-3 rounded-3 border bg-card p-2.5 shadow-[0_6px_20px_color-mix(in_oklab,black_10%,transparent)] @min-[32rem]:p-3",
          vertical ? "w-full max-w-md" : "w-1/2 max-w-[17.5rem]",
          side === 1
            ? "border-[color-mix(in_oklab,var(--nc-accent)_55%,var(--hairline-strong))]"
            : "border-hairline-strong",
        )}
        style={{ zIndex, originX: side === 0 ? 1 : 0, originY: 0.5 }}
      >
        <span
          className="relative size-[min(var(--nc-thumb),3rem)] shrink-0 overflow-clip rounded-2 border border-hairline @min-[32rem]:size-(--nc-thumb)"
          style={thumbStyle}
        >
          <Thumb kind={f.kind} seed={f.seed} blank={loading} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                side === 1 ? "bg-(--nc-accent)" : "bg-ink-3",
              )}
            />
            {side === 0 ? "In folder" : "Uploading"}
          </span>
          <span
            className="block truncate text-[13px] leading-[18px] font-medium text-foreground"
            title={keep ? renamed : f.name}
          >
            {base}
            {side === 1 && suffix ? (
              <motion.span
                aria-hidden
                className="inline-block overflow-clip align-bottom whitespace-pre text-(--nc-accent)"
                initial={false}
                animate={{
                  width: keep ? "auto" : 0,
                  opacity: keep ? 1 : 0,
                }}
                transition={
                  motionSafe
                    ? {
                        width: springs.glide,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: 0 }
                }
              >
                {suffix}
              </motion.span>
            ) : null}
            {ext}
          </span>
          {loading ? (
            <span className="h-2 w-2/3 rounded-full bg-surface-2" />
          ) : (
            <span className="truncate text-[11px] text-ink-2">
              <span className="font-mono tabular-nums">{sizeOf(f.size)}</span>
              {" · "}
              {ago(f.modified, now)}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
              <span
                aria-hidden
                className="flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[9px] font-semibold text-ink-2"
              >
                {f.author.charAt(0)}
              </span>
              <span className="truncate">{f.author}</span>
            </span>
            {side === 1 && !loading ? (
              <>
                <span className="rounded-full bg-surface-2 px-1.5 font-mono text-[10px] leading-4 text-ink-2 tabular-nums">
                  {sizeDiff(other.size, f.size)}
                </span>
                {newer ? (
                  <span className="rounded-full bg-(--nc-wash) px-1.5 text-[10px] leading-4 text-(--nc-accent)">
                    Newer
                  </span>
                ) : (
                  <span className="rounded-full bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] px-1.5 text-[10px] leading-4 text-warn">
                    Older
                  </span>
                )}
              </>
            ) : null}
          </span>
        </span>
        <AnimatePresence initial={false}>
          {badge ? (
            <motion.span
              key={badge}
              className={cn(
                "absolute -top-2.5 rounded-full border bg-popover px-2 text-[10px] leading-5 font-medium shadow-sm",
                side === 0 ? "left-3" : "right-3",
                side === 0
                  ? "border-[color-mix(in_oklab,var(--danger)_40%,transparent)] text-danger"
                  : "border-hairline-strong text-ink-2",
              )}
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              {badge}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.figure>
    );
  };

  const exitDir = effective === "skip" ? -distances.step : distances.step;

  const panel = (
    <>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
            <FolderInput aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{folder}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-hairline bg-surface-1 px-2.5 text-[11px] text-ink-2">
            <RolledCount
              value={remaining}
              motionSafe={motionSafe}
              className="font-mono font-medium text-foreground tabular-nums"
            />
            <span>left</span>
            <span className="hidden text-ink-3 @min-[24rem]:inline">
              of {total}
            </span>
          </span>
          <button
            type="button"
            aria-label="Cancel the remaining uploads"
            onClick={cancel}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </header>

      <ol
        ref={chipStrip}
        aria-label="Queue"
        className="flex shrink-0 [scrollbar-width:none] items-center gap-1.5 overflow-x-auto border-b border-hairline px-4 py-2"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)",
        }}
      >
        {conflicts.map((c, i) => {
          const r = results.find((x) => x.id === c.id);
          const isCurrent = c.id === currentId;
          const Glyph = r ? ACTIONS.find((a) => a.id === r.action)?.Icon : null;
          const inBatch = batch ? batch.ids.indexOf(c.id) : -1;
          const delay = batch && inBatch > 0 ? r3(inBatch * batch.step) : 0;
          return (
            <li
              key={c.id}
              data-nc-chip={c.id}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition-colors duration-200",
                isCurrent
                  ? "border-(--nc-accent) bg-(--nc-wash) text-foreground"
                  : r
                    ? "border-hairline text-ink-3"
                    : "border-hairline text-ink-2",
              )}
            >
              <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                {i + 1}
              </span>
              <span className="max-w-[7.5rem] truncate">{c.incoming.name}</span>
              {r && Glyph ? (
                <motion.span
                  aria-hidden
                  className="inline-flex text-(--nc-accent)"
                  initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={
                    motionSafe
                      ? {
                          scale: { ...springs.flick, delay },
                          opacity: { duration: durations.fast, delay },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <Glyph className="size-3" />
                </motion.span>
              ) : null}
              {r ? (
                <span className="sr-only">
                  {r.action === "replace"
                    ? ", replaced"
                    : r.action === "keep"
                      ? ", kept both"
                      : ", skipped"}
                </span>
              ) : isCurrent ? (
                <span className="sr-only">, now deciding</span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {status === "error" ? (
        <p className="flex shrink-0 items-start gap-2 border-b border-hairline bg-[color-mix(in_oklab,var(--warn)_8%,var(--card))] px-4 py-2 text-[12px] text-ink-2">
          <TriangleAlert
            aria-hidden
            className="mt-0.5 size-3.5 shrink-0 text-warn"
          />
          Couldn&apos;t read the file in the folder. You can still keep both or
          skip.
        </p>
      ) : null}

      <div className="relative flex flex-1 flex-col items-center-safe justify-center-safe gap-3 overflow-x-clip overflow-y-auto px-4 py-4">
        <AnimatePresence mode="wait" initial={false}>
          {current ? (
            <motion.div
              key={current.id}
              className={cn(
                "flex w-full items-center justify-center",
                vertical ? "flex-col gap-0 py-3" : "flex-row",
              )}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      y: exitDir,
                      transition: exitFor(),
                    }
                  : { opacity: 0, transition: { duration: durations.fast } }
              }
            >
              {card(0, current)}
              {card(1, current)}
            </motion.div>
          ) : (
            <motion.p
              key="settling"
              className="text-[12px] text-ink-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Settling the rest…
            </motion.p>
          )}
        </AnimatePresence>
        <p
          id={outcomeId}
          className="max-w-md text-center text-[12px] leading-4 text-ink-2"
        >
          {status === "loading"
            ? "Comparing files…"
            : current
              ? describe(current, effective)
              : " "}
        </p>
      </div>

      <div className="shrink-0 border-t border-hairline px-4 pt-3 pb-3">
        <div
          role="radiogroup"
          aria-label="What to do with the upload"
          aria-describedby={outcomeId}
          className="grid grid-cols-3 gap-1 rounded-3 border border-hairline bg-surface-1 p-1"
        >
          {ACTIONS.map((a) => {
            const on = effective === a.id;
            const ok = available(a.id);
            return (
              <button
                key={a.id}
                ref={(node) => {
                  if (node) radioNodes.current.set(a.id, node);
                  else radioNodes.current.delete(a.id);
                }}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={!ok || disabled || undefined}
                tabIndex={on ? 0 : -1}
                onClick={() => pick(a.id)}
                onKeyDown={onRadioKey}
                className={cn(
                  "relative inline-flex h-9 items-center justify-center gap-1.5 rounded-2 px-1 text-[12px] font-medium transition-colors",
                  on ? "text-foreground" : "text-ink-2 hover:text-foreground",
                  !ok && "cursor-not-allowed opacity-45 hover:text-ink-2",
                  FOCUS_RING,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-pill`}
                    aria-hidden
                    className="absolute inset-0 rounded-2 border border-(--nc-accent) bg-card shadow-sm"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <a.Icon
                  aria-hidden
                  className={cn(
                    "relative hidden size-3.5 shrink-0 @min-[24rem]:block",
                    on && "text-(--nc-accent)",
                  )}
                />
                <span className="relative truncate">{a.short}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-disabled={locked || remaining < 2 || undefined}
            onClick={() => {
              if (remaining >= 2) applyAll();
            }}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-45 aria-disabled:hover:bg-transparent",
              FOCUS_RING,
            )}
          >
            Apply to all {remaining}
            <kbd className="hidden rounded-1 border border-hairline px-1 font-mono text-[10px] text-ink-3 @min-[24rem]:inline">
              A
            </kbd>
          </button>
          <button
            type="button"
            aria-disabled={locked || undefined}
            onClick={apply}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-2 px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 aria-disabled:opacity-45",
              FOCUS_RING,
            )}
            style={{ backgroundColor: "oklch(from var(--nc-accent) 0.52 c h)" }}
          >
            Apply
            <kbd className="hidden rounded-1 border border-white/30 px-1 font-mono text-[10px] text-white/80 @min-[24rem]:inline">
              ↵
            </kbd>
          </button>
        </div>
      </div>
    </>
  );

  const receiptView = (
    <div
      ref={setReceipt}
      tabIndex={-1}
      className="flex h-16 items-center gap-3 px-4 outline-none"
    >
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          cancelled
            ? "bg-surface-2 text-ink-2"
            : "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success",
        )}
      >
        {cancelled ? (
          <X className="size-4" />
        ) : (
          <CheckCheck className="size-4" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-foreground">
          {cancelled
            ? "Upload cancelled"
            : total === 0
              ? "No name clashes"
              : `${plural(results.length, "upload", "uploads")} settled`}
        </span>
        <span className="block truncate text-[11px] text-ink-3">
          {cancelled
            ? `${plural(remaining, "file wasn't", "files weren't")} uploaded.`
            : total === 0
              ? "Every file went straight in."
              : [
                  counts.replace ? `${counts.replace} replaced` : "",
                  counts.keep ? `${counts.keep} kept both` : "",
                  counts.skip ? `${counts.skip} skipped` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
        </span>
      </span>
    </div>
  );

  return (
    <motion.div
      ref={setRoot}
      role="region"
      aria-labelledby={open ? titleId : undefined}
      aria-label={open ? undefined : title}
      onKeyDown={onPanelKeyDown}
      initial={false}
      animate={{ height: open ? height : RECEIPT_H }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        ["--nc-accent" as string]: accent,
        ["--nc-wash" as string]: `color-mix(in oklab, ${accent} 12%, transparent)`,
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div
            key="panel"
            className="flex h-full flex-col"
            exit={{ opacity: 0, transition: exitFor() }}
          >
            {panel}
          </motion.div>
        ) : (
          <motion.div
            key="receipt"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? { y: springs.glide, opacity: { duration: durations.base } }
                : { duration: durations.fast }
            }
          >
            {receiptView}
          </motion.div>
        )}
      </AnimatePresence>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </motion.div>
  );
}
