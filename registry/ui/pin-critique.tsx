"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Check,
  Eye,
  EyeOff,
  MapPinPlus,
  MessagesSquare,
  RotateCcw,
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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CritiquePin = {
  /** Unique within the board. */
  id: string;
  /** Across the artwork: 0 is the left edge, 1 the right. */
  x: number;
  /** Down the artwork: 0 is the top edge, 1 the bottom. */
  y: number;
};

export type CritiqueComment = {
  id: string;
  author: string;
  /** When it was posted, in ms since the epoch. */
  at: number;
  text: string;
};

export type CritiqueThread = {
  id: string;
  /** The pin this thread hangs from. */
  pinId: string;
  resolved?: boolean;
  /** The first comment opens the thread; the rest are replies. */
  comments: CritiqueComment[];
};

export type CritiquePinStyle = "drop" | "disc" | "tab";
export type CritiqueDensity = "compact" | "regular" | "roomy";
export type CritiqueStatus = "ready" | "loading" | "error";

export type PinCritiqueProps = {
  /** Controlled pins. A pin's number is its place in this list. */
  pins?: CritiquePin[];
  /** Initial pins when uncontrolled. @default defaultCritiquePins */
  defaultPins?: CritiquePin[];
  /** Fires with every pin after a drop is posted or a pin is moved. */
  onPinsChange?: (pins: CritiquePin[]) => void;
  /** Controlled threads. */
  threads?: CritiqueThread[];
  /** Initial threads when uncontrolled. @default defaultCritiqueThreads */
  defaultThreads?: CritiqueThread[];
  /** Fires with every thread after a post, a reply or a resolve. */
  onThreadsChange?: (threads: CritiqueThread[]) => void;
  /** Controlled open thread (its id), or null for none. */
  selected?: string | null;
  /** Initial open thread when uncontrolled. @default null */
  defaultSelected?: string | null;
  /** Fires from the pin, card or key that opened or closed a thread. */
  onSelectedChange?: (threadId: string | null) => void;
  /** A dropped pin was posted with its first comment. Both are already in the lists. */
  onPin?: (pin: CritiquePin, thread: CritiqueThread) => void;
  /** A reply was posted on a thread. */
  onReply?: (threadId: string, comment: CritiqueComment) => void;
  /** A thread was resolved (true) or reopened (false). */
  onResolve?: (threadId: string, resolved: boolean) => void;
  /** What is being critiqued: an image or a drawn design that fills its box. @default a drawn Waylight booking screen */
  artwork?: React.ReactNode;
  /** The artwork's accessible name. @default "Waylight booking screen, version 4" */
  artworkLabel?: string;
  /** The artwork's width over its height. @default 0.75 */
  aspect?: number;
  /** A teardrop whose point is the spot, a disc centred on it, or a speech tab whose corner is it. @default "drop" */
  pinStyle?: CritiquePinStyle;
  /** Pin size (22/26/30px), list type and card padding. @default "regular" */
  density?: CritiqueDensity;
  /** Pins, rings, the open card's edge and Post — any CSS colour; pins take its hue at a fixed lightness. @default "var(--accent-bright)" */
  accent?: string;
  /** Controlled: whether resolved pins and threads show. */
  showResolved?: boolean;
  /** Initial when uncontrolled. @default true */
  defaultShowResolved?: boolean;
  /** Fires from the Resolved toggle. */
  onShowResolvedChange?: (show: boolean) => void;
  /** The name new comments are posted under. @default "Noor Haddad" */
  author?: string;
  /** The moment times count from (Date or ms). @default defaultCritiqueNow */
  now?: number | Date;
  /** The board's heading. @default "Booking screen · v4" */
  title?: string;
  /** Whether the board's data has arrived. @default "ready" */
  status?: CritiqueStatus;
  /** "Try again" was pressed after the board failed to load. */
  onRetry?: () => void;
  /** The board's height in px; the canvas fits inside, the threads scroll. @default 540 */
  height?: number;
  /** Play the pop of a pin landing. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: nothing can be dropped, moved, posted or resolved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** A fixed afternoon, so the board renders the same on every machine. */
export const defaultCritiqueNow = Date.UTC(2026, 9, 14, 15, 20);
const N = defaultCritiqueNow;

/** Five pins on the Waylight booking screen, from the avatar to the button. */
export const defaultCritiquePins: CritiquePin[] = [
  { id: "p1", x: 0.893, y: 0.1 },
  { id: "p2", x: 0.5, y: 0.168 },
  { id: "p3", x: 0.71, y: 0.703 },
  { id: "p4", x: 0.137, y: 0.85 },
  { id: "p5", x: 0.9, y: 0.93 },
];

export const defaultCritiqueThreads: CritiqueThread[] = [
  {
    id: "t1",
    pinId: "p1",
    resolved: true,
    comments: [
      {
        id: "c1",
        author: "Kenji Ito",
        at: N - 26 * 60 * MIN,
        text: "The avatar crowds the title on small phones. Could it live in the menu?",
      },
      {
        id: "c1a",
        author: "Noor Haddad",
        at: N - 25 * 60 * MIN,
        text: "Moved in v4. Resolving.",
      },
    ],
  },
  {
    id: "t2",
    pinId: "p2",
    comments: [
      {
        id: "c2",
        author: "Ines Marlow",
        at: N - 3 * 60 * MIN,
        text: "The crop cuts the cabin roof. Anchor the photo lower so the roofline stays in.",
      },
      {
        id: "c2a",
        author: "Tomas Brandt",
        at: N - 2 * 60 * MIN,
        text: "Agreed. Bottom-anchored crops for every listing?",
      },
      {
        id: "c2b",
        author: "Ines Marlow",
        at: N - 95 * MIN,
        text: "Yes, with a 12% safe area at the top.",
      },
    ],
  },
  {
    id: "t3",
    pinId: "p3",
    comments: [
      {
        id: "c3",
        author: "Priya Raman",
        at: N - 48 * MIN,
        text: "Sunday reads as selected but it isn't. The two chip states are too close.",
      },
    ],
  },
  {
    id: "t4",
    pinId: "p4",
    comments: [
      {
        id: "c4",
        author: "Tomas Brandt",
        at: N - 31 * MIN,
        text: "Is $214 per night or the total? Say which beside the number.",
      },
      {
        id: "c4a",
        author: "Priya Raman",
        at: N - 12 * MIN,
        text: "Per night. The total sits under it, but nobody sees it.",
      },
    ],
  },
  {
    id: "t5",
    pinId: "p5",
    comments: [
      {
        id: "c5",
        author: "Kenji Ito",
        at: N - 6 * MIN,
        text: "Reserve sits on the home indicator on tall screens. It needs 16px more room.",
      },
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

/** Below this container width the threads leave the side and open as a sheet. */
const NARROW = 640;
/** Pins stay this far inside the artwork's edges. */
const EDGE = 0.03;
/** Keyboard cursor and nudge steps, as fractions of the artwork. */
const CURSOR_STEP = 0.02;
const NUDGE_STEP = 0.01;
/** Time from the start of the fall to touch-down on the recoil spring. */
const TOUCH_DOWN_MS = 110;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const DENSITY: Record<
  CritiqueDensity,
  { pin: number; text: string; pad: string; gap: string; list: string }
> = {
  compact: {
    pin: 22,
    text: "text-[12px] leading-[18px]",
    pad: "px-2.5 py-2",
    gap: "gap-1.5",
    list: "gap-1.5 p-2",
  },
  regular: {
    pin: 26,
    text: "text-[13px] leading-5",
    pad: "px-3 py-2.5",
    gap: "gap-2",
    list: "gap-2 p-3",
  },
  roomy: {
    pin: 30,
    text: "text-[13px] leading-[22px]",
    pad: "px-3.5 py-3",
    gap: "gap-2.5",
    list: "gap-2.5 p-3",
  },
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${Number((v * 100).toFixed(3))}%`;
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** A sentence-safe excerpt for an accessible name: no doubled full stop. */
const excerpt = (text: string, max = 64) => {
  const t = text.trim();
  const cut = t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
  return cut.replace(/[.!?]$/, "");
};

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** A number whose digits roll toward the direction it moved, on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [seen, setSeen] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (seen !== value) {
    setDir(value > seen ? 1 : -1);
    setSeen(value);
  }
  return (
    <span
      aria-hidden
      className="relative inline-flex h-4 justify-center overflow-clip tabular-nums"
      style={{ width: `${String(value).length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          className="inline-block leading-4"
          variants={{
            enter: (d: number) => ({ opacity: 0, y: motionSafe ? d * 8 : 0 }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? -d * 8 : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Avatar({ name, you }: { name: string; you: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] leading-none font-semibold",
        you
          ? "bg-[color-mix(in_oklab,var(--pc-pin)_16%,transparent)] text-(--pc-ink)"
          : "bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset",
      )}
    >
      {initials(name)}
    </span>
  );
}

/** The pin's number on the list cards: a small chip in the pin's own colour. */
function PinBadge({ n, resolved }: { n: number; resolved: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 font-mono text-[10px] leading-none font-semibold tabular-nums",
        resolved
          ? "bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset"
          : "bg-(--pc-pin) text-white",
      )}
    >
      {resolved ? <Check className="size-3" /> : n}
    </span>
  );
}

/** A textarea that grows with its text, using an invisible twin to size the cell. */
function Composer({
  value,
  label,
  placeholder,
  focusKey,
  onChange,
  onSubmit,
  onCancel,
  textClass,
}: {
  value: string;
  label: string;
  placeholder: string;
  focusKey: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  textClass: string;
}) {
  return (
    <div className="grid rounded-2 border border-hairline-strong bg-surface-1">
      <textarea
        data-pc-focus={focusKey}
        aria-label={label}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          const text = event.currentTarget.value;
          onChange(text);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // Ours: the composer closes, and nothing behind it.
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          } else if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            onSubmit();
          }
        }}
        className={cn(
          "max-h-28 resize-none overflow-y-auto rounded-2 bg-transparent px-2.5 py-1.5 text-foreground [grid-area:1/1] placeholder:text-ink-3",
          textClass,
          FOCUS_RING,
        )}
      />
      <span
        aria-hidden
        className={cn(
          "invisible max-h-28 overflow-hidden px-2.5 py-1.5 break-words whitespace-pre-wrap [grid-area:1/1]",
          textClass,
        )}
      >
        {`${value} `}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Pins                                   */
/* ----------------------------------------------------------------------- */

type Geometry = {
  w: number;
  h: number;
  /** The button's box relative to the spot. */
  left: number;
  top: number;
  /** The head's centre relative to the spot. */
  cx: number;
  cy: number;
  /** Ring radius around the head. */
  ring: number;
};

function geometryOf(
  style: CritiquePinStyle,
  s: number,
  flip: boolean,
): Geometry {
  if (style === "disc") {
    return {
      w: s,
      h: s,
      left: -s / 2,
      top: -s / 2,
      cx: 0,
      cy: 0,
      ring: r1(s * 0.44 + 5),
    };
  }
  if (style === "tab") {
    return {
      w: s,
      h: s,
      left: flip ? -s : 0,
      top: -s,
      cx: flip ? -s / 2 : s / 2,
      cy: -s / 2,
      ring: r1(s * 0.56 + 4),
    };
  }
  const h = Math.round((s * 4) / 3);
  return {
    w: s,
    h,
    left: -s / 2,
    top: -h,
    cx: 0,
    cy: r1(-h + (h * 12) / 32),
    ring: r1(s * 0.375 + 5),
  };
}

const SHAPE: Record<CritiquePinStyle, { box: string; d: string }> = {
  drop: {
    box: "0 0 24 32",
    d: "M12 30.6 C9.2 26.4 3.2 21 3.2 12 a8.8 8.8 0 0 1 17.6 0 c0 9 -6 14.4 -8.8 18.6 Z",
  },
  disc: {
    box: "0 0 24 24",
    d: "M12 1.6 a10.4 10.4 0 1 1 0 20.8 a10.4 10.4 0 1 1 0 -20.8 Z",
  },
  tab: {
    box: "0 0 24 24",
    d: "M1.4 22.6 V7.6 A6.2 6.2 0 0 1 7.6 1.4 H16.4 A6.2 6.2 0 0 1 22.6 7.6 V16.4 A6.2 6.2 0 0 1 16.4 22.6 Z",
  },
};
/** The tab with its sharp corner on the right, for pins near the right edge. */
const TAB_FLIPPED =
  "M22.6 22.6 V7.6 A6.2 6.2 0 0 0 16.4 1.4 H7.6 A6.2 6.2 0 0 0 1.4 7.6 V16.4 A6.2 6.2 0 0 0 7.6 22.6 Z";

type PinMarkerProps = {
  pin: CritiquePin;
  n: number;
  pinStyle: CritiquePinStyle;
  size: number;
  resolved: boolean;
  draft: boolean;
  ringed: boolean;
  pressed: boolean;
  tabbable: boolean;
  /** Increments each time this pin is dropped; the drop plays on change. */
  landing: number;
  motionSafe: boolean;
  disabled: boolean;
  label: string;
  hintId: string;
  boxRef: React.RefObject<HTMLDivElement | null>;
  onActivate: (id: string) => void;
  onRove: (id: string) => void;
  onHover: (id: string | null) => void;
  onMoved: (id: string, x: number, y: number, how: "drag") => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>, id: string) => void;
  onDragLand: () => void;
};

/**
 * One pin. Its spot is a percentage of the artwork, so it never needs
 * measuring; the drag, the fall and the hover lift each live on their own
 * layer of motion values, so none of them fights another.
 */
function PinMarker({
  pin,
  n,
  pinStyle,
  size,
  resolved,
  draft,
  ringed,
  pressed,
  tabbable,
  landing,
  motionSafe,
  disabled,
  label,
  hintId,
  boxRef,
  onActivate,
  onRove,
  onHover,
  onMoved,
  onKey,
  onDragLand,
}: PinMarkerProps) {
  const flip = pinStyle === "tab" && pin.x > 0.8;
  const g = geometryOf(pinStyle, size, flip);
  const shape = SHAPE[pinStyle];
  const d = flip ? TAB_FLIPPED : shape.d;
  const numCy = pinStyle === "drop" ? (g.h * 12) / 32 : g.h / 2;

  const ox = useMotionValue(0);
  const oy = useMotionValue(0);
  const fall = useMotionValue(0);
  const appear = useMotionValue(1);
  const lift = useMotionValue(0);
  const shadowK = useMotionValue(1);
  const numY = useMotionValue(0);
  const numO = useMotionValue(1);
  const shadowOpacity = useTransform(shadowK, (k) => r3(Math.min(1, k)));

  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const prev = React.useRef({ x: pin.x, y: pin.y });
  const pending = React.useRef<{ vx: number; vy: number } | null>(null);
  const settleFrame = React.useRef(0);
  const dragFrom = React.useRef({ x: 0, y: 0, w: 1, h: 1 });

  const stopAll = () => {
    for (const c of runs.current) c.stop();
    runs.current = [];
  };

  // The drop: a short fall onto the spot on recoil, the shadow growing under
  // it, the numeral rolling up into the head just behind the touch-down.
  React.useEffect(() => {
    if (!landing) return;
    const list: AnimationPlaybackControls[] = [];
    if (!motionSafe) {
      fall.jump(0);
      numY.jump(0);
      appear.jump(0);
      shadowK.jump(0);
      numO.jump(0);
      const fade = { duration: durations.fast, ease: easings.enter };
      list.push(
        animate(appear, 1, fade),
        animate(shadowK, 1, fade),
        animate(numO, 1, fade),
      );
    } else {
      fall.jump(-distances.shift);
      appear.jump(0);
      shadowK.jump(0.3);
      numY.jump(Math.round(size * 0.5));
      numO.jump(0);
      list.push(
        animate(fall, 0, springs.recoil),
        animate(appear, 1, { duration: durations.blink, ease: easings.enter }),
        animate(shadowK, 1, { duration: 0.3, ease: easings.enter }),
        animate(numY, 0, { ...springs.snap, delay: 0.09 }),
        animate(numO, 1, {
          duration: durations.fast,
          ease: easings.enter,
          delay: 0.09,
        }),
      );
    }
    return () => {
      for (const c of list) c.stop();
    };
  }, [landing, motionSafe, size, fall, appear, shadowK, numY, numO]);

  // The thread's ring lifts its pin 2px on snap.
  React.useEffect(() => {
    const c = animate(
      lift,
      ringed && motionSafe ? -2 : 0,
      motionSafe ? springs.snap : { duration: 0 },
    );
    return () => c.stop();
  }, [ringed, motionSafe, lift]);

  // Wherever the spot moves to — a drag, a key, the host — the pin glides
  // from where it was seen to where it now is, on snap with any throw.
  React.useLayoutEffect(() => {
    const was = prev.current;
    prev.current = { x: pin.x, y: pin.y };
    if (was.x === pin.x && was.y === pin.y) return;
    const box = boxRef.current;
    const w = box?.offsetWidth ?? 0;
    const h = box?.offsetHeight ?? 0;
    const throwV = pending.current ?? { vx: 0, vy: 0 };
    pending.current = null;
    cancelAnimationFrame(settleFrame.current);
    stopAll();
    ox.jump(r1(ox.get() + (was.x - pin.x) * w));
    oy.jump(r1(oy.get() + (was.y - pin.y) * h));
    if (!motionSafe) {
      ox.jump(0);
      oy.jump(0);
      return;
    }
    runs.current = [
      animate(ox, 0, { ...springs.snap, velocity: throwV.vx }),
      animate(oy, 0, { ...springs.snap, velocity: throwV.vy }),
    ];
  }, [pin.x, pin.y, motionSafe, boxRef, ox, oy]);

  React.useEffect(
    () => () => {
      for (const c of runs.current) c.stop();
      cancelAnimationFrame(settleFrame.current);
    },
    [],
  );

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || draft,
    onStart: () => {
      stopAll();
      const box = boxRef.current;
      dragFrom.current = {
        x: ox.get(),
        y: oy.get(),
        w: box?.offsetWidth ?? 1,
        h: box?.offsetHeight ?? 1,
      };
    },
    onMove: ({ offset }) => {
      const f = dragFrom.current;
      // The spot stays on the artwork: past its edge the pin rubber-bands.
      const minX = (EDGE - pin.x) * f.w;
      const maxX = (1 - EDGE - pin.x) * f.w;
      const minY = (EDGE - pin.y) * f.h;
      const maxY = (1 - EDGE - pin.y) * f.h;
      const rx = f.x + offset.x;
      const ry = f.y + offset.y;
      ox.set(
        r1(
          rx < minX
            ? minX + rubberband(rx - minX, 80)
            : rx > maxX
              ? maxX + rubberband(rx - maxX, 80)
              : rx,
        ),
      );
      oy.set(
        r1(
          ry < minY
            ? minY + rubberband(ry - minY, 80)
            : ry > maxY
              ? maxY + rubberband(ry - maxY, 80)
              : ry,
        ),
      );
    },
    onEnd: ({ velocity }) => {
      const f = dragFrom.current;
      const landX = project(ox.get(), velocity.x, 0.99);
      const landY = project(oy.get(), velocity.y, 0.99);
      const x = r3(clamp(pin.x + landX / f.w, EDGE, 1 - EDGE));
      const y = r3(clamp(pin.y + landY / f.h, EDGE, 1 - EDGE));
      onDragLand();
      if (x === pin.x && y === pin.y) {
        runs.current = [
          animate(ox, 0, { ...springs.snap, velocity: velocity.x }),
          animate(oy, 0, { ...springs.snap, velocity: velocity.y }),
        ];
        return;
      }
      pending.current = { vx: velocity.x, vy: velocity.y };
      onMoved(pin.id, x, y, "drag");
      // A host that refuses the move gets the pin back where it was.
      settleFrame.current = requestAnimationFrame(() => {
        if (!pending.current) return;
        pending.current = null;
        runs.current = [
          animate(ox, 0, springs.snap),
          animate(oy, 0, springs.snap),
        ];
      });
    },
    onCancel: () => {
      runs.current = [
        animate(ox, 0, springs.snap),
        animate(oy, 0, springs.snap),
      ];
    },
    onTap: () => onActivate(pin.id),
  });

  return (
    <div
      data-pc-pin={pin.id}
      className="pointer-events-none absolute"
      style={{
        left: pct(pin.x),
        top: pct(pin.y),
        zIndex: pressed || draft ? 3 : 2,
      }}
    >
      <motion.div style={{ x: ox, y: oy }}>
        <motion.span
          aria-hidden
          className="absolute rounded-full bg-[color-mix(in_oklab,black_32%,transparent)] blur-[1.5px]"
          style={{
            width: Math.round(size * 0.62),
            height: Math.round(size * 0.2),
            left:
              -Math.round(size * 0.31) +
              (pinStyle === "tab" ? (flip ? -2 : 2) : 0),
            top:
              pinStyle === "disc"
                ? Math.round(size * 0.36)
                : -Math.round(size * 0.08),
            scaleX: shadowK,
            opacity: shadowOpacity,
          }}
        />
        <motion.div style={{ y: lift }}>
          <motion.div style={{ y: fall, opacity: appear }}>
            <svg
              aria-hidden
              className="pointer-events-none absolute -rotate-90 overflow-visible"
              width={g.ring * 2 + 4}
              height={g.ring * 2 + 4}
              style={{
                left: r1(g.cx - g.ring - 2),
                top: r1(g.cy - g.ring - 2),
              }}
            >
              <motion.circle
                cx={g.ring + 2}
                cy={g.ring + 2}
                r={g.ring}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                className="stroke-(--pc-pin)"
                initial={false}
                animate={{
                  pathLength: ringed ? 1 : motionSafe ? 0 : 1,
                  opacity: ringed ? 1 : 0,
                }}
                transition={
                  motionSafe
                    ? {
                        pathLength: springs.glide,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              />
            </svg>
            <button
              type="button"
              data-pc-focus={`pin:${pin.id}`}
              aria-label={label}
              aria-describedby={hintId}
              aria-pressed={draft ? undefined : pressed}
              tabIndex={tabbable ? 0 : -1}
              onClick={(event) => {
                // Pointer presses arrive through the drag's tap; a click with
                // no pointer behind it (Enter, Space) is a press too.
                if (event.detail === 0) onActivate(pin.id);
              }}
              onFocus={() => onRove(pin.id)}
              onKeyDown={(event) => onKey(event, pin.id)}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") onHover(pin.id);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") onHover(null);
              }}
              {...drag}
              className={cn(
                "pointer-events-auto absolute touch-none select-none",
                pinStyle === "disc" ? "rounded-full" : "rounded-2",
                disabled || draft
                  ? "cursor-default"
                  : "cursor-grab active:cursor-grabbing",
                FOCUS_RING,
              )}
              style={{
                left: g.left,
                top: g.top,
                width: g.w,
                height: g.h,
                opacity: resolved ? 0.38 : 1,
                transition: "opacity 240ms cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              <svg
                aria-hidden
                viewBox={shape.box}
                width={g.w}
                height={g.h}
                className="block overflow-visible"
              >
                <path
                  d={d}
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                  strokeDasharray={draft ? "2.4 2" : undefined}
                  className={cn(
                    draft
                      ? "fill-[color-mix(in_oklab,var(--pc-pin)_78%,var(--card))] stroke-(--pc-pin)"
                      : resolved
                        ? "fill-ink-3 stroke-card"
                        : "fill-(--pc-pin) stroke-card",
                  )}
                />
              </svg>
              <span
                aria-hidden
                className="absolute inset-x-0 grid place-items-center overflow-clip font-mono leading-none font-semibold text-white tabular-nums"
                style={{
                  top: r1(numCy - size * 0.32),
                  height: r1(size * 0.64),
                  fontSize: Math.round(size * 0.44),
                }}
              >
                <AnimatePresence initial={false}>
                  {resolved ? (
                    <motion.span
                      key="done"
                      className="[grid-area:1/1]"
                      initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? {
                              scale: springs.flick,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      <Check
                        strokeWidth={3}
                        style={{
                          width: Math.round(size * 0.42),
                          height: Math.round(size * 0.42),
                        }}
                      />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="n"
                      className="[grid-area:1/1]"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{ duration: durations.fast }}
                    >
                      <motion.span
                        className="inline-block"
                        style={{ y: numY, opacity: numO }}
                      >
                        {n}
                      </motion.span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The artwork                                */
/* ----------------------------------------------------------------------- */

/**
 * The default subject: a booking screen for an invented travel product,
 * drawn from tokens so it sits in either theme. Its faults are the ones the
 * default threads point at — the cut roofline, the near-selected Sunday, the
 * price without a unit, the button on the home indicator.
 */
function WaylightScreen({ idBase }: { idBase: string }) {
  const brand = "oklch(from var(--signal) 0.58 0.1 h)";
  const clip = `${idBase}-hero`;
  const sky = `${idBase}-sky`;
  return (
    <svg
      aria-hidden
      viewBox="0 0 300 400"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <defs>
        <clipPath id={clip}>
          <rect x="14" y="60" width="272" height="140" rx="14" />
        </clipPath>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0"
            style={{
              stopColor: "color-mix(in oklab, var(--signal) 30%, var(--bg-1))",
            }}
          />
          <stop
            offset="1"
            style={{
              stopColor: "color-mix(in oklab, var(--warn) 22%, var(--bg-1))",
            }}
          />
        </linearGradient>
      </defs>
      <rect width="300" height="400" className="fill-surface-1" />
      <text
        x="18"
        y="19"
        fontSize="10"
        fontWeight="600"
        className="fill-foreground"
      >
        9:41
      </text>
      <rect
        x="250"
        y="11"
        width="16"
        height="8"
        rx="2"
        className="fill-ink-3"
      />
      <rect
        x="270"
        y="11"
        width="12"
        height="8"
        rx="2"
        className="fill-ink-3"
      />
      <path
        d="M22 34 l-6 6 6 6"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-foreground"
      />
      <text
        x="150"
        y="44"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        className="fill-foreground"
      >
        Stay details
      </text>
      <circle
        cx="268"
        cy="40"
        r="10"
        className="fill-surface-2 stroke-hairline-strong"
      />
      <text
        x="268"
        y="43"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        className="fill-ink-2"
      >
        NH
      </text>

      <g clipPath={`url(#${clip})`}>
        <rect x="14" y="60" width="272" height="140" fill={`url(#${sky})`} />
        <circle
          cx="236"
          cy="92"
          r="14"
          style={{ fill: "color-mix(in oklab, var(--warn) 55%, var(--bg-1))" }}
        />
        <path
          d="M14 168 C 70 140 120 150 170 158 S 250 140 286 150 V 200 H 14 Z"
          style={{ fill: "oklch(from var(--signal) 0.68 0.08 h)" }}
        />
        <path
          d="M14 184 C 80 168 150 178 200 176 S 260 168 286 172 V 200 H 14 Z"
          style={{ fill: brand }}
        />
        <rect
          x="124"
          y="108"
          width="52"
          height="46"
          style={{ fill: "oklch(from var(--warn) 0.66 0.11 h)" }}
        />
        <path
          d="M114 112 L150 54 L186 112 Z"
          style={{ fill: "oklch(from var(--danger) 0.48 0.12 h)" }}
        />
        <rect
          x="134"
          y="120"
          width="12"
          height="12"
          rx="1.5"
          className="fill-surface-1"
        />
        <rect
          x="154"
          y="128"
          width="12"
          height="26"
          rx="1.5"
          className="fill-surface-1"
        />
      </g>
      <rect
        x="14.5"
        y="60.5"
        width="271"
        height="139"
        rx="13.5"
        fill="none"
        className="stroke-hairline"
      />

      <text
        x="16"
        y="228"
        fontSize="15"
        fontWeight="650"
        className="fill-foreground"
      >
        Harbour cabin, two nights
      </text>
      <text x="16" y="246" fontSize="10.5" className="fill-ink-3">
        Coldbrook Bay · sleeps 4
      </text>
      <text
        x="284"
        y="246"
        fontSize="10.5"
        textAnchor="end"
        className="fill-ink-2"
      >
        4.9 · 128 reviews
      </text>

      <text
        x="16"
        y="272"
        fontSize="8.5"
        fontWeight="600"
        letterSpacing="0.8"
        className="fill-ink-3"
      >
        DATES
      </text>
      {[
        { x: 14, label: "Fri 16", on: true },
        { x: 84, label: "Sat 17", on: true },
        { x: 154, label: "Sun 18", on: false },
      ].map((chip) => (
        <g key={chip.label}>
          <rect
            x={chip.x}
            y="278"
            width="64"
            height="24"
            rx="12"
            style={{
              fill: chip.on
                ? brand
                : `color-mix(in oklab, ${brand} 76%, var(--bg-1))`,
            }}
          />
          <text
            x={chip.x + 32}
            y="294"
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            className="fill-white"
          >
            {chip.label}
          </text>
        </g>
      ))}
      <rect
        x="224.5"
        y="278.5"
        width="61"
        height="23"
        rx="11.5"
        fill="none"
        className="stroke-hairline-strong"
      />
      <text
        x="255"
        y="294"
        textAnchor="middle"
        fontSize="10"
        className="fill-ink-2"
      >
        More
      </text>

      <rect x="14" y="316" width="272" height="1" className="fill-hairline" />
      <text
        x="16"
        y="350"
        fontSize="21"
        fontWeight="700"
        className="fill-foreground"
      >
        $214
      </text>
      <text x="16" y="366" fontSize="9.5" className="fill-ink-3">
        $428 total · 2 nights
      </text>
      <rect
        x="164"
        y="330"
        width="122"
        height="40"
        rx="12"
        style={{ fill: brand }}
      />
      <text
        x="225"
        y="354"
        textAnchor="middle"
        fontSize="13"
        fontWeight="650"
        className="fill-white"
      >
        Reserve
      </text>
      <rect
        x="110"
        y="386"
        width="80"
        height="4"
        rx="2"
        className="fill-foreground"
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The board                                */
/* ----------------------------------------------------------------------- */

type Draft = { pin: CritiquePin; text: string };

/**
 * A design critique board. Numbered pins sit on an artwork and each starts a
 * thread in the column beside it. Clicking the artwork, or pressing P, drops
 * a pin at the cursor: it falls 16px onto its spot and lands on recoil — two
 * small bounces — while its ground shadow grows under it, and its numeral
 * rolls up into the head on snap just behind the touch-down, where the pop
 * is heard. The composer opens for the first comment; posting makes the pin
 * real and fires `onPin`.
 *
 * Hovering or focusing a thread draws a ring around its pin, its pathLength
 * drawing on glide while the pin lifts 2px on snap. Pins drag 1:1 and settle
 * on snap with the throw; Alt with an arrow nudges the focused one.
 * Resolving fades a pin and swaps its numeral for a check, and the Resolved
 * toggle hides them. Below a 40rem container the threads leave the side and
 * open as a sheet that rises on glide and follows a downward drag.
 *
 * Pins are one roving tab stop (arrow keys move by number, Home and End
 * jump); Shift with an arrow moves the drop cursor; Escape cancels a draft,
 * closes the sheet or the open thread. Under reduced motion pins appear on
 * their spot without falling, the ring appears whole and the sheet fades —
 * every count, check and state still changes.
 */
export function PinCritique({
  pins,
  defaultPins,
  onPinsChange,
  threads,
  defaultThreads,
  onThreadsChange,
  selected,
  defaultSelected = null,
  onSelectedChange,
  onPin,
  onReply,
  onResolve,
  artwork,
  artworkLabel = "Waylight booking screen, version 4",
  aspect = 0.75,
  pinStyle = "drop",
  density = "regular",
  accent = "var(--accent-bright)",
  showResolved,
  defaultShowResolved = true,
  onShowResolvedChange,
  author = "Noor Haddad",
  now = defaultCritiqueNow,
  title = "Booking screen · v4",
  status = "ready",
  onRetry,
  height = 540,
  sound = false,
  disabled = false,
  className,
}: PinCritiqueProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const sheetTitleId = `${uid}-sheet`;
  const nowMs = toMs(now);
  const ready = status === "ready";
  const locked = disabled || !ready;
  const dens = DENSITY[density] ?? DENSITY.regular;
  const ratio = Number(clamp(aspect, 0.2, 5).toFixed(4));

  /* ------------------------------- state -------------------------------- */

  const [ownPins, setOwnPins] = React.useState<CritiquePin[]>(
    () => defaultPins ?? defaultCritiquePins,
  );
  const pinList = pins ?? ownPins;
  const [ownThreads, setOwnThreads] = React.useState<CritiqueThread[]>(
    () => defaultThreads ?? defaultCritiqueThreads,
  );
  const threadList = threads ?? ownThreads;
  const [ownSelected, setOwnSelected] = React.useState<string | null>(
    defaultSelected,
  );
  const sel = selected !== undefined ? selected : ownSelected;
  const [ownShow, setOwnShow] = React.useState(defaultShowResolved);
  const showRes = showResolved ?? ownShow;

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [drops, setDrops] = React.useState<Record<string, number>>({});
  const [hotPin, setHotPin] = React.useState<string | null>(null);
  const [rove, setRove] = React.useState<string | null>(null);
  const [narrow, setNarrow] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [replies, setReplies] = React.useState<Record<string, string>>({});
  const [fresh, setFresh] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [cursorShown, setCursorShown] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  // Focus requests are state, so they land with the commit that made their
  // target — never with a stale commit's effects flushed ahead of it.
  const [focusAsk, setFocusAsk] = React.useState<{
    key: string;
    n: number;
  } | null>(null);
  const ask = (key: string) =>
    setFocusAsk((f) => ({ key, n: (f?.n ?? 0) + 1 }));

  // Threads that arrive after a skeleton cascade in; the first paint is still.
  const [arrival, setArrival] = React.useState({ status, n: 0 });
  if (arrival.status !== status) {
    setArrival({
      status,
      n: ready && arrival.status === "loading" ? arrival.n + 1 : arrival.n,
    });
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLOListElement | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const counter = React.useRef(0);
  const timers = React.useRef(new Set<number>());
  const pointerIn = React.useRef(false);
  const scrollRun = React.useRef<AnimationPlaybackControls | null>(null);

  const cx = useMotionValue(0.5);
  const cy = useMotionValue(0.5);
  const cursorLeft = useTransform(cx, pct);
  const cursorTop = useTransform(cy, pct);

  const sheetY = useMotionValue(0);
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const sheetTimer = React.useRef(0);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const groupRef = React.useRef<HTMLDivElement | null>(null);
  const panY = useMotionValue(0);

  /* ------------------------------ derived ------------------------------- */

  const threadByPin = React.useMemo(() => {
    const map = new Map<string, CritiqueThread>();
    for (const t of threadList) map.set(t.pinId, t);
    return map;
  }, [threadList]);
  const numberOf = React.useMemo(() => {
    const map = new Map<string, number>();
    pinList.forEach((p, i) => map.set(p.id, i + 1));
    return map;
  }, [pinList]);
  const pinIds = new Set(pinList.map((p) => p.id));
  const liveThreads = threadList.filter((t) => pinIds.has(t.pinId));
  const openThreads = liveThreads
    .filter((t) => !t.resolved)
    .sort(
      (a, b) => (numberOf.get(a.pinId) ?? 0) - (numberOf.get(b.pinId) ?? 0),
    );
  const doneThreads = liveThreads
    .filter((t) => t.resolved)
    .sort(
      (a, b) => (numberOf.get(a.pinId) ?? 0) - (numberOf.get(b.pinId) ?? 0),
    );
  const isResolvedPin = (id: string) => !!threadByPin.get(id)?.resolved;
  const shownPins = pinList.filter((p) => showRes || !isResolvedPin(p.id));
  const draftN = pinList.length + 1;
  const selThread = threadList.find((t) => t.id === sel) ?? null;
  const selPin = selThread?.pinId ?? null;
  const focusable = draft ? [...shownPins, draft.pin] : shownPins;
  const roving =
    rove && focusable.some((p) => p.id === rove)
      ? rove
      : ((selPin && focusable.some((p) => p.id === selPin) ? selPin : null) ??
        focusable[0]?.id ??
        null);

  /* ------------------------------ effects ------------------------------- */

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      setNarrow(root.clientWidth < NARROW);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const pendingTimers = timers.current;
    return () => {
      for (const t of pendingTimers) window.clearTimeout(t);
      pendingTimers.clear();
      window.clearTimeout(sheetTimer.current);
      scrollRun.current?.stop();
    };
  }, []);

  // A wide board has no sheet: one left open when the box grew is closed.
  if (!narrow && sheetOpen) setSheetOpen(false);

  // Focus requests made by a handler land once their target has committed.
  React.useEffect(() => {
    if (!focusAsk) return;
    const node = rootRef.current?.querySelector<HTMLElement>(
      `[data-pc-focus="${CSS.escape(focusAsk.key)}"]`,
    );
    if (!node) return;
    node.focus({ preventScroll: true });
    if (node instanceof HTMLTextAreaElement) {
      const end = node.value.length;
      node.setSelectionRange(end, end);
    }
  }, [focusAsk]);

  // The open card glides into view in its list.
  React.useEffect(() => {
    const list = listRef.current;
    if (!sel || !list) return;
    const scroller = list.parentElement;
    const card = list.querySelector<HTMLElement>(
      `[data-pc-card="${CSS.escape(sel)}"]`,
    );
    if (!scroller || !card) return;
    const top = card.offsetTop - 8;
    const bottom = card.offsetTop + Math.min(card.offsetHeight, 220) + 8;
    const view = scroller.scrollTop;
    const target =
      top < view
        ? top
        : bottom > view + scroller.clientHeight
          ? bottom - scroller.clientHeight
          : null;
    if (target === null) return;
    scrollRun.current?.stop();
    const to = Math.max(0, Math.round(target));
    if (!motionSafe) {
      scroller.scrollTop = to;
      return;
    }
    scrollRun.current = animate(scroller.scrollTop, to, {
      ...springs.glide,
      onUpdate: (v) => {
        scroller.scrollTop = Math.round(v);
      },
    });
  }, [sel, sheetOpen, motionSafe]);

  // P drops a pin wherever the pointer rests on the artwork, even before the
  // board has focus — but never while someone types elsewhere.
  const api = React.useRef<{ drop: () => void }>({ drop: () => {} });
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!pointerIn.current || event.defaultPrevented) return;
      if (event.key !== "p" && event.key !== "P") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const t = event.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable || t.closest("input, textarea, select"))
      ) {
        return;
      }
      if (rootRef.current?.contains(t as Node | null)) return;
      event.preventDefault();
      api.current.drop();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // On a narrow board the sheet would cover the pin it is about: the
  // artwork glides up until the pin's head clears the sheet's edge.
  const panPin =
    narrow && sheetOpen
      ? (draft?.pin ?? pinList.find((p) => p.id === selPin) ?? null)
      : null;
  const panSpot = panPin ? panPin.y : null;
  React.useEffect(() => {
    const sheetEl = sheetRef.current;
    let run: AnimationPlaybackControls | null = null;
    const place = () => {
      const area = canvasRef.current;
      const group = groupRef.current;
      let to = 0;
      if (panSpot !== null && area && group && sheetEl) {
        const spot = group.offsetTop + panSpot * group.offsetHeight;
        const room = area.clientHeight - sheetEl.offsetHeight;
        const head = Math.round(dens.pin * 1.5) + 6;
        to = Math.round(clamp(room - 14 - spot, head - spot, 0));
      }
      if (Math.abs(panY.get() - to) < 0.5) return;
      run?.stop();
      if (!motionSafe) {
        panY.jump(to);
        return;
      }
      run = animate(panY, to, springs.glide);
    };
    place();
    const ro = sheetEl ? new ResizeObserver(place) : null;
    if (sheetEl) ro?.observe(sheetEl);
    return () => {
      ro?.disconnect();
      run?.stop();
    };
  }, [panSpot, sheetOpen, narrow, motionSafe, dens.pin, panY]);

  /* ------------------------------ actions ------------------------------- */

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const newId = (kind: string) => {
    const taken = new Set([
      ...pinList.map((p) => p.id),
      ...threadList.map((t) => t.id),
      ...threadList.flatMap((t) => t.comments.map((c) => c.id)),
    ]);
    let id = "";
    do {
      counter.current += 1;
      id = `${idBase}-${kind}${counter.current}`;
    } while (taken.has(id));
    return id;
  };

  const writePins = (next: CritiquePin[]) => {
    if (pins === undefined) setOwnPins(next);
    onPinsChange?.(next);
  };
  const writeThreads = (next: CritiqueThread[]) => {
    if (threads === undefined) setOwnThreads(next);
    onThreadsChange?.(next);
  };

  const openSheet = (from?: HTMLElement | null, focusKey?: string) => {
    if (from) opener.current = from;
    else if (document.activeElement instanceof HTMLElement) {
      opener.current = document.activeElement;
    }
    sheetY.jump(0);
    ask(focusKey ?? (sel ? `card:${sel}` : "sheet-close"));
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    const back = opener.current;
    opener.current = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
  };

  const select = (threadId: string | null) => {
    if (threadId === sel) return;
    if (selected === undefined) setOwnSelected(threadId);
    onSelectedChange?.(threadId);
  };

  const activatePin = (pinId: string) => {
    if (!ready) return;
    if (draft?.pin.id === pinId) {
      if (narrow && !sheetOpen) openSheet(null, "draft");
      else ask("draft");
      return;
    }
    const thread = threadByPin.get(pinId);
    const n = numberOf.get(pinId) ?? 0;
    setRove(pinId);
    if (!thread) return;
    if (thread.id === sel && !(narrow && !sheetOpen)) {
      select(null);
      say(`Pin ${n} closed.`);
      return;
    }
    select(thread.id);
    if (narrow) {
      openSheet(null, `card:${thread.id}`);
    }
    say(
      `Pin ${n}, ${plural(thread.comments.length, "comment", "comments")}${thread.resolved ? ", resolved" : ""}.`,
    );
  };

  const dropAt = (x: number, y: number) => {
    if (locked) return;
    const px = r3(clamp(x, EDGE, 1 - EDGE));
    const py = r3(clamp(y, EDGE, 1 - EDGE));
    const id = newId("pin");
    setDraft((d) => ({ pin: { id, x: px, y: py }, text: d?.text ?? "" }));
    setDrops((d) => ({ ...d, [id]: (d[id] ?? 0) + 1 }));
    setRove(id);
    select(null);
    window.clearTimeout(sheetTimer.current);
    if (narrow && !sheetOpen) {
      // The sheet rises once the pin has landed, so the drop is seen first.
      sheetTimer.current = window.setTimeout(
        () => openSheet(null, "draft"),
        motionSafe ? 260 : 0,
      );
    } else {
      ask("draft");
    }
    // Heard at touch-down, pitched by the pin's number.
    later(
      () =>
        audio.play("pop", {
          pitch: r3(0.92 + (draftN % 7) * 0.05),
          gain: 0.55,
        }),
      motionSafe ? TOUCH_DOWN_MS : 0,
    );
    say(`Pin ${draftN} dropped. Say what you see.`);
  };

  React.useEffect(() => {
    api.current = { drop: () => dropAt(cx.get(), cy.get()) };
  });

  const cancelDraft = () => {
    if (!draft) return;
    window.clearTimeout(sheetTimer.current);
    const id = draft.pin.id;
    setDraft(null);
    setDrops((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    say("Pin removed.");
    if (narrow && sheetOpen) closeSheet();
    else ask("drop");
  };

  const postDraft = () => {
    if (!draft || locked) return;
    const text = draft.text.trim();
    if (!text) {
      say("Write what you see before posting.");
      return;
    }
    const pin = draft.pin;
    const thread: CritiqueThread = {
      id: newId("thread"),
      pinId: pin.id,
      comments: [{ id: newId("c"), author, at: nowMs, text }],
    };
    writePins([...pinList, pin]);
    writeThreads([...threadList, thread]);
    setDraft(null);
    setFresh((f) => new Set(f).add(thread.id));
    select(thread.id);
    ask(`card:${thread.id}`);
    say(`Pin ${draftN} posted.`);
    onPin?.(pin, thread);
  };

  const postReply = (thread: CritiqueThread) => {
    if (locked) return;
    const text = (replies[thread.id] ?? "").trim();
    if (!text) return;
    const comment: CritiqueComment = {
      id: newId("c"),
      author,
      at: nowMs,
      text,
    };
    writeThreads(
      threadList.map((t) =>
        t.id === thread.id ? { ...t, comments: [...t.comments, comment] } : t,
      ),
    );
    setReplies((r) => ({ ...r, [thread.id]: "" }));
    setFresh((f) => new Set(f).add(comment.id));
    say(`Reply posted on pin ${numberOf.get(thread.pinId) ?? ""}.`);
    onReply?.(thread.id, comment);
  };

  const toggleResolved = (thread: CritiqueThread) => {
    if (locked) return;
    const next = !thread.resolved;
    writeThreads(
      threadList.map((t) =>
        t.id === thread.id ? { ...t, resolved: next } : t,
      ),
    );
    const n = numberOf.get(thread.pinId) ?? 0;
    audio.play("pop", { pitch: next ? 0.72 : 1.1, gain: 0.32 });
    say(next ? `Pin ${n} resolved.` : `Pin ${n} reopened.`);
    ask(`card:${thread.id}`);
    onResolve?.(thread.id, next);
  };

  const movePin = (id: string, x: number, y: number) => {
    if (locked) return;
    writePins(pinList.map((p) => (p.id === id ? { ...p, x, y } : p)));
    const n = numberOf.get(id) ?? 0;
    say(
      `Pin ${n} moved to ${Math.round(x * 100)}% across, ${Math.round(y * 100)}% down.`,
    );
  };

  const setShow = (on: boolean) => {
    if (showResolved === undefined) setOwnShow(on);
    onShowResolvedChange?.(on);
    say(on ? "Resolved pins shown." : "Resolved pins hidden.");
    if (!on && selThread?.resolved) select(null);
  };

  const moveCursor = (dx: number, dy: number) => {
    const x = r3(clamp(cx.get() + dx, EDGE, 1 - EDGE));
    const y = r3(clamp(cy.get() + dy, EDGE, 1 - EDGE));
    cx.set(x);
    cy.set(y);
    setCursorShown(true);
    say(`Cursor ${Math.round(x * 100)}% across, ${Math.round(y * 100)}% down.`);
  };

  const pointToFraction = (clientX: number, clientY: number) => {
    const box = boxRef.current;
    if (!box) return null;
    const r = box.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return {
      x: r3(clamp((clientX - r.left) / r.width, 0, 1)),
      y: r3(clamp((clientY - r.top) / r.height, 0, 1)),
    };
  };

  const ARROW: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };

  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const t = event.target;
    if (t instanceof HTMLElement && t.closest("textarea, input")) return;
    const arrow = ARROW[event.key];
    if (
      ready &&
      !disabled &&
      (event.key === "p" || event.key === "P") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      dropAt(cx.get(), cy.get());
      return;
    }
    if (arrow && event.shiftKey && !event.altKey && ready && !disabled) {
      event.preventDefault();
      moveCursor(arrow[0] * CURSOR_STEP, arrow[1] * CURSOR_STEP);
      return;
    }
    if (event.key === "Escape") {
      if (draft) {
        event.preventDefault();
        cancelDraft();
      } else if (sheetOpen) {
        event.preventDefault();
        closeSheet();
      } else if (sel) {
        event.preventDefault();
        select(null);
        say("Thread closed.");
      }
    }
  };

  const focusPin = (id: string) => {
    setRove(id);
    ask(`pin:${id}`);
  };

  const onPinKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const arrow = ARROW[event.key];
    const order = focusable.map((p) => p.id);
    const at = order.indexOf(id);
    if (arrow && event.altKey && !event.shiftKey) {
      event.preventDefault();
      if (locked || draft?.pin.id === id) return;
      const pin = pinList.find((p) => p.id === id);
      if (!pin) return;
      movePin(
        id,
        r3(clamp(pin.x + arrow[0] * NUDGE_STEP, EDGE, 1 - EDGE)),
        r3(clamp(pin.y + arrow[1] * NUDGE_STEP, EDGE, 1 - EDGE)),
      );
      return;
    }
    if (arrow && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      const step = arrow[0] + arrow[1] > 0 ? 1 : -1;
      const next = order[(at + step + order.length) % order.length];
      if (next) focusPin(next);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? order[0] : order[order.length - 1];
      if (next) focusPin(next);
    }
  };

  /* ------------------------------- render ------------------------------- */

  const pinLabel = (pin: CritiquePin, n: number) => {
    if (draft?.pin.id === pin.id) return `Pin ${n}, new, not posted yet`;
    const thread = threadByPin.get(pin.id);
    const first = thread?.comments[0];
    if (!thread || !first) return `Pin ${n}`;
    const more = thread.comments.length - 1;
    return `Pin ${n}, ${first.author}: ${excerpt(first.text)}${more > 0 ? `, ${plural(more, "reply", "replies")}` : ""}, ${thread.resolved ? "resolved" : "open"}`;
  };

  const cardStep = cascade(openThreads.length + doneThreads.length);

  const renderCard = (thread: CritiqueThread, index: number) => {
    const n = numberOf.get(thread.pinId) ?? 0;
    const first = thread.comments[0];
    const rest = thread.comments.slice(1);
    const open = sel === thread.id;
    const hot = hotPin === thread.pinId;
    const isFresh = fresh.has(thread.id);
    const arriving = arrival.n > 0;
    const replyText = replies[thread.id] ?? "";
    const bodyId = `${uid}-body-${thread.id}`;
    return (
      <motion.li
        key={thread.id}
        data-pc-card={thread.id}
        layout={motionSafe ? "position" : false}
        initial={
          isFresh || arriving
            ? { opacity: 0, y: motionSafe ? distances.step : 0 }
            : false
        }
        animate={{ opacity: 1, y: 0 }}
        transition={{
          layout: springs.glide,
          y: motionSafe
            ? {
                ...springs.glide,
                delay: arriving && !isFresh ? index * cardStep : 0,
              }
            : { duration: 0 },
          opacity: {
            duration: durations.base,
            ease: easings.enter,
            delay: arriving && !isFresh ? index * cardStep : 0,
          },
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setHotPin(thread.pinId);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") {
            setHotPin((h) => (h === thread.pinId ? null : h));
          }
        }}
        onFocus={() => setHotPin(thread.pinId)}
        onBlur={(event) => {
          const to = event.relatedTarget;
          if (!(to instanceof Node && event.currentTarget.contains(to))) {
            setHotPin((h) => (h === thread.pinId ? null : h));
          }
        }}
        className={cn(
          "relative overflow-clip rounded-3 border transition-colors",
          open
            ? "border-[color-mix(in_oklab,var(--pc-pin)_45%,transparent)] bg-surface-1"
            : hot
              ? "border-hairline-strong bg-surface-1"
              : "border-hairline bg-card",
          thread.resolved && !open && "opacity-70",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-0.5 transition-colors",
            open ? "bg-(--pc-pin)" : "bg-transparent",
          )}
        />
        <button
          type="button"
          data-pc-focus={`card:${thread.id}`}
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => {
            if (open) {
              select(null);
              say(`Pin ${n} closed.`);
            } else {
              select(thread.id);
              setRove(thread.pinId);
              say(`Pin ${n} open.`);
            }
          }}
          className={cn(
            "flex w-full flex-col text-left",
            dens.pad,
            dens.gap,
            FOCUS_IN,
            "rounded-3",
          )}
        >
          <span className="flex w-full min-w-0 items-center gap-2">
            <PinBadge n={n} resolved={!!thread.resolved} />
            <span
              title={first?.author}
              className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground"
            >
              {first?.author ?? "Unknown"}
            </span>
            <span className="shrink-0 text-[11px] text-ink-3">
              {first ? ago(first.at, nowMs) : ""}
            </span>
          </span>
          <span
            className={cn("text-ink-2", dens.text, open ? "" : "line-clamp-2")}
          >
            {first?.text ?? ""}
          </span>
          {!open && rest.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
              <MessagesSquare aria-hidden className="size-3.5 shrink-0" />
              {plural(rest.length, "reply", "replies")}
            </span>
          ) : null}
        </button>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="body"
              id={bodyId}
              className="overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.fast }
              }
            >
              <div
                className={cn(
                  "flex flex-col border-t border-hairline",
                  dens.pad,
                  dens.gap,
                )}
              >
                {rest.length > 0 ? (
                  <ol role="list" className={cn("flex flex-col", dens.gap)}>
                    {rest.map((c) => (
                      <motion.li
                        key={c.id}
                        className="flex gap-2"
                        initial={
                          fresh.has(c.id)
                            ? {
                                opacity: 0,
                                y: motionSafe ? distances.nudge : 0,
                              }
                            : false
                        }
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          motionSafe
                            ? {
                                y: springs.snap,
                                opacity: { duration: durations.fast },
                              }
                            : { duration: durations.fast }
                        }
                      >
                        <Avatar name={c.author} you={c.author === author} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-baseline gap-1.5">
                            <span
                              title={c.author}
                              className="truncate text-[12px] font-medium text-foreground"
                            >
                              {c.author}
                            </span>
                            <span className="shrink-0 text-[11px] text-ink-3">
                              {ago(c.at, nowMs)}
                            </span>
                          </p>
                          <p
                            className={cn("break-words text-ink-2", dens.text)}
                          >
                            {c.text}
                          </p>
                        </div>
                      </motion.li>
                    ))}
                  </ol>
                ) : null}
                {!thread.resolved && !locked ? (
                  <div className="flex flex-col gap-1.5">
                    <Composer
                      value={replyText}
                      label={`Reply on pin ${n}`}
                      placeholder="Reply"
                      focusKey={`reply:${thread.id}`}
                      textClass={dens.text}
                      onChange={(text) =>
                        setReplies((r) => ({ ...r, [thread.id]: text }))
                      }
                      onSubmit={() => postReply(thread)}
                      onCancel={() => {
                        setReplies((r) => ({ ...r, [thread.id]: "" }));
                        ask(`card:${thread.id}`);
                      }}
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {!thread.resolved && !locked ? (
                    <button
                      type="button"
                      aria-disabled={!replyText.trim() || undefined}
                      onClick={() => postReply(thread)}
                      className={cn(
                        "inline-flex h-7 items-center rounded-2 px-2.5 text-[12px] font-medium text-white transition-opacity aria-disabled:opacity-45",
                        "bg-(--pc-button)",
                        FOCUS_RING,
                      )}
                    >
                      Reply
                    </button>
                  ) : null}
                  {!locked ? (
                    <button
                      type="button"
                      onClick={() => toggleResolved(thread)}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      {thread.resolved ? (
                        <RotateCcw aria-hidden className="size-3.5 shrink-0" />
                      ) : (
                        <Check aria-hidden className="size-3.5 shrink-0" />
                      )}
                      {thread.resolved ? "Reopen" : "Resolve"}
                    </button>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.li>
    );
  };

  const draftCard = draft ? (
    <motion.li
      key="draft"
      layout={motionSafe ? "position" : false}
      initial={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              y: springs.snap,
              opacity: { duration: durations.fast },
              layout: springs.glide,
            }
          : { duration: durations.fast }
      }
      className={cn(
        "flex flex-col rounded-3 border border-dashed border-[color-mix(in_oklab,var(--pc-pin)_55%,transparent)] bg-surface-1",
        dens.pad,
        dens.gap,
      )}
    >
      <p className="flex items-center gap-2 text-[12px] font-medium text-foreground">
        <PinBadge n={draftN} resolved={false} />
        New pin
        <span className="ml-auto text-[11px] font-normal text-ink-3">
          {Math.round(draft.pin.x * 100)}%, {Math.round(draft.pin.y * 100)}%
        </span>
      </p>
      <Composer
        value={draft.text}
        label={`What you see at pin ${draftN}`}
        placeholder="Say what you see"
        focusKey="draft"
        textClass={dens.text}
        onChange={(text) => setDraft((d) => (d ? { ...d, text } : d))}
        onSubmit={postDraft}
        onCancel={cancelDraft}
      />
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={cancelDraft}
          className={cn(
            "inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          aria-disabled={!draft.text.trim() || undefined}
          onClick={postDraft}
          className={cn(
            "inline-flex h-7 items-center rounded-2 bg-(--pc-button) px-2.5 text-[12px] font-medium text-white transition-opacity aria-disabled:opacity-45",
            FOCUS_RING,
          )}
        >
          Post
        </button>
      </div>
    </motion.li>
  ) : null;

  const listBody = () => {
    if (status === "loading") {
      return (
        <div aria-hidden className={cn("flex flex-col", dens.list)}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-3 border border-hairline p-3"
            >
              <span className="h-2.5 w-24 rounded-full bg-surface-2" />
              <span className="h-2.5 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
              <span className="h-2.5 w-2/3 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      );
    }
    if (status === "error") return null;
    const nothing =
      !draft && openThreads.length === 0 && doneThreads.length === 0;
    return (
      <ol
        ref={listRef}
        role="list"
        aria-label="Threads"
        className={cn("relative flex flex-col", dens.list)}
      >
        {draftCard}
        {openThreads.map((t, i) => renderCard(t, i))}
        {showRes && doneThreads.length > 0 ? (
          <li
            key="resolved-label"
            aria-hidden
            className="px-1 pt-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Resolved · {doneThreads.length}
          </li>
        ) : null}
        {showRes
          ? doneThreads.map((t, i) => renderCard(t, openThreads.length + i))
          : null}
        {nothing ? (
          <li className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <MapPinPlus aria-hidden className="size-5 text-ink-3" />
            <p className="text-[13px] text-ink-2">
              {disabled
                ? "No pins on this design."
                : "No pins yet. Click the design or press P to drop one."}
            </p>
          </li>
        ) : null}
      </ol>
    );
  };

  const sheetDrag = useDrag({
    axis: "y",
    threshold: 3,
    onMove: ({ offset }) => {
      sheetY.set(r1(offset.y < 0 ? rubberband(offset.y, 120) : offset.y));
    },
    onEnd: ({ velocity }) => {
      const h = sheetRef.current?.offsetHeight ?? 300;
      const landing = project(sheetY.get(), velocity.y, 0.99);
      if (landing > h / 3) {
        closeSheet();
      } else {
        animate(sheetY, 0, { ...springs.glide, velocity: velocity.y });
      }
    },
    onCancel: () => {
      animate(sheetY, 0, springs.glide);
    },
  });

  const pigment = `oklch(from ${accent} 0.6 c h)`;
  const openCount = openThreads.length;
  const doneCount = doneThreads.length;
  const cardStyle: React.CSSProperties = {
    width: `min(calc(100cqw - 32px), calc((100cqh - 32px) * ${ratio}))`,
    aspectRatio: String(ratio),
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      onKeyDown={onRootKeyDown}
      onBlur={(event) => {
        const to = event.relatedTarget;
        if (to instanceof Node && event.currentTarget.contains(to)) return;
        if (!pointerIn.current) setCursorShown(false);
      }}
      className={cn(
        "@container/pin-critique relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-80",
        className,
      )}
      style={{
        height,
        ["--pc-pin" as string]: pigment,
        ["--pc-ink" as string]:
          "color-mix(in oklab, var(--pc-pin) 70%, var(--foreground))",
        ["--pc-button" as string]: `oklch(from ${accent} 0.52 c h)`,
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-[7rem] flex-1">
          <p
            id={titleId}
            title={title}
            className="truncate text-sm font-semibold"
          >
            {title}
          </p>
          <p className="flex items-center gap-1 text-[11px] text-ink-3">
            {ready ? (
              <>
                <span className="font-medium text-ink-2">
                  <Rolling value={openCount} motionSafe={motionSafe} />
                </span>
                <span aria-hidden>open · {doneCount} resolved</span>
                <span className="sr-only">
                  {`${openCount} open, ${doneCount} resolved`}
                </span>
              </>
            ) : status === "loading" ? (
              "Loading pins"
            ) : (
              "Pins unavailable"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-pc-focus="drop"
            disabled={locked}
            aria-keyshortcuts="P"
            aria-describedby={hintId}
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible")) {
                setCursorShown(true);
              }
            }}
            onBlur={() => {
              if (!pointerIn.current) setCursorShown(false);
            }}
            onClick={() => dropAt(cx.get(), cy.get())}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50",
              FOCUS_RING,
            )}
          >
            <MapPinPlus aria-hidden className="size-3.5 shrink-0" />
            Pin
            <kbd
              aria-hidden
              className="hidden rounded-1 border border-hairline px-1 font-mono text-[10px] leading-4 text-ink-3 @min-[40rem]/pin-critique:inline"
            >
              P
            </kbd>
          </button>
          <button
            type="button"
            aria-pressed={showRes}
            aria-label="Resolved"
            title={showRes ? "Hide resolved" : "Show resolved"}
            disabled={!ready}
            onClick={() => setShow(!showRes)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
              FOCUS_RING,
            )}
          >
            {showRes ? (
              <Eye aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <EyeOff aria-hidden className="size-3.5 shrink-0" />
            )}
            <span
              aria-hidden
              className="hidden @min-[30rem]/pin-critique:inline"
            >
              Resolved
            </span>
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            disabled={!ready}
            onClick={(event) =>
              sheetOpen ? closeSheet() : openSheet(event.currentTarget)
            }
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 @min-[40rem]/pin-critique:hidden",
              FOCUS_RING,
            )}
          >
            <MessagesSquare aria-hidden className="size-3.5 shrink-0" />
            Threads
            <span className="font-mono text-[11px] text-ink-3 tabular-nums">
              {openCount}
            </span>
          </button>
        </div>
      </header>

      <p id={hintId} className="sr-only">
        P drops a pin at the cursor. Shift with an arrow moves the cursor. Arrow
        keys move between pins, Alt with an arrow moves the focused pin, Enter
        opens its thread.
      </p>

      <div className="relative flex flex-1 overflow-hidden">
        <div
          ref={canvasRef}
          className="relative min-w-0 flex-1 overflow-hidden"
          style={{
            containerType: "size",
            backgroundColor: "var(--bg-0)",
            backgroundImage:
              "radial-gradient(color-mix(in oklab, var(--ink-3) 30%, transparent) 1px, transparent 1.4px)",
            backgroundSize: "16px 16px",
          }}
        >
          <div className="absolute inset-0 flex items-center-safe justify-center-safe">
            {status === "error" ? (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <TriangleAlert aria-hidden className="size-5 text-danger" />
                <p className="text-sm text-foreground">
                  This design didn&apos;t load.
                </p>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Try again
                  </button>
                ) : null}
              </div>
            ) : (
              <motion.div
                ref={groupRef}
                role="group"
                aria-label={artworkLabel}
                className="relative"
                style={{ ...cardStyle, y: panY }}
                onPointerMove={(event) => {
                  if (event.pointerType === "touch") return;
                  const f = pointToFraction(event.clientX, event.clientY);
                  if (!f) return;
                  cx.set(f.x);
                  cy.set(f.y);
                }}
                onPointerEnter={(event) => {
                  if (event.pointerType === "touch") return;
                  pointerIn.current = true;
                  setCursorShown(true);
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === "touch") return;
                  pointerIn.current = false;
                  setCursorShown(false);
                }}
              >
                <div
                  ref={boxRef}
                  onClick={(event) => {
                    if (locked) return;
                    const f = pointToFraction(event.clientX, event.clientY);
                    if (f) dropAt(f.x, f.y);
                  }}
                  className={cn(
                    "absolute inset-0 overflow-clip rounded-3 border border-hairline-strong bg-surface-1 shadow-[0_10px_30px_color-mix(in_oklab,black_14%,transparent)]",
                    locked ? "cursor-default" : "cursor-crosshair",
                    status === "loading" && "motion-safe:animate-pulse",
                  )}
                >
                  {status === "loading" ? (
                    <div aria-hidden className="size-full bg-surface-2" />
                  ) : (
                    (artwork ?? <WaylightScreen idBase={idBase} />)
                  )}
                </div>

                {cursorShown && !locked ? (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute z-[4] size-0"
                    style={{ left: cursorLeft, top: cursorTop }}
                  >
                    <span className="absolute -top-2.5 -left-2.5 size-5 rounded-full border-[1.5px] border-(--pc-pin) bg-[color-mix(in_oklab,var(--pc-pin)_12%,transparent)]" />
                    <span className="absolute -top-px -left-[5px] h-0.5 w-2.5 rounded-full bg-(--pc-pin)" />
                    <span className="absolute -top-[5px] -left-px h-2.5 w-0.5 rounded-full bg-(--pc-pin)" />
                  </motion.span>
                ) : null}

                {ready ? (
                  <AnimatePresence initial={false}>
                    {[...shownPins, ...(draft ? [draft.pin] : [])].map(
                      (pin) => {
                        const isDraft = draft?.pin.id === pin.id;
                        const n = isDraft
                          ? draftN
                          : (numberOf.get(pin.id) ?? 0);
                        const thread = threadByPin.get(pin.id);
                        return (
                          <motion.div
                            key={pin.id}
                            className="pointer-events-none absolute inset-0"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{
                              opacity: 0,
                              y: motionSafe ? -distances.step : 0,
                              transition: exitFor(),
                            }}
                            transition={{ duration: durations.fast }}
                          >
                            <PinMarker
                              pin={pin}
                              n={n}
                              pinStyle={pinStyle}
                              size={dens.pin}
                              resolved={!!thread?.resolved && !isDraft}
                              draft={isDraft}
                              ringed={
                                !isDraft &&
                                (hotPin === pin.id || selPin === pin.id)
                              }
                              pressed={selPin === pin.id}
                              tabbable={roving === pin.id}
                              landing={drops[pin.id] ?? 0}
                              motionSafe={motionSafe}
                              disabled={locked}
                              label={pinLabel(pin, n)}
                              hintId={hintId}
                              boxRef={boxRef}
                              onActivate={activatePin}
                              onRove={setRove}
                              onHover={(id) => setHotPin(id)}
                              onMoved={movePin}
                              onKey={onPinKey}
                              onDragLand={() =>
                                audio.play("pop", { pitch: 0.86, gain: 0.3 })
                              }
                            />
                          </motion.div>
                        );
                      },
                    )}
                  </AnimatePresence>
                ) : null}

                {ready && pinList.length === 0 && !draft && !locked ? (
                  <p className="pointer-events-none absolute inset-x-3 bottom-3 z-[1] rounded-2 bg-[color-mix(in_oklab,var(--card)_88%,transparent)] px-2.5 py-1.5 text-center text-[12px] text-ink-2">
                    Click the design or press P to drop a pin
                  </p>
                ) : null}
              </motion.div>
            )}
          </div>
        </div>

        {!narrow ? (
          <aside
            aria-label="Threads"
            className="hidden w-62 shrink-0 flex-col border-l border-hairline bg-surface-0/40 @min-[40rem]/pin-critique:flex @min-[70rem]/pin-critique:w-75"
          >
            <motion.div
              layoutScroll
              className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
            >
              {listBody()}
            </motion.div>
          </aside>
        ) : null}

        <AnimatePresence>
          {narrow && sheetOpen ? (
            <motion.div
              key="sheet"
              ref={sheetRef}
              role="dialog"
              aria-modal="false"
              aria-labelledby={sheetTitleId}
              className="absolute inset-x-0 bottom-0 z-[6] flex max-h-[64%] flex-col"
              initial={motionSafe ? { y: "100%" } : { opacity: 0 }}
              animate={motionSafe ? { y: 0 } : { opacity: 1 }}
              exit={
                motionSafe
                  ? { y: "100%", transition: exitFor() }
                  : { opacity: 0, transition: { duration: durations.fast } }
              }
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
            >
              <motion.div
                className="flex flex-1 flex-col overflow-hidden rounded-t-4 border-t border-hairline-strong bg-popover shadow-[0_-10px_30px_color-mix(in_oklab,black_16%,transparent)]"
                style={{ y: sheetY }}
              >
                <div
                  {...sheetDrag}
                  className="shrink-0 cursor-grab touch-pan-x select-none active:cursor-grabbing"
                >
                  <div
                    aria-hidden
                    className="flex h-5 items-center justify-center"
                  >
                    <span className="h-1 w-9 rounded-full bg-hairline-strong" />
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 pb-1">
                    <p id={sheetTitleId} className="text-[13px] font-semibold">
                      {draft
                        ? `New pin ${draftN}`
                        : `Threads · ${openCount} open`}
                    </p>
                    <button
                      type="button"
                      data-pc-focus="sheet-close"
                      aria-label="Close threads"
                      onClick={closeSheet}
                      className={cn(
                        "inline-flex size-8 cursor-pointer items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </div>
                </div>
                <motion.div
                  layoutScroll
                  className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
                >
                  {draft ? (
                    <ol
                      ref={listRef}
                      role="list"
                      aria-label="New pin"
                      className={cn("flex flex-col", dens.list)}
                    >
                      {draftCard}
                    </ol>
                  ) : (
                    listBody()
                  )}
                </motion.div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
