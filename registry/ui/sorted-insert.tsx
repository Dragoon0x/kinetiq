"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  CornerDownLeft,
  LoaderCircle,
  PenLine,
  Plus,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type SortedInsertAccent = "cobalt" | "plum" | "mint" | "ink";
export type SortedInsertSort = "name" | "recent" | "size";
export type SortedInsertHighlight = "wash" | "bar" | "ring";
export type SortedInsertStatus = "ready" | "loading" | "error";

export type InsertSection = {
  id: string;
  label: string;
  /** What one item is called: "client". */
  noun: string;
};

export type InsertItem = {
  id: string;
  name: string;
  /** The section it lives in. */
  section: string;
  /** When it was added, as an ISO date; newest first under "recent". */
  createdAt: string;
  /** Projects with the studio; most first under "size". @default 0 */
  projects?: number;
};

export type SortedInsertHandle = {
  /** Opens the inline field in a section (default: the focused or first), optionally with text. Does not move focus. */
  startCreate: (sectionId?: string, text?: string) => void;
  /** Replaces the open field's text. */
  typeDraft: (text: string) => void;
  /** Presses Enter in the open field. */
  submitDraft: () => void;
  /** Presses Escape in the open field. */
  cancelDraft: () => void;
};

export type SortedInsertProps = {
  ref?: React.Ref<SortedInsertHandle>;
  /** The sections, top to bottom. @default defaultInsertSections */
  sections?: InsertSection[];
  /** Controlled items. */
  items?: InsertItem[];
  /** Initial items when uncontrolled. @default defaultInsertItems */
  defaultItems?: InsertItem[];
  /** Fires with the whole list after an add or a rename. */
  onItemsChange?: (items: InsertItem[]) => void;
  /** The order within each section: by name, newest first, or most projects first. @default "name" */
  sortBy?: SortedInsertSort;
  /** How a row shows where it landed: a wash, a bar on its edge, or a ring. @default "wash" */
  highlight?: SortedInsertHighlight;
  /** Field, highlight and selection. A name or any CSS colour. @default "cobalt" */
  accent?: SortedInsertAccent | (string & {});
  /** The longest name the field accepts. @default 40 */
  maxNameLength?: number;
  /** Your own naming rule: return a message to refuse the name, or null. */
  validateName?: (
    name: string,
    sectionId: string,
    items: InsertItem[],
  ) => string | null;
  /** A name was accepted. Return a promise and the row shows as creating until it settles; a rejection takes the row back out. */
  onCreate?: (name: string, sectionId: string) => void | Promise<unknown>;
  /** A row was renamed. */
  onRename?: (id: string, name: string, previous: string) => void;
  /** The field was closed without saving. */
  onCancel?: (kind: "create" | "rename", target: string) => void;
  /** Controlled selected item id. */
  selected?: string;
  /** Initial selection when uncontrolled. @default the first item */
  defaultSelected?: string;
  /** A row was chosen. */
  onSelect?: (id: string) => void;
  /** Today, as an ISO date: the createdAt of new rows. @default "2026-10-14" */
  now?: string;
  /** Whether the items have arrived. @default "ready" */
  status?: SortedInsertStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** Every row's height in px. @default 34 */
  rowHeight?: number;
  /** The studio in the header. @default { name: "Fernworks", initials: "Fw" } */
  studio?: { name: string; initials: string };
  /** The frame's height in px. @default 520 */
  frameHeight?: number;
  /** The sidebar's heading and accessible name. @default "Clients" */
  title?: string;
  /** Read only: nothing can be added, renamed or chosen. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultInsertSections: InsertSection[] = [
  { id: "clients", label: "Clients", noun: "client" },
  { id: "prospects", label: "Prospects", noun: "prospect" },
];

const it = (
  id: string,
  name: string,
  section: string,
  createdAt: string,
  projects: number,
): InsertItem => ({ id, name, section, createdAt, projects });

/** A Fernworks studio's clients and the prospects it is talking to. */
export const defaultInsertItems: InsertItem[] = [
  it("alder", "Alder & Pike", "clients", "2024-03-11", 4),
  it("basinworks", "Basinworks", "clients", "2023-09-02", 7),
  it("coldbrook", "Coldbrook Bank", "clients", "2025-01-20", 3),
  it("harbour", "Harbour Press", "clients", "2022-11-14", 9),
  it("kestrel", "Kestrel Labs", "clients", "2026-02-03", 2),
  it("millrace", "Millrace Steel", "clients", "2024-07-22", 5),
  it("northbeam", "Northbeam Radio", "clients", "2025-06-30", 1),
  it("tidewater", "Tidewater Foods", "clients", "2023-04-18", 6),
  it("waylight", "Waylight", "clients", "2026-08-12", 2),
  it("fieldline", "Fieldline", "prospects", "2026-09-21", 0),
  it("gaugeworks", "Gaugeworks", "prospects", "2026-10-02", 0),
  it("quill", "Quill & Oar", "prospects", "2026-08-28", 0),
  it("sable", "Sable Ferries", "prospects", "2026-07-15", 0),
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<SortedInsertAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Avatar pigments: fixed lightness, so white initials read in both themes. */
const HUES = [25, 70, 150, 200, 262, 320];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** How long the landing highlight holds: long enough to find the row. */
const HIGHLIGHT_MS = 1600;
const HEADER_H = 30;
const SECTION_GAP = 10;
const ERROR_H = 20;
const SWITCH_H = 30;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const tintOf = (name: string) =>
  `oklch(0.6 0.11 ${HUES[hash(name.toLowerCase()) % HUES.length] ?? 262})`;
const initialsOf = (name: string) => {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const a = words[0]?.[0] ?? "";
  const b = words[1]?.[0] ?? words[0]?.[1] ?? "";
  return (a + b).toUpperCase();
};
const normalize = (name: string) => name.replace(/\s+/g, " ").trim();
const keyOf = (name: string) => normalize(name).toLowerCase();
const sinceLabel = (iso: string) => {
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1] ?? ""} ${y ?? ""}`.trim();
};

const compare = (sort: SortedInsertSort) => (a: InsertItem, b: InsertItem) => {
  const byName =
    keyOf(a.name) < keyOf(b.name) ? -1 : keyOf(a.name) > keyOf(b.name) ? 1 : 0;
  if (sort === "recent") {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return byName;
  }
  if (sort === "size") {
    const d = (b.projects ?? 0) - (a.projects ?? 0);
    return d !== 0 ? d : byName;
  }
  return byName;
};

type Draft = {
  mode: "create" | "rename";
  section: string;
  /** The row being renamed. */
  id: string | null;
  value: string;
  error: string | null;
  /** Bumps on every refusal, so the nudge plays again. */
  nudge: number;
  /** Opened by a person (focus the field) or by the host (leave focus be). */
  focus: boolean;
};

/* ----------------------------------------------------------------------- */
/*                                   Row                                    */
/* ----------------------------------------------------------------------- */

type RowProps = {
  item: InsertItem;
  y: number;
  from: number | null;
  rowH: number;
  flyKey: number;
  hlKey: number;
  highlight: SortedInsertHighlight;
  highlightMs: number;
  creating: boolean;
  selected: boolean;
  tabbable: boolean;
  renaming: boolean;
  motionSafe: boolean;
  disabled: boolean;
  setsize: number;
  posinset: number;
  onChoose: (id: string) => void;
  onKey: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    item: InsertItem,
  ) => void;
  onRename: (item: InsertItem) => void;
  field: React.ReactNode;
};

function Row({
  item,
  y: targetY,
  from,
  rowH,
  flyKey,
  hlKey,
  highlight,
  highlightMs,
  creating,
  selected,
  tabbable,
  renaming,
  motionSafe,
  disabled,
  setsize,
  posinset,
  onChoose,
  onKey,
  onRename,
  field,
}: RowProps) {
  const y = useMotionValue(from ?? targetY);
  const x = useMotionValue(0);
  const lift = useMotionValue(0);
  const hl = useMotionValue(0);
  const flown = React.useRef(0);

  // Ordinary moves glide; a row in flight to its sorted place rides 8px
  // aside, lifted, while the rows it passes slide up, then settles home on
  // snap. The spring starts from wherever the row is, with its speed.
  React.useEffect(() => {
    const running: AnimationPlaybackControls[] = [];
    const flying = flyKey !== flown.current;
    flown.current = flyKey;
    const fromY = y.get();
    if (!motionSafe) {
      y.jump(targetY);
      x.jump(0);
      lift.jump(0);
      return;
    }
    if (flying && Math.abs(fromY - targetY) > 2) {
      running.push(
        animate(x.get(), 8, {
          ...springs.flick,
          onUpdate: (v) => x.set(r2(v)),
        }),
        animate(lift.get(), 1, {
          duration: durations.fast,
          ease: easings.enter,
          onUpdate: (v) => lift.set(r2(v)),
        }),
        animate(fromY, targetY, {
          ...springs.glide,
          velocity: y.getVelocity(),
          onUpdate: (v) => y.set(r2(v)),
          onComplete: () => {
            running.push(
              animate(x.get(), 0, {
                ...springs.snap,
                onUpdate: (v) => x.set(r2(v)),
              }),
              animate(lift.get(), 0, {
                duration: durations.base,
                ease: easings.move,
                onUpdate: (v) => lift.set(r2(v)),
              }),
            );
          },
        }),
      );
    } else if (Math.abs(fromY - targetY) > 0.5) {
      running.push(
        animate(fromY, targetY, {
          ...springs.glide,
          velocity: y.getVelocity(),
          onUpdate: (v) => y.set(r2(v)),
        }),
      );
    }
    return () => {
      for (const c of running) c.stop();
      // A re-run picks up from here; only the lift must not be left on.
      x.set(0);
      lift.set(0);
    };
  }, [targetY, flyKey, motionSafe, x, y, lift]);

  // The landing highlight: arrives as the row settles, holds, then fades.
  React.useEffect(() => {
    if (hlKey === 0) return;
    const total = Math.max(0.4, highlightMs / 1000);
    const ctrl = animate(0, 1, {
      duration: total,
      ease: easings.linear,
      onUpdate: (t) => {
        const arrive = motionSafe ? 0.28 / total : 0;
        const fade = 0.62;
        const v =
          t < arrive
            ? 0
            : t < arrive + 0.12
              ? (t - arrive) / 0.12
              : t < fade
                ? 1
                : Math.max(0, 1 - (t - fade) / (1 - fade));
        hl.set(r2(v));
      },
      onComplete: () => hl.set(0),
    });
    return () => {
      ctrl.stop();
      hl.set(0);
    };
  }, [hlKey, highlightMs, motionSafe, hl]);

  const shadow = useLiftShadow(lift);

  return (
    <motion.div
      role="listitem"
      aria-setsize={setsize}
      aria-posinset={posinset}
      className="absolute inset-x-1.5 top-0"
      style={{ y, x, height: rowH, zIndex: flyKey ? 2 : 1 }}
    >
      {renaming ? (
        field
      ) : (
        <motion.button
          type="button"
          data-si-row={item.id}
          aria-current={selected ? "true" : undefined}
          aria-busy={creating || undefined}
          aria-label={`${item.name}${creating ? ", adding" : ""}, ${plural(item.projects ?? 0, "project")}`}
          tabIndex={tabbable ? 0 : -1}
          disabled={disabled}
          onClick={() => onChoose(item.id)}
          onDoubleClick={() => onRename(item)}
          onKeyDown={(event) => onKey(event, item)}
          className={cn(
            "group/sorted-insert relative flex h-full w-full items-center gap-2.5 rounded-2 px-2 text-left text-[13px]",
            selected
              ? "bg-[var(--si-wash)] font-medium text-foreground"
              : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS_IN,
          )}
          style={{ boxShadow: shadow }}
        >
          {/* A row in flight is a solid card, so the rows it passes stay
              under it instead of reading through it. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2 bg-popover"
            style={{ opacity: lift }}
          />
          {highlight === "wash" ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2 bg-[color-mix(in_oklab,var(--si-ink)_18%,transparent)]"
              style={{ opacity: hl }}
            />
          ) : highlight === "bar" ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-1.5 left-0 w-[3px] origin-top rounded-full bg-[var(--si-ink)]"
              style={{ opacity: hl, scaleY: hl }}
            />
          ) : (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2 shadow-[inset_0_0_0_1.5px_var(--si-ink)]"
              style={{ opacity: hl }}
            />
          )}
          <span
            aria-hidden
            className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-[9px] font-semibold text-white"
            style={{ backgroundColor: tintOf(item.name) }}
          >
            {initialsOf(item.name)}
          </span>
          <span
            className={cn(
              "relative min-w-0 flex-1 truncate",
              creating && "text-ink-3",
            )}
            title={item.name}
          >
            {item.name}
          </span>
          {creating ? (
            <LoaderCircle
              aria-hidden
              className={cn(
                "relative size-3.5 shrink-0 text-ink-3",
                motionSafe && "animate-spin",
              )}
            />
          ) : (
            <span className="relative shrink-0 font-mono text-[10.5px] text-ink-3 tabular-nums">
              {item.projects ? item.projects : "new"}
            </span>
          )}
        </motion.button>
      )}
    </motion.div>
  );
}

/** A soft shadow under a row in flight, from its lift. */
function useLiftShadow(lift: MotionValue<number>) {
  const shadow = useMotionValue("none");
  React.useEffect(
    () =>
      lift.on("change", (v) =>
        shadow.set(
          v > 0.01
            ? `0 ${r2(6 * v)}px ${r2(18 * v)}px -6px color-mix(in oklab, var(--foreground) ${Math.round(28 * v)}%, transparent)`
            : "none",
        ),
      ),
    [lift, shadow],
  );
  return shadow;
}

/** The field's place in the list: it opens out of its slot on glide. */
function FieldSlot({
  y,
  motionSafe,
  children,
}: {
  y: number;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="absolute inset-x-1.5 top-0 z-[3]"
      style={{ y }}
      initial={{ opacity: 0, scaleY: motionSafe ? 0.6 : 1 }}
      animate={{
        opacity: 1,
        scaleY: 1,
        transition: {
          opacity: { duration: durations.base, ease: easings.enter },
          scaleY: motionSafe ? springs.glide : { duration: 0 },
        },
      }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
    >
      {children}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Field                                   */
/* ----------------------------------------------------------------------- */

function DraftField({
  draft: d,
  sections,
  items,
  narrow,
  rowH,
  maxNameLength,
  motionSafe,
  disabled,
  errId,
  hintId,
  bindInput,
  onValue,
  onSection,
  onSubmit,
  onCancel,
  frameRef,
}: {
  draft: Draft;
  sections: InsertSection[];
  items: InsertItem[];
  narrow: boolean;
  rowH: number;
  maxNameLength: number;
  motionSafe: boolean;
  disabled: boolean;
  errId: string;
  hintId: string;
  bindInput: (node: HTMLInputElement | null) => void;
  onValue: (text: string) => void;
  onSection: (id: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  frameRef: React.RefObject<HTMLDivElement | null>;
}) {
  const section = sections.find((s) => s.id === d.section);
  const noun = section?.noun ?? "item";
  const shownInitials = initialsOf(d.value);

  // A refused name shakes its head: a short tween, never a spring, once
  // per refusal, so a second Enter on the same mistake still answers.
  const x = useMotionValue(0);
  React.useEffect(() => {
    if (d.nudge === 0 || !motionSafe) return;
    const ctrl = animate(0, [0, -6, 6, -4, 4, -2, 0], {
      duration: 0.36,
      ease: easings.move,
      onUpdate: (v) => x.set(r2(v)),
    });
    return () => {
      ctrl.stop();
      x.set(0);
    };
  }, [d.nudge, motionSafe, x]);

  return (
    <motion.div className="flex flex-col gap-1" style={{ x }}>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-2 border bg-card px-2 shadow-[0_2px_10px_-4px_color-mix(in_oklab,var(--foreground)_22%,transparent)] transition-colors",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-1 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
          d.error
            ? "border-[color-mix(in_oklab,var(--danger)_70%,transparent)]"
            : "border-[var(--si-ink)]",
        )}
        style={{ height: rowH + 2 }}
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-[9px] font-semibold",
            shownInitials
              ? "text-white"
              : "border border-dashed border-hairline-strong text-ink-3",
          )}
          style={
            shownInitials ? { backgroundColor: tintOf(d.value) } : undefined
          }
        >
          {shownInitials || <Plus className="size-3" />}
        </span>
        <input
          ref={bindInput}
          value={d.value}
          maxLength={maxNameLength + 20}
          disabled={disabled}
          aria-label={
            d.mode === "rename"
              ? `Rename ${items.find((i) => i.id === d.id)?.name ?? noun}`
              : `New ${noun} in ${section?.label ?? "the list"}`
          }
          aria-invalid={d.error ? true : undefined}
          aria-describedby={d.error ? errId : hintId}
          placeholder={d.mode === "rename" ? "Name" : `New ${noun}`}
          onChange={(event) => {
            const text = event.currentTarget.value;
            onValue(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          onBlur={(event) => {
            // An empty field gives up when focus leaves it; a typed name
            // stays, so a stray click never throws work away.
            const next = event.relatedTarget as Node | null;
            if (next && frameRef.current?.contains(next)) return;
            if (!normalize(event.currentTarget.value)) onCancel();
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-3"
        />
        <span
          aria-hidden
          className="hidden shrink-0 items-center gap-1 font-mono text-[10px] text-ink-3 @[15rem]:inline-flex"
        >
          <CornerDownLeft className="size-3" />
          {d.mode === "rename" ? "save" : "add"}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {d.error ? (
          <motion.p
            key="err"
            id={errId}
            role="alert"
            className="flex items-center gap-1.5 px-1 text-[11px] leading-tight text-danger"
            initial={{ opacity: 0, y: motionSafe ? -4 : 0 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: motionSafe
                ? springs.snap
                : { duration: durations.fast },
            }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          >
            <TriangleAlert aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{d.error}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
      {narrow && d.mode === "create" && sections.length > 1 ? (
        <div
          role="radiogroup"
          aria-label="Add to"
          className="flex flex-wrap gap-1 px-0.5 pt-0.5"
        >
          {sections.map((s) => {
            const on = s.id === d.section;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSection(s.id)}
                className={cn(
                  "inline-flex h-6 items-center rounded-full border px-2.5 text-[11px]",
                  on
                    ? "border-transparent bg-[var(--si-wash)] font-medium text-foreground"
                    : "border-hairline text-ink-3 hover:text-foreground",
                  FOCUS,
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A sidebar where New opens an inline field in the list instead of a
 * dialog. Every row, header and the field are placed by computed y, so the
 * whole list moves as one layout: the rows below part on `glide` to make the
 * field's slot, and on Enter the field becomes the new row where it stands,
 * then the row flies on `glide` to its sorted place — riding 8px aside,
 * lifted, while the rows it passes slide up a slot — and settles home on
 * `snap`, holding a highlight so you see where it went.
 *
 * A refused name (empty, too long, a duplicate in the section, or your own
 * rule) nudges the field on a tween and slides its message in. Renames (F2,
 * a double-click or the pane's Rename) re-sort the same way. Under 300px the
 * sidebar is a drawer and the field opens at its top. Under reduced motion
 * rows appear and move in place with fades; the highlight still shows.
 */
export function SortedInsert({
  ref,
  sections = defaultInsertSections,
  items: itemsProp,
  defaultItems = defaultInsertItems,
  onItemsChange,
  sortBy = "name",
  highlight = "wash",
  accent = "cobalt",
  maxNameLength = 40,
  validateName,
  onCreate,
  onRename,
  onCancel,
  selected: selectedProp,
  defaultSelected,
  onSelect,
  now = "2026-10-14",
  status = "ready",
  onRetry,
  rowHeight = 34,
  studio = { name: "Fernworks", initials: "Fw" },
  frameHeight = 520,
  title = "Clients",
  disabled = false,
  className,
}: SortedInsertProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const errId = `${uid}-err`;
  const hintId = `${uid}-hint`;
  const rowH = clamp(Math.round(rowHeight), 28, 48);

  const [own, setOwn] = React.useState(defaultItems);
  const items = itemsProp ?? own;
  const [ownSel, setOwnSel] = React.useState(
    defaultSelected ?? defaultItems[0]?.id ?? "",
  );
  const selected = selectedProp ?? ownSel;

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [creating, setCreating] = React.useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = React.useState("");
  const [narrow, setNarrow] = React.useState(false);
  const [counter, setCounter] = React.useState(0);

  /* ------------------------------ flights -------------------------------- */

  // Rows that should fly (their key bumps) and rows that should glow.
  const [fly, setFly] = React.useState<Record<string, number>>({});
  const [glow, setGlow] = React.useState<Record<string, number>>({});
  // Where a brand-new row starts: the field's slot, or its section's top.
  const [entering, setEntering] = React.useState<Record<string, number>>({});
  const [pendingFrom, setPendingFrom] = React.useState<{
    section: string;
    key: string;
    y: number;
  } | null>(null);

  /* ------------------------------- layout -------------------------------- */

  const sorted = React.useMemo(() => {
    const by = compare(sortBy);
    return sections.map((s) => ({
      section: s,
      rows: items.filter((i) => i.section === s.id).sort(by),
    }));
  }, [items, sections, sortBy]);

  const fieldH = (d: Draft | null) =>
    d
      ? rowH +
        8 +
        (d.error ? ERROR_H : 0) +
        (narrow && d.mode === "create" && sections.length > 1 ? SWITCH_H : 0)
      : 0;

  const layout = (() => {
    const rows = new Map<string, number>();
    const headers = new Map<string, number>();
    let fieldY: number | null = null;
    let y = 4;
    const creatingField = draft?.mode === "create";
    if (creatingField && narrow) {
      fieldY = y;
      y += fieldH(draft) + 6;
    }
    for (const { section, rows: list } of sorted) {
      headers.set(section.id, y);
      y += HEADER_H;
      if (creatingField && !narrow && draft?.section === section.id) {
        fieldY = y;
        y += fieldH(draft);
      }
      for (const row of list) {
        rows.set(row.id, y);
        y +=
          row.id === draft?.id && draft.mode === "rename"
            ? fieldH(draft)
            : rowH;
      }
      if (list.length === 0) y += rowH;
      y += SECTION_GAP;
    }
    return { rows, headers, fieldY, total: y };
  })();

  // A row that appears without a field (the host added it) drops in from
  // its section's header; one that came from the field starts where it was.
  const [known, setKnown] = React.useState(
    () => new Set(items.map((i) => i.id)),
  );
  {
    const fresh = items.filter((i) => !known.has(i.id));
    if (fresh.length > 0) {
      const next = new Set(known);
      const starts: Record<string, number> = {};
      const flights: Record<string, number> = {};
      const glows: Record<string, number> = {};
      let used = false;
      for (const i of fresh) {
        next.add(i.id);
        const p = pendingFrom;
        const fromField =
          !used && p && p.section === i.section && p.key === keyOf(i.name);
        starts[i.id] = fromField
          ? p.y
          : (layout.headers.get(i.section) ?? 0) + HEADER_H - rowH * 0.5;
        if (fromField) used = true;
        flights[i.id] = (fly[i.id] ?? 0) + 1;
        glows[i.id] = (glow[i.id] ?? 0) + 1;
      }
      if (used) setPendingFrom(null);
      setKnown(next);
      setEntering((e) => ({ ...e, ...starts }));
      setFly((f) => ({ ...f, ...flights }));
      setGlow((g) => ({ ...g, ...glows }));
    }
  }

  /* ------------------------------- helpers ------------------------------- */

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const origin = React.useRef<HTMLElement | null>(null);
  const focusAfter = React.useRef<string | null>(null);

  React.useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      setNarrow(w > 0 && w < 300);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  /** Keeps a y range in view inside the list, without moving the page. */
  const reveal = (top: number, height: number) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const pad = 8;
    let to = sc.scrollTop;
    if (top - pad < sc.scrollTop) to = top - pad;
    else if (top + height + pad > sc.scrollTop + sc.clientHeight)
      to = top + height + pad - sc.clientHeight;
    to = clamp(to, 0, Math.max(0, sc.scrollHeight - sc.clientHeight));
    if (Math.abs(to - sc.scrollTop) > 1)
      sc.scrollTo({ top: to, behavior: motionSafe ? "smooth" : "auto" });
  };

  const commitItems = (next: InsertItem[]) => {
    if (itemsProp === undefined) setOwn(next);
    onItemsChange?.(next);
  };
  // A promise that settles later works on the list as it is then.
  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  });

  const sectionOf = (id: string) => sections.find((s) => s.id === id);
  const firstSection = sections[0]?.id ?? "";

  /* -------------------------------- draft -------------------------------- */

  const openCreate = (sectionId: string, text = "", byPerson = true) => {
    if (disabled || status !== "ready") return;
    if (byPerson) {
      const active = document.activeElement;
      origin.current = active instanceof HTMLElement ? active : null;
    }
    setDraft({
      mode: "create",
      section: sections.some((s) => s.id === sectionId)
        ? sectionId
        : firstSection,
      id: null,
      value: text,
      error: null,
      nudge: 0,
      focus: byPerson,
    });
  };

  const openRename = (item: InsertItem) => {
    if (disabled || creating[item.id]) return;
    const active = document.activeElement;
    origin.current = active instanceof HTMLElement ? active : null;
    setDraft({
      mode: "rename",
      section: item.section,
      id: item.id,
      value: item.name,
      error: null,
      nudge: 0,
      focus: true,
    });
  };

  const closeDraft = (cancelled: boolean) => {
    const d = draft;
    setDraft(null);
    if (d && cancelled) {
      onCancel?.(d.mode, d.mode === "rename" ? (d.id ?? "") : d.section);
      setAnnouncement("Cancelled.");
    }
    if (d?.focus) {
      const back = origin.current;
      window.requestAnimationFrame(() => {
        if (back?.isConnected) back.focus({ preventScroll: true });
      });
    }
  };

  const refuse = (message: string) => {
    setDraft((d) => (d ? { ...d, error: message, nudge: d.nudge + 1 } : d));
    setAnnouncement(message);
  };

  const submit = () => {
    const d = draft;
    if (!d) return;
    const name = normalize(d.value);
    const section = sectionOf(d.section);
    const noun = section?.noun ?? "item";
    if (!name) return refuse(`Give the ${noun} a name.`);
    if (name.length > maxNameLength)
      return refuse(`Keep it under ${maxNameLength} characters.`);
    const clash = items.find(
      (i) =>
        i.section === d.section &&
        i.id !== d.id &&
        keyOf(i.name) === keyOf(name),
    );
    if (clash)
      return refuse(
        `${clash.name} is already in ${section?.label ?? "this list"}.`,
      );
    const custom = validateName?.(name, d.section, items) ?? null;
    if (custom) return refuse(custom);

    if (d.mode === "rename" && d.id) {
      const prev = items.find((i) => i.id === d.id);
      if (!prev) return closeDraft(false);
      setDraft(null);
      if (prev.name === name) {
        if (d.focus) focusAfter.current = prev.id;
        return;
      }
      const next = items.map((i) => (i.id === d.id ? { ...i, name } : i));
      commitItems(next);
      onRename?.(d.id, name, prev.name);
      setFly((f) => ({ ...f, [prev.id]: (f[prev.id] ?? 0) + 1 }));
      setGlow((g) => ({ ...g, [prev.id]: (g[prev.id] ?? 0) + 1 }));
      if (d.focus) focusAfter.current = prev.id;
      const list = next
        .filter((i) => i.section === d.section)
        .sort(compare(sortBy));
      const at = list.findIndex((i) => i.id === prev.id) + 1;
      setAnnouncement(`Renamed to ${name}, ${at} of ${list.length}.`);
      const top = layout.rows.get(list[at - 2]?.id ?? "") ?? 0;
      reveal(top, rowH * 2);
      return;
    }

    // Create: the field's slot is where the row starts its flight.
    const fromY = layout.fieldY ?? 0;
    setPendingFrom({ section: d.section, key: keyOf(name), y: fromY });
    const id = `new-${counter + 1}`;
    setCounter((c) => c + 1);
    setDraft(null);
    const row: InsertItem = {
      id,
      name,
      section: d.section,
      createdAt: now,
      projects: 0,
    };
    commitItems([...items, row]);
    if (d.focus) focusAfter.current = id;
    const result = onCreate?.(name, d.section);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setCreating((c) => ({ ...c, [id]: true }));
      (result as Promise<unknown>).then(
        () => setCreating((c) => ({ ...c, [id]: false })),
        () => {
          setCreating((c) => ({ ...c, [id]: false }));
          // Take the row back out and hand the name back to the field.
          const back = itemsRef.current.filter((i) => i.id !== id);
          if (itemsProp === undefined) setOwn(back);
          onItemsChange?.(back);
          setDraft({
            mode: "create",
            section: row.section,
            id: null,
            value: name,
            error: `Couldn’t add ${name}. Try again.`,
            nudge: 1,
            focus: d.focus,
          });
          setAnnouncement(`Couldn’t add ${name}.`);
        },
      );
    }
    const list = [...items, row]
      .filter((i) => i.section === d.section)
      .sort(compare(sortBy));
    const at = list.findIndex((i) => i.id === id) + 1;
    setAnnouncement(
      `${name} added to ${section?.label ?? "the list"}, ${at} of ${list.length}.`,
    );
    // The landing slot comes into view as the flight starts.
    const before = list[at - 2];
    const anchor = before ? (layout.rows.get(before.id) ?? fromY) : fromY;
    reveal(anchor, rowH * 2.2);
  };

  // Focus the row a person added or renamed, once it exists.
  React.useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-si-row="${CSS.escape(id)}"]`,
    );
    if (el) {
      focusAfter.current = null;
      el.focus({ preventScroll: true });
    }
  });

  React.useImperativeHandle(ref, () => ({
    startCreate: (sectionId, text) =>
      openCreate(
        sectionId ?? draft?.section ?? firstSection,
        text ?? "",
        false,
      ),
    typeDraft: (text) =>
      setDraft((d) => (d ? { ...d, value: text, error: null } : d)),
    // The handle is rebuilt every render, so these are always the newest.
    submitDraft: () => submit(),
    cancelDraft: () => closeDraft(true),
  }));

  /* ------------------------------- keyboard ------------------------------ */

  const flat = sorted.flatMap((g) => g.rows);
  const tabbableId = flat.some((i) => i.id === selected)
    ? selected
    : (flat[0]?.id ?? "");

  const choose = (id: string) => {
    if (disabled) return;
    if (selectedProp === undefined) setOwnSel(id);
    onSelect?.(id);
  };

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-si-row="${CSS.escape(id)}"]`,
    );
    if (!el) return;
    el.focus({ preventScroll: true });
    const top = layout.rows.get(id);
    if (top !== undefined) reveal(top, rowH);
  };

  const onRowKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    item: InsertItem,
  ) => {
    if (disabled) return;
    const i = flat.findIndex((x) => x.id === item.id);
    let to = -1;
    if (event.key === "ArrowDown") to = Math.min(flat.length - 1, i + 1);
    else if (event.key === "ArrowUp") to = Math.max(0, i - 1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = flat.length - 1;
    if (to >= 0) {
      event.preventDefault();
      focusRow(flat[to]?.id);
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      openRename(item);
      return;
    }
    if (
      (event.key === "n" || event.key === "N") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      openCreate(item.section);
    }
  };

  /* -------------------------------- field -------------------------------- */

  const bindInput = React.useCallback(
    (node: HTMLInputElement | null) => {
      if (!node || !draft?.focus) return;
      if (document.activeElement !== node) {
        node.focus({ preventScroll: true });
        const len = node.value.length;
        node.setSelectionRange(len, len);
      }
    },
    // Re-bind only when a new draft opens, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft?.mode, draft?.id, draft?.section, draft?.focus],
  );

  const field = (d: Draft) => (
    <DraftField
      draft={d}
      sections={sections}
      items={items}
      narrow={narrow}
      rowH={rowH}
      maxNameLength={maxNameLength}
      motionSafe={motionSafe}
      disabled={disabled}
      errId={errId}
      hintId={hintId}
      bindInput={bindInput}
      onValue={(text) =>
        setDraft((cur) => (cur ? { ...cur, value: text, error: null } : cur))
      }
      onSection={(id) =>
        setDraft((cur) => (cur ? { ...cur, section: id, error: null } : cur))
      }
      onSubmit={submit}
      onCancel={() => closeDraft(true)}
      frameRef={frameRef}
    />
  );

  /* -------------------------------- render ------------------------------- */

  const accentInk = Object.hasOwn(ACCENTS, accent)
    ? ACCENTS[accent as SortedInsertAccent]
    : accent;
  const selItem = items.find((i) => i.id === selected) ?? null;
  const selSection = selItem ? sectionOf(selItem.section) : null;
  const sortName =
    sortBy === "recent"
      ? "Newest first"
      : sortBy === "size"
        ? "Most projects"
        : "A–Z";
  const createSection =
    draft?.mode === "create"
      ? draft.section
      : (selItem?.section ?? firstSection);

  const list =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-1 px-3 py-3">
        <span className="sr-only">{`Loading ${title.toLowerCase()}`}</span>
        {[58, 72, 44, 66, 52, 60].map((w, i) => (
          <span
            key={i}
            aria-hidden
            className="flex items-center gap-2.5 px-1"
            style={{ height: rowH }}
          >
            <span className="size-5 shrink-0 rounded-[5px] bg-surface-2" />
            <span
              className="h-2.5 rounded-full bg-surface-2"
              style={{ width: `${w}%` }}
            />
          </span>
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-start gap-2 px-4 py-4">
        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
          {`Couldn’t load ${title.toLowerCase()}`}
        </span>
        <p className="text-[12px] leading-snug text-ink-3">
          Nothing was lost; the list just didn’t arrive.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry()}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Retry
          </button>
        ) : null}
      </div>
    ) : (
      <motion.div
        className="relative"
        initial={false}
        animate={{ height: layout.total }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        {/* In the drawer the field opens above every section. */}
        <AnimatePresence initial={false}>
          {draft?.mode === "create" && narrow && layout.fieldY !== null ? (
            <FieldSlot
              key="field-top"
              y={layout.fieldY}
              motionSafe={motionSafe}
            >
              {field(draft)}
            </FieldSlot>
          ) : null}
        </AnimatePresence>

        {sorted.map(({ section, rows }) => {
          const hy = layout.headers.get(section.id) ?? 0;
          // Stable DOM order (insertion order): rows move by y, never by
          // being re-inserted, so focus and running springs survive a sort.
          const members = items.filter((i) => i.section === section.id);
          return (
            <React.Fragment key={section.id}>
              <motion.div
                className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 pr-2 pl-3.5"
                style={{ height: HEADER_H }}
                initial={false}
                animate={{ y: hy }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              >
                <h3 className="flex min-w-0 items-baseline gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  <span className="truncate">{section.label}</span>
                  <span className="tabular-nums">{rows.length}</span>
                </h3>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`New ${section.noun} in ${section.label}`}
                  aria-keyshortcuts="N"
                  onClick={() => openCreate(section.id)}
                  className={cn(
                    "hidden h-6 shrink-0 items-center gap-1 rounded-2 px-2 text-[11px] text-ink-3 hover:bg-surface-2 hover:text-foreground disabled:opacity-50 @[300px]:inline-flex",
                    FOCUS,
                  )}
                >
                  <Plus aria-hidden className="size-3" />
                  New
                </button>
              </motion.div>

              {rows.length === 0 ? (
                <motion.p
                  className="absolute inset-x-0 top-0 flex items-center px-3.5 text-[12px] text-ink-3"
                  style={{ height: rowH }}
                  initial={false}
                  animate={{ y: hy + HEADER_H }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                >
                  {`No ${section.noun}s yet.`}
                </motion.p>
              ) : null}

              <AnimatePresence initial={false}>
                {draft?.mode === "create" &&
                !narrow &&
                draft.section === section.id &&
                layout.fieldY !== null ? (
                  <FieldSlot
                    key={`field-${section.id}`}
                    y={layout.fieldY}
                    motionSafe={motionSafe}
                  >
                    {field(draft)}
                  </FieldSlot>
                ) : null}
              </AnimatePresence>

              <div role="list" aria-label={section.label}>
                {members.map((item) => {
                  const ty = layout.rows.get(item.id);
                  if (ty === undefined) return null;
                  const at = rows.findIndex((r) => r.id === item.id);
                  const renaming =
                    draft?.mode === "rename" && draft.id === item.id;
                  return (
                    <Row
                      key={item.id}
                      item={item}
                      y={ty}
                      from={entering[item.id] ?? null}
                      rowH={rowH}
                      flyKey={fly[item.id] ?? 0}
                      hlKey={glow[item.id] ?? 0}
                      highlight={highlight}
                      highlightMs={HIGHLIGHT_MS}
                      creating={!!creating[item.id]}
                      selected={item.id === selected}
                      tabbable={item.id === tabbableId}
                      renaming={renaming}
                      motionSafe={motionSafe}
                      disabled={disabled}
                      setsize={rows.length}
                      posinset={at + 1}
                      onChoose={choose}
                      onKey={onRowKey}
                      onRename={openRename}
                      field={renaming && draft ? field(draft) : null}
                    />
                  );
                })}
              </div>
            </React.Fragment>
          );
        })}
      </motion.div>
    );

  return (
    <div
      ref={frameRef}
      className={cn(
        "@container relative flex w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={
        {
          height: frameHeight,
          "--si-ink": accentInk,
          "--si-wash": "color-mix(in oklab, var(--si-ink) 13%, transparent)",
        } as React.CSSProperties
      }
    >
      <p id={hintId} className="sr-only">
        Enter adds the name, Escape cancels. In the list, Up and Down move, F2
        renames and N adds to the focused section.
      </p>
      <nav
        aria-label={`${studio.name} ${title.toLowerCase()}`}
        className="flex h-full w-full shrink-0 flex-col bg-surface-1 @[34rem]:w-[264px] @[34rem]:border-r @[34rem]:border-hairline"
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline px-3.5">
          <span
            aria-hidden
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-2 bg-foreground text-[11px] font-semibold text-background"
          >
            {studio.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] leading-tight font-semibold">
              {studio.name}
            </p>
            <p className="truncate text-[11px] text-ink-3">{`${title} · ${sortName}`}</p>
          </div>
        </div>
        {/* In the drawer, New lives at the top and the field opens there. */}
        <div className="shrink-0 px-2 pt-2 @[300px]:hidden">
          <button
            type="button"
            disabled={disabled || status !== "ready"}
            aria-keyshortcuts="N"
            onClick={() => openCreate(createSection)}
            className={cn(
              "flex h-9 w-full items-center justify-center gap-1.5 rounded-2 border border-dashed border-hairline-strong text-[12.5px] text-ink-2 hover:border-[var(--si-ink)] hover:text-foreground disabled:opacity-50",
              FOCUS,
            )}
          >
            <Plus aria-hidden className="size-3.5" />
            {`New ${sectionOf(createSection)?.noun ?? "item"}`}
          </button>
        </div>
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        >
          {list}
        </div>
      </nav>

      <section
        aria-label={selItem ? selItem.name : "Nothing selected"}
        className="hidden min-w-0 flex-1 flex-col @[34rem]:flex"
      >
        {selItem ? (
          <AnimatePresence initial={false}>
            <motion.div
              key={selItem.id}
              className="flex flex-col gap-5 px-6 py-6"
              initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: {
                  opacity: { duration: durations.base, ease: easings.enter },
                  y: motionSafe ? springs.glide : { duration: 0 },
                },
              }}
            >
              <div className="flex items-center gap-3.5">
                <span
                  aria-hidden
                  className="inline-flex size-12 shrink-0 items-center justify-center rounded-3 text-[16px] font-semibold text-white"
                  style={{ backgroundColor: tintOf(selItem.name) }}
                >
                  {initialsOf(selItem.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[18px] leading-tight font-semibold">
                    {selItem.name}
                  </h2>
                  <p className="truncate text-[12.5px] text-ink-3">
                    {`${selSection?.label ?? ""} · since ${sinceLabel(selItem.createdAt)}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => openRename(selItem)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
                    FOCUS,
                  )}
                >
                  <PenLine aria-hidden className="size-3.5" />
                  Rename
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-2.5">
                {[
                  ["Projects", String(selItem.projects ?? 0)],
                  ["Added", sinceLabel(selItem.createdAt)],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex flex-col gap-0.5 rounded-3 border border-hairline px-3.5 py-3"
                  >
                    <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      {k}
                    </dt>
                    <dd className="font-mono text-[16px] text-foreground tabular-nums">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                {selItem.projects
                  ? `${plural(selItem.projects, "project")} with Fernworks so far. The list keeps ${selSection?.label.toLowerCase() ?? "items"} ${sortName === "A–Z" ? "in alphabetical order" : sortName.toLowerCase()}, so a new name always lands in its place.`
                  : "New here. Their first project will show up once it is booked."}
              </p>
            </motion.div>
          </AnimatePresence>
        ) : (
          <p className="px-6 py-6 text-[13px] text-ink-3">
            Choose a name in the list.
          </p>
        )}
      </section>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
