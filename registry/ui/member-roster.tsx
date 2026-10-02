"use client";

import * as React from "react";

import {
  ChevronDown,
  CircleAlert,
  Mail,
  RotateCw,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useIsPresent,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import {
  panFrom,
  useTactileSound,
  type TactileTone,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type RosterRole = {
  id: string;
  /** One word: the chip, the menu, the segment. */
  name: string;
  /** One sentence of what the role can do; the confirm repeats it. */
  description: string;
  /** The chip's colour, any CSS colour. @default "var(--accent-bright)" */
  tint?: string;
};

export type RosterMember = {
  id: string;
  name: string;
  email: string;
  /** A role's id from `roleSet`. */
  role: string;
  /** When they were last active, in ms. Dated against `now`. */
  lastActive?: number;
  /** The person looking at the panel: they cannot remove themselves. */
  you?: boolean;
};

export type RosterInvite = {
  id: string;
  email: string;
  /** The role they will join with. */
  role: string;
  /** When it was sent, in ms. */
  sentAt: number;
};

export type RosterDensity = "compact" | "cozy" | "roomy";
export type RosterInviteMode = "inline" | "drawer" | "off";
export type RosterRoleControl = "menu" | "segmented";
export type RosterStatus = "ready" | "loading" | "error";

export type MemberRosterProps = {
  /** Controlled members. */
  members?: RosterMember[];
  /** Initial members when uncontrolled. @default defaultRosterMembers */
  defaultMembers?: RosterMember[];
  /** Fires from the confirm that changed a role or removed someone, with every member. */
  onMembersChange?: (members: RosterMember[]) => void;
  /** Controlled pending invites. */
  invites?: RosterInvite[];
  /** Initial pending invites when uncontrolled. @default defaultRosterInvites */
  defaultInvites?: RosterInvite[];
  /** Fires when invites are sent or revoked, with every pending invite. */
  onInvitesChange?: (invites: RosterInvite[]) => void;
  /** The roles a member can hold, most powerful first. A role with id "owner" can never be left without someone in it. @default defaultRosterRoles */
  roleSet?: RosterRole[];
  /** The moment "last active" and "sent" are dated against, as a Date or ms. @default defaultRosterNow */
  now?: Date | number;
  /** How many seats the plan has; members and pending invites both take one. @default 10 */
  seats?: number;
  /** How long Resend waits before it can be pressed again, in seconds. @default 30 */
  cooldown?: number;
  /** The workspace's name, for the heading and the confirms. @default "Basinworks" */
  workspace?: string;
  /** A role change was confirmed. */
  onRoleChange?: (memberId: string, role: string, previous: string) => void;
  /** A removal was confirmed. */
  onRemove?: (memberId: string) => void;
  /** Invites were sent, all with one role. */
  onInvite?: (emails: string[], role: string) => void;
  /** An invite was sent again. */
  onResend?: (inviteId: string) => void;
  /** An invite was withdrawn. */
  onRevoke?: (inviteId: string) => void;
  /** Row height, avatar size and type. @default "cozy" */
  density?: RosterDensity;
  /** The invite field: always shown, behind an Invite button that glides it open, or not offered. @default "inline" */
  invite?: RosterInviteMode;
  /** How a role is changed: a menu of roles with what each can do, or a segmented control in the row (a menu on a phone). Both confirm first. @default "menu" */
  roles?: RosterRoleControl;
  /** Loading draws placeholder rows; error offers Retry. @default "ready" */
  status?: RosterStatus;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** The region's accessible name. @default "Members of" and the workspace */
  label?: string;
  /** Play the pops and clicks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- defaults -------------------------------- */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Wednesday 30 September 2026, 11:00 UTC. */
export const defaultRosterNow = Date.UTC(2026, 8, 30, 11, 0);
const before = (ms: number) => defaultRosterNow - ms;

export const defaultRosterRoles: RosterRole[] = [
  {
    id: "owner",
    name: "Owner",
    description: "Full control, including billing and deleting the workspace.",
    tint: "var(--warn)",
  },
  {
    id: "admin",
    name: "Admin",
    description: "Manages members, invites and every setting except billing.",
    tint: "var(--accent-bright)",
  },
  {
    id: "member",
    name: "Member",
    description: "Works in every project they are added to.",
    tint: "var(--success)",
  },
  {
    id: "viewer",
    name: "Viewer",
    description: "Reads and comments, never edits.",
    tint: "var(--ink-2)",
  },
];

export const defaultRosterMembers: RosterMember[] = [
  {
    id: "m1",
    name: "Mira Okonjo",
    email: "mira@basinworks.io",
    role: "owner",
    lastActive: before(30_000),
    you: true,
  },
  {
    id: "m2",
    name: "Tobias Lind",
    email: "tobias@basinworks.io",
    role: "admin",
    lastActive: before(2 * HOUR),
  },
  {
    id: "m3",
    name: "Priya Raman",
    email: "priya@basinworks.io",
    role: "member",
    lastActive: before(12 * MIN),
  },
  {
    id: "m4",
    name: "Eli Navarro",
    email: "eli@basinworks.io",
    role: "member",
    lastActive: before(DAY + 3 * HOUR),
  },
  {
    id: "m5",
    name: "Sanne de Wit",
    email: "sanne@basinworks.io",
    role: "admin",
    lastActive: before(3 * DAY),
  },
  {
    id: "m6",
    name: "Ines Duarte",
    email: "ines@basinworks.io",
    role: "member",
    lastActive: before(5 * HOUR),
  },
  {
    id: "m7",
    name: "Kofi Mensah",
    email: "kofi@fernworks.io",
    role: "viewer",
    lastActive: before(16 * DAY),
  },
];

export const defaultRosterInvites: RosterInvite[] = [
  {
    id: "i1",
    email: "rafael@basinworks.io",
    role: "member",
    sentAt: before(2 * DAY),
  },
  {
    id: "i2",
    email: "jun@gaugeworks.io",
    role: "viewer",
    sentAt: before(5 * HOUR),
  },
];

/* -------------------------------- helpers -------------------------------- */

const PHONE = 600;
const DESKTOP = 1040;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const TINTS = [
  "var(--accent-bright)",
  "var(--signal)",
  "var(--warn)",
  "var(--success)",
  "var(--danger)",
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Ends a sentence once, even when the words it quotes already end in a full stop. */
const sentence = (text: string) =>
  /[.!?…]["”’)]?$/.test(text.trim()) ? text : `${text}.`;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const toMs = (now: Date | number | undefined) =>
  now === undefined
    ? defaultRosterNow
    : typeof now === "number"
      ? now
      : now.getTime();

/** "active now", "12 min ago", "2 hr ago", "yesterday", "3 days ago", "2 weeks ago". */
function ago(at: number | undefined, now: number): string {
  if (at === undefined) return "never";
  const d = Math.max(0, now - at);
  if (d < 2 * MIN) return "now";
  if (d < HOUR) return `${Math.round(d / MIN)} min ago`;
  if (d < DAY) return `${Math.round(d / HOUR)} hr ago`;
  if (d < 2 * DAY) return "yesterday";
  if (d < 14 * DAY) return `${Math.floor(d / DAY)} days ago`;
  return `${Math.floor(d / (7 * DAY))} weeks ago`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

type DensitySpec = {
  row: string;
  avatar: number;
  name: string;
  meta: string;
};

const DENSITY: Record<RosterDensity, DensitySpec> = {
  compact: {
    row: "py-1.5",
    avatar: 24,
    name: "text-[12px]",
    meta: "text-[11px]",
  },
  cozy: { row: "py-2.5", avatar: 28, name: "text-[13px]", meta: "text-[12px]" },
  roomy: { row: "py-3.5", avatar: 34, name: "text-sm", meta: "text-[12px]" },
};

type Play = (
  tone: TactileTone,
  pitch: number,
  el?: Element | null,
  gain?: number,
) => void;

function Avatar({
  name,
  id,
  size,
}: {
  name: string;
  id: string;
  size: number;
}) {
  const tint = TINTS[hash(id) % TINTS.length] ?? "var(--accent-bright)";
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        color: tint,
        background: `color-mix(in oklab, ${tint} 16%, transparent)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

function RoleChip({
  role,
  motionSafe,
}: {
  role: RosterRole | undefined;
  motionSafe: boolean;
}) {
  const tint = role?.tint ?? "var(--accent-bright)";
  return (
    <span
      className="relative inline-flex h-6 items-center overflow-clip rounded-full px-2 text-[12px] font-medium transition-colors"
      style={{
        color: tint,
        background: `color-mix(in oklab, ${tint} 14%, transparent)`,
      }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={role?.id ?? "none"}
          className="inline-block whitespace-nowrap"
          initial={{ y: motionSafe ? "110%" : 0, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{
            y: motionSafe ? "-110%" : 0,
            opacity: 0,
            transition: exitFor(durations.fast),
          }}
          transition={{
            y: motionSafe ? springs.snap : { duration: 0 },
            opacity: { duration: durations.fast, ease: easings.enter },
          }}
        >
          {role?.name ?? "No role"}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------ role controls ----------------------------- */

type ControlProps = {
  member: RosterMember;
  roleSet: RosterRole[];
  /** The role waiting on a confirm, if any. */
  pending: string | null;
  locked: string | null;
  open: boolean;
  motionSafe: boolean;
  disabled: boolean;
  bind: (node: HTMLElement | null) => void;
  onOpen: (open: boolean) => void;
  onChoose: (role: string, focusConfirm: boolean) => void;
  scrollerRect: () => DOMRect | null;
  play: Play;
};

/** The role cell as a menu: a chip that opens the roles and what each can do. */
function RoleMenu({
  member,
  roleSet,
  pending,
  locked,
  open,
  motionSafe,
  disabled,
  bind,
  onOpen,
  onChoose,
  scrollerRect,
  play,
}: ControlProps) {
  const uid = React.useId();
  const menuId = `${uid}-menu`;
  const role = roleSet.find((r) => r.id === member.role);
  const [active, setActive] = React.useState(0);
  const [up, setUp] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const items = React.useRef(new Map<number, HTMLDivElement>());

  // Opens downward unless the scroller's foot is closer than the menu is tall.
  React.useLayoutEffect(() => {
    if (!open) return;
    const b = buttonRef.current?.getBoundingClientRect();
    const box = scrollerRect();
    const h = menuRef.current?.offsetHeight ?? 200;
    setUp(
      !!b && !!box && b.bottom + h + 8 > box.bottom && b.top - h - 8 > box.top,
    );
    const at = Math.max(
      0,
      roleSet.findIndex((r) => r.id === (pending ?? member.role)),
    );
    setActive(at);
    items.current.get(at)?.focus({ preventScroll: true });
    // Measured once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (i: number) => {
    const r = roleSet[i];
    if (!r) return;
    onOpen(false);
    onChoose(r.id, true);
  };

  return (
    <div className="relative inline-flex">
      <button
        ref={(node) => {
          buttonRef.current = node;
          bind(node);
        }}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={
          locked
            ? `Role: ${role?.name ?? "none"}. ${locked}`
            : `Role: ${role?.name ?? "none"}. Change ${member.name}'s role`
        }
        aria-disabled={locked ? true : undefined}
        title={locked ?? undefined}
        disabled={disabled}
        onClick={(event) => {
          if (locked) return;
          play("click", open ? 0.9 : 1.1, event.currentTarget);
          onOpen(!open);
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-2 pr-1.5 pl-1 transition-colors disabled:cursor-not-allowed",
          locked ? "cursor-not-allowed" : "hover:bg-surface-2",
          FOCUS_RING,
        )}
      >
        <RoleChip role={role} motionSafe={motionSafe} />
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3.5 text-ink-3 transition-transform",
            open && "rotate-180",
            locked && "opacity-0",
          )}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Role for ${member.name}`}
            data-roster-popover=""
            initial={{
              opacity: 0,
              y: motionSafe ? (up ? distances.nudge : -distances.nudge) : 0,
            }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              opacity: { duration: durations.fast, ease: easings.enter },
              y: motionSafe ? springs.snap : { duration: 0 },
            }}
            onKeyDown={(event) => {
              const n = roleSet.length;
              const go = (i: number) => {
                const next = (i + n) % n;
                setActive(next);
                items.current.get(next)?.focus();
                play("click", 1.4, items.current.get(next), 0.3);
              };
              if (event.key === "ArrowDown") {
                event.preventDefault();
                go(active + 1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                go(active - 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                go(0);
              } else if (event.key === "End") {
                event.preventDefault();
                go(n - 1);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                choose(active);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onOpen(false);
                buttonRef.current?.focus();
              } else if (event.key === "Tab") {
                onOpen(false);
              }
            }}
            className={cn(
              "absolute left-0 z-30 flex w-64 flex-col rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_12px_32px_color-mix(in_oklab,black_18%,transparent)]",
              up ? "bottom-full mb-1" : "top-full mt-1",
            )}
          >
            {roleSet.map((r, i) => {
              const on = r.id === member.role;
              return (
                <div
                  key={r.id}
                  ref={(node) => {
                    if (node) items.current.set(i, node);
                    else items.current.delete(i);
                  }}
                  role="menuitemradio"
                  aria-checked={on}
                  tabIndex={i === active ? 0 : -1}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-2 px-2 py-1.5",
                    i === active && "bg-cobalt-wash",
                    FOCUS_RING_IN,
                  )}
                >
                  <span
                    aria-hidden
                    className="mt-1.5 size-2 shrink-0 rounded-full"
                    style={{
                      background: on
                        ? (r.tint ?? "var(--accent-bright)")
                        : "transparent",
                      boxShadow: `inset 0 0 0 1.5px ${r.tint ?? "var(--accent-bright)"}`,
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-foreground">
                      {r.name}
                    </span>
                    <span className="block text-[11px] leading-snug text-ink-3">
                      {r.description}
                    </span>
                  </span>
                </div>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * The role cell as a segmented control. The thumb slides to a chosen role on
 * snap and waits there, dashed, until the change is confirmed or undone.
 */
function RoleSegments({
  member,
  roleSet,
  pending,
  locked,
  motionSafe,
  disabled,
  bind,
  onChoose,
  play,
}: ControlProps) {
  const target = pending ?? member.role;
  const x = useMotionValue(0);
  const w = useMotionValue(0);
  const [placed, setPlaced] = React.useState(false);
  const options = React.useRef(new Map<string, HTMLButtonElement>());
  const anims = React.useRef<AnimationPlaybackControls[]>([]);

  React.useLayoutEffect(() => {
    const node = options.current.get(target);
    if (!node) return;
    for (const a of anims.current) a.stop();
    if (!placed || !motionSafe) {
      x.jump(node.offsetLeft);
      w.jump(node.offsetWidth);
      // Shown once it has somewhere real to sit.
      if (!placed) setPlaced(node.offsetWidth > 0);
      return;
    }
    anims.current = [
      animate(x, node.offsetLeft, springs.snap),
      animate(w, node.offsetWidth, springs.snap),
    ];
  }, [target, placed, motionSafe, roleSet, x, w]);

  React.useEffect(() => {
    const running = anims;
    return () => {
      for (const a of running.current) a.stop();
    };
  }, []);

  const pick = (id: string, focusConfirm: boolean, el: Element | null) => {
    if (locked || disabled || id === target) return;
    play("click", 1.3, el, 0.35);
    onChoose(id, focusConfirm);
  };

  return (
    <div
      role="radiogroup"
      aria-label={`${member.name}'s role`}
      aria-disabled={locked ? true : undefined}
      title={locked ?? undefined}
      className={cn(
        "relative inline-flex h-8 items-center rounded-2 bg-surface-2 p-0.5",
        locked && "opacity-60",
      )}
    >
      <motion.span
        aria-hidden
        className={cn(
          "absolute top-0.5 bottom-0.5 left-0 rounded-[6px] border bg-card transition-[border-color,border-style]",
          pending
            ? "border-dashed border-cobalt-bright"
            : "border-hairline-strong",
          placed ? "" : "opacity-0",
        )}
        style={{ x, width: w }}
      />
      {roleSet.map((r, i) => {
        const on = r.id === target;
        return (
          <button
            key={r.id}
            ref={(node) => {
              if (node) options.current.set(r.id, node);
              else options.current.delete(r.id);
              // Focus comes back to the role they hold, not the one offered.
              if (r.id === member.role) bind(node);
            }}
            type="button"
            role="radio"
            aria-checked={r.id === member.role}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={(event) =>
              pick(r.id, event.detail !== 0, event.currentTarget)
            }
            onKeyDown={(event) => {
              const n = roleSet.length;
              const d =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? -1
                    : 0;
              if (!d || locked) return;
              event.preventDefault();
              const next = roleSet[(i + d + n) % n];
              if (!next) return;
              options.current.get(next.id)?.focus();
              pick(next.id, false, options.current.get(next.id) ?? null);
            }}
            className={cn(
              "relative z-10 inline-flex h-7 items-center rounded-[6px] px-2.5 text-[12px] transition-colors disabled:cursor-not-allowed",
              on
                ? "font-medium text-foreground"
                : "text-ink-3 hover:text-ink-2",
              locked && "cursor-not-allowed",
              FOCUS_RING_IN,
            )}
          >
            {r.name}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------- rows --------------------------------- */

type Confirm = {
  memberId: string;
  kind: "role" | "remove";
  role?: string;
  /** Move focus to the confirm button when it arrives. */
  focus: boolean;
};

type StripProps = {
  question: string;
  detail: string;
  action: string;
  danger: boolean;
  focus: boolean;
  motionSafe: boolean;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** The confirm under a row: it unfolds to its measured height on glide. */
function ConfirmStrip({
  question,
  detail,
  action,
  danger,
  focus,
  motionSafe,
  disabled,
  onConfirm,
  onCancel,
}: StripProps) {
  const uid = React.useId();
  // Bound on arrival: focus moves in once, when the strip exists. A stable
  // callback, so a later render never pulls focus back here.
  const grab = React.useCallback(
    (node: HTMLButtonElement | null) => {
      if (node && focus) node.focus({ preventScroll: true });
    },
    [focus],
  );
  return (
    <motion.div
      role="row"
      className="overflow-clip"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{
        height: 0,
        opacity: 0,
        transition: motionSafe
          ? {
              height: { duration: durations.base, ease: easings.exit },
              opacity: { duration: durations.fast, ease: easings.exit },
            }
          : { duration: 0 },
      }}
      transition={{
        height: motionSafe ? springs.glide : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
    >
      <div role="cell" aria-colspan={4} className="px-3 pb-3">
        <div
          role="group"
          aria-labelledby={`${uid}-q`}
          aria-describedby={`${uid}-d`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-3 border p-3",
            danger
              ? "border-danger/30 bg-[color-mix(in_oklab,var(--danger)_6%,transparent)]"
              : "border-hairline-strong bg-surface-2",
          )}
        >
          <div className="min-w-0 flex-[1_1_12rem]">
            <p
              id={`${uid}-q`}
              className="text-[13px] font-medium text-foreground"
            >
              {question}
            </p>
            <p id={`${uid}-d`} className="text-[12px] text-ink-3">
              {detail}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-card hover:text-foreground",
                FOCUS_RING,
              )}
            >
              Cancel
            </button>
            <button
              ref={grab}
              type="button"
              disabled={disabled}
              onClick={onConfirm}
              className={cn(
                "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50",
                danger
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-primary text-primary-foreground",
                FOCUS_RING,
              )}
            >
              {action}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

type RowProps = {
  member: RosterMember;
  roleSet: RosterRole[];
  now: number;
  d: DensitySpec;
  phone: boolean;
  control: RosterRoleControl;
  confirm: Confirm | null;
  menuOpen: boolean;
  flash: number;
  locked: string | null;
  removable: boolean;
  workspace: string;
  motionSafe: boolean;
  disabled: boolean;
  bindControl: (id: string, node: HTMLElement | null) => void;
  bindRemove: (id: string, node: HTMLElement | null) => void;
  onMenu: (id: string, open: boolean) => void;
  onChoose: (id: string, role: string, focusConfirm: boolean) => void;
  onRemove: (id: string, el: Element) => void;
  onConfirm: () => void;
  onCancel: () => void;
  scrollerRect: () => DOMRect | null;
  play: Play;
};

/**
 * A member's row and its confirm. It leaves by folding away: the content
 * slides left and fades while the row tips back about its top edge and its
 * height runs to zero, so the rows below close the gap as it goes.
 */
function MemberRow({
  member,
  roleSet,
  now,
  d,
  phone,
  control,
  confirm,
  menuOpen,
  flash,
  locked,
  removable,
  workspace,
  motionSafe,
  disabled,
  bindControl,
  bindRemove,
  onMenu,
  onChoose,
  onRemove,
  onConfirm,
  onCancel,
  scrollerRect,
  play,
}: RowProps) {
  // Clipped only while it folds away: its role menu must overflow it otherwise.
  const present = useIsPresent();
  const role = roleSet.find((r) => r.id === member.role);
  const wanted =
    confirm?.kind === "role"
      ? roleSet.find((r) => r.id === confirm.role)
      : undefined;
  const active = ago(member.lastActive, now);
  const Control = control === "segmented" && !phone ? RoleSegments : RoleMenu;

  const controlProps: ControlProps = {
    member,
    roleSet,
    pending: confirm?.kind === "role" ? (confirm.role ?? null) : null,
    locked,
    open: menuOpen,
    motionSafe,
    disabled,
    bind: (node) => bindControl(member.id, node),
    onOpen: (open) => onMenu(member.id, open),
    onChoose: (r, f) => onChoose(member.id, r, f),
    scrollerRect,
    play,
  };

  return (
    <motion.div
      role="presentation"
      className={cn(
        "relative border-b border-hairline last:border-b-0",
        !present && "overflow-clip",
      )}
      style={{ originY: 0, transformPerspective: 700 }}
      exit={
        motionSafe
          ? {
              height: 0,
              opacity: 0,
              rotateX: -55,
              x: -distances.shift,
              transition: {
                height: { duration: durations.slow, ease: easings.move },
                rotateX: { duration: durations.slow, ease: easings.exit },
                x: { duration: durations.base, ease: easings.exit },
                opacity: { duration: durations.base, ease: easings.exit },
              },
            }
          : { opacity: 0, height: 0, transition: { duration: durations.fast } }
      }
    >
      <AnimatePresence initial={false}>
        {flash ? (
          <motion.span
            key={flash}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-cobalt-wash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.page, ease: easings.enter }}
          />
        ) : null}
      </AnimatePresence>
      <div
        role="row"
        className={cn(
          "relative grid items-center gap-x-3 gap-y-1.5 px-4",
          d.row,
          phone
            ? "grid-cols-[minmax(0,1fr)_auto]"
            : control === "segmented"
              ? "grid-cols-[minmax(0,1fr)_16rem_6.5rem_2rem]"
              : "grid-cols-[minmax(0,1fr)_9rem_6.5rem_2rem]",
        )}
      >
        <div role="cell" className="flex min-w-0 items-center gap-2.5">
          <Avatar name={member.name} id={member.id} size={d.avatar} />
          <div className="min-w-0">
            <p
              className={cn(
                "flex items-center gap-1.5 truncate font-medium text-foreground",
                d.name,
              )}
            >
              <span className="truncate">{member.name}</span>
              {member.you ? (
                <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[10px] font-normal text-ink-2">
                  You
                </span>
              ) : null}
            </p>
            <p
              className={cn("truncate text-ink-3", d.meta)}
              title={member.email}
            >
              {member.email}
            </p>
          </div>
        </div>
        <div
          role="cell"
          className={cn(
            phone ? "col-start-1 row-start-2 pl-[calc(var(--a)+10px)]" : "",
          )}
          style={
            phone
              ? ({ "--a": `${d.avatar}px` } as React.CSSProperties)
              : undefined
          }
        >
          <Control {...controlProps} />
        </div>
        <div
          role="cell"
          className={cn(
            "flex items-center gap-1.5 text-ink-3 tabular-nums",
            d.meta,
            phone && "col-start-2 row-start-2 justify-end",
          )}
        >
          {active === "now" ? (
            <>
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              <span>Active now</span>
            </>
          ) : (
            <span>{active}</span>
          )}
        </div>
        <div
          role="cell"
          className={cn("flex justify-end", phone && "col-start-2 row-start-1")}
        >
          {removable ? (
            <button
              ref={(node) => bindRemove(member.id, node)}
              type="button"
              aria-label={`Remove ${member.name}`}
              aria-expanded={confirm?.kind === "remove"}
              disabled={disabled}
              onClick={(event) => onRemove(member.id, event.currentTarget)}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-danger disabled:cursor-not-allowed",
                confirm?.kind === "remove" && "bg-surface-2 text-danger",
                FOCUS_RING,
              )}
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          ) : (
            <span className="size-8" />
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {confirm ? (
          <ConfirmStrip
            key={`${confirm.kind}-${confirm.role ?? ""}`}
            question={
              confirm.kind === "remove"
                ? `Remove ${member.name} from ${workspace}?`
                : `Make ${member.name} ${/^[aeiou]/i.test(wanted?.name ?? "") ? "an" : "a"} ${wanted?.name ?? "member"}?`
            }
            detail={
              confirm.kind === "remove"
                ? "They lose access right away. Their work stays where it is."
                : `As ${/^[aeiou]/i.test(wanted?.name ?? "") ? "an" : "a"} ${wanted?.name ?? "member"}: ${(wanted?.description ?? "").replace(/^./, (c) => c.toLowerCase())} Today: ${role?.name ?? "no role"}.`
            }
            action={
              confirm.kind === "remove"
                ? "Remove"
                : `Make ${wanted?.name ?? "it so"}`
            }
            danger={confirm.kind === "remove"}
            focus={confirm.focus}
            motionSafe={motionSafe}
            disabled={disabled}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/* --------------------------------- invite -------------------------------- */

type Chip = { id: string; email: string; valid: boolean };

type InviteProps = {
  roleSet: RosterRole[];
  seatsLeft: number;
  taken: (email: string) => "member" | "invited" | null;
  motionSafe: boolean;
  disabled: boolean;
  autoFocus: boolean;
  onSend: (emails: string[], role: string) => void;
  onEscapeEmpty?: () => void;
  play: Play;
  say: (text: string) => void;
};

/**
 * Email chips. Text becomes chips on Enter, comma, semicolon, space or blur;
 * a paste of several addresses lands as several chips, one after another.
 */
function InviteField({
  roleSet,
  seatsLeft,
  taken,
  motionSafe,
  disabled,
  autoFocus,
  onSend,
  onEscapeEmpty,
  play,
  say,
}: InviteProps) {
  const uid = React.useId();
  const [chips, setChips] = React.useState<Chip[]>([]);
  const [text, setText] = React.useState("");
  const [role, setRole] = React.useState(
    () =>
      roleSet.find((r) => r.id === "member")?.id ??
      roleSet[roleSet.length - 1]?.id ??
      "",
  );
  const [note, setNote] = React.useState<string | null>(null);
  const [fresh, setFresh] = React.useState<string[]>([]);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const chipRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const seq = React.useRef(0);
  // Stable, so the field takes focus when it arrives and never again.
  const bindInput = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (node && autoFocus) node.focus({ preventScroll: true });
    },
    [autoFocus],
  );

  const valid = chips.filter((c) => c.valid);
  const over = valid.length > seatsLeft;

  const add = (raw: string): Chip[] => {
    const parts = raw
      .split(/[\s,;]+/)
      .map((p) => p.trim().replace(/^<|>$/g, ""))
      .filter(Boolean);
    if (!parts.length) return [];
    const next: Chip[] = [];
    const skipped: string[] = [];
    for (const p of parts) {
      const email = p.toLowerCase();
      const why = taken(email);
      if (
        why ||
        chips.some((c) => c.email === email) ||
        next.some((c) => c.email === email)
      ) {
        skipped.push(
          why === "member"
            ? "already a member"
            : why === "invited"
              ? "already invited"
              : "already in the list",
        );
        continue;
      }
      seq.current += 1;
      next.push({
        id: `${uid}-${seq.current}`,
        email,
        valid: EMAIL.test(email),
      });
    }
    if (next.length) {
      setChips((c) => [...c, ...next]);
      setFresh(next.map((c) => c.id));
      play("click", 1.25, inputRef.current);
    }
    const bad = next.filter((c) => !c.valid).length;
    const parts2: string[] = [];
    if (next.length)
      parts2.push(`Added ${plural(next.length, "address", "addresses")}`);
    if (bad) parts2.push(`${bad} not valid`);
    if (skipped.length) parts2.push(`skipped ${skipped.length}: ${skipped[0]}`);
    const sentence = parts2.join(", ");
    setNote(skipped.length || bad ? `${sentence}.` : null);
    if (sentence) say(`${sentence}.`);
    return next;
  };

  const removeChip = (id: string, refocus: "prev" | "input") => {
    const i = chips.findIndex((c) => c.id === id);
    const prev = chips[i - 1];
    setChips((c) => c.filter((x) => x.id !== id));
    play("click", 0.85, chipRefs.current.get(id));
    if (refocus === "prev" && prev) chipRefs.current.get(prev.id)?.focus();
    else inputRef.current?.focus();
  };

  /** Enter chips what is typed; the button chips it and sends everything valid. */
  const send = (andChip: boolean) => {
    if (disabled) return;
    let extra: Chip[] = [];
    if (text.trim()) {
      extra = add(text);
      setText("");
      if (!andChip) return;
    }
    const all = [...chips, ...extra];
    const ok = all.filter((c) => c.valid);
    const bad = all.length - ok.length;
    if (!ok.length || ok.length > seatsLeft) return;
    onSend(
      ok.map((c) => c.email),
      role,
    );
    setChips(all.filter((x) => !x.valid));
    setNote(
      bad
        ? `${plural(bad, "address is", "addresses are")} not valid: fix or remove ${bad === 1 ? "it" : "them"}.`
        : null,
    );
  };

  const roleName = roleSet.find((r) => r.id === role)?.name ?? "Member";

  return (
    <div
      role="group"
      aria-labelledby={`${uid}-label`}
      className="flex flex-col gap-2"
    >
      <p id={`${uid}-label`} className="text-[12px] font-medium text-ink-2">
        Invite people
      </p>
      <div
        onClick={(event) => {
          if (event.target === event.currentTarget) inputRef.current?.focus();
        }}
        className="flex flex-wrap items-center gap-1.5 rounded-2 border border-hairline bg-surface-0 px-2 py-1.5 transition-colors focus-within:border-hairline-strong"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {chips.map((c) => {
            const k = fresh.indexOf(c.id);
            return (
              <motion.button
                key={c.id}
                ref={(node: HTMLButtonElement | null) => {
                  if (node) chipRefs.current.set(c.id, node);
                  else chipRefs.current.delete(c.id);
                }}
                layout="position"
                type="button"
                aria-label={
                  c.valid
                    ? `Remove ${c.email}`
                    : `Remove ${c.email}, not a valid address`
                }
                disabled={disabled}
                onClick={() => removeChip(c.id, "input")}
                onKeyDown={(event) => {
                  const i = chips.findIndex((x) => x.id === c.id);
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    const p = chips[i - 1];
                    if (p) chipRefs.current.get(p.id)?.focus();
                  } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    const n = chips[i + 1];
                    if (n) chipRefs.current.get(n.id)?.focus();
                    else inputRef.current?.focus();
                  } else if (
                    event.key === "Backspace" ||
                    event.key === "Delete"
                  ) {
                    event.preventDefault();
                    removeChip(
                      c.id,
                      event.key === "Backspace" ? "prev" : "input",
                    );
                  }
                }}
                initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: motionSafe ? 0.8 : 1,
                  transition: exitFor(durations.fast),
                }}
                transition={{
                  layout: motionSafe ? springs.glide : { duration: 0 },
                  scale: motionSafe
                    ? {
                        ...springs.snap,
                        delay: Math.max(0, k) * cascade(fresh.length),
                      }
                    : { duration: 0 },
                  opacity: {
                    duration: durations.fast,
                    ease: easings.enter,
                    delay: motionSafe
                      ? Math.max(0, k) * cascade(fresh.length)
                      : 0,
                  },
                }}
                className={cn(
                  "inline-flex h-6 max-w-full items-center gap-1 rounded-full border pr-1 pl-2 text-[12px] transition-colors disabled:cursor-not-allowed",
                  c.valid
                    ? "border-hairline-strong bg-card text-foreground hover:bg-surface-2"
                    : "border-danger/40 bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] text-danger",
                  FOCUS_RING,
                )}
              >
                {c.valid ? null : (
                  <CircleAlert aria-hidden className="size-3 shrink-0" />
                )}
                <span className="truncate">{c.email}</span>
                <X aria-hidden className="size-3 shrink-0 opacity-60" />
              </motion.button>
            );
          })}
        </AnimatePresence>
        <input
          ref={bindInput}
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          aria-label="Email addresses"
          aria-describedby={`${uid}-note`}
          placeholder={chips.length ? "" : "name@company.com, …"}
          disabled={disabled}
          value={text}
          onChange={(event) => {
            const v = event.currentTarget.value;
            if (/[\s,;]/.test(v)) {
              const cut = Math.max(
                v.lastIndexOf(" "),
                v.lastIndexOf(","),
                v.lastIndexOf(";"),
              );
              add(v.slice(0, cut));
              setText(v.slice(cut + 1));
              return;
            }
            setText(v);
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (!/[\s,;]/.test(pasted.trim())) return;
            event.preventDefault();
            add(`${text} ${pasted}`);
            setText("");
          }}
          onBlur={() => {
            if (text.trim()) {
              add(text);
              setText("");
            }
          }}
          onKeyDown={(event) => {
            const input = event.currentTarget;
            if (event.key === "Enter") {
              event.preventDefault();
              send(false);
            } else if (
              event.key === "Backspace" &&
              input.value === "" &&
              chips.length
            ) {
              event.preventDefault();
              const last = chips[chips.length - 1];
              if (last) removeChip(last.id, "input");
            } else if (
              event.key === "ArrowLeft" &&
              input.selectionStart === 0 &&
              input.selectionEnd === 0 &&
              chips.length
            ) {
              event.preventDefault();
              const last = chips[chips.length - 1];
              if (last) chipRefs.current.get(last.id)?.focus();
            } else if (
              event.key === "Escape" &&
              input.value === "" &&
              onEscapeEmpty
            ) {
              event.preventDefault();
              onEscapeEmpty();
            }
          }}
          className={cn(
            "h-6 min-w-[9rem] flex-1 rounded-1 bg-transparent text-[13px] text-foreground placeholder:text-ink-3 disabled:cursor-not-allowed",
            FOCUS_RING,
          )}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative inline-flex h-8 items-center">
          <span className="sr-only">Role for the people you invite</span>
          <select
            value={role}
            disabled={disabled}
            onChange={(event) => setRole(event.currentTarget.value)}
            className={cn(
              "h-8 appearance-none rounded-2 border border-hairline bg-card pr-7 pl-2.5 text-xs text-ink-2 transition-colors hover:text-foreground disabled:cursor-not-allowed",
              FOCUS_RING,
            )}
          >
            {roleSet
              .filter((r) => r.id !== "owner")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  as {r.name}
                </option>
              ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-2 size-3.5 text-ink-3"
          />
        </label>
        <p
          id={`${uid}-note`}
          className={cn(
            "min-w-0 flex-1 truncate text-[11px]",
            over || note ? "text-warn" : "text-ink-3",
          )}
          title={note ?? undefined}
        >
          {over
            ? `Only ${plural(seatsLeft, "seat", "seats")} left.`
            : (note ?? `${plural(seatsLeft, "seat", "seats")} left.`)}
        </p>
        <button
          type="button"
          disabled={disabled || over || (!valid.length && !text.trim())}
          onClick={() => send(true)}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40",
            FOCUS_RING,
          )}
        >
          <UserPlus aria-hidden className="size-3.5" />
          <span>
            Invite
            {valid.length ? (
              <span className="tabular-nums"> {valid.length}</span>
            ) : null}
          </span>
          <span className="sr-only"> as {roleName}</span>
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- pending -------------------------------- */

type PendingProps = {
  invites: RosterInvite[];
  roleSet: RosterRole[];
  now: number;
  clock: number;
  coolUntil: Record<string, number>;
  cooldown: number;
  motionSafe: boolean;
  disabled: boolean;
  onResend: (id: string, el: Element) => void;
  onRevoke: (id: string, el: Element) => void;
};

function PendingList({
  invites,
  roleSet,
  now,
  clock,
  coolUntil,
  cooldown,
  motionSafe,
  disabled,
  onResend,
  onRevoke,
}: PendingProps) {
  if (!invites.length) {
    return (
      <p className="rounded-3 border border-dashed border-hairline-strong px-3 py-4 text-center text-[12px] text-ink-3">
        No invites waiting.
      </p>
    );
  }
  return (
    <ul
      role="list"
      className="flex flex-col overflow-clip rounded-3 border border-hairline bg-card"
    >
      <AnimatePresence initial={false}>
        {invites.map((inv) => {
          const until = coolUntil[inv.id] ?? 0;
          const left = Math.max(0, Math.ceil((until - clock) / 1000));
          const cooling = left > 0;
          const role = roleSet.find((r) => r.id === inv.role);
          const resent = until > 0;
          return (
            <motion.li
              key={inv.id}
              className="flex items-center gap-3 overflow-clip border-b border-hairline px-3 py-2.5 last:border-b-0"
              initial={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                height: 0,
                paddingTop: 0,
                paddingBottom: 0,
                x: motionSafe ? -distances.shift : 0,
                transition: motionSafe
                  ? {
                      height: { duration: durations.slow, ease: easings.move },
                      paddingTop: {
                        duration: durations.slow,
                        ease: easings.move,
                      },
                      paddingBottom: {
                        duration: durations.slow,
                        ease: easings.move,
                      },
                      x: { duration: durations.base, ease: easings.exit },
                      opacity: { duration: durations.base, ease: easings.exit },
                    }
                  : { duration: durations.fast },
              }}
              transition={{
                opacity: { duration: durations.base, ease: easings.enter },
                y: motionSafe ? springs.snap : { duration: 0 },
              }}
            >
              <span
                aria-hidden
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-3"
              >
                <Mail className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[13px] text-foreground"
                  title={inv.email}
                >
                  {inv.email}
                </p>
                <p className="truncate text-[11px] text-ink-3">
                  {role?.name ?? "Member"} ·{" "}
                  {resent
                    ? "sent again just now"
                    : `sent ${ago(inv.sentAt, now)}`}
                </p>
              </div>
              <button
                type="button"
                aria-disabled={cooling || undefined}
                title={cooling ? "Resend after the cooldown" : "Resend"}
                aria-label={
                  cooling
                    ? `Resend available in ${plural(left, "second", "seconds")}`
                    : `Resend the invite to ${inv.email}`
                }
                disabled={disabled}
                onClick={(event) => {
                  if (!cooling) onResend(inv.id, event.currentTarget);
                }}
                className={cn(
                  "relative inline-flex h-8 w-14 shrink-0 items-center justify-center gap-1 overflow-clip rounded-2 border border-hairline font-mono text-[11px] tabular-nums transition-colors disabled:cursor-not-allowed",
                  cooling
                    ? "cursor-default text-ink-3"
                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                {cooling ? (
                  <motion.span
                    key={until}
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-cobalt-bright"
                    initial={{
                      scaleX: r2(Math.min(1, left / Math.max(1, cooldown))),
                    }}
                    animate={{ scaleX: 0 }}
                    transition={{
                      duration: Math.max(0, (until - clock) / 1000),
                      ease: "linear",
                    }}
                  />
                ) : null}
                {cooling ? (
                  `${left}s`
                ) : (
                  <RotateCw aria-hidden className="size-3.5" />
                )}
              </button>
              <button
                type="button"
                aria-label={`Revoke the invite to ${inv.email}`}
                disabled={disabled}
                onClick={(event) => onRevoke(inv.id, event.currentTarget)}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-danger disabled:cursor-not-allowed",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden className="size-4" />
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

/* -------------------------------- surface -------------------------------- */

type Mode = "phone" | "tablet" | "desktop";

/**
 * The people in a workspace and what each of them can do. A role changes
 * only after a confirm unfolds under the row and is accepted, and then the
 * role chip rolls to its new name; the last owner can never be demoted or
 * removed. Invites are typed or pasted as email chips that land one after
 * another, and pending invites can be sent again once their cooldown bar has
 * drained. Removing someone folds their row away while the rows below close
 * the gap.
 *
 * Every control is a real button, menu, radio group or field; confirms take
 * focus when they arrive and give it back on Escape. Under reduced motion
 * things appear and leave by fading, and every role, count and cooldown still
 * changes.
 */
export function MemberRoster({
  members: membersProp,
  defaultMembers,
  onMembersChange,
  invites: invitesProp,
  defaultInvites,
  onInvitesChange,
  roleSet = defaultRosterRoles,
  now,
  seats = 10,
  cooldown = 30,
  workspace = "Basinworks",
  onRoleChange,
  onRemove,
  onInvite,
  onResend,
  onRevoke,
  density = "cozy",
  invite = "inline",
  roles = "menu",
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: MemberRosterProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const nowMs = toMs(now);
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [ownMembers, setOwnMembers] = React.useState<RosterMember[]>(
    () => defaultMembers ?? defaultRosterMembers,
  );
  const members = membersProp ?? ownMembers;
  const [ownInvites, setOwnInvites] = React.useState<RosterInvite[]>(
    () => defaultInvites ?? defaultRosterInvites,
  );
  const invites = invitesProp ?? ownInvites;
  const [width, setWidth] = React.useState<number | null>(null);
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const [menuFor, setMenuFor] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<Record<string, number>>({});
  const [tab, setTab] = React.useState<"members" | "pending">("members");
  const [drawer, setDrawer] = React.useState(false);
  const [coolUntil, setCoolUntil] = React.useState<Record<string, number>>({});
  const [clock, setClock] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );

  const mode: Mode =
    width === null
      ? "tablet"
      : width < PHONE
        ? "phone"
        : width < DESKTOP
          ? "tablet"
          : "desktop";
  const phone = mode === "phone";

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const controls = React.useRef(new Map<string, HTMLElement>());
  const removes = React.useRef(new Map<string, HTMLElement>());
  const drawerButton = React.useRef<HTMLButtonElement | null>(null);
  const focusWant = React.useRef<string | null>(null);

  React.useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    setWidth(Math.round(node.offsetWidth));
    const ro = new ResizeObserver(() => setWidth(Math.round(node.offsetWidth)));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const play: Play = React.useCallback(
    (tone, pitch, el, gain = 0.5) => {
      const rect = el?.getBoundingClientRect();
      audio.play(tone, {
        pitch,
        gain,
        pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
      });
    },
    [audio],
  );

  const scrollerRect = React.useCallback(
    () => scrollerRef.current?.getBoundingClientRect() ?? null,
    [],
  );

  // The resend countdown ticks only while one is running and the page shows.
  const cooling = Object.values(coolUntil).some((t) => t > clock);
  React.useEffect(() => {
    if (!cooling) return;
    let timer: number | null = null;
    const tick = () => setClock(Date.now());
    const sync = () => {
      if (document.hidden) {
        if (timer !== null) window.clearInterval(timer);
        timer = null;
      } else if (timer === null) {
        tick();
        timer = window.setInterval(tick, 1000);
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [cooling]);

  // Focus that waited for a row to leave lands on the row that took its place.
  const memberKey = members.map((m) => m.id).join("|");
  React.useLayoutEffect(() => {
    const id = focusWant.current;
    if (!id) return;
    focusWant.current = null;
    (controls.current.get(id) ?? removes.current.get(id))?.focus({
      preventScroll: false,
    });
  }, [memberKey]);

  // A role menu closes on a press anywhere outside it.
  React.useEffect(() => {
    if (!menuFor) return;
    const onDown = (event: PointerEvent) => {
      const t = event.target;
      if (
        t instanceof Element &&
        (t.closest("[data-roster-popover]") ||
          t.closest("[aria-haspopup=menu]"))
      )
        return;
      setMenuFor(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuFor]);

  /* ------------------------------- actions -------------------------------- */

  const commitMembers = (next: RosterMember[]) => {
    if (membersProp === undefined) setOwnMembers(next);
    onMembersChange?.(next);
  };
  const commitInvites = (next: RosterInvite[]) => {
    if (invitesProp === undefined) setOwnInvites(next);
    onInvitesChange?.(next);
  };

  const owners = members.filter((m) => m.role === "owner").length;
  const lockOf = (m: RosterMember) =>
    m.role === "owner" && owners <= 1 && roleSet.some((r) => r.id === "owner")
      ? "A workspace always needs an owner. Make someone else an owner first."
      : null;

  const roleName = (id: string | undefined) =>
    roleSet.find((r) => r.id === id)?.name ?? "Member";

  const choose = (id: string, role: string, focusConfirm: boolean) => {
    const m = members.find((x) => x.id === id);
    if (!m || disabled || lockOf(m)) return;
    setMenuFor(null);
    if (role === m.role) {
      if (confirm?.memberId === id) setConfirm(null);
      return;
    }
    setConfirm({ memberId: id, kind: "role", role, focus: focusConfirm });
  };

  const askRemove = (id: string, el: Element) => {
    if (disabled) return;
    if (confirm?.memberId === id && confirm.kind === "remove") {
      setConfirm(null);
      return;
    }
    setMenuFor(null);
    play("click", 0.9, el);
    setConfirm({ memberId: id, kind: "remove", focus: true });
  };

  const cancel = () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    const back =
      c.kind === "remove"
        ? removes.current.get(c.memberId)
        : controls.current.get(c.memberId);
    back?.focus({ preventScroll: true });
    play("click", 0.8, back);
  };

  const accept = () => {
    const c = confirm;
    if (!c || disabled) return;
    const m = members.find((x) => x.id === c.memberId);
    if (!m) return;
    if (c.kind === "role" && c.role) {
      const previous = m.role;
      commitMembers(
        members.map((x) =>
          x.id === m.id ? { ...x, role: c.role ?? x.role } : x,
        ),
      );
      onRoleChange?.(m.id, c.role, previous);
      setFlash((f) => ({ ...f, [m.id]: (f[m.id] ?? 0) + 1 }));
      setConfirm(null);
      play("pop", 1.1, controls.current.get(m.id));
      say(
        `${m.name} is now ${/^[aeiou]/i.test(roleName(c.role)) ? "an" : "a"} ${roleName(c.role)}.`,
      );
      controls.current.get(m.id)?.focus({ preventScroll: true });
      return;
    }
    // Focus moves to the row that will take this one's place.
    const i = members.findIndex((x) => x.id === m.id);
    const next = members[i + 1] ?? members[i - 1];
    focusWant.current = next?.id ?? null;
    setConfirm(null);
    commitMembers(members.filter((x) => x.id !== m.id));
    onRemove?.(m.id);
    play("click", 0.7, removes.current.get(m.id));
    say(sentence(`${m.name} removed from ${workspace}`));
  };

  const sendInvites = (emails: string[], role: string) => {
    const at = nowMs;
    const made = emails.map((email, i) => ({
      id: `${uid}-inv-${at}-${i}-${email}`,
      email,
      role,
      sentAt: at,
    }));
    commitInvites([...made, ...invites]);
    onInvite?.(emails, role);
    play("pop", 1.15, scrollerRef.current);
    say(
      `${plural(emails.length, "invite", "invites")} sent as ${roleName(role)}.`,
    );
  };

  const resend = (id: string, el: Element) => {
    if (disabled) return;
    const t = Date.now();
    setClock(t);
    setCoolUntil((c) => ({ ...c, [id]: t + Math.max(1, cooldown) * 1000 }));
    onResend?.(id);
    play("click", 1.2, el);
    const inv = invites.find((x) => x.id === id);
    say(`Invite sent again to ${inv?.email ?? "them"}.`);
  };

  const revoke = (id: string, el: Element) => {
    if (disabled) return;
    const inv = invites.find((x) => x.id === id);
    commitInvites(invites.filter((x) => x.id !== id));
    onRevoke?.(id);
    play("click", 0.8, el);
    say(`Invite to ${inv?.email ?? "them"} revoked.`);
  };

  const taken = (email: string): "member" | "invited" | null =>
    members.some((m) => m.email.toLowerCase() === email)
      ? "member"
      : invites.some((i) => i.email.toLowerCase() === email)
        ? "invited"
        : null;

  /* -------------------------------- render -------------------------------- */

  const used = members.length + invites.length;
  const seatsLeft = Math.max(0, seats - used);
  const fill = seats > 0 ? Math.min(1, used / seats) : 1;

  // Keyed by member id; a node that leaves only clears its own entry.
  const bindControl = (id: string, node: HTMLElement | null) => {
    const map = controls.current;
    if (node) map.set(id, node);
    else if (map.get(id)?.isConnected === false) map.delete(id);
  };
  const bindRemove = (id: string, node: HTMLElement | null) => {
    const map = removes.current;
    if (node) map.set(id, node);
    else if (map.get(id)?.isConnected === false) map.delete(id);
  };

  const composer =
    invite === "off" ? null : invite === "inline" ? (
      <InviteField
        roleSet={roleSet}
        seatsLeft={seatsLeft}
        taken={taken}
        motionSafe={motionSafe}
        disabled={disabled || status !== "ready"}
        autoFocus={false}
        onSend={sendInvites}
        play={play}
        say={say}
      />
    ) : (
      <AnimatePresence initial={false}>
        {drawer ? (
          <motion.div
            key="drawer"
            className="overflow-clip"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: motionSafe
                ? {
                    height: { duration: durations.base, ease: easings.exit },
                    opacity: exitFor(durations.fast),
                  }
                : { duration: 0 },
            }}
            transition={{
              height: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base, ease: easings.enter },
            }}
          >
            <div className="pb-1">
              <InviteField
                roleSet={roleSet}
                seatsLeft={seatsLeft}
                taken={taken}
                motionSafe={motionSafe}
                disabled={disabled || status !== "ready"}
                autoFocus
                onSend={sendInvites}
                onEscapeEmpty={() => {
                  setDrawer(false);
                  drawerButton.current?.focus();
                }}
                play={play}
                say={say}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    );

  const table = (
    <div
      role="table"
      aria-label={`Members of ${workspace}`}
      className="overflow-visible rounded-3 border border-hairline bg-card"
    >
      <div role="rowgroup" className={phone ? "sr-only" : ""}>
        <div
          role="row"
          className={cn(
            "grid h-9 items-center gap-x-3 border-b border-hairline px-4 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
            roles === "segmented"
              ? "grid-cols-[minmax(0,1fr)_16rem_6.5rem_2rem]"
              : "grid-cols-[minmax(0,1fr)_9rem_6.5rem_2rem]",
          )}
        >
          <span role="columnheader">Member</span>
          <span role="columnheader">Role</span>
          <span role="columnheader">Last active</span>
          <span role="columnheader">
            <span className="sr-only">Actions</span>
          </span>
        </div>
      </div>
      <div role="rowgroup">
        <AnimatePresence initial={false}>
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              roleSet={roleSet}
              now={nowMs}
              d={d}
              phone={phone}
              control={roles}
              confirm={confirm?.memberId === m.id ? confirm : null}
              menuOpen={menuFor === m.id}
              flash={flash[m.id] ?? 0}
              locked={lockOf(m)}
              removable={!m.you && !lockOf(m)}
              workspace={workspace}
              motionSafe={motionSafe}
              disabled={disabled}
              bindControl={bindControl}
              bindRemove={bindRemove}
              onMenu={(id, open) => setMenuFor(open ? id : null)}
              onChoose={choose}
              onRemove={askRemove}
              onConfirm={accept}
              onCancel={cancel}
              scrollerRect={scrollerRect}
              play={play}
            />
          ))}
        </AnimatePresence>
        {members.length === 0 ? (
          <div role="row">
            <div
              role="cell"
              aria-colspan={4}
              className="px-4 py-6 text-center text-[12px] text-ink-3"
            >
              Nobody here yet. Invite someone to start.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const pending = (
    <section aria-labelledby={`${uid}-pending`} className="flex flex-col gap-2">
      <h3
        id={`${uid}-pending`}
        className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        Pending invites
        <span className="text-ink-3/70">· {invites.length}</span>
      </h3>
      <PendingList
        invites={invites}
        roleSet={roleSet}
        now={nowMs}
        clock={clock}
        coolUntil={coolUntil}
        cooldown={cooldown}
        motionSafe={motionSafe}
        disabled={disabled}
        onResend={resend}
        onRevoke={revoke}
      />
    </section>
  );

  const seatsMeter = (
    <div
      className="flex items-center gap-2"
      title={`${used} of ${seats} seats used`}
    >
      <span className="font-mono text-[11px] text-ink-2 tabular-nums">
        {used} of {seats} seats
      </span>
      <span
        aria-hidden
        className="relative h-1.5 w-20 overflow-clip rounded-full bg-surface-2"
      >
        <motion.span
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full"
          style={{
            background: fill >= 0.9 ? "var(--warn)" : "var(--accent-bright)",
          }}
          initial={false}
          animate={{ scaleX: r2(fill) }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
      </span>
    </div>
  );

  const drawerToggle =
    invite === "drawer" ? (
      <button
        ref={drawerButton}
        type="button"
        aria-expanded={drawer}
        disabled={disabled || status !== "ready"}
        onClick={(event) => {
          setDrawer((v) => !v);
          if (!drawer) setTab("members");
          play("click", drawer ? 0.9 : 1.15, event.currentTarget);
        }}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          drawer
            ? "border border-hairline-strong bg-surface-2 text-foreground"
            : "bg-primary text-primary-foreground",
          FOCUS_RING,
        )}
      >
        <UserPlus aria-hidden className="size-3.5" />
        Invite
      </button>
    ) : null;

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-hidden className="flex flex-col gap-2 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2 border border-hairline bg-card px-4 py-3 motion-safe:animate-pulse"
          >
            <span className="size-7 rounded-full bg-surface-2" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="h-3 w-1/3 rounded-1 bg-surface-2" />
              <span className="h-2.5 w-1/2 rounded-1 bg-surface-2" />
            </span>
            <span className="h-6 w-16 rounded-full bg-surface-2" />
          </div>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <CircleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">
          The member list could not load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  } else if (mode === "phone") {
    body = (
      <div className="grid grid-rows-[auto_minmax(0,1fr)]">
        <div
          role="tablist"
          aria-label="People"
          className="flex items-center gap-1 border-b border-hairline px-3 py-2"
        >
          {(["members", "pending"] as const).map((t) => {
            const on = tab === t;
            const n = t === "members" ? members.length : invites.length;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                id={`${uid}-tab-${t}`}
                aria-selected={on}
                aria-controls={`${uid}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(t)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    const next = t === "members" ? "pending" : "members";
                    setTab(next);
                    rootRef.current
                      ?.querySelector<HTMLButtonElement>(
                        `[id="${uid}-tab-${next}"]`,
                      )
                      ?.focus();
                  }
                }}
                className={cn(
                  "relative inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors",
                  on ? "text-foreground" : "text-ink-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-pill`}
                    aria-hidden
                    className="absolute inset-0 rounded-full border border-hairline-strong bg-card"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative">
                  {t === "members" ? "Members" : "Pending"}
                </span>
                <span className="relative font-mono text-[10px] text-ink-3 tabular-nums">
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <div
          ref={scrollerRef}
          id={`${uid}-panel`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${tab}`}
          className="[scrollbar-width:thin] overflow-x-clip overflow-y-auto overscroll-contain p-3"
        >
          {tab === "members" ? (
            <div className="flex flex-col gap-3">
              {composer ? (
                <div className="rounded-3 border border-hairline bg-card p-3 empty:hidden">
                  {composer}
                </div>
              ) : null}
              {table}
            </div>
          ) : (
            pending
          )}
        </div>
      </div>
    );
  } else if (mode === "tablet") {
    body = (
      <div
        ref={scrollerRef}
        className="[scrollbar-width:thin] overflow-x-clip overflow-y-auto overscroll-contain p-4"
      >
        <div className="flex flex-col gap-4">
          {composer ? (
            <div className="rounded-3 border border-hairline bg-card p-3 empty:hidden">
              {composer}
            </div>
          ) : null}
          {table}
          {pending}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="grid grid-cols-[minmax(0,1fr)_20rem] grid-rows-[minmax(0,1fr)]">
        <div
          ref={scrollerRef}
          className="[scrollbar-width:thin] overflow-x-clip overflow-y-auto overscroll-contain p-4"
        >
          {table}
        </div>
        <aside
          aria-label="Invites"
          className="flex [scrollbar-width:thin] flex-col gap-4 overflow-y-auto overscroll-contain border-l border-hairline p-4"
        >
          {composer ? (
            <div className="rounded-3 border border-hairline bg-card p-3 empty:hidden">
              {composer}
            </div>
          ) : null}
          {pending}
        </aside>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container grid h-[560px] w-full grid-rows-[auto_minmax(0,1fr)] overflow-clip rounded-4 border border-hairline bg-surface-0 text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-[1_1_10rem]">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            Members
            <span className="sr-only"> of {workspace}</span>
          </h2>
          <p className="truncate text-xs text-ink-3">
            {workspace} · {plural(members.length, "person", "people")}
          </p>
        </div>
        {status === "ready" ? seatsMeter : null}
        {drawerToggle}
      </header>
      {body}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
