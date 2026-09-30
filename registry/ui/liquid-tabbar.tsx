"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LiquidTabIcon =
  | "home"
  | "search"
  | "inbox"
  | "chart"
  | "wallet"
  | "card"
  | "bell"
  | "calendar"
  | "person";

export type LiquidTabItem = { id: string; label: string; icon: LiquidTabIcon };

export type LiquidTabTint = "accent" | "ink" | "signal";

export type LiquidTabbarProps = {
  items: LiquidTabItem[];
  /** Controlled: the chosen tab's id. */
  value?: string;
  /** Initial tab when uncontrolled. @default the first item */
  defaultValue?: string;
  /** Fires from the tap, drag or key that chose a tab, with its id. */
  onValueChange?: (id: string) => void;
  /** The tablist's accessible name. @default "Sections" */
  label?: string;
  /** The id of the panel the tabs control. */
  panelId?: string;
  /** Runny (0) to thick (1): quick and splashy, or slow with a long neck. @default 0.5 */
  viscosity?: number;
  /** How many of `items` the bar holds, 3 to 5. @default all, up to 5 */
  tabs?: number;
  /** The drop's colour. @default "accent" */
  tint?: LiquidTabTint;
  /** Play the drop landing. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Glyphs on a 24-unit grid, stroked. */
const GLYPHS: Record<LiquidTabIcon, string> = {
  home: "M4.5 10.6 12 4.5l7.5 6.1V19a1 1 0 0 1-1 1h-4v-5.2h-5V20h-4a1 1 0 0 1-1-1z",
  search:
    "M10.75 4.5a6.25 6.25 0 1 1 0 12.5 6.25 6.25 0 0 1 0-12.5zM15.5 15.5 20 20",
  inbox:
    "M4 13.5 6.4 6.3a1.5 1.5 0 0 1 1.4-1h8.4a1.5 1.5 0 0 1 1.4 1L20 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18zM4 13.5h4.5l1 2h5l1-2H20",
  chart: "M4.5 19.5h15M7.5 16.5v-5M12 16.5v-10M16.5 16.5v-7",
  wallet:
    "M18.5 8.5V6.8a1.3 1.3 0 0 0-1.3-1.3H6.5a2 2 0 0 0 0 4h12.3a1 1 0 0 1 1 1v7.7a1 1 0 0 1-1 1h-12a2 2 0 0 1-2-2v-9.7M16 14.5h.5",
  card: "M3.5 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM3.5 9.5h17M7 15h3.5",
  bell: "M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14zM10 20.5h4",
  calendar: "M5 6.5h14v13H5zM5 10.5h14M9 4.5v4M15 4.5v4",
  person:
    "M12 12a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5zM5 20a7 7 0 0 1 14 0",
};

// The drop is pigment, not text colour: a token's hue at a fixed lightness,
// so it reads the same on the light page and the dark one. Ink is the
// exception by design: it follows the theme, a monochrome bar.
const TINTS: Record<LiquidTabTint, { drop: string; on: string }> = {
  accent: {
    drop: "oklch(from var(--accent) 0.6 0.19 h)",
    on: "oklch(0.99 0 0)",
  },
  ink: { drop: "var(--foreground)", on: "var(--background)" },
  signal: {
    drop: "oklch(from var(--signal) 0.8 0.14 h)",
    on: "oklch(0.24 0.04 170)",
  },
};

/** The bar's height, the icon's centre line and its size, in px. */
const BAR_H = 64;
const CY = 21;
const ICON = 20;
const MOST_TABS = 5;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/**
 * The neck between the tail (x1, radius ra) and the head (x2, radius rb):
 * tangent points spread round each circle and joined by curves whose handles
 * shorten as the two part. Past `reach` it has pinched off. Drawn with both
 * circles it is one crisp drop, rebuilt every frame without a blur.
 */
function neckPath(
  x1: number,
  x2: number,
  cy: number,
  ra: number,
  rb: number,
  reach: number,
): string {
  const d = Math.abs(x2 - x1);
  if (d < 0.5 || d > reach || d <= Math.abs(ra - rb)) return "";
  const dir = x2 >= x1 ? 0 : Math.PI;
  const overlap = d < ra + rb;
  const u1 = overlap
    ? Math.acos(Math.min(1, (ra * ra + d * d - rb * rb) / (2 * ra * d)))
    : 0;
  const u2 = overlap
    ? Math.acos(Math.min(1, (rb * rb + d * d - ra * ra) / (2 * rb * d)))
    : 0;
  // Thinner as it stretches: the spread closes towards the far end.
  const spread = lerp(0.55, 0.3, clamp01(d / reach));
  const most = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / d)));
  const a1 = dir + u1 + (most - u1) * spread;
  const b1 = dir - u1 - (most - u1) * spread;
  const a2 = dir + Math.PI - u2 - (Math.PI - u2 - most) * spread;
  const b2 = dir - Math.PI + u2 + (Math.PI - u2 - most) * spread;
  const at = (x: number, r: number, a: number) =>
    [x + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  const p1a = at(x1, ra, a1);
  const p1b = at(x1, ra, b1);
  const p2a = at(x2, rb, a2);
  const p2b = at(x2, rb, b2);
  const handle =
    Math.min(
      spread * 2.4,
      Math.hypot(p1a[0] - p2a[0], p1a[1] - p2a[1]) / (ra + rb),
    ) * Math.min(1, (d * 2) / (ra + rb));
  const h = (p: readonly [number, number], r: number, a: number) =>
    [p[0] + r * handle * Math.cos(a), p[1] + r * handle * Math.sin(a)] as const;
  const h1 = h(p1a, ra, a1 - Math.PI / 2);
  const h2 = h(p2a, rb, a2 + Math.PI / 2);
  const h3 = h(p2b, rb, b2 - Math.PI / 2);
  const h4 = h(p1b, ra, b1 + Math.PI / 2);
  const f = (p: readonly [number, number]) => `${r2(p[0])} ${r2(p[1])}`;
  return [
    `M ${f(p1a)}`,
    `C ${f(h1)} ${f(h2)} ${f(p2a)}`,
    `A ${r2(rb)} ${r2(rb)} 0 0 0 ${f(p2b)}`,
    `C ${f(h3)} ${f(h4)} ${f(p1b)}`,
    `A ${r2(ra)} ${r2(ra)} 0 0 0 ${f(p1a)}`,
    "Z",
  ].join(" ");
}

function Glyph({ icon, width }: { icon: LiquidTabIcon; width: number }) {
  return (
    <>
      <rect width={24} height={24} fill="none" />
      <path
        d={GLYPHS[icon]}
        fill="none"
        stroke="currentColor"
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/**
 * A bottom tab bar whose indicator is a drop of liquid behind the chosen
 * icon. Choosing another tab sends the drop's head racing to it on a spring
 * that keeps the drop's own velocity, while the tail holds back and follows
 * on a softer, later spring; between them a neck is drawn every frame as a
 * shape — the bridge between two circles — that thins as it stretches and,
 * stretched too far, pinches off, the tail catching up as its own droplet.
 * The head squashes along its speed and lands with a jiggle, and the icon it
 * lands on bounces on the recoil spring.
 *
 * The icons are drawn twice, in ink on the bar and in the tint's contrast
 * colour clipped to the drop's live shape, so an icon changes colour exactly
 * where the liquid covers it. The drop can be dragged along the bar, 1:1 and
 * rubber-banded at the ends, and a release commits to the tab the throw was
 * heading for. It is a real tablist: arrows move and choose, Home and End
 * jump. Under reduced motion the drop moves in one piece on a short tween
 * with no neck and no bounce; the tint still moves, because which tab is
 * chosen is the information.
 */
export function LiquidTabbar({
  items,
  value,
  defaultValue,
  onValueChange,
  label = "Sections",
  panelId,
  viscosity = 0.5,
  tabs,
  tint = "accent",
  sound = false,
  disabled = false,
  className,
}: LiquidTabbarProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const clipId = `liquid-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const colours = TINTS[tint] ?? TINTS.accent;
  const v = clamp01(viscosity);

  const count = Math.max(
    1,
    Math.min(
      MOST_TABS,
      items.length,
      tabs === undefined ? MOST_TABS : Math.round(tabs),
    ),
  );
  const shown = items.slice(0, count);
  const [own, setOwn] = React.useState(defaultValue ?? items[0]?.id);
  const chosen = value ?? own;
  const found = shown.findIndex((t) => t.id === chosen);
  const index = found === -1 ? 0 : found;

  const [width, setWidth] = React.useState(0);
  const unit = width > 0 ? width / count : 0;
  const radius = unit > 0 ? Math.min(17, unit / 2 - 5) : 17;
  const cx = React.useCallback((i: number) => r2((i + 0.5) * unit), [unit]);

  const head = useMotionValue(0);
  const tail = useMotionValue(0);
  const bounceY = [
    useMotionValue(0),
    useMotionValue(0),
    useMotionValue(0),
    useMotionValue(0),
    useMotionValue(0),
  ];
  const bounceScale = [
    useMotionValue(1),
    useMotionValue(1),
    useMotionValue(1),
    useMotionValue(1),
    useMotionValue(1),
  ];

  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const bounces = React.useRef<AnimationPlaybackControls[]>([]);
  const watch = React.useRef<(() => void) | null>(null);
  const voice = React.useRef<{ id: string; velocity: number } | null>(null);
  const dragging = React.useRef(false);
  const grabbed = React.useRef(0);
  const barRef = React.useRef<HTMLDivElement | null>(null);

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    watch.current?.();
    watch.current = null;
  }, []);

  const bounce = React.useCallback(
    (i: number) => {
      const y = bounceY[i];
      const s = bounceScale[i];
      if (!y || !s) return;
      for (const c of bounces.current) c.stop();
      y.set(0);
      s.set(1);
      bounces.current = [
        animate(y, 0, { ...springs.recoil, velocity: -170 }),
        animate(s, 1, { ...springs.recoil, velocity: 2.4 }),
      ];
    },
    // The bounce values are created once and never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** The drop flows to tab `to`; `voiced` when the visitor sent it there. */
  const settle = React.useCallback(
    (to: number, velocity = 0, voiced = false) => {
      halt();
      if (unit <= 0) return;
      const target = cx(to);
      if (!motionSafe) {
        const tween = { duration: durations.fast, ease: easings.enter };
        running.current = [
          animate(head, target, tween),
          animate(tail, target, tween),
        ];
        if (voiced) {
          audio.play("blup", {
            pitch: r2(lerp(1.25, 0.8, v) * (1 + to * 0.04)),
            gain: 0.6,
          });
        }
        return;
      }
      const stiffness = lerp(760, 200, v);
      const headSpring = spring(stiffness, lerp(0.48, 0.86, v));
      const tailSpring = spring(stiffness * lerp(0.7, 0.38, v), 0.96);
      const tailDelay = 0.02 + v * 0.1;
      running.current = [
        animate(head, target, { ...headSpring, velocity }),
        animate(tail, target, { ...tailSpring, delay: tailDelay }),
      ];
      // The landing is when the head first reaches the tab: the icon there
      // bounces and, if the visitor sent it, the drop blups.
      let landed = false;
      const land = () => {
        if (landed) return;
        landed = true;
        watch.current?.();
        watch.current = null;
        bounce(to);
        if (voiced) {
          const rect = barRef.current?.getBoundingClientRect();
          audio.play("blup", {
            pitch: r2(lerp(1.25, 0.8, v) * (1 + to * 0.04)),
            gain: 0.6,
            pan: rect ? panFrom(rect.left + target, barRef.current) : 0,
          });
        }
      };
      if (Math.abs(head.get() - target) < radius * 0.4) {
        land();
        return;
      }
      watch.current = head.on("change", (x) => {
        if (Math.abs(x - target) < radius * 0.4) land();
      });
    },
    [audio, bounce, cx, halt, head, motionSafe, radius, tail, unit, v],
  );

  // The host's value — or the visitor's, once accepted — moves the drop.
  const shownIndex = React.useRef(index);
  React.useEffect(() => {
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    if (dragging.current) return;
    const pending = voice.current;
    voice.current = null;
    const id = shown[index]?.id;
    const mine = pending !== null && id !== undefined && pending.id === id;
    settle(index, mine ? pending.velocity : 0, mine);
  }, [index, settle, shown]);

  React.useEffect(
    () => () => {
      halt();
      for (const c of bounces.current) c.stop();
    },
    [halt],
  );

  const bindBar = React.useCallback((node: HTMLDivElement | null) => {
    barRef.current = node;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setWidth(Math.round(node.clientWidth * 100) / 100),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const commit = (to: number, velocity = 0) => {
    if (disabled) return;
    const item = shown[to];
    if (!item) return;
    if (to === index) {
      settle(to, velocity, false);
      return;
    }
    voice.current = { id: item.id, velocity };
    if (value === undefined) setOwn(item.id);
    else settle(index, velocity, false);
    onValueChange?.(item.id);
  };

  const indexAt = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || unit <= 0) return index;
    return Math.max(
      0,
      Math.min(count - 1, Math.floor((clientX - rect.left) / unit)),
    );
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || unit <= 0,
    onStart: () => {
      dragging.current = true;
      halt();
      grabbed.current = head.get();
    },
    onMove: ({ offset }) => {
      const x = rubberClamp(
        grabbed.current + offset.x,
        cx(0),
        cx(count - 1),
        unit,
      );
      head.set(r2(x));
      // The tail trails the finger on a short spring, so the neck shows.
      for (const c of running.current) c.stop();
      running.current = [
        animate(
          tail,
          r2(Math.min(cx(count - 1), Math.max(cx(0), x))),
          motionSafe ? spring(lerp(620, 220, v), 0.9) : { duration: 0 },
        ),
      ];
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const landing = project(head.get(), velocity.x, 0.99);
      const to = Math.max(
        0,
        Math.min(count - 1, Math.round(landing / Math.max(1, unit) - 0.5)),
      );
      commit(to, velocity.x);
    },
    onCancel: () => {
      dragging.current = false;
      settle(index);
    },
    onTap: (event) => commit(indexAt(event.clientX)),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % count;
    else if (event.key === "ArrowLeft") next = (index - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next < 0) return;
    event.preventDefault();
    commit(next);
    barRef.current
      ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
      [next]?.focus();
  };

  // The drop's shape, every frame, from the two springs: a head squashed
  // along its speed, a tail that thins as the neck grows, and the neck.
  const headVelocity = useVelocity(head);
  const squash = useTransform(headVelocity, (vx) =>
    motionSafe ? r2(Math.min(0.1 + (1 - v) * 0.14, Math.abs(vx) / 5200)) : 0,
  );
  const headRx = useTransform(squash, (k) => r2(radius * (1 + k)));
  const headRy = useTransform(squash, (k) => r2(radius * (1 - k * 0.7)));
  const tailR = useTransform(
    [head, tail] as MotionValue<number>[],
    ([h = 0, t = 0]: number[]) =>
      r2(
        radius *
          lerp(1, 0.5, clamp01(Math.abs(h - t) / Math.max(1, unit * 1.3))),
      ),
  );
  const neck = useTransform(
    [head, tail, tailR] as MotionValue<number>[],
    ([h = 0, t = 0, rt = radius]: number[]) =>
      neckPath(t, h, CY, rt, radius, (rt + radius) * lerp(1.5, 3.4, v)),
  );
  // A highlight along the head's upper rim, clear of the icon it carries.
  const shineX = useTransform(head, (h) => r2(h - radius * 0.42));

  // A new width (or a new number of tabs) puts the drop straight on its tab,
  // before the frame that first draws it. Declared after the shapes above:
  // their subscriptions must be live when the drop jumps.
  React.useLayoutEffect(() => {
    if (unit <= 0 || dragging.current) return;
    halt();
    head.set(cx(shownIndex.current));
    tail.set(cx(shownIndex.current));
  }, [unit, cx, halt, head, tail]);

  const measured = width > 0;
  const drop = (
    <>
      <motion.path d={neck} />
      <motion.circle cx={tail} cy={CY} r={tailR} />
      <motion.ellipse cx={head} cy={CY} rx={headRx} ry={headRy} />
    </>
  );

  return (
    <div
      className={cn(
        "relative w-full max-w-md",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        ref={bindBar}
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "relative flex h-16 touch-pan-y items-stretch rounded-4 border border-hairline bg-card select-none",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        {measured ? (
          <svg
            aria-hidden
            width={width}
            height={BAR_H}
            viewBox={`0 0 ${width} ${BAR_H}`}
            className="pointer-events-none absolute inset-0 overflow-visible"
          >
            <defs>
              <clipPath id={clipId}>{drop}</clipPath>
            </defs>
            <g style={{ fill: colours.drop }}>{drop}</g>
            <motion.ellipse
              cx={shineX}
              cy={r2(CY - radius * 0.74)}
              rx={r2(radius * 0.3)}
              ry={r2(radius * 0.1)}
              style={{ fill: "oklch(1 0 0 / 0.32)" }}
            />
          </svg>
        ) : (
          // Before the bar is measured (the server's render), a still drop
          // sits on the chosen tab.
          <span
            aria-hidden
            className="pointer-events-none absolute size-[34px] rounded-full"
            style={{
              left: `calc(${r2(((index + 0.5) / count) * 100)}% - 17px)`,
              top: CY - 17,
              background: colours.drop,
            }}
          />
        )}

        {shown.map((item, i) => {
          const selected = i === index;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${uid}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              onClick={(event) => {
                // Pointer presses arrive through the drag's tap; a click with
                // no pointer behind it (Enter, Space) chooses here, and so
                // does any click before the bar is measured and draggable.
                if (event.detail === 0 || unit <= 0) commit(i);
              }}
              className={cn(
                "relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-4 pt-[11px] outline-none",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed",
              )}
            >
              <motion.svg
                aria-hidden
                viewBox="0 0 24 24"
                className={cn(
                  "size-5 shrink-0 transition-colors",
                  !measured && selected ? "" : "text-ink-2",
                )}
                style={{
                  y: bounceY[i],
                  scale: bounceScale[i],
                  color: !measured && selected ? colours.on : undefined,
                }}
              >
                <Glyph icon={item.icon} width={1.6} />
              </motion.svg>
              <span
                className={cn(
                  "max-w-full truncate px-1 text-[10px] leading-3.5 transition-colors",
                  selected ? "font-medium text-foreground" : "text-ink-3",
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        {measured ? (
          // The same icons in the tint's contrast colour, clipped to the drop,
          // so an icon turns exactly where the liquid covers it.
          <svg
            aria-hidden
            width={width}
            height={BAR_H}
            viewBox={`0 0 ${width} ${BAR_H}`}
            className="pointer-events-none absolute inset-0 z-20"
          >
            <g clipPath={`url(#${clipId})`} style={{ color: colours.on }}>
              {shown.map((item, i) => (
                <g
                  key={item.id}
                  transform={`translate(${r2(cx(i) - ICON / 2)} ${CY - ICON / 2})`}
                >
                  <motion.g
                    style={{
                      y: bounceY[i],
                      scale: bounceScale[i],
                      originX: 0.5,
                      originY: 0.5,
                    }}
                  >
                    <g transform={`scale(${Number((ICON / 24).toFixed(3))})`}>
                      <Glyph icon={item.icon} width={1.9} />
                    </g>
                  </motion.g>
                </g>
              ))}
            </g>
          </svg>
        ) : null}
      </div>
    </div>
  );
}
