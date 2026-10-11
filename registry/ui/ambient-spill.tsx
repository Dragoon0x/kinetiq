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

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  project,
  rubberband,
  useDrag,
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type AmbientSpillItem = {
  /** An image URL. Without one, a picture is drawn in code. */
  src?: string;
  /** What the card shows. */
  alt: string;
  /** The card's title, set on the screen. */
  caption?: string;
  /** A short line under the title, e.g. "Ambient · 42 min". */
  meta?: string;
  /** The colour the card throws into the room, any CSS colour. Defaults to the drawn picture's own. */
  color?: string;
};

export type AmbientSpillTone = "night" | "ash" | "plum" | "paper";

export type AmbientSpillProps = {
  /** The cards, in order. @default six drawn programmes */
  items?: AmbientSpillItem[];
  /** The card at the front (controlled), by index. */
  value?: number;
  /** The card at the front to begin with. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, wheel, key or press that brought a new card to the front. */
  onValueChange?: (index: number) => void;
  /** How much light the front card throws onto the wall and floor, 0 to 1. @default 0.7 */
  spill?: number;
  /** The room: a blue night, neutral ash, a plum dusk, or a pale gallery. @default "night" */
  roomTone?: AmbientSpillTone;
  /** How far apart the cards stand, in card widths. @default 1 */
  spacing?: number;
  /** Show each card's light on the glossy floor. @default true */
  reflection?: boolean;
  /** Carry on from the last card to the first. @default false */
  loop?: boolean;
  /** What a wheel or trackpad does: a horizontal swipe scrolls the cards, or nothing. Vertical wheels always scroll the page. @default "horizontal" */
  wheel?: "horizontal" | "off";
  /** Fires when the front card is pressed (or Enter on it), with its index. */
  onOpen?: (index: number) => void;
  /** Show the title and line on each card. @default true */
  captions?: boolean;
  /** The carousel's accessible name. @default "Featured" */
  label?: string;
  /** No dragging, wheel, keys or presses. @default false */
  disabled?: boolean;
  /** Sizes the room; it fills a 544px-tall box by default. */
  className?: string;
};

const tone = (token: string, l: number, c: number, turn = 0) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn}))`;

type Room = {
  wall: string;
  wallHi: string;
  floor: string;
  floorHi: string;
  /** How strongly light shows on this room's surfaces. */
  take: number;
  ink: string;
};

const ROOMS: Record<AmbientSpillTone, Room> = {
  night: {
    wall: tone("--accent", 0.15, 0.03),
    wallHi: tone("--accent", 0.19, 0.035),
    floor: tone("--accent", 0.1, 0.02),
    floorHi: tone("--accent", 0.18, 0.03),
    take: 1,
    ink: tone("--ink-3", 0.86, 0.01),
  },
  ash: {
    wall: tone("--ink-3", 0.19, 0.004),
    wallHi: tone("--ink-3", 0.23, 0.005),
    floor: tone("--ink-3", 0.13, 0.004),
    floorHi: tone("--ink-3", 0.21, 0.005),
    take: 1,
    ink: tone("--ink-3", 0.86, 0.004),
  },
  plum: {
    wall: tone("--danger", 0.17, 0.04, -40),
    wallHi: tone("--danger", 0.21, 0.045, -40),
    floor: tone("--danger", 0.12, 0.03, -40),
    floorHi: tone("--danger", 0.19, 0.04, -40),
    take: 1,
    ink: tone("--danger", 0.88, 0.02, -40),
  },
  paper: {
    wall: tone("--warn", 0.9, 0.012),
    wallHi: tone("--warn", 0.95, 0.01),
    floor: tone("--warn", 0.8, 0.016),
    floorHi: tone("--warn", 0.88, 0.014),
    take: 0.72,
    ink: tone("--warn", 0.32, 0.02),
  },
};

type Programme = { title: string; meta: string; color: string; scene: number };

const PROGRAMMES: Programme[] = [
  {
    title: "Ember Coast",
    meta: "Ambient · 42 min",
    color: tone("--warn", 0.72, 0.16, -32),
    scene: 0,
  },
  {
    title: "Tidewater",
    meta: "Field sound · 38 min",
    color: tone("--signal", 0.74, 0.12, 22),
    scene: 1,
  },
  {
    title: "Moss Hours",
    meta: "Slow film · 55 min",
    color: tone("--success", 0.7, 0.14, -8),
    scene: 2,
  },
  {
    title: "Night Ferry",
    meta: "Crossing · 64 min",
    color: tone("--accent", 0.62, 0.17),
    scene: 3,
  },
  {
    title: "Glasshouse",
    meta: "Rain study · 27 min",
    color: tone("--accent", 0.78, 0.1, -64),
    scene: 4,
  },
  {
    title: "Plum Orchard",
    meta: "Dusk · 31 min",
    color: tone("--danger", 0.62, 0.17, -34),
    scene: 5,
  },
];

/** The default cards: six ambient programmes on Waylight. */
export const defaultAmbientSpillItems: AmbientSpillItem[] = PROGRAMMES.map(
  (p) => ({
    alt: `${p.title}, a still from the programme`,
    caption: p.title,
    meta: p.meta,
    color: p.color,
  }),
);

/** A still, in gradients, in the programme's own light. */
function sceneArt(k: number, c: string): string {
  const deep = `color-mix(in oklab, ${c} 34%, black)`;
  const dark = `color-mix(in oklab, ${c} 55%, black)`;
  const pale = `color-mix(in oklab, ${c} 55%, white)`;
  const glow = `color-mix(in oklab, ${c} 30%, white)`;
  switch (k % 6) {
    case 0:
      return [
        `radial-gradient(circle at 62% 58%, ${glow} 0 7%, color-mix(in oklab, ${c} 70%, transparent) 9%, transparent 30%)`,
        `linear-gradient(to bottom, transparent 60%, ${dark} 60% 62%, ${deep} 62%)`,
        `repeating-linear-gradient(to bottom, transparent 0 4%, color-mix(in oklab, ${pale} 18%, transparent) 4% 4.6%)`,
        `linear-gradient(to bottom, ${deep}, ${c} 58%, ${pale} 60%)`,
      ].join(", ");
    case 1:
      return [
        `repeating-linear-gradient(to bottom, transparent 0 6%, color-mix(in oklab, ${pale} 26%, transparent) 6% 6.8%)`,
        `radial-gradient(120% 60% at 30% 100%, ${dark}, transparent 70%)`,
        `linear-gradient(to bottom, ${pale}, ${c} 46%, ${deep})`,
      ].join(", ");
    case 2:
      return [
        `radial-gradient(70% 50% at 20% 100%, ${deep} 0 98%, transparent 100%)`,
        `radial-gradient(80% 55% at 80% 104%, ${dark} 0 98%, transparent 100%)`,
        `radial-gradient(circle at 70% 26%, ${glow} 0 5%, transparent 22%)`,
        `linear-gradient(to bottom, ${c}, ${pale})`,
      ].join(", ");
    case 3:
      return [
        `radial-gradient(circle at 74% 24%, ${glow} 0 4%, transparent 6%)`,
        `radial-gradient(circle at 30% 66%, ${pale} 0 0.8%, transparent 1.4%)`,
        `radial-gradient(circle at 36% 66%, ${pale} 0 0.8%, transparent 1.4%)`,
        `radial-gradient(circle at 42% 66%, ${pale} 0 0.8%, transparent 1.4%)`,
        `linear-gradient(to bottom, transparent 64%, ${deep} 64% 70%, transparent 70%)`,
        `linear-gradient(to bottom, ${deep}, ${dark} 64%, ${c} 66%, ${deep})`,
      ].join(", ");
    case 4:
      return [
        `repeating-linear-gradient(90deg, transparent 0 15%, color-mix(in oklab, ${deep} 70%, transparent) 15% 16%)`,
        `repeating-linear-gradient(to bottom, transparent 0 22%, color-mix(in oklab, ${deep} 60%, transparent) 22% 23%)`,
        `radial-gradient(60% 50% at 50% 70%, ${glow}, transparent 70%)`,
        `linear-gradient(to bottom, ${pale}, ${c})`,
      ].join(", ");
    default:
      return [
        `radial-gradient(circle at 25% 40%, ${c} 0 9%, transparent 10%)`,
        `radial-gradient(circle at 58% 34%, ${dark} 0 12%, transparent 13%)`,
        `radial-gradient(circle at 82% 46%, ${c} 0 8%, transparent 9%)`,
        `linear-gradient(to bottom, transparent 74%, ${deep} 74%)`,
        `linear-gradient(to bottom, ${glow}, ${pale} 50%, ${c} 74%)`,
      ].join(", ");
  }
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const mod = (v: number, n: number) => ((v % n) + n) % n;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid";

type CardProps = {
  index: number;
  count: number;
  item: AmbientSpillItem;
  colour: string;
  pos: MotionValue<number>;
  spacing: number;
  loop: boolean;
  front: boolean;
  reflection: boolean;
  captions: boolean;
  disabled: boolean;
  bind: (node: HTMLButtonElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onActivate: () => void;
};

/**
 * One card. Everything about it — place, scale, turn, dimming and glow — is a
 * function of its distance from the carousel's position, so a drag halfway
 * between two cards shows both half lit.
 */
function Card({
  index,
  count,
  item,
  colour,
  pos,
  spacing,
  loop,
  front,
  reflection,
  captions,
  disabled,
  bind,
  onKeyDown,
  onActivate,
}: CardProps) {
  const offset = useTransform(pos, (p) => {
    const d = index - p;
    if (!loop) return d;
    return mod(d + count / 2, count) - count / 2;
  });
  const transform = useTransform(offset, (d) => {
    const a = Math.abs(d);
    const reach = a <= 1 ? a : 1 + (a - 1) * 0.78;
    const x = r3(Math.sign(d) * reach * spacing);
    const turn = r2(-clamp(d * 18, -26, 26));
    const z = r3(-Math.min(a, 3) * 0.42);
    const scale = r3(1 - 0.16 * Math.min(a, 2.4));
    return `translateX(calc(var(--cw) * ${x})) translateZ(calc(var(--cw) * ${z})) rotateY(${turn}deg) scale(${scale})`;
  });
  const zIndex = useTransform(
    offset,
    (d) => 100 - Math.round(Math.abs(d) * 10),
  );
  const dim = useTransform(offset, (d) =>
    r2(clamp(Math.abs(d), 0, 1) * 0.6 + Math.max(0, Math.abs(d) - 1) * 0.12),
  );
  const glowOf = (d: number) => clamp(1 - Math.abs(d) * 1.4, 0, 1);
  const shadow = useTransform(offset, (d) => {
    const g = glowOf(d);
    return `0 0 0 1px color-mix(in oklab, ${colour} ${Math.round(30 + 40 * g)}%, transparent), 0 0 calc(var(--cw) * ${r3(0.06 + 0.2 * g)}) color-mix(in oklab, ${colour} ${Math.round(70 * g)}%, transparent)`;
  });
  const reflect = useTransform(offset, (d) => r2(0.22 + 0.6 * glowOf(d)));
  // Far cards fade out rather than hide, so a key can still focus one.
  const fade = useTransform(offset, (d) => r2(clamp(3.4 - Math.abs(d), 0, 1)));

  const name = item.caption ?? item.alt;
  return (
    <motion.div
      className="absolute bottom-0 left-1/2 [transform-style:preserve-3d]"
      style={{
        width: "var(--cw)",
        height: "calc(var(--cw) / 1.6)",
        marginLeft: "calc(var(--cw) / -2)",
        transform,
        zIndex,
        opacity: fade,
      }}
    >
      {reflection ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-[4%] top-full mt-[3%] h-[46%] rounded-[50%] blur-[10px]"
          style={{
            backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, ${colour} 55%, transparent), transparent)`,
            opacity: reflect,
          }}
        />
      ) : null}
      <motion.button
        ref={bind}
        type="button"
        aria-roledescription="slide"
        aria-label={`${name}, ${index + 1} of ${count}`}
        aria-current={front ? "true" : undefined}
        tabIndex={front ? 0 : -1}
        disabled={disabled}
        data-spill-card={index}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          if (event.detail === 0) onActivate();
        }}
        className={cn(
          "@container absolute inset-0 overflow-hidden rounded-[3cqw] text-left",
          FOCUS_RING,
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{ boxShadow: shadow }}
      >
        {item.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.src}
            alt=""
            draggable={false}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundImage: sceneArt(index, colour) }}
          />
        )}
        {captions ? (
          <span className="absolute inset-x-0 bottom-0 flex flex-col gap-[1cqw] bg-linear-to-t from-[color-mix(in_oklab,black_62%,transparent)] to-transparent px-[5cqw] pt-[10cqw] pb-[4.4cqw] text-[oklch(from_var(--ink-3)_0.98_0.004_h)]">
            <span className="truncate text-[6.4cqw] leading-tight font-medium">
              {name}
            </span>
            {item.meta ? (
              <span className="truncate font-mono text-[3.6cqw] leading-tight tracking-[0.06em] uppercase opacity-80">
                {item.meta}
              </span>
            ) : null}
          </span>
        ) : null}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[oklch(from_var(--ink-3)_0.08_0.01_h)]"
          style={{ opacity: dim }}
        />
      </motion.button>
    </motion.div>
  );
}

/**
 * A carousel of screen-like cards standing in a dark room. The card at the
 * front is lit and spills its colour into the space: a wide pool on the wall
 * behind it, a flattened pool on the glossy floor in front, a faint wash over
 * the whole room and its own light reflected on the floor; the cards either
 * side stand back, turned in and dimmed like screens on standby.
 *
 * The position is one continuous motion value and everything is a function of
 * it — every card's place, turn, dimming and glow, and the room's colour, a
 * mix in oklab of the two cards it lies between — so a drag halfway shows a
 * room halfway between two colours, and the light dips and blooms again as
 * the next card takes the front: the space itself says where you are.
 *
 * A drag follows 1:1 and rubber-bands at the ends; a flick is projected to
 * where it would rest and settles there on the glide spring with the release
 * velocity; a horizontal trackpad swipe scrolls it and settles after a pause.
 * The cards are slides with one tab stop on the front card: arrows move,
 * Home and End jump, Enter opens the front card. Under reduced motion the
 * cards change places at once while the room's colour still cross-fades.
 */
export function AmbientSpill({
  items = defaultAmbientSpillItems,
  value,
  defaultValue = 0,
  onValueChange,
  spill = 0.7,
  roomTone = "night",
  spacing = 1,
  reflection = true,
  loop = false,
  wheel = "horizontal",
  onOpen,
  captions = true,
  label = "Featured",
  disabled = false,
  className,
}: AmbientSpillProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const list = items.length > 0 ? items : defaultAmbientSpillItems;
  const n = list.length;
  const room = ROOMS[roomTone] ?? ROOMS.night;
  const colours = list.map(
    (it, i) =>
      it.color ?? PROGRAMMES[i % PROGRAMMES.length]?.color ?? "var(--accent)",
  );
  const gap = clamp(spacing, 0.5, 2);
  const s = clamp(spill, 0, 1) * room.take;

  const [own, setOwn] = React.useState(() => mod(Math.round(defaultValue), n));
  const front = mod(Math.round(value ?? own), n);

  const pos = useMotionValue(front);
  const toneAt = useMotionValue(front);

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [seen, setSeen] = React.useState(front);
  if (seen !== front) {
    setSeen(front);
    const it = list[front];
    setSaid((x) => ({
      n: x.n + 1,
      text: it ? `${it.caption ?? it.alt}, ${front + 1} of ${n}.` : "",
    }));
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLButtonElement>());
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const toning = React.useRef<AnimationPlaybackControls | null>(null);
  const shown = React.useRef(front);
  const dragFrom = React.useRef<number | null>(null);
  const wheelTimer = React.useRef<number | null>(null);

  const latest = React.useRef({
    n,
    loop,
    gap,
    motionSafe,
    disabled,
    wheel,
    front,
    value,
  });
  React.useEffect(() => {
    latest.current = {
      n,
      loop,
      gap,
      motionSafe,
      disabled,
      wheel,
      front,
      value,
    };
  });

  // The room's colour follows the position exactly, except under reduced
  // motion, where cards jump and the colour still cross-fades.
  React.useEffect(
    () =>
      pos.on("change", (v) => {
        if (latest.current.motionSafe) {
          toning.current?.stop();
          toneAt.set(v);
        }
      }),
    [pos, toneAt],
  );

  /** One card's width in px, as the CSS lays it out. */
  const cardPx = () => {
    const root = rootRef.current;
    if (!root) return 300;
    const rem =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return Math.min(
      0.239 * root.clientWidth + 8 * rem,
      0.88 * root.clientHeight,
    );
  };

  const bound = (p: number) => {
    const L = latest.current;
    if (L.loop) return p;
    return clamp(p, 0, L.n - 1);
  };

  /** Settles the carousel on a card, from where it is, with a velocity in cards/s. */
  const settle = (target: number, velocity = 0) => {
    running.current?.stop();
    const L = latest.current;
    if (!L.motionSafe) {
      pos.jump(target);
      toning.current?.stop();
      toning.current = animate(toneAt, target, {
        duration: durations.slow,
        ease: easings.move,
      });
      return;
    }
    running.current = animate(pos, target, { ...springs.glide, velocity });
  };

  const choose = (i: number) => {
    const next = mod(i, n);
    shown.current = next;
    if (value === undefined) setOwn(next);
    if (next !== front) onValueChange?.(next);
  };

  /** The resting position for card `i` nearest the current one (it differs only when looping). */
  const restFor = (i: number) => {
    if (!loop) return i;
    const p = pos.get();
    return i + Math.round((p - i) / n) * n;
  };

  const goTo = (i: number, velocity = 0) => {
    const L = latest.current;
    const target = L.loop ? i : clamp(i, 0, L.n - 1);
    choose(target);
    settle(target, velocity);
  };

  // A host that moves `value` gets the same move a key would.
  React.useEffect(() => {
    if (shown.current === front && Math.abs(mod(pos.get(), n) - front) < 0.001)
      return;
    if (dragFrom.current !== null) return;
    shown.current = front;
    settle(restFor(front));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front, n]);

  React.useEffect(() => {
    if (motionSafe) {
      toning.current?.stop();
      toneAt.set(pos.get());
    }
  }, [motionSafe, pos, toneAt]);

  React.useEffect(
    () => () => {
      running.current?.stop();
      toning.current?.stop();
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    },
    [],
  );

  const gesture = useDrag({
    axis: "x",
    threshold: 5,
    disabled,
    onStart: () => {
      running.current?.stop();
      dragFrom.current = pos.get();
    },
    onMove: ({ offset }) => {
      const from = dragFrom.current;
      if (from === null) return;
      const step = cardPx() * gap;
      const raw = from - offset.x / step;
      const L = latest.current;
      const p = L.loop
        ? raw
        : raw < 0
          ? rubberband(raw, 1)
          : raw > L.n - 1
            ? L.n - 1 + rubberband(raw - (L.n - 1), 1)
            : raw;
      pos.set(r3(p));
    },
    onEnd: ({ velocity }) => {
      dragFrom.current = null;
      const step = cardPx() * gap;
      const v = -velocity.x / step;
      const landing = project(pos.get() * step, -velocity.x, 0.994) / step;
      const target = Math.round(bound(landing));
      // A flick never skips more than three cards.
      const near = Math.round(pos.get());
      const limited = clamp(target, near - 3, near + 3);
      choose(limited);
      settle(latest.current.loop ? limited : clamp(limited, 0, n - 1), v);
    },
    onCancel: () => {
      dragFrom.current = null;
      settle(restFor(latest.current.front));
    },
    onTap: (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest("[data-spill-card]");
      if (!card || !rootRef.current?.contains(card)) return;
      const i = Number(card.getAttribute("data-spill-card"));
      if (!Number.isFinite(i)) return;
      if (i === front) onOpen?.(i);
      else goTo(restFor(i));
    },
  });

  const api = React.useRef({ goTo });
  React.useEffect(() => {
    api.current = { goTo };
  });

  // Horizontal swipes scroll the cards; the page keeps every vertical wheel.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      const L = latest.current;
      if (L.wheel === "off" || L.disabled) return;
      const d = wheelPixels(event);
      if (Math.abs(d.x) <= Math.abs(d.y) || d.x === 0) return;
      event.preventDefault();
      running.current?.stop();
      const step = cardPx() * L.gap;
      const lo = L.loop ? -Infinity : -0.3;
      const hi = L.loop ? Infinity : L.n - 0.7;
      const next = clamp(pos.get() + d.x / step, lo, hi);
      if (L.motionSafe) pos.set(r3(next));
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
      const resting = L.motionSafe ? next : pos.get() + Math.sign(d.x) * 0.6;
      wheelTimer.current = window.setTimeout(() => {
        wheelTimer.current = null;
        const target = Math.round(
          clamp(resting, L.loop ? -Infinity : 0, L.loop ? Infinity : L.n - 1),
        );
        api.current.goTo(target);
      }, 140);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [pos]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    let next: number | null = null;
    const at = Math.round(pos.get());
    if (event.key === "ArrowRight") next = at + 1;
    else if (event.key === "ArrowLeft") next = at - 1;
    else if (event.key === "Home") next = loop ? restFor(0) : 0;
    else if (event.key === "End") next = loop ? restFor(n - 1) : n - 1;
    if (next === null) return;
    event.preventDefault();
    if (!loop) next = clamp(next, 0, n - 1);
    goTo(next);
    nodes.current.get(mod(next, n))?.focus({ preventScroll: true });
  };

  // Focus that was on a card follows the front one.
  React.useEffect(() => {
    const at = document.activeElement;
    const node = nodes.current.get(front);
    if (!node || at === node) return;
    for (const other of nodes.current.values()) {
      if (other === at) {
        node.focus({ preventScroll: true });
        return;
      }
    }
  }, [front]);

  /* ------------------------------ the room ------------------------------- */

  const spillColour = useTransform(toneAt, (t) => {
    const base = Math.floor(t);
    const f = t - base;
    const a = colours[mod(base, n)] ?? "var(--accent)";
    const b = colours[mod(base + 1, n)] ?? a;
    if (f < 0.001) return a;
    return `color-mix(in oklab, ${a} ${r2((1 - f) * 100)}%, ${b})`;
  });
  // Between two cards the light dips, then blooms as the next takes the front.
  const bloom = useTransform(toneAt, (t) => {
    const f = t - Math.floor(t);
    return r2(0.5 + 0.5 * Math.abs(1 - 2 * f));
  });

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <motion.div
      ref={rootRef}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={hintId}
      {...gesture}
      className={cn(
        "[container-type:size] relative isolate h-136 w-full touch-pan-y overflow-clip rounded-4 select-none",
        disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        className,
      )}
      style={
        {
          "--spill": spillColour,
          "--cw": "min(23.9cqw + 8rem, 88cqh)",
          backgroundColor: room.wall,
        } as unknown as React.CSSProperties
      }
    >
      {/* The wall and the floor. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to bottom, ${room.wall}, ${room.wallHi} 63.6%, ${room.floorHi} 64%, ${room.floor})`,
        }}
      />
      {/* The light the front card throws: wall, floor, and the whole room. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: bloom,
          backgroundImage: [
            `radial-gradient(calc(var(--cw) * 1.25) calc(var(--cw) * 0.62) at 50% 50%, color-mix(in oklab, var(--spill) ${pct(0.62 * s)}, transparent), transparent)`,
            `radial-gradient(calc(var(--cw) * 1.1) 15cqh at 50% 66%, color-mix(in oklab, var(--spill) ${pct(0.5 * s)}, transparent), transparent)`,
            `linear-gradient(color-mix(in oklab, var(--spill) ${pct(0.12 * s)}, transparent), color-mix(in oklab, var(--spill) ${pct(0.12 * s)}, transparent))`,
          ].join(", "),
        }}
      />
      {/* The skirting line where the wall meets the floor catches the light. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[64%] h-px"
        style={{
          backgroundImage: `linear-gradient(to right, transparent, color-mix(in oklab, var(--spill) ${pct(0.5 * s + 0.1)}, transparent), transparent)`,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_55%,color-mix(in_oklab,black_42%,transparent))]"
      />

      {/* The cards, standing on the floor just in front of the wall. */}
      <div
        className="absolute inset-x-0 top-0 [transform-style:preserve-3d]"
        style={{
          height: "calc(64% + 2.4cqh)",
          perspective: "calc(var(--cw) * 3.2)",
        }}
      >
        {list.map((item, i) => (
          <Card
            key={i}
            index={i}
            count={n}
            item={item}
            colour={colours[i] ?? "var(--accent)"}
            pos={pos}
            spacing={gap}
            loop={loop}
            front={i === front}
            reflection={reflection}
            captions={captions}
            disabled={disabled}
            bind={(node) => {
              if (node) nodes.current.set(i, node);
              else nodes.current.delete(i);
            }}
            onKeyDown={onKeyDown}
            onActivate={() => {
              if (i === front) onOpen?.(i);
              else goTo(restFor(i));
            }}
          />
        ))}
      </div>

      <p
        aria-hidden
        className="pointer-events-none absolute right-[4cqw] bottom-[3.4cqh] font-mono text-[10px] tracking-[0.12em] tabular-nums"
        style={{ color: room.ink, opacity: 0.7 }}
      >
        {String(front + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
      </p>
      <p id={hintId} className="sr-only">
        Drag, swipe sideways or use the arrow keys to move between cards. Enter
        opens the card at the front.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </motion.div>
  );
}
