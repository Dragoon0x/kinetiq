"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type KeyRingWorkspace = {
  id: string;
  name: string;
  /** A second line under the name when this workspace is chosen: a plan, a member count. */
  detail?: string;
  /** Printed on the key's bow. @default the name's first letter */
  initial?: string;
  /** The bow's colour, any CSS colour. @default one of six pigments, by position */
  color?: string;
};

export type KeyRingFinish = "steel" | "brass" | "black";

export type KeyRingProps = {
  workspaces: KeyRingWorkspace[];
  /** Controlled: the chosen workspace's id. */
  value?: string;
  /** The workspace chosen at first when uncontrolled. @default the first */
  defaultValue?: string;
  /** Fires from the key, click or drag that chose a workspace, with its id. */
  onValueChange?: (id: string) => void;
  /** Shows the Add button at the ring's split end. A workspace the host then adds is threaded onto the ring. */
  onAdd?: () => void;
  /** The Add button's name. @default "Add workspace" */
  addLabel?: string;
  /** The switcher's accessible name. @default "Workspaces" */
  label?: string;
  /** How many keys hang on the ring at once, 3 to 7; more workspaces turn through the back. @default 5 */
  keys?: number;
  /** The metal of the ring and the blades. @default "steel" */
  ring?: KeyRingFinish;
  /** How freely the keys swing and knock when the ring turns, 0 to 1. @default 0.5 */
  jingle?: number;
  /** Play the ring's clicks and the keys' clacks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The drawing's box, in px: every key, swung or not, stays inside it. */
const W = 272;
const H = 150;
const CX = 132;
const RING_Y = 30;
const RX = 82;
const RY = 14;
const KEY_W = 36;
const KEY_H = 92;
/** The bow's hole, where the key hangs from the ring. */
const HOLE_X = 18;
const HOLE_Y = 8;
/** A key at the back of the ring, against one at the front. */
const BACK = 0.62;
/** Where a new key comes onto the ring: the split end, on the right. */
const GAP_ANGLE = Math.PI / 2;
/** Widest a key swings, in radians. */
const MAX_SWING = 0.5;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mod = (a: number, n: number) => ((a % n) + n) % n;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Metal = { base: string; light: string; dark: string };

// Fixed lightness, token hue: the metal reads the same on a light page and a
// dark one. Mixed in oklch from the token only for hue and chroma.
const METALS: Record<KeyRingFinish, Metal> = {
  steel: {
    base: "oklch(from var(--ink-3) 0.74 0.012 h)",
    light: "oklch(from var(--ink-3) 0.92 0.008 h)",
    dark: "oklch(from var(--ink-3) 0.48 0.016 h)",
  },
  brass: {
    base: "oklch(from var(--warn) 0.76 0.1 h)",
    light: "oklch(from var(--warn) 0.91 0.07 h)",
    dark: "oklch(from var(--warn) 0.5 0.08 h)",
  },
  black: {
    base: "oklch(from var(--ink-3) 0.33 0.01 h)",
    light: "oklch(from var(--ink-3) 0.6 0.012 h)",
    dark: "oklch(from var(--ink-3) 0.2 0.01 h)",
  },
};

/** Bow caps, as pigments: token hues at a fixed lightness. */
const CAPS = [
  "oklch(from var(--accent) 0.72 0.13 h)",
  "oklch(from var(--warn) 0.8 0.13 h)",
  "oklch(from var(--success) 0.74 0.12 h)",
  "oklch(from var(--danger) 0.72 0.14 h)",
  "oklch(from var(--accent) 0.74 0.12 calc(h + 55))",
  "oklch(from var(--success) 0.78 0.09 calc(h + 45))",
];
const CAP_INK = "oklch(from var(--ink) 0.24 0.02 h)";

type Cut = { blade: string; groove: string };

/**
 * The key's blade, cut from its id: a straight back, a tip, and teeth whose
 * depths are seeded, so every workspace's key is its own and stays so.
 */
function cutOf(id: string): Cut {
  const rand = lcg(hash(id) ^ 0x9e3779b9);
  const teeth = [44, 51, 58, 65, 72, 79].map((y) => ({
    y,
    d: Math.round((1 + rand() * 3.4) * 10) / 10,
  }));
  const right = 23.5;
  const pts: string[] = ["M 12.5 37", "L 12.5 84", "L 15.5 90", "L 19 90"];
  // Up the toothed edge, from the tip to the shoulder.
  pts.push(`L ${right - 1.5} 86`);
  for (const t of [...teeth].reverse()) {
    pts.push(`L ${r2(right - t.d)} ${t.y + 2.5}`, `L ${right} ${t.y}`);
  }
  pts.push(`L ${right} 37`, "Z");
  return { blade: pts.join(" "), groove: "M 15.5 40 L 15.5 83" };
}

type Pose = {
  x: number;
  y: number;
  scale: number;
  z: number;
  alpha: number;
};

/**
 * Where key `i` hangs for a ring at position `p` (in key steps): its angle
 * round the ring is its offset from `p` times the step, 0 at the front. With
 * more workspaces than keys, only a window of them hangs on the ring; a key
 * passing the back seam fades out as the next one fades in at the same spot,
 * behind the others.
 */
function poseOf(
  i: number,
  p: number,
  span: number,
  total: number,
  keys: number,
  thread: number,
): Pose {
  const windowed = total > keys;
  const seam = windowed
    ? keys % 2 === 1
      ? keys / 2
      : keys / 2 - 0.5
    : total / 2;
  const rep = seam - mod(seam - (i - p), Math.max(1, total));
  let alpha = 1;
  if (windowed) {
    alpha = Math.min(
      clamp01((seam - rep) * 2),
      clamp01((rep - (seam - keys)) * 2),
    );
  }
  const step = (2 * Math.PI) / Math.max(1, span);
  const t = thread * thread * (3 - 2 * thread);
  const angle = lerp(GAP_ANGLE, rep * step, t);
  const z = Math.cos(angle);
  if (thread < 1) alpha = Math.max(alpha, clamp01(thread * 4));
  return {
    x: CX + RX * Math.sin(angle),
    y: RING_Y + RY * z,
    scale: lerp(BACK, 1, (z + 1) / 2) * lerp(0.55, 1, t),
    z,
    alpha,
  };
}

type Swing = { swing: MotionValue<number>; thread: MotionValue<number> };

function KeyItem({
  workspace,
  index,
  total,
  keys,
  p,
  span,
  metal,
  fresh,
  motionSafe,
  bind,
}: {
  workspace: KeyRingWorkspace;
  index: number;
  total: number;
  keys: number;
  p: MotionValue<number>;
  span: MotionValue<number>;
  metal: Metal;
  /** Added after the ring was first drawn: it threads on. */
  fresh: boolean;
  motionSafe: boolean;
  bind: (id: string, parts: Swing | null) => void;
}) {
  const swing = useMotionValue(0);
  // A new key starts at the split end (or, under reduced motion, unseen) in
  // its very first frame, not a frame later.
  const thread = useMotionValue(fresh && motionSafe ? 0 : 1);
  /** A new key under reduced motion: it fades in where it hangs. */
  const arrive = useMotionValue(fresh && !motionSafe ? 0 : 1);
  const id = workspace.id;
  const cut = React.useMemo(() => cutOf(id), [id]);

  // A key that arrives after the ring is up threads on from the split end;
  // set before paint, so it never shows in its slot first. Both arrivals
  // run on this key's own values, which also keeps its place fresh while the
  // ring turns to it in the same moment.
  React.useLayoutEffect(() => {
    if (!fresh) return;
    const value = motionSafe ? thread : arrive;
    value.set(0);
    const c = animate(
      value,
      1,
      motionSafe
        ? springs.glide
        : { duration: durations.base, ease: easings.enter },
    );
    return () => {
      c.stop();
      value.set(1);
    };
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    bind(id, { swing, thread });
    return () => bind(id, null);
  }, [bind, id, swing, thread]);

  const pose = useTransform(
    [p, span, thread, arrive] as MotionValue<number>[],
    ([pp = 0, sp = 1, th = 1, ar = 1]: number[]) => {
      const o = poseOf(index, pp, sp, total, keys, th);
      return { ...o, alpha: o.alpha * ar };
    },
  );
  const x = useTransform(pose, (o) => r2(o.x - HOLE_X));
  const y = useTransform(pose, (o) => r2(o.y - HOLE_Y));
  const scale = useTransform(pose, (o) => r3(o.scale));
  const zIndex = useTransform(pose, (o) => Math.round(100 + 50 * o.z));
  const opacity = useTransform(pose, (o) => r3(o.alpha));
  // A key off the ring, or passing the back seam, is not there to press.
  const shown = useTransform(pose, (o) =>
    o.alpha < 0.01 ? "hidden" : "visible",
  );
  const hit = useTransform(pose, (o) => (o.alpha > 0.5 ? "auto" : "none"));
  const fog = useTransform(pose, (o) => r3(((1 - o.z) / 2) * 0.55));
  // Seen from the front a key swings across the page; at the sides it swings
  // toward and away from you, which reads as nothing.
  const depth = useTransform(pose, (o) => o.z);
  const rotate = useTransform(
    [swing, depth] as MotionValue<number>[],
    ([s = 0, z = 1]: number[]) => r2(s * z),
  );

  const cap = workspace.color ?? CAPS[index % CAPS.length];
  const initial = (workspace.initial ?? workspace.name.charAt(0)).slice(0, 2);
  const silhouette = (
    <>
      <path d={cut.blade} />
      <rect x={10.5} y={32} width={15} height={7} rx={2} />
      <circle cx={18} cy={18} r={17} />
    </>
  );

  return (
    <motion.div
      data-key={id}
      className="pointer-events-none absolute top-0 left-0"
      style={{
        width: KEY_W,
        height: KEY_H,
        x,
        y,
        scale,
        rotate,
        zIndex,
        opacity,
        visibility: shown,
        originX: HOLE_X / KEY_W,
        originY: r3(HOLE_Y / KEY_H),
      }}
    >
      <svg
        width={KEY_W}
        height={KEY_H}
        viewBox={`0 0 ${KEY_W} ${KEY_H}`}
        className="pointer-events-none block overflow-visible"
      >
        <path
          d={cut.blade}
          strokeWidth={0.75}
          style={{ fill: metal.base, stroke: metal.dark }}
        />
        <path
          d={cut.groove}
          strokeWidth={1.2}
          strokeLinecap="round"
          style={{ stroke: metal.dark }}
          opacity={0.55}
        />
        <path
          d="M 21.5 40 L 21.5 60"
          strokeWidth={1}
          strokeLinecap="round"
          style={{ stroke: metal.light }}
          opacity={0.8}
        />
        <rect
          x={10.5}
          y={32}
          width={15}
          height={7}
          rx={2}
          strokeWidth={0.75}
          style={{ fill: metal.base, stroke: metal.dark }}
        />
        <path
          d="M 18 1 A 17 17 0 1 1 17.99 1 Z M 18 4.2 A 3.8 3.8 0 1 0 18.01 4.2 Z"
          fillRule="evenodd"
          strokeWidth={0.75}
          style={{
            fill: cap,
            stroke: "color-mix(in oklab, black 28%, transparent)",
          }}
        />
        <circle
          cx={HOLE_X}
          cy={HOLE_Y}
          r={4.6}
          fill="none"
          strokeWidth={1.4}
          style={{ stroke: metal.base }}
        />
        <path
          d="M 6.5 12 A 13 13 0 0 1 14 5.6"
          fill="none"
          strokeWidth={1.6}
          strokeLinecap="round"
          style={{ stroke: "color-mix(in oklab, white 55%, transparent)" }}
        />
        <text
          x={18}
          y={25.5}
          textAnchor="middle"
          fontSize={initial.length > 1 ? 10 : 12.5}
          fontWeight={650}
          className="font-sans"
          style={{ fill: CAP_INK }}
        >
          {initial}
        </text>
        {/* The key's own outline is what takes a press, not its box: boxes
            overlap round the ring, shapes do not. */}
        <motion.g
          className="cursor-pointer"
          style={{ opacity: fog, fill: "var(--card)", pointerEvents: hit }}
        >
          {silhouette}
        </motion.g>
      </svg>
    </motion.div>
  );
}

/** The two halves of the ring, so the front half can pass in front of the keys behind it. */
function RingArc({
  half,
  metal,
  z,
}: {
  half: "back" | "front";
  metal: Metal;
  z: number;
}) {
  const d =
    half === "back"
      ? `M ${CX - RX} ${RING_Y} A ${RX} ${RY} 0 0 1 ${CX + RX} ${RING_Y}`
      : `M ${CX + RX} ${RING_Y} A ${RX} ${RY} 0 0 1 ${CX - RX} ${RING_Y}`;
  const inner =
    half === "back"
      ? `M ${CX - RX + 2.5} ${RING_Y + 0.4} A ${RX - 2.5} ${RY - 1.6} 0 0 1 ${CX + RX - 2.5} ${RING_Y + 0.4}`
      : `M ${CX + RX - 2.5} ${RING_Y + 0.4} A ${RX - 2.5} ${RY - 1.6} 0 0 1 ${CX - RX + 2.5} ${RING_Y + 0.4}`;
  return (
    <svg
      aria-hidden
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="pointer-events-none absolute top-0 left-0 block"
      style={{ zIndex: z }}
    >
      {/* A split ring is two turns of wire: two ellipses, a hair apart. */}
      {[d, inner].map((path) => (
        <g key={path} fill="none" strokeLinecap="round">
          <path d={path} strokeWidth={3} style={{ stroke: metal.dark }} />
          <path d={path} strokeWidth={1.8} style={{ stroke: metal.base }} />
          <path
            d={path}
            strokeWidth={0.7}
            style={{ stroke: metal.light }}
            transform="translate(0 -0.5)"
          />
        </g>
      ))}
    </svg>
  );
}

type SimKey = { psi: number; vel: number; omega: number };

type Api = {
  turnTo: (index: number, velocity: number, heard: boolean) => void;
};

/**
 * A workspace switcher drawn as keys on a split ring. The ring is a circle
 * seen from a little above; each workspace is a key hanging from it, its bow
 * capped in the workspace's colour and printed with its initial, its blade
 * cut with teeth seeded from its id. The chosen workspace's key hangs at the
 * front; the rest go round, smaller and dimmer toward the back, and the ring's
 * front half passes in front of the keys behind it.
 *
 * One motion value is the ring's position, in key steps; every key's place,
 * size, depth and shade is read from it. Choosing turns the ring the short
 * way on the snap spring, a click ticking as each key passes the front. The
 * keys are pendulums: a small frame loop, running only while something moves,
 * swings each from the ring's acceleration, with a damping set by `jingle`
 * and a length that differs a little from key to key, so they fall out of step
 * and knock — clack — when the ring stops. The ring spins under a drag, the
 * front key following the finger 1:1, and a throw settles on the key it was
 * heading for. `onAdd` shows an Add button at the split end; a workspace the
 * host then adds threads on there and slides round the ring to its place.
 *
 * It is a focusable `listbox`: arrow keys turn the ring and choose, Home and
 * End go to the ends of the list, a letter turns to the next workspace with
 * that initial. Under reduced motion the ring does not turn and nothing
 * swings: keys fade into their new places, and the chosen key is still the
 * front one.
 */
export function KeyRing({
  workspaces,
  value,
  defaultValue,
  onValueChange,
  onAdd,
  addLabel = "Add workspace",
  label = "Workspaces",
  keys = 5,
  ring = "steel",
  jingle = 0.5,
  sound = false,
  disabled = false,
  className,
}: KeyRingProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const total = workspaces.length;
  const slots = clamp(Math.round(keys), 3, 7);
  const m = Math.max(1, Math.min(slots, total));
  const jg = clamp01(jingle);
  const metal = METALS[ring] ?? METALS.steel;

  const [own, setOwn] = React.useState(defaultValue);
  const found = workspaces.findIndex((w) => w.id === (value ?? own));
  const index = found === -1 ? 0 : found;
  const chosen = workspaces[index];

  const [via, setVia] = React.useState<"key" | "pointer">("pointer");
  /** The keys on the ring when it was first drawn; any other key is threaded on. */
  const [born] = React.useState(() => new Set(workspaces.map((w) => w.id)));
  const [check, setCheck] = React.useState(0);
  const [said, setSaid] = React.useState({ key: index, n: 0, text: "" });
  if (said.key !== index) {
    setSaid({
      key: index,
      n: said.n + 1,
      // The listbox already speaks a keyboard choice; say the others once.
      text: via === "key" || !chosen ? "" : `${chosen.name} chosen`,
    });
  }

  const p = useMotionValue(index);
  const span = useMotionValue(m);
  const fade = useMotionValue(1);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const parts = React.useRef(new Map<string, Swing>());
  const sim = React.useRef(new Map<string, SimKey>());
  const frame = React.useRef(0);
  const last = React.useRef({ t: 0, v: 0, acc: 0 });
  const aim = React.useRef(index);
  const shown = React.useRef({ index, check });
  const heard = React.useRef(false);
  /** Knocks the visitor's last turn may still make, and until when. */
  const knocks = React.useRef({ n: 0, at: 0, until: 0 });
  const front = React.useRef(index);
  const drag0 = React.useRef(0);
  const addedAt = React.useRef(-Infinity);
  const api = React.useRef<Api | null>(null);
  const latest = React.useRef({ total, m, jg, motionSafe, audio, workspaces });

  React.useEffect(() => {
    latest.current = { total, m, jg, motionSafe, audio, workspaces };
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const panNow = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + (CX / W) * rect.width, null) : 0;
  };

  const stopSim = React.useCallback(() => {
    if (frame.current) window.cancelAnimationFrame(frame.current);
    frame.current = 0;
    last.current = { t: 0, v: 0, acc: 0 };
    for (const [id, s] of sim.current) {
      s.psi = 0;
      s.vel = 0;
      parts.current.get(id)?.swing.set(0);
    }
  }, []);

  const tickRef = React.useRef<(now: number) => void>(() => {});
  const schedule = React.useCallback(() => {
    frame.current = window.requestAnimationFrame((t) => tickRef.current(t));
  }, []);

  const wake = React.useCallback(() => {
    if (frame.current || !latest.current.motionSafe || document.hidden) return;
    schedule();
  }, [schedule]);

  /** One step of every key's pendulum; the loop ends itself when all hang still. */
  React.useEffect(() => {
    tickRef.current = (now: number) => {
      frame.current = 0;
      const env = latest.current;
      if (document.hidden || !env.motionSafe) {
        stopSim();
        return;
      }
      const prev = last.current;
      const dt = prev.t ? Math.min(1 / 30, (now - prev.t) / 1000) : 1 / 60;
      const pv = p.getVelocity();
      const raw = prev.t ? (pv - prev.v) / Math.max(dt, 1e-3) : 0;
      const acc = lerp(prev.acc, raw, 0.5);
      last.current = { t: now, v: pv, acc };
      const step = (2 * Math.PI) / Math.max(1, env.m);
      const zeta = lerp(0.85, 0.1, env.jg);
      const gain = lerp(0.02, 0.15, env.jg);
      // The pendulum feels the ring's acceleration along its tangent.
      const force = -gain * step * acc;
      let moving = Math.abs(pv) > 0.02;
      const pos = p.get();
      env.workspaces.forEach((w, i) => {
        let s = sim.current.get(w.id);
        if (!s) {
          const rand = lcg(hash(w.id));
          s = { psi: 0, vel: 0, omega: 10.5 * (0.86 + 0.28 * rand()) };
          sim.current.set(w.id, s);
        }
        const before = s.psi;
        const a =
          -s.omega * s.omega * s.psi - 2 * zeta * s.omega * s.vel + force;
        s.vel += a * dt;
        s.psi = clamp(s.psi + s.vel * dt, -MAX_SWING, MAX_SWING);
        parts.current.get(w.id)?.swing.set(r2((s.psi * 180) / Math.PI));
        if (Math.abs(s.psi) > 0.002 || Math.abs(s.vel) > 0.02) moving = true;
        // The keys near the front swing back through each other: a knock.
        const o = poseOf(i, pos, env.m, env.total, env.m, 1);
        const k = knocks.current;
        if (
          now < k.until &&
          o.z > 0.55 &&
          o.alpha > 0.5 &&
          Math.sign(before) !== Math.sign(s.psi) &&
          Math.abs(s.vel) > 1.1 &&
          k.n < 4 &&
          now - k.at > 70
        ) {
          k.n += 1;
          k.at = now;
          env.audio.play("clack", {
            pitch: r2(0.85 + (hash(w.id) % 40) / 100),
            gain: r2(
              clamp(Math.abs(s.vel) / 5, 0.18, 0.6) * (0.4 + 0.6 * env.jg),
            ),
            pan: panNow(),
          });
        }
      });
      if (moving) schedule();
      else stopSim();
    };
  });

  const bind = React.useCallback((id: string, next: Swing | null) => {
    if (next) parts.current.set(id, next);
    else {
      parts.current.delete(id);
      sim.current.delete(id);
    }
  }, []);

  /**
   * The ring at rest: its position brought back into one turn of the list,
   * which moves nothing, so a list that grows later wraps from where it is.
   */
  const settle = () => {
    heard.current = false;
    const n = Math.max(1, latest.current.total);
    const at = Math.round(p.get());
    const k = mod(at, n);
    aim.current = mod(aim.current, n);
    if (k === at) return;
    front.current = k;
    // A jump, not a set: a whole turn of the list is no motion, and the
    // pendulums must not feel it as one.
    p.jump(k);
  };

  /** Turns the ring to `to` the short way. */
  const turnTo = (to: number, velocity: number, withSound: boolean) => {
    const n = Math.max(1, total);
    const from = aim.current;
    const target = from + (mod(to - from + n / 2, n) - n / 2);
    aim.current = target;
    heard.current = withSound;
    knocks.current = {
      n: 0,
      at: 0,
      until: withSound ? performance.now() + 1800 : 0,
    };
    if (!motionSafe) {
      anims.current.get("p")?.stop();
      p.jump(target);
      settle();
      fade.set(0.35);
      run(
        "fade",
        animate(fade, 1, { duration: durations.base, ease: easings.enter }),
      );
      return;
    }
    run(
      "p",
      animate(p, target, {
        ...springs.snap,
        velocity,
        onComplete: settle,
      }),
    );
    wake();
  };

  React.useEffect(() => {
    api.current = { turnTo };
  });

  // The ring follows the value from wherever it came; a visitor's choice is
  // heard, a host's is only seen. A choice the host refused turns it back.
  React.useEffect(() => {
    const prev = shown.current;
    shown.current = { index, check };
    if (prev.index === index && prev.check === check) return;
    const n = Math.max(1, total);
    if (prev.index === index && mod(Math.round(aim.current), n) === index)
      return;
    api.current?.turnTo(index, p.getVelocity(), heard.current);
  }, [index, check, total, p]);

  // Spacing glides when a key is threaded on or taken off.
  React.useEffect(() => {
    if (!motionSafe) {
      span.set(m);
      return;
    }
    const c = animate(span, m, springs.glide);
    return () => c.stop();
  }, [m, motionSafe, span]);

  // Detents: a click each time a key passes the front, while the visitor turns it.
  React.useEffect(() => {
    return p.on("change", (v) => {
      const f = Math.round(v);
      if (f === front.current) return;
      front.current = f;
      wake();
      if (!heard.current) return;
      const env = latest.current;
      const i = mod(f, Math.max(1, env.total));
      env.audio.play("click", {
        pitch: r2(lerp(1.2, 0.85, env.total > 1 ? i / (env.total - 1) : 0)),
        gain: 0.45,
        pan: panNow(),
      });
    });
  }, [p, wake]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stopSim();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const running = anims.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      for (const c of running.values()) c.stop();
      running.clear();
      stopSim();
    };
  }, [stopSim]);

  // A key threaded on after the visitor asked for one ends with the ring's click.
  const count = React.useRef(total);
  React.useEffect(() => {
    const grew = total > count.current;
    count.current = total;
    if (!grew || performance.now() - addedAt.current > 4000) return;
    addedAt.current = -Infinity;
    const t = window.setTimeout(
      () => audio.play("click", { pitch: 1.3, gain: 0.5, pan: panNow() }),
      motionSafe ? 380 : 0,
    );
    return () => window.clearTimeout(t);
  }, [total, audio, motionSafe]);

  const choose = (i: number, how: "key" | "pointer", velocity = 0) => {
    if (disabled) return;
    const w = workspaces[i];
    if (!w) return;
    setVia(how);
    if (i === index) {
      api.current?.turnTo(i, velocity, true);
      return;
    }
    heard.current = true;
    if (value === undefined) setOwn(w.id);
    onValueChange?.(w.id);
    if (value !== undefined)
      React.startTransition(() => setCheck((c) => c + 1));
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || total < 2,
    onStart: () => {
      anims.current.get("p")?.stop();
      drag0.current = p.get();
      heard.current = true;
      knocks.current = { n: 0, at: 0, until: performance.now() + 2400 };
      stageRef.current?.focus({ preventScroll: true });
    },
    onMove: ({ offset }) => {
      const step = (2 * Math.PI) / m;
      p.set(r3(drag0.current - offset.x / (RX * step)));
      wake();
    },
    onEnd: ({ velocity }) => {
      const step = (2 * Math.PI) / m;
      const v = -velocity.x / (RX * step);
      const landing = Math.round(project(p.get(), v, 0.992));
      aim.current = landing;
      const i = mod(landing, Math.max(1, total));
      if (motionSafe) {
        run(
          "p",
          animate(p, landing, {
            ...springs.snap,
            velocity: v,
            onComplete: settle,
          }),
        );
      } else {
        p.jump(landing);
        settle();
      }
      wake();
      choose(i, "pointer", v);
    },
    onCancel: () => {
      api.current?.turnTo(index, 0, false);
    },
    onTap: (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const id = target?.closest("[data-key]")?.getAttribute("data-key");
      const i = id ? workspaces.findIndex((w) => w.id === id) : -1;
      if (i !== -1) choose(i, "pointer");
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || total === 0) return;
    const at = index;
    let next = -1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = mod(at + 1, total);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = mod(at - 1, total);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = total - 1;
        break;
      default:
        if (
          event.key.length === 1 &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          const ch = event.key.toLowerCase();
          for (let s = 1; s <= total; s += 1) {
            const w = workspaces[mod(at + s, total)];
            const letter = (w?.initial ?? w?.name ?? "")
              .charAt(0)
              .toLowerCase();
            if (w && letter === ch) {
              next = mod(at + s, total);
              break;
            }
          }
        }
    }
    if (next === -1) return;
    event.preventDefault();
    choose(next, "key");
  };

  const optionId = (id: string) => `${uid}-opt-${id}`;
  const keysAlpha = fade;

  return (
    <div
      className={cn(
        "inline-flex w-full max-w-68 flex-col items-center gap-2",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        className="relative"
        style={{ width: W, height: H, maxWidth: "100%" }}
      >
        <div
          ref={stageRef}
          role="listbox"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-orientation="horizontal"
          aria-activedescendant={chosen ? optionId(chosen.id) : undefined}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          {...drag}
          className={cn(
            "absolute inset-0 isolate touch-pan-y rounded-3 outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
        >
          {workspaces.map((w) => (
            <div
              key={w.id}
              id={optionId(w.id)}
              role="option"
              aria-selected={w.id === chosen?.id}
              className="sr-only"
            >
              {w.detail ? `${w.name}, ${w.detail}` : w.name}
            </div>
          ))}
          <motion.div
            aria-hidden
            className="absolute inset-0"
            style={{ opacity: keysAlpha }}
          >
            <RingArc half="back" metal={metal} z={10} />
            {workspaces.map((w, i) => (
              <KeyItem
                key={w.id}
                workspace={w}
                index={i}
                total={total}
                keys={m}
                p={p}
                span={span}
                metal={metal}
                fresh={!born.has(w.id)}
                motionSafe={motionSafe}
                bind={bind}
              />
            ))}
            <RingArc half="front" metal={metal} z={100} />
          </motion.div>
        </div>
        {onAdd ? (
          <button
            type="button"
            aria-label={addLabel}
            title={addLabel}
            disabled={disabled}
            onClick={() => {
              addedAt.current = performance.now();
              onAdd();
            }}
            className={cn(
              "absolute flex size-7 items-center justify-center rounded-full border border-dashed border-hairline-strong bg-card text-ink-2 transition-colors outline-none",
              "hover:border-solid hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed",
            )}
            style={{ left: W - 30, top: RING_Y - 14 }}
          >
            <svg aria-hidden width={12} height={12} viewBox="0 0 12 12">
              <path
                d="M 6 1.5 V 10.5 M 1.5 6 H 10.5"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="grid w-full justify-items-center text-center">
        <AnimatePresence initial={false}>
          {chosen ? (
            <motion.div
              key={chosen.id}
              className="flex max-w-full flex-col items-center [grid-area:1/1]"
              initial={
                motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.base } }
                  : { duration: durations.fast }
              }
            >
              <span
                className="max-w-full truncate text-sm font-medium text-foreground"
                title={chosen.name}
              >
                {chosen.name}
              </span>
              {chosen.detail ? (
                <span className="max-w-full truncate text-xs text-ink-3">
                  {chosen.detail}
                </span>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
