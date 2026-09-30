"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
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
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ToolDockGlyph =
  | "move"
  | "hand"
  | "frame"
  | "rect"
  | "ellipse"
  | "line"
  | "polygon"
  | "pen"
  | "pencil"
  | "brush"
  | "text"
  | "eraser"
  | "comment";
export type ToolDockOrientation = "vertical" | "horizontal";
export type ToolDockFlyout = "side" | "tray";

export type ToolDockVariant = {
  id: string;
  /** The tool's name: its accessible name, its tooltip-free label and its menu entry. */
  label: string;
  /** A built-in icon, also used for its canvas cursor. */
  glyph?: ToolDockGlyph;
  /** Your own icon, drawn at 18px in the current colour. Wins over `glyph`. */
  icon?: React.ReactNode;
  /** Your own canvas cursor, drawn with its hotspot at the top-left of a 24px box. */
  cursor?: React.ReactNode;
  /** A single letter that switches to it. */
  key?: string;
};

export type ToolDockTool = ToolDockVariant & {
  /** Choices under this tool. The rail shows the last one used, and its options unfold beside it. */
  variants?: ToolDockVariant[];
};

export type ToolDockProps = {
  tools: ToolDockTool[];
  /** Controlled: the id of the active tool, or of the active variant for a tool that has them. */
  value?: string;
  /** Initial tool when uncontrolled. @default the first tool (its first variant) */
  defaultValue?: string;
  /** Fires from the press, key or shortcut that changed the tool. */
  onValueChange?: (id: string) => void;
  /** A rail down the canvas's left, or along its foot. @default "vertical" */
  orientation?: ToolDockOrientation;
  /** Single-letter keys switch tools, and each button shows its letter. @default true */
  shortcuts?: boolean;
  /** A tool's options float beside the rail, or open inside it. @default "side" */
  flyout?: ToolDockFlyout;
  /** A label under each icon. @default false */
  labels?: boolean;
  /** What is on the canvas. */
  children?: React.ReactNode;
  /** The canvas's height in px. @default 400 */
  canvasHeight?: number;
  /** The rail's accessible name. @default "Tools" */
  label?: string;
  /** The canvas's accessible name. @default "Canvas" */
  canvasLabel?: string;
  /** Play ticks and swishes. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Leaf = {
  id: string;
  tool: ToolDockTool;
  toolIndex: number;
  variant: ToolDockVariant | null;
  variantIndex: number;
};
type Hit = { tool: ToolDockTool; variant: ToolDockVariant | null };
type Anchor = { left: number; top: number; sig: string };

/** A rising pentatonic scale: every tool has its own note, and none clash. */
const STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const ITEM = 32;
const ITEM_GAP = 2;
const PANEL_PAD = 4;
const SIDE_W = 152;
const EDITABLE =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const nameOf = (leaf: Leaf) =>
  leaf.variant ? `${leaf.tool.label}: ${leaf.variant.label}` : leaf.tool.label;
const keyOf = (item: ToolDockVariant) =>
  item.key && /^[a-z]$/i.test(item.key) ? item.key.toLowerCase() : null;

/**
 * The tool rail of a drawing canvas, and the canvas it drives. The active
 * tool sits on an indicator that slides to each new choice on the snap
 * spring, with a tick pitched up the rail. A tool with variants shows the
 * last one used and a caret; choosing it unfolds its options beside it —
 * `side`: a panel floating over the canvas, revealed from the rail's edge
 * while its entries step out on snap; `tray`: a drawer that glides open
 * inside the rail and pushes the tools after it — with a swish, and folds
 * them back when one is picked, on Escape, or on a press elsewhere.
 *
 * Single-letter shortcuts switch tools while focus is in the dock or the
 * pointer is over it, never while typing in a field; the key of the tool that
 * is already active cycles its variants. The canvas shows the tool's own
 * cursor, drawn to follow the pointer 1:1, parked at the centre when the
 * pointer is away, and popping to each new shape.
 *
 * The rail is a `role="toolbar"` of pressed buttons with one tab stop; arrows
 * move along it, Space or Enter choose, and the arrow toward the options (or
 * Space and Enter on a tool with variants) opens them as a `role="menu"` of
 * radio items with focus inside. Under reduced motion nothing slides or
 * unfolds: the indicator and the options appear in place, the cursor still
 * follows the pointer but parks at once.
 */
export function ToolDock({
  tools,
  value,
  defaultValue,
  onValueChange,
  orientation = "vertical",
  shortcuts = true,
  flyout = "side",
  labels = false,
  children,
  canvasHeight = 400,
  label = "Tools",
  canvasLabel = "Canvas",
  sound = false,
  disabled = false,
  className,
}: ToolDockProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  // Each tool's options get their own id: a tray folding away can briefly
  // share the rail with the next one opening.
  const menuIdOf = (toolId: string) => `${uid}-${toolId}-options`;
  const vertical = orientation !== "horizontal";
  const tray = flyout === "tray";
  const sig = `${orientation}|${flyout}|${labels}`;

  const leaves = new Map<string, Leaf>();
  tools.forEach((tool, toolIndex) => {
    if (tool.variants && tool.variants.length > 0) {
      tool.variants.forEach((variant, variantIndex) =>
        leaves.set(variant.id, {
          id: variant.id,
          tool,
          toolIndex,
          variant,
          variantIndex,
        }),
      );
    } else {
      leaves.set(tool.id, {
        id: tool.id,
        tool,
        toolIndex,
        variant: null,
        variantIndex: 0,
      });
    }
  });
  const firstTool = tools[0];
  const firstId = firstTool?.variants?.[0]?.id ?? firstTool?.id ?? "";

  const [own, setOwn] = React.useState(defaultValue ?? firstId);
  const currentId = value ?? own;
  const current = leaves.get(currentId) ?? leaves.get(firstId) ?? null;
  const [memory, setMemory] = React.useState<Record<string, string>>({});

  const variantFor = (tool: ToolDockTool): ToolDockVariant | null => {
    const list = tool.variants;
    if (!list || list.length === 0) return null;
    const wanted =
      current?.tool.id === tool.id ? current.variant?.id : memory[tool.id];
    return list.find((v) => v.id === wanted) ?? list[0] ?? null;
  };

  const [open, setOpen] = React.useState<string | null>(null);
  const [anchor, setAnchor] = React.useState<Anchor | null>(null);
  const [menuNode, setMenuNode] = React.useState<HTMLDivElement | null>(null);
  // The newest options node. It is never cleared: every use is behind a check
  // that options are showing, and a folding menu must not wipe out the one
  // arriving in its place.
  const holdMenu = React.useCallback((node: HTMLDivElement | null) => {
    if (node) setMenuNode(node);
  }, []);
  const [stop, setStop] = React.useState<number | null>(null);
  const [via, setVia] = React.useState<"control" | "shortcut">("control");

  // A side panel is placed when it opens; one opened under another layout
  // (the orientation, the flyout style or the labels changed) is not shown.
  const showing =
    open && (tray || anchor?.sig === sig) && !disabled ? open : null;
  const openTool = tools.find((t) => t.id === showing) ?? null;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const hovering = React.useRef(false);
  const focusMenu = React.useRef(false);

  const tabIndexTool =
    stop !== null && stop < tools.length ? stop : (current?.toolIndex ?? 0);

  // Only a shortcut is announced: a pressed button already speaks its state.
  const [said, setSaid] = React.useState({ key: currentId, text: "", n: 0 });
  if (said.key !== currentId) {
    setSaid({
      key: currentId,
      text: via === "shortcut" && current ? `${nameOf(current)}.` : "",
      n: said.n + 1,
    });
  }

  const panOf = (toolId: string) => {
    const rect = buttons.current.get(toolId)?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const select = (id: string, how: "control" | "shortcut") => {
    const leaf = leaves.get(id);
    if (!leaf || disabled || id === currentId) return;
    const sameTool = current?.tool.id === leaf.tool.id;
    const step = sameTool
      ? (STEPS[leaf.toolIndex % STEPS.length] ?? 0) + 7 + leaf.variantIndex * 2
      : (STEPS[leaf.toolIndex % STEPS.length] ?? 0);
    audio.play("tick", {
      pitch: r3(semitones(step) * 0.85),
      gain: 0.45,
      pan: panOf(leaf.tool.id),
    });
    if (leaf.variant) {
      const variantId = leaf.variant.id;
      setMemory((m) => ({ ...m, [leaf.tool.id]: variantId }));
    }
    setStop(leaf.toolIndex);
    setVia(how);
    if (value === undefined) setOwn(id);
    onValueChange?.(id);
  };

  const place = (tool: ToolDockTool): Anchor | null => {
    const root = rootRef.current;
    const rail = railRef.current;
    const button = buttons.current.get(tool.id);
    if (!root || !rail || !button) return null;
    const rr = root.getBoundingClientRect();
    const k = root.offsetWidth > 0 ? rr.width / root.offsetWidth || 1 : 1;
    const br = button.getBoundingClientRect();
    const lr = rail.getBoundingClientRect();
    const n = tool.variants?.length ?? 0;
    if (vertical) {
      const h = n * ITEM + (n - 1) * ITEM_GAP + PANEL_PAD * 2 + 2;
      const mid = (br.top + br.height / 2 - rr.top) / k;
      return {
        left: r2((lr.right - rr.left) / k + 6),
        top: r2(Math.max(0, Math.min(root.offsetHeight - h, mid - h / 2))),
        sig,
      };
    }
    const cell = labels ? 56 : 36;
    const w = n * cell + (n - 1) * ITEM_GAP + PANEL_PAD * 2 + 2;
    const h = (labels ? 48 : 36) + PANEL_PAD * 2 + 2;
    const mid = (br.left + br.width / 2 - rr.left) / k;
    return {
      left: r2(Math.max(0, Math.min(root.offsetWidth - w, mid - w / 2))),
      top: r2((lr.top - rr.top) / k - 6 - h),
      sig,
    };
  };

  const unfold = (tool: ToolDockTool, focusInto: boolean) => {
    if (!tool.variants || tool.variants.length === 0 || disabled) return;
    focusMenu.current = focusInto;
    if (!tray) setAnchor(place(tool));
    if (showing !== tool.id) {
      audio.play("swish", { gain: 0.4, pan: panOf(tool.id) });
    } else if (focusInto && menuNode) {
      menuNode.querySelector<HTMLElement>("[aria-checked='true']")?.focus();
    }
    setOpen(tool.id);
  };

  const fold = (returnFocus: boolean) => {
    if (!showing) return;
    const toolId = showing;
    audio.play("swish", { pitch: 0.72, gain: 0.22, pan: panOf(toolId) });
    setOpen(null);
    focusMenu.current = false;
    if (returnFocus) buttons.current.get(toolId)?.focus();
  };

  // Focus moves into the options once they are actually there.
  React.useEffect(() => {
    if (!menuNode || !focusMenu.current) return;
    focusMenu.current = false;
    const target =
      menuNode.querySelector<HTMLElement>("[aria-checked='true']") ??
      menuNode.querySelector<HTMLElement>("[role='menuitemradio']");
    target?.focus();
  }, [menuNode]);

  const cycle = (tool: ToolDockTool) => {
    const list = tool.variants ?? [];
    const at = list.findIndex((v) => v.id === currentId);
    const next = list[(at + 1) % list.length];
    if (next) select(next.id, "shortcut");
  };

  const keyMap = new Map<string, Hit>();
  for (const tool of tools) {
    const k = keyOf(tool);
    if (k && !keyMap.has(k)) keyMap.set(k, { tool, variant: null });
    for (const variant of tool.variants ?? []) {
      const vk = keyOf(variant);
      if (vk && !keyMap.has(vk)) keyMap.set(vk, { tool, variant });
    }
  }

  const shortcut = (hit: Hit) => {
    const { tool, variant } = hit;
    const many = (tool.variants?.length ?? 0) > 1;
    const active = current?.tool.id === tool.id;
    let cycled = false;
    if (variant) {
      if (currentId === variant.id && many) {
        cycle(tool);
        cycled = true;
      } else select(variant.id, "shortcut");
    } else if (tool.variants && tool.variants.length > 0) {
      if (active && many) {
        cycle(tool);
        cycled = true;
      } else select(variantFor(tool)?.id ?? tool.id, "shortcut");
    } else select(tool.id, "shortcut");
    // Cycling shows where you are among the options; anything else folds them.
    if (cycled) unfold(tool, false);
    else if (showing && showing !== tool.id) fold(false);
  };

  // The listeners below live on the document; they read this, current every render.
  const latest = React.useRef({
    shortcut,
    fold,
    keyMap,
    shortcuts,
    disabled,
    showing,
  });
  React.useEffect(() => {
    latest.current = { shortcut, fold, keyMap, shortcuts, disabled, showing };
  });

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const now = latest.current;
      const root = rootRef.current;
      if (!root || now.disabled) return;
      if (event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(EDITABLE)) return;
      const inside = !!target && root.contains(target);
      const idle =
        !target ||
        target === document.body ||
        target === document.documentElement;
      if (!inside && !(idle && hovering.current)) return;
      if (event.key === "Escape") {
        // Focus in the dock handles its own Escape; this is the pointer's.
        if (!inside && now.showing) {
          event.preventDefault();
          now.fold(false);
        }
        return;
      }
      if (!now.shortcuts || event.shiftKey || event.key.length !== 1) return;
      const hit = now.keyMap.get(event.key.toLowerCase());
      if (!hit) return;
      event.preventDefault();
      if (event.repeat) return;
      now.shortcut(hit);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // A press anywhere but the rail and its options folds them.
  React.useEffect(() => {
    if (!showing) return;
    const onDown = (event: PointerEvent) => {
      const t = event.target;
      if (!(t instanceof Node)) return;
      if (railRef.current?.contains(t)) return;
      if (t instanceof Element && t.closest(`[data-dock-options='${uid}']`)) {
        return;
      }
      latest.current.fold(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [showing, uid]);

  const focusTool = (i: number) => {
    const n = tools.length;
    const tool = tools[((i % n) + n) % n];
    if (!tool) return;
    buttons.current.get(tool.id)?.focus();
  };

  const onToolKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    tool: ToolDockTool,
    i: number,
  ) => {
    const next = vertical ? "ArrowDown" : "ArrowRight";
    const prev = vertical ? "ArrowUp" : "ArrowLeft";
    const toward = vertical ? "ArrowRight" : "ArrowUp";
    if (event.key === next || event.key === prev) {
      event.preventDefault();
      focusTool(i + (event.key === next ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusTool(event.key === "Home" ? 0 : tools.length - 1);
    } else if (event.key === toward && tool.variants?.length) {
      event.preventDefault();
      const v = variantFor(tool);
      if (v) select(v.id, "control");
      unfold(tool, true);
    }
  };

  const onMenuKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    tool: ToolDockTool,
    i: number,
  ) => {
    const list = tool.variants ?? [];
    const alongVertical = vertical;
    const next = alongVertical ? "ArrowDown" : "ArrowRight";
    const prev = alongVertical ? "ArrowUp" : "ArrowLeft";
    const back = vertical ? "ArrowLeft" : "ArrowDown";
    const menu = event.currentTarget.closest("[role='menu']");
    const items = menu
      ? [...menu.querySelectorAll<HTMLElement>("[role='menuitemradio']")]
      : [];
    const go = (j: number) =>
      items[((j % list.length) + list.length) % list.length]?.focus();
    if (event.key === next || event.key === prev) {
      event.preventDefault();
      go(i + (event.key === next ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      go(event.key === "Home" ? 0 : list.length - 1);
    } else if (event.key === back) {
      event.preventDefault();
      fold(true);
    }
  };

  const chooseVariant = (tool: ToolDockTool, variant: ToolDockVariant) => {
    select(variant.id, "control");
    fold(true);
  };

  // The drawn cursor: 1:1 with the pointer over the canvas, home at its centre.
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const parking = React.useRef<AnimationPlaybackControls[]>([]);
  const [canvas, setCanvas] = React.useState<HTMLDivElement | null>(null);
  const follow = (clientX: number, clientY: number) => {
    if (!canvas) return;
    for (const c of parking.current) c.stop();
    parking.current = [];
    const rect = canvas.getBoundingClientRect();
    const k = canvas.offsetWidth > 0 ? rect.width / canvas.offsetWidth || 1 : 1;
    cx.set(
      r2(
        (clientX - rect.left) / k - canvas.clientLeft - canvas.clientWidth / 2,
      ),
    );
    cy.set(
      r2((clientY - rect.top) / k - canvas.clientTop - canvas.clientHeight / 2),
    );
  };
  const park = () => {
    for (const c of parking.current) c.stop();
    if (!motionSafe) {
      parking.current = [];
      cx.set(0);
      cy.set(0);
      return;
    }
    parking.current = [
      animate(cx, 0, springs.glide),
      animate(cy, 0, springs.glide),
    ];
  };
  React.useEffect(
    () => () => {
      for (const c of parking.current) c.stop();
    },
    [],
  );

  const cursorLeaf = current;
  const cursorGlyph =
    cursorLeaf?.variant?.glyph ?? cursorLeaf?.tool.glyph ?? "move";
  const customCursor = cursorLeaf?.variant
    ? cursorLeaf.variant.cursor
    : cursorLeaf?.tool.cursor;

  const cellClass = labels
    ? vertical
      ? "h-12 w-14 flex-col gap-0.5"
      : "h-12 w-12 flex-col gap-0.5"
    : "size-9";

  const options = (tool: ToolDockTool, inside: boolean) => {
    const list = tool.variants ?? [];
    const step = cascade(list.length);
    const rowList = !vertical;
    return (
      <div
        ref={holdMenu}
        id={menuIdOf(tool.id)}
        role="menu"
        aria-label={tool.label}
        aria-orientation={rowList ? "horizontal" : "vertical"}
        data-dock-options={uid}
        className={cn("flex", rowList ? "flex-row" : "flex-col")}
        style={{ gap: ITEM_GAP }}
        onBlur={(event) => {
          // Focus that leaves for somewhere else (Tab, a screen reader) folds it.
          const next = event.relatedTarget;
          if (!(next instanceof Node)) return;
          if (event.currentTarget.contains(next)) return;
          if (railRef.current?.contains(next)) return;
          fold(false);
        }}
      >
        {list.map((variant, i) => {
          const checked = variant.id === currentId;
          const k = shortcuts ? keyOf(variant) : null;
          const wide = !inside && vertical;
          return (
            <motion.button
              key={variant.id}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              aria-keyshortcuts={k ? k.toUpperCase() : undefined}
              tabIndex={-1}
              disabled={disabled}
              onClick={() => chooseVariant(tool, variant)}
              onKeyDown={(event) => onMenuKey(event, tool, i)}
              initial={
                motionSafe
                  ? rowList
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0, x: -distances.step }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={
                motionSafe
                  ? { ...springs.snap, delay: r3(i * step) }
                  : { duration: durations.fast }
              }
              className={cn(
                "relative flex shrink-0 cursor-pointer items-center rounded-2 transition-colors duration-150",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                wide
                  ? "h-8 w-full gap-2 px-2 text-left text-xs"
                  : labels
                    ? cn(
                        "flex-col justify-center gap-0.5",
                        inside
                          ? rowList
                            ? "h-10 w-14"
                            : "h-10 w-full"
                          : "h-12 w-14",
                      )
                    : cn(
                        "justify-center",
                        inside && !rowList ? "h-8 w-full" : "size-9",
                      ),
                checked
                  ? "bg-cobalt-wash text-cobalt-bright"
                  : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Icon item={variant} />
              {wide ? (
                <span className="min-w-0 flex-1 truncate" title={variant.label}>
                  {variant.label}
                </span>
              ) : labels ? (
                <span
                  className="max-w-full truncate text-[10px] leading-3"
                  title={variant.label}
                >
                  {variant.label}
                </span>
              ) : (
                <span className="sr-only">{variant.label}</span>
              )}
              {k ? (
                wide ? (
                  <kbd className="shrink-0 font-mono text-[10px] text-ink-3 uppercase">
                    {k}
                  </kbd>
                ) : (
                  <kbd
                    aria-hidden
                    className="absolute top-0.5 right-1 font-mono text-[8px] leading-none text-ink-3 uppercase"
                  >
                    {k}
                  </kbd>
                )
              ) : null}
            </motion.button>
          );
        })}
      </div>
    );
  };

  const trayBlock = (tool: ToolDockTool) => (
    <motion.div
      key={`tray-${tool.id}`}
      className="overflow-clip"
      initial={
        motionSafe ? { height: 0, opacity: 0 } : { height: "auto", opacity: 0 }
      }
      animate={{ height: "auto", opacity: 1 }}
      exit={
        motionSafe
          ? { height: 0, opacity: 0, transition: exitFor(durations.base) }
          : { opacity: 0, transition: { duration: durations.fast } }
      }
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
    >
      <div
        className={cn(
          "rounded-2 bg-surface-2 p-0.5",
          vertical ? "my-0.5" : "mx-auto mb-0.5 w-fit",
        )}
      >
        {options(tool, true)}
      </div>
    </motion.div>
  );

  const rail = (
    <div
      ref={railRef}
      role="toolbar"
      aria-label={label}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-disabled={disabled || undefined}
      className={cn(
        "relative flex shrink-0 flex-col rounded-3 border border-hairline bg-card p-1",
        vertical && "self-start",
      )}
    >
      {!vertical && tray ? (
        <AnimatePresence initial={false}>
          {openTool ? trayBlock(openTool) : null}
        </AnimatePresence>
      ) : null}
      <div
        className={cn("flex", vertical ? "flex-col" : "flex-row")}
        style={{ gap: ITEM_GAP }}
      >
        {tools.map((tool, i) => {
          const variant = variantFor(tool);
          const shownItem = variant ?? tool;
          const active = current?.tool.id === tool.id;
          const many = !!tool.variants && tool.variants.length > 0;
          const expanded = showing === tool.id;
          const k = shortcuts
            ? (keyOf(tool) ?? (variant ? keyOf(variant) : null))
            : null;
          const allKeys = shortcuts
            ? [keyOf(tool), ...(tool.variants ?? []).map(keyOf)]
                .filter((x): x is string => !!x)
                .map((x) => x.toUpperCase())
            : [];
          const name = variant ? `${tool.label}: ${variant.label}` : tool.label;
          return (
            <React.Fragment key={tool.id}>
              <button
                ref={(node) => {
                  if (node) buttons.current.set(tool.id, node);
                  else buttons.current.delete(tool.id);
                }}
                type="button"
                aria-label={name}
                aria-pressed={active}
                aria-haspopup={many ? "menu" : undefined}
                aria-expanded={many ? expanded : undefined}
                aria-controls={expanded ? menuIdOf(tool.id) : undefined}
                aria-keyshortcuts={
                  allKeys.length ? allKeys.join(" ") : undefined
                }
                tabIndex={i === tabIndexTool ? 0 : -1}
                disabled={disabled}
                onFocus={() => setStop(i)}
                onKeyDown={(event) => onToolKey(event, tool, i)}
                onClick={(event) => {
                  const keyboard = event.detail === 0;
                  if (many && variant) {
                    select(variant.id, "control");
                    if (expanded && !keyboard) fold(false);
                    else unfold(tool, keyboard);
                  } else {
                    select(tool.id, "control");
                    if (showing) fold(false);
                  }
                }}
                className={cn(
                  "relative flex shrink-0 cursor-pointer items-center justify-center rounded-2 transition-colors duration-150",
                  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  "disabled:cursor-not-allowed",
                  cellClass,
                  active
                    ? "text-cobalt-bright"
                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId={`${uid}-indicator`}
                    aria-hidden
                    className="absolute inset-0 rounded-2 bg-cobalt-wash"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative flex flex-col items-center gap-0.5">
                  <Icon item={shownItem} />
                  {labels ? (
                    <span className="text-[10px] leading-3">{tool.label}</span>
                  ) : null}
                </span>
                {k ? (
                  <kbd
                    aria-hidden
                    className="absolute top-0.5 right-1 font-mono text-[8px] leading-none text-ink-3 uppercase"
                  >
                    {k}
                  </kbd>
                ) : null}
                {many ? (
                  <svg
                    aria-hidden
                    viewBox="0 0 5 5"
                    className={cn(
                      "absolute size-[5px] fill-current opacity-60",
                      vertical
                        ? "right-[3px] bottom-[3px]"
                        : "top-[3px] left-[3px] rotate-180",
                    )}
                  >
                    <path d="M5 0V5H0Z" />
                  </svg>
                ) : null}
              </button>
              {vertical && tray ? (
                <AnimatePresence initial={false}>
                  {expanded ? trayBlock(tool) : null}
                </AnimatePresence>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex w-full",
        vertical ? "flex-row items-start gap-2" : "flex-col items-center gap-2",
        disabled && "opacity-50",
        className,
      )}
      onKeyDown={(event) => {
        // Escape is handled where focus is: anywhere in the dock or its options.
        if (event.key !== "Escape" || !showing) return;
        event.preventDefault();
        fold(true);
      }}
      onPointerEnter={() => {
        hovering.current = true;
      }}
      onPointerLeave={() => {
        hovering.current = false;
      }}
    >
      {vertical ? rail : null}
      <div
        ref={setCanvas}
        role="group"
        aria-label={canvasLabel}
        className={cn(
          "relative min-w-0 overflow-clip rounded-3 border border-hairline bg-surface-0 [contain:paint]",
          vertical ? "flex-1" : "w-full",
          !disabled && "cursor-none",
        )}
        style={{
          height: canvasHeight,
          backgroundImage:
            "radial-gradient(var(--grid-major) 1px, transparent 1.2px)",
          backgroundSize: "16px 16px",
          backgroundPosition: "8px 8px",
        }}
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          follow(event.clientX, event.clientY);
        }}
        onPointerDown={(event) => follow(event.clientX, event.clientY)}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") park();
        }}
      >
        {children}
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 left-1/2 z-10",
            // Disabled, the system cursor is back and the drawn one steps aside.
            disabled && "hidden",
          )}
          style={{ x: cx, y: cy }}
        >
          <motion.div
            key={cursorLeaf?.id ?? "none"}
            className="absolute top-0 left-0"
            initial={motionSafe ? { opacity: 0, scale: 0.55 } : { opacity: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={
              motionSafe
                ? {
                    scale: springs.snap,
                    opacity: { duration: durations.blink },
                  }
                : { duration: durations.fast }
            }
            style={{ originX: 0, originY: 0 }}
          >
            {customCursor ?? <CursorArt glyph={cursorGlyph} />}
          </motion.div>
        </motion.div>
      </div>
      {vertical ? null : rail}

      {!tray ? (
        <AnimatePresence>
          {openTool && anchor ? (
            <motion.div
              key={`side-${openTool.id}`}
              data-dock-options={uid}
              className="absolute z-20 rounded-3 border border-hairline bg-popover p-1 shadow-[0_10px_28px_-10px_color-mix(in_oklab,black_45%,transparent)]"
              style={{
                left: anchor.left,
                top: anchor.top,
                width: vertical ? SIDE_W : undefined,
              }}
              initial={
                motionSafe
                  ? {
                      clipPath: vertical
                        ? "inset(0% 100% 0% 0% round 10px)"
                        : "inset(100% 0% 0% 0% round 10px)",
                    }
                  : { opacity: 0 }
              }
              animate={{
                clipPath: "inset(0% 0% 0% 0% round 10px)",
                opacity: 1,
              }}
              exit={{
                opacity: 0,
                transition: exitFor(durations.fast),
              }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {options(openTool, false)}
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/** A tool's rail icon: your own, a built-in glyph, or its initial. */
function Icon({ item }: { item: ToolDockVariant }) {
  if (item.icon) {
    return (
      <span
        aria-hidden
        className="flex size-[18px] shrink-0 items-center justify-center [&>svg]:size-[18px]"
      >
        {item.icon}
      </span>
    );
  }
  if (item.glyph) {
    return (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-[18px] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPHS[item.glyph]}
      </svg>
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-[18px] shrink-0 items-center justify-center text-sm font-semibold"
    >
      {item.label.charAt(0).toUpperCase()}
    </span>
  );
}

const GLYPHS: Record<ToolDockGlyph, React.ReactNode> = {
  move: <path d="M5.5 3.5L18.5 10.3L12.4 12.2L9.6 18.5Z" />,
  hand: (
    <path d="M8 13.5V6.8a1.4 1.4 0 0 1 2.8 0V12M10.8 11.5V5.4a1.4 1.4 0 0 1 2.8 0v6.1M13.6 11.5V6.8a1.4 1.4 0 0 1 2.8 0v7.4c0 3.4-2.3 5.8-5.6 5.8h-.6c-1.9 0-3.2-.8-4.2-2.2l-2.3-3.3a1.4 1.4 0 0 1 2.2-1.7L8 14.5" />
  ),
  frame: <path d="M8 3.5v17M16 3.5v17M3.5 8h17M3.5 16h17" />,
  rect: <rect x={4} y={6} width={16} height={12} rx={1.5} />,
  ellipse: <ellipse cx={12} cy={12} rx={8} ry={6.5} />,
  line: <path d="M5 19L19 5" />,
  polygon: <path d="M12 3.8L20 9.6L17 19H7L4 9.6Z" />,
  pen: (
    <>
      <path d="M12 3L17.5 10L14.6 17H9.4L6.5 10Z" />
      <path d="M12 10.5V13.5M9.4 17V20.5H14.6V17" />
    </>
  ),
  pencil: (
    <path d="M4.5 19.5L5.6 15.2L16 4.8a2 2 0 0 1 2.9 2.9L8.5 18.2ZM14.3 6.5L17.2 9.4" />
  ),
  brush: (
    <path d="M19 4.5L11.2 12.3M11.2 12.3c-1.9-.6-4 .5-4.5 2.7-.4 1.8-.9 3.4-2.7 4.3 2.6.6 6.3.2 7.6-2.2.9-1.7.9-3.6-.4-4.8Z" />
  ),
  text: <path d="M5.5 6.5V4.5h13v2M12 4.5v15M9 19.5h6" />,
  eraser: (
    <path d="M8.5 19.5L4.2 15.2a1.5 1.5 0 0 1 0-2.1L13 4.3a1.5 1.5 0 0 1 2.1 0l4.6 4.6a1.5 1.5 0 0 1 0 2.1L11.2 19.5ZM20 19.5H8.5M8.4 9l6.6 6.6" />
  ),
  comment: (
    <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
  ),
};

/** Where on each cursor the pointer actually is, in its 24px box. */
const HOTSPOTS: Record<ToolDockGlyph, [number, number]> = {
  move: [5.5, 3.5],
  hand: [12, 12],
  frame: [12, 12],
  rect: [12, 12],
  ellipse: [12, 12],
  line: [12, 12],
  polygon: [12, 12],
  pen: [12, 3],
  pencil: [4.5, 19.5],
  brush: [4, 19.3],
  text: [12, 12],
  eraser: [12, 12],
  comment: [4, 19.5],
};

const SHAPES = new Set<ToolDockGlyph>([
  "frame",
  "rect",
  "ellipse",
  "line",
  "polygon",
]);

/**
 * A tool's canvas cursor, drawn twice — a wide stroke in the canvas colour,
 * then the ink — so it reads on anything it passes over. Shape tools are a
 * crosshair with the shape beside it.
 */
function CursorArt({ glyph }: { glyph: ToolDockGlyph }) {
  const [hx, hy] = HOTSPOTS[glyph] ?? [12, 12];
  const shape = SHAPES.has(glyph);
  // The shape beside a crosshair is drawn at 42%, so its strokes are widened
  // to match the rest of the cursor.
  const art = (badge: number) =>
    shape ? (
      <>
        <path d="M12 4v5.5M12 14.5V20M4 12h5.5M14.5 12H20" />
        <g transform="translate(14.5 14.5) scale(0.42)" strokeWidth={badge}>
          {GLYPHS[glyph]}
        </g>
      </>
    ) : glyph === "text" ? (
      <path d="M9 4.5h6M12 4.5v15M9 19.5h6" />
    ) : glyph === "eraser" ? (
      <circle cx={12} cy={12} r={7} />
    ) : (
      GLYPHS[glyph]
    );
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      className="absolute block overflow-visible"
      style={{ left: -hx, top: -hy }}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g strokeWidth={4.2} style={{ stroke: "var(--bg-1)" }}>
        {art(8)}
      </g>
      <g
        strokeWidth={1.7}
        style={{
          stroke: "var(--ink)",
          fill: glyph === "move" ? "var(--ink)" : "none",
        }}
      >
        {art(4)}
      </g>
    </svg>
  );
}
