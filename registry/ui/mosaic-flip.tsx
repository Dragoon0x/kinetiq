"use client";

import * as React from "react";

import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MosaicFlipImage = { src: string; alt: string };
export type MosaicFlipOrigin = "pointer" | "corner" | "edge" | "center";
export type MosaicFlipAxis = "wave" | "x" | "y";

export type MosaicFlipProps = {
  /** The images, in order: any URL a CSS background can load, and what each shows. */
  images: readonly MosaicFlipImage[];
  /** The index shown (controlled). */
  value?: number;
  /** The index shown first when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the press, key, swipe or autoplay tick that changed the image, with the new index. */
  onValueChange?: (index: number) => void;
  /** Columns of tiles, 2 to 20. @default 8 */
  grid?: number;
  /** Rows of tiles; by default they follow the frame's aspect so tiles stay square. */
  rows?: number;
  /** Where each wave starts: the pointer (or the control pressed), the leading corner, the leading edge, or the centre. @default "pointer" */
  origin?: MosaicFlipOrigin;
  /** Pace of the wave and of each turn, as a multiple (0.25 to 3). @default 1 */
  speed?: number;
  /** How far a tile rises toward you mid-turn, 0 to 1. @default 0.5 */
  lift?: number;
  /** How irregular the wave front is, 0 (mechanical) to 1 (hand-turned). @default 0.25 */
  jitter?: number;
  /** Tiles turn away from the wave, or all about one axis. @default "wave" */
  axis?: MosaicFlipAxis;
  /** Grout between tiles, px. @default 2 */
  gap?: number;
  /** Tile corner radius, px. @default 3 */
  radius?: number;
  /** Advance by itself every so many ms while visible, unhovered and unfocused; 0 is off. @default 0 */
  autoplay?: number;
  /** Wrap past the first and last image. @default true */
  loop?: boolean;
  /** Show the arrows and dots. @default true */
  controls?: boolean;
  /** A soft tick as each tile lands, for changes the visitor makes. @default false */
  sound?: boolean;
  /** The carousel's accessible name. @default "Gallery" */
  label?: string;
  /** Fires when a wave has landed, with the index now shown. */
  onSettle?: (index: number) => void;
  /** Size the frame here. @default "aspect-[16/9] w-full" */
  className?: string;
};

type Origin = { x: number; y: number; set: boolean; visitor: boolean };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A seeded number per tile, so the jitter is the same on every render. */
const tileRand = (c: number, r: number) => {
  let h = Math.imul(c + 1, 73856093) ^ Math.imul(r + 1, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

type TileNodes = {
  cell: HTMLDivElement;
  flipper: HTMLDivElement;
  shadow: HTMLDivElement;
  front: HTMLDivElement;
  back: HTMLDivElement;
  frontShade: HTMLDivElement;
  backShade: HTMLDivElement;
};

type TileState = TileNodes & {
  col: number;
  row: number;
  theta: number;
  vel: number;
  delay: number;
  reach: number;
  ax: number;
  ay: number;
  ticked: boolean;
  done: boolean;
};

type Register = (
  id: string,
  nodes: TileNodes | null,
  col: number,
  row: number,
) => void;

type TileProps = {
  id: string;
  col: number;
  row: number;
  front: number;
  back: number;
  /** The turning axis in the frame's plane, as an angle in radians. */
  axis: number;
  register: Register;
};

/** One tile's look at an angle: its turn, lift, shadow, shading and which face shows. */
function paintTile(t: TileState, lift: number) {
  const a = (t.theta * Math.PI) / 180;
  const up = Math.max(0, Math.sin(a));
  // Each tile is one flat layer with a 3D transform: promoted only while it
  // turns, so a resting mosaic costs the compositor nothing.
  const turning = t.theta !== 0 && t.theta !== 180;
  const hint = turning ? "transform" : "";
  if (t.flipper.style.willChange !== hint) {
    t.flipper.style.willChange = hint;
    t.shadow.style.willChange = turning ? "opacity" : "";
  }
  t.flipper.style.transform =
    t.theta === 0
      ? ""
      : `perspective(640px) translateZ(${r3(up * lift * 26)}px) rotate3d(${t.ax}, ${t.ay}, 0, ${r3(t.theta)}deg) scale(${r3(1 + up * lift * 0.05)})`;
  t.shadow.style.opacity = String(r3(up * lift));
  // A lifted tile passes over its neighbours, whatever their DOM order.
  t.cell.style.zIndex = up > 0.02 ? "1" : "";
  // The face turned toward you is the one shown. The tile is flattened (no
  // preserve-3d, no backface culling): the back face's own half turn
  // flattens into a mirror, which the tile's turn then reads the right way.
  const c = Math.cos(a);
  t.front.style.visibility = c >= 0 ? "visible" : "hidden";
  t.back.style.visibility = c >= 0 ? "hidden" : "visible";
  // Each face darkens as it turns away from the light.
  t.frontShade.style.opacity = String(r3(clamp01((1 - c) * 0.32)));
  t.backShade.style.opacity = String(r3(clamp01((1 + c) * 0.32)));
}

function Face({
  image,
  axis,
  back,
  faceRef,
  shadeRef,
}: {
  image: number;
  axis: number;
  back: boolean;
  faceRef: React.Ref<HTMLDivElement>;
  shadeRef: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={faceRef}
      className={cn(
        "absolute inset-0 overflow-hidden rounded-(--kq-r)",
        back && "invisible",
      )}
      style={
        back
          ? {
              // The back is turned over the same axis the tile turns on,
              // so it reads the right way up once the turn is done.
              transform: `rotate3d(${r3(Math.cos(axis))}, ${r3(Math.sin(axis))}, 0, 180deg)`,
            }
          : undefined
      }
    >
      {/* One frame-sized box per face, offset to this tile's slice: the image
          is cover-fitted to the whole frame, never to the tile. */}
      <div
        className="absolute top-(--kq-y) left-(--kq-x) h-(--kq-h) w-(--kq-w) bg-cover bg-center"
        style={{ backgroundImage: `var(--kq-mosaic-${image})` }}
      />
      <div
        ref={shadeRef}
        className="absolute inset-0 bg-(--kq-shade) opacity-0"
      />
    </div>
  );
}

/**
 * One tile: a two-faced card. It renders its two slices and hands its nodes to
 * the frame, whose single loop turns every tile — no React render per frame.
 */
const Tile = React.memo(function Tile({
  id,
  col,
  row,
  front,
  back,
  axis,
  register,
}: TileProps) {
  const cell = React.useRef<HTMLDivElement | null>(null);
  const flipper = React.useRef<HTMLDivElement | null>(null);
  const shadow = React.useRef<HTMLDivElement | null>(null);
  const frontFace = React.useRef<HTMLDivElement | null>(null);
  const backFace = React.useRef<HTMLDivElement | null>(null);
  const frontShade = React.useRef<HTMLDivElement | null>(null);
  const backShade = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    const nodes = {
      cell: cell.current,
      flipper: flipper.current,
      shadow: shadow.current,
      front: frontFace.current,
      back: backFace.current,
      frontShade: frontShade.current,
      backShade: backShade.current,
    };
    if (Object.values(nodes).some((n) => !n)) return;
    register(id, nodes as TileNodes, col, row);
    return () => register(id, null, col, row);
  }, [id, col, row, register]);

  return (
    <div
      ref={cell}
      className="relative"
      style={
        {
          "--kq-x": `calc(${-col} * (100% + var(--kq-gap)))`,
          "--kq-y": `calc(${-row} * (100% + var(--kq-gap)))`,
        } as React.CSSProperties
      }
    >
      <div
        ref={shadow}
        aria-hidden
        className="absolute inset-0 rounded-(--kq-r) opacity-0 shadow-(--kq-drop)"
      />
      <div ref={flipper} className="absolute inset-0">
        <Face
          image={front}
          axis={axis}
          back={false}
          faceRef={frontFace}
          shadeRef={frontShade}
        />
        <Face
          image={back}
          axis={axis}
          back
          faceRef={backFace}
          shadeRef={backShade}
        />
      </div>
    </div>
  );
});

/**
 * An image carousel whose change is a wave of turning tiles. The frame is cut
 * into a grid of two-faced tiles, each carrying its slice of the current image
 * on the front and of the next on the back. A change starts a wave at the
 * pointer (or the control pressed), a corner, an edge or the centre; each tile
 * waits for the wave to reach it, then turns 180° about the axis perpendicular
 * to the wave's travel — so the tiles fall away from the origin like dominoes —
 * on the snap spring, lifting toward you mid-turn with a soft shadow beneath
 * and each face darkening as it turns from the light. Arrows, dots, a click on
 * the frame, a swipe and the keyboard all change it, and with `sound` each
 * landing tile ticks.
 *
 * The frame is a labelled slide in a carousel: Left and Right turn to the
 * previous and next image, Home and End to the ends, and the change is
 * announced politely. Under reduced motion the new image crossfades over the
 * whole frame instead.
 */
export function MosaicFlip({
  images,
  value,
  defaultValue = 0,
  onValueChange,
  grid = 8,
  rows: rowsProp,
  origin = "pointer",
  speed = 1,
  lift = 0.5,
  jitter = 0.25,
  axis = "wave",
  gap = 2,
  radius = 3,
  autoplay = 0,
  loop = true,
  controls = true,
  sound = false,
  label = "Gallery",
  onSettle,
  className,
}: MosaicFlipProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const count = images.length;
  const cols = clamp(Math.round(grid), 2, 20);
  const pace = clamp(speed, 0.25, 3);

  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, Math.max(0, count - 1)),
  );
  const shown = clamp(Math.round(value ?? own), 0, Math.max(0, count - 1));
  const [front, setFront] = React.useState(shown);
  const [start, setStart] = React.useState<Origin>({
    x: 0,
    y: 0.5,
    set: false,
    visitor: false,
  });
  const [measured, setMeasured] = React.useState<number | null>(null);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [inView, setInView] = React.useState(false);
  const [playing, setPlaying] = React.useState(true);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const tilesRef = React.useRef(new Map<string, TileState>());
  const liftRef = React.useRef(clamp01(lift));
  const timers = React.useRef<number[]>([]);

  const rows = clamp(
    Math.round(rowsProp ?? cols * (measured ?? 9 / 16)),
    1,
    20,
  );

  React.useEffect(() => {
    liftRef.current = clamp01(lift);
  }, [lift]);

  const register = React.useCallback<Register>((id, nodes, col, row) => {
    const map = tilesRef.current;
    if (!nodes) {
      map.delete(id);
      return;
    }
    const tile: TileState = {
      ...nodes,
      col,
      row,
      theta: 0,
      vel: 0,
      delay: 0,
      reach: 0,
      ax: 0,
      ay: 1,
      ticked: false,
      done: true,
    };
    map.set(id, tile);
    paintTile(tile, liftRef.current);
  }, []);

  const halt = React.useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  // The direction of the change, the short way round when it wraps.
  const forward =
    shown === front
      ? true
      : loop && count > 2
        ? (shown - front + count) % count <= count / 2
        : shown > front;

  // Where this wave starts, in fractions of the frame.
  const wave = (() => {
    if (origin === "center") return { x: 0.5, y: 0.5, line: false };
    if (origin === "corner") return { x: forward ? 0 : 1, y: 0, line: false };
    if (origin === "edge" || !start.set) {
      return { x: forward ? 0 : 1, y: 0.5, line: true };
    }
    return { x: start.x, y: start.y, line: false };
  })();

  // Each tile's axis: perpendicular to the wave's travel through it.
  const axisFor = (c: number, r: number) => {
    if (axis === "x") return 0;
    if (axis === "y") return Math.PI / 2;
    const dx = (c + 0.5) / cols - wave.x;
    const dy = wave.line ? 0 : ((r + 0.5) / rows - wave.y) * (rows / cols);
    if (Math.abs(dx) + Math.abs(dy) < 1e-4) return Math.PI / 2;
    return Math.atan2(dy, dx) + Math.PI / 2;
  };

  const changing = shown !== front;

  // The wave: one loop turns every tile once the wave reaches it, each on its
  // own spring with the snap constants (scaled by speed, so ζ stays 0.83).
  React.useEffect(() => {
    if (!changing || !motionSafe) return;
    const tiles = [...tilesRef.current.values()];
    if (tiles.length === 0) return;
    const spread = 0.42 / pace;
    const dist = (c: number, r: number) => {
      const dx = (c + 0.5) / cols - wave.x;
      const dy = wave.line ? 0 : ((r + 0.5) / rows - wave.y) * (rows / cols);
      return Math.hypot(dx, dy);
    };
    let reach = 1e-3;
    for (const t of tiles) reach = Math.max(reach, dist(t.col, t.row));
    for (const t of tiles) {
      const a = axisFor(t.col, t.row);
      t.ax = r3(Math.cos(a));
      t.ay = r3(Math.sin(a));
      t.reach = dist(t.col, t.row) / reach;
      t.delay =
        t.reach * spread + tileRand(t.col, t.row) * clamp01(jitter) * 0.12;
      t.theta = 0;
      t.vel = 0;
      t.ticked = false;
      t.done = false;
    }
    const K = springs.snap.stiffness * pace * pace;
    const C = springs.snap.damping * pace;
    const M = springs.snap.mass;
    const visitor = start.visitor;
    let raf = 0;
    let begun = 0;
    let last = 0;
    const tick = (now: number) => {
      if (!begun) begun = now;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const time = (now - begun) / 1000;
      const lifted = liftRef.current;
      let busy = false;
      for (const t of tiles) {
        if (t.done) continue;
        busy = true;
        if (time < t.delay) continue;
        const steps = Math.max(1, Math.ceil(dt * 240));
        const h = dt / steps;
        for (let i = 0; i < steps; i += 1) {
          t.vel += ((K * (180 - t.theta) - C * t.vel) / M) * h;
          t.theta += t.vel * h;
        }
        if (Math.abs(180 - t.theta) < 0.05 && Math.abs(t.vel) < 0.5) {
          t.theta = 180;
          t.vel = 0;
          t.done = true;
        }
        if (!t.ticked && t.theta > 120) {
          // The tick lands with the tile, pitched by how far the wave came.
          t.ticked = true;
          if (visitor) {
            audio.play("tick", {
              pitch: 1.25 - t.reach * 0.45,
              gain: 0.32,
              pan: Number((((t.col + 0.5) / cols - 0.5) * 1.2).toFixed(3)),
            });
          }
        }
        paintTile(t, lifted);
      }
      if (busy) raf = window.requestAnimationFrame(tick);
      else {
        raf = 0;
        setFront(shown);
      }
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
    // The wave is keyed on the change itself; the origin and the grid are
    // read as they were when it began.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changing, shown, front, motionSafe]);

  // Landed: the fronts take the new image while the backs still hold it, so
  // returning every angle to 0 is never seen.
  React.useLayoutEffect(() => {
    for (const t of tilesRef.current.values()) {
      t.theta = 0;
      t.vel = 0;
      t.done = true;
      paintTile(t, liftRef.current);
    }
  }, [front]);

  const settledOnce = React.useRef(false);
  React.useEffect(() => {
    if (!settledOnce.current) {
      settledOnce.current = true;
      return;
    }
    onSettle?.(front);
    // Report only when the shown image lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front]);

  React.useEffect(() => halt, [halt]);

  // The next and previous images load before they are needed.
  React.useEffect(() => {
    if (count < 2) return;
    for (const i of [(shown + 1) % count, (shown - 1 + count) % count]) {
      const src = images[i]?.src;
      if (!src) continue;
      const img = new Image();
      img.src = src;
    }
  }, [shown, count, images]);

  const commit = (to: number, from: Origin) => {
    if (count < 2) return;
    let next = to;
    if (loop) next = ((to % count) + count) % count;
    else next = clamp(to, 0, count - 1);
    if (next === shown) return;
    // A change while a wave is still turning lands that wave at once.
    if (shown !== front) setFront(shown);
    setStart(from);
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    if (!motionSafe && from.visitor) audio.play("tick", { gain: 0.32 });
  };

  const at = (clientX: number, clientY: number): Origin => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1)
      return { x: 0.5, y: 0.5, set: true, visitor: true };
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
      set: true,
      visitor: true,
    };
  };
  const edge = (dir: 1 | -1): Origin => ({
    x: dir > 0 ? 0 : 1,
    y: 0.5,
    set: false,
    visitor: true,
  });

  // Autoplay: one timer per shown image, paused by hover, focus, being off
  // screen or a hidden tab — and by the visitor.
  React.useEffect(() => {
    if (!autoplay || autoplay < 600 || count < 2 || !playing) return;
    if (hovered || focused || !inView) return;
    const id = window.setTimeout(() => {
      if (document.hidden) return;
      setStart({ x: 0, y: 0.5, set: false, visitor: false });
      const next = loop ? (shown + 1) % count : Math.min(shown + 1, count - 1);
      if (next === shown) return;
      if (value === undefined) setOwn(next);
      onValueChange?.(next);
    }, autoplay);
    return () => window.clearTimeout(id);
  }, [
    autoplay,
    count,
    playing,
    hovered,
    focused,
    inView,
    shown,
    loop,
    value,
    onValueChange,
  ]);

  const drag = useDrag({
    axis: "x",
    threshold: 8,
    onEnd: ({ offset, velocity, point }) => {
      if (Math.abs(offset.x) < 36 && Math.abs(velocity.x) < 400) return;
      const dir = offset.x < 0 || (offset.x === 0 && velocity.x < 0) ? 1 : -1;
      commit(shown + dir, at(point.x - offset.x, point.y - offset.y));
    },
    onTap: (event) => {
      const target = event.target as Element | null;
      if (target?.closest("button")) return;
      commit(shown + 1, at(event.clientX, event.clientY));
    },
  });

  const bindFrame = React.useCallback((node: HTMLDivElement | null) => {
    frameRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const w = node.clientWidth;
      const h = node.clientHeight;
      if (w > 0 && h > 0) setMeasured(Math.round((h / w) * 1000) / 1000);
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setInView(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const vars: Record<string, string> = {};
  images.forEach((image, i) => {
    vars[`--kq-mosaic-${i}`] = `url(${JSON.stringify(image.src)})`;
  });

  const current = images[shown];
  const playingNow = Boolean(autoplay) && playing;
  const atStart = !loop && shown === 0;
  const atEnd = !loop && shown === count - 1;

  const tiles: React.ReactNode[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const id = `${c}-${r}`;
      tiles.push(
        <Tile
          key={id}
          id={id}
          col={c}
          row={r}
          front={front}
          back={shown}
          axis={axisFor(c, r)}
          register={register}
        />,
      );
    }
  }

  const arrow =
    "absolute top-1/2 z-10 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-hairline bg-background/90 text-foreground shadow-sm transition-colors outline-none hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-not-allowed aria-disabled:opacity-40";

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className={cn("relative isolate aspect-[16/9] w-full", className)}
      style={vars as React.CSSProperties}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
    >
      <div
        ref={bindFrame}
        role="group"
        aria-roledescription="slide"
        aria-label={
          current ? `${shown + 1} of ${count}: ${current.alt}` : label
        }
        tabIndex={0}
        {...drag}
        onKeyDown={(event) => {
          let to: number | null = null;
          let dir: 1 | -1 = 1;
          if (event.key === "ArrowRight") to = shown + 1;
          else if (event.key === "ArrowLeft") {
            to = shown - 1;
            dir = -1;
          } else if (event.key === "Home") {
            to = 0;
            dir = -1;
          } else if (event.key === "End") to = count - 1;
          if (to === null) return;
          event.preventDefault();
          commit(to, edge(dir));
        }}
        className={cn(
          "absolute inset-0 grid cursor-pointer touch-pan-y overflow-clip rounded-[inherit] outline-none select-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={
          {
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            gap: "var(--kq-gap)",
            // Shared tile geometry, resolved inside each tile.
            "--kq-gap": `${Math.max(0, gap)}px`,
            "--kq-r": `${Math.max(0, radius)}px`,
            "--kq-w": `calc(${cols} * 100% + ${cols - 1} * var(--kq-gap))`,
            "--kq-h": `calc(${rows} * 100% + ${rows - 1} * var(--kq-gap))`,
            "--kq-shade": "color-mix(in oklab, var(--ink) 20%, black)",
            "--kq-drop":
              "0 10px 18px -6px color-mix(in oklab, var(--ink) 34%, transparent)",
          } as React.CSSProperties
        }
      >
        {measured === null ? (
          // Before the frame is measured (and on the server) it shows the
          // image whole; the tiles are laid once their rows are known.
          <div
            className="col-span-full row-span-full rounded-(--kq-r) bg-cover bg-center"
            style={{ backgroundImage: `var(--kq-mosaic-${front})` }}
          />
        ) : (
          tiles
        )}
      </div>

      {!motionSafe && changing ? (
        <motion.div
          key={`${front}>${shown}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-cover bg-center"
          style={{ backgroundImage: `var(--kq-mosaic-${shown})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.base, ease: easings.enter }}
          onAnimationComplete={() => setFront(shown)}
        />
      ) : null}

      <p aria-live={playingNow ? "off" : "polite"} className="sr-only">
        {current ? `Image ${shown + 1} of ${count}: ${current.alt}` : ""}
      </p>

      {controls && count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous image"
            aria-disabled={atStart || undefined}
            onClick={(event) => {
              if (atStart) return;
              commit(
                shown - 1,
                event.detail === 0
                  ? edge(-1)
                  : at(event.clientX, event.clientY),
              );
            }}
            className={cn(arrow, "left-2")}
          >
            <ChevronLeft aria-hidden className="size-4 shrink-0" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            aria-disabled={atEnd || undefined}
            onClick={(event) => {
              if (atEnd) return;
              commit(
                shown + 1,
                event.detail === 0 ? edge(1) : at(event.clientX, event.clientY),
              );
            }}
            className={cn(arrow, "right-2")}
          >
            <ChevronRight aria-hidden className="size-4 shrink-0" />
          </button>
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-hairline bg-background/90 px-1 shadow-sm">
            {images.map((image, i) => (
              <button
                key={`${i}:${image.src.slice(0, 24)}`}
                type="button"
                aria-label={`Show image ${i + 1}: ${image.alt}`}
                aria-current={i === shown ? "true" : undefined}
                onClick={(event) => {
                  const dir = i >= shown ? 1 : -1;
                  commit(
                    i,
                    event.detail === 0
                      ? edge(dir)
                      : at(event.clientX, event.clientY),
                  );
                }}
                className="relative inline-flex size-5 items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <span
                  aria-hidden
                  className="block size-1.5 rounded-full bg-foreground/30"
                />
                {i === shown ? (
                  <motion.span
                    layoutId={`${uid}-dot`}
                    aria-hidden
                    className="absolute inset-x-[3px] top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground"
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                  />
                ) : null}
              </button>
            ))}
            {autoplay ? (
              <button
                type="button"
                aria-label={playing ? "Pause autoplay" : "Play autoplay"}
                onClick={() => setPlaying((p) => !p)}
                className="inline-flex size-5 items-center justify-center rounded-full text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid"
              >
                {playing ? (
                  <Pause aria-hidden className="size-3 shrink-0" />
                ) : (
                  <Play aria-hidden className="size-3 shrink-0" />
                )}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
