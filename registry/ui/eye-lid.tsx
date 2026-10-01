"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type EyeLidSize = "sm" | "md" | "lg";

export type EyeLidProps = {
  /** Controlled state: true is hidden, the eye shut. */
  pressed?: boolean;
  /** Initial state when uncontrolled; true is hidden. @default false */
  defaultPressed?: boolean;
  /** Fires from the press that changed it, with true for hidden. */
  onPressedChange?: (hidden: boolean) => void;
  /** Text while the eye is open; also the accessible name then. @default "Visible" */
  shownLabel?: string;
  /** Text while the eye is shut; also the accessible name then. @default "Hidden" */
  hiddenLabel?: string;
  /** Icon only: a round button whose accessible name is still the label. @default false */
  compact?: boolean;
  /** How keenly the pupil chases the pointer, 0 to 1: a lazy, heavy gaze or a sharp one. @default 0.6 */
  follow?: number;
  /** How many slow blinks it takes to wake when opened, 0 to 3. @default 2 */
  blink?: number;
  /** How long one waking blink lasts, in ms. @default 260 */
  blinkDuration?: number;
  /** How many lashes the upper lid carries, 0 to 8. @default 5 */
  lashes?: number;
  /** Let the shut lid twitch when the pointer passes close. @default true */
  twitch?: boolean;
  /** How close the pointer must pass to make the shut lid twitch, in px. @default 72 */
  twitchRadius?: number;
  /** The iris colour. Any CSS colour. @default "var(--accent-bright)" */
  irisColor?: string;
  /** Button height 32, 40 or 48 px, with the eye scaled to match. @default "md" */
  size?: EyeLidSize;
  /** A tick each time the lids meet. Off unless asked for. @default false */
  sound?: boolean;
  /** @default false */
  disabled?: boolean;
  className?: string;
};

/** The eye's own box: lashes at full height above and hanging below both fit. */
const W = 40;
const H = 28;
/** The corners of the eye. */
const LX = 5;
const RX = 35;
const MY = 14;
/** Control offsets of the lids' cubics: the lower lid's, and the upper lid's wide open. */
const LOWER = 8;
const UPPER = -11;
/** Where the iris sits when it looks straight ahead. */
const IX = 20;
const IY = 13.4;
const IRIS = 6.1;
const PUPIL = 2.7;
/** How far the iris may travel from centre, and how much further the pupil goes. */
const REACH_X = 5;
const REACH_Y = 2.6;
const PARALLAX = 0.32;

const SIZES: Record<
  EyeLidSize,
  { glyph: number; box: string; square: string }
> = {
  sm: { glyph: 24, box: "h-8 gap-1.5 px-3 text-xs", square: "size-8" },
  md: { glyph: 30, box: "h-10 gap-2 px-3.5 text-sm", square: "size-10" },
  lg: { glyph: 36, box: "h-12 gap-2.5 px-4 text-[15px]", square: "size-12" },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** The upper lid's control offset for an openness: shut, it lies on the lower lid. */
const upperOf = (open: number) => lerp(LOWER, UPPER, clamp01(open));

/** A point and unit tangent on the upper lid's cubic, `t` of the way across. */
function lidAt(t: number, u: number) {
  const y1 = MY + u;
  const x0 = LX;
  const x1 = LX + 6;
  const x2 = RX - 6;
  const x3 = RX;
  const m = 1 - t;
  const x =
    m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3;
  const y =
    m * m * m * MY + 3 * m * m * t * y1 + 3 * m * t * t * y1 + t * t * t * MY;
  const dx =
    3 * m * m * (x1 - x0) + 6 * m * t * (x2 - x1) + 3 * t * t * (x3 - x2);
  const dy = 3 * m * m * (y1 - MY) + 3 * t * t * (MY - y1);
  const len = Math.hypot(dx, dy) || 1;
  return { x, y, tx: dx / len, ty: dy / len };
}

/**
 * Lashes along the upper lid, the middle ones longest and the outer ones
 * fanned toward the corners. They point up off an open lid and hang down off
 * a shut one: their direction follows which way the lid bows, so they swing
 * over as it closes, passing through nothing at the moment it lies flat.
 */
function lashPath(count: number, u: number): string {
  if (count <= 0) return "";
  const flip = Math.max(-1, Math.min(1, -u / 4));
  if (Math.abs(flip) < 0.02) return "";
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : lerp(0.2, 0.8, i / (count - 1));
    const { x, y, tx, ty } = lidAt(t, u);
    const len = lerp(2.3, 3.7, 1 - Math.abs(t - 0.5) * 2);
    const nx = ty;
    const ny = -tx;
    const fan = (t - 0.5) * 0.9 * Math.abs(flip);
    const ex = x + (nx * flip + fan) * len;
    const ey = y + ny * flip * len;
    parts.push(`M ${r2(x)} ${r2(y)} L ${r2(ex)} ${r2(ey)}`);
  }
  return parts.join(" ");
}

type Phase = "open" | "closed" | "waking";
type Intent = { to: boolean; until: number; pan: number };
type Api = {
  onPointer: (x: number, y: number) => void;
  onAway: () => void;
};

/**
 * A show/hide toggle drawn as an eye that watches. While it is open the iris
 * and pupil follow the pointer anywhere on the page, held inside the eye and
 * eased on a spring whose keenness is `follow`. Pressing it blinks the lid
 * shut on the snap spring, the lashes swinging over as the lid's curve turns,
 * and the label becomes "Hidden". Shut, it sleeps — but the lid twitches when
 * the pointer passes close. Opening it wakes it slowly: a couple of heavy
 * blinks, then the gaze finds the pointer again on the glide spring.
 *
 * It is a `<button>` with `aria-pressed` (pressed is hidden); Space and Enter
 * toggle it. The pointer-following is decoration: it only listens while the
 * eye is on screen and the page is visible. Under reduced motion the eye
 * neither watches, twitches nor blinks — the lid swaps between open and shut
 * at once — and the label still changes.
 */
export function EyeLid({
  pressed,
  defaultPressed = false,
  onPressedChange,
  shownLabel = "Visible",
  hiddenLabel = "Hidden",
  compact = false,
  follow = 0.6,
  blink = 2,
  blinkDuration = 260,
  lashes = 5,
  twitch = true,
  twitchRadius = 72,
  irisColor = "var(--accent-bright)",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: EyeLidProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `eye-lid-${uid}`;
  const s = SIZES[size] ?? SIZES.md;
  const keen = clamp01(follow);
  const lashCount = Math.max(0, Math.min(8, Math.round(lashes)));

  const [own, setOwn] = React.useState(defaultPressed);
  const hidden = pressed ?? own;
  const label = hidden ? hiddenLabel : shownLabel;

  const open = useMotionValue(hidden ? 0 : 1);
  const lookX = useMotionValue(0);
  const lookY = useMotionValue(0);

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const gaze = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const intent = React.useRef<Intent | null>(null);
  const shown = React.useRef(hidden);
  const phase = React.useRef<Phase>(hidden ? "closed" : "open");
  const pointer = React.useRef<{ x: number; y: number } | null>(null);
  const near = React.useRef(false);
  const lastTwitch = React.useRef(0);
  const api = React.useRef<Api | null>(null);

  const halt = React.useCallback(() => {
    for (const a of running.current) a.stop();
    running.current = [];
    for (const a of gaze.current) a.stop();
    gaze.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);
  const run = (...controls: AnimationPlaybackControls[]) => {
    running.current.push(...controls);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.max(0, Math.round(ms))));
  };

  /** Where the gaze should rest for a pointer at (x, y), in drawing units. */
  const aimFor = (x: number, y: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { tx: 0, ty: 0, d: Infinity };
    const cx = rect.left + (rect.width * IX) / W;
    const cy = rect.top + (rect.height * IY) / H;
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return { tx: 0, ty: 0, d };
    // A far pointer pulls the gaze all the way round; a near one only a
    // little, so the eye does not cross itself watching the button.
    const reach = lerp(320, 90, keen);
    const m = 1 - Math.exp(-d / reach);
    return {
      tx: r2((dx / d) * m * REACH_X),
      ty: r2((dy / d) * m * REACH_Y),
      d,
    };
  };

  const look = (tx: number, ty: number, transition: Transition) => {
    for (const a of gaze.current) a.stop();
    gaze.current = [
      animate(lookX, tx, transition),
      animate(lookY, ty, transition),
    ];
  };

  const gazeSpring = () => spring(lerp(70, 700, keen), lerp(1, 0.75, keen));

  const tick = (gain: number, pan: number) =>
    audio.play("tick", { pitch: 0.92, gain, pan });

  /** Wide awake: the gaze goes to the pointer, if there is one. */
  const wake = () => {
    phase.current = "open";
    const p = pointer.current;
    if (!p || disabled) return;
    const { tx, ty } = aimFor(p.x, p.y);
    look(tx, ty, springs.glide);
  };

  /** Carries the lid to shut or open. */
  const perform = (toHidden: boolean, pan: number | null) => {
    halt();
    if (!motionSafe) {
      open.jump(toHidden ? 0 : 1);
      lookX.jump(0);
      lookY.jump(0);
      phase.current = toHidden ? "closed" : "open";
      if (pan !== null) tick(0.5, pan);
      return;
    }
    look(0, 0, springs.glide);
    if (toHidden) {
      phase.current = "closed";
      // The hand that shut it is still beside it: the eye only stirs once
      // the pointer has gone and come back, or after it has slept a while.
      near.current = true;
      lastTwitch.current = performance.now();
      run(animate(open, 0, springs.snap));
      // Heard where the lids meet, not at the press.
      if (pan !== null) later(80, () => tick(0.5, pan));
      return;
    }
    phase.current = "waking";
    const n = Math.max(0, Math.min(3, Math.round(blink)));
    if (n === 0) {
      run(animate(open, 1, { ...springs.snap, onComplete: wake }));
      return;
    }
    // Each waking blink opens a little wider than the last, then falls shut
    // again; the last one stays open. More than two keyframes, so a tween.
    const d = Math.max(80, blinkDuration) / 1000;
    const keys = [0];
    const at = [0];
    let t = 0;
    for (let i = 0; i < n; i += 1) {
      keys.push(r2(lerp(0.42, 0.68, n === 1 ? 1 : i / (n - 1))), 0.04);
      at.push(t + d * 0.5, t + d);
      if (pan !== null) {
        const touch = (t + d) * 1000;
        later(touch, () => tick(0.26, pan));
      }
      t += d;
    }
    keys.push(1);
    t += d * 0.6;
    at.push(t);
    run(
      animate(open, keys, {
        duration: t,
        times: at.map((x) => Number((x / t).toFixed(4))),
        ease: "easeInOut",
        onComplete: wake,
      }),
    );
  };

  // Every change of state — a press or the host — runs the same lid; only a
  // change the visitor asked for is heard.
  React.useEffect(() => {
    if (shown.current === hidden) return;
    shown.current = hidden;
    const it = intent.current;
    const audible = !!it && it.to === hidden && performance.now() < it.until;
    if (audible) intent.current = null;
    perform(hidden, audible && it ? it.pan : null);
    // Runs on a change of state only; perform reads the latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  React.useEffect(() => {
    api.current = {
      onPointer: (x, y) => {
        pointer.current = { x, y };
        if (!motionSafe || disabled) return;
        const { tx, ty, d } = aimFor(x, y);
        if (phase.current === "open") {
          look(tx, ty, gazeSpring());
          return;
        }
        if (phase.current !== "closed" || !twitch) return;
        const inside = d < Math.max(0, twitchRadius);
        const now = performance.now();
        // Asleep, it stirs when something passes close: on the way in, and
        // again if the pointer keeps moving about near it.
        if (inside && (!near.current || now - lastTwitch.current > 2000)) {
          if (now - lastTwitch.current > 700) {
            lastTwitch.current = now;
            const from = Math.max(0, open.get());
            run(
              animate(open, [from, 0.16, 0.03, 0.1, 0], {
                duration: 0.34,
                ease: "easeOut",
              }),
            );
          }
        }
        near.current = inside;
      },
      onAway: () => {
        pointer.current = null;
        near.current = false;
        if (phase.current === "open") look(0, 0, springs.glide);
      },
    };
  });

  // The eye only listens while it is on screen and the page is visible; one
  // reading per frame, however fast the pointer reports.
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let visible = false;
    let attached = false;
    let raf = 0;
    let px = 0;
    let py = 0;
    const flush = () => {
      raf = 0;
      api.current?.onPointer(px, py);
    };
    const onMove = (event: PointerEvent) => {
      px = event.clientX;
      py = event.clientY;
      if (!raf) raf = window.requestAnimationFrame(flush);
    };
    const onOut = (event: MouseEvent) => {
      if (!event.relatedTarget) api.current?.onAway();
    };
    const attach = () => {
      if (attached) return;
      attached = true;
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("mouseout", onOut);
    };
    const detach = () => {
      if (!attached) return;
      attached = false;
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onOut);
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible && !document.hidden) attach();
      else detach();
    });
    io.observe(el);
    const onVisibility = () => {
      if (document.hidden) detach();
      else if (visible) attach();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      detach();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Disabled, or moved to reduced motion, the gaze comes home.
  React.useEffect(() => {
    if (disabled || !motionSafe) {
      for (const a of gaze.current) a.stop();
      gaze.current = [];
      lookX.jump(0);
      lookY.jump(0);
    }
  }, [disabled, motionSafe, lookX, lookY]);

  React.useEffect(() => halt, [halt]);

  const press = (at: number, clientX: number | null) => {
    if (disabled) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    const x = clientX ?? (rect ? rect.left + rect.width / 2 : 0);
    const pan = panFrom(x, null);
    const next = !hidden;
    // The event's own timestamp is on the same clock as performance.now().
    intent.current = { to: next, until: at + 1500, pan };
    if (pressed === undefined) setOwn(next);
    onPressedChange?.(next);
  };

  const upper = useTransform(open, (o) => {
    const y = r2(MY + upperOf(o));
    return `M ${LX} ${MY} C ${LX + 6} ${y} ${RX - 6} ${y} ${RX} ${MY}`;
  });
  const white = useTransform(open, (o) => {
    const y = r2(MY + upperOf(o));
    return `M ${LX} ${MY} C ${LX + 6} ${y} ${RX - 6} ${y} ${RX} ${MY} C ${RX - 6} ${MY + LOWER} ${LX + 6} ${MY + LOWER} ${LX} ${MY} Z`;
  });
  const lashLine = useTransform(open, (o) => lashPath(lashCount, upperOf(o)));
  const irisX = useTransform(lookX, (x) => r2(IX + x));
  const irisY = useTransform(lookY, (y) => r2(IY + y));
  const pupilX = useTransform(lookX, (x) => r2(IX + x * (1 + PARALLAX)));
  const pupilY = useTransform(lookY, (y) => r2(IY + y * (1 + PARALLAX)));
  const shineX = useTransform(pupilX, (x) => r2(x - 1.5));
  const shineY = useTransform(pupilY, (y) => r2(y - 1.6));

  return (
    <span className={cn("inline-flex", className)}>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-pressed={hidden}
        aria-label={compact ? label : undefined}
        disabled={disabled}
        onClick={(event) => {
          // Space, Enter and assistive technology arrive with no pointer
          // behind them; they pan from the button's middle.
          press(event.timeStamp, event.detail === 0 ? null : event.clientX);
        }}
        whileTap={motionSafe && !disabled ? { scale: 0.97 } : undefined}
        transition={springs.flick}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-full border font-medium whitespace-nowrap transition-colors outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
          compact ? s.square : s.box,
          hidden
            ? "border-hairline-strong bg-surface-2 text-foreground"
            : "border-hairline-strong bg-surface-1 text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
        )}
      >
        <svg
          ref={svgRef}
          aria-hidden
          width={s.glyph}
          height={r2((s.glyph * H) / W)}
          viewBox={`0 0 ${W} ${H}`}
          className="block shrink-0"
        >
          <defs>
            <clipPath id={clipId}>
              <motion.path d={white} />
            </clipPath>
          </defs>
          <motion.path
            d={white}
            style={{ fill: "oklch(from var(--ink) 0.97 0.006 h)" }}
          />
          <g clipPath={`url(#${clipId})`}>
            <motion.circle
              cx={irisX}
              cy={irisY}
              r={IRIS}
              strokeWidth={0.8}
              style={{
                fill: irisColor,
                stroke: `color-mix(in oklab, ${irisColor} 55%, black)`,
              }}
            />
            <motion.circle
              cx={pupilX}
              cy={pupilY}
              r={PUPIL}
              style={{ fill: "oklch(from var(--ink) 0.2 0.02 h)" }}
            />
            <motion.circle cx={shineX} cy={shineY} r={1} fill="white" />
          </g>
          <path
            d={`M ${LX} ${MY} C ${LX + 6} ${MY + LOWER} ${RX - 6} ${MY + LOWER} ${RX} ${MY}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeLinecap="round"
            opacity={0.55}
          />
          <motion.path
            d={upper}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
          />
          <motion.path
            d={lashLine}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        </svg>
        {compact ? null : (
          <span className="grid text-left">
            {[false, true].map((state) => {
              const active = state === hidden;
              return (
                <motion.span
                  key={String(state)}
                  aria-hidden={active ? undefined : true}
                  className="col-start-1 row-start-1"
                  initial={false}
                  animate={
                    active
                      ? {
                          opacity: 1,
                          y: motionSafe ? [distances.nudge, 0] : 0,
                        }
                      : { opacity: 0, y: motionSafe ? -distances.nudge : 0 }
                  }
                  transition={
                    active
                      ? {
                          opacity: {
                            duration: durations.fast,
                            delay: 0.03,
                            ease: easings.enter,
                          },
                          y: springs.snap,
                        }
                      : exitFor(durations.blink)
                  }
                >
                  {state ? hiddenLabel : shownLabel}
                </motion.span>
              );
            })}
          </span>
        )}
      </motion.button>
    </span>
  );
}
