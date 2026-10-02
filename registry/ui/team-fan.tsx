"use client";

import * as React from "react";

import { MessageCircle, UserPlus, X } from "lucide-react";
import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TeamPresence = "online" | "away" | "busy" | "offline";

export type TeamMember = {
  id: string;
  /** Full name; the first word is what the fan prints under the face. */
  name: string;
  /** What they do, in the details panel. */
  role: string;
  presence: TeamPresence;
  /** Minutes east of UTC, for the local time in the details. @default 0 */
  utcOffset?: number;
  /** A picture instead of initials: an `<img>` or any node, filling the circle. */
  image?: React.ReactNode;
};

export type TeamFanSize = "sm" | "md" | "lg";

export type TeamFanProps = {
  /** Everyone on the team; the first `max` are the faces in the stack. @default defaultTeam */
  members?: TeamMember[];
  /** The team's size when `members` is only a page of it. @default members.length */
  total?: number;
  /** Faces in the stack before the count bubble (four under 26rem of width). @default 6 */
  max?: number;
  /** The card's heading. @default "Platform crew" */
  title?: string;
  /** The line under the heading. @default "Basinworks · Design systems" */
  subtitle?: string;
  /** The heading's level. @default 3 */
  headingLevel?: 2 | 3 | 4;
  /** Controlled focused member id; null when nobody is focused. */
  value?: string | null;
  /** Initially focused member id when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the press that focused a face or let it go, with the id or null. */
  onValueChange?: (id: string | null) => void;
  /** The invite button at the end of the fan. */
  onInvite?: () => void;
  /** The count bubble: show everyone. */
  onShowAll?: () => void;
  /** Message, in a focused person's details. */
  onMessage?: (id: string) => void;
  /** The invite button's label, under it in the fan. @default "Invite" */
  inviteLabel?: string;
  /** The word under the flipped count. @default "members" */
  countLabel?: string;
  /** How much air the fan puts between faces, 0 to 1; always clamped to the card. @default 0.5 */
  spread?: number;
  /** The beat between one face landing and the next, in ms. @default 40 */
  cascade?: number;
  /** How far the rest of the team recedes behind a focused face, 0 to 1. @default 0.6 */
  focus?: number;
  /** Faces 28, 36 or 44 px across. @default "md" */
  size?: TeamFanSize;
  /** The clock for each person's local time. @default 2 Oct 2026, 13:02 UTC */
  now?: Date | number;
  /** The focused face's ring and the invite tint. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** A swish as a key or a tap opens the fan, a pop as a face is focused. Off unless asked for. @default false */
  sound?: boolean;
  /** @default false */
  disabled?: boolean;
  className?: string;
};

export const defaultTeam: TeamMember[] = [
  {
    id: "ines",
    name: "Ines Okafor",
    role: "Design lead",
    presence: "online",
    utcOffset: 60,
  },
  {
    id: "tomas",
    name: "Tomas Varga",
    role: "Staff engineer",
    presence: "online",
    utcOffset: 120,
  },
  {
    id: "mei",
    name: "Mei Tanaka",
    role: "Product manager",
    presence: "busy",
    utcOffset: 540,
  },
  {
    id: "rafa",
    name: "Rafa Duarte",
    role: "Frontend engineer",
    presence: "away",
    utcOffset: -180,
  },
  {
    id: "odile",
    name: "Odile Marchand",
    role: "Researcher",
    presence: "online",
    utcOffset: 120,
  },
  {
    id: "kwame",
    name: "Kwame Asante",
    role: "Platform engineer",
    presence: "offline",
    utcOffset: 0,
  },
  {
    id: "noor",
    name: "Noor Haddad",
    role: "Content designer",
    presence: "online",
    utcOffset: 180,
  },
  {
    id: "arlo",
    name: "Arlo Brennan",
    role: "Engineering manager",
    presence: "away",
    utcOffset: 60,
  },
  {
    id: "sana",
    name: "Sana Mirza",
    role: "Data analyst",
    presence: "offline",
    utcOffset: 300,
  },
  {
    id: "bram",
    name: "Bram de Wit",
    role: "Design engineer",
    presence: "online",
    utcOffset: 120,
  },
  {
    id: "lena",
    name: "Lena Fischer",
    role: "QA engineer",
    presence: "offline",
    utcOffset: 120,
  },
  {
    id: "yusuf",
    name: "Yusuf Kaya",
    role: "Backend engineer",
    presence: "busy",
    utcOffset: 180,
  },
  {
    id: "pilar",
    name: "Pilar Ortega",
    role: "Brand designer",
    presence: "offline",
    utcOffset: 120,
  },
  {
    id: "teo",
    name: "Teo Lindqvist",
    role: "Site reliability",
    presence: "away",
    utcOffset: 120,
  },
  {
    id: "ada",
    name: "Ada Nwosu",
    role: "Accessibility lead",
    presence: "offline",
    utcOffset: 60,
  },
  {
    id: "jun",
    name: "Jun Park",
    role: "iOS engineer",
    presence: "offline",
    utcOffset: 540,
  },
  {
    id: "sol",
    name: "Sol Ferreira",
    role: "Android engineer",
    presence: "offline",
    utcOffset: -180,
  },
  {
    id: "ezra",
    name: "Ezra Cohen",
    role: "Technical writer",
    presence: "away",
    utcOffset: -300,
  },
];

const DEFAULT_NOW = Date.UTC(2026, 9, 2, 13, 2);

/** Faces shown in the stack under 26rem of container width. */
const NARROW = 4;
/** The container width (px) under which the stack narrows; matches `@max-[26rem]`. */
const NARROW_BELOW = 416;

const SIZES: Record<
  TeamFanSize,
  { d: number; initials: string; name: string; dot: number }
> = {
  sm: { d: 28, initials: "text-[10px]", name: "text-[10px]", dot: 8 },
  md: { d: 36, initials: "text-xs", name: "text-[11px]", dot: 10 },
  lg: { d: 44, initials: "text-sm", name: "text-xs", dot: 12 },
};

const PRESENCE: Record<TeamPresence, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-success" },
  away: { label: "Away", dot: "bg-warn" },
  busy: { label: "Busy", dot: "bg-danger" },
  offline: { label: "Offline", dot: "border border-ink-3 bg-card" },
};

/** Hue turns from the accent, so every face is a pigment of the same theme. */
const HUES = [0, 48, 96, 150, 205, 255, 310];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A filled face is pigment: the accent's chroma turned to a seeded hue at a fixed lightness, the same in both themes. */
function pigment(id: string) {
  const turn = HUES[hash(id) % HUES.length] ?? 0;
  return {
    backgroundColor: `oklch(from var(--accent) 0.84 0.07 calc(h + ${turn}))`,
    color: `oklch(from var(--accent) 0.32 0.07 calc(h + ${turn}))`,
  };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

const pad = (n: number) => String(n).padStart(2, "0");
const localTime = (now: number, offset = 0) => {
  const d = new Date(now + offset * 60000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

function Face({
  member,
  d,
  textClass,
}: {
  member: TeamMember;
  d: number;
  textClass: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center overflow-clip rounded-full font-medium select-none",
        textClass,
      )}
      style={{ width: d, height: d, ...pigment(member.id) }}
    >
      {member.image ?? initials(member.name)}
    </span>
  );
}

type Slot =
  | { kind: "member"; key: string; member: TeamMember; index: number }
  | { kind: "count"; key: string }
  | { kind: "invite"; key: string };

/**
 * A team card whose people sit as an overlapping stack of faces. Hovering
 * the card, tabbing into it or tapping the stack fans the faces into a
 * readable row: each springs to its slot on snap a `cascade` beat after the
 * last, its first name rolls up beneath it and its presence dot pops in,
 * while the "+12" bubble flips about its axis to the full count and an invite
 * button springs out to the end of the fan. Leaving gathers them back in
 * reverse on glide.
 *
 * Pressing a face focuses that person: it lifts, the rest recede by `focus`,
 * and a details panel opens beneath — role, presence, local time, Message —
 * as a real disclosure: focus moves in, and Escape or Close hands it back to
 * the face. The row is a toolbar with a roving tabindex. Under reduced motion
 * nothing travels or flips: faces jump to their slots as the row cross-fades,
 * and the rest recede by opacity alone.
 */
export function TeamFan({
  members = defaultTeam,
  total,
  max = 6,
  title = "Platform crew",
  subtitle = "Basinworks · Design systems",
  headingLevel = 3,
  value,
  defaultValue = null,
  onValueChange,
  onInvite,
  onShowAll,
  onMessage,
  inviteLabel = "Invite",
  countLabel = "members",
  spread = 0.5,
  cascade = 40,
  focus = 0.6,
  size = "md",
  now = DEFAULT_NOW,
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: TeamFanProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const panelId = `${uid}-panel`;
  const nameId = `${uid}-name`;
  const descId = `${uid}-desc`;
  const s = SIZES[size] ?? SIZES.md;
  const d = s.d;
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const clock = typeof now === "number" ? now : now.getTime();

  const team = members;
  const count = Math.max(team.length, Math.round(total ?? team.length));
  const wide = Math.max(0, Math.min(Math.round(max), team.length));
  const narrow = Math.min(wide, NARROW);
  const online = team.filter((m) => m.presence === "online").length;

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const selected = value !== undefined ? value : own;
  const person = selected ? team.find((m) => m.id === selected) : undefined;

  const [hover, setHover] = React.useState(false);
  const [within, setWithin] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  // A disabled card lets go of a fan a tap had pinned open.
  if (disabled && pinned) setPinned(false);
  const [width, setWidth] = React.useState(0);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);

  const open = !disabled && (hover || within || pinned || !!person);
  const shown = width > 0 && width < NARROW_BELOW ? narrow : wide;
  const rest = count - shown;

  // What the panel shows: the focused person, held while it folds away.
  const [held, setHeld] = React.useState<TeamMember | undefined>(person);
  if (person && person.id !== held?.id) setHeld(person);
  const card = person ?? held;

  // The spoken sentence is frozen in the render that flips the focus, and
  // only for a change the visitor asked for and the host accepted.
  const [asked, setAsked] = React.useState<string | null | undefined>(
    undefined,
  );
  const [heard, setHeard] = React.useState({ id: selected, words: "" });
  if (heard.id !== selected) {
    const who = person
      ? `${person.name}, ${person.role}, ${PRESENCE[person.presence].label}`
      : "";
    setHeard({ id: selected, words: asked === selected ? who : heard.words });
    if (asked !== undefined) setAsked(undefined);
  }

  const openRef = React.useRef(open);
  React.useEffect(() => {
    openRef.current = open;
  });
  const touchOpen = React.useRef(false);
  const rootRef = React.useRef<HTMLElement | null>(null);
  const items = React.useRef(new Map<string, HTMLButtonElement>());
  const wantFocus = React.useRef<string | null>(null);

  // The row's width, bound when the row arrives, sets how far the fan may go.
  const [row, setRow] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!row) return;
    const measure = () => setWidth(Math.round(row.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [row]);

  // The details' natural height, measured from their own box.
  const [inner, setInner] = React.useState<HTMLDivElement | null>(null);
  const [panelH, setPanelH] = React.useState(0);
  React.useEffect(() => {
    if (!inner) return;
    const measure = () => setPanelH(Math.round(inner.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [inner]);

  // Focus goes into the details when they arrive for the person just pressed.
  const [firstAction, setFirstAction] =
    React.useState<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (!firstAction || !selected || wantFocus.current !== selected) return;
    wantFocus.current = null;
    firstAction.focus({ preventScroll: true });
  }, [firstAction, selected]);

  // A fan opened by a tap stays open until a press lands outside the card.
  React.useEffect(() => {
    if (!pinned) return;
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target))
        return;
      setPinned(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pinned]);

  // Under reduced motion the faces jump to their places, so the row dips
  // and comes back instead of travelling. A re-run finishes the dip rather
  // than leaving the row half-faded.
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const lastOpen = React.useRef(open);
  React.useEffect(() => {
    const el = toolbarRef.current;
    if (lastOpen.current === open) return;
    lastOpen.current = open;
    if (motionSafe || !el) return;
    const dip = animate(
      el,
      { opacity: [0.4, 1] },
      { duration: durations.fast },
    );
    return () => {
      dip.stop();
      el.style.opacity = "1";
    };
  }, [open, motionSafe]);

  const swish = () => {
    if (openRef.current || disabled) return;
    audio.play("swish", {
      pitch: r2(0.85 + clamp01(spread) * 0.4),
      gain: 0.35,
    });
  };

  const slots: Slot[] = [
    ...team.slice(0, wide).map((member, index): Slot => ({
      kind: "member",
      key: member.id,
      member,
      index,
    })),
    ...(count > narrow ? [{ kind: "count", key: "count" } as Slot] : []),
    { kind: "invite", key: "invite" },
  ];
  /** The slots a visitor can reach at this width, in order. */
  const reachable = slots.filter(
    (slot) => slot.kind !== "member" || slot.index < shown,
  );
  const hasCount = rest > 0;
  const fanSlots = reachable.filter(
    (slot) => slot.kind !== "count" || hasCount,
  );
  const current =
    fanSlots.find((slot) => slot.key === activeKey)?.key ??
    (person && fanSlots.some((slot) => slot.key === person.id)
      ? person.id
      : (fanSlots[0]?.key ?? "invite"));

  // Geometry. Stacked faces overlap by flex margins; the fan is an offset
  // from each one's stacked place, so the server's markup is the stack.
  const step = Math.round(d * 0.6);
  const n = fanSlots.length;
  const desired = d + lerp(6, 40, clamp01(spread));
  const fits = width > 0 && n > 1 ? (width - d) / (n - 1) : desired;
  const slotW = r2(Math.max(step, Math.min(desired, fits)));
  const beat = Math.max(0, cascade) / 1000;
  // A name may be wider than its face, never wider than its slot, and never
  // so wide that the first or last one leaves the card's padding.
  const nameW = Math.round(Math.min(Math.max(slotW - 2, d * 0.9), d + 24));

  // Stacked, the invite waits tucked behind the slot before it; fanned,
  // every slot is `slotW` from the last.
  const offsetOf = (slot: Slot, order: number) =>
    open ? r2(order * (slotW - step)) : slot.kind === "invite" ? -step : 0;
  const delayOf = (order: number) =>
    open ? order * beat : (n - 1 - order) * beat * 0.5;

  const choose = (next: string | null, via: "press" | "close") => {
    if (disabled) return;
    if (next === selected) return;
    setAsked(next);
    if (next) {
      wantFocus.current = next;
      setActiveKey(next);
      const at = team.findIndex((m) => m.id === next);
      audio.play("pop", {
        pitch: r2(0.92 + Math.max(0, at) * 0.06),
        gain: 0.5,
      });
    } else if (via === "close" || selected) {
      audio.play("pop", { pitch: 0.7, gain: 0.28 });
    }
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  /** Lets the focused person go and hands focus back to their face. */
  const release = () => {
    const back = selected;
    if (!back) return;
    const root = rootRef.current;
    const hadFocus = !!root && root.contains(document.activeElement);
    choose(null, "close");
    if (hadFocus) items.current.get(back)?.focus({ preventScroll: true });
  };

  /** A press on any slot: a closed fan only opens (a first tap on a stack). */
  const opensOnly = () => {
    if (touchOpen.current) {
      touchOpen.current = false;
      setPinned(true);
      return true;
    }
    if (!openRef.current) {
      swish();
      setPinned(true);
      return true;
    }
    return false;
  };

  const move = (to: number) => {
    const slot = fanSlots[Math.max(0, Math.min(fanSlots.length - 1, to))];
    if (!slot) return;
    setActiveKey(slot.key);
    items.current.get(slot.key)?.focus();
  };

  const onToolbarKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = fanSlots.findIndex((slot) => slot.key === current);
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(at + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(at - 1);
        return;
      case "Home":
        event.preventDefault();
        move(0);
        return;
      case "End":
        event.preventDefault();
        move(fanSlots.length - 1);
        return;
    }
  };

  const itemRef = (key: string) => (node: HTMLButtonElement | null) => {
    if (node) items.current.set(key, node);
    else items.current.delete(key);
  };

  const others = person ? clamp01(focus) : 0;
  const fanTransition = (order: number) =>
    motionSafe
      ? {
          ...(open ? springs.snap : springs.glide),
          delay: delayOf(order),
        }
      : { duration: 0 };
  const rollIn = (order: number) =>
    motionSafe
      ? {
          y: { ...springs.snap, delay: delayOf(order) + 0.04 },
          opacity: {
            duration: durations.fast,
            delay: delayOf(order) + 0.04,
            ease: easings.enter,
          },
        }
      : { duration: durations.fast };

  // The bubble's and the invite's words sit between short first names, so
  // they may take a little of their neighbours' air.
  const nameOf = (label: string, order: number, strong = false, extra = 0) => (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 block -translate-x-1/2 overflow-clip text-center"
      style={{ top: d + 6, width: Math.min(nameW + extra, d + 24), height: 16 }}
    >
      <motion.span
        className={cn(
          "block truncate leading-4 @max-[26rem]:text-[10px]",
          s.name,
          strong ? "font-medium text-foreground" : "text-ink-2",
        )}
        initial={false}
        animate={
          open
            ? { y: motionSafe ? [10, 0] : 0, opacity: 1 }
            : { y: motionSafe ? -10 : 0, opacity: 0 }
        }
        transition={open ? rollIn(order) : exitFor(durations.fast)}
      >
        {label}
      </motion.span>
    </span>
  );

  const summary =
    team.length === 0
      ? "No one yet"
      : `${team
          .slice(0, 2)
          .map((m) => firstName(m.name))
          .join(", ")}${count > 2 ? ` and ${count - 2} others` : ""}`;

  return (
    <article
      ref={rootRef}
      aria-labelledby={titleId}
      onPointerEnter={(event) => {
        // Hover opens the fan silently: a sound answers a press or a key,
        // never a pointer passing over.
        if (event.pointerType === "touch" || disabled) return;
        setHover(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        setHover(false);
      }}
      onPointerDown={(event) => {
        // A finger on a closed stack opens it; the click that follows is
        // that opening, not a choice of face.
        if (event.pointerType === "touch") touchOpen.current = !openRef.current;
      }}
      onFocus={(event) => {
        // Keyboard focus opens the fan like hover does; the focus a click
        // leaves behind does not, so a mouse that wanders off still gathers.
        if (disabled || !event.target.matches(":focus-visible")) return;
        swish();
        setWithin(true);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setWithin(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && selected) {
          // Handled here, where focus is; the stage must not see it.
          event.preventDefault();
          release();
        }
      }}
      className={cn(
        "@container relative w-full max-w-xl rounded-4 border border-hairline bg-card p-4 text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading
            id={titleId}
            className="truncate text-sm leading-5 font-medium text-foreground"
            title={title}
          >
            {title}
          </Heading>
          <p className="truncate text-xs leading-4 text-ink-3" title={subtitle}>
            {subtitle}
          </p>
        </div>
        <p className="flex h-5 shrink-0 items-center gap-1.5 text-xs text-ink-2">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          {online} online
        </p>
      </header>

      <span id={descId} className="sr-only">
        {`${count} ${count === 1 ? "member" : "members"}, ${online} online`}
      </span>

      <div
        ref={setRow}
        className="relative mt-3"
        style={{ height: d + 22 }}
        onClick={() => {
          // A tap between faces still opens the stack.
          if (!touchOpen.current) return;
          touchOpen.current = false;
          swish();
          setPinned(true);
        }}
      >
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label={`${title} members`}
          aria-describedby={descId}
          onKeyDown={onToolbarKey}
          className="flex items-start"
        >
          {slots.map((slot, i) => {
            const order = fanSlots.findIndex((f) => f.key === slot.key);
            const reach = order === -1 ? 0 : order;
            const x = offsetOf(slot, reach);
            // Which slots a width shows is decided in CSS, so the server's
            // stack is already the right one; the script only reads it back.
            const narrowHidden =
              slot.kind === "member" && slot.index >= narrow
                ? "@max-[26rem]:hidden"
                : slot.kind === "count" && count <= wide
                  ? "hidden @max-[26rem]:block"
                  : "";
            const tabIndex = slot.key === current && !disabled ? 0 : -1;
            const z = slots.length - i;

            if (slot.kind === "member") {
              const m = slot.member;
              const isOn = person?.id === m.id;
              const dim = person && !isOn ? others : 0;
              const presence = PRESENCE[m.presence];
              return (
                <motion.div
                  key={slot.key}
                  className={cn("relative shrink-0", narrowHidden)}
                  style={{
                    width: d,
                    height: d + 22,
                    marginLeft: i === 0 ? 0 : step - d,
                    zIndex: isOn ? slots.length + 2 : z,
                  }}
                  initial={false}
                  animate={{ x }}
                  transition={fanTransition(reach)}
                >
                  <motion.div
                    className="relative"
                    initial={false}
                    animate={{
                      opacity: r2(1 - 0.7 * dim),
                      filter: `saturate(${r2(1 - dim)})`,
                    }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                  >
                    <motion.button
                      ref={itemRef(m.id)}
                      type="button"
                      tabIndex={tabIndex}
                      disabled={disabled}
                      aria-label={`${m.name}, ${m.role}, ${presence.label}`}
                      aria-expanded={isOn}
                      aria-controls={panelId}
                      onFocus={() => setActiveKey(m.id)}
                      onClick={() => {
                        if (opensOnly()) return;
                        choose(isOn ? null : m.id, "press");
                      }}
                      initial={false}
                      animate={
                        motionSafe
                          ? {
                              scale: isOn ? 1.1 : r2(1 - 0.12 * dim),
                              y: isOn ? -3 : 0,
                            }
                          : { scale: 1, y: 0 }
                      }
                      whileHover={
                        motionSafe && open && !disabled && !isOn
                          ? { y: -2 }
                          : undefined
                      }
                      whileTap={
                        motionSafe && !disabled ? { scale: 0.94 } : undefined
                      }
                      transition={
                        motionSafe
                          ? isOn
                            ? springs.snap
                            : springs.glide
                          : { duration: 0 }
                      }
                      className={cn(
                        "relative block rounded-full outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                        "enabled:cursor-pointer disabled:cursor-not-allowed",
                      )}
                      style={{
                        width: d,
                        height: d,
                        boxShadow: isOn
                          ? `0 0 0 2px var(--card), 0 0 0 4px ${accent}`
                          : "0 0 0 2px var(--card)",
                      }}
                    >
                      <Face member={m} d={d} textClass={s.initials} />
                      <motion.span
                        aria-hidden
                        className={cn(
                          "absolute right-0 bottom-0 rounded-full",
                          presence.dot,
                        )}
                        style={{
                          width: s.dot,
                          height: s.dot,
                          boxShadow: "0 0 0 2px var(--card)",
                        }}
                        initial={false}
                        animate={
                          open
                            ? { scale: 1, opacity: 1 }
                            : { scale: motionSafe ? 0.4 : 1, opacity: 0 }
                        }
                        transition={
                          motionSafe
                            ? open
                              ? {
                                  ...springs.flick,
                                  delay: delayOf(reach) + 0.08,
                                }
                              : exitFor(durations.fast)
                            : { duration: durations.fast }
                        }
                      />
                    </motion.button>
                    {nameOf(firstName(m.name), reach, isOn)}
                  </motion.div>
                </motion.div>
              );
            }

            if (slot.kind === "count") {
              return (
                <motion.div
                  key={slot.key}
                  className={cn("relative shrink-0", narrowHidden)}
                  style={{
                    width: d,
                    height: d + 22,
                    marginLeft: step - d,
                    zIndex: slots.length + 1,
                  }}
                  initial={false}
                  animate={{ x }}
                  transition={fanTransition(reach)}
                >
                  <motion.div
                    initial={false}
                    animate={{ opacity: r2(1 - 0.7 * others) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                  >
                    <motion.button
                      ref={itemRef(slot.key)}
                      type="button"
                      tabIndex={tabIndex}
                      disabled={disabled}
                      aria-label={`Show all ${count} ${countLabel}`}
                      onFocus={() => setActiveKey(slot.key)}
                      onClick={() => {
                        if (opensOnly()) return;
                        onShowAll?.();
                      }}
                      whileTap={
                        motionSafe && !disabled ? { scale: 0.94 } : undefined
                      }
                      transition={springs.flick}
                      className={cn(
                        "relative block rounded-full outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                        "enabled:cursor-pointer disabled:cursor-not-allowed",
                      )}
                      style={{
                        width: d,
                        height: d,
                        perspective: d * 8,
                        boxShadow: "0 0 0 2px var(--card)",
                      }}
                    >
                      <motion.span
                        aria-hidden
                        className="relative block size-full rounded-full [transform-style:preserve-3d]"
                        initial={false}
                        animate={{ rotateY: motionSafe && open ? 180 : 0 }}
                        transition={fanTransition(reach)}
                      >
                        <motion.span
                          className={cn(
                            "absolute inset-0 grid place-items-center rounded-full bg-surface-2 font-mono font-medium text-ink-2 tabular-nums [backface-visibility:hidden]",
                            s.initials,
                          )}
                          initial={false}
                          animate={{ opacity: !motionSafe && open ? 0 : 1 }}
                          transition={{ duration: durations.fast }}
                        >
                          <span className="@max-[26rem]:hidden">
                            +{count - wide}
                          </span>
                          <span className="hidden @max-[26rem]:inline">
                            +{count - narrow}
                          </span>
                        </motion.span>
                        <motion.span
                          className={cn(
                            "absolute inset-0 grid place-items-center rounded-full font-mono font-medium tabular-nums [backface-visibility:hidden]",
                            s.initials,
                          )}
                          style={{
                            transform: motionSafe ? "rotateY(180deg)" : "none",
                            color: accent,
                            backgroundColor: `color-mix(in oklab, ${accent} 16%, var(--card))`,
                          }}
                          initial={false}
                          animate={{ opacity: !motionSafe && !open ? 0 : 1 }}
                          transition={{ duration: durations.fast }}
                        >
                          {count}
                        </motion.span>
                      </motion.span>
                    </motion.button>
                    {nameOf(countLabel, reach, false, 8)}
                  </motion.div>
                </motion.div>
              );
            }

            return (
              <motion.div
                key={slot.key}
                className="relative shrink-0"
                style={{
                  width: d,
                  height: d + 22,
                  marginLeft: step - d,
                  zIndex: 0,
                }}
                initial={false}
                animate={{
                  x,
                  opacity: open ? r2(1 - 0.7 * others) : 0,
                  scale: open || !motionSafe ? 1 : 0.6,
                }}
                transition={
                  motionSafe
                    ? {
                        x: fanTransition(reach),
                        scale: fanTransition(reach),
                        opacity: {
                          duration: durations.fast,
                          delay: open ? delayOf(reach) : 0,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
              >
                <motion.button
                  ref={itemRef(slot.key)}
                  type="button"
                  tabIndex={tabIndex}
                  disabled={disabled}
                  aria-label={`${inviteLabel} to ${title}`}
                  onFocus={() => setActiveKey(slot.key)}
                  onClick={() => {
                    if (opensOnly()) return;
                    onInvite?.();
                  }}
                  whileTap={
                    motionSafe && !disabled ? { scale: 0.94 } : undefined
                  }
                  transition={springs.flick}
                  className={cn(
                    "grid place-items-center rounded-full border border-dashed transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    "enabled:cursor-pointer disabled:cursor-not-allowed",
                  )}
                  style={{
                    width: d,
                    height: d,
                    color: accent,
                    borderColor: `color-mix(in oklab, ${accent} 55%, transparent)`,
                    backgroundColor: `color-mix(in oklab, ${accent} 8%, var(--card))`,
                  }}
                >
                  <UserPlus aria-hidden className="size-4 shrink-0" />
                </motion.button>
                {nameOf(inviteLabel, reach, false, 8)}
              </motion.div>
            );
          })}
        </div>

        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 block overflow-clip"
          style={{ top: d + 6, height: 16 }}
        >
          <motion.span
            className={cn("block truncate leading-4 text-ink-3", s.name)}
            initial={false}
            animate={
              open
                ? { y: motionSafe ? -10 : 0, opacity: 0 }
                : { y: motionSafe ? [10, 0] : 0, opacity: 1 }
            }
            transition={
              open
                ? exitFor(durations.fast)
                : motionSafe
                  ? {
                      y: { ...springs.snap, delay: n * beat * 0.5 },
                      opacity: {
                        duration: durations.fast,
                        delay: n * beat * 0.5,
                      },
                    }
                  : { duration: durations.fast }
            }
          >
            {summary}
          </motion.span>
        </span>
      </div>

      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={person ? nameId : titleId}
        inert={!person}
        className="overflow-clip [contain:paint]"
        initial={false}
        animate={{ height: person ? (panelH > 0 ? panelH : "auto") : 0 }}
        transition={motionSafe ? springs.glide : { duration: durations.fast }}
      >
        <div ref={setInner} className="pt-3">
          <div className="grid grid-cols-1">
            <AnimatePresence initial={false}>
              {card ? (
                <motion.div
                  key={card.id}
                  className={cn(
                    "col-start-1 row-start-1 grid items-center gap-x-3 rounded-3 border border-hairline bg-surface-2 p-3 @max-[26rem]:p-2.5",
                    // Narrow, the actions keep the first row and the meta
                    // line takes the card's whole width beneath them.
                    "grid-cols-[auto_minmax(0,1fr)_auto] @max-[26rem]:grid-cols-[minmax(0,1fr)_auto]",
                  )}
                  initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
                  animate={{ opacity: person ? 1 : 0, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  <span className="col-start-1 row-start-1 row-end-3 @max-[26rem]:hidden">
                    <Face member={card} d={28} textClass="text-[10px]" />
                  </span>
                  <p
                    className="col-start-2 row-start-1 flex min-w-0 items-center gap-2 @max-[26rem]:col-start-1"
                    title={`${card.name} · ${PRESENCE[card.presence].label}`}
                  >
                    <span
                      id={card.id === person?.id ? nameId : undefined}
                      className="truncate text-sm leading-5 font-medium text-foreground"
                    >
                      {card.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-3">
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          PRESENCE[card.presence].dot,
                        )}
                      />
                      {PRESENCE[card.presence].label}
                    </span>
                  </p>
                  <p
                    className="col-start-2 col-end-3 row-start-2 truncate text-xs leading-4 text-ink-3 @max-[26rem]:col-start-1 @max-[26rem]:col-end-3"
                    title={`${card.role} · ${localTime(clock, card.utcOffset)} local`}
                  >
                    {card.role} ·{" "}
                    <span className="font-mono tabular-nums">
                      {localTime(clock, card.utcOffset)}
                    </span>{" "}
                    local
                  </p>
                  <div className="col-start-3 row-start-1 row-end-3 flex shrink-0 items-center gap-1.5 @max-[26rem]:col-start-2 @max-[26rem]:row-end-2">
                    <button
                      ref={card.id === person?.id ? setFirstAction : undefined}
                      type="button"
                      disabled={disabled}
                      aria-label={`Message ${firstName(card.name)}`}
                      onClick={() => onMessage?.(card.id)}
                      className={cn(
                        "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs text-foreground transition-colors outline-none @max-[26rem]:w-8 @max-[26rem]:px-0",
                        "hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                        "enabled:cursor-pointer disabled:cursor-not-allowed",
                      )}
                    >
                      <MessageCircle aria-hidden className="size-4 shrink-0" />
                      <span className="@max-[26rem]:sr-only">Message</span>
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Close ${firstName(card.name)}'s details`}
                      onClick={release}
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none",
                        "hover:bg-surface-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                        "enabled:cursor-pointer disabled:cursor-not-allowed",
                      )}
                    >
                      <X aria-hidden className="size-4 shrink-0" />
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <span aria-live="polite" aria-atomic className="sr-only">
        {heard.words}
      </span>
    </article>
  );
}
