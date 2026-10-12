"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Copy,
  Inbox,
  Lock,
  Plus,
  RotateCcw,
  TriangleAlert,
  Users,
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

export type TailorLevel = "none" | "view" | "allow";

export type TailorPermission = {
  id: string;
  /** The row's name, e.g. "Delete projects". */
  label: string;
  /** A short gloss under the label, shown from a 40rem container. */
  note?: string;
  /** Only None and Allow apply, e.g. for a destructive action. @default false */
  binary?: boolean;
  /**
   * Permissions this one needs. Setting this above None raises each of them
   * to at least View (Allow when binary); clearing one of them clears this.
   */
  requires?: string[];
};

export type TailorArea = {
  id: string;
  /** The group's heading, e.g. "Billing". */
  label: string;
  permissions: TailorPermission[];
};

export type TailorPreset = {
  id: string;
  label: string;
  /** The level per permission id; a missing id reads None. */
  levels: Record<string, TailorLevel>;
};

export type TailorRole = {
  id: string;
  name: string;
  description?: string;
  /** The preset the role matches, or null once a cell was set by hand. */
  preset: string | null;
  /** The level per permission id; a missing id reads None. */
  levels: Record<string, TailorLevel>;
  /** The role can neither be edited nor removed: Owner. @default false */
  locked?: boolean;
};

export type TailorMember = { id: string; name: string; roleId: string };

export type TailorCascade = { id: string; from: TailorLevel; to: TailorLevel };

export type TailorChange =
  | {
      kind: "level";
      roleId: string;
      permissionId: string;
      from: TailorLevel;
      to: TailorLevel;
      /** Dependencies that were set along with it. */
      cascaded: TailorCascade[];
    }
  | { kind: "preset"; roleId: string; presetId: string }
  | { kind: "clone"; roleId: string; fromRoleId: string }
  | { kind: "create"; roleId: string }
  | { kind: "remove"; roleId: string };

export type TailorControlStyle = "segmented" | "radios" | "switches";
export type TailorDensity = "compact" | "cozy" | "roomy";
export type TailorAccent = "cobalt" | "signal" | "success";
export type TailorStatus = "ready" | "loading" | "error";

export type RoleTailorProps = {
  /** How each cell is drawn: a three-way segmented control whose indicator slides, a row of radios, or View and Allow switches. @default "segmented" */
  controlStyle?: TailorControlStyle;
  /** Row height and type size. @default "cozy" */
  density?: TailorDensity;
  /** The colour an allowed cell, the selected role and the chosen preset are drawn in. @default "cobalt" */
  accent?: TailorAccent;
  /** Controlled roles. */
  roles?: TailorRole[];
  /** Initial roles when uncontrolled. @default defaultTailorRoles */
  defaultRoles?: TailorRole[];
  /** Fires with every role after a cell, preset, clone, new role or removal, and what changed. */
  onChange?: (roles: TailorRole[], change: TailorChange) => void;
  /** The permission matrix, grouped by area. @default defaultTailorAreas */
  areas?: TailorArea[];
  /** The presets a whole role can be set to. @default defaultTailorPresets */
  presets?: TailorPreset[];
  /** Everyone who holds a role; the header counts the selected role's. @default defaultTailorMembers */
  members?: TailorMember[];
  /** Controlled selected role id; null selects none. */
  value?: string | null;
  /** Initial selected role id when uncontrolled. @default "editor" */
  defaultValue?: string | null;
  /** A role was selected from the list, by press or arrow. */
  onSelect?: (roleId: string) => void;
  /** The role whose choices are overlaid as ghost marks at first, by id. @default null */
  defaultCompareTo?: string | null;
  /** Whether the roles and matrix have arrived. @default "ready" */
  status?: TailorStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Roles" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the list and the matrix scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be changed, cloned or created. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Coldbrook Admin's four areas, fifteen permissions. */
export const defaultTailorAreas: TailorArea[] = [
  {
    id: "projects",
    label: "Projects",
    permissions: [
      { id: "projects", label: "Projects", note: "Boards, docs and files" },
      {
        id: "project-settings",
        label: "Project settings",
        note: "Names, owners, retention",
        requires: ["projects"],
      },
      {
        id: "share-links",
        label: "Share links",
        note: "Public and guest links",
        requires: ["projects"],
      },
      {
        id: "delete-projects",
        label: "Delete projects",
        note: "Permanent after 30 days",
        binary: true,
        requires: ["projects"],
      },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    permissions: [
      { id: "invoices", label: "Invoices", note: "History and receipts" },
      {
        id: "payment-methods",
        label: "Payment methods",
        note: "Cards and mandates",
        requires: ["invoices"],
      },
      {
        id: "plan-changes",
        label: "Plan changes",
        note: "Upgrades, seats, cancel",
        binary: true,
        requires: ["invoices"],
      },
    ],
  },
  {
    id: "members",
    label: "Members",
    permissions: [
      { id: "member-list", label: "Member list", note: "Names and roles" },
      {
        id: "invite-members",
        label: "Invite members",
        note: "Sends the invitation",
        binary: true,
        requires: ["member-list"],
      },
      {
        id: "remove-members",
        label: "Remove members",
        note: "Revokes their sessions",
        binary: true,
        requires: ["member-list"],
      },
      { id: "roles", label: "Roles", note: "This editor" },
    ],
  },
  {
    id: "data",
    label: "Data",
    permissions: [
      { id: "datasets", label: "Datasets", note: "Tables and queries" },
      {
        id: "exports",
        label: "Exports",
        note: "CSV and warehouse sync",
        binary: true,
        requires: ["datasets"],
      },
      { id: "api-keys", label: "API keys", note: "Issue and revoke" },
      { id: "audit-log", label: "Audit log", note: "Ninety days" },
    ],
  },
];

const allPermissions = (areas: TailorArea[]) =>
  areas.flatMap((a) => a.permissions);

const levelsWhere = (
  areas: TailorArea[],
  pick: (permission: TailorPermission) => TailorLevel,
) =>
  Object.fromEntries(
    allPermissions(areas).map((p) => [p.id, pick(p)]),
  ) as Record<string, TailorLevel>;

const EDIT_LEVELS: Record<string, TailorLevel> = {
  projects: "allow",
  "project-settings": "view",
  "share-links": "allow",
  invoices: "view",
  "member-list": "view",
  "invite-members": "allow",
  datasets: "allow",
  exports: "allow",
  "audit-log": "view",
};

export const defaultTailorPresets: TailorPreset[] = [
  {
    id: "full",
    label: "Full access",
    levels: levelsWhere(defaultTailorAreas, () => "allow"),
  },
  {
    id: "edit",
    label: "Editing",
    levels: levelsWhere(defaultTailorAreas, (p) => EDIT_LEVELS[p.id] ?? "none"),
  },
  {
    id: "read",
    label: "Read only",
    levels: levelsWhere(defaultTailorAreas, (p) =>
      p.binary ? "none" : "view",
    ),
  },
  {
    id: "locked",
    label: "No access",
    levels: levelsWhere(defaultTailorAreas, () => "none"),
  },
];

const presetLevels = (id: string) =>
  defaultTailorPresets.find((p) => p.id === id)?.levels ?? {};

/** Five Coldbrook Admin roles; Analyst was tailored by hand. */
export const defaultTailorRoles: TailorRole[] = [
  {
    id: "owner",
    name: "Owner",
    description: "Always has everything.",
    preset: "full",
    levels: presetLevels("full"),
    locked: true,
  },
  {
    id: "admin",
    name: "Admin",
    description: "Runs the workspace.",
    preset: "full",
    levels: presetLevels("full"),
  },
  {
    id: "editor",
    name: "Editor",
    description: "Works in projects and data.",
    preset: "edit",
    levels: presetLevels("edit"),
  },
  {
    id: "analyst",
    name: "Analyst",
    description: "Reads everything, exports data.",
    preset: null,
    levels: { ...presetLevels("read"), datasets: "allow", exports: "allow" },
  },
  {
    id: "guest",
    name: "Guest",
    description: "Looks, does not touch.",
    preset: "read",
    levels: presetLevels("read"),
  },
];

const NAMES = [
  "Ines Varga",
  "Tomas Reyes",
  "Mara Lind",
  "Kenji Aoki",
  "Priya Nair",
  "Sol Okafor",
  "Ruth Adeyemi",
  "Dario Pell",
  "Hana Brandt",
  "Leo Castellan",
  "Wren Tully",
  "Noor Haddad",
  "Felix Marsh",
  "Imani Cole",
  "Oskar Lindqvist",
  "Beatriz Sousa",
  "Yusuf Demir",
  "Clara Voss",
  "Milo Ferrante",
  "Sade Bankole",
  "Anders Holm",
  "Lucia Moreno",
  "Taro Ishida",
  "Greta Nyberg",
  "Elias Thorne",
  "Amara Diallo",
];

const ROLE_OF = [
  "owner",
  "owner",
  "admin",
  "admin",
  "admin",
  "admin",
  "editor",
  "editor",
  "editor",
  "editor",
  "editor",
  "editor",
  "editor",
  "editor",
  "editor",
  "editor",
  "editor",
  "analyst",
  "analyst",
  "analyst",
  "analyst",
  "analyst",
  "guest",
  "guest",
  "guest",
  "guest",
];

/** 26 members: 2 owners, 4 admins, 11 editors, 5 analysts, 4 guests. */
export const defaultTailorMembers: TailorMember[] = NAMES.map((name, i) => ({
  id: `m-${i + 1}`,
  name,
  roleId: ROLE_OF[i] ?? "guest",
}));

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<TailorAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

const LEVEL_WORD: Record<TailorLevel, string> = {
  none: "None",
  view: "View",
  allow: "Allow",
};

const LEVELS: TailorLevel[] = ["none", "view", "allow"];
const BINARY_LEVELS: TailorLevel[] = ["none", "allow"];

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const TIE_MS = 2800;
const RAIL = 10;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

const levelOf = (role: TailorRole | undefined, id: string): TailorLevel =>
  role?.levels[id] ?? "none";

const levelsFor = (p: TailorPermission) => (p.binary ? BINARY_LEVELS : LEVELS);

/** Clamps a level to the ones a permission has: a binary row has no View. */
const fit = (p: TailorPermission, level: TailorLevel): TailorLevel =>
  p.binary && level === "view" ? "allow" : level;

type Resolved = {
  levels: Record<string, TailorLevel>;
  cascaded: TailorCascade[];
};

/**
 * Sets one permission and whatever it drags along: raising a row raises its
 * requirements to at least View, clearing a row clears the rows that need it.
 */
const resolve = (
  levels: Record<string, TailorLevel>,
  permissions: TailorPermission[],
  id: string,
  to: TailorLevel,
): Resolved => {
  const byId = new Map(permissions.map((p) => [p.id, p]));
  const next = { ...levels, [id]: to };
  const cascaded: TailorCascade[] = [];
  const perm = byId.get(id);
  if (to !== "none") {
    for (const req of perm?.requires ?? []) {
      const target = byId.get(req);
      if (!target) continue;
      const from = next[req] ?? "none";
      if (from !== "none") continue;
      const need: TailorLevel = target.binary ? "allow" : "view";
      next[req] = need;
      cascaded.push({ id: req, from, to: need });
    }
  } else {
    for (const p of permissions) {
      if (!p.requires?.includes(id)) continue;
      const from = next[p.id] ?? "none";
      if (from === "none") continue;
      next[p.id] = "none";
      cascaded.push({ id: p.id, from, to: "none" });
    }
  }
  return { levels: next, cascaded };
};

const matchesPreset = (
  levels: Record<string, TailorLevel>,
  preset: TailorPreset,
  permissions: TailorPermission[],
) =>
  permissions.every(
    (p) => (levels[p.id] ?? "none") === fit(p, preset.levels[p.id] ?? "none"),
  );

/** Counts the members who hold a role, for hosts that show it elsewhere. */
export const countTailorMembers = (members: TailorMember[], roleId: string) =>
  members.filter((m) => m.roleId === roleId).length;

const uniqueId = (base: string, taken: Set<string>) => {
  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "role";

type DensitySpec = {
  row: string;
  text: string;
  seg: string;
  segW: number;
  control: string;
  head: string;
};

const DENSITY: Record<TailorDensity, DensitySpec> = {
  compact: {
    row: "min-h-8 py-0.5",
    text: "text-[12px]",
    seg: "text-[10px]",
    segW: 44,
    control: "h-6",
    head: "pt-2 pb-1",
  },
  cozy: {
    row: "min-h-10 py-1",
    text: "text-[13px]",
    seg: "text-[11px]",
    segW: 52,
    control: "h-7",
    head: "pt-3 pb-1.5",
  },
  roomy: {
    row: "min-h-12 py-1.5",
    text: "text-sm",
    seg: "text-[12px]",
    segW: 60,
    control: "h-8",
    head: "pt-4 pb-2",
  },
};

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Cells                                  */
/* ----------------------------------------------------------------------- */

type ControlProps = {
  permission: TailorPermission;
  level: TailorLevel;
  ghost: TailorLevel | null;
  density: DensitySpec;
  /** Seconds this cell waits before it moves, for a preset's cascade. */
  delay: number;
  motionSafe: boolean;
  disabled: boolean;
  onLevel: (to: TailorLevel) => void;
};

const fillFor = (level: TailorLevel) =>
  level === "allow"
    ? "bg-[color-mix(in_oklab,var(--rt-accent)_20%,transparent)] border-[color-mix(in_oklab,var(--rt-accent)_45%,transparent)]"
    : level === "view"
      ? "bg-card border-hairline-strong"
      : "bg-surface-2 border-transparent";

const wordFor = (level: TailorLevel, chosen: boolean) =>
  !chosen
    ? "text-ink-3"
    : level === "allow"
      ? "text-(--rt-accent)"
      : level === "view"
        ? "text-foreground"
        : "text-ink-2";

/** Keeps focus on the cell: a segment is pressed, never focused. */
const keepFocus = (event: React.PointerEvent) => event.preventDefault();

function Segmented({
  permission,
  level,
  ghost,
  density,
  delay,
  motionSafe,
  disabled,
  onLevel,
}: ControlProps) {
  const levels = levelsFor(permission);
  const n = levels.length;
  const index = Math.max(0, levels.indexOf(level));
  const ghostIndex =
    ghost !== null ? levels.indexOf(fit(permission, ghost)) : -1;
  const width = density.segW * n;
  return (
    <span
      className={cn(
        "relative grid shrink-0 rounded-2 border border-hairline bg-surface-1 p-0.5",
        density.control,
      )}
      style={{ width, gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0.5 rounded-[4px] border transition-colors duration-200",
          fillFor(level),
        )}
        style={{ width: `calc((100% - 4px) / ${n})` }}
        initial={false}
        animate={{ left: `calc(2px + ${index} * (100% - 4px) / ${n})` }}
        transition={
          motionSafe ? { ...springs.snap, delay: r3(delay) } : { duration: 0 }
        }
      />
      {ghostIndex >= 0 && ghostIndex !== index ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 rounded-[4px] border border-dashed border-ink-3"
          style={{
            width: `calc((100% - 4px) / ${n})`,
            left: `calc(2px + ${ghostIndex} * (100% - 4px) / ${n})`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        />
      ) : null}
      {levels.map((l) => (
        <button
          key={l}
          type="button"
          tabIndex={-1}
          aria-label={LEVEL_WORD[l]}
          aria-pressed={l === level}
          aria-disabled={disabled || undefined}
          onPointerDown={keepFocus}
          onClick={() => onLevel(l)}
          className={cn(
            "relative z-10 rounded-[4px] font-medium transition-colors duration-200 outline-none",
            density.seg,
            wordFor(l, l === level),
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          {LEVEL_WORD[l]}
        </button>
      ))}
    </span>
  );
}

function Radios({
  permission,
  level,
  ghost,
  density,
  delay,
  motionSafe,
  disabled,
  onLevel,
}: ControlProps) {
  const levels = levelsFor(permission);
  const ghostLevel = ghost !== null ? fit(permission, ghost) : null;
  return (
    <span
      className={cn("flex shrink-0 items-center gap-2.5", density.control)}
      style={{ width: density.segW * 3 }}
    >
      {levels.map((l) => {
        const chosen = l === level;
        const ghosted = ghostLevel === l && !chosen;
        return (
          <button
            key={l}
            type="button"
            tabIndex={-1}
            aria-label={LEVEL_WORD[l]}
            aria-pressed={chosen}
            aria-disabled={disabled || undefined}
            onPointerDown={keepFocus}
            onClick={() => onLevel(l)}
            className={cn(
              "flex items-center gap-1 font-medium outline-none",
              density.seg,
              wordFor(l, chosen),
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <span
              className={cn(
                "relative flex size-3.5 items-center justify-center rounded-full border transition-colors duration-200",
                chosen
                  ? l === "allow"
                    ? "border-(--rt-accent)"
                    : "border-ink-2"
                  : ghosted
                    ? "border-dashed border-ink-3"
                    : "border-hairline-strong",
              )}
            >
              <motion.span
                aria-hidden
                className={cn(
                  "block size-1.5 rounded-full",
                  l === "allow"
                    ? "bg-(--rt-accent)"
                    : l === "view"
                      ? "bg-foreground"
                      : "bg-ink-2",
                )}
                initial={false}
                animate={{ scale: chosen ? 1 : 0, opacity: chosen ? 1 : 0 }}
                transition={
                  motionSafe
                    ? { ...springs.snap, delay: r3(delay) }
                    : { duration: 0 }
                }
              />
            </span>
            {LEVEL_WORD[l]}
          </button>
        );
      })}
    </span>
  );
}

function Switches({
  permission,
  level,
  ghost,
  density,
  delay,
  motionSafe,
  disabled,
  onLevel,
}: ControlProps) {
  const ghostLevel = ghost !== null ? fit(permission, ghost) : null;
  const items: {
    key: "view" | "allow";
    on: boolean;
    ghostOn: boolean | null;
  }[] = permission.binary
    ? [
        {
          key: "allow",
          on: level === "allow",
          ghostOn: ghostLevel === null ? null : ghostLevel === "allow",
        },
      ]
    : [
        {
          key: "view",
          on: level !== "none",
          ghostOn: ghostLevel === null ? null : ghostLevel !== "none",
        },
        {
          key: "allow",
          on: level === "allow",
          ghostOn: ghostLevel === null ? null : ghostLevel === "allow",
        },
      ];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-end gap-3",
        density.control,
      )}
      style={{ width: density.segW * 3 }}
    >
      {items.map((item) => {
        const toggled = (): TailorLevel =>
          item.key === "allow"
            ? item.on
              ? permission.binary
                ? "none"
                : "view"
              : "allow"
            : item.on
              ? "none"
              : "view";
        const differs = item.ghostOn !== null && item.ghostOn !== item.on;
        return (
          <button
            key={item.key}
            type="button"
            tabIndex={-1}
            role="switch"
            aria-checked={item.on}
            aria-label={LEVEL_WORD[item.key]}
            aria-disabled={disabled || undefined}
            onPointerDown={keepFocus}
            onClick={() => onLevel(toggled())}
            className={cn(
              "flex items-center gap-1.5 font-medium outline-none",
              density.seg,
              item.on
                ? item.key === "allow"
                  ? "text-(--rt-accent)"
                  : "text-foreground"
                : "text-ink-3",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <span
              className={cn(
                "relative block h-4 w-7 rounded-full border transition-colors duration-200",
                item.on
                  ? item.key === "allow"
                    ? "border-transparent bg-(--rt-accent)"
                    : "border-transparent bg-ink-2"
                  : "border-hairline-strong bg-surface-2",
              )}
            >
              {differs ? (
                <span
                  aria-hidden
                  className="absolute top-0.5 block size-2.5 rounded-full border border-dashed border-ink-3"
                  style={{ left: item.ghostOn ? 14 : 2 }}
                />
              ) : null}
              <motion.span
                aria-hidden
                className="absolute top-0.5 left-0.5 block size-2.5 rounded-full bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_30%,transparent)]"
                initial={false}
                animate={{ x: item.on ? 12 : 0 }}
                transition={
                  motionSafe
                    ? { ...springs.snap, delay: r3(delay) }
                    : { duration: 0 }
                }
              />
            </span>
            {LEVEL_WORD[item.key]}
          </button>
        );
      })}
    </span>
  );
}

const CONTROLS: Record<
  TailorControlStyle,
  (props: ControlProps) => React.JSX.Element
> = {
  segmented: Segmented,
  radios: Radios,
  switches: Switches,
};

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Row = { area: TailorArea; permission: TailorPermission; index: number };

type Tie = {
  seq: number;
  from: string;
  to: string[];
  note: string;
  paths: TiePath[];
};

type TiePath = { id: string; d: string; x: number; y: number };

type Wave = { seq: number; order: string[] };

/**
 * A role and permissions editor. Roles stand in a list on the left; on the
 * right a matrix, grouped by area, gives every permission one three-way cell
 * whose indicator slides between None, View and Allow on `springs.snap`.
 * Choosing a preset above the matrix sets every row in a cascade, each
 * indicator leaving a beat after the one above; setting one cell by hand
 * releases the preset chip — its fill eases away — and a Custom tag lands on
 * `springs.recoil`. A row that needs another raises it: allowing Delete
 * projects sets Projects to View, a tie line draws down the rail between the
 * two cells on `springs.glide`, and a note says what was set and why. Compare
 * to overlays another role's choices as dashed ghost marks, and the header's
 * member count rolls as the selected role changes.
 *
 * The matrix is a grid: Up and Down move between rows, Left and Right lower
 * and raise the focused cell, Space or Enter cycles it. The roles are a
 * listbox whose selection follows the arrows, with Delete removing an empty
 * role; the presets are a radio group. Under reduced motion indicators and
 * knobs appear in place, the cascade sets every row at once, and the tie line
 * and note simply appear.
 */
export function RoleTailor({
  controlStyle = "segmented",
  density = "cozy",
  accent = "cobalt",
  roles,
  defaultRoles = defaultTailorRoles,
  onChange,
  areas = defaultTailorAreas,
  presets = defaultTailorPresets,
  members = defaultTailorMembers,
  value,
  defaultValue = "editor",
  onSelect,
  defaultCompareTo = null,
  status = "ready",
  onRetry,
  title = "Roles",
  label,
  height = 540,
  disabled = false,
  className,
}: RoleTailorProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const compareId = `${uid}-compare`;

  const [ownRoles, setOwnRoles] = React.useState<TailorRole[]>(defaultRoles);
  const list = roles ?? ownRoles;
  const [ownValue, setOwnValue] = React.useState<string | null>(defaultValue);
  const selectedId = value === undefined ? ownValue : value;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [compareTo, setCompareTo] = React.useState<string | null>(
    defaultCompareTo,
  );
  const [tie, setTie] = React.useState<Tie | null>(null);
  const [wave, setWave] = React.useState<Wave | null>(null);
  const [activeRow, setActiveRow] = React.useState<string | null>(null);
  const [activeRole, setActiveRole] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so what is already on the
  // page never fades in; true for roles that are added later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const matrixRef = React.useRef<HTMLDivElement | null>(null);
  const cellNodes = React.useRef(new Map<string, HTMLDivElement>());
  const roleNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const presetNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const tieTimer = React.useRef<number | null>(null);
  const focusRole = React.useRef<string | null>(null);

  /* -------------------------------- data ------------------------------- */

  const permissions = allPermissions(areas);
  const byId = new Map(permissions.map((p) => [p.id, p]));
  const rows: Row[] = [];
  for (const area of areas) {
    for (const permission of area.permissions) {
      rows.push({ area, permission, index: rows.length });
    }
  }
  const role = list.find((r) => r.id === selectedId);
  const compared =
    compareTo && compareTo !== role?.id
      ? list.find((r) => r.id === compareTo)
      : undefined;
  const memberCount = role ? countTailorMembers(members, role.id) : 0;
  const locked = role?.locked === true;
  const cellsInert = inert || !role || locked;
  const spec = DENSITY[density] ?? DENSITY.cozy;
  const Control = CONTROLS[controlStyle] ?? Segmented;
  const differs = compared
    ? rows.filter(
        ({ permission }) =>
          levelOf(role, permission.id) !==
          fit(permission, levelOf(compared, permission.id)),
      ).length
    : 0;
  const customCount = list.filter((r) => r.preset === null).length;

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: TailorRole[], change: TailorChange) => {
    if (roles === undefined) setOwnRoles(next);
    onChange?.(next, change);
  };

  const select = (id: string) => {
    if (id === selectedId) return;
    if (value === undefined) setOwnValue(id);
    onSelect?.(id);
    const target = list.find((r) => r.id === id);
    if (target) {
      const n = countTailorMembers(members, id);
      setAnnouncement(
        `${target.name}, ${n} ${n === 1 ? "member" : "members"}${target.locked ? ", locked" : target.preset === null ? ", custom" : ""}.`,
      );
    }
    setTie(null);
    setWave(null);
    if (compareTo === id) setCompareTo(null);
  };

  /**
   * The tie line's geometry, read from the two cells the moment it is drawn:
   * out of the changed cell, down the rail, into the one it set.
   */
  const tiePathsFor = (from: string, to: string[]): TiePath[] => {
    const box = matrixRef.current;
    const origin = cellNodes.current.get(from);
    if (!box || !origin) return [];
    const br = box.getBoundingClientRect();
    const fr = origin.getBoundingClientRect();
    const x0 = fr.left - br.left;
    const y0 = fr.top - br.top + fr.height / 2;
    const paths: TiePath[] = [];
    for (const id of to) {
      const node = cellNodes.current.get(id);
      if (!node) continue;
      const tr = node.getBoundingClientRect();
      const x1 = tr.left - br.left;
      const y1 = tr.top - br.top + tr.height / 2;
      const rail = Math.min(x0, x1) - RAIL;
      paths.push({
        id,
        d: `M ${r3(x0 - 2)} ${r3(y0)} H ${r3(rail)} V ${r3(y1)} H ${r3(x1 - 4)}`,
        x: x1 - 4,
        y: y1,
      });
    }
    return paths;
  };

  const setLevel = (permissionId: string, to: TailorLevel) => {
    if (cellsInert || !role) return;
    const permission = byId.get(permissionId);
    if (!permission) return;
    const target = fit(permission, to);
    const from = levelOf(role, permissionId);
    if (from === target) return;
    const { levels, cascaded } = resolve(
      role.levels,
      permissions,
      permissionId,
      target,
    );
    const match = presets.find((p) => matchesPreset(levels, p, permissions));
    const nextRole: TailorRole = {
      ...role,
      levels,
      preset: match ? match.id : null,
    };
    commit(
      list.map((r) => (r.id === role.id ? nextRole : r)),
      {
        kind: "level",
        roleId: role.id,
        permissionId,
        from,
        to: target,
        cascaded,
      },
    );
    setWave(null);
    let note = "";
    if (cascaded.length > 0) {
      const names = cascaded
        .map((c) => {
          const p = byId.get(c.id);
          return p
            ? target === "none"
              ? p.label
              : `${p.label} to ${LEVEL_WORD[c.to]}`
            : c.id;
        })
        .join(" and ");
      note =
        target === "none"
          ? `Also cleared ${names}: ${cascaded.length === 1 ? "it needs" : "they need"} ${permission.label}.`
          : `Also set ${names}: ${permission.label} needs ${cascaded.length === 1 ? "it" : "them"}.`;
      const to = cascaded.map((c) => c.id);
      const paths = tiePathsFor(permissionId, to);
      setTie((t) => ({
        seq: (t?.seq ?? 0) + 1,
        from: permissionId,
        to,
        note,
        paths,
      }));
    } else {
      setTie(null);
    }
    const became =
      role.preset !== null && !match
        ? ` ${role.name} is now custom.`
        : match && role.preset !== match.id
          ? ` ${role.name} matches ${match.label}.`
          : "";
    setAnnouncement(
      `${permission.label} ${LEVEL_WORD[target]} for ${role.name}.${note ? ` ${note}` : ""}${became}`,
    );
  };

  const applyPreset = (presetId: string) => {
    if (cellsInert || !role) return;
    const preset = presets.find((p) => p.id === presetId);
    if (!preset || role.preset === presetId) return;
    const levels = levelsWhere(areas, (p) =>
      fit(p, preset.levels[p.id] ?? "none"),
    );
    const order = rows
      .filter(
        ({ permission }) =>
          levelOf(role, permission.id) !== levels[permission.id],
      )
      .map(({ permission }) => permission.id);
    commit(
      list.map((r) =>
        r.id === role.id ? { ...r, levels, preset: presetId } : r,
      ),
      { kind: "preset", roleId: role.id, presetId },
    );
    setWave((w) => ({ seq: (w?.seq ?? 0) + 1, order }));
    setTie(null);
    setAnnouncement(
      `${role.name} set to ${preset.label}: ${order.length} ${order.length === 1 ? "row" : "rows"} changed.`,
    );
  };

  const cloneRole = () => {
    if (inert || !role) return;
    const taken = new Set(list.map((r) => r.id));
    const id = uniqueId(`${slug(role.name)}-copy`, taken);
    const names = new Set(list.map((r) => r.name));
    let name = `${role.name} copy`;
    let n = 2;
    while (names.has(name)) {
      name = `${role.name} copy ${n}`;
      n += 1;
    }
    const copy: TailorRole = {
      id,
      name,
      description: `Cloned from ${role.name}.`,
      preset: role.preset,
      levels: { ...role.levels },
    };
    const at = list.findIndex((r) => r.id === role.id);
    const next = [...list.slice(0, at + 1), copy, ...list.slice(at + 1)];
    commit(next, { kind: "clone", roleId: id, fromRoleId: role.id });
    focusRole.current = id;
    setActiveRole(id);
    if (value === undefined) setOwnValue(id);
    onSelect?.(id);
    setTie(null);
    setWave(null);
    setAnnouncement(`${name} added, cloned from ${role.name}. 0 members.`);
  };

  const newRole = () => {
    if (inert) return;
    const taken = new Set(list.map((r) => r.id));
    const id = uniqueId("new-role", taken);
    const names = new Set(list.map((r) => r.name));
    let name = "New role";
    let n = 2;
    while (names.has(name)) {
      name = `New role ${n}`;
      n += 1;
    }
    const empty = levelsWhere(areas, () => "none");
    const match = presets.find((p) => matchesPreset(empty, p, permissions));
    const created: TailorRole = {
      id,
      name,
      description: "Starts with nothing.",
      preset: match ? match.id : null,
      levels: empty,
    };
    commit([...list, created], { kind: "create", roleId: id });
    focusRole.current = id;
    setActiveRole(id);
    if (value === undefined) setOwnValue(id);
    onSelect?.(id);
    setTie(null);
    setWave(null);
    setAnnouncement(`${name} added with no access. 0 members.`);
  };

  const removeRole = (id: string) => {
    if (inert) return;
    const target = list.find((r) => r.id === id);
    if (!target || target.locked) return;
    if (countTailorMembers(members, id) > 0) {
      setAnnouncement(`${target.name} still has members and was not removed.`);
      return;
    }
    const at = list.findIndex((r) => r.id === id);
    const next = list.filter((r) => r.id !== id);
    commit(next, { kind: "remove", roleId: id });
    const neighbour = next[Math.min(at, next.length - 1)];
    if (selectedId === id) {
      const nid = neighbour?.id ?? null;
      if (value === undefined) setOwnValue(nid);
      if (nid) onSelect?.(nid);
    }
    if (neighbour) {
      focusRole.current = neighbour.id;
      setActiveRole(neighbour.id);
    }
    if (compareTo === id) setCompareTo(null);
    setAnnouncement(`${target.name} removed.`);
  };

  /* ------------------------------ tie line ----------------------------- */

  React.useEffect(() => {
    if (!tie) return;
    if (tieTimer.current !== null) window.clearTimeout(tieTimer.current);
    tieTimer.current = window.setTimeout(() => {
      tieTimer.current = null;
      setTie(null);
    }, TIE_MS);
    return () => {
      if (tieTimer.current !== null) window.clearTimeout(tieTimer.current);
      tieTimer.current = null;
    };
  }, [tie]);

  // A role added or removed takes focus once the list has re-rendered.
  React.useLayoutEffect(() => {
    const id = focusRole.current;
    if (!id) return;
    focusRole.current = null;
    roleNodes.current.get(id)?.focus({ preventScroll: true });
  }, [list]);

  /* ------------------------------ keyboard ----------------------------- */

  const rowIds = rows.map((r) => r.permission.id);
  const activeCell =
    activeRow && rowIds.includes(activeRow) ? activeRow : (rowIds[0] ?? null);

  const onCellKey = (event: React.KeyboardEvent, row: Row) => {
    const { permission, index } = row;
    const levels = levelsFor(permission);
    const current = levelOf(role, permission.id);
    const at = levels.indexOf(current);
    let to: number | null = null;
    if (event.key === "ArrowDown") to = index + 1;
    else if (event.key === "ArrowUp") to = index - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = rows.length - 1;
    else if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = levels[Math.min(levels.length - 1, at + 1)];
      if (next) setLevel(permission.id, next);
      return;
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const next = levels[Math.max(0, at - 1)];
      if (next) setLevel(permission.id, next);
      return;
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const next = levels[(at + 1) % levels.length];
      if (next) setLevel(permission.id, next);
      return;
    } else return;
    event.preventDefault();
    const target = rows[clamp(to, 0, rows.length - 1)];
    if (target) cellNodes.current.get(target.permission.id)?.focus();
  };

  const roleIds = list.map((r) => r.id);
  const activeOption =
    activeRole && roleIds.includes(activeRole)
      ? activeRole
      : ((selectedId && roleIds.includes(selectedId) ? selectedId : null) ??
        roleIds[0] ??
        null);

  const onRoleKey = (event: React.KeyboardEvent, id: string) => {
    const i = roleIds.indexOf(id);
    let to: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = roleIds.length - 1;
    else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeRole(id);
      return;
    } else return;
    event.preventDefault();
    const target = roleIds[clamp(to, 0, roleIds.length - 1)];
    if (target) {
      roleNodes.current.get(target)?.focus();
      select(target);
    }
  };

  const presetIds = presets.map((p) => p.id);
  const activePreset =
    role?.preset && presetIds.includes(role.preset)
      ? role.preset
      : (presetIds[0] ?? null);

  const onPresetKey = (event: React.KeyboardEvent, id: string) => {
    const i = presetIds.indexOf(id);
    let to: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = presetIds.length - 1;
    else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      applyPreset(id);
      return;
    } else return;
    event.preventDefault();
    const target = presetIds[clamp(to, 0, presetIds.length - 1)];
    if (target) {
      presetNodes.current.get(target)?.focus();
      applyPreset(target);
    }
  };

  /* ------------------------------- render ------------------------------ */

  const step = cascade(Math.max(2, wave?.order.length ?? rows.length));
  const delayFor = (id: string) => {
    if (!wave) return 0;
    const i = wave.order.indexOf(id);
    return i < 0 ? 0 : Math.min(i, 14) * step;
  };
  const empty = ready && rows.length === 0;
  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;

  const roleOption = (r: TailorRole) => {
    const selected = r.id === selectedId;
    const n = countTailorMembers(members, r.id);
    const presetLabel = r.locked
      ? "Locked"
      : r.preset === null
        ? "Custom"
        : (presets.find((p) => p.id === r.preset)?.label ?? "Preset");
    return (
      <motion.li
        key={r.id}
        role="presentation"
        layout={motionSafe ? "position" : false}
        initial={
          live ? { opacity: 0, y: motionSafe ? distances.nudge : 0 } : false
        }
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={{
          layout: springs.glide,
          y: motionSafe ? springs.glide : { duration: 0 },
          opacity: { duration: durations.base, ease: easings.enter },
        }}
        className="min-w-0 @min-[40rem]:w-full"
      >
        <button
          ref={(node) => {
            if (node) roleNodes.current.set(r.id, node);
            else roleNodes.current.delete(r.id);
          }}
          type="button"
          role="option"
          aria-selected={selected}
          aria-describedby={hintId}
          tabIndex={activeOption === r.id ? 0 : -1}
          aria-disabled={inert || undefined}
          onFocus={() => setActiveRole(r.id)}
          onClick={() => {
            if (!inert) select(r.id);
          }}
          onKeyDown={(event) => onRoleKey(event, r.id)}
          className={cn(
            "relative flex w-full items-center gap-2 rounded-2 border text-left transition-colors",
            "h-8 border-hairline px-2.5 @min-[40rem]:h-auto @min-[40rem]:border-transparent @min-[40rem]:py-1.5 @min-[40rem]:pr-2 @min-[40rem]:pl-3",
            selected
              ? "bg-[color-mix(in_oklab,var(--rt-accent)_10%,transparent)] text-foreground @min-[40rem]:bg-surface-1"
              : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
            inert ? "cursor-default" : "cursor-pointer",
            FOCUS_RING,
          )}
        >
          {selected ? (
            motionSafe ? (
              <motion.span
                aria-hidden
                layoutId={`${uid}-role-mark`}
                transition={springs.snap}
                className="absolute top-1.5 bottom-1.5 left-0 hidden w-0.5 rounded-full bg-(--rt-accent) @min-[40rem]:block"
              />
            ) : (
              <span
                aria-hidden
                className="absolute top-1.5 bottom-1.5 left-0 hidden w-0.5 rounded-full bg-(--rt-accent) @min-[40rem]:block"
              />
            )
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[13px] font-medium">{r.name}</span>
              {r.locked ? (
                <Lock aria-hidden className="size-3 shrink-0 text-ink-3" />
              ) : null}
            </span>
            <span className="hidden truncate text-[11px] text-ink-3 @min-[40rem]:block">
              {presetLabel}
            </span>
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
            {n}
          </span>
          <span className="sr-only">
            {n === 1 ? "member" : "members"}, {presetLabel}
          </span>
        </button>
      </motion.li>
    );
  };

  const rolesPane = (
    <div className="flex min-h-0 shrink-0 flex-col gap-2 border-b border-hairline px-3 pt-3 pb-3 @min-[40rem]:w-[11.5rem] @min-[40rem]:border-r @min-[40rem]:border-b-0 @min-[40rem]:pt-2">
      <div className="flex min-h-0 flex-1 flex-col">
        {status === "loading" ? (
          <div
            aria-hidden
            className="flex flex-wrap gap-1.5 @min-[40rem]:flex-col"
          >
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className="h-8 rounded-2 bg-surface-2 motion-safe:animate-pulse @min-[40rem]:h-10"
                style={{
                  width: 64 + ((i * 17) % 30),
                  animationDelay: `${i * 70}ms`,
                }}
              />
            ))}
          </div>
        ) : status === "error" ? null : list.length === 0 ? (
          <p className="px-1 py-2 text-[12px] text-ink-3">
            No roles yet. New role starts one with no access.
          </p>
        ) : (
          <ul
            role="listbox"
            aria-label="Roles"
            className="flex min-h-0 flex-wrap gap-1.5 @min-[40rem]:flex-col @min-[40rem]:gap-0.5 @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {list.map((r) => roleOption(r))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      {status === "error" ? null : (
        <div className="flex shrink-0 gap-1.5 @min-[40rem]:flex-col">
          <button
            type="button"
            onClick={cloneRole}
            aria-disabled={inert || !role || undefined}
            className={cn(
              "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-2 border border-hairline px-2 text-xs transition-colors",
              inert || !role
                ? "cursor-default text-ink-3"
                : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <Copy aria-hidden className="size-3.5" />
            Clone
          </button>
          <button
            type="button"
            onClick={newRole}
            aria-disabled={inert || undefined}
            className={cn(
              "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-2 border border-hairline px-2 text-xs transition-colors",
              inert
                ? "cursor-default text-ink-3"
                : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <Plus aria-hidden className="size-3.5" />
            New role
          </button>
        </div>
      )}
    </div>
  );

  const presetRow = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3 pb-2.5">
      <div
        role="radiogroup"
        aria-label="Preset"
        className="flex min-w-0 flex-wrap items-center gap-1.5"
      >
        {presets.map((p) => {
          const checked = role?.preset === p.id;
          return (
            <button
              key={p.id}
              ref={(node) => {
                if (node) presetNodes.current.set(p.id, node);
                else presetNodes.current.delete(p.id);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={cellsInert || undefined}
              tabIndex={activePreset === p.id ? 0 : -1}
              onClick={() => applyPreset(p.id)}
              onKeyDown={(event) => onPresetKey(event, p.id)}
              className={cn(
                "relative h-7 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-200",
                checked
                  ? "border-transparent text-(--rt-accent)"
                  : "border-hairline-strong text-ink-2",
                cellsInert
                  ? "cursor-default"
                  : "cursor-pointer hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <AnimatePresence initial={false}>
                {checked ? (
                  <motion.span
                    key="fill"
                    aria-hidden
                    className="absolute inset-0 rounded-full border border-[color-mix(in_oklab,var(--rt-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--rt-accent)_14%,transparent)]"
                    initial={{ opacity: 0, scale: motionSafe ? 0.92 : 1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{
                      opacity: 0,
                      scale: motionSafe ? 0.94 : 1,
                      transition: exitFor(durations.base),
                    }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  />
                ) : null}
              </AnimatePresence>
              <span className="relative">{p.label}</span>
            </button>
          );
        })}
        <AnimatePresence initial={false}>
          {role && !role.locked && role.preset === null ? (
            <motion.span
              key="custom"
              className="inline-flex h-7 items-center rounded-full border border-dashed border-hairline-strong px-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
              initial={{ opacity: 0, scale: motionSafe ? 0.8 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.recoil, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              Custom
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <label
          htmlFor={compareId}
          className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Compare to
        </label>
        <select
          id={compareId}
          value={compared?.id ?? ""}
          disabled={inert || !role}
          onChange={(event) => {
            const id = event.target.value || null;
            setCompareTo(id);
            const other = list.find((r) => r.id === id);
            setAnnouncement(
              other ? `Comparing to ${other.name}.` : "Comparison cleared.",
            );
          }}
          className={cn(
            "h-7 max-w-[9rem] min-w-0 rounded-2 border border-hairline bg-card px-2 text-xs text-foreground",
            FOCUS_RING,
          )}
        >
          <option value="">Nothing</option>
          {list
            .filter((r) => r.id !== role?.id)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </div>
    </div>
  );

  const matrix = (
    <div
      ref={matrixRef}
      role="grid"
      aria-label={role ? `${role.name} permissions` : "Permissions"}
      aria-readonly={cellsInert || undefined}
      className="relative flex flex-col px-4 pb-3"
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
      >
        <AnimatePresence>
          {tie
            ? tie.paths.map((p) => (
                <React.Fragment key={`${tie.seq}-${p.id}`}>
                  <motion.path
                    d={p.d}
                    fill="none"
                    stroke="var(--rt-accent)"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={
                      motionSafe
                        ? { pathLength: 0, opacity: 1 }
                        : { opacity: 0 }
                    }
                    animate={{ pathLength: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.base) }}
                    transition={
                      motionSafe ? springs.glide : { duration: durations.fast }
                    }
                  />
                  <motion.circle
                    cx={p.x}
                    cy={p.y}
                    r={3}
                    fill="var(--rt-accent)"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.base) }}
                    style={{ originX: `${p.x}px`, originY: `${p.y}px` }}
                    transition={
                      motionSafe
                        ? { ...springs.recoil, delay: 0.28 }
                        : { duration: durations.fast }
                    }
                  />
                </React.Fragment>
              ))
            : null}
        </AnimatePresence>
      </svg>
      {areas.map((area) =>
        area.permissions.length === 0 ? null : (
          <div key={area.id} role="rowgroup" className="flex flex-col">
            <div role="row" className={cn("flex items-center", spec.head)}>
              <span
                role="rowheader"
                className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                {area.label}
              </span>
            </div>
            {area.permissions.map((permission) => {
              const row = rows.find((r) => r.permission.id === permission.id);
              if (!row) return null;
              const level = levelOf(role, permission.id);
              const ghost = compared
                ? fit(permission, levelOf(compared, permission.id))
                : null;
              const tied =
                tie !== null &&
                (tie.from === permission.id || tie.to.includes(permission.id));
              return (
                <div
                  key={permission.id}
                  role="row"
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-hairline",
                    spec.row,
                  )}
                >
                  <span
                    role="rowheader"
                    id={`${uid}-p-${permission.id}`}
                    className="flex min-w-0 flex-col"
                  >
                    <span
                      className={cn(
                        "truncate transition-colors duration-200",
                        spec.text,
                        tied ? "text-(--rt-accent)" : "text-foreground",
                      )}
                    >
                      {permission.label}
                    </span>
                    {permission.note ? (
                      <span className="hidden truncate text-[11px] text-ink-3 @min-[40rem]:block">
                        {permission.note}
                      </span>
                    ) : null}
                  </span>
                  <div
                    ref={(node) => {
                      if (node) cellNodes.current.set(permission.id, node);
                      else cellNodes.current.delete(permission.id);
                    }}
                    role="gridcell"
                    tabIndex={activeCell === permission.id ? 0 : -1}
                    aria-label={`${permission.label}, ${LEVEL_WORD[level]}${ghost !== null && ghost !== level && compared ? `, ${compared.name} ${LEVEL_WORD[ghost]}` : ""}`}
                    aria-describedby={hintId}
                    aria-disabled={cellsInert || undefined}
                    onFocus={() => setActiveRow(permission.id)}
                    onKeyDown={(event) => onCellKey(event, row)}
                    className={cn(
                      "flex items-center justify-end rounded-2",
                      cellsInert && "opacity-70",
                      FOCUS_RING,
                    )}
                  >
                    <Control
                      permission={permission}
                      level={level}
                      ghost={ghost}
                      density={spec}
                      delay={delayFor(permission.id)}
                      motionSafe={motionSafe}
                      disabled={cellsInert}
                      onLevel={(to) => {
                        setLevel(permission.id, to);
                        cellNodes.current.get(permission.id)?.focus({
                          preventScroll: true,
                        });
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ),
      )}
    </div>
  );

  const matrixPane = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The roles didn&apos;t load.</p>
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
        <div aria-hidden className="flex flex-col gap-3 px-4 py-3">
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className="h-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{
                  width: 64 + ((i * 19) % 28),
                  animationDelay: `${i * 70}ms`,
                }}
              />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="flex h-9 items-center justify-between border-t border-hairline"
              >
                <span
                  className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    width: 80 + ((i * 31) % 60),
                    animationDelay: `${i * 90}ms`,
                  }}
                />
                <span
                  className="h-6 w-36 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
              </span>
            ))}
          </div>
        </div>
      ) : empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <Inbox aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">No permissions defined.</p>
          <p className="max-w-[18rem] text-[12px] text-ink-3">
            Give the editor areas with permissions and every role gets a row for
            each.
          </p>
        </div>
      ) : !role ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <Users aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">Pick a role to tailor it.</p>
        </div>
      ) : (
        <>
          {presetRow}
          <div className="relative min-h-[1.25rem] px-4">
            <AnimatePresence initial={false}>
              {tie ? (
                <motion.p
                  key={tie.seq}
                  className="flex items-start gap-1.5 pb-2 text-[11px] text-ink-2"
                  initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.glide,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <span
                    aria-hidden
                    className="mt-[5px] block size-1.5 shrink-0 rounded-full bg-(--rt-accent)"
                  />
                  <span>{tie.note}</span>
                </motion.p>
              ) : locked ? (
                <motion.p
                  key="locked"
                  className="flex items-center gap-1.5 pb-2 text-[11px] text-ink-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast }}
                >
                  <Lock aria-hidden className="size-3" />
                  {role.name} always has everything; clone it to tailor a copy.
                </motion.p>
              ) : compared ? (
                <motion.p
                  key={`cmp-${compared.id}`}
                  className="flex items-center gap-1.5 pb-2 text-[11px] text-ink-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast }}
                >
                  <span
                    aria-hidden
                    className="block h-2.5 w-4 rounded-[3px] border border-dashed border-ink-3"
                  />
                  Dashed marks are {compared.name}&apos;s choices
                  {differs === 0
                    ? ": no differences"
                    : `: ${differs} ${differs === 1 ? "row differs" : "rows differ"}`}
                  .
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {matrix}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--rt-accent" as string]: accentVar }}
    >
      <p id={hintId} className="sr-only">
        In the matrix, Up and Down move between rows, Left and Right lower and
        raise a permission, Space cycles it. In the roles, arrows select and
        Delete removes an empty role.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready && customCount > 0 ? (
            <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[30rem]:inline">
              {customCount} custom
            </span>
          ) : null}
        </div>
        {ready && role ? (
          <p className="flex shrink-0 items-baseline gap-1 text-[12px] text-ink-2">
            <Users aria-hidden className="size-3.5 self-center text-ink-3" />
            <span className="sr-only">
              {memberCount} {memberCount === 1 ? "member" : "members"} in{" "}
              {role.name}
            </span>
            <Roll
              value={memberCount}
              motionSafe={motionSafe}
              className="font-mono text-[13px] text-foreground"
            />
            <span aria-hidden>{memberCount === 1 ? "member" : "members"}</span>
            <span aria-hidden className="hidden truncate @min-[30rem]:inline">
              in {role.name}
            </span>
          </p>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row">
        {rolesPane}
        {matrixPane}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
