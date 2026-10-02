"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Camera,
  ChartColumn,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  FolderKanban,
  LayoutGrid,
  Map as MapIcon,
  MapPin,
  NotebookPen,
  Settings,
  Sprout,
  TestTube,
  Users,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PaneStackNode = {
  /** Unique within the tree: the value that names this pane. */
  id: string;
  /** The pane's heading, its row's first line and its tab's label. */
  title: string;
  /** One quieter line under the title, on the pane and on its row. */
  description?: string;
  /** A short note at the end of its row: a count, a state. */
  meta?: string;
  /** 16px, drawn in currentColor: on its row, its header and its tab. */
  icon?: React.ReactNode;
  /** What the pane shows above its list of children. */
  content?: React.ReactNode;
  /** The panes one level deeper. */
  children?: PaneStackNode[];
};

export type PaneStackSize = "sm" | "md" | "lg";

export type PaneStackProps = {
  /** The tree to navigate. @default defaultPaneTree */
  root?: PaneStackNode;
  /** Controlled: the id of the open pane. */
  value?: string;
  /** The pane open at first when uncontrolled. @default the root's id */
  defaultValue?: string;
  /** Fires from the press, key or swipe that asked to open a pane, with its id and the path to it. */
  onValueChange?: (id: string, path: string[]) => void;
  /** A row with nothing inside it was chosen (pressed, Enter or Space). */
  onSelect?: (id: string) => void;
  /** The container's accessible name. @default "Navigation" */
  label?: string;
  /** How far the covered panes recede, 0 to 1: tabs step in, shade toward the page and take the open pane's shadow. 0 is flat. @default 0.5 */
  depth?: number;
  /** How wide a covered pane's tab is, in px (28 to 64). Wide tabs show the level's icon. @default 40 */
  compress?: number;
  /** Tempo of every slide, 0.5 to 1.5: the glide spring sped up or slowed down without changing its character. @default 1 */
  speed?: number;
  /** The narrowest the open pane gets, in px; past it the oldest tabs fold under the first, with a count. @default 200 */
  minPaneWidth?: number;
  /** Drag the open pane to the right to go back a level. @default true */
  swipeBack?: boolean;
  /** A tab's accessible name, from its pane's title. @default (title) => `Back to ${title}` */
  backLabel?: (title: string) => string;
  /** What a pane with no content and no children says. @default "Nothing in here yet" */
  emptyLabel?: string;
  /** The container's height: px or any CSS length. @default 440 */
  height?: number | string;
  /** Row height 36, 44 or 52 px. @default "md" */
  size?: PaneStackSize;
  /** The trail back (the row you came from), the chosen row and the fold badge; any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the slides and the presses. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------ the default tree ------------------------------ */

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3 text-[13px]">
      {rows.map(([term, detail]) => (
        <React.Fragment key={term}>
          <dt className="text-ink-3">{term}</dt>
          <dd className="truncate text-foreground tabular-nums">{detail}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

const ICON = "size-4";

function sample(
  id: string,
  layer: string,
  depthCm: string,
  ph: string,
  organic: string,
  moisture: string,
): PaneStackNode {
  return {
    id,
    title: id.toUpperCase(),
    description: `${layer} · ${depthCm}`,
    meta: `pH ${ph}`,
    icon: <TestTube className={ICON} />,
    content: (
      <Facts
        rows={[
          ["Depth", depthCm],
          ["pH", ph],
          ["Organic matter", organic],
          ["Moisture", moisture],
          ["Lab", "Coldbrook soils, batch 9"],
        ]}
      />
    ),
  };
}

/** A Fieldline workspace, seven levels deep at its deepest. */
export const defaultPaneTree: PaneStackNode = {
  id: "workspace",
  title: "Fieldline",
  description: "Workspace · Coldbrook field office",
  icon: <LayoutGrid className={ICON} />,
  children: [
    {
      id: "projects",
      title: "Projects",
      description: "Surveys and site work",
      meta: "3",
      icon: <FolderKanban className={ICON} />,
      children: [
        {
          id: "basin-road",
          title: "Basin Road survey",
          description: "Coldbrook district · 38 plots",
          meta: "Active",
          icon: <MapIcon className={ICON} />,
          children: [
            {
              id: "plots",
              title: "Plots",
              description: "Measured this season",
              meta: "38",
              icon: <LayoutGrid className={ICON} />,
              children: [
                {
                  id: "plot-14",
                  title: "Plot 14",
                  description: "0.42 ha · loam · north slope",
                  meta: "3 samples",
                  icon: <MapPin className={ICON} />,
                  content: (
                    <Facts
                      rows={[
                        ["Area", "0.42 ha"],
                        ["Soil", "Loam over clay"],
                        ["Slope", "4° north"],
                        ["Last visit", "12 Sep"],
                      ]}
                    />
                  ),
                  children: [
                    {
                      id: "plot-14-samples",
                      title: "Soil samples",
                      description: "Taken 12 Sep · crew B",
                      meta: "3",
                      icon: <FlaskConical className={ICON} />,
                      children: [
                        sample(
                          "s-14-01",
                          "Topsoil",
                          "0–15 cm",
                          "6.4",
                          "4.1%",
                          "22%",
                        ),
                        sample(
                          "s-14-02",
                          "Subsoil",
                          "15–40 cm",
                          "6.9",
                          "2.3%",
                          "26%",
                        ),
                        sample(
                          "s-14-03",
                          "Subsoil",
                          "40–60 cm",
                          "7.2",
                          "1.2%",
                          "29%",
                        ),
                      ],
                    },
                    {
                      id: "plot-14-photos",
                      title: "Photos",
                      description: "From the last visit",
                      meta: "24",
                      icon: <Camera className={ICON} />,
                    },
                    {
                      id: "plot-14-notes",
                      title: "Field notes",
                      description: "Drainage ditch silted at the east edge",
                      meta: "2",
                      icon: <NotebookPen className={ICON} />,
                    },
                  ],
                },
                {
                  id: "plot-15",
                  title: "Plot 15",
                  description: "0.38 ha · clay · flat",
                  meta: "2 samples",
                  icon: <MapPin className={ICON} />,
                  children: [
                    {
                      id: "plot-15-samples",
                      title: "Soil samples",
                      description: "Taken 13 Sep · crew B",
                      meta: "2",
                      icon: <FlaskConical className={ICON} />,
                      children: [
                        sample(
                          "s-15-01",
                          "Topsoil",
                          "0–15 cm",
                          "6.1",
                          "3.8%",
                          "31%",
                        ),
                        sample(
                          "s-15-02",
                          "Subsoil",
                          "15–40 cm",
                          "6.6",
                          "2.0%",
                          "34%",
                        ),
                      ],
                    },
                    {
                      id: "plot-15-photos",
                      title: "Photos",
                      description: "From the last visit",
                      meta: "11",
                      icon: <Camera className={ICON} />,
                    },
                  ],
                },
                {
                  id: "plot-16",
                  title: "Plot 16",
                  description: "0.51 ha · sandy loam",
                  meta: "Not visited",
                  icon: <MapPin className={ICON} />,
                  content: (
                    <Facts
                      rows={[
                        ["Area", "0.51 ha"],
                        ["Soil", "Sandy loam"],
                        ["Visit", "Booked for 3 Oct"],
                      ]}
                    />
                  ),
                },
              ],
            },
            {
              id: "basin-notes",
              title: "Field notes",
              description: "Shared with the crew",
              meta: "12",
              icon: <NotebookPen className={ICON} />,
            },
            {
              id: "basin-crew",
              title: "Crew",
              description: "Five surveyors, two vans",
              meta: "5",
              icon: <Users className={ICON} />,
            },
          ],
        },
        {
          id: "weir-lane",
          title: "Weir Lane drainage",
          description: "Basinworks · design review",
          meta: "Review",
          icon: <MapIcon className={ICON} />,
          children: [
            {
              id: "weir-drawings",
              title: "Drawings",
              description: "Culvert sections, rev C",
              meta: "6",
              icon: <FileText className={ICON} />,
            },
            {
              id: "weir-review",
              title: "Review",
              description: "Open questions from Basinworks",
              meta: "14",
              icon: <ClipboardList className={ICON} />,
              content: (
                <Facts
                  rows={[
                    ["Open", "9"],
                    ["Answered", "5"],
                    ["Due", "18 Oct"],
                  ]}
                />
              ),
            },
          ],
        },
        {
          id: "north-orchard",
          title: "North orchard",
          description: "Planting plan",
          meta: "Draft",
          icon: <Sprout className={ICON} />,
          content: (
            <Facts
              rows={[
                ["Rows", "14"],
                ["Trees", "336"],
                ["Planting", "November"],
              ]}
            />
          ),
        },
      ],
    },
    {
      id: "reports",
      title: "Reports",
      description: "Exports and summaries",
      meta: "3",
      icon: <ChartColumn className={ICON} />,
      children: [
        {
          id: "report-season",
          title: "Season summary",
          description: "All projects, to date",
          meta: "PDF",
          icon: <FileText className={ICON} />,
        },
        {
          id: "report-soil",
          title: "Soil by plot",
          description: "pH, organic matter, moisture",
          meta: "CSV",
          icon: <FileSpreadsheet className={ICON} />,
        },
        {
          id: "report-hours",
          title: "Crew hours",
          description: "By week and project",
          meta: "CSV",
          icon: <FileSpreadsheet className={ICON} />,
        },
      ],
    },
    {
      id: "settings",
      title: "Settings",
      description: "Workspace and members",
      icon: <Settings className={ICON} />,
      children: [
        {
          id: "settings-general",
          title: "General",
          description: "Name, region and units",
          icon: <Settings className={ICON} />,
          content: (
            <Facts
              rows={[
                ["Name", "Fieldline"],
                ["Region", "Coldbrook"],
                ["Units", "Metric"],
              ]}
            />
          ),
        },
        {
          id: "settings-members",
          title: "Members",
          description: "Five people, two admins",
          meta: "5",
          icon: <Users className={ICON} />,
        },
      ],
    },
  ],
};

/* --------------------------------- geometry --------------------------------- */

type Geo = {
  /** Tab width, px. */
  T: number;
  /** How many tabs fit beside a pane of the minimum width. */
  cap: number;
  /** The deepest level rendered. */
  last: number;
  depth: number;
};

type Frame = {
  left: string;
  width: string;
  tabWidth: string;
  /** Top and bottom inset, px: the staircase. */
  inset: number;
  /** 0 an open pane, 1 a tab. */
  comp: number;
  shade: number;
  shown: boolean;
  /** The fold badge's presence, 0 to 1. */
  badge: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

const restLeft = (i: number, g: Geo) => Math.min(i, g.cap) * g.T;

/**
 * A level's left edge at stack position `p`, as px plus a share of the
 * container's width. A level at or above `p` sits on its tab slot (the
 * oldest fold under the first slot once there is no room); the level
 * arriving sits at its resting left, shifted right by the part of the move
 * still to come — so it enters from the container's right edge.
 */
function edgeOf(i: number, p: number, g: Geo) {
  if (i <= p) {
    const fold = Math.max(0, p - g.cap);
    return { px: Math.max(0, i - fold) * g.T, pct: 0 };
  }
  const f = Math.min(1, i - p);
  return { px: restLeft(i, g) * (1 - f), pct: f * 100 };
}

const css = (px: number, pct: number) =>
  pct === 0 ? `${r2(px)}px` : `calc(${r2(px)}px + ${r3(pct)}%)`;

/**
 * Everything about one level at one moment, from `p` alone. Each level's
 * right edge is the next one's left, so an arriving pane pushes the open one
 * and it compresses into its tab: the two can never overlap or part.
 */
function frameOf(i: number, p: number, g: Geo): Frame {
  const left = edgeOf(i, p, g);
  let px: number;
  let pct: number;
  if (i > p) {
    // Arriving or leaving: full width, sliding.
    px = -restLeft(i, g);
    pct = 100;
  } else {
    const right = i < g.last ? edgeOf(i + 1, p, g) : { px: 0, pct: 100 };
    px = right.px - left.px;
    pct = right.pct - left.pct;
  }
  const dist = Math.max(0, p - i);
  const fold = Math.max(0, p - g.cap);
  const width = css(px, pct);
  return {
    left: css(left.px, left.pct),
    width,
    tabWidth:
      pct === 0 ? `${r2(Math.min(g.T, px))}px` : `min(${g.T}px, ${width})`,
    inset: r2(g.depth * 6 * Math.min(dist, 5)),
    comp: r3(clamp01(dist)),
    shade: r3(Math.min(0.6, g.depth * 0.14 * dist)),
    // Off to the right is already clipped and inert; hiding it would also
    // refuse the focus that moves into a pane as it arrives.
    shown: !(pct === 0 && px < 0.5),
    badge: i > 0 && fold > 0 ? r3(clamp01(1 - (i - fold))) : 0,
  };
}

/** The glide spring at another tempo: stiffness by speed², damping by speed, so ζ stays 0.98. */
const tempo = (speed: number) => {
  const s = Math.min(1.5, Math.max(0.5, speed));
  return {
    type: "spring" as const,
    stiffness: r2(springs.glide.stiffness * s * s),
    damping: r2(springs.glide.damping * s),
    mass: springs.glide.mass,
  };
};

/* ---------------------------------- the tree ---------------------------------- */

type Entry = { node: PaneStackNode; parent: string | null };

function indexTree(root: PaneStackNode) {
  const map = new Map<string, Entry>();
  const walk = (node: PaneStackNode, parent: string | null) => {
    if (map.has(node.id)) return;
    map.set(node.id, { node, parent });
    for (const child of node.children ?? []) walk(child, node.id);
  };
  walk(root, null);
  return map;
}

function pathOf(
  index: Map<string, Entry>,
  id: string,
  root: PaneStackNode,
): PaneStackNode[] {
  const out: PaneStackNode[] = [];
  let at = index.get(id);
  while (at) {
    out.unshift(at.node);
    at = at.parent === null ? undefined : index.get(at.parent);
  }
  return out.length > 0 && out[0]?.id === root.id ? out : [root];
}

const opens = (node: PaneStackNode) =>
  (node.children?.length ?? 0) > 0 || node.content !== undefined;

const SEP = "\u0000";
const startsWith = (list: string[], prefix: string[]) =>
  prefix.length <= list.length && prefix.every((id, i) => list[i] === id);
const shared = (a: string[], b: string[]) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
};
const trailOf = (ids: string[]) => {
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < ids.length; i += 1) {
    const from = ids[i];
    const to = ids[i + 1];
    if (from !== undefined && to !== undefined) out[from] = to;
  }
  return out;
};
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const ROW: Record<PaneStackSize, string> = {
  sm: "h-9",
  md: "h-11",
  lg: "h-13",
};

/* ---------------------------------- the tab ---------------------------------- */

type TabProps = {
  node: PaneStackNode;
  i: number;
  geo: Geo;
  pos: MotionValue<number>;
  name: string;
  stop: boolean;
  ancestor: boolean;
  radius: number;
  bind: (node: HTMLButtonElement | null) => void;
  onPress: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
};

function StackTab({
  node,
  i,
  geo,
  pos,
  name,
  stop,
  ancestor,
  radius,
  bind,
  onPress,
  onKeyDown,
  onFocus,
}: TabProps) {
  const frame = useTransform(pos, (p) => frameOf(i, p, geo));
  const left = useTransform(frame, (f) => f.left);
  const width = useTransform(frame, (f) => f.tabWidth);
  const inset = useTransform(frame, (f) => f.inset);
  const opacity = useTransform(frame, (f) => r3(smooth((f.comp - 0.6) / 0.4)));
  const visibility = useTransform(frame, (f) =>
    f.shown && f.comp > 0.02 ? "visible" : "hidden",
  );
  const pointerEvents = useTransform(frame, (f) =>
    f.comp > 0.5 ? "auto" : "none",
  );
  const shade = useTransform(frame, (f) => f.shade);
  const badge = useTransform(frame, (f) => f.badge);
  const badgeScale = useTransform(badge, (b) => r3(0.6 + 0.4 * b));

  return (
    <motion.li
      className="absolute"
      style={{
        left,
        width,
        top: inset,
        bottom: inset,
        opacity,
        visibility,
        pointerEvents,
        zIndex: 2 * i + 2,
      }}
    >
      <button
        ref={bind}
        type="button"
        tabIndex={ancestor && stop ? 0 : -1}
        aria-label={name}
        onClick={onPress}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className={cn(
          "relative flex h-full w-full cursor-pointer flex-col items-center gap-2 overflow-clip border-r border-hairline bg-surface-2 py-3 text-ink-2 transition-colors select-none hover:bg-surface-1 hover:text-foreground",
          RING,
        )}
        style={{ borderRadius: `0 ${radius}px ${radius}px 0` }}
      >
        {geo.T >= 36 && node.icon !== undefined ? (
          <span
            aria-hidden
            className="flex size-4 shrink-0 items-center justify-center"
          >
            {node.icon}
          </span>
        ) : null}
        <span
          aria-hidden
          className="[min-height:0] flex-1 truncate text-[11px] leading-none font-medium [writing-mode:vertical-rl]"
        >
          {node.title}
        </span>
        {i > 0 ? (
          <motion.span
            aria-hidden
            className="shrink-0 rounded-full px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums"
            style={{
              opacity: badge,
              scale: badgeScale,
              color: "var(--pane-stack-accent)",
              backgroundColor:
                "color-mix(in oklab, var(--pane-stack-accent) 14%, transparent)",
            }}
          >
            +{i}
          </motion.span>
        ) : null}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-background"
          style={{ opacity: shade }}
        />
      </button>
    </motion.li>
  );
}

/* ---------------------------------- a level ---------------------------------- */

type LevelProps = {
  node: PaneStackNode;
  i: number;
  geo: Geo;
  pos: MotionValue<number>;
  reveal: MotionValue<number>;
  nudge: MotionValue<number>;
  current: boolean;
  /** The child of this level on the open path: the trail back. */
  trail: string | undefined;
  chosen: string | null;
  cursor: string | undefined;
  size: PaneStackSize;
  radius: number;
  shadow: string;
  emptyLabel: string;
  headingId: string;
  hintId: string;
  motionSafe: boolean;
  swipeable: boolean;
  drag: ReturnType<typeof useDrag>;
  bindHeading: (node: HTMLHeadingElement | null) => void;
  bindRow: (rowId: string) => (node: HTMLButtonElement | null) => void;
  onRow: (row: PaneStackNode, event: React.MouseEvent) => void;
  onRowKey: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    row: PaneStackNode,
    index: number,
  ) => void;
  onRowFocus: (rowId: string) => void;
};

function Level({
  node,
  i,
  geo,
  pos,
  reveal,
  nudge,
  current,
  trail,
  chosen,
  cursor,
  size,
  radius,
  shadow,
  emptyLabel,
  headingId,
  hintId,
  motionSafe,
  swipeable,
  drag,
  bindHeading,
  bindRow,
  onRow,
  onRowKey,
  onRowFocus,
}: LevelProps) {
  const frame = useTransform(pos, (p) => frameOf(i, p, geo));
  const left = useTransform(frame, (f) => f.left);
  const width = useTransform(frame, (f) => f.width);
  const inset = useTransform(frame, (f) => f.inset);
  const visibility = useTransform(frame, (f) =>
    f.shown ? "visible" : "hidden",
  );
  const shade = useTransform(frame, (f) => f.shade);
  // The content stays while the pane is at least half open (it is clipped,
  // never squashed, so it reads as a card sliding over another), then hands
  // over to the tab face.
  const fade = useTransform(() =>
    r3(
      (1 - smooth((frame.get().comp - 0.5) / 0.5)) *
        (current ? reveal.get() : 1),
    ),
  );
  const rows = node.children ?? [];
  const stop = cursor ?? trail ?? rows[0]?.id;
  const rest = restLeft(i, geo);

  return (
    <motion.div
      role="region"
      aria-labelledby={headingId}
      aria-hidden={!current || undefined}
      inert={!current}
      {...(current && swipeable ? drag : {})}
      className={cn(
        "absolute overflow-clip bg-card select-none",
        current && swipeable && "touch-pan-y",
      )}
      style={{
        left,
        width,
        top: inset,
        bottom: inset,
        visibility,
        zIndex: 2 * i + 1,
        x: current ? nudge : 0,
        borderRadius: i > 0 ? `${radius}px 0 0 ${radius}px` : undefined,
        boxShadow: i > 0 ? shadow : undefined,
      }}
    >
      <motion.div
        className="@container flex h-full flex-col"
        style={{ width: `calc(100cqw - ${rest}px)`, opacity: fade }}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-3 border-b border-hairline",
            size === "sm" ? "px-3 py-2.5" : "px-4 py-3",
          )}
        >
          {node.icon !== undefined ? (
            <span
              aria-hidden
              className="flex size-4 shrink-0 items-center justify-center text-ink-3"
            >
              {node.icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3
              ref={bindHeading}
              id={headingId}
              tabIndex={-1}
              className={cn(
                "truncate rounded-1 text-sm font-semibold text-foreground",
                RING,
              )}
            >
              {node.title}
            </h3>
            {node.description ? (
              <p className="truncate text-xs text-ink-3">{node.description}</p>
            ) : null}
          </div>
          {node.meta ? (
            <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
              {node.meta}
            </span>
          ) : null}
        </div>
        <div className="[min-height:0] flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          {node.content}
          {rows.length > 0 ? (
            <ul
              role="list"
              aria-label={`In ${node.title}`}
              className={cn(
                "flex flex-col gap-0.5 p-1.5",
                node.content !== undefined && "border-t border-hairline",
              )}
            >
              {rows.map((row, index) => {
                const deeper = opens(row);
                const onTrail = row.id === trail;
                const picked = row.id === chosen;
                return (
                  <li key={row.id}>
                    <motion.button
                      ref={bindRow(row.id)}
                      type="button"
                      tabIndex={row.id === stop ? 0 : -1}
                      aria-describedby={deeper ? hintId : undefined}
                      aria-current={picked || undefined}
                      onClick={(event) => onRow(row, event)}
                      onKeyDown={(event) => onRowKey(event, row, index)}
                      onFocus={() => onRowFocus(row.id)}
                      whileHover="hover"
                      whileTap={motionSafe ? { scale: 0.985 } : undefined}
                      transition={springs.flick}
                      className={cn(
                        "group/pane-stack-row relative flex w-full cursor-pointer items-center gap-3 rounded-2 px-3 text-left transition-colors hover:bg-surface-2",
                        ROW[size],
                        RING,
                      )}
                      style={
                        onTrail || picked
                          ? {
                              backgroundColor:
                                "color-mix(in oklab, var(--pane-stack-accent) 9%, transparent)",
                            }
                          : undefined
                      }
                    >
                      {onTrail || picked ? (
                        <span
                          aria-hidden
                          className="absolute inset-y-2 left-0 w-0.5 rounded-full"
                          style={{
                            backgroundColor: "var(--pane-stack-accent)",
                          }}
                        />
                      ) : null}
                      {row.icon !== undefined ? (
                        <span
                          aria-hidden
                          className="flex size-4 shrink-0 items-center justify-center text-ink-3 transition-colors group-hover/pane-stack-row:text-ink-2"
                        >
                          {row.icon}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] leading-[18px] font-medium text-foreground">
                          {row.title}
                        </span>
                        {row.description && size !== "sm" ? (
                          <span className="hidden truncate text-xs leading-4 text-ink-3 @min-[280px]:block">
                            {row.description}
                          </span>
                        ) : null}
                      </span>
                      {row.meta ? (
                        <span className="hidden shrink-0 font-mono text-[11px] text-ink-3 tabular-nums @min-[220px]:inline">
                          {row.meta}
                        </span>
                      ) : null}
                      {deeper ? (
                        <motion.span
                          aria-hidden
                          className="flex size-4 shrink-0 items-center justify-center text-ink-3"
                          variants={{ hover: { x: motionSafe ? 2 : 0 } }}
                          transition={springs.flick}
                        >
                          <ChevronRight className="size-4" />
                        </motion.span>
                      ) : null}
                    </motion.button>
                  </li>
                );
              })}
            </ul>
          ) : node.content === undefined ? (
            <p className="px-4 py-6 text-xs text-ink-3">{emptyLabel}</p>
          ) : null}
        </div>
      </motion.div>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-background"
        style={{ opacity: shade }}
      />
    </motion.div>
  );
}

/* -------------------------------- the component -------------------------------- */

type Api = {
  travel: (target: number, velocity: number) => void;
  settle: () => void;
  resume: () => void;
};

/**
 * Nested navigation that keeps the way back in view. Opening a row slides
 * its pane in from the right; the pane it covers is pushed and compresses
 * into a narrow labelled tab along the left edge, and so on down the tree.
 * A tab, Escape, ArrowLeft or a swipe of the open pane to the right goes back:
 * the panes slide off and the tab re-expands into its pane.
 *
 * One motion value is the stack's position, on the glide spring (its tempo
 * set by `speed`); every pane's edges, every tab's face, the staircase of
 * `depth` and the fold of tabs that no longer fit are pure functions of it,
 * so a push, a pop, a jump of several levels and a half-made swipe are the
 * same geometry. Widths are CSS on the container's own width, so the server
 * render is already exact.
 *
 * Rows are a list with one tab stop (arrows move, Enter, Space or ArrowRight
 * open); the tabs are a `nav` with one tab stop; focus moves into each new
 * pane and back onto the row you came from. Under reduced motion the stack
 * jumps and the arriving pane fades in.
 */
export function PaneStack({
  root = defaultPaneTree,
  value,
  defaultValue,
  onValueChange,
  onSelect,
  label = "Navigation",
  depth = 0.5,
  compress = 40,
  speed = 1,
  minPaneWidth = 200,
  swipeBack = true,
  backLabel = (title) => `Back to ${title}`,
  emptyLabel = "Nothing in here yet",
  height = 440,
  size = "md",
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: PaneStackProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const domId = (id: string) => `${uid}-${id}`;

  const index = React.useMemo(() => indexTree(root), [root]);
  const [own, setOwn] = React.useState(defaultValue ?? root.id);
  const controlled = value !== undefined;
  const currentId = controlled ? value : own;
  const path = React.useMemo(
    () => pathOf(index, currentId, root),
    [index, currentId, root],
  );
  const pathIds = React.useMemo(() => path.map((n) => n.id), [path]);
  const pathKey = pathIds.join(SEP);
  const level = pathIds.length - 1;

  // The levels on screen: the open path, plus any deeper ones still sliding
  // off after a step back.
  const [stack, setStack] = React.useState<string[]>(pathIds);
  const [seen, setSeen] = React.useState<string[]>(pathIds);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [tabCursor, setTabCursor] = React.useState<number | null>(null);
  // The child last opened from each level: the trail you see when you come
  // back, and where focus lands.
  const [visited, setVisited] = React.useState(() => trailOf(pathIds));
  const [focusTo, setFocusTo] = React.useState<{
    n: number;
    level: string;
    row: string | null;
  } | null>(null);
  if (seen.join(SEP) !== pathKey) {
    const before = seen;
    setSeen(pathIds);
    setStack((s) => (startsWith(s, pathIds) ? s : pathIds));
    setVisited((v) => ({ ...v, ...trailOf(pathIds) }));
    // The path's tab stop goes back to the nearest level up.
    setTabCursor(null);
    const node = path[level];
    const title = node?.title ?? "";
    const back = startsWith(before, pathIds);
    setSaid((s) => ({
      n: s.n + 1,
      text: back ? `Back to ${title}.` : `Opened ${title}, level ${level + 1}.`,
    }));
    // Going back lands on the row that led down; going in, on the first row.
    setFocusTo((f) => ({
      n: (f?.n ?? 0) + 1,
      level: node?.id ?? root.id,
      row: back ? (before[level + 1] ?? null) : null,
    }));
  }

  const [cursor, setCursor] = React.useState<Record<string, string>>({});
  const [chosen, setChosen] = React.useState<string | null>(null);
  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);

  const pos = useMotionValue(level);
  const reveal = useMotionValue(1);
  const nudge = useMotionValue(0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const api = React.useRef<Api | null>(null);
  const shownPath = React.useRef(pathIds);
  const velocity = React.useRef(0);
  const swipe = React.useRef<{
    span: number;
    base: number;
    level: number;
    past: boolean;
  } | null>(null);
  const suppress = React.useRef(false);
  const rows = React.useRef(new Map<string, HTMLButtonElement>());
  const headings = React.useRef(new Map<string, HTMLHeadingElement>());
  const tabs = React.useRef(new Map<string, HTMLButtonElement>());

  const T = Math.round(Math.min(96, Math.max(24, compress)));
  const d = clamp01(depth);
  const cap =
    width === null
      ? Infinity
      : Math.max(1, Math.floor((width - Math.max(0, minPaneWidth)) / T));
  const geo: Geo = { T, cap, last: stack.length - 1, depth: d };
  const fold = Number.isFinite(cap) ? Math.max(0, level - cap) : 0;
  const radius = d > 0 ? 8 : 0;
  const shadow =
    d > 0
      ? `-${r2(8 * d)}px 0 ${r2(22 * d)}px -${r2(4 * d)}px color-mix(in oklab, black ${Math.round(12 + 22 * d)}%, transparent)`
      : "none";

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const settleNudge = (v: number) => {
    if (Math.abs(nudge.get()) < 0.01) return;
    run(
      "nudge",
      motionSafe
        ? animate(nudge, 0, { ...springs.glide, velocity: v })
        : animate(nudge, 0, { duration: durations.fast, ease: easings.enter }),
    );
  };

  const travel = (target: number, v: number) => {
    if (!motionSafe) {
      anims.current.get("pos")?.stop();
      pos.jump(target);
      reveal.jump(0);
      run(
        "pos",
        animate(reveal, 1, {
          duration: durations.base,
          ease: easings.enter,
          onComplete: () => api.current?.settle(),
        }),
      );
      return;
    }
    reveal.jump(1);
    run(
      "pos",
      animate(pos, target, {
        ...tempo(speed),
        velocity: v,
        onComplete: () => api.current?.settle(),
      }),
    );
  };

  /** Once the stack has come to rest, the panes that slid off leave. */
  const settle = () => {
    if (Math.abs(pos.get() - level) > 0.001) return;
    setStack((s) => (s.length === pathIds.length ? s : pathIds));
  };

  const resume = () => {
    if (Math.abs(pos.get() - level) > 0.001 || stack.length !== pathIds.length)
      travel(level, 0);
  };

  React.useLayoutEffect(() => {
    api.current = { travel, settle, resume };
  });

  // The host's value (or our own) moved: the stack travels there. Run before
  // paint, so a pane mounted for a push never shows a frame in place.
  React.useLayoutEffect(() => {
    const before = shownPath.current;
    if (before.join(SEP) === pathKey) return;
    shownPath.current = pathIds;
    const common = shared(before, pathIds);
    // A different branch: the old deeper panes are gone, so the new ones
    // slide in from the shared ancestor.
    if (common < before.length && common < pathIds.length) {
      pos.jump(Math.min(pos.get(), common - 1));
    }
    const v = velocity.current;
    velocity.current = 0;
    api.current?.travel(pathIds.length - 1, v);
  }, [pathKey, pathIds, pos]);

  // StrictMode stops whatever is running on its remount: carry it to rest
  // rather than leave the stack frozen part-way.
  React.useEffect(() => {
    const running = anims.current;
    api.current?.resume();
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  React.useEffect(() => {
    if (!rootNode) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(Math.round(w));
    });
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);

  // Focus follows the stack, but only when it was already in it (or was
  // dropped on the page by a pane going inert).
  React.useEffect(() => {
    if (!focusTo || !rootNode) return;
    const at = document.activeElement;
    if (at && at !== document.body && !rootNode.contains(at)) return;
    const pane = index.get(focusTo.level)?.node;
    const first = pane?.children?.[0]?.id;
    const target =
      (focusTo.row
        ? rows.current.get(`${focusTo.level}${SEP}${focusTo.row}`)
        : undefined) ??
      (first
        ? rows.current.get(`${focusTo.level}${SEP}${first}`)
        : undefined) ??
      headings.current.get(focusTo.level);
    target?.focus({ preventScroll: true });
  }, [focusTo, rootNode, index]);

  const panOf = (el: Element | null | undefined, fallback = 0) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : fallback;
  };

  /** Every way of moving through the tree comes through here. */
  const navigate = (id: string, v = 0) => {
    if (disabled) return;
    if (id === currentId) {
      settleNudge(0);
      travel(level, v);
      return;
    }
    const next = pathOf(index, id, root).map((n) => n.id);
    const deeper = next.length > pathIds.length;
    const steps = Math.abs(next.length - pathIds.length);
    audio.play("swish", {
      pitch: deeper ? 1.08 : r2(Math.max(0.7, 0.9 - 0.04 * steps)),
      gain: r2(Math.min(0.6, 0.4 + 0.05 * steps)),
      pan: deeper ? 0.35 : -0.3,
    });
    // The release velocity is handed to the travel the new value starts, if
    // it starts now; a host that answers later starts from rest.
    velocity.current = v;
    queueMicrotask(() => {
      velocity.current = 0;
    });
    if (!controlled) setOwn(id);
    onValueChange?.(id, next);
    // A controlled host answers in its own time; until it does the stack goes
    // back to where the host says it is, so a refusal never shows.
    if (controlled) travel(level, v);
  };

  const back = () => {
    const parent = pathIds[level - 1];
    if (parent) navigate(parent);
  };

  const onRow = (row: PaneStackNode, event: React.MouseEvent) => {
    if (disabled) return;
    if (suppress.current && event.detail > 0) {
      suppress.current = false;
      return;
    }
    const node = path[level];
    if (node) setCursor((c) => ({ ...c, [node.id]: row.id }));
    if (opens(row)) {
      navigate(row.id);
      return;
    }
    audio.play("click", {
      pitch: 1.1,
      gain: 0.45,
      pan: panOf(event.currentTarget),
    });
    setChosen(row.id);
    onSelect?.(row.id);
  };

  const onRowKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    row: PaneStackNode,
    i: number,
  ) => {
    const node = path[level];
    const list = node?.children ?? [];
    const focusAt = (j: number) => {
      const target = list[Math.min(list.length - 1, Math.max(0, j))];
      if (node && target) {
        rows.current.get(`${node.id}${SEP}${target.id}`)?.focus();
      }
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(i + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusAt(i - 1);
        return;
      case "Home":
        event.preventDefault();
        focusAt(0);
        return;
      case "End":
        event.preventDefault();
        focusAt(list.length - 1);
        return;
      case "ArrowRight":
        if (!opens(row)) return;
        event.preventDefault();
        if (node) setCursor((c) => ({ ...c, [node.id]: row.id }));
        navigate(row.id);
        return;
      case "ArrowLeft":
      case "Backspace":
        if (level === 0) return;
        event.preventDefault();
        back();
        return;
    }
  };

  const firstTab = fold;
  const stopTab =
    tabCursor !== null && tabCursor >= firstTab && tabCursor < level
      ? tabCursor
      : level - 1;

  const onTabKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const focusTab = (j: number) => {
      const id = stack[j];
      if (id) tabs.current.get(id)?.focus();
    };
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTab(Math.max(firstTab, i - 1));
        return;
      case "ArrowDown":
        event.preventDefault();
        focusTab(Math.min(level - 1, i + 1));
        return;
      case "ArrowRight": {
        event.preventDefault();
        if (i < level - 1) {
          focusTab(i + 1);
          return;
        }
        // Past the last tab: into the open pane, where its tab stop is.
        const node = path[level];
        const stop =
          node &&
          (cursor[node.id] ?? visited[node.id] ?? node.children?.[0]?.id);
        const target =
          (node && stop
            ? rows.current.get(`${node.id}${SEP}${stop}`)
            : undefined) ?? (node ? headings.current.get(node.id) : undefined);
        target?.focus();
        return;
      }
      case "Home":
        event.preventDefault();
        focusTab(firstTab);
        return;
      case "End":
        event.preventDefault();
        focusTab(level - 1);
        return;
    }
  };

  const drag = useDrag({
    axis: "x",
    threshold: 8,
    disabled: disabled || !swipeBack,
    onStart: () => {
      const w = rootNode?.getBoundingClientRect().width ?? 320;
      anims.current.get("pos")?.stop();
      anims.current.get("nudge")?.stop();
      swipe.current = {
        span: Math.max(80, w - Math.min(level, cap) * T),
        base: pos.get(),
        level,
        past: false,
      };
      suppress.current = true;
    },
    onMove: ({ offset }) => {
      const s = swipe.current;
      if (!s) return;
      if (s.level === 0) {
        // Nothing behind the root: it gives, and comes back.
        nudge.set(r2(rubberband(offset.x, s.span)));
        return;
      }
      const raw = s.base - offset.x / s.span;
      if (raw > s.level) {
        pos.set(s.level);
        nudge.set(r2(rubberband(-(raw - s.level) * s.span, s.span)));
      } else {
        nudge.set(0);
        pos.set(r3(Math.max(s.level - 1, raw)));
      }
      const past = pos.get() < s.level - 0.5;
      if (past !== s.past) {
        s.past = past;
        audio.play("click", {
          pitch: past ? 0.9 : 1.12,
          gain: 0.32,
          pan: past ? 0.2 : -0.1,
        });
      }
    },
    onEnd: ({ velocity: release }) => {
      const s = swipe.current;
      swipe.current = null;
      if (!s) return;
      settleNudge(release.x);
      if (s.level === 0) return;
      const v = -release.x / s.span;
      const landing = project(pos.get(), v, 0.99);
      const parent = pathIds[s.level - 1];
      if (landing < s.level - 0.5 && parent) navigate(parent, v);
      else travel(s.level, v);
    },
    onCancel: () => {
      const s = swipe.current;
      swipe.current = null;
      settleNudge(0);
      if (s) travel(s.level, 0);
    },
  });

  const styleVars = {
    height,
    "--pane-stack-accent": accent,
  } as React.CSSProperties;

  return (
    <div
      ref={setRootNode}
      role="group"
      aria-label={label}
      aria-disabled={disabled || undefined}
      inert={disabled}
      onPointerDownCapture={() => {
        suppress.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || level === 0)
          return;
        // Handled here, where focus is; the page must not also close on it.
        event.preventDefault();
        back();
      }}
      className={cn(
        "@container relative isolate w-full overflow-clip rounded-3 border border-hairline bg-surface-1 text-foreground",
        disabled && "opacity-60",
        className,
      )}
      style={styleVars}
    >
      <span id={hintId} className="sr-only">
        Opens a pane. Left arrow or Escape goes back.
      </span>

      {/* At the root there is nothing to go back to, and no landmark. */}
      <nav
        aria-label="Path"
        aria-hidden={level === 0 || undefined}
        className="pointer-events-none absolute inset-0"
      >
        <ol role="list" className="absolute inset-0">
          {stack.map((id, i) => {
            const node = index.get(id)?.node;
            if (!node) return null;
            const folded = i === fold && fold > 0;
            const name = folded
              ? `${backLabel(node.title)}, ${plural(fold, "level", "levels")} folded`
              : backLabel(node.title);
            return (
              <StackTab
                key={id}
                node={node}
                i={i}
                geo={geo}
                pos={pos}
                name={name}
                stop={i === stopTab}
                ancestor={i < level && i >= fold}
                radius={radius}
                bind={(el) => {
                  if (el) tabs.current.set(id, el);
                  else tabs.current.delete(id);
                }}
                onPress={() => {
                  if (i >= level) return;
                  audio.play("click", {
                    pitch: 1,
                    gain: 0.45,
                    pan: panOf(tabs.current.get(id), -0.4),
                  });
                  setTabCursor(null);
                  navigate(id);
                }}
                onKeyDown={(event) => onTabKey(event, i)}
                onFocus={() => setTabCursor(i)}
              />
            );
          })}
        </ol>
      </nav>

      {stack.map((id, i) => {
        const node = index.get(id)?.node;
        if (!node) return null;
        return (
          <Level
            key={id}
            node={node}
            i={i}
            geo={geo}
            pos={pos}
            reveal={reveal}
            nudge={nudge}
            current={i === level}
            trail={pathIds[i + 1] ?? visited[id]}
            chosen={chosen}
            cursor={cursor[id]}
            size={size}
            radius={radius}
            shadow={shadow}
            emptyLabel={emptyLabel}
            headingId={domId(`h-${i}`)}
            hintId={hintId}
            motionSafe={motionSafe}
            swipeable={swipeBack && !disabled}
            drag={drag}
            bindHeading={(el) => {
              if (el) headings.current.set(id, el);
              else headings.current.delete(id);
            }}
            bindRow={(rowId) => (el) => {
              const key = `${id}${SEP}${rowId}`;
              if (el) rows.current.set(key, el);
              else rows.current.delete(key);
            }}
            onRow={onRow}
            onRowKey={onRowKey}
            onRowFocus={(rowId) =>
              setCursor((c) => (c[id] === rowId ? c : { ...c, [id]: rowId }))
            }
          />
        );
      })}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
