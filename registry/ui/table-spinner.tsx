"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type TableSpinnerItem = {
  /** An image URL. Without one, a picture is drawn in code. */
  src?: string;
  /** What the picture shows. */
  alt: string;
  /** A short title, shown under the plate when the picture is at the front. */
  caption?: string;
};

export type TableSpinnerWood = "oak" | "walnut" | "ash" | "ebony";

export type TableSpinnerProps = {
  /** The pictures, laid round the plate in order (3 to 16). @default eight drawn pieces of pottery */
  items?: TableSpinnerItem[];
  /** The picture at the front (controlled), by index. */
  value?: number;
  /** The picture at the front to begin with. @default 0 */
  defaultValue?: number;
  /** Fires from the throw, key or press that brought a new picture to the front. */
  onValueChange?: (index: number) => void;
  /** How steeply you look down at the plate, degrees from face-on. @default 60 */
  tilt?: number;
  /** How quickly a thrown plate slows, 0 (it coasts for turns) to 1 (it stops almost at once). @default 0.5 */
  friction?: number;
  /** How much of the box the plate fills, 0.5 to 1. @default 0.9 */
  plateSize?: number;
  /** The plate's timber. @default "oak" */
  wood?: TableSpinnerWood;
  /** How far the front picture stands up, 0 (it stays flat) to 1 (it faces you). @default 1 */
  stand?: number;
  /** Turn to the next picture by itself every this many ms while on screen and untouched; 0 never. @default 0 */
  autoTurn?: number;
  /** What starts the entrance spin: coming into view, or mounting. @default "inView" */
  trigger?: "inView" | "mount";
  /** Show the front picture's caption under the plate. @default true */
  captions?: boolean;
  /** The turntable's accessible name. @default "Turntable of pictures" */
  label?: string;
  /** No spinning, pressing or keys. @default false */
  disabled?: boolean;
  /** Sizes the turntable; it fills a 416px-tall box by default. */
  className?: string;
};

type Glaze = {
  name: string;
  vessel: string;
  glaze: [string, string];
  back: [string, string];
};

const tone = (token: string, l: number, c: number, turn = 0) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn}))`;

/** Eight pieces from one firing: a vessel, its glaze and the backdrop it was shot on. */
const KILN: Glaze[] = [
  {
    name: "Celadon bowl",
    vessel: "bowl",
    glaze: [tone("--signal", 0.84, 0.06), tone("--signal", 0.62, 0.07, 10)],
    back: [tone("--warn", 0.93, 0.02), tone("--warn", 0.82, 0.03)],
  },
  {
    name: "Ash-glaze jar",
    vessel: "jar",
    glaze: [tone("--warn", 0.76, 0.06), tone("--success", 0.48, 0.05, -40)],
    back: [tone("--accent", 0.9, 0.015), tone("--accent", 0.78, 0.02)],
  },
  {
    name: "Tenmoku cup",
    vessel: "cup",
    glaze: [tone("--danger", 0.44, 0.07, 20), tone("--danger", 0.22, 0.03, 30)],
    back: [tone("--warn", 0.88, 0.04), tone("--warn", 0.72, 0.06)],
  },
  {
    name: "Shino plate",
    vessel: "plate",
    glaze: [tone("--warn", 0.95, 0.025), tone("--danger", 0.74, 0.07, 30)],
    back: [tone("--accent", 0.42, 0.04), tone("--accent", 0.28, 0.03)],
  },
  {
    name: "Iron-red vase",
    vessel: "vase",
    glaze: [tone("--danger", 0.6, 0.15), tone("--danger", 0.38, 0.12, 8)],
    back: [tone("--warn", 0.94, 0.02), tone("--warn", 0.84, 0.03)],
  },
  {
    name: "Kiln-blue teapot",
    vessel: "teapot",
    glaze: [tone("--accent", 0.62, 0.13), tone("--accent", 0.36, 0.12, 6)],
    back: [tone("--warn", 0.9, 0.03), tone("--warn", 0.76, 0.05)],
  },
  {
    name: "Oatmeal mug",
    vessel: "mug",
    glaze: [tone("--warn", 0.9, 0.035), tone("--warn", 0.7, 0.05, -6)],
    back: [tone("--success", 0.5, 0.05), tone("--success", 0.34, 0.04)],
  },
  {
    name: "Copper-red bottle",
    vessel: "bottle",
    glaze: [tone("--danger", 0.56, 0.17, -6), tone("--danger", 0.32, 0.12)],
    back: [tone("--accent", 0.88, 0.02), tone("--accent", 0.74, 0.03)],
  },
];

const VESSELS: Record<string, string> = {
  bowl: "M14 60 Q16 84 40 86 Q64 84 66 60 Z",
  jar: "M30 30 L30 25 L50 25 L50 30 Q66 42 61 68 Q57 86 40 86 Q23 86 19 68 Q14 42 30 30 Z",
  cup: "M25 46 L29 82 Q40 87 51 82 L55 46 Z",
  plate: "M10 74 Q40 62 70 74 Q40 86 10 74 Z",
  vase: "M35 18 L45 18 Q44 32 52 46 Q62 66 54 80 Q47 88 40 88 Q33 88 26 80 Q18 66 28 46 Q36 32 35 18 Z",
  teapot:
    "M22 56 Q22 40 40 38 Q58 40 58 56 Q58 78 40 80 Q22 78 22 56 Z M58 52 Q66 48 72 38 L74 40 Q68 54 58 64 Z M22 50 Q10 50 12 60 Q14 70 22 68 L22 64 Q16 64 16 60 Q16 54 22 55 Z M36 38 Q36 32 40 31 Q44 32 44 38 Z",
  mug: "M24 44 L56 44 L56 80 Q40 86 24 80 Z M56 50 Q68 50 68 61 Q68 72 56 72 L56 67 Q63 67 63 61 Q63 55 56 55 Z",
  bottle:
    "M37 14 L43 14 L43 38 Q60 46 58 68 Q56 86 40 86 Q24 86 22 68 Q20 46 37 38 Z",
};

/** The default pictures: the eight pieces of the spring firing. */
export const defaultTableSpinnerItems: TableSpinnerItem[] = KILN.map((k) => ({
  alt: `${k.name}, photographed on a turntable`,
  caption: k.name,
}));

const WOODS: Record<
  TableSpinnerWood,
  { hi: string; lo: string; edge: string }
> = {
  oak: {
    hi: tone("--warn", 0.78, 0.07, -12),
    lo: tone("--warn", 0.64, 0.085, -20),
    edge: tone("--warn", 0.48, 0.07, -22),
  },
  walnut: {
    hi: tone("--warn", 0.55, 0.06, -28),
    lo: tone("--warn", 0.42, 0.055, -32),
    edge: tone("--warn", 0.3, 0.04, -34),
  },
  ash: {
    hi: tone("--warn", 0.88, 0.04, -4),
    lo: tone("--warn", 0.78, 0.05, -8),
    edge: tone("--warn", 0.62, 0.05, -12),
  },
  ebony: {
    hi: tone("--ink-3", 0.34, 0.012),
    lo: tone("--ink-3", 0.24, 0.01),
    edge: tone("--ink-3", 0.16, 0.008),
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const mod = (v: number, n: number) => ((v % n) + n) % n;
/** An angle folded into (−180, 180]. */
const fold = (deg: number) => {
  const a = mod(deg + 180, 360) - 180;
  return a === -180 ? 180 : a;
};

/** Radius of the pictures' outer edges, as a share of the plate's diameter. */
const R_OUT = 0.455;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

function Art({ k, uid }: { k: number; uid: string }) {
  const g = KILN[k % KILN.length] ?? KILN[0];
  if (!g) return null;
  const id = `${uid}-art-${k}`;
  return (
    <svg
      aria-hidden
      viewBox="0 0 80 100"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <defs>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: g.back[0] }} />
          <stop offset="1" style={{ stopColor: g.back[1] }} />
        </linearGradient>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: g.glaze[0] }} />
          <stop offset="1" style={{ stopColor: g.glaze[1] }} />
        </linearGradient>
      </defs>
      <rect width="80" height="100" fill={`url(#${id}-b)`} />
      <ellipse
        cx="40"
        cy="88"
        rx="30"
        ry="5"
        style={{ fill: "color-mix(in oklab, black 22%, transparent)" }}
      />
      <path d={VESSELS[g.vessel] ?? VESSELS.bowl} fill={`url(#${id}-g)`} />
      <path
        d={VESSELS[g.vessel] ?? VESSELS.bowl}
        fill="none"
        style={{ stroke: "color-mix(in oklab, black 25%, transparent)" }}
        strokeWidth="0.6"
      />
      <ellipse
        cx="33"
        cy="54"
        rx="3"
        ry="9"
        transform="rotate(14 33 54)"
        style={{ fill: "color-mix(in oklab, white 45%, transparent)" }}
      />
    </svg>
  );
}

type PictureProps = {
  index: number;
  count: number;
  item: TableSpinnerItem;
  spin: MotionValue<number>;
  speed: MotionValue<number>;
  tilt: number;
  stand: number;
  front: boolean;
  w: number;
  h: number;
  uid: string;
  motionSafe: boolean;
  disabled: boolean;
  bind: (node: HTMLButtonElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onPress: () => void;
};

/**
 * One picture on the plate. Its pose is a function of the plate's angle and
 * speed alone: how near the front it is (a raised cosine over one picture's
 * width), damped while the plate turns fast, decides how far it stands.
 */
function Picture({
  index,
  count,
  item,
  spin,
  speed,
  tilt,
  stand,
  front,
  w,
  h,
  uid,
  motionSafe,
  disabled,
  bind,
  onKeyDown,
  onPress,
}: PictureProps) {
  const step = 360 / count;
  const phi = -index * step;
  const hover = useMotionValue(0);

  const rise = useTransform(
    [spin, speed, hover] as MotionValue<number>[],
    ([s, v, hv]) => {
      const d = fold((s as number) + phi);
      const near =
        Math.abs(d) < step ? (1 + Math.cos((Math.PI * d) / step)) / 2 : 0;
      const calm = motionSafe ? 1 - clamp(((v as number) - 90) / 420, 0, 1) : 1;
      return clamp(near * calm * stand + (hv as number) * 0.1, 0, 1);
    },
  );
  const transform = useTransform(rise, (s) => {
    const a = r2(-tilt * s);
    const sc = r3(1 + 0.26 * s);
    return `rotateZ(${r2(phi)}deg) translateY(calc(var(--d) * ${R_OUT})) rotateX(${a}deg) scale(${sc})`;
  });
  const shade = useTransform(rise, (s) => r2((1 - s) * 0.14));
  const castOpacity = useTransform(rise, (s) => r2(s * 0.42));
  const castScale = useTransform(rise, (s) => r2(0.25 + 0.75 * s));
  const castTransform = useTransform(
    castScale,
    (k) =>
      `rotateZ(${r2(phi)}deg) translateY(calc(var(--d) * ${R_OUT})) scaleY(${k})`,
  );

  const name = item.caption ?? item.alt;
  return (
    <>
      {/* The shadow a standing picture throws back across the plate. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 rounded-[4px] bg-[linear-gradient(to_top,color-mix(in_oklab,black_70%,transparent),transparent)]"
        style={{
          width: `calc(var(--d) * ${w})`,
          height: `calc(var(--d) * ${r3(h * 1.1)})`,
          marginLeft: `calc(var(--d) * ${r3(-w / 2)})`,
          marginTop: `calc(var(--d) * ${r3(-h * 1.1)})`,
          transformOrigin: "50% 100%",
          transform: castTransform,
          opacity: castOpacity,
        }}
      />
      <motion.button
        ref={bind}
        type="button"
        role="radio"
        aria-checked={front}
        aria-label={`${name}, ${index + 1} of ${count}`}
        tabIndex={front ? 0 : -1}
        disabled={disabled}
        data-spinner-pic={index}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap; a click with no
          // pointer behind it is assistive technology, and turns the plate.
          if (event.detail === 0) onPress();
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse" && motionSafe && !disabled) {
            animate(hover, 1, springs.flick);
          }
        }}
        onPointerLeave={() => {
          animate(hover, 0, motionSafe ? springs.glide : { duration: 0 });
        }}
        className={cn(
          "absolute top-1/2 left-1/2 overflow-hidden rounded-[4px] bg-[oklch(from_var(--warn)_0.97_0.01_h)] shadow-[0_1px_2px_color-mix(in_oklab,black_30%,transparent)] [backface-visibility:hidden]",
          FOCUS_RING,
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{
          width: `calc(var(--d) * ${w})`,
          height: `calc(var(--d) * ${h})`,
          marginLeft: `calc(var(--d) * ${r3(-w / 2)})`,
          marginTop: `calc(var(--d) * ${r3(-h)})`,
          // A print's white border, a sixteenth of its width.
          padding: `calc(var(--d) * ${r3(w / 16)})`,
          transformOrigin: "50% 100%",
          transform,
        }}
      >
        <span className="relative block size-full overflow-hidden rounded-[2px]">
          {item.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.src}
              alt=""
              draggable={false}
              className="size-full object-cover"
            />
          ) : (
            <Art k={index} uid={uid} />
          )}
          <motion.span
            aria-hidden
            className="absolute inset-0 bg-black"
            style={{ opacity: shade }}
          />
        </span>
      </motion.button>
    </>
  );
}

/**
 * Pictures laid flat on a round wooden turntable seen at an angle, built in
 * CSS 3D: the plate is a disc of planked timber with a turned rim, given
 * thickness by discs stacked below it and set on a bearing over its own
 * shadow. Pictures lie round it with their tops toward the hub, sized from the
 * count so they never meet at the inner edge.
 *
 * A drag anywhere on the plate turns it 1:1 under the finger — the pointer is
 * un-projected onto the plate and its angle about the hub followed — and a
 * throw carries on by motion's inertia generator, slowing by `friction`, its
 * resting angle snapped so a picture always comes to rest at the front. As
 * each picture comes round to the front it stands up off the plate, hinged on
 * its outer edge, rising through the tilt until it faces you, and lies back
 * down as it moves on; a fast spin keeps them all flat until it slows.
 *
 * The pictures are a radio group: the front one is checked and is the one tab
 * stop; arrows turn the plate a picture on the glide spring, Home and End jump,
 * and a press on a lying picture brings it round the short way. Under reduced
 * motion the plate never coasts — a release or key changes the front picture
 * at once, standing — and the caption cross-fades.
 */
export function TableSpinner({
  items = defaultTableSpinnerItems,
  value,
  defaultValue = 0,
  onValueChange,
  tilt = 60,
  friction = 0.5,
  plateSize = 0.9,
  wood = "oak",
  stand = 1,
  autoTurn = 0,
  trigger = "inView",
  captions = true,
  label = "Turntable of pictures",
  disabled = false,
  className,
}: TableSpinnerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const list = items.slice(0, 16);
  const n = Math.max(1, list.length);
  const step = 360 / n;
  const t = clamp(tilt, 20, 80);
  const cos = r3(Math.cos((t * Math.PI) / 180));
  const size = clamp(plateSize, 0.4, 1);
  const s = Math.sin(Math.PI / Math.max(3, n));
  const w = r3(Math.min(0.22, (1.84 * R_OUT * s) / (1 + 2.3 * s)));
  const h = r3(w * 1.25);
  const timber = WOODS[wood] ?? WOODS.oak;

  const [own, setOwn] = React.useState(() => mod(Math.round(defaultValue), n));
  const front = mod(Math.round(value ?? own), n);

  // The plate starts a third of a turn back and spins in, unless it may not.
  const entrance = trigger === "inView" || trigger === "mount";
  const spin = useMotionValue(front * step - (entrance ? 120 : 0));
  const velocity = useVelocity(spin);
  const absSpeed = useTransform(velocity, (v) => Math.abs(v));
  const speed = useSpring(absSpeed, {
    stiffness: springs.drift.stiffness,
    damping: springs.drift.damping,
    mass: springs.drift.mass,
  });

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
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLButtonElement>());
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const shown = React.useRef(front);
  const drag = React.useRef<{
    last: number;
    total: number;
    start: number;
  } | null>(null);
  const engaged = React.useRef({ hover: false, focus: false, drag: false });
  const visible = React.useRef(false);
  const autoTimer = React.useRef<number | null>(null);

  const latest = React.useRef({
    n,
    step,
    motionSafe,
    friction,
    autoTurn,
    disabled,
    front,
  });
  React.useEffect(() => {
    latest.current = {
      n,
      step,
      motionSafe,
      friction,
      autoTurn,
      disabled,
      front,
    };
  });

  /** The plate angle nearest `from` at which picture `i` is at the front. */
  const angleFor = (i: number, from: number) => {
    const base = i * step;
    return base + Math.round((from - base) / 360) * 360;
  };

  const stop = () => {
    running.current?.stop();
    running.current = null;
  };

  /** Turns the plate so picture `i` is at the front, the short way. */
  const turnTo = (i: number, velocity = 0) => {
    stop();
    const target = angleFor(i, spin.get());
    if (!latest.current.motionSafe) {
      spin.jump(target);
      return;
    }
    running.current = animate(spin, target, { ...springs.glide, velocity });
  };

  const choose = (i: number) => {
    const next = mod(i, n);
    shown.current = next;
    if (value === undefined) setOwn(next);
    if (next !== front) onValueChange?.(next);
  };

  // A host that moves `value` gets the same turn a key would.
  React.useEffect(() => {
    if (
      shown.current === front &&
      Math.abs(fold(spin.get() - front * step)) < 0.5
    ) {
      return;
    }
    if (drag.current) return;
    shown.current = front;
    turnTo(front);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front, step]);

  // Focus that was on a picture follows the front one, so the one tab stop
  // never sits on a picture that has turned away.
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

  // The entrance: whenever the plate is still off its picture and nobody has
  // touched it, it spins in — so a rehearsal remount finishes the turn.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const settle = () => {
      if (drag.current || running.current) return;
      const target = angleFor(latest.current.front, spin.get());
      if (Math.abs(spin.get() - target) < 0.5) return;
      if (!latest.current.motionSafe) {
        spin.jump(target);
        return;
      }
      running.current = animate(spin, target, {
        ...springs.drift,
        velocity: 160,
        onComplete: () => {
          running.current = null;
        },
      });
    };
    if (trigger === "mount") {
      settle();
      return () => stop();
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        settle();
      }
    });
    io.observe(root);
    return () => {
      io.disconnect();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  // Reduced motion: the plate sits exactly on its picture.
  React.useEffect(() => {
    if (motionSafe) return;
    stop();
    spin.jump(angleFor(front, spin.get()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionSafe]);

  /* ------------------------------ auto turn ------------------------------ */

  const clearAuto = () => {
    if (autoTimer.current !== null) window.clearTimeout(autoTimer.current);
    autoTimer.current = null;
  };
  const scheduleAuto = () => {
    clearAuto();
    const L = latest.current;
    const e = engaged.current;
    if (L.autoTurn <= 0 || L.disabled || !visible.current || document.hidden)
      return;
    if (e.hover || e.focus || e.drag) return;
    autoTimer.current = window.setTimeout(
      () => {
        autoTimer.current = null;
        const now = latest.current.front;
        choose(now + 1);
        turnTo(now + 1);
        scheduleAuto();
      },
      Math.max(1200, L.autoTurn),
    );
  };
  const auto = React.useRef({ scheduleAuto, clearAuto });
  React.useEffect(() => {
    auto.current = { scheduleAuto, clearAuto };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) auto.current.scheduleAuto();
      else auto.current.clearAuto();
    });
    io.observe(root);
    const onVisibility = () => auto.current.scheduleAuto();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      auto.current.clearAuto();
    };
  }, []);

  React.useEffect(() => {
    auto.current.scheduleAuto();
  }, [autoTurn, disabled]);

  const engage = (key: "hover" | "focus" | "drag", on: boolean) => {
    engaged.current[key] = on;
    if (on) clearAuto();
    else scheduleAuto();
  };

  /* ------------------------------ the hand ------------------------------- */

  /** The pointer's angle about the hub, on the plate's own plane, degrees. */
  const handAngle = (x: number, y: number) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const d = rect.width;
    const cx = rect.left + d / 2;
    const cy = rect.top + d * (cos / 2 + 0.03);
    const px = x - cx;
    const py = (y - cy) / Math.max(0.2, cos);
    return { a: (Math.atan2(py, px) * 180) / Math.PI, px, py, d };
  };

  const gesture = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ point }) => {
      const hand = handAngle(point.x, point.y);
      if (!hand) return;
      stop();
      drag.current = { last: hand.a, total: 0, start: spin.get() };
      engage("drag", true);
    },
    onMove: ({ point }) => {
      const d = drag.current;
      const hand = handAngle(point.x, point.y);
      if (!d || !hand) return;
      // Near the hub the angle swings wildly; there the hand turns the plate
      // by how far it moves sideways instead.
      const reach = Math.hypot(hand.px, hand.py);
      const delta = reach < hand.d * 0.08 ? 0 : fold(hand.a - d.last);
      d.last = hand.a;
      d.total += delta;
      spin.set(r2(d.start + d.total));
    },
    onEnd: ({ point, velocity }) => {
      const d = drag.current;
      drag.current = null;
      engage("drag", false);
      if (!d) return;
      const hand = handAngle(point.x, point.y);
      let omega = 0;
      if (hand) {
        const vy = velocity.y / Math.max(0.2, cos);
        const r2sq = hand.px * hand.px + hand.py * hand.py;
        if (r2sq > 1) {
          omega =
            (((hand.px * vy - hand.py * velocity.x) / r2sq) * 180) / Math.PI;
        }
      }
      omega = clamp(omega, -1800, 1800);
      const L = latest.current;
      const f = clamp(L.friction, 0, 1);
      const snap = (a: number) => Math.round(a / step) * step;
      const power = 0.95 - 0.75 * f;
      const ideal = spin.get() + power * omega;
      if (!L.motionSafe || Math.abs(omega) < 40) {
        const here = snap(spin.get());
        choose(Math.round(here / step));
        if (!L.motionSafe) spin.jump(here);
        else {
          running.current = animate(spin, here, {
            ...springs.glide,
            velocity: omega,
          });
        }
        return;
      }
      choose(Math.round(snap(ideal) / step));
      running.current = animate(spin, spin.get(), {
        type: "inertia",
        velocity: omega,
        power,
        timeConstant: 1150 - 850 * f,
        modifyTarget: snap,
        restDelta: 0.05,
        restSpeed: 4,
        bounceStiffness: springs.glide.stiffness,
        bounceDamping: springs.glide.damping,
      });
    },
    onCancel: () => {
      drag.current = null;
      engage("drag", false);
      turnTo(latest.current.front);
    },
    onTap: (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const pic = target.closest("[data-spinner-pic]");
      if (!pic || !rootRef.current?.contains(pic)) return;
      const i = Number(pic.getAttribute("data-spinner-pic"));
      if (!Number.isFinite(i)) return;
      choose(i);
      turnTo(i);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = front + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = front - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    if (next === null) return;
    event.preventDefault();
    const i = mod(next, n);
    choose(i);
    // Keys step: the plate turns the way the arrow points, not the short way.
    stop();
    const delta =
      event.key === "Home" || event.key === "End"
        ? fold((i - front) * step)
        : (next - front) * step;
    const target = angleFor(front, spin.get()) + delta;
    if (!motionSafe) spin.jump(target);
    else running.current = animate(spin, target, springs.glide);
    nodes.current.get(i)?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") engage("hover", true);
      }}
      onPointerLeave={() => engage("hover", false)}
      onFocus={() => engage("focus", true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          engage("focus", false);
        }
      }}
      className={cn(
        "[container-type:size] relative h-104 w-full overflow-clip select-none",
        className,
      )}
    >
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3"
        style={
          {
            "--cos": cos,
            "--d": `calc(${size} * min(100cqw, (100cqh - 2.75rem) / (var(--cos) + 0.16)))`,
          } as React.CSSProperties
        }
      >
        <div
          ref={stageRef}
          {...gesture}
          className={cn(
            "relative shrink-0 touch-none",
            disabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
          style={{
            width: "var(--d)",
            height: "calc(var(--d) * (var(--cos) + 0.16))",
            perspective: "calc(var(--d) * 2.6)",
            perspectiveOrigin: "50% 0%",
          }}
        >
          {/* The shadow on the table. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_oklab,black_40%,transparent),transparent)] blur-[6px]"
            style={{
              width: "calc(var(--d) * 1.06)",
              height: "calc(var(--d) * (var(--cos) * 1.02 + 0.06))",
              top: "calc(var(--d) * 0.08)",
            }}
          />
          <div
            role="radiogroup"
            aria-label="Pictures"
            className="absolute left-0 [transform-style:preserve-3d]"
            style={{
              width: "var(--d)",
              height: "var(--d)",
              top: "calc(var(--d) * (var(--cos) / 2 + 0.03) - var(--d) / 2)",
              transform: `rotateX(${r2(t)}deg)`,
            }}
          >
            <motion.div
              className="absolute inset-0 [transform-style:preserve-3d]"
              style={{ rotateZ: spin }}
            >
              {/* The bearing and the plate's thickness, under it. */}
              <span
                aria-hidden
                className="absolute inset-[24%] rounded-full"
                style={{
                  backgroundColor: tone("--ink-3", 0.24, 0.01),
                  transform: "translateZ(calc(var(--d) * -0.065))",
                }}
              />
              {[4, 3, 2, 1].map((k) => (
                <span
                  key={k}
                  aria-hidden
                  className="absolute inset-0 rounded-full"
                  style={{
                    backgroundColor:
                      k === 4
                        ? timber.edge
                        : `color-mix(in oklab, ${timber.edge} ${100 - k * 12}%, ${timber.lo})`,
                    transform: `translateZ(calc(var(--d) * ${r3(-0.009 * k)}))`,
                  }}
                />
              ))}
              {/* The plate: planked timber, figured grain, a turned rim. */}
              <span
                aria-hidden
                className="absolute inset-0 overflow-hidden rounded-full"
                style={{
                  backgroundImage: [
                    `repeating-linear-gradient(90deg, transparent 0 calc(20% - 1px), color-mix(in oklab, ${timber.edge} 55%, transparent) calc(20% - 1px) 20%)`,
                    `linear-gradient(90deg, color-mix(in oklab, ${timber.hi} 70%, ${timber.lo}) 0 20%, ${timber.hi} 20% 40%, color-mix(in oklab, ${timber.lo} 80%, ${timber.hi}) 40% 60%, ${timber.hi} 60% 80%, color-mix(in oklab, ${timber.hi} 55%, ${timber.lo}) 80%)`,
                  ].join(", "),
                  boxShadow: `inset 0 0 0 calc(var(--d) * 0.012) color-mix(in oklab, ${timber.hi} 70%, white), inset 0 0 0 calc(var(--d) * 0.02) color-mix(in oklab, ${timber.edge} 40%, transparent)`,
                }}
              >
                <svg
                  viewBox="0 0 200 200"
                  preserveAspectRatio="none"
                  className="absolute inset-0 size-full opacity-50 mix-blend-multiply"
                >
                  <filter
                    id={`${uid}-grain`}
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                  >
                    <feTurbulence
                      type="fractalNoise"
                      baseFrequency="0.16 0.012"
                      numOctaves={3}
                      seed={11}
                    />
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 0.42  0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 -1.1 1.05"
                    />
                  </filter>
                  <rect
                    width="200"
                    height="200"
                    filter={`url(#${uid}-grain)`}
                  />
                </svg>
                <span className="absolute inset-[44%] rounded-full bg-[radial-gradient(circle_at_40%_35%,color-mix(in_oklab,white_35%,transparent),transparent_60%)] shadow-[0_0_0_1px_color-mix(in_oklab,black_18%,transparent)]" />
              </span>
              {list.map((item, i) => (
                <Picture
                  key={i}
                  index={i}
                  count={n}
                  item={item}
                  spin={spin}
                  speed={speed}
                  tilt={t}
                  stand={clamp(stand, 0, 1)}
                  front={i === front}
                  w={w}
                  h={h}
                  uid={uid}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  bind={(node) => {
                    if (node) nodes.current.set(i, node);
                    else nodes.current.delete(i);
                  }}
                  onKeyDown={onKeyDown}
                  onPress={() => {
                    choose(i);
                    turnTo(i);
                  }}
                />
              ))}
            </motion.div>
          </div>
        </div>
        {captions ? (
          <div
            aria-hidden
            className="grid h-8 w-full shrink-0 place-items-center px-4 text-center"
          >
            {list.map((item, i) => (
              <motion.p
                key={i}
                className="col-start-1 row-start-1 flex max-w-full items-baseline gap-2 truncate"
                initial={false}
                animate={{ opacity: i === front ? 1 : 0 }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {item.caption ?? item.alt}
                </span>
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 tabular-nums">
                  {i + 1} / {n}
                </span>
              </motion.p>
            ))}
          </div>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
