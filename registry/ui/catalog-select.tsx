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
import {
  project,
  rubberband,
  useDrag,
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CatalogOption = {
  value: string;
  /** The card's heading, its tab, and what typing jumps by. */
  label: string;
  /** A second line on the card: a shelf mark, a count. */
  detail?: string;
  disabled?: boolean;
};

export type CatalogDrawer = "oak" | "steel" | "card";

export type CatalogSelectProps = {
  /** What is being chosen. The visible label and the listbox's name. */
  label: string;
  options: CatalogOption[];
  /** Controlled value: the chosen option's `value`, or null for none. */
  value?: string | null;
  /** Initial value when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the key, click or tap that chose a card, with its value. */
  onValueChange?: (value: string) => void;
  /** Controlled: whether the drawer is pulled out. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the key, pull or press that opened or shut the drawer. */
  onOpenChange?: (open: boolean) => void;
  /** Shown in the field before anything is chosen. @default "Choose one" */
  placeholder?: string;
  /** The drawer's own label, in the holder on its front. @default the first and last initials, "A – Z" */
  drawerLabel?: string;
  /** How many cards stand in view in the open drawer, 4 to 12. @default 7 */
  cards?: number;
  /** The drawer's material. @default "oak" */
  drawer?: CatalogDrawer;
  /** How far the card being read tips toward you, 0 to 1; the paper is louder with it. @default 0.7 */
  flip?: number;
  /** The form field name. A hidden input carries the chosen value. */
  name?: string;
  /** Helper text under the drawer. */
  hint?: string;
  /** An error from the host. Replaces the hint and marks the field invalid. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Play the paper and the drawer. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

/** A card: its tab over its body. */
const TAB = 13;
const BODY = 46;
const CARD = TAB + BODY;
/** The pulled-out interior, and the room at its front for fallen cards. */
const DEPTH = 106;
const FLOOR = 14;
/** Where the card being read stands. */
const READ_BOTTOM = DEPTH - FLOOR;
const READ_TOP = READ_BOTTOM - CARD;
const FRONT = 26;
/** The fallen card lies flat toward the viewer. */
const FALLEN = -86;
const PERSPECTIVE = 340;
/** Pixels of drag, and of wheel, per card. */
const DRAG_STEP = 18;
const WHEEL_STEP = 34;
/** A card falling forward accelerates: an ease-in. */
const FALL = [0.5, 0, 0.9, 0.5] as const;
/** How long after the visitor's own input the drawer and cards may sound. */
const HEARD_MS = 1500;

// The cards are paper and the drawer is wood, steel or board: pigments, the
// same in both themes, with ink that is always dark on the paper.
const PAPER = "oklch(0.975 0.012 95)";
const PAPER_SHADE = "oklch(0.9 0.018 90)";
const INK = "oklch(0.3 0.025 260)";
const INK_SOFT = "oklch(0.5 0.02 260)";
const RULE_RED = "oklch(0.64 0.15 25)";
const RULE_BLUE = "oklch(0.8 0.05 240)";
const MARK = "oklch(0.56 0.18 262)";

type Material = {
  face: string;
  front: string;
  inside: string;
  wall: string;
  metal: string;
  metalEdge: string;
};

const shade = (c: string, k: number) =>
  `color-mix(in oklab, ${c} ${100 - k}%, black)`;
const light = (c: string, k: number) =>
  `color-mix(in oklab, ${c} ${100 - k}%, white)`;

function materialOf(kind: CatalogDrawer): Material {
  if (kind === "steel") {
    const face = "oklch(0.74 0.012 250)";
    return {
      face,
      front: `repeating-linear-gradient(90deg, ${light(face, 18)} 0 1px, transparent 1px 3px), linear-gradient(to bottom, ${light(face, 10)}, ${shade(face, 12)})`,
      inside: shade(face, 38),
      wall: shade(face, 22),
      metal: "oklch(0.9 0.008 250)",
      metalEdge: "oklch(0.58 0.012 250)",
    };
  }
  if (kind === "card") {
    const face = "oklch(0.76 0.055 75)";
    return {
      face,
      front: `repeating-linear-gradient(32deg, ${shade(face, 8)} 0 1px, transparent 1px 7px), repeating-linear-gradient(-58deg, ${light(face, 10)} 0 1px, transparent 1px 11px), linear-gradient(to bottom, ${light(face, 6)}, ${shade(face, 8)})`,
      inside: shade(face, 32),
      wall: shade(face, 18),
      metal: "oklch(0.8 0.11 86)",
      metalEdge: "oklch(0.58 0.09 78)",
    };
  }
  const face = "oklch(0.6 0.09 60)";
  return {
    face,
    front: `repeating-linear-gradient(0deg, ${shade(face, 16)} 0 1px, transparent 1px 5px), repeating-linear-gradient(0deg, ${light(face, 10)} 0 1px, transparent 1px 9px), linear-gradient(to bottom, ${light(face, 6)}, ${shade(face, 14)})`,
    inside: shade(face, 40),
    wall: shade(face, 24),
    metal: "oklch(0.8 0.11 86)",
    metalEdge: "oklch(0.58 0.09 78)",
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** A card's pose for its place relative to the one being read. */
function poseOf(d: number, n: number, gap: number, flip: number) {
  // The card that fell last lies on top of the pile; the rest are under it.
  if (d < 0) {
    return {
      y: READ_TOP + distances.step,
      rot: FALLEN,
      op: 0,
      z: d === -1 ? 46 : 1,
    };
  }
  // Tipped toward the viewer, not raised: the file behind stays in view.
  if (d === 0) return { y: READ_TOP, rot: r2(-(3 + 17 * flip)), op: 1, z: 30 };
  if (d < n) return { y: r2(READ_TOP - d * gap), rot: 0, op: 1, z: 30 - d };
  return { y: r2(READ_TOP - n * gap), rot: 0, op: 0, z: 1 };
}

type CardProps = {
  option: CatalogOption;
  index: number;
  id: string;
  d: number;
  n: number;
  gap: number;
  flip: number;
  delay: number;
  open: boolean;
  selected: boolean;
  hovered: boolean;
  lifted: boolean;
  motionSafe: boolean;
  bind: (value: string, node: HTMLDivElement | null) => void;
  onFlip: (kind: "fall" | "rise", index: number) => void;
};

function Card({
  option,
  index,
  id,
  d,
  n,
  gap,
  flip,
  delay,
  open,
  selected,
  hovered,
  lifted,
  motionSafe,
  bind,
  onFlip,
}: CardProps) {
  const pose = poseOf(d, n, gap, flip);
  const y = useMotionValue(pose.y);
  const rot = useMotionValue(pose.rot);
  const op = useMotionValue(pose.op);
  const was = React.useRef(d);

  React.useEffect(() => {
    const target = poseOf(d, n, gap, flip);
    const prev = was.current;
    was.current = d;
    // Closed, nothing is seen: the file is simply put in order.
    if (!open || !motionSafe) {
      y.set(target.y);
      rot.set(target.rot);
      op.set(target.op);
      return;
    }
    const running: AnimationPlaybackControls[] = [];
    const timers: number[] = [];
    if (prev >= 0 && d < 0) {
      // Falling forward: it tips over its bottom edge toward the viewer,
      // accelerating, and is gone as it lies down on the fallen pile.
      timers.push(window.setTimeout(() => onFlip("fall", index), delay * 1000));
      running.push(
        animate(rot, target.rot, { duration: 0.2, delay, ease: FALL }),
        animate(y, target.y, { duration: 0.2, delay, ease: FALL }),
        animate(op, 0, { duration: 0.06, delay: delay + 0.15 }),
      );
    } else if (prev < 0 && d >= 0) {
      // Flipping up off the pile: one crisp overshoot past upright.
      timers.push(window.setTimeout(() => onFlip("rise", index), delay * 1000));
      running.push(
        animate(op, target.op, { duration: 0.05, delay }),
        animate(rot, target.rot, { ...springs.snap, delay }),
        animate(y, target.y, { ...springs.snap, delay }),
      );
    } else {
      // Moving up or back in the file, or anything interrupted: everything
      // goes where it belongs from wherever it is.
      running.push(
        animate(y, target.y, springs.glide),
        animate(rot, target.rot, springs.snap),
        animate(op, target.op, { duration: durations.fast }),
      );
    }
    return () => {
      for (const c of running) c.stop();
      for (const t of timers) window.clearTimeout(t);
    };
  }, [d, n, gap, flip, open, motionSafe, delay, index, onFlip, y, rot, op]);

  const col = index % 3;
  const name = option.detail
    ? `${option.label}, ${option.detail}`
    : option.label;

  return (
    <motion.div
      ref={(node) => bind(option.value, node)}
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      aria-label={name}
      className="absolute inset-x-0 top-0"
      style={{
        height: CARD,
        y,
        rotateX: rot,
        opacity: lifted ? 0 : op,
        transformPerspective: PERSPECTIVE,
        originY: 1,
        zIndex: pose.z,
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 flex items-start gap-1 rounded-t-[3px] px-1.5 pt-[3px]"
        title={option.label}
        style={{
          height: TAB + 2,
          left: `${r2(col * 33.333)}%`,
          width: "33.333%",
          background: hovered
            ? `color-mix(in oklab, ${PAPER} 88%, ${MARK})`
            : PAPER,
          boxShadow: `inset 0 1px 0 ${light(PAPER, 40)}, 0 0 0 0.5px ${PAPER_SHADE}`,
        }}
      >
        <span
          className="min-w-0 flex-1 truncate text-[9px] leading-none font-medium"
          style={{ color: option.disabled ? INK_SOFT : INK }}
        >
          {option.label}
        </span>
        {selected ? (
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: MARK }}
          />
        ) : null}
      </div>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 overflow-clip rounded-[3px] px-2.5 pt-1.5"
        style={{
          top: TAB,
          background: `repeating-linear-gradient(to bottom, transparent 0 25px, color-mix(in oklab, ${RULE_BLUE} 60%, transparent) 25px 26px, transparent 26px 38px), linear-gradient(to bottom, ${PAPER}, color-mix(in oklab, ${PAPER} 90%, ${PAPER_SHADE}))`,
          boxShadow: `0 -0.5px 0 ${PAPER_SHADE}, 0 1px 1.5px color-mix(in oklab, black 22%, transparent)`,
          opacity: option.disabled ? 0.6 : 1,
        }}
      >
        <div
          className="flex h-5 items-baseline gap-2 border-b"
          style={{ borderColor: RULE_RED }}
        >
          <span
            className={cn(
              "min-w-0 truncate text-[13px] leading-5 font-medium",
              option.disabled && "line-through",
            )}
            style={{ color: INK }}
          >
            {option.label}
          </span>
        </div>
        {option.detail ? (
          <p
            className="truncate pt-1 text-[11px] leading-4"
            style={{ color: INK_SOFT }}
          >
            {option.detail}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}

type Box = { x: number; y: number; w: number; h: number };
type Flight = {
  key: number;
  option: CatalogOption;
  col: number;
  from: Box;
  to: Box;
};

/** The chosen card, lifted out of the drawer and set into the field. */
function FlyingCard({
  flight,
  fieldIn,
  onDone,
}: {
  flight: Flight;
  fieldIn: MotionValue<number>;
  onDone: () => void;
}) {
  const x = useMotionValue(flight.from.x);
  const y = useMotionValue(flight.from.y);
  const w = useMotionValue(flight.from.w);
  const h = useMotionValue(flight.from.h);
  const op = useMotionValue(1);

  React.useEffect(() => {
    const { to } = flight;
    const handOver = {
      duration: durations.fast,
      delay: 0.3,
      ease: easings.enter,
    };
    // Continues from wherever a re-run caught it, so it always lands.
    const running = [
      animate(x, to.x, springs.glide),
      animate(y, to.y, springs.glide),
      animate(w, to.w, springs.glide),
      animate(h, to.h, springs.glide),
      animate(op, 0, handOver),
      animate(fieldIn, 1, handOver),
    ];
    const done = window.setTimeout(onDone, 480);
    return () => {
      for (const c of running) c.stop();
      window.clearTimeout(done);
    };
  }, [fieldIn, flight, h, onDone, op, w, x, y]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-50 overflow-clip rounded-[3px]"
      style={{
        x,
        y,
        width: w,
        height: h,
        opacity: op,
        background: PAPER,
        boxShadow: `0 6px 16px color-mix(in oklab, black 22%, transparent), 0 0 0 0.5px ${PAPER_SHADE}`,
      }}
    >
      <div className="flex h-full flex-col justify-center px-2.5">
        <span
          className="truncate border-b text-[13px] leading-5 font-medium"
          style={{ color: INK, borderColor: RULE_RED }}
        >
          {flight.option.label}
        </span>
      </div>
    </motion.div>
  );
}

/** A small drawer that slides out of its cabinet with the real one. */
function DrawerGlyph({
  open,
  motionSafe,
}: {
  open: boolean;
  motionSafe: boolean;
}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-3">
      <rect
        x={1.5}
        y={1.5}
        width={13}
        height={9}
        rx={1.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
      />
      <motion.g
        initial={false}
        animate={{ y: open ? 3 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        <rect
          x={3}
          y={6}
          width={10}
          height={5.5}
          rx={1}
          className="fill-surface-1"
          stroke="currentColor"
          strokeWidth={1.2}
        />
        <path
          d="M6.5 9 H9.5"
          stroke="currentColor"
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      </motion.g>
    </svg>
  );
}

type Nav = { active: number; from: number; key: number };

/**
 * A select whose options are index cards filed in a catalog drawer. The
 * field shows the chosen card; the drawer's front hangs under it. Opening
 * pulls the drawer out — its interior grows to its depth on the glide
 * spring with the front riding down, the cards anchored to the front so the
 * nearest emerge first — and the front can be pulled by hand, 1:1, with a
 * release that commits by projection.
 *
 * Inside, the card being read stands at the front tipped toward you; the
 * cards after it stand behind showing their tabs, cut in three staggered
 * positions so a tab stays legible in a packed file; the cards before it have
 * fallen forward. Moving on makes the current card fall forward over its
 * bottom edge while the file glides one place nearer; moving back flips the
 * last fallen card up on the snap spring. A jump riffles, one card at a time
 * on cascade(). Each flip is a paper sound. Choosing lifts the card out and
 * sets it into the field on glide as the drawer shuts under it.
 *
 * It is the select-only combobox pattern: focus stays on the field, the
 * card being read is its active descendant, arrows and Page keys move,
 * Home/End jump, typing jumps by first letters, Enter chooses and Escape
 * shuts. Under reduced motion the drawer opens and shuts in one step and
 * cards change places without falling, and the field still updates.
 */
export function CatalogSelect({
  label,
  options,
  value,
  defaultValue = null,
  onValueChange,
  open,
  defaultOpen = false,
  onOpenChange,
  placeholder = "Choose one",
  drawerLabel,
  cards = 7,
  drawer = "oak",
  flip = 0.7,
  name,
  hint,
  error,
  required = false,
  disabled = false,
  sound = false,
  className,
}: CatalogSelectProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const listId = `${uid}-list`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const optId = (i: number) => `${uid}-opt-${i}`;

  const count = options.length;
  const n = clamp(Math.round(cards), 2, 12);
  const gap = r2(Math.min(12, (READ_TOP - 3) / Math.max(1, n - 1)));
  const f = clamp(flip, 0, 1);
  const material = materialOf(drawer);

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const current = value === undefined ? own : value;
  const chosenIndex = options.findIndex((o) => o.value === current);
  const chosen = chosenIndex === -1 ? undefined : options[chosenIndex];

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = (open ?? ownOpen) && !disabled && count > 0;

  const firstEnabled = options.findIndex((o) => !o.disabled);
  const home = chosenIndex !== -1 ? chosenIndex : Math.max(0, firstEnabled);
  const [nav, setNav] = React.useState<Nav>({
    active: home,
    from: home,
    key: 0,
  });
  const active = clamp(nav.active, 0, Math.max(0, count - 1));

  const [hover, setHover] = React.useState<number | null>(null);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [touched, setTouched] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const comboRef = React.useRef<HTMLButtonElement | null>(null);
  const valueRef = React.useRef<HTMLSpanElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLDivElement>());
  // Sound answers the visitor: a flip or a drawer is heard only within a
  // moment of their own key, pull, wheel or press, never after a host's change.
  const heardAt = React.useRef(-Infinity);
  const typed = React.useRef({ text: "", timer: 0 });
  const wheel = React.useRef(0);
  const dragFrom = React.useRef(0);
  const pullFrom = React.useRef(0);
  const flights = React.useRef(0);
  const pullAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const throwSpeed = React.useRef(0);
  const releaseFront = React.useRef<(() => void) | null>(null);

  const pull = useMotionValue(isOpen ? 1 : 0);
  const fieldIn = useMotionValue(1);
  const interiorH = useTransform(pull, (p) => r2(Math.max(0, p) * DEPTH));

  const problem =
    error ??
    (required && touched && chosenIndex === -1
      ? "Choose one to continue."
      : null);

  const panHere = () => {
    const rect = comboRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const enabledNear = (from: number, dir: 1 | -1) => {
    for (let i = from; i >= 0 && i < count; i += dir) {
      if (!options[i]?.disabled) return i;
    }
    return -1;
  };

  const lastEnabled = enabledNear(count - 1, -1);

  const setOpenTo = (next: boolean) => {
    if (disabled || next === isOpen) return;
    heardAt.current = performance.now();
    if (!next) setTouched(true);
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const openAt = (i: number) => {
    const at = i === -1 ? home : i;
    setNav((v) => ({ active: at, from: at, key: v.key + 1 }));
    setOpenTo(true);
  };

  const moveTo = (i: number) => {
    if (i < 0 || i >= count || i === active) return;
    heardAt.current = performance.now();
    setNav((v) => ({ active: i, from: active, key: v.key + 1 }));
  };

  const step = (by: number) => {
    const dir = by > 0 ? 1 : -1;
    const target = clamp(active + by, 0, count - 1);
    // The nearest enabled card on the way to the target; past it if none.
    let next = -1;
    for (let i = target; dir === 1 ? i > active : i < active; i -= dir) {
      if (!options[i]?.disabled) {
        next = i;
        break;
      }
    }
    if (next === -1) next = enabledNear(target, dir);
    if (next !== -1) moveTo(next);
  };

  const find = (key: string, from: number) => {
    window.clearTimeout(typed.current.timer);
    typed.current.timer = window.setTimeout(() => {
      typed.current.text = "";
    }, 600);
    const text = (typed.current.text + key).toLowerCase();
    typed.current.text = text;
    // The same letter again cycles through the cards that start with it.
    const cycling = [...text].every((c) => c === text[0]);
    const search = cycling ? text.slice(0, 1) : text;
    const start = cycling || text.length === 1 ? from + 1 : from;
    for (let i = 0; i < count; i += 1) {
      const k = (start + i) % count;
      const o = options[k];
      if (o && !o.disabled && o.label.toLowerCase().startsWith(search))
        return k;
    }
    return -1;
  };

  const choose = (i: number) => {
    const option = options[i];
    if (!option || option.disabled || disabled) return;
    heardAt.current = performance.now();
    const root = rootRef.current;
    const card = cardNodes.current.get(option.value);
    const field = valueRef.current;
    if (motionSafe && isOpen && root && card && field) {
      const r = root.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const t = field.getBoundingClientRect();
      flights.current += 1;
      fieldIn.set(0);
      setFlight({
        key: flights.current,
        option,
        col: i % 3,
        from: {
          x: r2(c.left - r.left),
          y: r2(c.top - r.top),
          w: r2(c.width),
          h: r2(c.height),
        },
        to: {
          x: r2(t.left - r.left - 6),
          y: r2(t.top - r.top - 4),
          w: r2(Math.min(c.width, t.width + 12)),
          h: r2(t.height + 8),
        },
      });
    }
    audio.play("paper", {
      pitch: 1.2,
      gain: r2(0.3 + 0.3 * f),
      pan: panHere(),
    });
    setSaid((s) => ({ n: s.n + 1, text: `${option.label} chosen.` }));
    setNav((v) => ({ active: i, from: i, key: v.key + 1 }));
    if (option.value !== current) {
      if (value === undefined) setOwn(option.value);
      onValueChange?.(option.value);
    }
    setOpenTo(false);
  };

  /** Where in the open drawer a point lands: a card, or the fallen pile. */
  const hitAt = (clientX: number, clientY: number): number | "pile" | null => {
    const list = listRef.current;
    if (!list) return null;
    const rect = list.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (y > READ_BOTTOM) return active > 0 ? "pile" : active;
    if (y >= READ_TOP) return active;
    const col = clamp(Math.floor((x / Math.max(1, rect.width)) * 3), 0, 2);
    let nearest = -1;
    for (let d = 1; d < n && active + d < count; d += 1) {
      const top = READ_TOP - d * gap;
      if (y < top) continue;
      if (nearest === -1) nearest = active + d;
      if ((active + d) % 3 === col && y < top + TAB + gap) return active + d;
    }
    return nearest === -1 ? null : nearest;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || count === 0) return;
    const key = event.key;
    const printable =
      key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (!isOpen) {
      if (key === "ArrowDown" || key === "Enter" || key === " ") {
        event.preventDefault();
        openAt(home);
      } else if (key === "ArrowUp" || key === "Home") {
        event.preventDefault();
        openAt(firstEnabled);
      } else if (key === "End") {
        event.preventDefault();
        openAt(lastEnabled);
      } else if (printable) {
        event.preventDefault();
        openAt(find(key, home));
      }
      return;
    }
    switch (key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        if (event.altKey) choose(active);
        else step(-1);
        return;
      case "Home":
        event.preventDefault();
        moveTo(firstEnabled);
        return;
      case "End":
        event.preventDefault();
        moveTo(lastEnabled);
        return;
      case "PageDown":
        event.preventDefault();
        step(n - 1);
        return;
      case "PageUp":
        event.preventDefault();
        step(-(n - 1));
        return;
      case "Enter":
        event.preventDefault();
        choose(active);
        return;
      case "Escape":
        // Handled here, where focus is; the page must not also see it.
        event.preventDefault();
        setOpenTo(false);
        return;
      case "Tab":
        choose(active);
        return;
    }
    if (key === " " && typed.current.text === "") {
      event.preventDefault();
      choose(active);
      return;
    }
    if (printable) {
      event.preventDefault();
      const found = find(key, active);
      if (found !== -1) moveTo(found);
    }
  };

  const listDrag = useDrag({
    axis: "y",
    threshold: 6,
    disabled: disabled || !isOpen,
    onStart: () => {
      dragFrom.current = active;
    },
    onMove: ({ offset }) => {
      const target = clamp(
        dragFrom.current + Math.round(-offset.y / DRAG_STEP),
        0,
        count - 1,
      );
      if (target === active) return;
      const dir = target > active ? 1 : -1;
      const found = enabledNear(target, dir === 1 ? -1 : 1);
      if (found !== -1) moveTo(found);
    },
    onTap: (event) => {
      const hit = hitAt(event.clientX, event.clientY);
      comboRef.current?.focus({ preventScroll: true });
      if (hit === "pile") step(-1);
      else if (hit !== null) choose(hit);
    },
  });

  const settlePull = (to: boolean, velocity = 0) => {
    pullAnim.current?.stop();
    const target = to ? 1 : 0;
    if (!motionSafe) {
      pull.set(target);
      return;
    }
    pullAnim.current = animate(pull, target, {
      ...springs.glide,
      velocity: velocity / DEPTH,
      onComplete: () => {
        if (performance.now() - heardAt.current > HEARD_MS) return;
        audio.play("thock", {
          pitch: to ? 1.15 : 0.85,
          gain: 0.55,
          pan: panHere(),
        });
      },
    });
  };

  const frontDrag = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: () => {
      releaseFront.current?.();
      pullAnim.current?.stop();
      pullFrom.current = pull.get();
    },
    onMove: ({ offset }) => {
      const raw = pullFrom.current + offset.y / DEPTH;
      // Past open the drawer gives a little, never more than a few pixels.
      const p =
        raw < 0
          ? rubberband(raw * DEPTH, DEPTH) / DEPTH
          : raw > 1
            ? 1 + rubberband((raw - 1) * DEPTH, 8) / DEPTH
            : raw;
      pull.set(Number(Math.max(0, p).toFixed(4)));
    },
    onEnd: ({ velocity }) => {
      comboRef.current?.focus({ preventScroll: true });
      const landing = project(pull.get() * DEPTH, velocity.y, 0.99) / DEPTH;
      const next = landing > 0.5;
      heardAt.current = performance.now();
      throwSpeed.current = velocity.y;
      // Uncontrolled, the open state follows and carries the drawer with the
      // throw. Controlled, it goes back to where the host says until the
      // host answers, so a refusal never leaves it half out.
      if (next === isOpen || open !== undefined) settlePull(isOpen, velocity.y);
      if (next !== isOpen) {
        if (next) openAt(home);
        else setOpenTo(false);
      }
    },
    onCancel: () => settlePull(isOpen),
    onTap: () => {
      comboRef.current?.focus({ preventScroll: true });
      if (isOpen) setOpenTo(false);
      else openAt(home);
    },
  });

  const onFlipNow = (kind: "fall" | "rise", index: number) => {
    if (performance.now() - heardAt.current > HEARD_MS) return;
    audio.play("paper", {
      pitch: r2((kind === "rise" ? 1.18 : 0.92) + (index % 3) * 0.04),
      gain: r2(0.14 + 0.36 * f),
      pan: panHere(),
    });
  };

  const onWheelNow = (event: WheelEvent) => {
    if (!isOpen || disabled) return;
    event.preventDefault();
    wheel.current += wheelPixels(event).y;
    if (Math.abs(wheel.current) < WHEEL_STEP) return;
    const dir = wheel.current > 0 ? 1 : -1;
    wheel.current -= dir * WHEEL_STEP;
    wheel.current = clamp(wheel.current, -WHEEL_STEP, WHEEL_STEP);
    step(dir);
  };

  const api = React.useRef({ onFlipNow, onWheelNow, settlePull });
  React.useEffect(() => {
    api.current = { onFlipNow, onWheelNow, settlePull };
  });
  const onFlip = React.useCallback(
    (kind: "fall" | "rise", index: number) =>
      api.current.onFlipNow(kind, index),
    [],
  );
  const bindCard = React.useCallback(
    (key: string, node: HTMLDivElement | null) => {
      if (node) cardNodes.current.set(key, node);
      else cardNodes.current.delete(key);
    },
    [],
  );
  const endFlight = React.useCallback(() => {
    fieldIn.set(1);
    setFlight(null);
  }, [fieldIn]);

  const bindList = React.useCallback((node: HTMLDivElement | null) => {
    listRef.current = node;
    if (!node) return;
    const onWheel = (event: WheelEvent) => api.current.onWheelNow(event);
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  // The drawer goes where the open state says, from a key, a pull or a host.
  const shownOpen = React.useRef(isOpen);
  React.useEffect(() => {
    if (shownOpen.current === isOpen) return;
    shownOpen.current = isOpen;
    api.current.settlePull(isOpen, throwSpeed.current);
    throwSpeed.current = 0;
  }, [isOpen]);

  // A press anywhere outside shuts the drawer.
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
      heardAt.current = performance.now();
      if (open === undefined) setOwnOpen(false);
      setTouched(true);
      onOpenChange?.(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen, open, onOpenChange]);

  React.useEffect(() => {
    const t = typed.current;
    return () => {
      window.clearTimeout(t.timer);
      pullAnim.current?.stop();
      releaseFront.current?.();
    };
  }, []);

  // A riffle: every card between the old place and the new falls or rises
  // in turn; the rest simply move.
  const jump = Math.abs(active - nav.from);
  const beat = jump > 1 ? cascade(jump) : 0;
  const delayOf = (i: number) => {
    if (jump < 2) return 0;
    if (active > nav.from && i >= nav.from && i < active) {
      return r2((i - nav.from) * beat);
    }
    if (active < nav.from && i >= active && i < nav.from) {
      return r2((nav.from - 1 - i) * beat);
    }
    return 0;
  };

  const initials =
    drawerLabel ??
    (count > 0
      ? `${options[0]?.label.charAt(0).toUpperCase() ?? ""} – ${options[count - 1]?.label.charAt(0).toUpperCase() ?? ""}`
      : "");
  const fallen = Math.min(active, 4);
  const describedBy = problem ? errorId : hint ? hintId : undefined;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex w-full flex-col gap-1.5",
        disabled && "opacity-50",
        className,
      )}
    >
      {/* Named by aria-labelledby; a press on it focuses the field without
          pulling the drawer, as a label does for a native select. */}
      <label
        id={labelId}
        onClick={() => comboRef.current?.focus()}
        className="text-sm leading-5 font-medium text-foreground"
      >
        {label}
      </label>

      <button
        ref={comboRef}
        id={`${uid}-field`}
        type="button"
        role="combobox"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={isOpen && count > 0 ? optId(active) : undefined}
        aria-describedby={describedBy}
        aria-invalid={problem ? true : undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (event.key === " ") event.preventDefault();
        }}
        onClick={(event) => {
          // Keys arrive through onKeyDown; this is the pointer's press.
          if (event.detail === 0) return;
          if (isOpen) setOpenTo(false);
          else openAt(home);
        }}
        className={cn(
          "relative flex h-10 w-full items-center gap-2 rounded-2 border bg-surface-1 px-3 text-left transition-colors outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "enabled:cursor-pointer disabled:cursor-not-allowed",
          problem
            ? "border-danger"
            : "border-input hover:border-hairline-strong",
        )}
      >
        <motion.span
          ref={valueRef}
          className="flex min-w-0 flex-1 items-baseline gap-2"
          style={{ opacity: fieldIn }}
        >
          {chosen ? (
            <>
              <span className="truncate text-sm text-foreground">
                {chosen.label}
              </span>
              {chosen.detail ? (
                <span className="truncate text-xs text-ink-3">
                  {chosen.detail}
                </span>
              ) : null}
            </>
          ) : (
            <span className="truncate text-sm text-ink-3">{placeholder}</span>
          )}
        </motion.span>
        <DrawerGlyph open={isOpen} motionSafe={motionSafe} />
      </button>

      <div className="flex flex-col">
        <motion.div
          className="relative overflow-clip rounded-t-[3px]"
          style={{ height: interiorH }}
          inert={!isOpen}
        >
          <div
            ref={bindList}
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            tabIndex={-1}
            {...listDrag}
            onPointerDown={(event) => {
              // The field keeps focus; the drawer is pointed at, not entered.
              event.preventDefault();
              listDrag.onPointerDown(event);
            }}
            onPointerMove={(event) => {
              listDrag.onPointerMove(event);
              if (event.pointerType !== "mouse") return;
              const hit = hitAt(event.clientX, event.clientY);
              setHover(typeof hit === "number" ? hit : null);
            }}
            onPointerLeave={() => setHover(null)}
            className={cn(
              "absolute inset-x-0 bottom-0 touch-none outline-none select-none",
              isOpen && !disabled ? "cursor-pointer" : "",
            )}
            style={{ height: DEPTH, background: material.inside }}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1.5"
              style={{ background: material.wall }}
            />
            <span
              aria-hidden
              className="absolute inset-y-0 right-0 w-1.5"
              style={{ background: material.wall }}
            />
            <div className="absolute inset-x-2 inset-y-0">
              {options.map((option, i) => (
                <Card
                  key={option.value}
                  option={option}
                  index={i}
                  id={optId(i)}
                  d={i - active}
                  n={n}
                  gap={gap}
                  flip={f}
                  delay={delayOf(i)}
                  open={isOpen}
                  selected={i === chosenIndex}
                  hovered={hover === i}
                  lifted={flight?.option.value === option.value}
                  motionSafe={motionSafe}
                  bind={bindCard}
                  onFlip={onFlip}
                />
              ))}
              {Array.from({ length: fallen }, (_, k) => (
                <span
                  key={k}
                  aria-hidden
                  className="absolute rounded-[1px]"
                  style={{
                    left: 4 - k,
                    right: 4 - k,
                    top: READ_BOTTOM + 2 + k * 2.5,
                    height: 3,
                    zIndex: 45,
                    background: `linear-gradient(to bottom, ${PAPER}, ${PAPER_SHADE})`,
                    boxShadow: `0 1px 0 color-mix(in oklab, black 25%, transparent)`,
                  }}
                />
              ))}
            </div>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-50 h-2.5"
              style={{
                background: `linear-gradient(to bottom, color-mix(in oklab, black 45%, transparent), transparent)`,
              }}
            />
          </div>
        </motion.div>

        <div
          aria-hidden
          {...frontDrag}
          onPointerDown={(event) => {
            event.preventDefault();
            frontDrag.onPointerDown(event);
            // The front is short: a quick pull leaves it before it has moved
            // far enough to be a drag. Until the drag takes the pointer,
            // moves and a release anywhere reach it too.
            releaseFront.current?.();
            const node = event.currentTarget;
            const id = event.pointerId;
            const elsewhere = (e: PointerEvent) =>
              e.pointerId === id &&
              !(e.target instanceof Node && node.contains(e.target));
            const move = (e: PointerEvent) => {
              if (elsewhere(e)) {
                frontDrag.onPointerMove(e as unknown as React.PointerEvent);
              }
            };
            const up = (e: PointerEvent) => {
              if (e.pointerId !== id) return;
              releaseFront.current?.();
              if (!elsewhere(e)) return;
              const forwarded = e as unknown as React.PointerEvent;
              if (e.type === "pointercancel")
                frontDrag.onPointerCancel(forwarded);
              else frontDrag.onPointerUp(forwarded);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
            window.addEventListener("pointercancel", up);
            releaseFront.current = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
              window.removeEventListener("pointercancel", up);
              releaseFront.current = null;
            };
          }}
          className={cn(
            "relative flex touch-pan-x flex-col items-center justify-center gap-px rounded-b-2 select-none",
            disabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
          style={{
            height: FRONT,
            background: material.front,
            boxShadow: `inset 0 1px 0 ${light(material.face, 30)}, inset 0 -1px 0 ${shade(material.face, 30)}`,
          }}
        >
          <span
            className="flex h-3.5 items-center rounded-[2px] px-1.5 font-mono text-[8px] leading-none tracking-[0.08em]"
            style={{
              color: INK,
              background: PAPER,
              boxShadow: `0 0 0 1.5px ${material.metal}, 0 0 0 2px ${material.metalEdge}`,
            }}
          >
            {initials}
          </span>
          <span
            className="h-1.5 w-8 rounded-b-full"
            style={{
              background: `linear-gradient(to bottom, ${material.metal}, ${material.metalEdge})`,
              boxShadow: `0 1px 0 ${shade(material.face, 40)}`,
            }}
          />
        </div>
      </div>

      {hint || problem ? (
        <div className="grid text-xs leading-4">
          {hint ? (
            <p
              id={hintId}
              aria-hidden={problem ? true : undefined}
              className={cn(
                "col-start-1 row-start-1 text-ink-3 transition-opacity",
                problem ? "opacity-0" : "opacity-100",
              )}
            >
              {hint}
            </p>
          ) : null}
          <p
            id={errorId}
            className={cn(
              "col-start-1 row-start-1 text-danger transition-opacity",
              problem ? "opacity-100" : "opacity-0",
            )}
          >
            {problem}
          </p>
        </div>
      ) : null}

      {flight ? (
        <FlyingCard
          key={flight.key}
          flight={flight}
          fieldIn={fieldIn}
          onDone={endFlight}
        />
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
      {name ? <input type="hidden" name={name} value={current ?? ""} /> : null}
    </div>
  );
}
