"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type GooRadioSize = "sm" | "md" | "lg";

/** Pigments that read the same on a light page and a dark one. */
export type GooRadioColor = "cobalt" | "signal" | "ember" | "rose";

export type GooRadioOption = {
  /** What the group reports when this option is chosen. Unique in the group. */
  value: string;
  /** The option's name, under its ring (or beside it, vertically). */
  label: string;
  /** A short second line: a note, a price, a time. */
  description?: string;
  /** Shown, but cannot be chosen; arrow keys pass over it. */
  disabled?: boolean;
};

export type GooRadioProps = {
  /** The options, in rail order. */
  options: GooRadioOption[];
  /** Controlled selection: the chosen option's `value`. */
  value?: string;
  /** Initial selection when uncontrolled. Nothing is chosen when it is left out, as with native radios. */
  defaultValue?: string;
  /** Fires from the press, drag or key that chose an option, with its value. */
  onValueChange?: (value: string) => void;
  /** The group's accessible name. */
  label: string;
  /** A form field name: adds a hidden input carrying the value. */
  name?: string;
  /** Rings in a row with labels under them, or in a column with labels beside them. @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  /** How thick the goo is, 0 to 1: runny goo is quick and splashy, thick goo slow and composed. @default 0.5 */
  viscosity?: number;
  /** How far the neck reaches before it lets go, 0 to 1: a short snap, or a long string of goo. @default 0.5 */
  neck?: number;
  /** How much the drop squashes across its travel and on landing, 0 to 1. @default 0.5 */
  squash?: number;
  /** Ring and drop size, and the type beside them. @default "md" */
  size?: GooRadioSize;
  /** The drop's pigment: a preset or any CSS colour. @default "cobalt" */
  color?: GooRadioColor | (string & {});
  /** The rings and the rail at rest; any CSS colour. @default "var(--hairline-strong)" */
  ringColor?: string;
  /** Draw the rail the drop flows along. @default true */
  rail?: boolean;
  /** Play the goo: a blup as the neck lets go and a softer one on landing. Off unless asked for. @default false */
  sound?: boolean;
  /** Disables every option. */
  disabled?: boolean;
  /** Classes for the radiogroup box. */
  className?: string;
};

const PALETTE: Record<GooRadioColor, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ember: "oklch(from var(--warn) 0.74 c h)",
  rose: "oklch(from var(--danger) 0.64 c h)",
};

type Metrics = {
  /** Ring radius, outer edge. */
  ring: number;
  /** The drop's resting radius, inside the ring. */
  drop: number;
  stroke: number;
  rail: number;
  /** Space above a horizontal ring, beside a vertical one. */
  pad: number;
  label: string;
  note: string;
};

// A narrow group (four options on a phone plate) steps its type down one
// size rather than truncating a label.
const SIZES: Record<GooRadioSize, Metrics> = {
  sm: {
    ring: 9,
    drop: 5,
    stroke: 1.5,
    rail: 1.5,
    pad: 8,
    label: "text-xs @max-[17rem]/goo-radio:text-[11px]",
    note: "text-[11px] @max-[17rem]/goo-radio:text-[10px]",
  },
  md: {
    ring: 12,
    drop: 7,
    stroke: 1.5,
    rail: 2,
    pad: 10,
    label: "text-sm @max-[17rem]/goo-radio:text-xs",
    note: "text-xs @max-[17rem]/goo-radio:text-[11px]",
  },
  lg: {
    ring: 15,
    drop: 9,
    stroke: 2,
    rail: 2,
    pad: 12,
    label: "text-base @max-[17rem]/goo-radio:text-sm",
    note: "text-sm @max-[17rem]/goo-radio:text-xs",
  },
};

/** Ring centres in px inside the group's box, in option order. */
type Geo = { xs: number[]; ys: number[]; pitch: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** The point at a fractional option index; past either end it carries on along the rail. */
function at(g: Geo, s: number): [number, number] {
  const n = g.xs.length;
  if (n < 2) return [g.xs[0] ?? 0, g.ys[0] ?? 0];
  const i = Math.min(n - 2, Math.max(0, Math.floor(s)));
  const t = s - i;
  return [
    lerp(g.xs[i] ?? 0, g.xs[i + 1] ?? 0, t),
    lerp(g.ys[i] ?? 0, g.ys[i + 1] ?? 0, t),
  ];
}

/**
 * The neck between two circles of goo: tangent points spread round each
 * circle, joined by cubics whose handles shorten as the circles part. The
 * spread itself closes toward `reach`, so the neck thins to nothing and
 * splits cleanly there instead of vanishing while it is still thick. The
 * chord across each circle is covered by the circle drawn over it, so no arc
 * flags are needed. Crisp at any size, no blur filter.
 */
function neckPath(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2_: number,
  reach: number,
  pinch = true,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (r1 < 0.4 || r2_ < 0.4 || d < 0.5 || d >= reach) return "";
  if (d <= Math.abs(r1 - r2_)) return "";
  const angle = Math.atan2(dy, dx);
  const touching = d < r1 + r2_;
  const u1 = touching
    ? Math.acos(
        Math.min(1, Math.max(-1, (r1 * r1 + d * d - r2_ * r2_) / (2 * r1 * d))),
      )
    : 0;
  const u2 = touching
    ? Math.acos(
        Math.min(
          1,
          Math.max(-1, (r2_ * r2_ + d * d - r1 * r1) / (2 * r2_ * d)),
        ),
      )
    : 0;
  const thin = pinch
    ? 1 - smooth((d - (r1 + r2_) * 0.8) / Math.max(1, reach - (r1 + r2_) * 0.8))
    : 1;
  const v = 0.5 * thin;
  const maxSpread = Math.acos(Math.min(1, Math.max(-1, (r1 - r2_) / d)));
  const a1 = angle + u1 + (maxSpread - u1) * v;
  const a2 = angle - u1 - (maxSpread - u1) * v;
  const a3 = angle + Math.PI - u2 - (Math.PI - u2 - maxSpread) * v;
  const a4 = angle - Math.PI + u2 + (Math.PI - u2 - maxSpread) * v;
  const pt = (x: number, y: number, r: number, a: number) =>
    [x + r * Math.cos(a), y + r * Math.sin(a)] as const;
  const p1 = pt(x1, y1, r1, a1);
  const p2 = pt(x1, y1, r1, a2);
  const p3 = pt(x2, y2, r2_, a3);
  const p4 = pt(x2, y2, r2_, a4);
  const handle =
    Math.min(v * 2.4, Math.hypot(p1[0] - p3[0], p1[1] - p3[1]) / (r1 + r2_)) *
    Math.min(1, (d * 2) / (r1 + r2_));
  const h = (p: readonly [number, number], r: number, a: number) =>
    [p[0] + r * handle * Math.cos(a), p[1] + r * handle * Math.sin(a)] as const;
  const h1 = h(p1, r1, a1 - Math.PI / 2);
  const h2 = h(p2, r1, a2 + Math.PI / 2);
  const h3 = h(p3, r2_, a3 + Math.PI / 2);
  const h4 = h(p4, r2_, a4 - Math.PI / 2);
  const f = (p: readonly [number, number]) => `${r2(p[0])} ${r2(p[1])}`;
  return `M ${f(p1)} C ${f(h1)} ${f(h3)} ${f(p3)} L ${f(p4)} C ${f(h4)} ${f(h2)} ${f(p2)} Z`;
}

/**
 * A node's centre inside `root`, in the root's own px. Read from boxes for
 * sub-pixel precision, then divided by the root's scale, so a card scaled by
 * an ancestor's transform still lines the drop up with its rings.
 */
function centreWithin(el: HTMLElement, root: HTMLElement) {
  const a = el.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  const sx = root.offsetWidth > 0 ? b.width / root.offsetWidth : 1;
  const sy = root.offsetHeight > 0 ? b.height / root.offsetHeight : 1;
  return {
    x: (a.left + a.width / 2 - b.left) / (sx || 1),
    y: (a.top + a.height / 2 - b.top) / (sy || 1),
  };
}

type Scene = {
  hx: number;
  hy: number;
  hrx: number;
  hry: number;
  tx: number;
  ty: number;
  tr: number;
  body: string;
  rx: number;
  ry: number;
  rr: number;
  tether: string;
  wet: string;
  shineX: number;
  shineY: number;
  shineR: number;
};

const EMPTY: Scene = {
  hx: 0,
  hy: 0,
  hrx: 0,
  hry: 0,
  tx: 0,
  ty: 0,
  tr: 0,
  body: "",
  rx: 0,
  ry: 0,
  rr: 0,
  tether: "",
  wet: "",
  shineX: 0,
  shineY: 0,
  shineR: 0,
};

type Flight = { target: number; landed: boolean };

/**
 * A radio group whose selected marker is a drop of goo. Every option is a
 * ring on a shared rail; choosing another pulls the drop out of its ring:
 * the head leads on its own spring, the tail follows on a softer one and the
 * body between them is a metaball neck rebuilt every frame, never longer than
 * `neck` allows. A remnant stays in the old ring, tied to the body by a second
 * neck that thins as it pulls away and splits — the blup — before the remnant
 * shrinks back into its ring. The head lands first, overshoots and settles
 * (its damping is the goo's `viscosity`), the tail catches up, and the new
 * ring swells and takes the colour as the drop arrives.
 *
 * The drop can be dragged along the rail: it follows the finger 1:1, rubber-
 * bands past the ends, and a release commits to the option the throw was
 * heading for. It is a real `role="radiogroup"`: arrow keys move the
 * selection with the same motion, Home and End jump, Space chooses. Under
 * reduced motion the drop fades from one ring to the next, with no neck and
 * no bounce, and the ring still takes the colour.
 */
export function GooRadio({
  options,
  value,
  defaultValue,
  onValueChange,
  label,
  name,
  orientation = "horizontal",
  viscosity = 0.5,
  neck = 0.5,
  squash = 0.5,
  size = "md",
  color = "cobalt",
  ringColor = "var(--hairline-strong)",
  rail = true,
  sound = false,
  disabled = false,
  className,
}: GooRadioProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const m = SIZES[size] ?? SIZES.md;
  const paint = (PALETTE as Record<string, string>)[color] ?? color;
  const horizontal = orientation !== "vertical";
  const n = options.length;
  const v = clamp01(viscosity);
  const nk = clamp01(neck);
  const sq = clamp01(squash);

  const [own, setOwn] = React.useState(defaultValue);
  const chosen = value !== undefined ? value : own;
  const selected = options.findIndex((o) => o.value === chosen);
  const [seated, setSeated] = React.useState(selected);
  const [measured, setMeasured] = React.useState(false);

  const head = useMotionValue(Math.max(0, selected));
  const tail = useMotionValue(Math.max(0, selected));
  const rem = useMotionValue(0);
  const remAt = useMotionValue(0);
  const tether = useMotionValue(0);
  const grow = useMotionValue(selected === -1 ? 0 : 1);
  const alpha = useMotionValue(1);
  const wet = useMotionValue(0);
  const wetFrom = useMotionValue(0);
  /** The landing's wobble: an underdamped spring round zero that squashes the head. */
  const jiggle = useMotionValue(0);
  const geo = useMotionValue<Geo | null>(null);
  const headVelocity = useVelocity(head);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const anchors = React.useRef(new Map<string, HTMLSpanElement>());
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const flight = React.useRef<Flight | null>(null);
  const pending = React.useRef({ velocity: 0, user: false });
  /** Whether the drop is moving because the visitor moved it: only then is it heard. */
  const voice = React.useRef(false);
  /** The body has pulled clear of the remnant at least once since it was tied. */
  const pulled = React.useRef(false);
  const press = React.useRef<number>(-1);
  const grab = React.useRef<{ start: number; active: boolean }>({
    start: 0,
    active: false,
  });
  const shown = React.useRef(selected);
  const api = React.useRef<{
    watch: () => void;
    flowTo: (to: number, from: number) => void;
  } | null>(null);

  const maxStretch = m.drop * lerp(1.8, 3.4, nk);
  const breakD = m.drop * lerp(3, 7, nk);
  const register = size === "sm" ? 1.2 : size === "lg" ? 0.85 : 1;

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };
  const halt = (key: string) => {
    running.current.get(key)?.stop();
    running.current.delete(key);
  };

  const panAt = (index: number) => {
    const el = anchors.current.get(options[index]?.value ?? "");
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** A ring answering the drop: out on flick, back on `back`. */
  const pulse = (index: number, to: number, back: Transition) => {
    const el = anchors.current.get(options[index]?.value ?? "");
    if (!el || !motionSafe) return;
    const key = `ring-${index}`;
    const out = animate(el, { scale: to }, springs.flick);
    run(key, out);
    void out.then(() => {
      if (running.current.get(key) === out) {
        run(key, animate(el, { scale: 1 }, back));
      }
    });
  };

  // The rendered tail is held within `maxStretch` of the head, so a long trip
  // reads as one travelling drop rather than a smear across the rail.
  const body = (g: Geo) => {
    const [hx, hy] = at(g, head.get());
    const [tx0, ty0] = at(g, tail.get());
    const dx = hx - tx0;
    const dy = hy - ty0;
    const len = Math.hypot(dx, dy);
    const k = len > maxStretch ? maxStretch / len : 1;
    return {
      hx,
      hy,
      tx: hx - dx * k,
      ty: hy - dy * k,
      stretch: Math.min(len, maxStretch),
    };
  };

  const split = (from: number, user: boolean) => {
    tether.set(0);
    run("rem", animate(rem, 0, springs.flick));
    setSeated((s) => (s === from ? -1 : s));
    pulse(from, 0.9, springs.snap);
    if (user) {
      audio.play("blup", { pitch: register, gain: 0.6, pan: panAt(from) });
    }
  };

  const land = (target: number, user: boolean) => {
    setSeated(target);
    const pitch = geo.get()?.pitch ?? 1;
    const speed = Math.min(1, (Math.abs(head.getVelocity()) * pitch) / 900);
    jiggle.jump(0);
    run(
      "jiggle",
      animate(jiggle, 0, {
        ...spring(lerp(520, 300, v), lerp(0.22, 0.5, v)),
        velocity: -(4 + 10 * speed),
      }),
    );
    pulse(target, 1.12, springs.recoil);
    run(
      "wet",
      animate(wet, 0, { duration: durations.slow, ease: easings.exit }),
    );
    if (user) {
      audio.play("blup", {
        pitch: register * 1.3,
        gain: 0.35,
        pan: panAt(target),
      });
    }
  };

  /** Runs on every frame the drop moves: the split and the landing are found here. */
  const watch = () => {
    const g = geo.get();
    if (!g) return;
    const user = voice.current;
    if (tether.get() > 0.5) {
      const b = body(g);
      const [rx, ry] = at(g, remAt.get());
      const d = Math.hypot(b.tx - rx, b.ty - ry);
      const from = Math.round(remAt.get());
      if (Math.abs(head.get() - remAt.get()) > 0.25) pulled.current = true;
      if (d > breakD) split(from, user);
      else if (
        pulled.current &&
        !grab.current.active &&
        Math.abs(head.get() - remAt.get()) < 0.04 &&
        Math.abs(tail.get() - remAt.get()) < 0.04
      ) {
        // Pulled back into its own ring before the neck let go: one drop again.
        tether.set(0);
        rem.jump(0);
      }
    }
    const f = flight.current;
    if (f && !f.landed && Math.abs(head.get() - f.target) < 0.14) {
      f.landed = true;
      land(f.target, user);
    }
  };

  const restingAt = () => {
    const h = head.get();
    const t = tail.get();
    const i = Math.round(h);
    return Math.abs(h - i) < 0.03 && Math.abs(t - i) < 0.03 && grow.get() > 0.5
      ? i
      : -1;
  };

  const flowTo = (to: number, from: number) => {
    const { velocity, user } = pending.current;
    pending.current = { velocity: 0, user: false };
    voice.current = user;
    halt("head");
    halt("tail");
    if (to < 0) {
      run(
        "grow",
        animate(grow, 0, { duration: durations.fast, ease: easings.exit }),
      );
      setSeated(-1);
      return;
    }
    const g = geo.get();
    if (!g) {
      head.jump(to);
      tail.jump(to);
      grow.jump(1);
      setSeated(to);
      return;
    }
    if (!motionSafe) {
      // One drop fades out of its ring and into the next: no travel.
      tether.set(0);
      rem.jump(0);
      run(
        "alpha",
        animate(alpha, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            head.jump(to);
            tail.jump(to);
            grow.jump(1);
            setSeated(to);
            run(
              "alpha",
              animate(alpha, 1, {
                duration: durations.fast,
                ease: easings.enter,
              }),
            );
          },
        }),
      );
      if (user)
        audio.play("blup", { pitch: register, gain: 0.5, pan: panAt(to) });
      return;
    }
    if (restingAt() === to && tether.get() < 0.5) {
      // Already sitting there: nothing to flow.
      setSeated(to);
      return;
    }
    if (from < 0 || grow.get() < 0.5) {
      // Nothing was chosen: the drop wells up inside its ring.
      head.jump(to);
      tail.jump(to);
      grow.jump(0);
      setSeated(to);
      run("grow", animate(grow, 1, springs.recoil));
      if (user)
        audio.play("blup", {
          pitch: register * 1.3,
          gain: 0.4,
          pan: panAt(to),
        });
      return;
    }
    const rest = restingAt();
    if (rest !== -1 && rest !== to) {
      remAt.jump(rest);
      rem.jump(m.drop * 0.92);
      tether.set(1);
      pulled.current = false;
      wetFrom.jump(rest);
    } else if (rest === -1 && wet.get() < 0.05) {
      wetFrom.jump(head.get());
    }
    halt("wet");
    wet.set(1);
    flight.current = { target: to, landed: false };
    // The head travels nearly critically damped, so a long trip lands inside
    // its ring; the landing's liveliness is the jiggle, which runny goo has
    // more of.
    const stiffness = lerp(560, 200, v);
    run(
      "head",
      animate(head, to, {
        ...spring(stiffness, lerp(0.76, 0.92, v)),
        velocity,
      }),
    );
    run(
      "tail",
      animate(tail, to, {
        ...spring(stiffness * lerp(0.72, 0.42, v), 0.96),
        delay: lerp(0.02, 0.09, v),
      }),
    );
  };

  React.useEffect(() => {
    api.current = { watch, flowTo };
  });

  // A selection that changes — from a press, a key, a drag or the host — gets
  // the same flow; only a visitor's own change is heard.
  React.useEffect(() => {
    if (shown.current === selected) return;
    const from = shown.current;
    shown.current = selected;
    if (grab.current.active) return;
    api.current?.flowTo(selected, from);
  }, [selected]);

  React.useEffect(() => {
    const check = () => api.current?.watch();
    const offHead = head.on("change", check);
    const offTail = tail.on("change", check);
    return () => {
      offHead();
      offTail();
    };
  }, [head, tail]);

  // Ring centres, measured from layout (not from boxes a transform has moved).
  const ids = options.map((o) => o.value).join("\u0000");
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const id of ids.split("\u0000")) {
        const el = anchors.current.get(id);
        if (!el) return;
        const c = centreWithin(el, root);
        xs.push(r2(c.x));
        ys.push(r2(c.y));
      }
      const pitch =
        xs.length > 1
          ? Math.max(
              1,
              Math.hypot(
                (xs[1] ?? 0) - (xs[0] ?? 0),
                (ys[1] ?? 0) - (ys[0] ?? 0),
              ),
            )
          : 1;
      geo.set({ xs, ys, pitch });
      setMeasured(true);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [ids, size, orientation, geo]);

  React.useEffect(() => {
    const anims = running.current;
    return () => {
      for (const c of anims.values()) c.stop();
      anims.clear();
    };
  }, []);

  // A size or orientation change re-seats the drop where it belongs at once.
  React.useEffect(() => {
    const i = shown.current;
    for (const key of ["head", "tail", "rem", "grow", "alpha"]) {
      running.current.get(key)?.stop();
      running.current.delete(key);
    }
    tether.set(0);
    rem.jump(0);
    alpha.jump(1);
    head.jump(Math.max(0, i));
    tail.jump(Math.max(0, i));
    grow.jump(i === -1 ? 0 : 1);
  }, [size, orientation, head, tail, rem, tether, grow, alpha]);

  const enabled = (i: number) => !disabled && !options[i]?.disabled;

  const choose = (i: number, velocity = 0) => {
    const opt = options[i];
    if (!opt || !enabled(i)) return;
    if (i === selected) {
      // Dropped back on its own option: the drop flows home.
      pending.current = { velocity, user: true };
      flowTo(i, i);
      return;
    }
    pending.current = { velocity, user: true };
    if (value === undefined) {
      setOwn(opt.value);
    } else {
      // Controlled: a dragged drop heads home first. A host that takes the
      // change retargets it from wherever it has got to; one that refuses
      // never shows a false selection.
      if (restingAt() !== selected) {
        flowTo(Math.max(0, selected), selected);
        pending.current = { velocity, user: true };
      }
    }
    onValueChange?.(opt.value);
  };

  const step = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= n; k += 1) {
      const i = (((from + dir * k) % n) + n) % n;
      if (enabled(i)) return i;
    }
    return -1;
  };

  const focusAt = (i: number) => {
    buttons.current.get(options[i]?.value ?? "")?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, i: number) => {
    let next = -1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = step(i, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = step(i, -1);
        break;
      case "Home":
        next = step(-1, 1);
        break;
      case "End":
        next = step(n, -1);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next === -1) return;
    focusAt(next);
    choose(next);
  };

  const pitchOf = () => geo.get()?.pitch ?? 1;

  const drag = useDrag({
    axis: horizontal ? "x" : "y",
    threshold: 4,
    disabled,
    onStart: () => {
      const i = press.current;
      grab.current.active = i !== -1 && i === selected && grow.get() > 0.5;
      if (!grab.current.active) return;
      halt("head");
      halt("tail");
      grab.current.start = head.get();
      const rest = restingAt();
      if (rest !== -1 && motionSafe) {
        remAt.jump(rest);
        rem.jump(m.drop * 0.92);
        tether.set(1);
        pulled.current = false;
        wetFrom.jump(rest);
        halt("wet");
        wet.set(1);
      }
      flight.current = null;
      voice.current = true;
    },
    onMove: ({ offset }) => {
      if (!grab.current.active) return;
      const pitch = pitchOf();
      const px =
        (grab.current.start + (horizontal ? offset.x : offset.y) / pitch) *
        pitch;
      const lo = 0;
      const hi = (n - 1) * pitch;
      const room = pitch * 0.3;
      const held =
        px < lo
          ? lo + rubberband(px - lo, room)
          : px > hi
            ? hi + rubberband(px - hi, room)
            : px;
      const s = held / pitch;
      head.set(Number(s.toFixed(4)));
      if (!motionSafe) {
        tail.set(head.get());
        return;
      }
      run(
        "tail",
        animate(
          tail,
          Math.min(n - 1, Math.max(0, s)),
          spring(lerp(640, 240, v), 0.9),
        ),
      );
    },
    onEnd: ({ velocity }) => {
      if (!grab.current.active) {
        if (press.current !== -1) choose(press.current);
        return;
      }
      grab.current.active = false;
      const pitch = pitchOf();
      const vi = (horizontal ? velocity.x : velocity.y) / pitch;
      const landing = project(head.get(), vi, 0.99);
      let target = Math.min(n - 1, Math.max(0, Math.round(landing)));
      if (!enabled(target)) {
        const a = step(target, 1);
        const b = step(target, -1);
        target =
          a === -1
            ? b
            : b === -1
              ? a
              : Math.abs(a - landing) <= Math.abs(b - landing)
                ? a
                : b;
      }
      if (target === -1) target = Math.max(0, selected);
      choose(target, vi);
    },
    onCancel: () => {
      if (!grab.current.active) return;
      grab.current.active = false;
      pending.current = { velocity: 0, user: false };
      flowTo(Math.max(0, selected), selected);
    },
    onTap: () => {
      if (press.current !== -1) choose(press.current);
    },
  });

  const scene = useTransform((): Scene => {
    // Every motion value is read up front: the transform subscribes to the
    // ones it reads, and an early return must not drop any.
    const g = geo.get();
    const h = head.get();
    const t = tail.get();
    const r = rem.get();
    const ra = remAt.get();
    const te = tether.get();
    const gr = grow.get();
    const hv = headVelocity.get();
    const wt = wet.get();
    const wf = wetFrom.get();
    const jig = jiggle.get();
    if (!g) return EMPTY;
    const [hx, hy] = at(g, h);
    const [tx0, ty0] = at(g, t);
    const dx = hx - tx0;
    const dy = hy - ty0;
    const len = Math.hypot(dx, dy);
    const k = len > maxStretch ? maxStretch / len : 1;
    const tx = hx - dx * k;
    const ty = hy - dy * k;
    const e = clamp01(Math.min(len, maxStretch) / maxStretch);
    const size_ = Math.max(0, gr);
    const hr = m.drop * lerp(1, 0.86, e) * size_;
    const tr = m.drop * lerp(1, 0.7, e) * size_;
    // Squash follows speed: long along the travel, thin across it.
    const q = Math.min(0.3, (Math.abs(hv) * g.pitch) / 2600) * sq;
    const jg = Math.max(-1, Math.min(1, jig)) * 0.22 * sq;
    const along = hr * (1 + q + jg);
    const across = hr * (1 - q * 0.7 - jg * 0.8);
    const [rx, ry] = at(g, ra);
    const dr = Math.hypot(tx - rx, ty - ry);
    const rr = Math.max(
      0,
      te > 0.5 ? r * lerp(1, 0.55, clamp01(dr / breakD)) : r,
    );
    const [wx, wy] = at(g, wf);
    const wetPath =
      wt > 0.01 && Math.hypot(tx - wx, ty - wy) > 1
        ? `M ${r2(wx)} ${r2(wy)} L ${r2(tx)} ${r2(ty)}`
        : "";
    return {
      hx: r2(hx),
      hy: r2(hy),
      hrx: r2(horizontal ? along : across),
      hry: r2(horizontal ? across : along),
      tx: r2(tx),
      ty: r2(ty),
      tr: r2(tr),
      body: neckPath(tx, ty, tr, hx, hy, hr, maxStretch + m.drop * 3, false),
      rx: r2(rx),
      ry: r2(ry),
      rr: r2(rr),
      tether: te > 0.5 ? neckPath(rx, ry, rr, tx, ty, tr, breakD) : "",
      wet: wetPath,
      shineX: r2(hx - hr * 0.32),
      shineY: r2(hy - hr * 0.36),
      shineR: r2(hr * 0.3),
    };
  });

  const headX = useTransform(scene, (s) => s.hx);
  const headY = useTransform(scene, (s) => s.hy);
  const headRx = useTransform(scene, (s) => s.hrx);
  const headRy = useTransform(scene, (s) => s.hry);
  const tailX = useTransform(scene, (s) => s.tx);
  const tailY = useTransform(scene, (s) => s.ty);
  const tailR = useTransform(scene, (s) => s.tr);
  const bodyD = useTransform(scene, (s) => s.body);
  const remX = useTransform(scene, (s) => s.rx);
  const remY = useTransform(scene, (s) => s.ry);
  const remR = useTransform(scene, (s) => s.rr);
  const tetherD = useTransform(scene, (s) => s.tether);
  const wetD = useTransform(scene, (s) => s.wet);
  const wetOpacity = useTransform(wet, (w) => r2(w * 0.4));
  const shineX = useTransform(scene, (s) => s.shineX);
  const shineY = useTransform(scene, (s) => s.shineY);
  const shineRx = useTransform(scene, (s) => s.shineR);
  const shineRy = useTransform(scene, (s) => r2(s.shineR * 0.62));

  const tabStop = selected !== -1 && enabled(selected) ? selected : step(-1, 1);
  const railInset = `${Number((50 / Math.max(1, n)).toFixed(3))}%`;
  const ringCentre = m.pad + m.ring;

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label={label}
      aria-orientation={orientation}
      aria-disabled={disabled || undefined}
      {...drag}
      onPointerDown={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        const id = target
          ?.closest("[data-goo-option]")
          ?.getAttribute("data-goo-option");
        press.current = id === null || id === undefined ? -1 : Number(id);
        drag.onPointerDown(event);
      }}
      className={cn(
        "@container/goo-radio relative grid w-full select-none",
        horizontal ? "touch-pan-y" : "touch-pan-x",
        className,
      )}
      style={
        horizontal
          ? { gridTemplateColumns: `repeat(${Math.max(1, n)}, minmax(0, 1fr))` }
          : { gridTemplateRows: `repeat(${Math.max(1, n)}, minmax(0, 1fr))` }
      }
    >
      {rail && n > 1 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full opacity-70"
          style={
            horizontal
              ? {
                  left: railInset,
                  right: railInset,
                  top: ringCentre - m.rail / 2,
                  height: m.rail,
                  background: ringColor,
                }
              : {
                  top: railInset,
                  bottom: railInset,
                  left: 8 + m.ring - m.rail / 2,
                  width: m.rail,
                  background: ringColor,
                }
          }
        />
      ) : null}

      {options.map((opt, i) => {
        const isChosen = i === selected;
        const isSeated = i === seated;
        const off = !enabled(i);
        return (
          <button
            key={opt.value}
            ref={(node) => {
              if (node) buttons.current.set(opt.value, node);
              else buttons.current.delete(opt.value);
            }}
            type="button"
            role="radio"
            data-goo-option={i}
            aria-checked={isChosen}
            aria-disabled={off || undefined}
            tabIndex={i === tabStop ? 0 : -1}
            title={opt.label}
            onClick={(event) => {
              // Pointer presses arrive through the drag's tap. A click with
              // no pointer behind it — Space, Enter, assistive technology —
              // chooses through the same path, sound and all.
              if (event.detail === 0) choose(i);
            }}
            onKeyDown={(event) => onKeyDown(event, i)}
            className={cn(
              "group/goo-radio flex min-w-0 rounded-3 outline-none",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              horizontal
                ? "flex-col items-center gap-2 px-1 text-center"
                : "items-center gap-3 px-2 py-1.5 text-left",
              off ? "cursor-not-allowed opacity-45" : "cursor-pointer",
            )}
            style={
              horizontal
                ? { paddingTop: m.pad, paddingBottom: m.pad - 2 }
                : undefined
            }
          >
            <span
              ref={(node) => {
                if (node) anchors.current.set(opt.value, node);
                else anchors.current.delete(opt.value);
              }}
              aria-hidden
              className="relative flex shrink-0 items-center justify-center"
              style={{ width: m.ring * 2, height: m.ring * 2 }}
            >
              <span
                className={cn(
                  "absolute inset-0 rounded-full border border-solid [border-color:var(--goo-ring)] bg-card transition-[border-color,background-color,scale] duration-150",
                  !off &&
                    !isSeated &&
                    "group-hover/goo-radio:border-ink-3 group-active/goo-radio:scale-90",
                )}
                style={
                  {
                    borderWidth: m.stroke,
                    "--goo-ring": isSeated ? paint : ringColor,
                    background: isSeated
                      ? `color-mix(in oklab, ${paint} 12%, var(--card))`
                      : undefined,
                  } as React.CSSProperties
                }
              />
              {!measured && isChosen ? (
                <span
                  className="relative rounded-full"
                  style={{
                    width: m.drop * 2,
                    height: m.drop * 2,
                    background: paint,
                  }}
                />
              ) : null}
            </span>
            <span
              className={cn(
                "flex min-w-0 flex-col",
                horizontal ? "items-center" : "items-start",
              )}
            >
              <span
                className={cn(
                  "max-w-full truncate leading-snug font-medium transition-colors",
                  m.label,
                  isChosen ? "text-foreground" : "text-ink-2",
                )}
              >
                {opt.label}
              </span>
              {opt.description ? (
                <span
                  className={cn(
                    "max-w-full leading-snug text-balance break-words text-ink-3",
                    m.note,
                  )}
                >
                  {opt.description}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}

      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
        style={{ color: paint }}
      >
        <motion.g style={{ opacity: alpha }}>
          <motion.path
            d={wetD}
            fill="none"
            stroke="currentColor"
            strokeWidth={Math.max(1, m.rail)}
            strokeLinecap="round"
            style={{ opacity: wetOpacity }}
          />
          <motion.path d={tetherD} fill="currentColor" />
          <motion.circle cx={remX} cy={remY} r={remR} fill="currentColor" />
          <motion.path d={bodyD} fill="currentColor" />
          <motion.circle cx={tailX} cy={tailY} r={tailR} fill="currentColor" />
          <motion.ellipse
            cx={headX}
            cy={headY}
            rx={headRx}
            ry={headRy}
            fill="currentColor"
          />
          <motion.ellipse
            cx={shineX}
            cy={shineY}
            rx={shineRx}
            ry={shineRy}
            fill="white"
            opacity={0.42}
          />
        </motion.g>
      </svg>

      {name ? (
        <input type="hidden" name={name} value={chosen ?? ""} readOnly />
      ) : null}
    </div>
  );
}
