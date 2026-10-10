"use client";

import * as React from "react";

import { Mic, MicOff, Phone } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LineChipState = "ringing" | "active" | "ended";
export type LineChipDirection = "incoming" | "outgoing";
export type LineChipSize = "sm" | "md" | "lg";

export type LineChipLabels = {
  /** Under the caller while an incoming call rings. */
  incoming: string;
  /** Under the caller while an outgoing call rings. */
  outgoing: string;
  /** Under the caller while connected. */
  active: string;
  /** Under the caller after a call that connected; the duration follows it. */
  ended: string;
  /** Under the caller after an incoming call that was never answered. */
  declined: string;
  /** Under the caller after an outgoing call that never connected. */
  cancelled: string;
  answer: string;
  decline: string;
  cancel: string;
  mute: string;
  hangUp: string;
  callBack: string;
};

export type LineChipProps = {
  /** Who is on the line: shown in the chip and in every spoken sentence. */
  caller: string;
  /** Replaces the line under the caller while it rings: a number, a team. */
  detail?: string;
  /** Controlled: where the call is. */
  state?: LineChipState;
  /** Initial state when uncontrolled. @default "ringing" */
  defaultState?: LineChipState;
  /** Fires from the action that moved the call on, with the new state. */
  onStateChange?: (state: LineChipState) => void;
  /** Who placed the call: an incoming call offers Answer and Decline, an outgoing one only Cancel. @default "incoming" */
  direction?: LineChipDirection;
  /** Seconds already on the call when it connects (picked up elsewhere, or restored); the timer counts on from here. @default 0 */
  timer?: number;
  /** How hard it rings, 0 to 1: how many sound arcs ripple out of the handset and how far it wiggles. 0 is a calm pulse. @default 0.6 */
  ripple?: number;
  /** Controlled: the microphone is muted. */
  muted?: boolean;
  /** Initial mute when uncontrolled. @default false */
  defaultMuted?: boolean;
  /** Fires from the Mute button with the new state. */
  onMutedChange?: (muted: boolean) => void;
  /** The live audio level, 0 to 1, for the waveform. Without it the waveform plays a seeded voice. */
  level?: number;
  /** Every word the chip shows or says, for other languages. */
  labels?: Partial<LineChipLabels>;
  /** Ringing: the pulse, the arcs and Answer. Any CSS colour. @default "var(--success)" */
  ringColor?: string;
  /** Decline, Hang up and the ended handset. Any CSS colour. @default "var(--danger)" */
  endColor?: string;
  /** @default "md" */
  size?: LineChipSize;
  /** Play a click on every action and a chime as the call connects or ends. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const LABELS: LineChipLabels = {
  incoming: "Incoming call",
  outgoing: "Calling",
  active: "On call",
  ended: "Call ended",
  declined: "Declined",
  cancelled: "Cancelled",
  answer: "Answer",
  decline: "Decline",
  cancel: "Cancel",
  mute: "Mute",
  hangUp: "Hang up",
  callBack: "Call back",
};

type Dims = {
  h: number;
  disc: number;
  btn: number;
  icon: number;
  gap: number;
  text: string;
};

const SIZES: Record<LineChipSize, Dims> = {
  sm: { h: 40, disc: 28, btn: 28, icon: 14, gap: 8, text: "text-xs" },
  md: { h: 48, disc: 36, btn: 32, icon: 16, gap: 10, text: "text-sm" },
  lg: { h: 56, disc: 44, btn: 40, icon: 18, gap: 12, text: "text-sm" },
};

const BARS = 5;
const BAR_W = 3;
const BAR_GAP = 2.5;
const WAVE_W = BARS * BAR_W + (BARS - 1) * BAR_GAP;
/** One ring: a burst of wiggles, then a rest. */
const RING_S = 1.4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

const spoken = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const m = Math.floor(t / 60);
  const sec = t % 60;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (m === 0) return part(sec, "second");
  return sec === 0
    ? part(m, "minute")
    : `${part(m, "minute")} ${part(sec, "second")}`;
};

/** Seeded per-bar character, so every chip's voice has the same shape. */
const BAR_SHAPE = [0.55, 0.85, 1, 0.8, 0.6];
const BAR_RATE = [5.3, 7.1, 6.2, 8.4, 4.7];
const BAR_PHASE = [0.4, 2.1, 1.3, 3.6, 5.2];

/** A seeded voice: phrases and pauses, louder and softer. */
const voice = (t: number) => {
  const phrase = 0.5 + 0.5 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1.1);
  const syllables =
    0.55 + 0.45 * Math.abs(Math.sin(t * 6.3 + Math.sin(t * 1.7)));
  return clamp01(phrase > 0.28 ? phrase * syllables * 1.25 : 0.04);
};

function Arc({
  i,
  cycle,
  count,
  r,
  motionSafe,
}: {
  i: number;
  cycle: MotionValue<number>;
  count: number;
  r: number;
  motionSafe: boolean;
}) {
  // Each arc lights in turn as the ring goes out, then fades.
  const opacity = useTransform(cycle, (c) => {
    if (i >= count) return 0;
    if (!motionSafe) return 0.55;
    const t = c - 0.06 - i * 0.11;
    return t > 0 && t < 0.5 ? r2(Math.sin((Math.PI * t) / 0.5)) : 0;
  });
  const a0 = (-80 * Math.PI) / 180;
  const a1 = (-12 * Math.PI) / 180;
  const p = (a: number) => `${r2(r * Math.cos(a))} ${r2(r * Math.sin(a))}`;
  return (
    <motion.path
      d={`M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`}
      fill="none"
      strokeWidth={1.6}
      strokeLinecap="round"
      style={{ opacity, stroke: "var(--line-chip-ring)" }}
    />
  );
}

/**
 * A call status chip that lives in a toolbar, actions and all. Ringing, the
 * handset rings in bursts — a quick wiggle, then a rest — while sound arcs
 * ripple out of it one after another and the chip's border pulses. Answering
 * slides the chip wider on springs.glide: its width is aimed at the measured
 * width of the connected call, the actions riding the moving edge, and a
 * live timer and a waveform open up beside the caller. Hanging up turns the
 * handset down on springs.snap, shakes the chip once and collapses it on
 * glide to "Call ended · 1:24", with Call back inside.
 *
 * Every action is a real button with a full name; a polite status says each
 * state once, and the ticking timer is kept out of it. Under reduced motion
 * nothing wiggles, ripples or shakes: the arcs and border hold still, the
 * width changes on a short tween, and the timer still counts.
 */
export function LineChip({
  caller,
  detail,
  state,
  defaultState = "ringing",
  onStateChange,
  direction = "incoming",
  timer = 0,
  ripple = 0.6,
  muted,
  defaultMuted = false,
  onMutedChange,
  level,
  labels,
  ringColor = "var(--success)",
  endColor = "var(--danger)",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: LineChipProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const L = { ...LABELS, ...labels };
  const d = SIZES[size] ?? SIZES.md;
  const rp = clamp01(ripple);
  const start = Math.max(0, Math.floor(timer));

  const [ownState, setOwnState] = React.useState(defaultState);
  const now = state ?? ownState;
  const [ownMuted, setOwnMuted] = React.useState(defaultMuted);
  const isMuted = muted ?? ownMuted;
  const [elapsed, setElapsed] = React.useState(start);
  const [ending, setEnding] = React.useState<{
    from: LineChipState | null;
    seconds: number;
  } | null>(null);
  const [inView, setInView] = React.useState(true);
  const [hidden, setHidden] = React.useState(false);
  const [fit, setFit] = React.useState<{
    avail: number;
    text: number;
    clock: number;
  } | null>(null);

  // Before the first measurement the server's frame guesses the clock's
  // width; the second button's slot is known from the state alone.
  const chipW = useMotionValue(0);
  const liveW = useMotionValue(
    now === "active" ? 30 + 8 + WAVE_W + (SIZES[size] ?? SIZES.md).gap : 0,
  );
  const secW = useMotionValue(
    (now === "ringing" && direction === "incoming") || now === "active"
      ? (SIZES[size] ?? SIZES.md).btn + 6
      : 0,
  );
  const shake = useMotionValue(0);
  const cycle = useMotionValue(0);
  const base = useMotionValue(now === "ended" ? 135 : 0);
  const bars = [
    useMotionValue(0.3),
    useMotionValue(0.5),
    useMotionValue(0.7),
    useMotionValue(0.5),
    useMotionValue(0.35),
  ];

  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLSpanElement | null>(null);
  const primaryRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const placed = React.useRef(false);
  const prevState = React.useRef(now);
  const elapsedRef = React.useRef(start);
  const levelRef = React.useRef(level);
  /** When the call connected, on the page's clock: the timer counts from it. */
  const connectedAt = React.useRef<number | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const ringing = now === "ringing";
  const active = now === "active";
  const ended = now === "ended";
  const incoming = direction === "incoming";
  const hasSecondary = (ringing && incoming) || active;
  const arcCount = rp <= 0.01 ? 0 : 1 + Math.round(rp * 2);
  const wiggle = 4 + 10 * rp;

  // The words under the caller, and the sentence the status says once.
  const endedFrom = ending?.from ?? null;
  const duration = ending?.seconds ?? start;
  const sub = ringing
    ? (detail ?? (incoming ? L.incoming : L.outgoing))
    : active
      ? L.active
      : endedFrom === "ringing"
        ? incoming
          ? L.declined
          : L.cancelled
        : `${L.ended} · ${clock(duration)}`;
  const sentence = ringing
    ? incoming
      ? `Incoming call from ${caller}.`
      : `Calling ${caller}.`
    : active
      ? `On call with ${caller}${isMuted ? ", microphone muted" : ""}.`
      : endedFrom === "ringing"
        ? `Call with ${caller} ${incoming ? "declined" : "cancelled"}.`
        : `Call with ${caller} ended after ${spoken(duration)}.`;

  const padL = (d.h - d.disc) / 2;
  const padR = (d.h - d.btn) / 2;
  const liveTarget = fit ? fit.clock + 8 + WAVE_W + d.gap : 0;
  const secTarget = hasSecondary ? d.btn + 6 : 0;
  const natural = fit
    ? Math.ceil(
        padL +
          d.disc +
          d.gap +
          fit.text +
          (active ? liveTarget : 0) +
          d.gap +
          secTarget +
          d.btn +
          padR +
          2,
      )
    : 0;
  const target = fit ? Math.min(natural, fit.avail) : 0;

  // The chip's width, the live strip's and the second button's slot all
  // move together, so the caller's name keeps its room while the edge slides.
  React.useEffect(() => {
    if (!fit) return;
    const goal = {
      chip: target,
      live: active ? liveTarget : 0,
      sec: secTarget,
    };
    if (!placed.current) {
      placed.current = true;
      chipW.jump(goal.chip);
      liveW.jump(goal.live);
      secW.jump(goal.sec);
      return;
    }
    const how = motionSafe
      ? springs.glide
      : { duration: durations.fast, ease: easings.enter };
    run("chip", animate(chipW, goal.chip, how));
    run("live", animate(liveW, goal.live, how));
    run("sec", animate(secW, goal.sec, how));
    // Keyed on the targets themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, liveTarget, secTarget, active, fit === null]);

  // The available width and the measured text, from one hidden copy.
  React.useEffect(() => {
    const outer = outerRef.current;
    const measure = measureRef.current;
    if (!outer || !measure) return;
    const read = () => {
      const text = measure.querySelector<HTMLElement>("[data-text]");
      const time = measure.querySelector<HTMLElement>("[data-clock]");
      const next = {
        avail: outer.clientWidth,
        // Sub-pixel widths, rounded up: offsetWidth would round 65.08 down
        // and cut the last letter.
        text: Math.ceil((text?.getBoundingClientRect().width ?? 0) + 0.5),
        clock: Math.ceil((time?.getBoundingClientRect().width ?? 0) + 0.5),
      };
      setFit((prev) =>
        prev &&
        prev.avail === next.avail &&
        prev.text === next.text &&
        prev.clock === next.clock
          ? prev
          : next,
      );
    };
    const sizer = new ResizeObserver(read);
    sizer.observe(outer);
    for (const el of measure.querySelectorAll("[data-text], [data-clock]")) {
      sizer.observe(el);
    }
    return () => sizer.disconnect();
  }, []);

  // On screen and in a visible tab, or nothing loops.
  React.useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) setInView(e.isIntersecting);
    });
    io.observe(outer);
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // A state change: the handset's angle, the shake, the timer's start and
  // the ended line's duration, all from the transition itself.
  React.useEffect(() => {
    const from = prevState.current;
    if (from === now) return;
    prevState.current = now;
    const angle = now === "ended" ? 135 : 0;
    if (motionSafe) run("base", animate(base, angle, springs.snap));
    else base.jump(angle);
    if (now === "ended") {
      const seconds = from === "active" ? elapsedRef.current : start;
      queueMicrotask(() => setEnding({ from, seconds }));
      if (motionSafe) {
        run(
          "shake",
          animate(shake, [0, -6, 5, -3, 2, 0], {
            duration: 0.42,
            ease: easings.move,
          }),
        );
      }
    } else {
      queueMicrotask(() => setEnding(null));
    }
    if (now === "active") {
      connectedAt.current = performance.now() - start * 1000;
      elapsedRef.current = start;
      queueMicrotask(() => setElapsed(start));
    } else {
      connectedAt.current = null;
    }
    // Answers the state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // A new starting point while connected: the timer counts on from it.
  const based = React.useRef(start);
  React.useEffect(() => {
    if (based.current === start) return;
    based.current = start;
    if (!active) return;
    connectedAt.current = performance.now() - start * 1000;
    elapsedRef.current = start;
    queueMicrotask(() => setElapsed(start));
    // Answers the starting point only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  // The live timer: counted from when the call connected, so a page that
  // was hidden or scrolled away is right the moment it is seen again.
  const ticking = active && inView && !hidden;
  React.useEffect(() => {
    if (!active) return;
    if (connectedAt.current === null) {
      connectedAt.current = performance.now() - elapsedRef.current * 1000;
    }
    if (!ticking) return;
    const began = connectedAt.current;
    let id = 0;
    const tick = () => {
      // Read each time: a new `timer` while connected moves the start.
      const ms = performance.now() - (connectedAt.current ?? began);
      const s = Math.floor(ms / 1000);
      elapsedRef.current = s;
      setElapsed(s);
      id = window.setTimeout(tick, 1000 - (ms % 1000) + 5);
    };
    // Straight away first, to catch up on time spent off screen.
    id = window.setTimeout(tick, 0);
    return () => window.clearTimeout(id);
  }, [active, ticking]);

  // Ringing: one linear cycle drives the wiggle, the arcs and the border.
  const ringingLive = ringing && motionSafe && inView && !hidden;
  React.useEffect(() => {
    if (!ringingLive) {
      anims.current.get("cycle")?.stop();
      cycle.jump(ringing ? 0.5 : 0);
      return;
    }
    cycle.jump(0);
    run(
      "cycle",
      animate(cycle, 1, {
        duration: RING_S,
        ease: "linear",
        repeat: Infinity,
      }),
    );
  }, [ringingLive, ringing, cycle]);

  // The waveform: the host's level, or a seeded voice, smoothed with a quick
  // attack and a slower release.
  const waving = active && !isMuted && motionSafe && inView && !hidden;
  React.useEffect(() => {
    if (!waving) {
      for (let i = 0; i < BARS; i++) {
        const bar = bars[i];
        if (!bar) continue;
        const rest =
          active && !isMuted ? 0.25 + 0.35 * (BAR_SHAPE[i] ?? 0.5) : 0.14;
        if (motionSafe) run(`bar${i}`, animate(bar, rest, springs.glide));
        else bar.jump(rest);
      }
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    let prev = t0;
    const loop = (t: number) => {
      const time = (t - t0) / 1000;
      const dt = Math.min(0.05, (t - prev) / 1000);
      prev = t;
      // A quick attack and a slower release, the same at any frame rate.
      const attack = 1 - Math.exp(-dt * 30);
      const release = 1 - Math.exp(-dt * 8);
      const host = levelRef.current;
      const lv = host === undefined ? voice(time) : clamp01(host);
      for (let i = 0; i < BARS; i++) {
        const bar = bars[i];
        if (!bar) continue;
        const wob =
          0.62 +
          0.38 * Math.sin(time * (BAR_RATE[i] ?? 6) + (BAR_PHASE[i] ?? 0));
        const goal = 0.14 + 0.86 * lv * (BAR_SHAPE[i] ?? 0.6) * wob;
        const cur = bar.get();
        const k = goal > cur ? attack : release;
        bar.set(r2(cur + (goal - cur) * k));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // The bars are stable motion values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waving, active, isMuted, motionSafe]);

  React.useEffect(() => {
    levelRef.current = level;
  });

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const handset = useTransform(
    [base, cycle] as MotionValue<number>[],
    ([b = 0, c = 0]: number[]) => {
      if (b !== 0 || !motionSafe) return b;
      // A burst of six wiggles in the first third of the ring, then still.
      if (c > 0.32) return 0;
      const u = c / 0.32;
      return r2(wiggle * Math.sin(u * Math.PI * 6) * Math.sin(u * Math.PI));
    },
  );
  const border = useTransform(cycle, (c) =>
    !ringing
      ? 0
      : !motionSafe
        ? 0.6
        : r2(0.25 + 0.75 * (0.5 - 0.5 * Math.cos(2 * Math.PI * c))),
  );

  const go = (next: LineChipState) => {
    if (state === undefined) setOwnState(next);
    onStateChange?.(next);
  };

  const click = (pitch: number) => audio.play("click", { pitch, gain: 0.5 });

  const primary = () => {
    if (disabled) return;
    if (ringing && incoming) {
      click(1.1);
      audio.play("chime", { pitch: 1.3, gain: 0.35 });
      go("active");
    } else if (ringing || active) {
      click(0.9);
      audio.play("chime", { pitch: 0.7, gain: 0.25 });
      go("ended");
    } else {
      click(1);
      go("ringing");
    }
  };

  const secondary = () => {
    if (disabled) return;
    if (ringing && incoming) {
      click(0.9);
      audio.play("chime", { pitch: 0.7, gain: 0.25 });
      // The Decline slot folds away: focus goes to what replaces it.
      primaryRef.current?.focus({ preventScroll: true });
      go("ended");
    } else if (active) {
      const next = !isMuted;
      click(next ? 0.85 : 1.15);
      if (muted === undefined) setOwnMuted(next);
      onMutedChange?.(next);
    }
  };

  const primaryLabel = ringing
    ? incoming
      ? `${L.answer} call from ${caller}`
      : `${L.cancel} call to ${caller}`
    : active
      ? `${L.hangUp} call with ${caller}`
      : `${L.callBack} ${caller}`;
  const primaryTone = ringing && incoming ? "ring" : ended ? "neutral" : "end";
  const handsetDown = !(ringing && incoming) && !ended;

  const discTint = ended ? endColor : ringColor;
  const btnBase = cn(
    "relative flex shrink-0 items-center justify-center rounded-full outline-none transition-colors duration-200",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    "disabled:cursor-not-allowed enabled:cursor-pointer",
  );

  return (
    <div
      ref={outerRef}
      className={cn("relative flex w-full justify-center", className)}
      style={
        {
          "--line-chip-ring": ringColor,
          "--line-chip-end": endColor,
        } as React.CSSProperties
      }
    >
      <motion.div
        role="group"
        aria-label={`Call with ${caller}`}
        className={cn(
          "relative flex items-center overflow-clip rounded-full border border-hairline-strong bg-card shadow-raised",
          disabled && "opacity-50",
          d.text,
        )}
        style={{
          width: fit ? chipW : undefined,
          maxWidth: "100%",
          height: d.h,
          x: shake,
          paddingLeft: padL,
          paddingRight: padR,
        }}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2"
          style={{ opacity: border, borderColor: "var(--line-chip-ring)" }}
        />

        <span
          aria-hidden
          className="relative flex shrink-0 items-center justify-center rounded-full transition-colors duration-300"
          style={{
            width: d.disc,
            height: d.disc,
            color: discTint,
            background: `color-mix(in oklab, ${discTint} 15%, transparent)`,
          }}
        >
          <svg
            width={d.disc}
            height={d.disc}
            viewBox={`${-d.disc / 2} ${-d.disc / 2} ${d.disc} ${d.disc}`}
            className="absolute inset-0 overflow-visible"
          >
            <g
              transform={`translate(${r2(d.icon * 0.18)} ${r2(-d.icon * 0.18)})`}
            >
              {[0, 1, 2].map((i) => (
                <Arc
                  key={i}
                  i={i}
                  cycle={cycle}
                  count={ringing ? arcCount : 0}
                  r={r2(d.disc * (0.235 + i * 0.085))}
                  motionSafe={motionSafe}
                />
              ))}
            </g>
          </svg>
          <motion.span
            className="flex items-center justify-center"
            style={{ rotate: handset, width: d.icon, height: d.icon }}
          >
            <Phone className="size-full" strokeWidth={2.1} />
          </motion.span>
        </span>

        <span
          className={cn(
            "flex min-w-0 flex-col justify-center leading-tight",
            fit ? "flex-1" : "flex-auto",
          )}
          style={{ marginLeft: d.gap, marginRight: d.gap }}
        >
          <span className="truncate font-medium text-foreground" title={caller}>
            {caller}
          </span>
          <span className="truncate text-xs text-ink-3">{sub}</span>
        </span>

        <motion.span
          aria-hidden
          className="flex shrink-0 items-center overflow-clip"
          style={{ width: liveW, opacity: active ? 1 : 0 }}
        >
          <span className="font-mono text-xs text-foreground tabular-nums">
            {clock(active ? elapsed : duration)}
          </span>
          <span
            className="ml-2 flex shrink-0 items-center"
            style={{
              width: WAVE_W,
              height: Math.round(d.h * 0.42),
              gap: BAR_GAP,
              marginRight: d.gap,
            }}
          >
            {bars.map((bar, i) => (
              <motion.span
                key={i}
                className={cn(
                  "block h-full rounded-full transition-colors",
                  isMuted ? "bg-ink-3" : "bg-[var(--line-chip-ring)]",
                )}
                style={{ width: BAR_W, scaleY: bar }}
              />
            ))}
          </span>
        </motion.span>

        <motion.span
          className="flex shrink-0 items-center overflow-clip"
          style={{ width: secW }}
        >
          <button
            type="button"
            tabIndex={hasSecondary ? undefined : -1}
            aria-hidden={hasSecondary ? undefined : true}
            aria-label={
              active
                ? isMuted
                  ? `${L.mute} microphone, on`
                  : `${L.mute} microphone`
                : `${L.decline} call from ${caller}`
            }
            aria-pressed={active ? isMuted : undefined}
            disabled={disabled}
            onClick={secondary}
            className={cn(
              btnBase,
              active
                ? isMuted
                  ? "bg-foreground text-background"
                  : "bg-surface-2 text-foreground hover:bg-hairline-strong"
                : "text-white hover:brightness-110",
            )}
            style={{
              width: d.btn,
              height: d.btn,
              background: active ? undefined : "var(--line-chip-end)",
              opacity: hasSecondary ? 1 : 0,
            }}
          >
            {active ? (
              isMuted ? (
                <MicOff style={{ width: d.icon, height: d.icon }} />
              ) : (
                <Mic style={{ width: d.icon, height: d.icon }} />
              )
            ) : (
              <Phone
                className="rotate-[135deg]"
                style={{ width: d.icon, height: d.icon }}
              />
            )}
          </button>
        </motion.span>

        <button
          ref={primaryRef}
          type="button"
          aria-label={primaryLabel}
          disabled={disabled}
          onClick={primary}
          className={cn(
            btnBase,
            primaryTone === "neutral"
              ? "bg-surface-2 text-foreground hover:bg-hairline-strong"
              : "text-white hover:brightness-110",
          )}
          style={{
            width: d.btn,
            height: d.btn,
            background:
              primaryTone === "ring"
                ? "var(--line-chip-ring)"
                : primaryTone === "end"
                  ? "var(--line-chip-end)"
                  : undefined,
          }}
        >
          <Phone
            className={cn(
              "transition-transform duration-300",
              handsetDown && "rotate-[135deg]",
            )}
            style={{ width: d.icon, height: d.icon }}
          />
        </button>
      </motion.div>

      {/* A hidden copy of the words, for the chip's natural width. */}
      <span
        ref={measureRef}
        aria-hidden
        className={cn(
          "pointer-events-none invisible absolute top-0 left-0 flex w-max flex-col leading-tight whitespace-nowrap",
          d.text,
        )}
      >
        <span data-text className="flex w-max flex-col">
          <span className="font-medium">{caller}</span>
          <span className="text-xs">{sub}</span>
        </span>
        <span data-clock className="w-max font-mono text-xs tabular-nums">
          {clock(Math.max(elapsed, start))}
        </span>
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {sentence}
      </span>
    </div>
  );
}
