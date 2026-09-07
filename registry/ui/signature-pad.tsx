"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SignatureStroke = {
  points: [number, number][];
  widths: number[];
};

type Ink = SignatureStroke & { id: string };

/**
 * The nib, in px: a slow pen pools at MAX, a pen moving FAST px/ms thins to
 * MIN, and SMOOTHING is how much of each reading lands so the line eases
 * rather than flickers. Samples closer than MIN_STEP are dropped — the pen
 * reports far denser than it moves — and capture waits for CAPTURE_AT px of
 * travel, or a plain tap on the pad would never be a tap.
 */
const MIN_NIB = 1.1;
const MAX_NIB = 4.2;
const FAST = 1.6;
const SMOOTHING = 0.35;
const MIN_STEP = 1.2;
const CAPTURE_AT = 4;

/** Undo and Clear are one row, so they are one control at one height. */
const CONTROL =
  "inline-flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-0 px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40";

/** The ink body: one side out, the other side back, closed. */
function ribbon(stroke: SignatureStroke): string {
  const { points, widths } = stroke;
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) {
    const r = Math.max((widths[0] ?? MIN_NIB) / 2, 0.7);
    return `M ${first[0] - r} ${first[1]} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
  }
  const near: string[] = [];
  const far: string[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const here = points[index];
    if (!here) continue;
    const back = points[Math.max(index - 1, 0)] ?? here;
    const ahead = points[Math.min(index + 1, points.length - 1)] ?? here;
    // Normal of the local direction, scaled to half the nib at this sample.
    let nx = ahead[1] - back[1];
    let ny = -(ahead[0] - back[0]);
    const length = Math.hypot(nx, ny) || 1;
    const half = Math.max((widths[index] ?? MIN_NIB) / 2, 0.35);
    nx = (nx / length) * half;
    ny = (ny / length) * half;
    near.push(`${(here[0] + nx).toFixed(2)} ${(here[1] + ny).toFixed(2)}`);
    far.push(`${(here[0] - nx).toFixed(2)} ${(here[1] - ny).toFixed(2)}`);
  }
  if (near.length === 0) return "";
  return `M ${near.join(" L ")} L ${far.reverse().join(" L ")} Z`;
}

/** The pen's own path — what the rewind runs back along. */
function centerline(stroke: SignatureStroke): string {
  const first = stroke.points[0];
  if (!first) return "";
  if (stroke.points.length === 1) {
    return `M ${first[0]} ${first[1]} L ${first[0] + 0.01} ${first[1]}`;
  }
  const rest = stroke.points
    .slice(1)
    .map((point) => `L ${point[0]} ${point[1]}`)
    .join(" ");
  return `M ${first[0]} ${first[1]} ${rest}`;
}

const nibCover = (stroke: SignatureStroke): number =>
  stroke.widths.reduce((widest, width) => Math.max(widest, width), MAX_NIB) + 2;

export type SignaturePadProps = {
  /** Every stroke, after each change. */
  onChange?: (strokes: SignatureStroke[]) => void;
  /** Fires with the typed-signature fallback's text. */
  onTypedChange?: (typed: string) => void;
  /** CSS colour for the ink. @default "currentColor" */
  penColor?: string;
  /** Pad height in px; the width fills the container. @default 160 */
  height?: number;
  /** Caption above the pad. */
  label: string;
  /** Offers the typed-signature fallback. @default true */
  allowTyped?: boolean;
  className?: string;
};

/**
 * A pad whose ink remembers the pen. Each sample's nib width comes from the
 * speed between it and the last one, smoothed so the line eases instead of
 * flickering: a fast flourish thins, a slow stop pools. Strokes are drawn as
 * filled ribbons, revealed through a mask that runs along the pen's own path —
 * which is what lets Clear rewind rather than blink, every stroke un-writing on
 * `glide`, last one first, `cascade()` apart. Undo lifts one stroke away on a
 * fade, because taking a stroke back is not the same gesture as erasing.
 *
 * Pointer capture is claimed only after 4px of travel, so a tap on the pad is
 * still a tap. The keyboard path is a typed signature — a real text input,
 * announced as an equal way to sign, not a consolation — and reduced motion
 * makes clear and undo instant while the ink itself is unchanged.
 */
export function SignaturePad({
  onChange,
  onTypedChange,
  penColor = "currentColor",
  height = 160,
  label,
  allowTyped = true,
  className,
}: SignaturePadProps) {
  const motionSafe = useMotionSafe();
  // useId carries colons; SVG fragment references are happier without them.
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const labelId = `${uid}-label`;
  const typedId = `${uid}-typed`;
  const noteId = `${uid}-note`;

  const [strokes, setStrokes] = React.useState<Ink[]>([]);
  const [live, setLive] = React.useState<Ink | null>(null);
  const [clearing, setClearing] = React.useState(false);
  const [typed, setTyped] = React.useState("");

  const serial = React.useRef(0);
  const drag = React.useRef<{
    id: number;
    stroke: Ink;
    at: [number, number];
    time: number;
    nib: number;
    travel: number;
    captured: boolean;
  } | null>(null);

  const emit = (next: Ink[]) =>
    onChange?.(next.map(({ points, widths }) => ({ points, widths })));

  // Clear reports an empty signature at once — the rewind that follows is the
  // animation, not the state — and the strokes are dropped when it finishes.
  React.useEffect(() => {
    if (!clearing) return;
    const drop = () => {
      setStrokes([]);
      setClearing(false);
    };
    if (!motionSafe) {
      drop();
      return;
    }
    const span =
      (0.5 + Math.max(strokes.length - 1, 0) * cascade(strokes.length)) * 1000 +
      90;
    const timer = window.setTimeout(drop, span);
    return () => window.clearTimeout(timer);
  }, [clearing, motionSafe, strokes.length]);

  const readPoint = (
    event: React.PointerEvent<SVGSVGElement>,
  ): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      Math.round((event.clientX - box.left) * 10) / 10,
      Math.round((event.clientY - box.top) * 10) / 10,
    ];
  };

  const handleDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (clearing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = readPoint(event);
    serial.current += 1;
    const stroke: Ink = {
      id: `s${serial.current}`,
      points: [at],
      widths: [MAX_NIB * 0.7],
    };
    drag.current = {
      id: event.pointerId,
      stroke,
      at,
      time: event.timeStamp,
      nib: MAX_NIB * 0.7,
      travel: 0,
      captured: false,
    };
    setLive({
      ...stroke,
      points: [...stroke.points],
      widths: [...stroke.widths],
    });
  };

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const pen = drag.current;
    if (!pen || pen.id !== event.pointerId) return;
    const at = readPoint(event);
    const step = Math.hypot(at[0] - pen.at[0], at[1] - pen.at[1]);
    if (step < MIN_STEP) return;

    pen.travel += step;
    if (!pen.captured && pen.travel > CAPTURE_AT) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
        pen.captured = true;
      } catch {
        // A synthetic sweep can raise a pointer id the element never saw.
      }
    }

    const gap = Math.max(event.timeStamp - pen.time, 1);
    const speed = Math.min(step / gap / FAST, 1);
    const wanted = MAX_NIB - (MAX_NIB - MIN_NIB) * speed;
    pen.nib += (wanted - pen.nib) * SMOOTHING;
    pen.at = at;
    pen.time = event.timeStamp;
    pen.stroke.points.push(at);
    pen.stroke.widths.push(Math.round(pen.nib * 100) / 100);
    setLive({
      ...pen.stroke,
      points: [...pen.stroke.points],
      widths: [...pen.stroke.widths],
    });
  };

  const handleUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const pen = drag.current;
    if (!pen || pen.id !== event.pointerId) return;
    drag.current = null;
    if (pen.captured) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already have been lost; releasing twice is harmless.
      }
    }
    setLive(null);
    const next = [...strokes, pen.stroke];
    setStrokes(next);
    emit(next);
  };

  // Without capture, a release outside the pad never reports back — so a stroke
  // that has not earned capture yet ends when the pointer leaves, or the next
  // hover would carry on drawing it.
  const handleLeave = (event: React.PointerEvent<SVGSVGElement>) => {
    const pen = drag.current;
    if (!pen || pen.id !== event.pointerId || pen.captured) return;
    handleUp(event);
  };

  const undo = () => {
    if (strokes.length === 0) return;
    const next = strokes.slice(0, -1);
    setStrokes(next);
    emit(next);
  };

  const drawn = live ? [...strokes, live] : strokes;
  const empty = drawn.length === 0 && typed.length === 0;
  const rewinding = clearing && motionSafe;
  const rewindStep = cascade(strokes.length);
  const lift = {
    opacity: 0,
    y: motionSafe ? -distances.nudge : 0,
    transition: motionSafe ? exitFor(durations.base) : { duration: 0 },
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="text-sm font-medium text-foreground">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={strokes.length === 0 || clearing}
            className={cn(CONTROL, "text-foreground hover:bg-accent")}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => {
              setClearing(true);
              onChange?.([]);
            }}
            disabled={strokes.length === 0 || clearing}
            className={cn(
              CONTROL,
              "text-muted-foreground hover:text-foreground",
            )}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3 border border-hairline bg-surface-1">
        <svg
          width="100%"
          height={height}
          aria-hidden
          className="block touch-none text-foreground select-none"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onPointerLeave={handleLeave}
        >
          <rect
            x={0}
            y={height - 40}
            width="100%"
            height={1}
            className="fill-hairline-strong"
          />
          <path
            d={`M14 ${height - 52} l8 8 M22 ${height - 52} l-8 8`}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            className="text-hairline-strong"
          />

          <motion.text
            x="50%"
            y={height - 52}
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
            initial={false}
            animate={{ opacity: empty ? 1 : 0 }}
            transition={{ duration: durations.fast }}
          >
            Sign here with a pointer
          </motion.text>

          {typed.length > 0 && drawn.length === 0 && (
            <text
              x="50%"
              y={height - 46}
              textAnchor="middle"
              fill={penColor}
              className="italic"
              // Sized off the name's length rather than measured, so a long
              // one shrinks to the line instead of running off it.
              style={{ fontSize: Math.min(28, 540 / typed.length) }}
            >
              {typed}
            </text>
          )}

          <AnimatePresence initial={false}>
            {drawn.map((stroke, index) => {
              const delay =
                Math.max(strokes.length - 1 - index, 0) * rewindStep;
              return (
                <motion.g key={stroke.id} exit={lift}>
                  <mask id={`${uid}-${stroke.id}`} maskUnits="userSpaceOnUse">
                    {/* Luminance, not colour — white is coverage and stays white
                      in either theme. */}
                    <motion.path
                      d={centerline(stroke)}
                      stroke="white"
                      strokeWidth={nibCover(stroke)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      initial={false}
                      animate={{ pathLength: rewinding ? 0 : 1 }}
                      // Last stroke first: the signature un-writes.
                      transition={
                        rewinding
                          ? { ...springs.glide, delay }
                          : { duration: 0 }
                      }
                    />
                  </mask>
                  <path
                    d={ribbon(stroke)}
                    fill={penColor}
                    mask={`url(#${uid}-${stroke.id})`}
                  />
                </motion.g>
              );
            })}
          </AnimatePresence>
        </svg>
      </div>

      {allowTyped && (
        <div>
          <label
            htmlFor={typedId}
            className="mb-1.5 block text-xs text-muted-foreground"
          >
            Or type your name to sign
          </label>
          <input
            id={typedId}
            type="text"
            maxLength={24}
            autoComplete="name"
            value={typed}
            aria-describedby={noteId}
            onChange={(event) => {
              setTyped(event.target.value);
              onTypedChange?.(event.target.value);
            }}
            className={cn(
              "h-9 w-full min-w-0 rounded-2 border border-input bg-surface-1 px-3 text-sm text-foreground italic outline-none placeholder:text-muted-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          />
          <p id={noteId} className="mt-1.5 text-xs text-muted-foreground">
            The pad takes a pointer only. A typed name signs just as well.
          </p>
        </div>
      )}

      <span role="status" className="sr-only">
        {strokes.length > 0
          ? `${strokes.length} ${strokes.length === 1 ? "stroke" : "strokes"} drawn`
          : typed.length > 0
            ? "Signed by name"
            : "No signature yet"}
      </span>
    </div>
  );
}
