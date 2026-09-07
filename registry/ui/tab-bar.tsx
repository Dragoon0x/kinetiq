"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TabBarIcon = "home" | "search" | "inbox" | "wallet" | "me";

export type TabBarTab = {
  id: string;
  label: string;
  icon: TabBarIcon;
  /** Unread count; 0 or undefined hides the badge. */
  badge?: number;
};

export type TabBarProps = {
  /** Up to five tabs; icons are built in. */
  tabs: TabBarTab[];
  /** Controlled active tab id. */
  value?: string;
  /** Initial active tab id for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  className?: string;
  "aria-label"?: string;
};

type Glyph = {
  /** The silhouette: stroked when idle, filled when active. */
  shape: string;
  /** Detail that sits outside the silhouette, always stroked. */
  mark?: string;
};

/** Five built-in glyphs on one 24px grid, so every icon reads at one weight. */
const GLYPHS: Record<TabBarIcon, Glyph> = {
  home: {
    shape:
      "M3.75 10.2 12 3.8l8.25 6.4V19a1.25 1.25 0 0 1-1.25 1.25h-3.6V15h-2.8v5.25H5A1.25 1.25 0 0 1 3.75 19z",
  },
  search: {
    shape: "M10.75 4.5a6.25 6.25 0 1 1 0 12.5 6.25 6.25 0 0 1 0-12.5z",
    mark: "M15.5 15.5 20 20",
  },
  inbox: {
    shape:
      "M3.75 13h4.1l1.3 2.2h5.7l1.3-2.2h4.1v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5z",
    mark: "M3.75 13 6.3 5.9a1.5 1.5 0 0 1 1.4-1h8.6a1.5 1.5 0 0 1 1.4 1L20.25 13",
  },
  wallet: {
    shape:
      "M3.75 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z",
    mark: "M18.75 10.25h1.5v3.5h-1.5",
  },
  me: {
    shape:
      "M12 4.5a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM5.4 19.6a6.6 6.6 0 0 1 13.2 0z",
  },
};

const STROKE = {
  fill: "none",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function TabGlyph({
  icon,
  active,
  motionSafe,
}: {
  icon: TabBarIcon;
  active: boolean;
  motionSafe: boolean;
}) {
  const glyph = GLYPHS[icon];
  // Reduced motion swaps the weight outright rather than dissolving it.
  const fade = motionSafe
    ? { duration: durations.base, ease: easings.enter }
    : { duration: 0 };
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0">
      {/* Two stacked layers rather than one morphing path: a cross-fade is a
          tween, which is what a colour-and-weight change deserves. */}
      <motion.path
        d={glyph.shape}
        stroke="currentColor"
        animate={{ opacity: active ? 0 : 1 }}
        transition={fade}
        {...STROKE}
      />
      <motion.path
        d={glyph.shape}
        fill="currentColor"
        animate={{ opacity: active ? 1 : 0 }}
        transition={fade}
      />
      {glyph.mark ? (
        <path d={glyph.mark} stroke="currentColor" {...STROKE} />
      ) : null}
    </svg>
  );
}

function TabBadge({
  count,
  motionSafe,
}: {
  count: number;
  motionSafe: boolean;
}) {
  const scale = useMotionValue(1);
  const previous = React.useRef(count);

  React.useEffect(() => {
    if (previous.current === count) return;
    previous.current = count;
    if (!motionSafe) return;
    // ζ0.53 gives the two bounces of something landing — the count is news.
    // Exactly two keyframes: a spring silently drops a middle one.
    const controls = animate(scale, [1.35, 1], springs.recoil);
    return () => controls.stop();
  }, [count, motionSafe, scale]);

  return (
    <motion.span
      aria-hidden
      style={{ scale }}
      className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] leading-none font-medium text-destructive-foreground tabular-nums"
    >
      {count > 99 ? "99+" : count}
    </motion.span>
  );
}

/**
 * A bottom tab bar built for a thumb. The chosen tab fills its outline glyph —
 * a solid path cross-fading over the stroked one, a tween because weight and
 * colour have no physics — lifts its label 2px on `snap`, and the indicator
 * pill travels under it through a shared `layoutId` rather than blinking out
 * and in. A badge bumps on `recoil` when its number changes, so a count
 * arriving reads as an event and not as a repaint.
 *
 * It is a real tablist: a roving tabindex, Left and Right wrapping around the
 * bar, Home and End to the ends, and activation follows focus as tabs should.
 * Under reduced motion the fill and the pill swap instantly, the label holds
 * still, and the badge number still updates.
 */
export function TabBar({
  tabs,
  value,
  defaultValue,
  onValueChange,
  className,
  "aria-label": ariaLabel = "Primary",
}: TabBarProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const pillId = `${baseId}-pill`;

  const [uncontrolled, setUncontrolled] = React.useState(
    defaultValue ?? tabs[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;
  const currentIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === current),
  );

  const select = (id: string) => {
    if (id === current) return;
    if (!isControlled) setUncontrolled(id);
    onValueChange?.(id);
  };

  const moveTo = (index: number) => {
    const wrapped = (index + tabs.length) % tabs.length;
    const tab = tabs[wrapped];
    if (!tab) return;
    document.getElementById(`${baseId}-tab-${tab.id}`)?.focus();
    select(tab.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(tabs.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex w-full items-stretch gap-1 rounded-3 border border-hairline bg-surface-1 p-1.5",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === current;
        const count = tab.badge ?? 0;
        return (
          <button
            key={tab.id}
            id={`${baseId}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={count > 0 ? `${tab.label}, ${count} new` : undefined}
            tabIndex={index === currentIndex ? 0 : -1}
            onClick={() => select(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-2 px-1 py-2 transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isActive
                ? "text-cobalt-bright"
                : "text-ink-3 hover:text-ink-2 active:text-ink",
            )}
          >
            {isActive ? (
              motionSafe ? (
                <motion.span
                  aria-hidden
                  layoutId={pillId}
                  transition={springs.glide}
                  className="absolute inset-0 rounded-2 bg-cobalt-wash"
                />
              ) : (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-2 bg-cobalt-wash"
                />
              )
            ) : null}

            <span className="relative flex items-center justify-center">
              <TabGlyph
                icon={tab.icon}
                active={isActive}
                motionSafe={motionSafe}
              />
              {count > 0 ? (
                <TabBadge count={count} motionSafe={motionSafe} />
              ) : null}
            </span>

            <motion.span
              title={tab.label}
              className="relative w-full truncate text-center text-[10px] leading-4 font-medium"
              animate={{ y: isActive && motionSafe ? -2 : 0 }}
              transition={springs.snap}
            >
              {tab.label}
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
