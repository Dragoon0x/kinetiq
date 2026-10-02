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
import { ArrowLeft, Bookmark, Download, Ellipsis, Share2 } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CollapseHeaderAction = {
  /** Unique: what onAction reports. */
  id: string;
  /** One or two words; the button's text and name. */
  label: string;
  /** 16px, drawn in currentColor. */
  icon?: React.ReactNode;
};

export type CollapseHeaderDock = "start" | "center";
export type CollapseHeaderSize = "sm" | "md" | "lg";

export type CollapseHeaderProps = {
  /** The heading that docks in the toolbar. @default "Basin Road survey" */
  title?: string;
  /** The line under the title; it scrolls away with the page. */
  subtitle?: string;
  /** A small label above the title. */
  eyebrow?: string;
  /** Fills the cover. @default a procedural ridge drawing in the accent */
  cover?: React.ReactNode;
  /** The row of actions under the title; they fold into the overflow menu as the header collapses. @default defaultHeaderActions */
  actions?: CollapseHeaderAction[];
  /** An action pressed, inline or from the overflow menu. */
  onAction?: (id: string) => void;
  /** The back button. Without it the button is still drawn, for the docked title to sit beside. */
  onBack?: () => void;
  /** The back button's name. @default "Back" */
  backLabel?: string;
  /** The overflow button's name. @default "More actions" */
  overflowLabel?: string;
  /** Fires from the scroll that docked the title (true) or re-expanded the header at the top (false). */
  onDockChange?: (docked: boolean) => void;
  /** How much slower than the page the cover moves, 0 to 1: 0 scrolls with the page, 1 stays put behind it. @default 0.5 */
  parallax?: number;
  /** Where the title docks in the toolbar: beside the back button, or centred. @default "start" */
  dock?: CollapseHeaderDock;
  /** How far through its travel (0.3 to 1) the title lets go of the scroll and docks by itself; 1 never lets go early. @default 0.6 */
  threshold?: number;
  /** The cover's height, px; a fifth taller when the header is 560px wide or more. @default 168 */
  coverHeight?: number;
  /** The container's height: px or any CSS length. It scrolls inside itself. @default 520 */
  height?: number | string;
  /** The large title: 24, 28 or 34 px. @default "md" */
  size?: CollapseHeaderSize;
  /** The cover drawing and the docked toolbar's rule; any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The page under the header. */
  children?: React.ReactNode;
  /** Play the swish as the title docks and as the header re-expands. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

const ICON = "size-4";

/** Whether the page has had the press or key that lets audio start. */
const activated = () =>
  typeof navigator === "undefined" ||
  !("userActivation" in navigator) ||
  navigator.userActivation.hasBeenActive;

export const defaultHeaderActions: CollapseHeaderAction[] = [
  { id: "save", label: "Save", icon: <Bookmark className={ICON} /> },
  { id: "share", label: "Share", icon: <Share2 className={ICON} /> },
  { id: "download", label: "Download", icon: <Download className={ICON} /> },
];

/* --------------------------------- cover --------------------------------- */

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** A ridge line from a few seeded sines: the same hills on every render. */
function ridge(seed: number, base: number, amp: number): string {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const waves = [0, 1, 2].map((i) => ({
    f: (0.008 + next() * 0.012) * (i + 1),
    p: next() * Math.PI * 2,
    a: amp / (i + 1.4),
  }));
  const pts: string[] = [];
  for (let x = 0; x <= 400; x += 10) {
    const y =
      base + waves.reduce((sum, w) => sum + w.a * Math.sin(w.f * x + w.p), 0);
    pts.push(`${x} ${r1(y)}`);
  }
  return `M0 200 L${pts.join(" L")} L400 200 Z`;
}

const RIDGES = [
  { d: ridge(11, 92, 22), mix: 34 },
  { d: ridge(23, 118, 18), mix: 52 },
  { d: ridge(37, 142, 14), mix: 70 },
  { d: ridge(41, 166, 10), mix: 86 },
];
const CONTOURS = [ridge(53, 128, 9), ridge(61, 150, 7), ridge(67, 176, 5)].map(
  (d) => d.replace(/^M0 200 L/, "M").replace(/ L400 200 Z$/, ""),
);

/** Survey country at dusk, drawn in the accent and mixed toward the page. */
function DefaultCover({ id }: { id: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0"
            style={{
              stopColor:
                "color-mix(in oklab, var(--collapse-header-accent) 42%, var(--background))",
            }}
          />
          <stop
            offset="1"
            style={{
              stopColor:
                "color-mix(in oklab, var(--collapse-header-accent) 12%, var(--background))",
            }}
          />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill={`url(#${id})`} />
      <circle
        cx="292"
        cy="70"
        r="26"
        style={{
          fill: "color-mix(in oklab, var(--collapse-header-accent) 18%, white)",
          opacity: 0.55,
        }}
      />
      {RIDGES.map((r, i) => (
        <path
          key={i}
          d={r.d}
          style={{
            fill: `color-mix(in oklab, var(--collapse-header-accent) ${100 - r.mix}%, var(--background))`,
          }}
        />
      ))}
      {CONTOURS.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          strokeWidth="0.8"
          strokeDasharray="3 3"
          style={{
            stroke:
              "color-mix(in oklab, var(--collapse-header-accent) 45%, var(--foreground))",
            opacity: 0.35,
          }}
        />
      ))}
    </svg>
  );
}

/* --------------------------------- pieces -------------------------------- */

const SIZES: Record<CollapseHeaderSize, number> = { sm: 24, md: 28, lg: 34 };
/** The docked title's type size, px. */
const DOCKED = 17;
const TOOLBAR = 52;
const LEADING = 1.18;
/** How far above the toolbar the actions start to fold, px. */
const FOLD = 44;
/** How far something at `top` in the page has folded into the bar, 0 to 1. */
const foldOf = (top: number, scroll: number) =>
  clamp01((TOOLBAR + FOLD - (top - scroll)) / FOLD);

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

type ActionButtonProps = {
  action: CollapseHeaderAction;
  index: number;
  count: number;
  /** The page's scroll, px. */
  scrollY: MotionValue<number>;
  /** Where this button sits in the page: its top, and how far right it is (0 to 1). */
  place: { top: number; across: number } | null;
  motionSafe: boolean;
  folded: boolean;
  bind: (node: HTMLButtonElement | null) => void;
  onPress: () => void;
};

/**
 * One inline action. It folds as its row slides up under the toolbar, over
 * its own slice of that travel — the right-most first — moving up and right
 * toward the overflow button as it shrinks and fades.
 */
function ActionButton({
  action,
  index,
  count,
  scrollY,
  place,
  motionSafe,
  folded,
  bind,
  onPress,
}: ActionButtonProps) {
  // The right-most folds first, as each slides up to meet the bar.
  const start = place
    ? 0.3 * (1 - place.across)
    : count > 1
      ? (0.3 * (count - 1 - index)) / (count - 1)
      : 0;
  const fold = useTransform(scrollY, (sy) =>
    place ? smooth(start, start + 0.6, foldOf(place.top, sy)) : 0,
  );
  const opacity = useTransform(fold, (f) => r2(1 - f));
  const scale = useTransform(fold, (f) => (motionSafe ? r2(1 - 0.4 * f) : 1));
  const x = useTransform(fold, (f) => (motionSafe ? r1(14 * f) : 0));
  const y = useTransform(fold, (f) => (motionSafe ? r1(-10 * f) : 0));
  return (
    <motion.button
      ref={bind}
      type="button"
      onClick={onPress}
      inert={folded}
      aria-hidden={folded || undefined}
      style={{ opacity, scale, x, y, originX: 1, originY: 0.5 }}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-card px-2.5 text-[12px] text-foreground transition-colors",
        "hover:bg-surface-2",
        FOCUS_RING,
      )}
    >
      {action.icon ? (
        <span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center text-ink-2"
        >
          {action.icon}
        </span>
      ) : null}
      {action.label}
    </motion.button>
  );
}

/* ------------------------------- component ------------------------------- */

type Box = {
  /** The title placeholder, in the page's own coordinates. */
  top: number;
  left: number;
  width: number;
  /** Each action's top and place across its row, in the page's own coordinates. */
  places: { top: number; across: number }[];
  /** The title on one line, unscaled. */
  natural: number;
  /** The scroll area's width, without its scrollbar. */
  view: number;
};

/**
 * A scroll container with a large header that collapses as you scroll. The
 * title is one heading that floats over the page: while you scroll it moves
 * 1:1 with the page toward the toolbar, easing across to its docked place
 * beside the back button (or centred) and down to toolbar size, while the
 * cover parallaxes behind and fades and the actions fold, right-most first,
 * into the overflow button. Past `threshold` it lets go of the scroll and
 * docks by itself on the snap spring. Docked, the header stays compact however
 * you scroll — until you come back to the very top, where it re-expands on
 * the glide spring: the title sinks back into its place and the actions
 * unfold.
 *
 * The scroll area is a focusable region, so arrow keys, Page keys, Space,
 * Home and End reach the same states as a finger; the overflow button is a
 * menu button whose menu holds the folded actions, and focus follows an
 * action into the menu as it folds and back out as it unfolds. Under reduced
 * motion nothing flies or parallaxes: the title scrolls with the page and a
 * docked copy cross-fades into the toolbar, and the actions cross-fade with
 * the overflow button.
 */
export function CollapseHeader({
  title = "Basin Road survey",
  subtitle,
  eyebrow,
  cover,
  actions = defaultHeaderActions,
  onAction,
  onBack,
  backLabel = "Back",
  overflowLabel = "More actions",
  onDockChange,
  parallax = 0.5,
  dock = "start",
  threshold = 0.6,
  coverHeight = 168,
  height = 520,
  size = "md",
  accent = "var(--accent-bright)",
  children,
  sound = false,
  className,
}: CollapseHeaderProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const gradientId = `${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-sky`;
  const titleId = `${uid}-title`;
  const menuId = `${uid}-menu`;
  const fontSize = SIZES[size] ?? SIZES.md;
  const lineHeight = Math.round(fontSize * LEADING);
  const s = DOCKED / fontSize;
  const lag = clamp01(parallax);
  const letGo = Math.min(1, Math.max(0.3, threshold));

  const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);
  const [slot, setSlot] = React.useState<HTMLDivElement | null>(null);
  const [meter, setMeter] = React.useState<HTMLSpanElement | null>(null);
  const [row, setRow] = React.useState<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<Box | null>(null);
  const [docked, setDocked] = React.useState(false);
  const [folded, setFolded] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [menuActive, setMenuActive] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const scrollY = useMotionValue(0);
  const dockP = useMotionValue(0);
  const fade = useMotionValue(0);

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const dockedRef = React.useRef(false);
  const foldedRef = React.useRef(false);
  const actionNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const overflowRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const latest = React.useRef<{ onScroll: () => void } | null>(null);

  /* ------------------------------ measuring ------------------------------ */

  React.useEffect(() => {
    if (!scroller || !slot || !meter) return;
    const read = () => {
      const next: Box = {
        top: Math.round(slot.offsetTop),
        left: Math.round(slot.offsetLeft),
        width: Math.round(slot.offsetWidth),
        places: row
          ? Array.from(row.children).map((c) => {
              const el = c as HTMLElement;
              const span = Math.max(1, row.offsetWidth - el.offsetWidth);
              return {
                // Buttons are laid out in the page itself (its first positioned box).
                top: Math.round(el.offsetTop),
                across: r2(clamp01(el.offsetLeft / span)),
              };
            })
          : [],
        natural: Math.ceil(meter.getBoundingClientRect().width),
        view: Math.round(scroller.clientWidth),
      };
      setBox((prev) =>
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width &&
        JSON.stringify(prev.places) === JSON.stringify(next.places) &&
        prev.natural === next.natural &&
        prev.view === next.view
          ? prev
          : next,
      );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(scroller);
    observer.observe(slot);
    observer.observe(meter);
    if (row) observer.observe(row);
    return () => observer.disconnect();
  }, [scroller, slot, meter, row]);

  /* ------------------------------- geometry ------------------------------ */

  const view = box?.view ?? 0;
  const dockY = r2((TOOLBAR - lineHeight * s) / 2);
  const range = Math.max(1, (box?.top ?? 200) - dockY);
  const side = 8 + 36 + 6;
  const dockRoom = Math.max(40, view - 2 * side);
  const compactW = Math.min(box?.natural ?? 0, dockRoom / s);
  const dockX = dock === "center" ? r2((view - compactW * s) / 2) : side;

  // The actions fold as their row slides up under the toolbar: they leave
  // the page where they meet the bar, never as a hole in the middle of it.
  const places = box?.places ?? [];
  const firstTop = places.reduce((m, p) => Math.min(m, p.top), Infinity);
  const lastTop = places.reduce((m, p) => Math.max(m, p.top), -Infinity);
  const fold = useTransform(scrollY, (sy) =>
    places.length ? Number(foldOf(firstTop, sy).toFixed(4)) : 0,
  );

  // Collapse progress: the scroll's own, or the dock's spring once it has let go.
  const progress = useTransform(
    [scrollY, dockP] as MotionValue<number>[],
    ([sy = 0, d = 0]: number[]) =>
      Number(Math.max(clamp01(sy / range), d).toFixed(4)),
  );

  /* -------------------------------- docking ------------------------------ */

  const say = (text: string) => setSaid((p) => ({ n: p.n + 1, text }));

  const setDock = (next: boolean) => {
    if (dockedRef.current === next) return;
    dockedRef.current = next;
    setDocked(next);
    onDockChange?.(next);
    say(next ? "Title docked." : "Header expanded.");
    // The scroll that did it is the visitor's own.
    // A wheel is not a gesture the browser lets audio start from: until the
    // visitor has pressed something, the dock stays silent rather than make
    // a context that cannot play.
    if (activated()) {
      audio.play("swish", { pitch: next ? 1.15 : 0.85, gain: 0.32 });
    }
    if (!motionSafe) {
      dockP.jump(next ? 1 : 0);
      run(
        "fade",
        animate(fade, next ? 1 : 0, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
      return;
    }
    fade.jump(next ? 1 : 0);
    run(
      "dock",
      animate(dockP, next ? 1 : 0, next ? springs.snap : springs.glide),
    );
  };

  const onScroll = () => {
    if (!scroller) return;
    const top = Math.max(0, scroller.scrollTop);
    scrollY.set(top);
    const c = clamp01(top / range);
    if (!dockedRef.current && top > 0 && c >= letGo - 0.001) setDock(true);
    else if (dockedRef.current && top <= 1) setDock(false);
    // Folded (inert, in the menu) once the last of them has met the bar.
    const nextFolded = places.length > 0 && foldOf(lastTop, top) >= 0.75;
    if (nextFolded !== foldedRef.current) {
      foldedRef.current = nextFolded;
      setFolded(nextFolded);
    }
  };

  React.useEffect(() => {
    latest.current = { onScroll };
  });

  React.useEffect(() => {
    if (!scroller) return;
    const handler = () => latest.current?.onScroll();
    scroller.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => scroller.removeEventListener("scroll", handler);
  }, [scroller]);

  // A new threshold or a re-measured header takes effect where the page is.
  React.useEffect(() => {
    latest.current?.onScroll();
  }, [letGo, range]);

  // Focus follows an action into the overflow menu as it folds, and back out
  // as the header re-expands.
  React.useEffect(() => {
    const at = document.activeElement;
    if (!at) return;
    if (folded) {
      const onAction = [...actionNodes.current.values()].some((n) => n === at);
      if (onAction) overflowRef.current?.focus({ preventScroll: true });
    } else if (at === overflowRef.current || menuRef.current?.contains(at)) {
      const first = actions[0];
      if (first)
        actionNodes.current.get(first.id)?.focus({ preventScroll: true });
    }
    // Only when the fold flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folded]);

  React.useEffect(() => {
    if (!menuOpen) return;
    menuRef.current
      ?.querySelectorAll<HTMLElement>("[role='menuitem']")
      [menuActive]?.focus({ preventScroll: true });
    // Only on opening; arrows move focus themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent) => {
      const t = event.target instanceof Node ? event.target : null;
      if (
        t &&
        (menuRef.current?.contains(t) || overflowRef.current?.contains(t))
      )
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

  /* ------------------------------- actions ------------------------------- */

  const menuShown = menuOpen && folded;

  const closeMenu = (focusButton: boolean) => {
    setMenuOpen(false);
    if (focusButton) overflowRef.current?.focus({ preventScroll: true });
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const n = actions.length;
    if (n === 0) return;
    const focusAt = (i: number) => {
      const next = ((i % n) + n) % n;
      setMenuActive(next);
      menuRef.current
        ?.querySelectorAll<HTMLElement>("[role='menuitem']")
        [next]?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(menuActive + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusAt(menuActive - 1);
        return;
      case "Home":
        event.preventDefault();
        focusAt(0);
        return;
      case "End":
        event.preventDefault();
        focusAt(n - 1);
        return;
      case "Escape":
        // Handled here, where focus is; the stage must not also close.
        event.preventDefault();
        closeMenu(true);
        return;
      case "Tab":
        closeMenu(false);
        return;
    }
  };

  /* --------------------------- derived drawing --------------------------- */

  const measured = box !== null;
  const L0 = box?.left ?? 20;
  const T0 = box?.top ?? coverHeight + 24;

  const titleX = useTransform(
    [progress] as MotionValue<number>[],
    ([c = 0]: number[]) =>
      motionSafe ? r2(lerp(L0, dockX, smooth(0, 1, c))) : L0,
  );
  const titleY = useTransform(
    [progress, scrollY] as MotionValue<number>[],
    ([c = 0, sy = 0]: number[]) =>
      motionSafe ? r2(lerp(T0, dockY, c)) : r2(T0 - sy),
  );
  const titleScale = useTransform(progress, (c) =>
    motionSafe ? r2(lerp(1, s, smooth(0, 1, c))) : 1,
  );
  const largeOpacity = useTransform(progress, (c) =>
    motionSafe ? r2(1 - smooth(0.55, 0.85, c)) : 1,
  );
  const compactOpacity = useTransform(progress, (c) =>
    motionSafe ? r2(smooth(0.55, 0.85, c)) : 0,
  );
  const coverY = useTransform(scrollY, (sy) =>
    motionSafe ? r1(Math.min(sy, coverHeight * 1.5) * lag) : 0,
  );
  const coverOpacity = useTransform(progress, (c) => r2(1 - 0.85 * c));
  const barOpacity = useTransform(progress, (c) => r2(smooth(0.55, 1, c)));
  const chipOpacity = useTransform(barOpacity, (b) => r2(1 - b));
  const overflowOpacity = useTransform(fold, (f) => r2(smooth(0.4, 0.9, f)));
  const overflowScale = useTransform(overflowOpacity, (o) =>
    motionSafe ? r2(0.6 + 0.4 * o) : 1,
  );
  // Under reduced motion a docked copy cross-fades into the toolbar instead.
  const stillTitle = useTransform(fade, (f) => (motionSafe ? 0 : r2(f)));
  const flowTitle = useTransform(fade, (f) => (motionSafe ? 1 : r2(1 - f)));

  const titleStyle: React.CSSProperties = {
    fontSize,
    lineHeight: `${lineHeight}px`,
  };

  return (
    <div
      className={cn(
        "@container relative isolate w-full overflow-clip rounded-3 border border-hairline bg-background text-foreground",
        className,
      )}
      style={
        { height, "--collapse-header-accent": accent } as React.CSSProperties
      }
      data-state={docked ? "docked" : "expanded"}
    >
      {/* The toolbar floats over the top of the page (first, so Tab meets
          the back button before the page). */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20"
        style={{ height: TOOLBAR }}
      >
        <motion.div
          aria-hidden
          className="absolute inset-0 border-b border-hairline bg-[color-mix(in_oklab,var(--background)_88%,transparent)] backdrop-blur-md"
          style={{ opacity: barOpacity }}
        />
        <motion.span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px bg-[color-mix(in_oklab,var(--collapse-header-accent)_40%,transparent)]"
          style={{ opacity: barOpacity }}
        />
        <div className="relative flex h-full items-center justify-between gap-1.5 px-2">
          <div className="relative">
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-[color-mix(in_oklab,var(--background)_72%,transparent)] backdrop-blur-sm"
              style={{ opacity: chipOpacity }}
            />
            <button
              type="button"
              aria-label={backLabel}
              onClick={() => onBack?.()}
              className={cn(
                "pointer-events-auto relative inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors",
                "hover:bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)] active:scale-95",
                FOCUS_RING,
              )}
            >
              <ArrowLeft aria-hidden className="size-4" />
            </button>
          </div>

          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-1/2 min-w-0 -translate-y-1/2 truncate font-semibold text-foreground"
            style={{
              fontSize: DOCKED,
              lineHeight: `${Math.round(DOCKED * LEADING)}px`,
              left: dock === "center" ? "50%" : side,
              maxWidth: dockRoom,
              x: dock === "center" ? "-50%" : 0,
              opacity: stillTitle,
            }}
          >
            {title}
          </motion.span>

          {actions.length > 0 ? (
            <div className="relative">
              <motion.button
                ref={overflowRef}
                type="button"
                aria-label={overflowLabel}
                aria-haspopup="menu"
                aria-expanded={menuShown}
                aria-controls={menuShown ? menuId : undefined}
                inert={!folded}
                aria-hidden={!folded || undefined}
                onClick={() => {
                  if (menuShown) {
                    closeMenu(false);
                    return;
                  }
                  setMenuActive(0);
                  setMenuOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && !menuShown) {
                    event.preventDefault();
                    setMenuActive(0);
                    setMenuOpen(true);
                  }
                }}
                style={{ opacity: overflowOpacity, scale: overflowScale }}
                className={cn(
                  "pointer-events-auto relative inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors",
                  "hover:bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)]",
                  menuShown &&
                    "bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)]",
                  FOCUS_RING,
                )}
              >
                <Ellipsis aria-hidden className="size-4" />
              </motion.button>
              {menuShown ? (
                <motion.div
                  ref={menuRef}
                  id={menuId}
                  role="menu"
                  aria-label={overflowLabel}
                  onKeyDown={onMenuKeyDown}
                  initial={
                    motionSafe
                      ? { opacity: 0, y: -distances.nudge, scale: 0.96 }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={
                    motionSafe
                      ? {
                          y: springs.snap,
                          scale: springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  style={{ originX: 1, originY: 0 }}
                  className="pointer-events-auto absolute top-full right-0 z-40 mt-1 flex w-44 flex-col rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_10px_28px_color-mix(in_oklab,black_18%,transparent)]"
                >
                  {actions.map((action, i) => (
                    <motion.div
                      key={action.id}
                      role="menuitem"
                      tabIndex={menuActive === i ? 0 : -1}
                      onPointerMove={() => setMenuActive(i)}
                      onClick={() => {
                        onAction?.(action.id);
                        closeMenu(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onAction?.(action.id);
                        closeMenu(true);
                      }}
                      initial={
                        motionSafe
                          ? { opacity: 0, y: -distances.nudge }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.snap,
                              delay: 0.04 + i * cascade(actions.length),
                            }
                          : { duration: durations.fast }
                      }
                      className={cn(
                        "flex h-8 cursor-pointer items-center gap-2.5 rounded-2 px-2.5 text-[13px] text-foreground",
                        menuActive === i &&
                          "bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)]",
                        FOCUS_RING_IN,
                      )}
                    >
                      {action.icon ? (
                        <span
                          aria-hidden
                          className="flex size-4 shrink-0 items-center justify-center text-ink-2"
                        >
                          {action.icon}
                        </span>
                      ) : null}
                      {action.label}
                    </motion.div>
                  ))}
                </motion.div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={setScroller}
        role="region"
        aria-labelledby={titleId}
        tabIndex={0}
        className={cn(
          "absolute inset-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-3",
          FOCUS_RING_IN,
        )}
      >
        <div className="relative">
          <div
            className="relative overflow-clip [--collapse-header-cover:1] @min-[560px]:[--collapse-header-cover:1.2]"
            style={{
              height: `calc(${coverHeight}px * var(--collapse-header-cover))`,
            }}
          >
            <motion.div
              className="absolute inset-x-0 -top-px bottom-0"
              style={{ y: coverY, opacity: coverOpacity }}
            >
              {cover ?? <DefaultCover id={gradientId} />}
            </motion.div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-b from-transparent to-background"
            />
          </div>

          <div className="flex flex-col gap-3 px-5 pt-1 pb-5 @min-[560px]:flex-row @min-[560px]:items-end @min-[560px]:gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {eyebrow ? (
                <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {eyebrow}
                </p>
              ) : null}
              <motion.div
                ref={setSlot}
                aria-hidden
                className={cn(
                  "line-clamp-2 font-semibold tracking-[-0.01em] text-foreground",
                  measured && motionSafe && "invisible",
                )}
                style={{ ...titleStyle, opacity: measured ? flowTitle : 1 }}
              >
                {title}
              </motion.div>
              {subtitle ? (
                <p className="text-[13px] text-ink-2">{subtitle}</p>
              ) : null}
            </div>
            {actions.length > 0 ? (
              <div
                ref={setRow}
                className="flex shrink-0 flex-wrap items-center gap-1.5"
              >
                {actions.map((action, i) => (
                  <ActionButton
                    key={action.id}
                    action={action}
                    index={i}
                    count={actions.length}
                    scrollY={scrollY}
                    place={places[i] ?? null}
                    motionSafe={motionSafe}
                    folded={folded}
                    bind={(node) => {
                      if (node) actionNodes.current.set(action.id, node);
                      else actionNodes.current.delete(action.id);
                    }}
                    onPress={() => onAction?.(action.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {children}
        </div>
      </div>

      {/* The title: one heading, floating between its place and the dock. */}
      <motion.h2
        id={titleId}
        className={cn(
          "pointer-events-none absolute top-0 left-0 z-30 m-0 font-semibold tracking-[-0.01em] text-foreground",
          (!measured || !motionSafe) && "sr-only",
        )}
        style={{
          ...titleStyle,
          x: titleX,
          y: titleY,
          scale: titleScale,
          originX: 0,
          originY: 0,
          width: box?.width,
        }}
      >
        <motion.span
          className="line-clamp-2 block"
          style={{ opacity: largeOpacity }}
        >
          {title}
        </motion.span>
        <motion.span
          aria-hidden
          className="absolute top-0 left-0 block truncate"
          style={{ opacity: compactOpacity, width: compactW || undefined }}
        >
          {title}
        </motion.span>
      </motion.h2>

      <span
        ref={setMeter}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 font-semibold tracking-[-0.01em] whitespace-nowrap"
        style={titleStyle}
      >
        {title}
      </span>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
