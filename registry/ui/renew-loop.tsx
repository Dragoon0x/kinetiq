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
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RenewLoopPeriod = "month" | "quarter" | "year";
export type RenewLoopSize = "sm" | "md" | "lg";
/** A date as a Date, epoch milliseconds, or an ISO string ("2026-10-15"). Read in UTC. */
export type RenewLoopDate = Date | number | string;

export type RenewLoopProps = {
  /** Controlled state: true while the plan renews by itself. */
  pressed?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultPressed?: boolean;
  /** Fires from the press that changed it, with the new state. */
  onPressedChange?: (pressed: boolean) => void;
  /** The next renewal date, when your billing system already knows it. @default renewedOn plus one period */
  renewsOn?: RenewLoopDate;
  /** The day the current term began: the last renewal, or the purchase. @default "2026-10-15" */
  renewedOn?: RenewLoopDate;
  /** The billing period: how far each renewal carries the plan. @default "month" */
  period?: RenewLoopPeriod;
  /** What the switch controls; the button's accessible name. @default "Auto-renew" */
  label?: string;
  /** The word before the date while on. @default "Renews" */
  renewsLabel?: string;
  /** The word before the date while off. @default "Ends" */
  endsLabel?: string;
  /** How a date is written in the readout and the description. @default "15 Nov", in UTC */
  formatDate?: (date: Date) => string;
  /** How far the arrows chase before their heads lock, in degrees. @default 240 */
  chase?: number;
  /** How long one flap takes to fall, in ms. @default 90 */
  flip?: number;
  /** How quickly the released arrows coast to a stop, 0 (they glide on) to 1 (they stop short). @default 0.5 */
  friction?: number;
  /** Ring only; the label becomes the accessible name and the date its description. @default false */
  compact?: boolean;
  /** @default "md" */
  size?: RenewLoopSize;
  /** The closed ring's colour, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the ratchet, the lock and the flaps. Off unless asked for. @default false */
  sound?: boolean;
  /** Greys the switch out and ignores presses and hover. @default false */
  disabled?: boolean;
  /** Extra classes for the root, which wraps the button. */
  className?: string;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAY = 86_400_000;
const FALLBACK = Date.UTC(2026, 9, 15);
const PERIOD_MONTHS: Record<RenewLoopPeriod, number> = {
  month: 1,
  quarter: 3,
  year: 12,
};
const CADENCE: Record<RenewLoopPeriod, string> = {
  month: "every month",
  quarter: "every three months",
  year: "every year",
};

/** Dates are read in UTC, so the server and every visitor print the same day. */
function timeOf(input: RenewLoopDate | undefined, fallback: number): number {
  if (input === undefined) return fallback;
  const t = (input instanceof Date ? input : new Date(input)).getTime();
  return Number.isFinite(t) ? t : fallback;
}

/** Calendar months later, holding the day where the month allows (31 Jan → 28 Feb). */
function addMonths(time: number, months: number): number {
  const d = new Date(time);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last));
}

const shortDate = (date: Date) =>
  `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ""}`;

/** The ring, in the icon's 24 × 24 frame. */
const C = 12;
const R = 7.25;
/** Each seam's gap while the arrows are apart, in degrees. */
const OPEN = 56;
/** Where the open pair rests before anyone has touched it. */
const OPEN_SPIN = 50;
/** Locked, the heads fold down to small chevrons that keep the loop's direction. */
const LOCKED_HEAD = 0.5;

const SIZES: Record<
  RenewLoopSize,
  { icon: number; pill: string; round: string; cell: string }
> = {
  sm: {
    icon: 18,
    pill: "h-8 gap-1.5 pr-2.5 pl-2 text-xs",
    round: "size-8",
    cell: "h-3.5 w-[7px] text-[9px]",
  },
  md: {
    icon: 22,
    pill: "h-9 gap-2 pr-3 pl-2.5 text-sm",
    round: "size-9",
    cell: "h-4 w-2 text-[11px]",
  },
  lg: {
    icon: 26,
    pill: "h-11 gap-2.5 pr-3.5 pl-3 text-base",
    round: "size-11",
    cell: "h-[18px] w-[9px] text-xs",
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A point on the ring, `deg` clockwise from 12 o'clock. */
const at = (deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [r2(C + R * Math.sin(a)), r2(C - R * Math.cos(a))];
};

function arc(from: number, to: number): string {
  const span = to - from;
  if (span <= 0.5) return "";
  const [x0, y0] = at(from);
  const [x1, y1] = at(Math.min(to, from + 359.5));
  return `M ${x0} ${y0} A ${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/** Two wings swept back from a head travelling clockwise. */
function arrowhead(deg: number, size: number): string {
  if (size < 0.04) return "";
  const a = (deg * Math.PI) / 180;
  const [hx, hy] = at(deg);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const nx = Math.sin(a);
  const ny = -Math.cos(a);
  const back = 2.6 * size;
  const wide = 2.3 * size;
  const w1 = [r2(hx - dx * back + nx * wide), r2(hy - dy * back + ny * wide)];
  const w2 = [r2(hx - dx * back - nx * wide), r2(hy - dy * back - ny * wide)];
  return `M ${w1[0]} ${w1[1]} L ${hx} ${hy} L ${w2[0]} ${w2[1]}`;
}

/**
 * The characters a flap riffles through: digits step through the digits
 * between, the short way round and at most four flaps; anything else turns
 * once.
 */
function riffle(from: string, to: string): string[] {
  if (from === to) return [];
  if (/^\d$/.test(from) && /^\d$/.test(to)) {
    const a = Number(from);
    const b = Number(to);
    const ahead = (b - a + 10) % 10;
    const dir = ahead <= 5 ? 1 : -1;
    const steps = Math.min(dir > 0 ? ahead : 10 - ahead, 4);
    return Array.from({ length: steps }, (_, i) =>
      String((((b - dir * (steps - 1 - i)) % 10) + 10) % 10),
    );
  }
  return [to];
}

type Flap = { from: string; to: string; id: number };

function FlapCell({
  char,
  delay,
  speed,
  motionSafe,
  onFlap,
  tint,
  className,
}: {
  char: string;
  delay: number;
  speed: number;
  motionSafe: boolean;
  onFlap: () => void;
  /** The cell's ink. It changes when the cascade reaches the cell, not before. */
  tint: string;
  className?: string;
}) {
  const [shown, setShown] = React.useState(char);
  const [ink, setInk] = React.useState(tint);
  const inked = React.useRef(tint);
  const [flap, setFlap] = React.useState<Flap | null>(null);
  const current = React.useRef(char);
  const ids = React.useRef(0);
  const heard = React.useRef(onFlap);
  React.useEffect(() => {
    heard.current = onFlap;
  });

  React.useEffect(() => {
    if (inked.current === tint) return;
    const timer = window.setTimeout(
      () => {
        inked.current = tint;
        setInk(tint);
      },
      motionSafe ? delay : 0,
    );
    return () => window.clearTimeout(timer);
  }, [tint, delay, motionSafe]);

  // One cell's riffle, a timer per flap. A change that arrives mid-riffle
  // starts from the character the cell has reached, so nothing jumps.
  React.useEffect(() => {
    if (current.current === char) return;
    const timers: number[] = [];
    if (!motionSafe) {
      current.current = char;
      timers.push(
        window.setTimeout(() => {
          setFlap(null);
          setShown(char);
        }, 0),
      );
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    const steps = riffle(current.current, char);
    let i = 0;
    const next = () => {
      const to = steps[i];
      if (to === undefined) {
        setFlap(null);
        return;
      }
      const from = current.current;
      current.current = to;
      ids.current += 1;
      setFlap({ from, to, id: ids.current });
      setShown(to);
      heard.current();
      i += 1;
      timers.push(window.setTimeout(next, speed));
    };
    timers.push(window.setTimeout(next, delay));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [char, delay, speed, motionSafe]);

  const now = motionSafe ? shown : char;
  const top = flap ? flap.to : now;
  const bottom = flap ? flap.from : now;
  const half = speed / 2000;
  const tile = (c: string) => (c.trim() ? "bg-foreground/[0.07]" : "");

  return (
    <span
      className={cn("relative block shrink-0", ink, className)}
      style={{ perspective: 60 }}
    >
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-1/2 overflow-hidden rounded-t-1",
          tile(top),
        )}
      >
        <span className="flex h-[200%] items-center justify-center">{top}</span>
      </span>
      <span
        className={cn(
          "absolute inset-x-0 bottom-0 h-1/2 overflow-hidden rounded-b-1",
          tile(bottom),
        )}
      >
        <span className="flex h-[200%] -translate-y-1/2 items-center justify-center">
          {bottom}
        </span>
      </span>
      {flap && motionSafe ? (
        <>
          {/* The upper half of the old character falls toward the seam. */}
          <motion.span
            key={`top-${flap.id}`}
            className={cn(
              "absolute inset-x-0 top-0 h-1/2 overflow-hidden rounded-t-1 backface-hidden",
              tile(flap.from),
            )}
            style={{ originY: 1 }}
            initial={{ rotateX: 0 }}
            animate={{ rotateX: -90 }}
            transition={{ duration: half, ease: easings.exit }}
          >
            <span className="flex h-[200%] items-center justify-center">
              {flap.from}
            </span>
          </motion.span>
          {/* Then the lower half of the new one lands. */}
          <motion.span
            key={`bottom-${flap.id}`}
            className={cn(
              "absolute inset-x-0 bottom-0 h-1/2 overflow-hidden rounded-b-1 backface-hidden",
              tile(flap.to),
            )}
            style={{ originY: 0 }}
            initial={{ rotateX: 90 }}
            animate={{ rotateX: 0 }}
            transition={{ duration: half, delay: half, ease: easings.enter }}
          >
            <span className="flex h-[200%] -translate-y-1/2 items-center justify-center">
              {flap.to}
            </span>
          </motion.span>
        </>
      ) : null}
      {top.trim() || bottom.trim() ? (
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-background/40" />
      ) : null}
    </span>
  );
}

type Armed = { to: boolean; at: number };

type Api = {
  transition: (to: boolean, voiced: boolean) => void;
  hover: () => void;
  detent: (spin: number) => void;
  flapped: () => void;
};

/**
 * An auto-renew switch whose icon is the renewal itself. Switched on, the two
 * arc arrows chase each other round the ring until each head catches the
 * other's tail, and they lock into one closed ring on a snap — its single
 * overshoot pushes the heads a hair into the tails — while the arrowheads fold
 * flat and the ring takes the accent colour. Beside the label, a split-flap
 * readout turns over cell by cell from the end date to the renewal date.
 * Switched off, the ring breaks open at the top, the arrows coast apart and
 * slow to rest under friction, and the readout flips back to the day access
 * ends.
 *
 * The ring is drawn each frame from four motion values — the pair's spin, the
 * two seams' gaps and the arrowheads' size — so the chase and the coast are
 * one geometry, not two icons. Dates come only from props and are read in
 * UTC, never from the clock. It is a real toggle button: Space and Enter press
 * it, `aria-pressed` carries the state, the full sentence is its description
 * and a polite status speaks the new one. Under reduced motion the ring swaps
 * shape under a short fade and the readout changes in place.
 */
export function RenewLoop({
  pressed,
  defaultPressed = false,
  onPressedChange,
  renewsOn,
  renewedOn,
  period = "month",
  label = "Auto-renew",
  renewsLabel = "Renews",
  endsLabel = "Ends",
  formatDate,
  chase = 240,
  flip = 90,
  friction = 0.5,
  compact = false,
  size = "md",
  accent,
  sound = false,
  disabled = false,
  className,
}: RenewLoopProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const descriptionId = `${uid}-description`;
  const geometry = SIZES[size] ?? SIZES.md;
  const months = PERIOD_MONTHS[period] ?? 1;
  const travel = Math.max(0, chase);
  const speed = clamp(flip, 20, 400);
  const drag = clamp(friction, 0, 1);

  const [own, setOwn] = React.useState(defaultPressed);
  const isOn = pressed ?? own;

  // The renewal, and the last day of access without it: the day before.
  const startTime = timeOf(renewedOn, FALLBACK);
  const renewTime =
    renewsOn === undefined
      ? addMonths(startTime, months)
      : timeOf(renewsOn, addMonths(startTime, months));
  const endTime = renewTime - DAY;
  const write = formatDate ?? shortDate;
  const renewText = write(new Date(renewTime));
  const endText = write(new Date(endTime));
  const onReadout = `${renewsLabel} ${renewText}`;
  const offReadout = `${endsLabel} ${endText}`;
  const cells = Math.max(onReadout.length, offReadout.length);
  const readout = (isOn ? onReadout : offReadout)
    .padStart(cells, " ")
    .toUpperCase();
  const wordEnd =
    cells -
    (isOn ? onReadout : offReadout).length +
    (isOn ? renewsLabel : endsLabel).length;
  const sentence = isOn
    ? `${renewsLabel} ${renewText}, then ${CADENCE[period] ?? CADENCE.month}.`
    : `${endsLabel} ${endText}. It will not renew.`;

  // Spoken once the state has changed, from the new state, in the render
  // that changed it.
  const [said, setSaid] = React.useState({ on: isOn, text: "" });
  if (said.on !== isOn) setSaid({ on: isOn, text: sentence });

  const spin = useMotionValue(isOn ? 0 : OPEN_SPIN);
  const gapTop = useMotionValue(isOn ? 0 : OPEN);
  const gapBottom = useMotionValue(isOn ? 0 : OPEN);
  const head = useMotionValue(isOn ? LOCKED_HEAD : 1);
  const tone = useMotionValue(isOn ? 1 : 0);
  const fade = useMotionValue(1);
  const squeeze = useMotionValue(1);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const shown = React.useRef(isOn);
  const armed = React.useRef<Armed | null>(null);
  const hovered = React.useRef(false);
  const quiet = React.useRef(false);
  const busyUntil = React.useRef(0);
  /** Where the pair rests in the current state, before any hover creep. */
  const restSpin = React.useRef(isOn ? 0 : OPEN_SPIN);
  /** While a heard transition runs: which detent the spin last passed. */
  const ratchet = React.useRef<{ detent: number; until: number } | null>(null);
  const flapsHeardUntil = React.useRef(0);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };
  const halt = () => {
    for (const c of running.current.values()) c.stop();
    running.current.clear();
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.length = 0;
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.round(ms)));
  };
  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.height / 2, null) : 0;
  };

  /** The pose a pointer resting on the button previews. */
  const hover = () => {
    if (performance.now() < busyUntil.current) return;
    const peeking = hovered.current && !quiet.current && !disabled;
    if (!motionSafe) return;
    if (shown.current) {
      // On: the top seam cracks, a preview of the break.
      run("gapTop", animate(gapTop, peeking ? 6 : 0, springs.snap));
    } else {
      // Off: the arrows creep forward, a preview of the chase.
      run(
        "spin",
        animate(spin, restSpin.current + (peeking ? 12 : 0), springs.snap),
      );
    }
  };

  const transition = (to: boolean, voiced: boolean) => {
    halt();
    const where = pan();
    if (voiced) flapsHeardUntil.current = performance.now() + 1400;
    if (!motionSafe) {
      busyUntil.current = 0;
      ratchet.current = null;
      restSpin.current = to ? 0 : OPEN_SPIN;
      spin.jump(restSpin.current);
      gapTop.jump(to ? 0 : OPEN);
      gapBottom.jump(to ? 0 : OPEN);
      head.jump(to ? LOCKED_HEAD : 1);
      fade.jump(0.2);
      const tween = { duration: durations.base, ease: easings.enter };
      run("fade", animate(fade, 1, tween));
      run("tone", animate(tone, to ? 1 : 0, tween));
      if (voiced) {
        audio.play("snap", { pitch: to ? 1 : 0.8, gain: 0.5, pan: where });
      }
      return;
    }
    fade.jump(1);
    // The ring repeats every turn: start each move from within one, so the
    // numbers never grow however often it is pressed.
    const from = ((spin.get() % 360) + 360) % 360;
    spin.jump(from);
    if (to) {
      // The chase: the pair runs to the next pose with its seams at 12 and 6
      // o'clock, and the gaps close as it arrives — the heads catch the tails.
      const target = Math.ceil((from + travel) / 180) * 180;
      restSpin.current = target;
      busyUntil.current = performance.now() + 560;
      run("spin", animate(spin, target, springs.glide));
      run("gapTop", animate(gapTop, 0, { ...springs.snap, delay: 0.16 }));
      run("gapBottom", animate(gapBottom, 0, { ...springs.snap, delay: 0.16 }));
      run("head", animate(head, LOCKED_HEAD, { ...springs.snap, delay: 0.2 }));
      run(
        "tone",
        animate(tone, 1, {
          duration: durations.base,
          ease: easings.enter,
          delay: 0.22,
        }),
      );
      if (voiced) {
        ratchet.current = {
          detent: Math.floor(from / 30),
          until: performance.now() + 420,
        };
        later(300, () =>
          audio.play("snap", { pitch: 1.05, gain: 0.55, pan: where }),
        );
      }
    } else {
      // The break: the top seam gives first, then the bottom, and the pair
      // coasts on under friction — an exponential decay, like a spun ring.
      const coast = lerp(210, 45, drag);
      const target = from + coast;
      restSpin.current = target;
      const settle = lerp(560, 200, drag);
      busyUntil.current = performance.now() + settle * 4;
      run("gapTop", animate(gapTop, OPEN * 0.55, springs.snap));
      later(110, () => run("gapTop", animate(gapTop, OPEN, springs.glide)));
      run(
        "gapBottom",
        animate(gapBottom, OPEN, { ...springs.glide, delay: 0.08 }),
      );
      run("head", animate(head, 1, { ...springs.snap, delay: 0.04 }));
      run(
        "spin",
        animate(spin, target, {
          type: "inertia",
          velocity: coast,
          power: 1,
          timeConstant: settle,
          modifyTarget: () => target,
          restDelta: 0.05,
        }),
      );
      run(
        "tone",
        animate(tone, 0, { duration: durations.base, ease: easings.exit }),
      );
      if (voiced) {
        audio.play("snap", { pitch: 0.8, gain: 0.4, pan: where });
        ratchet.current = {
          detent: Math.floor(from / 30),
          until: performance.now() + settle * 4,
        };
      }
    }
    // A pointer that came or went mid-move gets its preview afterwards.
    later(busyUntil.current - performance.now() + 20, () =>
      api.current?.hover(),
    );
  };

  /** A tick each time the turning pair passes a 30° detent. */
  const detent = (value: number) => {
    const r = ratchet.current;
    if (!r) return;
    if (performance.now() > r.until) {
      ratchet.current = null;
      return;
    }
    const d = Math.floor(value / 30);
    if (d === r.detent) return;
    r.detent = d;
    audio.play("tick", {
      pitch: shown.current ? 1.2 : 0.95,
      gain: 0.22,
      pan: pan(),
    });
  };

  const flapped = () => {
    if (performance.now() > flapsHeardUntil.current) return;
    audio.play("tick", { pitch: 2.2, gain: 0.08, pan: pan() });
  };

  React.useEffect(() => {
    api.current = { transition, hover, detent, flapped };
  });

  React.useEffect(() => {
    if (shown.current === isOn) return;
    shown.current = isOn;
    const ask = armed.current;
    armed.current = null;
    const voiced =
      !!ask && ask.to === isOn && performance.now() - ask.at < 1500;
    api.current?.transition(isOn, voiced);
  }, [isOn]);

  React.useEffect(
    () => spin.on("change", (v) => api.current?.detent(v)),
    [spin],
  );

  React.useEffect(() => {
    const anims = running.current;
    const pending = timers.current;
    return () => {
      for (const c of anims.values()) c.stop();
      anims.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, []);

  const press = () => {
    if (disabled) return;
    const next = !isOn;
    armed.current = { to: next, at: performance.now() };
    if (hovered.current) quiet.current = true;
    if (pressed === undefined) setOwn(next);
    onPressedChange?.(next);
  };

  const pointerOver = (over: boolean) => {
    if (hovered.current === over) return;
    hovered.current = over;
    if (!over) quiet.current = false;
    hover();
  };

  const squeezeTo = (to: number) => {
    if (!motionSafe) return;
    run("squeeze", animate(squeeze, to, to < 1 ? springs.flick : springs.snap));
  };

  const ring = useTransform(
    [spin, gapTop, gapBottom, head] as MotionValue<number>[],
    ([s = 0, top = 0, bottom = 0, h = 0]: number[]) => {
      const aHead = s + 180 - bottom / 2;
      const bHead = s + 360 - top / 2;
      return {
        a: arc(s + top / 2, aHead),
        b: arc(s + 180 + bottom / 2, bHead),
        heads: `${arrowhead(aHead, h)} ${arrowhead(bHead, h)}`.trim(),
      };
    },
  );
  const arcA = useTransform(ring, (r) => r.a);
  const arcB = useTransform(ring, (r) => r.b);
  const heads = useTransform(ring, (r) => r.heads);
  const stroke = useTransform(
    tone,
    (t) =>
      `color-mix(in oklab, var(--renew-loop-accent) ${Math.round(clamp(t, 0, 1) * 100)}%, var(--ink-3))`,
  );

  const wash = useTransform(tone, (t) => r2(clamp(t, 0, 1) * 0.18));

  const gap = Math.min(speed * 0.4, cascade(cells) * 1000);
  const base = isOn ? 200 : 120;
  const style = {
    "--renew-loop-accent": accent ?? "var(--accent-bright)",
    scale: squeeze,
  } as unknown as React.ComponentProps<typeof motion.button>["style"];

  return (
    <span className={cn("relative inline-flex max-w-full shrink-0", className)}>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-pressed={isOn}
        aria-label={compact ? label : undefined}
        aria-describedby={descriptionId}
        title={compact ? sentence : undefined}
        disabled={disabled}
        onClick={press}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") pointerOver(true);
        }}
        onPointerLeave={(event) => {
          squeezeTo(1);
          if (event.pointerType === "mouse") pointerOver(false);
        }}
        onPointerDown={(event) => {
          if (disabled) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          squeezeTo(0.97);
        }}
        onPointerUp={() => squeezeTo(1)}
        onPointerCancel={() => squeezeTo(1)}
        style={style}
        className={cn(
          "group/renew-loop relative isolate inline-flex max-w-full shrink-0 cursor-pointer items-center justify-center rounded-full border border-hairline-strong bg-card text-foreground outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-50",
          compact ? geometry.round : geometry.pill,
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-foreground opacity-0 transition-opacity duration-150 group-enabled/renew-loop:group-hover/renew-loop:opacity-[0.04]"
        />
        <motion.svg
          aria-hidden
          width={geometry.icon}
          height={geometry.icon}
          viewBox="0 0 24 24"
          className="block shrink-0 overflow-visible"
          style={{ opacity: fade }}
        >
          <motion.circle
            cx={C}
            cy={C}
            r={5.2}
            style={{ fill: "var(--renew-loop-accent)", opacity: wash }}
          />
          <motion.g
            fill="none"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke }}
          >
            <motion.path d={arcA} />
            <motion.path d={arcB} />
            <motion.path d={heads} />
          </motion.g>
        </motion.svg>

        {compact ? null : (
          <>
            <span className="min-w-0 truncate font-medium" title={label}>
              {label}
            </span>
            <span
              aria-hidden
              className="ml-1 inline-flex shrink-0 gap-px font-mono leading-none tabular-nums"
            >
              {Array.from(readout).map((char, i) => (
                <FlapCell
                  key={i}
                  char={char}
                  delay={Math.round(base + i * gap)}
                  speed={speed}
                  motionSafe={motionSafe}
                  onFlap={() => api.current?.flapped()}
                  className={geometry.cell}
                  tint={
                    i < wordEnd
                      ? isOn
                        ? "text-ink-2"
                        : "text-warn"
                      : isOn
                        ? "text-foreground"
                        : "text-ink-2"
                  }
                />
              ))}
            </span>
          </>
        )}
      </motion.button>
      <span id={descriptionId} className="sr-only">
        {sentence}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said.text}
      </span>
    </span>
  );
}
