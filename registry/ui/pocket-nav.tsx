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
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PocketNavLink = {
  id: string;
  label: string;
  /** Render the link as an anchor to this address. Without it, a button. */
  href?: string;
  /** How often it is used: with `priority="usage"`, the least used tuck first. */
  usage?: number;
};

export type PocketNavPriority = "order" | "usage";
export type PocketNavPocket = "more" | "dots";

export type PocketNavProps = {
  links: PocketNavLink[];
  /** Controlled: the current link's id, marked aria-current and never tucked. */
  value?: string;
  /** Initial current link when uncontrolled. @default the first link */
  defaultValue?: string;
  /** Fires from the press, key or menu choice that made a link current. */
  onValueChange?: (id: string) => void;
  /** The links in the pocket, in bar order: once measured, then each time the set changes. */
  onPocketChange?: (ids: string[]) => void;
  /** The navigation's accessible name. @default "Main" */
  label?: string;
  /** The most links the bar shows at once; the rest wait in the pocket even with room to spare. @default all */
  items?: number;
  /** Tuck from the end of the bar (`order`) or the least used first (`usage`). @default "order" */
  priority?: PocketNavPriority;
  /** A "More" button with a count, or a round three-dot button. @default "more" */
  pocket?: PocketNavPocket;
  /** Play the tucks, the count and the menu. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Metrics = { room: number; widths: Record<string, number>; pocket: number };

type Move = { dx: number; rank: number };

type Shown = {
  bar: string[];
  moves: Record<string, Move>;
  /** Links that went into the pocket with this change, in priority order. */
  tucked: string[];
  /** The first fit after measuring is not a change anyone made: no motion. */
  instant: boolean;
  measured: boolean;
  n: number;
};

/** Space between links in the bar, in px (gap-1). */
const GAP = 4;
const MENU_W = 192;

const r2 = (v: number) => Math.round(v * 100) / 100;

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** The order links go into the pocket, first to last. */
function tuckOrder(
  links: PocketNavLink[],
  priority: PocketNavPriority,
): string[] {
  if (priority === "usage") {
    return links
      .map((l, i) => ({ id: l.id, usage: l.usage ?? 0, i }))
      .sort((a, b) => a.usage - b.usage || b.i - a.i)
      .map((l) => l.id);
  }
  return links.map((l) => l.id).reverse();
}

/**
 * Which links stay in the bar: as many as fit beside the pocket, in their
 * own order, never the current one, and never more than `most`.
 */
function fit(
  links: PocketNavLink[],
  metrics: Metrics | null,
  current: string | undefined,
  priority: PocketNavPriority,
  most: number,
): string[] {
  const order = links.map((l) => l.id);
  const keep = new Set(order);
  const candidates = tuckOrder(links, priority).filter((id) => id !== current);
  let next = 0;
  const tuckOne = () => {
    const id = candidates[next];
    next += 1;
    if (id !== undefined) keep.delete(id);
    return id !== undefined;
  };
  while (keep.size > most && tuckOne()) {
    // The cap: links beyond it wait in the pocket whatever the room.
  }
  if (metrics) {
    const span = (withPocket: boolean) => {
      let total = 0;
      for (const id of keep) total += metrics.widths[id] ?? 0;
      const parts = keep.size + (withPocket ? 1 : 0);
      return (
        total + (withPocket ? metrics.pocket : 0) + GAP * Math.max(0, parts - 1)
      );
    };
    if (span(keep.size < order.length) > metrics.room + 0.5) {
      while (span(true) > metrics.room + 0.5 && tuckOne()) {
        // Tuck in priority order until the bar and its pocket fit.
      }
    }
  }
  return order.filter((id) => keep.has(id));
}

/** Where each link and the pocket sit along the bar, from measured widths. */
function positions(bar: string[], metrics: Metrics | null) {
  const at: Record<string, { x: number; w: number }> = {};
  let x = 0;
  for (const id of bar) {
    const w = metrics?.widths[id] ?? 0;
    at[id] = { x, w };
    x += w + GAP;
  }
  return { at, pocket: x + (metrics?.pocket ?? 0) / 2 };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn(
        "size-3.5 shrink-0 transition-transform duration-200",
        open && "rotate-180",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6.5 8 10l4-3.5" />
    </svg>
  );
}

function Dots() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0">
      <circle cx="3.5" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}

const LINK =
  "flex h-8 min-w-0 items-center rounded-2 px-3 text-sm whitespace-nowrap";

/**
 * A navigation bar that never wraps and never scrolls: the links it cannot
 * fit go into a pocket at its end. A ResizeObserver reads the room and each
 * link's natural width (from a clipped, zero-height measuring row, so late
 * fonts re-measure); the bar keeps as many links as fit beside the pocket,
 * in their own order, and never the current page.
 *
 * As the bar narrows, a link that no longer fits slides along it into the
 * pocket, shrinking and fading on the exit ease, while the links behind it
 * close the gap on glide; several at once go in priority order, `cascade`
 * apart. The pocket takes each one with a small squeeze on snap, and its
 * count rolls as it lands. As room returns, links slide back out to their
 * places on snap. `priority` tucks from the end or the least used first;
 * `items` caps how many the bar shows at all.
 *
 * The pocket is a menu button: its menu lists the tucked links, rises from
 * 4px on snap, and choosing one makes it current — it slides out into the
 * bar while whichever link now fits least slides in. The bar is one tab stop
 * (arrows move, Home and End jump); in the menu, arrows, Home, End and first
 * letters move, Enter chooses, and Escape or Tab close it and hand focus back
 * to the pocket. Under reduced motion links fade where they stand.
 */
export function PocketNav({
  links,
  value,
  defaultValue,
  onValueChange,
  onPocketChange,
  label = "Main",
  items,
  priority = "order",
  pocket = "more",
  sound = false,
  disabled = false,
  className,
}: PocketNavProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const menuId = `${uid}-menu`;
  const pocketId = `${uid}-pocket`;

  const [own, setOwn] = React.useState(defaultValue ?? links[0]?.id);
  const current = value ?? own;
  const most =
    items === undefined ? links.length : Math.max(1, Math.round(items));

  const [metrics, setMetrics] = React.useState<Metrics | null>(null);
  const bar = fit(links, metrics, current, priority, most);
  const inPocket = links.filter((l) => !bar.includes(l.id));
  const count = inPocket.length;

  // A change in who is in the bar, frozen with the distances each link
  // travels to or from the pocket, worked out from the measured widths.
  const [shown, setShown] = React.useState<Shown>({
    bar,
    moves: {},
    tucked: [],
    instant: true,
    measured: false,
    n: 0,
  });
  if (!sameList(shown.bar, bar) || shown.measured !== (metrics !== null)) {
    const before = positions(shown.bar, metrics);
    const after = positions(bar, metrics);
    const order = tuckOrder(links, priority);
    const going = shown.bar.filter((id) => !bar.includes(id));
    const coming = bar.filter((id) => !shown.bar.includes(id));
    going.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    coming.sort((a, b) => order.indexOf(b) - order.indexOf(a));
    const moves: Record<string, Move> = {};
    going.forEach((id, rank) => {
      const from = before.at[id];
      moves[id] = {
        dx: r2(after.pocket - (from ? from.x + from.w / 2 : after.pocket)),
        rank,
      };
    });
    coming.forEach((id, rank) => {
      const to = after.at[id];
      const pocketWas =
        shown.bar.length < links.length ? before.pocket : after.pocket;
      moves[id] = {
        dx: r2(pocketWas - (to ? to.x + to.w / 2 : pocketWas)),
        rank,
      };
    });
    const instant = !shown.measured;
    setShown({
      bar,
      moves: instant ? {} : moves,
      tucked: instant ? [] : going,
      instant,
      measured: metrics !== null,
      n: shown.n + 1,
    });
  }

  // Said once the count has settled — a drag runs through several — and
  // never for the first fit on arrival.
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const armed = metrics !== null;
  const firstFit = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!armed) return;
    if (firstFit.current === null) {
      firstFit.current = count;
      return;
    }
    const text =
      count === 0
        ? "Every link fits."
        : `${count} ${count === 1 ? "link" : "links"} in the pocket.`;
    const timer = window.setTimeout(
      () => setSaid((prev) => ({ n: prev.n + 1, text })),
      700,
    );
    return () => window.clearTimeout(timer);
  }, [count, armed]);

  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(-1);
  const [focusAt, setFocusAt] = React.useState<string | null>(null);
  const [openedBy, setOpenedBy] = React.useState<"first" | "last" | "pointer">(
    "pointer",
  );
  // How many of this change's tucked links have landed in the pocket; the
  // count it shows moves on as each one lands.
  const [landed, setLanded] = React.useState({ n: 0, k: 0 });
  const waiting =
    motionSafe && !shown.instant
      ? Math.max(0, shown.tucked.length - (landed.n === shown.n ? landed.k : 0))
      : 0;
  const shownCount = Math.max(0, count - waiting);
  const [menuLeft, setMenuLeft] = React.useState(0);
  const [menuWidth, setMenuWidth] = React.useState(MENU_W);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const pocketRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const linkNodes = React.useRef(new Map<string, HTMLElement>());
  const pendingFocus = React.useRef<string | null>(null);
  const squeeze = useMotionValue(1);
  const squeezeAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const activity = React.useRef({ pressing: false, keyAt: -Infinity });

  const offer = React.useMemo(
    () => (motionSafe ? cascade(Math.max(2, links.length)) : 0),
    [motionSafe, links.length],
  );

  /** Tucks only sound while the visitor is dragging or has just pressed a key. */
  const visitorIsActing = () =>
    activity.current.pressing ||
    performance.now() - activity.current.keyAt < 600;

  const panAt = (x: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + x, rootRef.current) : 0;
  };

  const metricsRef = React.useRef(metrics);
  const reportRef = React.useRef(onPocketChange);
  const visitorIsActingRef = React.useRef(visitorIsActing);
  const panAtRef = React.useRef(panAt);
  React.useEffect(() => {
    metricsRef.current = metrics;
    reportRef.current = onPocketChange;
    visitorIsActingRef.current = visitorIsActing;
    panAtRef.current = panAt;
  });

  // The pocket takes each tucked link as it lands: a squeeze, a tick, and
  // the count moving on by one. Links coming out leave it at once.
  const landings = shown.n;
  React.useEffect(() => {
    if (shown.measured) {
      reportRef.current?.(
        links.filter((l) => !shown.bar.includes(l.id)).map((l) => l.id),
      );
    }
    const going = shown.tucked;
    const voiced = !shown.instant && visitorIsActingRef.current();
    const pocketX = positions(shown.bar, metricsRef.current).pocket;
    const pan = panAtRef.current(pocketX);
    if (!motionSafe || going.length === 0) {
      if (voiced && Object.keys(shown.moves).length > 0) {
        audio.play("swish", { pitch: 1.1, gain: 0.3, pan });
      }
      return;
    }
    const batch = shown.n;
    const start = count - going.length;
    const pending: number[] = [];
    going.forEach((_, rank) => {
      const lead = rank * offer * 1000;
      if (voiced) {
        pending.push(
          window.setTimeout(
            () =>
              audio.play("swish", {
                pitch: r2(1.2 - rank * 0.06),
                gain: 0.32,
                pan,
              }),
            Math.round(lead),
          ),
        );
      }
      pending.push(
        window.setTimeout(
          () => {
            setLanded({ n: batch, k: rank + 1 });
            squeezeAnim.current?.stop();
            squeeze.set(0.88);
            squeezeAnim.current = animate(squeeze, 1, springs.snap);
            if (voiced) {
              audio.play("tick", {
                pitch: r2(0.9 + (start + rank + 1) * 0.06),
                gain: 0.4,
                pan,
              });
            }
          },
          Math.round(lead + durations.base * 1000),
        ),
      );
    });
    return () => {
      for (const t of pending) window.clearTimeout(t);
    };
    // One run per change of the bar; the rest is read when it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landings]);

  // Who is pressing: a tuck made by a drag or a key is the visitor's.
  React.useEffect(() => {
    const act = activity.current;
    const down = () => {
      act.pressing = true;
    };
    const up = () => {
      act.pressing = false;
    };
    const key = () => {
      act.keyAt = performance.now();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("keydown", key, true);
    };
  }, []);

  React.useEffect(() => {
    const anim = squeezeAnim;
    return () => anim.current?.stop();
  }, []);

  // The room and every link's natural width, bound to the nodes as they
  // arrive: the bar for the room, the measuring row for the widths.
  const barNode = React.useRef<HTMLUListElement | null>(null);
  const measureNode = React.useRef<HTMLDivElement | null>(null);
  const measure = React.useCallback(() => {
    const barEl = barNode.current;
    const row = measureNode.current;
    if (!barEl || !row) return;
    const widths: Record<string, number> = {};
    let pocketW = 0;
    for (const el of Array.from(row.children) as HTMLElement[]) {
      const id = el.dataset.measure;
      if (id === "__pocket") pocketW = el.offsetWidth;
      else if (id) widths[id] = el.offsetWidth;
    }
    const next: Metrics = { room: barEl.clientWidth, widths, pocket: pocketW };
    setMetrics((prev) =>
      prev &&
      prev.room === next.room &&
      prev.pocket === next.pocket &&
      Object.keys(next.widths).every(
        (k) => prev.widths[k] === next.widths[k],
      ) &&
      Object.keys(prev.widths).length === Object.keys(next.widths).length
        ? prev
        : next,
    );
  }, []);
  const bindBar = React.useCallback(
    (node: HTMLUListElement | null) => {
      barNode.current = node;
      if (!node) return;
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    },
    [measure],
  );
  const bindMeasure = React.useCallback(
    (node: HTMLDivElement | null) => {
      measureNode.current = node;
      if (!node) return;
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    },
    [measure],
  );

  // The bar's own roving stop: the links in it, then the pocket.
  const stops = [...bar, ...(count > 0 ? ["__pocket"] : [])];
  const [stopRaw, setStop] = React.useState<string | null>(null);
  const stop =
    stopRaw && stops.includes(stopRaw)
      ? stopRaw
      : current && bar.includes(current)
        ? current
        : (stops[0] ?? null);

  const focusStop = (id: string) => {
    setStop(id);
    const node =
      id === "__pocket" ? pocketRef.current : linkNodes.current.get(id);
    node?.focus();
  };

  // A tucked link that had focus hands it to the pocket.
  React.useEffect(() => {
    const active = document.activeElement;
    for (const id of shown.tucked) {
      const node = linkNodes.current.get(id);
      if (node && active && node.contains(active)) {
        setStop("__pocket");
        pocketRef.current?.focus({ preventScroll: true });
      }
    }
  }, [shown]);

  const select = (id: string) => {
    if (disabled) return;
    if (value === undefined) setOwn(id);
    if (id !== current) onValueChange?.(id);
  };

  const openMenu = (by: "first" | "last" | "pointer") => {
    if (disabled || count === 0) return;
    const root = rootRef.current;
    const btn = pocketRef.current;
    if (root && btn) {
      const a = root.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      const width = Math.min(MENU_W, Math.round(a.width));
      setMenuWidth(width);
      setMenuLeft(Math.max(0, Math.round(b.right - a.left - width)));
    }
    setOpenedBy(by);
    setHi(by === "first" ? 0 : by === "last" ? count - 1 : -1);
    setOpen(true);
    audio.play("swish", {
      pitch: 1.3,
      gain: 0.26,
      pan: btn ? panFrom(btn.getBoundingClientRect().left, null) : 0,
    });
  };

  const closeMenu = (refocus: boolean) => {
    setOpen(false);
    setHi(-1);
    if (refocus) pocketRef.current?.focus({ preventScroll: true });
  };

  const highlight = (index: number) => {
    const n = inPocket.length;
    if (n === 0) return;
    const next = (index + n) % n;
    setHi(next);
    audio.play("tick", { pitch: r2(1.3 - next * 0.05), gain: 0.3 });
    const node =
      menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]")[next];
    node?.focus({ preventScroll: true });
  };

  const choose = (id: string) => {
    pendingFocus.current = id;
    setFocusAt(id);
    setStop(id);
    closeMenu(false);
    select(id);
  };

  // Focus into the menu once it is there: the first or last item for the
  // keyboard, the menu itself for a pointer.
  const bindMenu = React.useCallback(
    (node: HTMLDivElement | null) => {
      menuRef.current = node;
      if (!node) return;
      const items = node.querySelectorAll<HTMLElement>("[role=menuitem]");
      const target =
        openedBy === "first"
          ? items[0]
          : openedBy === "last"
            ? items[items.length - 1]
            : node;
      target?.focus({ preventScroll: true });
    },
    [openedBy],
  );

  // A press outside closes the menu; so does the page going away.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target))
        return;
      setOpen(false);
      setHi(-1);
    };
    const onHide = () => {
      if (document.hidden) {
        setOpen(false);
        setHi(-1);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [open]);

  // With nothing left in the pocket, the menu has nothing to show.
  if (open && count === 0) setOpen(false);

  const onBarKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (
      event.target !== event.currentTarget &&
      !(event.target as HTMLElement).dataset.stop
    ) {
      return;
    }
    const at = stop ? stops.indexOf(stop) : 0;
    let next = -1;
    if (event.key === "ArrowRight") next = Math.min(stops.length - 1, at + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, at - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = stops.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const id = stops[next];
    if (id) focusStop(id);
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const n = inPocket.length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        highlight(hi + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        highlight(hi < 0 ? n - 1 : hi - 1);
        return;
      case "Home":
        event.preventDefault();
        highlight(0);
        return;
      case "End":
        event.preventDefault();
        highlight(n - 1);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const link = inPocket[hi];
        if (link) choose(link.id);
        return;
      }
      case "Escape":
      case "Tab":
        // Handled here, where focus is: the stage must not see this Escape.
        event.preventDefault();
        closeMenu(true);
        return;
    }
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase();
      for (let step = 1; step <= n; step += 1) {
        const i = (Math.max(hi, -1) + step) % n;
        if (inPocket[i]?.label.toLowerCase().startsWith(letter)) {
          event.preventDefault();
          highlight(i);
          return;
        }
      }
    }
  };

  const linkRef = (id: string) => (node: HTMLElement | null) => {
    if (node) {
      linkNodes.current.set(id, node);
      if (pendingFocus.current === id) {
        pendingFocus.current = null;
        setFocusAt(id);
      }
    } else {
      linkNodes.current.delete(id);
    }
  };

  // Focus on a link chosen from the menu once it has arrived in the bar.
  React.useEffect(() => {
    if (!focusAt) return;
    const node = linkNodes.current.get(focusAt);
    if (!node) return;
    node.focus({ preventScroll: true });
    setFocusAt(null);
  }, [focusAt, shown.n]);

  const byId = new Map(links.map((l) => [l.id, l]));

  const still = shown.instant || !motionSafe;

  const tuck = (id: string) => ({
    tuck: (moves: Record<string, Move>) => {
      const m = moves[id];
      if (still && motionSafe) {
        return { opacity: 0, transition: { duration: 0 } };
      }
      return motionSafe
        ? {
            x: m?.dx ?? 0,
            y: distances.nudge * 0.75,
            scale: 0.6,
            opacity: 0,
            transition: {
              ...exitFor(durations.base / 0.6),
              delay: (m?.rank ?? 0) * offer,
            },
          }
        : { opacity: 0, transition: { duration: durations.fast } };
    },
    out: (moves: Record<string, Move>) => {
      const m = moves[id];
      // The first fit places links; it does not bring them out of anywhere.
      if (still && motionSafe) return { x: 0, scale: 1, opacity: 1 };
      return motionSafe
        ? { x: m?.dx ?? 0, scale: 0.6, opacity: 0 }
        : { opacity: 0 };
    },
    rest: (moves: Record<string, Move>) => {
      const m = moves[id];
      return {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        transition: motionSafe
          ? {
              ...springs.snap,
              delay: (m?.rank ?? 0) * offer,
              opacity: {
                duration: durations.fast,
                delay: (m?.rank ?? 0) * offer,
              },
            }
          : { duration: durations.fast },
      };
    },
  });

  const pocketName =
    pocket === "more"
      ? `More, ${count} ${count === 1 ? "link" : "links"}`
      : `${count} more ${count === 1 ? "link" : "links"}`;

  return (
    <nav
      ref={rootRef}
      aria-label={label}
      className={cn(
        "relative w-full min-w-0",
        disabled && "opacity-60",
        className,
      )}
    >
      <ul
        ref={bindBar}
        onKeyDown={onBarKeyDown}
        className="relative flex h-11 min-w-0 items-center gap-1 overflow-x-clip px-0 [overflow-clip-margin:6px]"
      >
        <AnimatePresence initial={false} mode="popLayout" custom={shown.moves}>
          {bar.map((id) => {
            const link = byId.get(id);
            if (!link) return null;
            const isCurrent = id === current;
            const common = {
              ref: linkRef(id),
              "data-stop": "1",
              tabIndex: stop === id ? 0 : -1,
              "aria-current": isCurrent ? ("page" as const) : undefined,
              onFocus: () => setStop(id),
              onClick: (event: React.MouseEvent) => {
                if (disabled) {
                  event.preventDefault();
                  return;
                }
                if (!link.href) event.preventDefault();
                select(id);
              },
              className: cn(
                LINK,
                "outline-none transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                isCurrent
                  ? "bg-surface-2 font-medium text-foreground"
                  : "text-ink-2 hover:bg-surface-2/60 hover:text-foreground",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
              ),
            };
            return (
              <motion.li
                key={id}
                layout={motionSafe ? "position" : false}
                custom={shown.moves}
                variants={tuck(id)}
                initial="out"
                animate="rest"
                exit="tuck"
                transition={{ layout: springs.glide }}
                // The current page is never tucked; when even it and the
                // pocket cannot fit, its label gives way instead.
                className={cn(
                  "relative",
                  isCurrent ? "flex min-w-0 shrink" : "shrink-0",
                )}
              >
                {link.href ? (
                  <a href={link.href} title={link.label} {...common}>
                    <span className="truncate">{link.label}</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    title={link.label}
                    disabled={disabled}
                    {...common}
                  >
                    <span className="truncate">{link.label}</span>
                  </button>
                )}
              </motion.li>
            );
          })}
          {count > 0 ? (
            <motion.li
              key="__pocket"
              layout={motionSafe ? "position" : false}
              initial={
                shown.instant
                  ? false
                  : motionSafe
                    ? { opacity: 0, scale: 0.6 }
                    : { opacity: 0 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, layout: springs.glide }
                  : { duration: durations.fast }
              }
              className="relative shrink-0"
            >
              <motion.button
                ref={pocketRef}
                id={pocketId}
                type="button"
                data-stop="1"
                tabIndex={stop === "__pocket" ? 0 : -1}
                disabled={disabled}
                aria-label={pocketName}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                onFocus={() => setStop("__pocket")}
                onClick={() => (open ? closeMenu(false) : openMenu("pointer"))}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    openMenu("first");
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    openMenu("last");
                  } else if (
                    (event.key === "Enter" || event.key === " ") &&
                    !open
                  ) {
                    event.preventDefault();
                    openMenu("first");
                  }
                }}
                style={{ scale: squeeze }}
                className={cn(
                  "relative flex h-8 shrink-0 items-center justify-center transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  pocket === "more"
                    ? "gap-1.5 rounded-2 px-2.5 text-sm"
                    : "size-8 rounded-full",
                  open
                    ? "bg-surface-2 text-foreground"
                    : "text-ink-2 hover:bg-surface-2/60 hover:text-foreground",
                  disabled ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                {pocket === "more" ? (
                  <>
                    <span>More</span>
                    <span
                      aria-hidden
                      className="relative flex h-4 min-w-4 items-center justify-center overflow-clip rounded-full bg-cobalt-wash px-1 font-mono text-[10px] text-cobalt-bright tabular-nums"
                    >
                      <motion.span
                        key={shownCount}
                        initial={motionSafe ? { y: 8, opacity: 0 } : false}
                        animate={{ y: 0, opacity: 1 }}
                        transition={springs.snap}
                      >
                        {shownCount}
                      </motion.span>
                    </span>
                    <Chevron open={open} />
                  </>
                ) : (
                  <>
                    <Dots />
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center overflow-clip rounded-full bg-cobalt-bright font-mono text-[9px] text-primary-foreground tabular-nums"
                    >
                      <motion.span
                        key={shownCount}
                        initial={motionSafe ? { y: 8, opacity: 0 } : false}
                        animate={{ y: 0, opacity: 1 }}
                        transition={springs.snap}
                      >
                        {shownCount}
                      </motion.span>
                    </span>
                  </>
                )}
              </motion.button>
            </motion.li>
          ) : null}
        </AnimatePresence>
      </ul>

      {/* Natural widths, read without adding scroll width: invisible, in a
          zero-height box that clips. */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-clip"
      >
        <div ref={bindMeasure} className="flex w-max gap-1">
          {links.map((l) => (
            <span
              key={l.id}
              data-measure={l.id}
              className={cn(LINK, "shrink-0 font-medium")}
            >
              {l.label}
            </span>
          ))}
          <span
            data-measure="__pocket"
            className={cn(
              "flex h-8 shrink-0 items-center",
              pocket === "more" ? "gap-1.5 px-2.5 text-sm" : "size-8",
            )}
          >
            {pocket === "more" ? (
              <>
                <span>More</span>
                <span className="h-4 min-w-4 px-1 font-mono text-[10px]">
                  {Math.max(9, links.length)}
                </span>
                <span className="size-3.5" />
              </>
            ) : null}
          </span>
        </div>
      </div>

      <AnimatePresence>
        {open && count > 0 ? (
          <motion.div
            ref={bindMenu}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-labelledby={pocketId}
            onKeyDown={onMenuKeyDown}
            initial={
              motionSafe
                ? { opacity: 0, y: -distances.nudge, scale: 0.98 }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
            className="absolute top-full z-20 mt-1.5 flex max-h-[9.75rem] origin-top-right flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 shadow-[var(--shadow-raised)] outline-none"
            style={{ left: menuLeft, width: menuWidth }}
          >
            {inPocket.map((link, i) => (
              <motion.a
                key={link.id}
                role="menuitem"
                href={link.href}
                tabIndex={-1}
                onClick={(event) => {
                  if (!link.href) event.preventDefault();
                  choose(link.id);
                }}
                onPointerMove={(event) => {
                  if (event.pointerType === "mouse" && hi !== i) {
                    setHi(i);
                    event.currentTarget.focus({ preventScroll: true });
                  }
                }}
                initial={
                  motionSafe ? { opacity: 0, y: -distances.nudge } : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.snap,
                        delay: 0.04 + i * cascade(inPocket.length),
                      }
                    : { duration: 0 }
                }
                className={cn(
                  "flex h-8 shrink-0 cursor-pointer items-center rounded-2 px-2.5 text-sm text-foreground outline-none",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  hi === i && "bg-cobalt-wash text-cobalt-bright",
                )}
              >
                <span className="truncate">{link.label}</span>
              </motion.a>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </nav>
  );
}
