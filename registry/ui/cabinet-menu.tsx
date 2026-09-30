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
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CabinetItem = {
  id: string;
  label: string;
  /** A short note at the sheet's end: a date, a size. */
  meta?: string;
};

export type CabinetFolder = {
  id: string;
  label: string;
  /** The sheets inside. Shown at `depth` 3; a folder without them is a leaf. */
  items?: CabinetItem[];
};

export type CabinetDrawer = {
  id: string;
  label: string;
  folders: CabinetFolder[];
};

export type CabinetFinish = "steel" | "oak" | "mint";

export type CabinetMenuProps = {
  drawers: CabinetDrawer[];
  /** Controlled: the chosen leaf's id, or null for none. */
  value?: string | null;
  /** The leaf chosen at first when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the press or key that chose a leaf, with its id and the labels from drawer to leaf. */
  onValueChange?: (id: string, path: string[]) => void;
  /** Fires when a drawer comes out (with its id) or every drawer is home (null). */
  onOpenChange?: (drawerId: string | null) => void;
  /** The menu's accessible name. */
  label: string;
  /** How many levels the menu has: 2 (drawers, folders) or 3 (drawers, folders, sheets). @default 3 */
  depth?: number;
  /** The runners, 0 to 1: plain wooden slides that stop dead, or ball-bearing slides that glide and bump the stop. @default 0.6 */
  runners?: number;
  /** The cabinet's material: brushed steel, oak with brass pulls, or mint enamel. @default "steel" */
  finish?: CabinetFinish;
  /** Play the drawers and the paper. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type FinishDef = {
  face: string;
  carcass: string;
  interior: string;
  metal: string;
  /** Drawn over the face: brushed lines, enamel gloss. Oak draws grain instead. */
  texture: string;
  grain: boolean;
  /** The thock's register: steel rings, oak is low. */
  pitch: number;
};

const CHROME = [
  "oklch(from var(--ink-3) 0.97 0.004 h)",
  "oklch(from var(--ink-3) 0.76 0.01 h)",
  "oklch(from var(--ink-3) 0.56 0.012 h)",
  "oklch(from var(--ink-3) 0.86 0.008 h)",
];
const BRASS = [
  "oklch(from var(--warn) 0.9 0.08 h)",
  "oklch(from var(--warn) 0.74 0.12 h)",
  "oklch(from var(--warn) 0.56 0.1 calc(h - 8))",
  "oklch(from var(--warn) 0.8 0.1 h)",
];
const metal = (c: string[]) =>
  `linear-gradient(180deg, ${c[0]}, ${c[1]} 45%, ${c[2]} 58%, ${c[3]})`;

// Every material is a pigment at a fixed lightness, drawn from a token's hue,
// so the cabinet is the same object on a light page and a dark one. Shading
// mixes toward black or white in oklab, which keeps the hue.
const FINISHES: Record<CabinetFinish, FinishDef> = {
  steel: {
    face: "oklch(from var(--ink-3) 0.8 0.012 h)",
    carcass: "oklch(from var(--ink-3) 0.64 0.014 h)",
    interior: "oklch(from var(--ink-3) 0.3 0.012 h)",
    metal: metal(CHROME),
    texture:
      "repeating-linear-gradient(0deg, color-mix(in oklab, white 14%, transparent) 0 1px, transparent 1px 3px)",
    grain: false,
    pitch: 1.15,
  },
  oak: {
    face: "oklch(from var(--warn) 0.62 0.08 calc(h - 22))",
    carcass: "oklch(from var(--warn) 0.47 0.07 calc(h - 26))",
    interior: "oklch(from var(--warn) 0.29 0.04 calc(h - 26))",
    metal: metal(BRASS),
    texture:
      "linear-gradient(180deg, color-mix(in oklab, white 10%, transparent), transparent 35%)",
    grain: true,
    pitch: 0.78,
  },
  mint: {
    face: "oklch(from var(--signal) 0.86 0.06 h)",
    carcass: "oklch(from var(--signal) 0.73 0.06 h)",
    interior: "oklch(from var(--signal) 0.33 0.035 h)",
    metal: metal(CHROME),
    texture:
      "linear-gradient(180deg, color-mix(in oklab, white 34%, transparent), transparent 42%, color-mix(in oklab, black 6%, transparent))",
    grain: false,
    pitch: 1,
  },
};

const MANILA = "oklch(from var(--warn) 0.9 0.055 h)";
const MANILA_EDGE = "oklch(from var(--warn) 0.78 0.07 calc(h - 6))";
const MANILA_INK = "oklch(from var(--warn) 0.3 0.04 calc(h - 10))";
const PAPER = "oklch(from var(--ink) 0.985 0.003 h)";
const PAPER_INK = "oklch(from var(--ink) 0.28 0.02 h)";
const PAPER_META = "oklch(from var(--ink) 0.5 0.02 h)";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const safeId = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, "");

/** A small seeded generator, so the oak's grain is the same on server and client. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Wavy grain lines across a drawer front, 300 × 56 units. */
function grainOf(seed: number): string {
  const rand = lcg(seed * 2654435761);
  const lines: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const y = 5 + i * 7.5 + rand() * 3;
    const amp = 0.8 + rand() * 1.8;
    const k = 0.012 + rand() * 0.02;
    const phase = rand() * 6;
    const pts: string[] = [];
    for (let x = 0; x <= 300; x += 20) {
      pts.push(`${x} ${r2(y + amp * Math.sin(x * k + phase))}`);
    }
    lines.push(`M ${pts.join(" L ")}`);
  }
  return lines.join(" ");
}

type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number): Spring => ({
  type: "spring",
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

type Slide = {
  /** Travel: 0 shut, 1 fully out. A spring may carry it a little past either. */
  p: MotionValue<number>;
  /** The contents' measured height. */
  size: MotionValue<number>;
  /** A hand resting on the pull draws it out this many px. */
  peek: MotionValue<number>;
  /** 1 once it has come to rest fully out: the window is then `auto`. */
  rest: MotionValue<number>;
  height: MotionValue<string>;
  bind: (node: HTMLDivElement | null) => (() => void) | undefined;
  slide: (to: boolean, velocity?: number) => void;
  stop: () => void;
};

/**
 * Something that slides out to reveal measured contents: a drawer's inside,
 * a folder's sheets. Its window is `travel × height` while it moves and
 * `auto` once it rests open, so anything that grows inside it is never
 * chased a frame late.
 */
function useSlide(
  open: boolean,
  motionSafe: boolean,
  springOf: (to: boolean) => Spring,
): Slide {
  const p = useMotionValue(open ? 1 : 0);
  const size = useMotionValue(0);
  const peek = useMotionValue(0);
  const rest = useMotionValue(open ? 1 : 0);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);

  const stop = React.useCallback(() => {
    anim.current?.stop();
    anim.current = null;
  }, []);

  const slide = React.useCallback(
    (to: boolean, velocity?: number) => {
      stop();
      rest.set(0);
      if (!motionSafe) {
        p.set(to ? 1 : 0);
        if (to) rest.set(1);
        return;
      }
      anim.current = animate(p, to ? 1 : 0, {
        ...springOf(to),
        velocity: velocity ?? p.getVelocity(),
        restDelta: 0.001,
        onComplete: () => {
          if (to) rest.set(1);
        },
      });
    },
    [motionSafe, p, rest, springOf, stop],
  );

  const shown = React.useRef(open);
  React.useEffect(() => {
    if (shown.current === open) return;
    shown.current = open;
    slide(open);
  }, [open, slide]);

  React.useEffect(() => stop, [stop]);

  const bind = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return undefined;
      const measure = () => size.set(node.offsetHeight);
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    },
    [size],
  );

  const height = useTransform(
    [p, size, rest, peek] as MotionValue<number>[],
    ([v = 0, h = 0, r = 0, k = 0]: number[]) =>
      // Shut hard, a drawer rebounds out a little: travel below 0 is that.
      r > 0.5 ? "auto" : `${r2(Math.abs(v) * h + k)}px`,
  );

  return { p, size, peek, rest, height, bind, slide, stop };
}

const glideSpring = (): Spring => springs.glide;

type Level = "drawer" | "folder" | "item";

type Leaf = {
  id: string;
  drawer: CabinetDrawer;
  folder: CabinetFolder;
  item?: CabinetItem;
};

function findLeaf(
  drawers: CabinetDrawer[],
  id: string | null,
): Leaf | undefined {
  if (!id) return undefined;
  for (const drawer of drawers) {
    for (const folder of drawer.folders) {
      if (folder.id === id) return { id, drawer, folder };
      const item = folder.items?.find((i) => i.id === id);
      if (item) return { id, drawer, folder, item };
    }
  }
  return undefined;
}

type SheetProps = {
  item: CabinetItem;
  index: number;
  count: number;
  open: boolean;
  checked: boolean;
  lifting: boolean;
  motionSafe: boolean;
  nodeRef: (node: HTMLElement | null) => void;
  onChoose: () => void;
};

function Sheet({
  item,
  index,
  count,
  open,
  checked,
  lifting,
  motionSafe,
  nodeRef,
  onChoose,
}: SheetProps) {
  return (
    <motion.button
      ref={nodeRef}
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      tabIndex={-1}
      data-cab="item"
      data-id={item.id}
      onClick={onChoose}
      initial={false}
      animate={{
        opacity: open ? 1 : 0,
        y:
          lifting && motionSafe
            ? -5
            : open || !motionSafe
              ? 0
              : -distances.nudge,
      }}
      transition={
        !motionSafe
          ? { duration: durations.fast }
          : lifting
            ? springs.flick
            : open
              ? { ...springs.snap, delay: 0.05 + index * cascade(count) }
              : { duration: durations.fast, ease: easings.exit }
      }
      className={cn(
        "relative flex h-[26px] w-full shrink-0 cursor-pointer items-center gap-2 rounded-1 px-2.5 text-left text-xs shadow-[0_1px_0_color-mix(in_oklab,black_12%,transparent)] outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
        "hover:brightness-[0.97]",
      )}
      style={{ background: PAPER, color: PAPER_INK }}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          checked ? "bg-cobalt-bright" : "bg-transparent",
        )}
      />
      <span className="min-w-0 flex-1 truncate" title={item.label}>
        {item.label}
      </span>
      {item.meta ? (
        <span
          className="shrink-0 font-mono text-[10px] tabular-nums"
          style={{ color: PAPER_META }}
        >
          {item.meta}
        </span>
      ) : null}
    </motion.button>
  );
}

type FolderProps = {
  folder: CabinetFolder;
  index: number;
  levels: number;
  open: boolean;
  value: string | null;
  lifting: string | null;
  motionSafe: boolean;
  menuId: string;
  nodeRef: (key: string) => (node: HTMLElement | null) => void;
  onToggle: () => void;
  onChoose: (leafId: string) => void;
};

function Folder({
  folder,
  index,
  levels,
  open,
  value,
  lifting,
  motionSafe,
  menuId,
  nodeRef,
  onToggle,
  onChoose,
}: FolderProps) {
  const items = levels >= 3 ? (folder.items ?? []) : [];
  const nested = items.length > 0;
  const checked = nested
    ? items.some((i) => i.id === value)
    : folder.id === value || (folder.items ?? []).some((i) => i.id === value);
  const { height: foldHeight, bind: bindFold } = useSlide(
    open,
    motionSafe,
    glideSpring,
  );
  const lifted = lifting === folder.id;
  const count = nested ? items.length : 0;

  return (
    <div role="none" className="relative">
      <div className={cn("flex", index % 2 === 1 && "justify-end")}>
        <motion.button
          ref={nodeRef(`f:${folder.id}`)}
          type="button"
          role={nested ? "menuitem" : "menuitemradio"}
          aria-haspopup={nested ? "menu" : undefined}
          aria-expanded={nested ? open : undefined}
          aria-controls={nested && open ? menuId : undefined}
          aria-checked={nested ? undefined : checked}
          tabIndex={-1}
          data-cab="folder"
          data-id={folder.id}
          title={folder.label}
          onClick={() => (nested ? onToggle() : onChoose(folder.id))}
          initial={false}
          animate={{
            y: motionSafe && (open || lifted) ? (lifted ? -5 : -3) : 0,
          }}
          transition={lifted ? springs.flick : springs.snap}
          className={cn(
            "relative flex h-6 w-[62%] cursor-pointer items-center gap-1.5 rounded-t-2 px-2.5 text-left text-xs font-medium outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
            "hover:brightness-[1.04]",
          )}
          style={{ background: MANILA, color: MANILA_INK }}
        >
          {checked ? (
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{folder.label}</span>
          {nested ? (
            <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-70">
              {count}
            </span>
          ) : null}
        </motion.button>
      </div>
      {/* The folder's top edge, the length of the drawer. */}
      <div
        aria-hidden
        className="h-1.5 rounded-b-1"
        style={{ background: MANILA_EDGE }}
      />
      {nested ? (
        <motion.div
          className="overflow-clip"
          style={{ height: foldHeight }}
          inert={!open}
          aria-hidden={open ? undefined : true}
        >
          <div ref={bindFold} className="px-1.5 pt-1.5 pb-1">
            <div
              role="menu"
              id={menuId}
              aria-label={folder.label}
              className="flex flex-col gap-0.5"
            >
              {items.map((item, i) => (
                <Sheet
                  key={item.id}
                  item={item}
                  index={i}
                  count={items.length}
                  open={open}
                  checked={item.id === value}
                  lifting={lifting === item.id}
                  motionSafe={motionSafe}
                  nodeRef={nodeRef(`i:${item.id}`)}
                  onChoose={() => onChoose(item.id)}
                />
              ))}
            </div>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}

type DrawerProps = {
  drawer: CabinetDrawer;
  index: number;
  uid: string;
  open: boolean;
  openFolder: string | null;
  levels: number;
  value: string | null;
  lifting: string | null;
  chosen: string | null;
  focusable: boolean;
  runners: number;
  fin: FinishDef;
  motionSafe: boolean;
  disabled: boolean;
  audio: TactileSound;
  takeArm: (id: string, kind: "open" | "shut") => boolean;
  nodeRef: (key: string) => (node: HTMLElement | null) => void;
  onFront: (id: string) => void;
  onFrontFocus: (id: string) => void;
  onPullStart: (id: string) => void;
  onPullEnd: (id: string, open: boolean) => void;
  onFolder: (drawerId: string, folderId: string) => void;
  onChoose: (leafId: string) => void;
};

/**
 * One drawer: its front, and the inside revealed above it as it comes out.
 * The travel is one motion value; the front's scale and shadow, the window's
 * height and the bearings' cage all read from it.
 */
function Drawer({
  drawer,
  index,
  uid,
  open,
  openFolder,
  levels,
  value,
  lifting,
  chosen,
  focusable,
  runners,
  fin,
  motionSafe,
  disabled,
  audio,
  takeArm,
  nodeRef,
  onFront,
  onFrontFocus,
  onPullStart,
  onPullEnd,
  onFolder,
  onChoose,
}: DrawerProps) {
  const key = safeId(drawer.id);
  const frontId = `${uid}-front-${key}`;
  const labelId = `${uid}-label-${key}`;
  const noteId = `${uid}-note-${key}`;
  const menuId = `${uid}-menu-${key}`;
  const r = clamp01(runners);
  const bearings = r >= 0.35;

  const springOf = React.useCallback(
    (to: boolean) =>
      to
        ? spring(lerp(220, 460, r), lerp(1, 0.62, r))
        : spring(lerp(240, 480, r), lerp(1, 0.55, r)),
    [r],
  );
  const {
    p: travel,
    size,
    peek,
    rest,
    height: windowHeight,
    bind: bindInside,
    slide,
    stop: halt,
  } = useSlide(open, motionSafe, springOf);
  const frontRef = React.useRef<HTMLButtonElement | null>(null);
  const dragFrom = React.useRef(0);
  const peekAnim = React.useRef<AnimationPlaybackControls | null>(null);

  // The thock comes when the drawer actually meets its stop, and only for
  // a drawer the visitor moved.
  React.useEffect(() => {
    let last = travel.get();
    const off = travel.on("change", (v) => {
      const before = last;
      last = v;
      const node = frontRef.current;
      const rect = node?.getBoundingClientRect();
      const pan = rect ? panFrom(rect.left + rect.width / 2, null) : 0;
      if (before < 0.99 && v >= 0.99 && takeArm(drawer.id, "open")) {
        audio.play("thock", { pitch: r2(fin.pitch), gain: 0.6, pan });
      } else if (before > 0.01 && v <= 0.01 && takeArm(drawer.id, "shut")) {
        audio.play("thock", { pitch: r2(fin.pitch * 0.82), gain: 0.4, pan });
      }
    });
    return off;
  }, [audio, drawer.id, fin.pitch, travel, takeArm]);

  React.useEffect(() => () => peekAnim.current?.stop(), []);

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onStart: () => {
      onPullStart(drawer.id);
      halt();
      peekAnim.current?.stop();
      peek.set(0);
      rest.set(0);
      dragFrom.current = travel.get() * Math.max(1, size.get());
    },
    onMove: ({ offset }) => {
      // 1:1 with the hand; past full extension and past home it resists.
      const h = Math.max(1, size.get());
      const raw = dragFrom.current + offset.y;
      const px =
        raw > h
          ? h + rubberband(raw - h, 40)
          : raw < 0
            ? rubberband(raw, 12)
            : raw;
      travel.set(Number((px / h).toFixed(4)));
    },
    onEnd: ({ velocity }) => {
      const h = Math.max(1, size.get());
      const landing = project(travel.get() * h, velocity.y, 0.99);
      const want = landing > h / 2;
      slide(want, velocity.y / h);
      onPullEnd(drawer.id, want);
    },
    onCancel: () => slide(open),
    onTap: () => onFront(drawer.id),
  });

  const lift = useTransform(travel, (v) => r2(1 + 0.012 * clamp01(v)));
  const shadow = useTransform(travel, (v) => {
    const k = clamp01(v);
    return k < 0.01
      ? "none"
      : `0 ${r2(2 + 5 * k)}px ${r2(4 + 10 * k)}px color-mix(in oklab, black ${Math.round(12 + 14 * k)}%, transparent)`;
  });
  // Ball-bearing slides: the cage runs at half the drawer's speed.
  const cage = useTransform(
    [travel, size] as MotionValue<number>[],
    ([v = 0, h = 0]: number[]) => `0 ${r2((v * h) / 2)}px`,
  );
  // Under reduced motion the inside appears at full height with a short fade.
  const reveal = useMotionValue(1);
  React.useEffect(() => {
    if (motionSafe || !open) {
      reveal.set(1);
      return;
    }
    reveal.set(0);
    const a = animate(reveal, 1, {
      duration: durations.base,
      ease: easings.enter,
    });
    return () => a.stop();
  }, [open, motionSafe, reveal]);
  const grain = React.useMemo(
    () => (fin.grain ? grainOf(index + 1) : ""),
    [fin.grain, index],
  );

  // Longhands only: a switch between rail kinds never mixes a shorthand
  // with the properties it would reset.
  const rail = {
    backgroundColor: bearings
      ? "transparent"
      : `color-mix(in oklab, ${fin.carcass} 80%, white)`,
    backgroundImage: bearings
      ? `radial-gradient(circle, ${CHROME[0]} 1.1px, transparent 1.5px), linear-gradient(90deg, ${CHROME[1]}, ${CHROME[2]})`
      : "none",
    backgroundSize: "4px 9px, 100% 100%",
    backgroundPosition: cage,
  };

  return (
    <div role="none" className="flex flex-col-reverse">
      <motion.button
        ref={(node: HTMLButtonElement | null) => {
          frontRef.current = node;
          nodeRef(`d:${drawer.id}`)(node);
        }}
        type="button"
        role="menuitem"
        id={frontId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-labelledby={labelId}
        aria-describedby={noteId}
        tabIndex={focusable ? 0 : -1}
        disabled={disabled}
        data-cab="drawer"
        data-id={drawer.id}
        onFocus={() => onFrontFocus(drawer.id)}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap and keys through
          // the menu; a click with neither behind it comes from assistive
          // technology, and opens or shuts the drawer too.
          if (event.detail === 0) onFront(drawer.id);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || open || disabled) return;
          peekAnim.current?.stop();
          if (motionSafe) peekAnim.current = animate(peek, 3, springs.flick);
        }}
        onPointerLeave={() => {
          peekAnim.current?.stop();
          peekAnim.current = motionSafe
            ? animate(peek, 0, springs.flick)
            : null;
          if (!motionSafe) peek.set(0);
        }}
        {...drag}
        className={cn(
          "relative isolate flex h-14 w-full shrink-0 items-center gap-3 overflow-clip rounded-2 px-2.5 text-left outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{
          background: fin.face,
          scale: lift,
          boxShadow: shadow,
        }}
      >
        {fin.grain ? (
          <svg
            aria-hidden
            viewBox="0 0 300 56"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 -z-10 size-full"
          >
            <path
              d={grain}
              fill="none"
              strokeWidth={1}
              style={{
                stroke: `color-mix(in oklab, ${fin.face} 78%, black)`,
              }}
              opacity={0.45}
            />
          </svg>
        ) : null}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: fin.texture }}
        />
        <span className="flex h-10 min-w-0 flex-1 flex-col justify-center rounded-1 border border-hairline-strong bg-card px-2.5 shadow-[inset_0_1px_2px_color-mix(in_oklab,black_14%,transparent)]">
          <span
            id={labelId}
            className="truncate text-sm leading-4 font-medium text-foreground"
          >
            {drawer.label}
          </span>
          <span
            id={noteId}
            className="truncate font-mono text-[10px] leading-3.5 text-ink-3"
          >
            {chosen ??
              `${drawer.folders.length} ${drawer.folders.length === 1 ? "folder" : "folders"}`}
          </span>
        </span>
        {/* The bar pull: the part a finger grips to drag the drawer out. */}
        <span
          aria-hidden
          className="relative flex h-10 w-16 shrink-0 touch-none items-center justify-center"
        >
          <span
            className="h-2.5 w-14 rounded-full shadow-[0_2px_3px_color-mix(in_oklab,black_28%,transparent)]"
            style={{ background: fin.metal }}
          />
        </span>
      </motion.button>

      <motion.div
        className="relative mx-1 overflow-clip rounded-t-1"
        style={{ height: windowHeight, opacity: reveal }}
        inert={!open}
        aria-hidden={open ? undefined : true}
      >
        <div
          ref={bindInside}
          className="relative px-4 pt-3 pb-2"
          style={{ background: fin.interior }}
        >
          {/* Back wall, side walls and the runners along both sides. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-2"
            style={{
              background: `linear-gradient(180deg, color-mix(in oklab, ${fin.interior} 55%, black), transparent)`,
            }}
          />
          {(["left-0", "right-0"] as const).map((side) => (
            <span
              key={side}
              aria-hidden
              className={cn("absolute inset-y-0 flex w-3 gap-px", side)}
            >
              <motion.span
                className={cn("h-full w-1", side === "right-0" && "order-2")}
                style={rail}
              />
              <span
                className="h-full flex-1"
                style={{
                  background: `linear-gradient(90deg, color-mix(in oklab, ${fin.interior} 70%, black), color-mix(in oklab, ${fin.interior} 85%, white))`,
                }}
              />
            </span>
          ))}
          <div
            role="menu"
            id={menuId}
            aria-labelledby={labelId}
            className="relative flex flex-col gap-1"
          >
            {drawer.folders.map((folder, i) => (
              <Folder
                key={folder.id}
                folder={folder}
                index={i}
                levels={levels}
                open={openFolder === folder.id}
                value={value}
                lifting={lifting}
                motionSafe={motionSafe}
                menuId={`${uid}-folder-${safeId(folder.id)}`}
                nodeRef={nodeRef}
                onToggle={() => onFolder(drawer.id, folder.id)}
                onChoose={onChoose}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

type Said = { n: number; text: string };

/**
 * A nested menu drawn as a filing cabinet. Each top item is a drawer: opened,
 * it slides out toward you on its runners — the front comes down and grows a
 * hair nearer, the drawers below make room, and the inside is revealed above
 * the front, walls, runners and a row of hanging folders with staggered tabs.
 * At `depth` 3 a folder opens in turn and its sheets fan out beneath it.
 * Choosing a leaf lifts it, and the cabinet pushes the drawers home one at a
 * time; the drawer's label holder names the choice.
 *
 * The slide is one spring per drawer, set by `runners`: wooden slides stop
 * dead, ball-bearing slides glide, bump the end-stop and, shut hard, rebound
 * out a little. The pull can be dragged: the drawer follows the hand 1:1 and
 * a throw is projected to open or shut. A thock sounds when a drawer meets its
 * stop and paper rustles with the folders.
 *
 * It is a vertical `role="menubar"`: Up and Down walk a level, Right, Enter
 * or Space open and step in, Left or Escape push the innermost drawer or
 * folder home one at a time, a letter jumps ahead. Under reduced motion
 * nothing slides or bounces: insides appear at full height, and the choice
 * still marks its leaf and its drawer.
 */
export function CabinetMenu({
  drawers,
  value,
  defaultValue = null,
  onValueChange,
  onOpenChange,
  label,
  depth = 3,
  runners = 0.6,
  finish = "steel",
  sound = false,
  disabled = false,
  className,
}: CabinetMenuProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = safeId(React.useId());
  const fin = FINISHES[finish] ?? FINISHES.steel;
  const levels = Math.round(depth) >= 3 ? 3 : 2;

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const current = value !== undefined ? value : own;
  const [openDrawer, setOpenDrawer] = React.useState<string | null>(null);
  const [openFolderRaw, setOpenFolder] = React.useState<string | null>(null);
  const openFolder = levels >= 3 ? openFolderRaw : null;
  const [lifting, setLifting] = React.useState<string | null>(null);
  const [barFocus, setBarFocus] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<string, HTMLElement>());
  const armed = React.useRef(new Map<string, "open" | "shut">());
  const pendingFocus = React.useRef<string | null>(null);
  const timers = React.useRef(new Set<number>());
  const typed = React.useRef({ text: "", at: 0 });
  // The drawer that is out, as of the last change: handlers read this, so a
  // change made a moment ago (a timer, a second key) is never missed.
  const openRef = React.useRef<string | null>(null);

  const changeDrawer = (next: string | null) => {
    const prev = openRef.current;
    openRef.current = next;
    setOpenDrawer(next);
    if (prev !== next) onOpenChange?.(next);
  };

  const nodeRef = (key: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  };

  const takeArm = React.useCallback((id: string, kind: "open" | "shut") => {
    if (armed.current.get(id) !== kind) return false;
    armed.current.delete(id);
    return true;
  }, []);

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  /** Focus now if the node can take it, or as soon as the commit frees it. */
  const reach = (key: string) => {
    const node = nodes.current.get(key);
    if (node && !node.closest("[inert]")) {
      pendingFocus.current = null;
      node.focus({ preventScroll: true });
    } else {
      pendingFocus.current = key;
    }
  };
  const focusNow = (key: string) => {
    nodes.current.get(key)?.focus({ preventScroll: true });
  };

  // Focus that waits for its node to become reachable (a drawer opening
  // takes `inert` off its inside) is moved once the commit lands.
  React.useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    const node = nodes.current.get(key);
    if (!node || node.closest("[inert]")) return;
    pendingFocus.current = null;
    node.focus({ preventScroll: true });
  });

  const drawerOf = (id: string) => drawers.find((d) => d.id === id);
  const folderOf = (id: string) => {
    for (const d of drawers) {
      const f = d.folders.find((x) => x.id === id);
      if (f) return { drawer: d, folder: f };
    }
    return undefined;
  };
  const nested = (f: CabinetFolder) =>
    levels >= 3 && (f.items?.length ?? 0) > 0;

  const openTo = (id: string | null) => {
    const was = openRef.current;
    if (was && was !== id) armed.current.set(was, "shut");
    if (id && id !== was) armed.current.set(id, "open");
    changeDrawer(id);
    setOpenFolder(null);
  };

  const onFront = (id: string) => {
    if (disabled) return;
    openTo(openRef.current === id ? null : id);
  };

  const onPullStart = (id: string) => {
    const was = openRef.current;
    if (was && was !== id) {
      armed.current.set(was, "shut");
      changeDrawer(null);
      setOpenFolder(null);
    }
  };

  const onPullEnd = (id: string, want: boolean) => {
    armed.current.set(id, want ? "open" : "shut");
    if (want) {
      if (openRef.current !== id) setOpenFolder(null);
      changeDrawer(id);
    } else if (openRef.current === id) {
      changeDrawer(null);
      setOpenFolder(null);
    }
  };

  const toggleFolder = (drawerId: string, folderId: string) => {
    if (disabled) return;
    const opening = openFolder !== folderId;
    const node = nodes.current.get(`f:${folderId}`);
    const rect = node?.getBoundingClientRect();
    audio.play("paper", {
      pitch: opening ? 1.05 : 0.9,
      gain: opening ? 0.42 : 0.3,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    if (openRef.current !== drawerId) openTo(drawerId);
    setOpenFolder(opening ? folderId : null);
  };

  const choose = (leafId: string) => {
    if (disabled) return;
    const leaf = findLeaf(drawers, leafId);
    if (!leaf) return;
    const node = nodes.current.get(leaf.item ? `i:${leafId}` : `f:${leafId}`);
    const rect = node?.getBoundingClientRect();
    audio.play("paper", {
      pitch: 1.2,
      gain: 0.5,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    const path = [
      leaf.drawer.label,
      leaf.folder.label,
      ...(leaf.item ? [leaf.item.label] : []),
    ];
    setLifting(leafId);
    if (value === undefined) setOwn(leafId);
    onValueChange?.(leafId, path);
    setSaid((s) => ({
      n: s.n + 1,
      text: `Chose ${path[path.length - 1] ?? ""}, in ${path.slice(0, -1).join(", ")}.`,
    }));
    // Home one at a time: the folder first, then the drawer, and focus
    // goes back to the drawer's front before anything it holds goes inert.
    const hadFolder = !!leaf.item;
    later(() => {
      focusNow(`d:${leaf.drawer.id}`);
      if (hadFolder) {
        audio.play("paper", { pitch: 0.9, gain: 0.26 });
        setOpenFolder(null);
      }
    }, 260);
    later(
      () => {
        if (openRef.current === leaf.drawer.id) {
          armed.current.set(leaf.drawer.id, "shut");
          changeDrawer(null);
        }
        setLifting(null);
      },
      hadFolder ? 520 : 300,
    );
  };

  /** Escape and Left: push the innermost open level home. */
  const pushHome = (level: Level, id: string): boolean => {
    if (level === "item") {
      const f = folderOf(
        [...drawers.flatMap((d) => d.folders)].find((x) =>
          x.items?.some((i) => i.id === id),
        )?.id ?? "",
      );
      if (!f) return false;
      audio.play("paper", { pitch: 0.9, gain: 0.3 });
      setOpenFolder(null);
      focusNow(`f:${f.folder.id}`);
      return true;
    }
    if (level === "folder") {
      const f = folderOf(id);
      if (!f) return false;
      if (openFolder && f.drawer.folders.some((x) => x.id === openFolder)) {
        audio.play("paper", { pitch: 0.9, gain: 0.3 });
        setOpenFolder(null);
        return true;
      }
      openTo(null);
      focusNow(`d:${f.drawer.id}`);
      return true;
    }
    if (openFolder) {
      audio.play("paper", { pitch: 0.9, gain: 0.3 });
      setOpenFolder(null);
      return true;
    }
    const was = openRef.current;
    if (was) {
      openTo(null);
      if (was !== id) focusNow(`d:${was}`);
      return true;
    }
    return false;
  };

  const listOf = (level: Level, id: string): string[] => {
    if (level === "drawer") return drawers.map((d) => d.id);
    if (level === "folder") {
      return folderOf(id)?.drawer.folders.map((f) => f.id) ?? [];
    }
    const f = drawers
      .flatMap((d) => d.folders)
      .find((x) => x.items?.some((i) => i.id === id));
    return f?.items?.map((i) => i.id) ?? [];
  };

  const labelOf = (level: Level, id: string): string => {
    if (level === "drawer") return drawerOf(id)?.label ?? "";
    if (level === "folder") return folderOf(id)?.folder.label ?? "";
    return findLeaf(drawers, id)?.item?.label ?? "";
  };

  const prefix = (level: Level) =>
    level === "drawer" ? "d" : level === "folder" ? "f" : "i";

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-cab]")
        : null;
    if (!target) return;
    const level = target.dataset.cab as Level;
    const id = target.dataset.id ?? "";
    if (!id) return;
    const list = listOf(level, id);
    const at = list.indexOf(id);
    const go = (i: number) => {
      const next = list[(i + list.length) % list.length];
      if (next) focusNow(`${prefix(level)}:${next}`);
    };
    const key = event.key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      go(at + (key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (key === "Home" || key === "End") {
      event.preventDefault();
      go(key === "Home" ? 0 : list.length - 1);
      return;
    }
    if (key === "ArrowRight" || key === "Enter" || key === " ") {
      if (level === "drawer") {
        event.preventDefault();
        const d = drawerOf(id);
        const first = d?.folders[0]?.id;
        if (key !== "ArrowRight" && openRef.current === id) {
          openTo(null);
          return;
        }
        if (openRef.current !== id) openTo(id);
        if (first) reach(`f:${first}`);
        return;
      }
      if (level === "folder") {
        const f = folderOf(id);
        if (!f) return;
        if (nested(f.folder)) {
          event.preventDefault();
          if (key !== "ArrowRight" && openFolder === id) {
            toggleFolder(f.drawer.id, id);
            return;
          }
          if (openFolder !== id) toggleFolder(f.drawer.id, id);
          const first = f.folder.items?.[0]?.id;
          if (first) reach(`i:${first}`);
          return;
        }
        if (key === "ArrowRight") return;
        event.preventDefault();
        choose(id);
        return;
      }
      if (key === "ArrowRight") return;
      event.preventDefault();
      choose(id);
      return;
    }
    if (key === "ArrowLeft") {
      if (level === "drawer") return;
      event.preventDefault();
      pushHome(level, id);
      return;
    }
    if (key === "Escape") {
      // Handled where focus is, one level per press; the stage never sees
      // an Escape that pushed something home.
      if (pushHome(level, id)) event.preventDefault();
      return;
    }
    if (
      key.length === 1 &&
      key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = event.timeStamp;
      const t = typed.current;
      t.text =
        now - t.at < 700 ? t.text + key.toLowerCase() : key.toLowerCase();
      t.at = now;
      const n = list.length;
      for (let k = t.text.length > 1 ? 0 : 1; k <= n; k += 1) {
        const cand = list[(at + k) % n];
        if (cand && labelOf(level, cand).toLowerCase().startsWith(t.text)) {
          event.preventDefault();
          focusNow(`${prefix(level)}:${cand}`);
          return;
        }
      }
    }
  };

  // A press anywhere outside the cabinet pushes everything home.
  const latest = React.useRef({ openTo });
  React.useEffect(() => {
    latest.current = { openTo };
  });
  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !openRef.current) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      latest.current.openTo(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const leaf = findLeaf(drawers, current);
  const chosenIn = (d: CabinetDrawer) => {
    if (!leaf || leaf.drawer.id !== d.id) return null;
    if (levels < 3 || !leaf.item) return leaf.folder.label;
    return `${leaf.folder.label} › ${leaf.item.label}`;
  };
  const tabStop =
    barFocus && drawers.some((d) => d.id === barFocus)
      ? barFocus
      : (leaf?.drawer.id ?? drawers[0]?.id ?? null);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative w-full max-w-80 min-w-0 rounded-3 p-2 pt-3",
        disabled && "opacity-50",
        className,
      )}
      style={{
        background: fin.carcass,
        boxShadow: `inset 0 2px 0 color-mix(in oklab, ${fin.carcass} 70%, white), inset 0 -3px 0 color-mix(in oklab, ${fin.carcass} 70%, black)`,
      }}
    >
      <div
        role="menubar"
        aria-label={label}
        aria-orientation="vertical"
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          // Space was handled on the way down; no click on the way up.
          if (event.key === " ") event.preventDefault();
        }}
        onBlur={(event) => {
          // Tabbing away shuts the cabinet; a click on nothing does not.
          const next = event.relatedTarget;
          if (
            next instanceof Node &&
            !event.currentTarget.contains(next) &&
            openRef.current
          ) {
            openTo(null);
          }
        }}
        className="flex flex-col gap-2"
      >
        {drawers.map((drawer, i) => (
          <Drawer
            key={drawer.id}
            drawer={drawer}
            index={i}
            uid={uid}
            open={openDrawer === drawer.id}
            openFolder={openDrawer === drawer.id ? openFolder : null}
            levels={levels}
            value={current}
            lifting={lifting}
            chosen={chosenIn(drawer)}
            focusable={tabStop === drawer.id}
            runners={runners}
            fin={fin}
            motionSafe={motionSafe}
            disabled={disabled}
            audio={audio}
            takeArm={takeArm}
            nodeRef={nodeRef}
            onFront={onFront}
            onFrontFocus={setBarFocus}
            onPullStart={onPullStart}
            onPullEnd={onPullEnd}
            onFolder={toggleFolder}
            onChoose={choose}
          />
        ))}
      </div>
      {/* The plinth. */}
      <div
        aria-hidden
        className="mx-3 mt-2 h-1.5 rounded-b-1"
        style={{ background: `color-mix(in oklab, ${fin.carcass} 60%, black)` }}
      />
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
