"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  type AnimationPlaybackControls,
  type MotionValue,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type AbacusBeads = "wood" | "glass" | "stone";

export type AbacusCountProps = {
  /** What is being counted. The loader's accessible name, and shown beside the frame unless `hideLabel`. @default "Loading" */
  label?: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The frame's box in px. Detail simplifies below 40 and below 24. @default 24 */
  size?: number;
  /** How fast it counts, 0.5 to 2. @default 1 */
  speed?: number;
  /** Wires on the frame, 2 to 5: the places the count can show. @default 3 */
  rods?: number;
  /** What the beads are made of, which sets how they look and how they land. @default "wood" */
  beads?: AbacusBeads;
  /** Determinate, 0 to 1. Without it the frame counts and clears on its own. */
  progress?: number;
  /** What a full `progress` counts to, so rows read as rows. @default 100 */
  total?: number;
  /** A bead was flicked across by hand or by key. */
  onFlick?: () => void;
  /** Play the flick, its landing and any carry it causes. Off unless asked for. @default false */
  sound?: boolean;
  /** Keep counting, but refuse the hand: the frame is a picture, not a button. @default false */
  disabled?: boolean;
  className?: string;
};

const MAX_RODS = 5;
const BEADS = 10;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Material = {
  body: string;
  edge: string;
  ridge: string;
  /** How a bead lands: the physics of the material. */
  spring: Transition;
  /** Roughly when a rising bead arrives, in ms: where its click belongs. */
  arrive: number;
  pitch: number;
  kind: "wood" | "glass" | "stone";
};

// Pigments at fixed lightness: a bead is a filled object, so it keeps its
// colour whichever theme the frame sits in. The frame itself is theme ink.
const MATERIALS: Record<AbacusBeads, Material> = {
  // One crisp overshoot: a light, hard bead meeting the stack.
  wood: {
    body: "oklch(0.6 0.1 52)",
    edge: "oklch(0.46 0.085 46)",
    ridge: "oklch(0.75 0.085 64)",
    spring: springs.snap,
    arrive: 85,
    pitch: 1,
    kind: "wood",
  },
  // Two bright bounces: glass rings off whatever it meets.
  glass: {
    body: "oklch(0.8 0.09 205 / 0.5)",
    edge: "oklch(0.6 0.11 214 / 0.95)",
    ridge: "oklch(0.98 0.02 205 / 0.9)",
    spring: springs.recoil,
    arrive: 80,
    pitch: 1.4,
    kind: "glass",
  },
  // Heavy and dead: stone arrives late and does not bounce at all.
  stone: {
    body: "oklch(0.63 0.012 240)",
    edge: "oklch(0.48 0.014 240)",
    ridge: "oklch(0.77 0.01 240)",
    spring: springs.glide,
    arrive: 150,
    pitch: 0.72,
    kind: "stone",
  },
};

type Layout = {
  s: number;
  tier: 0 | 1 | 2;
  rods: number;
  beam: number;
  post: number;
  corner: number;
  /** Bead pitch along the wire. */
  pitch: number;
  /** How far a bead rises: the gap above the resting stack. */
  travel: number;
  bead: number;
  width: number;
  rx: number;
  sep: number;
  wire: number;
  /** Wire x, highest place first (left to right, like digits). */
  xs: number[];
};

/**
 * The frame in px for one size. Every bead travels the same distance (ten
 * beads plus a gap of three fill the wire), so one offset per bead draws it.
 * Small frames drop detail: under 24px two wires and no posts, the beads
 * merging into bars; under 40px three wires and no material detail.
 */
function layoutOf(size: number, rods: number): Layout {
  const s = Math.round(clamp(size, 12, 256));
  const tier = s < 24 ? 0 : s < 40 ? 1 : 2;
  const shown = clamp(
    Math.round(rods),
    2,
    tier === 0 ? 2 : tier === 1 ? 3 : MAX_RODS,
  );
  const beam = r2(Math.max(1, s * 0.07));
  const post = tier === 0 ? 0 : r2(Math.max(1, s * 0.045));
  const inner = s - 2 * beam;
  const pitch = r2(inner / 13);
  const travel = r2(inner - BEADS * pitch);
  const sep = tier === 2 ? 0.6 : tier === 1 ? 0.4 : 0;
  const bead = r2(pitch - sep);
  const cell = (s - 2 * post) / shown;
  const width = r2(
    tier === 0 ? cell * 0.62 : Math.min(cell * 0.78, pitch * 3.6),
  );
  return {
    s,
    tier,
    rods: shown,
    beam,
    post,
    corner: tier === 2 ? r2(Math.min(3, s * 0.05)) : 0,
    pitch,
    travel,
    bead,
    width,
    rx: r2(tier === 0 ? Math.min(0.5, bead / 2) : Math.min(bead, width) / 2),
    sep,
    wire: tier === 2 ? r2(Math.max(1, s * 0.018)) : 1,
    xs: Array.from({ length: shown }, (_, i) => r2(post + cell * (i + 0.5))),
  };
}

/** Where bead j (0 is the topmost) rests at the bottom of its wire. */
const restY = (L: Layout, j: number) =>
  r2(L.beam + L.travel + j * L.pitch + L.sep / 2);

/** The frame as one ring, so the beams and posts never overlap in tint. */
function framePath(L: Layout): string {
  const { s, beam, post, corner: c } = L;
  const outer =
    c > 0
      ? `M ${c} 0 H ${r2(s - c)} A ${c} ${c} 0 0 1 ${s} ${c} V ${r2(s - c)} A ${c} ${c} 0 0 1 ${r2(s - c)} ${s} H ${c} A ${c} ${c} 0 0 1 0 ${r2(s - c)} V ${c} A ${c} ${c} 0 0 1 ${c} 0 Z`
      : `M 0 0 H ${s} V ${s} H 0 Z`;
  return `${outer} M ${post} ${beam} V ${r2(s - beam)} H ${r2(s - post)} V ${beam} Z`;
}

/** Each wire's digit, units first; the leftmost wire may hold all ten. */
function digitsOf(n: number, rods: number): number[] {
  const out = Array.from({ length: MAX_RODS }, () => 0);
  let rest = Math.max(0, Math.round(n));
  for (let r = 0; r < rods; r += 1) {
    if (r === rods - 1) {
      out[r] = Math.min(BEADS, rest);
    } else {
      out[r] = rest % 10;
      rest = Math.floor(rest / 10);
    }
  }
  return out;
}

const countOf = (digits: number[], rods: number) =>
  digits.slice(0, rods).reduce((sum, d, r) => sum + d * 10 ** r, 0);

/** The most a frame can show: the top wire full, every other wire at nine. */
const capOf = (rods: number) => 11 * 10 ** (rods - 1) - 1;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** How far the free count runs before it clears: seeded, 16 to 38. */
function topOf(seed: number, cycle: number): number {
  let s = (seed ^ Math.imul(cycle + 1, 0x9e3779b1)) >>> 0;
  s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0;
  s = (s ^ (s >>> 12)) >>> 0;
  return 16 + (s % 23);
}

/** A seeded 0–1 per bead, for stone's speckles. */
const grain = (k: number, n: number) =>
  (((Math.imul(k + 1, 2654435761) ^ Math.imul(n + 7, 40503)) >>> 0) % 1000) /
  1000;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageShown = () => !document.hidden;
const serverShown = () => true;

type Machine = {
  /** The count the beads are going to, per wire, units first. */
  digits: number[];
  rods: number;
  mode: "d" | "i";
  /** The free count (indeterminate). */
  tally: number;
  top: number;
  cycle: number;
  phase: "count" | "hold" | "clear";
  /** Determinate: a count a flick lent the frame ahead of the work. */
  lent: number | null;
  dragging: boolean;
  grabbed: number;
  grabFrom: number;
  detent: boolean;
  busyUntil: number;
  loop: number;
  lentTimer: number;
  timers: Set<number>;
  running: Map<number, AnimationPlaybackControls>;
};

type Api = {
  pump: () => void;
  halt: () => void;
  start: () => void;
  relayout: () => void;
  clearAll: () => number;
};

/**
 * An inline loader drawn as a small counting frame: ten beads on each wire,
 * the highest place on the left. The work counts up one bead at a time — the
 * top bead of the resting stack rises to the beam with a click — and at ten
 * the wire clears in a rattle and a bead rises on the next wire along. Given
 * `progress`, the beads read the count (`total` rows, or percent); without
 * it the frame counts on its own to a seeded number and clears.
 *
 * Each bead is one motion value, its offset carried as its own `y`, animated
 * on the spring its material calls for: wood snaps, glass rings in two
 * bounces, stone lands dead. The frame is also a button: drag up and the next
 * units bead follows the finger 1:1, a release past halfway flicks it home
 * with the throw's velocity, and a tap, Enter, Space or the Up arrow does the
 * same. Free-running, the flick adds one; determinate, the bead is only lent
 * and slides back if the work has not reached it. The count loop runs only
 * on screen in a visible page. Under reduced motion beads swap instead of
 * sliding, and the count still counts.
 */
export function AbacusCount({
  label = "Loading",
  hideLabel = false,
  size = 24,
  speed = 1,
  rods = 3,
  beads = "wood",
  progress,
  total,
  onFlick,
  sound = false,
  disabled = false,
  className,
}: AbacusCountProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const seed = hash(uid);
  const L = layoutOf(size, rods);
  const mat = MATERIALS[beads] ?? MATERIALS.wood;
  const pace = clamp(speed, 0.5, 2);
  const determinate = progress !== undefined;
  const p = clamp(progress ?? 0, 0, 1);
  const whole = Math.max(1, Math.round(total ?? 100));
  // A frame too small for the total counts to its own capacity instead.
  const most = Math.min(whole, 10 ** L.rods);
  const base = Math.round(p * most);
  const cap = capOf(L.rods);

  const [onScreen, setOnScreen] = React.useState(true);
  const pageVisible = React.useSyncExternalStore(
    subscribeVisibility,
    pageShown,
    serverShown,
  );
  const live = onScreen && pageVisible;

  const initial = digitsOf(determinate ? base : 0, L.rods);
  const [pieces] = React.useState(() =>
    Array.from({ length: MAX_RODS * BEADS }, (_, k) =>
      motionValue(
        k % BEADS < (initial[Math.floor(k / BEADS)] ?? 0) ? -L.travel : 0,
      ),
    ),
  );
  const machine = React.useRef<Machine>({
    digits: initial,
    rods: L.rods,
    mode: determinate ? "d" : "i",
    tally: 0,
    top: topOf(seed, 0),
    cycle: 0,
    phase: "count",
    lent: null,
    dragging: false,
    grabbed: -1,
    grabFrom: 0,
    detent: false,
    busyUntil: 0,
    loop: 0,
    lentTimer: 0,
    timers: new Set(),
    running: new Map(),
  });
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const next = () => api.current?.pump();

  const panNow = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const after = (ms: number, fn: () => void) => {
    const m = machine.current;
    if (ms <= 0) {
      fn();
      return;
    }
    const id = window.setTimeout(() => {
      m.timers.delete(id);
      fn();
    }, Math.round(ms));
    m.timers.add(id);
  };

  const moveBead = (
    r: number,
    j: number,
    up: boolean,
    velocity = 0,
    spring: Transition = mat.spring,
  ) => {
    const m = machine.current;
    const k = r * BEADS + j;
    const mv = pieces[k];
    if (!mv) return;
    m.running.get(k)?.stop();
    m.running.delete(k);
    const target = up ? -L.travel : 0;
    if (!motionSafe) {
      mv.set(target);
      return;
    }
    m.running.set(k, animate(mv, target, { ...spring, velocity }));
  };

  /** Every bead to where the digits say: at once, gliding, or clearing. */
  const place = (how: "instant" | "glide" | "clear"): number => {
    const m = machine.current;
    let latest = 0;
    for (let r = 0; r < MAX_RODS; r += 1) {
      for (let j = 0; j < BEADS; j += 1) {
        const k = r * BEADS + j;
        const mv = pieces[k];
        if (!mv) continue;
        const target = r < L.rods && j < (m.digits[r] ?? 0) ? -L.travel : 0;
        if (how === "instant" || !motionSafe || r >= L.rods) {
          m.running.get(k)?.stop();
          m.running.delete(k);
          mv.set(target);
          continue;
        }
        if (
          Math.abs(mv.get() - target) < 0.2 &&
          Math.abs(mv.getVelocity()) < 1
        ) {
          continue;
        }
        // A clear drops the units wire first and each stack from the
        // bottom, so the frame empties like beads let go, not a wipe.
        const delay = how === "clear" ? r * 0.07 + (BEADS - 1 - j) * 0.014 : 0;
        latest = Math.max(latest, delay);
        m.running.get(k)?.stop();
        m.running.set(
          k,
          animate(mv, target, {
            ...(how === "clear" ? mat.spring : springs.glide),
            delay,
          }),
        );
      }
    }
    return (
      Math.round(latest * 1000) + (how === "clear" ? mat.arrive + 220 : 380)
    );
  };

  /**
   * One more: the next bead on the units wire rises; at ten the wire clears
   * in a rattle and the carry rises on the next wire, as far as it chains.
   * Returns when the last bead of the move has arrived, in ms.
   */
  const stepUp = (hand: boolean, velocity: number): number => {
    const m = machine.current;
    const before = m.digits.slice();
    const have = countOf(before, L.rods);
    if (have >= cap) return 0;
    m.digits = digitsOf(have + 1, L.rods);
    const pan = hand ? panNow() : 0;
    let end = 0;
    const rise = (r: number, at: number) => {
      const j = before[r] ?? 0;
      after(at, () => moveBead(r, j, true, r === 0 ? velocity : 0));
      if (hand) {
        after(at + mat.arrive, () =>
          audio.play("click", {
            pitch: r2(mat.pitch * 0.84 ** r),
            gain: 0.55,
            pan,
          }),
        );
      }
      if (j === BEADS - 1 && r < L.rods - 1) {
        const dropAt = at + mat.arrive + 40;
        for (let k = BEADS - 1; k >= 0; k -= 1) {
          const t = dropAt + (BEADS - 1 - k) * 18;
          after(t, () => {
            moveBead(r, k, false);
            if (hand) {
              audio.play("tick", {
                pitch: r2(mat.pitch * (0.92 + k * 0.016)),
                gain: 0.26,
                pan,
              });
            }
          });
        }
        rise(r + 1, dropAt + 60);
      } else {
        end = Math.max(end, at + mat.arrive);
      }
    };
    rise(0, 0);
    return end + 30;
  };

  const glideTo = (n: number): number => {
    machine.current.digits = digitsOf(clamp(n, 0, cap), L.rods);
    return place("glide");
  };

  const stepDown = (): number => {
    const m = machine.current;
    const have = countOf(m.digits, L.rods);
    const d = m.digits[0] ?? 0;
    // Borrowing would unwind a carry bead by bead; the frame glides instead.
    if (d === 0) return glideTo(have - 1);
    m.digits = digitsOf(have - 1, L.rods);
    moveBead(0, d - 1, false);
    return mat.arrive + 30;
  };

  const clearAll = (): number => {
    machine.current.digits = digitsOf(0, L.rods);
    return place("clear");
  };

  const desired = (): number => {
    const m = machine.current;
    if (determinate) {
      return Math.min(cap, m.lent !== null ? Math.max(base, m.lent) : base);
    }
    return Math.min(cap, m.tally);
  };

  const stopTimers = () => {
    const m = machine.current;
    window.clearTimeout(m.loop);
    m.loop = 0;
    for (const id of m.timers) window.clearTimeout(id);
    m.timers.clear();
  };

  /** Everything stops, and every bead lands where the count says: finished, never frozen. */
  const halt = () => {
    const m = machine.current;
    stopTimers();
    window.clearTimeout(m.lentTimer);
    m.lentTimer = 0;
    m.lent = null;
    m.busyUntil = 0;
    if (m.phase === "clear") {
      m.cycle += 1;
      m.top = topOf(seed, m.cycle);
    }
    m.phase = "count";
    place("instant");
  };

  /** Moves the beads one step toward what they should show, then schedules itself. */
  const pump = () => {
    const m = machine.current;
    window.clearTimeout(m.loop);
    m.loop = 0;
    if (m.dragging) return;
    const lag = m.busyUntil - performance.now();
    if (lag > 1) {
      m.loop = window.setTimeout(next, Math.ceil(lag));
      return;
    }
    const have = countOf(m.digits, L.rods);
    const want = desired();
    if (want !== have) {
      let end = 0;
      if (!live || !motionSafe) {
        m.digits = digitsOf(want, L.rods);
        place("instant");
      } else if (Math.abs(want - have) > 3) {
        // A fast host is never left behind: big moves glide at once.
        end = glideTo(want);
      } else if (want > have) {
        end = stepUp(false, 0);
      } else {
        end = stepDown();
      }
      m.busyUntil = performance.now() + end;
      if (live) {
        m.loop = window.setTimeout(
          next,
          Math.ceil(end + (determinate ? 60 / pace : 0)),
        );
      }
      return;
    }
    if (determinate || !live || m.phase !== "count") return;
    if (m.tally < m.top) {
      m.loop = window.setTimeout(
        () => {
          machine.current.tally += 1;
          next();
        },
        Math.round((motionSafe ? 170 : 520) / pace),
      );
      return;
    }
    m.phase = "hold";
    m.loop = window.setTimeout(
      () => {
        const held = machine.current;
        held.phase = "clear";
        held.tally = 0;
        const end = api.current?.clearAll() ?? 0;
        held.busyUntil = performance.now() + end;
        held.loop = window.setTimeout(
          () => {
            const now = machine.current;
            now.phase = "count";
            now.cycle += 1;
            now.top = topOf(seed, now.cycle);
            next();
          },
          Math.round(end + 260 / pace),
        );
      },
      Math.round(700 / pace),
    );
  };

  const start = () => {
    const m = machine.current;
    const mode = determinate ? "d" : "i";
    if (m.mode !== mode) {
      m.mode = mode;
      m.lent = null;
      m.tally = 0;
      m.phase = "count";
      m.cycle += 1;
      m.top = topOf(seed, m.cycle);
    }
    pump();
  };

  /** A new size or wire count: same count, redrawn at once. */
  const relayout = () => {
    const m = machine.current;
    const had = countOf(m.digits, m.rods);
    m.rods = L.rods;
    m.tally = Math.min(m.tally, cap);
    m.digits = digitsOf(determinate ? desired() : Math.min(had, cap), L.rods);
    place("instant");
  };

  /** One bead across, by hand or key. Returns nothing; the rest follows. */
  const flick = (velocity: number) => {
    const m = machine.current;
    if (disabled) return;
    const have = countOf(m.digits, L.rods);
    if (have >= cap) {
      place("glide");
      next();
      return;
    }
    // Whatever was in flight lands now, so the bead that moves is the next.
    stopTimers();
    let end = 0;
    if (!motionSafe) {
      m.digits = digitsOf(have + 1, L.rods);
      place("instant");
      audio.play("click", { pitch: mat.pitch, gain: 0.55, pan: panNow() });
    } else {
      place("glide");
      end = stepUp(true, velocity);
    }
    const now = countOf(m.digits, L.rods);
    if (determinate) {
      // Lent, not given: the work owns the count. It waits for the work a
      // moment, then slides home unless the count has caught up.
      m.lent = now;
      window.clearTimeout(m.lentTimer);
      m.lentTimer = window.setTimeout(
        () => {
          machine.current.lent = null;
          next();
        },
        Math.round(end + 1100),
      );
    } else {
      m.tally = now;
      if (m.phase === "clear") {
        m.cycle += 1;
        m.top = topOf(seed, m.cycle);
      }
      m.phase = "count";
    }
    m.busyUntil = performance.now() + end;
    m.loop = window.setTimeout(next, Math.ceil(end + 40));
    onFlick?.();
  };

  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: () => {
      const m = machine.current;
      m.dragging = true;
      stopTimers();
      place("glide");
      const d = m.digits[0] ?? 0;
      m.grabbed = countOf(m.digits, L.rods) >= cap || d >= BEADS ? -1 : d;
      if (m.grabbed < 0) return;
      m.running.get(m.grabbed)?.stop();
      m.running.delete(m.grabbed);
      m.grabFrom = pieces[m.grabbed]?.get() ?? 0;
      m.detent = false;
    },
    onMove: ({ offset }) => {
      const m = machine.current;
      const mv = m.grabbed < 0 ? undefined : pieces[m.grabbed];
      if (!mv) return;
      const raw = m.grabFrom + offset.y;
      const y =
        raw < -L.travel
          ? -L.travel + rubberband(raw + L.travel, L.travel)
          : raw > 0
            ? rubberband(raw, L.travel)
            : raw;
      mv.set(r2(y));
      // The halfway point is a detent you can feel: past it, the bead goes.
      const past = y < -L.travel / 2;
      if (past !== m.detent) {
        m.detent = past;
        audio.play("tick", {
          pitch: r2(mat.pitch * (past ? 1.1 : 0.95)),
          gain: 0.3,
          pan: panNow(),
        });
      }
    },
    onEnd: ({ velocity }) => {
      const m = machine.current;
      m.dragging = false;
      const j = m.grabbed;
      m.grabbed = -1;
      if (j < 0) {
        next();
        return;
      }
      const at = pieces[j]?.get() ?? 0;
      if (project(at, velocity.y, 0.99) < -L.travel / 2) {
        flick(velocity.y);
      } else {
        moveBead(0, j, false, velocity.y);
        next();
      }
    },
    onCancel: () => {
      const m = machine.current;
      m.dragging = false;
      const j = m.grabbed;
      m.grabbed = -1;
      if (j >= 0) moveBead(0, j, false);
      next();
    },
    onTap: () => flick(0),
  });

  React.useEffect(() => {
    api.current = { pump, halt, start, relayout, clearAll };
  });

  React.useEffect(() => {
    api.current?.relayout();
  }, [L.rods, L.travel]);

  // The loop lives while the frame is on screen in a visible page; stopping
  // lands every bead, so a StrictMode re-run or a scroll resumes cleanly.
  React.useEffect(() => {
    const now = api.current;
    now?.start();
    return () => now?.halt();
  }, [live, motionSafe, determinate]);

  React.useEffect(() => {
    if (determinate) api.current?.pump();
  }, [determinate, base]);

  const bindRoot = React.useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) return;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        setOnScreen(Boolean(entry?.isIntersecting));
      });
      watcher.observe(node);
      return () => watcher.disconnect();
    },
    [setOnScreen],
  );

  const pct = Math.round(p * 100);
  const valueText =
    total !== undefined ? `${Math.round(p * whole)} of ${whole}` : `${pct}%`;

  const clear = mat.kind === "glass";
  const beadStyle: React.CSSProperties = {
    fill: clear && L.tier === 0 ? mat.edge : mat.body,
    stroke: L.tier === 2 || (clear && L.tier === 1) ? mat.edge : "none",
    strokeWidth: L.tier === 2 ? 0.6 : 0.5,
  };

  const wires = (over: boolean) =>
    L.xs.map((x, i) => {
      const r = L.rods - 1 - i;
      return (
        <line
          key={`${over ? "o" : "u"}${r}`}
          x1={x}
          x2={x}
          y1={L.beam}
          y2={r2(L.s - L.beam)}
          strokeWidth={L.wire}
          opacity={over ? 0.4 : 1}
          className={cn(
            "stroke-ink-3/70 transition-colors",
            // The units wire is the one a flick moves: it lights on hover.
            r === 0 &&
              !disabled &&
              "group-hover/abacus-count:stroke-cobalt-bright group-focus-visible/abacus-count:stroke-cobalt-bright",
          )}
        />
      );
    });

  const glyph = (
    <svg
      aria-hidden
      width={L.s}
      height={L.s}
      viewBox={`0 0 ${L.s} ${L.s}`}
      className="block overflow-hidden"
    >
      {L.post > 0 ? (
        <path d={framePath(L)} fillRule="evenodd" className="fill-ink-3/55" />
      ) : (
        <g className="fill-ink-3/55">
          <rect x={0} y={0} width={L.s} height={L.beam} />
          <rect x={0} y={r2(L.s - L.beam)} width={L.s} height={L.beam} />
        </g>
      )}
      {wires(false)}
      {L.xs.map((x, i) => {
        const r = L.rods - 1 - i;
        const left = r2(x - L.width / 2);
        return (
          <g key={r}>
            {Array.from({ length: BEADS }, (_, j) => {
              const k = r * BEADS + j;
              const y = restY(L, j);
              return (
                <motion.g
                  key={j}
                  style={{ y: pieces[k] as MotionValue<number> }}
                >
                  <rect
                    x={left}
                    y={y}
                    width={L.width}
                    height={L.bead}
                    rx={L.rx}
                    style={beadStyle}
                  />
                  {L.tier === 2 && mat.kind !== "glass" ? (
                    <line
                      x1={r2(left + L.rx * 0.7)}
                      x2={r2(left + L.width - L.rx * 0.7)}
                      y1={r2(y + L.bead / 2)}
                      y2={r2(y + L.bead / 2)}
                      strokeWidth={0.7}
                      strokeLinecap="round"
                      style={{ stroke: mat.ridge }}
                    />
                  ) : null}
                  {L.tier === 2 && mat.kind === "glass" ? (
                    <ellipse
                      cx={r2(left + L.width * 0.3)}
                      cy={r2(y + L.bead * 0.36)}
                      rx={r2(Math.min(1.6, L.width * 0.12))}
                      ry={r2(Math.min(0.7, L.bead * 0.2))}
                      style={{ fill: mat.ridge }}
                    />
                  ) : null}
                  {L.tier === 2 && mat.kind === "stone"
                    ? [0, 1].map((n) => (
                        <circle
                          key={n}
                          cx={r2(
                            left + L.rx + grain(k, n) * (L.width - 2 * L.rx),
                          )}
                          cy={r2(y + L.bead * (0.25 + 0.5 * grain(k, n + 2)))}
                          r={0.45}
                          style={{ fill: mat.edge }}
                        />
                      ))
                    : null}
                </motion.g>
              );
            })}
          </g>
        );
      })}
      {clear ? wires(true) : null}
    </svg>
  );

  return (
    <span
      ref={bindRoot}
      className={cn(
        "relative inline-flex max-w-full items-center gap-2 align-middle text-sm",
        className,
      )}
    >
      {disabled ? (
        <span
          className="inline-flex shrink-0"
          style={{ width: L.s, height: L.s }}
        >
          {glyph}
        </span>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          aria-label="Flick a bead"
          aria-describedby={hintId}
          onClick={(event) => {
            // Pointer flicks arrive through the drag; a click with no pointer
            // behind it — Enter, Space, assistive technology — flicks too.
            if (event.detail === 0) flick(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              flick(0);
            }
          }}
          {...drag}
          className={cn(
            "group/abacus-count relative inline-flex shrink-0 cursor-grab touch-pan-x rounded-2 outline-none select-none [-webkit-touch-callout:none] active:cursor-grabbing",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
          style={{ width: L.s, height: L.s }}
        >
          {glyph}
        </button>
      )}
      <span
        role={determinate ? "progressbar" : "status"}
        aria-labelledby={labelId}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? 100 : undefined}
        aria-valuenow={determinate ? pct : undefined}
        aria-valuetext={determinate ? valueText : undefined}
        className={hideLabel ? "sr-only" : "min-w-0"}
      >
        <span id={labelId} title={label} className="block truncate text-ink-2">
          {label}
        </span>
      </span>
      {disabled ? null : (
        <span id={hintId} className="sr-only">
          Drag up, or press Enter, to slide one bead across.
        </span>
      )}
    </span>
  );
}
