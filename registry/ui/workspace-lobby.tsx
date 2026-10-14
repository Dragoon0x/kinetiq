"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ChevronLeft,
  DoorOpen,
  Mail,
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
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LobbyRole = "owner" | "admin" | "member" | "guest";
export type LobbyPlan = "free" | "team" | "business";
/** A workspace's own colour, drawn from the status tokens at a fixed lightness. */
export type LobbyHue = "cobalt" | "teal" | "violet" | "amber" | "rose";

export type LobbyWorkspace = {
  id: string;
  name: string;
  role: LobbyRole;
  /** How many people are in it. */
  members: number;
  /** When this person last opened it, in ms; absent means never. */
  lastOpenedAt?: number;
  plan: LobbyPlan;
  /** Shown in the glimpse behind its door. @default "cobalt" */
  hue?: LobbyHue;
};

/** A pending invitation; accepting it turns it into a door. */
export type LobbyInvitation = {
  id: string;
  /** The id the workspace has once it is a door. */
  workspaceId: string;
  workspaceName: string;
  /** Who sent it. */
  invitedBy: string;
  role: LobbyRole;
  members: number;
  plan: LobbyPlan;
  hue?: LobbyHue;
};

export type LobbyDoorStyle = "hinge" | "slide" | "fade";
export type LobbyDensity = "compact" | "cozy" | "roomy";
export type LobbyAccent = "workspace" | "cobalt" | "ink";
export type LobbyStatus = "ready" | "loading" | "error";
export type LobbyPhase = "lobby" | "opening" | "open";

export type WorkspaceLobbyProps = {
  /** How a door opens: swinging on its hinge, sliding aside, or fading away. @default "hinge" */
  doorStyle?: LobbyDoorStyle;
  /** Door height, gaps and type size. @default "cozy" */
  density?: LobbyDensity;
  /** What colours the glimpses: each workspace's own hue, the house cobalt, or one ink. @default "workspace" */
  accent?: LobbyAccent;
  /** The signed-in person's workspaces, in door order. @default defaultLobbyWorkspaces */
  workspaces?: LobbyWorkspace[];
  /** Invitations waiting on the side table. Accepted and declined ones leave it. @default defaultLobbyInvitations */
  invitations?: LobbyInvitation[];
  /** Controlled: the chosen door's id, or null. */
  value?: string | null;
  /** The door chosen at first when uncontrolled. @default the first workspace */
  defaultValue?: string | null;
  /** Fires when the chosen door changes, from a press or an arrow key. */
  onChange?: (id: string | null, workspace: LobbyWorkspace | null) => void;
  /** A door was pressed: it swings wide and the workspace starts to open. */
  onOpen?: (workspace: LobbyWorkspace) => void;
  /** The opening finished; the host can now navigate. */
  onReady?: (workspace: LobbyWorkspace) => void;
  /** An invitation was accepted; `workspace` is the door it became. */
  onAccept?: (invitation: LobbyInvitation, workspace: LobbyWorkspace) => void;
  /** An invitation was declined. */
  onDecline?: (invitation: LobbyInvitation) => void;
  /** The Create a workspace door was pressed. */
  onCreate?: () => void;
  /** Controlled: whether the choice is remembered for next time. */
  remember?: boolean;
  /** Initial switch position when uncontrolled. @default false */
  defaultRemember?: boolean;
  /** The remember switch was flipped. */
  onRememberChange?: (remember: boolean) => void;
  /** How long opening a workspace takes before it reads as ready, in ms. @default 1400 */
  openDelay?: number;
  /** The moment "last opened" ages count from, in ms; never read from the clock. @default defaultLobbyNow */
  now?: number;
  /** Whether the workspaces and invitations have arrived. @default "ready" */
  status?: LobbyStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Choose a workspace" */
  title?: string;
  /** Who is signed in, shown under the heading. @default "ines@coldbrook.app" */
  signedInAs?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the lobby in px; the doors scroll inside it. @default 540 */
  height?: number;
  /** Read only: no door opens and no invitation moves. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Monday 12 October 2026, 09:15 UTC: the first sign-in of the week. */
export const defaultLobbyNow = Date.UTC(2026, 9, 12, 9, 15);

/** Ines's four Coldbrook workspaces. */
export const defaultLobbyWorkspaces: LobbyWorkspace[] = [
  {
    id: "fieldline",
    name: "Fieldline",
    role: "owner",
    members: 14,
    lastOpenedAt: defaultLobbyNow - 2 * HOUR,
    plan: "business",
    hue: "cobalt",
  },
  {
    id: "basinworks",
    name: "Basinworks",
    role: "admin",
    members: 31,
    lastOpenedAt: defaultLobbyNow - 26 * HOUR,
    plan: "team",
    hue: "teal",
  },
  {
    id: "fernmoor",
    name: "Fernmoor Labs",
    role: "member",
    members: 6,
    lastOpenedAt: defaultLobbyNow - 9 * DAY,
    plan: "team",
    hue: "violet",
  },
  {
    id: "gaugeworks",
    name: "Gaugeworks Pay",
    role: "guest",
    members: 58,
    plan: "free",
    hue: "amber",
  },
];

/** Two invitations waiting on the side table. */
export const defaultLobbyInvitations: LobbyInvitation[] = [
  {
    id: "inv-tidewater",
    workspaceId: "tidewater",
    workspaceName: "Tidewater",
    invitedBy: "Mara Lind",
    role: "member",
    members: 9,
    plan: "team",
    hue: "rose",
  },
  {
    id: "inv-kiln",
    workspaceId: "kiln",
    workspaceName: "Kiln Studio",
    invitedBy: "Kenji Aoki",
    role: "admin",
    members: 4,
    plan: "free",
    hue: "teal",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground";

/**
 * A hue is pigment at a fixed lightness, taken from a status token so it
 * reads the same in both themes.
 */
const HUES: Record<LobbyHue, string> = {
  cobalt: "var(--accent-bright)",
  teal: "oklch(from var(--accent-bright) 0.64 0.12 190)",
  violet: "oklch(from var(--accent-bright) 0.6 0.16 300)",
  amber: "oklch(from var(--warn) 0.74 0.14 h)",
  rose: "oklch(from var(--danger) 0.64 0.16 10)",
};

const ROLE_WORD: Record<LobbyRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

const PLAN_WORD: Record<LobbyPlan, string> = {
  free: "Free",
  team: "Team",
  business: "Business",
};

type DensitySpec = {
  /** Door frame height in px. */
  door: number;
  /** Narrowest a door column gets before the row wraps. */
  column: string;
  gap: string;
  name: string;
  meta: string;
};

const DENSITY: Record<LobbyDensity, DensitySpec> = {
  compact: {
    door: 104,
    column: "6rem",
    gap: "gap-2",
    name: "text-[12px]",
    meta: "text-[10px]",
  },
  cozy: {
    door: 132,
    column: "6.75rem",
    gap: "gap-3",
    name: "text-[13px]",
    meta: "text-[11px]",
  },
  roomy: {
    door: 164,
    column: "7.5rem",
    gap: "gap-4",
    name: "text-[14px]",
    meta: "text-[11px]",
  },
};

/** The door's swing before the lobby slides away, in ms. */
const SWING_MS = 260;
const CREATE_ID = "__create";

const noopSubscribe = () => () => {};

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

const ageOf = (at: number | undefined, now: number) => {
  if (at === undefined) return "Never opened";
  const d = Math.max(0, now - at);
  if (d < HOUR) return "Opened just now";
  if (d < DAY) return `Opened ${Math.round(d / HOUR)}h ago`;
  const days = Math.round(d / DAY);
  if (days === 1) return "Opened yesterday";
  if (days < 14) return `Opened ${days}d ago`;
  return `Opened ${Math.round(days / 7)}w ago`;
};

const accentOf = (hue: LobbyHue | undefined, accent: LobbyAccent) =>
  accent === "ink"
    ? "var(--ink-2)"
    : accent === "cobalt"
      ? "var(--accent-bright)"
      : HUES[hue ?? "cobalt"];

const toWorkspace = (inv: LobbyInvitation): LobbyWorkspace => ({
  id: inv.workspaceId,
  name: inv.workspaceName,
  role: inv.role,
  members: inv.members,
  plan: inv.plan,
  hue: inv.hue,
});

/* ----------------------------------------------------------------------- */
/*                                  Glimpse                                 */
/* ----------------------------------------------------------------------- */

const BARS = [0.42, 0.66, 0.5, 0.82, 0.6, 0.92, 0.72];

/**
 * The workspace seen through its door: a mini dashboard in its accent. It is
 * decoration (the door's label carries the facts), and the same element at
 * two sizes so the small one can grow into the large one by `layoutId`.
 */
function Glimpse({
  name,
  accent,
  large,
  motionSafe,
  layoutId,
  className,
}: {
  name: string;
  accent: string;
  large: boolean;
  motionSafe: boolean;
  layoutId: string | undefined;
  className?: string;
}) {
  const step = cascade(BARS.length);
  return (
    <motion.div
      aria-hidden
      layoutId={layoutId}
      transition={springs.glide}
      className={cn("overflow-hidden bg-card", className)}
      style={{ ["--wl-accent" as string]: accent }}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col",
          large ? "gap-3 p-4" : "gap-[7%] p-[9%]",
        )}
      >
        <div className="flex items-center gap-[4%]">
          <span
            className={cn(
              "shrink-0 rounded-full bg-(--wl-accent)",
              large ? "size-2.5" : "size-[9%] min-h-1 min-w-1",
            )}
          />
          {large ? (
            <span className="truncate text-[13px] font-semibold text-foreground">
              {name}
            </span>
          ) : (
            <span className="h-[5px] w-[34%] rounded-full bg-(--wl-accent) opacity-80" />
          )}
          <span className="ml-auto flex gap-[3%]">
            <span
              className={cn(
                "rounded-full bg-surface-2",
                large ? "size-2.5" : "size-[6px]",
              )}
            />
            <span
              className={cn(
                "rounded-full bg-surface-2",
                large ? "size-2.5" : "size-[6px]",
              )}
            />
          </span>
        </div>
        <div className={cn("grid grid-cols-2", large ? "gap-3" : "gap-[6%]")}>
          {[
            { label: "Open", value: "128" },
            { label: "Due this week", value: "17" },
          ].map((tile) => (
            <span
              key={tile.label}
              className={cn(
                "flex flex-col justify-end rounded-2 bg-surface-1",
                large ? "gap-1 p-3" : "h-[18px] gap-[2px] p-[6%]",
              )}
            >
              {large ? (
                <>
                  <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {tile.label}
                  </span>
                  <span className="font-mono text-lg text-foreground tabular-nums">
                    {tile.value}
                  </span>
                </>
              ) : (
                <>
                  <span className="h-[3px] w-[55%] rounded-full bg-hairline-strong" />
                  <span className="h-[3px] w-[30%] rounded-full bg-(--wl-accent)" />
                </>
              )}
            </span>
          ))}
        </div>
        <div
          className={cn(
            "flex min-h-0 flex-1 items-end",
            large ? "gap-2 pt-2" : "gap-[5%]",
          )}
        >
          {BARS.map((h, i) => (
            <motion.span
              key={i}
              className="min-w-0 flex-1 rounded-t-[3px] bg-(--wl-accent)"
              style={{
                height: `${Math.round(h * 100)}%`,
                opacity: 0.45 + (i % 3) * 0.2,
                originY: 1,
              }}
              initial={large && motionSafe ? { scaleY: 0 } : false}
              animate={{ scaleY: 1 }}
              transition={
                large && motionSafe
                  ? { ...springs.glide, delay: r3(0.2 + i * step) }
                  : { duration: 0 }
              }
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Door                                   */
/* ----------------------------------------------------------------------- */

type DoorProps = {
  workspace: LobbyWorkspace;
  accent: string;
  density: DensitySpec;
  doorStyle: LobbyDoorStyle;
  selected: boolean;
  ajar: boolean;
  wide: boolean;
  /** Lands on recoil: a door that just arrived from an envelope. */
  enter: boolean;
  /** Fades up in the row's cascade: a door mounting after hydration. */
  arrive: boolean;
  /** Its place in the cascade, in seconds. */
  delay: number;
  tabIndex: number;
  disabled: boolean;
  motionSafe: boolean;
  glimpseId: string | undefined;
  markId: string | undefined;
  age: string;
  nodeRef: (node: HTMLDivElement | null) => void;
  onHover: (on: boolean) => void;
  onFocus: () => void;
  onBlur: () => void;
  onPress: () => void;
  onKey: (event: React.KeyboardEvent) => void;
};

/** How an option arrives: landing, cascading in, or already there. */
const arrival = (
  enter: boolean,
  arrive: boolean,
  delay: number,
  motionSafe: boolean,
) => {
  const opacity = { duration: durations.base, ease: easings.enter };
  if (enter) {
    return {
      initial: motionSafe
        ? { opacity: 0, scale: 0.8, y: distances.step }
        : { opacity: 0 },
      transition: {
        layout: springs.glide,
        scale: springs.recoil,
        y: springs.recoil,
        opacity,
      },
    };
  }
  if (arrive) {
    return {
      initial: motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 },
      transition: {
        layout: springs.glide,
        y: { ...springs.glide, delay },
        opacity: { ...opacity, delay },
      },
    };
  }
  return {
    initial: false as const,
    transition: { layout: springs.glide, opacity },
  };
};

const panelTarget = (
  style: LobbyDoorStyle,
  ajar: boolean,
  wide: boolean,
  motionSafe: boolean,
) => {
  if (!motionSafe) return { opacity: wide ? 0 : ajar ? 0.3 : 1 };
  if (style === "hinge") {
    return { rotateY: wide ? -112 : ajar ? -36 : 0, x: "0%", opacity: 1 };
  }
  if (style === "slide") {
    return { x: wide ? "104%" : ajar ? "40%" : "0%", rotateY: 0, opacity: 1 };
  }
  return { opacity: wide ? 0 : ajar ? 0.22 : 1, x: "0%", rotateY: 0 };
};

function Door({
  workspace,
  accent,
  density,
  doorStyle,
  selected,
  ajar,
  wide,
  enter,
  arrive,
  delay,
  tabIndex,
  disabled,
  motionSafe,
  glimpseId,
  markId,
  age,
  nodeRef,
  onHover,
  onFocus,
  onBlur,
  onPress,
  onKey,
}: DoorProps) {
  const open = ajar || wide;
  const arrived = arrival(enter, arrive, delay, motionSafe);
  return (
    <motion.div
      ref={nodeRef}
      role="option"
      aria-selected={selected}
      aria-label={`${workspace.name}, ${ROLE_WORD[workspace.role]}, ${workspace.members} members, ${age.toLowerCase()}, ${PLAN_WORD[workspace.plan]} plan`}
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      layout={motionSafe ? "position" : false}
      initial={arrived.initial}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={arrived.transition}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onPress}
      onKeyDown={onKey}
      className={cn(
        "group flex min-w-0 flex-col rounded-3 p-1.5 text-left",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
      style={{ ["--wl-accent" as string]: accent }}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2 border bg-surface-0 transition-colors duration-200",
          selected
            ? "border-[color-mix(in_oklab,var(--wl-accent)_60%,var(--hairline-strong))]"
            : "border-hairline-strong",
        )}
        style={{ height: density.door, perspective: 640 }}
      >
        <Glimpse
          name={workspace.name}
          accent={accent}
          large={false}
          motionSafe={motionSafe}
          layoutId={glimpseId}
          className="absolute inset-0"
        />
        {/* The dark of the room behind the door, deepening as it opens. */}
        <motion.span
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_oklab,var(--ink)_28%,transparent),transparent_60%)]"
          initial={false}
          animate={{ opacity: wide ? 0 : ajar ? 1 : 0 }}
          transition={{ duration: durations.fast }}
        />
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center border-r border-hairline-strong bg-surface-2 [backface-visibility:hidden]"
          style={{ transformOrigin: "left center" }}
          initial={false}
          animate={panelTarget(doorStyle, ajar, wide, motionSafe)}
          transition={
            motionSafe
              ? doorStyle === "fade"
                ? { duration: durations.base, ease: easings.enter }
                : {
                    ...springs.snap,
                    opacity: { duration: durations.fast },
                  }
              : { duration: durations.fast }
          }
        >
          <span
            className={cn(
              "font-semibold text-ink-2",
              density.door < 120 ? "text-base" : "text-lg",
            )}
          >
            {initialsOf(workspace.name)}
          </span>
          <span
            aria-hidden
            className="absolute top-1/2 right-2 size-1.5 -translate-y-1/2 rounded-full bg-ink-3"
          />
          <span
            aria-hidden
            className="absolute inset-x-3 top-2 h-px bg-hairline-strong"
          />
          <span
            aria-hidden
            className="absolute inset-x-3 bottom-2 h-px bg-hairline-strong"
          />
        </motion.div>
        <span
          className={cn(
            "absolute top-1.5 left-1.5 rounded-1 border border-hairline bg-card px-1 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase transition-opacity duration-150",
            open && "opacity-0",
          )}
        >
          {PLAN_WORD[workspace.plan]}
        </span>
      </div>
      <div className="mt-2 flex min-w-0 flex-col gap-0.5 px-0.5">
        <p className={cn("truncate font-medium text-foreground", density.name)}>
          {workspace.name}
        </p>
        <p className={cn("truncate text-ink-3", density.meta)}>
          {ROLE_WORD[workspace.role]} · {workspace.members}
        </p>
        <p
          className={cn(
            "truncate text-ink-3",
            density.meta,
            density.door < 120 && "hidden @min-[30rem]:block",
          )}
        >
          {age}
        </p>
      </div>
      <div className="relative mt-1.5 h-0.5 w-full">
        {selected ? (
          <motion.span
            aria-hidden
            layoutId={markId}
            transition={springs.snap}
            className="absolute inset-x-0.5 top-0 h-0.5 rounded-full bg-(--wl-accent)"
          />
        ) : null}
      </div>
    </motion.div>
  );
}

function CreateDoor({
  density,
  arrive,
  delay,
  selected,
  tabIndex,
  disabled,
  motionSafe,
  markId,
  nodeRef,
  onFocus,
  onPress,
  onKey,
}: {
  density: DensitySpec;
  arrive: boolean;
  delay: number;
  selected: boolean;
  tabIndex: number;
  disabled: boolean;
  motionSafe: boolean;
  markId: string | undefined;
  nodeRef: (node: HTMLDivElement | null) => void;
  onFocus: () => void;
  onPress: () => void;
  onKey: (event: React.KeyboardEvent) => void;
}) {
  const arrived = arrival(false, arrive, delay, motionSafe);
  return (
    <motion.div
      ref={nodeRef}
      role="option"
      aria-selected={selected}
      aria-label="Create a workspace"
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      layout={motionSafe ? "position" : false}
      initial={arrived.initial}
      animate={{ opacity: 1, y: 0 }}
      transition={arrived.transition}
      onFocus={onFocus}
      onClick={onPress}
      onKeyDown={onKey}
      className={cn(
        "group flex min-w-0 flex-col rounded-3 p-1.5 text-left",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <div
        className="relative flex w-full items-center justify-center overflow-hidden rounded-2 border border-dashed border-hairline-strong bg-surface-0 transition-colors duration-200 group-hover:bg-surface-1"
        style={{ height: density.door }}
      >
        <motion.span
          className="flex size-7 items-center justify-center rounded-full border border-hairline-strong bg-card text-ink-2"
          whileHover={motionSafe && !disabled ? { scale: 1.08 } : undefined}
          whileTap={motionSafe && !disabled ? { scale: 0.94 } : undefined}
          transition={springs.flick}
        >
          <Plus aria-hidden className="size-3.5" />
        </motion.span>
      </div>
      <div className="mt-2 flex min-w-0 flex-col gap-0.5 px-0.5">
        <p className={cn("truncate font-medium text-foreground", density.name)}>
          New workspace
        </p>
        <p className={cn("truncate text-ink-3", density.meta)}>
          Start from scratch
        </p>
      </div>
      <div className="relative mt-1.5 h-0.5 w-full">
        {selected ? (
          <motion.span
            aria-hidden
            layoutId={markId}
            transition={springs.snap}
            className="absolute inset-x-0.5 top-0 h-0.5 rounded-full bg-ink-3"
          />
        ) : null}
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Envelope                                 */
/* ----------------------------------------------------------------------- */

function Envelope({
  invitation,
  accent,
  active,
  disabled,
  motionSafe,
  nodeRef,
  onFocus,
  onAccept,
  onDecline,
  onKey,
}: {
  invitation: LobbyInvitation;
  accent: string;
  active: boolean;
  disabled: boolean;
  motionSafe: boolean;
  nodeRef: (kind: "accept" | "decline", node: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onKey: (event: React.KeyboardEvent, kind: "accept" | "decline") => void;
}) {
  return (
    <motion.li
      layout={motionSafe ? "position" : false}
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        layout: springs.glide,
        y: springs.glide,
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      className="flex min-w-0 items-center gap-2.5 rounded-2 border border-hairline bg-surface-1 p-2"
      style={{ ["--wl-accent" as string]: accent }}
    >
      <span
        aria-hidden
        className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-2 bg-[color-mix(in_oklab,var(--wl-accent)_14%,transparent)] text-(--wl-accent)"
      >
        <Mail className="size-4" />
        <span className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-surface-1 bg-(--wl-accent)" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-foreground">
          {invitation.workspaceName}
        </p>
        <p className="truncate text-[11px] text-ink-3">
          from {invitation.invitedBy} · {ROLE_WORD[invitation.role]} ·{" "}
          {invitation.members}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          ref={(node) => nodeRef("accept", node)}
          type="button"
          tabIndex={active ? 0 : -1}
          aria-disabled={disabled || undefined}
          aria-label={`Accept the invitation to ${invitation.workspaceName}`}
          onFocus={onFocus}
          onClick={onAccept}
          onKeyDown={(event) => onKey(event, "accept")}
          className={cn(
            "inline-flex h-7 items-center rounded-2 px-2 text-[11px] font-medium transition-colors",
            disabled
              ? "cursor-not-allowed text-ink-3"
              : "bg-primary text-primary-foreground hover:opacity-90",
            FOCUS_RING,
          )}
        >
          Accept
        </button>
        <button
          ref={(node) => nodeRef("decline", node)}
          type="button"
          tabIndex={active ? 0 : -1}
          aria-disabled={disabled || undefined}
          aria-label={`Decline the invitation to ${invitation.workspaceName}`}
          onFocus={onFocus}
          onClick={onDecline}
          onKeyDown={(event) => onKey(event, "decline")}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors",
            disabled
              ? "cursor-not-allowed"
              : "hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Remember switch                             */
/* ----------------------------------------------------------------------- */

function RememberSwitch({
  on,
  disabled,
  motionSafe,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  motionSafe: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      onClick={onToggle}
      className={cn(
        "flex h-7 shrink-0 items-center gap-2 rounded-2 px-1.5 text-[11px] text-ink-2 transition-colors",
        disabled ? "cursor-not-allowed" : "hover:text-foreground",
        FOCUS_RING,
      )}
    >
      <span className="hidden @min-[24rem]:inline">Remember this choice</span>
      <span className="@min-[24rem]:hidden">Remember</span>
      <span
        aria-hidden
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full border transition-colors duration-200",
          on
            ? "border-transparent bg-primary"
            : "border-hairline-strong bg-surface-2",
        )}
      >
        <motion.span
          className={cn(
            "absolute top-[2px] left-0 size-[10px] rounded-full",
            on ? "bg-primary-foreground" : "bg-ink-3",
          )}
          initial={false}
          animate={{ x: on ? 15 : 3 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A post-sign-in workspace chooser drawn as a lobby. Each workspace stands as
 * a door in a row; hovering or focusing one opens it a crack on
 * `springs.snap` — a turn on its hinge, a slide aside, or a fade — to show a
 * glimpse of the workspace behind it, a mini dashboard in its own colour.
 * Pressing a door swings it wide; after a beat the lobby slides away on
 * `exitFor` while the glimpse grows into the whole surface on
 * `springs.glide`, an Opening bar runs for `openDelay`, and the workspace
 * reads as ready with a check drawn on `springs.flick`. Pending invitations
 * sit as envelopes on a side table: Accept lands a new door in the row on
 * `springs.recoil`, Decline fades the envelope out. A plain door with a plus
 * creates a workspace, and a switch remembers the choice.
 *
 * The doors are one listbox (arrows move, Enter or Space opens, Home/End), the
 * envelopes are a list with one tabbable row (Up/Down move between them), the
 * switch is a switch, and Escape from an opening workspace returns to the
 * lobby. Under reduced motion nothing turns or travels: doors cross-fade
 * open, the glimpse cross-fades in at full size, and the selection mark is
 * placed instantly.
 */
export function WorkspaceLobby({
  doorStyle = "hinge",
  density = "cozy",
  accent = "workspace",
  workspaces = defaultLobbyWorkspaces,
  invitations = defaultLobbyInvitations,
  value,
  defaultValue,
  onChange,
  onOpen,
  onReady,
  onAccept,
  onDecline,
  onCreate,
  remember,
  defaultRemember = false,
  onRememberChange,
  openDelay = 1400,
  now = defaultLobbyNow,
  status = "ready",
  onRetry,
  title = "Choose a workspace",
  signedInAs = "ines@coldbrook.app",
  label,
  height = 540,
  disabled = false,
  className,
}: WorkspaceLobbyProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const doorsId = `${uid}-doors`;
  const tableId = `${uid}-table`;

  const spec = DENSITY[density] ?? DENSITY.cozy;
  const ready = status === "ready";
  const inert = disabled || !ready;

  /* -------------------------------- state ------------------------------ */

  const [ownValue, setOwnValue] = React.useState<string | null>(
    defaultValue === undefined ? (workspaces[0]?.id ?? null) : defaultValue,
  );
  const chosen = value === undefined ? ownValue : value;

  const [ownRemember, setOwnRemember] = React.useState(defaultRemember);
  const remembered = remember ?? ownRemember;

  // Doors that arrived from envelopes, and envelopes already answered.
  const [accepted, setAccepted] = React.useState<LobbyWorkspace[]>([]);
  const [handled, setHandled] = React.useState<string[]>([]);
  const [fresh, setFresh] = React.useState<string | null>(null);

  const [phase, setPhase] = React.useState<LobbyPhase>("lobby");
  const [opening, setOpening] = React.useState<LobbyWorkspace | null>(null);
  const [swing, setSwing] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);
  const [activeInv, setActiveInv] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [focusReq, setFocusReq] = React.useState<{
    target: "door" | "panel" | "accept" | "decline";
    id: string;
    seq: number;
  } | null>(null);

  // False for the server render and hydration, so doors already on the page
  // never fade in; true for doors that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const doorNodes = React.useRef(new Map<string, HTMLDivElement>());
  const invNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const timers = React.useRef<number[]>([]);

  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
  };
  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };
  React.useEffect(() => clearTimers, []);

  /* -------------------------------- data ------------------------------- */

  const doors: LobbyWorkspace[] = [
    ...workspaces,
    ...accepted.filter((a) => !workspaces.some((w) => w.id === a.id)),
  ];
  const pending = invitations.filter(
    (inv) =>
      !handled.includes(inv.id) && !doors.some((d) => d.id === inv.workspaceId),
  );
  const optionIds = [...doors.map((d) => d.id), CREATE_ID];
  const activeOption =
    chosen && optionIds.includes(chosen) ? chosen : (optionIds[0] ?? null);
  const activeEnvelope =
    activeInv && pending.some((p) => p.id === activeInv)
      ? activeInv
      : (pending[0]?.id ?? null);

  const byId = (id: string | null) =>
    id === null ? null : (doors.find((d) => d.id === id) ?? null);

  /* ------------------------------- changes ----------------------------- */

  const select = (id: string | null) => {
    if (id === chosen) return;
    if (value === undefined) setOwnValue(id);
    onChange?.(id, byId(id));
  };

  const requestFocus = (
    target: "door" | "panel" | "accept" | "decline",
    id: string,
  ) => setFocusReq((f) => ({ target, id, seq: (f?.seq ?? 0) + 1 }));

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const node =
      focusReq.target === "door"
        ? doorNodes.current.get(focusReq.id)
        : focusReq.target === "panel"
          ? panelRef.current
          : invNodes.current.get(`${focusReq.id}:${focusReq.target}`);
    node?.focus({ preventScroll: focusReq.target !== "door" });
  }, [focusReq]);

  const openDoor = (workspace: LobbyWorkspace) => {
    if (inert || phase !== "lobby") return;
    clearTimers();
    select(workspace.id);
    setFresh(null);
    setHovered(null);
    onOpen?.(workspace);
    setAnnouncement(`Opening ${workspace.name}.`);
    const begin = () => {
      setSwing(null);
      setOpening(workspace);
      setPhase("opening");
      requestFocus("panel", workspace.id);
      later(Math.max(0, openDelay), () => {
        setPhase("open");
        onReady?.(workspace);
        setAnnouncement(
          `${workspace.name} is open.${remembered ? " It will open first next time." : ""}`,
        );
      });
    };
    if (motionSafe) {
      setSwing(workspace.id);
      later(SWING_MS, begin);
    } else {
      begin();
    }
  };

  const backToLobby = () => {
    clearTimers();
    const id = opening?.id ?? activeOption;
    setPhase("lobby");
    setOpening(null);
    setSwing(null);
    setAnnouncement("Back in the lobby.");
    if (id) requestFocus("door", id);
  };

  const create = () => {
    if (inert) return;
    select(CREATE_ID);
    onCreate?.();
    setAnnouncement("Create a workspace.");
  };

  const toggleRemember = () => {
    if (inert) return;
    const next = !remembered;
    if (remember === undefined) setOwnRemember(next);
    onRememberChange?.(next);
    setAnnouncement(
      next
        ? "This choice will be remembered."
        : "This choice will be asked again.",
    );
  };

  const nextEnvelopeAfter = (id: string) => {
    const i = pending.findIndex((p) => p.id === id);
    const rest = pending.filter((p) => p.id !== id);
    return rest[clamp(i, 0, rest.length - 1)] ?? null;
  };

  const accept = (inv: LobbyInvitation) => {
    if (inert) return;
    const workspace = toWorkspace(inv);
    setHandled((h) => [...h, inv.id]);
    setAccepted((a) =>
      a.some((w) => w.id === workspace.id) ? a : [...a, workspace],
    );
    setFresh(workspace.id);
    onAccept?.(inv, workspace);
    setAnnouncement(
      `Joined ${workspace.name} as ${ROLE_WORD[workspace.role].toLowerCase()}. It is a door in the lobby now.`,
    );
    const next = nextEnvelopeAfter(inv.id);
    if (next) requestFocus("accept", next.id);
    else requestFocus("door", workspace.id);
  };

  const decline = (inv: LobbyInvitation) => {
    if (inert) return;
    setHandled((h) => [...h, inv.id]);
    onDecline?.(inv);
    setAnnouncement(`Declined the invitation to ${inv.workspaceName}.`);
    const next = nextEnvelopeAfter(inv.id);
    if (next) requestFocus("decline", next.id);
    else if (activeOption) requestFocus("door", activeOption);
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onDoorKey = (event: React.KeyboardEvent, id: string) => {
    const i = optionIds.indexOf(id);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = optionIds.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (id === CREATE_ID) create();
      else {
        const ws = byId(id);
        if (ws) openDoor(ws);
      }
      return;
    } else return;
    event.preventDefault();
    const target = optionIds[clamp(to, 0, optionIds.length - 1)];
    if (target) doorNodes.current.get(target)?.focus();
  };

  const onEnvelopeKey = (
    event: React.KeyboardEvent,
    id: string,
    kind: "accept" | "decline",
  ) => {
    const i = pending.findIndex((p) => p.id === id);
    let to = -1;
    let side = kind;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = pending.length - 1;
    else if (event.key === "ArrowRight") {
      to = i;
      side = "decline";
    } else if (event.key === "ArrowLeft") {
      to = i;
      side = "accept";
    } else return;
    event.preventDefault();
    const target = pending[clamp(to, 0, pending.length - 1)];
    if (target) invNodes.current.get(`${target.id}:${side}`)?.focus();
  };

  const onPanelKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      backToLobby();
    }
  };

  /* ------------------------------- render ------------------------------ */

  const openingAccent = opening
    ? accentOf(opening.hue, accent)
    : "var(--accent-bright)";
  const glimpseIdFor = (id: string) =>
    motionSafe ? `${uid}-glimpse-${id}` : undefined;
  const markId = motionSafe ? `${uid}-mark` : undefined;
  // Doors mounting after hydration (a reload, or the lobby sliding back in)
  // arrive in a cascade; doors already on the page at hydration never fade.
  const step = cascade(Math.min(doors.length + 1, 8));

  const lobbyEmpty = doors.length === 0;

  const doorsList = (
    <div
      id={doorsId}
      role="listbox"
      aria-label="Workspaces"
      aria-disabled={inert || undefined}
      className={cn("grid", spec.gap)}
      style={{
        gridTemplateColumns: lobbyEmpty
          ? `repeat(auto-fill, minmax(${spec.column}, 9rem))`
          : `repeat(auto-fill, minmax(${spec.column}, 1fr))`,
        justifyContent: lobbyEmpty ? "center" : undefined,
      }}
    >
      <AnimatePresence initial={false}>
        {doors.map((ws, i) => {
          const hue = accentOf(ws.hue, accent);
          return (
            <Door
              key={ws.id}
              workspace={ws}
              accent={hue}
              density={spec}
              doorStyle={doorStyle}
              selected={chosen === ws.id}
              ajar={
                swing === null &&
                !inert &&
                (hovered === ws.id || focused === ws.id)
              }
              wide={swing === ws.id}
              enter={fresh === ws.id}
              arrive={live && fresh !== ws.id}
              delay={r3(i * step)}
              tabIndex={activeOption === ws.id ? 0 : -1}
              disabled={inert}
              motionSafe={motionSafe}
              glimpseId={glimpseIdFor(ws.id)}
              markId={markId}
              age={ageOf(ws.lastOpenedAt, now)}
              nodeRef={(node) => {
                if (node) doorNodes.current.set(ws.id, node);
                else doorNodes.current.delete(ws.id);
              }}
              onHover={(on) =>
                setHovered((h) => (on ? ws.id : h === ws.id ? null : h))
              }
              onFocus={() => {
                setFocused(ws.id);
                if (!inert) select(ws.id);
              }}
              onBlur={() => setFocused((f) => (f === ws.id ? null : f))}
              onPress={() => openDoor(ws)}
              onKey={(event) => onDoorKey(event, ws.id)}
            />
          );
        })}
        <CreateDoor
          key={CREATE_ID}
          density={spec}
          arrive={live}
          delay={r3(doors.length * step)}
          selected={chosen === CREATE_ID}
          tabIndex={activeOption === CREATE_ID ? 0 : -1}
          disabled={inert}
          motionSafe={motionSafe}
          markId={markId}
          nodeRef={(node) => {
            if (node) doorNodes.current.set(CREATE_ID, node);
            else doorNodes.current.delete(CREATE_ID);
          }}
          onFocus={() => {
            setFocused(CREATE_ID);
            if (!inert) select(CREATE_ID);
          }}
          onPress={create}
          onKey={(event) => onDoorKey(event, CREATE_ID)}
        />
      </AnimatePresence>
    </div>
  );

  const sideTable = (
    <section
      aria-labelledby={tableId}
      className="flex min-w-0 flex-col gap-2 border-t border-hairline px-4 pt-3 pb-4 @min-[52rem]:w-64 @min-[52rem]:shrink-0 @min-[52rem]:border-t-0 @min-[52rem]:border-l @min-[52rem]:pt-4"
    >
      <p
        id={tableId}
        className="flex items-baseline justify-between font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        <span>Side table</span>
        <span className="tabular-nums">
          {pending.length} {pending.length === 1 ? "invitation" : "invitations"}
        </span>
      </p>
      {pending.length === 0 ? (
        <p className="rounded-2 border border-dashed border-hairline px-3 py-3 text-[11px] text-ink-3">
          No invitations waiting.
        </p>
      ) : (
        <ul
          role="list"
          aria-label="Pending invitations"
          className="flex flex-col gap-1.5 @min-[40rem]:grid @min-[40rem]:grid-cols-2 @min-[52rem]:flex"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {pending.map((inv) => (
              <Envelope
                key={inv.id}
                invitation={inv}
                accent={accentOf(inv.hue, accent)}
                active={activeEnvelope === inv.id}
                disabled={inert}
                motionSafe={motionSafe}
                nodeRef={(kind, node) => {
                  const key = `${inv.id}:${kind}`;
                  if (node) invNodes.current.set(key, node);
                  else invNodes.current.delete(key);
                }}
                onFocus={() => setActiveInv(inv.id)}
                onAccept={() => accept(inv)}
                onDecline={() => decline(inv)}
                onKey={(event, kind) => onEnvelopeKey(event, inv.id, kind)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={status === "loading" || phase === "opening" || undefined}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {signedInAs}
            {ready ? (
              <span className="hidden @min-[30rem]:inline">
                {" "}
                · {doors.length}{" "}
                {doors.length === 1 ? "workspace" : "workspaces"}
              </span>
            ) : null}
          </p>
        </div>
        <RememberSwitch
          on={remembered}
          disabled={inert}
          motionSafe={motionSafe}
          onToggle={toggleRemember}
        />
      </header>

      <div className="relative min-h-0 flex-1 border-t border-hairline">
        {status === "loading" ? (
          <div aria-hidden className="flex h-full flex-col">
            <div
              className={cn("grid px-4 pt-4", spec.gap)}
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${spec.column}, 1fr))`,
              }}
            >
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex flex-col gap-2 p-1.5">
                  <span
                    className="w-full rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    style={{
                      height: spec.door,
                      animationDelay: `${i * 90}ms`,
                    }}
                  />
                  <span className="h-3 w-3/4 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                  <span className="h-2.5 w-1/2 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-1.5 border-t border-hairline px-4 pt-3">
              {Array.from({ length: 2 }, (_, i) => (
                <span
                  key={i}
                  className="h-12 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${360 + i * 110}ms` }}
                />
              ))}
            </div>
          </div>
        ) : status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The lobby didn&apos;t load.
            </p>
            <p className="max-w-xs text-[12px] text-ink-3">
              Your workspaces and invitations could not be fetched.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(BUTTON, "text-foreground", FOCUS_RING)}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : (
          <LayoutGroup id={uid}>
            <AnimatePresence initial={false}>
              {phase === "lobby" ? (
                <motion.div
                  key="lobby"
                  initial={{
                    opacity: 0,
                    x: motionSafe ? -distances.shift : 0,
                  }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: motionSafe ? -distances.shift : 0,
                    transition: exitFor(durations.base),
                  }}
                  transition={{
                    x: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }}
                  className="absolute inset-0 flex flex-col overflow-x-hidden overflow-y-auto overscroll-contain @min-[52rem]:flex-row"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 pt-4 pb-4">
                    {lobbyEmpty ? (
                      <div className="flex flex-col items-center gap-3 pt-2 pb-1 text-center">
                        <DoorOpen aria-hidden className="size-5 text-ink-3" />
                        <div>
                          <p className="text-sm text-foreground">
                            No workspaces yet
                          </p>
                          <p className="mt-0.5 text-[12px] text-ink-3">
                            Create one, or accept an invitation from the side
                            table.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="flex items-baseline justify-between font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                        <span>Doors</span>
                        <span className="hidden @min-[24rem]:inline">
                          Hover to peek · press to enter
                        </span>
                      </p>
                    )}
                    {doorsList}
                  </div>
                  {sideTable}
                </motion.div>
              ) : opening ? (
                <motion.div
                  key="open"
                  ref={panelRef}
                  tabIndex={-1}
                  role="group"
                  aria-label={`${opening.name}, ${phase === "open" ? "open" : "opening"}`}
                  onKeyDown={onPanelKey}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                  className={cn(
                    "absolute inset-0 flex flex-col",
                    FOCUS_RING,
                    "focus-visible:outline-offset-[-2px]",
                  )}
                  style={{ ["--wl-accent" as string]: openingAccent }}
                >
                  <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3">
                    <button
                      type="button"
                      onClick={backToLobby}
                      className={cn(BUTTON, "pl-1.5", FOCUS_RING)}
                    >
                      <ChevronLeft aria-hidden className="size-3.5" />
                      Lobby
                    </button>
                    <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      <span className="hidden @min-[24rem]:inline">
                        {ROLE_WORD[opening.role]} · {opening.members} members
                      </span>
                      <span className="rounded-1 border border-hairline px-1 py-px">
                        {PLAN_WORD[opening.plan]}
                      </span>
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 px-4 pt-3">
                    <Glimpse
                      name={opening.name}
                      accent={openingAccent}
                      large
                      motionSafe={motionSafe}
                      layoutId={glimpseIdFor(opening.id)}
                      className="h-full w-full rounded-3 border border-hairline-strong"
                    />
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 px-4 pt-3 pb-4">
                    <AnimatePresence initial={false} mode="wait">
                      {phase === "open" ? (
                        <motion.div
                          key="done"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={{
                            duration: durations.base,
                            ease: easings.enter,
                          }}
                          className="flex items-center gap-2.5"
                        >
                          <motion.span
                            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-(--wl-accent) text-primary-foreground"
                            initial={motionSafe ? { scale: 0.6 } : false}
                            animate={{ scale: 1 }}
                            transition={springs.recoil}
                          >
                            <svg
                              aria-hidden
                              viewBox="0 0 14 14"
                              className="size-3.5"
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
                                transition={
                                  motionSafe
                                    ? {
                                        ...springs.flick,
                                        delay: durations.blink,
                                      }
                                    : { duration: 0 }
                                }
                              />
                            </svg>
                          </motion.span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-foreground">
                              {opening.name} is open
                            </p>
                            <p className="truncate text-[11px] text-ink-3">
                              {remembered
                                ? "It will open first next time you sign in."
                                : "You will be asked again next time."}
                            </p>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="progress"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={{
                            duration: durations.base,
                            ease: easings.enter,
                          }}
                          className="flex flex-col gap-2"
                        >
                          <p className="flex items-baseline justify-between gap-3 text-[12px] text-ink-2">
                            <span className="truncate">
                              Opening {opening.name}&hellip;
                            </span>
                            <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                              {motionSafe ? "Loading" : "Please wait"}
                            </span>
                          </p>
                          {motionSafe ? (
                            <span
                              aria-hidden
                              className="block h-1 w-full overflow-hidden rounded-full bg-surface-2"
                            >
                              <motion.span
                                className="block h-full w-full rounded-full bg-(--wl-accent)"
                                style={{ originX: 0 }}
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                transition={{
                                  duration: Math.max(0, openDelay) / 1000,
                                  ease: easings.move,
                                }}
                              />
                            </span>
                          ) : null}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </LayoutGroup>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
