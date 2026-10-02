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
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RefreshWindState = "idle" | "pending" | "success" | "error";

export type RefreshWindStamp = "relative" | "clock" | "off";

export type RefreshWindSize = "sm" | "md" | "lg";

export type RefreshWindProps = {
  /** Runs the refresh. Return a promise and the arrow keeps turning until it settles; the signal aborts on Escape. */
  onRefresh?: (signal: AbortSignal) => void | Promise<unknown>;
  /** Controlled action state. Every move goes through `onStateChange` and waits for this. */
  state?: RefreshWindState;
  /** Each action state, from the press, the answer or the timer that caused it. */
  onStateChange?: (state: RefreshWindState) => void;
  /** Controlled time of the last successful refresh. */
  updatedAt?: Date | number | null;
  /** The last refresh when uncontrolled. @default null */
  defaultUpdatedAt?: Date | number | null;
  /** The moment of each successful refresh: the `now` prop's value, or the clock when none is given. */
  onUpdatedAtChange?: (updatedAt: Date) => void;
  /** The time the stamp is read against. Pass it for a relative stamp that renders on the server. @default a clock started on mount */
  now?: Date | number;
  /** Fires when a wind is let go, with the turns of spring it stored. */
  onWind?: (turns: number) => void;
  /** How quickly the released spin slows, 0 to 1: 0 coasts for seconds, 1 stops within a turn or two. @default 0.5 */
  friction?: number;
  /** Turns of spring the button holds: how far a full wind goes back, how tight the coil gets, how long the spin runs. @default 2 */
  wind?: number;
  /** The stamp beside the button: "Updated 2 min ago", "Updated 09:40", or none (icon only). @default "relative" */
  stamp?: RefreshWindStamp;
  /** Writes the stamp from the last refresh and the current time. @default "Updated 2 min ago", or a UTC clock */
  formatStamp?: (updatedAt: Date, now: Date) => string;
  /** The button's accessible name. @default "Refresh" */
  label?: string;
  /** The name and the stamp while refreshing. @default "Refreshing" */
  pendingLabel?: string;
  /** The stamp after a failed refresh; a press retries. @default "Couldn't refresh" */
  errorLabel?: string;
  /** The stamp before the first refresh. @default "Not updated yet" */
  emptyLabel?: string;
  /** The coil and the tension notches. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How long the success flash holds before the button rests, in ms. @default 1400 */
  successHold?: number;
  /** How long a failure holds before the button rests, in ms. @default 2600 */
  errorHold?: number;
  /** 32, 40 or 48 px across. @default "md" */
  size?: RefreshWindSize;
  /** Play the tension ticks and the spin's whir. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  d: number;
  /** The coil's outer radius. */
  r: number;
  stroke: number;
  /** The notch ring's outer radius and each notch's length. */
  ring: number;
  notch: number;
  text: string;
  gap: string;
};

const GEOMETRY: Record<RefreshWindSize, Geometry> = {
  sm: {
    d: 32,
    r: 7,
    stroke: 1.6,
    ring: 13.4,
    notch: 2,
    text: "text-xs",
    gap: "gap-2",
  },
  md: {
    d: 40,
    r: 8.8,
    stroke: 1.8,
    ring: 17,
    notch: 2.5,
    text: "text-[13px]",
    gap: "gap-2.5",
  },
  lg: {
    d: 48,
    r: 10.6,
    stroke: 2,
    ring: 20.6,
    notch: 3,
    text: "text-sm",
    gap: "gap-3",
  },
};

/** Where the arrowhead sits at rest, in screen degrees: upper right. */
const HEAD = -60;
const NOTCHES = 24;
/** Spring rate, 1/s²: a wound coil unwinds to zero in about 0.22 s. */
const K = 52;
/** Quadratic air drag, per degree: keeps a full wind near ten turns a second. */
const DRAG = 0.0012;
/** Degrees a second while the action outlasts the spring's energy. */
const CRUISE = 330;
/** Below this speed the spin aims for an upright landing. */
const LAND = 900;
/** One plain press: one turn, decaying over this time constant. */
const CLICK_TAU = 0.32;
const HOLD_DELAY = 260;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rad = (deg: number) => (deg * Math.PI) / 180;
const pad2 = (n: number) => String(n).padStart(2, "0");

const toMs = (v: Date | number | null | undefined): number | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.getTime() : v;

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { then?: unknown }).then === "function";

/** "just now", "2 min ago", "3 h ago": coarse on purpose, so it rarely changes. */
function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return "just now";
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Built from UTC parts, so the server and the browser print the same time. */
const utcClock = (d: Date) =>
  `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;

/*
 * One shared clock for every relative stamp on the page that was not handed
 * a `now`: a single 30 s interval, silent while the page is hidden. The
 * server (and the hydrating render) read null, so the markup matches.
 */
let clockNow = 0;
let clockTimer = 0;
const clockListeners = new Set<() => void>();
const clockTick = () => {
  if (document.hidden) return;
  clockNow = Math.floor(Date.now() / 1000) * 1000;
  for (const listener of clockListeners) listener();
};
const subscribeClock = (listener: () => void) => {
  clockListeners.add(listener);
  if (clockListeners.size === 1) {
    clockNow = Math.floor(Date.now() / 1000) * 1000;
    clockTimer = window.setInterval(clockTick, 30_000);
    document.addEventListener("visibilitychange", clockTick);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      window.clearInterval(clockTimer);
      document.removeEventListener("visibilitychange", clockTick);
    }
  };
};
const noSubscribe = () => () => {};
const readClock = () => (clockNow > 0 ? clockNow : null);
const readNoClock = () => null;

/**
 * The glyph is one stroke: an arc that, as the spring is wound, becomes a
 * spiral — its sweep grows from 300° to 720° and its tail draws in to a third
 * of the radius — turned by `angle` about the centre. Rebuilt per frame from
 * points, rounded, so no transform origin is involved.
 */
function coilPath(c: number, r: number, t: number, angle: number): string {
  const sweep = 300 + 420 * t;
  const inner = r * (1 - 0.64 * t);
  const n = Math.max(10, Math.ceil(sweep / 10));
  const pts: string[] = [];
  for (let i = 0; i <= n; i += 1) {
    const f = i / n;
    const a = rad(HEAD + angle - sweep * f);
    const rr = r + (inner - r) * Math.pow(f, 1.15);
    pts.push(`${r2(c + rr * Math.cos(a))} ${r2(c + rr * Math.sin(a))}`);
  }
  return `M ${pts.join(" L ")}`;
}

/** The arrowhead: a chevron on the arc's head, pointing clockwise. */
function headPath(c: number, r: number, angle: number): string {
  const a = rad(HEAD + angle);
  const px = c + r * Math.cos(a);
  const py = c + r * Math.sin(a);
  const tx = -Math.sin(a);
  const ty = Math.cos(a);
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  const h = r * 0.46;
  const tipX = px + tx * h * 0.42;
  const tipY = py + ty * h * 0.42;
  const f = (x: number, y: number) => `${r2(x)} ${r2(y)}`;
  return `M ${f(tipX - tx * h + nx * h * 0.82, tipY - ty * h + ny * h * 0.82)} L ${f(tipX, tipY)} L ${f(tipX - tx * h - nx * h * 0.82, tipY - ty * h - ny * h * 0.82)}`;
}

/** A smear behind the head that lengthens with speed. */
function trailPath(c: number, r: number, angle: number, k: number): string {
  if (k < 0.04) return "";
  const len = 170 * k;
  const n = Math.max(4, Math.ceil(len / 12));
  const pts: string[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = rad(HEAD + angle - (len * i) / n);
    pts.push(`${r2(c + r * Math.cos(a))} ${r2(c + r * Math.sin(a))}`);
  }
  return `M ${pts.join(" L ")}`;
}

/** The notches, from the top round counter-clockwise: the way it winds. */
function notchSegments(c: number, ring: number, len: number): string[] {
  return Array.from({ length: NOTCHES }, (_, k) => {
    const a = rad(-90 - k * (360 / NOTCHES));
    const x1 = r2(c + (ring - len) * Math.cos(a));
    const y1 = r2(c + (ring - len) * Math.sin(a));
    const x2 = r2(c + ring * Math.cos(a));
    const y2 = r2(c + ring * Math.sin(a));
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  });
}

type Spin = {
  mode: "rest" | "free" | "land";
  /** Degrees a second, clockwise positive. */
  omega: number;
  /** The upright angle the arrow last came to rest at; a wind counts back from it. */
  rest: number;
  /** The least a landing may be: one full turn past where the press began. */
  floor: number;
  target: number;
  /** The landing's time constant, chosen so the decay ends exactly upright. */
  tau: number;
  raf: number;
  last: number;
};

type Winding = {
  source: "drag" | "hold" | "key";
  /** Degrees wound, before any rubber band. */
  wound: number;
  /** Pointer angle at the last move, screen degrees. */
  pointer: number;
  cx: number;
  cy: number;
  notch: number;
};

type Api = {
  frame: (time: number) => void;
  holdFrame: (time: number) => void;
  release: () => void;
  succeed: () => void;
  requestState: (next: RefreshWindState) => void;
  transition: (was: RefreshWindState, next: RefreshWindState) => void;
};

/**
 * A refresh button you can wind. Drag around it — or press and hold — and the
 * arrow turns back with your finger while its stroke coils into a tighter and
 * tighter spiral, a ring of notches lighting (and ticking) as tension builds.
 * Let go and the spring whips the arrow forward from rest, then it coasts on
 * the stored energy, slowed by `friction` and a little air drag, while
 * `onRefresh` runs. If the action is still running when the energy is spent
 * the arrow settles to a steady cruise rather than stopping; once it has
 * answered, the spin picks the nearest upright landing and decays exactly
 * onto it. A plain press does one turn. On success the "Updated 2 min ago"
 * stamp rolls to "just now".
 *
 * The angle is integrated per frame into motion values — no React state per
 * frame — and the glyph is rebuilt from points each frame, rounded. It is a
 * native button: Enter and Space refresh, Shift+Enter winds a full turn (again
 * for another, up to `wind`) and lets go, Escape cancels a refresh. Under
 * reduced motion nothing spins: the coil and the notches still show the
 * tension, the arrow stays upright, and the stamp swaps by cross-fade.
 */
export function RefreshWind({
  onRefresh,
  state,
  onStateChange,
  updatedAt,
  defaultUpdatedAt = null,
  onUpdatedAtChange,
  now,
  onWind,
  friction = 0.5,
  wind = 2,
  stamp = "relative",
  formatStamp,
  label = "Refresh",
  pendingLabel = "Refreshing",
  errorLabel = "Couldn't refresh",
  emptyLabel = "Not updated yet",
  accent = "var(--accent-bright)",
  successHold = 1400,
  errorHold = 2600,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: RefreshWindProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const descId = `refresh-${uid}-desc`;
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const box = g.d - 2;
  const c = box / 2;
  const capDeg = Math.min(6, Math.max(0.5, wind)) * 360;
  const tau = lerp(1.6, 0.25, clamp01(friction));

  const [ownState, setOwnState] = React.useState<RefreshWindState>("idle");
  const shownState = state ?? ownState;
  const [ownAt, setOwnAt] = React.useState<number | null>(() =>
    toMs(defaultUpdatedAt),
  );
  const at = updatedAt !== undefined ? toMs(updatedAt) : ownAt;
  const needClock = now === undefined && stamp !== "clock" && !formatStamp;
  const liveClock = React.useSyncExternalStore(
    needClock ? subscribeClock : noSubscribe,
    needClock ? readClock : readNoClock,
    readNoClock,
  );
  const clock = toMs(now) ?? liveClock;

  const stampOf = (when: number | null): string => {
    if (when === null) return emptyLabel;
    if (formatStamp)
      return formatStamp(new Date(when), new Date(clock ?? when));
    if (stamp === "clock") return `Updated ${utcClock(new Date(when))}`;
    return clock === null ? "Updated" : `Updated ${ago(clock - when)}`;
  };
  const stampText = stampOf(at);

  // One sentence per change, frozen from the state it changed to.
  const [seen, setSeen] = React.useState(shownState);
  const [said, setSaid] = React.useState("");
  if (seen !== shownState) {
    setSeen(shownState);
    setSaid(
      shownState === "pending"
        ? `${pendingLabel}.`
        : shownState === "success"
          ? `${stampText}.`
          : shownState === "error"
            ? `${errorLabel}. Press to try again.`
            : seen === "pending"
              ? "Refresh cancelled."
              : "",
    );
  }

  /** The arrow's angle, clockwise degrees; rest positions are whole turns. */
  const angle = useMotionValue(0);
  const tension = useMotionValue(0);
  const speed = useMotionValue(0);
  const lean = useMotionValue(0);
  const ringOn = useMotionValue(0);
  const flash = useMotionValue(0);
  const squash = useMotionValue(1);
  const holdClock = useMotionValue(0);
  const keyWound = useMotionValue(0);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const api = React.useRef<Api | null>(null);
  const spin = React.useRef<Spin>({
    mode: "rest",
    omega: 0,
    rest: 0,
    floor: 0,
    target: 0,
    tau: CLICK_TAU,
    raf: 0,
    last: 0,
  });
  const winding = React.useRef<Winding | null>(null);
  const holdTimer = React.useRef(0);
  const detach = React.useRef<(() => void) | null>(null);
  const holdRaf = React.useRef({ raf: 0, last: 0, elapsed: 0 });
  const keyTarget = React.useRef(0);
  const whir = React.useRef<{ loop: LoopHandle; at: number } | null>(null);
  const pendingRef = React.useRef(shownState === "pending");
  const prevState = React.useRef(shownState);
  const controller = React.useRef<AbortController | null>(null);
  const epoch = React.useRef(0);
  const hovered = React.useRef(false);
  const focused = React.useRef(false);
  const cfg = React.useRef({ tau, capDeg, motionSafe });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const requestState = (next: RefreshWindState) => {
    if (state === undefined) setOwnState(next);
    onStateChange?.(next);
  };

  const stopWhir = () => {
    whir.current?.loop.stop();
    whir.current = null;
  };

  /** The notch ring shows while it can be wound, is being wound, or works. */
  const showRing = () => {
    const on =
      winding.current !== null ||
      (!disabled && (hovered.current || focused.current));
    run(
      "ringOn",
      animate(ringOn, on ? 1 : 0, {
        duration: on ? durations.fast : durations.base,
        ease: on ? easings.enter : easings.exit,
      }),
    );
  };

  const setLean = (to: number) => {
    if (!motionSafe) {
      lean.set(0);
      return;
    }
    run("lean", animate(lean, to, to === 0 ? springs.flick : springs.snap));
  };

  // ---- the spin ------------------------------------------------------------

  const loop = () => {
    const s = spin.current;
    if (s.raf) return;
    s.last = 0;
    s.raf = window.requestAnimationFrame((t) => api.current?.frame(t));
  };

  /** Chooses the upright the coast lands on and the decay that ends there. */
  const aim = (s: Spin, a: number, w: number) => {
    const t = cfg.current.tau;
    // The distance an exponential-plus-drag coast covers from speed w.
    const coast = w > 1 ? Math.log(1 + DRAG * t * w) / DRAG : 0;
    let target = Math.round((a + coast) / 360) * 360;
    const least = Math.max(s.floor, a + 20);
    if (target < least) target = Math.ceil(least / 360) * 360;
    s.target = target;
    s.tau = Math.min(0.9, Math.max(0.15, w > 1 ? (target - a) / w : 0.5));
    s.mode = "land";
  };

  const frame = (time: number) => {
    const s = spin.current;
    s.raf = 0;
    const dt = s.last
      ? Math.min(0.034, Math.max(0, (time - s.last) / 1000))
      : 1 / 60;
    s.last = time;
    const pending = pendingRef.current;
    let a = angle.get();
    let w = s.omega;
    if (s.mode === "land" && pending) s.mode = "free";
    if (s.mode === "free") {
      // Behind its rest angle the spring still pushes; past it, the arrow
      // only coasts, pulled toward cruising speed while the action runs.
      const back = s.rest - a;
      const push = back > 0 ? K * back : 0;
      const goal = pending ? CRUISE : 0;
      w += (push - (w - goal) / cfg.current.tau - DRAG * w * Math.abs(w)) * dt;
      a += w * dt;
      if (!pending && a >= s.rest && w < LAND) aim(s, a, w);
    } else if (s.mode === "land") {
      const left = (s.target - a) * Math.exp(-dt / s.tau);
      a = s.target - left;
      w = left / s.tau;
      if (left < 0.4) {
        // Upright: fold the whole turns away so the number never grows.
        const turns = Math.floor(s.target / 360) * 360;
        a = s.target - turns;
        s.rest = a;
        s.target = a;
        w = 0;
        s.mode = "rest";
      }
    }
    s.omega = w;
    angle.set(r2(a));
    tension.set(r2(clamp01((s.rest - a) / cfg.current.capDeg)));
    speed.set(r2(clamp01((Math.abs(w) - 500) / 3500)));

    const sw = whir.current;
    if (sw) {
      // The whir is the spring's own energy being spent: it fades as the
      // spin falls to cruising speed and never runs on its own.
      const energy = Math.max(0, Math.abs(w) - CRUISE * 1.3);
      if (s.mode === "rest" || (energy < 20 && a >= s.rest)) {
        stopWhir();
      } else if (time - sw.at > 45) {
        sw.at = time;
        sw.loop.set({
          pitch: r2(0.55 + Math.abs(w) / 2400),
          gain: r2(Math.min(0.7, energy / 1600)),
        });
      }
    }
    if (s.mode !== "rest") {
      s.raf = window.requestAnimationFrame((t) => api.current?.frame(t));
    } else {
      speed.set(0);
      tension.set(0);
    }
  };

  const startWhir = (w: number) => {
    stopWhir();
    if (!sound || !motionSafe) return;
    const energy = Math.max(0, w - CRUISE * 1.3);
    whir.current = {
      loop: audio.start("whir", {
        pitch: r2(0.55 + w / 2400),
        gain: r2(Math.min(0.7, Math.max(0.12, energy / 1600))),
        pan: pan(),
      }),
      at: 0,
    };
  };

  /** One turn, from wherever it stands. */
  const spinOnce = () => {
    const s = spin.current;
    if (!motionSafe) return;
    halt("angle");
    if (s.mode === "rest") {
      s.floor = s.rest + 360;
      s.target = s.rest + 360;
      s.tau = CLICK_TAU;
      s.omega = 360 / CLICK_TAU;
      s.mode = "land";
    } else {
      s.floor = Math.max(s.floor, s.rest + 360);
    }
    startWhir(Math.max(Math.abs(s.omega), 360 / CLICK_TAU));
    loop();
  };

  // ---- the action ----------------------------------------------------------

  const succeed = () => {
    const when = toMs(now) ?? Date.now();
    if (updatedAt === undefined) setOwnAt(when);
    onUpdatedAtChange?.(new Date(when));
    requestState("success");
  };

  /** Starts the refresh. False when one is already running. */
  const fire = (): boolean => {
    if (disabled || pendingRef.current || shownState === "pending") {
      return false;
    }
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    epoch.current += 1;
    const token = epoch.current;
    let result: unknown;
    try {
      result = onRefresh?.(ctrl.signal);
    } catch {
      requestState("error");
      return true;
    }
    if (!isThenable(result)) {
      succeed();
      return true;
    }
    requestState("pending");
    result.then(
      () => {
        if (epoch.current === token) api.current?.succeed();
      },
      () => {
        if (epoch.current === token) api.current?.requestState("error");
      },
    );
    return true;
  };

  const cancel = () => {
    epoch.current += 1;
    controller.current?.abort();
    controller.current = null;
    requestState("idle");
  };

  const plainRefresh = () => {
    // A press while a wind is in hand belongs to the wind, not a new turn.
    if (winding.current || !fire()) return;
    setLean(0);
    audio.play("tick", { pitch: 1, gain: 0.4, pan: pan() });
    spinOnce();
  };

  // ---- winding -------------------------------------------------------------

  /** Shows a wind of `w` degrees: the arrow back, the coil tight, the notches. */
  const setWound = (w: number) => {
    const wd = winding.current;
    if (!wd) return;
    const cap = cfg.current.capDeg;
    wd.wound = w;
    // Never a hard stop: past zero or past full, the spring resists.
    const shown =
      w < 0
        ? -rubberband(-w, 90)
        : w > cap
          ? cap + rubberband(w - cap, 140)
          : w;
    const s = spin.current;
    if (cfg.current.motionSafe) angle.set(r2(s.rest - shown));
    const t = clamp01(shown / cap);
    tension.set(r2(t));
    const notch = Math.floor(t * NOTCHES + 1e-6);
    if (notch > wd.notch) {
      audio.play("tick", {
        pitch: r2(0.8 + 0.9 * t),
        gain: r2(0.28 + 0.2 * t),
        pan: pan(),
      });
    }
    wd.notch = notch;
  };

  const beginWind = (source: Winding["source"]) => {
    const s = spin.current;
    if (s.raf) {
      window.cancelAnimationFrame(s.raf);
      s.raf = 0;
    }
    halt("angle");
    stopWhir();
    s.mode = "rest";
    s.omega = 0;
    // A spinning arrow is caught where it is, and the hover's pull-back is
    // folded into the wind, so grabbing never makes the arrow jump.
    const a = angle.get();
    const l = lean.get();
    halt("lean");
    lean.set(0);
    s.rest = a;
    angle.set(r2(a + l));
    const rect = buttonRef.current?.getBoundingClientRect();
    winding.current = {
      source,
      wound: Math.max(0, -l),
      pointer: 0,
      cx: rect ? rect.left + rect.width / 2 : 0,
      cy: rect ? rect.top + rect.height / 2 : 0,
      notch: 0,
    };
    showRing();
  };

  const stopHold = () => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = 0;
    const h = holdRaf.current;
    if (h.raf) window.cancelAnimationFrame(h.raf);
    h.raf = 0;
  };

  /** A wind let go without enough in it: the arrow goes back, nothing runs. */
  const unwind = () => {
    stopHold();
    halt("key");
    winding.current = null;
    const s = spin.current;
    // Back to upright, even when it was caught mid-spin.
    s.rest = Math.round(s.rest / 360) * 360;
    if (motionSafe) {
      run("angle", animate(angle, s.rest, springs.snap));
      run("tension", animate(tension, 0, springs.snap));
    } else {
      angle.set(s.rest);
      tension.set(0);
    }
    showRing();
  };

  const release = () => {
    const wd = winding.current;
    stopHold();
    halt("key");
    if (!wd) return;
    if (wd.wound < 10 || !fire()) {
      unwind();
      return;
    }
    winding.current = null;
    onWind?.(r2(Math.min(wd.wound, cfg.current.capDeg) / 360));
    showRing();
    const s = spin.current;
    if (!motionSafe) {
      tension.set(0);
      angle.set(s.rest);
      return;
    }
    // From rest: the spring does the accelerating, so the whip is real.
    s.mode = "free";
    s.omega = 0;
    s.floor = s.rest + 360;
    const stored = Math.min(wd.wound, cfg.current.capDeg);
    startWhir(Math.min(4000, stored * 7));
    loop();
  };

  const holdFrame = (time: number) => {
    const h = holdRaf.current;
    h.raf = 0;
    const wd = winding.current;
    if (!wd || wd.source !== "hold") return;
    const dt = h.last ? Math.min(0.034, (time - h.last) / 1000) : 1 / 60;
    h.last = time;
    h.elapsed += dt;
    // A hand winding a key: slow to start, quicker once it has the grip.
    const rate = Math.min(1.6, 0.9 + 0.6 * h.elapsed) * 360;
    const next = Math.min(cfg.current.capDeg, wd.wound + rate * dt);
    setWound(next);
    if (next < cfg.current.capDeg) {
      h.raf = window.requestAnimationFrame((t) => api.current?.holdFrame(t));
    }
  };

  const armHold = () => {
    stopHold();
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = 0;
      if (winding.current || pendingRef.current) return;
      beginWind("hold");
      const h = holdRaf.current;
      h.last = 0;
      h.elapsed = 0;
      h.raf = window.requestAnimationFrame((t) => api.current?.holdFrame(t));
    }, HOLD_DELAY);
  };

  /** Shift+Enter: one more full turn of spring, then let go. */
  const keyWind = () => {
    if (disabled || pendingRef.current) return;
    const cap = cfg.current.capDeg;
    if (!winding.current) {
      beginWind("key");
      keyTarget.current = 0;
    } else if (winding.current.source !== "key") {
      return;
    }
    const wd = winding.current;
    if (!wd) return;
    keyTarget.current = Math.min(cap, keyTarget.current + 360);
    keyWound.jump(wd.wound);
    const left = keyTarget.current - wd.wound;
    run(
      "key",
      animate(keyWound, keyTarget.current, {
        duration: Math.max(0.12, (left / 360) * 0.55),
        ease: easings.move,
        onUpdate: (v) => setWound(v),
        onComplete: () => api.current?.release(),
      }),
    );
  };

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || shownState === "pending",
    onStart: ({ point }) => {
      stopHold();
      const was = winding.current;
      if (!was || was.source !== "hold") beginWind("drag");
      const wd = winding.current;
      if (!wd) return;
      wd.source = "drag";
      wd.pointer =
        (Math.atan2(point.y - wd.cy, point.x - wd.cx) * 180) / Math.PI;
    },
    onMove: ({ point }) => {
      const wd = winding.current;
      if (!wd) return;
      const dx = point.x - wd.cx;
      const dy = point.y - wd.cy;
      // Too near the centre the angle means nothing.
      if (Math.hypot(dx, dy) < 8) return;
      const p = (Math.atan2(dy, dx) * 180) / Math.PI;
      let delta = p - wd.pointer;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      wd.pointer = p;
      // Counter-clockwise winds: the arrow is turned back against its spring.
      setWound(wd.wound - delta);
    },
    onEnd: () => {
      pressFace(false);
      release();
    },
    onCancel: () => {
      pressFace(false);
      unwind();
    },
    onTap: () => {
      pressFace(false);
      if (winding.current) release();
      else {
        stopHold();
        plainRefresh();
      }
    },
  });

  const onPointerCancel = (event: React.PointerEvent | PointerEvent) => {
    detach.current?.();
    detach.current = null;
    drag.onPointerCancel(event as React.PointerEvent);
    pressFace(false);
    if (winding.current?.source === "hold") unwind();
    stopHold();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    drag.onPointerDown(event);
    if (disabled || pendingRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pressFace(true);
    armHold();
    // Winding goes round the button, so the hand leaves it at once: a quick
    // first move can land outside the 40px circle before the drag has passed
    // its threshold and captured the pointer. Until it does, moves and the
    // release that happen outside are handed to the same drag from here.
    detach.current?.();
    const id = event.pointerId;
    const outside = (e: PointerEvent) =>
      !(e.target instanceof Node && buttonRef.current?.contains(e.target));
    const move = (e: PointerEvent) => {
      if (e.pointerId === id && outside(e)) {
        drag.onPointerMove(e as unknown as React.PointerEvent);
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      detach.current?.();
      detach.current = null;
      if (outside(e)) drag.onPointerUp(e as unknown as React.PointerEvent);
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === id && outside(e)) onPointerCancel(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    detach.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  };

  function pressFace(down: boolean) {
    if (!motionSafe) return;
    run("squash", animate(squash, down ? 0.97 : 1, springs.flick));
  }

  // ---- state following -----------------------------------------------------

  const transition = (was: RefreshWindState, next: RefreshWindState) => {
    const s = spin.current;
    if (
      next === "pending" &&
      motionSafe &&
      s.mode === "rest" &&
      !winding.current
    ) {
      // A host that starts the work on its own still gets the spinner.
      s.mode = "free";
      s.floor = s.rest + 360;
      loop();
    }
    if (next === "success" || next === "error") {
      const hold = (next === "success" ? successHold : errorHold) / 1000;
      flash.jump(1);
      run(
        "flash",
        animate(flash, 0, {
          duration: Math.max(0.2, hold * 0.75),
          ease: easings.enter,
        }),
      );
    } else if (was === "success" || was === "error") {
      halt("flash");
      flash.set(0);
    }
  };

  React.useEffect(() => {
    cfg.current = { tau, capDeg, motionSafe };
    api.current = {
      frame,
      holdFrame,
      release,
      succeed,
      requestState,
      transition,
    };
  });

  React.useEffect(() => {
    pendingRef.current = shownState === "pending";
    const was = prevState.current;
    if (was === shownState) return;
    prevState.current = shownState;
    api.current?.transition(was, shownState);
  }, [shownState]);

  // An error or a success holds, then rests; both pause on a hidden page.
  const holding = shownState === "success" || shownState === "error";
  const holdMs = shownState === "success" ? successHold : errorHold;
  React.useEffect(() => {
    if (!holding) return;
    holdClock.jump(0);
    const controls = animate(holdClock, 1, {
      duration: Math.max(0, holdMs) / 1000,
      ease: "linear",
      onComplete: () => api.current?.requestState("idle"),
    });
    const onVisibility = () => {
      if (document.hidden) controls.pause();
      else controls.play();
    };
    if (document.hidden) controls.pause();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controls.stop();
    };
  }, [holding, holdMs, holdClock]);

  // Disabled mid-wind: the wind is let go of, not fired.
  React.useEffect(() => {
    if (!disabled) return;
    const wd = winding.current;
    const h = holdRaf.current;
    anims.current.get("key")?.stop();
    window.clearTimeout(holdTimer.current);
    if (h.raf) window.cancelAnimationFrame(h.raf);
    h.raf = 0;
    if (wd) {
      winding.current = null;
      tension.set(0);
      angle.set(spin.current.rest);
    }
  }, [disabled, angle, tension]);

  React.useEffect(() => {
    const running = anims.current;
    const s = spin.current;
    const h = holdRaf.current;
    return () => {
      for (const controls of running.values()) controls.stop();
      running.clear();
      if (s.raf) window.cancelAnimationFrame(s.raf);
      s.raf = 0;
      // A remount (StrictMode) finds the arrow upright, not mid-spin.
      s.mode = "rest";
      s.omega = 0;
      if (h.raf) window.cancelAnimationFrame(h.raf);
      h.raf = 0;
      window.clearTimeout(holdTimer.current);
      detach.current?.();
      detach.current = null;
      winding.current = null;
      whir.current?.loop.stop();
      whir.current = null;
      epoch.current += 1;
      angle.set(s.rest);
      tension.set(0);
    };
  }, [angle, tension]);

  // ---- per-frame drawing ---------------------------------------------------

  const notches = React.useMemo(
    () => notchSegments(c, g.ring, g.notch),
    [c, g.ring, g.notch],
  );
  const shownAngle = useTransform(
    [angle, lean] as MotionValue<number>[],
    ([a = 0, l = 0]: number[]) => a + l,
  );
  const coil = useTransform(
    [shownAngle, tension] as MotionValue<number>[],
    ([a = 0, t = 0]: number[]) => coilPath(c, g.r, t, a),
  );
  const head = useTransform(shownAngle, (a) => headPath(c, g.r, a));
  const trail = useTransform(
    [shownAngle, speed] as MotionValue<number>[],
    ([a = 0, k = 0]: number[]) => trailPath(c, g.r, a, k),
  );
  const trailOpacity = useTransform(speed, (k) => r2(0.12 + 0.2 * k));
  const lit = useTransform(tension, (t) =>
    notches.slice(0, Math.floor(t * NOTCHES + 1e-6)).join(" "),
  );
  const unlit = useTransform(tension, (t) =>
    notches.slice(Math.floor(t * NOTCHES + 1e-6)).join(" "),
  );
  const allNotches = notches.join(" ");
  const busyRing = shownState === "pending" && !motionSafe;

  const face =
    shownState === "pending"
      ? "pending"
      : shownState === "error"
        ? "error"
        : "stamp";
  const shownText =
    face === "pending"
      ? pendingLabel
      : face === "error"
        ? errorLabel
        : stampText;
  // Every phrase the stamp can take, stacked, so the width never moves.
  const reserve = [
    stampText,
    pendingLabel,
    errorLabel,
    stampOf(clock ?? at ?? 0),
    stamp === "relative" && !formatStamp ? "Updated 59 min ago" : "",
  ];
  const name = shownState === "pending" ? pendingLabel : label;
  const description =
    shownState === "error"
      ? `${errorLabel}. Press to try again.`
      : `${shownText}. Drag around or hold to wind; Shift+Enter winds a turn.`;

  return (
    <span
      className={cn(
        "relative inline-flex max-w-full items-center align-middle",
        g.gap,
        className,
      )}
      style={{ "--refresh-wind-accent": accent } as React.CSSProperties}
    >
      <motion.button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={name}
        aria-describedby={descId}
        aria-busy={shownState === "pending" || undefined}
        {...drag}
        onPointerDown={onPointerDown}
        onPointerCancel={onPointerCancel}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap. A click with no
          // pointer behind it — Enter, Space, assistive technology — is a
          // plain refresh, and goes through the same path.
          if (event.detail === 0) plainRefresh();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.shiftKey) {
            // Not a click: a wind. Handled here so the native click never fires.
            event.preventDefault();
            keyWind();
            return;
          }
          if (event.key === "Escape") {
            if (winding.current?.source === "key") {
              event.preventDefault();
              unwind();
            } else if (shownState === "pending") {
              event.preventDefault();
              cancel();
            }
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          hovered.current = true;
          showRing();
          if (!winding.current && spin.current.mode === "rest") setLean(-12);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          hovered.current = false;
          showRing();
          if (!winding.current && spin.current.mode === "rest") setLean(0);
        }}
        onFocus={(event) => {
          focused.current = event.currentTarget.matches(":focus-visible");
          showRing();
        }}
        onBlur={() => {
          focused.current = false;
          if (winding.current?.source === "key") unwind();
          showRing();
        }}
        className={cn(
          "relative shrink-0 touch-none rounded-full border border-hairline-strong bg-card transition-colors outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed opacity-50"
            : shownState === "pending"
              ? "cursor-progress"
              : "cursor-grab hover:bg-surface-2 active:cursor-grabbing",
        )}
        style={{ width: g.d, height: g.d, scale: squash }}
      >
        <svg
          aria-hidden
          width={box}
          height={box}
          viewBox={`0 0 ${box} ${box}`}
          className="pointer-events-none absolute inset-0 block"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {busyRing ? (
            // Reduced motion, working: the whole ring at half strength, still.
            <path
              d={allNotches}
              strokeWidth={1.4}
              opacity={0.5}
              className="stroke-(--refresh-wind-accent)"
            />
          ) : (
            <>
              <motion.path
                d={unlit}
                strokeWidth={1.2}
                className="stroke-ink-3"
                style={{ opacity: ringOn }}
              />
              <motion.path
                d={lit}
                strokeWidth={1.4}
                className="stroke-(--refresh-wind-accent)"
              />
            </>
          )}
          {/* Colours that change are classes: motion keeps the first value
              of a plain style it was handed on an svg element. */}
          <motion.path
            d={allNotches}
            strokeWidth={1.4}
            className={
              shownState === "error" ? "stroke-danger" : "stroke-success"
            }
            style={{ opacity: flash }}
          />
          {motionSafe ? (
            <motion.path
              d={trail}
              strokeWidth={r2(g.stroke * 1.6)}
              className="stroke-(--refresh-wind-accent)"
              style={{ opacity: trailOpacity }}
            />
          ) : null}
          <motion.path
            d={coil}
            strokeWidth={g.stroke}
            className="stroke-(--refresh-wind-accent)"
          />
          <motion.path
            d={head}
            strokeWidth={g.stroke}
            className="stroke-(--refresh-wind-accent)"
          />
        </svg>
      </motion.button>

      {stamp !== "off" ? (
        <span
          aria-hidden
          className={cn(
            "relative grid min-w-0 overflow-clip leading-5 whitespace-nowrap tabular-nums [contain:paint]",
            g.text,
          )}
        >
          {reserve.filter(Boolean).map((text, i) => (
            <span
              key={i}
              className="invisible col-start-1 row-start-1 truncate"
            >
              {text}
            </span>
          ))}
          <AnimatePresence initial={false}>
            <motion.span
              key={`${face}:${shownText}`}
              title={shownText}
              className={cn(
                "col-start-1 row-start-1 truncate",
                face === "error" ? "text-danger" : "text-ink-2",
              )}
              initial={
                motionSafe ? { opacity: 0, y: distances.shift } : { opacity: 0 }
              }
              animate={{
                opacity: 1,
                y: 0,
                transition: motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.base } }
                  : { duration: durations.base },
              }}
              exit={{
                opacity: 0,
                y: motionSafe ? -distances.shift : 0,
                transition: exitFor(durations.base),
              }}
            >
              {shownText}
            </motion.span>
          </AnimatePresence>
        </span>
      ) : null}

      <span id={descId} className="sr-only">
        {description}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </span>
  );
}
