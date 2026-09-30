"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BlindMenuItem = {
  id: string;
  label: string;
  /** 16px, drawn in currentColor. */
  icon?: React.ReactNode;
  /** A key hint at the slat's end, e.g. "⌘," — shown only. */
  shortcut?: string;
  /** A destructive item is drawn in the danger colour. @default "default" */
  tone?: "default" | "danger";
  disabled?: boolean;
};

export type BlindMenuFinish = "wood" | "aluminium" | "fabric";

export type BlindMenuProps = {
  items: BlindMenuItem[];
  /** An item was chosen. Fires before the blind goes up. */
  onSelect?: (id: string) => void;
  /** The account's name: the trigger's text and the menu's name. */
  label: string;
  /** A second line under the name: an email, a plan, a role. */
  detail?: string;
  /** Before the name, 28px. @default the name's initials in a circle */
  avatar?: React.ReactNode;
  /** Controlled: whether the blind is down. */
  open?: boolean;
  /** Whether the blind starts down when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, key or outside press that opened or closed it. */
  onOpenChange?: (open: boolean) => void;
  /** The most slats the blind lowers, 4 to 8; a longer menu scrolls inside it. @default 5 */
  slats?: number;
  /** How far apart the slats turn open, 0 (all at once) to 1 (a slow wave). @default 0.5 */
  stagger?: number;
  /** What the slats are made of. @default "aluminium" */
  finish?: BlindMenuFinish;
  /** Which edge of the trigger the blind hangs from. @default "end" */
  align?: "start" | "end";
  /** Play the blind and the choice. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const HEADRAIL = 8;
const PITCH = 28;
const SLAT = 26;
const BOTTOM = 6;
/** How far a closed slat is turned: nearly edge-on, a thin bar. */
const SHUT = 78;
/** A hovered or focused slat, turned toward you. */
const LEAN = -12;
/** Each slat's thickness when the blind is drawn up into a stack. */
const STACKED = 3;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Finish = {
  face: (seed: number) => React.CSSProperties;
  ink: string;
  danger: string;
  rail: string;
  railEdge: string;
  tape: string;
};

// Wood and aluminium are pigments: a fixed lightness on a token's hue, so a
// slat is the same slat on a light page and a dark one. Fabric is the menu's
// own surface and follows the theme.
const FINISHES: Record<BlindMenuFinish, Finish> = {
  aluminium: {
    face: () => ({
      background:
        "linear-gradient(180deg, oklch(from var(--ink-3) 0.985 0.004 h) 0%, oklch(from var(--ink-3) 0.935 0.008 h) 46%, oklch(from var(--ink-3) 0.85 0.012 h) 100%)",
      boxShadow:
        "inset 0 1px 0 color-mix(in oklab, white 75%, transparent), inset 0 -1px 0 oklch(from var(--ink-3) 0.72 0.014 h)",
    }),
    ink: "oklch(from var(--ink) 0.26 0.02 h)",
    danger: "oklch(from var(--danger) 0.48 0.19 h)",
    rail: "oklch(from var(--ink-3) 0.8 0.01 h)",
    railEdge: "oklch(from var(--ink-3) 0.6 0.014 h)",
    tape: "oklch(from var(--ink-3) 0.66 0.012 h)",
  },
  wood: {
    face: (seed) => ({
      background: `repeating-linear-gradient(93deg, transparent 0 7px, oklch(from var(--warn) 0.5 0.07 calc(h - 26) / 0.12) 7px 8px, transparent 8px 19px, oklch(from var(--warn) 0.5 0.07 calc(h - 26) / 0.08) 19px 21px, transparent 21px 31px) ${seed % 31}px 0 / auto, linear-gradient(180deg, oklch(from var(--warn) 0.84 0.06 calc(h - 20)), oklch(from var(--warn) 0.74 0.075 calc(h - 26)))`,
      boxShadow:
        "inset 0 1px 0 oklch(from var(--warn) 0.92 0.04 calc(h - 20) / 0.7), inset 0 -1px 0 oklch(from var(--warn) 0.52 0.07 calc(h - 26) / 0.55)",
    }),
    ink: "oklch(from var(--warn) 0.28 0.04 calc(h - 26))",
    danger: "oklch(from var(--danger) 0.45 0.18 h)",
    rail: "oklch(from var(--warn) 0.62 0.08 calc(h - 26))",
    railEdge: "oklch(from var(--warn) 0.45 0.07 calc(h - 26))",
    tape: "oklch(from var(--warn) 0.5 0.05 calc(h - 26))",
  },
  fabric: {
    face: () => ({
      background:
        "repeating-linear-gradient(0deg, color-mix(in oklab, var(--ink-3) 8%, transparent) 0 1px, transparent 1px 2.5px), repeating-linear-gradient(90deg, color-mix(in oklab, var(--ink-3) 5%, transparent) 0 1px, transparent 1px 3px), linear-gradient(180deg, color-mix(in oklab, var(--popover) 93%, var(--ink-3)), color-mix(in oklab, var(--popover) 84%, var(--ink-3)))",
      boxShadow:
        "inset 0 0 0 1px var(--hairline), inset 0 -1px 0 var(--hairline-strong)",
    }),
    ink: "var(--foreground)",
    danger: "var(--danger)",
    rail: "color-mix(in oklab, var(--popover) 90%, var(--ink-3))",
    railEdge: "color-mix(in oklab, var(--popover) 55%, var(--ink-3))",
    tape: "var(--hairline-strong)",
  },
};

type Phase = "closed" | "opening" | "open" | "closing";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.charAt(0) ?? "";
  const b = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return (a + b).toUpperCase();
}

type SlatProps = {
  item: BlindMenuItem;
  index: number;
  active: boolean;
  tabbable: boolean;
  phase: Phase;
  openDelay: number;
  closeDelay: number;
  stackY: number;
  motionSafe: boolean;
  finish: Finish;
  bind: (id: string, node: HTMLDivElement | null) => void;
  onChoose: (index: number) => void;
  onHover: (index: number) => void;
};

/**
 * One slat, one item. Its turn is two angles added together: the blind's
 * (shut while it lowers, open once it is down, shut again as it is drawn up)
 * and its own lean when it is the one under the pointer or the focus.
 */
function Slat({
  item,
  index,
  active,
  tabbable,
  phase,
  openDelay,
  closeDelay,
  stackY,
  motionSafe,
  finish,
  bind,
  onChoose,
  onHover,
}: SlatProps) {
  // Mounted mid-lowering it starts shut; mounted down, it starts open. Never
  // an `initial` prop: an effect re-run would put it back.
  const tilt = useMotionValue(phase === "opening" && motionSafe ? SHUT : 0);
  const lean = useMotionValue(0);
  const y = useMotionValue(0);

  React.useEffect(() => {
    if (phase === "opening") {
      if (!motionSafe) {
        tilt.set(0);
        return;
      }
      tilt.set(SHUT);
      y.set(0);
      const c = animate(tilt, 0, { ...springs.snap, delay: openDelay });
      return () => c.stop();
    }
    if (phase === "closing" && motionSafe) {
      // Drawn up: exits never spring.
      const a = animate(tilt, 80, {
        duration: durations.fast,
        ease: easings.exit,
        delay: closeDelay,
      });
      const b = animate(y, stackY, {
        duration: durations.base,
        ease: easings.exit,
        delay: closeDelay,
      });
      return () => {
        a.stop();
        b.stop();
      };
    }
    // Down: whatever the lowering left unfinished finishes, from where it is
    // and at the speed it had, rather than freezing where the phase changed.
    y.set(0);
    if (tilt.get() === 0) return;
    const c = animate(tilt, 0, motionSafe ? springs.snap : { duration: 0 });
    return () => c.stop();
    // Only the blind's phase moves it; the delays are read as it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, motionSafe]);

  React.useEffect(() => {
    const to = active && motionSafe && phase !== "closing" ? LEAN : 0;
    const c = animate(lean, to, motionSafe ? springs.snap : { duration: 0 });
    return () => c.stop();
  }, [active, motionSafe, phase, lean]);

  const rotateX = useTransform(
    [tilt, lean] as MotionValue<number>[],
    ([t = 0, l = 0]: number[]) => r2(t + l),
  );
  const z = useTransform(lean, (l) => r2(-l * 0.5));
  // A slat turned from the light goes dark; one leaning in catches it.
  const shade = useTransform(tilt, (t) =>
    r3(0.34 * Math.sin((Math.min(90, Math.max(0, t)) * Math.PI) / 180)),
  );
  const sheen = useTransform(lean, (l) => r3(Math.min(1, -l / Math.abs(LEAN))));

  const danger = item.tone === "danger";
  const face = React.useMemo(
    () => finish.face(index * 37 + 11),
    [finish, index],
  );

  return (
    <motion.div
      ref={(node: HTMLDivElement | null) => bind(item.id, node)}
      role="menuitem"
      tabIndex={tabbable ? 0 : -1}
      aria-disabled={item.disabled || undefined}
      data-slat={index}
      onClick={() => onChoose(index)}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") onHover(index);
      }}
      className={cn(
        "relative flex snap-start items-center gap-2.5 rounded-[3px] px-3 text-[13px] outline-none select-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        item.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
      style={{
        height: SLAT,
        marginBottom: PITCH - SLAT,
        color: danger ? finish.danger : finish.ink,
        rotateX,
        z,
        y,
        transformPerspective: 480,
        ...face,
      }}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          opacity: shade,
          background: "color-mix(in oklab, black 70%, transparent)",
        }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          opacity: sheen,
          background:
            "linear-gradient(180deg, color-mix(in oklab, white 38%, transparent), transparent 60%)",
        }}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-150",
          danger ? "bg-danger/12" : "bg-cobalt-wash",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      {item.icon ? (
        <span
          aria-hidden
          className="relative flex size-4 shrink-0 items-center justify-center"
        >
          {item.icon}
        </span>
      ) : null}
      <span className="relative min-w-0 flex-1 truncate" title={item.label}>
        {item.label}
      </span>
      {item.shortcut ? (
        <span
          aria-hidden
          className="relative shrink-0 font-mono text-[10px] opacity-60"
        >
          {item.shortcut}
        </span>
      ) : null}
    </motion.div>
  );
}

type BlindProps = {
  id: string;
  labelledBy: string;
  items: BlindMenuItem[];
  phase: Phase;
  visible: number;
  interval: number;
  active: number;
  tabbable: number;
  motionSafe: boolean;
  finish: Finish;
  align: "start" | "end";
  stackFrom: number;
  bindMenu: (node: HTMLDivElement | null) => void;
  bindItem: (id: string, node: HTMLDivElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onChoose: (index: number) => void;
  onHover: (index: number) => void;
  onLeave: () => void;
  onScrolled: (top: number) => void;
};

/** The blind itself: headrail, the slats on their ladder tapes, the bottom rail and the cord. */
function Blind({
  id,
  labelledBy,
  items,
  phase,
  visible,
  interval,
  active,
  tabbable,
  motionSafe,
  finish,
  align,
  stackFrom,
  bindMenu,
  bindItem,
  onKeyDown,
  onChoose,
  onHover,
  onLeave,
  onScrolled,
}: BlindProps) {
  const full = visible * PITCH;
  const lowering = phase === "opening" && motionSafe;
  const height = useMotionValue(lowering ? 0 : full);
  const alpha = useMotionValue(phase === "opening" && !motionSafe ? 0 : 1);
  const cord = useMotionValue(0);
  const [more, setMore] = React.useState(items.length > visible);

  React.useEffect(() => {
    if (phase === "opening") {
      if (!motionSafe) {
        height.set(full);
        alpha.set(0);
        const c = animate(alpha, 1, {
          duration: durations.fast,
          ease: easings.enter,
        });
        return () => c.stop();
      }
      height.set(0);
      alpha.set(1);
      const a = animate(height, full, springs.glide);
      cord.set(7);
      const b = animate(cord, 0, { ...springs.recoil, delay: 0.08 });
      return () => {
        a.stop();
        b.stop();
      };
    }
    if (phase === "closing") {
      if (!motionSafe) {
        const c = animate(alpha, 0, {
          duration: durations.fast,
          ease: easings.exit,
        });
        return () => c.stop();
      }
      const stack = Math.min(visible, items.length) * STACKED + 2;
      const a = animate(height, stack, {
        duration: durations.base,
        ease: easings.exit,
        delay: 0.04,
      });
      const b = animate(alpha, 0, {
        duration: durations.fast,
        ease: easings.exit,
        delay: durations.base,
      });
      return () => {
        a.stop();
        b.stop();
      };
    }
    // Down: the lowering finishes rather than freezing where the phase changed.
    if (!motionSafe) {
      height.set(full);
      alpha.set(1);
      cord.set(0);
      return;
    }
    const a = animate(height, full, springs.glide);
    const b = animate(alpha, 1, { duration: durations.fast });
    const c = animate(cord, 0, springs.recoil);
    return () => {
      a.stop();
      b.stop();
      c.stop();
    };
    // Only the phase moves the blind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, motionSafe]);

  // A blind that changes length while down glides to it.
  React.useEffect(() => {
    if (phase !== "open") return;
    if (!motionSafe) {
      height.set(full);
      return;
    }
    const c = animate(height, full, springs.glide);
    return () => c.stop();
    // Only a new length, not the phase change that already set it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  const cordHeight = useTransform(height, (h) => r2(h + 4));
  const n = items.length;

  return (
    <motion.div
      className={cn(
        "absolute top-full z-30 mt-1.5 w-56 max-w-[calc(100vw-2rem)]",
        align === "end" ? "right-0" : "left-0",
        phase === "closing" && "pointer-events-none",
      )}
      style={{ opacity: alpha }}
    >
      <div
        aria-hidden
        className="relative z-10 rounded-t-[3px] rounded-b-[2px]"
        style={{
          height: HEADRAIL,
          background: finish.rail,
          boxShadow: `inset 0 -1.5px 0 ${finish.railEdge}, 0 1px 2px color-mix(in oklab, black 18%, transparent)`,
        }}
      />
      <motion.div
        ref={bindMenu}
        id={id}
        role="menu"
        tabIndex={-1}
        aria-labelledby={labelledBy}
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") onLeave();
        }}
        onScroll={(event) => {
          const el = event.currentTarget;
          onScrolled(el.scrollTop);
          setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
        }}
        className={cn(
          "relative snap-y snap-mandatory overflow-x-clip overflow-y-auto overscroll-contain pr-2.5 pl-1 outline-none",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          motionSafe && "scroll-smooth",
        )}
        style={{
          height,
          // The window behind the blind: the page shows through the gaps,
          // dimmed, as a room does through slats.
          background: "color-mix(in oklab, var(--background) 82%, transparent)",
        }}
      >
        <div className="relative" style={{ height: n * PITCH }}>
          {/* The ladder tapes the slats hang on, seen in the gaps. */}
          {[0.2, 0.8].map((at) => (
            <span
              key={at}
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-[1.5px]"
              style={{ left: `${at * 100}%`, background: finish.tape }}
            />
          ))}
          {items.map((item, i) => (
            <Slat
              key={item.id}
              item={item}
              index={i}
              active={active === i}
              tabbable={tabbable === i}
              phase={phase}
              openDelay={r3(0.04 + Math.max(0, i - stackFrom) * interval)}
              closeDelay={r3(
                Math.max(0, stackFrom + visible - 1 - i) * interval * 0.35,
              )}
              stackY={r2(
                -(i - stackFrom) * PITCH +
                  clamp(i - stackFrom, 0, visible - 1) * STACKED,
              )}
              motionSafe={motionSafe}
              finish={finish}
              bind={bindItem}
              onChoose={onChoose}
              onHover={onHover}
            />
          ))}
        </div>
      </motion.div>
      <div
        aria-hidden
        className="relative z-10 flex items-center justify-center rounded-[2px]"
        style={{
          height: BOTTOM,
          background: finish.rail,
          boxShadow: `inset 0 -1px 0 ${finish.railEdge}, 0 1px 2px color-mix(in oklab, black 22%, transparent)`,
        }}
      >
        {more ? (
          <svg width={8} height={4} viewBox="0 0 8 4" className="block">
            <path
              d="M 1 0.5 L 4 3.2 L 7 0.5"
              fill="none"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ stroke: finish.railEdge }}
            />
          </svg>
        ) : null}
      </div>
      {/* The tilt cord, hanging at the right end; it swings when the blind drops. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-[4.5px] z-20 w-[1.5px]"
        style={{
          top: HEADRAIL - 2,
          height: cordHeight,
          background: finish.railEdge,
          rotate: cord,
          originX: 0.5,
          originY: 0,
        }}
      >
        <span
          className="absolute -bottom-1.5 left-1/2 h-2 w-1.5 -translate-x-1/2 rounded-full"
          style={{
            background: finish.rail,
            boxShadow: `inset 0 0 0 1px ${finish.railEdge}`,
          }}
        />
      </motion.div>
    </motion.div>
  );
}

type Api = { enter: () => void; dismiss: () => void };

/**
 * An account menu that hangs from its button like a window blind. Opened, a
 * headrail appears under the account chip and the blind lowers: its frame
 * grows to length on the glide spring while each slat — one item each — turns
 * from nearly edge-on to face you on snap, from the top down, `stagger` apart.
 * The slats hang on two ladder tapes, seen in the gaps, and a tilt cord swings
 * at the end as the blind drops. The slat under the pointer, or in focus,
 * leans toward you and catches the light. Closing draws the blind back up:
 * the slats turn shut from the bottom and rise into a stack under the
 * headrail on exit tweens, never a spring. Longer menus scroll inside the
 * blind, a slat at a time.
 *
 * It is the menu-button pattern: the trigger opens a `role="menu"` of
 * `menuitem`s with a roving tabindex; arrows move and wrap, Home and End
 * jump, typing jumps to an item, Enter or Space chooses, Escape closes and
 * hands focus back to the trigger, and Tab or a press outside closes it.
 * Under reduced motion the blind fades in and out and a focused slat changes
 * shade instead of leaning.
 */
export function BlindMenu({
  items,
  onSelect,
  label,
  detail,
  avatar,
  open,
  defaultOpen = false,
  onOpenChange,
  slats = 5,
  stagger = 0.5,
  finish = "aluminium",
  align = "end",
  sound = false,
  disabled = false,
  className,
}: BlindMenuProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const triggerId = `${uid}-trigger`;
  const menuId = `${uid}-menu`;
  const look = FINISHES[finish] ?? FINISHES.aluminium;
  const n = items.length;
  const visible = Math.max(1, Math.min(n, clamp(Math.round(slats), 4, 8)));
  const st = clamp(stagger, 0, 1);
  // Scaled by the tweak, never past the choreography budget.
  const interval =
    visible > 1 ? Math.min(cascade(visible) * 2 * st, 0.6 / (visible - 1)) : 0;

  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = open ?? own;
  const [seen, setSeen] = React.useState(isOpen);
  const [phase, setPhase] = React.useState<Phase>(isOpen ? "open" : "closed");
  if (seen !== isOpen) {
    setSeen(isOpen);
    setPhase(isOpen ? "opening" : phase === "closed" ? "closed" : "closing");
  }

  const [active, setActive] = React.useState(-1);
  const [via, setVia] = React.useState<"pointer" | "first" | "last">("pointer");
  const [menuNode, setMenuNode] = React.useState<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const itemNodes = React.useRef(new Map<string, HTMLDivElement>());
  const typed = React.useRef({ text: "", at: 0 });
  const heard = React.useRef(false);
  /** The visitor opened it: focus goes in when the menu arrives. */
  const invited = React.useRef(false);
  const api = React.useRef<Api | null>(null);

  const enabled = (i: number) => Boolean(items[i] && !items[i]?.disabled);
  const firstEnabled = () => items.findIndex((it) => !it.disabled);
  const lastEnabled = () => {
    for (let i = n - 1; i >= 0; i -= 1) if (enabled(i)) return i;
    return -1;
  };

  const setOpen = (next: boolean, withSound: boolean) => {
    if (next === isOpen) return;
    heard.current = withSound;
    invited.current = next && withSound;
    if (open === undefined) setOwn(next);
    onOpenChange?.(next);
  };

  /** Moves the highlight, and focus with it, keeping the slat in view. */
  const highlight = (i: number, focus: boolean) => {
    setActive(i);
    const item = items[i];
    const node = item ? itemNodes.current.get(item.id) : undefined;
    if (!node) return;
    if (focus) node.focus({ preventScroll: true });
    const frame = menuRef.current;
    if (!frame) return;
    const top = node.offsetTop;
    const bottom = top + SLAT;
    if (top < frame.scrollTop) frame.scrollTop = top;
    else if (bottom > frame.scrollTop + frame.clientHeight) {
      frame.scrollTop = bottom - frame.clientHeight + (PITCH - SLAT);
    }
  };

  const close = (focusTrigger: boolean, withSound = true) => {
    setOpen(false, withSound);
    setActive(-1);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const choose = (i: number) => {
    const item = items[i];
    if (!item || item.disabled) return;
    audio.play("click", {
      gain: 0.55,
      pitch: item.tone === "danger" ? 0.85 : 1,
    });
    onSelect?.(item.id);
    close(true);
  };

  const step = (from: number, dir: 1 | -1) => {
    for (let s = 1; s <= n; s += 1) {
      const i = (((from + dir * s) % n) + n) % n;
      if (enabled(i)) return i;
    }
    return -1;
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const i = step(active === -1 ? -1 : active, 1);
        if (i !== -1) highlight(i, true);
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        const i = step(active === -1 ? n : active, -1);
        if (i !== -1) highlight(i, true);
        return;
      }
      case "Home": {
        event.preventDefault();
        const i = firstEnabled();
        if (i !== -1) highlight(i, true);
        return;
      }
      case "End": {
        event.preventDefault();
        const i = lastEnabled();
        if (i !== -1) highlight(i, true);
        return;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        if (active !== -1) choose(active);
        return;
      case "Escape":
        // Handled where focus is: the page must not also see it.
        event.preventDefault();
        close(true);
        return;
      case "Tab":
        close(false);
        return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = event.timeStamp;
      const t = typed.current;
      t.text =
        now - t.at > 600
          ? event.key.toLowerCase()
          : t.text + event.key.toLowerCase();
      t.at = now;
      const start = active === -1 ? 0 : t.text.length > 1 ? active : active + 1;
      for (let s = 0; s < n; s += 1) {
        const i = (start + s) % n;
        if (enabled(i) && items[i]?.label.toLowerCase().startsWith(t.text)) {
          event.preventDefault();
          highlight(i, true);
          return;
        }
      }
    }
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const last = event.key === "ArrowUp";
      setVia(last ? "last" : "first");
      if (isOpen) {
        const i = last ? lastEnabled() : firstEnabled();
        if (i !== -1) highlight(i, true);
        return;
      }
      setOpen(true, true);
    }
  };

  // Phases the blind moves through on its own clock, once it has started.
  React.useEffect(() => {
    if (phase === "opening") {
      if (heard.current) audio.play("swish", { pitch: 1.05, gain: 0.45 });
      const done = window.setTimeout(
        () => setPhase((p) => (p === "opening" ? "open" : p)),
        Math.round(
          1000 *
            (motionSafe ? 0.36 + interval * (visible - 1) : durations.fast),
        ),
      );
      return () => window.clearTimeout(done);
    }
    if (phase === "closing") {
      // Going up is the same sound pitched down, a little quieter.
      if (heard.current) audio.play("swish", { pitch: 0.78, gain: 0.34 });
      const total = motionSafe
        ? durations.base + durations.fast + 0.06
        : durations.fast;
      const done = window.setTimeout(
        () => {
          setPhase((p) => (p === "closing" ? "closed" : p));
          heard.current = false;
        },
        Math.round(1000 * total),
      );
      return () => window.clearTimeout(done);
    }
    // The sounds and delays are read as the phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Focus goes into the menu when its node arrives: onto an item for the
  // keyboard, onto the menu itself for a pointer, which has not chosen yet.
  React.useEffect(() => {
    api.current = {
      enter: () => {
        if (!menuNode || !isOpen || !invited.current) return;
        invited.current = false;
        if (via === "pointer") {
          menuNode.focus({ preventScroll: true });
          return;
        }
        const i = via === "last" ? lastEnabled() : firstEnabled();
        if (i !== -1) highlight(i, true);
      },
      dismiss: () => {
        setOpen(false, true);
        setActive(-1);
      },
    };
  });
  const arrivedOpen = menuNode !== null && isOpen && phase === "opening";
  React.useEffect(() => {
    if (arrivedOpen) api.current?.enter();
  }, [arrivedOpen, menuNode]);

  // A press anywhere else draws the blind up.
  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (
        !root ||
        (event.target instanceof Node && root.contains(event.target))
      ) {
        return;
      }
      api.current?.dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  const bindMenu = React.useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
    setMenuNode(node);
  }, []);

  const bindItem = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) itemNodes.current.set(id, node);
      else itemNodes.current.delete(id);
    },
    [],
  );

  const stackFrom = Math.min(
    Math.floor(scrollTop / PITCH),
    Math.max(0, n - visible),
  );
  const tabbable = active !== -1 ? active : firstEnabled();
  const chevron = useMotionValue(isOpen ? 180 : 0);
  React.useEffect(() => {
    const c = animate(
      chevron,
      isOpen ? 180 : 0,
      motionSafe ? springs.snap : { duration: 0 },
    );
    return () => c.stop();
  }, [isOpen, motionSafe, chevron]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative inline-flex",
        disabled && "opacity-50",
        className,
      )}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={phase !== "closed" ? menuId : undefined}
        disabled={disabled}
        onClick={(event) => {
          if (isOpen) {
            close(false);
            return;
          }
          setVia(event.detail === 0 ? "first" : "pointer");
          setOpen(true, true);
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex h-11 max-w-full items-center gap-2.5 rounded-3 border border-hairline bg-card pr-2.5 pl-1.5 text-left transition-colors outline-none",
          "hover:border-hairline-strong hover:bg-surface-2",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed",
          isOpen && "border-hairline-strong bg-surface-2",
        )}
      >
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cobalt-wash text-[11px] font-semibold text-cobalt-bright"
        >
          {avatar ?? initialsOf(label)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm leading-tight font-medium text-foreground">
            {label}
          </span>
          {detail ? (
            <span className="truncate text-xs leading-tight text-ink-3">
              {detail}
            </span>
          ) : null}
        </span>
        <motion.svg
          aria-hidden
          width={12}
          height={12}
          viewBox="0 0 12 12"
          className="ml-auto block shrink-0 text-ink-3"
          style={{ rotate: chevron, originX: 0.5, originY: 0.5 }}
        >
          <path
            d="M 3 4.5 L 6 7.5 L 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </button>

      {phase !== "closed" ? (
        <Blind
          id={menuId}
          labelledBy={triggerId}
          items={items}
          phase={phase}
          visible={visible}
          interval={interval}
          active={active}
          tabbable={tabbable}
          motionSafe={motionSafe}
          finish={look}
          align={align}
          stackFrom={stackFrom}
          bindMenu={bindMenu}
          bindItem={bindItem}
          onKeyDown={onMenuKeyDown}
          onChoose={choose}
          onHover={(i) => {
            if (!enabled(i) || i === active) return;
            highlight(i, Boolean(menuNode?.contains(document.activeElement)));
          }}
          onLeave={() => {
            if (!menuNode?.contains(document.activeElement)) setActive(-1);
          }}
          onScrolled={setScrollTop}
        />
      ) : null}
    </div>
  );
}
