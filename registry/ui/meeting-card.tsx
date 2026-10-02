"use client";

import * as React from "react";

import { Check, ChevronDown, Video } from "lucide-react";
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
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MeetingAttendee = {
  id: string;
  name: string;
  /** When they joined; absent or null while they have not. */
  joinedAt?: Date | number | null;
  /** A picture instead of initials: an `<img>` or any node, filling the circle. */
  image?: React.ReactNode;
};

export type MeetingAgendaItem = {
  id: string;
  title: string;
  /** How long the item runs, in minutes; times are counted from the start. */
  minutes: number;
  /** Who leads it, shown as initials at the row's end. */
  owner?: string;
};

export type MeetingAgendaMode = "sheet" | "rows";

export type MeetingCardProps = {
  /** The meeting's name: the card's heading. @default "Design review" */
  title?: string;
  /** Where it happens, after the times. @default "Fern room · video" */
  place?: string;
  /** When it starts. @default 2 Oct 2026, 10:30 UTC */
  start?: Date | number;
  /** When it ends. @default 2 Oct 2026, 11:15 UTC */
  end?: Date | number;
  /** The clock. Update it (every second, say) for a live countdown; the card never reads the time itself. @default 10:26 UTC */
  now?: Date | number;
  /** The zone times print in, so server and client print the same. @default "UTC" */
  timeZone?: string;
  /** Who is invited; each lights up once `now` passes their `joinedAt`. @default defaultAttendees */
  attendees?: MeetingAttendee[];
  /** The agenda under the card. @default defaultAgenda */
  agendaItems?: MeetingAgendaItem[];
  /** Controlled: the viewer has joined. */
  joined?: boolean;
  /** Initially joined when uncontrolled. @default false */
  defaultJoined?: boolean;
  /** Fires from the Join press, with true for joined. */
  onJoinedChange?: (joined: boolean) => void;
  /** Controlled: the agenda is pulled out. */
  open?: boolean;
  /** Initially pulled out when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the drag, press or key that pulled the agenda out or pushed it back. */
  onOpenChange?: (open: boolean) => void;
  /** The countdown window the ring spans before the start, in minutes. @default 5 */
  ring?: number;
  /** How strongly the Join button breathes once the meeting is live, 0 to 1. @default 0.5 */
  glow?: number;
  /** How the agenda comes out: in one pull, or a row at a time with a detent at each. @default "sheet" */
  agenda?: MeetingAgendaMode;
  /** Agenda rows shown before the sheet scrolls inside. @default 3 */
  agendaRows?: number;
  /** The Join button's text. @default "Join" */
  joinLabel?: string;
  /** Its text once joined; the button keeps the wider label's width. @default "Joined" */
  joinedLabel?: string;
  /** Its text after the end, when it is disabled. @default "Ended" */
  endedLabel?: string;
  /** The viewer's own face, lit when joined. @default "You" */
  youLabel?: string;
  /** The countdown ring and the Join button. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The heading's level. @default 3 */
  headingLevel?: 2 | 3 | 4;
  /** A chime as the viewer joins, a tick at each agenda detent. Off unless asked for. @default false */
  sound?: boolean;
  /** @default false */
  disabled?: boolean;
  className?: string;
};

const DAY = Date.UTC(2026, 9, 2);
const at = (h: number, m: number, s = 0) =>
  DAY + ((h * 60 + m) * 60 + s) * 1000;

export const defaultAttendees: MeetingAttendee[] = [
  { id: "ines", name: "Ines Okafor", joinedAt: at(10, 24) },
  { id: "tomas", name: "Tomas Varga", joinedAt: at(10, 25, 30) },
  { id: "mei", name: "Mei Tanaka", joinedAt: at(10, 28, 10) },
  { id: "rafa", name: "Rafa Duarte", joinedAt: at(10, 29, 20) },
  { id: "odile", name: "Odile Marchand", joinedAt: at(10, 30, 5) },
  { id: "kwame", name: "Kwame Asante", joinedAt: null },
];

export const defaultAgenda: MeetingAgendaItem[] = [
  { id: "goals", title: "Welcome and goals", minutes: 5, owner: "Ines Okafor" },
  {
    id: "search",
    title: "Search results review",
    minutes: 15,
    owner: "Mei Tanaka",
  },
  {
    id: "nav",
    title: "Mobile navigation options",
    minutes: 10,
    owner: "Rafa Duarte",
  },
  {
    id: "a11y",
    title: "Accessibility pass",
    minutes: 10,
    owner: "Odile Marchand",
  },
  {
    id: "owners",
    title: "Decisions and owners",
    minutes: 5,
    owner: "Tomas Varga",
  },
];

/** One agenda row and the sheet's inner padding, in px. */
const ROW = 24;
const PAD = 4;
/** How much of the sheet sits tucked under the card's lower edge. */
const TUCK = 6;
/** The most faces shown before a "+N". */
const FACES = 6;
/** The ring's drawing: radius, and its circumference. */
const R = 28;
const C = Number((2 * Math.PI * R).toFixed(3));

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const ms = (t: Date | number) => (typeof t === "number" ? t : t.getTime());
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const HUES = [0, 48, 96, 150, 205, 255, 310];

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/** "10:30" in the given zone, from Intl's numbers only. */
function clockOf(t: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(t));
  const part = (type: string) =>
    String(Number(parts.find((p) => p.type === type)?.value ?? 0)).padStart(
      2,
      "0",
    );
  return `${part("hour")}:${part("minute")}`;
}

/**
 * Digit columns that roll to each new digit. Each column keeps an invisible
 * copy of its digit in flow: its width, and a baseline, so it sits on the
 * line with the text around it.
 */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const chars = text.split("");
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {chars.map((ch, i) => {
        const key = chars.length - i;
        if (!/\d/.test(ch)) return <span key={`c${key}`}>{ch}</span>;
        return (
          <span
            key={`d${key}`}
            className="relative inline-block overflow-clip leading-[1.25em]"
          >
            <span className="invisible">{ch}</span>
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${-Number(ch) * 1.25}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} className="block h-[1.25em] leading-[1.25em]">
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/** One attendee. Lights up — fills, lands on recoil, sends a ring out — when it turns lit. */
function Face({
  id,
  name,
  image,
  lit,
  motionSafe,
}: {
  id: string;
  name: string;
  image?: React.ReactNode;
  lit: boolean;
  motionSafe: boolean;
}) {
  const turn = HUES[hash(id) % HUES.length] ?? 0;
  const faceRef = React.useRef<HTMLSpanElement | null>(null);
  const bloomRef = React.useRef<HTMLSpanElement | null>(null);
  const was = React.useRef(lit);
  React.useEffect(() => {
    if (was.current === lit) return;
    was.current = lit;
    const face = faceRef.current;
    const bloom = bloomRef.current;
    if (!lit || !motionSafe || !face || !bloom) return;
    const land = animate(face, { scale: [0.88, 1] }, springs.recoil);
    const ring = animate(
      bloom,
      { scale: [1, 1.7], opacity: [0.7, 0] },
      { duration: 0.6, ease: easings.enter },
    );
    return () => {
      // Finished, not frozen, if the effect runs again.
      land.complete();
      ring.complete();
    };
  }, [lit, motionSafe]);

  return (
    <span className="relative grid size-7 shrink-0 place-items-center @max-[34rem]:size-6">
      <span
        ref={bloomRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full border-2 border-success opacity-0"
      />
      <span
        ref={faceRef}
        aria-hidden
        className={cn(
          "grid size-7 place-items-center overflow-clip rounded-full text-[10px] font-medium shadow-[0_0_0_2px_var(--card)] transition-[background-color,color,opacity] duration-300 @max-[34rem]:size-6",
          // Opaque, so an empty seat hides the one it overlaps.
          !lit && "border border-dashed border-ink-3/70 bg-card text-ink-3",
        )}
        style={
          lit
            ? {
                backgroundColor: `oklch(from var(--accent) 0.84 0.07 calc(h + ${turn}))`,
                color: `oklch(from var(--accent) 0.32 0.07 calc(h + ${turn}))`,
              }
            : undefined
        }
      >
        {image && lit ? image : initials(name)}
      </span>
    </span>
  );
}

/**
 * An upcoming-meeting card that counts down to the start and lights up as
 * people arrive. A ring around the start time drains over the last `ring`
 * minutes; at the start it swells and settles on recoil, turns the live
 * colour, and fills with the share of the meeting gone by. Attendees are
 * dashed outlines until `now` passes their `joinedAt`, when each fills with
 * its colour, lands on recoil and sends one ring out. Once live, Join
 * breathes — a halo that swells and fades, `glow` strong, only while the card
 * is on screen — and joining lights your own face at the end of the row.
 *
 * The agenda is a sheet tucked under the card whose lip peeks out of its
 * lower edge. Drag the lip and the sheet follows 1:1, rubber-banded past its
 * end; a release commits by projection on snap, to open or closed, or with
 * `agenda="rows"` to the nearest row, ticking as each row passes. The lip is
 * a disclosure button: Enter or Space toggles and moves focus into the
 * agenda, arrows pull it out and push it back, Escape closes. Under reduced
 * motion the ring steps, faces light by colour alone, Join holds a steady
 * halo, and the sheet goes straight to its detent.
 */
export function MeetingCard({
  title = "Design review",
  place = "Fern room · video",
  start = at(10, 30),
  end = at(11, 15),
  now = at(10, 26),
  timeZone = "UTC",
  attendees = defaultAttendees,
  agendaItems = defaultAgenda,
  joined,
  defaultJoined = false,
  onJoinedChange,
  open,
  defaultOpen = false,
  onOpenChange,
  ring = 5,
  glow = 0.5,
  agenda = "sheet",
  agendaRows = 3,
  joinLabel = "Join",
  joinedLabel = "Joined",
  endedLabel = "Ended",
  youLabel = "You",
  accent = "var(--accent-bright)",
  headingLevel = 3,
  sound = false,
  disabled = false,
  className,
}: MeetingCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const sheetId = `${uid}-sheet`;
  const hintId = `${uid}-hint`;
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

  const t0 = ms(start);
  const t1 = Math.max(t0 + 60000, ms(end));
  const t = ms(now);
  const phase: "before" | "live" | "ended" =
    t < t0 ? "before" : t < t1 ? "live" : "ended";
  const windowMs = Math.max(1, ring) * 60000;
  const remaining = clamp01((t0 - t) / windowMs);
  const elapsed = clamp01((t - t0) / (t1 - t0));

  const [ownJoined, setOwnJoined] = React.useState(defaultJoined);
  const isJoined = phase !== "ended" && (joined ?? ownJoined);
  const here = attendees.filter((a) => {
    const j = a.joinedAt;
    return j !== undefined && j !== null && ms(j) <= t;
  });
  const hereIds = new Set(here.map((a) => a.id));
  // The viewer is on the invite too: their own face waits at the end.
  const total = attendees.length + 1;
  const present = here.length + (isJoined ? 1 : 0);

  // The countdown's words: whole minutes, then seconds in the last one.
  const left = Math.max(0, t0 - t);
  const countdown =
    left >= 60000
      ? `in ${Math.ceil(left / 60000)}m`
      : `in ${Math.ceil(left / 1000)}s`;
  const startText = clockOf(t0, timeZone);
  const endText = clockOf(t1, timeZone);
  const ringLabel =
    phase === "before"
      ? `Starts at ${startText}, ${left >= 60000 ? `in ${Math.ceil(left / 60000)} minutes` : "in under a minute"}`
      : phase === "live"
        ? `Live since ${startText}, ${Math.round(elapsed * 100)}% through`
        : `Ended at ${endText}`;

  // What the live region says: arrivals and the start, frozen as they happen.
  const [said, setSaid] = React.useState({
    phase,
    here: [...hereIds].sort().join(","),
    words: "",
  });
  const hereKey = [...hereIds].sort().join(",");
  if (said.phase !== phase || said.here !== hereKey) {
    const before = new Set(said.here.split(",").filter(Boolean));
    const arrived = here.filter((a) => !before.has(a.id)).map((a) => a.name);
    const words =
      phase === "live" && said.phase === "before"
        ? `${title} is live`
        : arrived.length > 0
          ? `${arrived.join(", ")} joined`
          : said.words;
    setSaid({ phase, here: hereKey, words });
  }

  // ---------------------------------------------------------------- ring
  const countArc = useMotionValue(phase === "before" ? remaining : 0);
  const liveArc = useMotionValue(phase === "live" ? elapsed : 0);
  const swell = useMotionValue(4);
  const pulse = useMotionValue(0);
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  const run = (key: string, controls: AnimationPlaybackControls) => {
    runs.current.get(key)?.stop();
    runs.current.set(key, controls);
  };
  React.useEffect(() => {
    const all = runs.current;
    return () => {
      for (const c of all.values()) c.stop();
      all.clear();
    };
  }, []);

  const countTo = phase === "before" ? r2(remaining) : 0;
  const liveTo = phase === "live" ? Number(elapsed.toFixed(4)) : 0;
  React.useEffect(() => {
    if (!motionSafe) {
      countArc.jump(countTo);
      liveArc.jump(liveTo);
      return;
    }
    // Each new `now` is a tick: the ring eases to it, so a host that ticks
    // often gets a continuous drain and one that ticks each second a clock.
    const tick = { duration: durations.slow, ease: easings.enter };
    run("count", animate(countArc, countTo, tick));
    run("live", animate(liveArc, liveTo, tick));
  }, [countTo, liveTo, motionSafe, countArc, liveArc]);

  // The start: the ring swells and settles, and one ring goes out.
  const shownPhase = React.useRef(phase);
  React.useEffect(() => {
    if (shownPhase.current === phase) return;
    const from = shownPhase.current;
    shownPhase.current = phase;
    if (!motionSafe || from !== "before" || phase !== "live") return;
    swell.jump(7.5);
    run("swell", animate(swell, 4, springs.recoil));
    pulse.jump(0);
    run("pulse", animate(pulse, 1, { duration: 0.7, ease: easings.enter }));
  }, [phase, motionSafe, swell, pulse]);

  const countDash = useTransform(countArc, (a) => `${r2(a * C)} ${C}`);
  const liveDash = useTransform(liveArc, (a) => `${r2(a * C)} ${C}`);
  const pulseR = useTransform(pulse, (p) => r2(R + 3 * p));
  const pulseOpacity = useTransform(pulse, (p) =>
    p > 0 && p < 1 ? r2(0.7 * (1 - p)) : 0,
  );

  // ---------------------------------------------------------------- join
  const [onScreen, setOnScreen] = React.useState(false);
  const [pageHidden, setPageHidden] = React.useState(false);
  const rootRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e) setOnScreen(e.isIntersecting);
    });
    io.observe(root);
    return () => io.disconnect();
  }, []);
  React.useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const strength = clamp01(glow);
  const breath = useMotionValue(0);
  const breathing =
    phase === "live" &&
    !isJoined &&
    !disabled &&
    motionSafe &&
    strength > 0 &&
    onScreen &&
    !pageHidden;
  React.useEffect(() => {
    if (!breathing) {
      const settle = animate(breath, 0, { duration: durations.base });
      return () => settle.stop();
    }
    breath.jump(0);
    const loop = animate(breath, 1, {
      duration: 1.2,
      ease: "easeInOut",
      repeat: Infinity,
      repeatType: "mirror",
    });
    return () => loop.stop();
  }, [breathing, breath]);
  const halo = useTransform(breath, (b) => {
    if (phase !== "live" || isJoined || disabled || strength === 0)
      return "0 0 0 0 transparent";
    if (!motionSafe)
      return `0 0 0 3px color-mix(in oklab, ${accent} ${Math.round(30 * strength)}%, transparent)`;
    return `0 0 0 ${r2(1 + 7 * b * strength)}px color-mix(in oklab, ${accent} ${Math.round((1 - b) * 50 * strength)}%, transparent)`;
  });

  const joinRef = React.useRef<HTMLButtonElement | null>(null);
  const toggleJoin = () => {
    if (disabled || phase === "ended") return;
    const next = !isJoined;
    audio.play("chime", { pitch: next ? 1 : 0.8, gain: next ? 0.5 : 0.25 });
    if (joined === undefined) setOwnJoined(next);
    onJoinedChange?.(next);
  };

  // ---------------------------------------------------------------- agenda
  const items = agendaItems;
  const maxRows = Math.max(0, Math.min(items.length, Math.round(agendaRows)));
  const heightFor = (k: number) => TUCK + (k <= 0 ? 0 : PAD * 2 + k * ROW);
  const full = heightFor(maxRows);
  const rowsMode = agenda === "rows";
  /** The row a sheet height reaches, counting from the first. */
  const rowAt = (h: number) =>
    Math.floor((Math.max(TUCK, Math.min(full, h)) - TUCK - PAD) / ROW);
  const [detent, setDetent] = React.useState(defaultOpen ? maxRows : 0);
  const isOpen = open ?? detent > 0;
  const shownDetent = isOpen
    ? Math.min(maxRows, detent > 0 ? (rowsMode ? detent : maxRows) : maxRows)
    : 0;

  const pull = useMotionValue(heightFor(shownDetent));
  const peek = useMotionValue(0);
  const dragging = React.useRef(false);
  const dragFrom = React.useRef(0);
  const lastRow = React.useRef(0);
  const nextVelocity = React.useRef(0);
  const [hovered, setHovered] = React.useState(false);
  const [within, setWithin] = React.useState(false);

  const settle = (h: number, velocity = 0) => {
    if (!motionSafe) {
      runs.current.get("pull")?.stop();
      pull.jump(h);
      return;
    }
    run("pull", animate(pull, h, { ...springs.snap, velocity }));
  };

  const latest = React.useRef({ settle, heightFor });
  React.useEffect(() => {
    latest.current = { settle, heightFor };
  });

  // Every change of where the sheet should rest — a drag, a key, the host —
  // runs the same spring, carrying the release velocity when there is one.
  const restAt = heightFor(shownDetent);
  React.useEffect(() => {
    if (dragging.current) return;
    latest.current.settle(restAt, nextVelocity.current);
    nextVelocity.current = 0;
  }, [restAt]);

  // The lip peeks a little further while the card is hovered or focused.
  const peeking = (hovered || within) && shownDetent === 0 && !disabled;
  React.useEffect(() => {
    if (!motionSafe) {
      peek.jump(0);
      return;
    }
    const p = animate(peek, peeking ? 4 : 0, springs.snap);
    return () => p.stop();
  }, [peeking, motionSafe, peek]);

  const sheetH = useTransform(
    [pull, peek] as MotionValue<number>[],
    ([p = 0, k = 0]: number[]) => r2(Math.max(0, p) + k),
  );

  const [region, setRegion] = React.useState<HTMLDivElement | null>(null);
  const wantRegion = React.useRef(false);
  React.useEffect(() => {
    if (shownDetent === 0 || !region || !wantRegion.current) return;
    wantRegion.current = false;
    region.focus({ preventScroll: true });
  }, [shownDetent, region]);
  const lipRef = React.useRef<HTMLButtonElement | null>(null);

  const commit = (k: number, velocity = 0, focusIn = false) => {
    if (disabled) return;
    const to = Math.max(0, Math.min(maxRows, Math.round(k)));
    const willOpen = to > 0;
    // Uncontrolled, or not a change of open: this lands. Controlled and a
    // change: the sheet goes back to where the host says it is, and moves
    // again only if the host takes the change.
    const lands = open === undefined || willOpen === isOpen;
    const target = lands
      ? willOpen
        ? rowsMode
          ? to
          : maxRows
        : 0
      : shownDetent;
    if (willOpen && focusIn) wantRegion.current = true;
    audio.play("tick", {
      pitch: r2(0.85 + (to / Math.max(1, maxRows)) * 0.5),
      gain: to === 0 ? 0.25 : 0.4,
    });
    setDetent(to);
    // Where the effect will not run, because the rest does not move, the
    // sheet settles here with the throw's velocity; otherwise the effect
    // carries it.
    if (heightFor(target) === restAt) settle(restAt, velocity);
    else nextVelocity.current = velocity;
    if (willOpen !== isOpen) onOpenChange?.(willOpen);
  };

  const close = (focusLip: boolean) => {
    commit(0);
    if (focusLip) lipRef.current?.focus({ preventScroll: true });
  };

  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled: disabled || maxRows === 0,
    onStart: () => {
      dragging.current = true;
      runs.current.get("pull")?.stop();
      dragFrom.current = pull.get();
      lastRow.current = rowAt(pull.get());
    },
    onMove: ({ offset }) => {
      const raw = dragFrom.current + offset.y;
      const h = rubberClamp(raw, TUCK, full, Math.max(ROW * 2, full));
      pull.set(r2(h));
      if (rowsMode) {
        const row = rowAt(h);
        if (row !== lastRow.current) {
          audio.play("tick", {
            pitch: r2(0.85 + (Math.max(0, row) / Math.max(1, maxRows)) * 0.5),
            gain: 0.3,
          });
          lastRow.current = row;
        }
      }
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const landing = project(pull.get(), velocity.y, 0.99);
      const k = rowsMode
        ? Math.round(
            (Math.max(TUCK, Math.min(full, landing)) - TUCK - PAD) / ROW,
          )
        : landing > (TUCK + full) / 2
          ? maxRows
          : 0;
      commit(k, velocity.y);
    },
    onCancel: () => {
      dragging.current = false;
      settle(restAt);
    },
    onTap: () => commit(shownDetent > 0 ? 0 : maxRows),
  });

  const onLipKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || maxRows === 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        commit(rowsMode ? shownDetent + 1 : maxRows);
        return;
      case "ArrowUp":
        event.preventDefault();
        commit(rowsMode ? shownDetent - 1 : 0);
        return;
      case "Home":
        event.preventDefault();
        commit(0);
        return;
      case "End":
        event.preventDefault();
        commit(maxRows);
        return;
      case "Escape":
        if (shownDetent === 0) return;
        // Handled here, where focus is; the stage must not see it.
        event.preventDefault();
        close(false);
        return;
    }
  };

  // Agenda times are counted from the start; while live, the current item
  // carries a dot.
  const rows = items.reduce<
    { item: MeetingAgendaItem; from: number; to: number }[]
  >((acc, item) => {
    const from = acc[acc.length - 1]?.to ?? t0;
    acc.push({ item, from, to: from + Math.max(0, item.minutes) * 60000 });
    return acc;
  }, []);
  const currentId =
    phase === "live"
      ? rows.find((r) => t >= r.from && t < r.to)?.item.id
      : undefined;

  const shownFaces = attendees.slice(0, FACES);
  const more = attendees.length - shownFaces.length;

  return (
    <article
      ref={rootRef}
      aria-labelledby={titleId}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) setWithin(true);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setWithin(false);
      }}
      className={cn(
        "@container relative flex w-full max-w-xl flex-col",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        className="relative z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-4 border border-hairline bg-card p-4 text-foreground @max-[34rem]:gap-y-3 @max-[34rem]:p-3.5"
        style={{
          boxShadow:
            "0 8px 18px -12px color-mix(in oklab, black 55%, transparent)",
        }}
      >
        {/* The countdown ring around the start time. */}
        <div className="relative col-start-1 row-start-1 row-end-3 size-16 @max-[34rem]:row-end-2 @max-[34rem]:size-14">
          <svg
            role="img"
            aria-label={ringLabel}
            viewBox="0 0 64 64"
            className="block size-full overflow-visible"
          >
            <circle
              cx={32}
              cy={32}
              r={R}
              fill="none"
              strokeWidth={4}
              className="stroke-ink-3/20"
            />
            <g transform="rotate(-90 32 32)">
              <motion.circle
                cx={32}
                cy={32}
                r={R}
                fill="none"
                strokeWidth={4}
                strokeLinecap="round"
                // Visibility by class: motion would not re-apply a changed
                // plain style value on an element it manages.
                className={phase === "before" ? undefined : "opacity-0"}
                style={{ stroke: accent, strokeDasharray: countDash }}
              />
              <motion.circle
                cx={32}
                cy={32}
                r={R}
                fill="none"
                strokeLinecap="round"
                // A round cap on a zero-length dash is still a dot: the
                // live arc is hidden until the meeting is.
                className={cn(
                  "stroke-success",
                  phase !== "live" && "opacity-0",
                )}
                style={{ strokeDasharray: liveDash, strokeWidth: swell }}
              />
            </g>
            <motion.circle
              cx={32}
              cy={32}
              r={pulseR}
              fill="none"
              strokeWidth={2}
              className="stroke-success"
              style={{ opacity: pulseOpacity }}
            />
          </svg>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          >
            <span className="font-mono text-[13px] leading-4 font-medium text-foreground tabular-nums @max-[34rem]:text-xs">
              {startText}
            </span>
            <span
              className={cn(
                "font-mono text-[9px] leading-3 tracking-[0.06em] uppercase tabular-nums",
                phase === "live" ? "text-success" : "text-ink-3",
              )}
            >
              {phase === "before"
                ? countdown
                : phase === "live"
                  ? "live"
                  : "ended"}
            </span>
          </span>
        </div>

        <div className="col-start-2 col-end-3 row-start-1 min-w-0 self-end @max-[34rem]:col-end-4 @max-[34rem]:self-center">
          <Heading
            id={titleId}
            className="truncate text-sm leading-5 font-medium text-foreground"
            title={title}
          >
            {title}
          </Heading>
          <p
            className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-ink-3"
            title={`${startText}–${endText} · ${place}`}
          >
            <Video aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">
              <span className="font-mono tabular-nums">
                {startText}–{endText}
              </span>{" "}
              · {place}
            </span>
          </p>
        </div>

        <div className="col-start-2 col-end-3 row-start-2 flex min-w-0 items-center gap-2.5 self-start @max-[34rem]:col-start-1 @max-[34rem]:col-end-3 @max-[34rem]:self-center">
          <ul role="list" aria-label="Attendees" className="flex items-center">
            {shownFaces.map((a, i) => {
              const lit = hereIds.has(a.id);
              return (
                <li
                  key={a.id}
                  aria-label={`${a.name}, ${lit ? "here" : "not joined yet"}`}
                  className={cn(i > 0 && "-ml-1.5")}
                  style={{ zIndex: FACES - i }}
                >
                  <Face
                    id={a.id}
                    name={a.name}
                    image={a.image}
                    lit={lit}
                    motionSafe={motionSafe}
                  />
                </li>
              );
            })}
            {more > 0 ? (
              <li
                className="-ml-1.5 grid h-7 min-w-7 place-items-center rounded-full bg-surface-2 px-1.5 font-mono text-[10px] text-ink-2 shadow-[0_0_0_2px_var(--card)] @max-[34rem]:h-6 @max-[34rem]:min-w-6"
                style={{ zIndex: 0 }}
              >
                +{more}
              </li>
            ) : null}
            <li
              aria-label={`${youLabel}, ${isJoined ? "here" : "not joined yet"}`}
              className="-ml-1.5"
              style={{ zIndex: 0 }}
            >
              <Face
                id="you"
                name={youLabel}
                lit={isJoined}
                motionSafe={motionSafe}
              />
            </li>
          </ul>
          <p className="min-w-0 truncate text-xs text-ink-3">
            {/* Narrow, the faces say it on their own. */}
            <span aria-hidden className="@max-[34rem]:hidden">
              <span className="inline-flex font-mono text-foreground">
                <Rolling text={String(present)} motionSafe={motionSafe} />
              </span>{" "}
              of {total} here
            </span>
            <span className="sr-only">{`${present} of ${total} here`}</span>
          </p>
        </div>

        <motion.button
          ref={joinRef}
          type="button"
          aria-pressed={isJoined}
          disabled={disabled || phase === "ended"}
          onClick={toggleJoin}
          whileTap={motionSafe && !disabled ? { scale: 0.96 } : undefined}
          transition={springs.flick}
          className={cn(
            "col-start-3 row-start-1 row-end-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors outline-none @max-[34rem]:row-start-2 @max-[34rem]:row-end-3",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
            phase === "ended"
              ? "border-hairline text-ink-3"
              : isJoined
                ? "border-transparent bg-cobalt-wash text-cobalt-bright"
                : phase === "live"
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-hairline-strong text-foreground enabled:hover:bg-surface-2",
          )}
          style={{ boxShadow: halo }}
        >
          <span className="grid">
            {[joinLabel, joinedLabel, endedLabel].map((label, i) => {
              const active =
                phase === "ended" ? i === 2 : isJoined ? i === 1 : i === 0;
              return (
                <span
                  key={label + i}
                  aria-hidden={active ? undefined : true}
                  className={cn(
                    "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 transition-opacity duration-150",
                    active ? "opacity-100" : "invisible opacity-0",
                  )}
                >
                  {i === 1 ? <Check aria-hidden className="size-3.5" /> : null}
                  {label}
                </span>
              );
            })}
          </span>
        </motion.button>
      </div>

      {/* The agenda, tucked under the card: it rises from beneath its lower
          edge, and its lip is what you pull. */}
      {maxRows > 0 ? (
        <div className="relative z-0 mx-4 -mt-1.5">
          <motion.div
            className="overflow-clip border-x border-hairline bg-surface-2 [contain:paint]"
            style={{ height: sheetH }}
          >
            <div
              ref={setRegion}
              id={sheetId}
              role="region"
              aria-label={`${title} agenda`}
              tabIndex={-1}
              inert={shownDetent === 0}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  close(true);
                }
              }}
              className={cn(
                "overflow-y-auto overscroll-contain outline-none",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
              style={{
                maxHeight: full,
                paddingTop: TUCK + PAD,
                paddingBottom: PAD,
              }}
            >
              <ol className="flex flex-col">
                {rows.map(({ item, from }) => {
                  const now_ = item.id === currentId;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-2.5 px-3 text-xs"
                      style={{ height: ROW }}
                      aria-current={now_ ? "true" : undefined}
                    >
                      <span className="w-9 shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                        {clockOf(from, timeZone)}
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          now_ ? "bg-success" : "bg-ink-3/30",
                        )}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          now_ ? "font-medium text-foreground" : "text-ink-2",
                        )}
                        title={item.title}
                      >
                        {item.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                        {item.minutes}m
                        {item.owner ? ` · ${initials(item.owner)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </motion.div>
          <span id={hintId} className="sr-only">
            Drag down or press Enter to open; arrow keys pull it out and push it
            back; Escape closes.
          </span>
          <button
            ref={lipRef}
            type="button"
            aria-expanded={shownDetent > 0}
            aria-controls={sheetId}
            aria-describedby={hintId}
            aria-label={`Agenda, ${items.length} ${items.length === 1 ? "item" : "items"}`}
            disabled={disabled}
            onClick={(event) => {
              // Pointer presses arrive as the drag's tap; a click with no
              // pointer behind it is Enter or Space, and moves focus in.
              if (event.detail === 0)
                commit(shownDetent > 0 ? 0 : maxRows, 0, true);
            }}
            onKeyDown={onLipKey}
            {...drag}
            className={cn(
              "flex h-4 w-full touch-pan-x items-center justify-center gap-1.5 rounded-b-3 border border-t-0 border-hairline bg-surface-2 text-ink-3 outline-none select-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "enabled:cursor-grab enabled:active:cursor-grabbing disabled:cursor-not-allowed",
            )}
          >
            <motion.span
              aria-hidden
              className="grid size-3 place-items-center"
              initial={false}
              animate={{ rotate: shownDetent > 0 ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <ChevronDown className="size-3" />
            </motion.span>
            <span
              aria-hidden
              className="font-mono text-[9px] leading-3 tracking-[0.08em] uppercase"
            >
              Agenda · {items.length}
            </span>
          </button>
        </div>
      ) : null}

      <span aria-live="polite" aria-atomic className="sr-only">
        {said.words}
      </span>
    </article>
  );
}
