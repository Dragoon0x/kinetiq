"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";
import {
  Check,
  ChevronDown,
  FileText,
  Link2,
  RotateCcw,
  Search,
  TriangleAlert,
  UserPlus,
  Users,
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

export type ShareAccess = "owner" | "editor" | "commenter" | "viewer";
export type ShareLinkAccess = "restricted" | "viewer" | "commenter" | "editor";
export type ShareRingStyle = "rings" | "orbit" | "list";
export type ShareDensity = "compact" | "cozy" | "roomy";
export type ShareAccent = "cobalt" | "signal" | "success";
export type ShareStatus = "ready" | "loading" | "error";

/** One ring of the perimeter, innermost first. */
export type ShareRing = {
  access: ShareAccess;
  /** The ring's name, e.g. "Editors". */
  label: string;
  /** What a member can do, as a verb phrase: "can edit". */
  can: string;
};

/** Someone with access, sitting on the ring their access names. */
export type SharePerson = {
  id: string;
  name: string;
  email: string;
  access: ShareAccess;
};

/** Someone who can be added from the directory search. */
export type ShareDirectoryEntry = {
  id: string;
  name: string;
  email: string;
  /** Shown beside the name in the search results. */
  team?: string;
};

/** The person sharing: always on the Owners ring, never moved or removed. */
export type ShareYou = { id: string; name: string; email: string };

/** The document in the middle of the perimeter. */
export type ShareDoc = { title: string; kind?: string };

export type ShareChange =
  | { type: "move"; personId: string; from: ShareAccess; to: ShareAccess }
  | { type: "add"; personId: string; to: ShareAccess }
  | { type: "remove"; personId: string; from: ShareAccess };

export type SharePerimeterProps = {
  /** How the perimeter is drawn: concentric rings, tilted orbits, or no perimeter at all (the grouped list alone). @default "rings" */
  ringStyle?: ShareRingStyle;
  /** Row heights, avatar sizes and type size. @default "cozy" */
  density?: ShareDensity;
  /** The colour a ring takes when it is live: a person hovering over it, or the link opened. @default "cobalt" */
  accent?: ShareAccent;
  /** Controlled list of people and their access. */
  people?: SharePerson[];
  /** Initial people when uncontrolled. @default defaultSharePeople */
  defaultPeople?: SharePerson[];
  /** Fires after a person is moved, added or removed, with the whole list and the change. */
  onChange?: (people: SharePerson[], change: ShareChange) => void;
  /** Everyone the search can add. @default defaultShareDirectory */
  directory?: ShareDirectoryEntry[];
  /** Controlled access for anyone with the link. */
  linkAccess?: ShareLinkAccess;
  /** Initial link access when uncontrolled. @default "restricted" */
  defaultLinkAccess?: ShareLinkAccess;
  /** The link was opened, closed or given another level. */
  onLinkAccessChange?: (access: ShareLinkAccess) => void;
  /** The rings, innermost first; the link ring is always drawn outside them. @default defaultShareRings */
  rings?: ShareRing[];
  /** The person sharing, shown as "you" on the Owners ring. @default defaultShareYou */
  you?: ShareYou;
  /** The document at the centre. @default defaultShareDoc */
  doc?: ShareDoc;
  /** What Copy link copies. @default defaultShareUrl */
  url?: string;
  /** Copy link was pressed; the url is already on the clipboard where the browser allows it. */
  onCopyLink?: (url: string) => void;
  /** Whether the people and directory have arrived. @default "ready" */
  status?: ShareStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Share" */
  title?: string;
  /** The surface's accessible name. @default the title and the document's title */
  label?: string;
  /** Height of the surface in px; the list scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be moved, added, removed or opened. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultShareRings: ShareRing[] = [
  { access: "owner", label: "Owners", can: "own it" },
  { access: "editor", label: "Editors", can: "can edit" },
  { access: "commenter", label: "Commenters", can: "can comment" },
  { access: "viewer", label: "Viewers", can: "can view" },
];

export const defaultShareYou: ShareYou = {
  id: "you",
  name: "Ines Varga",
  email: "ines@coldbrook.app",
};

export const defaultShareDoc: ShareDoc = {
  title: "Harbour brief, Q4",
  kind: "Doc",
};

export const defaultShareUrl = "https://docs.coldbrook.app/d/harbour-brief-q4";

/** Coldbrook's directory: fourteen people across five teams. */
export const defaultShareDirectory: ShareDirectoryEntry[] = [
  {
    id: "mara",
    name: "Mara Lind",
    email: "mara@coldbrook.app",
    team: "Harbour",
  },
  {
    id: "tomas",
    name: "Tomas Reyes",
    email: "tomas@coldbrook.app",
    team: "Harbour",
  },
  {
    id: "kenji",
    name: "Kenji Aoki",
    email: "kenji@coldbrook.app",
    team: "Design",
  },
  {
    id: "priya",
    name: "Priya Nair",
    email: "priya@coldbrook.app",
    team: "Finance",
  },
  { id: "sol", name: "Sol Brandt", email: "sol@coldbrook.app", team: "Ops" },
  {
    id: "yara",
    name: "Yara Okafor",
    email: "yara@coldbrook.app",
    team: "Legal",
  },
  { id: "dev", name: "Dev Mistry", email: "dev@coldbrook.app", team: "Design" },
  { id: "hanna", name: "Hanna Vos", email: "hanna@coldbrook.app", team: "Ops" },
  {
    id: "luca",
    name: "Luca Ferri",
    email: "luca@coldbrook.app",
    team: "Harbour",
  },
  {
    id: "noor",
    name: "Noor Haddad",
    email: "noor@coldbrook.app",
    team: "Finance",
  },
  {
    id: "ewan",
    name: "Ewan Price",
    email: "ewan@coldbrook.app",
    team: "Legal",
  },
  {
    id: "bea",
    name: "Bea Castillo",
    email: "bea@coldbrook.app",
    team: "Design",
  },
  { id: "ravi", name: "Ravi Menon", email: "ravi@coldbrook.app", team: "Ops" },
  {
    id: "tilde",
    name: "Tilde Berg",
    email: "tilde@coldbrook.app",
    team: "Harbour",
  },
];

/** Six people already on the brief: an owner, two editors, a commenter and two viewers. */
export const defaultSharePeople: SharePerson[] = [
  {
    id: "mara",
    name: "Mara Lind",
    email: "mara@coldbrook.app",
    access: "owner",
  },
  {
    id: "tomas",
    name: "Tomas Reyes",
    email: "tomas@coldbrook.app",
    access: "editor",
  },
  {
    id: "kenji",
    name: "Kenji Aoki",
    email: "kenji@coldbrook.app",
    access: "editor",
  },
  {
    id: "priya",
    name: "Priya Nair",
    email: "priya@coldbrook.app",
    access: "commenter",
  },
  {
    id: "sol",
    name: "Sol Brandt",
    email: "sol@coldbrook.app",
    access: "viewer",
  },
  {
    id: "yara",
    name: "Yara Okafor",
    email: "yara@coldbrook.app",
    access: "viewer",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const SMALL = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

const ACCENTS: Record<ShareAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

const DENSITY: Record<
  ShareDensity,
  { row: number; dot: number; avatar: number; text: string }
> = {
  compact: { row: 36, dot: 20, avatar: 22, text: "text-[12px]" },
  cozy: { row: 44, dot: 24, avatar: 26, text: "text-[13px]" },
  roomy: { row: 52, dot: 28, avatar: 30, text: "text-sm" },
};

const LINK_LEVELS: {
  access: Exclude<ShareLinkAccess, "restricted">;
  label: string;
  can: string;
}[] = [
  { access: "viewer", label: "View", can: "can view" },
  { access: "commenter", label: "Comment", can: "can comment" },
  { access: "editor", label: "Edit", can: "can edit" },
];

const HUES = [
  "var(--accent)",
  "var(--signal)",
  "var(--success)",
  "var(--warn)",
];

const ORBIT_SQUASH = 0.58;
const DRAG_START = 4;
const COPIED_MS = 1600;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));

const hashOf = (text: string) => {
  let h = 7;
  for (let i = 0; i < text.length; i += 1)
    h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const hueOf = (name: string) => HUES[hashOf(name) % HUES.length] ?? HUES[0];

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const noopSubscribe = () => () => {};

type Row = {
  id: string;
  name: string;
  email: string;
  ring: number;
  isYou: boolean;
};

type Geo = {
  w: number;
  h: number;
  /** Radii of the person rings, innermost first. */
  radii: number[];
  /** Radius of the link ring. */
  linkR: number;
  squash: number;
  card: { w: number; h: number };
};

type Spot = { x: number; y: number; ring: number };

const makeGeo = (
  w: number,
  h: number,
  ringCount: number,
  dot: number,
  squash: number,
): Geo => {
  const half = Math.min(w / 2, h / (2 * squash));
  const linkR = Math.max(40, half - dot / 2 - 10);
  const card = {
    w: clamp(Math.round(half * 0.4), 60, 112),
    h: clamp(Math.round(half * 0.26), 40, 72),
  };
  const inner = Math.min(
    Math.hypot(card.w / 2, card.h / 2) + dot * 0.75,
    linkR - ringCount * Math.max(dot, 18),
  );
  const r0 = Math.max(card.h / 2 + 6, inner);
  const step = (linkR - r0) / Math.max(1, ringCount);
  return {
    w,
    h,
    radii: Array.from({ length: ringCount }, (_, k) => r0 + k * step),
    linkR,
    squash,
    card,
  };
};

const sentenceFor = (
  rows: Row[],
  rings: ShareRing[],
  link: ShareLinkAccess,
): string => {
  const parts: string[] = [];
  const linkLevel = LINK_LEVELS.find((l) => l.access === link);
  if (linkLevel) parts.push(`Anyone with the link ${linkLevel.can}.`);
  const others = rows.filter((r) => !r.isYou);
  if (others.length === 0) {
    parts.push(linkLevel ? "Only you are listed." : "Only you can see this.");
    return parts.join(" ");
  }
  const clauses: string[] = [];
  rings.forEach((ring, k) => {
    const here = rows.filter((r) => r.ring === k);
    if (here.length === 0) return;
    const hasYou = here.some((r) => r.isYou);
    const rest = here.filter((r) => !r.isYou);
    if (hasYou) {
      if (rest.length === 0) clauses.push(`you ${ring.can}`);
      else if (rest.length === 1)
        clauses.push(`you and ${rest[0]?.name ?? "one more"} ${ring.can}`);
      else clauses.push(`you and ${rest.length} others ${ring.can}`);
    } else if (rest.length === 1) {
      clauses.push(`${rest[0]?.name ?? "one person"} ${ring.can}`);
    } else {
      clauses.push(`${rest.length} people ${ring.can}`);
    }
  });
  const body =
    clauses.length <= 1
      ? (clauses[0] ?? "")
      : `${clauses.slice(0, -1).join(", ")} and ${clauses[clauses.length - 1]}`;
  parts.push(body.charAt(0).toUpperCase() + body.slice(1) + ".");
  return parts.join(" ");
};

/* ----------------------------------------------------------------------- */
/*                                  Avatar                                  */
/* ----------------------------------------------------------------------- */

function Initials({
  name,
  size,
  className,
}: {
  name: string;
  size: number;
  className?: string;
}) {
  const hue = hueOf(name);
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-mono font-medium select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.38)),
        background: `color-mix(in oklab, ${hue} 24%, var(--bg-2))`,
        color: `color-mix(in oklab, ${hue} 70%, var(--ink))`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

type PerimeterAvatarProps = {
  row: Row;
  spot: Spot;
  centre: { x: number; y: number };
  size: number;
  motionSafe: boolean;
  /** Why the spot changed, so the landing can bounce. */
  landed: "add" | "move" | null;
  /** Fly in from the centre on mount: a person just added. */
  enter: boolean;
  disabled: boolean;
  z: number;
  locate: (x: number, y: number) => number | null;
  onHover: (ring: number | null) => void;
  onDrop: (ring: number | null) => void;
  onTap: () => void;
};

function PerimeterAvatar({
  row,
  spot,
  centre,
  size,
  motionSafe,
  landed,
  enter,
  disabled,
  z,
  locate,
  onHover,
  onDrop,
  onTap,
}: PerimeterAvatarProps) {
  const x = useMotionValue(enter ? 0 : spot.x);
  const y = useMotionValue(enter ? 0 : spot.y);
  const [dragging, setDragging] = React.useState(false);
  const first = React.useRef(true);
  const drag = React.useRef<{
    id: number;
    sx: number;
    sy: number;
    moved: boolean;
    ring: number | null;
  } | null>(null);

  React.useEffect(() => {
    if (dragging) return;
    if (!motionSafe) {
      x.set(spot.x);
      y.set(spot.y);
      first.current = false;
      return;
    }
    if (first.current) {
      first.current = false;
      if (!enter) {
        x.set(spot.x);
        y.set(spot.y);
        return;
      }
    }
    const spring = landed ? springs.recoil : springs.glide;
    const ax = animate(x, spot.x, spring);
    const ay = animate(y, spot.y, spring);
    return () => {
      ax.stop();
      ay.stop();
    };
  }, [spot.x, spot.y, dragging, landed, enter, motionSafe, x, y]);

  const movable = !disabled && !row.isYou;

  const finish = (event: React.PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture was already released.
    }
    if (d.moved) {
      setDragging(false);
      onHover(null);
      onDrop(cancelled ? null : d.ring);
    } else if (!cancelled) {
      onTap();
    }
  };

  return (
    <motion.div
      role="presentation"
      data-person={row.id}
      initial={enter ? { opacity: 0, scale: 0.4 } : false}
      animate={{ opacity: 1, scale: dragging ? 1.15 : 1 }}
      exit={{ opacity: 0, scale: 0.5, transition: exitFor(durations.fast) }}
      transition={motionSafe ? springs.snap : { duration: durations.fast }}
      onPointerDown={(event) => {
        if (!movable || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          id: event.pointerId,
          sx: event.clientX,
          sy: event.clientY,
          moved: false,
          ring: null,
        };
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d || d.id !== event.pointerId) return;
        const dx = event.clientX - d.sx;
        const dy = event.clientY - d.sy;
        if (!d.moved) {
          if (Math.hypot(dx, dy) < DRAG_START) return;
          d.moved = true;
          setDragging(true);
        }
        const nx = spot.x + dx;
        const ny = spot.y + dy;
        x.set(nx);
        y.set(ny);
        const ring = locate(nx, ny);
        if (ring !== d.ring) {
          d.ring = ring;
          onHover(ring);
        }
      }}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => {
        if (drag.current && drag.current.id === event.pointerId) {
          finish(event, true);
        }
      }}
      style={{
        x,
        y,
        left: centre.x - size / 2,
        top: centre.y - size / 2,
        width: size,
        height: size,
        zIndex: dragging ? 40 : z,
        touchAction: movable ? "none" : undefined,
      }}
      className={cn(
        "absolute rounded-full border-2 border-card shadow-[0_1px_2px_color-mix(in_oklab,black_18%,transparent)]",
        movable
          ? dragging
            ? "cursor-grabbing"
            : "cursor-grab"
          : "cursor-default",
      )}
    >
      <Initials name={row.name} size={size - 4} />
      {row.isYou ? (
        <span className="absolute -right-1 -bottom-1 rounded-full border border-card bg-foreground px-1 font-mono text-[8px] leading-[12px] text-background">
          you
        </span>
      ) : null}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Rings                                   */
/* ----------------------------------------------------------------------- */

function RingPath({
  cx,
  cy,
  r,
  squash,
  className,
  style,
  dashed,
}: {
  cx: number;
  cy: number;
  r: number;
  squash: number;
  className?: string;
  style?: React.CSSProperties;
  dashed?: boolean;
}) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={r}
      ry={r * squash}
      fill="none"
      strokeDasharray={dashed ? "3 5" : undefined}
      strokeLinecap="round"
      className={cn("transition-[stroke,stroke-width] duration-200", className)}
      style={style}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Menu = {
  id: string;
  left: number;
  top?: number;
  bottom?: number;
};

/**
 * A sharing dialog drawn as a perimeter. The document sits as a small card in
 * the middle and the rings around it are access: Owners innermost, then
 * Editors, Commenters and Viewers, with "Anyone with the link" as the outer
 * ring. People sit on the ring their access names. Dragging an avatar follows
 * the pointer; the nearest ring brightens under it, and on release the avatar
 * lands on that ring on `springs.recoil` while the ring's other avatars make
 * room on `springs.glide` and the list beneath regroups. Someone added from the
 * directory search flies from the centre to the Viewers ring on the same
 * recoil. The link ring's switch opens it on `springs.snap`, the ring turning
 * from dashed to solid in the accent, and a Copy link button draws a check on
 * `springs.flick`. A "Who can see this" sentence at the foot rewrites itself
 * after every change.
 *
 * The list is the keyboard surface, one grid with a roving row: Up and Down
 * move among people, Alt+Up moves a person inward a ring and Alt+Down outward,
 * Delete removes, and Enter opens a Move-to menu on the row; Right reaches the
 * row's menu button. The search is a combobox whose results are a listbox.
 * Below a 40rem container (or with `ringStyle="list"`) the perimeter is
 * dropped and the grouped list with its Move-to menus is the whole surface.
 * Under reduced motion nothing travels: avatars appear on their new ring,
 * rows regroup in place and the sentence cross-fades.
 */
export function SharePerimeter({
  ringStyle = "rings",
  density = "cozy",
  accent = "cobalt",
  people,
  defaultPeople = defaultSharePeople,
  onChange,
  directory = defaultShareDirectory,
  linkAccess,
  defaultLinkAccess = "restricted",
  onLinkAccessChange,
  rings = defaultShareRings,
  you = defaultShareYou,
  doc = defaultShareDoc,
  url = defaultShareUrl,
  onCopyLink,
  status = "ready",
  onRetry,
  title = "Share",
  label,
  height = 540,
  disabled = false,
  className,
}: SharePerimeterProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const gridId = `${uid}-grid`;
  const listboxId = `${uid}-listbox`;
  const menuId = `${uid}-menu`;
  const searchId = `${uid}-search`;

  const [ownPeople, setOwnPeople] =
    React.useState<SharePerson[]>(defaultPeople);
  const current = people ?? ownPeople;
  const [ownLink, setOwnLink] =
    React.useState<ShareLinkAccess>(defaultLinkAccess);
  const link = linkAccess ?? ownLink;
  // The level the switch reopens the link at: the last one chosen.
  const [remembered, setRemembered] = React.useState<
    Exclude<ShareLinkAccess, "restricted">
  >(link === "restricted" ? "viewer" : link);

  const ready = status === "ready";
  const inert = disabled || !ready;
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  const [hoverRing, setHoverRing] = React.useState<number | null>(null);
  const [landed, setLanded] = React.useState<{
    id: string;
    kind: "add" | "move";
  } | null>(null);
  const [activeRow, setActiveRow] = React.useState<string | null>(null);
  const [focusReq, setFocusReq] = React.useState<{
    id: string;
    seq: number;
  } | null>(null);
  const [menu, setMenu] = React.useState<Menu | null>(null);
  const [query, setQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [activeOption, setActiveOption] = React.useState(0);
  const [copied, setCopied] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [perimEl, setPerimEl] = React.useState<HTMLDivElement | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLDivElement>());
  const menuBtns = React.useRef(new Map<string, HTMLButtonElement>());
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const copyTimer = React.useRef<number | null>(null);

  const dens = DENSITY[density] ?? DENSITY.cozy;

  /* -------------------------------- data ------------------------------- */

  const ringIndex = (access: ShareAccess) => {
    const i = rings.findIndex((r) => r.access === access);
    return i === -1 ? rings.length - 1 : i;
  };
  const youRing = Math.max(0, ringIndex("owner"));

  const rows: Row[] = rings.flatMap((ring, k) => [
    ...(k === youRing
      ? [{ id: you.id, name: you.name, email: you.email, ring: k, isYou: true }]
      : []),
    ...current
      .filter((p) => ringIndex(p.access) === k)
      .map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        ring: k,
        isYou: false,
      })),
  ]);
  const rowIds = rows.map((r) => r.id);
  const active =
    activeRow && rowIds.includes(activeRow) ? activeRow : (rowIds[0] ?? null);
  const others = rows.filter((r) => !r.isYou);
  const empty = others.length === 0;

  const present = new Set([you.id, ...current.map((p) => p.id)]);
  const q = query.trim().toLowerCase();
  const matches = directory
    .filter((d) => !present.has(d.id))
    .filter(
      (d) =>
        q === "" ||
        d.name.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        (d.team ?? "").toLowerCase().includes(q),
    )
    .slice(0, 6);
  const option =
    matches[clamp(activeOption, 0, Math.max(0, matches.length - 1))];
  const listOpen = searchOpen && !inert;

  /* ------------------------------ geometry ----------------------------- */

  const showPerimeter = ringStyle !== "list";
  const squash = ringStyle === "orbit" ? ORBIT_SQUASH : 1;
  const geo =
    showPerimeter && box && box.w > 140 && box.h > 140
      ? makeGeo(box.w, box.h, rings.length, dens.dot, squash)
      : null;
  const centre = geo ? { x: geo.w / 2, y: geo.h / 2 } : { x: 0, y: 0 };

  const spots = new Map<string, Spot>();
  if (geo) {
    rings.forEach((_, k) => {
      const members = rows.filter((r) => r.ring === k);
      const r = geo.radii[k] ?? 0;
      const start = -Math.PI / 2 + k * 0.7;
      members.forEach((row, j) => {
        const a = start + (j * 2 * Math.PI) / members.length;
        spots.set(row.id, {
          x: r3(Math.cos(a) * r),
          y: r3(Math.sin(a) * r * squash),
          ring: k,
        });
      });
    });
  }

  const locate = (x: number, y: number): number | null => {
    if (!geo) return null;
    const d = Math.hypot(x, y / geo.squash);
    const outer = geo.radii[geo.radii.length - 1] ?? 0;
    if (d > (outer + geo.linkR) / 2 + dens.dot * 0.4) return null;
    let best = 0;
    let gap = Number.POSITIVE_INFINITY;
    geo.radii.forEach((r, k) => {
      const g = Math.abs(d - r);
      if (g < gap) {
        gap = g;
        best = k;
      }
    });
    return best;
  };

  React.useEffect(() => {
    if (!perimEl || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const next = {
        w: Math.floor(perimEl.clientWidth),
        h: Math.floor(perimEl.clientHeight),
      };
      setBox((prev) =>
        prev && prev.w === next.w && prev.h === next.h ? prev : next,
      );
    };
    const ro = new ResizeObserver(measure);
    ro.observe(perimEl);
    return () => ro.disconnect();
  }, [perimEl]);

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: SharePerson[], change: ShareChange) => {
    if (people === undefined) setOwnPeople(next);
    onChange?.(next, change);
  };

  const requestFocus = (id: string) =>
    setFocusReq((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));

  const moveTo = (id: string, k: number, focus: boolean) => {
    if (inert) return;
    const ring = rings[k];
    const person = current.find((p) => p.id === id);
    if (!ring || !person) return;
    if (person.access === ring.access) {
      setAnnouncement(`${person.name} is already on ${ring.label}.`);
      return;
    }
    const next = current.map((p) =>
      p.id === id ? { ...p, access: ring.access } : p,
    );
    commit(next, {
      type: "move",
      personId: id,
      from: person.access,
      to: ring.access,
    });
    setLanded({ id, kind: "move" });
    setActiveRow(id);
    if (focus) requestFocus(id);
    setAnnouncement(`${person.name} moved to ${ring.label}: ${ring.can}.`);
  };

  const remove = (id: string) => {
    if (inert) return;
    const person = current.find((p) => p.id === id);
    if (!person) return;
    const i = rowIds.indexOf(id);
    const neighbour = rowIds[i + 1] ?? rowIds[i - 1] ?? null;
    commit(
      current.filter((p) => p.id !== id),
      { type: "remove", personId: id, from: person.access },
    );
    setMenu(null);
    if (neighbour) {
      setActiveRow(neighbour);
      requestFocus(neighbour);
    }
    setAnnouncement(`${person.name} removed. They no longer have access.`);
  };

  const add = (entry: ShareDirectoryEntry) => {
    if (inert) return;
    const ring =
      rings.find((r) => r.access === "viewer") ?? rings[rings.length - 1];
    if (!ring) return;
    const person: SharePerson = {
      id: entry.id,
      name: entry.name,
      email: entry.email,
      access: ring.access,
    };
    commit([...current, person], {
      type: "add",
      personId: entry.id,
      to: ring.access,
    });
    setLanded({ id: entry.id, kind: "add" });
    setActiveRow(entry.id);
    setQuery("");
    setActiveOption(0);
    setAnnouncement(`${entry.name} added to ${ring.label}: ${ring.can}.`);
  };

  const setLink = (next: ShareLinkAccess) => {
    if (inert || next === link) return;
    if (linkAccess === undefined) setOwnLink(next);
    if (next !== "restricted") setRemembered(next);
    onLinkAccessChange?.(next);
    const level = LINK_LEVELS.find((l) => l.access === next);
    setAnnouncement(
      level
        ? `Link opened. Anyone with the link ${level.can}.`
        : "Link restricted. Only the people listed have access.",
    );
  };

  const copy = () => {
    if (inert) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    onCopyLink?.(url);
    setCopied(true);
    setAnnouncement("Link copied.");
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => {
      copyTimer.current = null;
      setCopied(false);
    }, COPIED_MS);
  };

  React.useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  // Focus lands on a row after the DOM regrouped around it.
  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const node = rowNodes.current.get(focusReq.id);
    node?.focus({ preventScroll: true });
    node?.scrollIntoView?.({ block: "nearest" });
  }, [focusReq]);

  /* -------------------------------- menu ------------------------------- */

  const openMenu = (id: string) => {
    const root = rootRef.current;
    const btn = menuBtns.current.get(id);
    if (!root || !btn || inert) return;
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    const rr = root.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const width = 200;
    const left = Math.round(
      clamp(br.right - rr.left - width, 8, Math.max(8, rr.width - width - 8)),
    );
    const below = rr.bottom - br.bottom - 8;
    const need = 36 * (rings.length + 1) + 20;
    if (below >= need || below >= br.top - rr.top) {
      setMenu({ id, left, top: Math.round(br.bottom - rr.top + 4) });
    } else {
      setMenu({ id, left, bottom: Math.round(rr.bottom - br.top + 4) });
    }
  };

  const closeMenu = (returnFocus: boolean) => {
    const id = menu?.id;
    setMenu(null);
    if (returnFocus && id) rowNodes.current.get(id)?.focus();
  };

  const menuFor = menu?.id ?? null;
  React.useEffect(() => {
    if (!menuFor) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (menuBtns.current.get(menuFor)?.contains(target)) return;
      setMenu(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [menuFor]);

  React.useLayoutEffect(() => {
    if (!menuFor) return;
    const first =
      menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]');
    first?.focus();
  }, [menuFor]);

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
    );
    const i = items.indexOf(document.activeElement as HTMLElement);
    let to = -1;
    if (event.key === "ArrowDown") to = (i + 1) % items.length;
    else if (event.key === "ArrowUp")
      to = (i - 1 + items.length) % items.length;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = items.length - 1;
    else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      closeMenu(true);
      return;
    } else return;
    event.preventDefault();
    items[to]?.focus();
  };

  /* ------------------------------ keyboard ----------------------------- */

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setActiveRow(id);
    rowNodes.current.get(id)?.focus();
  };

  const onRowKey = (event: React.KeyboardEvent, row: Row) => {
    const i = rowIds.indexOf(row.id);
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      if (row.isYou) {
        setAnnouncement("You own this document; your access cannot change.");
        return;
      }
      const to = clamp(
        row.ring + (event.key === "ArrowUp" ? -1 : 1),
        0,
        rings.length - 1,
      );
      if (to === row.ring) {
        setAnnouncement(
          event.key === "ArrowUp"
            ? `${row.name} is already on the innermost ring.`
            : `${row.name} is already on the outermost ring.`,
        );
        return;
      }
      moveTo(row.id, to, true);
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRow(rowIds[Math.min(i + 1, rowIds.length - 1)]);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusRow(rowIds[Math.max(i - 1, 0)]);
        return;
      case "Home":
        event.preventDefault();
        focusRow(rowIds[0]);
        return;
      case "End":
        event.preventDefault();
        focusRow(rowIds[rowIds.length - 1]);
        return;
      case "ArrowRight":
        event.preventDefault();
        menuBtns.current.get(row.id)?.focus();
        return;
      case "Enter":
      case " ":
        if (row.isYou) return;
        event.preventDefault();
        openMenu(row.id);
        return;
      case "Delete":
      case "Backspace":
        if (row.isYou) return;
        event.preventDefault();
        remove(row.id);
        return;
      default:
    }
  };

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchOpen(true);
      setActiveOption((i) => Math.min(i + 1, Math.max(0, matches.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveOption((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (!listOpen || !option) return;
      event.preventDefault();
      add(option);
    } else if (event.key === "Escape") {
      if (searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
      } else if (query) {
        event.preventDefault();
        setQuery("");
      }
    }
  };

  /* ------------------------------- render ------------------------------ */

  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;
  const linkOpen = link !== "restricted";
  const linkLevel = LINK_LEVELS.find((l) => l.access === link);
  const sentence = sentenceFor(rows, rings, link);
  const step = cascade(Math.min(rows.length, 10));
  const groups = rings
    .map((ring, k) => ({ ring, k, rows: rows.filter((r) => r.ring === k) }))
    .filter((g) => g.rows.length > 0);

  const rowHeight = dens.row;

  const renderRow = (row: Row, i: number) => {
    const ring = rings[row.ring];
    const isActive = row.id === active;
    const menuOpen = menu?.id === row.id;
    return (
      <motion.div
        key={row.id}
        role="row"
        aria-selected={isActive}
        aria-label={`${row.isYou ? `${row.name}, you` : row.name}, ${row.email}, ${ring?.label ?? ""}`}
        tabIndex={isActive ? 0 : -1}
        ref={(node) => {
          if (node) rowNodes.current.set(row.id, node);
          else rowNodes.current.delete(row.id);
        }}
        onFocus={(event) => {
          if (event.target === event.currentTarget) setActiveRow(row.id);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          onRowKey(event, row);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setActiveRow(row.id);
        }}
        layout={motionSafe ? "position" : false}
        initial={
          live ? { opacity: 0, y: motionSafe ? distances.nudge : 0 } : false
        }
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={{
          layout: springs.glide,
          y: motionSafe
            ? { ...springs.glide, delay: r3(Math.min(i, 10) * step) }
            : { duration: 0 },
          opacity: { duration: durations.base, ease: easings.enter },
        }}
        style={{ height: rowHeight }}
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-2 px-2 transition-colors",
          isActive && !menuOpen && "bg-surface-1",
          menuOpen && "bg-surface-2",
          landed?.id === row.id &&
            "bg-[color-mix(in_oklab,var(--sp-accent)_10%,transparent)]",
          FOCUS_RING,
        )}
      >
        <div role="gridcell" className="contents">
          <Initials name={row.name} size={dens.avatar} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className={cn("truncate text-foreground", dens.text)}>
              {row.name}
              {row.isYou ? (
                <span className="ml-1.5 font-mono text-[10px] text-ink-3">
                  you
                </span>
              ) : null}
            </span>
            <span className="hidden truncate text-[11px] text-ink-3 @min-[26rem]:block">
              {row.email}
            </span>
          </span>
        </div>
        <div role="gridcell" className="flex items-center">
          {row.isYou ? (
            <span className="px-2 text-[11px] text-ink-3">Owner</span>
          ) : (
            <button
              ref={(node) => {
                if (node) menuBtns.current.set(row.id, node);
                else menuBtns.current.delete(row.id);
              }}
              type="button"
              tabIndex={-1}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              aria-label={`Move ${row.name}, now on ${ring?.label ?? "a ring"}`}
              aria-disabled={inert || undefined}
              onClick={() => openMenu(row.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  rowNodes.current.get(row.id)?.focus();
                } else if (
                  event.key === "ArrowDown" ||
                  event.key === "ArrowUp"
                ) {
                  event.preventDefault();
                  openMenu(row.id);
                } else if (event.key === "Escape" && menuOpen) {
                  event.preventDefault();
                  closeMenu(true);
                }
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-2 border border-transparent px-2 text-[11px] text-ink-2 transition-colors",
                !inert &&
                  "hover:border-hairline hover:bg-surface-2 hover:text-foreground",
                menuOpen && "border-hairline bg-surface-2 text-foreground",
                FOCUS_RING,
              )}
            >
              <span className="hidden @min-[22rem]:inline">
                {ring?.label.replace(/s$/, "") ?? "Move"}
              </span>
              <ChevronDown aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  const list = (
    <div
      id={gridId}
      role="grid"
      aria-label="People with access"
      aria-describedby={hintId}
      aria-rowcount={rows.length}
      className="flex flex-col gap-0.5 px-2 pb-2"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {groups.map((g) => (
          <motion.div
            key={g.ring.access}
            role="rowgroup"
            layout={motionSafe ? "position" : false}
            transition={{ layout: springs.glide }}
            initial={live ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            className="flex flex-col gap-0.5"
          >
            <div
              role="row"
              className="flex items-center gap-2 px-2 pt-2.5 pb-1"
            >
              <span role="gridcell" aria-colspan={2} className={SMALL}>
                {g.ring.label}
                <span className="ml-1.5 tracking-normal normal-case">
                  {g.ring.can}
                </span>
              </span>
            </div>
            <AnimatePresence initial={false} mode="popLayout">
              {g.rows.map((row) => renderRow(row, rowIds.indexOf(row.id)))}
            </AnimatePresence>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  const search = (
    <div className="relative shrink-0 px-3 pt-3 pb-2">
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-2 border border-hairline bg-surface-0 px-2.5 transition-colors",
          "focus-within:border-hairline-strong",
          inert && "opacity-60",
        )}
      >
        <Search aria-hidden className="size-3.5 shrink-0 text-ink-3" />
        <input
          ref={searchRef}
          id={searchId}
          type="text"
          role="combobox"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={inert}
          value={query}
          placeholder="Add people from the directory"
          aria-label="Add people from the directory"
          aria-expanded={listOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            listOpen && option ? `${listboxId}-${option.id}` : undefined
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveOption(0);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setSearchOpen(false)}
          onKeyDown={onSearchKey}
          className="h-full w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-3"
        />
        {query ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear search"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              setActiveOption(0);
              searchRef.current?.focus();
            }}
            className="rounded-1 p-0.5 text-ink-3 hover:text-foreground"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </div>
      <AnimatePresence>
        {listOpen ? (
          <motion.ul
            key="listbox"
            id={listboxId}
            role="listbox"
            aria-label="Directory"
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            className="absolute inset-x-3 top-full z-30 -mt-0.5 flex max-h-64 flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
          >
            {matches.length === 0 ? (
              <li
                role="option"
                aria-selected={false}
                aria-disabled
                className="px-2.5 py-2 text-[12px] text-ink-3"
              >
                {q
                  ? `Nobody matches "${query.trim()}".`
                  : "Everyone is already here."}
              </li>
            ) : (
              matches.map((entry) => {
                const selected = option?.id === entry.id;
                return (
                  <li
                    key={entry.id}
                    id={`${listboxId}-${entry.id}`}
                    role="option"
                    aria-selected={selected}
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerMove={() => {
                      const i = matches.indexOf(entry);
                      if (i !== activeOption) setActiveOption(i);
                    }}
                    onClick={() => add(entry)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-2 px-2 py-1.5 transition-colors",
                      selected && "bg-surface-2",
                    )}
                  >
                    <Initials name={entry.name} size={22} />
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-[13px] text-foreground">
                        {entry.name}
                      </span>
                      <span className="truncate text-[11px] text-ink-3">
                        {entry.email}
                        {entry.team ? ` · ${entry.team}` : ""}
                      </span>
                    </span>
                    <UserPlus
                      aria-hidden
                      className={cn(
                        "size-3.5 shrink-0 text-ink-3 transition-opacity",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </li>
                );
              })
            )}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const linkRow = (
    <div className="flex shrink-0 flex-col gap-2 border-t border-hairline px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={linkOpen}
          aria-disabled={inert || undefined}
          aria-label="Anyone with the link"
          onClick={() => setLink(linkOpen ? "restricted" : remembered)}
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
            linkOpen
              ? "border-transparent bg-(--sp-accent)"
              : "border-hairline-strong bg-surface-2",
            inert ? "cursor-not-allowed" : "cursor-pointer",
            FOCUS_RING,
          )}
        >
          <motion.span
            aria-hidden
            initial={false}
            animate={{ x: linkOpen ? 16 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
            className={cn(
              "absolute top-0.5 left-0.5 block size-3.5 rounded-full shadow-[0_1px_2px_color-mix(in_oklab,black_25%,transparent)]",
              linkOpen ? "bg-background" : "bg-foreground",
            )}
          />
        </button>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] text-foreground">
            Anyone with the link
          </span>
          <span className="truncate text-[11px] text-ink-3">
            {linkLevel
              ? `${linkLevel.can}, no sign-in needed`
              : "Restricted to the people listed"}
          </span>
        </span>
        <button
          type="button"
          onClick={copy}
          aria-disabled={inert || undefined}
          aria-label={copied ? "Link copied" : "Copy link"}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[11px] text-ink-2 transition-colors",
            !inert && "hover:bg-surface-2 hover:text-foreground",
            copied && "border-transparent bg-cobalt-wash text-cobalt-bright",
            FOCUS_RING,
          )}
        >
          <span className="relative flex size-3.5 items-center justify-center">
            <AnimatePresence initial={false} mode="wait">
              {copied ? (
                <motion.svg
                  key="check"
                  aria-hidden
                  viewBox="0 0 14 14"
                  className="absolute size-3.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast }}
                >
                  <motion.path
                    d="M3 7.4 5.8 10 11 4.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={motionSafe ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                </motion.svg>
              ) : (
                <motion.span
                  key="link"
                  className="absolute"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast }}
                >
                  <Link2 aria-hidden className="size-3.5" />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span className="hidden @min-[22rem]:inline">
            {copied ? "Copied" : "Copy link"}
          </span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {linkOpen ? (
          <motion.div
            key="levels"
            role="radiogroup"
            aria-label="What anyone with the link can do"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{
              opacity: 0,
              height: 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.snap,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.fast }
            }
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1 pl-[46px]">
              {LINK_LEVELS.map((level) => {
                const checked = level.access === link;
                return (
                  <button
                    key={level.access}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={checked ? 0 : -1}
                    aria-disabled={inert || undefined}
                    onClick={() => setLink(level.access)}
                    onKeyDown={(event) => {
                      const i = LINK_LEVELS.indexOf(level);
                      const to =
                        event.key === "ArrowRight" || event.key === "ArrowDown"
                          ? (i + 1) % LINK_LEVELS.length
                          : event.key === "ArrowLeft" || event.key === "ArrowUp"
                            ? (i - 1 + LINK_LEVELS.length) % LINK_LEVELS.length
                            : null;
                      if (to === null) return;
                      event.preventDefault();
                      const next = LINK_LEVELS[to];
                      if (!next) return;
                      setLink(next.access);
                      (
                        event.currentTarget.parentElement?.children[to] as
                          HTMLElement | undefined
                      )?.focus();
                    }}
                    className={cn(
                      "relative inline-flex h-6 items-center rounded-full px-2.5 text-[11px] transition-colors",
                      checked
                        ? "text-foreground"
                        : "text-ink-3 hover:text-ink-2",
                      FOCUS_RING,
                    )}
                  >
                    {checked ? (
                      <motion.span
                        aria-hidden
                        layoutId={`${uid}-level`}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                        className="absolute inset-0 rounded-full border border-hairline-strong bg-surface-2"
                      />
                    ) : null}
                    <span className="relative">{level.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const perimeter = showPerimeter ? (
    <div
      ref={setPerimEl}
      aria-hidden
      className="relative hidden min-h-0 min-w-0 flex-1 select-none @min-[40rem]:block"
    >
      {geo ? (
        <>
          <svg
            viewBox={`0 0 ${geo.w} ${geo.h}`}
            width={geo.w}
            height={geo.h}
            className="absolute inset-0"
          >
            {geo.radii.map((r, k) => {
              const hot = hoverRing === k;
              const landedHere =
                landed !== null && spots.get(landed.id)?.ring === k;
              return (
                <g key={k}>
                  <RingPath
                    cx={centre.x}
                    cy={centre.y}
                    r={r}
                    squash={geo.squash}
                    style={{
                      stroke: hot
                        ? "var(--sp-accent)"
                        : landedHere
                          ? `color-mix(in oklab, var(--sp-accent) 55%, var(--hairline-strong))`
                          : "var(--hairline-strong)",
                      strokeWidth: hot ? 2 : 1,
                    }}
                  />
                  <motion.ellipse
                    cx={centre.x}
                    cy={centre.y}
                    rx={r}
                    ry={r * geo.squash}
                    fill="none"
                    stroke="var(--sp-accent)"
                    strokeWidth={10}
                    initial={false}
                    animate={{ opacity: hot ? 0.12 : 0 }}
                    transition={{ duration: durations.fast }}
                  />
                  <text
                    x={centre.x}
                    y={
                      geo.squash < 1
                        ? centre.y + r * geo.squash + 11
                        : centre.y - r - 5
                    }
                    textAnchor="middle"
                    className="font-mono text-[9px] tracking-[0.08em] uppercase"
                    style={{
                      fill: hot ? "var(--sp-accent)" : "var(--ink-3)",
                      transition: "fill 200ms",
                    }}
                  >
                    {rings[k]?.label}
                  </text>
                </g>
              );
            })}
            {/* The link ring: dashed and quiet while restricted, solid in the accent once opened. */}
            <RingPath
              cx={centre.x}
              cy={centre.y}
              r={geo.linkR}
              squash={geo.squash}
              dashed={!linkOpen}
              style={{
                stroke: linkOpen
                  ? "var(--sp-accent)"
                  : "var(--hairline-strong)",
                strokeWidth: linkOpen ? 1.5 : 1,
              }}
            />
            <motion.ellipse
              cx={centre.x}
              cy={centre.y}
              rx={geo.linkR}
              ry={geo.linkR * geo.squash}
              fill="none"
              stroke="var(--sp-accent)"
              strokeWidth={8}
              initial={false}
              animate={{ opacity: linkOpen ? 0.14 : 0 }}
              transition={{ duration: durations.base }}
            />
            <text
              x={centre.x}
              y={
                geo.squash < 1
                  ? centre.y + geo.linkR * geo.squash + 11
                  : centre.y - geo.linkR - 5
              }
              textAnchor="middle"
              className="font-mono text-[9px] tracking-[0.08em] uppercase"
              style={{
                fill: linkOpen ? "var(--sp-accent)" : "var(--ink-3)",
                transition: "fill 200ms",
              }}
            >
              Anyone with the link
            </text>
          </svg>

          {/* The link badge on the outer ring. */}
          <motion.span
            initial={false}
            animate={{
              scale: linkOpen ? 1 : 0.6,
              opacity: linkOpen ? 1 : 0,
            }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
            style={{
              left: centre.x + geo.linkR - 11,
              top: centre.y - 11,
            }}
            className="absolute flex size-[22px] items-center justify-center rounded-full border border-card bg-(--sp-accent) text-background"
          >
            <Link2 aria-hidden className="size-3" />
          </motion.span>

          {/* The document at the centre. */}
          <div
            style={{
              left: centre.x - geo.card.w / 2,
              top: centre.y - geo.card.h / 2,
              width: geo.card.w,
              height: geo.card.h,
            }}
            className="absolute flex flex-col justify-between rounded-2 border border-hairline-strong bg-popover px-2 py-1.5 shadow-[0_6px_18px_-10px_color-mix(in_oklab,black_40%,transparent)]"
          >
            <FileText aria-hidden className="size-3.5 text-ink-3" />
            <span className="flex flex-col leading-tight">
              <span className="truncate text-[10px] font-medium text-foreground">
                {doc.title}
              </span>
              {doc.kind ? (
                <span className="truncate font-mono text-[8px] tracking-[0.08em] text-ink-3 uppercase">
                  {doc.kind}
                </span>
              ) : null}
            </span>
          </div>

          <AnimatePresence initial={false}>
            {[...rows]
              .sort(
                (a, b) => (spots.get(a.id)?.y ?? 0) - (spots.get(b.id)?.y ?? 0),
              )
              .map((row, z) => {
                const spot = spots.get(row.id);
                if (!spot) return null;
                return (
                  <PerimeterAvatar
                    key={row.id}
                    row={row}
                    spot={spot}
                    centre={centre}
                    size={dens.dot}
                    motionSafe={motionSafe}
                    landed={landed?.id === row.id ? landed.kind : null}
                    enter={
                      live && landed?.id === row.id && landed.kind === "add"
                    }
                    disabled={inert}
                    z={z + 1}
                    locate={locate}
                    onHover={setHoverRing}
                    onDrop={(ring) => {
                      if (ring === null) {
                        setLanded({ id: row.id, kind: "move" });
                        setAnnouncement(
                          `${row.name} stays on ${rings[spot.ring]?.label ?? "the same ring"}.`,
                        );
                        return;
                      }
                      if (ring === spot.ring) {
                        setLanded({ id: row.id, kind: "move" });
                        return;
                      }
                      moveTo(row.id, ring, false);
                    }}
                    onTap={() => {
                      setActiveRow(row.id);
                      requestFocus(row.id);
                    }}
                  />
                );
              })}
          </AnimatePresence>
        </>
      ) : null}
    </div>
  ) : null;

  const skeleton = (
    <div aria-hidden className="flex min-h-0 flex-1">
      {showPerimeter ? (
        <div className="hidden flex-1 items-center justify-center @min-[40rem]:flex">
          <div className="relative size-[70%] max-w-[360px]">
            {[0.3, 0.5, 0.7, 0.9].map((f, i) => (
              <span
                key={f}
                className="absolute rounded-full border border-hairline motion-safe:animate-pulse"
                style={{
                  inset: `${(1 - f) * 50}%`,
                  animationDelay: `${i * 120}ms`,
                }}
              />
            ))}
            <span className="absolute top-1/2 left-1/2 h-10 w-16 -translate-x-1/2 -translate-y-1/2 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 pt-3">
        <span className="h-9 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="flex items-center gap-2.5 px-2 motion-safe:animate-pulse"
            style={{ height: rowHeight, animationDelay: `${i * 90}ms` }}
          >
            <span
              className="rounded-full bg-surface-2"
              style={{ width: dens.avatar, height: dens.avatar }}
            />
            <span
              className="h-3 rounded-1 bg-surface-2"
              style={{ width: 90 + ((i * 37) % 60) }}
            />
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--sp-accent" as string]: accentVar }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move between people. Alt with Up or Down moves a person
        inward or outward a ring. Enter opens the access menu. Delete removes.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="shrink-0 text-sm font-semibold">
            {title}
          </p>
          <p className="min-w-0 truncate text-[12px] text-ink-3">{doc.title}</p>
        </div>
        {ready ? (
          <p className={cn("shrink-0", SMALL)}>
            {others.length === 0 ? "only you" : `${others.length + 1} people`}
            {linkOpen ? " · link open" : ""}
          </p>
        ) : null}
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The people with access didn&apos;t load.
          </p>
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
        skeleton
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1",
            showPerimeter &&
              "@min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]",
          )}
        >
          {perimeter}
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              showPerimeter &&
                "@min-[40rem]:border-l @min-[40rem]:border-hairline",
            )}
          >
            {search}
            <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {empty ? (
                <div className="flex flex-col items-center gap-2 px-6 pt-8 pb-6 text-center">
                  <Users aria-hidden className="size-5 text-ink-3" />
                  <p className="text-sm text-foreground">
                    Only you can see this.
                  </p>
                  <p className="max-w-[26ch] text-[12px] text-ink-3">
                    Add someone from the directory and they land on the Viewers
                    ring.
                  </p>
                  <button
                    type="button"
                    onClick={() => searchRef.current?.focus()}
                    aria-disabled={inert || undefined}
                    className={cn(
                      "mt-1 inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <UserPlus aria-hidden className="size-3.5" />
                    Add someone
                  </button>
                </div>
              ) : null}
              {list}
            </div>
            {linkRow}
          </div>
        </div>
      )}

      {ready ? (
        <footer className="flex min-h-10 shrink-0 items-center gap-2 border-t border-hairline bg-surface-0 px-4 py-2">
          <span className={cn("shrink-0", SMALL)}>Who can see this</span>
          <span className="relative min-w-0 flex-1">
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={sentence}
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.glide,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
                className="block truncate text-[12px] text-ink-2"
                title={sentence}
              >
                {sentence}
              </motion.span>
            </AnimatePresence>
          </span>
        </footer>
      ) : null}

      <AnimatePresence>
        {menu ? (
          <motion.div
            key={menu.id}
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Move ${rows.find((r) => r.id === menu.id)?.name ?? "person"}`}
            onKeyDown={onMenuKey}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (next && !event.currentTarget.contains(next)) setMenu(null);
            }}
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            style={{
              left: menu.left,
              top: menu.top,
              bottom: menu.bottom,
              width: 200,
            }}
            className="absolute z-30 flex flex-col gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
          >
            <span className={cn("px-2 pt-1 pb-1", SMALL)}>Move to</span>
            {rings.map((ring, k) => {
              const here =
                ringIndex(
                  current.find((p) => p.id === menu.id)?.access ?? "viewer",
                ) === k;
              return (
                <button
                  key={ring.access}
                  type="button"
                  role="menuitemradio"
                  aria-checked={here}
                  tabIndex={-1}
                  onClick={() => {
                    moveTo(menu.id, k, true);
                    setMenu(null);
                  }}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-2 px-2 text-left text-[12px] text-foreground transition-colors hover:bg-surface-2 focus-visible:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  <span className="flex size-3.5 items-center justify-center">
                    {here ? <Check aria-hidden className="size-3.5" /> : null}
                  </span>
                  <span className="flex-1">{ring.label}</span>
                  <span className="text-[11px] text-ink-3">{ring.can}</span>
                </button>
              );
            })}
            <span aria-hidden className="my-0.5 h-px bg-hairline" />
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => remove(menu.id)}
              className={cn(
                "flex h-8 items-center gap-2 rounded-2 px-2 text-left text-[12px] text-danger transition-colors hover:bg-surface-2 focus-visible:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <span className="flex size-3.5 items-center justify-center">
                <X aria-hidden className="size-3.5" />
              </span>
              Remove access
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
