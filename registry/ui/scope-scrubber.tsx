"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs, type SpringName } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Ring-buffer length of the oscilloscope trace. */
const SAMPLES = 64;
/** Trace viewBox — stretched to the plate with preserveAspectRatio="none". */
const TRACE_WIDTH = 100;
const TRACE_HEIGHT = 32;
const TRACE_PAD = 3;
/** Pointer travel (px) before a press becomes a scrub — protects double-click. */
const DRAG_THRESHOLD = 3;

const decimalsOf = (step: number): number => {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
};

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

type DragState = {
  pointerId: number;
  startX: number;
  startValue: number;
  engaged: boolean;
};

export type ScopeScrubberProps = {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min: number;
  max: number;
  /** Grid the value snaps to on release and steps by on keyboard. */
  step?: number;
  /** Value change per pixel of drag. Defaults to `(max - min) / 200`. */
  sensitivity?: number;
  /** Calibrated spring the value settles on after release. */
  settle?: SpringName;
  /** Suffix rendered after the numeral, e.g. `"ms"`. */
  unit?: string;
  label: string;
  /** Numeral formatter. Defaults to `toFixed` at the step's precision. */
  format?: (value: number) => string;
  /** Oscilloscope history trace behind the numeral. */
  trace?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Drag a value; watch its physics. Scrubbing tracks the pointer 1:1 while an
 * oscilloscope trace behind the numeral plots recent history in the signal
 * color. Release settles to the nearest step on the chosen spring — the
 * settle draws onto the trace too, so `snap` and `recoil` show their
 * overshoot. Keyboard steps ride the same spring; double-click or Enter
 * swaps in a numeric input. Reduced motion: scrubbing stays 1:1, release
 * snaps instantly, and the trace is hidden.
 */
export function ScopeScrubber({
  value: valueProp,
  defaultValue,
  onValueChange,
  min,
  max,
  step = 1,
  sensitivity,
  settle = "snap",
  unit,
  label,
  format,
  trace = true,
  disabled,
  className,
}: ScopeScrubberProps) {
  const motionSafe = useMotionSafe();
  const plateRef = React.useRef<HTMLDivElement>(null);

  const stepSafe = step > 0 ? step : 1;
  const decimals = decimalsOf(stepSafe);
  const pxSensitivity = sensitivity ?? (max - min) / 200;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const snapValue = (v: number) =>
    clamp(roundTo(min + Math.round((v - min) / stepSafe) * stepSafe, decimals));
  const fmt = format ?? ((v: number) => v.toFixed(decimals));

  const isControlled = valueProp !== undefined;
  const [inner, setInner] = React.useState(() => defaultValue ?? min);
  const logical = valueProp ?? inner;

  // The displayed value lives on a MotionValue so the settle spring can draw
  // itself onto the numeral and the trace without React re-renders.
  const displayMv = useMotionValue(valueProp ?? defaultValue ?? min);
  const displayTarget = React.useRef(valueProp ?? defaultValue ?? min);
  const settleControls = React.useRef<ReturnType<typeof animate> | null>(null);
  const formatted = useTransform(displayMv, (v) => fmt(v));

  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef<DragState | null>(null);

  const [editing, setEditing] = React.useState(false);
  const editingRef = React.useRef(false);
  const [draft, setDraft] = React.useState("");
  const restoreFocus = React.useRef(false);

  const stopSettle = React.useCallback(() => {
    settleControls.current?.stop();
    settleControls.current = null;
  }, []);
  React.useEffect(() => stopSettle, [stopSettle]);

  const animateDisplayTo = React.useCallback(
    (target: number) => {
      stopSettle();
      if (motionSafe) {
        // The settle rides the calibrated spring — its velocity and
        // overshoot stream onto the trace via the change subscription.
        settleControls.current = animate(displayMv, target, springs[settle]);
      } else {
        displayMv.set(target);
      }
    },
    [displayMv, motionSafe, settle, stopSettle],
  );

  const applyValue = (next: number, mode: "track" | "settle") => {
    displayTarget.current = next;
    if (mode === "track") {
      stopSettle();
      displayMv.set(next);
    } else {
      animateDisplayTo(next);
    }
    if (!isControlled) setInner(next);
    onValueChange?.(next);
  };

  // External (controlled) changes settle in on the same spring.
  React.useEffect(() => {
    if (valueProp === undefined) return;
    if (dragRef.current?.engaged) return;
    if (displayTarget.current === valueProp) return;
    displayTarget.current = valueProp;
    animateDisplayTo(valueProp);
  }, [valueProp, animateDisplayTo]);

  /* ---------------------------------- trace --------------------------------- */

  const showTrace = trace && motionSafe;
  const polylineRef = React.useRef<SVGPolylineElement>(null);
  const bufferRef = React.useRef<number[] | null>(null);
  if (bufferRef.current === null) {
    const seed = displayMv.get();
    bufferRef.current = Array.from({ length: SAMPLES }, () => seed);
  }

  // The polyline is drawn imperatively (never through props) so settle
  // frames update it without renders — and renders never clobber it.
  const renderTrace = React.useCallback(() => {
    const node = polylineRef.current;
    const buffer = bufferRef.current;
    if (!node || !buffer) return;
    const range = max - min || 1;
    const innerHeight = TRACE_HEIGHT - TRACE_PAD * 2;
    const points = buffer
      .map((sample, index) => {
        const x = (index / (SAMPLES - 1)) * TRACE_WIDTH;
        const ratio = (Math.min(max, Math.max(min, sample)) - min) / range;
        const y = TRACE_HEIGHT - TRACE_PAD - ratio * innerHeight;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    node.setAttribute("points", points);
  }, [min, max]);

  useMotionValueEvent(displayMv, "change", (sample) => {
    if (!showTrace) return;
    const buffer = bufferRef.current;
    if (!buffer) return;
    buffer.push(sample);
    if (buffer.length > SAMPLES) buffer.shift();
    renderTrace();
  });

  React.useEffect(() => {
    if (showTrace) renderTrace();
  }, [showTrace, renderTrace]);

  /* --------------------------------- editing -------------------------------- */

  const openEditor = () => {
    stopSettle();
    displayMv.set(logical);
    displayTarget.current = logical;
    setDraft(String(logical));
    editingRef.current = true;
    setEditing(true);
  };

  const closeEditor = (refocus: boolean) => {
    editingRef.current = false;
    restoreFocus.current = refocus;
    setEditing(false);
  };

  const commitDraft = (refocus: boolean) => {
    if (!editingRef.current) return;
    closeEditor(refocus);
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed)) applyValue(clamp(parsed), "settle");
  };

  React.useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      plateRef.current?.focus();
    }
  }, [editing]);

  /* --------------------------------- scrubbing ------------------------------ */

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (drag.engaged) {
      setDragging(false);
      applyValue(snapValue(displayMv.get()), "settle");
    } else if (displayMv.get() !== displayTarget.current) {
      // The press caught a settle mid-flight; let it finish.
      animateDisplayTo(displayTarget.current);
    }
  };

  return (
    <div
      ref={plateRef}
      role={editing ? undefined : "slider"}
      tabIndex={disabled || editing ? -1 : 0}
      aria-label={editing ? undefined : label}
      aria-valuemin={editing ? undefined : min}
      aria-valuemax={editing ? undefined : max}
      aria-valuenow={editing ? undefined : roundTo(logical, decimals + 2)}
      aria-valuetext={
        editing ? undefined : `${fmt(logical)}${unit ? ` ${unit}` : ""}`
      }
      aria-orientation={editing ? undefined : "horizontal"}
      aria-disabled={!editing && disabled ? true : undefined}
      onPointerDown={(event) => {
        if (disabled || editing || event.button !== 0) return;
        stopSettle();
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startValue: displayMv.get(),
          engaged: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || event.pointerId !== drag.pointerId || disabled) return;
        const dx = event.clientX - drag.startX;
        if (!drag.engaged) {
          if (Math.abs(dx) < DRAG_THRESHOLD) return;
          drag.engaged = true;
          setDragging(true);
        }
        // Direct manipulation: 1:1 under full and reduced motion alike.
        applyValue(clamp(drag.startValue + dx * pxSensitivity), "track");
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => {
        if (!disabled && !editing) openEditor();
      }}
      onKeyDown={(event) => {
        if (disabled || editing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          openEditor();
          return;
        }
        let next: number | null = null;
        switch (event.key) {
          case "ArrowRight":
          case "ArrowUp":
            next = clamp(roundTo(logical + stepSafe, decimals));
            break;
          case "ArrowLeft":
          case "ArrowDown":
            next = clamp(roundTo(logical - stepSafe, decimals));
            break;
          case "PageUp":
            next = clamp(roundTo(logical + stepSafe * 10, decimals));
            break;
          case "PageDown":
            next = clamp(roundTo(logical - stepSafe * 10, decimals));
            break;
          case "Home":
            next = min;
            break;
          case "End":
            next = max;
            break;
        }
        if (next === null) return;
        event.preventDefault();
        applyValue(next, "settle");
      }}
      className={cn(
        "border-input bg-card relative w-full cursor-ew-resize touch-none overflow-hidden rounded-2 border px-3 py-2 select-none",
        (dragging || editing) && "ring-2 ring-ring",
        editing && "cursor-text",
        disabled && "cursor-default opacity-50",
        className,
      )}
    >
      {showTrace && (
        <svg
          aria-hidden
          viewBox={`0 0 ${TRACE_WIDTH} ${TRACE_HEIGHT}`}
          preserveAspectRatio="none"
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-150",
            dragging ? "opacity-60" : "opacity-25",
          )}
        >
          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={0}
              x2={TRACE_WIDTH}
              y1={TRACE_HEIGHT * t}
              y2={TRACE_HEIGHT * t}
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polyline
            ref={polylineRef}
            fill="none"
            stroke="var(--signal, var(--primary))"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      <span className="text-muted-foreground relative block text-xs">
        {label}
      </span>
      <div className="relative flex items-baseline gap-1.5">
        {editing ? (
          <input
            // The plate's ring is the focus indicator while editing.
            autoFocus
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={stepSafe}
            value={draft}
            aria-label={label}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDraft(true);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeEditor(true);
              }
            }}
            onBlur={() => commitDraft(false)}
            className="text-foreground h-8 w-full min-w-0 border-0 bg-transparent p-0 font-mono text-2xl font-medium tabular-nums outline-none"
          />
        ) : (
          <motion.span className="text-foreground font-mono text-2xl font-medium tabular-nums">
            {formatted}
          </motion.span>
        )}
        {unit && (
          <span aria-hidden className="text-muted-foreground font-mono text-sm">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
