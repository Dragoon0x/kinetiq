"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ParkingMeterStyle = "classic" | "digital";

export type ParkingMeterProps = {
  /** The moment it is. Pass it, with `timeZone`, to render on the server. */
  now?: Date | number;
  /** The IANA time zone times are shown in, e.g. "UTC". @default the runtime's own */
  timeZone?: string;
  /** Controlled: the moment the meter is paid until, in ms. Null or past is expired. */
  value?: number | null;
  /** Initial paid-until moment when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires as each coin lands, with the new paid-until moment. */
  onValueChange?: (paidUntil: number) => void;
  /** The longest stay, in minutes: the dial's scale and the cap. @default 120 */
  max?: number;
  /** Minutes one coin buys. @default 20 */
  coin?: number;
  /** An enamel dome with a needle dial, or a digital head with an LCD. @default "classic" */
  style?: ParkingMeterStyle;
  /** Minutes left at which the window starts to pulse and the flag to peek. @default 10 */
  warnAt?: number;
  /** What is parked, shown over the reading. @default "Parking" */
  label?: string;
  /** A coin refused because the meter is already at `max`. */
  onRefuse?: () => void;
  /** The coin's clack and the needle's ticks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The meter's drawing box. */
const W = 120;
const H = 196;
/** The dial's pivot, its arc and its sweep either side of upright. */
const PX = 60;
const PY = 86;
const ARC = 42;
const SWEEP = 62;
/** Where a coin appears, where it vanishes into the slot, and the slot. */
const COIN_FROM = 96;
const COIN_TO = 121;
const SLOT_Y = 111;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const pad = (n: number) => String(n).padStart(2, "0");
/** Time left as h:mm, rounded up: a meter never shows less than is left. */
const hmText = (minutes: number) => {
  const m = Math.max(0, Math.ceil(minutes - 1e-6));
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
};
const spoken = (minutes: number) => {
  const m = Math.max(0, Math.ceil(minutes - 1e-6));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const parts = [
    h > 0 ? `${h} ${h === 1 ? "hour" : "hours"}` : "",
    r > 0 || h === 0 ? `${r} ${r === 1 ? "minute" : "minutes"}` : "",
  ];
  return parts.filter(Boolean).join(" ");
};

const FORMATS = new Map<string, Intl.DateTimeFormat>();
function clockOf(ms: number, timeZone?: string) {
  const key = timeZone ?? "";
  let f = FORMATS.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    FORMATS.set(key, f);
  }
  return f.format(ms);
}

// Without a `now` prop the meter keeps its own clock, read only after
// hydration (the server snapshot is null) and paused while the page is hidden.
const CLOCK_STEP = 1000;
const subscribeClock = (onChange: () => void) => {
  let timer = 0;
  const start = () => {
    if (!timer) timer = window.setInterval(onChange, CLOCK_STEP);
  };
  const stop = () => {
    window.clearInterval(timer);
    timer = 0;
  };
  const onVisibility = () => {
    if (document.hidden) stop();
    else {
      onChange();
      start();
    }
  };
  if (!document.hidden) start();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
  };
};
const readClock = () => Math.floor(Date.now() / CLOCK_STEP) * CLOCK_STEP;
const subscribeNothing = () => () => {};
const readNothing = () => null;

/** A spot on the dial, `r` from the pivot, at `deg` from upright. */
const dial = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [r2(PX + r * Math.sin(a)), r2(PY - r * Math.cos(a))] as const;
};

/** Seven-segment digits, each segment a small bar; `on` is "abcdefg". */
const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};
const DIGIT_W = 11;
const DIGIT_H = 22;
const DIGIT_Y = 36;
const DIGIT_X = [38, 56, 70] as const;
function segment(x: number, s: string) {
  const t = 2.2;
  const y = DIGIT_Y;
  const half = DIGIT_H / 2;
  const box = (bx: number, by: number, bw: number, bh: number) =>
    `M ${r2(bx)} ${r2(by)} h ${r2(bw)} v ${r2(bh)} h ${r2(-bw)} Z`;
  switch (s) {
    case "a":
      return box(x + t * 0.6, y, DIGIT_W - t * 1.2, t);
    case "d":
      return box(x + t * 0.6, y + DIGIT_H - t, DIGIT_W - t * 1.2, t);
    case "g":
      return box(x + t * 0.6, y + half - t / 2, DIGIT_W - t * 1.2, t);
    case "f":
      return box(x, y + t * 0.6, t, half - t * 0.9);
    case "b":
      return box(x + DIGIT_W - t, y + t * 0.6, t, half - t * 0.9);
    case "e":
      return box(x, y + half + t * 0.3, t, half - t * 0.9);
    default:
      return box(x + DIGIT_W - t, y + half + t * 0.3, t, half - t * 0.9);
  }
}
const digitsPath = (text: string) =>
  text
    .split("")
    .map((ch, i) =>
      (SEGMENTS[ch] ?? "")
        .split("")
        .map((s) => segment(DIGIT_X[i] ?? 0, s))
        .join(" "),
    )
    .join(" ");
const GHOST = digitsPath("888");
const BARS = 10;
const barPath = (lit: number) => {
  const out: string[] = [];
  for (let i = 0; i < lit; i += 1) {
    out.push(`M ${r2(26.6 + i * 6.8)} 70 h 5.6 v 8 h -5.6 Z`);
  }
  return out.join(" ");
};

/** Scale marks: the finest step that keeps the dial to sixteen marks. */
const stepOf = (max: number) =>
  [5, 10, 15, 30, 60].find((s) => max / s <= 16) ?? 60;
const scaleLabel = (m: number) =>
  m >= 60 && m % 60 === 0 ? `${m / 60}h` : String(m);

/*
 * Colours. The meter is an object: enamel, chrome, glass, a gold coin and a
 * red flag are token hues at fixed lightness, so it is the same meter in
 * either theme. Text beside it stays in text tokens.
 */
const ENAMEL = "oklch(from var(--accent) 0.44 0.08 calc(h - 22))";
const ENAMEL_EDGE = "oklch(from var(--accent) 0.32 0.07 calc(h - 22))";
const CHARCOAL = "oklch(from var(--ink) 0.34 0.012 h)";
const CHARCOAL_EDGE = "oklch(from var(--ink) 0.24 0.012 h)";
const POST = "oklch(from var(--ink) 0.55 0.01 h)";
const CHROME = "oklch(from var(--ink) 0.84 0.008 h)";
const FACE = "oklch(from var(--warn) 0.96 0.025 h)";
const LCD = "oklch(from var(--success) 0.84 0.05 calc(h - 40))";
const INK = "oklch(from var(--ink) 0.24 0.02 h)";
const SLOT = "oklch(from var(--ink) 0.14 0.01 h)";
const GOLD = "oklch(from var(--warn) 0.8 0.13 calc(h - 6))";
const GOLD_EDGE = "oklch(from var(--warn) 0.6 0.12 calc(h - 10))";
const FLAG = "oklch(from var(--danger) 0.58 0.21 h)";
const AMBER = "oklch(from var(--warn) 0.76 0.16 calc(h - 8))";
const SOLAR = "oklch(from var(--accent) 0.3 0.08 h)";
const WHITE = "oklch(from var(--ink) 0.99 0.003 h)";

const CLASSIC_HEAD =
  "M10 150 L10 52 A50 50 0 0 1 110 52 L110 150 Q110 156 104 156 L16 156 Q10 156 10 150 Z";
const CLASSIC_WINDOW = "M20 92 L20 54 A40 40 0 0 1 100 54 L100 92 Z";
const DIGITAL_HEAD =
  "M12 150 L12 20 Q12 8 24 8 L96 8 Q108 8 108 20 L108 150 Q108 156 102 156 L18 156 Q12 156 12 150 Z";
const DIGITAL_WINDOW =
  "M20 30 Q20 26 24 26 L96 26 Q100 26 100 30 L100 92 L20 92 Z";

type Api = {
  drop: () => void;
  land: (refused: boolean) => void;
  onLeft: (v: number) => void;
};

/**
 * A parking meter widget. In the classic style a needle on a cream dial
 * sweeps down through the time left; in the digital style seven-segment
 * digits and a ten-bar graph show it. Both read one motion value, so they
 * never disagree. Tap the meter, or its button, and a coin drops: it falls
 * into the slot on an accelerating tween, turning edge-on, clacks as it
 * lands, and the needle kicks up to the new time on the recoil spring —
 * overshooting and bouncing twice, against its stop pin at the top — ticking
 * past each mark. A full meter refuses the coin: it bounces back out and the
 * needle shudders.
 *
 * In the last `warnAt` minutes the window's rim pulses amber and the red
 * EXPIRED flag starts to peek over the sill; at zero it pops up on recoil.
 * The time left is announced politely at `warnAt`, at one minute and at
 * expiry, and after every coin. The add button is the keyboard's way in;
 * the drawing is the same action for a pointer. Under reduced motion the
 * coin fades in at the slot, the needle moves on a short tween, the flag
 * fades rather than rises and the rim is steady — the reading, the flag and
 * the announcements are unchanged.
 */
export function ParkingMeter({
  now,
  timeZone,
  value,
  defaultValue = null,
  onValueChange,
  max = 120,
  coin = 20,
  style = "classic",
  warnAt = 10,
  label = "Parking",
  onRefuse,
  sound = false,
  disabled = false,
  className,
}: ParkingMeterProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const windowId = `meter-window-${uid}`;
  const slotId = `meter-slot-${uid}`;
  const glassId = `meter-glass-${uid}`;

  const scale = clamp(Math.round(max), 15, 600);
  const buys = clamp(Math.round(coin), 1, scale);
  const warn = clamp(warnAt, 0, scale);
  const digital = style === "digital";
  const step = digital ? scale / BARS : stepOf(scale);

  const clockMs = React.useSyncExternalStore(
    now === undefined ? subscribeClock : subscribeNothing,
    now === undefined ? readClock : readNothing,
    readNothing,
  );
  const nowMs =
    now !== undefined
      ? typeof now === "number"
        ? now
        : now.getTime()
      : clockMs;
  const ready = nowMs !== null;

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const [check, setCheck] = React.useState(0);
  const controlled = value !== undefined;
  const paid = controlled ? value : own;
  const remain =
    nowMs === null || paid === null || !Number.isFinite(paid)
      ? 0
      : Math.max(0, (paid - nowMs) / 60000);
  const zone = !ready
    ? "unknown"
    : remain <= 0
      ? "expired"
      : remain <= 1
        ? "last"
        : remain <= warn
          ? "low"
          : "ok";

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const announce = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  // Thresholds reached by time passing are spoken once each.
  const [seenZone, setSeenZone] = React.useState(zone);
  if (seenZone !== zone) {
    setSeenZone(zone);
    const order = ["ok", "low", "last", "expired"];
    if (
      seenZone !== "unknown" &&
      order.indexOf(zone) > order.indexOf(seenZone)
    ) {
      const text =
        zone === "expired"
          ? `${label} meter expired${paid !== null ? ` at ${clockOf(paid, timeZone)}` : ""}.`
          : zone === "last"
            ? `1 minute left on the ${label.toLowerCase()} meter.`
            : `${spoken(warn)} left on the ${label.toLowerCase()} meter.`;
      setSaid({ n: said.n + 1, text });
    }
  }

  const flagTo = !ready
    ? 0
    : remain <= 0
      ? 1
      : remain < warn
        ? r2((1 - remain / Math.max(0.01, warn)) * 0.28)
        : 0;

  const left = useMotionValue(remain);
  const flag = useMotionValue(flagTo);
  const flagSeen = useMotionValue(1);
  const coinY = useMotionValue(COIN_FROM);
  const coinScale = useMotionValue(1);
  const coinOpacity = useMotionValue(0);

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const heading = React.useRef(remain);
  const paidNow = React.useRef(paid);
  const queue = React.useRef(0);
  const dropping = React.useRef(false);
  const handed = React.useRef(false);
  const lastLeft = React.useRef(remain);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const busy = (key: string) => anims.current.has(key);
  const settle = (key: string, controls: AnimationPlaybackControls) => {
    run(key, controls);
    void controls.finished.then(() => {
      if (anims.current.get(key) === controls) anims.current.delete(key);
    });
  };

  /** Minutes left as the meter knows them, counting coins not yet answered. */
  const leftNow = () =>
    nowMs === null || paidNow.current === null
      ? 0
      : Math.max(0, (paidNow.current - nowMs) / 60000);

  const insert = () => {
    if (disabled || !ready) return;
    queue.current += 1;
    if (!dropping.current) drop();
  };

  const drop = () => {
    dropping.current = true;
    const refused = leftNow() >= scale - 0.5;
    if (!motionSafe) {
      coinY.set(SLOT_Y - 9);
      coinScale.set(1);
      settle(
        "coin",
        animate(coinOpacity, [0, 1, 0], {
          duration: durations.slow,
          ease: easings.move,
          onComplete: () => api.current?.land(refused),
        }),
      );
      return;
    }
    coinY.set(COIN_FROM);
    coinScale.set(1);
    coinOpacity.set(0);
    run(
      "coinFade",
      animate(coinOpacity, 1, { duration: 0.06, ease: easings.enter }),
    );
    // A coin turns edge-on to meet the slot, and falls the way things fall.
    run(
      "coinTurn",
      animate(coinScale, 0.22, {
        duration: 0.2,
        delay: 0.05,
        ease: easings.move,
      }),
    );
    settle(
      "coin",
      animate(coinY, refused ? SLOT_Y - 6 : COIN_TO, {
        duration: refused ? 0.24 : 0.32,
        ease: easings.exit,
        onComplete: () => api.current?.land(refused),
      }),
    );
  };

  const land = (refused: boolean) => {
    if (refused) {
      queue.current = 0;
      dropping.current = false;
      audio.play("clack", { pitch: 0.62, gain: 0.5 });
      if (motionSafe) {
        // Bounced back out of a full slot, and the needle shudders.
        settle(
          "coin",
          animate(coinY, COIN_FROM - 4, { ...springs.recoil, velocity: -260 }),
        );
        run(
          "coinFade",
          animate(coinOpacity, 0, {
            duration: durations.slow,
            delay: 0.15,
            ease: easings.exit,
          }),
        );
        settle(
          "left",
          animate(left, left.get(), {
            ...springs.recoil,
            velocity: -scale * 0.25,
          }),
        );
      } else {
        coinOpacity.set(0);
      }
      onRefuse?.();
      announce(`The meter is full: ${spoken(scale)} at most.`);
      return;
    }
    coinOpacity.set(0);
    audio.play("clack", { pitch: 1, gain: 0.6 });
    if (nowMs !== null) {
      const base = Math.max(nowMs, paidNow.current ?? nowMs);
      const until = Math.min(base + buys * 60000, nowMs + scale * 60000);
      const target = (until - nowMs) / 60000;
      paidNow.current = until;
      heading.current = target;
      handed.current = true;
      // The needle kicks: it overshoots and bounces twice before it settles.
      settle(
        "left",
        animate(
          left,
          target,
          motionSafe
            ? { ...springs.recoil, velocity: scale * 0.6 }
            : { duration: durations.fast, ease: easings.enter },
        ),
      );
      if (!controlled) setOwn(until);
      onValueChange?.(until);
      if (controlled) React.startTransition(() => setCheck((c) => c + 1));
      announce(
        `Added ${spoken((until - base) / 60000)}. ${spoken(target)} left, paid until ${clockOf(until, timeZone)}.`,
      );
    }
    queue.current = Math.max(0, queue.current - 1);
    dropping.current = queue.current > 0;
    if (dropping.current) drop();
  };

  /** A tick for each scale mark the needle passes on a visitor's coin. */
  const onLeft = (v: number) => {
    const prev = lastLeft.current;
    lastLeft.current = v;
    if (!handed.current) return;
    const a = Math.floor(Math.min(prev, scale) / step);
    const b = Math.floor(Math.min(v, scale) / step);
    if (a !== b) {
      audio.play("tick", {
        pitch: r2(0.85 + 0.5 * clamp(v / scale, 0, 1)),
        gain: 0.4,
      });
    }
  };

  React.useEffect(() => {
    api.current = { drop, land, onLeft };
  });

  React.useEffect(
    () => left.on("change", (v) => api.current?.onLeft(v)),
    [left],
  );

  // What the meter is paid until, as the host says; a refused coin is
  // forgotten once the host has had its turn.
  React.useEffect(() => {
    paidNow.current = paid;
  }, [paid, check]);

  // Time passing moves the needle a hair at a time; a host's own change
  // glides; a kick still landing is left to land.
  React.useEffect(() => {
    if (Math.abs(remain - heading.current) < 1e-6) return;
    const jump = Math.abs(remain - heading.current);
    heading.current = remain;
    if (busy("left") && jump < 0.5) return;
    handed.current = false;
    if (jump < 2) {
      anims.current.get("left")?.stop();
      anims.current.delete("left");
      left.set(remain);
      return;
    }
    settle(
      "left",
      animate(
        left,
        remain,
        motionSafe ? springs.glide : { duration: durations.fast },
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remain, check]);

  // The flag peeks with the last minutes and pops up at zero.
  React.useEffect(() => {
    const at = flag.get();
    if (!motionSafe) {
      anims.current.get("flag")?.stop();
      flag.set(flagTo);
      run(
        "flagSeen",
        animate(flagSeen, flagTo > 0 ? 1 : 0, {
          duration: durations.base,
          ease: flagTo > 0 ? easings.enter : easings.exit,
        }),
      );
      return;
    }
    flagSeen.set(1);
    if (flagTo >= 1 && at < 0.99) {
      settle("flag", animate(flag, 1, springs.recoil));
    } else if (flagTo < at - 0.04) {
      settle(
        "flag",
        animate(flag, flagTo, { duration: durations.base, ease: easings.exit }),
      );
    } else if (!busy("flag")) {
      flag.set(flagTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flagTo, motionSafe]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const needle = useTransform(left, (v) => {
    // A stop pin holds the needle just past the top of the scale.
    const deg = -SWEEP + 2 * SWEEP * clamp(v / scale, -0.02, 1.03);
    const a = (deg * Math.PI) / 180;
    const ux = Math.sin(a);
    const uy = -Math.cos(a);
    // A tapered blade: wide at the pivot, a point at the tip, a short tail.
    const at = (along: number, across: number) =>
      `${r2(PX + ux * along - uy * across)} ${r2(PY + uy * along + ux * across)}`;
    return `M ${at(0, 1.7)} L ${at(37, 0)} L ${at(0, -1.7)} L ${at(-8, 0)} Z`;
  });
  const lcd = useTransform(left, (v) =>
    digitsPath(
      hmText(clamp(v, 0, scale))
        .replace(":", "")
        .padStart(3, "0"),
    ),
  );
  const bars = useTransform(left, (v) =>
    barPath(clamp(Math.ceil((v / scale) * BARS - 1e-6), 0, BARS)),
  );
  const flagY = useTransform(flag, (f) => r2(92 - 36 * f));
  const flagText = useTransform(flagY, (y) => r2(y + 11));
  const coinX = useTransform(coinScale, (s) => r2(7 * s));
  const coinCy = useTransform(coinY, r2);

  const marks = React.useMemo(() => {
    const out: string[] = [];
    for (let m = 0; m <= scale + 1e-6; m += stepOf(scale)) {
      const deg = -SWEEP + (2 * SWEEP * m) / scale;
      const major = m === 0 || m === scale || Math.abs(m - scale / 2) < 1e-6;
      const [x1, y1] = dial(deg, major ? ARC - 7 : ARC - 4);
      const [x2, y2] = dial(deg, ARC);
      out.push(`M ${x1} ${y1} L ${x2} ${y2}`);
    }
    const labels = [0, scale / 2, scale].map((m) => {
      const [x, y] = dial(-SWEEP + (2 * SWEEP * m) / scale, ARC - 14);
      return { m, x, y, text: scaleLabel(Math.round(m)) };
    });
    const warnEnd = dial(
      -SWEEP + (2 * SWEEP * Math.min(warn, scale)) / scale,
      ARC + 2.5,
    );
    const warnStart = dial(-SWEEP, ARC + 2.5);
    const warnArc =
      warn > 0
        ? `M ${warnStart[0]} ${warnStart[1]} A ${ARC + 2.5} ${ARC + 2.5} 0 0 1 ${warnEnd[0]} ${warnEnd[1]}`
        : "";
    return { ticks: out.join(" "), labels, warnArc };
  }, [scale, warn]);

  const pin = dial(SWEEP + 4, ARC - 6);
  const reading = ready ? hmText(remain) : "–:––";
  const tone =
    zone === "expired"
      ? "text-danger"
      : zone === "low" || zone === "last"
        ? "text-warn"
        : "text-foreground";
  const caption = !ready
    ? "Reading the meter"
    : zone === "expired"
      ? paid !== null
        ? `expired at ${clockOf(paid, timeZone)}`
        : "not paid"
      : `left · until ${clockOf(paid ?? 0, timeZone)}`;
  const coinWord = `${buys} min`;

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full max-w-[300px] items-center gap-3 rounded-4 border border-hairline bg-card p-3 text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        aria-hidden
        onClick={insert}
        className={cn(
          "w-26 shrink-0 select-none [-webkit-touch-callout:none]",
          disabled || !ready ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
        >
          <defs>
            <clipPath id={windowId}>
              <path d={digital ? DIGITAL_WINDOW : CLASSIC_WINDOW} />
            </clipPath>
            <clipPath id={slotId}>
              <rect x={0} y={0} width={W} height={SLOT_Y + 1} />
            </clipPath>
            <linearGradient id={glassId} x1={0} y1={0} x2={1} y2={1}>
              <stop offset={0} stopColor="white" stopOpacity={0.4} />
              <stop offset={0.45} stopColor="white" stopOpacity={0} />
            </linearGradient>
          </defs>

          <rect
            x={52}
            y={150}
            width={16}
            height={44}
            rx={2}
            style={{ fill: POST }}
          />
          <rect
            x={40}
            y={190}
            width={40}
            height={6}
            rx={2}
            style={{ fill: POST }}
          />
          <path
            d={digital ? DIGITAL_HEAD : CLASSIC_HEAD}
            strokeWidth={2}
            style={{
              fill: digital ? CHARCOAL : ENAMEL,
              stroke: digital ? CHARCOAL_EDGE : ENAMEL_EDGE,
            }}
          />
          {digital ? (
            <g>
              <rect
                x={30}
                y={12}
                width={60}
                height={9}
                rx={2}
                style={{ fill: SOLAR }}
              />
              <path
                d="M45 12 V21 M60 12 V21 M75 12 V21"
                strokeWidth={0.6}
                style={{ stroke: "oklch(from var(--accent) 0.5 0.06 h)" }}
              />
            </g>
          ) : null}

          <path
            d={digital ? DIGITAL_WINDOW : CLASSIC_WINDOW}
            style={{ fill: digital ? LCD : FACE }}
          />
          <g clipPath={`url(#${windowId})`}>
            {digital ? (
              <g style={{ fill: INK }}>
                <path d={GHOST} opacity={0.1} />
                <motion.path d={lcd} />
                <circle cx={52.5} cy={DIGIT_Y + 6} r={1.3} />
                <circle cx={52.5} cy={DIGIT_Y + 16} r={1.3} />
                <path d={barPath(BARS)} opacity={0.1} />
                <motion.path d={bars} />
              </g>
            ) : (
              <g>
                <path
                  d={marks.warnArc}
                  fill="none"
                  strokeWidth={3}
                  strokeLinecap="round"
                  style={{ stroke: AMBER }}
                />
                <path
                  d={marks.ticks}
                  fill="none"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  style={{ stroke: INK }}
                />
                <g
                  fontSize={8}
                  fontWeight={600}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-mono"
                  style={{ fill: INK }}
                >
                  {marks.labels.map((l) => (
                    <text key={l.m} x={l.x} y={l.y}>
                      {l.text}
                    </text>
                  ))}
                </g>
                <circle cx={pin[0]} cy={pin[1]} r={1.4} style={{ fill: INK }} />
                <motion.path d={needle} style={{ fill: INK }} />
                <circle cx={PX} cy={PY} r={3.6} style={{ fill: INK }} />
              </g>
            )}
            <motion.g style={{ opacity: flagSeen }}>
              <motion.rect
                x={26}
                width={68}
                height={40}
                rx={3}
                y={flagY}
                style={{ fill: FLAG }}
              />
              <motion.text
                x={PX}
                y={flagText}
                fontSize={9}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="central"
                letterSpacing={0.6}
                className="font-mono"
                style={{ fill: WHITE }}
              >
                EXPIRED
              </motion.text>
            </motion.g>
          </g>
          <path
            d={digital ? DIGITAL_WINDOW : CLASSIC_WINDOW}
            fill={`url(#${glassId})`}
          />
          <path
            d={digital ? DIGITAL_WINDOW : CLASSIC_WINDOW}
            fill="none"
            strokeWidth={2.4}
            className={cn(
              motionSafe &&
                (zone === "low" || zone === "last") &&
                "animate-pulse",
            )}
            style={{
              stroke:
                zone === "expired"
                  ? FLAG
                  : zone === "low" || zone === "last"
                    ? AMBER
                    : digital
                      ? CHARCOAL_EDGE
                      : CHROME,
            }}
          />

          <rect
            x={30}
            y={100}
            width={60}
            height={40}
            rx={5}
            style={{ fill: CHROME }}
          />
          <rect
            x={45}
            y={SLOT_Y - 2}
            width={30}
            height={4.5}
            rx={2}
            style={{ fill: SLOT }}
          />
          <text
            x={PX}
            y={124}
            fontSize={7.5}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-mono"
            style={{ fill: INK }}
          >
            {coinWord.toUpperCase()}
          </text>
          <text
            x={PX}
            y={134}
            fontSize={5.5}
            fontWeight={600}
            letterSpacing={1}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-mono"
            style={{ fill: INK }}
            opacity={0.6}
          >
            PER COIN
          </text>

          <g clipPath={`url(#${slotId})`}>
            <motion.ellipse
              cx={PX}
              cy={coinCy}
              rx={coinX}
              ry={7}
              strokeWidth={1}
              style={{ fill: GOLD, stroke: GOLD_EDGE, opacity: coinOpacity }}
            />
          </g>
        </svg>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p
            className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            title={label}
          >
            {label}
          </p>
          <div
            role="meter"
            aria-label={`${label}, time left`}
            aria-valuemin={0}
            aria-valuemax={scale}
            aria-valuenow={Math.ceil(remain - 1e-6)}
            aria-valuetext={
              ready
                ? zone === "expired"
                  ? "Expired"
                  : `${spoken(remain)} left`
                : "Reading the meter"
            }
          >
            <p
              className={cn(
                "font-mono text-2xl leading-tight tabular-nums transition-colors",
                tone,
              )}
            >
              {reading}
            </p>
            <p className="truncate text-xs text-ink-3">{caption}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={insert}
          disabled={disabled || !ready}
          aria-label={`Add ${spoken(buys)}`}
          className={cn(
            "inline-flex h-8 w-fit shrink-0 cursor-pointer items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
          )}
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
          >
            <circle cx={8} cy={8} r={5.5} />
            <path d="M8 5.5v5M5.5 8h5" strokeLinecap="round" />
          </svg>
          Add {coinWord}
        </button>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
