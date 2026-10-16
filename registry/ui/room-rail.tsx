"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Minus,
  PenLine,
  Plus,
  Presentation,
  RotateCcw,
  TriangleAlert,
  Tv,
  Users,
  Video,
  Wrench,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import {
  rubberClamp,
  useDrag,
  type DragInfo,
} from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type RailEquipment = "screen" | "video" | "whiteboard" | "projector";

export type RailRoom = {
  id: string;
  name: string;
  floor?: string;
  capacity: number;
  equipment: RailEquipment[];
  /** Why the room cannot be booked today. Present: the row is hatched with it. */
  outOfService?: string;
};

export type RailBooking = {
  id: string;
  room: string;
  /** Minutes from midnight. */
  start: number;
  /** Minutes from midnight, exclusive. */
  end: number;
  title: string;
  /** Who holds it. Equal to `viewer`: it is yours, and can be extended or released. */
  holder: string;
};

export type RailDraft = { roomId: string; start: number; end: number };

export type RailBlockStyle = "soft" | "solid" | "outline";
export type RailStatus = "ready" | "loading" | "error";

export type RoomRailProps = {
  /** Height of each room's row, px; from 56px rooms show their status line and blocks their holder. @default 56 */
  rowHeight?: number;
  /** How bookings are drawn: a tint with a coloured lead edge, a pigment fill, or an outline. @default "soft" */
  blockStyle?: RailBlockStyle;
  /** Any CSS colour: your bookings, the draft and its readouts. @default "var(--accent-bright)" */
  accent?: string;
  /** The rooms, as rows. @default defaultRailRooms */
  rooms?: RailRoom[];
  /** Controlled bookings. */
  bookings?: RailBooking[];
  /** Initial bookings when uncontrolled. @default defaultRailBookings */
  defaultBookings?: RailBooking[];
  /** Fires from the book, extend or release that changed the bookings, with all of them. */
  onBookingsChange?: (bookings: RailBooking[]) => void;
  /** A draft was booked. */
  onBook?: (draft: RailDraft) => void;
  /** One of your bookings was extended to `end`. */
  onExtend?: (booking: RailBooking, end: number) => void;
  /** One of your bookings in progress was released: it now ends at `now`. */
  onRelease?: (booking: RailBooking) => void;
  /** Whose bookings are "yours". @default "Rowan Hale" */
  viewer?: string;
  /** The current time, minutes from midnight. Never read from the clock. @default 620 (10:20) */
  now?: number;
  /** The working day, whole hours. @default [8, 19] */
  day?: [number, number];
  /** The quarter everything snaps to, minutes. @default 15 */
  step?: number;
  /** A new booking's length before it is adjusted, minutes. @default 30 */
  defaultLength?: number;
  /** The day, as a heading. @default "Thursday 22 October" */
  date?: string;
  /** Whether the rooms have arrived. @default "ready" */
  status?: RailStatus;
  /** "Try again" was pressed after the rooms failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Basinworks rooms" */
  title?: string;
  /** Height of the surface, px; its body scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be booked, extended or released. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultRailRooms: RailRoom[] = [
  {
    id: "basin",
    name: "Basin",
    floor: "Ground",
    capacity: 12,
    equipment: ["screen", "video"],
  },
  {
    id: "weir",
    name: "Weir",
    floor: "First",
    capacity: 6,
    equipment: ["screen", "whiteboard"],
  },
  {
    id: "sluice",
    name: "Sluice",
    floor: "First",
    capacity: 4,
    equipment: ["whiteboard"],
    outOfService: "Air handling repair · back Monday",
  },
  {
    id: "delta",
    name: "Delta",
    floor: "Second",
    capacity: 8,
    equipment: ["screen", "video"],
  },
  {
    id: "spillway",
    name: "Spillway",
    floor: "Second",
    capacity: 2,
    equipment: ["video"],
  },
  {
    id: "estuary",
    name: "Estuary",
    floor: "Third",
    capacity: 20,
    equipment: ["projector", "video"],
  },
];

const hm = (h: number, m = 0) => h * 60 + m;
const VIEWER = "Rowan Hale";

/** Thursday at the Basinworks office, 10:20: two rooms in use, one of them yours. */
export const defaultRailBookings: RailBooking[] = [
  {
    id: "b1",
    room: "basin",
    start: hm(9),
    end: hm(10),
    title: "Ops standup",
    holder: "Mara Ilves",
  },
  {
    id: "b2",
    room: "basin",
    start: hm(10),
    end: hm(11, 30),
    title: "Quarterly review",
    holder: "Joel Brandt",
  },
  {
    id: "b3",
    room: "basin",
    start: hm(14),
    end: hm(15, 30),
    title: "Vendor demo",
    holder: "Priya Shah",
  },
  {
    id: "b4",
    room: "weir",
    start: hm(8, 30),
    end: hm(9, 30),
    title: "Interview",
    holder: "Sade Okon",
  },
  {
    id: "b5",
    room: "weir",
    start: hm(13),
    end: hm(14),
    title: "Hiring sync",
    holder: VIEWER,
  },
  {
    id: "b6",
    room: "weir",
    start: hm(16),
    end: hm(17),
    title: "Retro",
    holder: "Tomás Reyes",
  },
  {
    id: "b7",
    room: "delta",
    start: hm(10),
    end: hm(11),
    title: "Design crit",
    holder: VIEWER,
  },
  {
    id: "b8",
    room: "delta",
    start: hm(12),
    end: hm(13, 30),
    title: "Lunch and learn",
    holder: "Kenji Mori",
  },
  {
    id: "b9",
    room: "delta",
    start: hm(15),
    end: hm(16),
    title: "One to one",
    holder: "Ines Varga",
  },
  {
    id: "b10",
    room: "spillway",
    start: hm(9, 45),
    end: hm(10, 45),
    title: "Call with Fieldline",
    holder: "Lotte Brink",
  },
  {
    id: "b11",
    room: "spillway",
    start: hm(11),
    end: hm(11, 30),
    title: "Call",
    holder: "Mara Ilves",
  },
  {
    id: "b12",
    room: "estuary",
    start: hm(9),
    end: hm(10),
    title: "All-hands prep",
    holder: "Ruth Achebe",
  },
  {
    id: "b13",
    room: "estuary",
    start: hm(16),
    end: hm(18),
    title: "Town hall",
    holder: "Ruth Achebe",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";
const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const clock = (m: number) => {
  const v = Math.max(0, Math.round(m));
  return `${String(Math.floor(v / 60) % 24).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const lengthLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};

const EQUIP: Record<
  RailEquipment,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  screen: { label: "screen", Icon: Tv },
  video: { label: "video", Icon: Video },
  whiteboard: { label: "whiteboard", Icon: PenLine },
  projector: { label: "projector", Icon: Presentation },
};

const andList = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

type Gap = { room: string; start: number; end: number };

/** Free stretches of a room from `from` to the end of the day. */
function gapsOf(
  room: string,
  bookings: RailBooking[],
  from: number,
  to: number,
  min: number,
): Gap[] {
  const mine = bookings
    .filter((b) => b.room === room && b.end > from)
    .sort((a, b) => a.start - b.start);
  const out: Gap[] = [];
  let cursor = from;
  for (const b of mine) {
    if (b.start - cursor >= min)
      out.push({ room, start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (to - cursor >= min) out.push({ room, start: cursor, end: to });
  return out;
}

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

type Geometry = {
  dayStart: number;
  span: number;
  step: number;
  /** The track under a row, measured at the start of a drag. */
  track: (room: string) => DOMRect | null;
};

const pctOf = (m: number, g: Pick<Geometry, "dayStart" | "span">) =>
  r3(((m - g.dayStart) / g.span) * 100);

/** A free stretch: press to grow a booking from the pressed point, or press and drag to its end. */
function GapCell({
  gap,
  geo,
  roomName,
  active,
  disabled,
  onGrow,
  onGrowDrag,
  onGrowEnd,
  onFocusCell,
  onKey,
  register,
}: {
  gap: Gap;
  geo: Geometry;
  roomName: string;
  active: boolean;
  disabled: boolean;
  onGrow: (gap: Gap, at: number) => void;
  onGrowDrag: (gap: Gap, at: number, to: number) => void;
  onGrowEnd: (velocity: number) => void;
  onFocusCell: () => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  register: (node: HTMLDivElement | null) => void;
}) {
  const press = React.useRef<number>(0);
  const minuteAt = (x: number) => {
    const box = geo.track(gap.room);
    if (!box || box.width === 0) return gap.start;
    return geo.dayStart + ((x - box.left) / box.width) * geo.span;
  };
  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: (info) => {
      press.current = minuteAt(info.point.x - info.offset.x);
      onGrowDrag(gap, press.current, minuteAt(info.point.x));
    },
    onMove: (info) => onGrowDrag(gap, press.current, minuteAt(info.point.x)),
    onEnd: (info) => {
      const box = geo.track(gap.room);
      const ppm = box && box.width > 0 ? box.width / geo.span : 1;
      onGrowEnd(info.velocity.x / ppm);
    },
    onCancel: () => onGrowEnd(0),
    onTap: (event) => onGrow(gap, minuteAt(event.clientX)),
  });
  return (
    <div
      ref={register}
      data-rr-cell={`gap:${gap.room}:${gap.end}`}
      role="gridcell"
      tabIndex={active ? 0 : -1}
      aria-label={`${roomName}, free ${clock(gap.start)} to ${clock(gap.end)}. Enter starts a booking.`}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocusCell();
      }}
      onKeyDown={onKey}
      {...drag}
      className={cn(
        "group/room-rail absolute inset-y-1 cursor-copy touch-pan-y rounded-2 select-none",
        "transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--rr-accent)_7%,transparent)]",
        FOCUS_IN,
      )}
      style={{
        left: `${pctOf(gap.start, geo)}%`,
        width: `${r3(((gap.end - gap.start) / geo.span) * 100)}%`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1.5 flex items-center opacity-0 transition-opacity group-hover/room-rail:opacity-100 group-focus-visible/room-rail:opacity-100"
      >
        <Plus className="size-3.5 text-(--rr-accent)" />
      </span>
    </div>
  );
}

/** A booking. Yours carries a grip that extends it and can be released. */
function BookingBlock({
  booking,
  own,
  geo,
  blockStyle,
  tall,
  active,
  inProgress,
  fresh,
  maxEnd,
  disabled,
  motionSafe,
  onExtend,
  onFocusCell,
  onKey,
  register,
}: {
  booking: RailBooking;
  own: boolean;
  geo: Geometry;
  blockStyle: RailBlockStyle;
  tall: boolean;
  active: boolean;
  inProgress: boolean;
  fresh: boolean;
  maxEnd: number;
  disabled: boolean;
  motionSafe: boolean;
  onExtend: (booking: RailBooking, end: number, velocity: number) => void;
  onFocusCell: () => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  register: (node: HTMLDivElement | null) => void;
}) {
  const end = useMotionValue(booking.end);
  const [live, setLive] = React.useState<number | null>(null);
  const goal = React.useRef(booking.end);
  React.useEffect(() => {
    if (goal.current === booking.end) return;
    goal.current = booking.end;
    const controls = animate(
      end,
      booking.end,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [booking.end, end, motionSafe]);

  const width = useTransform(
    end,
    (e) => `${r3((Math.max(geo.step, e - booking.start) / geo.span) * 100)}%`,
  );

  const from = React.useRef(booking.end);
  const ppm = React.useRef(1);
  const grip = useDrag({
    axis: "x",
    threshold: 2,
    disabled: disabled || !own,
    onStart: () => {
      from.current = end.get();
      const box = geo.track(booking.room);
      ppm.current = box && box.width > 0 ? box.width / geo.span : 1;
    },
    onMove: ({ offset }: DragInfo) => {
      const raw = from.current + offset.x / ppm.current;
      const v = rubberClamp(raw, booking.start + geo.step, maxEnd, 30);
      end.set(r3(v));
      const q = clamp(
        Math.round(v / geo.step) * geo.step,
        booking.start + geo.step,
        maxEnd,
      );
      setLive((l) => (l === q ? l : q));
    },
    onEnd: ({ velocity }: DragInfo) => {
      setLive(null);
      const q = clamp(
        Math.round(end.get() / geo.step) * geo.step,
        booking.start + geo.step,
        maxEnd,
      );
      goal.current = q;
      animate(
        end,
        q,
        motionSafe
          ? { ...springs.snap, velocity: velocity.x / ppm.current }
          : { duration: 0 },
      );
      if (q !== booking.end) onExtend(booking, q, 0);
    },
    onCancel: () => {
      setLive(null);
      goal.current = booking.end;
      animate(end, booking.end, motionSafe ? springs.snap : { duration: 0 });
    },
  });

  const surface = own
    ? blockStyle === "solid"
      ? "border border-transparent bg-[oklch(from_var(--rr-accent)_0.72_0.13_h)] text-[oklch(0.22_0.02_258)]"
      : blockStyle === "outline"
        ? "border-[1.5px] border-(--rr-accent) bg-card text-foreground"
        : "border border-[color-mix(in_oklab,var(--rr-accent)_45%,transparent)] border-l-[3px] border-l-(--rr-accent) bg-[color-mix(in_oklab,var(--rr-accent)_16%,var(--card))] text-foreground"
    : blockStyle === "solid"
      ? "border border-transparent bg-[oklch(from_var(--ink-3)_0.82_0.015_h)] text-[oklch(0.25_0.02_258)]"
      : blockStyle === "outline"
        ? "border border-hairline-strong bg-card text-ink-2"
        : "border border-hairline border-l-[3px] border-l-ink-3/60 bg-surface-2 text-ink-2";

  const shownEnd = live ?? booking.end;
  return (
    <motion.div
      ref={register}
      data-rr-cell={own ? `own:${booking.id}` : undefined}
      role={own ? "gridcell" : undefined}
      aria-hidden={own ? undefined : true}
      tabIndex={own ? (active ? 0 : -1) : undefined}
      aria-label={
        own
          ? `Your booking, ${booking.title}, ${clock(booking.start)} to ${clock(booking.end)}.${inProgress ? " In progress: Delete releases it." : ""} Right bracket extends it a quarter hour.`
          : undefined
      }
      onFocus={
        own
          ? (event: React.FocusEvent<HTMLDivElement>) => {
              if (event.target === event.currentTarget) onFocusCell();
            }
          : undefined
      }
      onKeyDown={own ? onKey : undefined}
      initial={fresh && motionSafe ? { scale: 1.06 } : false}
      animate={{ scale: 1 }}
      transition={{ scale: springs.flick }}
      className={cn(
        "absolute inset-y-1 flex min-w-0 flex-col justify-center overflow-hidden rounded-2 px-2 leading-tight",
        surface,
        own ? "z-[2]" : "z-[1]",
        own && FOCUS_IN,
      )}
      style={{ left: `${pctOf(booking.start, geo)}%`, width }}
      title={`${booking.title} · ${clock(booking.start)}–${clock(booking.end)} · ${own ? "you" : booking.holder}`}
    >
      <span
        className={cn(
          "truncate text-[11px] font-medium",
          booking.end - booking.start < 45 && "sr-only",
        )}
        title={booking.title}
      >
        {booking.title}
      </span>
      {tall && booking.end - booking.start >= 60 ? (
        <span className="truncate text-[10px] opacity-75">
          {own ? `You · until ${clock(shownEnd)}` : booking.holder}
        </span>
      ) : null}
      {own && !disabled ? (
        <span
          aria-hidden
          data-rr-grip=""
          {...grip}
          className="absolute inset-y-0 right-0 flex w-3 cursor-ew-resize touch-pan-y items-center justify-center"
        >
          <span className="h-1/2 w-[3px] rounded-full bg-current opacity-40" />
        </span>
      ) : null}
      {live !== null ? (
        <span className="pointer-events-none absolute -top-0.5 right-1 rounded-1 bg-popover px-1 font-mono text-[10px] text-foreground tabular-nums shadow-sm">
          {clock(live)}
        </span>
      ) : null}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The rail                                 */
/* ----------------------------------------------------------------------- */

type Draft = {
  room: string;
  lo: number;
  hi: number;
  start: number;
  end: number;
};
type Said = { n: number; text: string };

/**
 * A day of rooms on one rail: rooms as rows, the working day across, a
 * now-line that follows the `now` prop on drift so a ticking clock sweeps
 * instead of stepping, and the past dimmed behind it. Pressing a free gap
 * grows a booking out from that point to its default length on snap, its
 * end time riding the edge; both edges then drag 1:1 in quarter hours and
 * rubber-band at the gap's bounds. Press and drag instead and the end
 * follows the pointer. Book lands it with a flick.
 *
 * Your own bookings carry a grip that extends them into the free time after,
 * and one in progress can be released: its edge retracts to the now-line on
 * glide and the freed time washes in. The rail is a grid whose cells are the
 * free gaps and your bookings: arrows walk them, Enter grows a booking, then
 * Left and Right move its end (Shift its start), Enter books and Escape
 * cancels. Out-of-service rooms are hatched with their reason; on a narrow
 * container each room becomes a card with its next free slots.
 */
export function RoomRail({
  rowHeight = 56,
  blockStyle = "soft",
  accent = "var(--accent-bright)",
  rooms = defaultRailRooms,
  bookings,
  defaultBookings,
  onBookingsChange,
  onBook,
  onExtend,
  onRelease,
  viewer = VIEWER,
  now = 620,
  day = [8, 19],
  step = 15,
  defaultLength = 30,
  date = "Thursday 22 October",
  status = "ready",
  onRetry,
  title = "Basinworks rooms",
  height = 540,
  disabled = false,
  className,
}: RoomRailProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const rowH = Math.round(clamp(rowHeight, 36, 80));
  const q = Math.max(5, Math.round(step));
  const dayStart = day[0] * 60;
  const dayEnd = Math.max(day[0] + 1, day[1]) * 60;
  const span = dayEnd - dayStart;
  const nowAt = clamp(now, dayStart, dayEnd);
  const ceilQ = (m: number) => Math.ceil(m / q) * q;
  const snapQ = (m: number) => Math.round(m / q) * q;

  const [own, setOwn] = React.useState<RailBooking[]>(
    () => defaultBookings ?? defaultRailBookings,
  );
  const list = bookings ?? own;
  const write = (next: RailBooking[]) => {
    if (bookings === undefined) setOwn(next);
    onBookingsChange?.(next);
  };

  const tracks = React.useRef(new Map<string, HTMLDivElement>());
  const geo: Geometry = {
    dayStart,
    span,
    step: q,
    track: (room) => tracks.current.get(room)?.getBoundingClientRect() ?? null,
  };

  const gapsByRoom = React.useMemo(() => {
    const map = new Map<string, Gap[]>();
    for (const r of rooms) {
      map.set(r.id, r.outOfService ? [] : gapsOf(r.id, list, nowAt, dayEnd, q));
    }
    return map;
  }, [rooms, list, nowAt, dayEnd, q]);

  const isOwn = (b: RailBooking) => b.holder === viewer;
  const inProgress = (b: RailBooking) => b.start <= now && now < b.end;

  /* ------------------------------ now-line ------------------------------- */

  const nowMv = useMotionValue(nowAt);
  React.useEffect(() => {
    const controls = animate(
      nowMv,
      nowAt,
      motionSafe ? springs.drift : { duration: 0 },
    );
    return () => controls.stop();
  }, [nowAt, nowMv, motionSafe]);
  const nowLeft = useTransform(
    nowMv,
    (m) => `${pctOf(m, { dayStart, span })}%`,
  );
  const nowLabelLeft = useTransform(
    nowMv,
    (m) =>
      `calc(var(--rr-name) + (100% - var(--rr-name) - 1rem) * ${r3((m - dayStart) / span)})`,
  );

  /* ------------------------------- draft --------------------------------- */

  const [draft, setDraftState] = React.useState<Draft | null>(null);
  /** The draft as the handlers last left it, for the end of a fast drag. */
  const draftNow = React.useRef<Draft | null>(null);
  const setDraft = (next: Draft | null) => {
    draftNow.current = next;
    setDraftState(next);
  };
  const dStart = useMotionValue(0);
  const dEnd = useMotionValue(0);
  const dAnims = React.useRef<AnimationPlaybackControls[]>([]);
  const stopDraft = () => {
    for (const c of dAnims.current) c.stop();
    dAnims.current = [];
  };
  React.useEffect(() => () => stopDraft(), []);
  const draftLeft = useTransform(
    dStart,
    (m) => `${pctOf(m, { dayStart, span })}%`,
  );
  const draftWidth = useTransform(
    [dStart, dEnd] as MotionValue<number>[],
    ([a = 0, b = 0]: number[]) => `${r3((Math.max(0, b - a) / span) * 100)}%`,
  );
  const draftRight = useDraftRight(draftLeft, draftWidth);

  const cellNodes = React.useRef(new Map<string, HTMLDivElement>());
  // One stable callback for every cell: a motion element whose ref changes
  // between renders would be unmounted and mounted again each time.
  const bindCell = React.useCallback((node: HTMLDivElement | null) => {
    const key = node?.dataset.rrCell;
    if (node && key) cellNodes.current.set(key, node);
  }, []);
  const focusReq = React.useRef<string | null>(null);
  const [focusTick, setFocusTick] = React.useState(0);
  React.useEffect(() => {
    const key = focusReq.current;
    if (!key) return;
    const node = cellNodes.current.get(key);
    if (node?.isConnected && node.getBoundingClientRect().width > 0) {
      focusReq.current = null;
      node.focus({ preventScroll: true });
    }
  }, [focusTick, draft, list]);

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [fresh, setFresh] = React.useState<string | null>(null);
  /** Your booking that was last pressed or focused: its actions show in the bar. */
  const [picked, setPicked] = React.useState<string | null>(null);
  const [wash, setWash] = React.useState<{
    room: string;
    start: number;
    end: number;
    n: number;
  } | null>(null);
  const counter = React.useRef(0);

  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;

  const draftSentence = (d: Draft) =>
    `Draft in ${roomName(d.room)}, ${clock(d.start)} to ${clock(d.end)}, ${lengthLabel(d.end - d.start)}. Enter books, Escape cancels.`;

  /** Grows a draft out of a gap from a pressed minute, to the default length. */
  const grow = (gap: Gap, at: number) => {
    if (disabled || !ready) return;
    setPicked(null);
    stopDraft();
    const lo = ceilQ(Math.max(gap.start, now));
    const hi = gap.end;
    if (hi - lo < q) return;
    const start = clamp(snapQ(at), lo, hi - q);
    const end = Math.min(hi, start + Math.max(q, defaultLength));
    const next = { room: gap.room, lo, hi, start, end };
    setDraft(next);
    dStart.jump(start);
    if (motionSafe) {
      dEnd.jump(start);
      dAnims.current = [animate(dEnd, end, springs.snap)];
    } else {
      dEnd.jump(end);
    }
    focusReq.current = "draft";
    setFocusTick((t) => t + 1);
    say(draftSentence(next));
  };

  // Press and drag on a gap: the end follows the pointer.
  const growDrag = (gap: Gap, at: number, to: number) => {
    if (disabled || !ready) return;
    const lo = ceilQ(Math.max(gap.start, now));
    const hi = gap.end;
    if (hi - lo < q) return;
    const start = clamp(Math.floor(at / q) * q, lo, hi - q);
    stopDraft();
    const raw = rubberClamp(to, start + q, hi, 30);
    dStart.jump(start);
    dEnd.set(r3(raw));
    const end = clamp(snapQ(raw), start + q, hi);
    const d = draftNow.current;
    if (!d || d.room !== gap.room || d.start !== start || d.end !== end) {
      setDraft({ room: gap.room, lo, hi, start, end });
    }
  };
  const growEnd = (velocity: number) => {
    const d = draftNow.current;
    if (!d) return;
    const end = clamp(snapQ(dEnd.get()), d.start + q, d.hi);
    dAnims.current = [
      animate(
        dEnd,
        end,
        motionSafe ? { ...springs.snap, velocity } : { duration: 0 },
      ),
    ];
    const next = { ...d, end };
    setDraft(next);
    focusReq.current = "draft";
    setFocusTick((t) => t + 1);
    say(draftSentence(next));
  };

  const setDraftEdges = (start: number, end: number, velocity = 0) => {
    if (!draft) return;
    const s = clamp(start, draft.lo, draft.hi - q);
    const e = clamp(end, s + q, draft.hi);
    stopDraft();
    const spring = motionSafe ? { ...springs.snap, velocity } : { duration: 0 };
    dAnims.current = [animate(dStart, s, spring), animate(dEnd, e, spring)];
    const next = { ...draft, start: s, end: e };
    setDraft(next);
    say(draftSentence(next));
  };

  const book = () => {
    if (!draft || disabled) return;
    counter.current += 1;
    const id = `${idBase}-b${counter.current}`;
    const b: RailBooking = {
      id,
      room: draft.room,
      start: draft.start,
      end: draft.end,
      title: "Reserved",
      holder: viewer,
    };
    write([...list, b]);
    setDraft(null);
    setFresh(id);
    setActiveKey(`own:${id}`);
    focusReq.current = `own:${id}`;
    setFocusTick((t) => t + 1);
    say(
      `Booked ${roomName(draft.room)}, ${clock(draft.start)} to ${clock(draft.end)}.`,
    );
    onBook?.({ roomId: draft.room, start: draft.start, end: draft.end });
  };

  const cancel = () => {
    if (!draft) return;
    const room = draft.room;
    stopDraft();
    setDraft(null);
    const g = (gapsByRoom.get(room) ?? []).find(
      (x) => x.start <= draft.start && draft.start < x.end,
    );
    if (g) {
      focusReq.current = `gap:${room}:${g.end}`;
      setFocusTick((t) => t + 1);
    }
    say("Draft cancelled.");
  };

  const extend = (b: RailBooking, end: number) => {
    if (disabled || !isOwn(b)) return;
    const after = list
      .filter((x) => x.room === b.room && x.id !== b.id && x.start >= b.end)
      .reduce((m, x) => Math.min(m, x.start), dayEnd);
    const e = clamp(end, b.start + q, after);
    if (e === b.end) {
      say("Nothing free after it.");
      return;
    }
    write(list.map((x) => (x.id === b.id ? { ...x, end: e } : x)));
    say(`${b.title} now ends at ${clock(e)}.`);
    onExtend?.(b, e);
  };

  const release = (b: RailBooking) => {
    if (disabled || !isOwn(b) || !inProgress(b)) return;
    const e = Math.max(b.start, Math.round(now));
    write(list.map((x) => (x.id === b.id ? { ...x, end: e } : x)));
    setWash((w) => ({
      room: b.room,
      start: e,
      end: b.end,
      n: (w?.n ?? 0) + 1,
    }));
    say(`Released ${roomName(b.room)} from ${clock(e)}.`);
    onRelease?.({ ...b, end: e });
  };

  /* ------------------------------ keyboard ------------------------------- */

  type Walk = { key: string; room: string; start: number; end: number };
  const walk = rooms.map((r) => {
    const cells: Walk[] = [
      ...(gapsByRoom.get(r.id) ?? []).map((g) => ({
        key: `gap:${r.id}:${g.end}`,
        room: r.id,
        start: g.start,
        end: g.end,
      })),
      ...list
        .filter((b) => b.room === r.id && isOwn(b) && b.end > now)
        .map((b) => ({
          key: `own:${b.id}`,
          room: r.id,
          start: b.start,
          end: b.end,
        })),
    ].sort((a, b) => a.start - b.start);
    return cells;
  });
  const allCells = walk.flat();
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const active =
    activeKey && allCells.some((c) => c.key === activeKey)
      ? activeKey
      : (allCells[0]?.key ?? null);

  const go = (key: string) => {
    setActiveKey(key);
    focusReq.current = key;
    setFocusTick((t) => t + 1);
  };

  const onCellKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    key: string,
  ) => {
    if (!ready) return;
    const ri = walk.findIndex((cells) => cells.some((c) => c.key === key));
    const row = walk[ri] ?? [];
    const ci = row.findIndex((c) => c.key === key);
    const cell = row[ci];
    if (!cell) return;
    const nearest = (dir: 1 | -1) => {
      for (let r = ri + dir; r >= 0 && r < walk.length; r += dir) {
        const cells = walk[r] ?? [];
        if (cells.length === 0) continue;
        let best = cells[0];
        let gapBest = Infinity;
        for (const c of cells) {
          const dist =
            c.start <= cell.start && cell.start < c.end
              ? 0
              : Math.min(
                  Math.abs(c.start - cell.start),
                  Math.abs(c.end - cell.start),
                );
          if (dist < gapBest) {
            gapBest = dist;
            best = c;
          }
        }
        return best;
      }
      return undefined;
    };
    switch (event.key) {
      case "ArrowRight": {
        event.preventDefault();
        const n = row[Math.min(row.length - 1, ci + 1)];
        if (n) go(n.key);
        return;
      }
      case "ArrowLeft": {
        event.preventDefault();
        const n = row[Math.max(0, ci - 1)];
        if (n) go(n.key);
        return;
      }
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const n = nearest(event.key === "ArrowDown" ? 1 : -1);
        if (n) go(n.key);
        return;
      }
      case "Home": {
        event.preventDefault();
        const n = row[0];
        if (n) go(n.key);
        return;
      }
      case "End": {
        event.preventDefault();
        const n = row[row.length - 1];
        if (n) go(n.key);
        return;
      }
      case "Enter":
      case " ": {
        if (!key.startsWith("gap:")) return;
        event.preventDefault();
        grow(
          { room: cell.room, start: cell.start, end: cell.end },
          Math.max(cell.start, now),
        );
        return;
      }
      case "]": {
        if (!key.startsWith("own:")) return;
        event.preventDefault();
        const b = list.find((x) => `own:${x.id}` === key);
        if (b) extend(b, b.end + q);
        return;
      }
      case "Delete":
      case "Backspace": {
        if (!key.startsWith("own:")) return;
        event.preventDefault();
        const b = list.find((x) => `own:${x.id}` === key);
        if (b && inProgress(b)) release(b);
        else say("Only a booking in progress can be released.");
        return;
      }
      default:
        return;
    }
  };

  const onDraftKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!draft) return;
    const d =
      event.key === "ArrowRight" ? q : event.key === "ArrowLeft" ? -q : 0;
    if (d) {
      event.preventDefault();
      if (event.shiftKey) setDraftEdges(draft.start + d, draft.end);
      else setDraftEdges(draft.start, draft.end + d);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      book();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };

  /* -------------------------------- render ------------------------------- */

  const hours = Array.from(
    { length: Math.round(span / 60) + 1 },
    (_, i) => day[0] + i,
  );
  const tall = rowH >= 56;
  const roomsFree = rooms.filter(
    (r) =>
      !r.outOfService && !list.some((b) => b.room === r.id && inProgress(b)),
  ).length;

  const statusLine = (r: RailRoom) => {
    if (r.outOfService) return "Out of service";
    const current = list.find((b) => b.room === r.id && inProgress(b));
    if (current) {
      return `In use · ${current.holder === viewer ? "you" : current.holder} until ${clock(current.end)}`;
    }
    const next = list
      .filter((b) => b.room === r.id && b.start >= now)
      .sort((a, b) => a.start - b.start)[0];
    return next
      ? `Free until ${clock(next.start)}`
      : "Free for the rest of the day";
  };

  const equipment = (r: RailRoom) => (
    <span className="inline-flex items-center gap-1.5 text-ink-3">
      <span className="inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums">
        <Users aria-hidden className="size-3" />
        {r.capacity}
      </span>
      {r.equipment.map((e) => {
        const { Icon } = EQUIP[e];
        return <Icon key={e} aria-hidden className="size-3" />;
      })}
    </span>
  );

  const summary = (r: RailRoom) => {
    const day2 = list
      .filter((b) => b.room === r.id)
      .sort((a, b) => a.start - b.start)
      .map(
        (b) =>
          `${b.title} ${clock(b.start)} to ${clock(b.end)}, ${b.holder === viewer ? "you" : b.holder}`,
      );
    return `${r.name}${r.floor ? `, ${r.floor} floor` : ""}, ${r.capacity} ${r.capacity === 1 ? "person" : "people"}${r.equipment.length ? `, ${andList(r.equipment.map((e) => EQUIP[e].label))}` : ""}. ${r.outOfService ? `Out of service: ${r.outOfService}.` : `${statusLine(r)}.`}${day2.length ? ` Bookings: ${day2.join("; ")}.` : ""}`;
  };

  const draftBlock = (room: string) =>
    draft && draft.room === room ? (
      <>
        <motion.div
          key="draft"
          ref={bindCell}
          data-rr-cell="draft"
          role="gridcell"
          tabIndex={0}
          aria-label={draftSentence(draft)}
          onKeyDown={onDraftKey}
          className={cn(
            "absolute inset-y-1 z-[4] rounded-2 border-[1.5px] border-(--rr-accent) bg-[color-mix(in_oklab,var(--rr-accent)_22%,var(--card))] shadow-[0_8px_20px_-8px_color-mix(in_oklab,var(--rr-accent)_60%,transparent)]",
            FOCUS_RING,
          )}
          style={{ left: draftLeft, width: draftWidth }}
        >
          <DraftEdge
            side="start"
            draft={draft}
            geo={geo}
            mv={dStart}
            other={dEnd}
            onSettle={(v, vel) => setDraftEdges(v, draft.end, vel)}
            stop={stopDraft}
            disabled={disabled}
          />
          <DraftEdge
            side="end"
            draft={draft}
            geo={geo}
            mv={dEnd}
            other={dStart}
            onSettle={(v, vel) => setDraftEdges(draft.start, v, vel)}
            stop={stopDraft}
            disabled={disabled}
          />
        </motion.div>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -top-1 z-[5] -translate-y-full rounded-1 bg-popover px-1 font-mono text-[10px] whitespace-nowrap text-foreground tabular-nums shadow-sm"
          style={{ left: draftLeft }}
        >
          {clock(draft.start)}
        </motion.span>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-1/2 z-[5] ml-2.5 -translate-y-1/2 rounded-1 bg-popover px-1 font-mono text-[10px] whitespace-nowrap text-(--rr-accent-ink) tabular-nums shadow-sm"
          style={{ left: draftRight }}
        >
          {clock(draft.end)} · {lengthLabel(draft.end - draft.start)}
        </motion.span>
      </>
    ) : null;

  const pickedBooking =
    draft === null && picked
      ? list.find((b) => b.id === picked && isOwn(b) && b.end > now)
      : undefined;

  const ownBar = pickedBooking ? (
    <motion.div
      key="own"
      role="group"
      aria-label={`Your booking, ${pickedBooking.title}`}
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline bg-surface-1 px-4 py-2.5"
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? {
              y: springs.snap,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
    >
      <p className="min-w-0 text-[12px]">
        <span className="font-medium">{pickedBooking.title}</span>{" "}
        <span className="text-ink-3">· {roomName(pickedBooking.room)}</span>{" "}
        <span className="font-mono tabular-nums">
          {clock(pickedBooking.start)}–{clock(pickedBooking.end)}
        </span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPicked(null)}
          className={cn(
            "inline-flex h-8 items-center rounded-2 px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => extend(pickedBooking, pickedBooking.end + q)}
          aria-disabled={disabled || undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          <Plus aria-hidden className="size-3.5" />
          {q} min
        </button>
        {inProgress(pickedBooking) ? (
          <button
            type="button"
            onClick={() => {
              release(pickedBooking);
              setPicked(null);
            }}
            aria-disabled={disabled || undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
              FOCUS_RING,
            )}
            style={{ backgroundColor: "var(--rr-accent-ink)" }}
          >
            Release
          </button>
        ) : null}
      </div>
    </motion.div>
  ) : null;

  const draftBar =
    draft !== null ? (
      <motion.div
        key="bar"
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline bg-surface-1 px-4 py-2.5"
        initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={
          motionSafe
            ? {
                y: springs.snap,
                opacity: { duration: durations.base, ease: easings.enter },
              }
            : { duration: durations.fast }
        }
      >
        <p className="min-w-0 text-[12px]">
          <span className="font-medium">{roomName(draft.room)}</span>{" "}
          <span className="font-mono tabular-nums">
            {clock(draft.start)}–{clock(draft.end)}
          </span>{" "}
          <span className="text-ink-3">
            · {lengthLabel(draft.end - draft.start)}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center @min-[36rem]:hidden">
            <button
              type="button"
              aria-label="End a quarter hour earlier"
              onClick={() => setDraftEdges(draft.start, draft.end - q)}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-2 text-ink-2 hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <Minus aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="End a quarter hour later"
              onClick={() => setDraftEdges(draft.start, draft.end + q)}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-2 text-ink-2 hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <Plus aria-hidden className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={cancel}
            className={cn(
              "inline-flex h-8 items-center rounded-2 px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={book}
            aria-disabled={disabled || undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
              FOCUS_RING,
            )}
            style={{ backgroundColor: "var(--rr-accent-ink)" }}
          >
            Book
          </button>
        </div>
      </motion.div>
    ) : null;

  const rail = (
    <div className="hidden @min-[36rem]:block">
      <div
        role="grid"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        className="relative grid [--rr-name:8.5rem] @min-[48rem]:[--rr-name:11rem]"
        style={{ gridTemplateColumns: "var(--rr-name) minmax(0, 1fr)" }}
      >
        {/* Ruler */}
        <div
          aria-hidden
          className="border-b border-hairline"
          style={{ height: 26 }}
        />
        <div
          aria-hidden
          className="relative mr-4 border-b border-hairline"
          style={{ height: 26 }}
        >
          {hours.map((h, i) => (
            <span
              key={h}
              className={cn(
                "absolute bottom-1 font-mono text-[10px] text-ink-3 tabular-nums",
                i === 0
                  ? ""
                  : i === hours.length - 1
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              )}
              style={{ left: `${pctOf(h * 60, { dayStart, span })}%` }}
            >
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>

        {rooms.map((r) => {
          const gaps = gapsByRoom.get(r.id) ?? [];
          const mine = list.filter((b) => b.room === r.id);
          return (
            <div key={r.id} role="row" className="contents">
              <div
                role="rowheader"
                className="flex min-w-0 flex-col justify-center gap-0.5 border-b border-hairline px-3"
                style={{ height: rowH }}
              >
                <span className="sr-only">{summary(r)}</span>
                <span
                  aria-hidden
                  className="flex min-w-0 items-baseline gap-1.5"
                >
                  {!tall ? (
                    <span
                      className={cn(
                        "size-1.5 shrink-0 self-center rounded-full",
                        r.outOfService
                          ? "bg-warn"
                          : statusLine(r).startsWith("In use")
                            ? "bg-ink-3"
                            : "bg-success",
                      )}
                    />
                  ) : null}
                  <span
                    className="truncate text-[12px] font-medium"
                    title={statusLine(r)}
                  >
                    {r.name}
                  </span>
                  {r.floor ? (
                    <span className="truncate text-[10px] text-ink-3">
                      {r.floor}
                    </span>
                  ) : null}
                </span>
                <span aria-hidden className="flex min-w-0 items-center gap-2">
                  {equipment(r)}
                </span>
                {tall ? (
                  <span
                    aria-hidden
                    className={cn(
                      "truncate text-[10px]",
                      r.outOfService
                        ? "text-warn"
                        : statusLine(r).startsWith("In use")
                          ? "text-ink-2"
                          : "text-success",
                    )}
                  >
                    {statusLine(r)}
                  </span>
                ) : null}
              </div>
              <div
                ref={(node) => {
                  if (node) tracks.current.set(r.id, node);
                }}
                data-rr-track={r.id}
                className="relative mr-4 border-b border-hairline"
                style={{ height: rowH }}
              >
                {/* Hour rules */}
                {hours.slice(1, -1).map((h) => (
                  <span
                    key={h}
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-hairline"
                    style={{ left: `${pctOf(h * 60, { dayStart, span })}%` }}
                  />
                ))}
                {r.outOfService ? (
                  <div
                    role="gridcell"
                    aria-label={`${r.name} is out of service: ${r.outOfService}`}
                    className="absolute inset-x-0 inset-y-1 flex items-center justify-center gap-1.5 overflow-hidden rounded-2 border border-dashed border-hairline-strong bg-surface-2 px-2 text-[11px] text-ink-2"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(135deg, var(--hairline-strong) 0 1px, transparent 1px 7px)",
                    }}
                  >
                    <Wrench
                      aria-hidden
                      className="size-3.5 shrink-0 text-warn"
                    />
                    <span className="truncate rounded-1 bg-card px-1.5 py-0.5">
                      {r.outOfService}
                    </span>
                  </div>
                ) : (
                  <>
                    {mine.map((b) => {
                      const after = list
                        .filter(
                          (x) =>
                            x.room === r.id &&
                            x.id !== b.id &&
                            x.start >= b.end,
                        )
                        .reduce((m, x) => Math.min(m, x.start), dayEnd);
                      return (
                        <BookingBlock
                          key={b.id}
                          booking={b}
                          own={isOwn(b)}
                          geo={geo}
                          blockStyle={blockStyle}
                          tall={tall}
                          active={active === `own:${b.id}`}
                          inProgress={inProgress(b)}
                          fresh={fresh === b.id}
                          maxEnd={after}
                          disabled={disabled || !ready}
                          motionSafe={motionSafe}
                          onExtend={(bk, end) => extend(bk, end)}
                          onFocusCell={() => {
                            setActiveKey(`own:${b.id}`);
                            setPicked(b.id);
                          }}
                          onKey={(event) => onCellKey(event, `own:${b.id}`)}
                          register={bindCell}
                        />
                      );
                    })}
                    {/* A gap stays under a draft grown from it: unmounting it
                        would end the very drag that is setting the draft. */}
                    {gaps.map((g) => {
                      const key = `gap:${r.id}:${g.end}`;
                      return (
                        <GapCell
                          key={key}
                          gap={g}
                          geo={geo}
                          roomName={r.name}
                          active={active === key}
                          disabled={disabled || !ready}
                          onGrow={grow}
                          onGrowDrag={growDrag}
                          onGrowEnd={growEnd}
                          onFocusCell={() => setActiveKey(key)}
                          onKey={(event) => onCellKey(event, key)}
                          register={bindCell}
                        />
                      );
                    })}
                    {wash && wash.room === r.id ? (
                      <motion.span
                        key={`wash-${wash.n}`}
                        aria-hidden
                        className="pointer-events-none absolute inset-y-1 rounded-2 bg-(--rr-accent)"
                        style={{
                          left: `${pctOf(wash.start, { dayStart, span })}%`,
                          width: `${r3(((wash.end - wash.start) / span) * 100)}%`,
                        }}
                        initial={{ opacity: 0.28 }}
                        animate={{ opacity: 0 }}
                        transition={{
                          duration: 0.9,
                          ease: easings.enter,
                          delay: 0.15,
                        }}
                      />
                    ) : null}
                    {draftBlock(r.id)}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* The past, dimmed, and the now-line, over every track. */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-4 bottom-0"
          style={{ left: "var(--rr-name)", top: 26 }}
        >
          <motion.span
            className="absolute inset-y-0 left-0 bg-[color-mix(in_oklab,var(--card)_50%,transparent)]"
            style={{ width: nowLeft }}
          />
          <motion.span
            className="absolute inset-y-0 z-[6] w-px bg-danger"
            style={{ left: nowLeft }}
          >
            <span className="absolute -top-0.5 -left-[3px] size-[7px] rounded-full bg-danger" />
          </motion.span>
        </div>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-[3px] z-[6] -translate-x-1/2 rounded-full bg-danger px-1.5 font-mono text-[10px] leading-4 text-destructive-foreground tabular-nums"
          style={{ left: nowLabelLeft }}
        >
          {clock(now)}
        </motion.span>
      </div>
    </div>
  );

  const cards = (
    <ul className="flex flex-col gap-2.5 p-3 @min-[36rem]:hidden">
      {rooms.map((r) => {
        const gaps = (gapsByRoom.get(r.id) ?? []).slice(0, 3);
        return (
          <li
            key={r.id}
            className={cn(
              "rounded-3 border px-3 py-2.5",
              r.outOfService
                ? "border-dashed border-hairline-strong bg-surface-2"
                : "border-hairline bg-card",
            )}
            style={
              r.outOfService
                ? {
                    backgroundImage:
                      "repeating-linear-gradient(135deg, var(--hairline-strong) 0 1px, transparent 1px 7px)",
                  }
                : undefined
            }
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[13px] font-medium">
                {r.name}
                {r.floor ? (
                  <span className="ml-1.5 text-[11px] font-normal text-ink-3">
                    {r.floor}
                  </span>
                ) : null}
              </p>
              {equipment(r)}
            </div>
            <p
              className={cn(
                "mt-0.5 text-[11px]",
                r.outOfService
                  ? "text-warn"
                  : statusLine(r).startsWith("In use")
                    ? "text-ink-2"
                    : "text-success",
              )}
            >
              {r.outOfService ? r.outOfService : statusLine(r)}
            </p>
            {(() => {
              const mineNow = list.find(
                (b) => b.room === r.id && isOwn(b) && inProgress(b),
              );
              return mineNow ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => extend(mineNow, mineNow.end + q)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-full border border-hairline px-2.5 text-[11px] text-ink-2 hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    <Plus aria-hidden className="size-3" />
                    {q} min
                  </button>
                  <button
                    type="button"
                    onClick={() => release(mineNow)}
                    className={cn(
                      "inline-flex h-7 items-center rounded-full border border-(--rr-accent) px-2.5 text-[11px] text-foreground hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    Release {mineNow.title}
                  </button>
                </div>
              ) : null;
            })()}
            {!r.outOfService ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {gaps.length === 0 ? (
                  <span className="text-[11px] text-ink-3">
                    No free time left today
                  </span>
                ) : (
                  gaps.map((g) => {
                    const from = ceilQ(Math.max(g.start, now));
                    if (g.end - from < q) return null;
                    const on =
                      draft?.room === r.id &&
                      draft.start >= g.start &&
                      draft.start < g.end;
                    return (
                      <button
                        key={g.end}
                        type="button"
                        aria-pressed={on}
                        aria-label={`Book ${r.name}, free ${clock(from)} to ${clock(g.end)}`}
                        onClick={() => grow(g, from)}
                        className={cn(
                          "inline-flex h-7 items-center rounded-full border px-2.5 font-mono text-[11px] tabular-nums transition-colors",
                          on
                            ? "border-(--rr-accent) bg-[color-mix(in_oklab,var(--rr-accent)_16%,transparent)] text-foreground"
                            : "border-hairline text-ink-2 hover:bg-surface-2",
                          FOCUS_RING,
                        )}
                      >
                        {clock(from)}–{clock(g.end)}
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container grid w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--rr-accent" as string]: accent,
        ["--rr-accent-ink" as string]: `oklch(from ${accent} 0.5 0.15 h)`,
      }}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1 basis-40">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3 tabular-nums">
            {date} ·{" "}
            {ready
              ? `${roomsFree} of ${rooms.length} rooms free now`
              : "Loading"}
          </p>
        </div>
        <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[11px] text-ink-2 tabular-nums">
          <span aria-hidden className="size-1.5 rounded-full bg-danger" />
          {clock(now)}
        </span>
      </header>
      <p id={hintId} className="sr-only">
        Arrow keys walk the free time and your bookings. Enter on free time
        starts a booking; then Left and Right move its end, Shift with them its
        start, Enter books and Escape cancels. On your booking, the right
        bracket extends it and Delete releases it while it is in progress.
      </p>

      {status === "error" ? (
        <div className="flex flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">Rooms did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : status === "loading" ? (
        <div
          aria-busy="true"
          className="flex flex-col gap-2 overflow-y-auto p-4"
        >
          <p className="sr-only">Loading rooms.</p>
          {rooms.map((r, i) => (
            <div
              key={r.id}
              className="flex items-center gap-3"
              style={{ height: rowH - 8 }}
            >
              <span className="h-2.5 w-20 shrink-0 rounded-full bg-surface-2" />
              <span
                className="h-full flex-1 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                style={{ opacity: i % 2 ? 0.6 : 1 }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain pb-2">
          {rail}
          {cards}
        </div>
      )}

      <div className="relative">
        <AnimatePresence initial={false} mode="popLayout">
          {draftBar ?? ownBar}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/** The draft's right edge as a CSS length, from its left and width. */
function useDraftRight(
  left: MotionValue<string>,
  width: MotionValue<string>,
): MotionValue<string> {
  return useTransform(
    [left, width] as MotionValue<string>[],
    ([l = "0%", w = "0%"]: string[]) => `calc(${l} + ${w})`,
  );
}

/** One edge of the draft: 1:1 under the finger, rubber-banding at the gap's bounds. */
function DraftEdge({
  side,
  draft,
  geo,
  mv,
  other,
  onSettle,
  stop,
  disabled,
}: {
  side: "start" | "end";
  draft: Draft;
  geo: Geometry;
  mv: MotionValue<number>;
  other: MotionValue<number>;
  onSettle: (value: number, velocity: number) => void;
  stop: () => void;
  disabled: boolean;
}) {
  const from = React.useRef(0);
  const ppm = React.useRef(1);
  const drag = useDrag({
    axis: "x",
    threshold: 1,
    disabled,
    onStart: () => {
      stop();
      from.current = mv.get();
      const box = geo.track(draft.room);
      ppm.current = box && box.width > 0 ? box.width / geo.span : 1;
    },
    onMove: ({ offset }: DragInfo) => {
      const raw = from.current + offset.x / ppm.current;
      const lo = side === "start" ? draft.lo : other.get() + geo.step;
      const hi = side === "start" ? other.get() - geo.step : draft.hi;
      mv.set(r3(rubberClamp(raw, lo, hi, 30)));
    },
    onEnd: ({ velocity }: DragInfo) => {
      const v = Math.round(mv.get() / geo.step) * geo.step;
      onSettle(v, velocity.x / ppm.current);
    },
    onCancel: () => onSettle(side === "start" ? draft.start : draft.end, 0),
  });
  return (
    <span
      aria-hidden
      data-rr-edge={side}
      {...drag}
      className={cn(
        "absolute inset-y-0 flex w-3 cursor-ew-resize touch-pan-y items-center justify-center",
        side === "start" ? "-left-1.5" : "-right-1.5",
      )}
    >
      <span className="h-3/5 w-1 rounded-full bg-(--rr-accent)" />
    </span>
  );
}
