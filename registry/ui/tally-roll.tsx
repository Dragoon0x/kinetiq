"use client";

import * as React from "react";

import { animate, motion, motionValue, type MotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TallyRollFormat = "number" | "currency" | "percent" | "compact";
export type TallyRollTrigger = "mount" | "inView" | "hover" | "manual";
export type TallyRollElement = "span" | "div" | "p" | "strong" | "h2" | "h3";

export type TallyRollProps = {
  /** The figure the wheels roll to; a change mid-roll bends the roll. */
  value: number;
  /** Where the first roll starts. @default 0 */
  from?: number;
  /** How the figure is written. Compact is built by hand (12.5K) so server and browser agree. @default "number" */
  format?: TallyRollFormat;
  /** Fraction digits. @default 0 for number and currency, 1 for percent and compact */
  decimals?: number;
  /** The ISO currency for `currency`. @default "USD" */
  currency?: string;
  /** The formatting locale. @default "en-US" */
  locale?: string;
  /** Fixed text before the figure. */
  prefix?: string;
  /** Fixed text after the figure. */
  suffix?: string;
  /** Until the highest place lands, ms. @default 1600 */
  duration?: number;
  /** The detent spring each wheel is coupled to its drive by: low rocks, high clicks dead. @default 420 */
  stiffness?: number;
  /** Each higher place lands this much after the one below it, ms. @default 90 */
  stagger?: number;
  /** The most extra turns a lower wheel makes on a long roll. @default 2 */
  revolutions?: number;
  /** Draw a window around each wheel. @default true */
  housing?: boolean;
  /** Dim the leading zero wheels, so 01,248 reads as 1,248. @default true */
  dimZeros?: boolean;
  /** When the first roll runs. @default "inView" */
  trigger?: TallyRollTrigger;
  /** Roll only the first time it is seen. @default true */
  once?: boolean;
  /** Wait before the first roll, ms. @default 0 */
  delay?: number;
  /** The tally is a button: pressing it resets the wheels and counts again. @default true */
  replayOnPress?: boolean;
  /** Ticks for rolls the visitor caused. Off unless asked for. @default false */
  sound?: boolean;
  /** The root element. @default "span" */
  as?: TallyRollElement;
  /** A roll began. */
  onRollStart?: () => void;
  /** Every wheel has landed. */
  onComplete?: () => void;
  className?: string;
};

/** A wheel's window, em: the faces sit on this pitch. */
const PITCH = 1.15;
const STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const MAX_PLACES = 16;
/** The detent spring's damping ratio: a mechanical wheel rocks a little. */
const ZETA = 0.62;
const DRUM =
  "linear-gradient(to bottom, transparent, black 16%, black 84%, transparent)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const mod = (v: number, n: number) => ((v % n) + n) % n;
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

const DEFAULT_DECIMALS: Record<TallyRollFormat, number> = {
  number: 0,
  currency: 0,
  percent: 1,
  compact: 1,
};

type Piece =
  | { kind: "wheel"; key: string; place: number; digit: number }
  | { kind: "glyph"; key: string; text: string; left: number | null };

type Layout = {
  pieces: Piece[];
  /** The figure as one integer of all its digits: 12,480.50 is 1248050. */
  n: number;
  places: number;
  /** The lowest place of the integer part: zeros below it are never dim. */
  unit: number;
  text: string;
};

/** The figure laid out as wheels and fixed glyphs, from Intl's own parts. */
function layoutOf(
  value: number,
  format: TallyRollFormat,
  decimals: number | undefined,
  currency: string,
  locale: string,
): Layout {
  const dec = clamp(
    Math.round(decimals ?? DEFAULT_DECIMALS[format] ?? 0),
    0,
    6,
  );
  const base = {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    numberingSystem: "latn",
  };
  const safe = Number.isFinite(value) ? value : 0;
  let parts: { type: string; value: string }[];
  try {
    if (format === "compact") {
      // By hand: compact notation prints differently on the server and in
      // the browser, and a mismatch is a hydration error.
      const units: [number, string][] = [
        [1e9, "B"],
        [1e6, "M"],
        [1e3, "K"],
      ];
      const abs = Math.abs(safe);
      let at = units.findIndex(([size]) => abs >= size);
      const scale = 10 ** dec;
      const scaled = (size: number) => Math.round((abs / size) * scale) / scale;
      let size = at >= 0 ? (units[at]?.[0] ?? 1) : 1;
      let shown = scaled(size);
      if (shown >= 1000 && at !== 0) {
        at = at < 0 ? units.length - 1 : at - 1;
        size = units[at]?.[0] ?? size;
        shown = scaled(size);
      }
      parts = new Intl.NumberFormat(locale, base).formatToParts(
        Math.sign(safe) * shown,
      );
      const label = at >= 0 ? units[at]?.[1] : undefined;
      if (label) parts.push({ type: "compact", value: label });
    } else {
      parts = new Intl.NumberFormat(locale, {
        ...base,
        ...(format === "currency" ? { style: "currency", currency } : {}),
        ...(format === "percent" ? { style: "percent" } : {}),
      }).formatToParts(safe);
    }
  } catch {
    parts = [{ type: "integer", value: String(Math.round(safe)) }];
  }

  const digits = parts
    .filter((p) => p.type === "integer" || p.type === "fraction")
    .map((p) => p.value)
    .join("")
    .replace(/\D/g, "");
  const places = Math.min(MAX_PLACES, digits.length);
  const pieces: Piece[] = [];
  let seen = 0;
  let lead = 0;
  let tail = 0;
  for (const part of parts) {
    if (part.type === "integer" || part.type === "fraction") {
      for (const ch of part.value) {
        if (!/\d/.test(ch)) continue;
        const place = places - 1 - seen;
        seen += 1;
        if (place < 0) continue;
        pieces.push({
          kind: "wheel",
          key: `w${place}`,
          place,
          digit: Number(ch),
        });
      }
      continue;
    }
    const left = seen > 0 && seen < places ? places - seen : null;
    const key =
      left !== null
        ? `g${left}:${part.type}`
        : seen === 0
          ? `pre${(lead += 1)}`
          : `post${(tail += 1)}`;
    pieces.push({ kind: "glyph", key, text: part.value, left });
  }
  return {
    pieces,
    n: digits ? Number(digits.slice(-MAX_PLACES)) : 0,
    places,
    unit: dec,
    text: parts.map((p) => p.value).join(""),
  };
}

/** Which wheels are leading zeros, for faces read off the wheels. */
function leadingOf(faces: number[], places: number, unit: number) {
  const dim = new Array<boolean>(places).fill(false);
  for (let k = places - 1; k > unit; k -= 1) {
    if ((faces[k] ?? 0) !== 0) break;
    dim[k] = true;
  }
  return dim;
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Cell = {
  y: MotionValue<string>;
  blur: MotionValue<string>;
  opacity: MotionValue<number>;
};

type Wheel = {
  pos: number;
  vel: number;
  from: number;
  goal: number;
  t0: number;
  dur: number;
  face: number;
  settled: boolean;
};

type Roll = {
  raf: number;
  last: number;
  audible: boolean;
  /** A changed figure: announce it when it lands. */
  announce: boolean;
  phase: "count" | "reset";
  /** The figure the wheels are heading to. */
  target: number;
};

const yOf = (pos: number) => `${r4(-mod(pos, 10) * PITCH)}em`;

/**
 * A count-up figure built from mechanical digit wheels in little housings.
 * Every wheel runs its own drive — an ease-in-out from where it is to where
 * it must land — and is coupled to it by a detent spring, so it lags a touch
 * as it spins up and rocks into its detent as it lands. Lower places spin
 * extra turns and land first; each higher place lands a stagger later, the
 * highest at `duration`, like carries arriving up a meter. A fast wheel blurs,
 * the drum's faces fade toward its edges, and leading zero wheels stay dim.
 * The figure is laid out from Intl's own parts — group and decimal marks,
 * currency and percent signs are fixed glyphs between the wheels.
 *
 * When the value changes mid-roll, each wheel's drive restarts from where it
 * stands and the spring keeps its velocity, so the roll bends to the new
 * figure without a jump. Pressed (or Enter, Space), the wheels spin forward
 * to zero like a tally's reset knob and count again; with sound, faces tick
 * as they pass and each wheel lands with a tick, only for rolls the visitor
 * caused. The figure is read once and copies as text. Under reduced motion
 * the wheels change at once with a short cross-fade.
 */
export function TallyRoll({
  value,
  from = 0,
  format = "number",
  decimals,
  currency = "USD",
  locale = "en-US",
  prefix,
  suffix,
  duration = 1600,
  stiffness = 420,
  stagger = 90,
  revolutions = 2,
  housing = true,
  dimZeros = true,
  trigger = "inView",
  once = true,
  delay = 0,
  replayOnPress = true,
  sound = false,
  as = "span",
  onRollStart,
  onComplete,
  className,
}: TallyRollProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [rolled, setRolled] = React.useState(false);
  const [said, setSaid] = React.useState("");

  const layout = React.useMemo(
    () => layoutOf(value, format, decimals, currency, locale),
    [value, format, decimals, currency, locale],
  );
  const label = `${prefix ?? ""}${layout.text}${suffix ?? ""}`;
  const fromN = React.useMemo(
    () => layoutOf(from, format, decimals, currency, locale).n,
    [from, format, decimals, currency, locale],
  );

  // The wheels start on `from`, written into the figure's own places, unless
  // nothing will ever roll them up.
  const [cells] = React.useState(() => {
    const startN =
      trigger === "manual"
        ? layout.n
        : layoutOf(from, format, decimals, currency, locale).n;
    const faces = Array.from(
      { length: MAX_PLACES },
      (_, k) => Math.floor(startN / 10 ** k) % 10,
    );
    const dim = leadingOf(faces, layout.places, layout.unit);
    return {
      startN,
      wheels: faces.map((face, k): Cell => ({
        y: motionValue(yOf(face)),
        blur: motionValue("none"),
        opacity: motionValue(dimZeros && dim[k] ? 0.28 : 1),
      })),
      glyphs: Array.from({ length: MAX_PLACES }, (_, k) =>
        motionValue(dimZeros && dim[k] ? 0.28 : 1),
      ),
      fade: motionValue(1),
    };
  });

  const rootRef = React.useRef<HTMLElement | null>(null);
  const wheels = React.useRef<Wheel[]>([]);
  const roll = React.useRef<Roll>({
    raf: 0,
    last: 0,
    audible: false,
    announce: false,
    phase: "count",
    target: cells.startN,
  });
  const fadeRun = React.useRef<ReturnType<typeof animate> | null>(null);
  const pans = React.useRef<number[]>([]);
  const shownN = React.useRef(layout.n);
  const api = React.useRef<{
    start: (opts: {
      now: number;
      audible: boolean;
      reset?: boolean;
      announce?: boolean;
      restart?: boolean;
    }) => void;
    tick: (now: number) => void;
    stop: () => void;
    land: (now: number) => void;
  } | null>(null);
  const latest = React.useRef({ onRollStart, onComplete, label, rolled });

  const w = clamp(stiffness, 40, 2400);
  const spring = { k: w, c: 2 * ZETA * Math.sqrt(w) };

  const ensure = () => {
    if (wheels.current.length) return;
    wheels.current = Array.from({ length: MAX_PLACES }, (_, k): Wheel => {
      const face = Math.floor(cells.startN / 10 ** k) % 10;
      return {
        pos: face,
        vel: 0,
        from: face,
        goal: face,
        t0: 0,
        dur: 0,
        face,
        settled: true,
      };
    });
  };

  const driveAt = (s: Wheel, now: number) => {
    if (s.dur <= 0) return s.goal;
    const t = clamp((now - s.t0) / (s.dur * 1000), 0, 1);
    return s.from + (s.goal - s.from) * easeInOut(t);
  };

  /** Writes every wheel's face, blur and dimming from the simulation. */
  const paint = () => {
    const faces: number[] = [];
    for (let k = 0; k < layout.places; k += 1) {
      const s = wheels.current[k];
      const cell = cells.wheels[k];
      if (!s || !cell) continue;
      faces[k] = mod(Math.round(s.pos), 10);
      cell.y.set(yOf(s.pos));
      const speed = Math.abs(s.vel);
      cell.blur.set(
        motionSafe && speed > 6
          ? `blur(${r2(Math.min(2.5, speed / 14) * 4) / 4}px)`
          : "none",
      );
    }
    const dim = leadingOf(faces, layout.places, layout.unit);
    for (let k = 0; k < layout.places; k += 1) {
      const o = dimZeros && dim[k] ? 0.28 : 1;
      cells.wheels[k]?.opacity.set(o);
      cells.glyphs[k]?.set(o);
    }
  };

  const finish = () => {
    const r = roll.current;
    shownN.current = r.target;
    setRolled(true);
    // A figure that changed is spoken once it has landed, never mid-roll.
    if (r.announce) setSaid(latest.current.label);
    latest.current.onComplete?.();
  };

  /** Sets every wheel heading for the target (or for zero, on a reset). */
  const start = ({
    now,
    audible,
    reset = false,
    announce = false,
    restart = false,
  }: {
    now: number;
    audible: boolean;
    reset?: boolean;
    announce?: boolean;
    /** Back to `from` at once, then count: a roll for each new viewing. */
    restart?: boolean;
  }) => {
    ensure();
    const r = roll.current;
    cancelAnimationFrame(r.raf);
    r.raf = 0;
    if (restart) {
      for (let k = 0; k < MAX_PLACES; k += 1) {
        const s = wheels.current[k];
        if (!s) continue;
        const face = Math.floor(fromN / 10 ** k) % 10;
        s.pos = face;
        s.goal = face;
        s.from = face;
        s.vel = 0;
        s.dur = 0;
        s.face = face;
        s.settled = true;
      }
      r.target = fromN;
      paint();
    }
    const prev = r.target;
    const next = reset ? 0 : layout.n;
    const places = layout.places;
    const total = Math.max(0.2, duration / 1000);
    const step = Math.max(0, stagger / 1000);
    const turns = clamp(Math.round(revolutions), 0, 6);
    const box = rootRef.current?.getBoundingClientRect();
    for (let k = 0; k < MAX_PLACES; k += 1) {
      const s = wheels.current[k];
      if (!s) continue;
      const here = driveAt(s, now);
      let travel: number;
      if (reset) {
        // A reset knob only ever turns the wheels forward, to zero.
        travel = mod(10 - mod(Math.round(s.goal), 10), 10);
      } else {
        travel = Math.floor(next / 10 ** k) - Math.floor(prev / 10 ** k);
        const most = 10 * turns + 9;
        if (Math.abs(travel) > most) {
          travel = Math.sign(travel) * (10 * turns + (Math.abs(travel) % 10));
        }
      }
      s.from = here;
      s.goal = Math.round(s.goal) + travel;
      s.t0 = now;
      s.dur = reset
        ? 0.28
        : Math.max(0.35 * total, total - (places - 1 - k) * step);
      s.settled = travel === 0 && Math.abs(s.pos - s.goal) < 0.004;
      if (box) {
        const x = box.left + box.width * (1 - (k + 0.5) / Math.max(1, places));
        pans.current[k] = panFrom(x, rootRef.current);
      }
    }
    r.target = next;
    r.phase = reset ? "reset" : "count";
    r.audible = audible;
    r.announce = announce;
    latest.current.onRollStart?.();
    if (!motionSafe) {
      // Reduced motion: every wheel at its face at once, under a cross-fade.
      for (const s of wheels.current) {
        s.pos = s.goal;
        s.vel = 0;
        s.from = s.goal;
        s.dur = 0;
        s.settled = true;
        s.face = Math.round(s.goal);
      }
      if (reset) {
        start({ now, audible });
        return;
      }
      fadeRun.current?.stop();
      cells.fade.jump(0.25);
      fadeRun.current = animate(cells.fade, 1, {
        duration: durations.base,
        ease: easings.enter,
      });
      paint();
      if (audible) audio.play("tick", { gain: 0.42 });
      finish();
      return;
    }
    r.last = now;
    r.raf = requestAnimationFrame((t) => api.current?.tick(t));
  };

  const tick = (now: number) => {
    const r = roll.current;
    const dt = Math.min(0.05, Math.max(0, (now - r.last) / 1000));
    r.last = now;
    let moving = false;
    for (let k = 0; k < layout.places; k += 1) {
      const s = wheels.current[k];
      if (!s || s.settled) continue;
      const drive = driveAt(s, now);
      const steps = Math.max(1, Math.ceil(dt / (1 / 480)));
      const h = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        const a = -spring.k * (s.pos - drive) - spring.c * s.vel;
        s.vel += a * h;
        s.pos += s.vel * h;
      }
      const face = Math.round(s.pos);
      if (face !== s.face) {
        s.face = face;
        // Only faces slow enough to see are heard.
        if (r.audible && Math.abs(s.vel) < 28) {
          audio.play("tick", {
            pitch: r2(semitones(4 - k * 2)),
            gain: 0.18,
            pan: pans.current[k] ?? 0,
          });
        }
      }
      const done = now - s.t0 >= s.dur * 1000;
      if (done && Math.abs(s.pos - s.goal) < 0.004 && Math.abs(s.vel) < 0.03) {
        s.pos = s.goal;
        s.vel = 0;
        s.settled = true;
        if (r.audible) {
          audio.play("tick", {
            pitch: r2(semitones(-k * 2)),
            gain: 0.42,
            pan: pans.current[k] ?? 0,
          });
        }
      } else {
        moving = true;
      }
    }
    paint();
    if (moving) {
      r.raf = requestAnimationFrame((t) => api.current?.tick(t));
      return;
    }
    r.raf = 0;
    if (r.phase === "reset") {
      start({ now, audible: r.audible });
      return;
    }
    finish();
  };

  const stop = () => {
    cancelAnimationFrame(roll.current.raf);
    roll.current.raf = 0;
    fadeRun.current?.stop();
  };

  /** Off screen or hidden: every wheel lands where it is headed, at once. */
  const land = (now: number) => {
    const r = roll.current;
    if (!r.raf) return;
    cancelAnimationFrame(r.raf);
    r.raf = 0;
    for (const s of wheels.current) {
      s.pos = s.goal;
      s.vel = 0;
      s.settled = true;
    }
    if (r.phase === "reset") start({ now, audible: false });
    else tick(now);
  };

  React.useLayoutEffect(() => {
    api.current = { start, tick, stop, land };
    latest.current = { onRollStart, onComplete, label, rolled };
  });

  React.useEffect(() => () => api.current?.stop(), []);

  const armed =
    trigger === "mount" ||
    (trigger === "inView" && onScreen) ||
    (trigger === "hover" && hovered);
  const due = armed && !hidden && !(once && rolled);

  React.useEffect(() => {
    if (!due) return;
    const timer = window.setTimeout(
      () =>
        api.current?.start({
          now: performance.now(),
          audible: false,
          // Seen again (once off): the meter runs again from the start.
          restart: latest.current.rolled,
        }),
      Math.max(0, delay),
    );
    // Started once per arming; a landed roll does not re-arm itself.
    return () => window.clearTimeout(timer);
  }, [due, delay]);

  // A new figure after the first roll re-targets the wheels where they are.
  // It is heard only when it follows the visitor's own action.
  React.useEffect(() => {
    if (shownN.current === layout.n && roll.current.target === layout.n) return;
    if (!rolled && trigger !== "manual") return;
    const active =
      typeof navigator !== "undefined" &&
      Boolean(
        (navigator as Navigator & { userActivation?: { isActive: boolean } })
          .userActivation?.isActive,
      );
    api.current?.start({
      now: performance.now(),
      audible: active,
      announce: true,
    });
  }, [layout.n, rolled, trigger]);

  // Off screen or hidden: the wheels land where they are headed at once.
  React.useEffect(() => {
    if (onScreen && !hidden) return;
    api.current?.land(performance.now());
  }, [onScreen, hidden]);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const figure = (
    <motion.span
      aria-hidden
      className="inline-flex items-baseline whitespace-nowrap tabular-nums"
      style={{ opacity: cells.fade }}
    >
      {prefix ? <span>{prefix}</span> : null}
      {layout.pieces.map((piece) => {
        if (piece.kind === "glyph") {
          return (
            <motion.span
              key={piece.key}
              className="whitespace-pre"
              style={{
                opacity:
                  piece.left !== null ? cells.glyphs[piece.left] : undefined,
              }}
            >
              {piece.text}
            </motion.span>
          );
        }
        const cell = cells.wheels[piece.place];
        if (!cell) return null;
        return (
          <span
            key={piece.key}
            className={cn(
              "inline-block align-baseline",
              housing &&
                "mx-[0.02em] rounded-[0.14em] bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] px-[0.07em] shadow-[inset_0_0.05em_0.1em_color-mix(in_oklab,black_16%,transparent),inset_0_-0.03em_0_color-mix(in_oklab,white_10%,transparent)]",
            )}
          >
            <span
              className="relative block overflow-clip"
              style={{ height: `${PITCH}em`, maskImage: DRUM }}
            >
              <span
                className="block text-transparent"
                style={{ lineHeight: `${PITCH}em` }}
              >
                {piece.digit}
              </span>
              <motion.span
                className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center select-none"
                style={{ y: cell.y, filter: cell.blur, opacity: cell.opacity }}
              >
                {STRIP.map((d, i) => (
                  <span
                    key={i}
                    className="block"
                    style={{ height: `${PITCH}em`, lineHeight: `${PITCH}em` }}
                  >
                    {d}
                  </span>
                ))}
              </motion.span>
            </span>
          </span>
        );
      })}
      {suffix ? <span>{suffix}</span> : null}
    </motion.span>
  );

  return React.createElement(
    as,
    {
      ref: bindRoot,
      className: cn("inline-block", className),
      style: { lineHeight: `${PITCH}em` },
      onPointerEnter: (event: React.PointerEvent) => {
        if (event.pointerType === "mouse") setHovered(true);
      },
      onPointerLeave: () => setHovered(false),
    },
    replayOnPress ? (
      <button
        key="figure"
        type="button"
        aria-describedby={hintId}
        onClick={(event) =>
          api.current?.start({
            now: event.timeStamp,
            audible: true,
            reset: true,
          })
        }
        className="cursor-pointer touch-manipulation rounded-2 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid"
      >
        <span className="sr-only select-none">{label}</span>
        {figure}
      </button>
    ) : (
      <span key="figure">
        <span className="sr-only select-none">{label}</span>
        {figure}
      </span>
    ),
    replayOnPress ? (
      // Hidden, not visually hidden: still read as the description, never
      // as part of the text around it.
      <span key="hint" id={hintId} hidden>
        Press to count again
      </span>
    ) : null,
    <span key="said" role="status" className="sr-only">
      {said}
    </span>,
  );
}
