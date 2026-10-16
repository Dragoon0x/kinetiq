"use client";

import * as React from "react";
import { createPortal } from "react-dom";

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
  Building2,
  Check,
  ChevronDown,
  Link2,
  LoaderCircle,
  Lock,
  RotateCcw,
  Send,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type ShareRole = "owner" | "editor" | "commenter" | "viewer";
export type ShareLink = "invited" | "org" | "anyone";
export type ShareRingStyle = "line" | "dash" | "halo";
export type ShareDensity = "compact" | "cozy" | "roomy";
export type ShareStatus = "ready" | "loading" | "error";

export type SharePerson = {
  id: string;
  name: string;
  email: string;
  role: ShareRole;
  /** Pending people were invited and have not opened it yet. @default "active" */
  status?: "active" | "pending";
  /** When a pending invite was sent, in ms. */
  invitedAt?: number;
};

/** Someone the add field can suggest. */
export type ShareContact = { id: string; name: string; email: string };

export type ShareOrg = {
  /** Shown on the middle level: "Anyone at Coldbrook". */
  name: string;
  /** Addresses at this domain are colleagues; anything else is outside. */
  domain: string;
  /** How many people the middle level reaches. */
  size: number;
};

export type SharePerimeterProps = {
  /** Controlled list of everyone with access, owners and pending invites included. */
  people?: SharePerson[];
  /** Initial list when uncontrolled. @default defaultSharePeople */
  defaultPeople?: SharePerson[];
  /** Fires from the invite, role change or removal that changed the list, with the whole list. */
  onPeopleChange?: (people: SharePerson[]) => void;
  /** Colleagues the add field suggests as you type. @default defaultShareDirectory */
  directory?: ShareContact[];
  /** Controlled link access. */
  link?: ShareLink;
  /** Initial link access when uncontrolled. @default "invited" */
  defaultLink?: ShareLink;
  /** Fires from the press or arrow key that changed link access. */
  onLinkChange?: (link: ShareLink) => void;
  /** Someone was invited. Return a promise to show the invite sending; a rejection stays inline on the row. */
  onInvite?: (person: SharePerson, role: ShareRole) => void | Promise<void>;
  /** A person's role was changed from their menu. */
  onRoleChange?: (person: SharePerson, role: ShareRole) => void;
  /** Resend was pressed on a pending invite. A rejection stays inline on the row. */
  onResend?: (person: SharePerson) => void | Promise<void>;
  /** Remove access was chosen from a person's menu. */
  onRemove?: (person: SharePerson) => void;
  /** Controlled open state of the dialog. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default true */
  defaultOpen?: boolean;
  /** Fires when Share, Done, the close button, the scrim or Escape opens or closes it. */
  onOpenChange?: (open: boolean) => void;
  /** The document being shared. @default "Q4 river crossings plan" */
  documentTitle?: string;
  /** The organisation behind the middle level. @default Coldbrook, coldbrook.co, 240 people */
  org?: ShareOrg;
  /** The id of the person looking at the dialog, marked "you". @default "mara" */
  me?: string;
  /** The moment invite ages count from, in ms — never read from the clock. @default defaultShareNow */
  now?: number;
  /** Whether the access list has loaded. @default "ready" */
  status?: ShareStatus;
  /** "Try again" was pressed after the access list failed to load. */
  onRetry?: () => void;
  /** How the perimeter is drawn: a crisp line, a dashed fence that opens up, or a soft halo. @default "line" */
  ringStyle?: ShareRingStyle;
  /** Row heights, avatar size and padding. @default "cozy" */
  density?: ShareDensity;
  /** The perimeter, lit colleagues, the chosen level and Done, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Height of the frame in px; the list scrolls inside the dialog. @default 540 */
  height?: number;
  /** Nothing can be changed; the dialog still opens and closes. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Monday 12 October 2026, 15:20 UTC. */
export const defaultShareNow = Date.UTC(2026, 9, 12, 15, 20);

export const defaultShareOrg: ShareOrg = {
  name: "Coldbrook",
  domain: "coldbrook.co",
  size: 240,
};

/** The river crossings team, and a surveyor from outside still to accept. */
export const defaultSharePeople: SharePerson[] = [
  {
    id: "mara",
    name: "Mara Lindqvist",
    email: "mara@coldbrook.co",
    role: "owner",
  },
  {
    id: "tomasz",
    name: "Tomasz Wren",
    email: "tomasz@coldbrook.co",
    role: "editor",
  },
  {
    id: "ade",
    name: "Ade Okonjo",
    email: "ade@coldbrook.co",
    role: "commenter",
  },
  {
    id: "priya",
    name: "Priya Raman",
    email: "priya@coldbrook.co",
    role: "viewer",
  },
  {
    id: "hal",
    name: "Hal Brennan",
    email: "hal@coldbrook.co",
    role: "editor",
  },
  {
    id: "sam",
    name: "Sam Ortega",
    email: "sam.ortega@basinworks.io",
    role: "viewer",
    status: "pending",
    invitedAt: defaultShareNow - 2 * DAY - 3 * HOUR,
  },
];

export const defaultShareDirectory: ShareContact[] = [
  { id: "jules", name: "Jules Fairbank", email: "jules@coldbrook.co" },
  { id: "ines", name: "Ines Varga", email: "ines@coldbrook.co" },
  { id: "kofi", name: "Kofi Mensah", email: "kofi@coldbrook.co" },
  { id: "rui", name: "Rui Tavares", email: "rui@coldbrook.co" },
  { id: "lena", name: "Lena Strand", email: "lena@coldbrook.co" },
  { id: "noor", name: "Noor Haddad", email: "noor@coldbrook.co" },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const ROLE_LABEL: Record<ShareRole, string> = {
  owner: "Owner",
  editor: "Editor",
  commenter: "Commenter",
  viewer: "Viewer",
};
const ROLE_NOTE: Record<ShareRole, string> = {
  owner: "Full control",
  editor: "Can change anything",
  commenter: "Can comment and suggest",
  viewer: "Can read",
};
const GRANTABLE: ShareRole[] = ["editor", "commenter", "viewer"];
const LEVELS: ShareLink[] = ["invited", "org", "anyone"];

const DENSITY: Record<
  ShareDensity,
  { field: number; avatar: number; row: string; face: string; pad: string }
> = {
  compact: {
    field: 132,
    avatar: 11,
    row: "py-1.5",
    face: "size-6",
    pad: "px-3",
  },
  cozy: { field: 148, avatar: 13, row: "py-2", face: "size-7", pad: "px-4" },
  roomy: { field: 164, avatar: 15, row: "py-3", face: "size-8", pad: "px-5" },
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** FNV-1a, unsigned: a stable number from an id for colours and seeds. */
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const initials = (name: string) =>
  name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/** A face colour turned from the accent's hue: varied, but one family. */
const faceOf = (id: string) => {
  const turn = (hash(id) % 9) * 40 - 160;
  return {
    fill: `oklch(from var(--accent-bright) 0.86 0.06 calc(h + ${turn}))`,
    ink: `oklch(from var(--accent-bright) 0.34 0.08 calc(h + ${turn}))`,
  };
};

function ago(at: number | undefined, now: number): string {
  if (at === undefined) return "";
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";
const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function levelCopy(level: ShareLink, org: ShareOrg) {
  if (level === "org") {
    return {
      short: org.name,
      title: `Anyone at ${org.name}`,
      line: `Anyone signed in at ${org.domain} can open it.`,
      Icon: Building2,
    };
  }
  if (level === "anyone") {
    return {
      short: "Anyone",
      title: "Anyone with the link",
      line: "Anyone who has the link can open it, no sign-in needed.",
      Icon: Link2,
    };
  }
  return {
    short: "Invited",
    title: "Invited only",
    line: "Only the people below can open it.",
    Icon: Lock,
  };
}

/* ----------------------------------------------------------------------- */
/*                                Role menu                                 */
/* ----------------------------------------------------------------------- */

/**
 * A role picker that is a real menu: the button opens a list of
 * `menuitemradio`s that rises from a nudge on snap; arrows, Home and End move,
 * a letter jumps, Enter or Space chooses, and Escape or Tab closes it and
 * returns focus to the button — handled here, where focus is, so the dialog
 * never sees that Escape.
 */
function RoleMenu({
  value,
  label,
  onChoose,
  onRemove,
  disabled,
  motionSafe,
  compact,
}: {
  value: ShareRole;
  label: string;
  onChoose: (role: ShareRole) => void;
  onRemove?: () => void;
  disabled: boolean;
  motionSafe: boolean;
  compact?: boolean;
}) {
  const uid = React.useId();
  const [place, setPlace] = React.useState<{
    style: React.CSSProperties;
    up: boolean;
  } | null>(null);
  // Kept after closing, so the menu's exit can play on the same layer.
  const [layer, setLayer] = React.useState<HTMLElement | null>(null);
  const open = place !== null;
  const button = React.useRef<HTMLButtonElement | null>(null);
  const menu = React.useRef<HTMLDivElement | null>(null);
  const items = React.useRef<(HTMLButtonElement | null)[]>([]);
  const entries: { key: string; text: string; role?: ShareRole }[] = [
    ...GRANTABLE.map((role) => ({ key: role, text: ROLE_LABEL[role], role })),
    ...(onRemove ? [{ key: "remove", text: "Remove access" }] : []),
  ];

  const close = (refocus: boolean) => {
    setPlace(null);
    if (refocus) button.current?.focus();
  };

  const show = () => {
    const b = button.current;
    // The menu lives on the dialog's own layer, so the scrolling list can
    // never clip it; it opens upward when the dialog has no room below.
    const layer = b?.closest<HTMLElement>("[role=dialog]") ?? null;
    if (!b || !layer) return;
    const br = b.getBoundingClientRect();
    const lr = layer.getBoundingClientRect();
    const tall = entries.length * 44 + 16;
    const up =
      lr.bottom - br.bottom < tall && br.top - lr.top > lr.bottom - br.bottom;
    const right = Math.max(8, Math.round(lr.right - br.right));
    setLayer(layer);
    setPlace({
      up,
      style: up
        ? { right, bottom: Math.round(lr.bottom - br.top + 4) }
        : { right, top: Math.round(br.bottom - lr.top + 4) },
    });
  };

  // Focus lands on the chosen role once the menu is in the document; a
  // press outside or a scroll of the list closes it.
  React.useEffect(() => {
    if (!open) return;
    const at = Math.max(
      0,
      entries.findIndex((e) => e.role === value),
    );
    items.current[at]?.focus();
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !menu.current?.contains(target) &&
        !button.current?.contains(target)
      ) {
        setPlace(null);
      }
    };
    const scroller = button.current?.closest("[data-share-scroll]");
    const onScroll = () => setPlace(null);
    document.addEventListener("pointerdown", onDown);
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      scroller?.removeEventListener("scroll", onScroll);
    };
    // Re-run only when the menu opens; the entries are fixed while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    close(true);
    if (entry.role) {
      if (entry.role !== value) onChoose(entry.role);
    } else onRemove?.();
  };

  const onMenuKey = (event: React.KeyboardEvent) => {
    const at = items.current.findIndex((n) => n === document.activeElement);
    const n = entries.length;
    const go = (i: number) => items.current[((i % n) + n) % n]?.focus();
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(n - 1);
    else if (event.key === "Escape" || event.key === "Tab") close(true);
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      const ch = event.key.toLowerCase();
      for (let k = 1; k <= n; k++) {
        const i = (at + k) % n;
        if (entries[i]?.text.toLowerCase().startsWith(ch)) {
          go(i);
          break;
        }
      }
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const popup = (
    <AnimatePresence>
      {place ? (
        <motion.div
          ref={menu}
          id={`${uid}-menu`}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          initial={{
            opacity: 0,
            y: motionSafe ? (place.up ? distances.nudge : -distances.nudge) : 0,
          }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
          style={place.style}
          className="absolute z-40 flex w-52 max-w-[calc(100%-1rem)] flex-col rounded-3 border border-hairline-strong bg-popover p-1 text-popover-foreground shadow-raised"
        >
          {entries.map((entry, i) => {
            const checked = entry.role === value;
            return (
              <React.Fragment key={entry.key}>
                {entry.role ? null : (
                  <span aria-hidden className="mx-1 my-1 h-px bg-hairline" />
                )}
                <button
                  ref={(node) => {
                    items.current[i] = node;
                  }}
                  type="button"
                  role={entry.role ? "menuitemradio" : "menuitem"}
                  aria-checked={entry.role ? checked : undefined}
                  tabIndex={-1}
                  onClick={() => pick(i)}
                  className={cn(
                    "flex items-center gap-2 rounded-2 px-2 py-1.5 text-left transition-colors hover:bg-surface-2",
                    FOCUS_IN,
                    entry.role ? "text-foreground" : "text-danger",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[12px] leading-4 font-medium">
                      {entry.text}
                    </span>
                    {entry.role ? (
                      <span className="text-[11px] leading-4 text-ink-3">
                        {ROLE_NOTE[entry.role]}
                      </span>
                    ) : null}
                  </span>
                  {checked ? (
                    <Check
                      aria-hidden
                      className="size-3.5 shrink-0 [color:var(--share-accent)]"
                    />
                  ) : null}
                </button>
              </React.Fragment>
            );
          })}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <div className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${uid}-menu` : undefined}
        aria-label={label}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (disabled) return;
          if (open) close(false);
          else show();
        }}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !open) {
            event.preventDefault();
            if (!disabled) show();
          }
        }}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
          FOCUS,
          open && "bg-surface-2 text-foreground",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className={cn(compact && "max-w-[4.5rem] truncate")}>
          {ROLE_LABEL[value]}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>
      {layer ? createPortal(popup, layer) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The field                                 */
/* ----------------------------------------------------------------------- */

type Ellipse = { rx: number; ry: number };

/** One colleague or stranger in the field; lit while the ring holds it. */
function Dot({
  x,
  y,
  cx,
  cy,
  rx,
  ry,
}: {
  x: number;
  y: number;
  cx: number;
  cy: number;
  rx: MotionValue<number>;
  ry: MotionValue<number>;
}) {
  // Read per frame from the ring's own radii: the dot lights the moment the
  // perimeter passes it, with no React render in the loop.
  const lit = useTransform([rx, ry] as MotionValue<number>[], ([a, b]) => {
    const dx = (x - cx) / Math.max(1, a as number);
    const dy = (y - cy) / Math.max(1, b as number);
    return r3(clamp((1.04 - Math.hypot(dx, dy)) / 0.1, 0, 1));
  });
  return (
    <g>
      <circle cx={x} cy={y} r={1.6} className="fill-ink-3" opacity={0.5} />
      <motion.circle
        cx={x}
        cy={y}
        r={2.2}
        fill="var(--share-accent)"
        style={{ opacity: lit }}
      />
    </g>
  );
}

type Seat = { id: string; x: number; y: number };

/** Two staggered rows, overlapping a little, like people standing together. */
function seatsFor(ids: string[], a: number): Seat[] {
  const n = ids.length;
  const gap = a * 1.72;
  if (n <= 4) {
    return ids.map((id, i) => ({ id, x: r1((i - (n - 1) / 2) * gap), y: 0 }));
  }
  const top = Math.ceil(n / 2);
  const bottom = n - top;
  const shift = top === bottom ? gap / 4 : 0;
  return ids.map((id, i) => {
    const row = i < top ? 0 : 1;
    const j = row === 0 ? i : i - top;
    const k = row === 0 ? top : bottom;
    return {
      id,
      x: r1((j - (k - 1) / 2) * gap + (row === 0 ? -shift : shift)),
      y: r1(row === 0 ? -a * 0.82 : a * 0.82),
    };
  });
}

function Field({
  everyone,
  level,
  width,
  height,
  avatar,
  ringStyle,
  org,
  motionSafe,
  uid,
}: {
  everyone: SharePerson[];
  level: ShareLink;
  width: number;
  height: number;
  avatar: number;
  ringStyle: ShareRingStyle;
  org: ShareOrg;
  motionSafe: boolean;
  uid: string;
}) {
  const cx = width / 2;
  const cy = height / 2 + 4;
  const visible = everyone.slice(0, 7);
  const extra = everyone.length - visible.length;
  const seats = seatsFor(
    [...visible.map((p) => p.id), ...(extra > 0 ? ["+more"] : [])],
    avatar,
  );
  const halfW = seats.reduce((m, s) => Math.max(m, Math.abs(s.x)), 0) + avatar;
  const halfH = seats.reduce((m, s) => Math.max(m, Math.abs(s.y)), 0) + avatar;

  // The outer guide leaves room above it for the tag that rides the ring.
  const outer: Ellipse = { rx: width / 2 - 10, ry: height / 2 - 20 };
  const inner: Ellipse = {
    rx: Math.min(halfW + 12, outer.rx - 40),
    ry: Math.min(halfH + 9, outer.ry - 16),
  };
  const middle: Ellipse = {
    rx: lerp(inner.rx, outer.rx, 0.5),
    ry: lerp(inner.ry, outer.ry, 0.52),
  };
  const ring: Record<ShareLink, Ellipse> = {
    invited: inner,
    org: middle,
    anyone: outer,
  };
  const target = ring[level];

  const rx = useMotionValue(r1(target.rx));
  const ry = useMotionValue(r1(target.ry));
  const ghostRx = useMotionValue(r1(target.rx));
  const ghostRy = useMotionValue(r1(target.ry));
  const ghost = useMotionValue(0);
  const last = React.useRef({ level, rx: target.rx, ry: target.ry, width });
  const running = React.useRef<AnimationPlaybackControls[]>([]);

  const trx = r1(target.rx);
  const tr_y = r1(target.ry);
  React.useEffect(() => {
    const was = last.current;
    if (was.rx === trx && was.ry === tr_y && was.level === level) return;
    last.current = { level, rx: trx, ry: tr_y, width };
    for (const c of running.current) c.stop();
    running.current = [];
    const widened = was.width !== width && was.level === level;
    if (widened) {
      // A resize is not news: the ring is simply where it belongs.
      rx.jump(trx);
      ry.jump(tr_y);
      return;
    }
    if (was.level !== level) {
      // The old perimeter lingers a moment as a ghost, so the change in
      // reach reads as a distance, not a swap.
      ghostRx.jump(rx.get());
      ghostRy.jump(ry.get());
      ghost.jump(0.5);
      running.current.push(
        animate(ghost, 0, {
          duration: motionSafe ? durations.slow : durations.base,
          ease: easings.exit,
        }),
      );
    }
    if (!motionSafe) {
      rx.jump(trx);
      ry.jump(tr_y);
      return;
    }
    // A change of reach widens on snap — one crisp overshoot past the guide,
    // settling on it; a cluster that grows or shrinks just glides.
    const spring = was.level !== level ? springs.snap : springs.glide;
    running.current.push(animate(rx, trx, spring), animate(ry, tr_y, spring));
  }, [trx, tr_y, level, width, motionSafe, rx, ry, ghost, ghostRx, ghostRy]);
  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
    },
    [],
  );

  // Colleagues sit between the first two guides, the wider world beyond.
  // Cheap enough to place every render: 42 seeded points, no state.
  const dots = (() => {
    const rand = seeded(hash(org.domain) ^ 0x5eed);
    const out: { x: number; y: number; key: string }[] = [];
    const place = (from: Ellipse, to: Ellipse, count: number, tag: string) => {
      let made = 0;
      let guard = 0;
      while (made < count && guard < count * 8) {
        guard++;
        const theta = rand() * Math.PI * 2;
        // Keep clear of the tag that rides the top of the ring.
        if (Math.abs(theta - Math.PI * 1.5) < 0.42) continue;
        const u = 0.18 + rand() * 0.66;
        const ex = lerp(from.rx, to.rx, u);
        const ey = lerp(from.ry, to.ry, u);
        out.push({
          key: `${tag}${made}`,
          x: r1(cx + ex * Math.cos(theta)),
          y: r1(cy + ey * Math.sin(theta)),
        });
        made++;
      }
    };
    place(inner, middle, 22, "o");
    place(middle, outer, 20, "w");
    return out;
  })();

  const tagY = useTransform(ry, (v) => r1(cy - v - 20));
  const gradientId = `${uid.replace(/[^a-zA-Z0-9-]/g, "")}-halo`;
  const copy = levelCopy(level, org);
  const dash =
    ringStyle === "dash"
      ? level === "invited"
        ? "5 3"
        : level === "org"
          ? "4 6"
          : "2 7"
      : undefined;

  return (
    <div className="relative" style={{ height }}>
      <svg
        aria-hidden
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 block"
      >
        <defs>
          <radialGradient id={gradientId}>
            <stop
              offset="0%"
              style={{ stopColor: "var(--share-accent)", stopOpacity: 0.36 }}
            />
            <stop
              offset="72%"
              style={{ stopColor: "var(--share-accent)", stopOpacity: 0.2 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "var(--share-accent)", stopOpacity: 0 }}
            />
          </radialGradient>
        </defs>
        {LEVELS.map((l) => (
          <ellipse
            key={l}
            cx={r1(cx)}
            cy={r1(cy)}
            rx={r1(ring[l].rx)}
            ry={r1(ring[l].ry)}
            fill="none"
            className="stroke-hairline-strong"
            strokeDasharray="2 4"
          />
        ))}
        <motion.ellipse
          cx={r1(cx)}
          cy={r1(cy)}
          rx={rx}
          ry={ry}
          fill={
            ringStyle === "halo"
              ? `url(#${gradientId})`
              : "color-mix(in oklab, var(--share-accent) 9%, transparent)"
          }
          stroke="var(--share-accent)"
          strokeOpacity={ringStyle === "halo" ? 0.35 : 1}
          strokeWidth={ringStyle === "halo" ? 1 : 1.5}
          strokeDasharray={dash}
        />
        <motion.ellipse
          cx={r1(cx)}
          cy={r1(cy)}
          rx={ghostRx}
          ry={ghostRy}
          fill="none"
          stroke="var(--share-accent)"
          strokeWidth={1}
          strokeDasharray={dash}
          style={{ opacity: ghost }}
        />
        {dots.map((d) => (
          <Dot key={d.key} x={d.x} y={d.y} cx={cx} cy={cy} rx={rx} ry={ry} />
        ))}
        <AnimatePresence initial={false}>
          {seats.map((seat) => {
            const person = everyone.find((p) => p.id === seat.id);
            const face = person ? faceOf(person.id) : null;
            const pending = person?.status === "pending";
            const x = r1(cx + seat.x);
            const y = r1(cy + seat.y);
            return (
              <motion.g
                key={seat.id}
                initial={{ opacity: 0, scale: 0.6, x, y }}
                animate={{ opacity: pending ? 0.7 : 1, scale: 1, x, y }}
                exit={{
                  opacity: 0,
                  scale: motionSafe ? 0.6 : 1,
                  transition: exitFor(durations.fast),
                }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.snap,
                        x: springs.glide,
                        y: springs.glide,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: 0 }
                }
                style={{ originX: 0.5, originY: 0.5 }}
              >
                <circle
                  r={avatar}
                  style={{ fill: face ? face.fill : "var(--bg-2)" }}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
                {pending ? (
                  <circle
                    r={avatar + 2.5}
                    fill="none"
                    className="stroke-ink-3"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                ) : null}
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-sans font-semibold"
                  style={{
                    fontSize: Math.round(avatar * 0.72),
                    fill: face ? face.ink : "var(--ink-2)",
                  }}
                >
                  {person ? initials(person.name) : `+${extra}`}
                </text>
              </motion.g>
            );
          })}
        </AnimatePresence>
      </svg>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
        style={{ y: tagY }}
      >
        <span className="grid">
          {LEVELS.map((l) => {
            const c = levelCopy(l, org);
            return (
              <span
                key={l}
                className="inline-flex h-[18px] items-center gap-1 justify-self-center rounded-full border [border-color:var(--share-accent)] bg-card px-2 text-[10px] leading-none font-medium whitespace-nowrap [color:var(--share-accent)] transition-opacity duration-200 [grid-area:1/1]"
                style={{ opacity: l === level ? 1 : 0 }}
              >
                <c.Icon className="size-3 shrink-0" />
                {c.title}
              </span>
            );
          })}
        </span>
      </motion.div>
      <span className="sr-only">{copy.title}</span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type RowState = { kind: "sending" | "sent" | "error"; message?: string };

/**
 * A share dialog that draws who can open the document. The people with access
 * stand together in a field, and around them runs the perimeter: an ellipse
 * whose reach is the link access, with faint guides at each of the three
 * levels and colleagues and strangers scattered between them. Widening access
 * springs the ring outward on `springs.snap` — one crisp overshoot past its
 * guide, settling on it — while the old perimeter lingers a moment as a ghost
 * and fades; every dot lights the instant the ring passes it, read per frame
 * from the ring's own radii, so the reach is literally visible. Narrowing
 * pulls it back in on the same spring. A new invitee joins the cluster from
 * 0.6 scale on snap, the cluster re-packs on glide and the ring follows it.
 *
 * It is a real modal dialog inside its own frame: the document behind goes
 * inert, Tab wraps, Escape closes (an open role menu or suggestion list takes
 * the first Escape), focus starts in the add field and returns to Share. The
 * add field is a combobox over the directory that also takes an email; roles
 * are menus moved with the arrow keys; link access is a radio group. Pending
 * invites carry Resend, and every error stays inline beside what caused it.
 * In a narrow container the dialog becomes a sheet that fills the width.
 * Under reduced motion the ring and the dots jump to their level while the
 * old ring cross-fades out; counts and labels still change.
 */
export function SharePerimeter({
  people: peopleProp,
  defaultPeople = defaultSharePeople,
  onPeopleChange,
  directory = defaultShareDirectory,
  link: linkProp,
  defaultLink = "invited",
  onLinkChange,
  onInvite,
  onRoleChange,
  onResend,
  onRemove,
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  documentTitle = "Q4 river crossings plan",
  org = defaultShareOrg,
  me = "mara",
  now = defaultShareNow,
  status = "ready",
  onRetry,
  ringStyle = "line",
  density = "cozy",
  accent = "var(--accent-bright)",
  height = 540,
  disabled = false,
  className,
}: SharePerimeterProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [ownPeople, setOwnPeople] = React.useState(defaultPeople);
  const list = peopleProp ?? ownPeople;
  const [ownLink, setOwnLink] = React.useState<ShareLink>(defaultLink);
  const level = linkProp ?? ownLink;
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;

  const [query, setQuery] = React.useState("");
  const [listOpen, setListOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [inviteRole, setInviteRole] = React.useState<ShareRole>("editor");
  const [fieldError, setFieldError] = React.useState("");
  const [rows, setRows] = React.useState<Record<string, RowState>>({});
  const [copied, setCopied] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [width, setWidth] = React.useState(448);

  const shareButton = React.useRef<HTMLButtonElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const [input, setInput] = React.useState<HTMLInputElement | null>(null);
  const [fieldNode, setFieldNode] = React.useState<HTMLDivElement | null>(null);
  const timers = React.useRef<number[]>([]);
  const restoreFocus = React.useRef(false);

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  React.useEffect(() => {
    if (!fieldNode) return;
    const ro = new ResizeObserver(() =>
      setWidth(Math.max(200, Math.round(fieldNode.clientWidth))),
    );
    ro.observe(fieldNode);
    return () => ro.disconnect();
  }, [fieldNode]);

  // Focus starts in the add field when the dialog arrives.
  React.useEffect(() => {
    if (open && input) input.focus({ preventScroll: true });
  }, [open, input]);

  // …and goes back to Share once the document behind is no longer inert.
  React.useEffect(() => {
    if (open || !restoreFocus.current) return;
    restoreFocus.current = false;
    const node = shareButton.current;
    if (node?.isConnected) node.focus();
  }, [open]);

  const setOpen = (next: boolean) => {
    if (!next) restoreFocus.current = true;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setQuery("");
      setListOpen(false);
      setFieldError("");
    }
  };

  const commitPeople = (next: SharePerson[]) => {
    if (peopleProp === undefined) setOwnPeople(next);
    onPeopleChange?.(next);
  };

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const mark = (id: string, state: RowState | null) =>
    setRows((r) => {
      const next = { ...r };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });

  const isMember = (email: string) =>
    email.toLowerCase().endsWith(`@${org.domain.toLowerCase()}`);

  const canOpen = list.filter((p) => p.status !== "pending");
  const outsiders = canOpen.filter((p) => !isMember(p.email)).length;
  const reach =
    level === "invited"
      ? people(canOpen.length)
      : level === "org"
        ? people(org.size + outsiders)
        : "";

  /* ------------------------------ link ------------------------------ */

  const chooseLevel = (next: ShareLink) => {
    if (disabled || next === level) return;
    if (linkProp === undefined) setOwnLink(next);
    const c = levelCopy(next, org);
    const n =
      next === "invited"
        ? canOpen.length
        : next === "org"
          ? org.size + outsiders
          : null;
    setAnnouncement(
      `${c.title} can open it.${n === null ? "" : ` ${people(n)}.`}`,
    );
    onLinkChange?.(next);
  };

  const levelRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onLevelKey = (event: React.KeyboardEvent, index: number) => {
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: LEVELS.length - 1,
    };
    const to = keys[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const i = ((to % LEVELS.length) + LEVELS.length) % LEVELS.length;
    const next = LEVELS[i];
    if (!next) return;
    levelRefs.current[i]?.focus();
    chooseLevel(next);
  };

  /* ----------------------------- invites ---------------------------- */

  const have = new Set(list.map((p) => p.email.toLowerCase()));
  const q = query.trim().toLowerCase();
  const suggestions = q
    ? directory
        .filter(
          (c) =>
            !have.has(c.email.toLowerCase()) &&
            (c.name.toLowerCase().includes(q) ||
              c.email.toLowerCase().includes(q)),
        )
        .slice(0, 5)
    : [];
  const typedEmail =
    EMAIL.test(query.trim()) &&
    !have.has(q) &&
    !directory.some((c) => c.email.toLowerCase() === q)
      ? query.trim()
      : null;
  const options: { key: string; contact: ShareContact }[] = [
    ...suggestions.map((c) => ({ key: c.id, contact: c })),
    ...(typedEmail
      ? [
          {
            key: `email:${typedEmail}`,
            contact: {
              id: `invite-${hash(typedEmail).toString(36)}`,
              name: typedEmail,
              email: typedEmail,
            },
          },
        ]
      : []),
  ];
  const showList = listOpen && options.length > 0;
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));

  const send = (person: SharePerson, role: ShareRole, again: boolean) => {
    const result = again ? onResend?.(person) : onInvite?.(person, role);
    if (result && typeof (result as Promise<void>).then === "function") {
      mark(person.id, { kind: "sending" });
      (result as Promise<void>).then(
        () => {
          mark(person.id, again ? { kind: "sent" } : null);
          if (again) later(() => mark(person.id, null), 2400);
          setAnnouncement(
            again
              ? `Invite sent again to ${person.email}.`
              : `Invited ${person.name}.`,
          );
        },
        (error: unknown) => {
          const message =
            error instanceof Error && error.message
              ? error.message
              : "The invite did not send.";
          mark(person.id, { kind: "error", message });
          setAnnouncement(`${person.name}: ${message}`);
        },
      );
    } else if (again) {
      mark(person.id, { kind: "sent" });
      later(() => mark(person.id, null), 2400);
      setAnnouncement(`Invite sent again to ${person.email}.`);
    }
  };

  const invite = (contact: ShareContact | null) => {
    if (disabled) return;
    if (!contact) {
      const typed = query.trim();
      if (!typed) return;
      if (have.has(typed.toLowerCase())) {
        const who = list.find(
          (p) => p.email.toLowerCase() === typed.toLowerCase(),
        );
        setFieldError(`${who?.name ?? typed} already has access.`);
        return;
      }
      setFieldError(
        `Enter a full email address, like ren@${org.domain}, or pick a colleague.`,
      );
      return;
    }
    if (have.has(contact.email.toLowerCase())) {
      setFieldError(`${contact.name} already has access.`);
      return;
    }
    const member = isMember(contact.email) && contact.name !== contact.email;
    const person: SharePerson = {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      role: inviteRole,
      status: member ? "active" : "pending",
      invitedAt: member ? undefined : now,
    };
    commitPeople([...list, person]);
    setQuery("");
    setListOpen(false);
    setFieldError("");
    setAnnouncement(
      `${member ? "Added" : "Invited"} ${person.name} as ${ROLE_LABEL[inviteRole].toLowerCase()}.`,
    );
    send(person, inviteRole, false);
    input?.focus();
  };

  const onFieldKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      if (!listOpen) {
        setListOpen(true);
        setActive(0);
        return;
      }
      const n = options.length;
      setActive(
        (((event.key === "ArrowDown" ? activeIndex + 1 : activeIndex - 1) % n) +
          n) %
          n,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      invite(options[activeIndex]?.contact ?? null);
    } else if (event.key === "Escape") {
      if (showList) {
        event.preventDefault();
        event.stopPropagation();
        setListOpen(false);
      } else if (query) {
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
        setFieldError("");
      }
    }
  };

  /* ------------------------------ people ---------------------------- */

  const changeRole = (person: SharePerson, role: ShareRole) => {
    if (disabled) return;
    commitPeople(list.map((p) => (p.id === person.id ? { ...p, role } : p)));
    setAnnouncement(`${person.name} is now ${ROLE_LABEL[role].toLowerCase()}.`);
    onRoleChange?.(person, role);
  };

  const remove = (person: SharePerson) => {
    if (disabled) return;
    commitPeople(list.filter((p) => p.id !== person.id));
    mark(person.id, null);
    setAnnouncement(`Removed ${person.name}.`);
    onRemove?.(person);
    input?.focus();
  };

  const copyLink = () => {
    const text = `${org.domain}/d/${documentTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
    try {
      void navigator.clipboard?.writeText(text).catch(() => {});
    } catch {
      // No clipboard: the confirmation still says what would be copied.
    }
    setCopied(true);
    setAnnouncement("Link copied.");
    later(() => setCopied(false), 1800);
  };

  /* ---------------------------- the trap ---------------------------- */

  const onDialogKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const box = dialogRef.current;
    if (!box) return;
    const nodes = Array.from(
      box.querySelectorAll<HTMLElement>(TABBABLE),
    ).filter(
      (n) =>
        n.offsetParent !== null && n.tabIndex >= 0 && !n.closest("[inert]"),
    );
    const first = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    if (!first || !lastNode) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      lastNode.focus();
    } else if (!event.shiftKey && document.activeElement === lastNode) {
      event.preventDefault();
      first.focus();
    }
  };

  /* ---------------------------- rendering --------------------------- */

  const levelNow = levelCopy(level, org);
  const owner = list.find((p) => p.role === "owner");
  // Text on an accent fill flips dark or light with the accent's own
  // lightness, so an amber Done stays as readable as a cobalt one.
  const accentStyle = {
    "--share-accent": accent,
    "--share-on-accent": `oklch(from ${accent} clamp(0.18, (0.72 - l) * 100, 0.99) 0.01 h)`,
  } as React.CSSProperties;

  const peopleBody =
    status === "loading" ? (
      <div aria-busy="true" className={cn("flex flex-col gap-3 py-3", d.pad)}>
        <p className="sr-only">Loading who has access.</p>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} aria-hidden className="flex items-center gap-3">
            <span
              className={cn("shrink-0 rounded-full bg-surface-2", d.face)}
            />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="h-2.5 w-2/5 rounded-full bg-surface-2" />
              <span className="h-2 w-3/5 rounded-full bg-surface-2/70" />
            </span>
          </div>
        ))}
      </div>
    ) : status === "error" ? (
      <div className={cn("flex flex-col items-start gap-2 py-4", d.pad)}>
        <p className="flex items-center gap-1.5 text-[13px] text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
          Who has access did not load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-input px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <ul role="list" aria-label="People with access" className="flex flex-col">
        <AnimatePresence initial={false}>
          {list.map((person) => {
            const face = faceOf(person.id);
            const pending = person.status === "pending";
            const state = rows[person.id];
            const outside = !isMember(person.email);
            return (
              <motion.li
                key={person.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{
                  opacity: 0,
                  height: 0,
                  transition: exitFor(durations.base),
                }}
                transition={
                  motionSafe
                    ? {
                        height: springs.glide,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: 0 }
                }
                className="overflow-clip [overflow-clip-margin:4px]"
              >
                <div className={cn("flex items-center gap-3", d.pad, d.row)}>
                  <span
                    aria-hidden
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      d.face,
                      pending &&
                        "outline-1 outline-offset-1 outline-ink-3 outline-dashed",
                    )}
                    style={{ backgroundColor: face.fill, color: face.ink }}
                  >
                    {initials(person.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-foreground">
                      <span className="truncate" title={person.name}>
                        {person.name}
                      </span>
                      {person.id === me ? (
                        <span className="shrink-0 text-[11px] text-ink-3">
                          (you)
                        </span>
                      ) : null}
                      {outside ? (
                        <span className="shrink-0 rounded-full border border-hairline px-1.5 text-[10px] leading-4 text-ink-3">
                          Outside
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-[11px] leading-4 text-ink-3">
                      {pending
                        ? state?.kind === "sending"
                          ? "Sending invite…"
                          : `Invited ${ago(person.invitedAt, now)}`
                        : person.email}
                    </span>
                  </span>
                  {pending && state?.kind !== "sending" ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!disabled && state?.kind !== "sent") {
                          send(person, person.role, true);
                        }
                      }}
                      aria-label={
                        state?.kind === "sent"
                          ? `Invite sent again to ${person.name}`
                          : `Resend invite to ${person.name}`
                      }
                      aria-disabled={
                        disabled || state?.kind === "sent" || undefined
                      }
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-[12px] transition-colors hover:bg-surface-2",
                        FOCUS,
                        state?.kind === "sent"
                          ? "text-success"
                          : "[color:var(--share-accent)]",
                      )}
                    >
                      {state?.kind === "sent" ? (
                        <motion.span
                          initial={
                            motionSafe ? { scale: 0.6, opacity: 0 } : false
                          }
                          animate={{ scale: 1, opacity: 1 }}
                          transition={
                            motionSafe ? springs.flick : { duration: 0 }
                          }
                          className="inline-flex"
                        >
                          <Check aria-hidden className="size-3.5" />
                        </motion.span>
                      ) : (
                        <Send aria-hidden className="size-3.5" />
                      )}
                      <span aria-hidden className="hidden @min-[24rem]:inline">
                        {state?.kind === "sent"
                          ? "Sent"
                          : state?.kind === "error"
                            ? "Retry"
                            : "Resend"}
                      </span>
                    </button>
                  ) : null}
                  {state?.kind === "sending" ? (
                    <LoaderCircle
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0 text-ink-3",
                        motionSafe && "animate-spin",
                      )}
                    />
                  ) : null}
                  {person.role === "owner" ? (
                    <span className="inline-flex h-7 shrink-0 items-center px-2 text-[12px] text-ink-3">
                      Owner
                    </span>
                  ) : (
                    <RoleMenu
                      value={person.role}
                      label={`Role for ${person.name}`}
                      onChoose={(role) => changeRole(person, role)}
                      onRemove={() => remove(person)}
                      disabled={disabled}
                      motionSafe={motionSafe}
                      compact
                    />
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {state?.kind === "error" ? (
                    <motion.p
                      role="alert"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{ duration: durations.fast }}
                      className={cn(
                        "flex items-center gap-1.5 pb-2 text-[11px] leading-4 text-danger",
                        d.pad,
                      )}
                    >
                      <TriangleAlert
                        aria-hidden
                        className="size-3.5 shrink-0"
                      />
                      {state.message}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    );

  return (
    <div
      className={cn(
        "@container relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ height, ...accentStyle }}
    >
      {/* The document the dialog is about. */}
      <div inert={open} className="flex h-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {org.name} / Planning
            </span>
            <span className="truncate text-sm font-semibold">
              {documentTitle}
            </span>
          </div>
          <button
            ref={shareButton}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-2 border border-input bg-surface-1 pr-3 pl-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <span aria-hidden className="flex -space-x-1.5">
              {canOpen.slice(0, 3).map((p) => {
                const face = faceOf(p.id);
                return (
                  <span
                    key={p.id}
                    className="flex size-6 items-center justify-center rounded-full text-[9px] font-semibold ring-2 ring-card"
                    style={{ backgroundColor: face.fill, color: face.ink }}
                  >
                    {initials(p.name)}
                  </span>
                );
              })}
            </span>
            <levelNow.Icon
              aria-hidden
              className="size-3.5 shrink-0 text-ink-3"
            />
            Share
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-hidden px-4 py-4 text-[13px] leading-6 text-ink-2">
          <p className="text-[11px] text-ink-3">
            Owner {owner?.name ?? "—"} · {levelNow.title.toLowerCase()}
          </p>
          <h3 className="text-base font-semibold text-foreground">
            Crossings to rebuild before the spring flows
          </h3>
          <p>
            Three footbridges and the ford at Hollins Weir need survey work
            before the river rises. The order below follows risk, then access
            for the crane.
          </p>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            <li>Weir footbridge — deck survey, 3 Nov</li>
            <li>Mill Lane ford — scour check after the first flood</li>
            <li>Ash Cut bridge — bearings and the east abutment</li>
          </ol>
        </div>
      </div>

      {/* Open on arrival, the dialog is simply there: the first frame —
          server-rendered included — shows it, not an empty scrim. */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="overlay"
            className="absolute inset-0 z-20 flex items-end justify-center @min-[30rem]:items-center @min-[30rem]:p-4"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1, transition: { duration: durations.base } }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-background/70"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            />
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${uid}-title`}
              aria-describedby={`${uid}-reach`}
              onKeyDown={onDialogKey}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 0, transition: exitFor(durations.base) }}
              transition={
                motionSafe
                  ? { y: springs.glide, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="relative mt-2 flex max-h-[calc(100%-0.5rem)] w-full flex-col overflow-hidden rounded-t-4 border border-b-0 border-hairline-strong bg-popover text-popover-foreground shadow-raised @min-[30rem]:mt-0 @min-[30rem]:max-h-full @min-[30rem]:w-[30rem] @min-[30rem]:rounded-4 @min-[30rem]:border-b"
            >
              <div
                className={cn(
                  "flex shrink-0 items-start justify-between gap-3 pt-3",
                  d.pad,
                )}
              >
                <div className="flex min-w-0 flex-col">
                  <h2 id={`${uid}-title`} className="text-sm font-semibold">
                    Share
                  </h2>
                  <p className="truncate text-[12px] text-ink-3">
                    {documentTitle}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "-mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>

              <div ref={setFieldNode} className="shrink-0">
                <Field
                  everyone={list}
                  level={level}
                  width={width}
                  height={d.field}
                  avatar={d.avatar}
                  ringStyle={ringStyle}
                  org={org}
                  motionSafe={motionSafe}
                  uid={uid}
                />
              </div>

              <div
                className={cn(
                  "flex shrink-0 flex-col gap-2 border-b border-hairline pb-3",
                  d.pad,
                )}
              >
                <div
                  role="radiogroup"
                  aria-label="Link access"
                  aria-describedby={`${uid}-reach`}
                  className="grid grid-cols-3 gap-1 rounded-3 bg-surface-2 p-1"
                >
                  {LEVELS.map((l, i) => {
                    const c = levelCopy(l, org);
                    const checked = l === level;
                    return (
                      <button
                        key={l}
                        ref={(node) => {
                          levelRefs.current[i] = node;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={c.title}
                        tabIndex={checked ? 0 : -1}
                        onClick={() => chooseLevel(l)}
                        onKeyDown={(event) => onLevelKey(event, i)}
                        className={cn(
                          "relative inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-2 px-2 text-[12px] font-medium transition-colors",
                          FOCUS,
                          checked
                            ? "text-foreground"
                            : "text-ink-2 hover:text-foreground",
                          disabled && "cursor-not-allowed",
                        )}
                      >
                        {checked ? (
                          <motion.span
                            layoutId={`${uid}-level`}
                            aria-hidden
                            className="absolute inset-0 rounded-2 border [border-color:color-mix(in_oklab,var(--share-accent)_45%,transparent)] bg-popover shadow-raised"
                            transition={
                              motionSafe ? springs.snap : { duration: 0 }
                            }
                          />
                        ) : null}
                        <c.Icon
                          aria-hidden
                          className={cn(
                            "relative hidden size-3.5 shrink-0 @min-[24rem]:block",
                            checked && "[color:var(--share-accent)]",
                          )}
                        />
                        <span className="relative truncate">{c.short}</span>
                      </button>
                    );
                  })}
                </div>
                <p
                  id={`${uid}-reach`}
                  className="grid text-[12px] leading-4 text-ink-2"
                >
                  {LEVELS.map((l) => (
                    <span
                      key={l}
                      aria-hidden={l !== level}
                      className="transition-opacity duration-200 [grid-area:1/1]"
                      style={{ opacity: l === level ? 1 : 0 }}
                    >
                      {levelCopy(l, org).line}
                      {l === level && reach ? (
                        <span className="text-ink-3"> · {reach}</span>
                      ) : null}
                    </span>
                  ))}
                </p>
              </div>

              <div
                data-share-scroll=""
                className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
              >
                <div className={cn("flex flex-col gap-1.5 pt-3 pb-2", d.pad)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-0 flex-1 basis-32">
                      <UserPlus
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3"
                      />
                      <input
                        ref={setInput}
                        type="text"
                        role="combobox"
                        aria-label="Add people by name or email"
                        aria-expanded={showList}
                        aria-controls={`${uid}-options`}
                        aria-autocomplete="list"
                        aria-activedescendant={
                          showList ? `${uid}-opt-${activeIndex}` : undefined
                        }
                        aria-invalid={fieldError ? true : undefined}
                        aria-describedby={
                          fieldError ? `${uid}-error` : undefined
                        }
                        readOnly={disabled}
                        value={query}
                        placeholder="Add name or email"
                        onChange={(event) => {
                          const text = event.currentTarget.value;
                          setQuery(text);
                          setListOpen(true);
                          setActive(0);
                          if (fieldError) setFieldError("");
                        }}
                        onKeyDown={onFieldKey}
                        onBlur={() => setListOpen(false)}
                        className="h-9 w-full rounded-2 border border-input bg-surface-0 pr-2 pl-8 text-[13px] text-foreground placeholder:text-ink-3 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
                      />
                    </div>
                    <RoleMenu
                      value={inviteRole}
                      label="Role for new people"
                      onChoose={setInviteRole}
                      disabled={disabled}
                      motionSafe={motionSafe}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        invite(options[activeIndex]?.contact ?? null)
                      }
                      aria-disabled={disabled || !query.trim() || undefined}
                      aria-label="Invite"
                      className={cn(
                        "inline-flex h-9 shrink-0 items-center justify-center rounded-2 px-2.5 text-[13px] font-medium transition-colors @min-[24rem]:px-3",
                        FOCUS,
                        query.trim() && !disabled
                          ? "bg-[var(--share-accent)] [color:var(--share-on-accent)] hover:opacity-90"
                          : "border border-input text-ink-3",
                      )}
                    >
                      <Send
                        aria-hidden
                        className="size-4 @min-[24rem]:hidden"
                      />
                      <span aria-hidden className="hidden @min-[24rem]:inline">
                        Invite
                      </span>
                    </button>
                  </div>
                  {showList ? (
                    <ul
                      id={`${uid}-options`}
                      role="listbox"
                      aria-label="Suggestions"
                      className="flex flex-col rounded-3 border border-hairline bg-popover p-1"
                    >
                      {options.map((o, i) => (
                        <li
                          key={o.key}
                          id={`${uid}-opt-${i}`}
                          role="option"
                          aria-selected={i === activeIndex}
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => invite(o.contact)}
                          onPointerMove={() => setActive(i)}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-2 px-2 py-1.5",
                            i === activeIndex && "bg-surface-2",
                          )}
                        >
                          <span
                            aria-hidden
                            className="flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
                            style={{
                              backgroundColor: faceOf(o.contact.id).fill,
                              color: faceOf(o.contact.id).ink,
                            }}
                          >
                            {initials(o.contact.name)}
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[12px] leading-4 text-foreground">
                              {o.contact.name === o.contact.email
                                ? `Invite ${o.contact.email}`
                                : o.contact.name}
                            </span>
                            <span className="truncate text-[11px] leading-4 text-ink-3">
                              {o.contact.name === o.contact.email
                                ? isMember(o.contact.email)
                                  ? `At ${org.name}`
                                  : `Outside ${org.name}`
                                : o.contact.email}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {fieldError ? (
                    <p
                      id={`${uid}-error`}
                      role="alert"
                      className="flex items-start gap-1.5 text-[11px] leading-4 text-danger"
                    >
                      <TriangleAlert
                        aria-hidden
                        className="mt-px size-3.5 shrink-0"
                      />
                      {fieldError}
                    </p>
                  ) : null}
                </div>
                {peopleBody}
              </div>

              <div
                className={cn(
                  "flex shrink-0 items-center justify-between gap-2 border-t border-hairline py-3",
                  d.pad,
                )}
              >
                <button
                  type="button"
                  onClick={copyLink}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-2 px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  {copied ? (
                    <Check aria-hidden className="size-4 text-success" />
                  ) : (
                    <Link2 aria-hidden className="size-4" />
                  )}
                  {copied ? "Copied" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-2 bg-[var(--share-accent)] px-4 text-[13px] font-medium [color:var(--share-on-accent)] transition-opacity hover:opacity-90",
                    FOCUS,
                  )}
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
