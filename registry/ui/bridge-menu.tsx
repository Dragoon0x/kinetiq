"use client";

import * as React from "react";

import {
  BookOpen,
  Banknote,
  ChartColumn,
  ChevronDown,
  Code,
  CreditCard,
  FileText,
  Gauge,
  Landmark,
  Newspaper,
  Rocket,
  TrendingUp,
  Workflow,
} from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BridgeMenuLink = {
  id: string;
  /** The link's name. */
  label: string;
  /** One short line under the name. */
  description?: string;
  /** Where it goes. Without one the link renders as a button. */
  href?: string;
  /** 16px, drawn in currentColor. */
  icon?: React.ReactNode;
};

export type BridgeMenuFeature = BridgeMenuLink & {
  /** The call to action under the description. @default "Read more" */
  cta?: string;
};

export type BridgeMenuSection = {
  id: string;
  /** A small heading over the column. */
  title?: string;
  links: BridgeMenuLink[];
};

export type BridgeMenuItem = {
  id: string;
  /** The trigger's text. */
  label: string;
  /** A plain link in the bar: an item with an `href` and nothing to show has no panel. */
  href?: string;
  /** Columns of links shown in the panel. */
  sections?: BridgeMenuSection[];
  /** A highlighted card beside the columns. */
  feature?: BridgeMenuFeature;
  /** Your own panel content, in place of `sections` and `feature`. */
  content?: React.ReactNode;
};

export type BridgeMenuBridge = "off" | "on" | "show";
export type BridgeMenuSize = "sm" | "md" | "lg";

export type BridgeMenuProps = {
  /** The bar's items, in order. @default defaultBridgeMenuItems */
  items?: BridgeMenuItem[];
  /** Controlled: the id of the open menu, or null when closed. */
  value?: string | null;
  /** The menu open at first when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the hover, press or key that opened, switched or closed a menu. */
  onValueChange?: (id: string | null) => void;
  /** A link was chosen in a panel or the bar; the menu closes after it. Call `event.preventDefault()` to stay on the page. */
  onSelect?: (
    link: BridgeMenuLink,
    itemId: string,
    event: React.MouseEvent,
  ) => void;
  /** The navigation's accessible name. @default "Main" */
  label?: string;
  /** How far the content slides in the direction of travel as it crossfades, in px. 0 is a plain crossfade. @default 16 */
  travel?: number;
  /** The safe triangle that keeps a menu open while the pointer heads diagonally for its panel. `show` draws it. @default "on" */
  bridge?: BridgeMenuBridge;
  /** How long the pointer rests on a trigger before a closed menu opens, and inside the bridge before it gives way, in ms. @default 120 */
  delay?: number;
  /** How long a menu stays open after the pointer leaves the bar and the panel, in ms. @default 260 */
  closeDelay?: number;
  /** The panel centred under its trigger, or starting at it. @default "center" */
  align?: "center" | "start";
  /** The gap between the bar and the panel, in px. @default 6 */
  offset?: number;
  /** Draw a notch on the panel pointing at the open trigger. @default true */
  notch?: boolean;
  /** Dim the page under the bar while a menu is open. @default true */
  scrim?: boolean;
  /** Bar height 32, 40 or 48px and the trigger text to match. @default "md" */
  size?: BridgeMenuSize;
  /** The bridge, link icons on hover and the open trigger's rule: any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Before the triggers: a brand mark. */
  start?: React.ReactNode;
  /** After the triggers, at the bar's end: sign in, a button. */
  end?: React.ReactNode;
  /** The page under the bar. With it, the panel floats over the page and never leaves the component's box. */
  children?: React.ReactNode;
  /** Play the swish of a menu opened or closed by a press or a key, and the tick of a key moving it. Hover is silent. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const icon = (Glyph: typeof BookOpen) => (
  <Glyph aria-hidden className="size-4" strokeWidth={1.75} />
);

/** A Fieldline site's navigation: two big menus, a small one and a plain link. */
export const defaultBridgeMenuItems: BridgeMenuItem[] = [
  {
    id: "products",
    label: "Products",
    sections: [
      {
        id: "platform",
        title: "Platform",
        links: [
          {
            id: "ledger",
            label: "Ledger",
            description: "Books that close themselves",
            href: "#ledger",
            icon: icon(BookOpen),
          },
          {
            id: "payouts",
            label: "Payouts",
            description: "Pay out in 40 currencies",
            href: "#payouts",
            icon: icon(Banknote),
          },
          {
            id: "cards",
            label: "Cards",
            description: "Spend limits for every team",
            href: "#cards",
            icon: icon(CreditCard),
          },
        ],
      },
      {
        id: "tools",
        title: "Tools",
        links: [
          {
            id: "reports",
            label: "Reports",
            description: "Board-ready numbers, live",
            href: "#reports",
            icon: icon(ChartColumn),
          },
          {
            id: "forecasts",
            label: "Forecasts",
            description: "Runway on one screen",
            href: "#forecasts",
            icon: icon(TrendingUp),
          },
          {
            id: "api",
            label: "API",
            description: "Typed SDKs and webhooks",
            href: "#api",
            icon: icon(Code),
          },
        ],
      },
    ],
  },
  {
    id: "solutions",
    label: "Solutions",
    sections: [
      {
        id: "teams",
        title: "By team",
        links: [
          {
            id: "finance",
            label: "Finance",
            href: "#finance",
            icon: icon(Landmark),
          },
          {
            id: "operations",
            label: "Operations",
            href: "#operations",
            icon: icon(Workflow),
          },
          {
            id: "founders",
            label: "Founders",
            href: "#founders",
            icon: icon(Rocket),
          },
        ],
      },
    ],
    feature: {
      id: "story",
      label: "Close in a day",
      description: "How Basinworks cut month-end from nine days to one.",
      href: "#basinworks",
      cta: "Read the story",
    },
  },
  {
    id: "resources",
    label: "Resources",
    sections: [
      {
        id: "learn",
        links: [
          {
            id: "docs",
            label: "Docs",
            description: "Guides and reference",
            href: "#docs",
            icon: icon(FileText),
          },
          {
            id: "changelog",
            label: "Changelog",
            description: "What shipped this week",
            href: "#changelog",
            icon: icon(Newspaper),
          },
          {
            id: "status",
            label: "Status",
            description: "All systems normal",
            href: "#status",
            icon: icon(Gauge),
          },
        ],
      },
    ],
  },
  { id: "pricing", label: "Pricing", href: "#pricing" },
];

type Pt = { x: number; y: number };

type SizeSpec = { bar: number; pill: number; trigger: string };

const SIZES: Record<BridgeMenuSize, SizeSpec> = {
  sm: { bar: 32, pill: 26, trigger: "h-[26px] px-2.5 text-xs" },
  md: { bar: 40, pill: 32, trigger: "h-8 px-3 text-[13px]" },
  lg: { bar: 48, pill: 36, trigger: "h-9 px-3.5 text-sm" },
};

/** The panel keeps this far from the bar's ends, px. */
const EDGE = 8;
/** The notch keeps this far from the panel's corners, px. */
const NOTCH_PAD = 16;
/** The bridge's base reaches this far past the panel's corners, px. */
const WIDEN = 12;
/** The bridge never holds a switch back for longer than this, ms. */
const HOLD_MAX = 600;
/** A press this soon after a hover opened the menu keeps it open, ms. */
const PRESS_GRACE = 400;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const hasPanel = (item: BridgeMenuItem | undefined) =>
  !!item &&
  (item.content !== undefined ||
    (item.sections?.length ?? 0) > 0 ||
    item.feature !== undefined);

/**
 * An element's layout box inside `root`, from the offset chain: transforms
 * are ignored (a trigger never moves, but the panel and its layers do) and
 * the scroll of every container on the way is taken off.
 */
function boxIn(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent) break;
    if (parent !== root) {
      x += parent.clientLeft - parent.scrollLeft;
      y += parent.clientTop - parent.scrollTop;
    }
    node = parent;
  }
  return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
}

/** Which side of the line a-b the point p is on (the sign is what matters). */
const side = (p: Pt, a: Pt, b: Pt) =>
  (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);

const inTriangle = (p: Pt, a: Pt, b: Pt, c: Pt) => {
  const d1 = side(p, a, b);
  const d2 = side(p, b, c);
  const d3 = side(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

const FOCUSABLE = "a[href], button:not(:disabled), [tabindex='0']";

type Source = "hover" | "press" | "key" | "leave" | "select" | "outside";

type View = {
  /** The menu shown now (null: closed). */
  open: string | null;
  /** The menu shown before this one. */
  prev: string | null;
  /** +1 when the last move went right along the bar, -1 left. */
  dir: number;
};

type LayerProps = {
  id: string;
  /** This layer is the panel's content now, or was when the panel closed. */
  shown: boolean;
  /** Interactive: the panel is open on this layer. */
  live: boolean;
  /** Arrived or left by sliding across, rather than with the panel. */
  sliding: boolean;
  dir: number;
  travel: number;
  motionSafe: boolean;
  labelledBy: string;
  bind: (id: string, node: HTMLDivElement | null) => void;
  onScroll: () => void;
  children: React.ReactNode;
};

/**
 * One trigger's content. It enters from the side the panel is travelling
 * from and leaves toward the side it is travelling to; arriving with the
 * panel (from closed) it is simply there, since the panel itself fades in.
 */
function Layer({
  id,
  shown,
  live,
  sliding,
  dir,
  travel,
  motionSafe,
  labelledBy,
  bind,
  onScroll,
  children,
}: LayerProps) {
  const x = useMotionValue(0);
  const opacity = useMotionValue(shown ? 1 : 0);
  const was = React.useRef(shown);

  // StrictMode runs this twice: the second run finds nothing changed and
  // carries the layer on to rest instead of leaving it frozen part-way.
  React.useEffect(() => {
    const changed = was.current !== shown;
    was.current = shown;
    const shift = Math.round(travel);
    const running: AnimationPlaybackControls[] = [];
    if (shown) {
      if (changed) {
        if (sliding) {
          x.jump(motionSafe ? dir * shift : 0);
          opacity.jump(0);
        } else {
          x.jump(0);
          opacity.jump(1);
        }
      }
      if (x.get() !== 0) {
        running.push(
          animate(x, 0, motionSafe ? springs.glide : { duration: 0 }),
        );
      }
      if (opacity.get() !== 1) {
        // A beat behind the outgoing layer's fade, so the two never read
        // as one muddle of text.
        running.push(
          animate(opacity, 1, {
            duration: motionSafe ? durations.base : durations.fast,
            ease: easings.enter,
            delay: sliding ? durations.blink / 2 : 0,
          }),
        );
      }
    } else {
      if (changed && !sliding) {
        x.jump(0);
        opacity.jump(0);
      }
      if (opacity.get() !== 0) {
        const target = motionSafe ? -dir * shift : 0;
        if (x.get() !== target) {
          running.push(animate(x, target, exitFor(durations.base)));
        }
        running.push(animate(opacity, 0, exitFor(durations.fast)));
      }
    }
    return () => {
      for (const c of running) c.stop();
    };
  }, [shown, sliding, dir, travel, motionSafe, x, opacity]);

  return (
    <motion.div
      ref={(node) => bind(id, node)}
      onScroll={onScroll}
      data-bridge-menu-layer={id}
      role="group"
      aria-labelledby={labelledBy}
      aria-hidden={!live || undefined}
      inert={!live}
      className={cn(
        "absolute top-0 left-0 w-max max-w-[var(--bridge-menu-max-w)] [scrollbar-width:thin] overflow-y-auto overscroll-contain",
        "max-h-[var(--bridge-menu-max-h)]",
        !live && "pointer-events-none",
      )}
      style={{ x, opacity }}
    >
      {children}
    </motion.div>
  );
}

function LinkFace({ link }: { link: BridgeMenuLink }) {
  return (
    <>
      {link.icon !== undefined ? (
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2 transition-colors group-hover/bridge-menu-link:text-[var(--bridge-menu-accent)] group-focus-visible/bridge-menu-link:text-[var(--bridge-menu-accent)]"
        >
          {link.icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-col justify-center">
        <span className="truncate text-[13px] leading-4 font-medium text-foreground">
          {link.label}
        </span>
        {link.description ? (
          <span className="truncate text-xs leading-4 text-ink-3">
            {link.description}
          </span>
        ) : null}
      </span>
    </>
  );
}

/**
 * A navigation bar with one panel for every menu. Hovering a trigger opens
 * the panel under it; moving to the next trigger does not close one panel
 * and open another — the same panel slides across on the glide spring and
 * resizes to the new content while that content crossfades in from the side
 * the pointer came from. A notch on the panel's edge and a pill behind the
 * trigger move on the snap spring, so they arrive first and the panel glides
 * in after them.
 *
 * Moving diagonally from a trigger to a far corner of its panel crosses the
 * other triggers on the way. A safe triangle — the bridge — from the last
 * point on the open trigger to the panel's top edge holds the menu open while
 * the pointer is inside it, until it reaches the panel, leaves the triangle,
 * or rests. `bridge="show"` draws it.
 *
 * The triggers are disclosure buttons in a single tab stop: Left and Right
 * move along the bar (the open panel follows), Enter or Space opens, Down
 * moves into the panel and Escape comes back. Under reduced motion the panel
 * jumps to its trigger and content swaps by opacity alone; the bridge still
 * holds, because it is behaviour, not decoration.
 */
export function BridgeMenu({
  items = defaultBridgeMenuItems,
  value,
  defaultValue = null,
  onValueChange,
  onSelect,
  label = "Main",
  travel = 16,
  bridge = "on",
  delay = 120,
  closeDelay = 260,
  align = "center",
  offset = 6,
  notch = true,
  scrim = true,
  size = "md",
  accent = "var(--accent-bright)",
  start,
  end,
  children,
  sound = false,
  disabled = false,
  className,
}: BridgeMenuProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const spec = SIZES[size] ?? SIZES.md;
  const gap = Math.max(0, Math.round(offset));
  const panelTop = spec.bar + gap;
  const rest = Math.max(0, Math.round(delay));

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const asked = value !== undefined ? value : own;
  // A disabled bar, or an id with no panel, shows closed.
  const current =
    !disabled && hasPanel(items.find((i) => i.id === asked))
      ? (asked as string)
      : null;

  const indexOf = (id: string | null) =>
    id === null ? -1 : items.findIndex((i) => i.id === id);

  const [view, setView] = React.useState<View>({
    open: current,
    prev: null,
    dir: 1,
  });
  if (view.open !== current) {
    const from = indexOf(view.open);
    const to = indexOf(current);
    setView({
      open: current,
      prev: view.open,
      dir: from !== -1 && to !== -1 && to < from ? -1 : 1,
    });
  }
  const shownId = view.open ?? view.prev;
  const sliding = view.open !== null && view.prev !== null;

  const [rove, setRove] = React.useState<string | null>(null);
  const roving =
    rove !== null && items.some((i) => i.id === rove)
      ? rove
      : (current ?? items[0]?.id ?? null);

  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  const hasPage = children !== undefined && children !== null;
  const maxH =
    hasPage && box ? Math.max(80, Math.round(box.h - panelTop - EDGE)) : null;
  const maxW = box ? Math.max(120, Math.round(box.w - 2 * EDGE)) : null;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const triggers = React.useRef(new Map<string, HTMLElement>());
  const layers = React.useRef(new Map<string, HTMLDivElement>());
  const sizes = React.useRef(new Map<string, { w: number; h: number }>());
  const observer = React.useRef<ResizeObserver | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Map<string, number>());
  const placed = React.useRef<string | null>(null);
  const opened = React.useRef<{ at: number; by: Source }>({
    at: 0,
    by: "press",
  });
  const apex = React.useRef<Pt | null>(null);
  const hold = React.useRef<{ over: string | null; since: number } | null>(
    null,
  );
  const intent = React.useRef<string | null>(null);
  const pressInside = React.useRef(false);
  const focusNext = React.useRef<"first" | "last" | null>(null);
  const api = React.useRef<{
    place: (how: "open" | "switch" | "jump") => void;
    request: (next: string | null, source: Source) => void;
    onResize: (entries: ResizeObserverEntry[]) => void;
    measureMore: () => void;
  } | null>(null);

  const panelX = useMotionValue(EDGE);
  const panelW = useMotionValue(240);
  const panelH = useMotionValue(120);
  const panelOpacity = useMotionValue(current === null ? 0 : 1);
  const panelScale = useMotionValue(1);
  const panelY = useMotionValue(0);
  const notchX = useMotionValue(120);
  const more = useMotionValue(0);
  const pillX = useMotionValue(0);
  const pillW = useMotionValue(0);
  const pillOpacity = useMotionValue(0);
  const scrimOpacity = useMotionValue(0);
  const apexX = useMotionValue(0);
  const apexY = useMotionValue(0);
  const wedge = useMotionValue(0);

  // Derived before any layout effect below: a commit tears every derived
  // value's subscription down and makes it again in declaration order, so a
  // layout effect declared earlier would move the source while nobody is
  // listening and leave the notch where it was.
  const wedgePoints = useTransform(
    [apexX, apexY, panelX, panelW] as MotionValue<number>[],
    ([ax = 0, ay = 0, x = 0, w = 0]: number[]) =>
      `${r2(ax)},${r2(ay)} ${r2(x - WIDEN)},${panelTop} ${r2(x + w + WIDEN)},${panelTop}`,
  );
  const wedgeFill = useTransform(wedge, (k) => r2(0.16 * k));
  const wedgeStroke = useTransform(wedge, (k) => r2(0.5 * k));
  const notchLeft = useTransform(notchX, (n) => r2(n - 5));
  const origin = useTransform(notchX, (n) => `${r2(n)}px 0px`);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const clearTimer = (key: string) => {
    const t = timers.current.get(key);
    if (t !== undefined) window.clearTimeout(t);
    timers.current.delete(key);
  };
  const setTimer = (key: string, ms: number, fn: () => void) => {
    clearTimer(key);
    timers.current.set(
      key,
      window.setTimeout(() => {
        timers.current.delete(key);
        fn();
      }, ms),
    );
  };

  /* ------------------------------ geometry ------------------------------- */

  /** A fade at the panel's foot while its content has more below. */
  const measureMore = () => {
    const layer = view.open === null ? null : layers.current.get(view.open);
    const left = layer
      ? layer.scrollHeight - layer.clientHeight - layer.scrollTop
      : 0;
    const want = left > 4 ? 1 : 0;
    if (Math.abs(more.get() - want) < 0.01) return;
    run("more", animate(more, want, { duration: durations.fast }));
  };

  /** Puts the panel, its notch and the pill where the open trigger says. */
  const place = (how: "open" | "switch" | "jump") => {
    const root = rootRef.current;
    const id = view.open;
    if (!root || id === null) return;
    const trigger = triggers.current.get(id);
    const natural = sizes.current.get(id);
    if (!trigger || !natural) return;
    const rootW = root.clientWidth;
    const t = boxIn(trigger, root);
    const w = Math.min(natural.w, Math.max(80, rootW - 2 * EDGE));
    const h = natural.h;
    const centre = t.left + t.width / 2;
    const left = r2(
      clamp(
        align === "start" ? t.left : centre - w / 2,
        EDGE,
        Math.max(EDGE, rootW - EDGE - w),
      ),
    );
    const tip = r2(clamp(centre - left, NOTCH_PAD, w - NOTCH_PAD));
    const glide = motionSafe && how === "switch";
    const tracked: [string, MotionValue<number>, number][] = [
      ["x", panelX, left],
      ["w", panelW, w],
      ["h", panelH, h],
    ];
    for (const [key, mv, to] of tracked) {
      if (glide) run(key, animate(mv, to, springs.glide));
      else {
        anims.current.get(key)?.stop();
        mv.jump(to);
      }
    }
    if (glide) run("notch", animate(notchX, tip, springs.snap));
    else {
      anims.current.get("notch")?.stop();
      notchX.jump(tip);
    }
    measureMore();
    const pillShown = pillOpacity.get() > 0.05;
    if (motionSafe && pillShown && how !== "jump") {
      run("pillX", animate(pillX, r2(t.left), springs.snap));
      run("pillW", animate(pillW, r2(t.width), springs.snap));
    } else {
      anims.current.get("pillX")?.stop();
      anims.current.get("pillW")?.stop();
      pillX.jump(r2(t.left));
      pillW.jump(r2(t.width));
    }
  };

  /** The open menu's layer changed size, or the bar did: follow it. */
  const onResize = (entries: ResizeObserverEntry[]) => {
    let moved = false;
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      if (el === rootRef.current) {
        const next = { w: el.clientWidth, h: el.clientHeight };
        setBox((b) => (b && b.w === next.w && b.h === next.h ? b : next));
        moved = true;
        continue;
      }
      const id = el.dataset.bridgeMenuLayer;
      if (!id) continue;
      sizes.current.set(id, { w: el.offsetWidth, h: el.offsetHeight });
      if (id === placed.current) moved = true;
    }
    if (moved) api.current?.place(motionSafe ? "switch" : "jump");
  };

  const observe = (node: Element) => {
    if (typeof ResizeObserver === "undefined") return;
    if (!observer.current) {
      observer.current = new ResizeObserver((entries) =>
        api.current?.onResize(entries),
      );
    }
    observer.current.observe(node);
  };

  const bindLayer = (id: string, node: HTMLDivElement | null) => {
    const old = layers.current.get(id);
    if (old && old !== node) observer.current?.unobserve(old);
    if (!node) {
      layers.current.delete(id);
      return;
    }
    layers.current.set(id, node);
    sizes.current.set(id, { w: node.offsetWidth, h: node.offsetHeight });
    observe(node);
  };

  const bindRoot = (node: HTMLDivElement | null) => {
    if (rootRef.current && rootRef.current !== node) {
      observer.current?.unobserve(rootRef.current);
    }
    rootRef.current = node;
    if (node) observe(node);
  };

  /* ------------------------------ requests ------------------------------- */

  const request = (next: string | null, source: Source) => {
    if (next !== null && disabled) return;
    if (next === current) return;
    clearTimer("intent");
    clearTimer("leave");
    intent.current = null;
    // Focus inside a panel that is about to go inert would be dropped on
    // the page: it moves to the trigger first.
    const panel = panelRef.current;
    if (panel && panel.contains(document.activeElement)) {
      triggers.current.get(next ?? current ?? "")?.focus({
        preventScroll: true,
      });
    }
    if (current === null && next !== null) {
      opened.current = { at: performance.now(), by: source };
    }
    // Heard only for a press or a key: a hover or the pointer drifting away
    // is not a gesture, so it never starts audio by itself.
    if (source !== "hover" && source !== "leave") {
      if (current === null && next !== null) {
        audio.play("swish", { pitch: 1.05, gain: 0.3 });
      } else if (next === null) {
        audio.play("swish", { pitch: 0.82, gain: 0.18 });
      } else {
        audio.play("tick", {
          pitch: indexOf(next) > indexOf(current) ? 1.15 : 0.88,
          gain: 0.32,
        });
      }
    }
    if (next === null) {
      hold.current = null;
      apex.current = null;
    }
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  // Kept current before the layout effects below read it: they run in
  // declaration order, after this one.
  React.useLayoutEffect(() => {
    api.current = { place, request, onResize, measureMore };
  });

  // The panel follows the open menu: it appears in place from closed,
  // slides across between menus, and fades away when closed. Measured after
  // commit, so the trigger and the layer have their final boxes.
  React.useLayoutEffect(() => {
    const id = view.open;
    const was = placed.current;
    placed.current = id;
    if (id === null) {
      const out = exitFor(durations.base);
      run("panelOpacity", animate(panelOpacity, 0, out));
      if (motionSafe) run("panelScale", animate(panelScale, 0.98, out));
      run("pill", animate(pillOpacity, 0, out));
      run("scrim", animate(scrimOpacity, 0, out));
      run("wedge", animate(wedge, 0, out));
      return;
    }
    const fresh = was === null || panelOpacity.get() < 0.05;
    place(fresh ? "open" : "switch");
    if (fresh) {
      if (motionSafe) {
        panelScale.jump(0.96);
        panelY.jump(-4);
        run("panelScale", animate(panelScale, 1, springs.snap));
        run("panelY", animate(panelY, 0, springs.snap));
      } else {
        panelScale.jump(1);
        panelY.jump(0);
      }
    } else {
      if (panelScale.get() !== 1) {
        run("panelScale", animate(panelScale, 1, springs.snap));
      }
      if (panelY.get() !== 0) run("panelY", animate(panelY, 0, springs.snap));
    }
    const enter = {
      duration: motionSafe ? durations.base : durations.fast,
      ease: easings.enter,
    };
    run("panelOpacity", animate(panelOpacity, 1, enter));
    run("pill", animate(pillOpacity, 1, enter));
    run("scrim", animate(scrimOpacity, 1, enter));
    const want = focusNext.current;
    if (want) {
      focusNext.current = null;
      const layer = layers.current.get(id);
      const list = layer
        ? Array.from(layer.querySelectorAll<HTMLElement>(FOCUSABLE))
        : [];
      const target = want === "first" ? list[0] : list[list.length - 1];
      target?.focus({ preventScroll: true });
    }
    // Placed once per change of menu; sizes and widths re-place it through
    // the observer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.open]);

  // The bar's width or the page's height changed the room the panel has.
  React.useLayoutEffect(() => {
    if (placed.current !== null) api.current?.place("jump");
  }, [box, align, size, gap, notch]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    // Observed afresh on every mount, so StrictMode's cleanup does not leave
    // the bar and its layers unwatched.
    observer.current?.disconnect();
    observer.current = null;
    if (rootRef.current) observe(rootRef.current);
    for (const node of layers.current.values()) observe(node);
    return () => {
      observer.current?.disconnect();
      observer.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending.values()) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  // A press anywhere else closes the menu.
  React.useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (root.contains(event.target)) return;
      api.current?.request(null, "outside");
    };
    const onUp = () => {
      pressInside.current = false;
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  /* -------------------------------- bridge ------------------------------- */

  const showWedge = (level: number) => {
    if (bridge !== "show") return;
    if (Math.abs(wedge.get() - level) < 0.01) return;
    run(
      "wedge",
      animate(
        wedge,
        level,
        level === 0
          ? exitFor(durations.fast)
          : { duration: durations.fast, ease: easings.enter },
      ),
    );
  };

  const endHold = () => {
    hold.current = null;
    clearTimer("hold");
  };

  const pointIn = (event: React.PointerEvent): Pt | null => {
    const root = rootRef.current;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    return {
      x: r2(event.clientX - rect.left - root.clientLeft),
      y: r2(event.clientY - rect.top - root.clientTop),
    };
  };

  const onRootPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || disabled) return;
    const p = pointIn(event);
    if (!p) return;
    const target = event.target instanceof Element ? event.target : null;
    const overId =
      target
        ?.closest("[data-bridge-menu-trigger]")
        ?.getAttribute("data-bridge-menu-trigger") ?? null;
    const inPanel = !!target?.closest("[data-bridge-menu-panel]");
    const inBar = !!target?.closest("[data-bridge-menu-bar]");
    const over = items.find((i) => i.id === overId);

    if (current === null) {
      // Hover intent: the pointer has to rest on a trigger for `delay`.
      if (!over || !hasPanel(over)) {
        intent.current = null;
        clearTimer("intent");
        return;
      }
      if (intent.current === over.id) return;
      intent.current = over.id;
      if (rest === 0) {
        request(over.id, "hover");
        return;
      }
      setTimer("intent", rest, () => {
        if (intent.current === over.id) api.current?.request(over.id, "hover");
      });
      return;
    }

    if (inBar || inPanel) clearTimer("leave");
    else armLeave();

    if (inPanel) {
      endHold();
      showWedge(0);
      return;
    }
    if (overId === current) {
      apex.current = p;
      apexX.jump(p.x);
      apexY.jump(p.y);
      endHold();
      showWedge(0.55);
      return;
    }
    if (!over) {
      // Between triggers or off the bar: a hold keeps holding, aimed at
      // nothing, so resting here switches to nothing.
      if (hold.current) hold.current.over = null;
      return;
    }
    const a = apex.current;
    const x = panelX.get();
    const w = panelW.get();
    const aiming =
      bridge !== "off" &&
      a !== null &&
      inTriangle(
        p,
        a,
        { x: x - WIDEN, y: panelTop },
        { x: x + w + WIDEN, y: panelTop },
      );
    const h = hold.current;
    if (aiming && (!h || event.timeStamp - h.since < HOLD_MAX)) {
      if (!h) hold.current = { over: over.id, since: event.timeStamp };
      else h.over = over.id;
      showWedge(1);
      // Resting inside the bridge is a choice: after the delay it gives way.
      setTimer("hold", Math.max(80, rest), () => {
        const target = hold.current?.over ?? null;
        hold.current = null;
        if (target === null) return;
        const item = items.find((i) => i.id === target);
        api.current?.request(hasPanel(item) ? target : null, "hover");
      });
      return;
    }
    endHold();
    showWedge(0);
    request(hasPanel(over) ? over.id : null, "hover");
  };

  const armLeave = () => {
    if (current === null || timers.current.has("leave")) return;
    setTimer("leave", Math.max(0, closeDelay), () => {
      hold.current = null;
      api.current?.request(null, "leave");
    });
  };

  /* ------------------------------ keyboard ------------------------------- */

  const focusItem = (index: number) => {
    const n = items.length;
    if (n === 0) return;
    const item = items[((index % n) + n) % n];
    if (!item) return;
    setRove(item.id);
    triggers.current.get(item.id)?.focus();
    if (current !== null) request(hasPanel(item) ? item.id : null, "key");
  };

  const onTriggerKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    item: BridgeMenuItem,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusItem(index + 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        focusItem(index - 1);
        return;
      case "Home":
        event.preventDefault();
        focusItem(0);
        return;
      case "End":
        event.preventDefault();
        focusItem(items.length - 1);
        return;
      case "ArrowDown":
      case "ArrowUp": {
        if (!hasPanel(item)) return;
        event.preventDefault();
        const which = event.key === "ArrowDown" ? "first" : "last";
        if (current === item.id) {
          const layer = layers.current.get(item.id);
          const list = layer
            ? Array.from(layer.querySelectorAll<HTMLElement>(FOCUSABLE))
            : [];
          (which === "first" ? list[0] : list[list.length - 1])?.focus();
          return;
        }
        focusNext.current = which;
        request(item.id, "key");
        return;
      }
      case "Escape":
        if (current === null) return;
        // Handled here, where focus is; the page must not also see it.
        event.preventDefault();
        request(null, "key");
        return;
    }
  };

  const onPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (current === null) return;
    const layer = layers.current.get(current);
    if (!layer) return;
    const list = Array.from(layer.querySelectorAll<HTMLElement>(FOCUSABLE));
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      const el = list[(i + list.length) % list.length];
      if (!el) return;
      el.focus();
      audio.play("tick", { pitch: 1.3, gain: 0.18 });
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(at + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(at === -1 ? -1 : at - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(list.length - 1);
        return;
      case "ArrowLeft":
      case "ArrowRight": {
        const from = list[at];
        if (!from) return;
        event.preventDefault();
        // The nearest link in the column beside, by where it sits.
        const a = from.getBoundingClientRect();
        const right = event.key === "ArrowRight";
        let best = -1;
        let score = Infinity;
        list.forEach((el, i) => {
          if (i === at) return;
          const b = el.getBoundingClientRect();
          const dx = right ? b.left - a.right : a.left - b.right;
          if (dx < -2) return;
          const s = Math.abs(b.top - a.top) * 4 + dx;
          if (s < score) {
            score = s;
            best = i;
          }
        });
        if (best !== -1) go(best);
        return;
      }
      case "Escape": {
        event.preventDefault();
        const id = current;
        request(null, "key");
        triggers.current.get(id)?.focus();
        return;
      }
    }
  };

  /* ------------------------------- derived ------------------------------- */

  const panelItems = items.filter(hasPanel);
  const triggerId = (id: string) => `${uid}-trigger-${id}`;
  const layerId = (id: string) => `${uid}-panel-${id}`;

  const choose = (
    link: BridgeMenuLink,
    itemId: string,
    event: React.MouseEvent,
  ) => {
    onSelect?.(link, itemId, event);
    if (current !== null) {
      const id = current;
      request(null, "select");
      if (panelRef.current?.contains(document.activeElement)) {
        triggers.current.get(id)?.focus({ preventScroll: true });
      }
    }
  };

  const renderLink = (link: BridgeMenuLink, itemId: string) => {
    const cls = cn(
      "group/bridge-menu-link flex w-full items-center gap-2.5 rounded-2 px-2 py-1 text-left transition-colors hover:bg-surface-2",
      FOCUS_IN,
    );
    return link.href ? (
      <a
        href={link.href}
        className={cls}
        onClick={(event) => choose(link, itemId, event)}
      >
        <LinkFace link={link} />
      </a>
    ) : (
      <button
        type="button"
        className={cn(cls, "cursor-pointer")}
        onClick={(event) => choose(link, itemId, event)}
      >
        <LinkFace link={link} />
      </button>
    );
  };

  const renderPanel = (item: BridgeMenuItem) => {
    if (item.content !== undefined) return item.content;
    const feature = item.feature;
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-3 p-3">
        {(item.sections ?? []).map((section) => (
          <div
            key={section.id}
            className="flex w-[13.5rem] max-w-full flex-col gap-1"
          >
            {section.title ? (
              <p className="px-2 pt-0.5 font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase">
                {section.title}
              </p>
            ) : null}
            <ul role="list" className="flex flex-col gap-0.5">
              {section.links.map((link) => (
                <li key={link.id}>{renderLink(link, item.id)}</li>
              ))}
            </ul>
          </div>
        ))}
        {feature ? (
          <a
            href={feature.href}
            onClick={(event) => choose(feature, item.id, event)}
            className={cn(
              "group/bridge-menu-feature flex w-[13rem] max-w-full flex-col justify-end gap-1 rounded-3 border border-hairline bg-cobalt-wash p-3 text-left transition-colors hover:border-hairline-strong",
              FOCUS_IN,
            )}
          >
            <span className="text-[13px] leading-4 font-medium text-foreground">
              {feature.label}
            </span>
            {feature.description ? (
              <span className="text-xs leading-4 text-ink-2">
                {feature.description}
              </span>
            ) : null}
            <span className="mt-1 inline-flex items-center gap-1 text-xs leading-4 font-medium text-[var(--bridge-menu-accent)]">
              {feature.cta ?? "Read more"}
              <span
                aria-hidden
                className="transition-transform group-hover/bridge-menu-feature:translate-x-0.5"
              >
                →
              </span>
            </span>
          </a>
        ) : null}
      </div>
    );
  };

  return (
    <div
      ref={bindRoot}
      className={cn(
        "@container/bridge-menu relative isolate flex w-full flex-col",
        disabled && "opacity-60",
        className,
      )}
      style={
        {
          "--bridge-menu-accent": accent,
          "--bridge-menu-max-h": maxH === null ? "none" : `${maxH}px`,
          "--bridge-menu-max-w": maxW === null ? "100cqw" : `${maxW}px`,
        } as React.CSSProperties
      }
      onPointerMove={onRootPointerMove}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        intent.current = null;
        clearTimer("intent");
        endHold();
        showWedge(0);
        armLeave();
      }}
      onPointerDown={(event) => {
        pressInside.current = true;
        const target = event.target instanceof Element ? event.target : null;
        // A press on the page under an open menu closes it.
        if (
          current !== null &&
          target &&
          !target.closest("[data-bridge-menu-bar]")
        ) {
          request(null, "outside");
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && rootRef.current?.contains(next)) return;
        if (!next && pressInside.current) return;
        if (current !== null) request(null, "leave");
      }}
    >
      <nav
        aria-label={label}
        data-bridge-menu-bar=""
        className="flex shrink-0 items-center gap-1.5 px-2"
        style={{ height: spec.bar }}
      >
        {start !== undefined ? (
          <div className="flex shrink-0 items-center">{start}</div>
        ) : null}

        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-0 rounded-2 bg-surface-2 shadow-[inset_0_-2px_0_0_var(--bridge-menu-accent)]"
          style={{
            top: (spec.bar - spec.pill) / 2,
            height: spec.pill,
            x: pillX,
            width: pillW,
            opacity: pillOpacity,
          }}
        />

        <ul role="list" className="flex min-w-0 items-center gap-0.5">
          {items.map((item, index) => {
            const panel = hasPanel(item);
            const isOpen = current === item.id;
            const common = {
              id: triggerId(item.id),
              "data-bridge-menu-trigger": item.id,
              tabIndex: roving === item.id ? 0 : -1,
              onFocus: () => setRove(item.id),
              onKeyDown: (event: React.KeyboardEvent<HTMLElement>) =>
                onTriggerKeyDown(event, item, index),
            };
            const cls = cn(
              "relative inline-flex shrink-0 items-center gap-1 rounded-2 font-medium whitespace-nowrap transition-colors select-none @max-[26rem]/bridge-menu:px-2",
              spec.trigger,
              FOCUS,
              isOpen ? "text-foreground" : "text-ink-2 hover:text-foreground",
              disabled && "cursor-not-allowed",
            );
            return (
              <li key={item.id} className="flex">
                {panel ? (
                  <button
                    {...common}
                    ref={(node) => {
                      if (node) triggers.current.set(item.id, node);
                      else triggers.current.delete(item.id);
                    }}
                    type="button"
                    disabled={disabled}
                    aria-expanded={isOpen}
                    aria-controls={layerId(item.id)}
                    onClick={(event) => {
                      if (event.detail === 0) {
                        request(isOpen ? null : item.id, "key");
                        return;
                      }
                      const recent =
                        opened.current.by === "hover" &&
                        performance.now() - opened.current.at < PRESS_GRACE;
                      if (isOpen && recent) return;
                      request(isOpen ? null : item.id, "press");
                    }}
                    className={cn(cls, !disabled && "cursor-pointer")}
                  >
                    {item.label}
                    <motion.span
                      aria-hidden
                      className="flex shrink-0 @max-[26rem]/bridge-menu:hidden"
                      initial={false}
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    >
                      <ChevronDown className="size-3.5" strokeWidth={2} />
                    </motion.span>
                  </button>
                ) : (
                  <a
                    {...common}
                    ref={(node) => {
                      if (node) triggers.current.set(item.id, node);
                      else triggers.current.delete(item.id);
                    }}
                    href={disabled ? undefined : item.href}
                    aria-disabled={disabled || undefined}
                    onClick={(event) =>
                      choose(
                        { id: item.id, label: item.label, href: item.href },
                        item.id,
                        event,
                      )
                    }
                    className={cls}
                  >
                    {item.label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>

        {/* The one panel. It follows the triggers in the document, so Tab
            from an open trigger walks straight into it. */}
        <motion.div
          ref={panelRef}
          data-bridge-menu-panel=""
          onKeyDown={onPanelKeyDown}
          className={cn(
            "absolute left-0 z-30 rounded-3 border border-hairline-strong bg-popover shadow-[0_12px_32px_-8px_color-mix(in_oklab,black_32%,transparent)]",
            current === null && "pointer-events-none",
          )}
          style={{
            top: panelTop,
            x: panelX,
            y: panelY,
            width: panelW,
            height: panelH,
            opacity: panelOpacity,
            scale: panelScale,
            transformOrigin: origin,
          }}
        >
          {notch ? (
            <motion.span
              aria-hidden
              className="absolute -top-[5px] size-2.5 rotate-45 rounded-tl-[2px] border-t border-l border-hairline-strong bg-popover"
              style={{ left: notchLeft }}
            />
          ) : null}
          <div className="absolute inset-0 overflow-clip rounded-3">
            {panelItems.map((item) => (
              <Layer
                key={item.id}
                id={item.id}
                shown={shownId === item.id}
                live={current === item.id}
                sliding={sliding}
                dir={view.dir}
                travel={travel}
                motionSafe={motionSafe}
                labelledBy={triggerId(item.id)}
                bind={bindLayer}
                onScroll={() => api.current?.measureMore()}
              >
                <div id={layerId(item.id)}>{renderPanel(item)}</div>
              </Layer>
            ))}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-popover to-transparent"
              style={{ opacity: more }}
            />
          </div>
        </motion.div>

        {end !== undefined ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">{end}</div>
        ) : null}
      </nav>

      {hasPage ? (
        <div className="relative flex flex-1 flex-col">
          {children}
          {scrim ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 bg-background/55"
              style={{ opacity: scrimOpacity }}
            />
          ) : null}
        </div>
      ) : null}

      {bridge === "show" ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 z-40 size-full overflow-visible"
        >
          <motion.polygon
            points={wedgePoints}
            strokeWidth={1}
            strokeLinejoin="round"
            style={{
              fill: "var(--bridge-menu-accent)",
              stroke: "var(--bridge-menu-accent)",
              fillOpacity: wedgeFill,
              strokeOpacity: wedgeStroke,
            }}
          />
          <motion.circle
            cx={apexX}
            cy={apexY}
            r={2.5}
            style={{ fill: "var(--bridge-menu-accent)", opacity: wedgeStroke }}
          />
        </svg>
      ) : null}
    </div>
  );
}
