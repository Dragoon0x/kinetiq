"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const emptySubscribe = () => () => {};
const useMounted = () =>
  React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

export type ContextMenuItem = {
  /** Stable id — also the React key. */
  id: string;
  label?: React.ReactNode;
  /** Optional leading glyph. */
  icon?: React.ReactNode;
  /** Right-aligned shortcut hint (display only). */
  shortcut?: string;
  disabled?: boolean;
  /** Render a divider instead of a row. */
  separator?: boolean;
  /** Nested rows — opens a submenu to the side. */
  items?: ContextMenuItem[];
  onSelect?: () => void;
};

export type ContextMenuProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The rows shown on right-click. */
  items: ContextMenuItem[];
  /** The region that owns the menu. */
  children: React.ReactNode;
  /** Accessible name for the menu surface. */
  label?: string;
  /** Extra classes for the target region. */
  className?: string;
};

function isActionable(item: ContextMenuItem | undefined): item is ContextMenuItem {
  return !!item && !item.separator && !item.disabled;
}
function firstActionable(items: ContextMenuItem[]): number {
  return items.findIndex(isActionable);
}
function lastActionable(items: ContextMenuItem[]): number {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (isActionable(items[i])) return i;
  }
  return -1;
}
function stepActionable(
  items: ContextMenuItem[],
  from: number,
  dir: 1 | -1,
): number {
  const n = items.length;
  if (n === 0) return from;
  let i = from;
  for (let s = 0; s < n; s += 1) {
    i = (i + dir + n) % n;
    if (isActionable(items[i])) return i;
  }
  return from;
}

type SubState = {
  index: number;
  left: number;
  top: number;
  origin: string;
  autoFocus: boolean;
};

type MenuListProps = {
  items: ContextMenuItem[];
  label?: string;
  motionSafe: boolean;
  style: React.CSSProperties;
  transformOrigin: string;
  autoFocusFirst: boolean;
  onClose: () => void;
  onCloseSelf?: () => void;
  rootRef?: React.Ref<HTMLDivElement>;
};

function MenuList({
  items,
  label,
  motionSafe,
  style,
  transformOrigin,
  autoFocusFirst,
  onClose,
  onCloseSelf,
  rootRef,
}: MenuListProps) {
  const [active, setActive] = React.useState(() => {
    const first = firstActionable(items);
    return first === -1 ? 0 : first;
  });
  const [sub, setSub] = React.useState<SubState | null>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const hoverTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!autoFocusFirst) return;
    const first = firstActionable(items);
    const frame = window.requestAnimationFrame(() => {
      itemRefs.current[first === -1 ? 0 : first]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusFirst, items]);

  React.useEffect(
    () => () => {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    },
    [],
  );

  const focusItem = (index: number) => {
    if (index < 0) return;
    setActive(index);
    itemRefs.current[index]?.focus();
  };

  const openSubmenu = (index: number, autoFocus: boolean) => {
    const el = itemRefs.current[index];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const SUB_W = 184;
    const SUB_H = 220;
    const margin = 8;
    const flipX = r.right + SUB_W + margin > window.innerWidth;
    const left = flipX ? Math.max(margin, r.left - SUB_W + 4) : r.right - 4;
    const top = Math.min(
      Math.max(margin, r.top - 5),
      window.innerHeight - SUB_H - margin,
    );
    setSub({
      index,
      left,
      top,
      origin: flipX ? "top right" : "top left",
      autoFocus,
    });
  };

  const closeSubmenu = (refocus: boolean) => {
    const index = sub?.index ?? null;
    setSub(null);
    if (refocus && index !== null) itemRefs.current[index]?.focus();
  };

  const activate = (index: number) => {
    const item = items[index];
    if (!isActionable(item)) return;
    if (item.items && item.items.length > 0) {
      openSubmenu(index, true);
      return;
    }
    item.onSelect?.();
    onClose();
  };

  const onItemEnter = (index: number) => {
    const item = items[index];
    if (!isActionable(item)) return;
    setActive(index);
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    if (item.items && item.items.length > 0) {
      hoverTimer.current = window.setTimeout(
        () => openSubmenu(index, false),
        90,
      );
    } else if (sub !== null) {
      hoverTimer.current = window.setTimeout(() => setSub(null), 90);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        focusItem(stepActionable(items, active, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        focusItem(stepActionable(items, active, -1));
        break;
      case "Home":
        event.preventDefault();
        event.stopPropagation();
        focusItem(firstActionable(items));
        break;
      case "End":
        event.preventDefault();
        event.stopPropagation();
        focusItem(lastActionable(items));
        break;
      case "ArrowRight":
        if (items[active]?.items?.length) {
          event.preventDefault();
          event.stopPropagation();
          openSubmenu(active, true);
        }
        break;
      case "ArrowLeft":
        if (onCloseSelf) {
          event.preventDefault();
          event.stopPropagation();
          onCloseSelf();
        }
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        if (onCloseSelf) onCloseSelf();
        else onClose();
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        event.stopPropagation();
        activate(active);
        break;
      default:
        break;
    }
  };

  const count = items.filter(isActionable).length;

  return (
    <motion.div
      ref={rootRef}
      role="menu"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ ...style, transformOrigin }}
      initial={
        motionSafe
          ? { opacity: 0, scale: 0.92 }
          : { opacity: 0 }
      }
      animate={
        motionSafe
          ? {
              opacity: 1,
              scale: 1,
              transition: {
                scale: springs.snap,
                opacity: { duration: durations.fast, ease: easings.enter },
              },
            }
          : { opacity: 1, transition: { duration: durations.fast } }
      }
      exit={{
        opacity: 0,
        scale: motionSafe ? 0.97 : 1,
        transition: exitFor(durations.fast),
      }}
      className="bg-popover text-popover-foreground border-border fixed z-[60] min-w-[11rem] max-w-[16rem] rounded-3 border p-1 shadow-lg"
    >
      {items.map((item, index) => {
        if (item.separator) {
          return (
            <div
              key={item.id}
              role="separator"
              className="bg-hairline mx-1 my-1 h-px"
            />
          );
        }
        const hasSub = !!item.items && item.items.length > 0;
        return (
          <motion.button
            key={item.id}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            type="button"
            role="menuitem"
            tabIndex={active === index ? 0 : -1}
            data-active={active === index}
            disabled={item.disabled}
            aria-haspopup={hasSub ? "menu" : undefined}
            aria-expanded={hasSub ? sub?.index === index : undefined}
            onClick={() => activate(index)}
            onMouseEnter={() => onItemEnter(index)}
            initial={motionSafe ? { opacity: 0, x: -6 } : false}
            animate={
              motionSafe
                ? {
                    opacity: 1,
                    x: 0,
                    transition: {
                      delay: index * cascade(Math.max(count, 1)),
                      duration: durations.base,
                      ease: easings.enter,
                    },
                  }
                : { opacity: 1 }
            }
            className={cn(
              "text-ink relative z-10 flex w-full items-center gap-2.5 rounded-2 px-2.5 py-1.5 text-left text-sm",
              "hover:bg-surface-2 data-[active=true]:bg-surface-2 focus-visible:outline-none",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            {item.icon && (
              <span className="text-ink-3 grid size-4 shrink-0 place-items-center [&_svg]:size-4">
                {item.icon}
              </span>
            )}
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && (
              <span className="text-ink-3 font-mono text-[10px] tracking-wide">
                {item.shortcut}
              </span>
            )}
            {hasSub && (
              <svg
                aria-hidden
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className="text-ink-3 shrink-0"
              >
                <path
                  d="M4.5 3 7.5 6 4.5 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </motion.button>
        );
      })}

      <AnimatePresence>
        {sub !== null && items[sub.index]?.items && (
          <MenuList
            items={items[sub.index]!.items!}
            label={label}
            motionSafe={motionSafe}
            style={{ left: sub.left, top: sub.top }}
            transformOrigin={sub.origin}
            autoFocusFirst={sub.autoFocus}
            onClose={onClose}
            onCloseSelf={() => closeSubmenu(true)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * A menu that springs from the point you right-click. It clamps to the viewport
 * — flipping up or left near an edge — cascades its rows in, and opens nested
 * submenus to the side on hover or ArrowRight. Full keyboard control: the
 * Menu/Shift+F10 key opens it from the focused region, arrows and Home/End move,
 * ArrowLeft steps back out of a submenu, Escape and outside-click dismiss, and
 * focus returns to the region. Under reduced motion it appears without the
 * spring or cascade.
 */
export function ContextMenu({
  ref,
  items,
  children,
  label = "Context menu",
  className,
}: ContextMenuProps) {
  const motionSafe = useMotionSafe();
  const mounted = useMounted();
  const [state, setState] = React.useState({
    open: false,
    x: 0,
    y: 0,
    origin: "top left",
    autoFocus: false,
  });
  const targetRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const setTargetRef = (node: HTMLDivElement | null) => {
    targetRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) {
      (ref as React.RefObject<HTMLDivElement | null>).current = node;
    }
  };

  const openAt = (clientX: number, clientY: number, autoFocus: boolean) => {
    const MENU_W = 208;
    const MENU_H = 240;
    const margin = 8;
    const flipX = clientX + MENU_W + margin > window.innerWidth;
    const flipY = clientY + MENU_H + margin > window.innerHeight;
    const x = flipX ? Math.max(margin, clientX - MENU_W) : clientX;
    const y = flipY ? Math.max(margin, clientY - MENU_H) : clientY;
    setState({
      open: true,
      x,
      y,
      origin: `${flipX ? "right" : "left"} ${flipY ? "bottom" : "top"}`,
      autoFocus,
    });
  };

  const close = React.useCallback((refocus: boolean) => {
    setState((prev) => (prev.open ? { ...prev, open: false } : prev));
    if (refocus) targetRef.current?.focus();
  }, []);

  const onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    openAt(event.clientX, event.clientY, false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const r = event.currentTarget.getBoundingClientRect();
      openAt(r.left + r.width / 2, r.top + r.height / 2, true);
    }
  };

  // Re-clamp against the measured menu, then keep it dismissable.
  React.useEffect(() => {
    if (!state.open) return;
    const el = menuRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const margin = 8;
      const nx =
        r.right > window.innerWidth - margin
          ? Math.max(margin, window.innerWidth - r.width - margin)
          : state.x;
      const ny =
        r.bottom > window.innerHeight - margin
          ? Math.max(margin, window.innerHeight - r.height - margin)
          : state.y;
      if (nx !== state.x || ny !== state.y) {
        setState((prev) => ({ ...prev, x: nx, y: ny }));
      }
    }

    const onDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close(false);
    };
    const onDismiss = () => close(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [state.open, state.x, state.y, close]);

  const menu = (
    <AnimatePresence>
      {state.open && (
        <MenuList
          items={items}
          label={label}
          motionSafe={motionSafe}
          style={{ left: state.x, top: state.y }}
          transformOrigin={state.origin}
          autoFocusFirst={state.autoFocus}
          onClose={() => close(true)}
          rootRef={menuRef}
        />
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div
        ref={setTargetRef}
        tabIndex={0}
        aria-haspopup="menu"
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        className={cn(
          "focus-visible:ring-cobalt-bright/50 rounded-3 outline-none focus-visible:ring-2",
          className,
        )}
      >
        {children}
      </div>
      {mounted ? createPortal(menu, document.body) : null}
    </>
  );
}
