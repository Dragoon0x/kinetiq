"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import { Copy, Link2, RotateCcw, UserPlus } from "lucide-react";

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

export type EmptyRoomPerson = {
  id: string;
  /** Full name; the first word is used where the seat is short of room. */
  name: string;
  /** Their job, read back on the placard. */
  role?: string;
  /** Why the directory suggested them, read back while their seat is pointed at. */
  reason?: string;
};

export type EmptyRoomSeatShape = "round" | "square" | "chair";
export type EmptyRoomStatus = "ready" | "loading";

export type EmptyRoomProps = {
  /** People from the directory, one per seat in clockwise order from the top left. @default defaultEmptyRoomSuggestions */
  suggestions?: EmptyRoomPerson[];
  /** Controlled: ids of the people already invited. */
  invited?: string[];
  /** Initial invited ids when uncontrolled. @default [] */
  defaultInvited?: string[];
  /** Fires with every invited id once an invite has gone through. */
  onInvitedChange?: (ids: string[]) => void;
  /** A seat was pressed. Return a promise to show the invite in flight; a rejection marks the seat for a retry. */
  onInvite?: (person: EmptyRoomPerson) => void | Promise<unknown>;
  /** The share link was copied. */
  onCopyLink?: (link: string) => void;
  /** The space's share link, shown in the header and copied by Copy. @default "basinworks/join/harbour-ops-7qf2" */
  inviteLink?: string;
  /** The new space's name. @default "Harbour Ops" */
  spaceName?: string;
  /** Where the suggestions come from, in the copy. @default "Basinworks directory" */
  directory?: string;
  /** When the space was created, in ms. @default four minutes before `now` */
  createdAt?: number;
  /** The moment ages count from, in ms — never read from the clock. @default defaultEmptyRoomNow */
  now?: number;
  /** Whether the suggestions have arrived. Loading draws blank seats. @default "ready" */
  status?: EmptyRoomStatus;
  /** How many chairs the table seats, 4 to 10. @default 8 */
  seatCount?: number;
  /** Seats as circles, rounded squares, or chairs whose backs face away from the table. @default "round" */
  seatShape?: EmptyRoomSeatShape;
  /** The colour of a taken seat, its welcome ring and the table's warmth. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Offer Invite all, which seats everyone left in one run around the table. @default true */
  inviteAll?: boolean;
  /** Nothing can be invited or copied. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Monday 12 October 2026, 09:40 UTC — the morning the space was made. */
export const defaultEmptyRoomNow = Date.UTC(2026, 9, 12, 9, 40);

/** The dock operations crew, as the Basinworks directory would suggest them. */
export const defaultEmptyRoomSuggestions: EmptyRoomPerson[] = [
  {
    id: "p-mara",
    name: "Mara Lind",
    role: "Dock lead",
    reason: "Runs the morning berth plan",
  },
  {
    id: "p-tomas",
    name: "Tomas Ferrer",
    role: "Crane operator",
    reason: "On every harbour thread this month",
  },
  {
    id: "p-ines",
    name: "Ines Okafor",
    role: "Logistics",
    reason: "Owns the container schedule",
  },
  {
    id: "p-kenji",
    name: "Kenji Arai",
    role: "Safety officer",
    reason: "Signs off berth changes",
  },
  {
    id: "p-priya",
    name: "Priya Nair",
    role: "Ops analyst",
    reason: "Built the tide dashboard",
  },
  {
    id: "p-joel",
    name: "Joel Varga",
    role: "Night shift",
    reason: "Same team as Mara",
  },
  {
    id: "p-sade",
    name: "Sade Bello",
    role: "Customs liaison",
    reason: "Named in the space brief",
  },
  {
    id: "p-rui",
    name: "Rui Costa",
    role: "Pilot boats",
    reason: "Works the outer harbour",
  },
  {
    id: "p-anouk",
    name: "Anouk Vos",
    role: "Finance",
    reason: "Approves berth invoices",
  },
  {
    id: "p-lev",
    name: "Lev Petrov",
    role: "Engineering",
    reason: "Keeps the gate sensors running",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase();
};
const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;

/** "just now", "4 min ago", "3 h ago": a fixed formatter, so both renders agree. */
const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

/** "Mara", "Mara and Tomas", "Mara, Tomas and Ines", "Mara, Tomas, Ines and 2 more". */
const nameList = (names: string[]) => {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
};

type Side = "top" | "bottom" | "left" | "right";
type SeatSpot = { x: string; y: string; side: Side; rot: string };

/** The table's footprint inside the stage, in percent. */
const TABLE = { x0: 22, x1: 78, y0: 31, y1: 69 };
/** From the table's edge to a seat's centre, px. */
const REACH = 32;

/**
 * Seats around a meeting table, clockwise from the top left so Tab walks
 * round it: the long sides share the seats, and the ends take one each once
 * there are six or more (an odd count leaves the foot of the table empty).
 * Positions mix percent with px so the table stretches with the container
 * while the seats keep their distance from its edge.
 */
function seatLayout(n: number): SeatSpot[] {
  const ends = n >= 6 ? (n % 2 === 0 ? 2 : 1) : n % 2;
  const sides = n - ends;
  const top = Math.ceil(sides / 2);
  const bottom = sides - top;
  const along = (i: number, count: number) =>
    r3(TABLE.x0 + ((i + 0.5) / count) * (TABLE.x1 - TABLE.x0));
  const spots: SeatSpot[] = [];
  for (let i = 0; i < top; i += 1) {
    spots.push({
      x: `${along(i, top)}%`,
      y: `calc(${TABLE.y0}% - ${REACH}px)`,
      side: "top",
      rot: "0deg",
    });
  }
  if (ends === 2) {
    spots.push({
      x: `calc(${TABLE.x1}% + ${REACH + 4}px)`,
      y: "50%",
      side: "right",
      rot: "90deg",
    });
  }
  for (let i = bottom - 1; i >= 0; i -= 1) {
    spots.push({
      x: `${along(i, bottom)}%`,
      y: `calc(${TABLE.y1}% + ${REACH}px)`,
      side: "bottom",
      rot: "180deg",
    });
  }
  if (ends >= 1) {
    spots.push({
      x: `calc(${TABLE.x0}% - ${REACH + 4}px)`,
      y: "50%",
      side: "left",
      rot: "270deg",
    });
  }
  return spots;
}

/** In view and the tab showing: the only time a loop may run. */
function useLive(node: Element | null): boolean {
  const [live, setLive] = React.useState(false);
  React.useEffect(() => {
    if (!node) return;
    let seen = false;
    let shown = !document.hidden;
    const update = () => setLive(seen && shown);
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) seen = entry.isIntersecting;
      update();
    });
    io.observe(node);
    const onVisibility = () => {
      shown = !document.hidden;
      update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [node]);
  return live;
}

/* ----------------------------------------------------------------------- */
/*                                 The seat                                 */
/* ----------------------------------------------------------------------- */

type SeatState = "ghost" | "pending" | "seated" | "failed";

/** The pigment of a taken seat: the accent's hue at a fixed lightness, so it reads the same in both themes. */
const pigmentOf = (accent: string) =>
  `oklch(from ${accent} 0.6 calc(c * 0.9) h)`;

/**
 * A seat's outline. The dash pattern is an attribute, not a style: motion
 * does not re-apply a changed plain style on an SVG element it manages.
 */
function SeatOutline({
  shape,
  dash = "3 3.4",
  className,
  style,
}: {
  shape: EmptyRoomSeatShape;
  dash?: string;
  className?: string;
  style?: React.ComponentProps<typeof motion.circle>["style"];
}) {
  if (shape === "square") {
    return (
      <motion.rect
        x={1.5}
        y={1.5}
        width={37}
        height={37}
        rx={10}
        strokeWidth={1.5}
        strokeDasharray={dash}
        className={className}
        style={style}
      />
    );
  }
  return (
    <motion.circle
      cx={20}
      cy={20}
      r={shape === "chair" ? 14 : 18.5}
      strokeWidth={1.5}
      strokeDasharray={dash}
      className={className}
      style={style}
    />
  );
}

/**
 * One seat's drawing. A change to seated plays the hop: up on a short enter
 * tween, down on recoil — the landing spring, two small bounces — while the
 * solid disc grows in on snap and one ring leaves the seat. The seat that was
 * seated when it mounted never hops: the effect compares with the state it
 * last saw, so StrictMode's rehearsal finds nothing changed.
 */
function SeatGlyph({
  state,
  shape,
  initials,
  accent,
  orbit,
  motionSafe,
}: {
  state: SeatState;
  shape: EmptyRoomSeatShape;
  initials: string;
  accent: string;
  orbit: boolean;
  motionSafe: boolean;
}) {
  const y = useMotionValue(0);
  const squash = useMotionValue(1);
  const ringScale = useMotionValue(1);
  const ringOpacity = useMotionValue(0);
  const dash = useMotionValue(0);
  const seen = React.useRef(state);

  React.useEffect(() => {
    const was = seen.current;
    seen.current = state;
    if (state !== "seated" || was === "seated" || !motionSafe) return;
    let alive = true;
    const running: AnimationPlaybackControls[] = [];
    const rise = animate(y, -10, { duration: 0.14, ease: easings.enter });
    running.push(
      rise,
      animate(squash, 1.06, { duration: 0.14, ease: easings.enter }),
    );
    void rise.then(() => {
      if (!alive) return;
      running.push(
        animate(y, 0, springs.recoil),
        animate(squash, 1, springs.recoil),
      );
    });
    ringScale.jump(1);
    ringOpacity.jump(0.5);
    running.push(
      animate(ringScale, 1.7, { duration: 0.55, ease: easings.enter }),
      animate(ringOpacity, 0, { duration: 0.55, ease: easings.enter }),
    );
    return () => {
      alive = false;
      for (const c of running) c.stop();
      y.jump(0);
      squash.jump(1);
      ringOpacity.jump(0);
    };
  }, [state, motionSafe, y, squash, ringScale, ringOpacity]);

  // The orbit is the only loop: the dashes march while the invite is in
  // flight, and only while the room is on screen.
  React.useEffect(() => {
    if (!orbit || !motionSafe) return;
    const c = animate(dash, dash.get() - 12.8, {
      duration: 1.2,
      ease: "linear",
      repeat: Infinity,
    });
    return () => c.stop();
  }, [orbit, motionSafe, dash]);

  const seated = state === "seated";
  const failed = state === "failed";
  const pending = state === "pending";
  const pigment = pigmentOf(accent);

  return (
    <motion.span
      aria-hidden
      className="absolute inset-0"
      style={{ y, scaleY: squash, originX: "50%", originY: "100%" }}
    >
      <motion.span
        className={cn(
          "pointer-events-none absolute inset-0 border-2",
          shape === "square" ? "rounded-[11px]" : "rounded-full",
          shape === "chair" && "inset-[5px]",
        )}
        style={{
          borderColor: accent,
          scale: ringScale,
          opacity: ringOpacity,
        }}
      />
      <svg
        viewBox="0 0 40 40"
        className={cn(
          "absolute inset-0 size-full overflow-visible",
          shape === "chair" && "@min-[30rem]/empty-room:rotate-(--seat-rot)",
        )}
      >
        {shape === "chair" ? (
          <path
            d="M 7.5 7 Q 20 -1.5 32.5 7"
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            className={cn(
              "transition-[stroke] duration-300",
              seated
                ? "stroke-(--er-pigment)"
                : failed
                  ? "stroke-danger/60"
                  : "stroke-ink-3/45 group-hover/empty-room-seat:stroke-(--er-accent) group-focus-visible/empty-room-seat:stroke-(--er-accent)",
            )}
          />
        ) : null}
        <SeatOutline
          shape={shape}
          className={cn(
            "fill-card transition-[stroke] duration-300",
            failed
              ? "stroke-danger"
              : pending
                ? "stroke-(--er-accent)"
                : "stroke-ink-3/55 group-hover/empty-room-seat:stroke-(--er-accent) group-focus-visible/empty-room-seat:stroke-(--er-accent)",
          )}
          dash={pending && !motionSafe ? "1 3.2" : "3 3.4"}
          style={{ strokeDashoffset: dash }}
        />
      </svg>
      <SeatDisc
        seated={seated}
        shape={shape}
        motionSafe={motionSafe}
        pigment={pigment}
      />
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center text-[11px] leading-none font-semibold tracking-[0.02em] transition-colors duration-300",
          seated
            ? "text-primary-foreground"
            : failed
              ? "text-danger"
              : "text-ink-3 group-hover/empty-room-seat:text-foreground group-focus-visible/empty-room-seat:text-foreground",
        )}
      >
        {pending && !motionSafe ? "…" : initials}
      </span>
    </motion.span>
  );
}

/** The solid seat: hidden while the seat is a ghost, grown in on snap when it is taken. */
function SeatDisc({
  seated,
  shape,
  motionSafe,
  pigment,
}: {
  seated: boolean;
  shape: EmptyRoomSeatShape;
  motionSafe: boolean;
  pigment: string;
}) {
  return (
    <motion.span
      className={cn(
        "absolute",
        shape === "square" ? "inset-0 rounded-[11px]" : "rounded-full",
        shape === "round" && "inset-0",
        shape === "chair" && "inset-[6px]",
      )}
      style={{ backgroundColor: pigment }}
      initial={false}
      animate={{
        opacity: seated ? 1 : 0,
        scale: seated || !motionSafe ? 1 : 0.55,
      }}
      transition={
        motionSafe
          ? {
              scale: springs.snap,
              opacity: { duration: durations.fast, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The room                                 */
/* ----------------------------------------------------------------------- */

type Said = { n: number; text: string };

/**
 * The empty state of a space nobody has joined yet: a table seen from above
 * with a dashed ghost seat for each suggested person. Inviting someone turns
 * their seat solid with a small hop — up on an enter tween, down on recoil —
 * while one ring leaves it, the table's fill warms and the copy above moves
 * from waiting to welcoming. Invite all runs the hops round the table on
 * `cascade()`. A seat whose invite fails turns danger with a retry mark and
 * Enter tries again; loading draws blank seats; under 30rem the table folds
 * into a bench with the seats in a row.
 *
 * Seats are real buttons in clockwise order, so Tab walks round the table
 * (arrows, Home and End do too) and Enter invites; Copy writes the share link
 * and says so. Under reduced motion seats cross-fade solid without the hop
 * and the in-flight orbit is a still dotted ring.
 */
export function EmptyRoom({
  suggestions = defaultEmptyRoomSuggestions,
  invited,
  defaultInvited,
  onInvitedChange,
  onInvite,
  onCopyLink,
  inviteLink = "basinworks/join/harbour-ops-7qf2",
  spaceName = "Harbour Ops",
  directory = "Basinworks directory",
  createdAt,
  now = defaultEmptyRoomNow,
  status = "ready",
  seatCount = 8,
  seatShape = "round",
  accent = "var(--accent-bright)",
  inviteAll = true,
  disabled = false,
  className,
}: EmptyRoomProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const loading = status === "loading";
  const n = clamp(Math.round(seatCount), 4, 10);
  const spots = React.useMemo(() => seatLayout(n), [n]);
  const people = loading ? [] : suggestions.slice(0, n);

  /* ------------------------------- state -------------------------------- */

  const [ownInvited, setOwnInvited] = React.useState<string[]>(
    () => defaultInvited ?? [],
  );
  const invitedList = invited ?? ownInvited;
  const invitedSet = React.useMemo(() => new Set(invitedList), [invitedList]);
  const [pending, setPending] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [failed, setFailed] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pointed, setPointed] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  const live = useLive(root);

  // Invites settle after the render that started them, so they read the
  // latest props and lists from here rather than from a stale closure.
  const latest = React.useRef({
    invited,
    invitedList,
    onInvitedChange,
    people,
    n,
  });
  React.useEffect(() => {
    latest.current = { invited, invitedList, onInvitedChange, people, n };
  });
  const inFlight = React.useRef(new Set<string>());
  const timers = React.useRef(new Set<number>());
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    const pendingTimers = timers.current;
    return () => {
      alive.current = false;
      for (const t of pendingTimers) window.clearTimeout(t);
      pendingTimers.clear();
    };
  }, []);

  const seatButtons = React.useRef(new Map<string, HTMLButtonElement>());

  /* ------------------------------ actions ------------------------------- */

  const takenOf = (ids: readonly string[], list: EmptyRoomPerson[]) => {
    const set = new Set(ids);
    return list.filter((p) => set.has(p.id)).length;
  };

  const settle = (person: EmptyRoomPerson, ok: boolean) => {
    inFlight.current.delete(person.id);
    setPending(new Set(inFlight.current));
    if (!ok) {
      setFailed((f) => new Set(f).add(person.id));
      say(
        `Couldn't invite ${person.name}. Press Enter on the seat to try again.`,
      );
      return;
    }
    const cur = latest.current;
    const next = cur.invitedList.includes(person.id)
      ? cur.invitedList
      : [...cur.invitedList, person.id];
    cur.invitedList = next;
    if (cur.invited === undefined) setOwnInvited(next);
    cur.onInvitedChange?.(next);
    const taken = takenOf(next, cur.people);
    say(
      taken >= cur.n
        ? `Invited ${person.name}. Every seat is taken.`
        : `Invited ${person.name}. ${taken} of ${cur.n} seats taken.`,
    );
  };

  const invite = (person: EmptyRoomPerson) => {
    if (disabled || loading) return;
    if (
      latest.current.invitedList.includes(person.id) ||
      inFlight.current.has(person.id)
    ) {
      return;
    }
    inFlight.current.add(person.id);
    setPending(new Set(inFlight.current));
    setFailed((f) => {
      if (!f.has(person.id)) return f;
      const next = new Set(f);
      next.delete(person.id);
      return next;
    });
    let result: void | Promise<unknown>;
    try {
      result = onInvite?.(person);
    } catch (error) {
      result = Promise.reject(error);
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(
        () => {
          if (alive.current) settle(person, true);
        },
        () => {
          if (alive.current) settle(person, false);
        },
      );
    } else {
      settle(person, true);
    }
  };

  const remaining = people.filter(
    (p) => !invitedSet.has(p.id) && !pending.has(p.id),
  );

  const inviteEveryone = () => {
    if (disabled || loading || remaining.length === 0) return;
    const step = cascade(remaining.length) * 1000;
    remaining.forEach((person, i) => {
      if (i === 0) {
        invite(person);
        return;
      }
      const t = window.setTimeout(
        () => {
          timers.current.delete(t);
          invite(person);
        },
        Math.round(i * step),
      );
      timers.current.add(t);
    });
  };

  const copyTimer = React.useRef<number | null>(null);
  const copyLink = () => {
    if (disabled) return;
    try {
      void navigator.clipboard?.writeText(inviteLink).catch(() => {});
    } catch {
      // No clipboard here; the host still hears about the copy.
    }
    onCopyLink?.(inviteLink);
    setCopied(true);
    say("Invite link copied.");
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current);
      timers.current.delete(copyTimer.current);
    }
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      copyTimer.current = null;
      setCopied(false);
    }, 1800);
    copyTimer.current = t;
    timers.current.add(t);
  };

  const onSeatKeyDown = (event: React.KeyboardEvent, index: number) => {
    const order = people.map((p) => p.id);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      to = index - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = order.length - 1;
    else return;
    event.preventDefault();
    const wrapped = (to + order.length) % order.length;
    const id = order[wrapped];
    if (id) seatButtons.current.get(id)?.focus();
  };

  /* ------------------------------- copy --------------------------------- */

  const taken = takenOf(invitedList, people);
  const takenNames = people
    .filter((p) => invitedSet.has(p.id))
    .map((p) => firstName(p.name));
  const open = n - taken;

  let headline: string;
  let sub: string;
  let phase: string;
  if (loading) {
    phase = "loading";
    headline = `Finding people for ${spaceName}`;
    sub = `Looking through the ${directory}.`;
  } else if (taken === 0) {
    phase = "empty";
    headline = "Nobody's here yet.";
    sub =
      people.length === 0
        ? `No one in the ${directory} matches yet. Share the link to fill the table.`
        : `${spaceName} is ready for the people who belong in it, suggested from the ${directory}.`;
  } else if (taken >= n) {
    phase = "full";
    headline = "The table is full.";
    sub = `Welcome to ${spaceName}, ${nameList(takenNames)}.`;
  } else if (taken === 1) {
    phase = "one";
    headline = `${takenNames[0] ?? "One person"} is in. Who else belongs here?`;
    sub = `${plural(open, "more seat")} around the table.`;
  } else {
    // Counts change in place: a cross-fade per count would leave the line
    // blank while Invite all runs.
    phase = "some";
    headline = `${taken} of ${n} seats taken.`;
    sub = `Welcome, ${nameList(takenNames)}.`;
  }

  const pointedPerson = pointed
    ? people.find((p) => p.id === pointed)
    : undefined;
  const stateOf = (id: string): SeatState =>
    invitedSet.has(id)
      ? "seated"
      : pending.has(id)
        ? "pending"
        : failed.has(id)
          ? "failed"
          : "ghost";

  let placardKey = "count";
  let placardTop = loading
    ? "Setting the table"
    : `${taken} of ${n} seats taken`;
  let placardBottom = loading
    ? "Suggestions are on their way"
    : people.length === 0
      ? "Every seat is open"
      : "Each seat is someone from the directory";
  if (pointedPerson) {
    const s = stateOf(pointedPerson.id);
    placardKey = `${pointedPerson.id}-${s}`;
    placardTop = pointedPerson.name;
    placardBottom =
      s === "seated"
        ? `Invited${pointedPerson.role ? ` · ${pointedPerson.role}` : ""}`
        : s === "pending"
          ? "Sending the invite…"
          : s === "failed"
            ? "The invite didn't go through · try again"
            : (pointedPerson.reason ?? pointedPerson.role ?? "Invite");
  }

  const warmth = n > 0 ? taken / n : 0;
  const tableStyle: React.CSSProperties = {
    backgroundColor: `color-mix(in oklab, ${accent} ${r3(warmth * 7)}%, var(--bg-2))`,
    borderColor: `color-mix(in oklab, ${accent} ${r3(warmth * 40)}%, var(--hairline-strong))`,
  };

  const createdLabel = ago(now - (createdAt ?? now - 4 * MIN));
  const crossfade = {
    initial: { opacity: 0, y: motionSafe ? distances.nudge : 0 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: exitFor(durations.base) },
    transition: { duration: durations.base, ease: easings.enter },
  };

  /* ------------------------------- render ------------------------------- */

  return (
    <section
      ref={setRoot}
      aria-labelledby={titleId}
      className={cn(
        "@container/empty-room w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          "--er-accent": accent,
          "--er-pigment": pigmentOf(accent),
        } as React.CSSProperties
      }
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-hairline px-3 py-3 @min-[30rem]/empty-room:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-2 text-[12px] font-semibold text-foreground"
            style={{
              backgroundColor: `color-mix(in oklab, ${accent} 16%, transparent)`,
            }}
          >
            {initialsOf(spaceName)}
          </span>
          <div className="min-w-0">
            <p id={titleId} className="truncate text-sm font-semibold">
              {spaceName}
            </p>
            <p className="truncate text-[11px] text-ink-3">
              New space · created {createdLabel}
            </p>
          </div>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 @min-[30rem]/empty-room:w-auto @min-[30rem]/empty-room:max-w-[20rem] @min-[30rem]/empty-room:flex-1 @min-[30rem]/empty-room:justify-end">
          <span className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-2 border border-hairline bg-surface-2 px-2.5 font-mono text-[11px] text-ink-2">
            <Link2 aria-hidden className="size-3.5 shrink-0 text-ink-3" />
            <span className="truncate" title={inviteLink}>
              {inviteLink}
            </span>
          </span>
          <button
            type="button"
            onClick={copyLink}
            aria-disabled={disabled || undefined}
            aria-label={copied ? "Link copied" : "Copy invite link"}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
              disabled && "cursor-not-allowed",
              FOCUS_RING,
            )}
          >
            <span aria-hidden className="relative flex size-3.5 shrink-0">
              {copied ? (
                <svg viewBox="0 0 16 16" className="size-3.5">
                  <motion.path
                    d="M3 8.5 L6.5 12 L13 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: motionSafe ? 0 : 1 }}
                    animate={{ pathLength: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                </svg>
              ) : (
                <Copy className="size-3.5" />
              )}
            </span>
            <span className="grid">
              <span
                className={cn(
                  "transition-opacity [grid-area:1/1]",
                  copied && "opacity-0",
                )}
              >
                Copy
              </span>
              <span
                className={cn(
                  "transition-opacity [grid-area:1/1]",
                  !copied && "opacity-0",
                )}
              >
                Copied
              </span>
            </span>
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-5 px-3 pt-5 pb-4 @min-[30rem]/empty-room:px-4">
        <div className="grid text-center">
          <AnimatePresence initial={false}>
            <motion.div
              key={phase}
              className="flex flex-col items-center gap-1 [grid-area:1/1]"
              {...crossfade}
            >
              <p className="text-[15px] leading-snug font-semibold text-balance">
                {headline}
              </p>
              <p className="max-w-md text-[13px] leading-snug text-balance text-ink-2">
                {sub}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative flex flex-col items-center gap-4 @min-[30rem]/empty-room:block @min-[30rem]/empty-room:h-[252px]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[22%] inset-y-[31%] hidden rounded-[28px] border transition-[background-color,border-color] duration-500 @min-[30rem]/empty-room:block"
            style={tableStyle}
          />

          <ul
            aria-label={`Seats at ${spaceName}`}
            aria-busy={loading || undefined}
            className="flex flex-wrap justify-center gap-x-1.5 gap-y-3 @min-[30rem]/empty-room:pointer-events-none @min-[30rem]/empty-room:absolute @min-[30rem]/empty-room:inset-0"
          >
            {spots.map((spot, i) => {
              const person = people[i];
              const vars = {
                "--seat-x": spot.x,
                "--seat-y": spot.y,
                "--seat-rot": spot.rot,
              } as React.CSSProperties;
              const labelSpot =
                spot.side === "top"
                  ? "@min-[30rem]/empty-room:bottom-full @min-[30rem]/empty-room:mb-1"
                  : "@min-[30rem]/empty-room:top-full @min-[30rem]/empty-room:mt-1";
              const li = cn(
                "relative flex w-[52px] flex-col items-center gap-1.5",
                "@min-[30rem]/empty-room:pointer-events-auto @min-[30rem]/empty-room:absolute @min-[30rem]/empty-room:top-(--seat-y) @min-[30rem]/empty-room:left-(--seat-x) @min-[30rem]/empty-room:size-10 @min-[30rem]/empty-room:-translate-x-1/2 @min-[30rem]/empty-room:-translate-y-1/2 @min-[30rem]/empty-room:gap-0",
              );
              const labelBase = cn(
                "max-w-[52px] truncate text-center text-[11px] leading-[14px] transition-colors duration-300",
                "@min-[30rem]/empty-room:absolute @min-[30rem]/empty-room:left-1/2 @min-[30rem]/empty-room:max-w-[72px] @min-[30rem]/empty-room:-translate-x-1/2",
                labelSpot,
              );

              if (!person) {
                return (
                  <li key={`open-${i}`} aria-hidden className={li} style={vars}>
                    <span
                      className={cn(
                        "relative size-10 shrink-0",
                        loading && "motion-safe:animate-pulse",
                      )}
                    >
                      <svg
                        viewBox="0 0 40 40"
                        className={cn(
                          "absolute inset-0 size-full overflow-visible",
                          seatShape === "chair" &&
                            "@min-[30rem]/empty-room:rotate-(--seat-rot)",
                        )}
                      >
                        {seatShape === "chair" ? (
                          <path
                            d="M 7.5 7 Q 20 -1.5 32.5 7"
                            fill="none"
                            strokeWidth={3}
                            strokeLinecap="round"
                            className="stroke-ink-3/25"
                          />
                        ) : null}
                        <SeatOutline
                          shape={seatShape}
                          className="fill-surface-2 stroke-ink-3/35"
                        />
                      </svg>
                    </span>
                    {loading ? (
                      <span
                        className={cn(
                          labelBase,
                          "block h-2 w-8 rounded-full bg-surface-2",
                        )}
                      />
                    ) : (
                      <span className={cn(labelBase, "text-ink-3/70")}>
                        Open
                      </span>
                    )}
                  </li>
                );
              }

              const state = stateOf(person.id);
              const name =
                state === "seated"
                  ? `${person.name}${person.role ? `, ${person.role}` : ""}, invited`
                  : state === "pending"
                    ? `Inviting ${person.name}`
                    : state === "failed"
                      ? `Retry inviting ${person.name}, the invite failed`
                      : `Invite ${person.name}${person.role ? `, ${person.role}` : ""}`;
              const inert =
                disabled || state === "seated" || state === "pending";

              return (
                <li key={person.id} className={li} style={vars}>
                  <button
                    ref={(node) => {
                      if (node) seatButtons.current.set(person.id, node);
                      else seatButtons.current.delete(person.id);
                    }}
                    type="button"
                    aria-label={name}
                    aria-describedby={hintId}
                    aria-disabled={inert || undefined}
                    onClick={() => {
                      if (!inert) invite(person);
                    }}
                    onKeyDown={(event) => onSeatKeyDown(event, i)}
                    onFocus={() => setPointed(person.id)}
                    onBlur={() =>
                      setPointed((p) => (p === person.id ? null : p))
                    }
                    onPointerEnter={() => setPointed(person.id)}
                    onPointerLeave={() =>
                      setPointed((p) => (p === person.id ? null : p))
                    }
                    className={cn(
                      "group/empty-room-seat relative size-10 shrink-0 touch-manipulation",
                      seatShape === "square"
                        ? "rounded-[11px]"
                        : "rounded-full",
                      inert ? "cursor-default" : "cursor-pointer",
                      FOCUS_RING,
                    )}
                  >
                    <SeatGlyph
                      state={state}
                      shape={seatShape}
                      initials={initialsOf(person.name)}
                      accent={accent}
                      orbit={state === "pending" && live}
                      motionSafe={motionSafe}
                    />
                    <AnimatePresence initial={false}>
                      {state === "failed" ? (
                        <motion.span
                          aria-hidden
                          className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border-2 border-card bg-danger text-destructive-foreground"
                          initial={{ opacity: 0, scale: motionSafe ? 0.4 : 1 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={
                            motionSafe
                              ? {
                                  scale: springs.snap,
                                  opacity: { duration: durations.fast },
                                }
                              : { duration: durations.fast }
                          }
                        >
                          <RotateCcw className="size-2.5" strokeWidth={3} />
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </button>
                  <span
                    aria-hidden
                    title={person.name}
                    className={cn(
                      labelBase,
                      state === "seated"
                        ? "font-medium text-foreground"
                        : state === "failed"
                          ? "text-danger"
                          : "text-ink-3",
                    )}
                  >
                    {firstName(person.name)}
                  </span>
                </li>
              );
            })}
          </ul>

          <div
            aria-hidden
            className="h-2.5 w-full max-w-60 rounded-full border transition-[background-color,border-color] duration-500 @min-[30rem]/empty-room:hidden"
            style={tableStyle}
          />

          <div
            aria-hidden
            className="pointer-events-none grid w-full text-center @min-[30rem]/empty-room:absolute @min-[30rem]/empty-room:inset-x-[22%] @min-[30rem]/empty-room:inset-y-[31%] @min-[30rem]/empty-room:w-auto @min-[30rem]/empty-room:place-items-center @min-[30rem]/empty-room:px-4"
          >
            <AnimatePresence initial={false}>
              <motion.div
                key={placardKey}
                className="flex min-w-0 flex-col items-center gap-0.5 [grid-area:1/1]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                <span className="max-w-full truncate text-[13px] font-medium text-foreground">
                  {placardTop}
                </span>
                <span
                  className={cn(
                    "max-w-full truncate text-[11px]",
                    placardKey.endsWith("-failed")
                      ? "text-danger"
                      : "text-ink-3",
                  )}
                >
                  {placardBottom}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {inviteAll ? (
        <footer className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-3 @min-[30rem]/empty-room:px-4">
          <p className="hidden min-w-0 truncate text-[12px] text-ink-3 @min-[30rem]/empty-room:block">
            Anyone with the link can ask to join.
          </p>
          <button
            type="button"
            onClick={inviteEveryone}
            aria-disabled={
              disabled || loading || remaining.length === 0 || undefined
            }
            className={cn(
              "inline-flex h-8 w-full shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors @min-[30rem]/empty-room:w-auto",
              remaining.length === 0 || loading || disabled
                ? "cursor-default border border-hairline text-ink-3"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
              FOCUS_RING,
            )}
          >
            <UserPlus aria-hidden className="size-3.5 shrink-0" />
            {loading
              ? "Invite all"
              : remaining.length === 0
                ? pending.size > 0
                  ? "Sending invites…"
                  : people.length === 0
                    ? "No one to invite"
                    : "Everyone invited"
                : remaining.length === people.length
                  ? `Invite all ${remaining.length}`
                  : `Invite the other ${remaining.length}`}
          </button>
        </footer>
      ) : null}

      <p id={hintId} className="sr-only">
        Tab or the arrow keys move round the table. Enter invites the person in
        that seat.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
