"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Boxes,
  Check,
  Database,
  FileSpreadsheet,
  FileUp,
  LayoutTemplate,
  LoaderCircle,
  RadioTower,
  Sheet,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type GhostColumn = {
  key: string;
  label: string;
  /** Share of the row's width. @default 1 */
  weight?: number;
  align?: "left" | "right";
  /** Codes and figures read better in mono. */
  mono?: boolean;
};

export type GhostTemplate = {
  id: string;
  label: string;
  /** One line under the name. */
  blurb: string;
  /** Up to six; the first two always show, the rest as the table widens. */
  columns: GhostColumn[];
  /** Sample rows, keyed by column. */
  rows: Record<string, string>[];
};

export type GhostSource = {
  id: string;
  label: string;
  /** What it brings and how often. */
  detail: string;
  kind: "erp" | "sheet" | "feed";
};

export type GhostImportState = {
  phase: "reading" | "failed";
  /** The file's name. */
  file: string;
  /** 0–1 while reading. */
  progress?: number;
  /** Rows read so far. */
  rows?: number;
  /** What is wrong with the file, in plain words. */
  error?: string;
};

export type GhostLayout = "split" | "stack";

export type GhostRowsProps = {
  /** How faint the poured preview rows are, 0.2–0.7. @default 0.42 */
  ghostOpacity?: number;
  /** Ways in beside the table, or as three columns above it. Narrow containers always stack. @default "split" */
  layout?: GhostLayout;
  /** Focus and hover wash, the solid wave and the progress bar, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Templates a table can start from. @default defaultGhostTemplates */
  templates?: GhostTemplate[];
  /** Sources a table can be connected to. @default defaultGhostSources */
  sources?: GhostSource[];
  /** Controlled chosen template id, or null while the table is empty. */
  value?: string | null;
  /** Initial template when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the press or key that chose (or undid) a template. */
  onValueChange?: (id: string | null) => void;
  /** A template previewed without pointing at it (a guided tour, an onboarding hint); pointing or focusing takes over. @default null */
  preview?: string | null;
  /** Fires when pointing or focusing changes the previewed template, with its id, or null when it leaves. */
  onPreviewChange?: (id: string | null) => void;
  /** A template was chosen. */
  onTemplate?: (template: GhostTemplate) => void;
  /** A file was picked or dropped. Drive `importState` from here. */
  onImport?: (file: File) => void;
  /** A source was chosen. Return a promise to show connecting; a rejection says so on the option. */
  onConnect?: (source: GhostSource) => void | Promise<unknown>;
  /** An import in progress (a progress row) or one that failed (a row that explains). @default null */
  importState?: GhostImportState | null;
  /** File types the picker offers. @default ".csv,.tsv,.xlsx" */
  accept?: string;
  /** How many sample rows pour in (the phone preview shows two). @default 6 */
  ghostRows?: number;
  /** The table's name. @default "Inventory" */
  title?: string;
  /** The workspace it belongs to. @default "Fernworks" */
  workspace?: string;
  /** Height of the surface, px; its body scrolls inside it. @default 540 */
  height?: number;
  /** Nothing can be chosen, imported or connected. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultGhostTemplates: GhostTemplate[] = [
  {
    id: "spares",
    label: "Spare parts",
    blurb: "Bins, reorder points and suppliers",
    columns: [
      { key: "sku", label: "SKU", mono: true, weight: 0.9 },
      { key: "part", label: "Part", weight: 1.6 },
      { key: "bin", label: "Bin", mono: true, weight: 0.7 },
      { key: "qty", label: "On hand", align: "right", mono: true, weight: 0.8 },
      {
        key: "reorder",
        label: "Reorder at",
        align: "right",
        mono: true,
        weight: 0.9,
      },
      { key: "supplier", label: "Supplier", weight: 1.1 },
    ],
    rows: [
      {
        sku: "FW-1042",
        part: "Bearing 6204-2RS",
        bin: "A3-12",
        qty: "48",
        reorder: "20",
        supplier: "Basinworks",
      },
      {
        sku: "FW-1187",
        part: "V-belt, 13 × 1250",
        bin: "A3-14",
        qty: "12",
        reorder: "10",
        supplier: "Basinworks",
      },
      {
        sku: "FW-2210",
        part: "Hydraulic seal kit",
        bin: "B1-02",
        qty: "6",
        reorder: "8",
        supplier: "Coldbrook",
      },
      {
        sku: "FW-2318",
        part: "Proximity sensor M12",
        bin: "B2-07",
        qty: "21",
        reorder: "6",
        supplier: "Fieldline",
      },
      {
        sku: "FW-3051",
        part: "Gear motor 0.37 kW",
        bin: "C1-01",
        qty: "3",
        reorder: "2",
        supplier: "Gaugeworks",
      },
      {
        sku: "FW-3302",
        part: "Fuse, 10 A slow",
        bin: "B4-19",
        qty: "140",
        reorder: "50",
        supplier: "Fieldline",
      },
    ],
  },
  {
    id: "raw",
    label: "Raw materials",
    blurb: "Lots, grades and when they arrived",
    columns: [
      { key: "lot", label: "Lot", mono: true, weight: 0.9 },
      { key: "material", label: "Material", weight: 1.5 },
      { key: "grade", label: "Grade", weight: 0.8 },
      {
        key: "qty",
        label: "Quantity",
        align: "right",
        mono: true,
        weight: 0.9,
      },
      { key: "unit", label: "Unit", weight: 0.6 },
      { key: "received", label: "Received", mono: true, weight: 0.9 },
    ],
    rows: [
      {
        lot: "L-26-0418",
        material: "Aluminium sheet",
        grade: "5083-H111",
        qty: "1,240",
        unit: "kg",
        received: "02 Oct",
      },
      {
        lot: "L-26-0421",
        material: "Stainless bar",
        grade: "316L",
        qty: "380",
        unit: "kg",
        received: "05 Oct",
      },
      {
        lot: "L-26-0433",
        material: "Birch plywood",
        grade: "BB/CP",
        qty: "64",
        unit: "sheets",
        received: "06 Oct",
      },
      {
        lot: "L-26-0440",
        material: "Nylon pellets",
        grade: "PA6 GF30",
        qty: "750",
        unit: "kg",
        received: "08 Oct",
      },
      {
        lot: "L-26-0447",
        material: "Copper wire",
        grade: "1.5 mm²",
        qty: "12",
        unit: "reels",
        received: "09 Oct",
      },
      {
        lot: "L-26-0452",
        material: "Epoxy resin",
        grade: "Low-visc",
        qty: "40",
        unit: "litres",
        received: "11 Oct",
      },
    ],
  },
  {
    id: "finished",
    label: "Finished goods",
    blurb: "Batches, reservations and where they sit",
    columns: [
      { key: "sku", label: "SKU", mono: true, weight: 0.9 },
      { key: "product", label: "Product", weight: 1.6 },
      { key: "batch", label: "Batch", mono: true, weight: 0.8 },
      {
        key: "available",
        label: "Available",
        align: "right",
        mono: true,
        weight: 0.9,
      },
      {
        key: "reserved",
        label: "Reserved",
        align: "right",
        mono: true,
        weight: 0.9,
      },
      { key: "location", label: "Location", weight: 0.9 },
    ],
    rows: [
      {
        sku: "FG-0101",
        product: "Planter, tall, slate",
        batch: "B-2614",
        available: "86",
        reserved: "24",
        location: "Dock 2",
      },
      {
        sku: "FG-0107",
        product: "Planter, low, moss",
        batch: "B-2615",
        available: "140",
        reserved: "0",
        location: "Rack 4",
      },
      {
        sku: "FG-0220",
        product: "Trellis panel 1.8 m",
        batch: "B-2602",
        available: "32",
        reserved: "18",
        location: "Yard",
      },
      {
        sku: "FG-0231",
        product: "Seed tray, 40 cell",
        batch: "B-2620",
        available: "610",
        reserved: "200",
        location: "Rack 1",
      },
      {
        sku: "FG-0312",
        product: "Rain barrel 200 L",
        batch: "B-2598",
        available: "9",
        reserved: "9",
        location: "Dock 1",
      },
      {
        sku: "FG-0340",
        product: "Cold frame kit",
        batch: "B-2611",
        available: "15",
        reserved: "4",
        location: "Rack 6",
      },
    ],
  },
  {
    id: "tools",
    label: "Tools and equipment",
    blurb: "Who has what, and when it is due a check",
    columns: [
      { key: "tag", label: "Asset tag", mono: true, weight: 0.9 },
      { key: "tool", label: "Tool", weight: 1.5 },
      { key: "holder", label: "Assigned to", weight: 1.1 },
      { key: "condition", label: "Condition", weight: 0.9 },
      { key: "checked", label: "Last check", mono: true, weight: 0.9 },
      { key: "due", label: "Due", mono: true, weight: 0.8 },
    ],
    rows: [
      {
        tag: "T-0041",
        tool: "Torque wrench 40–200",
        holder: "Line 1",
        condition: "Good",
        checked: "14 Sep",
        due: "14 Dec",
      },
      {
        tag: "T-0058",
        tool: "Pallet truck 2.5 t",
        holder: "Dock team",
        condition: "Worn",
        checked: "02 Oct",
        due: "02 Nov",
      },
      {
        tag: "T-0063",
        tool: "Laser level",
        holder: "Ada Brandt",
        condition: "Good",
        checked: "21 Aug",
        due: "21 Feb",
      },
      {
        tag: "T-0077",
        tool: "Multimeter",
        holder: "Maintenance",
        condition: "Good",
        checked: "30 Sep",
        due: "30 Mar",
      },
      {
        tag: "T-0090",
        tool: "Cordless drill",
        holder: "Line 2",
        condition: "Repair",
        checked: "08 Oct",
        due: "Now",
      },
      {
        tag: "T-0102",
        tool: "Label printer",
        holder: "Shipping",
        condition: "Good",
        checked: "11 Jul",
        due: "11 Jan",
      },
    ],
  },
];

export const defaultGhostSources: GhostSource[] = [
  {
    id: "basin-erp",
    label: "Basinworks ERP",
    detail: "Items, stock and bins · nightly",
    kind: "erp",
  },
  {
    id: "coldbrook-sheets",
    label: "Coldbrook Sheets",
    detail: "Any sheet with a header row",
    kind: "sheet",
  },
  {
    id: "fieldline-feed",
    label: "Fieldline warehouse feed",
    detail: "Live stock levels · every 5 min",
    kind: "feed",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const ROW_H = 36;
const EMPTY_COLUMNS: GhostColumn[] = [
  { key: "item", label: "Item", weight: 1.6 },
  { key: "qty", label: "Quantity", align: "right", weight: 0.9 },
  { key: "where", label: "Location", weight: 1 },
];
const SOURCE_ICON = { erp: Database, sheet: Sheet, feed: RadioTower } as const;

const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const tracks = (cols: GhostColumn[], n: number) =>
  cols
    .slice(0, n)
    .map((c) => `minmax(0,${c.weight ?? 1}fr)`)
    .join(" ") || "minmax(0,1fr)";
/** Columns past the second show as the table widens: four at 22rem, six at 30rem. */
const colClass = (i: number) =>
  i < 2
    ? ""
    : i < 4
      ? "hidden @min-[22rem]/table:block"
      : "hidden @min-[30rem]/table:block";

type Option =
  | { kind: "import"; id: string }
  | { kind: "source"; id: string; source: GhostSource }
  | { kind: "template"; id: string; template: GhostTemplate };

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A new, empty table with three ways in: import a file, connect a source, or
 * start from a template. Pointing at a template, or focusing it, re-heads the
 * table with that template's columns (the tracks re-divide on a glide-length
 * ease) and pours its sample rows in one by one — each drops from 12px above
 * on `springs.snap`, a `cascade()` apart, and settles at `ghostOpacity`, with
 * dashed rules so it never reads as data. Moving on drains them, last row
 * first, on the exit ease.
 *
 * Choosing the template turns the ghosts solid in a wave down the rows —
 * each comes to full strength, its rule turns solid and its background
 * flashes the accent wash — while the ways in fold away on `springs.glide`.
 * An import in progress is a progress row; a failed one explains the file
 * problem in a row of its own. The options are one tab stop: arrows move,
 * Enter chooses. Under reduced motion ghosts appear in place and the wave is
 * a single cross-fade.
 */
export function GhostRows({
  ghostOpacity = 0.42,
  layout = "split",
  accent = "var(--accent-bright)",
  templates = defaultGhostTemplates,
  sources = defaultGhostSources,
  value,
  defaultValue = null,
  onValueChange,
  onTemplate,
  preview: hinted = null,
  onPreviewChange,
  onImport,
  onConnect,
  importState = null,
  accept = ".csv,.tsv,.xlsx",
  ghostRows = 6,
  title = "Inventory",
  workspace = "Fernworks",
  height = 540,
  disabled = false,
  className,
}: GhostRowsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${safeId}-title`;
  const fileId = `${safeId}-file`;
  const opacity = Math.min(0.7, Math.max(0.2, ghostOpacity));

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const chosenId = value === undefined ? own : value;
  const chosen = templates.find((t) => t.id === chosenId) ?? null;

  /* ------------------------------- preview ----------------------------- */

  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const previewId = chosen ? null : (hoverId ?? focusId ?? hinted);
  const preview = templates.find((t) => t.id === previewId) ?? null;
  const shown = chosen ?? preview;
  const columns = shown?.columns ?? EMPTY_COLUMNS;
  const ghostCount = Math.max(1, Math.round(ghostRows));
  const rows = chosen
    ? chosen.rows
    : preview
      ? preview.rows.slice(0, ghostCount)
      : [];
  const bodyRows = Math.max(ghostCount, chosen ? chosen.rows.length : 0);
  const narrowRows = chosen ? chosen.rows.length : Math.min(2, ghostCount);

  const [announcement, setAnnouncement] = React.useState("");
  const announced = React.useRef<string | null>(null);
  React.useEffect(() => {
    // Previews are announced once per template, never per hover flicker.
    if (!preview || announced.current === preview.id) return;
    announced.current = preview.id;
    const t = window.setTimeout(
      () =>
        setAnnouncement(
          `Preview: ${preview.label}, ${preview.columns.length} columns, ${Math.min(ghostCount, preview.rows.length)} sample rows.`,
        ),
      300,
    );
    return () => window.clearTimeout(t);
  }, [ghostCount, preview]);

  // The ways in go inert once a template is chosen, and Undo leaves with the
  // choice: focus is carried to whichever control takes over, on arrival.
  const carryFocus = React.useRef<"undo" | "options" | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  const choose = (template: GhostTemplate | null) => {
    if (disabled) return;
    if (template && panelRef.current?.contains(document.activeElement)) {
      carryFocus.current = "undo";
    } else if (!template) {
      carryFocus.current = "options";
    }
    if (value === undefined) setOwn(template?.id ?? null);
    onValueChange?.(template?.id ?? null);
    if (template) {
      onTemplate?.(template);
      setAnnouncement(
        `Started from ${template.label}. ${template.rows.length} items added.`,
      );
    } else {
      setAnnouncement("Template removed. The table is empty.");
      announced.current = null;
    }
    setHoverId(null);
    setFocusId(null);
  };

  /* ------------------------------- import ------------------------------ */

  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const pick = () => {
    if (disabled) return;
    fileRef.current?.click();
  };
  const [dropping, setDropping] = React.useState(false);
  const hasFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  /* ------------------------------- sources ----------------------------- */

  const [links, setLinks] = React.useState<
    Record<string, "pending" | "done" | "failed">
  >({});
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const connect = (source: GhostSource) => {
    if (disabled || links[source.id] === "pending") return;
    const set = (state: "pending" | "done" | "failed") => {
      if (alive.current) setLinks((l) => ({ ...l, [source.id]: state }));
    };
    let result: void | Promise<unknown>;
    try {
      result = onConnect?.(source);
    } catch {
      set("failed");
      setAnnouncement(`Couldn't connect ${source.label}.`);
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      set("pending");
      (result as Promise<unknown>).then(
        () => {
          set("done");
          if (alive.current) setAnnouncement(`${source.label} connected.`);
        },
        () => {
          set("failed");
          if (alive.current)
            setAnnouncement(`Couldn't connect ${source.label}.`);
        },
      );
    } else {
      set("done");
      setAnnouncement(`${source.label} connected.`);
    }
  };

  /* ------------------------------- options ----------------------------- */

  const options: Option[] = [
    { kind: "import", id: "import" },
    ...sources.map((source) => ({
      kind: "source" as const,
      id: `source-${source.id}`,
      source,
    })),
    ...templates.map((template) => ({
      kind: "template" as const,
      id: `template-${template.id}`,
      template,
    })),
  ];
  const [roving, setRoving] = React.useState(options[0]?.id ?? "import");
  const optionRefs = React.useRef(new Map<string, HTMLButtonElement>());
  React.useEffect(() => {
    if (chosenId !== null || carryFocus.current !== "options") return;
    carryFocus.current = null;
    optionRefs.current.get(roving)?.focus();
  }, [chosenId, roving]);
  const move = (from: string, step: number | "first" | "last") => {
    const i = options.findIndex((o) => o.id === from);
    const to =
      step === "first"
        ? 0
        : step === "last"
          ? options.length - 1
          : Math.min(options.length - 1, Math.max(0, i + step));
    const next = options[to];
    if (!next) return;
    setRoving(next.id);
    optionRefs.current.get(next.id)?.focus();
  };
  const onOptionKey = (event: React.KeyboardEvent, id: string) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      move(id, 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(id, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      move(id, "first");
    } else if (event.key === "End") {
      event.preventDefault();
      move(id, "last");
    }
  };
  const activate = (o: Option) => {
    if (o.kind === "import") pick();
    else if (o.kind === "source") connect(o.source);
    else choose(o.template);
  };
  // Only state here: anything that touches a ref is written inline on the
  // button, where the compiler can see it runs in an event, not in render.
  const optionBase = (o: Option) => ({
    type: "button" as const,
    tabIndex: roving === o.id ? 0 : -1,
    "aria-disabled": disabled || undefined,
    onFocus: () => {
      setRoving(o.id);
      const id = o.kind === "template" ? o.template.id : null;
      setFocusId(id);
      if (id !== focusId) onPreviewChange?.(hoverId ?? id);
    },
    onBlur: () =>
      setFocusId((f) =>
        o.kind === "template" && f === o.template.id ? null : f,
      ),
  });
  const optionClass = cn(
    "flex w-full min-w-0 items-center gap-2 rounded-2 px-2 py-1.5 text-left transition-colors @min-[30rem]:gap-2.5 @min-[30rem]:px-2.5",
    FOCUS_RING,
    disabled
      ? "cursor-not-allowed opacity-60"
      : "cursor-pointer hover:bg-[color-mix(in_oklab,var(--gr-accent)_8%,transparent)]",
  );

  const step = cascade(Math.max(2, rows.length));
  const trackStyle = {
    ["--gr-c2" as string]: tracks(columns, 2),
    ["--gr-c4" as string]: tracks(columns, 4),
    ["--gr-c6" as string]: tracks(columns, 6),
    transitionProperty: "grid-template-columns",
    transitionDuration: motionSafe ? "420ms" : "0ms",
    transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
  } as React.CSSProperties;
  const gridCols =
    "grid [grid-template-columns:var(--gr-c2)] @min-[22rem]/table:[grid-template-columns:var(--gr-c4)] @min-[30rem]/table:[grid-template-columns:var(--gr-c6)]";

  const importOption = options[0];

  const optionsPanel = (
    <div className="flex flex-col gap-3 p-3 @min-[30rem]:p-4">
      <p className="hidden text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase @min-[30rem]:block">
        Three ways in
      </p>
      <div
        className={cn(
          "grid grid-cols-1 gap-2 @min-[30rem]:gap-3",
          layout === "stack" && "@min-[40rem]:grid-cols-3",
        )}
      >
        <div
          role="group"
          aria-labelledby={`${safeId}-g-import`}
          className="flex flex-col gap-1"
        >
          <span
            id={`${safeId}-g-import`}
            className="px-1 text-[11px] text-ink-3"
          >
            Import a file
          </span>
          {importOption ? (
            <button
              {...optionBase(importOption)}
              ref={(node) => {
                if (node) optionRefs.current.set(importOption.id, node);
                else optionRefs.current.delete(importOption.id);
              }}
              onKeyDown={(event) => onOptionKey(event, importOption.id)}
              onClick={() => activate(importOption)}
              aria-label={`Import a file (${accept.replaceAll(",", ", ")}), or drop one on the table`}
              className={cn(
                optionClass,
                "border border-dashed border-hairline-strong",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2 @min-[30rem]:size-8">
                <FileUp aria-hidden className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] text-foreground">
                  Choose a file
                </span>
                <span className="hidden truncate text-[11px] text-ink-3 @min-[30rem]:block">
                  {accept
                    .replaceAll(".", "")
                    .replaceAll(",", ", ")
                    .toUpperCase()}{" "}
                  · or drop it on the table
                </span>
              </span>
            </button>
          ) : null}
          <input
            ref={fileRef}
            id={fileId}
            type="file"
            accept={accept}
            aria-label="File to import"
            tabIndex={-1}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file && !disabled) onImport?.(file);
            }}
          />
        </div>

        <div
          role="group"
          aria-labelledby={`${safeId}-g-source`}
          className="flex flex-col gap-1"
        >
          <span
            id={`${safeId}-g-source`}
            className="px-1 text-[11px] text-ink-3"
          >
            Connect a source
          </span>
          <div className="grid grid-cols-2 gap-1 @min-[30rem]:grid-cols-1">
            {options
              .filter(
                (o): o is Extract<Option, { kind: "source" }> =>
                  o.kind === "source",
              )
              .map((o) => {
                const Icon = SOURCE_ICON[o.source.kind];
                const link = links[o.source.id];
                return (
                  <button
                    key={o.id}
                    {...optionBase(o)}
                    ref={(node) => {
                      if (node) optionRefs.current.set(o.id, node);
                      else optionRefs.current.delete(o.id);
                    }}
                    onKeyDown={(event) => onOptionKey(event, o.id)}
                    onClick={() => activate(o)}
                    aria-busy={link === "pending" || undefined}
                    aria-label={`Connect ${o.source.label}: ${o.source.detail}${link === "done" ? ", connected" : link === "failed" ? ", couldn't connect" : ""}`}
                    className={optionClass}
                  >
                    <span className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2 @min-[30rem]:flex">
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className="line-clamp-2 text-[12px] leading-tight text-foreground @min-[30rem]:line-clamp-1 @min-[30rem]:text-[13px] @min-[30rem]:leading-normal"
                        title={o.source.label}
                      >
                        {o.source.label}
                      </span>
                      <span
                        className={cn(
                          "truncate text-[11px]",
                          link === "failed" ? "text-danger" : "text-ink-3",
                          !link && "hidden @min-[30rem]:block",
                        )}
                      >
                        {link === "failed"
                          ? "Couldn't connect · try again"
                          : link === "done"
                            ? "Connected · first sync running"
                            : o.source.detail}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="relative flex size-4 shrink-0 text-ink-3"
                    >
                      {link === "pending" ? (
                        <LoaderCircle className="size-4 motion-safe:animate-spin" />
                      ) : link === "done" ? (
                        <motion.span
                          className="absolute inset-0 flex text-success"
                          initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={
                            motionSafe ? springs.flick : { duration: 0 }
                          }
                        >
                          <Check className="size-4" strokeWidth={2.5} />
                        </motion.span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>

        <div
          role="group"
          aria-labelledby={`${safeId}-g-template`}
          className="flex flex-col gap-1"
          onPointerLeave={() => {
            if (hoverId === null) return;
            setHoverId(null);
            onPreviewChange?.(focusId);
          }}
        >
          <span
            id={`${safeId}-g-template`}
            className="px-1 text-[11px] text-ink-3"
          >
            Start from a template
          </span>
          <div className="grid grid-cols-2 gap-1 @min-[30rem]:grid-cols-1">
            {options
              .filter(
                (o): o is Extract<Option, { kind: "template" }> =>
                  o.kind === "template",
              )
              .map((o) => {
                const on = previewId === o.template.id;
                return (
                  <button
                    key={o.id}
                    {...optionBase(o)}
                    ref={(node) => {
                      if (node) optionRefs.current.set(o.id, node);
                      else optionRefs.current.delete(o.id);
                    }}
                    onKeyDown={(event) => onOptionKey(event, o.id)}
                    onClick={() => activate(o)}
                    aria-label={`Start from the ${o.template.label} template: ${o.template.columns.length} columns, ${o.template.blurb.toLowerCase()}`}
                    onPointerEnter={() => {
                      if (disabled) return;
                      setHoverId(o.template.id);
                      onPreviewChange?.(o.template.id);
                    }}
                    className={cn(
                      optionClass,
                      on &&
                        "bg-[color-mix(in_oklab,var(--gr-accent)_10%,transparent)]",
                    )}
                  >
                    <span
                      className={cn(
                        "hidden size-8 shrink-0 items-center justify-center rounded-2 transition-colors @min-[30rem]:flex",
                        on
                          ? "bg-[color-mix(in_oklab,var(--gr-accent)_18%,transparent)] text-(--gr-accent)"
                          : "bg-surface-2 text-ink-2",
                      )}
                    >
                      <LayoutTemplate aria-hidden className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className="line-clamp-2 text-[12px] leading-tight text-foreground @min-[30rem]:line-clamp-1 @min-[30rem]:text-[13px] @min-[30rem]:leading-normal"
                        title={o.template.label}
                      >
                        {o.template.label}
                      </span>
                      <span className="hidden truncate text-[11px] text-ink-3 @min-[30rem]:block">
                        {o.template.blurb}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="hidden shrink-0 font-mono text-[10.5px] text-ink-3 tabular-nums @min-[30rem]:inline"
                    >
                      {o.template.columns.length} col
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );

  const progress = Math.min(1, Math.max(0, importState?.progress ?? 0));

  const table = (
    <div
      className="@container/table flex min-w-0 flex-col gap-2 p-4"
      onDragEnter={(event) => {
        if (!disabled && hasFiles(event)) setDropping(true);
      }}
      onDragOver={(event) => {
        if (!disabled && hasFiles(event)) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        const file = event.dataTransfer?.files?.[0];
        if (!file || disabled) return;
        event.preventDefault();
        onImport?.(file);
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13px] font-medium text-foreground">{title}</span>
        <motion.span
          key={chosen ? "chosen" : preview ? `preview-${preview.id}` : "empty"}
          className={cn(
            "inline-flex h-5 items-center rounded-full px-2 text-[10.5px]",
            chosen
              ? "bg-[color-mix(in_oklab,var(--gr-accent)_14%,transparent)] text-(--gr-accent)"
              : preview
                ? "border border-dashed border-[color-mix(in_oklab,var(--gr-accent)_55%,transparent)] text-ink-2 italic"
                : "bg-surface-2 text-ink-3",
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.fast }}
        >
          {chosen
            ? `${chosen.rows.length} items · from ${chosen.label}`
            : preview
              ? `Preview · ${preview.label}`
              : "0 items"}
        </motion.span>
        {chosen ? (
          <button
            ref={(node) => {
              if (node && carryFocus.current === "undo") {
                carryFocus.current = null;
                node.focus();
              }
            }}
            type="button"
            onClick={() => choose(null)}
            className={cn(
              "ml-auto inline-flex h-7 items-center gap-1.5 rounded-2 px-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <Undo2 aria-hidden className="size-3.5" />
            Undo
          </button>
        ) : null}
      </div>

      <div
        role="table"
        aria-labelledby={titleId}
        aria-rowcount={chosen ? chosen.rows.length + 1 : 1}
        className={cn(
          "relative overflow-hidden rounded-3 border bg-card transition-colors",
          dropping
            ? "border-dashed border-(--gr-accent) bg-[color-mix(in_oklab,var(--gr-accent)_5%,transparent)]"
            : "border-hairline",
        )}
      >
        <div role="rowgroup">
          <div
            role="row"
            className={cn(
              gridCols,
              "h-9 items-center gap-3 border-b border-hairline bg-surface-1 px-3",
            )}
            style={trackStyle}
          >
            {columns.map((c, i) => (
              <motion.span
                key={`${shown?.id ?? "empty"}-${c.key}`}
                role="columnheader"
                className={cn(
                  "truncate text-[11px] font-medium",
                  shown ? "text-ink-2" : "text-ink-3",
                  c.align === "right" && "text-right",
                  colClass(i),
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.fast, delay: i * 0.02 }}
              >
                {c.label}
              </motion.span>
            ))}
          </div>
        </div>

        {importState ? (
          <div
            className={cn(
              "flex flex-col gap-1.5 border-b px-3 py-2.5",
              importState.phase === "failed"
                ? "border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_6%,transparent)]"
                : "border-hairline bg-surface-1",
            )}
            role={importState.phase === "failed" ? "alert" : undefined}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {importState.phase === "failed" ? (
                <TriangleAlert
                  aria-hidden
                  className="size-4 shrink-0 text-danger"
                />
              ) : (
                <FileSpreadsheet
                  aria-hidden
                  className="size-4 shrink-0 text-ink-2"
                />
              )}
              <span
                className="min-w-0 truncate font-mono text-[12px] text-foreground"
                title={importState.file}
              >
                {importState.file}
              </span>
              <span className="text-[11.5px] text-ink-3">
                {importState.phase === "failed"
                  ? "couldn't be imported"
                  : `${grouped(importState.rows ?? 0)} rows read`}
              </span>
              {importState.phase === "failed" ? (
                <button
                  type="button"
                  onClick={pick}
                  className={cn(
                    "ml-auto inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-[12px] text-ink-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <FileUp aria-hidden className="size-3.5" />
                  Choose another file
                </button>
              ) : (
                <span className="ml-auto font-mono text-[11px] text-ink-2 tabular-nums">
                  {Math.round(progress * 100)}%
                </span>
              )}
            </div>
            {importState.phase === "failed" ? (
              <p className="text-[12px] leading-relaxed text-ink-2">
                {importState.error ?? "The file couldn't be read."}
              </p>
            ) : (
              <div
                role="progressbar"
                aria-label={`Importing ${importState.file}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                aria-valuetext={`${Math.round(progress * 100)} percent, ${grouped(importState.rows ?? 0)} rows read`}
                className="h-1.5 overflow-hidden rounded-full bg-surface-2"
              >
                <motion.span
                  className="block h-full rounded-full bg-(--gr-accent)"
                  initial={false}
                  animate={{ width: `${Math.round(progress * 1000) / 10}%` }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                />
              </div>
            )}
          </div>
        ) : null}

        <div
          role="rowgroup"
          className="relative h-[calc(var(--gr-narrow)*2.25rem)] @min-[22rem]/table:h-[calc(var(--gr-rows)*2.25rem)]"
          style={{
            ["--gr-rows" as string]: bodyRows,
            ["--gr-narrow" as string]: narrowRows,
          }}
        >
          {Array.from({ length: bodyRows }, (_, i) => (
            <span
              key={`rule-${i}`}
              aria-hidden
              className={cn(
                "absolute inset-x-3 h-px bg-hairline",
                i >= narrowRows && "hidden @min-[22rem]/table:block",
              )}
              style={{ top: (i + 1) * ROW_H - 1 }}
            />
          ))}

          <AnimatePresence mode="popLayout" initial={false}>
            {rows.map((row, i) => {
              const key = `${shown?.id ?? "x"}-${i}`;
              const delay = Number((i * step).toFixed(3));
              const solid = !!chosen;
              return (
                <motion.div
                  key={key}
                  role={solid ? "row" : undefined}
                  aria-hidden={solid ? undefined : true}
                  aria-rowindex={solid ? i + 2 : undefined}
                  className={cn(
                    gridCols,
                    "relative h-9 items-center gap-3 px-3",
                    i >= narrowRows && "hidden @min-[22rem]/table:grid",
                  )}
                  style={trackStyle}
                  initial={{ opacity: 0, y: motionSafe ? -12 : 0 }}
                  animate={{ opacity: solid ? 1 : opacity, y: 0 }}
                  exit={{
                    opacity: 0,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                      delay: Number(((rows.length - 1 - i) * 0.02).toFixed(3)),
                    },
                  }}
                  transition={{
                    y: motionSafe
                      ? { ...springs.snap, delay }
                      : { duration: 0 },
                    opacity: {
                      duration: motionSafe ? durations.base : durations.fast,
                      delay,
                    },
                  }}
                >
                  {solid ? (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 -z-10 bg-(--gr-accent)"
                      initial={{ opacity: motionSafe ? 0.16 : 0 }}
                      animate={{ opacity: 0 }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.enter,
                        delay: delay + 0.05,
                      }}
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-px border-b border-dashed border-ink-3 transition-opacity"
                    style={{
                      opacity: solid ? 0 : 0.7,
                      transitionDelay: `${Math.round(delay * 1000)}ms`,
                    }}
                  />
                  {(shown?.columns ?? []).map((c, ci) => (
                    <span
                      key={c.key}
                      role={solid ? "cell" : undefined}
                      title={row[c.key]}
                      className={cn(
                        "truncate text-[12.5px] text-foreground",
                        c.mono && "font-mono text-[11.5px] tabular-nums",
                        c.align === "right" && "text-right",
                        !solid && ci === 0 && "italic",
                        colClass(ci),
                      )}
                    >
                      {row[c.key] ?? ""}
                    </span>
                  ))}
                </motion.div>
              );
            })}
          </AnimatePresence>

          <motion.div
            role="row"
            aria-hidden={!!shown}
            className="pointer-events-none absolute inset-0"
            initial={false}
            animate={{ opacity: shown ? 0 : 1 }}
            transition={{ duration: durations.fast }}
          >
            <div
              role="cell"
              className="flex size-full flex-col items-center justify-center px-4 text-center"
            >
              {/* The card colour behind the words masks the row rules, so
                  the message sits on the ruled table like a label. */}
              <span className="flex flex-col items-center gap-1 rounded-2 bg-card px-3 py-1.5">
                <Boxes
                  aria-hidden
                  className="hidden size-5 text-ink-3 @min-[22rem]/table:block"
                />
                <span className="text-[13px] font-medium text-foreground">
                  No items yet
                </span>
                <span className="text-[12px] text-ink-3 @min-[22rem]/table:hidden">
                  Pick a way in to start.
                </span>
                <span className="hidden max-w-72 text-[12px] text-ink-3 @min-[22rem]/table:block">
                  Import a file, connect a source, or point at a template to
                  preview it here.
                </span>
              </span>
            </div>
          </motion.div>
          {dropping ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[color-mix(in_oklab,var(--card)_80%,transparent)] text-[13px] font-medium text-(--gr-accent)">
              Drop to import
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--gr-accent" as string]: accent }}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
          <div className="min-w-0 flex-1">
            <p id={titleId} className="truncate text-sm font-semibold">
              {title}
            </p>
            <p className="truncate text-[11px] text-ink-3">
              {workspace} · new table
            </p>
          </div>
        </header>
        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          <div
            className={cn(
              "flex flex-col",
              layout === "split" &&
                "@min-[40rem]:grid @min-[40rem]:[grid-template-columns:minmax(0,1fr)_var(--gr-side)] @min-[40rem]:items-start",
            )}
            style={{
              ["--gr-side" as string]: chosen ? "0rem" : "17.5rem",
              transitionProperty: "grid-template-columns",
              transitionDuration: motionSafe ? "450ms" : "0ms",
              transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            <motion.div
              ref={panelRef}
              inert={!!chosen}
              initial={false}
              animate={{ height: chosen ? 0 : "auto", opacity: chosen ? 0 : 1 }}
              transition={{
                height: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
              className={cn(
                "min-w-0 overflow-hidden",
                layout === "split" &&
                  "@min-[40rem]:order-last @min-[40rem]:border-l @min-[40rem]:border-hairline",
                layout === "stack" || !chosen ? "border-b border-hairline" : "",
                layout === "split" && "@min-[40rem]:border-b-0",
              )}
            >
              {optionsPanel}
            </motion.div>
            {table}
          </div>
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
