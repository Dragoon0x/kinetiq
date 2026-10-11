"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FilingTrayCard = {
  /** Stable id: keys, labels and focus follow it. */
  id: string;
  title: string;
  /** The card's text. */
  body?: React.ReactNode;
  /** A short line above the title, e.g. a time. */
  meta?: string;
  /** A small chip on the right of the meta line. */
  tag?: string;
};

export type FilingTrayProps = {
  /** The cards, in reading order. @default defaultFilingCards */
  cards?: FilingTrayCard[];
  /** How far a filed card tilts, 0 to 8 degrees, alternating sides: a square stack to a loose pile. @default 3 */
  tilt?: number;
  /** How far a filed card dims as more land on it, 0 to 1. @default 0.45 */
  fade?: number;
  /** How much of each filed card's top edge peeks above the next, 0 to 16 px. @default 8 */
  offset?: number;
  /** Where the first filed card sticks, px below the top of the scroll container; the tray's label sits above it. @default 34 */
  inset?: number;
  /** How many filed cards keep peeking; deeper ones sink out of sight. @default 5 */
  maxDepth?: number;
  /** Space between cards that are still to be read, px. @default 16 */
  gap?: number;
  /** A card that lands presses the pile and settles with a small bounce. @default true */
  settle?: boolean;
  /** Draw the tray behind the pile, with its count on a label strip. @default true */
  tray?: boolean;
  /** The word on the tray's label before the count. @default "Filed" */
  trayLabel?: string;
  /** Seeds which way and how far each card tilts. @default 1 */
  seed?: number;
  /** Heading level of the card titles. @default 3 */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Fires from the scroll that filed or lifted a card, with how many are filed. */
  onFiledChange?: (count: number) => void;
  /** The stack's accessible name. @default "Filing tray" */
  label?: string;
  className?: string;
};

export const defaultFilingCards: FilingTrayCard[] = [
  {
    id: "bar",
    meta: "05:50",
    tag: "Tide",
    title: "Low water at the bar",
    body: "Gauge read 0.4 m at slack. The flats are open to the second marker; the channel holds a thin silver line.",
  },
  {
    id: "curlew",
    meta: "06:15",
    tag: "Birds",
    title: "Curlew on the north flat",
    body: "Eleven curlew feeding in a loose line, moving upstream with the edge of the water.",
  },
  {
    id: "logger",
    meta: "06:40",
    tag: "Gear",
    title: "Logger 3 swapped",
    body: "Battery at 12%. The new logger is set to ten-minute intervals, sealed and tied to the post at knee height.",
  },
  {
    id: "transect",
    meta: "07:05",
    tag: "Water",
    title: "Salinity transect",
    body: "Five samples from the footbridge to the reed bed: 31, 29, 24, 17 and 9 ppt.",
  },
  {
    id: "heron",
    meta: "07:20",
    tag: "Birds",
    title: "Heron count",
    body: "Four grey herons at the weir, one juvenile. Two left when the dog walkers came through.",
  },
  {
    id: "flood",
    meta: "07:45",
    tag: "Tide",
    title: "Flood begins",
    body: "Water turning at the bar. The flats cover from the seaward side, fastest near the creek mouths.",
  },
  {
    id: "trap",
    meta: "08:10",
    tag: "Gear",
    title: "Camera trap check",
    body: "Card full: 212 frames overnight. A fox twice, an otter once at 03:12, the rest wind in the grass.",
  },
  {
    id: "packed",
    meta: "08:30",
    tag: "Notes",
    title: "Packed up",
    body: "All three loggers running. Back for the 14:00 low water to read the transect again.",
  },
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (v: number) => {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};

/** A small integer hash, unsigned: the same tilt for the same card every time. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}

/** Room the tray keeps around the pile, and its label strip at the back, px. */
const PAD = 6;
const TAB = 22;
/** Scroll that holds the finished pile before it leaves, px. */
const HOLD = 96;

/** The nearest ancestor that scrolls vertically, or null for the page. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) {
      return el;
    }
  }
  return null;
}

type Live = {
  /** Shown cover depth, its velocity, the landing press and its velocity. */
  depth: number;
  depthV: number;
  press: number;
  pressV: number;
  /** Landing progress last frame, to hear a landing as it happens. */
  landed: number;
};

/**
 * A scroll-linked filing tray. Inside whatever scrolls it, each card slides
 * up and files itself onto a tray near the top: it sticks there, and as the
 * next card slides up over it, it tilts a little to one side, sinks a hair
 * and dims, so a small untidy pile grows above the card being read — every
 * older card's top edge peeking `offset` px above the next. The tray grows
 * with the pile and counts it on a label strip at its back. Scrolling back lifts the cards off
 * again in order.
 *
 * Each card's cover depth is measured from the scroll; the shown depth
 * follows it on a critically damped spring with the springs.glide constants,
 * so the tilts lag a breath behind the scroll and settle like paper, and a
 * card that lands presses the pile on the springs.recoil constants: a small
 * dip and two small bounces. Tab or Arrow Down moves to the next card and
 * scrolls it to the reading position, filing the one before; Arrow Up lifts
 * it back. Under reduced motion the pile still forms and filed cards still
 * dim, without tilt, press or lag.
 */
export function FilingTray({
  cards = defaultFilingCards,
  tilt = 3,
  fade = 0.45,
  offset = 8,
  inset = 34,
  maxDepth = 5,
  gap = 16,
  settle = true,
  tray = true,
  trayLabel = "Filed",
  seed = 1,
  headingLevel = 3,
  onFiledChange,
  label = "Filing tray",
  className,
}: FilingTrayProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const Heading = `h${headingLevel}` as "h3";
  const depthCap = Math.max(1, Math.round(maxDepth));
  const step = clamp(offset, 0, 16);
  const stickyTop = (i: number) => inset + Math.min(i, depthCap) * step;

  const [filed, setFiled] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const trayRef = React.useRef<HTMLDivElement | null>(null);
  const items = React.useRef(new Map<string, HTMLLIElement>());
  const faces = React.useRef(new Map<string, HTMLElement>());
  const live = React.useRef(new Map<string, Live>());
  const engine = React.useRef<{ kick: () => void } | null>(null);
  const filedRef = React.useRef(0);

  const config = {
    ids: cards.map((c) => c.id),
    tilt: clamp(tilt, 0, 8),
    fade: clamp(fade, 0, 1),
    step,
    inset,
    depthCap,
    settle,
    seed,
    motionSafe,
    onFiledChange,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.kick();
  });

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = scrollParent(root);
    const target: HTMLElement | Window = scroller ?? window;
    let frame = 0;
    let last = 0;
    let visible = true;
    let announceTimer = 0;
    let announced = filedRef.current;

    const frameOnce = (now: number) => {
      frame = 0;
      const c = latest.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
      // Read every position first, then write: one layout per frame.
      const n = c.ids.length;
      const heights: number[] = [];
      const tops: number[] = [];
      for (const id of c.ids) {
        const li = items.current.get(id);
        heights.push(li ? li.offsetHeight : 0);
        tops.push(li ? li.getBoundingClientRect().top - top0 : 0);
      }
      const sticky = (i: number) => c.inset + Math.min(i, c.depthCap) * c.step;
      // Landing progress: 0 while a card is still in the column, 1 once it
      // lies on the pile. It starts as its top meets the pile's bottom.
      const land: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const approach =
          i === 0
            ? Math.max(24, (heights[0] ?? 0) * 0.5)
            : Math.max(24, sticky(i - 1) + (heights[i - 1] ?? 0) - sticky(i));
        land.push(clamp(1 - ((tops[i] ?? 0) - sticky(i)) / approach, 0, 1));
      }
      let count = 0;
      for (const l of land) if (l > 0.98) count += 1;

      let busy = false;
      let cover = 0;
      for (let i = n - 1; i >= 0; i -= 1) {
        const id = c.ids[i] ?? "";
        const state = live.current.get(id) ?? {
          depth: 0,
          depthV: 0,
          press: 0,
          pressV: 0,
          landed: 0,
        };
        live.current.set(id, state);
        const goal = cover;
        cover += land[i] ?? 0;
        const l = land[i] ?? 0;
        if (c.motionSafe) {
          // Shown depth on the glide constants: critically damped, no
          // overshoot, a breath behind the scroll.
          const k = springs.glide.stiffness / springs.glide.mass;
          const d = springs.glide.damping / springs.glide.mass;
          const a = -k * (state.depth - goal) - d * state.depthV;
          state.depthV += a * dt;
          state.depth += state.depthV * dt;
          if (
            Math.abs(state.depth - goal) < 0.001 &&
            Math.abs(state.depthV) < 0.001
          ) {
            state.depth = goal;
            state.depthV = 0;
          } else busy = true;
          // A landing presses the pile on the recoil constants.
          if (c.settle && state.landed <= 0.98 && l > 0.98) {
            state.pressV -= 40;
          }
          const kp = springs.recoil.stiffness / springs.recoil.mass;
          const dp = springs.recoil.damping / springs.recoil.mass;
          const ap = -kp * state.press - dp * state.pressV;
          state.pressV += ap * dt;
          state.press += state.pressV * dt;
          if (Math.abs(state.press) < 0.002 && Math.abs(state.pressV) < 0.02) {
            state.press = 0;
            state.pressV = 0;
          } else busy = true;
        } else {
          state.depth = goal;
          state.depthV = 0;
          state.press = 0;
          state.pressV = 0;
        }
        state.landed = l;

        const face = faces.current.get(id);
        if (!face) continue;
        const sideRand = hash(i * 7919 + Math.round(c.seed) * 104729);
        const side = (i % 2 === 0 ? -1 : 1) * (0.6 + 0.4 * sideRand);
        const deep = Math.min(state.depth, c.depthCap + 1);
        const lean = c.motionSafe ? smooth(Math.min(state.depth, 1)) : 0;
        const rot = side * c.tilt * lean;
        const shift = side * 2 * lean;
        const scale = c.motionSafe
          ? 1 - 0.016 * Math.min(deep, 4) + state.press * 0.015
          : 1;
        const lift = c.motionSafe ? state.press * -2 : 0;
        face.style.transform = `translate(${r2(shift)}px, ${r2(lift)}px) rotate(${r2(rot)}deg) scale(${r3(scale)})`;
        face.style.setProperty(
          "--ft-dim",
          String(r3(c.fade * (1 - Math.pow(0.55, state.depth)))),
        );
        face.style.setProperty("--ft-lift", String(r3(4 * l * (1 - l))));
        face.style.opacity = String(
          r3(clamp(1 - (state.depth - c.depthCap), 0, 1)),
        );
      }

      // The tray reaches from its label strip above the first card to just
      // below the top of the pile, growing as each card lands.
      const shelf = trayRef.current;
      if (shelf) {
        let bottom = sticky(0) + (heights[0] ?? 0);
        for (let i = 1; i < n; i += 1) {
          const l = land[i] ?? 0;
          if (l <= 0) break;
          bottom = Math.max(
            bottom,
            bottom + (sticky(i) + (heights[i] ?? 0) - bottom) * l,
          );
        }
        const height = bottom + PAD - (sticky(0) - PAD - TAB);
        shelf.style.height = `${r2(height)}px`;
        shelf.style.opacity = String(r3(smooth(land[0] ?? 0)));
      }

      if (count !== filedRef.current) {
        filedRef.current = count;
        setFiled(count);
        c.onFiledChange?.(count);
        // Announced once the scroll rests, never per card while it runs.
        window.clearTimeout(announceTimer);
        announceTimer = window.setTimeout(() => {
          if (filedRef.current === announced) return;
          announced = filedRef.current;
          setSaid((s) => ({
            n: s.n + 1,
            text: `${announced} of ${latest.current.ids.length} filed.`,
          }));
        }, 600);
      }

      if (busy && visible && !document.hidden) {
        frame = window.requestAnimationFrame(frameOnce);
      } else last = 0;
    };

    const kick = () => {
      if (frame || !visible) return;
      frame = window.requestAnimationFrame(frameOnce);
    };
    engine.current = { kick };

    const onScroll = () => kick();
    target.addEventListener("scroll", onScroll, { passive: true });
    const sizer = new ResizeObserver(() => kick());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible = Boolean(entry?.isIntersecting);
      if (visible) kick();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    kick();

    return () => {
      target.removeEventListener("scroll", onScroll);
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(announceTimer);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (engine.current?.kick === kick) engine.current = null;
    };
  }, []);

  /** Scrolls so card `i` is the one being read: every card before it filed. */
  const readAt = (i: number) => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = scrollParent(root);
    const list = cards.map((c) => items.current.get(c.id));
    const heights = list.map((li) => li?.offsetHeight ?? 0);
    const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
    const now = scroller ? scroller.scrollTop : window.scrollY;
    const startOfList = root.getBoundingClientRect().top - top0 + now;
    let natural = startOfList;
    for (let j = 0; j < i; j += 1) natural += (heights[j] ?? 0) + gap;
    const pileBottom =
      i === 0
        ? stickyTop(0) + (heights[0] ?? 0) * 0.5 + 8
        : stickyTop(i - 1) + (heights[i - 1] ?? 0);
    const top = Math.max(0, natural - pileBottom);
    const behavior: ScrollBehavior = motionSafe ? "smooth" : "auto";
    if (scroller) scroller.scrollTo({ top, behavior });
    else window.scrollTo({ top, behavior });
  };

  const focusCard = (i: number) => {
    const next = cards[clamp(i, 0, cards.length - 1)];
    if (!next) return;
    faces.current.get(next.id)?.focus({ preventScroll: true });
  };

  const onCardKeyDown = (event: React.KeyboardEvent, i: number) => {
    const moves: Record<string, number> = {
      ArrowDown: i + 1,
      j: i + 1,
      ArrowUp: i - 1,
      k: i - 1,
      Home: 0,
      End: cards.length - 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    focusCard(to);
  };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      aria-describedby={hintId}
      className={cn(
        "group/filing-tray relative isolate w-full overflow-x-clip px-3",
        className,
      )}
    >
      {tray ? (
        <div
          aria-hidden
          className="pointer-events-none sticky z-0 h-0"
          style={{ top: stickyTop(0) - PAD - TAB }}
        >
          <div
            ref={trayRef}
            className="absolute -inset-x-1.5 top-0 flex flex-col overflow-clip rounded-4 border border-hairline bg-surface-2 opacity-0 shadow-[inset_0_2px_6px_color-mix(in_oklab,black_10%,transparent)]"
            style={{ height: 0 }}
          >
            <div
              className="flex shrink-0 items-center justify-between gap-2 px-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              style={{ height: TAB }}
            >
              <span className="truncate">
                {trayLabel} {filed} of {cards.length}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {cards.map((c, i) => (
                  <span
                    key={c.id}
                    className={cn(
                      "size-1 rounded-full transition-colors duration-200",
                      i < filed ? "bg-signal" : "bg-ink-3/30",
                    )}
                  />
                ))}
              </span>
            </div>
          </div>
        </div>
      ) : null}
      <ol className="relative flex flex-col" style={{ gap }}>
        {cards.map((card, i) => (
          <li
            key={card.id}
            ref={(node) => {
              if (node) items.current.set(card.id, node);
              else items.current.delete(card.id);
            }}
            className="sticky"
            style={{ top: stickyTop(i), zIndex: i + 1 }}
          >
            <article
              ref={(node) => {
                if (node) faces.current.set(card.id, node);
                else faces.current.delete(card.id);
              }}
              tabIndex={0}
              aria-labelledby={`${uid}-${card.id}`}
              onFocus={(event) => {
                // Only a keyboard arrival moves the reading position; a click
                // on a card leaves the scroll where the reader put it.
                if (event.currentTarget.matches(":focus-visible")) readAt(i);
              }}
              onKeyDown={(event) => onCardKeyDown(event, i)}
              className={cn(
                "relative origin-top rounded-3 border border-hairline bg-card px-4 py-3.5 text-left outline-none [--ft-dim:0] [--ft-lift:0]",
                "shadow-[0_1px_2px_color-mix(in_oklab,black_6%,transparent)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-3 shadow-[0_12px_28px_-10px_color-mix(in_oklab,black_32%,transparent)]"
                style={{ opacity: "var(--ft-lift)" }}
              />
              {card.meta || card.tag ? (
                <div className="flex items-center justify-between gap-2">
                  {card.meta ? (
                    <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 tabular-nums">
                      {card.meta}
                    </span>
                  ) : (
                    <span />
                  )}
                  {card.tag ? (
                    <span className="inline-flex h-5 items-center rounded-full border border-hairline px-2 text-[10px] font-medium text-ink-2">
                      {card.tag}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <Heading
                id={`${uid}-${card.id}`}
                className="mt-1 text-sm leading-snug font-medium text-foreground"
              >
                {card.title}
              </Heading>
              {card.body ? (
                <div className="mt-1 text-[13px] leading-relaxed text-ink-2">
                  {card.body}
                </div>
              ) : null}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-3 bg-background"
                style={{ opacity: "var(--ft-dim)" }}
              />
            </article>
          </li>
        ))}
        <li aria-hidden className="list-none" style={{ height: HOLD }} />
      </ol>
      <p id={hintId} className="sr-only">
        Each card files itself on the pile as you scroll past it. Tab or Arrow
        Down moves to the next card and files the one before; Arrow Up lifts it
        back.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
