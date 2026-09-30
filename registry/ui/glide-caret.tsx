"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, exitFor } from "@/registry/lib/motion";
import {
  panFrom,
  useTactileSound,
  type TactileTone,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type GlideCaretBlink = "smooth" | "step" | "none";

export type GlideCaretProps = {
  /** What the text is. Shown above the field and tied to it. */
  label: string;
  /** Controlled text. */
  value?: string;
  /** Starting text when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires on every edit, with the new text. */
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /** Visible lines, 2 to 12. @default 4 */
  rows?: number;
  /** The form field name, passed to the textarea. */
  name?: string;
  /** The caret spring's stiffness, 150 to 1200: floaty to tight. @default 600 */
  stiffness?: number;
  /** How far the caret's tail lags, 0 to 1: a plain bar to a long smear. @default 0.5 */
  stretch?: number;
  /** The caret's thickness in px, 1 to 4. @default 2 */
  width?: number;
  /** How the caret blinks at rest. @default "smooth" */
  blink?: GlideCaretBlink;
  /** Faint taps as the caret lands. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The textarea's text box, shared with its mirror so both wrap the same. */
const TEXT = "px-3 py-2 text-sm leading-6";
/** One slot per visible line of selection; enough for twelve rows and a spare. */
const POOL = 16;
/** A selected line with nothing on it still shows this much highlight. */
const EMPTY_LINE = 6;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

type Line = { x: number; y: number; w: number; line: number };
type Geometry = {
  /** The insertion point: its x, and the top of the caret. */
  x: number;
  y: number;
  line: number;
  /** One rect per selected line, empty when collapsed. */
  lines: Line[];
};
type Slot = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  w: MotionValue<number>;
  o: MotionValue<number>;
};
type Intent = { tone: TactileTone; pitch: number; gain: number };

/**
 * The hull of two vertical bars — the caret where it is going (head) and
 * where it is coming from (tail) — stroked with round joins. At rest it is a
 * bar. In flight the tail bar shortens the further behind it is, so the hull
 * is a wedge that thins toward where the caret came from: a streak, not a
 * block over the text. Drawn translucent under a solid bar at the head.
 * Rebuilt each frame, every number rounded.
 */
function hull(
  hx: number,
  hy: number,
  tx: number,
  ty: number,
  w: number,
  h: number,
): string {
  const half = Math.max(0, h / 2 - w / 2);
  const gap = Math.hypot(hx - tx, hy - ty);
  if (gap < 0.05) {
    return `M${r2(hx)} ${r2(hy + h / 2 - half)}L${r2(hx)} ${r2(hy + h / 2 + half)}`;
  }
  const thin = clamp(1 - gap / (h * 1.5), 0.18, 1);
  const head = { x: hx, top: hy + h / 2 - half, bottom: hy + h / 2 + half };
  const tail = {
    x: tx,
    top: ty + h / 2 - half * thin,
    bottom: ty + h / 2 + half * thin,
  };
  const [l, r] = head.x <= tail.x ? [head, tail] : [tail, head];
  return `M${r2(l.x)} ${r2(l.top)}L${r2(r.x)} ${r2(r.top)}L${r2(r.x)} ${r2(r.bottom)}L${r2(l.x)} ${r2(l.bottom)}Z`;
}

/**
 * A native textarea with a caret that glides. The caret's place is read from
 * a mirror of the text (same font, padding and wrapping); the head springs
 * there at the chosen `stiffness` and a softer tail follows, and the caret is
 * drawn as the hull of the two, so it stretches along its path and shrinks
 * back to a bar as the tail catches up. Selecting text hides the native
 * highlight and draws one rect per line that springs out from the caret's
 * column, lines further away starting a beat later, with the caret riding the
 * active end. At rest the caret blinks smoothly, stepwise, or not at all.
 *
 * Everything else is the textarea's own: typing, selection, IME, paste, undo,
 * spellcheck, scrolling, the form value. The native caret is hidden only
 * while the drawn one is showing and focus is inside; during IME composition,
 * before the first measurement and in forced-colours mode the native caret
 * and highlight come back. Under reduced motion the caret moves at once with
 * no stretch or blink, and the selection fades in line by line.
 */
export function GlideCaret({
  label,
  value,
  defaultValue = "",
  onValueChange,
  placeholder,
  rows = 4,
  name,
  stiffness = 600,
  stretch = 0.5,
  width = 2,
  blink = "smooth",
  sound = false,
  disabled = false,
  className,
}: GlideCaretProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const fieldId = React.useId();
  const [own, setOwn] = React.useState(defaultValue);
  const text = value ?? own;
  const lineCount = Math.round(clamp(rows, 2, 12));
  const k = clamp(stiffness, 60, 2000);
  const s = clamp(stretch, 0, 1);
  const thickness = r2(clamp(width, 1, 4));

  // Whether the drawn caret has taken over from the native one.
  const [custom, setCustom] = React.useState(false);

  const areaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = React.useRef<HTMLDivElement | null>(null);
  const blinkRef = React.useRef<HTMLDivElement | null>(null);

  const hx = useMotionValue(0);
  const hy = useMotionValue(0);
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const caretW = useMotionValue(thickness);
  const caretH = useMotionValue(18);
  const lineH = useMotionValue(24);
  const shown = useMotionValue(0);
  const [pool] = React.useState<Slot[]>(() =>
    Array.from({ length: POOL }, () => ({
      x: motionValue(0),
      y: motionValue(0),
      w: motionValue(0),
      o: motionValue(0),
    })),
  );

  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const slotRuns = React.useRef<(AnimationPlaybackControls[] | null)[]>([]);
  const slotLine = React.useRef<number[]>(
    Array.from({ length: POOL }, () => -1),
  );
  const blinking = React.useRef<AnimationPlaybackControls | null>(null);
  const frame = React.useRef<number | null>(null);
  const jumpNext = React.useRef(false);
  const placed = React.useRef<{ x: number; y: number } | null>(null);
  const intent = React.useRef<Intent | null>(null);
  const composing = React.useRef(false);
  const focused = React.useRef(false);

  // What the per-frame code reads, current on every render.
  const feel = React.useRef({
    k,
    s,
    motionSafe,
    blink,
    audio,
    custom,
    disabled,
  });
  React.useEffect(() => {
    feel.current = { k, s, motionSafe, blink, audio, custom, disabled };
    caretW.set(thickness);
  });

  /** Reads the caret and the selection off the mirror, in field coordinates. */
  const measure = React.useCallback((): Geometry | null => {
    const area = areaRef.current;
    const mirror = mirrorRef.current;
    if (!area || !mirror) return null;
    const { value: v, selectionStart: a, selectionEnd: b } = area;
    const style = getComputedStyle(area);
    const lh = parseFloat(style.lineHeight) || 24;
    const padTop = parseFloat(style.paddingTop) || 8;
    const font = parseFloat(style.fontSize) || 14;
    mirror.style.width = `${area.clientWidth}px`;
    const before = document.createTextNode(v.slice(0, a));
    const picked = document.createElement("span");
    picked.textContent = v.slice(a, b);
    const after = document.createElement("span");
    // The text after the caret keeps the caret's line wrapped as the
    // textarea wraps it; an empty tail still needs a box to measure.
    after.textContent = v.slice(b) || "\u200b";
    mirror.replaceChildren(before, picked, after);

    const lineOf = (top: number) =>
      Math.max(0, Math.floor((top - padTop + 2) / lh));
    const backward = a !== b && area.selectionDirection === "backward";
    const marker = backward ? picked : after;
    const line = lineOf(marker.offsetTop);
    const h = Math.min(lh, Math.round(font * 1.3));
    lineH.set(lh);
    caretH.set(h);

    const lines: Line[] = [];
    if (a !== b) {
      const box = mirror.getBoundingClientRect();
      const seen = new Map<number, Line>();
      for (const r of Array.from(picked.getClientRects())) {
        const l = lineOf(r.top - box.top);
        const prev = seen.get(l);
        const x0 = r.left - box.left - area.scrollLeft;
        if (prev) {
          const right = Math.max(prev.x + prev.w, x0 + r.width);
          prev.x = Math.min(prev.x, x0);
          prev.w = right - prev.x;
        } else {
          seen.set(l, {
            x: x0,
            y: padTop + l * lh - area.scrollTop,
            w: r.width,
            line: l,
          });
        }
      }
      const found = [...seen.keys()];
      const first = Math.min(...found);
      const last = Math.max(...found);
      const padLeft = parseFloat(style.paddingLeft) || 12;
      for (let l = first; l <= last; l += 1) {
        const got = seen.get(l) ?? {
          x: padLeft,
          y: padTop + l * lh - area.scrollTop,
          w: 0,
          line: l,
        };
        lines.push({
          x: r2(got.x),
          y: r2(got.y),
          w: r2(Math.max(EMPTY_LINE, got.w)),
          line: l,
        });
      }
    }
    return {
      x: r2(marker.offsetLeft - area.scrollLeft),
      y: r2(padTop + line * lh + (lh - h) / 2 - area.scrollTop),
      line,
      lines,
    };
  }, [caretH, lineH]);

  const restartBlink = React.useCallback(() => {
    blinking.current?.stop();
    blinking.current = null;
    const el = blinkRef.current;
    if (!el) return;
    el.style.opacity = "1";
    const { blink: mode, motionSafe: safe, custom: on } = feel.current;
    if (!on || !safe || mode === "none" || !focused.current) return;
    // A compositor animation on the element: nothing runs per frame in
    // script, and it restarts solid after every move.
    blinking.current =
      mode === "step"
        ? animate(
            el,
            { opacity: [1, 1, 0, 0] },
            {
              duration: 1.06,
              times: [0, 0.5, 0.5, 1],
              ease: "linear",
              repeat: Infinity,
              delay: 0.3,
            },
          )
        : // One symmetric breath per cycle; a mirrored repeat would drop
          // this to script-driven frames.
          animate(
            el,
            { opacity: [1, 0.08, 1] },
            {
              duration: 1.06,
              ease: "easeInOut",
              repeat: Infinity,
              delay: 0.5,
            },
          );
  }, []);

  const stopCaret = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
  }, []);

  const paintSelection = React.useCallback(
    (geo: Geometry, jump: boolean, fromX: number) => {
      const { k: stiff, motionSafe: safe } = feel.current;
      const area = areaRef.current;
      const height = area?.clientHeight ?? 0;
      const lh = lineH.get();
      const wanted = new Map<number, Line>();
      for (const l of geo.lines) {
        if (l.y + lh < 0 || l.y > height) continue;
        wanted.set(((l.line % POOL) + POOL) % POOL, l);
      }
      const grow = spring(stiff, 0.9);
      const step = cascade(geo.lines.length);
      pool.forEach((slot, i) => {
        const target = wanted.get(i);
        slotRuns.current[i]?.forEach((c) => c.stop());
        slotRuns.current[i] = null;
        if (!target) {
          if (slotLine.current[i] !== -1) {
            slotLine.current[i] = -1;
            slotRuns.current[i] = [animate(slot.o, 0, exitFor(durations.fast))];
          }
          return;
        }
        const fresh = slotLine.current[i] !== target.line;
        slotLine.current[i] = target.line;
        slot.y.set(target.y);
        if (jump || !safe) {
          slot.x.set(target.x);
          slot.w.set(target.w);
          if (fresh && !jump) {
            slot.o.set(0);
            slotRuns.current[i] = [
              animate(slot.o, 1, {
                duration: durations.fast,
                ease: easings.enter,
              }),
            ];
          } else slot.o.set(1);
          return;
        }
        if (fresh) {
          // A new line grows out of the caret's column, clamped into the line.
          slot.x.set(r2(clamp(fromX, target.x, target.x + target.w)));
          slot.w.set(0);
          slot.o.set(1);
        }
        const delay = fresh
          ? Math.min(0.24, Math.abs(target.line - geo.line) * step)
          : 0;
        slotRuns.current[i] = [
          animate(slot.x, target.x, {
            ...grow,
            delay,
            velocity: slot.x.getVelocity(),
          }),
          animate(slot.w, target.w, {
            ...grow,
            delay,
            velocity: slot.w.getVelocity(),
          }),
        ];
      });
    },
    [lineH, pool],
  );

  /** One read of the layout and one retarget of every spring. */
  const update = React.useCallback(
    (jump: boolean) => {
      const area = areaRef.current;
      const geo = measure();
      if (!area || !geo) return;
      const { k: stiff, s: lag, motionSafe: safe, audio: out } = feel.current;
      const from = placed.current;
      const fromX = from ? hx.get() : geo.x;
      const moved =
        from !== null &&
        (Math.abs(from.x - geo.x) > 0.5 || Math.abs(from.y - geo.y) > 0.5);
      placed.current = { x: geo.x, y: geo.y };

      if (jump || from === null || !safe) {
        stopCaret();
        hx.set(geo.x);
        hy.set(geo.y);
        tx.set(geo.x);
        ty.set(geo.y);
      } else if (moved) {
        stopCaret();
        const head = spring(stiff, 0.82);
        const tail = spring(stiff * lerp(1, 0.22, lag), 1);
        running.current = [
          animate(hx, geo.x, { ...head, velocity: hx.getVelocity() }),
          animate(hy, geo.y, { ...head, velocity: hy.getVelocity() }),
          animate(tx, geo.x, { ...tail, velocity: tx.getVelocity() }),
          animate(ty, geo.y, { ...tail, velocity: ty.getVelocity() }),
        ];
      }
      paintSelection(geo, jump, fromX);
      if (moved || jump) restartBlink();

      // The tap belongs to the landing that the key or press caused.
      const tap = intent.current;
      if (moved && tap) {
        intent.current = null;
        const box = area.getBoundingClientRect();
        out.play(tap.tone, {
          pitch: tap.pitch,
          gain: tap.gain,
          pan: panFrom(box.left + geo.x, area),
        });
      }
    },
    [hx, hy, measure, paintSelection, restartBlink, stopCaret, tx, ty],
  );

  /** Coalesces every signal in a frame into one measurement. */
  const schedule = React.useCallback(
    (jump = false) => {
      if (jump) jumpNext.current = true;
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const j = jumpNext.current;
        jumpNext.current = false;
        if (!feel.current.custom || !focused.current) return;
        update(j);
      });
    },
    [update],
  );

  const hide = React.useCallback(() => {
    placed.current = null;
    stopCaret();
    blinking.current?.stop();
    blinking.current = null;
    shown.set(0);
    pool.forEach((slot, i) => {
      slotRuns.current[i]?.forEach((c) => c.stop());
      slotRuns.current[i] = null;
      slotLine.current[i] = -1;
      slot.o.set(0);
    });
  }, [pool, shown, stopCaret]);

  // The drawn caret takes over (or hands back) as focus and composition
  // allow; the first measurement places it without travel.
  React.useEffect(() => {
    if (custom && !disabled) {
      shown.set(1);
      schedule(true);
      return;
    }
    hide();
  }, [custom, disabled, hide, schedule, shown]);

  // Text from the host, a new blink mode or motion preference: re-read.
  React.useLayoutEffect(() => {
    schedule();
  }, [text, schedule]);
  React.useEffect(() => {
    restartBlink();
  }, [blink, motionSafe, restartBlink]);

  React.useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const onSelection = () => {
      if (document.activeElement === area) schedule();
    };
    // A narrower field rewraps the text: re-read without travel.
    const observer = new ResizeObserver(() => schedule(true));
    observer.observe(area);
    document.addEventListener("selectionchange", onSelection);
    return () => {
      observer.disconnect();
      document.removeEventListener("selectionchange", onSelection);
    };
  }, [schedule]);

  React.useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      stopCaret();
      blinking.current?.stop();
      for (const runs of slotRuns.current) runs?.forEach((c) => c.stop());
    },
    [stopCaret],
  );

  const bar = useTransform(
    [hx, hy, caretW, caretH] as MotionValue<number>[],
    ([a = 0, b = 0, w = 2, h = 18]: number[]) => hull(a, b, a, b, w, h),
  );
  const trail = useTransform(
    [hx, hy, tx, ty, caretW, caretH] as MotionValue<number>[],
    ([a = 0, b = 0, c = 0, d = 0, w = 2, h = 18]: number[]) =>
      hull(a, b, c, d, w, h),
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    const key = event.key;
    if (event.metaKey || event.ctrlKey || event.altKey) {
      intent.current = { tone: "tick", pitch: 1.25, gain: 0.1 };
    } else if (key === "Enter") {
      intent.current = { tone: "detent", pitch: 0.9, gain: 0.18 };
    } else if (key === "Backspace" || key === "Delete") {
      intent.current = { tone: "tick", pitch: 0.85, gain: 0.12 };
    } else if (key.length === 1) {
      // Each character its own small pitch, so a word is not one note.
      const nudge = ((key.charCodeAt(0) * 7) % 9) - 4;
      intent.current = {
        tone: "tick",
        pitch: r2(1 + nudge * 0.025),
        gain: 0.14,
      };
    } else if (
      key.startsWith("Arrow") ||
      key.startsWith("Page") ||
      key === "Home" ||
      key === "End"
    ) {
      intent.current = { tone: "tick", pitch: 1.25, gain: 0.1 };
    }
  };

  return (
    <div className={cn("relative flex w-full flex-col gap-1.5", className)}>
      <label
        htmlFor={fieldId}
        className={cn("text-xs text-ink-3", disabled && "opacity-50")}
      >
        {label}
      </label>
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3 bg-surface-1"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-px overflow-clip rounded-3 forced-colors:hidden"
        >
          <div
            ref={mirrorRef}
            className={cn(
              TEXT,
              "invisible absolute top-0 left-0 break-words whitespace-pre-wrap",
            )}
          />
          {pool.map((slot, i) => (
            <motion.div
              key={i}
              className="absolute top-0 left-0 rounded-1 bg-cobalt-bright/25"
              style={{
                x: slot.x,
                y: slot.y,
                width: slot.w,
                height: lineH,
                opacity: slot.o,
              }}
            />
          ))}
        </div>
        <textarea
          ref={areaRef}
          id={fieldId}
          name={name}
          rows={lineCount}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            if (value === undefined) setOwn(next);
            onValueChange?.(next);
            schedule();
          }}
          onFocus={() => {
            focused.current = true;
            if (!composing.current && !disabled) setCustom(true);
          }}
          onBlur={() => {
            focused.current = false;
            intent.current = null;
            setCustom(false);
          }}
          onCompositionStart={() => {
            composing.current = true;
            setCustom(false);
          }}
          onCompositionEnd={() => {
            composing.current = false;
            if (focused.current) setCustom(true);
          }}
          onKeyDown={onKeyDown}
          onPointerDown={() => {
            intent.current = { tone: "tick", pitch: 1.25, gain: 0.1 };
          }}
          onScroll={() => schedule(true)}
          className={cn(
            TEXT,
            "relative block w-full resize-none rounded-3 border border-input bg-transparent text-foreground transition-colors outline-none placeholder:text-ink-3",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "enabled:hover:border-ink-3/50 disabled:cursor-not-allowed disabled:opacity-50",
            custom &&
              "caret-transparent selection:bg-transparent forced-colors:[caret-color:auto] forced-colors:selection:bg-[Highlight]",
          )}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-px overflow-clip rounded-3 forced-colors:hidden"
        >
          <motion.div className="absolute inset-0" style={{ opacity: shown }}>
            {/* The blink is an opacity animation on this HTML box, so it
                runs on the compositor with no script per frame. */}
            <div ref={blinkRef} className="absolute inset-0">
              <svg className="absolute inset-0 size-full text-cobalt-bright">
                {/* The trail sits under the bar and lets the text read
                    through; at rest the two are the same shape. */}
                <g opacity={0.42}>
                  <motion.path
                    d={trail}
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth={caretW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
                <motion.path
                  d={bar}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={caretW}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
