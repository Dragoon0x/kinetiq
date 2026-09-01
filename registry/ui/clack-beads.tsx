"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Bead diameter in px. */
const BEAD = 24;
/** Daylight between resting beads — a loose cluster, not a weld. */
const GAP = 3;
/** Center-to-center spacing of resting beads. */
const PITCH = BEAD + GAP;

/** Stage box. */
const STAGE_W = 320;
const STAGE_H = 48;

/** Rod and end caps. */
const ROD_H = 3;
const ROD_TOP = (STAGE_H - ROD_H) / 2;
const CAP_W = 5;
const CAP_H = 16;
const CAP_TOP = (STAGE_H - CAP_H) / 2;

/** Beads ride the rod, centered in the stage. */
const BEAD_TOP = (STAGE_H - BEAD) / 2;

/** Left coordinate of the resting far bead — the cluster hangs center-right. */
const CLUSTER_RIGHT = 215;
/** Where the ejected bead parks, just shy of the right end cap. */
const EJECT_X = STAGE_W - CAP_W - BEAD - 4;
/** The flick bead can be dragged no further left than this. */
const LEFT_STOP = CAP_W + 4;

/** Pull-back distance for a plain click or keyboard flick. */
const STD_PULL = 36;
/** Flick speed window in px/s — pointer velocity is clamped into it. */
const SPEED_MIN = 500;
const SPEED_MAX = 2200;
/** Travel-time window for the flicked bead, in seconds. */
const TRAVEL_MIN = 0.1;
const TRAVEL_MAX = 0.3;
/** Drags shorter than this read as a plain click. */
const DEAD_ZONE = 4;

/** Impact squash on the struck bead. */
const SQUASH = 0.85;
/** How long the caption savors an impact. */
const CLACK_FLASH_MS = 700;
/** The pause before the ejected bead wanders home. */
const BEAT_MS = 650;

const CAPTIONS = {
  rest: "flick",
  clack: "clack.",
} as const;

type Phase = keyof typeof CAPTIONS;

/** Two-tone paint: the flick bead wears the accent, the cluster wears ink. */
const FLICK_RIM = "color-mix(in oklab, var(--primary) 82%, var(--card))";
const FLICK_FACE = "color-mix(in oklab, var(--primary) 26%, var(--card))";
const CLUSTER_RIM = "color-mix(in oklab, var(--ink-2) 55%, var(--card))";
const CLUSTER_FACE = "color-mix(in oklab, var(--ink-2) 18%, var(--card))";

export type ClackBeadsProps = {
  /** How many beads ride the rod, clamped 3–7. @default 5 */
  beads?: number;
  /** Fires at every impact, right as the caption flips to “clack.” */
  onClack?: () => void;
  className?: string;
};

/**
 * A clacker rod: a loose cluster of beads parked center-right, one accent
 * bead begging to be flicked into them. Drag the leftmost bead back and let
 * go — or just click it, or press Enter — and it slides in on an exit tween,
 * the struck bead squashes for a frame on `flick`, a tick sparks at the seam,
 * and the far bead shoots off toward the end cap with friction bleeding the
 * speed away. A beat later the runaway wanders home on `move` and the cluster
 * is whole again, ready for the next hit. The whole transfer is an authored
 * choreography over a fixed layout table — deterministic every time, tuned to
 * feel physical rather than simulated — and rapid flicks simply restart it
 * from wherever the beads currently sit. A mono caption flips from “flick” to
 * “clack.” at every impact.
 * Reduced motion: a flick swaps positions instantly — the dragged bead back
 * at rest, the far bead parked out by the end cap, home again a beat later —
 * and the caption still flashes.
 */
export function ClackBeads({
  beads = 5,
  onClack,
  className,
}: ClackBeadsProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const count = Math.min(7, Math.max(3, Math.round(beads)));

  // Fixed layout table: every bead's rest position, cluster center-right.
  const positions = Array.from(
    { length: count },
    (_, i) => CLUSTER_RIGHT - (count - 1 - i) * PITCH,
  );
  // Derived from the same formula rather than indexed, so the ends are plain
  // numbers the motion values and animate() targets can take directly.
  const rest0 = CLUSTER_RIGHT - (count - 1) * PITCH;
  const restLast = CLUSTER_RIGHT;

  const [phase, setPhase] = React.useState<Phase>("rest");

  const flickX = useMotionValue(rest0);
  const farX = useMotionValue(restLast);
  const struckScaleX = useMotionValue(1);
  const tickOpacity = useMotionValue(0);

  const dragging = React.useRef(false);
  const grabClientX = React.useRef(0);
  const grabBeadX = React.useRef(0);
  const lastMove = React.useRef({ x: 0, t: 0 });
  const prevMove = React.useRef({ x: 0, t: 0 });

  const flickAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const ejectAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const squashAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const tickAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const clackTimer = React.useRef<number | null>(null);
  const returnTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      flickAnim.current?.stop();
      ejectAnim.current?.stop();
      squashAnim.current?.stop();
      tickAnim.current?.stop();
      if (clackTimer.current !== null) window.clearTimeout(clackTimer.current);
      if (returnTimer.current !== null)
        window.clearTimeout(returnTimer.current);
    };
  }, []);

  // A bead-count change redraws the layout table; park everything at rest.
  React.useEffect(() => {
    flickAnim.current?.stop();
    ejectAnim.current?.stop();
    if (returnTimer.current !== null) {
      window.clearTimeout(returnTimer.current);
      returnTimer.current = null;
    }
    flickX.set(rest0);
    farX.set(restLast);
    struckScaleX.set(1);
  }, [rest0, restLast, flickX, farX, struckScaleX]);

  /** The ejected bead waits a beat, then wanders back to the cluster. */
  const scheduleReturn = () => {
    if (returnTimer.current !== null) window.clearTimeout(returnTimer.current);
    returnTimer.current = window.setTimeout(() => {
      if (motionSafe) {
        ejectAnim.current = animate(farX, restLast, {
          duration: durations.page,
          ease: easings.move,
        });
      } else {
        farX.set(restLast);
      }
    }, BEAT_MS);
  };

  /** Impact: caption flip, tick flash, squash, far-bead ejection. */
  const clack = () => {
    onClack?.();

    setPhase("clack");
    if (clackTimer.current !== null) window.clearTimeout(clackTimer.current);
    clackTimer.current = window.setTimeout(() => {
      setPhase("rest");
      tickOpacity.set(0);
    }, CLACK_FLASH_MS);

    // The tick flashes at the seam: set bright, tween out.
    tickAnim.current?.stop();
    tickOpacity.set(1);
    if (motionSafe) {
      tickAnim.current = animate(tickOpacity, 0, {
        duration: durations.base,
        ease: easings.exit,
      });
    }

    // The struck bead takes the hit: set squashed, spring back on flick.
    if (motionSafe) {
      squashAnim.current?.stop();
      struckScaleX.set(SQUASH);
      squashAnim.current = animate(struckScaleX, 1, springs.flick);
    }

    // The far bead carries the impulse out, friction eating its speed.
    ejectAnim.current?.stop();
    if (motionSafe) {
      ejectAnim.current = animate(farX, EJECT_X, {
        duration: durations.slow,
        ease: easings.enter,
        onComplete: scheduleReturn,
      });
    } else {
      farX.set(EJECT_X);
      scheduleReturn();
    }
  };

  /** Send the flick bead into the cluster from wherever it sits. */
  const travel = (duration: number) => {
    flickAnim.current?.stop();
    if (motionSafe) {
      flickAnim.current = animate(flickX, rest0, {
        duration,
        ease: easings.exit,
        onComplete: clack,
      });
    } else {
      flickX.set(rest0);
      clack();
    }
  };

  /** A plain click or key press: a short authored wind-up, then the flick. */
  const standardFlick = () => {
    if (!motionSafe) {
      flickX.set(rest0);
      clack();
      return;
    }
    flickAnim.current?.stop();
    flickAnim.current = animate(flickX, rest0 - STD_PULL, {
      duration: durations.fast,
      ease: easings.move,
      onComplete: () => {
        flickAnim.current = animate(flickX, rest0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: clack,
        });
      },
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    flickAnim.current?.stop();
    dragging.current = true;
    grabClientX.current = event.clientX;
    grabBeadX.current = flickX.get();
    lastMove.current = { x: event.clientX, t: event.timeStamp };
    prevMove.current = { x: event.clientX, t: event.timeStamp };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    const offset = event.clientX - grabClientX.current;
    const next = Math.min(
      rest0,
      Math.max(LEFT_STOP, grabBeadX.current + offset),
    );
    flickX.set(next);
    prevMove.current = lastMove.current;
    lastMove.current = { x: event.clientX, t: event.timeStamp };
  };

  const handlePointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;

    const pull = rest0 - flickX.get();
    if (pull < DEAD_ZONE) {
      standardFlick();
      return;
    }

    // Release speed from the last pointer deltas, clamped into a fixed
    // window so the choreography stays authored however wild the gesture.
    const dt = lastMove.current.t - prevMove.current.t;
    const raw =
      dt > 0
        ? Math.abs((lastMove.current.x - prevMove.current.x) / dt) * 1000
        : 0;
    const speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, raw));
    const duration = Math.min(TRAVEL_MAX, Math.max(TRAVEL_MIN, pull / speed));
    travel(duration);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (event.repeat) return;
    standardFlick();
  };

  return (
    <div
      className={cn(
        "relative inline-flex flex-col items-center gap-2 p-3 select-none",
        className,
      )}
    >
      <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
        {/* Rod — the beads' whole world, one thin bar */}
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            left: CAP_W,
            right: CAP_W,
            top: ROD_TOP,
            height: ROD_H,
            background: "var(--ink-3)",
          }}
        />

        {/* End caps */}
        <span
          aria-hidden
          className="absolute rounded-full border border-hairline bg-surface-2"
          style={{ left: 0, top: CAP_TOP, width: CAP_W, height: CAP_H }}
        />
        <span
          aria-hidden
          className="absolute rounded-full border border-hairline bg-surface-2"
          style={{ right: 0, top: CAP_TOP, width: CAP_W, height: CAP_H }}
        />

        {/* Struck bead — first of the cluster, absorbs the hit with a squash */}
        <motion.span
          aria-hidden
          className="absolute block rounded-full border border-hairline shadow-raised"
          style={{
            top: BEAD_TOP,
            left: positions[1],
            width: BEAD,
            height: BEAD,
            scaleX: struckScaleX,
            background: CLUSTER_RIM,
          }}
        >
          <span
            className="absolute inset-[5px] rounded-full"
            style={{ background: CLUSTER_FACE }}
          />
        </motion.span>

        {/* Middle beads — the quiet conductors of the impulse */}
        {positions.slice(2, count - 1).map((x, i) => (
          <span
            key={i + 2}
            aria-hidden
            className="absolute block rounded-full border border-hairline shadow-raised"
            style={{
              top: BEAD_TOP,
              left: x,
              width: BEAD,
              height: BEAD,
              background: CLUSTER_RIM,
            }}
          >
            <span
              className="absolute inset-[5px] rounded-full"
              style={{ background: CLUSTER_FACE }}
            />
          </span>
        ))}

        {/* Far bead — the one that gets ejected */}
        <motion.span
          aria-hidden
          className="absolute block rounded-full border border-hairline shadow-raised"
          style={{
            top: BEAD_TOP,
            left: 0,
            x: farX,
            width: BEAD,
            height: BEAD,
            background: CLUSTER_RIM,
          }}
        >
          <span
            className="absolute inset-[5px] rounded-full"
            style={{ background: CLUSTER_FACE }}
          />
        </motion.span>

        {/* Clack tick — a small spark above the contact seam */}
        <motion.span
          aria-hidden
          className="absolute block"
          style={{
            left: (positions[1] ?? rest0) - GAP / 2,
            top: 2,
            opacity: tickOpacity,
          }}
        >
          <span
            className="absolute block h-[9px] w-[2px] rounded-full"
            style={{
              left: -4,
              background: "var(--primary)",
              transform: "rotate(-24deg)",
            }}
          />
          <span
            className="absolute block h-[9px] w-[2px] rounded-full"
            style={{
              left: 3,
              background: "var(--primary)",
              transform: "rotate(24deg)",
            }}
          />
        </motion.span>

        {/* Flick bead — the only one you get to touch */}
        <motion.button
          type="button"
          aria-label="Flick a bead"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className={cn(
            "absolute block cursor-grab touch-none rounded-full border border-hairline shadow-raised select-none active:cursor-grabbing",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          )}
          style={{
            top: BEAD_TOP,
            left: 0,
            x: flickX,
            width: BEAD,
            height: BEAD,
            background: FLICK_RIM,
          }}
        >
          <span
            aria-hidden
            className="absolute inset-[5px] rounded-full"
            style={{ background: FLICK_FACE }}
          />
        </motion.button>
      </div>

      <span
        aria-hidden
        className="h-4 text-label font-mono leading-none text-ink-3"
      >
        {CAPTIONS[phase]}
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {phase === "clack" ? "clack" : ""}
      </span>
    </div>
  );
}
