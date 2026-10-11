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
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SteelCardMetal = "steel" | "titanium" | "gold" | "black";
export type SteelCardEdge = "bevel" | "flat" | "gilt" | "ink";

export type SteelCardProps = {
  /** The cardholder's name, etched along the bottom. @default "Ada Lindqvist" */
  name?: string;
  /** The card number, etched in groups. @default "9404 1728 3356 0812" */
  number?: string;
  /** Expiry, as printed. @default "09/29" */
  expiry?: string;
  /** The issuer's wordmark, top left. @default "Coldbrook" */
  issuer?: string;
  /** The metal: brushed steel, titanium, gold or black steel (etched bright). @default "steel" */
  metal?: SteelCardMetal;
  /** Direction of the brushing, degrees from horizontal. @default 0 */
  brushAngle?: number;
  /** The edge: a polished bevel, a flat cut, a gilt edge or an ink-black one. @default "bevel" */
  edge?: SteelCardEdge;
  /** How far the card tilts toward the pointer, degrees. @default 14 */
  tilt?: number;
  /** Strength of the brushed highlight, 0 to 1. @default 0.7 */
  gloss?: number;
  /** How much of its speed the card keeps when it hits the table, 0 to 1. @default 0.35 */
  bounce?: number;
  /** How long the card lies on the table before it rights itself, ms. @default 900 */
  rightAfter?: number;
  /** Show only the last four digits. @default false */
  mask?: boolean;
  /** Draw the contact chip. @default true */
  chip?: boolean;
  /** Draw the contactless mark. @default true */
  contactless?: boolean;
  /** Play the clink when it lands. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires when a flick, Enter or Space drops the card. */
  onDrop?: () => void;
  /** The card's accessible name. @default issuer, metal, last four digits and name */
  label?: string;
  /** No tilting, dropping or keys. @default false */
  disabled?: boolean;
  /** Sizes the stage; the card is up to 280px wide and centred. */
  className?: string;
};

type MetalStyle = {
  hi: string;
  lo: string;
  etch: string;
  bevelHi: string;
  bevelLo: string;
  /** The clink's register: denser metals ring lower. */
  pitch: number;
};

/** Pigments at fixed lightness, from token hues: a metal looks the same in both themes. */
const METALS: Record<SteelCardMetal, MetalStyle> = {
  steel: {
    hi: "oklch(from var(--ink-3) 0.87 0.006 h)",
    lo: "oklch(from var(--ink-3) 0.63 0.01 h)",
    etch: "oklch(from var(--ink-3) 0.4 0.014 h)",
    bevelHi: "oklch(from var(--ink-3) 0.97 0.004 h)",
    bevelLo: "oklch(from var(--ink-3) 0.45 0.012 h)",
    pitch: 1.3,
  },
  titanium: {
    hi: "oklch(from var(--warn) 0.72 0.014 h)",
    lo: "oklch(from var(--warn) 0.49 0.014 calc(h + 10))",
    etch: "oklch(from var(--warn) 0.3 0.012 h)",
    bevelHi: "oklch(from var(--warn) 0.86 0.012 h)",
    bevelLo: "oklch(from var(--warn) 0.34 0.012 h)",
    pitch: 1.16,
  },
  gold: {
    hi: "oklch(from var(--warn) 0.88 0.085 calc(h + 4))",
    lo: "oklch(from var(--warn) 0.64 0.11 calc(h - 10))",
    etch: "oklch(from var(--warn) 0.42 0.08 calc(h - 14))",
    bevelHi: "oklch(from var(--warn) 0.96 0.05 h)",
    bevelLo: "oklch(from var(--warn) 0.5 0.1 calc(h - 12))",
    pitch: 1.04,
  },
  black: {
    hi: "oklch(from var(--ink-3) 0.36 0.008 h)",
    lo: "oklch(from var(--ink-3) 0.19 0.008 h)",
    etch: "oklch(from var(--ink-3) 0.8 0.006 h)",
    bevelHi: "oklch(from var(--ink-3) 0.62 0.006 h)",
    bevelLo: "oklch(from var(--ink-3) 0.1 0.006 h)",
    pitch: 0.96,
  },
};

const GILT = "oklch(from var(--warn) 0.8 0.11 calc(h - 4))";
const INK_EDGE = "oklch(from var(--ink-3) 0.16 0.01 h)";

/** The angle the card lies at on the table: the table is seen from above. */
const FLAT = 64;
/** Gravity over the card's length, rad/s²: a fall of about a third of a second. */
const FALL_K = 40;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Phase = "rest" | "falling" | "lying" | "righting";

const groups = (number: string, mask: boolean) => {
  const digits = number.replace(/\D/g, "");
  const out: string[] = [];
  for (let i = 0; i < digits.length; i += 4) out.push(digits.slice(i, i + 4));
  if (!mask) return out;
  return out.map((g, i) => (i === out.length - 1 ? g : "••••"));
};

/**
 * A payment card cut from brushed metal and held upright over a table. The
 * brushing is a fractal-noise field stretched along `brushAngle` and laid over
 * the metal in overlay, so fine grooves run across the face; brushed metal
 * reflects anisotropically, so the light is a long streak across the grain,
 * with a darker band beside it. As the card tilts toward the pointer (its
 * target followed on the glide spring) the streak slides along the grain and
 * turns with the tilt across it, and a broad sheen follows the pointer.
 * Number, name and expiry are laser-etched: dark matte lettering with a
 * bevel on bright metals, bare bright steel on black.
 *
 * Flick it — drag, it follows 1:1 and leans with the pull; let go fast — and
 * it falls back onto the table, pivoting on its bottom edge under gravity (a
 * falling-slab integrator, not a spring), lands flat with one or two bounces
 * whose size is `bounce` and a clink on the first, skewed by any sideways
 * throw, then after `rightAfter` ms stands back up on the glide spring.
 *
 * It is a button: focus tilts it into a three-quarter pose, arrow keys lean
 * it, Enter or Space drop it and Escape rights it at once. Under reduced
 * motion it never tilts or falls; the light still follows the pointer and
 * focus, and a drop is a sweep of light and the clink.
 */
export function SteelCard({
  name = "Ada Lindqvist",
  number = "9404 1728 3356 0812",
  expiry = "09/29",
  issuer = "Coldbrook",
  metal = "steel",
  brushAngle = 0,
  edge = "bevel",
  tilt = 14,
  gloss = 0.7,
  bounce = 0.35,
  rightAfter = 900,
  mask = false,
  chip = true,
  contactless = true,
  sound = false,
  onDrop,
  label,
  disabled = false,
  className,
}: SteelCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const m = METALS[metal] ?? METALS.steel;
  const g = Math.round(((brushAngle % 180) + 180) % 180);
  const digits = groups(number, mask);
  const last4 = number.replace(/\D/g, "").slice(-4);
  const name1 = label ?? `${issuer} ${metal} card ending ${last4}, ${name}`;

  // Light position (−1..1 each way) drives the highlight; the rotation is the
  // same numbers times `tilt`, and is left at zero under reduced motion.
  const lx = useMotionValue(0);
  const ly = useMotionValue(0);
  const fall = useMotionValue(0);
  const skew = useMotionValue(0);
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const press = useMotionValue(1);
  const sweep = useMotionValue(0);

  const [phase, setPhase] = React.useState<Phase>("rest");
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const raf = React.useRef(0);
  const timer = React.useRef<number | null>(null);
  const phaseRef = React.useRef<Phase>("rest");
  const focusPose = React.useRef<{ x: number; y: number } | null>(null);
  const dragging = React.useRef(false);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const run = (key: string, c: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, c);
  };

  const halt = React.useCallback(() => {
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  /** Moves the light (and so the tilt) toward a target. */
  const aim = (x: number, y: number) => {
    const tx = clamp(x, -1.4, 1.4);
    const ty = clamp(y, -1.4, 1.4);
    if (!motionSafe) {
      anims.current.get("lx")?.stop();
      anims.current.get("ly")?.stop();
      lx.set(r2(tx));
      ly.set(r2(ty));
      return;
    }
    run("lx", animate(lx, tx, springs.glide));
    run("ly", animate(ly, ty, springs.glide));
  };

  const rest = () => {
    const p = focusPose.current;
    aim(p ? p.x : 0, p ? p.y : 0);
  };

  /** Stands the card back up. */
  const right = (now = false) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (phaseRef.current === "rest") return;
    setPhaseBoth("righting");
    const t = !motionSafe || now ? { duration: durations.fast } : springs.glide;
    run("dx", animate(dx, 0, t));
    run("dy", animate(dy, 0, t));
    run("skew", animate(skew, 0, t));
    run(
      "fall",
      animate(fall, 0, {
        ...t,
        onComplete: () => {
          setPhaseBoth("rest");
          say("Upright.");
        },
      }),
    );
    rest();
  };

  const land = () => {
    setPhaseBoth("lying");
    say("On the table.");
    timer.current = window.setTimeout(() => right(), Math.max(0, rightAfter));
  };

  const clink = (strength: number, second: boolean) => {
    const el = buttonRef.current;
    const rect = el?.getBoundingClientRect();
    audio.play("clack", {
      pitch: m.pitch * (second ? 1.22 : 1),
      gain: clamp(strength, 0.12, 0.7),
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  /** Drops the card: a flick's velocity, or a keyboard drop's default throw. */
  const drop = (vx = 0, vy = 0) => {
    if (disabled) return;
    halt();
    onDrop?.();
    if (!motionSafe) {
      sweep.jump(0);
      run(
        "sweep",
        animate(sweep, 1, { duration: durations.page, ease: easings.move }),
      );
      clink(0.55, false);
      setPhaseBoth("lying");
      say("On the table.");
      timer.current = window.setTimeout(
        () => {
          sweep.jump(0);
          setPhaseBoth("rest");
          say("Upright.");
        },
        Math.max(0, rightAfter),
      );
      return;
    }
    setPhaseBoth("falling");
    run("skew", animate(skew, clamp(vx / 110, -12, 12), springs.glide));
    run("lx", animate(lx, 0, springs.glide));
    run("ly", animate(ly, -0.6, springs.glide));
    // The card is a slab pivoting on its bottom edge: φ'' = K sin φ, with
    // φ the true angle to the vertical (0..90°) drawn as 0..FLAT on screen.
    let phi = (fall.get() / FLAT) * (Math.PI / 2) + 0.02;
    let w = clamp(1.6 + Math.hypot(vx, vy) / 420, 1.8, 6.5);
    const e = clamp(bounce, 0, 0.9);
    let impacts = 0;
    let lastT = 0;
    const step = (now: number) => {
      const dt = lastT ? Math.min(1 / 30, (now - lastT) / 1000) : 1 / 60;
      lastT = now;
      let left = dt;
      while (left > 0) {
        const h = Math.min(1 / 480, left);
        left -= h;
        w += FALL_K * Math.sin(Math.max(phi, 0.0001)) * h;
        phi += w * h;
        if (phi >= Math.PI / 2) {
          phi = Math.PI / 2;
          const speed = Math.abs(w);
          impacts += 1;
          if (impacts <= 2) clink(speed / 13, impacts === 2);
          if (speed * e < 1.4 || impacts >= 3) {
            fall.set(FLAT);
            raf.current = 0;
            land();
            return;
          }
          w = -speed * e;
        }
      }
      fall.set(r2((phi / (Math.PI / 2)) * FLAT));
      raf.current = window.requestAnimationFrame(step);
    };
    raf.current = window.requestAnimationFrame(step);
  };

  // A drop interrupted by StrictMode's rehearsal, or an unmount, finishes
  // standing up rather than freezing part-way through the fall.
  React.useEffect(() => {
    const running = anims.current;
    if (Math.abs(fall.get()) > 0.01 || Math.abs(dx.get()) > 0.01) {
      fall.set(0);
      dx.set(0);
      dy.set(0);
      skew.set(0);
    }
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      if (raf.current) window.cancelAnimationFrame(raf.current);
      raf.current = 0;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      phaseRef.current = "rest";
    };
  }, [fall, dx, dy, skew]);

  // A disabled card, or one whose motion was reduced mid-drop, stands up.
  React.useEffect(() => {
    if (!disabled && motionSafe) return;
    if (phaseRef.current !== "rest") {
      if (raf.current) window.cancelAnimationFrame(raf.current);
      raf.current = 0;
      fall.jump(0);
      skew.jump(0);
      dx.jump(0);
      dy.jump(0);
      sweep.jump(0);
    }
    if (!motionSafe) {
      // The light keeps its place; only the rotation goes.
      lx.jump(r2(lx.get()));
      ly.jump(r2(ly.get()));
    }
  }, [disabled, motionSafe, fall, skew, dx, dy, sweep, lx, ly]);

  const maxDrag = 44;
  const gesture = useDrag({
    threshold: 4,
    disabled: disabled || phase !== "rest",
    onStart: () => {
      dragging.current = true;
      anims.current.get("dx")?.stop();
      anims.current.get("dy")?.stop();
    },
    onMove: ({ offset }) => {
      if (!motionSafe) return;
      dx.set(r2(rubberClamp(offset.x, -maxDrag, maxDrag, maxDrag * 2)));
      dy.set(r2(rubberClamp(offset.y, -maxDrag, maxDrag, maxDrag * 2)));
      // The card leans into the pull, so the light runs across it.
      aim(offset.x / 70, offset.y / 70);
    },
    onEnd: ({ velocity, offset }) => {
      dragging.current = false;
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > 650 || (offset.y > 36 && velocity.y > 260)) {
        drop(velocity.x, velocity.y);
        return;
      }
      if (motionSafe) {
        run("dx", animate(dx, 0, { ...springs.glide, velocity: velocity.x }));
        run("dy", animate(dy, 0, { ...springs.glide, velocity: velocity.y }));
      }
      rest();
    },
    onCancel: () => {
      dragging.current = false;
      dx.set(0);
      dy.set(0);
      rest();
    },
    onTap: () => {
      if (!motionSafe) return;
      press.jump(0.982);
      run("press", animate(press, 1, springs.flick));
    },
  });

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    gesture.onPointerMove(event);
    if (disabled || dragging.current || phaseRef.current !== "rest") return;
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    aim(x, y);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Escape") {
      if (phaseRef.current !== "rest") {
        event.preventDefault();
        right(true);
      }
      return;
    }
    const step = 0.35;
    const p = focusPose.current ?? { x: 0, y: 0 };
    let next: { x: number; y: number } | null = null;
    if (event.key === "ArrowLeft") next = { x: p.x - step, y: p.y };
    else if (event.key === "ArrowRight") next = { x: p.x + step, y: p.y };
    else if (event.key === "ArrowUp") next = { x: p.x, y: p.y - step };
    else if (event.key === "ArrowDown") next = { x: p.x, y: p.y + step };
    if (!next) return;
    event.preventDefault();
    focusPose.current = {
      x: r2(clamp(next.x, -1.4, 1.4)),
      y: r2(clamp(next.y, -1.4, 1.4)),
    };
    if (phaseRef.current === "rest") rest();
  };

  /* ------------------------------ the light ------------------------------ */

  const k = clamp(gloss, 0, 1);
  const rotateY = useTransform(lx, (v) => (motionSafe ? r2(v * tilt) : 0));
  const rotateX = useTransform(ly, (v) => (motionSafe ? r2(-v * tilt) : 0));
  const rad = (g * Math.PI) / 180;
  const streak = useTransform(
    [lx, ly, sweep] as MotionValue<number>[],
    ([x, y, s]) => {
      const vx = x as number;
      const vy = y as number;
      // Along the grain the streak slides; across it, it turns a little.
      const along = vx * Math.cos(rad) + vy * Math.sin(rad);
      const across = -vx * Math.sin(rad) + vy * Math.cos(rad);
      const sw = s as number;
      const at = r2(sw > 0 ? -30 + sw * 160 : clamp(50 - along * 34, -10, 110));
      const angle = r2(90 + g + across * 9);
      const a = (v: number) => r2(v * (0.25 + 0.75 * k));
      return [
        `linear-gradient(${angle}deg,`,
        `transparent ${r2(at - 46)}%,`,
        `rgb(0 0 0 / ${a(0.16)}) ${r2(at - 30)}%,`,
        `transparent ${r2(at - 20)}%,`,
        `rgb(255 255 255 / ${a(0.12)}) ${r2(at - 12)}%,`,
        `rgb(255 255 255 / ${a(0.62)}) ${at}%,`,
        `rgb(255 255 255 / ${a(0.12)}) ${r2(at + 12)}%,`,
        `transparent ${r2(at + 20)}%,`,
        `rgb(0 0 0 / ${a(0.12)}) ${r2(at + 32)}%,`,
        `transparent ${r2(at + 46)}%)`,
      ].join(" ");
    },
  );
  const sheen = useTransform([lx, ly] as MotionValue<number>[], ([x, y]) => {
    const px = r2(50 + (x as number) * 36);
    const py = r2(40 + (y as number) * 30);
    return `radial-gradient(90% 70% at ${px}% ${py}%, rgb(255 255 255 / ${r2(0.22 * k)}), transparent 62%)`;
  });

  /* ------------------------------ the table ------------------------------ */

  const flat = useTransform(fall, (f) => clamp(f / FLAT, 0, 1));
  // Upright, a thin line at the edge; lying, the card's own footprint.
  const shadowScale = useTransform(flat, (f) => r2(0.12 + f * 0.88));
  const shadowOpacity = useTransform(flat, (f) => r2(0.62 - f * 0.22));
  const shadowX = useTransform(dx, (v) => r2(v));
  const scale = useTransform(press, (p) => p);

  const edgeColour =
    edge === "gilt"
      ? GILT
      : edge === "ink"
        ? INK_EDGE
        : edge === "flat"
          ? m.lo
          : m.bevelHi;
  const ring =
    edge === "bevel"
      ? `inset 0 0 0 1px color-mix(in oklab, ${m.bevelHi} 80%, transparent), inset 1.5px 1.5px 0 1px color-mix(in oklab, white 30%, transparent), inset -1.5px -1.5px 0 1px color-mix(in oklab, ${m.bevelLo} 60%, transparent)`
      : edge === "flat"
        ? `inset 0 0 0 1px color-mix(in oklab, ${m.bevelLo} 45%, transparent)`
        : `inset 0 0 0 2px ${edgeColour}, inset 0 0 0 2.5px color-mix(in oklab, black 25%, transparent)`;
  const etchShadow =
    metal === "black"
      ? "0 0 0.5px color-mix(in oklab, white 40%, transparent)"
      : "0 0.6px 0 color-mix(in oklab, white 42%, transparent), 0 -0.4px 0 color-mix(in oklab, black 30%, transparent)";
  const chipHi =
    metal === "gold" ? METALS.steel.hi : "oklch(from var(--warn) 0.86 0.09 h)";
  const chipLo =
    metal === "gold"
      ? METALS.steel.lo
      : "oklch(from var(--warn) 0.66 0.11 calc(h - 8))";

  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center py-8 select-none",
        className,
      )}
    >
      <div
        className="relative w-full max-w-70"
        style={{ perspective: 760, perspectiveOrigin: "50% 0%" }}
      >
        {/* Contact shadow on the table: a line upright, a pool lying down. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-[5%] -bottom-1 h-[46%] rounded-[45%] bg-[radial-gradient(closest-side,color-mix(in_oklab,black_70%,transparent)_45%,transparent)] blur-[5px]"
          style={{
            x: shadowX,
            scaleY: shadowScale,
            opacity: shadowOpacity,
            originY: 1,
          }}
        />
        <motion.div
          className="[transform-style:preserve-3d]"
          style={{ x: dx, y: dy }}
        >
          <motion.div
            className="[transform-style:preserve-3d]"
            style={{ rotateX: fall, rotateZ: skew, originY: 1, scale }}
          >
            <motion.button
              ref={buttonRef}
              type="button"
              aria-label={name1}
              aria-describedby={`${uid}-hint`}
              disabled={disabled}
              {...gesture}
              onPointerMove={onPointerMove}
              onPointerLeave={(event) => {
                if (event.pointerType === "touch" || dragging.current) return;
                if (phaseRef.current === "rest") rest();
              }}
              onFocus={(event) => {
                if (!event.currentTarget.matches(":focus-visible")) return;
                focusPose.current = { x: 0.9, y: -0.55 };
                if (phaseRef.current === "rest") rest();
              }}
              onBlur={() => {
                focusPose.current = null;
                if (phaseRef.current === "rest") rest();
              }}
              onKeyDown={onKeyDown}
              onClick={(event) => {
                if (event.detail === 0 && phaseRef.current === "rest") drop();
              }}
              className={cn(
                "@container relative block aspect-[1.586] w-full cursor-grab touch-none rounded-[3.7%/5.9%] text-left will-change-transform [transform-style:preserve-3d] active:cursor-grabbing",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
              style={{ rotateX, rotateY }}
            >
              {/* The edge: a plate just behind the face shows as thickness when it tilts. */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-[3.7%/5.9%]"
                style={{
                  backgroundColor: edgeColour,
                  transform: "translateZ(-2.6px)",
                  boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${m.bevelLo} 50%, transparent)`,
                }}
              />
              <span
                aria-hidden
                className="absolute inset-0 rounded-[3.7%/5.9%]"
                style={{
                  backgroundColor: edgeColour,
                  transform: "translateZ(-1.3px)",
                }}
              />
              <span
                aria-hidden
                className="absolute inset-0 isolate overflow-hidden rounded-[3.7%/5.9%]"
                style={{
                  backgroundImage: `linear-gradient(162deg, ${m.hi}, ${m.lo} 58%, color-mix(in oklab, ${m.lo} 82%, black))`,
                }}
              >
                <motion.span
                  className="absolute inset-0"
                  style={{ backgroundImage: streak }}
                />
                <motion.span
                  className="absolute inset-0"
                  style={{ backgroundImage: sheen }}
                />
                {/* Brushing: noise stretched along the grain, in overlay. */}
                <span className="absolute inset-0 opacity-60 mix-blend-overlay will-change-transform">
                  <svg
                    viewBox="0 0 340 214"
                    preserveAspectRatio="none"
                    className="block size-full"
                  >
                    <filter
                      id={`${uid}-brush`}
                      filterUnits="userSpaceOnUse"
                      x={-160}
                      y={-200}
                      width={660}
                      height={614}
                    >
                      <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.004 0.62"
                        numOctaves={3}
                        seed={7}
                      />
                      <feColorMatrix
                        type="matrix"
                        values="0.36 0.36 0.36 0 0.02  0.36 0.36 0.36 0 0.02  0.36 0.36 0.36 0 0.02  0 0 0 0 1"
                      />
                    </filter>
                    <rect
                      x={-130}
                      y={-170}
                      width={600}
                      height={554}
                      filter={`url(#${uid}-brush)`}
                      transform={`rotate(${g} 170 107)`}
                    />
                  </svg>
                </span>
                <span
                  className="absolute inset-0 rounded-[inherit]"
                  style={{ boxShadow: ring }}
                />

                {/* The face: issuer, chip, contactless, number, name. */}
                <span
                  className="absolute top-[9%] left-[7%] text-[5.4cqw] leading-none font-semibold tracking-[0.02em]"
                  style={{ color: m.etch, textShadow: etchShadow }}
                >
                  {issuer}
                </span>
                <span
                  className="absolute top-[10.5%] right-[7%] font-mono text-[2.9cqw] leading-none tracking-[0.18em] uppercase"
                  style={{
                    color: m.etch,
                    textShadow: etchShadow,
                    opacity: 0.85,
                  }}
                >
                  {metal === "black" ? "Black" : metal}
                </span>
                {chip ? (
                  <svg
                    viewBox="0 0 44 34"
                    className="absolute top-[33%] left-[8%] w-[13cqw]"
                  >
                    <defs>
                      <linearGradient
                        id={`${uid}-chip`}
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="1"
                      >
                        <stop offset="0" style={{ stopColor: chipHi }} />
                        <stop offset="1" style={{ stopColor: chipLo }} />
                      </linearGradient>
                    </defs>
                    <rect
                      x={0.5}
                      y={0.5}
                      width={43}
                      height={33}
                      rx={6}
                      fill={`url(#${uid}-chip)`}
                      style={{ stroke: m.bevelLo }}
                      strokeOpacity={0.5}
                    />
                    <path
                      d="M0.5 11.5h12M0.5 22.5h12M31.5 11.5h12M31.5 22.5h12M12.5 0.5v33M31.5 0.5v33M12.5 17h19"
                      fill="none"
                      style={{ stroke: m.bevelLo }}
                      strokeOpacity={0.55}
                      strokeWidth={0.9}
                    />
                  </svg>
                ) : null}
                {contactless ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="absolute top-[35%] left-[25%] w-[6.5cqw]"
                    fill="none"
                    strokeLinecap="round"
                    strokeWidth={1.8}
                    style={{ stroke: m.etch, opacity: 0.8 }}
                  >
                    <path d="M7 8.5a5 5 0 0 1 0 7" />
                    <path d="M10.5 6a8.6 8.6 0 0 1 0 12" />
                    <path d="M14 3.5a12.2 12.2 0 0 1 0 17" />
                  </svg>
                ) : null}
                <span
                  className="absolute top-[57%] left-[8%] flex gap-[3.2cqw] font-mono text-[6.3cqw] leading-none tracking-[0.04em] tabular-nums"
                  style={{ color: m.etch, textShadow: etchShadow }}
                >
                  {digits.map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </span>
                <span
                  className="absolute bottom-[10%] left-[8%] max-w-[60%] truncate text-[3.7cqw] leading-none tracking-[0.14em] uppercase"
                  style={{ color: m.etch, textShadow: etchShadow }}
                >
                  {name}
                </span>
                <span
                  className="absolute right-[8%] bottom-[10%] flex items-baseline gap-[1.4cqw] font-mono leading-none"
                  style={{ color: m.etch, textShadow: etchShadow }}
                >
                  <span className="text-[2.2cqw] tracking-[0.12em] uppercase opacity-80">
                    Exp
                  </span>
                  <span className="text-[3.7cqw] tracking-[0.06em] tabular-nums">
                    {expiry}
                  </span>
                </span>
              </span>
            </motion.button>
          </motion.div>
        </motion.div>
      </div>
      <p id={`${uid}-hint`} className="sr-only">
        Move over the card to tilt it. Flick it, or press Enter, to drop it on
        the table.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
