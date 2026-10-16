"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";
import {
  AtSign,
  CornerLeftUp,
  LoaderCircle,
  RotateCcw,
  SendHorizontal,
  Sparkles,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type CouncilSeatState = "idle" | "thinking" | "failed";
export type CouncilSeatShape = "disc" | "tile" | "arch";
export type CouncilDensity = "compact" | "cozy" | "roomy";
export type CouncilStatus = "ready" | "loading" | "error";

export type CouncilSpecialist = {
  /** Unique; turns name their author by it. */
  id: string;
  /** Shown under the seat and in the thread: "Legal". */
  name: string;
  /** What this specialist answers for, in a few words. */
  remit: string;
  /** Two letters for the seat. @default the first two letters of the name */
  initials?: string;
  /** Thinking breathes dots under the seat; failed rings it in danger and offers Retry. @default "idle" */
  state?: CouncilSeatState;
};

/** One line of a council summary: who holds it, and what they hold. */
export type CouncilPoint = { specialist: string; text: string };

export type CouncilTurn = {
  /** Unique within the thread. */
  id: string;
  /** "you" for the person asking, otherwise a specialist id. */
  author: string;
  text: string;
  /** When it was said, in ms since the epoch; shown relative to `now`. */
  at: number;
  /** The specialist a question was addressed to. */
  to?: string;
  /** The id of an earlier turn this one disagrees with: a bracket joins them. */
  disputes?: string;
  /** What the disagreement is about, in two or three words. */
  disputeNote?: string;
  /** Makes the turn the council's summary card: one point per specialist. */
  points?: CouncilPoint[];
};

export type CouncilTableProps = {
  /** The council, seated left to right along the arc. @default defaultCouncilSpecialists */
  specialists?: CouncilSpecialist[];
  /** Controlled thread. */
  turns?: CouncilTurn[];
  /** Initial thread when uncontrolled. @default defaultCouncilTurns */
  defaultTurns?: CouncilTurn[];
  /** Fires from a send with the whole new thread. */
  onTurnsChange?: (turns: CouncilTurn[]) => void;
  /** Who holds the floor (the baton). @default the thinking seat, else the newest speaker */
  floor?: string | null;
  /** Controlled list of dismissed seat ids. */
  dismissed?: string[];
  /** Initial dismissed seats when uncontrolled. @default [] */
  defaultDismissed?: string[];
  /** A seat was dismissed from the table (its turns stay in the thread). */
  onDismiss?: (id: string) => void;
  /** A dismissed seat was brought back. */
  onRestore?: (id: string) => void;
  /** A specialist was addressed from its seat or with @, or the address was cleared (null). */
  onAddressSpecialist?: (id: string | null) => void;
  /** A message was sent, with the addressed specialist if there was one. */
  onSend?: (text: string, addressee: string | null) => void;
  /** Summarise was pressed. Reply with a turn that has `points`. */
  onSummarise?: () => void;
  /** Retry was pressed on a seat that failed to answer. */
  onRetry?: (id: string) => void;
  /** Try again was pressed after the thread failed to load. */
  onReload?: () => void;
  /** Hold Summarise busy while the host writes the summary. @default false */
  summarising?: boolean;
  /** The moment relative times count from, in ms. @default defaultCouncilNow */
  now?: number;
  /** The conversation's name, in the header. @default "Basinworks Team pricing" */
  title?: string;
  /** How the person asking is named in the thread. @default "You" */
  you?: string;
  /** Whether the thread has arrived. @default "ready" */
  status?: CouncilStatus;
  /** Round discs, rounded tiles, or arch-topped seat backs. @default "disc" */
  seatShape?: CouncilSeatShape;
  /** Seat size, type size and spacing. @default "cozy" */
  density?: CouncilDensity;
  /** The baton, the floor ring, the addressee and Send: any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The surface's height in px; the thread scrolls inside. @default 540 */
  height?: number;
  /** The composer's placeholder. @default "Ask, or @ a specialist" */
  placeholder?: string;
  /** Read only: nothing can be addressed, sent or dismissed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
/** A fixed morning, so the default thread renders the same everywhere. */
export const defaultCouncilNow = Date.UTC(2026, 8, 14, 10, 30);
const N = defaultCouncilNow;

export const defaultCouncilSpecialists: CouncilSpecialist[] = [
  { id: "planning", name: "Planning", remit: "Rollout and timing" },
  { id: "legal", name: "Legal", remit: "Contracts and notice", initials: "LG" },
  {
    id: "finance",
    name: "Finance",
    remit: "Revenue and churn",
    initials: "FI",
  },
  { id: "support", name: "Support", remit: "Customers and tickets" },
];

export const defaultCouncilTurns: CouncilTurn[] = [
  {
    id: "q1",
    author: "you",
    at: N - 14 * MIN,
    text: "We're moving Basinworks Team from $18 to $24 a seat on 1 September. What do we need to get right?",
  },
  {
    id: "a1",
    author: "planning",
    at: N - 13 * MIN,
    text: "Ship it in two steps: $21 on 1 September for everyone, then $24 on 1 December. A smaller first jump keeps cancellations down while support learns which questions come up.",
  },
  {
    id: "a2",
    author: "legal",
    at: N - 11 * MIN,
    disputes: "a1",
    disputeNote: "two notices",
    text: "Two steps means two price-change notices. Contracts signed before June promise 60 days' notice of any change, so a second step can't land before 1 February. One change, announced once, is cleaner.",
  },
  {
    id: "a3",
    author: "finance",
    at: N - 8 * MIN,
    text: "At $24, revenue rises 21% even if 8% of teams leave. Holding $21 until December gives up about $310k, so I'd go in one step if Legal's notice holds.",
  },
];

/* ----------------------------------------------------------------------- */
/*                                Geometry                                  */
/* ----------------------------------------------------------------------- */

type Geo = {
  /** Avatar on the arc. */
  avatar: number;
  /** Avatar in the flattened row. */
  row: number;
  /** Avatar in the thread. */
  mini: number;
  /** The arc's box height. */
  arcH: number;
  /** How far the middle of the arc climbs above its ends. */
  ry: number;
  body: string;
  meta: string;
  pad: string;
  turnGap: string;
};

const DENSITY: Record<CouncilDensity, Geo> = {
  compact: {
    avatar: 34,
    row: 28,
    mini: 22,
    arcH: 134,
    ry: 56,
    body: "text-[12.5px] leading-[1.55]",
    meta: "text-[10.5px]",
    pad: "px-3",
    turnGap: "gap-3",
  },
  cozy: {
    avatar: 40,
    row: 32,
    mini: 24,
    arcH: 148,
    ry: 64,
    body: "text-[13px] leading-[1.6]",
    meta: "text-[11px]",
    pad: "px-4",
    turnGap: "gap-4",
  },
  roomy: {
    avatar: 46,
    row: 36,
    mini: 26,
    arcH: 164,
    ry: 72,
    body: "text-[14px] leading-[1.6]",
    meta: "text-[11.5px]",
    pad: "px-5",
    turnGap: "gap-5",
  },
};

/** Container width (px) at which the row opens into the arc: 34rem. */
const ARC_MIN = 544;
/** Room above the row for the baton's straight track. */
const ROW_TOP = 16;
/** The baton rides this far above an avatar's top edge, clear of a risen seat's ring. */
const BATON_GAP = 14;
/** The baton's line above the flattened row. */
const ROW_BATON = 5;
const SEAT_W = 124;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));

/** Seats share the upper half of an ellipse, evenly by angle, ends included. */
const seatAngle = (t: number, n: number) =>
  Math.PI + ((t + 0.5) / Math.max(1, n)) * Math.PI;

/** How high the end seats already sit, so they rest on the arc's floor line. */
const endLift = (n: number) => (n <= 1 ? 1 : -Math.sin(seatAngle(0, n)));

/** The avatar centre of the lowest seat: the arc's floor line, leaving room
 *  under it for the name and remit lines. */
const arcFloor = (g: Geo) => g.arcH - g.avatar / 2 - 40;

const arcPoint = (t: number, n: number, g: Geo) => {
  const a = seatAngle(t, n);
  return {
    xPct: 50 + Math.cos(a) * 40,
    y: arcFloor(g) - (-Math.sin(a) - endLift(n)) * g.ry,
    a,
  };
};

const initialsOf = (s: CouncilSpecialist) =>
  (s.initials ?? s.name.slice(0, 2)).toUpperCase();

const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

const mentionAt = (text: string, caret: number) => {
  const m = /(^|\s)@([\p{L}\p{N}-]*)$/u.exec(text.slice(0, caret));
  if (!m) return null;
  const query = m[2] ?? "";
  return { start: caret - query.length - 1, query };
};

const EMPTY: string[] = [];

/* ----------------------------------------------------------------------- */
/*                                 Avatar                                   */
/* ----------------------------------------------------------------------- */

type Tone = "idle" | "floor" | "failed" | "away";

const TONE: Record<Tone, string> = {
  idle: "border-hairline-strong bg-surface-2 text-ink-2",
  floor: "border-(--ct-line) bg-(--ct-wash) text-(--ct-accent)",
  failed: "border-danger/50 bg-surface-2 text-danger",
  away: "border-hairline bg-surface-1 text-ink-3",
};

function SeatAvatar({
  shape,
  size,
  initials,
  tone,
  fluid = false,
  className,
}: {
  shape: CouncilSeatShape;
  size: number;
  initials: string;
  tone: Tone;
  /** Size comes from the className (container-query seats), not from `size`. */
  fluid?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center border leading-none font-semibold tracking-[0.03em] transition-colors duration-200 select-none",
        shape === "disc" && "rounded-full",
        shape === "tile" && (size >= 30 ? "rounded-3" : "rounded-2"),
        shape === "arch" &&
          (size >= 30
            ? "rounded-t-full rounded-b-[6px]"
            : "rounded-t-full rounded-b-[3px]"),
        TONE[tone],
        className,
      )}
      style={
        fluid
          ? undefined
          : { width: size, height: size, fontSize: Math.round(size * 0.32) }
      }
    >
      {initials}
    </span>
  );
}

function Dots({ live }: { live: boolean }) {
  return (
    <span aria-hidden className="inline-flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "size-[3px] rounded-full bg-(--ct-accent)",
            live ? "animate-pulse" : "opacity-60",
          )}
          style={live ? { animationDelay: `${i * 160}ms` } : undefined}
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A chat answered by a council. The specialists sit along an arc above the
 * thread, and whoever holds the floor holds the baton: when the floor changes
 * the baton travels round the arc to the new seat on `springs.snap` — x, y
 * and its tilt all derived from one motion value, the seat index, so it is
 * seen passing the seats between — and that seat rises on the same spring
 * while the last one settles. The reply rises into the thread on
 * `springs.glide`, and a reply that disagrees with an earlier one draws a thin
 * bracket in the gutter back up to the message it disputes, a beat after it
 * lands.
 *
 * Seats are a toolbar: arrows walk the arc, Enter addresses a seat, Delete
 * dismisses it. Typing @ in the composer opens the council as a listbox. Under
 * 34rem the arc flattens into a row of avatars with the baton on a straight
 * track. Under reduced motion the baton jumps, the seat is marked by its ring,
 * and replies and brackets fade in whole.
 */
export function CouncilTable({
  specialists = defaultCouncilSpecialists,
  turns,
  defaultTurns = defaultCouncilTurns,
  onTurnsChange,
  floor,
  dismissed,
  defaultDismissed = EMPTY,
  onDismiss,
  onRestore,
  onAddressSpecialist,
  onSend,
  onSummarise,
  onRetry,
  onReload,
  summarising = false,
  now = defaultCouncilNow,
  title = "Basinworks Team pricing",
  you = "You",
  status = "ready",
  seatShape = "disc",
  density = "cozy",
  accent = "var(--accent-bright)",
  height = 540,
  placeholder = "Ask, or @ a specialist",
  disabled = false,
  className,
}: CouncilTableProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const listboxId = `${uid}-mentions`;
  const g = DENSITY[density] ?? DENSITY.cozy;

  /* ----------------------------- state ----------------------------- */

  const [ownTurns, setOwnTurns] = React.useState(defaultTurns);
  const list = turns ?? ownTurns;
  const [ownDismissed, setOwnDismissed] = React.useState(defaultDismissed);
  const away = dismissed ?? ownDismissed;

  const seats = specialists.filter((s) => !away.includes(s.id));
  const byId = new Map(specialists.map((s) => [s.id, s]));
  const n = seats.length;

  const thinking = seats.filter((s) => s.state === "thinking");
  const failed = seats.filter((s) => s.state === "failed");
  const lastSpeaker = [...list]
    .reverse()
    .find((t) => t.author !== "you" && !t.points && !away.includes(t.author));
  const floorId =
    floor !== undefined
      ? floor
      : (thinking[0]?.id ?? lastSpeaker?.author ?? null);
  const floorIndex = seats.findIndex((s) => s.id === floorId);

  const [addressee, setAddressee] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [mention, setMention] = React.useState<{
    start: number;
    query: string;
  } | null>(null);
  const [mentionActive, setMentionActive] = React.useState(0);
  const [roving, setRoving] = React.useState(0);
  const [lit, setLit] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);

  const options = mention
    ? seats.filter((s) => {
        const q = mention.query.toLowerCase();
        return (
          !q ||
          s.name.toLowerCase().startsWith(q) ||
          s.id.toLowerCase().startsWith(q) ||
          initialsOf(s).toLowerCase().startsWith(q)
        );
      })
    : [];
  const mentionOpen = mention !== null && options.length > 0;
  const activeOption = options[Math.min(mentionActive, options.length - 1)];

  /* --------------------------- refs, nodes -------------------------- */

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const seatRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const turnRefs = React.useRef(new Map<string, HTMLLIElement>());
  const flashTimer = React.useRef<number | null>(null);
  const [arcNode, setArcNode] = React.useState<HTMLDivElement | null>(null);
  const [listNode, setListNode] = React.useState<HTMLOListElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });

  React.useEffect(() => {
    if (!arcNode) return;
    const read = () => {
      const w = Math.round(arcNode.clientWidth);
      const h = Math.round(arcNode.clientHeight);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(arcNode);
    return () => ro.disconnect();
  }, [arcNode]);

  React.useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  /* ------------------------------ baton ----------------------------- */

  const arc = size.w >= ARC_MIN;
  const batonT = useMotionValue(Math.max(0, floorIndex));
  const bx = useMotionValue(0);
  const by = useMotionValue(0);
  const br = useMotionValue(0);
  const placed = React.useRef(false);

  // The geometry is read when the value changes, not captured in a
  // transform: a width or seat count change re-places the baton at once.
  React.useEffect(() => {
    if (size.w === 0 || n === 0) return;
    const place = (t: number) => {
      if (arc) {
        const p = arcPoint(t, n, g);
        const dx = -0.4 * size.w * Math.sin(p.a);
        const dy = g.ry * Math.cos(p.a);
        bx.set(r1((size.w * p.xPct) / 100));
        by.set(r1(p.y - g.avatar / 2 - BATON_GAP));
        br.set(r2((Math.atan2(dy, dx) * 180) / Math.PI));
      } else {
        bx.set(r1((size.w * (t + 0.5)) / n));
        by.set(ROW_BATON);
        br.set(0);
      }
    };
    place(batonT.get());
    return batonT.on("change", place);
  }, [arc, batonT, br, bx, by, g, n, size.w]);

  React.useEffect(() => {
    if (floorIndex < 0) return;
    if (!placed.current || !motionSafe) {
      placed.current = true;
      batonT.jump(floorIndex);
      return;
    }
    const c = animate(batonT, floorIndex, springs.snap);
    return () => c.stop();
  }, [batonT, floorIndex, motionSafe]);

  const track = React.useMemo(() => {
    if (size.w === 0 || n === 0) return "";
    if (!arc) {
      const a = r1((size.w * 0.15) / n);
      const b = r1(size.w - a);
      return `M ${a} ${ROW_BATON} H ${b}`;
    }
    const pts: string[] = [];
    const from = -0.32;
    const to = n - 0.68;
    for (let k = 0; k <= 28; k++) {
      const t = from + ((to - from) * k) / 28;
      const p = arcPoint(t, n, g);
      pts.push(
        `${r1((size.w * p.xPct) / 100)} ${r1(p.y - g.avatar / 2 - BATON_GAP)}`,
      );
    }
    return `M ${pts.join(" L ")}`;
  }, [arc, g, n, size.w]);

  /* ---------------------------- brackets ---------------------------- */

  type Bracket = {
    id: string;
    target: string;
    d: string;
    endY: number;
    gx: number;
  };
  const [brackets, setBrackets] = React.useState<Bracket[]>([]);
  const disputeKey = list
    .filter((t) => t.disputes)
    .map((t) => `${t.id}>${t.disputes}`)
    .join(",");

  React.useEffect(() => {
    if (!listNode) return;
    const measure = () => {
      const pairs = disputeKey
        ? disputeKey.split(",").map((p) => p.split(">") as [string, string])
        : [];
      // Longer spans take outer lanes, so nested disputes never cross.
      const spans = pairs
        .map(([from, to]) => {
          const a = turnRefs.current.get(from);
          const b = turnRefs.current.get(to);
          if (!a || !b) return null;
          const half = g.mini / 2;
          return {
            id: from,
            target: to,
            yA: a.offsetTop + half,
            yB: b.offsetTop + half,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((p, q) => p.yA - p.yB - (q.yA - q.yB));
      const lanes: { yA: number; yB: number }[][] = [];
      const next: Bracket[] = spans.map((s) => {
        let lane = lanes.findIndex((l) =>
          l.every((o) => s.yB >= o.yA || s.yA <= o.yB),
        );
        if (lane === -1) {
          lane = lanes.length;
          lanes.push([]);
        }
        lanes[lane]?.push(s);
        const gx = 16;
        const xl = Math.max(1.5, 10 - lane * 4);
        const rr = Math.min(4, (s.yA - s.yB) / 2);
        const d = [
          `M ${gx} ${r1(s.yA)}`,
          `H ${r1(xl + rr)}`,
          `Q ${xl} ${r1(s.yA)} ${xl} ${r1(s.yA - rr)}`,
          `V ${r1(s.yB + rr)}`,
          `Q ${xl} ${r1(s.yB)} ${r1(xl + rr)} ${r1(s.yB)}`,
          `H ${gx}`,
        ].join(" ");
        return { id: s.id, target: s.target, d, endY: r1(s.yB), gx };
      });
      setBrackets((prev) =>
        prev.length === next.length &&
        prev.every((p, i) => p.d === next[i]?.d && p.id === next[i]?.id)
          ? prev
          : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(listNode);
    return () => ro.disconnect();
  }, [listNode, disputeKey, g.mini]);

  /* --------------------------- auto-scroll -------------------------- */

  const thinkingKey = thinking.map((s) => s.id).join(",");
  const failedKey = failed.map((s) => s.id).join(",");
  const scrolled = React.useRef(false);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = el.scrollHeight - el.clientHeight;
    if (target - el.scrollTop < 2) return;
    if (!scrolled.current || !motionSafe) {
      scrolled.current = true;
      el.scrollTop = target;
      return;
    }
    const c = animate(el.scrollTop, target, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollTop = v;
      },
    });
    return () => c.stop();
  }, [status, list.length, thinkingKey, failedKey, motionSafe]);

  /* ----------------------------- actions ---------------------------- */

  const setTurns = (next: CouncilTurn[]) => {
    if (turns === undefined) setOwnTurns(next);
    onTurnsChange?.(next);
  };

  const address = (id: string | null, focusComposer = true) => {
    if (disabled) return;
    setAddressee(id);
    onAddressSpecialist?.(id);
    if (focusComposer) textareaRef.current?.focus();
  };

  const dismiss = (id: string) => {
    if (disabled) return;
    const index = seats.findIndex((s) => s.id === id);
    if (dismissed === undefined) setOwnDismissed((d) => [...d, id]);
    onDismiss?.(id);
    if (addressee === id) address(null, false);
    // Focus stays on the arc: the neighbour that slides into the gap.
    const neighbour = seats[index + 1] ?? seats[index - 1];
    if (neighbour) {
      setRoving(Math.max(0, Math.min(index, n - 2)));
      window.requestAnimationFrame(() =>
        seatRefs.current.get(neighbour.id)?.focus(),
      );
    }
  };

  const restore = (id: string) => {
    if (disabled) return;
    if (dismissed === undefined)
      setOwnDismissed((d) => d.filter((x) => x !== id));
    onRestore?.(id);
  };

  const send = () => {
    const text = draft.trim();
    if (!text || disabled || status !== "ready") return;
    const turn: CouncilTurn = {
      id: `you-${list.length}-${text.length}`,
      author: "you",
      text,
      at: now,
      ...(addressee ? { to: addressee } : {}),
    };
    setTurns([...list, turn]);
    onSend?.(text, addressee);
    setDraft("");
    setMention(null);
    setAddressee(null);
  };

  const pickMention = (s: CouncilSpecialist) => {
    if (!mention) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, mention.start).replace(/\s+$/, "");
    const after = draft.slice(caret).replace(/^\s+/, "");
    const next = before && after ? `${before} ${after}` : before || after;
    setDraft(next);
    setMention(null);
    setAddressee(s.id);
    onAddressSpecialist?.(s.id);
    window.requestAnimationFrame(() => {
      const pos = before.length + (before && after ? 1 : 0);
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  };

  const showDisputed = (targetId: string) => {
    const el = scrollRef.current;
    const li = turnRefs.current.get(targetId);
    if (!el || !li) return;
    const target = Math.max(0, li.offsetTop - 12);
    if (motionSafe) {
      animate(el.scrollTop, target, {
        ...springs.glide,
        onUpdate: (v) => {
          el.scrollTop = v;
        },
      });
    } else {
      el.scrollTop = target;
    }
    li.focus({ preventScroll: true });
    setFlash(targetId);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1400);
  };

  // Plain list items hold the refs (a motion element's ref must stay put);
  // the motion layer inside each one does the entering.
  const bindTurn = (id: string) => (node: HTMLLIElement | null) => {
    if (node) turnRefs.current.set(id, node);
    else turnRefs.current.delete(id);
  };

  const onSeatKey = (event: React.KeyboardEvent, index: number) => {
    const go = (i: number) => {
      const clamped = (i + n) % n;
      setRoving(clamped);
      const s = seats[clamped];
      if (s) seatRefs.current.get(s.id)?.focus();
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        go(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        go(index - 1);
        break;
      case "Home":
        event.preventDefault();
        go(0);
        break;
      case "End":
        event.preventDefault();
        go(n - 1);
        break;
      case "Delete":
      case "Backspace": {
        event.preventDefault();
        const s = seats[index];
        if (s) dismiss(s.id);
        break;
      }
      default:
        break;
    }
  };

  const onComposerKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setMentionActive(
          (a) =>
            (Math.min(a, options.length - 1) + step + options.length) %
            options.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        if (activeOption) pickMention(activeOption);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    if (
      event.key === "Backspace" &&
      addressee &&
      event.currentTarget.selectionStart === 0 &&
      event.currentTarget.selectionEnd === 0
    ) {
      event.preventDefault();
      address(null);
      return;
    }
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send();
    }
  };

  const onDraft = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.currentTarget.value;
    const caret = event.currentTarget.selectionStart ?? value.length;
    setDraft(value);
    const m = mentionAt(value, caret);
    setMention(m);
    if (m) setMentionActive(0);
  };

  // The composer grows with its text up to five lines, then scrolls.
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(112, el.scrollHeight)}px`;
  }, [draft, density]);

  /* --------------------------- announcement ------------------------- */

  const floorName = floorId ? byId.get(floorId)?.name : undefined;
  const announcement = failed[0]
    ? `${failed[0].name} couldn't answer.`
    : thinking[0]
      ? `${thinking[0].name} has the floor and is thinking.`
      : floorName
        ? `${floorName} has the floor.`
        : "";

  /* ------------------------------ styles ---------------------------- */

  const vars = {
    "--ct-accent": accent,
    "--ct-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
    "--ct-line": `color-mix(in oklab, ${accent} 48%, transparent)`,
    "--ct-solid": `oklch(from ${accent} 0.55 c h)`,
    "--ct-arch": `${g.arcH}px`,
    "--ct-rowh": `${ROW_TOP + g.row + 28}px`,
    "--ct-ava": `${g.avatar}px`,
    "--ct-avr": `${g.row}px`,
  } as React.CSSProperties;

  const focusRing =
    "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
  const ready = status === "ready";
  const replies = list.filter((t) => t.author !== "you").length;

  /* ------------------------------ seats ----------------------------- */

  const seatRow = (
    <div
      ref={setArcNode}
      role="toolbar"
      aria-label="Council"
      aria-describedby={hintId}
      aria-orientation="horizontal"
      className="relative h-(--ct-rowh) w-full shrink-0 @min-[34rem]/council-table:h-(--ct-arch)"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[8%] bottom-0 hidden h-3/5 rounded-t-[50%] bg-[radial-gradient(ellipse_at_50%_100%,color-mix(in_oklab,var(--ct-accent)_7%,transparent),transparent_70%)] @min-[34rem]/council-table:block"
      />
      {track ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-visible"
          width="100%"
          height="100%"
        >
          <path
            d={track}
            fill="none"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeDasharray="0.5 5"
            className="stroke-hairline-strong"
          />
        </svg>
      ) : null}

      {ready && floorIndex >= 0 && size.w > 0 ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 -mt-0.5 -ml-2.5 h-1 w-5 rounded-full bg-(--ct-accent) shadow-[0_0_0_2px_var(--card)]"
          style={{ x: bx, y: by, rotate: br }}
        />
      ) : null}

      {status === "loading"
        ? Array.from({ length: Math.max(3, n) }, (_, i) => {
            const k = Math.max(3, n);
            const p = arcPoint(i, k, g);
            const xr = r3(((i + 0.5) / k) * 100);
            return (
              <span
                key={i}
                aria-hidden
                className="absolute top-(--ct-tr) left-(--ct-lr) size-(--ct-avr) animate-pulse rounded-full bg-surface-2 @min-[34rem]/council-table:top-(--ct-ta) @min-[34rem]/council-table:left-(--ct-la) @min-[34rem]/council-table:size-(--ct-ava)"
                style={
                  {
                    "--ct-lr": `calc(${xr}% - ${g.row / 2}px)`,
                    "--ct-tr": `${ROW_TOP}px`,
                    "--ct-la": `calc(${r3(p.xPct)}% - ${g.avatar / 2}px)`,
                    "--ct-ta": `${r1(p.y - g.avatar / 2)}px`,
                  } as React.CSSProperties
                }
              />
            );
          })
        : null}

      {ready ? (
        <AnimatePresence initial={false}>
          {seats.map((s, i) => {
            const p = arcPoint(i, n, g);
            const xr = r3(((i + 0.5) / n) * 100);
            const isFloor = s.id === floorId;
            const state = s.state ?? "idle";
            const tone: Tone =
              state === "failed" ? "failed" : isFloor ? "floor" : "idle";
            const addressed = addressee === s.id;
            const label = [
              s.name,
              s.remit,
              state === "thinking" ? "thinking" : null,
              state === "failed" ? "couldn't answer" : null,
              isFloor ? "has the floor" : null,
              addressed ? "addressed" : null,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <motion.div
                key={s.id}
                layout={motionSafe ? "position" : false}
                transition={{ layout: springs.glide }}
                exit={
                  motionSafe
                    ? { opacity: 0, scale: 0.9, transition: exitFor() }
                    : { opacity: 0, transition: { duration: durations.fast } }
                }
                className={cn(
                  "group/council-table absolute top-(--ct-tr) left-(--ct-lr) w-(--ct-wr)",
                  "@min-[34rem]/council-table:top-(--ct-ta) @min-[34rem]/council-table:left-(--ct-la) @min-[34rem]/council-table:w-[124px]",
                )}
                style={
                  {
                    "--ct-lr": `calc(${xr}% - min(32px, ${r3(50 / n)}%))`,
                    "--ct-wr": `min(64px, ${r3(100 / n)}%)`,
                    "--ct-tr": `${ROW_TOP}px`,
                    "--ct-la": `calc(${r3(p.xPct)}% - ${SEAT_W / 2}px)`,
                    "--ct-ta": `${r1(p.y - g.avatar / 2)}px`,
                    zIndex: isFloor ? 2 : 1,
                  } as React.CSSProperties
                }
              >
                <motion.div
                  initial={false}
                  animate={{ y: isFloor ? (arc ? -6 : -3) : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                  className="relative"
                >
                  <button
                    ref={(node) => {
                      if (node) seatRefs.current.set(s.id, node);
                      else seatRefs.current.delete(s.id);
                    }}
                    type="button"
                    tabIndex={i === Math.min(roving, n - 1) ? 0 : -1}
                    aria-label={label}
                    aria-pressed={addressed}
                    aria-disabled={disabled || undefined}
                    onFocus={() => setRoving(i)}
                    onKeyDown={(event) => onSeatKey(event, i)}
                    onClick={() => address(addressed ? null : s.id)}
                    className={cn(
                      "flex w-full flex-col items-center gap-1 rounded-3 pb-0.5",
                      focusRing,
                      disabled ? "cursor-not-allowed" : "cursor-pointer",
                    )}
                  >
                    <span className="relative">
                      <SeatAvatar
                        shape={seatShape}
                        size={g.avatar}
                        fluid
                        initials={initialsOf(s)}
                        tone={tone}
                        className={cn(
                          "size-(--ct-avr) text-[length:calc(var(--ct-avr)*0.32)] @min-[34rem]/council-table:size-(--ct-ava) @min-[34rem]/council-table:text-[length:calc(var(--ct-ava)*0.32)]",
                          isFloor &&
                            state !== "failed" &&
                            "shadow-[0_0_0_2px_var(--card),0_0_0_3.5px_var(--ct-accent),0_10px_18px_-10px_var(--ct-accent)]",
                          state === "failed" &&
                            "shadow-[0_0_0_2px_var(--card),0_0_0_3.5px_var(--danger)]",
                          addressed &&
                            "outline-[1.5px] outline-offset-[5px] outline-(--ct-accent) outline-dashed",
                          !disabled &&
                            !isFloor &&
                            "group-hover/council-table:border-(--ct-line)",
                        )}
                      />
                      {state === "failed" ? (
                        <span
                          aria-hidden
                          className="absolute -right-1 -bottom-1 inline-flex size-4 items-center justify-center rounded-full border-2 border-card bg-danger text-destructive-foreground"
                        >
                          <TriangleAlert className="size-2.5" />
                        </span>
                      ) : null}
                      {state === "thinking" ? (
                        <span
                          aria-hidden
                          className="absolute -bottom-1.5 left-1/2 flex h-3 -translate-x-1/2 items-center rounded-full border border-hairline bg-card px-1 @min-[34rem]/council-table:hidden"
                        >
                          <Dots live={motionSafe} />
                        </span>
                      ) : null}
                    </span>
                    <span
                      title={s.name}
                      className={cn(
                        "max-w-full truncate text-[10.5px] leading-4 font-medium @min-[34rem]/council-table:text-[12px]",
                        isFloor ? "text-foreground" : "text-ink-2",
                      )}
                    >
                      {s.name}
                    </span>
                    <span className="hidden h-3.5 max-w-full items-center justify-center truncate text-[10.5px] leading-3.5 text-ink-3 @min-[34rem]/council-table:flex">
                      {state === "thinking" ? (
                        <span className="inline-flex items-center gap-1.5 text-(--ct-accent)">
                          thinking <Dots live={motionSafe} />
                        </span>
                      ) : state === "failed" ? (
                        <span className="text-danger">no answer</span>
                      ) : (
                        <span className="truncate" title={s.remit}>
                          {s.remit}
                        </span>
                      )}
                    </span>
                  </button>
                  {!disabled ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Dismiss ${s.name}`}
                      onClick={() => dismiss(s.id)}
                      className={cn(
                        "absolute top-[-4px] right-[calc(50%_-_var(--ct-avr)/2_-_8px)] inline-flex size-4 items-center justify-center rounded-full border border-hairline-strong bg-popover text-ink-3 opacity-0 transition-opacity duration-150",
                        "group-focus-within/council-table:opacity-100 group-hover/council-table:opacity-100 hover:text-foreground focus-visible:opacity-100",
                        "@min-[34rem]/council-table:right-[calc(50%_-_var(--ct-ava)/2_-_8px)]",
                        focusRing,
                      )}
                    >
                      <X aria-hidden className="size-2.5" />
                    </button>
                  ) : null}
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      ) : null}
    </div>
  );

  /* ------------------------------ thread ---------------------------- */

  const turnAvatar = (author: string) => {
    const s = byId.get(author);
    const isAway = away.includes(author);
    return (
      <SeatAvatar
        shape={seatShape}
        size={g.mini}
        initials={s ? initialsOf(s) : "··"}
        tone={isAway ? "away" : author === floorId ? "floor" : "idle"}
      />
    );
  };

  const enter = (delay = 0) =>
    motionSafe
      ? {
          initial: { opacity: 0, y: distances.step },
          animate: { opacity: 1, y: 0 },
          transition: {
            y: { ...springs.glide, delay },
            opacity: { duration: durations.base, ease: easings.enter, delay },
          },
        }
      : {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration: durations.fast },
        };

  const thread = (
    <div
      ref={scrollRef}
      role="log"
      aria-label={`${title} conversation`}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "relative flex-1 overflow-y-auto overscroll-contain border-t border-hairline [mask-image:linear-gradient(to_bottom,transparent,black_18px,black)] py-4",
        g.pad,
      )}
    >
      {status === "loading" ? (
        <div aria-hidden className={cn("flex flex-col", g.turnGap)}>
          {[78, 92, 64].map((w, i) => (
            <div key={i} className="flex gap-2.5 pl-5">
              <span className="size-6 shrink-0 animate-pulse rounded-full bg-surface-2" />
              <span className="flex flex-1 flex-col gap-1.5 pt-1">
                <span className="h-2.5 w-24 animate-pulse rounded-1 bg-surface-2" />
                <span
                  className="h-2.5 animate-pulse rounded-1 bg-surface-2"
                  style={{ width: `${w}%` }}
                />
              </span>
            </div>
          ))}
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-[13px] text-ink-2">
            Couldn’t load the conversation.
          </p>
          {onReload ? (
            <button
              type="button"
              onClick={onReload}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-xs text-foreground hover:bg-surface-2",
                focusRing,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        // The brackets live beside the list, not in it: an <ol> holds only
        // its items. The wrapper is the offset parent the turns measure from.
        <div className="relative mx-auto max-w-[46rem] pl-5">
          <svg
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 h-full w-5 overflow-visible"
          >
            <AnimatePresence initial={false}>
              {brackets.map((b) => {
                const on = lit === b.id;
                return (
                  <motion.g key={b.id} exit={{ opacity: 0 }}>
                    <motion.path
                      d={b.d}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={cn(
                        "transition-[stroke,stroke-width] duration-200",
                        on
                          ? "stroke-(--ct-accent) [stroke-width:1.75]"
                          : "stroke-ink-3/60 [stroke-width:1.25]",
                      )}
                      initial={motionSafe ? { pathLength: 0 } : { opacity: 0 }}
                      animate={motionSafe ? { pathLength: 1 } : { opacity: 1 }}
                      transition={
                        motionSafe
                          ? { ...springs.glide, delay: 0.28 }
                          : { duration: durations.fast }
                      }
                    />
                    <motion.circle
                      cx={b.gx}
                      cy={b.endY}
                      r={2}
                      className={on ? "fill-(--ct-accent)" : "fill-ink-3/70"}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: durations.fast,
                        delay: motionSafe ? 0.5 : 0,
                      }}
                    />
                  </motion.g>
                );
              })}
            </AnimatePresence>
          </svg>
          <ol
            ref={setListNode}
            aria-label="Turns"
            className={cn("flex flex-col", g.turnGap)}
          >
            <AnimatePresence initial={false}>
              {list.map((t) => {
                const s = byId.get(t.author);
                const target = t.disputes
                  ? list.find((x) => x.id === t.disputes)
                  : undefined;
                const targetName = target
                  ? target.author === "you"
                    ? you
                    : (byId.get(target.author)?.name ?? "an earlier reply")
                  : null;
                const highlighted =
                  flash === t.id ||
                  (lit !== null &&
                    list.find((x) => x.id === lit)?.disputes === t.id);
                const authorName =
                  t.author === "you" ? you : (s?.name ?? t.author);
                const time = ago(t.at, now);

                if (t.points) {
                  return (
                    <li
                      key={t.id}
                      ref={bindTurn(t.id)}
                      tabIndex={-1}
                      aria-label={`Council summary, ${time}`}
                      className={cn("rounded-3", focusRing)}
                    >
                      <motion.div
                        {...enter()}
                        className="rounded-3 border border-(--ct-line) bg-(--ct-wash) p-3"
                      >
                        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                          <Sparkles
                            aria-hidden
                            className="size-3.5 text-(--ct-accent)"
                          />
                          Where the council landed
                          <span
                            className={cn(
                              "ml-auto font-mono font-normal text-ink-3",
                              g.meta,
                            )}
                          >
                            {time}
                          </span>
                        </p>
                        {t.text ? (
                          <p className={cn("mb-2 text-ink-2", g.body)}>
                            {t.text}
                          </p>
                        ) : null}
                        <ul className="flex flex-col gap-2">
                          {t.points.map((pt, k, all) => {
                            const ps = byId.get(pt.specialist);
                            return (
                              <motion.li
                                key={`${pt.specialist}-${k}`}
                                className="flex gap-2"
                                {...enter(0.12 + k * cascade(all.length))}
                              >
                                <SeatAvatar
                                  shape={seatShape}
                                  size={20}
                                  initials={ps ? initialsOf(ps) : "··"}
                                  tone="idle"
                                  className="mt-px"
                                />
                                <span
                                  className={cn(
                                    "min-w-0 text-foreground",
                                    g.body,
                                  )}
                                >
                                  <span className="font-medium">
                                    {`${ps?.name ?? pt.specialist}:`}
                                  </span>{" "}
                                  <span className="text-ink-2">{pt.text}</span>
                                </span>
                              </motion.li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    </li>
                  );
                }

                if (t.author === "you") {
                  const to = t.to ? byId.get(t.to)?.name : undefined;
                  return (
                    <li
                      key={t.id}
                      ref={bindTurn(t.id)}
                      tabIndex={-1}
                      aria-label={`${authorName}${to ? ` to ${to}` : ""}, ${time}`}
                      className={cn("ml-auto max-w-[86%] rounded-3", focusRing)}
                    >
                      <motion.div
                        {...enter()}
                        className="flex flex-col items-end gap-1"
                      >
                        <span className={cn("font-mono text-ink-3", g.meta)}>
                          {to ? (
                            <span className="text-(--ct-accent)">{`to ${to} · `}</span>
                          ) : null}
                          {time}
                        </span>
                        <p
                          className={cn(
                            "rounded-3 rounded-tr-1 border px-3 py-2 text-foreground transition-colors duration-300",
                            highlighted
                              ? "border-(--ct-line) bg-(--ct-wash)"
                              : "border-hairline bg-surface-2",
                            g.body,
                          )}
                        >
                          {t.text}
                        </p>
                      </motion.div>
                    </li>
                  );
                }

                return (
                  <li
                    key={t.id}
                    ref={bindTurn(t.id)}
                    tabIndex={-1}
                    aria-label={`${authorName}, ${time}`}
                    className={cn("rounded-3", focusRing)}
                  >
                    <motion.div
                      {...enter()}
                      className={cn(
                        "-mx-2 flex gap-2.5 rounded-3 px-2 transition-colors duration-300",
                        highlighted ? "bg-(--ct-wash)" : "bg-transparent",
                      )}
                    >
                      {turnAvatar(t.author)}
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2 leading-6">
                          <span className="text-[12.5px] font-semibold text-foreground">
                            {authorName}
                          </span>
                          {s ? (
                            <span className={cn("text-ink-3", g.meta)}>
                              {s.remit}
                            </span>
                          ) : null}
                          <span className={cn("font-mono text-ink-3", g.meta)}>
                            {time}
                          </span>
                        </p>
                        <p className={cn("text-ink-2", g.body)}>{t.text}</p>
                        {target && targetName ? (
                          <button
                            type="button"
                            aria-label={`Show the message this disputes: ${targetName}, ${ago(target.at, now)}`}
                            onPointerEnter={() => setLit(t.id)}
                            onPointerLeave={() =>
                              setLit((v) => (v === t.id ? null : v))
                            }
                            onFocus={() => setLit(t.id)}
                            onBlur={() =>
                              setLit((v) => (v === t.id ? null : v))
                            }
                            onClick={() => showDisputed(target.id)}
                            className={cn(
                              "mt-1.5 inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border px-2 text-[11px] transition-colors duration-150",
                              lit === t.id
                                ? "border-(--ct-line) bg-(--ct-wash) text-(--ct-accent)"
                                : "border-hairline bg-surface-1 text-ink-2 hover:text-foreground",
                              focusRing,
                            )}
                          >
                            <CornerLeftUp
                              aria-hidden
                              className="size-3 shrink-0"
                            />
                            <span className="truncate">
                              {`Disagrees with ${targetName}${t.disputeNote ? ` · ${t.disputeNote}` : ""}`}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </motion.div>
                  </li>
                );
              })}

              {thinking.map((s) => (
                <motion.li
                  key={`thinking-${s.id}`}
                  {...enter()}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  className="flex items-center gap-2.5"
                >
                  {turnAvatar(s.id)}
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 text-ink-2",
                      g.body,
                    )}
                  >
                    {s.name} is thinking
                    <Dots live={motionSafe} />
                  </span>
                </motion.li>
              ))}

              {failed.map((s) => (
                <motion.li
                  key={`failed-${s.id}`}
                  {...enter()}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5"
                >
                  <SeatAvatar
                    shape={seatShape}
                    size={g.mini}
                    initials={initialsOf(s)}
                    tone="failed"
                  />
                  <span className={cn("text-danger", g.body)}>
                    {`${s.name} couldn’t answer.`}
                  </span>
                  {onRetry ? (
                    <button
                      type="button"
                      onClick={() => onRetry(s.id)}
                      className={cn(
                        "inline-flex h-6 items-center gap-1 rounded-full border border-hairline-strong px-2 text-[11px] text-foreground hover:bg-surface-2",
                        focusRing,
                      )}
                    >
                      <RotateCcw aria-hidden className="size-3" />
                      Retry
                    </button>
                  ) : null}
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>
      )}
    </div>
  );

  /* ----------------------------- composer --------------------------- */

  const addressed = addressee ? byId.get(addressee) : undefined;
  const canSend = ready && !disabled && draft.trim().length > 0;

  const composer = (
    <div className={cn("shrink-0 border-t border-hairline py-3", g.pad)}>
      <div className="relative mx-auto max-w-[46rem]">
        <AnimatePresence>
          {mentionOpen ? (
            <motion.ul
              id={listboxId}
              role="listbox"
              aria-label="Address a specialist"
              initial={
                motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
              className="absolute bottom-full left-0 z-20 mb-2 flex w-60 max-w-full flex-col gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1 shadow-lg"
            >
              {options.map((s) => {
                const active = s.id === activeOption?.id;
                return (
                  <li
                    key={s.id}
                    id={`${uid}-opt-${s.id}`}
                    role="option"
                    aria-selected={active}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => pickMention(s)}
                    onPointerEnter={() =>
                      setMentionActive(options.findIndex((o) => o.id === s.id))
                    }
                    className="relative flex h-9 cursor-pointer items-center gap-2 rounded-2 px-2"
                  >
                    {active ? (
                      <motion.span
                        layoutId={`${uid}-mention`}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                        className="absolute inset-0 rounded-2 bg-(--ct-wash)"
                      />
                    ) : null}
                    <SeatAvatar
                      shape={seatShape}
                      size={22}
                      initials={initialsOf(s)}
                      tone={active ? "floor" : "idle"}
                      className="relative"
                    />
                    <span className="relative min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                      {s.name}
                      <span className="ml-1.5 text-[11px] text-ink-3">
                        {s.remit}
                      </span>
                    </span>
                  </li>
                );
              })}
            </motion.ul>
          ) : null}
        </AnimatePresence>

        <div
          className={cn(
            "rounded-3 border bg-surface-1 transition-colors duration-150",
            "border-hairline-strong focus-within:border-(--ct-line)",
          )}
        >
          <AnimatePresence initial={false}>
            {addressed ? (
              <motion.div
                key="to"
                initial={
                  motionSafe ? { opacity: 0, scale: 0.92 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
                style={{ originX: 0 }}
                className="flex px-2.5 pt-2"
              >
                <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-(--ct-line) bg-(--ct-wash) pr-1 pl-1 text-[11.5px] text-(--ct-accent)">
                  <SeatAvatar
                    shape={seatShape}
                    size={16}
                    initials={initialsOf(addressed)}
                    tone="floor"
                    className="text-[7px]"
                  />
                  To {addressed.name}
                  <button
                    type="button"
                    aria-label={`Stop addressing ${addressed.name}`}
                    onClick={() => address(null)}
                    className={cn(
                      "inline-flex size-4 items-center justify-center rounded-full hover:bg-(--ct-wash)",
                      focusRing,
                    )}
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="flex items-end gap-1.5 p-1.5 pl-3">
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              disabled={disabled}
              aria-disabled={!ready || undefined}
              readOnly={!ready}
              onChange={onDraft}
              onKeyDown={onComposerKey}
              onBlur={() => setMention(null)}
              onClick={(event) => {
                const value = event.currentTarget.value;
                const caret =
                  event.currentTarget.selectionStart ?? value.length;
                setMention(mentionAt(value, caret));
              }}
              placeholder={addressed ? `Ask ${addressed.name}…` : placeholder}
              aria-label={
                addressed
                  ? `Message to ${addressed.name}`
                  : "Message the council"
              }
              role="combobox"
              aria-expanded={mentionOpen}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                mentionOpen && activeOption
                  ? `${uid}-opt-${activeOption.id}`
                  : undefined
              }
              className={cn(
                "min-w-0 flex-1 resize-none bg-transparent py-1.5 text-foreground outline-none placeholder:text-ink-3",
                g.body,
              )}
            />
            <button
              type="button"
              aria-label="Address a specialist"
              disabled={disabled}
              onClick={() => {
                const el = textareaRef.current;
                if (!el) return;
                const caret = el.selectionStart ?? draft.length;
                const lead =
                  caret > 0 && !/\s$/.test(draft.slice(0, caret)) ? " @" : "@";
                const next = draft.slice(0, caret) + lead + draft.slice(caret);
                setDraft(next);
                setMention({ start: caret + lead.length - 1, query: "" });
                setMentionActive(0);
                el.focus();
                window.requestAnimationFrame(() =>
                  textareaRef.current?.setSelectionRange(
                    caret + lead.length,
                    caret + lead.length,
                  ),
                );
              }}
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
                focusRing,
              )}
            >
              <AtSign aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Send"
              aria-disabled={!canSend || undefined}
              onClick={send}
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-2 transition-colors duration-150",
                canSend
                  ? "bg-(--ct-solid) text-primary-foreground hover:bg-(--ct-accent)"
                  : "bg-surface-2 text-ink-3",
                focusRing,
              )}
            >
              <SendHorizontal aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ------------------------------ render ---------------------------- */

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container/council-table relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...vars, height }}
    >
      <header
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3.5 pb-1",
          g.pad,
        )}
      >
        <div className="min-w-0">
          <h2
            id={titleId}
            className="truncate text-[14px] leading-5 font-semibold"
          >
            {title}
          </h2>
          <p className={cn("font-mono text-ink-3", g.meta)}>
            {n} {n === 1 ? "specialist" : "specialists"} · {replies}{" "}
            {replies === 1 ? "reply" : "replies"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {away.map((id) => {
            const s = byId.get(id);
            if (!s) return null;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                aria-label={`Bring ${s.name} back to the table`}
                onClick={() => restore(id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-hairline-strong pr-2.5 pl-1 text-[11.5px] text-ink-2 hover:text-foreground disabled:opacity-50",
                  focusRing,
                )}
              >
                <SeatAvatar
                  shape={seatShape}
                  size={18}
                  initials={initialsOf(s)}
                  tone="away"
                  className="text-[7px]"
                />
                {s.name}
                <RotateCcw aria-hidden className="size-3" />
              </button>
            );
          })}
          {onSummarise ? (
            <button
              type="button"
              aria-disabled={disabled || summarising || !ready || undefined}
              aria-busy={summarising || undefined}
              onClick={() => {
                if (!disabled && !summarising && ready) onSummarise();
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline-strong px-2.5 text-[11.5px] text-foreground transition-colors duration-150 hover:border-(--ct-line) hover:bg-(--ct-wash)",
                (disabled || !ready) && "opacity-50",
                focusRing,
              )}
            >
              {summarising ? (
                <LoaderCircle
                  aria-hidden
                  className={cn("size-3.5", motionSafe && "animate-spin")}
                />
              ) : (
                <Sparkles aria-hidden className="size-3.5 text-(--ct-accent)" />
              )}
              {summarising ? "Summarising" : "Summarise"}
            </button>
          ) : null}
        </div>
      </header>

      {seatRow}
      {thread}
      {composer}

      <p id={hintId} className="sr-only">
        Arrow keys move between seats, Enter addresses one, Delete dismisses it.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
