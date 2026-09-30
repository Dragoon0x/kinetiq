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
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SlingSendTrajectory = "straight" | "arc" | "guided";

export type SlingSendProps = {
  /** Controlled draft. */
  value?: string;
  /** Initial draft when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires as the draft is typed, and with "" when the band fires. */
  onValueChange?: (value: string) => void;
  /** Fires the moment the band fires, with the message. */
  onSend?: (message: string) => void;
  /** The text field's accessible name. @default "Message" */
  label?: string;
  /** @default "Write a message" */
  placeholder?: string;
  /** The band's spring, 0 to 1: slack bands lob it, stiff ones fire it. @default 0.5 */
  stiffness?: number;
  /** How far the band pulls before it resists, in px, 60 to 140. @default 100 */
  maxStretch?: number;
  /** How the bubble flies once it leaves the band. @default "arc" */
  trajectory?: SlingSendTrajectory;
  /** A fading streak behind the bubble in flight. @default true */
  trail?: boolean;
  /** Play the band's sounds. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Flight = {
  phase: "band" | "free";
  /** Position relative to the rest point, and velocity, px and px/s. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The pull's direction, pointing back: the band fires the other way. */
  dx: number;
  dy: number;
  omega: number;
  /** Launch direction after the aim is clamped, and the least speed. */
  aimX: number;
  aimY: number;
  minSpeed: number;
  width: number;
  trail: { x: number; y: number }[];
};

type Flier = { text: string; key: number };

/** Below this share of the full stretch, letting go puts it back. */
const THRESHOLD = 0.3;
const FORK = 70;
const POUCH = 16;
const STEP = 1 / 240;
const MAX_STEPS = 12;
const ARC_GRAVITY = 900;
const TURN = 6;
const MAX_AIM = (50 * Math.PI) / 180;
const TRAIL = 10;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * A composer whose send button is a slingshot. The draft rides as a bubble
 * in the pouch of a rubber band strung between two posts. Pull it back — and
 * to one side to aim — and the band stretches 1:1 with the finger, thinning
 * and warming as it goes, creaking as it moves; past `maxStretch` it resists.
 * Let go past a third of the way and the band fires: a real spring drives the
 * bubble back through the rest point, it leaves the pouch at that speed and
 * flies out through the top of the frame along `trajectory`, and the band
 * wobbles back to rest. The message is sent the moment it fires. A short pull
 * puts it back, nothing sent.
 *
 * Enter in the text field sends with a full pull; on the bubble, Arrow keys
 * pull and aim, Enter lets go and Escape lets the band down. The flight runs
 * on an animation loop only while the bubble is in the band or the air. Under
 * reduced motion the bubble still follows the finger, but a sent message
 * fades where it is instead of flying, and nothing springs.
 */
export function SlingSend({
  value,
  defaultValue = "",
  onValueChange,
  onSend,
  label = "Message",
  placeholder = "Write a message",
  stiffness = 0.5,
  maxStretch = 100,
  trajectory = "arc",
  trail = true,
  sound = false,
  disabled = false,
  className,
}: SlingSendProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const gradientId = `${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-trail`;
  const stretchMax = clamp(maxStretch, 40, 200);
  const stiff = clamp(stiffness, 0, 1);
  const sky = Math.round(130 + stretchMax);
  const rest = Math.round(sky - stretchMax - 26);

  const [own, setOwn] = React.useState(defaultValue);
  const text = value ?? own;
  const empty = text.trim().length === 0;
  const [flier, setFlier] = React.useState<Flier | null>(null);
  const [shot, setShot] = React.useState(0);
  const [said, setSaid] = React.useState("");

  const bx = useMotionValue(0);
  const by = useMotionValue(rest);
  const qx = useMotionValue(0);
  const qy = useMotionValue(rest);
  const fx = useMotionValue(0);
  const fy = useMotionValue(rest);
  const frot = useMotionValue(0);
  const fade = useMotionValue(1);

  const frame = React.useRef<HTMLDivElement | null>(null);
  const bubble = React.useRef<HTMLButtonElement | null>(null);
  const trailPath = React.useRef<SVGPathElement | null>(null);
  const trailFill = React.useRef<SVGLinearGradientElement | null>(null);
  const flight = React.useRef<Flight | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const pouchRuns = React.useRef<AnimationPlaybackControls[]>([]);
  const loop = React.useRef<{ kick: () => void } | null>(null);
  const creak = React.useRef<LoopHandle | null>(null);
  const creakTimer = React.useRef(0);
  const held = React.useRef({ pull: 0, aim: 0, x: 0, y: 0, t: 0 });
  const armed = React.useRef(false);

  // The band's width and colour come from the pouch alone, so they follow
  // the pull, the launch and the wobble after it without being told.
  const stretch = useTransform([qx, qy] as MotionValue<number>[], ([x, y]) =>
    clamp(Math.hypot(x as number, (y as number) - rest) / stretchMax, 0, 1.4),
  );
  const bandPath = useTransform([qx, qy] as MotionValue<number>[], ([x, y]) => {
    const px = x as number;
    const py = y as number;
    const tip = rest + 4;
    const low = r2(py + 6);
    // Each half is one curve: straight off the fork tip toward the pouch's
    // side, then wrapping under the bubble, so it reads as one band at rest
    // and taut strands around a pouch when pulled.
    const lx = r2((-FORK + px - POUCH) / 2);
    const rx = r2((FORK + px + POUCH) / 2);
    const my = r2((tip + py + 3) / 2);
    return `M${-FORK} ${tip} C${lx} ${my} ${r2(px - 12)} ${low} ${r2(px)} ${low} C${r2(px + 12)} ${low} ${rx} ${my} ${FORK} ${tip}`;
  });
  // Rubber keeps its volume: the longer the band, the thinner it runs.
  const bandWidth = useTransform(stretch, (s) =>
    r2(lerp(2.4, 3.6, stiff) / Math.sqrt(1 + s * 1.6)),
  );
  const bandColor = useTransform(
    stretch,
    (s) =>
      `color-mix(in oklab, var(--warn) ${Math.round(clamp((s - 0.35) / 0.65, 0, 1) * 85)}%, var(--ink-2))`,
  );
  const tilt = useTransform(bx, (x) => r2(clamp(-x * 0.12, -12, 12)));
  // The hint gets out of the way as soon as the band starts to stretch.
  const hintOpacity = useTransform(stretch, (s) => r2(clamp(1 - s * 6, 0, 1)));
  const bubbleX = useTransform(bx, r2);
  const bubbleY = useTransform(by, r2);
  const flierX = useTransform(fx, r2);
  const flierY = useTransform(fy, r2);
  const flierTilt = useTransform(frot, r2);

  const pan = (x: number) => {
    const rect = frame.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2 + x, null) : 0;
  };

  const halt = () => {
    for (const run of runs.current) run.stop();
    runs.current = [];
  };

  const startCreak = () => {
    if (!creak.current) {
      creak.current = audio.start("creak", { gain: 0, pitch: 0.7 });
    }
  };
  const feedCreak = (s: number, speed: number) => {
    creak.current?.set({
      pitch: 0.7 + clamp(s, 0, 1.2) * 0.9,
      gain: clamp(s, 0, 1) * clamp(speed / 400, 0, 1) * 0.6,
    });
  };
  const stopCreak = () => {
    window.clearTimeout(creakTimer.current);
    creak.current?.stop();
    creak.current = null;
  };

  /** Moves the loaded bubble and the pouch together to a pull. */
  const place = (x: number, y: number) => {
    bx.set(r2(x));
    by.set(r2(y));
    qx.set(r2(x));
    qy.set(r2(y));
  };

  const setDraft = (next: string) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  /** The band holds the pull this far back (a share of the full stretch) and aimed. */
  const pullTo = (share: number, aim: number) => {
    const r = share * stretchMax;
    return { x: -Math.sin(aim) * r, y: rest + Math.cos(aim) * r };
  };

  const letDown = (velocity = { x: 0, y: 0 }) => {
    halt();
    stopCreak();
    held.current.pull = 0;
    if (!motionSafe) {
      place(0, rest);
      return;
    }
    runs.current = [
      animate(bx, 0, { ...springs.snap, velocity: velocity.x }),
      animate(by, rest, { ...springs.snap, velocity: velocity.y }),
      animate(qx, 0, { ...springs.snap, velocity: velocity.x }),
      animate(qy, rest, { ...springs.snap, velocity: velocity.y }),
    ];
  };

  const fire = () => {
    const px = bx.get();
    const py = by.get() - rest;
    const r = Math.hypot(px, py);
    const s = clamp(r / stretchMax, 0, 1.4);
    const message = text;
    halt();
    stopCreak();
    held.current.pull = 0;
    armed.current = false;
    audio.play("twang", {
      pitch: 0.8 + clamp(s, 0, 1) * 0.5,
      gain: 0.5,
      pan: pan(px),
    });
    setDraft("");
    onSend?.(message);
    setSaid("Message sent.");
    setFlier({ text: message, key: shot + 1 });
    setShot((n) => n + 1);
    fx.set(px);
    fy.set(rest + py);
    frot.set(0);
    fade.set(1);
    const width = bubble.current?.offsetWidth ?? 160;
    bx.set(0);
    by.set(rest);

    if (!motionSafe) {
      // The message is sent all the same: it fades where it was let go.
      qx.set(0);
      qy.set(rest);
      pouchRuns.current = [
        animate(fade, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: () => setFlier(null),
        }),
      ];
      return;
    }

    // Launch straight back along the pull, the aim held to ±50° of upright.
    const dx = r > 0 ? px / r : 0;
    const dy = r > 0 ? py / r : 1;
    const angle = clamp(Math.atan2(-dx, dy), -MAX_AIM, MAX_AIM);
    const omega = lerp(9, 18, stiff);
    // An arc has to clear the top: it leaves at least fast enough to.
    const climb = rest + 60;
    const minSpeed =
      trajectory === "arc"
        ? Math.sqrt(2 * ARC_GRAVITY * climb) / Math.max(0.5, Math.cos(angle))
        : 320;
    for (const run of pouchRuns.current) run.stop();
    pouchRuns.current = [];
    flight.current = {
      phase: "band",
      x: px,
      y: py,
      vx: 0,
      vy: 0,
      dx,
      dy,
      omega,
      aimX: Math.sin(angle),
      aimY: -Math.cos(angle),
      minSpeed,
      width,
      trail: [],
    };
    loop.current?.kick();
  };

  /** Let go of whatever pull the band holds: it fires, or it goes back. */
  const release = (velocity = { x: 0, y: 0 }) => {
    const r = Math.hypot(bx.get(), by.get() - rest);
    if (r / stretchMax < THRESHOLD || empty || disabled) {
      if (r > 1)
        audio.play("snap", { pitch: 1.2, gain: 0.3, pan: pan(bx.get()) });
      setSaid(empty ? "Nothing to send." : r > 1 ? "Too short to send." : "");
      letDown(velocity);
      return;
    }
    fire();
  };

  /** Enter: the band draws all the way back on its own, then fires. */
  const fullPull = () => {
    if (flier || empty || disabled || armed.current) {
      if (empty) setSaid("Nothing to send.");
      return;
    }
    const target = pullTo(1, held.current.aim);
    if (!motionSafe) {
      place(target.x, target.y);
      fire();
      return;
    }
    armed.current = true;
    halt();
    startCreak();
    const from = { x: bx.get(), y: by.get() };
    let last = 0;
    runs.current = [
      animate(0, 1, {
        duration: 0.22,
        ease: easings.move,
        onUpdate: (t) => {
          place(lerp(from.x, target.x, t), lerp(from.y, target.y, t));
          feedCreak(t, Math.abs(t - last) * 4000);
          last = t;
        },
        onComplete: () => {
          armed.current = false;
          fire();
        },
      }),
    ];
  };

  /** Arrow keys: pull back or ease off by a tenth, or aim by 10°. */
  const nudge = (pullBy: number, aimBy: number) => {
    const h = held.current;
    const before = h.pull;
    h.pull = clamp(Math.round((h.pull + pullBy) * 10) / 10, 0, 1);
    h.aim = clamp(h.aim + aimBy, -MAX_AIM, MAX_AIM);
    const target = pullTo(h.pull, h.aim);
    halt();
    if (motionSafe) {
      runs.current = [
        animate(bx, target.x, springs.glide),
        animate(by, target.y, springs.glide),
        animate(qx, target.x, springs.glide),
        animate(qy, target.y, springs.glide),
      ];
    } else {
      place(target.x, target.y);
    }
    if (h.pull > 0 || before > 0) {
      startCreak();
      feedCreak(h.pull, 500);
      window.clearTimeout(creakTimer.current);
      creakTimer.current = window.setTimeout(stopCreak, 260);
    }
    if (before < THRESHOLD && h.pull >= THRESHOLD) {
      setSaid("Pulled back far enough to send.");
    } else if (before >= THRESHOLD && h.pull < THRESHOLD) {
      setSaid("Too short to send.");
    }
  };

  const drag = useDrag({
    threshold: 3,
    disabled: disabled || empty || flier !== null,
    onStart: ({ event }) => {
      halt();
      armed.current = false;
      held.current = {
        ...held.current,
        x: bx.get(),
        y: by.get(),
        t: event.timeStamp,
      };
      startCreak();
    },
    onMove: ({ offset, delta, event }) => {
      const h = held.current;
      let x = h.x + offset.x;
      let y = h.y + offset.y - rest;
      // Forward, through the forks: the band will not give that way.
      if (y < 0) y = rubberband(y, 40);
      const r = Math.hypot(x, y);
      if (r > stretchMax) {
        const k =
          (stretchMax + rubberband(r - stretchMax, stretchMax * 0.5)) / r;
        x *= k;
        y *= k;
      }
      place(x, rest + y);
      const dt = Math.max(1, event.timeStamp - h.t);
      h.t = event.timeStamp;
      feedCreak(
        Math.hypot(x, y) / stretchMax,
        (Math.hypot(delta.x, delta.y) / dt) * 1000,
      );
    },
    onEnd: ({ velocity }) => {
      release(velocity);
    },
    onCancel: () => {
      letDown();
    },
  });

  const latest = React.useRef<{
    trail: boolean;
    top: number;
    side: number;
    mode: SlingSendTrajectory;
    onDetach: (vx: number, vy: number, speed: number) => void;
  }>({
    trail: true,
    top: rest,
    side: 180,
    mode: trajectory,
    onDetach: () => {},
  });
  React.useLayoutEffect(() => {
    latest.current = {
      trail,
      top: rest,
      side: (frame.current?.clientWidth ?? 360) / 2,
      mode: trajectory,
      onDetach: (vx, vy, speed) => {
        const k = clamp(speed / 1800, 0, 1);
        audio.play("whoosh", {
          pitch: 0.75 + k * 0.6,
          gain: 0.2 + k * 0.45,
          pan: pan(qx.get()),
        });
        // The band runs on past rest and wobbles back.
        for (const run of pouchRuns.current) run.stop();
        pouchRuns.current = [
          animate(qx, 0, { ...springs.recoil, velocity: vx * 0.35 }),
          animate(qy, rest, { ...springs.recoil, velocity: vy * 0.35 }),
        ];
      },
    };
  });

  // The flight: the band drives the bubble back through the rest point as a
  // spring, then it flies free until it has left the frame. Fixed steps, and
  // only while there is a flight; a hidden page ends it at once.
  React.useEffect(() => {
    let id = 0;
    let last: number | null = null;
    let acc = 0;
    const end = () => {
      flight.current = null;
      trailPath.current?.setAttribute("d", "");
      setFlier(null);
    };
    const frameFn = (t: number) => {
      id = 0;
      const f = flight.current;
      if (!f) return;
      if (document.hidden) {
        end();
        return;
      }
      acc +=
        last === null
          ? STEP * 4
          : Math.min((t - last) / 1000, STEP * MAX_STEPS);
      last = t;
      const { trail: streak, top, side, mode, onDetach } = latest.current;
      let steps = 0;
      let gone = false;
      while (acc >= STEP - 1e-6 && steps < MAX_STEPS && !gone) {
        acc -= STEP;
        steps += 1;
        if (f.phase === "band") {
          const k = f.omega * f.omega;
          f.vx -= k * f.x * STEP;
          f.vy -= k * f.y * STEP;
          f.x += f.vx * STEP;
          f.y += f.vy * STEP;
          if (f.x * f.dx + f.y * f.dy <= 0) {
            // Through the rest point: the bubble leaves the pouch at the speed
            // the band gave it, on the clamped aim.
            const speed = Math.max(Math.hypot(f.vx, f.vy), f.minSpeed);
            onDetach(f.vx, f.vy, speed);
            f.vx = f.aimX * speed;
            f.vy = f.aimY * speed;
            f.phase = "free";
          }
        } else {
          if (mode === "arc") {
            f.vy += ARC_GRAVITY * STEP;
          } else if (mode === "guided") {
            const speed = Math.hypot(f.vx, f.vy);
            const heading = Math.atan2(f.vx, -f.vy);
            const turn =
              Math.sign(heading) * Math.min(Math.abs(heading), TURN * STEP);
            const next = heading - turn;
            f.vx = Math.sin(next) * speed;
            f.vy = -Math.cos(next) * speed;
          }
          f.x += f.vx * STEP;
          f.y += f.vy * STEP;
        }
        const ay = top + f.y;
        if (ay < -4 || Math.abs(f.x) - f.width / 2 > side || ay > top + 400) {
          gone = true;
        }
      }
      if (steps === MAX_STEPS) acc = 0;
      const heading = Math.atan2(f.vx, -f.vy);
      fx.set(r2(f.x));
      fy.set(r2(top + f.y));
      frot.set(
        f.phase === "free"
          ? r2(clamp((heading * 180) / Math.PI / 2, -25, 25))
          : 0,
      );
      if (f.phase === "band") {
        qx.set(r2(f.x));
        qy.set(r2(top + f.y));
      }
      f.trail.push({ x: f.x, y: top + f.y - 18 });
      if (f.trail.length > TRAIL) f.trail.shift();
      const path = trailPath.current;
      const fill = trailFill.current;
      const head = f.trail[f.trail.length - 1];
      const tail = f.trail[0];
      if (path && fill && head && tail && f.phase === "free" && streak) {
        path.setAttribute(
          "d",
          f.trail
            .map((p, i) => `${i === 0 ? "M" : "L"}${r2(p.x)} ${r2(p.y)}`)
            .join(""),
        );
        fill.setAttribute("x1", String(r2(tail.x)));
        fill.setAttribute("y1", String(r2(tail.y)));
        fill.setAttribute("x2", String(r2(head.x)));
        fill.setAttribute("y2", String(r2(head.y)));
      }
      if (gone) {
        end();
        return;
      }
      id = window.requestAnimationFrame(frameFn);
    };
    loop.current = {
      kick: () => {
        if (id) return;
        last = null;
        acc = 0;
        id = window.requestAnimationFrame(frameFn);
      },
    };
    const onVisibility = () => {
      if (document.hidden && flight.current) {
        if (id) window.cancelAnimationFrame(id);
        id = 0;
        end();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (id) window.cancelAnimationFrame(id);
      id = 0;
      loop.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fx, fy, frot, qx, qy]);

  // A new frame size puts the band's rest point somewhere else.
  React.useEffect(() => {
    if (flight.current) return;
    halt();
    held.current.pull = 0;
    place(0, rest);
    // place writes motion values only; rest is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest]);

  React.useEffect(
    () => () => {
      window.clearTimeout(creakTimer.current);
      for (const run of runs.current) run.stop();
      for (const run of pouchRuns.current) run.stop();
    },
    [],
  );

  // Enter and Space arrive as the button's own click (no pointer behind it),
  // like any other press from a keyboard or assistive technology: a held
  // pull is let go, otherwise the band draws all the way back and fires.
  const press = () => {
    if (disabled || flier) return;
    if (held.current.pull > 0) release();
    else fullPull();
  };

  const onBubbleKey = (event: React.KeyboardEvent) => {
    if (disabled) return;
    // A held Enter would click again on every repeat: one press, one send.
    if (event.key === "Enter" && event.repeat) {
      event.preventDefault();
      return;
    }
    const h = held.current;
    if (event.key === "Escape") {
      if (h.pull === 0) return;
      event.preventDefault();
      setSaid("Let down, not sent.");
      letDown();
      return;
    }
    if (flier || empty) return;
    const step = {
      ArrowDown: [0.1, 0],
      ArrowUp: [-0.1, 0],
      ArrowLeft: [0, -Math.PI / 18],
      ArrowRight: [0, Math.PI / 18],
    }[event.key];
    if (!step) return;
    event.preventDefault();
    nudge(step[0] ?? 0, step[1] ?? 0);
  };

  return (
    <div
      ref={frame}
      className={cn(
        "relative w-full overflow-clip rounded-3 border border-hairline bg-card [contain:paint]",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        className="@container relative overflow-clip"
        style={{ height: sky }}
      >
        {empty || flier ? null : (
          <motion.p
            aria-hidden
            className="absolute inset-x-0 text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            style={{ top: sky - 22, opacity: hintOpacity }}
          >
            Pull back to send
          </motion.p>
        )}

        {/* The band runs behind the bubble: only the pouch shows beneath it. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <defs>
            <linearGradient
              ref={trailFill}
              id={gradientId}
              gradientUnits="userSpaceOnUse"
            >
              <stop
                offset="0"
                style={{ stopColor: "var(--primary)", stopOpacity: 0 }}
              />
              <stop
                offset="1"
                style={{ stopColor: "var(--primary)", stopOpacity: 0.45 }}
              />
            </linearGradient>
          </defs>
          <svg x="50%" y={0} overflow="visible">
            {trail && motionSafe ? (
              <path
                ref={trailPath}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {[-FORK, FORK].map((x) => (
              <g key={x} className="fill-ink-3">
                <rect x={x - 1.5} y={rest + 4} width={3} height={30} rx={1.5} />
                <circle cx={x} cy={rest + 4} r={4} />
              </g>
            ))}
            <motion.path
              d={bandPath}
              fill="none"
              stroke={bandColor}
              strokeWidth={bandWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </svg>

        {/* The loaded bubble stays mounted through a flight, so a keyboard
            user keeps focus on it: it hides as the flier leaves and the next
            draft reloads into the pouch once the flier is gone. */}
        <motion.div
          className="absolute top-0 left-1/2"
          style={{ x: bubbleX, y: bubbleY }}
          initial={false}
          animate={
            flier
              ? { opacity: 0, scale: motionSafe ? 0.85 : 1 }
              : { opacity: 1, scale: 1 }
          }
          transition={
            flier
              ? { duration: 0 }
              : motionSafe
                ? springs.snap
                : { duration: durations.fast }
          }
        >
          <motion.button
            ref={bubble}
            type="button"
            disabled={disabled}
            aria-label={empty ? "Send message" : `Send: ${text}`}
            aria-disabled={disabled || empty || undefined}
            aria-describedby={hintId}
            onKeyDown={onBubbleKey}
            onClick={(event) => {
              if (event.detail === 0) press();
            }}
            {...drag}
            className={cn(
              "absolute bottom-0 left-0 w-max max-w-[min(220px,calc(100cqw-32px))] -translate-x-1/2 touch-none rounded-3 px-3 py-2 text-left text-sm leading-snug outline-none select-none",
              "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
              empty
                ? "border border-dashed border-hairline-strong bg-surface-1 text-ink-3"
                : "cursor-grab bg-primary text-primary-foreground active:cursor-grabbing",
              disabled && "cursor-not-allowed",
            )}
            style={{ rotate: tilt, originY: 1 }}
          >
            <span className="line-clamp-3 break-words">
              {empty ? placeholder : text}
            </span>
          </motion.button>
        </motion.div>

        {flier ? (
          <motion.div
            key={flier.key}
            aria-hidden
            className="pointer-events-none absolute top-0 left-1/2"
            style={{ x: flierX, y: flierY, opacity: fade }}
          >
            <motion.div
              className="absolute bottom-0 left-0 w-max max-w-[min(220px,calc(100cqw-32px))] -translate-x-1/2 rounded-3 bg-primary px-3 py-2 text-sm leading-snug text-primary-foreground"
              style={{ rotate: flierTilt, originY: 0.5 }}
            >
              <span className="line-clamp-3 break-words">{flier.text}</span>
            </motion.div>
          </motion.div>
        ) : null}
      </div>

      <div className="border-t border-hairline p-2">
        <textarea
          value={text}
          disabled={disabled}
          aria-label={label}
          placeholder={placeholder}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            if (event.nativeEvent.isComposing) return;
            event.preventDefault();
            fullPull();
          }}
          className={cn(
            "block field-sizing-content max-h-24 w-full resize-none rounded-2 border border-hairline bg-surface-1 px-3 py-2 text-sm text-foreground outline-none placeholder:text-ink-3",
            "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:cursor-not-allowed",
          )}
        />
      </div>

      <p id={hintId} className="sr-only">
        Enter or Space sends with a full pull. Arrow Down pulls back, Arrow Up
        eases off, Arrow Left and Right aim, then Enter lets go. Escape lets the
        band down.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}
