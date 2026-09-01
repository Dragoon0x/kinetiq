"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { cascade, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage box, px — bar up top, tubes graduated down, clapper nested among them. */
const STAGE_W = 260;
const STAGE_H = 200;

/** Top bar — the chime's wooden disc, a rounded pill the strings hang from. */
const BAR_Y = 24;
const BAR_H = 12;
const BAR_W = 216;

/** Every string is this long, top bar to tube pivot. */
const STRING_LEN = 20;
const STRING_W = 1.5;
const TUBE_W = 13;
/** Absolute y of every tube's pivot — its string's bottom, its own top. */
const TUBE_TOP = BAR_Y + BAR_H + STRING_LEN;

/** Clapper disc — hangs central, its own shorter string parked lower than
 * the tube tops so its body sits inside every tube's reach. */
const CLAPPER_D = 14;
const CLAPPER_TOP = TUBE_TOP + 30;
const CLAPPER_CENTER_X = STAGE_W / 2;
const CLAPPER_CENTER_Y = CLAPPER_TOP + CLAPPER_D / 2;
const CLAPPER_STRING_TOP = BAR_Y + BAR_H;
const CLAPPER_STRING_H = CLAPPER_TOP - CLAPPER_STRING_TOP;

/** Glint mark — a tiny spark at each tube's fixed contact point. */
const GLINT_SIZE = 8;
const CONTACT_RADIUS = CLAPPER_D / 2 + 5;

const DEG = Math.PI / 180;
/** Fixed offset from the clapper's center, on the arc facing each tube — a
 * scripted contact point, not a collision result. */
const contactAt = (deg: number): { x: number; y: number } => ({
  x: Math.sin(deg * DEG) * CONTACT_RADIUS,
  y: -Math.cos(deg * DEG) * CONTACT_RADIUS,
});

/** Fixed token cycle — primary, success, warning, ink, then back to primary. */
const TINT_PRIMARY = "color-mix(in oklab, var(--primary) 58%, var(--card))";
const TINT_SUCCESS =
  "color-mix(in oklab, var(--success, #047857) 55%, var(--card))";
const TINT_WARNING =
  "color-mix(in oklab, var(--warning, #b45309) 55%, var(--card))";
const TINT_INK = "color-mix(in oklab, var(--ink-2) 48%, var(--card))";

/**
 * One fixed row per tube: x offset from stage center, graduated length
 * (longest left to shortest right), tint, which way its first swing peak
 * leans (toward the central clapper), its own natural-period multiplier and
 * ambient stagger, and the scripted point on the clapper's rim it "touches".
 */
const TUBE_CONFIG = [
  {
    x: -96,
    length: 122,
    tint: TINT_PRIMARY,
    sign: 1,
    periodMult: 1.0,
    ambientDelay: 0,
    contactOffset: contactAt(-58),
  },
  {
    x: -48,
    length: 104,
    tint: TINT_SUCCESS,
    sign: 1,
    periodMult: 1.16,
    ambientDelay: 0.16,
    contactOffset: contactAt(-30),
  },
  {
    x: 0,
    length: 88,
    tint: TINT_WARNING,
    sign: 1,
    periodMult: 0.85,
    ambientDelay: 0.32,
    contactOffset: contactAt(0),
  },
  {
    x: 48,
    length: 74,
    tint: TINT_INK,
    sign: -1,
    periodMult: 1.27,
    ambientDelay: 0.48,
    contactOffset: contactAt(30),
  },
  {
    x: 96,
    length: 62,
    tint: TINT_PRIMARY,
    sign: -1,
    periodMult: 0.94,
    ambientDelay: 0.64,
    contactOffset: contactAt(58),
  },
] as const;

const TUBE_COUNT = 5;

type Bucket = "still" | "breath" | "gust" | "squall";

type BucketParams = {
  /** Peak swing, degrees, before a tube's own sign/period shape it. */
  amplitude: number;
  /** Base loop duration, seconds, before a tube's own period multiplier. */
  duration: number;
  /** Whether this bucket is lively enough to flash a contact at all. */
  contact: boolean;
};

const BUCKET_PARAMS: Record<Bucket, BucketParams> = {
  still: { amplitude: 1.5, duration: 6.5, contact: false },
  breath: { amplitude: 6, duration: 3.3, contact: true },
  gust: { amplitude: 13, duration: 2.0, contact: true },
  squall: { amplitude: 20, duration: 1.15, contact: true },
};

/** Pointer speed thresholds (px/s) sorting movement into the four buckets. */
const BREATH_SPEED = 45;
const GUST_SPEED = 240;
const SQUALL_SPEED = 650;

/** A decaying pendulum shape, normalized -1..1 — the "toward center" peak
 * lands early (index 1), which is also where a contact is scripted. */
const SWING_SHAPE = [0, 1, -0.62, 0.34, -0.14, 0] as const;
const SWING_TIMES = [0, 0.16, 0.4, 0.62, 0.83, 1] as const;
/** The contact flash: a quick blip right at the swing's toward-center peak. */
const GLINT_SHAPE = [0, 0, 1, 0, 0] as const;
const GLINT_TIMES = [0, 0.1, 0.16, 0.24, 1] as const;

/** The click "run": a bigger one-shot swing per tube, no repeat. */
const RUN_AMPLITUDE = 20;
const RUN_DURATION = 0.9;

/** Horizontal breeze bias — written straight to a motion value per move. */
const LEAN_GAIN = 0.045;
const LEAN_MAX = 6;
/** Pointer samples further apart than this (s) restart the speed estimate. */
const BREEZE_MAX_GAP = 0.12;
/** No movement for this long reverts the bucket to "still". */
const IDLE_MS = 650;

const RING_CAPTION_MS = 850;
/** Reduced motion's stand-in for a flash: an instant hold, no tween. */
const FLASH_HOLD_MS = 260;

function classifyBucket(speed: number): Bucket {
  if (speed >= SQUALL_SPEED) return "squall";
  if (speed >= GUST_SPEED) return "gust";
  if (speed >= BREATH_SPEED) return "breath";
  return "still";
}

export type WindChimesProps = {
  /** Fires the instant a click sends the chimes through a full run. */
  onRing?: () => void;
  className?: string;
};

/**
 * Five tubes hang from a wooden bar on thin strings, graduated longest to
 * shortest so they read as a scale, each swaying on its own repeating
 * decaying-rotate tween. Sweeping the pointer over the card reads its speed
 * into one of four fixed breeze buckets — still, breath, gust, squall — that
 * rescale every tube's amplitude and duration together, while the pointer's
 * horizontal drift writes straight into a shared lean motion value so the
 * whole rig tilts with the gust; each tube keeps its own natural period, so
 * they never swing in step. A small clapper hangs low and central, and a
 * fixed per-tube phase table times a glint and a brighten at the moment each
 * tube is scripted to brush it, staggering the flashes into a chime-like run
 * rather than computing real contact. The card is itself a button: a click
 * sends all five tubes through a `cascade`d run that swings, flashes, and
 * decays back to rest, flipping the caption to "chime." for a beat before it
 * returns to naming the current bucket.
 * Reduced motion: no sway loops and no flashes — the tubes hang still while
 * the breeze bucket keeps updating the caption, and a click briefly
 * brightens each tube in a staggered sequence with no movement.
 */
export function WindChimes({
  onRing,
  className,
}: WindChimesProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();

  const [bucket, setBucket] = React.useState<Bucket>("still");
  const [ringing, setRinging] = React.useState(false);

  // Five tubes, declared unconditionally — the count never varies.
  const rotate0 = useMotionValue(0);
  const rotate1 = useMotionValue(0);
  const rotate2 = useMotionValue(0);
  const rotate3 = useMotionValue(0);
  const rotate4 = useMotionValue(0);
  const glint0 = useMotionValue(0);
  const glint1 = useMotionValue(0);
  const glint2 = useMotionValue(0);
  const glint3 = useMotionValue(0);
  const glint4 = useMotionValue(0);
  /** Shared horizontal breeze bias — the one motion value pointermove writes. */
  const lean = useMotionValue(0);

  const rotateAnimsRef = React.useRef<Array<ReturnType<typeof animate> | null>>(
    [null, null, null, null, null],
  );
  const glintAnimsRef = React.useRef<Array<ReturnType<typeof animate> | null>>([
    null,
    null,
    null,
    null,
    null,
  ]);
  const leanAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const flashTimersRef = React.useRef<Array<number | null>>([
    null,
    null,
    null,
    null,
    null,
  ]);

  const breezeRef = React.useRef<{ x: number; y: number; t: number } | null>(
    null,
  );
  const idleTimerRef = React.useRef<number | null>(null);
  const ringTimerRef = React.useRef<number | null>(null);
  const runTimerRef = React.useRef<number | null>(null);
  const runningRef = React.useRef(false);
  const bucketRef = React.useRef<Bucket>("still");

  const TUBES = [
    { ...TUBE_CONFIG[0], rotate: rotate0, glint: glint0 },
    { ...TUBE_CONFIG[1], rotate: rotate1, glint: glint1 },
    { ...TUBE_CONFIG[2], rotate: rotate2, glint: glint2 },
    { ...TUBE_CONFIG[3], rotate: rotate3, glint: glint3 },
    { ...TUBE_CONFIG[4], rotate: rotate4, glint: glint4 },
  ];

  const setBucketIfChanged = (next: Bucket) => {
    if (bucketRef.current === next) return;
    bucketRef.current = next;
    setBucket(next);
  };

  /** Stops every ambient loop in flight — used before a bucket swap and
   * before a click-triggered run takes the tubes over. Motion values are
   * stable across renders, so this callback never needs to change. */
  const stopAmbient = React.useCallback(() => {
    const rotateAnims = rotateAnimsRef.current;
    const glintAnims = glintAnimsRef.current;
    for (let i = 0; i < TUBE_COUNT; i++) {
      rotateAnims[i]?.stop();
      rotateAnims[i] = null;
      glintAnims[i]?.stop();
      glintAnims[i] = null;
    }
  }, []);

  /** Starts every tube's repeating sway (and, when the bucket is lively
   * enough, its contact glint) scaled to the given bucket. */
  const startAmbient = React.useCallback(
    (activeBucket: Bucket) => {
      const params = BUCKET_PARAMS[activeBucket];
      const tubes = [
        { ...TUBE_CONFIG[0], rotate: rotate0, glint: glint0 },
        { ...TUBE_CONFIG[1], rotate: rotate1, glint: glint1 },
        { ...TUBE_CONFIG[2], rotate: rotate2, glint: glint2 },
        { ...TUBE_CONFIG[3], rotate: rotate3, glint: glint3 },
        { ...TUBE_CONFIG[4], rotate: rotate4, glint: glint4 },
      ];
      const rotateAnims = rotateAnimsRef.current;
      const glintAnims = glintAnimsRef.current;

      tubes.forEach((tube, i) => {
        const duration = params.duration * tube.periodMult;

        tube.rotate.set(0);
        rotateAnims[i] = animate(
          tube.rotate,
          SWING_SHAPE.map((m) => m * tube.sign * params.amplitude),
          {
            duration,
            ease: easings.move,
            times: [...SWING_TIMES],
            delay: tube.ambientDelay,
            repeat: Infinity,
          },
        );

        tube.glint.set(0);
        if (params.contact) {
          glintAnims[i] = animate(tube.glint, [...GLINT_SHAPE], {
            duration,
            ease: easings.move,
            times: [...GLINT_TIMES],
            delay: tube.ambientDelay,
            repeat: Infinity,
          });
        }
      });
    },
    [
      rotate0,
      rotate1,
      rotate2,
      rotate3,
      rotate4,
      glint0,
      glint1,
      glint2,
      glint3,
      glint4,
    ],
  );

  // The ambient loop: (re)starts whenever the bucket or motion-safety
  // changes, unless a click-triggered run currently owns the tubes.
  React.useEffect(() => {
    if (runningRef.current) return;
    if (!motionSafe) {
      stopAmbient();
      rotate0.set(0);
      rotate1.set(0);
      rotate2.set(0);
      rotate3.set(0);
      rotate4.set(0);
      glint0.set(0);
      glint1.set(0);
      glint2.set(0);
      glint3.set(0);
      glint4.set(0);
      lean.set(0);
      return;
    }
    startAmbient(bucket);
    return stopAmbient;
  }, [
    bucket,
    motionSafe,
    startAmbient,
    stopAmbient,
    rotate0,
    rotate1,
    rotate2,
    rotate3,
    rotate4,
    glint0,
    glint1,
    glint2,
    glint3,
    glint4,
    lean,
  ]);

  // Final teardown — nothing survives unmount. The arrays are aliased by
  // reference here, not copied: slots are rewritten in place as swings and
  // flashes restart, so cleanup still sees whatever is currently running.
  React.useEffect(() => {
    const rotateAnims = rotateAnimsRef.current;
    const glintAnims = glintAnimsRef.current;
    const flashTimers = flashTimersRef.current;
    return () => {
      for (const a of rotateAnims) a?.stop();
      for (const a of glintAnims) a?.stop();
      for (const t of flashTimers) {
        if (t !== null) window.clearTimeout(t);
      }
      leanAnimRef.current?.stop();
      if (idleTimerRef.current !== null)
        window.clearTimeout(idleTimerRef.current);
      if (ringTimerRef.current !== null)
        window.clearTimeout(ringTimerRef.current);
      if (runTimerRef.current !== null)
        window.clearTimeout(runTimerRef.current);
    };
  }, []);

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerFine) return;
    const last = breezeRef.current;
    breezeRef.current = {
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
    };

    if (idleTimerRef.current !== null)
      window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      setBucketIfChanged("still");
      if (motionSafe) {
        leanAnimRef.current?.stop();
        leanAnimRef.current = animate(lean, 0, springs.drift);
      }
    }, IDLE_MS);

    if (!last) return;
    const dt = (event.timeStamp - last.t) / 1000;
    if (dt <= 0 || dt > BREEZE_MAX_GAP) return;

    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    const speed = Math.hypot(dx, dy) / dt;

    setBucketIfChanged(classifyBucket(speed));

    if (motionSafe) {
      // The breeze value: written straight to a motion value, never state.
      const target = Math.max(
        -LEAN_MAX,
        Math.min(LEAN_MAX, (dx / dt) * LEAN_GAIN),
      );
      lean.set(target);
    }
  };

  const handlePointerLeave = () => {
    breezeRef.current = null;
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    setBucketIfChanged("still");
    leanAnimRef.current?.stop();
    if (motionSafe) {
      leanAnimRef.current = animate(lean, 0, springs.drift);
    } else {
      lean.set(0);
    }
  };

  const handleClick = () => {
    onRing?.();

    setRinging(true);
    if (ringTimerRef.current !== null)
      window.clearTimeout(ringTimerRef.current);
    ringTimerRef.current = window.setTimeout(() => {
      setRinging(false);
    }, RING_CAPTION_MS);

    runningRef.current = true;
    stopAmbient();
    leanAnimRef.current?.stop();
    lean.set(0);

    const step = cascade(TUBE_COUNT);
    const rotateAnims = rotateAnimsRef.current;
    const glintAnims = glintAnimsRef.current;
    const flashTimers = flashTimersRef.current;
    let maxEndSeconds = 0;

    TUBES.forEach((tube, i) => {
      const delay = i * step;

      if (motionSafe) {
        const duration = RUN_DURATION * tube.periodMult;
        maxEndSeconds = Math.max(maxEndSeconds, delay + duration);

        tube.rotate.set(0);
        rotateAnims[i] = animate(
          tube.rotate,
          SWING_SHAPE.map((m) => m * tube.sign * RUN_AMPLITUDE),
          { duration, ease: easings.move, times: [...SWING_TIMES], delay },
        );

        tube.glint.set(0);
        glintAnims[i] = animate(tube.glint, [...GLINT_SHAPE], {
          duration,
          ease: easings.move,
          times: [...GLINT_TIMES],
          delay,
        });
      } else {
        // Reduced motion: a staggered brighten only, nothing swings. Both
        // legs of the flash reuse this tube's one timer slot, so unmount
        // cleanup always clears whichever leg is still pending.
        const flashDelayMs = delay * 1000;
        window.clearTimeout(flashTimers[i] ?? undefined);
        flashTimers[i] = window.setTimeout(() => {
          tube.glint.set(1);
          flashTimers[i] = window.setTimeout(() => {
            tube.glint.set(0);
          }, FLASH_HOLD_MS);
        }, flashDelayMs);
      }
    });

    if (runTimerRef.current !== null) window.clearTimeout(runTimerRef.current);
    const totalMs = motionSafe
      ? maxEndSeconds * 1000
      : (TUBE_COUNT - 1) * step * 1000 + FLASH_HOLD_MS;
    runTimerRef.current = window.setTimeout(() => {
      runningRef.current = false;
      if (motionSafe) startAmbient(bucketRef.current);
    }, totalMs);
  };

  const captionText = ringing ? "chime." : bucket;

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <button
        type="button"
        aria-label="Ring the chimes"
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className={cn(
          "relative block cursor-pointer rounded-4 border border-hairline bg-surface-1 shadow-raised outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60",
        )}
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* Top bar — the chime's wooden disc. */}
        <span
          aria-hidden
          className="absolute rounded-full border border-hairline-strong bg-surface-2 shadow-raised"
          style={{
            left: "50%",
            top: BAR_Y,
            width: BAR_W,
            height: BAR_H,
            marginLeft: -(BAR_W / 2),
          }}
        />

        {/* Clapper — its own short string, nested behind the tubes. */}
        <span
          aria-hidden
          className="absolute rounded-full bg-ink-3"
          style={{
            left: "50%",
            top: CLAPPER_STRING_TOP,
            width: STRING_W,
            height: CLAPPER_STRING_H,
            marginLeft: -(STRING_W / 2),
          }}
        />
        <span
          aria-hidden
          className="absolute rounded-full border border-hairline-strong bg-surface-2 shadow-raised"
          style={{
            left: "50%",
            top: CLAPPER_TOP,
            width: CLAPPER_D,
            height: CLAPPER_D,
            marginLeft: -(CLAPPER_D / 2),
          }}
        />

        {TUBES.map((tube, i) => (
          <TubeUnit
            key={i}
            x={tube.x}
            length={tube.length}
            tint={tube.tint}
            rotate={tube.rotate}
            glint={tube.glint}
            lean={lean}
          />
        ))}

        {/* Contact glints — fixed marks near the clapper's rim, one per
            tube. Reduced motion drops these and keeps only each tube's own
            brighten, so a click still "brightens", never "flashes". */}
        {motionSafe &&
          TUBES.map((tube, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{
                left: CLAPPER_CENTER_X + tube.contactOffset.x - GLINT_SIZE / 2,
                top: CLAPPER_CENTER_Y + tube.contactOffset.y - GLINT_SIZE / 2,
                width: GLINT_SIZE,
                height: GLINT_SIZE,
                background: `color-mix(in oklab, ${tube.tint} 65%, oklch(1 0 0))`,
                opacity: tube.glint,
                scale: tube.glint,
              }}
            />
          ))}
      </button>

      <p aria-hidden className="text-label font-mono text-ink-3 select-none">
        {captionText}
      </p>
      <span role="status" aria-live="polite" className="sr-only">
        {ringing ? "chime." : ""}
      </span>
    </div>
  );
}

type TubeUnitProps = {
  x: number;
  length: number;
  tint: string;
  rotate: MotionValue<number>;
  glint: MotionValue<number>;
  lean: MotionValue<number>;
};

/**
 * One tube: a thin string hanging from the bar, leaning with the shared
 * breeze bias, and — pivoting at the string's own bottom — the tube itself
 * swinging on its independent rotate. A brighten overlay rides inside the
 * tube on the same glint value that drives its contact spark, so the two
 * always flash together.
 */
function TubeUnit({
  x,
  length,
  tint,
  rotate,
  glint,
  lean,
}: TubeUnitProps): React.JSX.Element {
  return (
    <motion.span
      aria-hidden
      className="absolute left-1/2 block"
      style={{
        top: BAR_Y + BAR_H,
        marginLeft: x - STRING_W / 2,
        width: STRING_W,
        height: STRING_LEN,
        rotate: lean,
        transformOrigin: "top center",
      }}
    >
      <span
        className="absolute block rounded-full bg-ink-3"
        style={{ top: 0, left: 0, width: STRING_W, height: STRING_LEN }}
      />
      <motion.span
        className="absolute block overflow-hidden rounded-full border border-hairline-strong shadow-raised"
        style={{
          top: STRING_LEN,
          left: -(TUBE_W - STRING_W) / 2,
          width: TUBE_W,
          height: length,
          background: tint,
          rotate,
          transformOrigin: "top center",
        }}
      >
        <motion.span
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, oklch(1 0 0 / 0.55), oklch(1 0 0 / 0) 70%)",
            opacity: glint,
          }}
        />
      </motion.span>
    </motion.span>
  );
}
