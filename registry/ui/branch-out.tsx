"use client";

import * as React from "react";

import { Plus } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BranchOutItem = {
  id: string;
  /** The option's text and accessible name. */
  label: string;
  /** 16px, drawn in currentColor. */
  icon?: React.ReactNode;
  /** A short, quieter note after the label. */
  hint?: string;
  disabled?: boolean;
};

export type BranchOutSide = "right" | "left";
export type BranchOutSize = "sm" | "md" | "lg";

export type BranchOutProps = {
  /** The options, top to bottom. */
  items: BranchOutItem[];
  /** Called with the chosen option's id. */
  onSelect?: (id: string) => void;
  /** Controlled: whether the menu is open. */
  open?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, key or outside click that opened or closed it. */
  onOpenChange?: (open: boolean) => void;
  /** The trigger's accessible name, and the menu's. @default "Add" */
  label?: string;
  /** The trigger's icon; it turns 45° while open. @default a plus */
  icon?: React.ReactNode;
  /** Which way the branches grow from the trigger. @default "right" */
  side?: BranchOutSide;
  /** How wide the fan opens, 0 to 1: the options' spacing and how far the arc reaches. @default 0.5 */
  spread?: number;
  /** How the branches bend, 0 to 1: straight twigs to S-shaped tendrils. @default 0.6 */
  curve?: number;
  /** Time between one branch and the next as they grow, in ms; capped so the whole growth stays near 600ms. @default 60 */
  stagger?: number;
  /** The colour a branch takes when its option is hot, and the trigger's fill; any CSS colour. @default "var(--accent-bright)" */
  color?: string;
  /** The branches at rest; any CSS colour. @default "var(--hairline-strong)" */
  branchColor?: string;
  /** Close the menu after an option is chosen. @default true */
  closeOnSelect?: boolean;
  /** Show `label` beside the trigger while the menu is closed; it gives way as the branches grow. @default true */
  showLabel?: boolean;
  /** @default "md" */
  size?: BranchOutSize;
  /** Play a pop as each option buds, a tick as focus moves, and a lower tick on choose and close. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  max: number;
  pill: number;
  trigger: number;
  text: string;
  icon: string;
};

const SIZES: Record<BranchOutSize, Geometry> = {
  sm: { max: 280, pill: 28, trigger: 36, text: "text-xs", icon: "size-3.5" },
  md: { max: 320, pill: 32, trigger: 40, text: "text-sm", icon: "size-4" },
  lg: { max: 360, pill: 36, trigger: 44, text: "text-sm", icon: "size-4" },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Pt = { x: number; y: number };

type Branch = {
  /** The option's anchor: where its bud sits, at the pill's near edge. */
  at: Pt;
  d: string;
  leaf: string;
  /** Growth order: nearest the trigger's centre line first. */
  rank: number;
};

const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x:
      u * u * u * p0.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t * t * t * p3.x,
    y:
      u * u * u * p0.y +
      3 * u * u * t * p1.y +
      3 * u * t * t * p2.y +
      t * t * t * p3.y,
  };
};

/** A leaf at `p`, pointing along `angle`: two curves meeting at its tip. */
function leafAt(p: Pt, angle: number, length: number): string {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tip = { x: p.x + c * length, y: p.y + s * length };
  const w = length * 0.42;
  const mid = { x: p.x + c * length * 0.5, y: p.y + s * length * 0.5 };
  const a = { x: mid.x - s * w, y: mid.y + c * w };
  const b = { x: mid.x + s * w, y: mid.y - c * w };
  const f = (q: Pt) => `${r2(q.x)} ${r2(q.y)}`;
  return `M${f(p)}Q${f(a)} ${f(tip)}Q${f(b)} ${f(p)}Z`;
}

/**
 * A menu that grows its options like branches. Opening it grows a short
 * stem out of the trigger, then a branch per option draws from the stem's
 * tip along a curve whose bend is `curve`, nearest the centre line first and
 * staggered by `stagger`; as each branch arrives a bud swells at its end and
 * the option opens out of it on springs.snap. Hovering or focusing an option
 * thickens its branch, tints it and grows a leaf at its middle. Closing
 * retracts everything in reverse on the exit ease, last grown first.
 *
 * Full menu semantics: the trigger opens it with a click, Enter, Space or
 * the arrow keys; arrows move a roving focus, Home and End jump, a letter
 * jumps to the next match, Enter or Space chooses, and Escape closes and
 * returns focus to the trigger. Under reduced motion the branches appear
 * whole and the options fade in together.
 */
export function BranchOut({
  items,
  onSelect,
  open,
  defaultOpen = false,
  onOpenChange,
  label = "Add",
  icon,
  side = "right",
  spread = 0.5,
  curve = 0.6,
  stagger = 60,
  color = "var(--accent-bright)",
  branchColor = "var(--hairline-strong)",
  closeOnSelect = true,
  showLabel = true,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: BranchOutProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const g = SIZES[size] ?? SIZES.md;
  const uid = React.useId();
  const menuId = `${uid}-menu`;

  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = open ?? own;
  const [hot, setHot] = React.useState<number | null>(null);
  const [active, setActive] = React.useState(0);
  // Focus moves to an option only once the open menu has committed.
  const [focusAsk, setFocusAsk] = React.useState<{
    index: number;
    n: number;
  } | null>(null);
  const handledAsk = React.useRef(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const itemRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const typed = React.useRef({ text: "", at: 0 });
  const pops = React.useRef<number[]>([]);

  const n = items.length;
  const sp = clamp(spread, 0, 1);
  const cv = clamp(curve, 0, 1);
  const spacing = r2(lerp(g.pill + 4, g.pill + 16, sp));
  const height = Math.round((n - 1) * spacing + g.pill + 16);
  const cy = height / 2;
  const tr = g.trigger / 2;
  const tcx = 4 + tr;
  const stemX = tcx + tr + 10;
  const step =
    n > 1 ? Math.min(clamp(stagger, 0, 400) / 1000, 0.36 / (n - 1)) : 0;

  const branches = React.useMemo<Branch[]>(() => {
    const stem: Pt = { x: stemX, y: cy };
    const maxDy = ((n - 1) / 2) * spacing;
    const radius = Math.max(lerp(80, 104, sp), maxDy + 20);
    const list = items.map((_, i) => {
      const dy = (i - (n - 1) / 2) * spacing;
      // The options sit on an arc round the trigger: the outer ones come
      // back toward it, the way a fan's ribs do.
      const x = Math.max(
        stem.x + 24,
        tcx + Math.sqrt(Math.max(0, radius * radius - dy * dy)),
      );
      const at = { x: r2(x - 2), y: r2(cy + dy) };
      const dx = at.x - stem.x;
      const straight1 = { x: stem.x + dx / 3, y: stem.y + (at.y - stem.y) / 3 };
      const straight2 = {
        x: stem.x + (2 * dx) / 3,
        y: stem.y + (2 * (at.y - stem.y)) / 3,
      };
      const curl1 = { x: stem.x + dx * 0.62, y: stem.y };
      const curl2 = { x: at.x - dx * 0.55, y: at.y };
      const c1 = {
        x: lerp(straight1.x, curl1.x, cv),
        y: lerp(straight1.y, curl1.y, cv),
      };
      const c2 = {
        x: lerp(straight2.x, curl2.x, cv),
        y: lerp(straight2.y, curl2.y, cv),
      };
      const f = (q: Pt) => `${r2(q.x)} ${r2(q.y)}`;
      const mid = bez(stem, c1, c2, at, 0.5);
      const ahead = bez(stem, c1, c2, at, 0.53);
      const tangent = Math.atan2(ahead.y - mid.y, ahead.x - mid.x);
      // The leaf grows off the branch's outer side, away from the centre.
      const out = dy <= 0 ? -1 : 1;
      return {
        at,
        d: `M${f(stem)}C${f(c1)} ${f(c2)} ${f(at)}`,
        leaf: leafAt(mid, tangent + out * 0.75, g.pill * 0.28),
        rank: 0,
        dy,
      };
    });
    const order = list
      .map((b, i) => ({ i, d: Math.abs(b.dy) }))
      .sort((a, b) => a.d - b.d || a.i - b.i);
    order.forEach(({ i }, rank) => {
      const b = list[i];
      if (b) b.rank = rank;
    });
    return list.map(({ at, d, leaf, rank }) => ({ at, d, leaf, rank }));
  }, [items, n, spacing, sp, cv, stemX, tcx, cy, g.pill]);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setOwn(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );

  const enabled = React.useMemo(
    () => items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0),
    [items],
  );

  const clearPops = () => {
    for (const t of pops.current) window.clearTimeout(t);
    pops.current = [];
  };
  React.useEffect(() => clearPops, []);

  const openMenu = (focus: "first" | "last" | null) => {
    if (disabled || isOpen) return;
    setOpen(true);
    setHot(null);
    const target =
      focus === "first"
        ? (enabled[0] ?? 0)
        : focus === "last"
          ? (enabled[enabled.length - 1] ?? 0)
          : (enabled[0] ?? 0);
    setActive(target);
    if (focus) setFocusAsk((a) => ({ index: target, n: (a?.n ?? 0) + 1 }));
    // A pop as each option buds, rising up the scale.
    clearPops();
    if (motionSafe) {
      branches.forEach((b) => {
        pops.current.push(
          window.setTimeout(
            () => audio.play("pop", { pitch: 0.9 + b.rank * 0.08, gain: 0.4 }),
            Math.round((0.12 + b.rank * step + 0.2) * 1000),
          ),
        );
      });
    } else {
      audio.play("pop", { pitch: 1, gain: 0.4 });
    }
  };

  const closeMenu = (refocus: boolean) => {
    if (!isOpen) return;
    clearPops();
    setOpen(false);
    setHot(null);
    audio.play("tick", { pitch: 0.75, gain: 0.35 });
    if (refocus) triggerRef.current?.focus();
  };

  // The menu has committed open: now its option can take focus.
  React.useEffect(() => {
    if (!focusAsk || !isOpen || handledAsk.current === focusAsk.n) return;
    handledAsk.current = focusAsk.n;
    const item = items[focusAsk.index];
    const node = item ? itemRefs.current.get(item.id) : undefined;
    node?.focus();
  }, [focusAsk, isOpen, items]);

  // A press outside closes it, without moving focus.
  React.useEffect(() => {
    if (!isOpen) return;
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (
        root &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        clearPops();
        if (open === undefined) setOwn(false);
        onOpenChange?.(false);
        setHot(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [isOpen, open, onOpenChange]);

  const moveTo = (index: number) => {
    const item = items[index];
    if (!item) return;
    setActive(index);
    setHot(index);
    itemRefs.current.get(item.id)?.focus();
    audio.play("tick", { pitch: 1 + (index % 3) * 0.06, gain: 0.3 });
  };

  const choose = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    onSelect?.(item.id);
    if (closeOnSelect) closeMenu(true);
    else audio.play("tick", { pitch: 0.85, gain: 0.35 });
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const k = event.key;
    const pos = enabled.indexOf(active);
    if (k === "ArrowDown" || k === "ArrowUp") {
      event.preventDefault();
      if (enabled.length === 0) return;
      const dir = k === "ArrowDown" ? 1 : -1;
      const next =
        enabled[(pos + dir + enabled.length) % enabled.length] ?? active;
      moveTo(next);
    } else if (k === "Home" || k === "End") {
      event.preventDefault();
      const next = k === "Home" ? enabled[0] : enabled[enabled.length - 1];
      if (next !== undefined) moveTo(next);
    } else if (k === "Escape") {
      event.preventDefault();
      closeMenu(true);
    } else if (k === "Tab") {
      closeMenu(false);
    } else if (k.length === 1 && /\S/.test(k)) {
      // Type to jump: letters typed close together build one search, which
      // starts at the current option; a single letter starts after it.
      const now = event.timeStamp;
      const t = typed.current;
      t.text = now - t.at < 600 ? t.text + k.toLowerCase() : k.toLowerCase();
      t.at = now;
      const begin = Math.max(0, pos) + (t.text.length > 1 ? 0 : 1);
      for (let j = 0; j < enabled.length; j += 1) {
        const index = enabled[(begin + j) % enabled.length];
        const it = index === undefined ? undefined : items[index];
        if (index !== undefined && it?.label.toLowerCase().startsWith(t.text)) {
          moveTo(index);
          break;
        }
      }
    }
  };

  const mirror = side === "left";
  const reduced = !motionSafe;

  return (
    <div
      ref={rootRef}
      className={cn("relative w-full", className)}
      style={{ maxWidth: g.max, height }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (
          isOpen &&
          next instanceof Node &&
          rootRef.current &&
          !rootRef.current.contains(next)
        ) {
          closeMenu(false);
        }
      }}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
        style={mirror ? { transform: "scaleX(-1)" } : undefined}
      >
        <motion.path
          d={`M${r2(tcx + tr)} ${r2(cy)}L${r2(stemX)} ${r2(cy)}`}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          style={{ stroke: branchColor }}
          animate={{ pathLength: isOpen ? 1 : 0, opacity: isOpen ? 1 : 0 }}
          transition={
            reduced
              ? { duration: 0 }
              : isOpen
                ? { duration: 0.12, ease: easings.enter }
                : {
                    duration: 0.1,
                    ease: easings.exit,
                    delay: 0.12 + (n - 1) * step * 0.6,
                  }
          }
        />
        {branches.map((b, i) => {
          const isHot = hot === i && isOpen;
          const growAt = 0.1 + b.rank * step;
          const shrinkAt = 0.08 + (n - 1 - b.rank) * step * 0.6;
          const draw = reduced
            ? { duration: 0 }
            : isOpen
              ? { duration: 0.22, ease: easings.enter, delay: growAt }
              : { duration: 0.16, ease: easings.exit, delay: shrinkAt };
          return (
            <g key={items[i]?.id ?? i}>
              <motion.path
                d={b.d}
                fill="none"
                strokeWidth={1.5}
                strokeLinecap="round"
                style={{ stroke: branchColor }}
                animate={{
                  pathLength: isOpen ? 1 : 0,
                  opacity: isOpen ? 1 : 0,
                }}
                transition={{ pathLength: draw, opacity: draw }}
              />
              {/* The hot branch: the same line, thicker and tinted. */}
              <motion.path
                d={b.d}
                fill="none"
                strokeWidth={3}
                strokeLinecap="round"
                style={{ stroke: color }}
                initial={false}
                animate={{
                  pathLength: isOpen ? 1 : 0,
                  opacity: isHot ? 1 : 0,
                }}
                transition={{
                  pathLength: draw,
                  opacity: { duration: durations.fast },
                }}
              />
              <motion.path
                d={b.leaf}
                style={{ fill: color, originX: 0.5, originY: 0.5 }}
                initial={false}
                animate={{
                  scale: isHot && !reduced ? 1 : 0,
                  opacity: isHot ? 0.9 : 0,
                }}
                transition={
                  reduced ? { duration: durations.fast } : springs.snap
                }
              />
              <motion.g
                style={{ originX: 0.5, originY: 0.5 }}
                initial={false}
                animate={{ scale: isOpen ? 1 : 0 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : isOpen
                      ? { ...springs.snap, delay: growAt + 0.18 }
                      : { duration: 0.1, ease: easings.exit, delay: shrinkAt }
                }
              >
                <circle
                  cx={b.at.x}
                  cy={b.at.y}
                  r={3}
                  style={{ fill: branchColor }}
                />
                <circle
                  cx={b.at.x}
                  cy={b.at.y}
                  r={3}
                  className="transition-opacity duration-150"
                  style={{ fill: color, opacity: isHot ? 1 : 0 }}
                />
              </motion.g>
            </g>
          );
        })}
      </svg>

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          if (isOpen) closeMenu(false);
          else openMenu(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (isOpen) {
              const next =
                event.key === "ArrowDown"
                  ? enabled[0]
                  : enabled[enabled.length - 1];
              if (next !== undefined) moveTo(next);
            } else openMenu(event.key === "ArrowDown" ? "first" : "last");
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (event.repeat) return;
            if (isOpen) closeMenu(false);
            else openMenu("first");
          } else if (event.key === "Escape" && isOpen) {
            event.preventDefault();
            closeMenu(false);
          }
        }}
        className={cn(
          "absolute flex items-center justify-center rounded-full text-primary-foreground shadow-[0_6px_16px_-8px_color-mix(in_oklab,black_55%,transparent)] transition-[filter] duration-150 hover:brightness-110",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        style={{
          width: g.trigger,
          height: g.trigger,
          top: r2(cy - tr),
          [mirror ? "right" : "left"]: 4,
          background: color,
        }}
      >
        <motion.span
          aria-hidden
          className="flex items-center justify-center"
          animate={{ rotate: isOpen && !reduced ? 45 : 0 }}
          transition={reduced ? { duration: 0 } : springs.snap}
        >
          {icon ?? <Plus className={cn("shrink-0", g.icon)} />}
        </motion.span>
      </button>

      {showLabel ? (
        <motion.span
          aria-hidden
          className={cn(
            "pointer-events-none absolute truncate font-medium text-ink-2",
            g.text,
          )}
          style={{
            top: r2(cy),
            [mirror ? "right" : "left"]: r2(stemX),
            maxWidth: `calc(100% - ${r2(stemX + 4)}px)`,
            y: "-50%",
          }}
          initial={false}
          animate={{ opacity: isOpen ? 0 : 1 }}
          transition={
            isOpen
              ? { duration: 0.1, ease: easings.exit }
              : {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: reduced ? 0 : 0.2 + (n - 1) * step * 0.6,
                }
          }
        >
          {label}
        </motion.span>
      ) : null}

      <div
        id={menuId}
        role="menu"
        aria-label={label}
        aria-orientation="vertical"
        aria-hidden={!isOpen || undefined}
        inert={!isOpen}
        onKeyDown={onMenuKeyDown}
      >
        {items.map((item, i) => {
          const b = branches[i];
          if (!b) return null;
          const isHot = hot === i && isOpen;
          const growAt = 0.1 + b.rank * step + 0.2;
          const shrinkAt = (n - 1 - b.rank) * step * 0.6;
          return (
            <motion.div
              key={item.id}
              role="none"
              initial={false}
              animate={{
                opacity: isOpen ? 1 : 0,
                scale: isOpen || reduced ? 1 : 0.4,
              }}
              transition={
                reduced
                  ? { duration: durations.fast }
                  : isOpen
                    ? {
                        scale: { ...springs.snap, delay: growAt },
                        opacity: {
                          duration: durations.fast,
                          ease: easings.enter,
                          delay: growAt,
                        },
                      }
                    : {
                        duration: 0.12,
                        ease: easings.exit,
                        delay: shrinkAt,
                      }
              }
              className="absolute flex"
              style={{
                height: g.pill,
                top: r2(b.at.y - g.pill / 2),
                [mirror ? "right" : "left"]: r2(b.at.x + 2),
                maxWidth: `calc(100% - ${r2(b.at.x + 6)}px)`,
                originX: mirror ? 1 : 0,
                originY: 0.5,
              }}
            >
              <button
                ref={(node) => {
                  if (node) itemRefs.current.set(item.id, node);
                  else itemRefs.current.delete(item.id);
                }}
                type="button"
                role="menuitem"
                tabIndex={active === i ? 0 : -1}
                aria-disabled={item.disabled || undefined}
                data-hot={isHot || undefined}
                onClick={() => choose(i)}
                onPointerEnter={() => {
                  if (!item.disabled) setHot(i);
                }}
                onPointerLeave={() => setHot((h) => (h === i ? null : h))}
                onFocus={() => {
                  setActive(i);
                  setHot(i);
                }}
                className={cn(
                  "flex h-full min-w-0 items-center gap-2 rounded-full border px-3 font-medium whitespace-nowrap",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  "border-hairline-strong bg-popover text-foreground transition-colors duration-150",
                  "data-[hot]:bg-surface-2",
                  "aria-disabled:cursor-not-allowed aria-disabled:text-ink-3",
                  g.text,
                )}
              >
                {item.icon ? (
                  <span
                    aria-hidden
                    className={cn(
                      "flex shrink-0 items-center justify-center",
                      g.icon,
                      isHot ? "text-cobalt-bright" : "text-ink-3",
                    )}
                  >
                    {item.icon}
                  </span>
                ) : null}
                <span className="min-w-0 truncate" title={item.label}>
                  {item.label}
                </span>
                {item.hint ? (
                  <span className="shrink-0 font-mono text-[10px] text-ink-3">
                    {item.hint}
                  </span>
                ) : null}
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
