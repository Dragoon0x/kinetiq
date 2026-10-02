"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type Transition,
} from "motion/react";
import {
  ChartColumn,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  Plus,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TabStripTab = {
  /** Unique and stable: the value that names this tab. */
  id: string;
  /** The tab's label, and the panel's name. */
  title: string;
  /** 14px, drawn in currentColor. Defaults to a document icon. */
  icon?: React.ReactNode;
  /** The panel shown while the tab is active. */
  content?: React.ReactNode;
  /** Unsaved changes: a dot on the tab that turns into the close button on hover. */
  dirty?: boolean;
  /** Kept open: no close button, and Delete leaves it alone. */
  pinned?: boolean;
};

export type TabStripReorder = "glide" | "snap" | "off";
export type TabStripSize = "sm" | "md" | "lg";

export type TabStripProps = {
  /** Controlled list of open tabs, in order. */
  tabs?: TabStripTab[];
  /** The tabs open at first when uncontrolled. @default defaultStripTabs */
  defaultTabs?: TabStripTab[];
  /** Fires with the whole list after a close, a new tab or a reorder. */
  onTabsChange?: (tabs: TabStripTab[]) => void;
  /** Controlled: the active tab's id. */
  value?: string;
  /** The tab active at first when uncontrolled. @default the first tab */
  defaultValue?: string;
  /** Fires from the press, key or menu choice that made a tab active. */
  onValueChange?: (id: string) => void;
  /** Makes the tab the plus opens. Return nothing to open none. @default an empty "Untitled n" */
  onCreate?: () => TabStripTab | void;
  /** A tab was closed, by its button, Delete or the shortcut. */
  onClose?: (id: string) => void;
  /** The tablist's accessible name. @default "Documents" */
  label?: string;
  /** How wide a tab is while there is room, in px; past that they all narrow together. @default 168 */
  width?: number;
  /** Narrowest a tab gets before the ones that no longer fit go into the overflow menu, in px. @default 96 */
  minWidth?: number;
  /** How the other tabs make room for a dragged one: smoothly, with one crisp overshoot, or not at all (dragging off). @default "glide" */
  reorder?: TabStripReorder;
  /** How far the panel slides as it changes, in px, toward the side of the tab you moved to. 0 cross-fades in place. @default 12 */
  slide?: number;
  /** The plus is disabled at this many open tabs. @default 12 */
  maxTabs?: number;
  /** Close buttons on tabs and Delete to close. @default true */
  closable?: boolean;
  /** Ctrl or ⌘ with W closes the active tab and with T opens one, where the browser passes those keys on (installed apps, embedded views). @default false */
  shortcuts?: boolean;
  /** The plus button's accessible name. @default "New tab" */
  newLabel?: string;
  /** Strip height 32, 36 or 40 px. @default "md" */
  size?: TabStripSize;
  /** The active tab's rule and the dirty dot; any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the presses, the new tab and the close. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------ the default tabs ------------------------------ */

function Sheet({ rows }: { rows: [string, string, string][] }) {
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-[11px] text-ink-3">
          <th className="pb-1.5 font-normal">Pump</th>
          <th className="pb-1.5 font-normal">Window</th>
          <th className="pb-1.5 text-right font-normal">Flow</th>
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {rows.map(([pump, window, flow]) => (
          <tr key={pump} className="border-t border-hairline">
            <td className="py-1.5 font-sans text-foreground">{pump}</td>
            <td className="py-1.5 text-ink-2">{window}</td>
            <td className="py-1.5 text-right text-foreground">{flow}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Doc({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {lines.map((line) => (
        <p key={line} className="text-xs leading-5 text-ink-2">
          {line}
        </p>
      ))}
    </div>
  );
}

function Stats({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map(([term, value]) => (
        <div
          key={term}
          className="flex min-w-0 flex-col gap-0.5 rounded-2 border border-hairline bg-surface-1 px-2.5 py-2"
        >
          <dt className="truncate text-[11px] text-ink-3">{term}</dt>
          <dd className="truncate font-mono text-sm text-foreground tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Four Fernworks documents: one pinned, one with unsaved changes. */
export const defaultStripTabs: TabStripTab[] = [
  {
    id: "overview",
    title: "Overview",
    pinned: true,
    icon: <LayoutGrid className="size-3.5" />,
    content: (
      <Stats
        items={[
          ["Open jobs", "14"],
          ["Due this week", "5"],
          ["Crews out", "3"],
        ]}
      />
    ),
  },
  {
    id: "pump-schedule",
    title: "Pump schedule",
    icon: <FileSpreadsheet className="size-3.5" />,
    content: (
      <Sheet
        rows={[
          ["North well", "06:00–08:30", "12 l/s"],
          ["Weir gate", "09:00–11:00", "8 l/s"],
          ["Basin Road", "13:30–15:00", "15 l/s"],
        ]}
      />
    ),
  },
  {
    id: "basin-notes",
    title: "Basin Road notes",
    dirty: true,
    icon: <FileText className="size-3.5" />,
    content: (
      <Doc
        title="Basin Road, plot 14"
        lines={[
          "Ditch silted at the east edge; clear before the October rains.",
          "Samples S-14-01 to S-14-03 sent to Coldbrook soils, batch 9.",
        ]}
      />
    ),
  },
  {
    id: "q3-survey",
    title: "Q3 survey",
    icon: <ChartColumn className="size-3.5" />,
    content: (
      <Stats
        items={[
          ["Plots done", "31 / 38"],
          ["Mean pH", "6.7"],
          ["Hours", "412"],
        ]}
      />
    ),
  },
];

/* ---------------------------------- helpers ---------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const STRIP: Record<TabStripSize, number> = { sm: 32, md: 36, lg: 40 };
/** Room the plus takes at the end of the track, and the overflow button. */
const PLUS = 34;
const MENU = 56;
/** Space above and below the open menu, inside the panel. */
const MENU_GAP = 10;

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

type DragHandlers = ReturnType<typeof useDrag>;

/**
 * A tab is a short target, so the pointer's first move can leave it before
 * the drag has travelled far enough to take capture. Until it does, moves
 * anywhere on the page are relayed to it.
 */
function relayed(handlers: DragHandlers): DragHandlers {
  return {
    ...handlers,
    onPointerDown: (event) => {
      handlers.onPointerDown(event);
      const own = event.currentTarget as Element;
      const id = event.pointerId;
      const away = (e: PointerEvent) =>
        e.pointerId === id &&
        !(e.target instanceof Node && own.contains(e.target));
      const move = (e: PointerEvent) => {
        if (away(e)) handlers.onPointerMove(e as unknown as React.PointerEvent);
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        if (away(e)) handlers.onPointerUp(e as unknown as React.PointerEvent);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
  };
}

/* ---------------------------------- a tab ---------------------------------- */

type StripTabProps = {
  tab: TabStripTab;
  /** Target slot, in tab widths from the start of the track. */
  slot: number;
  /** Target width, in tab widths: 1 shown, 0 collapsed. */
  share: number;
  /** Width it starts at: 0 for a tab that grows in. */
  born: number;
  spring: Transition;
  /** Whether the strip's width is known yet. The commit that first knows it places the tabs; it never animates them there. */
  measured: boolean;
  leaving: boolean;
  active: boolean;
  /** Which side the active rule grows from. */
  from: number;
  canDrag: boolean;
  canClose: boolean;
  visibleCount: number;
  domId: string;
  panelId: string;
  motionSafe: boolean;
  disabled: boolean;
  bind: (node: HTMLButtonElement | null) => void;
  onSelect: (via: "press" | "key") => void;
  onClose: () => void;
  onReorder: (to: number, from: number) => void;
  onDragEnd: () => void;
  onGone: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

function StripTab({
  tab,
  slot,
  share,
  born,
  spring,
  measured,
  leaving,
  active,
  from,
  canDrag,
  canClose,
  visibleCount,
  domId,
  panelId,
  motionSafe,
  disabled,
  bind,
  onSelect,
  onClose,
  onReorder,
  onDragEnd,
  onGone,
  onKeyDown,
}: StripTabProps) {
  const pos = useMotionValue(slot);
  const size = useMotionValue(born);
  const dragX = useMotionValue(0);
  const lift = useMotionValue(0);
  const shownSlot = React.useRef(slot);
  const shownShare = React.useRef(born);
  const drag = React.useRef<{ from: number; w: number; slot: number } | null>(
    null,
  );
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const latest = React.useRef({ leaving, onGone });
  React.useEffect(() => {
    latest.current = { leaving, onGone };
  });
  const [held, setHeld] = React.useState(false);
  // Rendered, not written on motion's next frame: a tab on its way in is
  // visible in the same commit, so focus can land on it as it grows; one on
  // its way out hides once it has collapsed.
  const [folded, setFolded] = React.useState(born === 0 && share === 0);
  if (share > 0 && folded) setFolded(false);
  // Read by the effects below before it is brought up to date (it is
  // updated after them): true once an earlier commit knew the width.
  const sawWidth = React.useRef(measured);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const settleShare = (to: number) => {
    run(
      "size",
      animate(size, to, {
        ...(motionSafe && sawWidth.current ? springs.glide : { duration: 0 }),
        onComplete: () => {
          if (to !== 0) return;
          setFolded(true);
          if (latest.current.leaving) latest.current.onGone();
        },
      }),
    );
  };

  // Every tab moves on the same spring at the same moment, so a slot is
  // always the sum of the widths before it: a close pulls the rest left with
  // no gap, and a new tab pushes the plus along as it grows.
  React.useEffect(() => {
    if (shownSlot.current === slot) return;
    shownSlot.current = slot;
    if (drag.current || !motionSafe || !sawWidth.current) {
      anims.current.get("pos")?.stop();
      pos.jump(slot);
      return;
    }
    run("pos", animate(pos, slot, spring));
    // The spring is chosen with the slot; a change of spring alone is not a move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, motionSafe, pos]);

  React.useEffect(() => {
    if (shownShare.current === share) return;
    shownShare.current = share;
    settleShare(share);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share]);

  // StrictMode's remount stops whatever is running: carry each value on to
  // rest instead of leaving the tab frozen part-way.
  React.useEffect(() => {
    const running = anims.current;
    if (!drag.current) {
      if (Math.abs(pos.get() - shownSlot.current) > 0.001)
        running.set("pos", animate(pos, shownSlot.current, springs.glide));
      if (Math.abs(size.get() - shownShare.current) > 0.001)
        settleShare(shownShare.current);
      if (Math.abs(dragX.get()) > 0.01)
        running.set("dragX", animate(dragX, 0, springs.glide));
      if (Math.abs(lift.get()) > 0.001)
        running.set("lift", animate(lift, 0, springs.glide));
    }
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    sawWidth.current = measured;
  });

  const gesture = useDrag({
    axis: "x",
    threshold: 5,
    disabled: disabled || !canDrag || leaving || visibleCount < 2,
    onStart: ({ event }) => {
      const el = event.currentTarget as Element | null;
      const w = el?.parentElement?.parentElement?.getBoundingClientRect().width;
      drag.current = { from: slot, w: Math.max(1, w ?? 96), slot };
      setHeld(true);
      if (!active) onSelect("press");
      run(
        "lift",
        animate(lift, 1, motionSafe ? springs.flick : { duration: 0 }),
      );
    },
    onMove: ({ offset }) => {
      const d = drag.current;
      if (!d) return;
      const raw = d.from * d.w + offset.x;
      const x = rubberClamp(raw, 0, (visibleCount - 1) * d.w, d.w);
      const next = Math.min(visibleCount - 1, Math.max(0, Math.round(x / d.w)));
      if (next !== d.slot) {
        const was = d.slot;
        d.slot = next;
        anims.current.get("pos")?.stop();
        pos.jump(next);
        shownSlot.current = next;
        onReorder(next, was);
      }
      dragX.set(r2(x - d.slot * d.w));
    },
    onEnd: ({ velocity }) => {
      drag.current = null;
      setHeld(false);
      if (motionSafe) {
        run(
          "dragX",
          animate(dragX, 0, { ...springs.glide, velocity: velocity.x }),
        );
        run("lift", animate(lift, 0, springs.glide));
      } else {
        dragX.jump(0);
        lift.jump(0);
      }
      onDragEnd();
    },
    onCancel: () => {
      drag.current = null;
      setHeld(false);
      dragX.jump(0);
      lift.jump(0);
      onDragEnd();
    },
    onTap: () => {
      if (!active) onSelect("press");
    },
  });
  const handlers = relayed(gesture);

  const left = useTransform(pos, (p) => `calc(${r3(p)} * var(--tab-strip-w))`);
  const width = useTransform(
    size,
    (s) => `calc(${r3(Math.max(0, s))} * var(--tab-strip-w))`,
  );

  const velocity = useVelocity(dragX);
  // A dragged tab leans a degree or two into its own speed.
  const rotate = useTransform(velocity, (v) =>
    motionSafe ? r2(Math.max(-3, Math.min(3, v / 400))) : 0,
  );
  const scale = useTransform(lift, (l) => r3(1 + 0.03 * l));
  const shadow = useTransform(lift, (l) =>
    l < 0.01
      ? "none"
      : `0 ${r2(4 * l)}px ${r2(14 * l)}px color-mix(in oklab, black ${Math.round(24 * l)}%, transparent)`,
  );

  const closer = canClose && !tab.pinned;

  return (
    <motion.div
      role="presentation"
      // A closed tab is gone for assistive technology at once; only its
      // collapse is still on screen.
      inert={leaving}
      aria-hidden={leaving || undefined}
      className={cn(
        "group/tab-strip-tab [container-type:inline-size] absolute top-0 h-full",
        held ? "z-30" : active ? "z-20" : "z-10",
      )}
      style={{ left, width, visibility: folded ? "hidden" : "visible" }}
    >
      <motion.div
        className={cn(
          "relative h-full overflow-clip rounded-t-2 border-x border-t transition-colors",
          active
            ? "border-hairline bg-card"
            : "border-transparent group-hover/tab-strip-tab:bg-surface-2",
        )}
        style={{
          x: dragX,
          rotate,
          scale,
          boxShadow: shadow,
          originY: 1,
        }}
      >
        {active ? (
          <motion.span
            aria-hidden
            className="absolute inset-x-0 top-0 h-0.5"
            style={{
              backgroundColor: "var(--tab-strip-accent)",
              originX: from < 0 ? 1 : 0,
            }}
            initial={motionSafe ? { scaleX: 0 } : false}
            animate={{ scaleX: 1 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        ) : null}
        <button
          ref={bind}
          type="button"
          role="tab"
          id={domId}
          aria-selected={active}
          aria-controls={active ? panelId : undefined}
          tabIndex={active && !leaving ? 0 : -1}
          disabled={disabled}
          {...handlers}
          onClick={(event) => {
            // Pointer presses arrive through the drag's tap; this is Enter,
            // Space and assistive technology.
            if (event.detail === 0) onSelect("key");
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "flex h-full w-full min-w-0 touch-pan-y items-center gap-2 pl-3 text-left select-none",
            closer ? "pr-7" : "pr-3",
            canDrag ? "cursor-default" : "cursor-pointer",
            active ? "text-foreground" : "text-ink-2",
            RING,
          )}
        >
          <span
            aria-hidden
            className="flex size-3.5 shrink-0 items-center justify-center text-ink-3"
          >
            {tab.icon ?? <FileText className="size-3.5" />}
          </span>
          <span className="min-w-0 flex-1 truncate @max-[64px]:hidden">
            {tab.title}
          </span>
          {tab.dirty ? <span className="sr-only">, unsaved</span> : null}
        </button>
        {tab.dirty && closer ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 right-2.5 size-1.5 -translate-y-1/2 rounded-full transition-opacity group-hover/tab-strip-tab:opacity-0",
              active && "opacity-0",
            )}
            style={{ backgroundColor: "var(--tab-strip-accent)" }}
          />
        ) : null}
        {closer ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Close ${tab.title}`}
            disabled={disabled}
            onClick={onClose}
            className={cn(
              "absolute top-1/2 right-1 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-1 text-ink-3 transition-opacity hover:bg-surface-2 hover:text-foreground",
              active
                ? "opacity-100"
                : "opacity-0 group-hover/tab-strip-tab:opacity-100 @max-[64px]:hidden",
            )}
          >
            <X aria-hidden className="size-3" />
          </button>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------- the component -------------------------------- */

type Leaving = { tab: TabStripTab; after: string | null };

/** The strip as drawn: an order, with closing tabs kept where they were. */
function layOut(
  ids: readonly string[],
  leaving: readonly Leaving[],
  byId: ReadonlyMap<string, TabStripTab>,
) {
  const out: { tab: TabStripTab; leaving: boolean }[] = [];
  const pending = [...leaving];
  const place = (after: string | null) => {
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const l = pending[i];
      if (l && l.after === after) {
        pending.splice(i, 1);
        out.push({ tab: l.tab, leaving: true });
        place(l.tab.id);
      }
    }
  };
  place(null);
  for (const id of ids) {
    const tab = byId.get(id);
    if (!tab) continue;
    out.push({ tab, leaving: false });
    place(id);
  }
  for (const l of pending) out.push({ tab: l.tab, leaving: true });
  return out;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * A document tab strip. Tabs share one width that narrows as more open and
 * widens as they close; the ones that no longer fit go into an overflow menu
 * that carries their count, and the active tab always stays in view. Every
 * tab's place and width are motion values on one spring, so a closing tab
 * collapses while the rest are pulled left with no gap, and a new tab grows
 * out of the plus, pushing it along.
 *
 * Tabs drag to reorder: the dragged tab lifts, leans into its speed and
 * follows the finger 1:1 while its neighbours make room on the `reorder`
 * spring. The active tab's panel cross-fades with a slide toward the side of
 * the tab you moved to, and its height glides to the new panel's.
 *
 * The strip is a real tablist with a roving tab stop: arrows move and
 * select, Home and End jump, Shift with an arrow moves a tab, Delete closes
 * one; the overflow is a menu button with a real menu. Under reduced motion
 * tabs change place and size at once and panels cross-fade on opacity alone.
 */
export function TabStrip({
  tabs: tabsProp,
  defaultTabs = defaultStripTabs,
  onTabsChange,
  value,
  defaultValue,
  onValueChange,
  onCreate,
  onClose,
  label = "Documents",
  width = 168,
  minWidth = 96,
  reorder = "glide",
  slide = 12,
  maxTabs = 12,
  closable = true,
  shortcuts = false,
  newLabel = "New tab",
  size = "md",
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: TabStripProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const menuId = `${uid}-menu`;
  const tabDomId = (id: string) => `${uid}-tab-${id}`;
  const panelDomId = (id: string) => `${uid}-panel-${id}`;
  const stripH = STRIP[size] ?? STRIP.md;
  const minW = Math.max(48, Math.round(minWidth));
  const maxW = Math.max(minW, Math.round(width));

  const [ownTabs, setOwnTabs] = React.useState(defaultTabs);
  const tabs = tabsProp ?? ownTabs;
  const [ownValue, setOwnValue] = React.useState(
    defaultValue ?? tabs[0]?.id ?? "",
  );
  const wanted = value ?? ownValue;
  const activeId = tabs.some((t) => t.id === wanted)
    ? wanted
    : (tabs[0]?.id ?? "");

  const [born] = React.useState(() => new Set(tabs.map((t) => t.id)));
  const [counter, setCounter] = React.useState(1);
  const [preview, setPreview] = React.useState<string[] | null>(null);
  const [kind, setKind] = React.useState<"layout" | "reorder">("layout");
  const [leaving, setLeaving] = React.useState<Leaving[]>([]);
  const idsKey = tabs.map((t) => t.id).join("\u0000");
  const [known, setKnown] = React.useState({ key: idsKey, tabs });
  const [stripW, setStripW] = React.useState<number | null>(null);
  const [panelNode, setPanelNode] = React.useState<HTMLDivElement | null>(null);
  const [panelH, setPanelH] = React.useState<number | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [seenActive, setSeenActive] = React.useState(activeId);
  const [dir, setDir] = React.useState(1);
  const [focusTo, setFocusTo] = React.useState<{
    n: number;
    id: string;
  } | null>(null);

  // Tabs that left the list (closed here, or by the host) stay a moment to
  // collapse where they were.
  if (known.key !== idsKey) {
    const ids = new Set(tabs.map((t) => t.id));
    const before = known.tabs.map((t) => t.id);
    const gone = known.tabs
      .filter((t) => !ids.has(t.id))
      .map((t) => {
        const at = before.indexOf(t.id);
        return { tab: t, after: at > 0 ? (before[at - 1] ?? null) : null };
      });
    setKnown({ key: idsKey, tabs });
    setLeaving((list) => [
      ...list.filter((l) => !ids.has(l.tab.id)),
      ...gone.filter((g) => !list.some((l) => l.tab.id === g.tab.id)),
    ]);
  }

  const order = preview ?? tabs.map((t) => t.id);
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const prevOrder = known.tabs.map((t) => t.id);

  if (seenActive !== activeId) {
    const a = prevOrder.indexOf(seenActive);
    const b = order.indexOf(activeId);
    setSeenActive(activeId);
    setDir(a === -1 || b === -1 ? 1 : b >= a ? 1 : -1);
  }

  // What fits: every tab at `minWidth` or wider, or as many as fit beside
  // the overflow button.
  const n = order.length;
  const cap =
    stripW === null || n * minW <= stripW - PLUS
      ? n
      : Math.max(1, Math.floor((stripW - PLUS - MENU) / minW));
  const visible =
    n <= cap
      ? order
      : order.slice(0, cap).includes(activeId)
        ? order.slice(0, cap)
        : [...order.slice(0, cap - 1), activeId];
  const shown = new Set(visible);
  const overflow = order.filter((id) => !shown.has(id));
  // A menu with nothing left in it (the strip grew, tabs closed) closes.
  if (menuOpen && overflow.length === 0) setMenuOpen(false);

  // Slots follow the order on screen (a drag's preview included); the
  // elements stay in the committed order, because moving a dragged tab's
  // node in the document would drop the pointer it holds.
  let running = 0;
  const placed = new Map<string, { slot: number; share: number }>();
  for (const { tab, leaving: out } of layOut(order, leaving, byId)) {
    const share = !out && shown.has(tab.id) ? 1 : 0;
    placed.set(tab.id, { slot: running, share });
    running += share;
  }
  const slots = layOut(
    tabs.map((t) => t.id),
    leaving,
    byId,
  ).map(({ tab, leaving: out }) => ({
    tab,
    leaving: out,
    slot: placed.get(tab.id)?.slot ?? 0,
    share: placed.get(tab.id)?.share ?? 0,
  }));
  const total = running;

  const plusPos = useMotionValue(total);
  const tabW = useTransform(
    plusPos,
    (c) =>
      `clamp(${minW}px, calc((100% - ${PLUS}px) / ${r3(Math.max(1, c))}), ${maxW}px)`,
  );
  const plusLeft = useTransform(
    plusPos,
    (p) => `calc(${r3(p)} * var(--tab-strip-w))`,
  );
  const plusRot = useMotionValue(0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const tabNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const menuButton = React.useRef<HTMLButtonElement | null>(null);
  const menuItems = React.useRef(new Map<string, HTMLDivElement>());
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  // The commit that first knows the width places the plus; it does not
  // animate it there. `plusSaw` is read before it is brought up to date.
  const shownTotal = React.useRef(total);
  const plusSaw = React.useRef(stripW !== null);
  React.useEffect(() => {
    if (shownTotal.current === total) return;
    shownTotal.current = total;
    if (!motionSafe || !plusSaw.current) {
      anims.current.get("plus")?.stop();
      plusPos.jump(total);
      return;
    }
    run("plus", animate(plusPos, total, springs.glide));
  }, [total, motionSafe, plusPos]);
  React.useEffect(() => {
    plusSaw.current = stripW !== null;
  });

  // The strip is measured as it arrives, inside the commit, so the first
  // frame already holds only the tabs that fit; the observer keeps it true.
  const bindStrip = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    setStripW(Math.round(node.getBoundingClientRect().width));
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setStripW(Math.round(w));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    if (!panelNode) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.borderBoxSize?.[0]?.blockSize;
      setPanelH(Math.round(h ?? panelNode.offsetHeight));
    });
    ro.observe(panelNode);
    return () => ro.disconnect();
  }, [panelNode]);

  // Focus follows a tab that was opened, moved or handed over, once it
  // exists — and only when focus was already in the strip.
  React.useEffect(() => {
    if (!focusTo) return;
    const node = tabNodes.current.get(focusTo.id);
    if (!node) return;
    const at = document.activeElement;
    if (!at || at === document.body || rootRef.current?.contains(at)) {
      node.focus({ preventScroll: true });
    }
  }, [focusTo, idsKey, activeId]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target))
        return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // One stable callback for every panel: an arriving panel takes over the
  // measurement, and a leaving one gives it up only if it still has it.
  const bindPanel = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    setPanelNode(node);
    return () => setPanelNode((p) => (p === node ? null : p));
  }, []);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const focusLater = (id: string) =>
    setFocusTo((f) => ({ n: (f?.n ?? 0) + 1, id }));

  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const commitTabs = (next: TabStripTab[]) => {
    if (!tabsProp) setOwnTabs(next);
    onTabsChange?.(next);
  };

  const select = (id: string, via: "press" | "key" | "menu") => {
    if (disabled || id === activeId) return;
    const i = visible.indexOf(id);
    audio.play("click", {
      pitch: r2(semitones(Math.max(0, i) * 2) * 0.9),
      gain: 0.45,
      pan: panOf(tabNodes.current.get(id)),
    });
    setKind("layout");
    if (value === undefined) setOwnValue(id);
    onValueChange?.(id);
    if (via !== "press") focusLater(id);
  };

  const create = () => {
    if (disabled || tabs.length >= maxTabs) return;
    const made = onCreate
      ? onCreate()
      : {
          id: `${uid}-untitled-${counter}`,
          title: `Untitled ${counter}`,
          content: (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Untitled {counter}
              </p>
              <p className="text-xs text-ink-3">
                An empty document. Start writing, or drop a file here.
              </p>
            </div>
          ),
        };
    if (!made) return;
    setCounter((c) => c + 1);
    audio.play("pop", {
      pitch: 1.15,
      gain: 0.5,
      pan: 0.4,
    });
    run(
      "plusRot",
      motionSafe
        ? animate(plusRot, plusRot.get() + 90, springs.flick)
        : animate(plusRot, plusRot.get(), { duration: 0 }),
    );
    setKind("layout");
    commitTabs([...tabs, made]);
    if (value === undefined) setOwnValue(made.id);
    onValueChange?.(made.id);
    say(`Opened ${made.title}.`);
    focusLater(made.id);
  };

  const close = (id: string) => {
    const tab = byId.get(id);
    if (disabled || !closable || !tab || tab.pinned) return;
    const rest = tabs.filter((t) => t.id !== id);
    if (rest.length === 0) return;
    audio.play("pop", {
      pitch: 0.8,
      gain: 0.4,
      pan: panOf(tabNodes.current.get(id)),
    });
    setKind("layout");
    let next = activeId;
    if (id === activeId) {
      // The neighbour that takes over is the one to its right in view, or
      // its left: that is not a choice, so it happens now and is reported.
      const i = visible.indexOf(id);
      const after = visible.slice(i + 1).find((x) => x !== id);
      const before = [...visible.slice(0, Math.max(0, i))].reverse()[0];
      next = after ?? before ?? rest[0]?.id ?? "";
    }
    commitTabs(rest);
    onClose?.(id);
    const nextTab = rest.find((t) => t.id === next);
    say(
      next !== activeId && nextTab
        ? `Closed ${tab.title}. ${nextTab.title} selected.`
        : `Closed ${tab.title}.`,
    );
    if (next !== activeId) {
      if (value === undefined) setOwnValue(next);
      onValueChange?.(next);
    }
    const at = document.activeElement;
    if (!at || at === document.body || rootRef.current?.contains(at))
      focusLater(next);
  };

  /** Moves a tab to a visible slot, in the full order. */
  const moveTo = (ids: string[], id: string, to: number) => {
    const rest = ids.filter((x) => x !== id);
    const vis = visible.filter((x) => x !== id);
    const anchor = vis[to];
    const at = anchor === undefined ? rest.length : rest.indexOf(anchor);
    rest.splice(at === -1 ? rest.length : at, 0, id);
    return rest;
  };

  const reorderSpring: Transition =
    reorder === "snap" ? springs.snap : springs.glide;

  const onTabKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const mod = event.ctrlKey || event.metaKey;
    if (shortcuts && mod && (event.key === "w" || event.key === "W")) {
      event.preventDefault();
      close(activeId);
      return;
    }
    if (shortcuts && mod && (event.key === "t" || event.key === "T")) {
      event.preventDefault();
      create();
      return;
    }
    const i = visible.indexOf(id);
    if (i === -1) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const d = event.key === "ArrowRight" ? 1 : -1;
      if (event.shiftKey) {
        const to = i + d;
        if (reorder === "off" || to < 0 || to >= visible.length) return;
        const next = moveTo(
          tabs.map((t) => t.id),
          id,
          to,
        );
        audio.play("click", { pitch: d > 0 ? 1.1 : 0.9, gain: 0.35 });
        setKind("reorder");
        commitTabs(
          next
            .map((x) => byId.get(x))
            .filter((t): t is TabStripTab => t !== undefined),
        );
        const tab = byId.get(id);
        if (tab)
          say(`${tab.title} moved to position ${to + 1} of ${visible.length}.`);
        focusLater(id);
        return;
      }
      const target = visible[(i + d + visible.length) % visible.length];
      if (target) {
        tabNodes.current.get(target)?.focus();
        select(target, "key");
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const target = event.key === "Home" ? visible[0] : visible.at(-1);
      if (target) {
        tabNodes.current.get(target)?.focus();
        select(target, "key");
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      close(id);
    }
  };

  /* ------------------------------ the overflow menu ------------------------------ */

  const openMenu = (focusFirst: boolean) => {
    if (overflow.length === 0) return;
    setMenuOpen(true);
    if (focusFirst) {
      requestAnimationFrame(() => {
        const first = overflow[0];
        if (first) menuItems.current.get(first)?.focus();
      });
    }
  };

  const closeMenu = (focusButton: boolean) => {
    setMenuOpen(false);
    if (focusButton) menuButton.current?.focus();
  };

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = overflow;
    const at = items.findIndex(
      (id) => menuItems.current.get(id) === document.activeElement,
    );
    const focusAt = (j: number) => {
      const id = items[(j + items.length) % items.length];
      if (id) menuItems.current.get(id)?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(at + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusAt(at - 1);
        return;
      case "Home":
        event.preventDefault();
        focusAt(0);
        return;
      case "End":
        event.preventDefault();
        focusAt(items.length - 1);
        return;
      case "Escape":
        // Handled here, where focus is; the page must not also see it.
        event.preventDefault();
        closeMenu(true);
        return;
      case "Tab":
        closeMenu(false);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const id = items[at];
        if (id) {
          closeMenu(false);
          select(id, "menu");
        }
      }
    }
  };

  const activeTab = byId.get(activeId);
  // While the menu is open the panel makes room for it, so the menu stays
  // inside the strip's own box; past five items it scrolls.
  const menuRoom = Math.min(5, overflow.length) * 32 + 10 + MENU_GAP;
  const shownOverflow = overflow.length;
  const variants = {
    enter: (d: number) => ({
      opacity: 0,
      x: motionSafe ? r2(d * Math.max(0, slide)) : 0,
    }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({
      opacity: 0,
      x: motionSafe ? r2(-d * Math.max(0, slide)) : 0,
      transition: { duration: durations.fast, ease: easings.exit },
    }),
  };

  const styleVars = {
    "--tab-strip-accent": accent,
  } as React.CSSProperties;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate flex w-full flex-col overflow-clip rounded-3 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
      style={styleVars}
    >
      <div
        ref={bindStrip}
        className={cn(
          "relative flex shrink-0 items-end border-b border-hairline bg-surface-1 pt-1",
          size === "sm" ? "text-xs" : "text-[13px]",
        )}
        style={{ height: stripH }}
      >
        <motion.div
          className="relative h-full min-w-0 flex-1 overflow-clip"
          style={{ "--tab-strip-w": tabW } as React.CSSProperties}
        >
          <div
            role="tablist"
            aria-label={label}
            aria-orientation="horizontal"
            className="absolute inset-0 pl-1"
          >
            <div className="relative h-full">
              {slots.map(({ tab, leaving: out, slot, share }) => {
                const isActive = tab.id === activeId && !out;
                const pi = (preview ?? []).indexOf(tab.id);
                return (
                  <StripTab
                    key={tab.id}
                    tab={tab}
                    slot={slot}
                    share={share}
                    born={born.has(tab.id) ? share : 0}
                    spring={kind === "reorder" ? reorderSpring : springs.glide}
                    measured={stripW !== null}
                    leaving={out}
                    active={isActive}
                    from={dir}
                    canDrag={reorder !== "off"}
                    canClose={closable}
                    visibleCount={visible.length}
                    domId={tabDomId(tab.id)}
                    panelId={panelDomId(tab.id)}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    bind={(node) => {
                      if (node) tabNodes.current.set(tab.id, node);
                      else tabNodes.current.delete(tab.id);
                    }}
                    onSelect={(via) => select(tab.id, via)}
                    onClose={() => close(tab.id)}
                    onReorder={(to, from) => {
                      audio.play("click", {
                        pitch: to > from ? 1.1 : 0.9,
                        gain: 0.3,
                        pan: panOf(tabNodes.current.get(tab.id)),
                      });
                      setKind("reorder");
                      setPreview((p) => moveTo(p ?? order, tab.id, to));
                    }}
                    onDragEnd={() => {
                      const ids = preview;
                      setPreview(null);
                      setKind("layout");
                      if (!ids || pi === -1) return;
                      const next = ids
                        .map((x) => byId.get(x))
                        .filter((t): t is TabStripTab => t !== undefined);
                      if (
                        next.map((t) => t.id).join() ===
                        tabs.map((t) => t.id).join()
                      )
                        return;
                      commitTabs(next);
                      const to = visible.indexOf(tab.id);
                      say(
                        `${tab.title} moved to position ${to + 1} of ${visible.length}.`,
                      );
                    }}
                    onGone={() =>
                      setLeaving((list) =>
                        list.filter((l) => l.tab.id !== tab.id),
                      )
                    }
                    onKeyDown={(event) => onTabKey(event, tab.id)}
                  />
                );
              })}
            </div>
          </div>
          <motion.div
            className="absolute top-0 flex h-full items-center pl-1"
            style={{ left: plusLeft }}
          >
            <button
              type="button"
              aria-label={newLabel}
              disabled={disabled || tabs.length >= maxTabs}
              onClick={create}
              className={cn(
                "mb-1 inline-flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-40",
                RING,
              )}
            >
              <motion.span
                aria-hidden
                className="flex size-4 items-center justify-center"
                style={{ rotate: plusRot }}
              >
                <Plus className="size-4" />
              </motion.span>
            </button>
          </motion.div>
        </motion.div>

        <motion.div
          inert={shownOverflow === 0}
          className="flex h-full shrink-0 items-center justify-end overflow-clip"
          initial={false}
          animate={{ width: shownOverflow > 0 ? MENU : 0 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <button
            ref={menuButton}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            aria-label={`${plural(shownOverflow, "more tab", "more tabs")}`}
            tabIndex={shownOverflow > 0 ? 0 : -1}
            disabled={disabled}
            onClick={() => (menuOpen ? closeMenu(false) : openMenu(false))}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                openMenu(true);
              } else if (
                (event.key === "Enter" || event.key === " ") &&
                !menuOpen
              ) {
                event.preventDefault();
                openMenu(true);
              } else if (event.key === "Escape" && menuOpen) {
                event.preventDefault();
                closeMenu(true);
              }
            }}
            className={cn(
              "mr-1 mb-1 inline-flex h-7 shrink-0 items-center gap-0.5 rounded-2 px-2 font-mono text-[11px] text-ink-2 tabular-nums transition-colors hover:bg-surface-2 hover:text-foreground",
              menuOpen && "bg-surface-2 text-foreground",
              RING,
            )}
          >
            <span className="relative inline-flex h-4 min-w-4 items-center justify-center overflow-clip">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={shownOverflow}
                  initial={motionSafe ? { y: 10, opacity: 0 } : { opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{
                    y: motionSafe ? -10 : 0,
                    opacity: 0,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                    },
                  }}
                  transition={
                    motionSafe ? springs.snap : { duration: durations.fast }
                  }
                >
                  +{shownOverflow}
                </motion.span>
              </AnimatePresence>
            </span>
            <ChevronDown aria-hidden className="size-3.5" />
          </button>
        </motion.div>
      </div>

      <AnimatePresence>
        {menuOpen && overflow.length > 0 ? (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="More tabs"
            onKeyDown={onMenuKey}
            className="absolute right-1.5 z-40 flex w-56 max-w-[calc(100%-12px)] flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_8px_24px_color-mix(in_oklab,black_18%,transparent)]"
            style={{
              top: stripH + 4,
              maxHeight: menuRoom - MENU_GAP,
            }}
            initial={
              motionSafe ? { opacity: 0, y: -4, scale: 0.98 } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              transition: { duration: durations.fast, ease: easings.exit },
            }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
          >
            {overflow.map((id) => {
              const tab = byId.get(id);
              if (!tab) return null;
              return (
                <div
                  key={id}
                  ref={(node) => {
                    if (node) menuItems.current.set(id, node);
                    else menuItems.current.delete(id);
                  }}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    closeMenu(false);
                    select(id, "menu");
                  }}
                  className={cn(
                    "flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-2 px-2 text-[13px] text-foreground hover:bg-surface-2 focus:bg-surface-2",
                    RING,
                  )}
                >
                  <span
                    aria-hidden
                    className="flex size-3.5 shrink-0 items-center justify-center text-ink-3"
                  >
                    {tab.icon ?? <FileText className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                  {tab.dirty ? (
                    <span
                      aria-label="unsaved"
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: "var(--tab-strip-accent)" }}
                    />
                  ) : null}
                </div>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        className="relative overflow-clip"
        initial={false}
        animate={{
          height:
            panelH === null
              ? "auto"
              : Math.max(
                  panelH,
                  menuOpen && overflow.length > 0 ? menuRoom : 0,
                ),
        }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <div className="grid">
          <AnimatePresence initial={false} custom={dir}>
            {activeTab ? (
              <motion.div
                key={activeTab.id}
                id={panelDomId(activeTab.id)}
                role="tabpanel"
                aria-labelledby={tabDomId(activeTab.id)}
                tabIndex={0}
                custom={dir}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.base, ease: easings.enter },
                }}
                className={cn(
                  "rounded-b-3 outline-none [grid-area:1/1] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                )}
              >
                <div ref={bindPanel} className="p-4">
                  {activeTab.content ?? (
                    <p className="text-xs text-ink-3">Nothing in this tab.</p>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
