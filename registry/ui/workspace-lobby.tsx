"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";
import {
  ArrowLeftRight,
  Check,
  LoaderCircle,
  Plus,
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
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type LobbyRole = "owner" | "admin" | "member" | "guest";

export type LobbyWorkspace = {
  id: string;
  name: string;
  /** Short address shown under the name, e.g. "coldbrook". */
  handle?: string;
  /** How many people belong to it. */
  members: number;
  /** Up to three people's names, drawn as initials in the avatar stack. */
  people?: string[];
  /** Your role in it. */
  role: LobbyRole;
  /** When you last opened it, epoch ms. Omit for never. */
  lastVisit?: number;
  /** Updates waiting since your last visit. */
  unread?: number;
  /** Any CSS colour for the mark. Defaults to a hue seeded from the id. */
  tint?: string;
  /** What it holds, previewed while it opens. */
  spaces?: string[];
};

export type LobbyInvitation = {
  id: string;
  name: string;
  handle?: string;
  /** Who sent it. */
  invitedBy: string;
  /** The role you would have. */
  role: LobbyRole;
  members: number;
  tint?: string;
  /** When it was sent, epoch ms. */
  sentAt?: number;
};

export type LobbyAccount = { name: string; email: string };
export type LobbyTileStyle = "card" | "row" | "poster";
export type LobbyStatus = "ready" | "loading" | "error";

export type WorkspaceLobbyProps = {
  /** The workspaces you belong to. @default defaultLobbyWorkspaces */
  workspaces?: LobbyWorkspace[];
  /** Invitations waiting for an answer, shown in their own row. @default defaultLobbyInvitations */
  invitations?: LobbyInvitation[];
  /** Who is signed in. @default defaultLobbyAccount */
  account?: LobbyAccount;
  /** The clock every "last visit" is measured from, epoch ms. @default defaultLobbyNow */
  now?: number;
  /** Controlled active tile (the option the arrows are on). */
  value?: string | null;
  /** Initial active tile when uncontrolled. @default the first workspace */
  defaultValue?: string | null;
  /** Fires from the arrow, type-ahead or press that moved the active tile. */
  onValueChange?: (id: string) => void;
  /** A workspace was chosen. Return a promise to hold the expanded tile while it loads; a rejection folds it back with the reason. */
  onSelect?: (workspace: LobbyWorkspace) => void | Promise<void>;
  /** Cancel, Back or Escape folded an opening workspace back into its tile. */
  onCancel?: (workspace: LobbyWorkspace) => void;
  /** "Create a workspace" was pressed. */
  onCreate?: () => void;
  /** Join was pressed on an invitation. Return a promise to show "Joining…" until it lands. */
  onJoin?: (invitation: LobbyInvitation) => void | Promise<void>;
  /** Decline was pressed on an invitation. */
  onDecline?: (invitation: LobbyInvitation) => void;
  /** "Switch account" was pressed. */
  onSwitchAccount?: () => void;
  /** Whether the workspaces have loaded. @default "ready" */
  status?: LobbyStatus;
  /** "Try again" was pressed after loading failed. */
  onRetry?: () => void;
  /** How a tile is drawn: a card, a compact row, or a poster with a patterned band. @default "card" */
  tileStyle?: LobbyTileStyle;
  /** Tile columns at wide widths, 1 to 4; always one below 30rem of container. @default 3 */
  columns?: number;
  /** The selection plate, the loading line, unread dots and Join, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The heading. @default "Choose a workspace" */
  title?: string;
  /** Tallest the panel grows before its body scrolls, px. @default 560 */
  maxHeight?: number;
  /** Nothing can be opened, joined or created. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Monday 12 October 2026, 09:30 UTC. */
export const defaultLobbyNow = Date.UTC(2026, 9, 12, 9, 30);

export const defaultLobbyAccount: LobbyAccount = {
  name: "Mara Okafor",
  email: "mara@fieldline.io",
};

const hueTint = (hue: number) =>
  `oklch(from var(--accent-bright) 0.72 0.1 ${hue})`;

export const defaultLobbyWorkspaces: LobbyWorkspace[] = [
  {
    id: "coldbrook",
    name: "Coldbrook",
    handle: "coldbrook",
    members: 24,
    people: ["Ana Ferreira", "Tomasz Wren", "Kofi Mensah"],
    role: "owner",
    lastVisit: defaultLobbyNow - 2 * HOUR,
    unread: 4,
    tint: hueTint(232),
    spaces: ["Treasury desk", "Card disputes", "Q4 statements", "Branch rota"],
  },
  {
    id: "basinworks",
    name: "Basinworks",
    handle: "basinworks-ops",
    members: 112,
    people: ["Lena Strand", "Rafael Duarte", "Noor Haddad"],
    role: "admin",
    lastVisit: defaultLobbyNow - 27 * HOUR,
    tint: hueTint(178),
    spaces: ["Pump curves", "Riverside upgrade", "Field crews", "Telemetry"],
  },
  {
    id: "fernworks",
    name: "Fernworks",
    handle: "fernworks",
    members: 9,
    people: ["Ilse Brandt", "Sam Ortega"],
    role: "member",
    lastVisit: defaultLobbyNow - 6 * DAY,
    tint: hueTint(132),
    spaces: ["Seed library", "Greenhouse log", "Orders"],
  },
];

export const defaultLobbyInvitations: LobbyInvitation[] = [
  {
    id: "gaugeworks",
    name: "Gaugeworks Field Ops",
    handle: "gaugeworks",
    invitedBy: "Ana Ferreira",
    role: "member",
    members: 38,
    sentAt: defaultLobbyNow - 3 * HOUR,
    tint: hueTint(64),
  },
  {
    id: "waylight-studio",
    name: "Waylight Studio",
    handle: "waylight-studio",
    invitedBy: "Kofi Mensah",
    role: "guest",
    members: 14,
    sentAt: defaultLobbyNow - 2 * DAY,
    tint: hueTint(312),
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const ROLE: Record<LobbyRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** FNV-1a, unsigned — a stable seed from an id. */
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const tintOf = (item: { id: string; tint?: string }) =>
  item.tint ?? hueTint(hash(item.id) % 360);

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
};

/** Relative time in fixed buckets, so the server and the browser agree. */
export const lobbyAgo = (then: number | undefined, now: number): string => {
  if (then === undefined) return "Never opened";
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "Yesterday";
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.max(1, Math.round(days / 30));
  return months === 1 ? "1 month ago" : `${months} months ago`;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** A topographic band for the poster tiles: five seeded contour lines. */
const contours = (id: string): string[] => {
  const rnd = seeded(hash(id));
  const out: string[] = [];
  for (let line = 0; line < 5; line += 1) {
    const base = 6 + line * 8 + rnd() * 3;
    const amp = 2.5 + rnd() * 4.5;
    const phase = rnd() * Math.PI * 2;
    const freq = 0.8 + rnd() * 1.4;
    let d = "";
    for (let x = 0; x <= 200; x += 10) {
      const y = base + Math.sin(phase + (x / 200) * Math.PI * 2 * freq) * amp;
      d += `${x === 0 ? "M" : "L"}${x} ${r2(y)} `;
    }
    out.push(d.trim());
  }
  return out;
};

type Rect = { x: number; y: number; w: number; h: number };
type OpenPhase = "opening" | "open" | "closing";
type Opening = {
  id: string;
  run: number;
  from: Rect;
  to: Rect;
  phase: OpenPhase;
  /** Set when a rejection is folding the tile back. */
  error?: string;
};

/** The panel's inset when a tile has grown to fill it. */
const FILL_INSET = 12;

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

function Mark({
  name,
  tint,
  size,
  className,
}: {
  name: string;
  tint: string;
  size: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2 font-semibold tracking-[0.02em]",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        backgroundColor: tint,
        color: `oklch(from ${tint} 0.27 0.05 h)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

function People({ names, members }: { names: string[]; members: number }) {
  const shown = names.slice(0, 3);
  const rest = Math.max(0, members - shown.length);
  return (
    <span aria-hidden className="flex shrink-0 items-center">
      {shown.map((person, i) => (
        <span
          key={person}
          className={cn(
            "flex size-5 items-center justify-center rounded-full text-[8px] font-semibold text-ink ring-2 ring-card",
            i > 0 && "-ml-1",
          )}
          style={{
            backgroundColor: `color-mix(in oklab, oklch(from var(--accent-bright) 0.74 0.09 ${hash(person) % 360}) 42%, var(--card))`,
          }}
        >
          {initials(person)}
        </span>
      ))}
      {rest > 0 ? (
        <span className="-ml-1 flex h-5 items-center rounded-full bg-surface-2 px-1.5 font-mono text-[9px] text-ink-3 tabular-nums ring-2 ring-card">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

function RoleChip({ role }: { role: LobbyRole }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-1 border border-hairline px-1.5 text-[11px] leading-none",
        role === "owner" ? "text-foreground" : "text-ink-3",
      )}
    >
      {ROLE[role]}
    </span>
  );
}

function Band({
  id,
  tint,
  height,
}: {
  id: string;
  tint: string;
  height: number;
}) {
  const lines = React.useMemo(() => contours(id), [id]);
  return (
    <span
      aria-hidden
      className="absolute inset-x-0 top-0 block overflow-hidden"
      style={{
        height,
        backgroundColor: `color-mix(in oklab, ${tint} 24%, var(--card))`,
      }}
    >
      <svg
        viewBox="0 0 200 44"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
      >
        {lines.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={tint}
            strokeOpacity={r2(0.55 - i * 0.06)}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  A tile                                  */
/* ----------------------------------------------------------------------- */

const TileFace = ({
  workspace,
  tileStyle,
  now,
  fresh,
  error,
}: {
  workspace: LobbyWorkspace;
  tileStyle: LobbyTileStyle;
  now: number;
  fresh: boolean;
  error?: string;
}) => {
  const tint = tintOf(workspace);
  const visit = fresh ? null : lobbyAgo(workspace.lastVisit, now);
  const unread = workspace.unread ?? 0;
  const meta = (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
      {fresh ? (
        <span className="inline-flex h-4 items-center rounded-1 bg-[color-mix(in_oklab,var(--wl-accent)_16%,transparent)] px-1 font-mono text-[9px] tracking-[0.08em] text-[color:var(--wl-accent)] uppercase">
          New
        </span>
      ) : (
        <span className="truncate">{visit}</span>
      )}
      {unread > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-ink-2">
          <span className="size-1.5 rounded-full bg-[var(--wl-accent)]" />
          {unread} new
        </span>
      ) : null}
    </span>
  );
  const errorLine = error ? (
    <span className="flex items-start gap-1.5 text-[11px] leading-4 text-danger">
      <TriangleAlert aria-hidden className="mt-px size-3 shrink-0" />
      <span>{error}</span>
    </span>
  ) : null;

  if (tileStyle === "row") {
    return (
      <span className="flex flex-col gap-1.5 p-3">
        <span className="flex items-center gap-3">
          <Mark name={workspace.name} tint={tint} size={32} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {workspace.name}
            </span>
            <span className="truncate font-mono text-[10.5px] text-ink-3">
              {plural(workspace.members, "member", "members")}
              {workspace.handle ? ` · ${workspace.handle}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <RoleChip role={workspace.role} />
          </span>
        </span>
        <span className="flex items-center justify-between gap-2 pl-11">
          {meta}
        </span>
        {errorLine ? <span className="pl-11">{errorLine}</span> : null}
      </span>
    );
  }

  const poster = tileStyle === "poster";
  return (
    <span className={cn("relative flex flex-col p-3.5", poster && "pt-0")}>
      {poster ? <Band id={workspace.id} tint={tint} height={44} /> : null}
      <span
        className={cn(
          "relative flex items-start justify-between gap-2",
          poster && "mt-[26px]",
        )}
      >
        <Mark
          name={workspace.name}
          tint={tint}
          size={36}
          className={cn(poster && "ring-[3px] ring-card")}
        />
        <span className={cn(poster && "mt-5")}>
          <RoleChip role={workspace.role} />
        </span>
      </span>
      <span className="mt-2.5 truncate text-[14px] leading-5 font-semibold text-foreground">
        {workspace.name}
      </span>
      <span className="truncate font-mono text-[10.5px] leading-4 text-ink-3">
        {workspace.handle ?? workspace.id}
      </span>
      {/* In a narrow column the visit drops under the people rather than
          squeezing either of them. */}
      <span className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <People names={workspace.people ?? []} members={workspace.members} />
        <span className="flex shrink-0 justify-end whitespace-nowrap">
          {meta}
        </span>
      </span>
      {errorLine ? <span className="mt-2">{errorLine}</span> : null}
    </span>
  );
};

/* ----------------------------------------------------------------------- */
/*                          The workspace, opening                          */
/* ----------------------------------------------------------------------- */

function OpeningPanel({
  workspace,
  opening,
  tileStyle,
  motionSafe,
  onCollapsed,
  onBack,
}: {
  workspace: LobbyWorkspace;
  opening: Opening;
  tileStyle: LobbyTileStyle;
  motionSafe: boolean;
  onCollapsed: () => void;
  onBack: () => void;
}) {
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const done = React.useRef(onCollapsed);
  React.useEffect(() => {
    done.current = onCollapsed;
  });
  // 0 is the tile's own box, 1 the panel filled. Kept outside React so a
  // re-render never restarts or rewinds the grow.
  const progress = React.useRef(motionSafe ? 0 : 1);
  const [backNode, setBackNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const { from, to, phase } = opening;
  const tint = tintOf(workspace);
  const poster = tileStyle === "poster";

  const paint = React.useCallback(
    (p: number) => {
      const el = boxRef.current;
      if (!el) return;
      if (p >= 1) {
        // Filled: pinned by insets so a resize keeps it filling the panel.
        el.style.left = `${FILL_INSET}px`;
        el.style.top = `${FILL_INSET}px`;
        el.style.width = `calc(100% - ${FILL_INSET * 2}px)`;
        el.style.height = `calc(100% - ${FILL_INSET * 2}px)`;
        return;
      }
      // The real box grows — not a scale — so the words inside never squash.
      el.style.left = `${r2(lerp(from.x, to.x, p))}px`;
      el.style.top = `${r2(lerp(from.y, to.y, p))}px`;
      el.style.width = `${r2(lerp(from.w, to.w, p))}px`;
      el.style.height = `${r2(lerp(from.h, to.h, p))}px`;
    },
    [from, to],
  );

  // Placed before the first paint, so it never flashes at the wrong size.
  React.useLayoutEffect(() => {
    paint(progress.current);
  }, [paint]);

  React.useEffect(() => {
    const target = phase === "closing" ? 0 : 1;
    if (!motionSafe) {
      progress.current = 1;
      paint(1);
      if (target === 0) {
        const t = window.setTimeout(
          () => done.current(),
          durations.fast * 1000,
        );
        return () => window.clearTimeout(t);
      }
      return;
    }
    if (progress.current === target) {
      if (target === 0) done.current();
      return;
    }
    // A plain number, written out on every frame: the box has only just
    // mounted, and the grow must finish rather than freeze if an effect
    // re-run interrupts it (it resumes from wherever it got to).
    const controls = animate(progress.current, target, {
      ...springs.glide,
      onUpdate: (v) => {
        progress.current = v;
        paint(v);
      },
      onComplete: () => {
        progress.current = target;
        paint(target);
        if (target === 0) done.current();
      },
    });
    return () => controls.stop();
  }, [phase, motionSafe, paint]);

  // Focus moves in once the panel's button exists — bound to the node when
  // it arrives, never to a guessed frame.
  React.useEffect(() => {
    if (backNode && phase !== "closing")
      backNode.focus({ preventScroll: true });
  }, [backNode, phase]);

  const spaces = workspace.spaces ?? [];
  const step = cascade(spaces.length + 3);
  const rows = React.useMemo(() => {
    const rnd = seeded(hash(`${workspace.id}:rows`));
    return Array.from({ length: 4 }, () => Math.round(46 + rnd() * 46));
  }, [workspace.id]);
  const enter = (i: number) =>
    motionSafe
      ? {
          initial: { opacity: 0, x: -distances.step },
          animate: { opacity: 1, x: 0 },
          transition: {
            x: { ...springs.glide, delay: 0.16 + i * step },
            opacity: {
              duration: durations.base,
              ease: easings.enter,
              delay: 0.16 + i * step,
            },
          },
        }
      : {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration: durations.fast },
        };

  const backButton = (
    <button
      ref={setBackNode}
      type="button"
      onClick={onBack}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
        FOCUS,
      )}
    >
      {phase === "open" ? (
        <>
          <ArrowLeftRight aria-hidden className="size-3.5" />
          Switch
        </>
      ) : (
        <>
          <X aria-hidden className="size-3.5" />
          Cancel
        </>
      )}
    </button>
  );

  return (
    <motion.div
      ref={boxRef}
      role="region"
      aria-label={`${workspace.name}, ${phase === "open" ? "open" : "opening"}`}
      aria-busy={phase === "opening" || undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onBack();
        }
      }}
      initial={motionSafe ? false : { opacity: 0 }}
      animate={{ opacity: phase === "closing" && !motionSafe ? 0 : 1 }}
      transition={{ duration: durations.fast, ease: easings.enter }}
      className="absolute z-20 flex flex-col overflow-hidden rounded-3 border border-hairline-strong bg-surface-1 shadow-raised"
    >
      {poster ? <Band id={workspace.id} tint={tint} height={44} /> : null}
      {tileStyle === "row" ? (
        <div className="relative flex shrink-0 items-center gap-3 p-3">
          <motion.span
            initial={false}
            animate={{ scale: motionSafe && phase !== "closing" ? 1.12 : 1 }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            style={{ originX: 0, originY: 0.5 }}
            className="shrink-0"
          >
            <Mark name={workspace.name} tint={tint} size={32} />
          </motion.span>
          <span className="flex min-w-0 flex-1 flex-col pl-0.5">
            <span className="truncate text-[13px] font-semibold">
              {workspace.name}
            </span>
            <span className="truncate font-mono text-[10.5px] text-ink-3">
              {workspace.handle ?? workspace.id} · {ROLE[workspace.role]}
            </span>
          </span>
          {backButton}
        </div>
      ) : (
        // Laid out exactly like the tile it grew from — mark top left, name
        // under it — so nothing jumps on the first frame of the grow.
        <div
          className={cn(
            "relative flex shrink-0 flex-col p-3.5",
            poster && "pt-[26px]",
          )}
        >
          <span className="flex items-start justify-between gap-2">
            <motion.span
              initial={false}
              animate={{ scale: motionSafe && phase !== "closing" ? 1.12 : 1 }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
              style={{ originX: 0, originY: 0 }}
              className={cn(
                "shrink-0 rounded-2",
                poster && "ring-[3px] ring-surface-1",
              )}
            >
              <Mark name={workspace.name} tint={tint} size={36} />
            </motion.span>
            <span className={cn(poster && "mt-5")}>{backButton}</span>
          </span>
          <span className="mt-2.5 truncate text-[14px] leading-5 font-semibold">
            {workspace.name}
          </span>
          <span className="truncate font-mono text-[10.5px] leading-4 text-ink-3">
            {workspace.handle ?? workspace.id} · {ROLE[workspace.role]}
          </span>
        </div>
      )}

      <div className="relative flex shrink-0 flex-col gap-2 px-3.5">
        <span className="flex items-center gap-2 text-[12px] text-ink-2">
          {phase === "open" ? (
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className="size-3.5 text-success"
            >
              <motion.path
                d="M3.5 8.5l3 3 6-7"
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
            <LoaderCircle
              aria-hidden
              className={cn(
                "size-3.5 text-ink-3",
                motionSafe && "animate-spin",
              )}
            />
          )}
          {phase === "open"
            ? `${workspace.name} is open`
            : `Opening ${workspace.name}…`}
        </span>
        <span
          aria-hidden
          className="relative block h-0.5 w-full overflow-hidden rounded-full bg-surface-2"
        >
          {phase === "opening" && motionSafe ? (
            <motion.span
              className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[var(--wl-accent)]"
              initial={{ x: "-100%" }}
              animate={{ x: "300%" }}
              transition={{
                duration: 1.1,
                ease: easings.move,
                repeat: Infinity,
              }}
            />
          ) : (
            <motion.span
              className={cn(
                "absolute inset-0 origin-left rounded-full",
                phase === "open" ? "bg-success" : "bg-[var(--wl-accent)]",
              )}
              initial={false}
              animate={{ scaleX: phase === "open" ? 1 : 0.5 }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          )}
        </span>
      </div>

      <div className="relative grid flex-1 grid-cols-1 gap-4 overflow-hidden p-3.5 pt-4 @min-[30rem]:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <motion.span
            {...enter(0)}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Spaces
          </motion.span>
          <ul role="list" className="flex flex-col">
            {spaces.map((space, i) => (
              <motion.li
                key={space}
                {...enter(i + 1)}
                className="flex h-7 items-center gap-2 text-[13px] text-foreground"
              >
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: tint }}
                />
                <span className="truncate">{space}</span>
              </motion.li>
            ))}
          </ul>
        </div>
        <div aria-hidden className="hidden flex-col gap-2.5 @min-[30rem]:flex">
          <motion.span
            {...enter(0)}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Recent
          </motion.span>
          {rows.map((width, i) => (
            <motion.span
              key={i}
              {...enter(i + 1)}
              className="flex items-center gap-2.5"
            >
              <span className="size-6 shrink-0 rounded-full bg-surface-2" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span
                  className="block h-2 rounded-full bg-surface-2"
                  style={{ width: `${width}%` }}
                />
                <span
                  className="block h-2 rounded-full bg-surface-2/70"
                  style={{ width: `${Math.round(width * 0.6)}%` }}
                />
              </span>
            </motion.span>
          ))}
        </div>
      </div>

      <div className="relative flex shrink-0 items-center gap-2 border-t border-hairline px-3.5 py-2.5 text-[11px] text-ink-3">
        <People names={workspace.people ?? []} members={workspace.members} />
        <span className="truncate">
          {plural(workspace.members, "member", "members")} · you’re{" "}
          {workspace.role === "owner"
            ? "the owner"
            : workspace.role === "admin"
              ? "an admin"
              : `a ${workspace.role}`}
        </span>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * The screen after sign-in: who you are, the workspaces you belong to, the
 * invitations waiting and a way to start a new one. The tiles are a listbox —
 * arrows walk them, letters jump by name, Enter opens — and a single accent
 * plate travels to the active tile on `springs.snap`.
 *
 * Choosing a tile lifts it into the panel: its real box grows from the tile's
 * measured place to fill the body on `springs.glide` (so the words never
 * squash) while every other tile steps back on the same spring, and the
 * workspace's spaces cascade in under a loading line while `onSelect` is
 * pending. It resolves to a drawn check; a rejection, Cancel or Escape folds
 * it back onto its tile and focus goes home. Joining an invitation lands the
 * new tile from where the invitation was.
 *
 * Under reduced motion nothing travels or scales: the panel cross-fades in
 * at full size, the others dim, and progress and the check still show.
 */
export function WorkspaceLobby({
  workspaces = defaultLobbyWorkspaces,
  invitations = defaultLobbyInvitations,
  account = defaultLobbyAccount,
  now = defaultLobbyNow,
  value,
  defaultValue,
  onValueChange,
  onSelect,
  onCancel,
  onCreate,
  onJoin,
  onDecline,
  onSwitchAccount,
  status = "ready",
  onRetry,
  tileStyle = "card",
  columns = 3,
  accent = "var(--accent-bright)",
  title = "Choose a workspace",
  maxHeight = 560,
  disabled = false,
  className,
}: WorkspaceLobbyProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const cols = Math.min(4, Math.max(1, Math.round(columns)));

  const [own, setOwn] = React.useState<string | null>(
    defaultValue === undefined ? (workspaces[0]?.id ?? null) : defaultValue,
  );
  const wanted = value === undefined ? own : value;
  const active = workspaces.some((w) => w.id === wanted)
    ? wanted
    : (workspaces[0]?.id ?? null);

  const [opening, setOpening] = React.useState<Opening | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [joining, setJoining] = React.useState<Record<string, boolean>>({});
  const [arrived, setArrived] = React.useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = React.useState("");
  /** The tile a folded panel just landed back on: it reappears instantly. */
  const [home, setHome] = React.useState<string | null>(null);

  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const tileRefs = React.useRef(new Map<string, HTMLDivElement>());
  const inviteRefs = React.useRef(new Map<string, HTMLLIElement>());
  /** Where each joining invitation sat, so its tile can land from there. */
  const departures = React.useRef(new Map<string, DOMRect>());
  const runRef = React.useRef(0);
  const restore = React.useRef<string | null>(null);
  const typeahead = React.useRef({ text: "", at: 0 });
  /** An invitation answered from its own button: focus follows its card. */
  const carryFocus = React.useRef<{ id: string; joined: boolean } | null>(null);
  const createRef = React.useRef<HTMLButtonElement | null>(null);

  // The selection plate: one frame that travels between tiles.
  const plateX = useMotionValue(0);
  const plateY = useMotionValue(0);
  const plateW = useMotionValue(0);
  const plateH = useMotionValue(0);
  const plateO = useMotionValue(0);
  const placed = React.useRef(false);
  /** The tile the plate last settled on: only a new tile earns the slide. */
  const plateOn = React.useRef<string | null>(null);

  const tileStep = cascade(workspaces.length);

  React.useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let controls: { stop: () => void }[] = [];
    const measure = () => {
      const el = active ? tileRefs.current.get(active) : undefined;
      if (!el) {
        plateO.jump(0);
        placed.current = false;
        return;
      }
      const next = {
        x: el.offsetLeft,
        y: el.offsetTop,
        w: el.offsetWidth,
        h: el.offsetHeight,
      };
      if (next.w === 0 || next.h === 0) return;
      for (const c of controls) c.stop();
      // A resize re-seats the plate where it is; only moving to another
      // tile slides it, so it never trails a reflow on a spring.
      const moved = placed.current && plateOn.current !== active;
      if (!moved || !motionSafe) {
        plateOn.current = active;
        plateX.jump(next.x);
        plateY.jump(next.y);
        plateW.jump(next.w);
        plateH.jump(next.h);
        plateO.jump(1);
        placed.current = true;
        controls = [];
        return;
      }
      plateO.jump(1);
      controls = [
        animate(plateX, next.x, springs.snap),
        animate(plateY, next.y, springs.snap),
        animate(plateW, next.w, springs.snap),
        animate(plateH, next.h, {
          ...springs.snap,
          onComplete: () => {
            plateOn.current = active;
          },
        }),
      ];
    };
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    for (const el of tileRefs.current.values()) ro.observe(el);
    return () => {
      ro.disconnect();
      for (const c of controls) c.stop();
    };
  }, [
    active,
    motionSafe,
    plateH,
    plateO,
    plateW,
    plateX,
    plateY,
    tileStyle,
    cols,
    workspaces,
  ]);

  // Joining invitations: remember where each card sits, every commit, so the
  // tile that replaces it can travel from its last place.
  React.useLayoutEffect(() => {
    for (const [id, on] of Object.entries(joining)) {
      if (!on) continue;
      const el = inviteRefs.current.get(id);
      if (el) departures.current.set(id, el.getBoundingClientRect());
    }
  });

  // A tile whose invitation just left lands from where the card was. The
  // departure is forgotten only when the landing completes, and an
  // interrupted landing is finished in place, so a re-run of this effect
  // measures the tile at rest and flies it again rather than freezing it.
  React.useEffect(() => {
    const running: {
      stop: () => void;
      tile: HTMLDivElement;
      travel: boolean;
    }[] = [];
    for (const [id, from] of departures.current) {
      const tile = tileRefs.current.get(id);
      if (!tile) continue;
      const to = tile.getBoundingClientRect();
      const dx = Math.round(from.left - to.left);
      const dy = Math.round(from.top - to.top);
      const land = () => {
        departures.current.delete(id);
        tile.style.zIndex = "";
      };
      // Joined from the keyboard (or a press on Join): the button left with
      // its card, so focus moves onto the tile it became.
      if (carryFocus.current?.id === id && carryFocus.current.joined) {
        carryFocus.current = null;
        tile.focus({ preventScroll: true });
      }
      tile.style.zIndex = "30";
      if (!motionSafe) {
        // Reduced motion: it simply fades in at its cell, on the platform's
        // own animations.
        const fade =
          typeof tile.animate === "function"
            ? tile.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: durations.base * 1000,
              })
            : null;
        if (fade) fade.onfinish = land;
        else land();
        running.push({ stop: () => fade?.cancel(), tile, travel: false });
        continue;
      }
      const controls = animate(
        tile,
        { x: [dx, 0], y: [dy, 0] },
        { ...springs.glide, onComplete: land },
      );
      running.push({ stop: () => controls.stop(), tile, travel: true });
    }
    return () => {
      for (const r of running) {
        r.stop();
        if (r.travel) animate(r.tile, { x: 0, y: 0 }, { duration: 0 });
        r.tile.style.zIndex = "";
      }
    };
  }, [workspaces, motionSafe]);

  // A declined card leaves with the button that had focus: focus moves to
  // the next invitation's Join, or to Create when none are left.
  React.useEffect(() => {
    const carry = carryFocus.current;
    if (!carry || carry.joined) return;
    if (invitations.some((i) => i.id === carry.id)) return;
    carryFocus.current = null;
    const next = invitations[0];
    const target = next
      ? inviteRefs.current.get(next.id)?.querySelector("button")
      : createRef.current;
    target?.focus({ preventScroll: true });
  }, [invitations]);

  // Focus goes home to the tile once the panel has folded away.
  React.useEffect(() => {
    if (opening) return;
    const id = restore.current;
    restore.current = null;
    if (!id) return;
    const el = tileRefs.current.get(id);
    if (el?.isConnected) el.focus({ preventScroll: true });
  }, [opening]);

  const choose = (id: string, focus: boolean) => {
    if (value === undefined) setOwn(id);
    if (id !== active) onValueChange?.(id);
    if (focus) tileRefs.current.get(id)?.focus({ preventScroll: false });
  };

  const rectIn = (el: Element, frame: Element): Rect => {
    const a = el.getBoundingClientRect();
    const b = frame.getBoundingClientRect();
    return {
      x: r2(a.left - b.left),
      y: r2(a.top - b.top),
      w: r2(a.width),
      h: r2(a.height),
    };
  };

  const fillRect = (frame: Element): Rect => {
    const b = frame.getBoundingClientRect();
    return {
      x: FILL_INSET,
      y: FILL_INSET,
      w: r2(b.width - FILL_INSET * 2),
      h: r2(b.height - FILL_INSET * 2),
    };
  };

  const openWorkspace = (workspace: LobbyWorkspace) => {
    if (disabled || opening || status !== "ready") return;
    const body = bodyRef.current;
    const tile = tileRefs.current.get(workspace.id);
    if (!body || !tile) return;
    choose(workspace.id, false);
    setHome(null);
    const run = ++runRef.current;
    setErrors((e) => {
      if (!(workspace.id in e)) return e;
      const next = { ...e };
      delete next[workspace.id];
      return next;
    });
    setOpening({
      id: workspace.id,
      run,
      from: rectIn(tile, body),
      to: fillRect(body),
      phase: "opening",
    });
    setAnnouncement(`Opening ${workspace.name}.`);
    const result = onSelect?.(workspace);
    const landed = () => {
      if (runRef.current !== run) return;
      setOpening((o) => (o && o.run === run ? { ...o, phase: "open" } : o));
      setAnnouncement(`${workspace.name} is open.`);
    };
    if (result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).then(landed, (reason: unknown) => {
        if (runRef.current !== run) return;
        const message =
          reason instanceof Error && reason.message
            ? reason.message
            : `Couldn’t open ${workspace.name}. Try again.`;
        fold(workspace.id, run, message);
        setAnnouncement(`Couldn’t open ${workspace.name}. ${message}`);
      });
    } else {
      landed();
    }
  };

  /** Folds the open panel back onto its tile, re-measured where it is now. */
  const fold = (id: string, run: number, error?: string) => {
    const body = bodyRef.current;
    const tile = tileRefs.current.get(id);
    const from = tile && body ? rectIn(tile, body) : null;
    const to = body ? fillRect(body) : null;
    setOpening((o) =>
      !o || o.id !== id || o.run !== run || o.phase === "closing"
        ? o
        : {
            ...o,
            phase: "closing",
            error,
            from: from ?? o.from,
            to: to ?? o.to,
          },
    );
  };

  const back = () => {
    if (!opening || opening.phase === "closing") return;
    const workspace = workspaces.find((w) => w.id === opening.id);
    // Any answer still on its way for this opening is now stale.
    runRef.current += 1;
    const body = bodyRef.current;
    const tile = tileRefs.current.get(opening.id);
    setOpening({
      ...opening,
      run: runRef.current,
      phase: "closing",
      from: tile && body ? rectIn(tile, body) : opening.from,
      to: body ? fillRect(body) : opening.to,
    });
    if (workspace) {
      setAnnouncement(
        opening.phase === "open"
          ? `Back to your workspaces.`
          : `Stopped opening ${workspace.name}.`,
      );
      onCancel?.(workspace);
    }
  };

  const collapsed = (id: string, error?: string) => {
    restore.current = id;
    if (error) setErrors((e) => ({ ...e, [id]: error }));
    setHome(id);
    setOpening(null);
  };

  const visualColumns = () => {
    const first = workspaces[0];
    const top = first ? tileRefs.current.get(first.id)?.offsetTop : undefined;
    if (top === undefined) return 1;
    let n = 0;
    for (const w of workspaces) {
      if (tileRefs.current.get(w.id)?.offsetTop === top) n += 1;
      else break;
    }
    return Math.max(1, n);
  };

  const onListKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (workspaces.length === 0) return;
    const index = Math.max(
      0,
      workspaces.findIndex((w) => w.id === active),
    );
    const go = (i: number) => {
      const target =
        workspaces[Math.min(workspaces.length - 1, Math.max(0, i))];
      if (target) choose(target.id, true);
    };
    const across = visualColumns();
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        go(index + 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        go(index - 1);
        return;
      case "ArrowDown":
        event.preventDefault();
        go(index + across);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(index - across);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(workspaces.length - 1);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const current = workspaces[index];
        if (current) openWorkspace(current);
        return;
      }
      default:
        break;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      /\S/.test(event.key)
    ) {
      event.preventDefault();
      const t = typeahead.current;
      const stamp = event.timeStamp;
      t.text = stamp - t.at > 600 ? event.key : t.text + event.key;
      t.at = stamp;
      const needle = t.text.toLowerCase();
      // A repeated single letter walks through the names that share it.
      const repeat = needle.length > 1 && new Set(needle).size === 1;
      const query = repeat ? (needle[0] ?? "") : needle;
      const start = repeat || needle.length === 1 ? index + 1 : index;
      for (let k = 0; k < workspaces.length; k += 1) {
        const candidate = workspaces[(start + k) % workspaces.length];
        if (candidate?.name.toLowerCase().startsWith(query)) {
          choose(candidate.id, true);
          break;
        }
      }
    }
  };

  const join = (invitation: LobbyInvitation) => {
    if (disabled || joining[invitation.id]) return;
    carryFocus.current = { id: invitation.id, joined: true };
    const el = inviteRefs.current.get(invitation.id);
    if (el) departures.current.set(invitation.id, el.getBoundingClientRect());
    setJoining((j) => ({ ...j, [invitation.id]: true }));
    setArrived((a) => ({ ...a, [invitation.id]: true }));
    setAnnouncement(`Joining ${invitation.name}.`);
    const result = onJoin?.(invitation);
    const done = (ok: boolean) => {
      setJoining((j) => {
        const next = { ...j };
        delete next[invitation.id];
        return next;
      });
      if (!ok) {
        departures.current.delete(invitation.id);
        setArrived((a) => {
          const next = { ...a };
          delete next[invitation.id];
          return next;
        });
      }
      setAnnouncement(
        ok
          ? `Joined ${invitation.name}.`
          : `Couldn’t join ${invitation.name}. Try again.`,
      );
    };
    if (result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).then(
        () => done(true),
        () => done(false),
      );
    } else {
      done(true);
    }
  };

  const openingWorkspace = opening
    ? workspaces.find((w) => w.id === opening.id)
    : undefined;
  const busy = Boolean(opening);
  const counts = [
    status === "ready"
      ? plural(workspaces.length, "workspace", "workspaces")
      : null,
    invitations.length > 0
      ? plural(invitations.length, "invitation", "invitations")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const gridColumns =
    "grid-cols-1 @min-[30rem]:grid-cols-[repeat(var(--wl-mid),minmax(0,1fr))] @min-[44rem]:grid-cols-[repeat(var(--wl-cols),minmax(0,1fr))]";

  return (
    <div
      className={cn("@container relative w-full text-foreground", className)}
      style={
        {
          "--wl-accent": accent,
          "--wl-cols": cols,
          "--wl-mid": Math.min(cols, 2),
        } as React.CSSProperties
      }
    >
      <div
        className="flex flex-col overflow-hidden rounded-4 border border-hairline bg-card"
        style={{ maxHeight }}
      >
        <header className="flex shrink-0 flex-col gap-3 border-b border-hairline px-4 pt-4 pb-3.5 @min-[30rem]:px-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[9px] font-semibold text-ink-2"
              >
                {initials(account.name)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12px] leading-4 text-ink-2">
                  Signed in as{" "}
                  <span className="font-medium text-foreground">
                    {account.name}
                  </span>
                </span>
                <span
                  className="truncate font-mono text-[10.5px] leading-4 text-ink-3"
                  title={account.email}
                >
                  {account.email}
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => onSwitchAccount?.()}
              disabled={busy}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
                FOCUS,
              )}
            >
              <ArrowLeftRight aria-hidden className="size-3.5" />
              Switch account
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 id={titleId} className="text-[17px] leading-6 font-semibold">
              {title}
            </h2>
            <p className="text-[12px] leading-4 text-ink-3">
              {status === "loading"
                ? "Finding your workspaces…"
                : counts || "Nothing here yet"}
            </p>
          </div>
        </header>

        <div
          ref={bodyRef}
          className="relative flex flex-1 flex-col overflow-hidden"
        >
          <div
            inert={busy}
            className="flex flex-1 [scrollbar-width:thin] flex-col gap-5 overflow-y-auto overscroll-contain p-4 @min-[30rem]:p-5"
          >
            <p id={hintId} className="sr-only">
              Arrow keys move between workspaces, letters jump by name, Enter
              opens.
            </p>

            {status === "loading" ? (
              <div
                aria-busy="true"
                aria-label="Loading workspaces"
                className={cn("grid gap-3", gridColumns)}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="flex h-[132px] flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3.5"
                  >
                    <span className="size-9 rounded-2 bg-surface-2" />
                    <span className="h-3 w-2/3 rounded-full bg-surface-2" />
                    <span className="h-2.5 w-1/2 rounded-full bg-surface-2/70" />
                  </span>
                ))}
              </div>
            ) : status === "error" ? (
              <div
                role="alert"
                className="flex flex-col items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-4"
              >
                <span className="flex items-center gap-2 text-[13px] text-danger">
                  <TriangleAlert aria-hidden className="size-4 shrink-0" />
                  Couldn’t load your workspaces.
                </span>
                <button
                  type="button"
                  onClick={() => onRetry?.()}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-input bg-card px-3 text-[12px] font-medium transition-colors hover:bg-surface-2",
                    FOCUS,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Try again
                </button>
              </div>
            ) : workspaces.length === 0 ? (
              <EmptyLobby
                email={account.email}
                hasInvites={invitations.length > 0}
                disabled={disabled}
                onCreate={onCreate}
              />
            ) : (
              <div ref={gridRef} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-0 z-10 transition-opacity duration-150",
                    busy && "opacity-0",
                  )}
                >
                  <motion.span
                    className="absolute top-0 left-0 rounded-3 border-[1.5px] border-[var(--wl-accent)]"
                    style={{
                      x: plateX,
                      y: plateY,
                      width: plateW,
                      height: plateH,
                      opacity: plateO,
                    }}
                  />
                </span>
                <div
                  role="listbox"
                  aria-labelledby={titleId}
                  aria-describedby={hintId}
                  aria-disabled={disabled || undefined}
                  onKeyDown={onListKey}
                  className={cn("grid gap-3", gridColumns)}
                >
                  {workspaces.map((workspace, i) => {
                    const selected = workspace.id === active;
                    const isOpening = opening?.id === workspace.id;
                    const stepBack = busy && !isOpening;
                    const fresh = Boolean(arrived[workspace.id]);
                    const unread = workspace.unread ?? 0;
                    const label = [
                      workspace.name,
                      ROLE[workspace.role],
                      plural(workspace.members, "member", "members"),
                      fresh
                        ? "just joined"
                        : workspace.lastVisit === undefined
                          ? "never opened"
                          : `last visit ${lobbyAgo(workspace.lastVisit, now)}`,
                      unread > 0 ? `${unread} unread` : null,
                      errors[workspace.id] ?? null,
                    ]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <motion.div
                        key={workspace.id}
                        ref={(node: HTMLDivElement | null) => {
                          if (node) tileRefs.current.set(workspace.id, node);
                          else tileRefs.current.delete(workspace.id);
                        }}
                        role="option"
                        aria-selected={selected}
                        aria-label={label}
                        aria-disabled={disabled || undefined}
                        tabIndex={selected ? 0 : -1}
                        data-wl-tile={workspace.id}
                        onClick={() => openWorkspace(workspace)}
                        onFocus={() => {
                          if (!selected) choose(workspace.id, false);
                        }}
                        initial={false}
                        animate={{
                          scale: stepBack && motionSafe ? 0.96 : 1,
                          opacity: isOpening ? 0 : stepBack ? 0.35 : 1,
                        }}
                        whileTap={
                          motionSafe && !disabled ? { scale: 0.985 } : undefined
                        }
                        transition={
                          motionSafe
                            ? {
                                scale: busy
                                  ? {
                                      ...springs.glide,
                                      delay: i * tileStep * 0.5,
                                    }
                                  : springs.flick,
                                opacity:
                                  isOpening || home === workspace.id
                                    ? { duration: 0 }
                                    : {
                                        duration: durations.base,
                                        ease: easings.enter,
                                      },
                              }
                            : {
                                duration:
                                  isOpening || home === workspace.id
                                    ? 0
                                    : durations.fast,
                              }
                        }
                        className={cn(
                          "relative cursor-pointer overflow-hidden rounded-3 border text-left transition-[background-color,border-color,box-shadow] duration-150 select-none",
                          FOCUS,
                          selected
                            ? "border-hairline-strong bg-[color-mix(in_oklab,var(--wl-accent)_5%,var(--card))]"
                            : "border-hairline bg-surface-1 hover:border-hairline-strong hover:shadow-raised",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <TileFace
                          workspace={workspace}
                          tileStyle={tileStyle}
                          now={now}
                          fresh={fresh}
                          error={errors[workspace.id]}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {invitations.length > 0 && status !== "loading" ? (
              <section
                aria-labelledby={`${uid}-inv`}
                className="flex flex-col gap-2.5"
              >
                <h3
                  id={`${uid}-inv`}
                  className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                >
                  Invitations
                </h3>
                <ul
                  role="list"
                  className="grid grid-cols-1 gap-3 @min-[30rem]:grid-cols-2"
                >
                  {invitations.map((invitation) => {
                    const pending = Boolean(joining[invitation.id]);
                    return (
                      <li
                        key={invitation.id}
                        ref={(node) => {
                          if (node) inviteRefs.current.set(invitation.id, node);
                          else inviteRefs.current.delete(invitation.id);
                        }}
                        className="flex flex-col gap-3 rounded-3 border border-dashed border-hairline-strong bg-card p-3"
                      >
                        <span className="flex items-start gap-3">
                          <Mark
                            name={invitation.name}
                            tint={tintOf(invitation)}
                            size={32}
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span
                              className="truncate text-[13px] leading-5 font-semibold"
                              title={invitation.name}
                            >
                              {invitation.name}
                            </span>
                            <span className="truncate text-[12px] leading-4 text-ink-2">
                              {invitation.invitedBy} invited you ·{" "}
                              {ROLE[invitation.role]}
                            </span>
                            <span className="truncate text-[11px] leading-4 text-ink-3">
                              {plural(invitation.members, "member", "members")}
                              {invitation.sentAt !== undefined
                                ? ` · sent ${lobbyAgo(invitation.sentAt, now).toLowerCase()}`
                                : ""}
                            </span>
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => join(invitation)}
                            aria-disabled={disabled || pending || undefined}
                            aria-busy={pending || undefined}
                            aria-label={`Join ${invitation.name}`}
                            className={cn(
                              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-[color-mix(in_oklab,var(--wl-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--wl-accent)_14%,transparent)] px-3 text-[12px] font-medium text-[color:var(--wl-accent)] transition-colors hover:bg-[color-mix(in_oklab,var(--wl-accent)_22%,transparent)]",
                              FOCUS,
                              (disabled || pending) &&
                                "cursor-default opacity-70",
                            )}
                          >
                            {pending ? (
                              <LoaderCircle
                                aria-hidden
                                className={cn(
                                  "size-3.5",
                                  motionSafe && "animate-spin",
                                )}
                              />
                            ) : (
                              <Check aria-hidden className="size-3.5" />
                            )}
                            {pending ? "Joining…" : "Join"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (disabled || pending) return;
                              setAnnouncement(`Declined ${invitation.name}.`);
                              carryFocus.current = {
                                id: invitation.id,
                                joined: false,
                              };
                              onDecline?.(invitation);
                            }}
                            aria-disabled={disabled || pending || undefined}
                            aria-label={`Decline ${invitation.name}`}
                            className={cn(
                              "inline-flex h-8 items-center rounded-2 px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                              FOCUS,
                              (disabled || pending) &&
                                "cursor-default opacity-60",
                            )}
                          >
                            Decline
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {status === "ready" && workspaces.length > 0 ? (
              <button
                ref={createRef}
                type="button"
                onClick={() => {
                  if (!disabled) onCreate?.();
                }}
                aria-disabled={disabled || undefined}
                className={cn(
                  "group/workspace-lobby flex h-11 shrink-0 items-center gap-3 rounded-3 border border-dashed border-hairline-strong px-3.5 text-left text-[13px] text-ink-2 transition-colors hover:border-[var(--wl-accent)] hover:text-foreground",
                  FOCUS,
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-2 bg-surface-2 transition-colors group-hover/workspace-lobby:bg-[color-mix(in_oklab,var(--wl-accent)_16%,transparent)] group-hover/workspace-lobby:text-[color:var(--wl-accent)]">
                  <Plus aria-hidden className="size-3.5" />
                </span>
                <span className="min-w-0 truncate">
                  Create a workspace
                  <span className="text-ink-3">
                    {" "}
                    · for a new team or client
                  </span>
                </span>
              </button>
            ) : null}
          </div>

          {opening && openingWorkspace ? (
            <OpeningPanel
              key={opening.id}
              workspace={openingWorkspace}
              opening={opening}
              tileStyle={tileStyle}
              motionSafe={motionSafe}
              onCollapsed={() => collapsed(opening.id, opening.error)}
              onBack={back}
            />
          ) : null}
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Empty lobby                                */
/* ----------------------------------------------------------------------- */

function EmptyLobby({
  email,
  hasInvites,
  disabled,
  onCreate,
}: {
  email: string;
  hasInvites: boolean;
  disabled: boolean;
  onCreate?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3 border border-hairline bg-surface-1 px-4 py-6 text-center">
      <svg
        aria-hidden
        viewBox="0 0 132 52"
        className="h-[52px] w-[132px] text-ink-3"
      >
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={2 + i * 44}
            y={8}
            width={40}
            height={36}
            rx={7}
            fill="none"
            stroke="currentColor"
            strokeOpacity={i === 0 ? 0.9 : 0.4}
            strokeDasharray="3 3"
          />
        ))}
        <path
          d="M22 20v12M16 26h12"
          stroke="var(--wl-accent)"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </svg>
      <div className="flex flex-col gap-1">
        <p className="text-[14px] font-semibold">No workspaces yet</p>
        <p className="text-[12px] leading-5 text-ink-2">
          Create one for your team, or ask an admin to invite{" "}
          <span className="font-mono text-[11px] break-all text-foreground">
            {email}
          </span>
          {hasInvites ? ". Your invitations are below." : "."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!disabled) onCreate?.();
        }}
        aria-disabled={disabled || undefined}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          FOCUS,
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <Plus aria-hidden className="size-4" />
        Create a workspace
      </button>
    </div>
  );
}
