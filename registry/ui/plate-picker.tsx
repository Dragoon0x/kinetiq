"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  Clock,
  Inbox,
  LayoutTemplate,
  RotateCcw,
  Search,
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

/** One block of a template's mock page, drawn small on the plate and readable in the preview. */
export type PlateBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "para"; lines: number }
  | { kind: "list"; items: string[] }
  | { kind: "checks"; items: string[] }
  | { kind: "table"; columns: string[]; rows: number }
  | { kind: "meta"; fields: string[] };

export type PlateCategory = { id: string; label: string };

export type PlateTemplate = {
  id: string;
  /** The plate's name, e.g. "Meeting notes". */
  name: string;
  /** A category id. */
  category: string;
  /** One line, shown when the plate lifts and in the preview. */
  blurb: string;
  /** Who keeps the template. */
  author: string;
  /** When it last changed, as text: never read from the clock. */
  updated: string;
  /** The mock page, top to bottom. */
  page: PlateBlock[];
};

/** What the field strip holds when Use template is pressed. */
export type PlateFields = { title: string; owner: string };

export type PlateRackStyle = "rack" | "grid" | "list";
export type PlateDensity = "compact" | "cozy" | "roomy";
export type PlateAccent = "cobalt" | "signal" | "ink";
export type PlateStatus = "ready" | "loading" | "error";

export type PlatePickerProps = {
  /** The templates, in rack order. @default defaultPlateTemplates */
  templates?: PlateTemplate[];
  /** The chip row's categories, in order; "All" is added first. @default defaultPlateCategories */
  categories?: PlateCategory[];
  /** Template ids shown in the Recently used row, newest first. @default defaultPlateRecent */
  recent?: string[];
  /** Controlled: the id of the template pulled out for preview, or null. */
  value?: string | null;
  /** Initial preview when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires when a plate is pulled out (its id and template) or slid home (null). */
  onChange?: (id: string | null, template: PlateTemplate | null) => void;
  /** Use template was pressed, with the field strip's title and owner. */
  onUse?: (template: PlateTemplate, fields: PlateFields) => void;
  /** Initial category chip; null is All. @default null */
  defaultCategory?: string | null;
  /** A category chip was chosen (null for All). */
  onCategoryChange?: (category: string | null) => void;
  /** Initial search text. @default "" */
  defaultQuery?: string;
  /** The search text changed. */
  onQueryChange?: (query: string) => void;
  /** Who the field strip names as owner to begin with. @default "Mara Lind" */
  owner?: string;
  /** How the plates stand: leaning in a rack, flat in a grid, or as rows. @default "rack" */
  rackStyle?: PlateRackStyle;
  /** Plate size and spacing. @default "cozy" */
  density?: PlateDensity;
  /** The colour of the chosen chip, the lifted plate's edge and the Use button. @default "cobalt" */
  accent?: PlateAccent;
  /** Whether the templates have arrived. @default "ready" */
  status?: PlateStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "New document" */
  title?: string;
  /** The search field's placeholder. @default "Search templates" */
  searchPlaceholder?: string;
  /** The primary button's text. @default "Use template" */
  useLabel?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the rack and the preview scroll inside it. @default 540 */
  height?: number;
  /** Read only: no plate lifts out and nothing can be used. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultPlateCategories: PlateCategory[] = [
  { id: "meetings", label: "Meetings" },
  { id: "planning", label: "Planning" },
  { id: "writing", label: "Writing" },
  { id: "basics", label: "Basics" },
];

/** Nine Gaugeworks Docs templates. */
export const defaultPlateTemplates: PlateTemplate[] = [
  {
    id: "meeting-notes",
    name: "Meeting notes",
    category: "meetings",
    blurb: "Agenda, attendees and action items, with a decisions log.",
    author: "Priya Nair",
    updated: "Updated 3 Oct",
    page: [
      { kind: "title", text: "Meeting notes" },
      { kind: "meta", fields: ["Date", "Attendees", "Facilitator"] },
      { kind: "heading", text: "Agenda" },
      {
        kind: "list",
        items: ["Last week's actions", "Launch readiness", "Open questions"],
      },
      { kind: "heading", text: "Decisions" },
      { kind: "para", lines: 2 },
      { kind: "heading", text: "Action items" },
      { kind: "checks", items: ["Owner, due Friday", "Owner, due Friday"] },
    ],
  },
  {
    id: "spec",
    name: "Spec",
    category: "planning",
    blurb: "Problem, goals, non-goals, the design and open questions.",
    author: "Tomas Reyes",
    updated: "Updated 29 Sep",
    page: [
      { kind: "title", text: "Spec" },
      { kind: "meta", fields: ["Status", "Owner", "Reviewers"] },
      { kind: "heading", text: "Problem" },
      { kind: "para", lines: 3 },
      { kind: "heading", text: "Goals" },
      { kind: "list", items: ["Measurable outcome", "Measurable outcome"] },
      { kind: "heading", text: "Non-goals" },
      { kind: "list", items: ["Out of scope for now"] },
      { kind: "heading", text: "Design" },
      { kind: "para", lines: 4 },
      { kind: "heading", text: "Open questions" },
      { kind: "list", items: ["Who decides?"] },
    ],
  },
  {
    id: "retro",
    name: "Retro",
    category: "meetings",
    blurb: "What went well, what did not, and what we will try next.",
    author: "Ines Varga",
    updated: "Updated 1 Oct",
    page: [
      { kind: "title", text: "Retro" },
      { kind: "meta", fields: ["Sprint", "Team"] },
      { kind: "table", columns: ["Went well", "Did not", "Try next"], rows: 5 },
      { kind: "heading", text: "Actions" },
      {
        kind: "checks",
        items: ["One change we commit to", "One change we commit to"],
      },
    ],
  },
  {
    id: "roadmap",
    name: "Roadmap",
    category: "planning",
    blurb: "Quarters across the top, themes down the side.",
    author: "Tomas Reyes",
    updated: "Updated 22 Sep",
    page: [
      { kind: "title", text: "Roadmap" },
      { kind: "para", lines: 2 },
      { kind: "table", columns: ["Theme", "Q1", "Q2", "Q3", "Q4"], rows: 6 },
      { kind: "heading", text: "Risks" },
      { kind: "list", items: ["Dependency", "Hiring"] },
    ],
  },
  {
    id: "memo",
    name: "Memo",
    category: "writing",
    blurb: "A one-page argument: context, recommendation, asks.",
    author: "Kenji Aoki",
    updated: "Updated 6 Oct",
    page: [
      { kind: "title", text: "Memo" },
      { kind: "meta", fields: ["To", "From", "Re"] },
      { kind: "heading", text: "Context" },
      { kind: "para", lines: 3 },
      { kind: "heading", text: "Recommendation" },
      { kind: "para", lines: 2 },
      { kind: "heading", text: "Asks" },
      { kind: "list", items: ["A decision by", "Budget for"] },
    ],
  },
  {
    id: "checklist",
    name: "Checklist",
    category: "basics",
    blurb: "A plain list of boxes to tick, grouped under headings.",
    author: "Mara Lind",
    updated: "Updated 14 Sep",
    page: [
      { kind: "title", text: "Checklist" },
      { kind: "heading", text: "Before" },
      { kind: "checks", items: ["First thing", "Second thing", "Third thing"] },
      { kind: "heading", text: "During" },
      { kind: "checks", items: ["First thing", "Second thing"] },
      { kind: "heading", text: "After" },
      { kind: "checks", items: ["First thing", "Second thing", "Third thing"] },
    ],
  },
  {
    id: "one-pager",
    name: "One-pager",
    category: "writing",
    blurb: "The whole thing on a page: summary, metrics, next steps.",
    author: "Priya Nair",
    updated: "Updated 30 Sep",
    page: [
      { kind: "title", text: "One-pager" },
      { kind: "heading", text: "Summary" },
      { kind: "para", lines: 3 },
      { kind: "heading", text: "Metrics" },
      { kind: "table", columns: ["Metric", "Now", "Target"], rows: 3 },
      { kind: "heading", text: "Next steps" },
      { kind: "list", items: ["This month", "Next month"] },
    ],
  },
  {
    id: "brief",
    name: "Brief",
    category: "writing",
    blurb: "Who it is for, what success looks like, what is out of scope.",
    author: "Ines Varga",
    updated: "Updated 2 Oct",
    page: [
      { kind: "title", text: "Brief" },
      { kind: "meta", fields: ["Audience", "Deadline"] },
      { kind: "heading", text: "Who it is for" },
      { kind: "para", lines: 2 },
      { kind: "heading", text: "Success looks like" },
      { kind: "list", items: ["Outcome", "Outcome"] },
      { kind: "heading", text: "Out of scope" },
      { kind: "para", lines: 2 },
    ],
  },
  {
    id: "blank",
    name: "Blank",
    category: "basics",
    blurb: "An empty page.",
    author: "Gaugeworks",
    updated: "Updated 1 Sep",
    page: [],
  },
];

export const defaultPlateRecent: string[] = ["meeting-notes", "spec"];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const INPUT =
  "h-8 w-full min-w-0 rounded-2 border border-hairline bg-surface-0 px-2.5 text-[13px] text-foreground placeholder:text-ink-3 transition-colors focus-visible:border-hairline-strong";

const ACCENTS: Record<PlateAccent, { color: string; on: string }> = {
  cobalt: { color: "var(--accent-bright)", on: "var(--primary-foreground)" },
  signal: { color: "var(--signal)", on: "var(--bg-0)" },
  ink: { color: "var(--ink)", on: "var(--bg-0)" },
};

const DENSITY: Record<
  PlateDensity,
  { min: number; gap: number; pad: number; name: number }
> = {
  compact: { min: 112, gap: 8, pad: 5, name: 11 },
  cozy: { min: 140, gap: 12, pad: 7, name: 12 },
  roomy: { min: 176, gap: 16, pad: 9, name: 13 },
};

/** How far a plate leans back in the rack, in degrees. */
const LEAN = 11;
/** How long a landed Use shows its check before the plate slides home, ms. */
const USED_MS = 900;
const PARA_WIDTHS = ["100%", "92%", "76%", "96%", "58%"];

const noopSubscribe = () => () => {};
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));

type Where = "rack" | "recent";
type Rect = { left: number; top: number; width: number };
type Home = { x: number; y: number; scale: number };

const keyOf = (where: Where, id: string) => `${where}:${id}`;

/** The templates a category chip and a search match, in rack order. */
export const matchPlates = (
  templates: PlateTemplate[],
  category: string | null,
  query: string,
) => {
  const q = query.trim().toLowerCase();
  return templates.filter(
    (t) =>
      (category === null || t.category === category) &&
      (q === "" || t.name.toLowerCase().includes(q)),
  );
};

/* ----------------------------------------------------------------------- */
/*                                 Mock page                                */
/* ----------------------------------------------------------------------- */

function MiniBlock({ block }: { block: PlateBlock }) {
  switch (block.kind) {
    case "title":
      return <span className="block h-[5px] w-[62%] rounded-[1px] bg-ink-2" />;
    case "heading":
      return (
        <span className="mt-[2px] block h-[3px] w-[42%] rounded-[1px] bg-ink-3" />
      );
    case "para":
      return (
        <span className="flex flex-col gap-[2px]">
          {Array.from({ length: block.lines }, (_, i) => (
            <span
              key={i}
              className="block h-[2px] rounded-[1px] bg-hairline-strong"
              style={{ width: PARA_WIDTHS[i % PARA_WIDTHS.length] }}
            />
          ))}
        </span>
      );
    case "list":
      return (
        <span className="flex flex-col gap-[2px]">
          {block.items.map((item, i) => (
            <span key={i} className="flex items-center gap-[3px]">
              <span className="size-[3px] shrink-0 rounded-full bg-ink-3" />
              <span
                className="block h-[2px] rounded-[1px] bg-hairline-strong"
                style={{ width: `${54 + ((item.length * 7) % 30)}%` }}
              />
            </span>
          ))}
        </span>
      );
    case "checks":
      return (
        <span className="flex flex-col gap-[2px]">
          {block.items.map((item, i) => (
            <span key={i} className="flex items-center gap-[3px]">
              <span className="size-[4px] shrink-0 rounded-[1px] border border-ink-3" />
              <span
                className="block h-[2px] rounded-[1px] bg-hairline-strong"
                style={{ width: `${50 + ((item.length * 5) % 30)}%` }}
              />
            </span>
          ))}
        </span>
      );
    case "table":
      return (
        <span
          className="grid gap-px rounded-[1px] bg-hairline-strong p-px"
          style={{
            gridTemplateColumns: `repeat(${block.columns.length}, minmax(0, 1fr))`,
          }}
        >
          {Array.from(
            { length: block.columns.length * (block.rows + 1) },
            (_, i) => (
              <span
                key={i}
                className={cn(
                  "block h-[4px]",
                  i < block.columns.length ? "bg-surface-2" : "bg-background",
                )}
              />
            ),
          )}
        </span>
      );
    case "meta":
      return (
        <span className="grid grid-cols-[30%_1fr] gap-x-[4px] gap-y-[2px]">
          {block.fields.map((field) => (
            <React.Fragment key={field}>
              <span className="block h-[2px] rounded-[1px] bg-ink-3" />
              <span className="block h-[2px] w-[80%] rounded-[1px] bg-hairline-strong" />
            </React.Fragment>
          ))}
        </span>
      );
  }
}

function FullBlock({ block }: { block: PlateBlock }) {
  switch (block.kind) {
    case "title":
      return (
        <p className="text-[15px] leading-snug font-semibold text-foreground">
          {block.text}
        </p>
      );
    case "heading":
      return (
        <p className="mt-1 text-[11px] font-semibold text-foreground">
          {block.text}
        </p>
      );
    case "para":
      return (
        <div className="flex flex-col gap-[5px] py-[2px]">
          {Array.from({ length: block.lines }, (_, i) => (
            <span
              key={i}
              className="block h-[5px] rounded-full bg-hairline-strong"
              style={{ width: PARA_WIDTHS[i % PARA_WIDTHS.length] }}
            />
          ))}
        </div>
      );
    case "list":
      return (
        <ul className="flex flex-col gap-[3px] text-[11px] text-ink-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="mt-[6px] size-1 shrink-0 rounded-full bg-ink-3" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "checks":
      return (
        <ul className="flex flex-col gap-[3px] text-[11px] text-ink-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="mt-[3px] size-2.5 shrink-0 rounded-[2px] border border-hairline-strong" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div
          className="grid overflow-hidden rounded-[3px] border border-hairline"
          style={{
            gridTemplateColumns: `repeat(${block.columns.length}, minmax(0, 1fr))`,
          }}
        >
          {block.columns.map((c) => (
            <span
              key={c}
              className="truncate border-b border-hairline bg-surface-2 px-1 py-0.5 font-mono text-[8px] tracking-[0.06em] text-ink-3 uppercase"
            >
              {c}
            </span>
          ))}
          {Array.from({ length: block.columns.length * block.rows }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-3.5 border-hairline",
                i < block.columns.length * (block.rows - 1) && "border-b",
              )}
            />
          ))}
        </div>
      );
    case "meta":
      return (
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-[10px]">
          {block.fields.map((field) => (
            <React.Fragment key={field}>
              <dt className="font-mono tracking-[0.06em] text-ink-3 uppercase">
                {field}
              </dt>
              <dd className="h-[5px] w-[70%] rounded-full bg-hairline-strong" />
            </React.Fragment>
          ))}
        </dl>
      );
  }
}

/** The template's page: a 4:5 sheet, drawn as bars on the plate or as readable text in the preview. */
function MockPage({
  blocks,
  mode,
  nodeRef,
  className,
}: {
  blocks: PlateBlock[];
  mode: "mini" | "full";
  nodeRef?: (node: HTMLDivElement | null) => void;
  className?: string;
}) {
  return (
    <div
      ref={nodeRef}
      aria-hidden
      className={cn(
        "aspect-[4/5] w-full overflow-hidden border border-hairline bg-background",
        mode === "mini" ? "rounded-[3px] px-[9%] py-[8%]" : "rounded-2 p-[9%]",
        className,
      )}
    >
      {mode === "mini" ? (
        <div className="flex flex-col gap-[3px]">
          {blocks.map((block, i) => (
            <MiniBlock key={i} block={block} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {blocks.length === 0 ? (
            <p className="text-[11px] text-ink-3">Start writing</p>
          ) : (
            blocks.map((block, i) => <FullBlock key={i} block={block} />)
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Plate                                  */
/* ----------------------------------------------------------------------- */

type PlateVariant = "rack" | "grid" | "list" | "small";

type PlateProps = {
  template: PlateTemplate;
  categoryLabel: string;
  variant: PlateVariant;
  density: PlateDensity;
  lifted: boolean;
  chosen: boolean;
  /** Out of the rack: its slot stays, its face does not. */
  hidden: boolean;
  motionSafe: boolean;
  /** Fades in when it mounts, with this stagger. */
  enterDelay: number | null;
  tabIndex: number;
  disabled: boolean;
  /** AnimatePresence's popLayout hands an exiting plate its own ref; both land on the button. */
  ref?: React.Ref<HTMLButtonElement>;
  nodeRef: (node: HTMLButtonElement | null) => void;
  pageRef: (node: HTMLDivElement | null) => void;
  onLift: (lifted: boolean) => void;
  onFocusPlate: () => void;
  onOpen: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function Plate({
  template,
  categoryLabel,
  variant,
  density,
  lifted,
  chosen,
  hidden,
  motionSafe,
  enterDelay,
  tabIndex,
  disabled,
  ref,
  nodeRef,
  pageRef,
  onLift,
  onFocusPlate,
  onOpen,
  onNav,
}: PlateProps) {
  const d = DENSITY[density];
  const lean = variant === "rack" ? LEAN : 0;
  const pose = motionSafe
    ? variant === "rack"
      ? {
          rotateX: lifted ? 0 : lean,
          y: lifted ? -8 : 0,
          scale: lifted ? 1.03 : 1,
          x: 0,
        }
      : variant === "list"
        ? { rotateX: 0, y: 0, scale: 1, x: lifted ? 4 : 0 }
        : {
            rotateX: 0,
            y: lifted ? (variant === "small" ? -2 : -4) : 0,
            scale: 1,
            x: 0,
          }
    : { rotateX: lean, y: 0, scale: 1, x: 0 };

  const face = (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-3 border bg-surface-1 transition-[border-color,box-shadow] duration-200",
        variant === "list"
          ? "aspect-[5/4] w-14"
          : variant === "small"
            ? "aspect-[5/4] w-12"
            : "aspect-[5/4] w-full",
        lifted || chosen
          ? "border-(--pp-accent) shadow-[0_10px_24px_-10px_color-mix(in_oklab,black_55%,transparent)]"
          : "border-hairline shadow-[0_1px_2px_color-mix(in_oklab,black_18%,transparent)]",
      )}
    >
      <span
        className="absolute inset-x-0 top-[10%] mx-auto block shadow-[0_2px_6px_-2px_color-mix(in_oklab,black_35%,transparent)]"
        style={{
          width: variant === "small" || variant === "list" ? "62%" : "68%",
        }}
      >
        <MockPage blocks={template.page} mode="mini" nodeRef={pageRef} />
      </span>
    </span>
  );

  return (
    <motion.button
      ref={(node) => {
        nodeRef(node);
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type="button"
      role="option"
      aria-selected={chosen}
      aria-disabled={disabled || undefined}
      aria-label={`${template.name}, ${categoryLabel}. ${template.blurb}`}
      tabIndex={tabIndex}
      layout={motionSafe && variant !== "small" ? true : false}
      initial={
        enterDelay === null
          ? false
          : { opacity: 0, y: motionSafe ? distances.nudge : 0 }
      }
      animate={{ opacity: 1, ...pose }}
      exit={{
        opacity: 0,
        scale: motionSafe ? 0.94 : 1,
        transition: exitFor(durations.fast),
      }}
      transition={{
        layout: springs.glide,
        rotateX: springs.snap,
        y: springs.snap,
        x: springs.snap,
        scale: springs.snap,
        opacity: {
          duration: durations.base,
          ease: easings.enter,
          delay: enterDelay ?? 0,
        },
      }}
      style={{
        transformOrigin: "50% 100%",
        transformPerspective: variant === "rack" ? 720 : undefined,
        visibility: hidden ? "hidden" : undefined,
        padding: variant === "list" ? `${d.pad}px ${d.pad + 3}px` : d.pad,
      }}
      onPointerEnter={() => onLift(true)}
      onPointerLeave={(event) => {
        // A focused plate stays up when the pointer wanders off it.
        if (event.currentTarget !== document.activeElement) onLift(false);
      }}
      onFocus={() => {
        onFocusPlate();
        onLift(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.matches(":hover")) onLift(false);
      }}
      onClick={onOpen}
      onKeyDown={onNav}
      className={cn(
        "relative flex min-w-0 rounded-3 text-left transition-colors",
        variant === "list"
          ? "w-full flex-row items-center gap-3"
          : "flex-col gap-1.5",
        variant === "small" && "w-auto items-center",
        lifted && variant !== "rack" && "bg-surface-2",
        chosen && "bg-(--pp-wash)",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      {face}
      <span
        className={cn(
          "flex min-w-0 flex-col",
          variant === "list" ? "flex-1 gap-0.5" : "gap-0",
        )}
      >
        <span
          className={cn(
            "flex min-w-0 items-center gap-1.5",
            variant === "small" && "justify-center",
          )}
        >
          <span
            className="truncate font-medium text-foreground"
            style={{
              fontSize: variant === "small" ? 11 : d.name,
              maxWidth: variant === "small" ? 72 : undefined,
            }}
          >
            {template.name}
          </span>
          {variant !== "small" && variant !== "list" ? (
            <span className="ml-auto hidden shrink-0 font-mono text-[9px] tracking-[0.06em] text-ink-3 uppercase @min-[26rem]:inline">
              {categoryLabel}
            </span>
          ) : null}
        </span>
        {variant === "list" ? (
          <span className="truncate text-[11px] text-ink-3">
            <span className="font-mono text-[9px] tracking-[0.06em] uppercase">
              {categoryLabel}
            </span>
            <span aria-hidden> · </span>
            {template.blurb}
          </span>
        ) : null}
      </span>
      {/* The rail the plate stands on; segments join into one line per row. */}
      {variant === "rack" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-hairline-strong"
        />
      ) : null}
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Preview                                 */
/* ----------------------------------------------------------------------- */

type PreviewProps = {
  template: PlateTemplate;
  categoryLabel: string;
  /** Where the plate's thumbnail was when it was pressed, or null for a fade. */
  from: Rect | null;
  motionSafe: boolean;
  owner: string;
  useLabel: string;
  used: boolean;
  disabled: boolean;
  frameRef: React.RefObject<HTMLDivElement | null>;
  titleRef: React.RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onUse: (fields: PlateFields) => void;
};

function Preview({
  template,
  categoryLabel,
  from,
  motionSafe,
  owner,
  useLabel,
  used,
  disabled,
  frameRef,
  titleRef,
  onBack,
  onUse,
}: PreviewProps) {
  const uid = React.useId();
  const [title, setTitle] = React.useState("");
  const [who, setWho] = React.useState(owner);
  // The page is measured once at rest, invisible, then remounted at the
  // thumbnail's place and size to grow from there.
  const [start, setStart] = React.useState<Home | null>(null);
  const travels = from !== null && motionSafe;

  React.useLayoutEffect(() => {
    if (!travels || start) return;
    const node = frameRef.current;
    if (!node) return;
    const to = node.getBoundingClientRect();
    if (to.width === 0) {
      setStart({ x: 0, y: 0, scale: 1 });
      return;
    }
    setStart({
      x: r3(from.left - to.left),
      y: r3(from.top - to.top),
      scale: r3(from.width / to.width),
    });
  }, [travels, start, from, frameRef]);

  const placeholder = `Untitled ${template.name.toLowerCase()}`;
  const fields = (): PlateFields => ({
    title: title.trim() || placeholder,
    owner: who.trim() || owner,
  });

  const stripVariants = {
    enter: { opacity: 0, x: motionSafe ? distances.step : 0 },
    live: {
      opacity: 1,
      x: 0,
      transition: {
        ...springs.glide,
        opacity: { duration: durations.base, ease: easings.enter },
      },
    },
    exit: { opacity: 0, transition: exitFor(durations.fast) },
  };

  return (
    <div
      className="flex min-h-full flex-col gap-4 p-4 @min-[40rem]:flex-row @min-[40rem]:gap-6"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onBack();
        }
      }}
    >
      <div className="mx-auto w-full max-w-[240px] shrink-0 @min-[40rem]:mx-0 @min-[40rem]:w-[38%] @min-[40rem]:max-w-[320px]">
        <motion.div
          key={start ? "live" : "measure"}
          ref={frameRef}
          initial={
            travels
              ? start
                ? { x: start.x, y: start.y, scale: start.scale, opacity: 1 }
                : false
              : { opacity: 0 }
          }
          animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          variants={{
            exit: (home: Home | null) =>
              home
                ? {
                    x: home.x,
                    y: home.y,
                    scale: home.scale,
                    transition: exitFor(durations.slow),
                  }
                : { opacity: 0, transition: exitFor() },
          }}
          exit="exit"
          transition={
            travels
              ? springs.glide
              : { duration: durations.base, ease: easings.enter }
          }
          style={{
            transformOrigin: "0 0",
            visibility: travels && !start ? "hidden" : undefined,
          }}
          className="relative z-10 shadow-[0_18px_40px_-18px_color-mix(in_oklab,black_60%,transparent)]"
        >
          <MockPage blocks={template.page} mode="full" />
        </motion.div>
      </div>

      <motion.div
        variants={stripVariants}
        className="flex min-w-0 flex-1 flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {categoryLabel}
          </p>
          <p className="text-[15px] font-semibold text-foreground">
            {template.name}
          </p>
          <p className="text-[13px] text-ink-2">{template.blurb}</p>
          <p className="text-[11px] text-ink-3">
            Kept by {template.author}
            <span aria-hidden> · </span>
            {template.updated}
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Title
            </span>
            <input
              ref={titleRef}
              id={`${uid}-title`}
              type="text"
              value={title}
              placeholder={placeholder}
              disabled={disabled}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !disabled && !used) {
                  event.preventDefault();
                  onUse(fields());
                }
              }}
              className={cn(INPUT, FOCUS_RING)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Owner
            </span>
            <input
              type="text"
              value={who}
              disabled={disabled}
              onChange={(event) => setWho(event.target.value)}
              className={cn(INPUT, FOCUS_RING)}
            />
          </label>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled && !used) onUse(fields());
            }}
            className={cn(
              "relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-2 px-3.5 text-[13px] font-medium transition-[filter]",
              disabled
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer hover:brightness-110",
              FOCUS_RING,
            )}
            style={{
              background: "var(--pp-accent)",
              color: "var(--pp-on)",
            }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {used ? (
                <motion.span
                  key="done"
                  initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.recoil,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  className="inline-flex items-center gap-2"
                >
                  <Check aria-hidden className="size-4" />
                  Created
                </motion.span>
              ) : (
                <motion.span
                  key="use"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast }}
                  className="inline-flex items-center gap-2"
                >
                  <LayoutTemplate aria-hidden className="size-4" />
                  {useLabel}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Back
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A template chooser drawn as a plate rack. Each template stands as a plate:
 * a wide card faced with a thumbnail of its page, leaning back on its rail.
 * Hovering or focusing a plate lifts it forward and upright on `springs.snap`
 * and its blurb reads out in the caption under the rack. Pressing it pulls the
 * plate out: the thumbnail grows from its slot into a readable mock page on
 * `springs.glide` while the rack fades back, and a field strip (title, owner)
 * slides in beside it with the Use template button. Back slides the page home
 * to its slot on an exit tween and the plate reappears in the rack.
 *
 * Category chips are a radio group that filters the rack: plates that no
 * longer match fade out and the rest close up on `springs.glide`; the search
 * field matches names the same way. Recently used plates stand in a short row
 * above. Use template lands a check on `springs.recoil`, then the plate
 * slides home on its own.
 *
 * The rack is a listbox with one roving stop: arrows move, Home/End jump,
 * Enter or Space opens, Escape backs out and returns focus to the plate. Under
 * reduced motion plates keep their lean and only their edge lights up, the
 * preview and strip cross-fade, and filtered plates appear and vanish in
 * place.
 */
export function PlatePicker({
  templates = defaultPlateTemplates,
  categories = defaultPlateCategories,
  recent = defaultPlateRecent,
  value,
  defaultValue = null,
  onChange,
  onUse,
  defaultCategory = null,
  onCategoryChange,
  defaultQuery = "",
  onQueryChange,
  owner = "Mara Lind",
  rackStyle = "rack",
  density = "cozy",
  accent = "cobalt",
  status = "ready",
  onRetry,
  title = "New document",
  searchPlaceholder = "Search templates",
  useLabel = "Use template",
  label,
  height = 540,
  disabled = false,
  className,
}: PlatePickerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const searchId = `${uid}-search`;
  const captionId = `${uid}-caption`;

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const current = value === undefined ? own : value;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [category, setCategory] = React.useState<string | null>(
    defaultCategory,
  );
  const [query, setQuery] = React.useState(defaultQuery);
  const [lifted, setLifted] = React.useState<string | null>(null);
  const [activeRack, setActiveRack] = React.useState<string | null>(null);
  const [activeRecent, setActiveRecent] = React.useState<string | null>(null);
  // The plate out of the rack, as `where:id`: its slot stays, its face does not.
  const [hiddenKey, setHiddenKey] = React.useState<string | null>(null);
  // Where the pressed plate's thumbnail was, for the template it belongs to;
  // a plate the host pulls out from outside has no slot to grow from.
  const [from, setFrom] = React.useState<{ id: string; rect: Rect } | null>(
    null,
  );
  const [home, setHome] = React.useState<Home | null>(null);
  const [used, setUsed] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so plates already on the page
  // never fade in; true for plates that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const plateNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const pageNodes = React.useRef(new Map<string, HTMLDivElement>());
  const chipNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const titleRef = React.useRef<HTMLInputElement | null>(null);
  const origin = React.useRef<string | null>(null);
  const focusOnOpen = React.useRef(false);
  const usedTimer = React.useRef<number | null>(null);

  /* -------------------------------- data ------------------------------- */

  const byId = new Map(templates.map((t) => [t.id, t]));
  const categoryLabel = (id: string) =>
    categories.find((c) => c.id === id)?.label ?? id;
  const shown = matchPlates(templates, category, query);
  const recentPlates = recent
    .map((id) => byId.get(id))
    .filter((t): t is PlateTemplate => t !== undefined);
  const chosen = current !== null ? (byId.get(current) ?? null) : null;
  const filtered = category !== null || query.trim() !== "";
  const counts = new Map<string, number>();
  for (const t of templates)
    counts.set(t.category, (counts.get(t.category) ?? 0) + 1);

  const rackIds = shown.map((t) => t.id);
  const rackStop =
    current !== null && rackIds.includes(current)
      ? current
      : activeRack !== null && rackIds.includes(activeRack)
        ? activeRack
        : (rackIds[0] ?? null);
  const recentIds = recentPlates.map((t) => t.id);
  const recentStop =
    activeRecent !== null && recentIds.includes(activeRecent)
      ? activeRecent
      : (recentIds[0] ?? null);

  /* ------------------------------- changes ----------------------------- */

  const setCurrent = (id: string | null) => {
    if (value === undefined) setOwn(id);
    onChange?.(id, id !== null ? (byId.get(id) ?? null) : null);
  };

  const open = (id: string, where: Where) => {
    if (inert || current === id) return;
    const template = byId.get(id);
    if (!template) return;
    const key = keyOf(where, id);
    const node = pageNodes.current.get(key);
    const rect = node?.getBoundingClientRect();
    origin.current = key;
    focusOnOpen.current = true;
    setFrom(
      rect && rect.width > 0 && motionSafe
        ? { id, rect: { left: rect.left, top: rect.top, width: rect.width } }
        : null,
    );
    setHome(null);
    setHiddenKey(key);
    setUsed(false);
    setLifted(null);
    setCurrent(id);
    setAnnouncement(
      `${template.name} opened. Fill in a title, or press Escape to go back.`,
    );
  };

  /** Measures the way home, then lets the host (or our own state) close it. */
  const close = (announce = true) => {
    if (current === null) return;
    const frame = frameRef.current?.getBoundingClientRect();
    const key = origin.current;
    const homeNode = key ? pageNodes.current.get(key) : undefined;
    const homeRect = homeNode?.getBoundingClientRect();
    if (
      motionSafe &&
      frame &&
      homeRect &&
      frame.width > 0 &&
      homeRect.width > 0
    ) {
      setHome({
        x: r3(homeRect.left - frame.left),
        y: r3(homeRect.top - frame.top),
        scale: r3(homeRect.width / frame.width),
      });
    } else {
      setHome(null);
    }
    if (usedTimer.current !== null) window.clearTimeout(usedTimer.current);
    usedTimer.current = null;
    const name = chosen?.name ?? "The plate";
    setCurrent(null);
    if (announce) setAnnouncement(`${name} slid home. Back in the rack.`);
    const target = key ? plateNodes.current.get(key) : undefined;
    const fallback = rackStop
      ? plateNodes.current.get(keyOf("rack", rackStop))
      : undefined;
    (target ?? fallback)?.focus({ preventScroll: true });
  };

  const useTemplate = (fields: PlateFields) => {
    if (inert || !chosen || used) return;
    setUsed(true);
    onUse?.(chosen, fields);
    setAnnouncement(
      `Created ${fields.title} from ${chosen.name}, owned by ${fields.owner}.`,
    );
    usedTimer.current = window.setTimeout(() => {
      usedTimer.current = null;
      close(false);
    }, USED_MS);
  };

  const changeCategory = (next: string | null) => {
    if (inert || next === category) return;
    setCategory(next);
    onCategoryChange?.(next);
    const n = matchPlates(templates, next, query).length;
    setAnnouncement(
      `${next === null ? "All templates" : categoryLabel(next)}: ${n} of ${templates.length} shown.`,
    );
  };

  const changeQuery = (next: string) => {
    setQuery(next);
    onQueryChange?.(next);
  };

  const clearFilters = () => {
    setCategory(null);
    onCategoryChange?.(null);
    setQuery("");
    onQueryChange?.("");
    setAnnouncement(`Filters cleared. ${templates.length} templates shown.`);
  };

  React.useEffect(
    () => () => {
      if (usedTimer.current !== null) window.clearTimeout(usedTimer.current);
    },
    [],
  );

  // A plate opened from a press gets the title field; one set by the host
  // leaves focus where it was.
  React.useEffect(() => {
    if (current === null || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    titleRef.current?.focus({ preventScroll: true });
  }, [current]);

  /* ------------------------------ keyboard ----------------------------- */

  const navList = (
    event: React.KeyboardEvent,
    id: string,
    ids: string[],
    where: Where,
  ) => {
    const i = ids.indexOf(id);
    let to = -1;
    if (event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "ArrowDown") {
      if (where === "recent") {
        event.preventDefault();
        if (rackStop) plateNodes.current.get(keyOf("rack", rackStop))?.focus();
        return;
      }
      to = i + 1;
    } else if (event.key === "ArrowUp") {
      if (where === "rack" && i === 0 && recentStop) {
        event.preventDefault();
        plateNodes.current.get(keyOf("recent", recentStop))?.focus();
        return;
      }
      to = i - 1;
    } else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = ids.length - 1;
    else return;
    event.preventDefault();
    const target = ids[clamp(to, 0, ids.length - 1)];
    if (target) plateNodes.current.get(keyOf(where, target))?.focus();
  };

  const chipIds = [null, ...categories.map((c) => c.id)];
  const navChips = (event: React.KeyboardEvent, id: string | null) => {
    const i = chipIds.indexOf(id);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = chipIds.length - 1;
    else return;
    event.preventDefault();
    const target = chipIds[(to + chipIds.length) % chipIds.length];
    if (target === undefined) return;
    changeCategory(target);
    chipNodes.current.get(target ?? "__all")?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const d = DENSITY[density];
  const variant: PlateVariant = rackStyle;
  const step = cascade(Math.min(shown.length, 12));
  const liftedTemplate =
    lifted !== null
      ? byId.get(lifted.slice(lifted.indexOf(":") + 1))
      : undefined;
  const caption = liftedTemplate ?? chosen;
  const tone = ACCENTS[accent] ?? ACCENTS.cobalt;

  const renderPlate = (
    template: PlateTemplate,
    where: Where,
    ids: string[],
    index: number,
  ) => {
    const key = keyOf(where, template.id);
    const stop = where === "rack" ? rackStop : recentStop;
    return (
      <Plate
        key={template.id}
        template={template}
        categoryLabel={categoryLabel(template.category)}
        variant={where === "recent" ? "small" : variant}
        density={density}
        lifted={lifted === key}
        chosen={current === template.id}
        hidden={hiddenKey === key}
        motionSafe={motionSafe}
        enterDelay={
          live && where === "rack" ? r3(Math.min(index, 12) * step) : null
        }
        tabIndex={stop === template.id ? 0 : -1}
        disabled={inert}
        nodeRef={(node) => {
          if (node) plateNodes.current.set(key, node);
          else plateNodes.current.delete(key);
        }}
        pageRef={(node) => {
          if (node) pageNodes.current.set(key, node);
          else pageNodes.current.delete(key);
        }}
        onLift={(on) =>
          setLifted((prev) => (on ? key : prev === key ? null : prev))
        }
        onFocusPlate={() => {
          if (where === "rack") setActiveRack(template.id);
          else setActiveRecent(template.id);
        }}
        onOpen={() => open(template.id, where)}
        onNav={(event) => navList(event, template.id, ids, where)}
      />
    );
  };

  const chip = (id: string | null, text: string, count: number) => {
    const on = category === id;
    return (
      <button
        key={id ?? "__all"}
        ref={(node) => {
          if (node) chipNodes.current.set(id ?? "__all", node);
          else chipNodes.current.delete(id ?? "__all");
        }}
        type="button"
        role="radio"
        aria-checked={on}
        aria-disabled={inert || undefined}
        tabIndex={on ? 0 : -1}
        onClick={() => changeCategory(id)}
        onKeyDown={(event) => navChips(event, id)}
        className={cn(
          "relative isolate inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
          on
            ? "border-transparent"
            : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
          inert ? "cursor-not-allowed" : "cursor-pointer",
          FOCUS_RING,
        )}
        style={
          on
            ? {
                color: "var(--pp-on)",
                // The indicator paints the fill when it can travel between
                // chips; otherwise the chip fills itself in place.
                background: motionSafe ? undefined : "var(--pp-accent)",
              }
            : undefined
        }
      >
        {on && motionSafe ? (
          <motion.span
            aria-hidden
            layoutId={`${uid}-chip`}
            transition={springs.snap}
            className="absolute inset-0 -z-10 rounded-full"
            style={{ background: "var(--pp-accent)" }}
          />
        ) : null}
        {text}
        <span className="font-mono text-[10px] tabular-nums opacity-70">
          {count}
        </span>
      </button>
    );
  };

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--pp-accent" as string]: tone.color,
        ["--pp-on" as string]: tone.on,
        ["--pp-wash" as string]: `color-mix(in oklab, ${tone.color} 12%, transparent)`,
      }}
    >
      <header className="flex shrink-0 flex-col gap-2.5 px-4 pt-3 pb-2.5 @min-[30rem]:flex-row @min-[30rem]:items-center @min-[30rem]:gap-4">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready ? (
            <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {shown.length} of {templates.length}
            </p>
          ) : null}
        </div>
        <div className="relative flex w-full items-center @min-[30rem]:w-[44%] @min-[30rem]:max-w-[260px]">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3"
          />
          <label htmlFor={searchId} className="sr-only">
            {searchPlaceholder}
          </label>
          <input
            id={searchId}
            type="text"
            value={query}
            placeholder={searchPlaceholder}
            disabled={inert}
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query !== "") {
                event.preventDefault();
                changeQuery("");
              }
            }}
            className={cn(INPUT, "pl-8", query !== "" && "pr-8", FOCUS_RING)}
          />
          {query !== "" ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => changeQuery("")}
              className={cn(
                "absolute right-1.5 inline-flex size-5 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <X aria-hidden className="size-3" />
            </button>
          ) : null}
        </div>
      </header>

      {status === "loading" ? (
        <div aria-hidden className="flex shrink-0 gap-1.5 px-4 pb-3">
          {Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              className="h-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{
                width: 54 + ((i * 19) % 30),
                animationDelay: `${i * 70}ms`,
              }}
            />
          ))}
        </div>
      ) : status === "error" ? null : (
        <div
          role="radiogroup"
          aria-label="Category"
          className="flex shrink-0 flex-wrap items-center gap-1.5 px-4 pb-3"
        >
          {chip(null, "All", templates.length)}
          {categories.map((c) => chip(c.id, c.label, counts.get(c.id) ?? 0))}
        </div>
      )}

      <div className="relative min-h-0 flex-1 border-t border-hairline">
        <div
          inert={current !== null}
          className="flex h-full flex-col overflow-x-hidden overflow-y-auto overscroll-contain"
        >
          {status === "error" ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-sm text-foreground">
                The templates didn&apos;t load.
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
            <div
              aria-hidden
              className="grid px-4 py-4"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${d.min}px, 1fr))`,
                gap: d.gap,
              }}
            >
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className="flex flex-col gap-1.5 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <span className="block aspect-[5/4] w-full rounded-3 bg-surface-2" />
                  <span className="block h-3 w-[60%] rounded-1 bg-surface-2" />
                </span>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Inbox aria-hidden className="size-5 text-ink-3" />
              <p className="text-sm text-ink-2">No templates yet.</p>
              <p className="text-[12px] text-ink-3">
                Templates your team publishes will stand here.
              </p>
            </div>
          ) : (
            <>
              {recentPlates.length > 0 ? (
                <div className="flex shrink-0 flex-col gap-1.5 border-b border-hairline px-4 pt-3 pb-2.5">
                  <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    <Clock aria-hidden className="size-3" />
                    Recently used
                  </p>
                  <div
                    role="listbox"
                    aria-label="Recently used templates"
                    className="-m-1 flex flex-wrap items-start gap-1 p-1"
                  >
                    {recentPlates.map((t, i) =>
                      renderPlate(t, "recent", recentIds, i),
                    )}
                  </div>
                </div>
              ) : null}

              {shown.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <Inbox aria-hidden className="size-5 text-ink-3" />
                  <p className="text-sm text-ink-2">No templates match.</p>
                  {filtered ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      <X aria-hidden className="size-3" />
                      Clear filters
                    </button>
                  ) : null}
                </div>
              ) : (
                <div
                  role="listbox"
                  aria-label="Templates"
                  aria-describedby={variant !== "list" ? captionId : undefined}
                  className={cn(
                    "px-4 pt-3 pb-4",
                    variant === "list" ? "flex flex-col" : "grid",
                    variant === "rack" && "[perspective:900px]",
                  )}
                  style={
                    variant === "list"
                      ? { gap: 2 }
                      : {
                          gridTemplateColumns: `repeat(auto-fill, minmax(${d.min}px, 1fr))`,
                          gap:
                            variant === "rack"
                              ? `${d.gap + 6}px ${d.gap}px`
                              : d.gap,
                        }
                  }
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {shown.map((t, i) => renderPlate(t, "rack", rackIds, i))}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}
        </div>

        <AnimatePresence
          custom={home}
          onExitComplete={() => {
            setHiddenKey(null);
            setFrom(null);
          }}
        >
          {chosen ? (
            <motion.div
              key={chosen.id}
              initial="enter"
              animate="live"
              exit="exit"
              variants={{ enter: {}, live: {}, exit: {} }}
              className="absolute inset-0 z-10"
            >
              <motion.div
                aria-hidden
                variants={{
                  enter: { opacity: 0 },
                  live: {
                    opacity: 1,
                    transition: {
                      duration: durations.base,
                      ease: easings.enter,
                    },
                  },
                  exit: { opacity: 0, transition: exitFor(durations.slow) },
                }}
                className="pointer-events-none absolute inset-0 bg-card"
              />
              <div className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain">
                <Preview
                  template={chosen}
                  categoryLabel={categoryLabel(chosen.category)}
                  from={from && from.id === chosen.id ? from.rect : null}
                  motionSafe={motionSafe}
                  owner={owner}
                  useLabel={useLabel}
                  used={used}
                  disabled={inert}
                  frameRef={frameRef}
                  titleRef={titleRef}
                  onBack={() => close()}
                  onUse={useTemplate}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {variant !== "list" && ready && templates.length > 0 ? (
        <div
          id={captionId}
          className="flex h-10 shrink-0 items-center overflow-hidden border-t border-hairline px-4"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p
              key={caption?.id ?? "__hint"}
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="min-w-0 truncate text-[12px]"
            >
              {caption ? (
                <>
                  <span className="font-medium text-foreground">
                    {caption.name}
                  </span>
                  <span className="text-ink-3" aria-hidden>
                    {" "}
                    ·{" "}
                  </span>
                  <span className="text-ink-2">{caption.blurb}</span>
                </>
              ) : (
                <span className="text-ink-3">
                  Hover or focus a plate to read about it.
                </span>
              )}
            </motion.p>
          </AnimatePresence>
        </div>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
