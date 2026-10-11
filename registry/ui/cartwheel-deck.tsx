"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CartwheelCard = {
  /** A picture. Without one, `art` or a drawn tin is shown. */
  src?: string;
  /** Describes the picture. */
  alt: string;
  /** The card's title. Defaults to `alt`. */
  caption?: string;
  /** A short line under the title. */
  detail?: string;
  /** Your own art, filling the picture area. */
  art?: React.ReactNode;
};

export type CartwheelDeckProps = {
  /** The cards, front to back. @default defaultCartwheelCards */
  items?: CartwheelCard[];
  /** Controlled: the card at the front. */
  value?: number;
  /** Initial front card when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the click, swipe or key that moved the deck, with the new front card. */
  onValueChange?: (index: number) => void;
  /** Whole turns a card makes on its way to the back, 1 to 3. @default 1 */
  spin?: number;
  /** How lively the landing is, 0 (lands dead) to 1 (hops twice). @default 0.5 */
  bounce?: number;
  /** Space between cards, px. @default 14 */
  gap?: number;
  /** How much smaller each card further back stands, 0 to 0.2 of the front card. @default 0.08 */
  depth?: number;
  /** Roughly how long one tumble takes at one turn, ms. @default 640 */
  duration?: number;
  /** A card's width as a share of its height. @default 0.72 */
  aspect?: number;
  /** Height of the stage, px; the cards are sized so a tumbling card always clears its top. @default 240 */
  height?: number;
  /** Shadows on the floor that stretch as a card turns. @default true */
  shadow?: boolean;
  /** The deck's accessible name. @default "Cards" */
  label?: string;
  /** Play a thud as each card lands. Off unless asked for. @default false */
  sound?: boolean;
  /** No clicks, swipes or keys; the deck dims. @default false */
  disabled?: boolean;
  className?: string;
};

/* ---------------------------------- art ----------------------------------- */

export const defaultCartwheelCards: CartwheelCard[] = [
  {
    alt: "A rust-red tin of roasted oolong",
    caption: "Ember Oolong",
    detail: "Roasted · 4 min",
  },
  {
    alt: "A deep blue tin of black tea",
    caption: "Harbour Black",
    detail: "Malty · 3 min",
  },
  {
    alt: "A green tin of green tea",
    caption: "Meadow Green",
    detail: "Grassy · 2 min",
  },
  {
    alt: "A dark teal tin of smoked tea",
    caption: "Salt Pine",
    detail: "Smoky · 3 min",
  },
  {
    alt: "A pale gold tin of white tea",
    caption: "Pale Moon",
    detail: "Floral · 3 min",
  },
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** A pigment: a token's hue at a fixed lightness and chroma, the same in both themes. */
const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

/** Each default tea's tin: token and hue turn. */
const TINS = [
  { token: "--danger", dh: 12, c: 0.14 },
  { token: "--accent", dh: -8, c: 0.13 },
  { token: "--success", dh: -20, c: 0.12 },
  { token: "--success", dh: 40, c: 0.08 },
  { token: "--warn", dh: -6, c: 0.1 },
] as const;

/** A drawn tea tin on its own ground, with a few leaves. */
function TinArt({ index }: { index: number }) {
  const t = TINS[mod(index, TINS.length)] ?? TINS[0];
  const body = pig(t.token, 0.56, t.c, t.dh);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
      aria-hidden
    >
      <rect
        width="100"
        height="100"
        style={{ fill: pig(t.token, 0.93, 0.03, t.dh) }}
      />
      <ellipse
        cx="50"
        cy="84"
        rx="30"
        ry="5"
        style={{ fill: pig(t.token, 0.8, 0.04, t.dh) }}
      />
      <rect
        x="26"
        y="30"
        width="48"
        height="54"
        rx="3"
        style={{ fill: body }}
      />
      <ellipse cx="50" cy="84" rx="24" ry="4" style={{ fill: body }} />
      <rect
        x="26"
        y="44"
        width="48"
        height="22"
        style={{ fill: pig(t.token, 0.94, 0.03, t.dh) }}
      />
      <path
        d="M36 55 h28"
        strokeWidth="1.6"
        strokeLinecap="round"
        style={{ stroke: body }}
      />
      <path
        d="M40 60 h20"
        strokeWidth="1"
        strokeLinecap="round"
        style={{ stroke: pig(t.token, 0.7, t.c, t.dh) }}
      />
      <rect
        x="24"
        y="24"
        width="52"
        height="8"
        rx="2"
        style={{ fill: pig(t.token, 0.44, t.c, t.dh) }}
      />
      <ellipse
        cx="50"
        cy="24"
        rx="26"
        ry="3.4"
        style={{ fill: pig(t.token, 0.66, t.c * 0.8, t.dh) }}
      />
      <rect
        x="30"
        y="32"
        width="4"
        height="50"
        rx="2"
        style={{ fill: "oklch(1 0 0 / 0.22)" }}
      />
      <path
        d="M78 76 q6 -8 14 -6 q-4 8 -14 6 Z"
        style={{ fill: pig("--success", 0.6, 0.12, -30) }}
      />
      <path
        d="M12 80 q2 -9 10 -10 q0 9 -10 10 Z"
        style={{ fill: pig("--success", 0.52, 0.1, -20) }}
      />
    </svg>
  );
}

/* --------------------------------- physics -------------------------------- */

/**
 * How far a card's centre has travelled when it has rolled `deg` degrees
 * along the floor on its corners, for a card w wide and h tall: each quarter
 * turn pivots on the leading corner, so the long and short sides take turns
 * on the floor.
 */
function rollX(deg: number, w: number, h: number): number {
  const a = Math.abs(deg);
  const q = Math.floor(a / 90);
  const phi = ((a - q * 90) * Math.PI) / 180;
  let x = 0;
  for (let j = 0; j < q; j += 1) x += (w + h) / 2;
  const e = q % 2 === 0 ? w : h;
  const f = q % 2 === 0 ? h : w;
  x += e / 2 - (e / 2) * Math.cos(phi) + (f / 2) * Math.sin(phi);
  return x;
}

/** How high a card's centre stands above its resting height at an angle: its lowest corner stays on the floor. */
const lift = (deg: number, w: number, h: number) => {
  const a = (deg * Math.PI) / 180;
  return (
    (w / 2) * Math.abs(Math.sin(a)) + (h / 2) * Math.abs(Math.cos(a)) - h / 2
  );
};

/** The glide calibration retimed to a duration, its damping ratio kept. */
const retimed = (ms: number) => {
  const k = (0.45 / Math.max(0.15, ms / 1000)) ** 2;
  return {
    type: "spring" as const,
    stiffness: springs.glide.stiffness * k,
    damping: springs.glide.damping * Math.sqrt(k),
    mass: springs.glide.mass,
  };
};

type Pose = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  rot: MotionValue<number>;
  squash: MotionValue<number>;
  hop: MotionValue<number>;
  shadowX: MotionValue<number>;
  shadowY: MotionValue<number>;
  shadowO: MotionValue<number>;
};

type Plan = {
  dir: 1 | -1;
  prev: number;
  /** The card that tumbles, by item index. */
  roller: number;
  /** The spin a hand gave it, deg/s. */
  omega: number;
  user: boolean;
  /** More tumbles follow: this one runs a little quicker. */
  quick: boolean;
};

const FLOOR = 20;
const PADX = 12;

/* ------------------------------- component ------------------------------- */

/**
 * A row of cards standing on a floor, front card at the left, each further
 * card a little smaller. Advancing sends the front card cartwheeling end
 * over end along the floor to the back: it turns `spin` whole turns while it
 * travels, always resting on its lowest corner (its centre rises onto each
 * corner and drops onto each edge, and its travel follows the rhythm of a
 * rectangle rolling on its corners), shrinking to the back card's size, with
 * a floor shadow as wide as the card's projection so it stretches as the card
 * lies diagonal. It lands upright with a squash on the recoil spring and a
 * hop whose height follows `bounce`, and a thud, while the rest shuffle
 * forward on springs.glide in a short cascade with a little step each. Going
 * back reverses the tumble. The tumble runs on the glide calibration retimed
 * to `duration`, so a card tipped by hand carries its throw into it.
 *
 * Drag right to tip the front card onto its corner under your finger; past a
 * third of a card or with a flick it goes, otherwise it rocks back on the
 * recoil spring. Drag left to tip the back card toward the front. A click
 * advances; Right and Left advance and go back, Home and End go to the first
 * and last card by tumbles in turn. Under reduced motion the cards swap
 * places with a short dip in opacity and the value still changes.
 */
export function CartwheelDeck({
  items = defaultCartwheelCards,
  value,
  defaultValue = 0,
  onValueChange,
  spin = 1,
  bounce = 0.5,
  gap = 14,
  depth = 0.08,
  duration = 640,
  aspect = 0.72,
  height = 240,
  shadow = true,
  label = "Cards",
  sound = false,
  disabled = false,
  className,
}: CartwheelDeckProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const list = items.length > 0 ? items : defaultCartwheelCards;
  const n = list.length;
  const hintId = React.useId();
  const [own, setOwn] = React.useState(() => mod(Math.round(defaultValue), n));
  const current = value === undefined ? own : mod(Math.round(value), n);
  const [front, setFront] = React.useState(current);
  const [rolling, setRolling] = React.useState<number | null>(null);
  const [said, setSaid] = React.useState("");

  const turns = clamp(Math.round(spin), 1, 3);
  const d = clamp(depth, 0, 0.2);
  const ratio = clamp(aspect, 0.4, 1.4);
  const scales = React.useMemo(
    () => Array.from({ length: n }, (_, k) => r3(Math.max(0.35, 1 - d * k))),
    [d, n],
  );
  const s0 = scales[0] ?? 1;
  const sl = scales[n - 1] ?? s0;
  /** Half the front card and half the last: the row's span beyond its centres. */
  const ends = r3((s0 + sl) / 2);
  const sum = r3(scales.reduce((a, b) => a + b, 0));
  // Where each slot's centre sits when the row fits, in front-card widths.
  const centres = React.useMemo(() => {
    let acc = 0;
    return scales.map((sc) => {
      const c = acc + sc / 2;
      acc += sc;
      return r3(c);
    });
  }, [scales]);

  // One set of motion values per card, made once per deck size. They start
  // at the first render's slot sizes, so the server frame is already laid
  // out; later changes are animated or settled from there.
  const poses = React.useMemo<Pose[]>(
    () =>
      Array.from({ length: n }, (_, i) => ({
        x: motionValue(0),
        y: motionValue(0),
        scale: motionValue(scales[mod(i - front, n)] ?? 1),
        rot: motionValue(0),
        squash: motionValue(1),
        hop: motionValue(0),
        shadowX: motionValue(1),
        shadowY: motionValue(0),
        shadowO: motionValue(1),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n],
  );
  const dip = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const size = React.useRef({ w: 0, h: 0 });
  const frontRef = React.useRef(front);
  /** The front card the deck is heading for. */
  const target = React.useRef(current);
  /** The latest `value`, which a refused change falls back to. */
  const latest = React.useRef(current);
  const busy = React.useRef(false);
  const plan = React.useRef<Plan | null>(null);
  const running = React.useRef(new Set<AnimationPlaybackControls>());
  const tip = React.useRef<{ item: number; dir: 1 | -1; deg: number } | null>(
    null,
  );
  const live = React.useRef({
    motionSafe,
    turns,
    bounce,
    duration,
    audio,
  });
  React.useEffect(() => {
    live.current = { motionSafe, turns, bounce, duration, audio };
    latest.current = current;
  });

  const track = (c: AnimationPlaybackControls) => {
    running.current.add(c);
    void c.finished.then(
      () => running.current.delete(c),
      () => running.current.delete(c),
    );
    return c;
  };

  /**
   * The geometry the CSS lays out, in px, for the box as it is now: the front
   * card as tall as a tumble can clear, and the cards an even pitch apart —
   * their natural spacing when the row fits, overlapping when it does not.
   */
  const geometry = React.useCallback(() => {
    const { w, h } = size.current;
    const w0 = Math.max(
      6,
      Math.min(((h - FLOOR - 10) * ratio) / 1.26, w * 0.46),
    );
    const h0 = w0 / ratio;
    const row = Math.min(w0 * sum + (n - 1) * gap, w - 2 * PADX);
    const ox = (w - row) / 2;
    const fit = n > 1 ? (w - 2 * PADX - w0 * ends) / (n - 1) : 0;
    return {
      w0,
      h0,
      cx: (k: number) =>
        ox +
        Math.min(w0 * (centres[k] ?? 0) + k * gap, (w0 * s0) / 2 + k * fit),
    };
  }, [centres, ends, gap, n, ratio, s0, sum]);

  /** Floor contact, shadow and hop, from a card's angle, size and hop. */
  const compose = React.useCallback(
    (i: number) => {
      const p = poses[i];
      if (!p) return;
      const g = geometry();
      const deg = p.rot.get();
      const s = p.scale.get();
      const up = lift(deg, g.w0, g.h0);
      const hop = p.hop.get();
      p.y.set(r2(-up * s + hop));
      const a = (deg * Math.PI) / 180;
      const span =
        (g.w0 * Math.abs(Math.cos(a)) + g.h0 * Math.abs(Math.sin(a))) /
        Math.max(1, g.w0);
      p.shadowX.set(r3(span));
      // The shadow stays on the floor however high the card goes.
      p.shadowY.set(r2(up - hop / Math.max(0.2, s)));
      p.shadowO.set(r3(clamp01(1 + (hop / Math.max(1, g.h0)) * 3)));
    },
    [geometry, poses],
  );

  /** Every card at rest in its slot for the front shown. */
  const settleAll = React.useCallback(
    (f: number) => {
      for (let i = 0; i < n; i += 1) {
        const p = poses[i];
        if (!p) continue;
        p.x.jump(0);
        p.rot.jump(0);
        p.hop.jump(0);
        p.squash.jump(1);
        p.scale.jump(scales[mod(i - f, n)] ?? 1);
        compose(i);
      }
    },
    [compose, n, poses, scales],
  );

  // The slot sizes change with `depth`; the cards follow when at rest.
  React.useEffect(() => {
    if (!busy.current) settleAll(frontRef.current);
  }, [settleAll]);

  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
      running.current.clear();
    },
    [],
  );

  /**
   * One tumble toward the target, if the deck is free: `omega` is the spin a
   * hand gave it, deg/s; `prefer` the way a gesture pushed it.
   */
  const step = (user: boolean, omega = 0, prefer?: 1 | -1) => {
    if (busy.current) return;
    const at = frontRef.current;
    const want = target.current;
    if (at === want) return;
    const ahead = mod(want - at, n);
    const dir: 1 | -1 =
      prefer && (ahead === 1 || ahead === n - 1)
        ? prefer
        : ahead <= n / 2
          ? 1
          : -1;
    busy.current = true;
    if (!live.current.motionSafe) {
      // Straight to the target: the cards swap places with a dip.
      frontRef.current = want;
      plan.current = {
        dir,
        prev: at,
        roller: at,
        omega: 0,
        user,
        quick: false,
      };
      setFront(want);
      return;
    }
    const next = mod(at + dir, n);
    const roller = dir === 1 ? at : next;
    frontRef.current = next;
    plan.current = {
      dir,
      prev: at,
      roller,
      omega,
      user,
      quick: next !== want,
    };
    setRolling(roller);
    setFront(next);
  };
  const stepRef = React.useRef(step);
  React.useEffect(() => {
    stepRef.current = step;
  });

  /** A tumble has landed: the next one toward the target, or back to a refused value. */
  const landedRef = React.useRef((user: boolean) => {
    void user;
  });
  React.useEffect(() => {
    landedRef.current = (user) => {
      busy.current = false;
      // A controlled host that did not take the change gets its card back.
      if (frontRef.current === target.current) target.current = latest.current;
      stepRef.current(user);
    };
  });

  // The new order is on screen: FLIP every card from where it was, then run
  // the tumble and the shuffle.
  React.useLayoutEffect(() => {
    const pl = plan.current;
    if (!pl) return;
    plan.current = null;
    const k = live.current;
    const g = geometry();
    if (!k.motionSafe) {
      settleAll(front);
      track(
        animate(dip, [0.4, 1], {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
      if (pl.user)
        k.audio.play("thud", { gain: 0.3 + 0.3 * clamp01(k.bounce) });
      busy.current = false;
      return;
    }
    for (let i = 0; i < n; i += 1) {
      const p = poses[i];
      if (!p) continue;
      const was = mod(i - pl.prev, n);
      const now = mod(i - front, n);
      // Where it is on screen now, measured from its new slot.
      p.x.jump(r2(g.cx(was) + p.x.get() - g.cx(now)));
    }
    const beat = cascade(n);
    // The rest shuffle one place, front first, each with a little step.
    for (let i = 0; i < n; i += 1) {
      if (i === pl.roller) continue;
      const p = poses[i];
      if (!p) continue;
      const slot = mod(i - front, n);
      const wait = (pl.dir === 1 ? slot : n - 1 - slot) * beat;
      track(animate(p.x, 0, { ...springs.glide, delay: wait }));
      track(
        animate(p.scale, scales[slot] ?? 1, {
          ...springs.glide,
          delay: wait,
          onUpdate: () => compose(i),
        }),
      );
      track(
        animate(p.hop, [p.hop.get(), -3, 0], {
          duration: durations.slow,
          ease: easings.move,
          delay: wait,
          onUpdate: () => compose(i),
        }),
      );
      if (Math.abs(p.rot.get()) > 0.1) {
        track(
          animate(p.rot, 0, { ...springs.snap, onUpdate: () => compose(i) }),
        );
      }
    }
    const roller = poses[pl.roller];
    if (!roller) {
      landedRef.current(pl.user);
      return;
    }
    // The tumble: the angle drives everything else.
    const slot = mod(pl.roller - front, n);
    const x0 = roller.x.get();
    const s0 = roller.scale.get();
    const s1 = scales[slot] ?? 1;
    const deg0 = roller.rot.get();
    const deg1 = pl.dir * 360 * k.turns;
    const span = deg1 - deg0;
    const roll0 = rollX(deg0, g.w0, g.h0);
    const roll1 = rollX(deg1, g.w0, g.h0);
    let landed = false;
    const land = () => {
      landed = true;
      // It steps back into its place in the row as it lands.
      setRolling(null);
      const b = clamp01(k.bounce);
      const hopH = (3 + 15 * b) * s1;
      track(
        animate(roller.hop, [0, -hopH, 0, -hopH * 0.32 * b, 0], {
          duration: 0.32 + 0.3 * b,
          times: [0, 0.3, 0.6, 0.8, 1],
          ease: ["easeOut", "easeIn", "easeOut", "easeIn"],
          onUpdate: () => compose(pl.roller),
        }),
      );
      roller.squash.jump(r3(1 - (0.05 + 0.09 * b)));
      track(
        animate(roller.squash, 1, {
          type: "spring",
          stiffness: springs.recoil.stiffness,
          damping: lerp(40, springs.recoil.damping * 0.8, b),
          mass: springs.recoil.mass,
        }),
      );
      if (pl.user) {
        const rect = rootRef.current?.getBoundingClientRect();
        k.audio.play("thud", {
          gain: 0.35 + 0.35 * b,
          pitch: 1 + (1 - s1) * 0.6,
          pan: rect ? panFrom(rect.left + g.cx(slot), rootRef.current) : 0,
        });
      }
    };
    const ms = k.duration * (0.8 + 0.25 * k.turns) * (pl.quick ? 0.7 : 1);
    track(
      animate(roller.rot, deg1, {
        ...retimed(ms),
        velocity: pl.omega,
        onUpdate: (deg) => {
          const p = span === 0 ? 1 : clamp01((deg - deg0) / span);
          const rolled = pl.dir * (rollX(deg, g.w0, g.h0) - roll0) * s0;
          const fix = (0 - x0 - pl.dir * (roll1 - roll0) * s0) * p;
          roller.x.set(r2(x0 + rolled + fix));
          roller.scale.set(r3(lerp(s0, s1, p)));
          compose(pl.roller);
          if (!landed && Math.abs(deg1 - deg) < 2.5) land();
        },
        onComplete: () => {
          roller.rot.jump(0);
          roller.x.jump(0);
          roller.scale.jump(s1);
          compose(pl.roller);
          if (!landed) land();
          landedRef.current(pl.user);
        },
      }),
    );
  }, [front]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: number, user: boolean, omega = 0, prefer?: 1 | -1) => {
    const to = mod(next, n);
    target.current = to;
    const card = list[to];
    setSaid(`${card?.caption ?? card?.alt ?? ""}, ${to + 1} of ${n}.`);
    if (to !== current) {
      if (value === undefined) setOwn(to);
      onValueChange?.(to);
    }
    step(user, omega, prefer);
  };

  // A host that changes `value` gets the same tumbles, silently.
  React.useEffect(() => {
    target.current = current;
    if (busy.current || frontRef.current === current) return;
    const id = window.requestAnimationFrame(() => stepRef.current(false));
    return () => window.cancelAnimationFrame(id);
  }, [current]);

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        size.current = { w: node.clientWidth, h: node.clientHeight };
        if (!busy.current) settleAll(frontRef.current);
      });
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [settleAll],
  );

  /** Tip a card by hand: it pivots on its leading corner under the finger. */
  const tipTo = (item: number, dir: 1 | -1, deg: number) => {
    const p = poses[item];
    if (!p) return;
    const g = geometry();
    const s = p.scale.get();
    p.rot.set(r2(deg));
    p.x.set(r2(dir * rollX(deg, g.w0, g.h0) * s));
    compose(item);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      tip.current = null;
    },
    onMove: ({ offset }) => {
      if (busy.current || !live.current.motionSafe) return;
      const dir: 1 | -1 = offset.x >= 0 ? 1 : -1;
      const f = frontRef.current;
      const item = dir === 1 ? f : mod(f - 1, n);
      const was = tip.current;
      if (was && was.item !== item) tipTo(was.item, was.dir, 0);
      const g = geometry();
      const s = poses[item]?.scale.get() ?? 1;
      const raw = (Math.abs(offset.x) / Math.max(1, g.w0 * s)) * 54;
      // Past 40° the tip gives less and less, like a card reluctant to fall.
      const deg = raw < 40 ? raw : 40 + (1 - 1 / (1 + (raw - 40) / 30)) * 12;
      if (!was || was.item !== item) setRolling(item);
      tip.current = { item, dir, deg: dir * deg };
      tipTo(item, dir, dir * deg);
    },
    onEnd: ({ velocity, offset }) => {
      const t = tip.current;
      tip.current = null;
      if (!live.current.motionSafe) {
        // Reduced motion: a real swipe's direction is the whole gesture.
        if (Math.abs(offset.x) < 24 && Math.abs(velocity.x) < 400) return;
        const dir: 1 | -1 = offset.x >= 0 ? 1 : -1;
        commit(frontRef.current + dir, true, 0, dir);
        return;
      }
      if (!t || busy.current) return;
      const g = geometry();
      const s = poses[t.item]?.scale.get() ?? 1;
      const omega = (velocity.x / Math.max(1, g.w0 * s)) * 54;
      const ahead = t.deg + omega * 0.15;
      if (Math.abs(ahead) > 24 && Math.sign(ahead) === t.dir) {
        commit(frontRef.current + t.dir, true, omega, t.dir);
        return;
      }
      // Not far enough: it rocks back down onto its foot.
      const p = poses[t.item];
      if (!p) return;
      track(
        animate(p.rot, 0, {
          ...springs.recoil,
          velocity: omega,
          onUpdate: (deg) => {
            const gg = geometry();
            p.x.set(r2(Math.sign(deg || t.dir) * rollX(deg, gg.w0, gg.h0) * s));
            compose(t.item);
          },
          onComplete: () => {
            p.x.jump(0);
            compose(t.item);
            setRolling(null);
          },
        }),
      );
      live.current.audio.play("thud", { gain: 0.18, pitch: 1.2 });
    },
    onCancel: () => {
      const t = tip.current;
      tip.current = null;
      if (t) tipTo(t.item, t.dir, 0);
      setRolling(null);
    },
    onTap: () => commit(target.current + 1, true, 0, 1),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let to: number | null = null;
    if (
      event.key === "ArrowRight" ||
      event.key === "Enter" ||
      event.key === " "
    )
      to = target.current + 1;
    else if (event.key === "ArrowLeft") to = target.current - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    if (to === null) return;
    event.preventDefault();
    if (event.repeat && (event.key === "Enter" || event.key === " ")) return;
    commit(to, true, 0, event.key === "ArrowLeft" ? -1 : 1);
  };

  const lead = list[front];
  const frontTitle = lead?.caption ?? lead?.alt ?? "";
  const vars = {
    "--w0": `min(calc((100cqh - ${FLOOR + 10}px) * ${r3(ratio / 1.26)}), calc(100cqw * 0.46))`,
    "--h0": `calc(var(--w0) / ${r3(ratio)})`,
    "--row": `min(calc(var(--w0) * ${sum} + ${(n - 1) * gap}px), calc(100cqw - ${2 * PADX}px))`,
    "--ox": "calc((100cqw - var(--row)) / 2)",
    "--fit":
      n > 1
        ? `calc((100cqw - ${2 * PADX}px - var(--w0) * ${ends}) / ${n - 1})`
        : "0px",
  } as React.CSSProperties;

  return (
    <div
      ref={bindRoot}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "group/cartwheel-deck [container-type:size] relative w-full overflow-clip rounded-3 outline-none select-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        !disabled && "cursor-pointer touch-pan-y",
        disabled && "opacity-60",
        className,
      )}
      style={{ height }}
    >
      <motion.div
        className="absolute inset-0"
        style={{ ...vars, opacity: dip }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{
            height: FLOOR,
            backgroundImage:
              "linear-gradient(to bottom, color-mix(in oklab, var(--ink-3) 10%, transparent), transparent)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-hairline-strong"
          style={{ bottom: FLOOR }}
        />
        {list.map((card, i) => {
          const slot = mod(i - front, n);
          const p = poses[i];
          if (!p) return null;
          const title = card.caption ?? card.alt;
          const isFront = slot === 0;
          return (
            <motion.div
              key={i}
              data-slot={slot}
              className="[container-type:inline-size] absolute"
              style={{
                // Natural spacing while the row fits, an even overlap when it does not.
                left: `calc(var(--ox) + min(calc(var(--w0) * ${r3((centres[slot] ?? 0) - 0.5)} + ${slot * gap}px), calc(var(--w0) * ${r3(s0 / 2 - 0.5)} + var(--fit) * ${slot})))`,
                bottom: FLOOR,
                width: "var(--w0)",
                height: "var(--h0)",
                x: p.x,
                y: p.y,
                scale: p.scale,
                scaleY: p.squash,
                originX: 0.5,
                originY: 1,
                zIndex: rolling === i ? n + 1 : n - slot,
              }}
            >
              {shadow ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 -bottom-1 h-2 rounded-full"
                  style={{
                    scaleX: p.shadowX,
                    y: p.shadowY,
                    opacity: p.shadowO,
                    backgroundImage:
                      "radial-gradient(closest-side, oklch(0 0 0 / 0.26), transparent)",
                  }}
                />
              ) : null}
              <motion.div
                role={isFront ? "group" : undefined}
                aria-roledescription={isFront ? "slide" : undefined}
                aria-label={isFront ? `${i + 1} of ${n}: ${title}` : undefined}
                aria-hidden={isFront ? undefined : true}
                className={cn(
                  "absolute inset-0 flex flex-col overflow-clip rounded-3 border bg-card",
                  isFront ? "border-hairline-strong" : "border-hairline",
                )}
                style={{ rotate: p.rot }}
              >
                <div className="relative flex-1 basis-0 overflow-hidden bg-muted">
                  {card.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.src}
                      alt={card.alt}
                      draggable={false}
                      className="block size-full object-cover"
                    />
                  ) : card.art ? (
                    card.art
                  ) : (
                    <TinArt index={i} />
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5 @max-[104px]:hidden">
                  <p
                    title={title}
                    className="truncate text-xs font-medium text-foreground"
                  >
                    {title}
                  </p>
                  {card.detail ? (
                    <p
                      title={card.detail}
                      className="truncate font-mono text-[9px] tracking-[0.04em] text-ink-3"
                    >
                      {card.detail}
                    </p>
                  ) : null}
                </div>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
      <p id={hintId} className="sr-only">
        Click, or press Right, Enter or Space, to send the front card to the
        back; Left brings the back card to the front. Home and End go to the
        first and last card. The front card is {frontTitle}.
      </p>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
