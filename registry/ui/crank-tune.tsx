"use client";

import * as React from "react";

import { Music, Music2, Music3, Music4 } from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { angleDelta } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Stage box, in px — box on the left, crank sweep on the right. */
const STAGE_W = 220;
const STAGE_H = 168;

/** The music box body. */
const BOX_LEFT = 4;
const BOX_W = 132;
const BOX_H = 92;
const BOX_TOP = (STAGE_H - BOX_H) / 2;

/** The note slot cut into the box top. */
const SLOT_W = 30;
const SLOT_H = 7;
const SLOT_X = BOX_LEFT + BOX_W / 2;
const SLOT_Y = BOX_TOP + 10;

/** Crank rig, centered on the hub where it meets the box's right wall. */
const HUB_CX = BOX_LEFT + BOX_W;
const HUB_CY = BOX_TOP + BOX_H / 2;
const ARM_LEN = 44;
const KNOB_D = 22;
const HUB_D = 16;
const SHAFT_W = 5;
/** Square hit area big enough to contain the whole knob sweep. */
const CRANK_BOX = 2 * (ARM_LEN + KNOB_D / 2 + 6);
const CRANK_LEFT = HUB_CX - CRANK_BOX / 2;
const CRANK_TOP = HUB_CY - CRANK_BOX / 2;
const CRANK_CENTER = CRANK_BOX / 2;

/** Degrees of forward crank travel that bank one note. */
const QUARTER_TURN = 90;
/** Floating notes on screen at once; the oldest is dropped past this. */
const MAX_FLOATING = 6;
/** Full-motion flight time (arc + fade), s — the note's whole life on stage. */
const FLIGHT_S = 1.1;
const FLIGHT_MS = FLIGHT_S * 1000;
/** Reduced-motion notes just fade in place, on the house `slow` duration. */
const FADE_MS = durations.slow * 1000;
/** How far a note rises before it's gone, px. */
const NOTE_RISE = 84;

/** Cycled note glyphs, fixed order — never randomized. */
const NOTE_ICONS = [Music, Music2, Music3, Music4] as const;
/** Fixed per-note x drift, px, cycled by note index — no Math.random(). */
const NOTE_DRIFT_X = [-20, 14, -8, 24, -28, 6] as const;

type FloatingNoteData = {
  id: number;
  iconIndex: number;
  driftX: number;
};

export type CrankTuneProps = {
  /** Fires once per note emitted, with the note's sequential index (0-based). */
  onNote?: (index: number) => void;
  className?: string;
};

/**
 * A music box you crank. Drag the knob in circles — pointerdown measures the
 * bearing from the hub center to the pointer, and every subsequent move folds
 * in the shortest signed angle delta, so the arm tracks the pointer 1:1 past
 * any number of full turns. Every quarter turn of *forward* travel pops a note
 * (Music/Music2/Music3/Music4, cycling) out of the slot on the box top, which
 * floats up and away on a fixed arc with its own fixed x drift; cranking
 * backward just swings the arm and stays quiet, up to six notes float at once
 * (the oldest is dropped), and a mono counter tallies the total. Enter or
 * Space on the crank (a real button) turns it a crisp quarter on the `snap`
 * spring and banks exactly one note.
 * Reduced motion: dragging still tracks the pointer 1:1 — this is direct
 * manipulation, not decoration — but notes appear at their landing spot and
 * simply fade instead of arcing, and the keyboard quarter turn snaps instantly.
 */
export function CrankTune({
  onNote,
  className,
}: CrankTuneProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  /** The arm's rendered rotation, deg — unbounded, follows the pointer 1:1. */
  const armAngle = useMotionValue(0);

  const [notesPlayed, setNotesPlayed] = React.useState(0);
  const [floatingNotes, setFloatingNotes] = React.useState<FloatingNoteData[]>(
    [],
  );
  const [message, setMessage] = React.useState("");

  /** Total accumulated rotation, deg (signed, unbounded) — the note ledger. */
  const accumulatedRef = React.useRef(0);
  /** How many notes have played — also the next note's icon/drift index. */
  const notesPlayedRef = React.useRef(0);
  const nextNoteIdRef = React.useRef(0);
  const dragRef = React.useRef<{ pointerId: number; lastAngle: number } | null>(
    null,
  );
  const hubRef = React.useRef<HTMLSpanElement>(null);
  const armAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const timersRef = React.useRef(new Set<ReturnType<typeof setTimeout>>());

  // Nothing outlives the component: pending removal timers and any in-flight
  // keyboard spring are stopped on unmount.
  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      armAnimRef.current?.stop();
    };
  }, []);

  /** One note: bumps the counter, tells `onNote`, and spawns a floating glyph. */
  const emitNote = () => {
    const index = notesPlayedRef.current;
    notesPlayedRef.current = index + 1;
    setNotesPlayed(notesPlayedRef.current);
    setMessage(`${notesPlayedRef.current} notes played`);
    onNote?.(index);

    const id = nextNoteIdRef.current;
    nextNoteIdRef.current += 1;
    const iconIndex = index % NOTE_ICONS.length;
    const driftX = NOTE_DRIFT_X[index % NOTE_DRIFT_X.length] ?? 0;
    setFloatingNotes((current) => {
      const next = [...current, { id, iconIndex, driftX }];
      return next.length > MAX_FLOATING
        ? next.slice(next.length - MAX_FLOATING)
        : next;
    });

    const life = motionSafe ? FLIGHT_MS : FADE_MS;
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      setFloatingNotes((current) => current.filter((note) => note.id !== id));
    }, life);
    timersRef.current.add(timer);
  };

  /**
   * Folds one signed angle delta into the ledger and rotates the arm by it.
   * Forward travel (`deltaDeg > 0`) that crosses one or more quarter-turn
   * boundaries bank a note per boundary; backward travel just moves the
   * ledger (and the arm) with no note — cranking backward stays honest.
   */
  const advanceRotation = (deltaDeg: number): number => {
    const prev = accumulatedRef.current;
    const next = prev + deltaDeg;
    accumulatedRef.current = next;
    if (deltaDeg > 0) {
      const fromBucket = Math.floor(prev / QUARTER_TURN);
      const toBucket = Math.floor(next / QUARTER_TURN);
      for (let bucket = fromBucket + 1; bucket <= toBucket; bucket += 1) {
        emitNote();
      }
    }
    return next;
  };

  const hubCenter = (): { x: number; y: number } | null => {
    const el = hubRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const bearingTo = (
    clientX: number,
    clientY: number,
    center: { x: number; y: number },
  ): number =>
    Math.atan2(clientY - center.y, clientX - center.x) * (180 / Math.PI);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    const center = hubCenter();
    if (!center) return;
    armAnimRef.current?.stop();
    const angle = bearingTo(event.clientX, event.clientY, center);
    dragRef.current = { pointerId: event.pointerId, lastAngle: angle };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const center = hubCenter();
    if (!center) return;
    const angle = bearingTo(event.clientX, event.clientY, center);
    const delta = angleDelta(drag.lastAngle, angle);
    drag.lastAngle = angle;
    const next = advanceRotation(delta);
    armAngle.set(next);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /** Enter/Space: one crisp quarter turn, one note. Instant under reduced motion. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (event.repeat || dragRef.current) return;
    const next = advanceRotation(QUARTER_TURN);
    armAnimRef.current?.stop();
    if (motionSafe) {
      armAnimRef.current = animate(armAngle, next, springs.snap);
    } else {
      armAngle.set(next);
    }
  };

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-3 select-none",
        className,
      )}
    >
      <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
        {/* THE BOX — a small rounded case with a paneled lid. */}
        <div
          aria-hidden
          className="absolute rounded-3 border border-hairline-strong bg-surface-1 shadow-raised"
          style={{ left: BOX_LEFT, top: BOX_TOP, width: BOX_W, height: BOX_H }}
        >
          <div className="absolute inset-x-0 top-[26%] border-t border-hairline/60" />
          <div className="absolute inset-3 top-[32%] rounded-2 border border-hairline/60" />
        </div>

        {/* The slot the notes pop out of. */}
        <span
          aria-hidden
          className="absolute rounded-full border border-hairline-strong bg-surface-2"
          style={{
            left: SLOT_X - SLOT_W / 2,
            top: SLOT_Y,
            width: SLOT_W,
            height: SLOT_H,
          }}
        />

        {/* Floating notes, anchored to the slot's center. */}
        <AnimatePresence>
          {floatingNotes.map((note) => (
            <FloatingNote key={note.id} note={note} motionSafe={motionSafe} />
          ))}
        </AnimatePresence>

        {/* THE CRANK — hub, rotating arm, knob. A real button. */}
        <button
          type="button"
          aria-label="Crank the music box"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onKeyDown={handleKeyDown}
          className={cn(
            "absolute cursor-grab touch-none rounded-full outline-none select-none",
            "focus-visible:ring-2 focus-visible:ring-ring/60 active:cursor-grabbing",
          )}
          style={{
            left: CRANK_LEFT,
            top: CRANK_TOP,
            width: CRANK_BOX,
            height: CRANK_BOX,
          }}
        >
          {/* The hub pin — fixed, never rotates; its rect drives the atan2 math. */}
          <span
            ref={hubRef}
            aria-hidden
            className="absolute rounded-full border border-hairline-strong bg-surface-2 shadow-raised"
            style={{
              left: CRANK_CENTER - HUB_D / 2,
              top: CRANK_CENTER - HUB_D / 2,
              width: HUB_D,
              height: HUB_D,
            }}
          />

          {/* The arm: shaft + knob, rotating about the container's center
              (which sits exactly on the hub). */}
          <motion.span
            aria-hidden
            className="absolute inset-0 block"
            style={{ rotate: armAngle }}
          >
            <span
              className="absolute rounded-full bg-surface-2"
              style={{
                left: CRANK_CENTER,
                top: CRANK_CENTER - SHAFT_W / 2,
                width: ARM_LEN,
                height: SHAFT_W,
              }}
            />
            <span
              className="absolute rounded-full border border-hairline-strong bg-surface-1 shadow-raised"
              style={{
                left: CRANK_CENTER + ARM_LEN - KNOB_D / 2,
                top: CRANK_CENTER - KNOB_D / 2,
                width: KNOB_D,
                height: KNOB_D,
              }}
            >
              <span
                className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: "var(--primary)" }}
              />
            </span>
          </motion.span>
        </button>
      </div>

      <span
        aria-hidden
        className="text-label font-mono text-ink-3 tabular-nums"
      >
        {String(notesPlayed).padStart(2, "0")} notes played
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </div>
  );
}

/**
 * One floating note glyph. Full motion: pops from the slot and rides a fixed
 * three-point arc (transform + opacity tween, `easings.exit`, ~1.1s) drifting
 * `note.driftX` on the way. Reduced motion: renders straight at its landing
 * spot and only fades — no arc.
 */
function FloatingNote({
  note,
  motionSafe,
}: {
  note: FloatingNoteData;
  motionSafe: boolean;
}) {
  const Icon = NOTE_ICONS[note.iconIndex % NOTE_ICONS.length] ?? Music;

  if (!motionSafe) {
    return (
      <motion.span
        aria-hidden
        className="pointer-events-none absolute block text-ink-2"
        style={{
          left: SLOT_X,
          top: SLOT_Y,
          x: note.driftX,
          y: -NOTE_RISE,
          marginLeft: -8,
          marginTop: -8,
        }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: durations.slow, ease: easings.exit }}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </motion.span>
    );
  }

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute block text-ink-2"
      style={{ left: SLOT_X, top: SLOT_Y, marginLeft: -8, marginTop: -8 }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
      animate={{
        x: [0, note.driftX * 0.35, note.driftX * 0.75, note.driftX],
        y: [0, -NOTE_RISE * 0.3, -NOTE_RISE * 0.68, -NOTE_RISE],
        opacity: [0, 1, 0.8, 0],
        scale: [0.5, 1.05, 1, 0.85],
      }}
      transition={{ duration: FLIGHT_S, ease: easings.exit }}
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </motion.span>
  );
}
