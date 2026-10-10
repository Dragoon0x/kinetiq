"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PhotoScatterFrame = "instant" | "border" | "bleed";

export type PhotoScatterProps = {
  /** Content on the table, such as a headline; it keeps every click, focus and key. */
  children?: React.ReactNode;
  /** The pictures, used in turn: a string is an image URL, anything else is rendered as the picture. @default tinted plates from the theme */
  images?: readonly (string | React.ReactNode)[];
  /** Distance the pointer travels between prints, in px. @default 90 */
  spacing?: number;
  /** How long a print rests before it fades, in ms. @default 1200 */
  life?: number;
  /** The most a print turns off square, in degrees; each one is seeded within ±tilt. @default 8 */
  tilt?: number;
  /** A print's width in px, capped so it never stands taller than 62% of the box. @default 112 */
  size?: number;
  /** The picture's width / height. @default 0.82 */
  aspect?: number;
  /** The paper round the picture: an instant print's deep bottom margin, an even border, or none. @default "instant" */
  frame?: PhotoScatterFrame;
  /** The paper's colour, any CSS colour. @default a warm white */
  paper?: string;
  /** How long a print takes to fade and shrink away, in ms. @default 420 */
  fade?: number;
  /** How far a print falls before it lands, 0 (placed) to 1 (tossed from high). @default 0.5 */
  drop?: number;
  /** The most prints on the table at once; past it the oldest is hurried out. @default 14 */
  max?: number;
  /** Use the images in order, or in a seeded shuffle. @default "sequence" */
  order?: "sequence" | "shuffle";
  /** Prints already lying on the table before anyone points. @default 3 */
  rest?: number;
  /** Where the resting prints lie, as [x, y] fractions of the box. @default [0.74, 0.5] */
  origin?: readonly [number, number];
  /** A press pins a print where it lands, taped down until the next press. @default true */
  pinOnPress?: boolean;
  /** Keyboard focus travels too: prints drop along the way to a focused control and land beside it. @default true */
  followFocus?: boolean;
  /** Drop prints as the pointer travels. @default true */
  interactive?: boolean;
  /** Draw the prints under the content (the table) or over it. @default "under" */
  layer?: "over" | "under";
  /** Stop dropping; prints already down finish their lives. @default false */
  paused?: boolean;
  /** Seed for the tilts, the scatter and the shuffle. @default 11 */
  seed?: number;
  /** Fires on every print dropped, with the running total, which image it shows, and whether it was pinned. */
  onDrop?: (info: { total: number; image: number; pinned: boolean }) => void;
  /** Classes for the table. Give it a height. */
  className?: string;
};

type Print = {
  id: number;
  x: number;
  y: number;
  /** Trail prints sit in px; resting prints in fractions of the box. */
  frac: boolean;
  image: number;
  tilt: number;
  dx: number;
  dy: number;
  pinned: boolean;
  rest: boolean;
  leaving: boolean;
  /** When its life began (client clock); resting prints start on first touch. */
  born: number;
};

const PAPER = "oklch(0.975 0.006 85)";

/** Shading plates for when no images are given: quiet gradients from tokens. */
const PLATE_FILLS = [
  "linear-gradient(180deg, oklch(from var(--accent-bright) 0.48 0.12 h), oklch(from var(--danger) 0.78 0.09 h))",
  "linear-gradient(160deg, oklch(from var(--signal) 0.62 0.08 h), oklch(from var(--accent-bright) 0.34 0.08 h))",
  "linear-gradient(200deg, oklch(from var(--warn) 0.86 0.08 h), oklch(from var(--danger) 0.52 0.12 h))",
  "linear-gradient(170deg, oklch(from var(--success) 0.7 0.06 h), oklch(from var(--success) 0.38 0.06 h))",
];
const PLATES = PLATE_FILLS.map((fill) => (
  <div key={fill} className="size-full" style={{ background: fill }} />
));

const FRAMES: Record<
  PhotoScatterFrame,
  { side: number; top: number; bottom: number }
> = {
  instant: { side: 0.055, top: 0.055, bottom: 0.2 },
  border: { side: 0.05, top: 0.05, bottom: 0.05 },
  bleed: { side: 0, top: 0, bottom: 0 },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));

const hash = (i: number, seed: number) => {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(seed, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const INTERACTIVE =
  "a[href], button, input, select, textarea, summary, label, [role='button'], [role='link'], [contenteditable='true']";

/** The print's height as a multiple of its width, for a frame and picture shape. */
const heightRatio = (frame: PhotoScatterFrame, aspect: number) => {
  const f = FRAMES[frame] ?? FRAMES.instant;
  return (1 - 2 * f.side) / Math.max(0.2, aspect) + f.top + f.bottom;
};

type PrintViewProps = {
  print: Print;
  picture: string | React.ReactNode;
  width: string;
  frame: PhotoScatterFrame;
  aspect: number;
  paper: string;
  life: number;
  fade: number;
  drop: number;
  maxTilt: number;
  motionSafe: boolean;
  awake: boolean;
  onExpire: (id: number) => void;
  onGone: (id: number) => void;
};

const PrintView = React.memo(function PrintView({
  print,
  picture,
  width,
  frame,
  aspect,
  paper,
  life,
  fade,
  drop,
  maxTilt,
  motionSafe,
  awake,
  onExpire,
  onGone,
}: PrintViewProps) {
  const lift = clamp(drop, 0, 1);
  const landed = print.rest || !motionSafe;
  const swing = (print.dx >= 0 ? 1 : -1) * Math.max(4, maxTilt) * 0.8 * lift;
  // A print is born lifted — larger, a step back along the travel, turned
  // past its tilt, its shadow long and faint — unless it is already down.
  const scale = useMotionValue(landed ? 1 : r3(1 + 0.24 * lift));
  const rotate = useMotionValue(r2(landed ? print.tilt : print.tilt + swing));
  const x = useMotionValue(
    landed ? 0 : r2(-print.dx * distances.shift * 2 * lift),
  );
  const y = useMotionValue(
    landed ? 0 : r2(-print.dy * distances.shift * 2 * lift),
  );
  const opacity = useMotionValue(print.rest ? 1 : 0);
  const shadowY = useMotionValue(landed ? 4 : r2(4 + 24 * lift));
  const shadowScale = useMotionValue(landed ? 0.97 : r3(1 + 0.08 * lift));
  const shadowOpacity = useMotionValue(print.rest ? 0.3 : 0.08);
  const tape = useMotionValue(0);

  // The landing. Idempotent: a re-run (StrictMode, a motion preference
  // change) carries on from wherever the values are, so it always finishes.
  React.useEffect(() => {
    if (print.leaving) return;
    const run: AnimationPlaybackControls[] = [];
    if (motionSafe) {
      run.push(
        animate(scale, 1, springs.recoil),
        animate(rotate, print.tilt, springs.snap),
        animate(x, 0, springs.glide),
        animate(y, 0, springs.glide),
        animate(shadowY, print.pinned ? 7 : 4, springs.glide),
        animate(shadowScale, 0.97, springs.glide),
        animate(shadowOpacity, print.pinned ? 0.36 : 0.3, {
          duration: durations.base,
          ease: easings.enter,
        }),
        animate(opacity, 1, { duration: durations.fast, ease: easings.enter }),
      );
    } else {
      scale.jump(1);
      rotate.jump(print.tilt);
      x.jump(0);
      y.jump(0);
      shadowY.jump(4);
      shadowScale.jump(0.97);
      run.push(
        animate(opacity, 1, { duration: durations.fast, ease: easings.enter }),
        animate(shadowOpacity, 0.3, { duration: durations.fast }),
      );
    }
    run.push(
      animate(tape, print.pinned ? 1 : 0, {
        duration: durations.base,
        ease: easings.enter,
      }),
    );
    return () => {
      for (const c of run) c.stop();
    };
  }, [
    motionSafe,
    opacity,
    print.leaving,
    print.pinned,
    print.tilt,
    rotate,
    scale,
    shadowOpacity,
    shadowScale,
    shadowY,
    tape,
    x,
    y,
  ]);

  // Its life: a resting print waits for the first touch, a pinned one for
  // the next press; everything else leaves `life` ms after it was born.
  React.useEffect(() => {
    if (print.leaving || print.pinned || (print.rest && !awake)) return;
    const remaining = Math.max(0, print.born + life - performance.now());
    const timer = window.setTimeout(() => onExpire(print.id), remaining);
    return () => window.clearTimeout(timer);
  }, [
    awake,
    life,
    onExpire,
    print.born,
    print.id,
    print.leaving,
    print.pinned,
    print.rest,
  ]);

  // Leaving: fade and shrink away on the exit ease, then go.
  React.useEffect(() => {
    if (!print.leaving) return;
    const tween = {
      duration: Math.max(0.05, fade / 1000),
      ease: easings.exit,
    };
    const run = [
      animate(opacity, 0, tween),
      animate(shadowOpacity, 0, tween),
      animate(tape, 0, tween),
    ];
    if (motionSafe) run.push(animate(scale, 0.86, tween));
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onGone(print.id);
    };
    void run[0]?.finished.then(finish, () => {});
    const timer = window.setTimeout(finish, fade + 80);
    return () => {
      done = true;
      window.clearTimeout(timer);
      for (const c of run) c.stop();
    };
  }, [
    fade,
    motionSafe,
    onGone,
    opacity,
    print.id,
    print.leaving,
    scale,
    shadowOpacity,
    tape,
  ]);

  const f = FRAMES[frame] ?? FRAMES.instant;
  return (
    <div
      className="absolute"
      style={{
        left: print.frac ? `${r3(print.x * 100)}%` : r2(print.x),
        top: print.frac ? `${r3(print.y * 100)}%` : r2(print.y),
      }}
    >
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ width }}
      >
        <motion.div
          className="absolute inset-0 rounded-[2px] bg-black blur-[6px]"
          style={{
            x: 0,
            y: shadowY,
            rotate,
            scale: shadowScale,
            opacity: shadowOpacity,
          }}
        />
        <motion.div
          className="relative"
          style={{ x, y, rotate, scale, opacity }}
        >
          <div
            className="rounded-[2px] shadow-[0_0_0_1px_oklch(0_0_0/0.08)]"
            style={{
              background: paper,
              padding: `${r3(f.top * 100)}% ${r3(f.side * 100)}% ${r3(f.bottom * 100)}%`,
            }}
          >
            <div
              className="relative w-full overflow-hidden bg-muted"
              style={{ aspectRatio: String(r3(Math.max(0.2, aspect))) }}
            >
              {typeof picture === "string" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={picture}
                  alt=""
                  draggable={false}
                  className="size-full object-cover"
                />
              ) : (
                picture
              )}
              {/* A little gloss across the emulsion. */}
              <div className="absolute inset-0 bg-[linear-gradient(135deg,oklch(1_0_0/0.16),transparent_42%)]" />
            </div>
          </div>
          <motion.div
            className="absolute -top-2 left-1/2 h-4 w-[38%] -translate-x-1/2 -rotate-3 rounded-[1px] bg-[oklch(0.96_0.03_95/0.62)] shadow-[0_0_0_1px_oklch(0_0_0/0.05)]"
            style={{ opacity: tape }}
          />
        </motion.div>
      </div>
    </div>
  );
});

/**
 * An image trail of real-looking prints. As the pointer travels across the
 * table, the distance it covers is measured along its path, and every
 * `spacing` px a print is dropped at that exact point — interpolated between
 * move events, so a quick sweep still lays an even trail. Each print is born
 * lifted and lands: its scale settles on springs.recoil, its seeded tilt on
 * springs.snap, and its shadow draws in tight on springs.glide. After `life`
 * ms the prints fade and shrink away, oldest first. A press pins a print
 * where it lands, taped down until the next press.
 *
 * Keyboard focus travels too: prints drop along the way to a focused control
 * and land beside it, and Enter or Space on it pins one there. The prints are
 * aria-hidden and never take a click. Under reduced motion a print appears in
 * place with a short fade and leaves the same way.
 */
export function PhotoScatter({
  children,
  images,
  spacing = 90,
  life = 1200,
  tilt = 8,
  size = 112,
  aspect = 0.82,
  frame = "instant",
  paper = PAPER,
  fade = 420,
  drop = 0.5,
  max = 14,
  order = "sequence",
  rest = 3,
  origin = [0.74, 0.5],
  pinOnPress = true,
  followFocus = true,
  interactive = true,
  layer = "under",
  paused = false,
  seed = 11,
  onDrop,
  className,
}: PhotoScatterProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [prints, setPrints] = React.useState<Print[]>([]);
  const [awake, setAwake] = React.useState(false);
  // Guards the wake against two events landing before the re-render.
  const woken = React.useRef(false);
  const nextId = React.useRef(1);
  const total = React.useRef(0);
  const trail = React.useRef({ x: 0, y: 0, has: false, acc: 0 });
  const focusAt = React.useRef<{ x: number; y: number } | null>(null);
  const press = React.useRef<{ x: number; y: number; id: number } | null>(null);

  const pictures: readonly (string | React.ReactNode)[] =
    images && images.length > 0 ? images : PLATES;
  const count = pictures.length;
  const maxTilt = clamp(tilt, 0, 45);
  const ratio = heightRatio(frame, aspect);
  // CSS caps the width so a print never stands taller than 62% of the box or
  // wider than 36% of it: the server and the client agree without measuring.
  const width = `min(${r2(Math.max(24, size))}px, ${r3(62 / ratio)}cqh, 36cqw)`;

  const pick = React.useCallback(
    (n: number) => {
      if (order !== "shuffle" || count < 2) return n % count;
      // A seeded draw that never repeats the image just shown.
      const prev = Math.floor(hash(n - 1, seed) * count);
      const next = Math.floor(hash(n, seed) * (count - 1));
      return n === 0 ? prev % count : (prev + 1 + next) % count;
    },
    [count, order, seed],
  );
  const tiltFor = React.useCallback(
    (n: number) => r2((hash(n * 3 + 7, seed) * 2 - 1) * maxTilt),
    [maxTilt, seed],
  );

  // Before anyone touches the table the resting stack is derived from the
  // props, so the server renders it and a tweak re-lays it at once.
  const ox = clamp(origin[0], 0, 1);
  const oy = clamp(origin[1], 0, 1);
  const resting = React.useMemo<Print[]>(() => {
    const n = clamp(Math.round(rest), 0, 8);
    return Array.from({ length: n }, (_, i) => ({
      id: -1 - i,
      x: r3(
        ox + (i - (n - 1) / 2) * 0.06 + (hash(i * 5 + 1, seed) - 0.5) * 0.03,
      ),
      y: r3(oy + (hash(i * 5 + 2, seed) - 0.5) * 0.14),
      frac: true,
      image: i % count,
      tilt: r2((hash(i * 5 + 3, seed) * 2 - 1) * maxTilt),
      dx: 1,
      dy: 0,
      pinned: false,
      rest: true,
      leaving: false,
      born: 0,
    }));
  }, [count, maxTilt, ox, oy, rest, seed]);

  const onExpire = React.useCallback((id: number) => {
    setPrints((list) =>
      list.map((p) =>
        p.id === id && !p.leaving ? { ...p, leaving: true } : p,
      ),
    );
  }, []);
  const onGone = React.useCallback((id: number) => {
    setPrints((list) => list.filter((p) => p.id !== id));
  }, []);

  /** Wake the table on first touch: the resting stack starts its lives. */
  const wake = () => {
    if (woken.current) return;
    woken.current = true;
    setAwake(true);
    const now = performance.now();
    setPrints((list) => [
      ...resting.map((p, i) => ({
        ...p,
        // Their lives start now, staggered, so they leave in order.
        born: now + i * 140,
      })),
      ...list,
    ]);
  };

  const commit = (fresh: Print[]) => {
    if (fresh.length === 0) return;
    setPrints((list) => {
      let next = list;
      if (fresh.some((p) => p.pinned)) {
        // A new pin lifts the old one away.
        next = next.map((p) =>
          p.pinned && !p.leaving ? { ...p, leaving: true } : p,
        );
      }
      next = [...next, ...fresh];
      let alive = next.filter((p) => !p.leaving && !p.pinned).length;
      if (alive > Math.max(1, max)) {
        next = next.map((p) => {
          if (alive <= Math.max(1, max) || p.leaving || p.pinned) return p;
          alive -= 1;
          return { ...p, leaving: true };
        });
      }
      return next;
    });
  };

  const make = (
    x: number,
    y: number,
    dx: number,
    dy: number,
    pinned: boolean,
  ): Print => {
    const n = total.current;
    total.current += 1;
    const image = pick(n);
    onDrop?.({ total: n + 1, image, pinned });
    return {
      id: nextId.current++,
      x: r2(x),
      y: r2(y),
      frac: false,
      image,
      tilt: tiltFor(n),
      dx,
      dy,
      pinned,
      rest: false,
      leaving: false,
      born: performance.now(),
    };
  };

  /** Walk the path from the last point to this one, dropping a print every `spacing` px. */
  const travel = (x: number, y: number, limit = 6) => {
    const t = trail.current;
    if (!t.has) {
      t.x = x;
      t.y = y;
      t.has = true;
      // The first print follows the pointer in rather than waiting a full step.
      t.acc = spacing * 0.6;
      return;
    }
    const dx = x - t.x;
    const dy = y - t.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) return;
    const step = Math.max(8, spacing);
    const ux = dx / dist;
    const uy = dy / dist;
    let along = step - t.acc;
    let acc = t.acc + dist;
    const fresh: Print[] = [];
    while (acc >= step && fresh.length < limit) {
      fresh.push(make(t.x + ux * along, t.y + uy * along, ux, uy, false));
      along += step;
      acc -= step;
    }
    // A flick faster than the trail can follow drops what it can and moves on.
    t.acc = acc >= step ? 0 : acc;
    t.x = x;
    t.y = y;
    commit(fresh);
  };

  const local = (clientX: number, clientY: number) => {
    const box = rootRef.current?.getBoundingClientRect();
    return box
      ? { x: clientX - box.left, y: clientY - box.top }
      : { x: 0, y: 0 };
  };

  const printSize = () => {
    const h = rootRef.current?.clientHeight ?? 200;
    const w = rootRef.current?.clientWidth ?? 400;
    const pw = Math.min(Math.max(24, size), (0.62 * h) / ratio, 0.36 * w);
    return { w: pw, h: pw * ratio };
  };

  /** A spot beside an element with room for a print, so it never hides it. */
  const beside = (el: HTMLElement) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const box = root.getBoundingClientRect();
    // Beside the control's own group (its card, its row) when that group is
    // narrow enough to leave room, so the print lands on open table.
    let anchor: HTMLElement = el;
    for (
      let node = el.parentElement;
      node && node !== root;
      node = node.parentElement
    ) {
      if (node.getBoundingClientRect().width > box.width * 0.6) break;
      anchor = node;
    }
    const r = anchor.getBoundingClientRect();
    const p = printSize();
    const W = box.width;
    const H = box.height;
    const cy = r.top - box.top + r.height / 2;
    const right = r.right - box.left + p.w * 0.6;
    const left = r.left - box.left - p.w * 0.6;
    let x: number;
    let y = cy;
    if (right + p.w / 2 <= W) x = right;
    else if (left - p.w / 2 >= 0) x = left;
    else {
      x = r.left - box.left + r.width / 2;
      y = r.top - box.top - p.h * 0.6;
    }
    return {
      x: clamp(x, p.w / 2, Math.max(p.w / 2, W - p.w / 2)),
      y: clamp(y, p.h / 2, Math.max(p.h / 2, H - p.h / 2)),
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || paused) return;
    if (event.pointerType === "touch" && !press.current) return;
    wake();
    const pt = local(event.clientX, event.clientY);
    travel(pt.x, pt.y);
  };
  const onPointerLeave = () => {
    trail.current.has = false;
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    wake();
    const pt = local(event.clientX, event.clientY);
    press.current = { x: pt.x, y: pt.y, id: event.pointerId };
    if (event.pointerType === "touch") {
      trail.current.has = false;
      return;
    }
    const target = event.target as Element;
    // A press on a control is for the control.
    if (!pinOnPress || paused || target.closest(INTERACTIVE)) return;
    commit([make(pt.x, pt.y, 0, 1, true)]);
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const down = press.current;
    press.current = null;
    if (!down || event.pointerType !== "touch") return;
    trail.current.has = false;
    // A finger pins on a tap, so a swipe never leaves a pin at its start.
    const pt = local(event.clientX, event.clientY);
    const target = event.target as Element;
    if (
      pinOnPress &&
      !paused &&
      interactive &&
      Math.hypot(pt.x - down.x, pt.y - down.y) < 8 &&
      !target.closest(INTERACTIVE)
    ) {
      commit([make(pt.x, pt.y, 0, 1, true)]);
    }
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!followFocus || paused) return;
    const el = event.target as HTMLElement;
    if (el === rootRef.current || !el.matches(":focus-visible")) return;
    wake();
    const end = beside(el);
    const from = focusAt.current;
    focusAt.current = end;
    if (!from) {
      commit([make(end.x, end.y, 0, 1, false)]);
      return;
    }
    // Travel the hop like a pointer would, ending exactly beside the control.
    const dx = end.x - from.x;
    const dy = end.y - from.y;
    const dist = Math.hypot(dx, dy);
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 1;
    const hops = clamp(Math.floor(dist / Math.max(8, spacing)), 0, 3);
    const fresh: Print[] = [];
    for (let k = hops; k >= 1; k -= 1) {
      const t = k / (hops + 1);
      fresh.push(make(end.x - dx * t, end.y - dy * t, ux, uy, false));
    }
    fresh.push(make(end.x, end.y, ux, uy, false));
    commit(fresh);
  };
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    focusAt.current = null;
  };
  // Enter or Space on a control inside: a click with no pointer behind it.
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.detail !== 0 || !pinOnPress || paused) return;
    const el = event.target as HTMLElement;
    if (el === rootRef.current) return;
    wake();
    const at = beside(el);
    commit([make(at.x, at.y, 0, 1, true)]);
  };

  const shown = awake ? prints : resting;

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerEnter={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        press.current = null;
        trail.current.has = false;
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
      className={cn("relative isolate touch-pan-y overflow-clip", className)}
    >
      <div className="relative z-10 size-full">{children}</div>
      <div
        aria-hidden
        data-photo-layer=""
        className={cn(
          "pointer-events-none absolute inset-0 overflow-clip select-none",
          layer === "under" ? "z-0" : "z-20",
        )}
        style={{ containerType: "size" }}
      >
        {shown.map((print) => (
          <PrintView
            key={print.id}
            print={print}
            picture={pictures[print.image % count]}
            width={width}
            frame={frame}
            aspect={aspect}
            paper={paper}
            life={Math.max(0, life)}
            fade={Math.max(0, fade)}
            drop={drop}
            maxTilt={maxTilt}
            motionSafe={motionSafe}
            awake={awake}
            onExpire={onExpire}
            onGone={onGone}
          />
        ))}
      </div>
    </div>
  );
}
