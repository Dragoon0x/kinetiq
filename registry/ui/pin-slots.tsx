"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PinSlotsState = "idle" | "checking" | "success" | "error";

export type PinSlotsSize = "sm" | "md" | "lg";

/** Pigments that read the same on a light page and a dark one. */
export type PinSlotsColor = "cobalt" | "signal" | "ember" | "rose";

export type PinSlotsProps = {
  /** Controlled code. */
  value?: string;
  /** Initial code when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires from the typing, paste or Backspace that changed the code. */
  onValueChange?: (value: string) => void;
  /** Fires once, from the keystroke or paste that fills the last slot. */
  onComplete?: (code: string) => void;
  /** How many slots. @default 6 */
  length?: number;
  /** Show each character as it lands, then turn it into a dot. @default false */
  mask?: boolean;
  /** How long a masked character stays readable, in ms. @default 600 */
  maskDelay?: number;
  /** What the host has made of the code: checking it, accepted (the slots lock into one bar) or refused (they shake). @default "idle" */
  state?: PinSlotsState;
  /** The field's name, shown above the slots unless `hideLabel`. @default "Verification code" */
  label?: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** A line under the slots while nothing has been decided. */
  hint?: string;
  /** Shown and announced when `state` is "success". @default "Code accepted." */
  successMessage?: string;
  /** Shown and announced when `state` is "error". @default "That code didn’t match. Try again." */
  errorMessage?: string;
  /** Digits only (a numeric keypad on phones), or letters and digits (upper-cased). @default "numeric" */
  charset?: "numeric" | "alphanumeric";
  /** A separator after this many slots, as in 123–456. */
  split?: number;
  /** Slot and glyph size. @default "md" */
  size?: PinSlotsSize;
  /** The caret slot's glow and the landing flash: a preset or any CSS colour. @default "cobalt" */
  color?: PinSlotsColor | (string & {});
  /** A form field name for the input. */
  name?: string;
  /** Focus the input on mount. @default false */
  autoFocus?: boolean;
  /** Tick as each character lands, chime when accepted, buzz when refused. Off unless asked for. @default false */
  sound?: boolean;
  /** Disables the input and dims the slots. @default false */
  disabled?: boolean;
  /** Classes for the outer column. */
  className?: string;
};

const PALETTE: Record<PinSlotsColor, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ember: "oklch(from var(--warn) 0.74 c h)",
  rose: "oklch(from var(--danger) 0.64 c h)",
};

type Metrics = {
  /** Largest slot width; narrow rows shrink below it. */
  w: number;
  h: number;
  gap: number;
  /** The separator's column. */
  sep: number;
  glyph: string;
  dot: number;
  drop: number;
};

const SIZES: Record<PinSlotsSize, Metrics> = {
  sm: { w: 36, h: 44, gap: 6, sep: 10, glyph: "text-lg", dot: 7, drop: 12 },
  md: { w: 44, h: 52, gap: 8, sep: 12, glyph: "text-2xl", dot: 8, drop: 14 },
  lg: { w: 52, h: 60, gap: 10, sep: 14, glyph: "text-3xl", dot: 10, drop: 16 },
};

type Glyph = { char: string; id: number; delay: number };
type Model = { value: string; glyphs: Glyph[]; next: number };

/** The slots' glyphs after a change: kept where the code is unchanged, new (with a cascade delay) where it differs. */
function evolve(prev: Model, value: string): Model {
  let same = 0;
  while (
    same < value.length &&
    same < prev.value.length &&
    value[same] === prev.value[same]
  ) {
    same += 1;
  }
  const added = value.length - same;
  const gap = cascade(Math.max(1, added));
  let next = prev.next;
  const glyphs: Glyph[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const kept = prev.glyphs[i];
    if (i < same && kept) {
      glyphs.push(kept);
    } else {
      next += 1;
      glyphs.push({ char: value[i] ?? "", id: next, delay: (i - same) * gap });
    }
  }
  return { value, glyphs, next };
}

/**
 * A one-time-code field whose characters drop into their slots. One real,
 * transparent input sits over the row — so typing, Backspace, paste and SMS
 * autofill are the browser's own — with the caret always at the end. Each
 * new character falls from above on the recoil spring, two small bounces
 * as it lands, and the slot's border catches the colour; the next empty slot
 * holds a glow that slides along on the snap spring. A paste fills every slot
 * in one cascade; Backspace lifts the last character out on the exit ease.
 *
 * The host answers through `state`. Checking dims the glyphs while a light
 * passes along the slots. Success locks the slots together: each slides
 * toward the centre on the snap spring until the gaps close, the separator
 * folds away, inner corners and borders dissolve, and the pieces are one bar
 * in the success pigment. Error shakes the row on a keyframe tween — a refusal
 * never springs — and turns it danger; typing again starts a fresh code.
 * Under reduced motion characters fade in place, the glow jumps, nothing
 * shakes or slides, and the bar and the danger state still show.
 */
export function PinSlots({
  value,
  defaultValue = "",
  onValueChange,
  onComplete,
  length = 6,
  mask = false,
  maskDelay = 600,
  state = "idle",
  label = "Verification code",
  hideLabel = false,
  hint,
  successMessage = "Code accepted.",
  errorMessage = "That code didn’t match. Try again.",
  charset = "numeric",
  split,
  size = "md",
  color = "cobalt",
  name,
  autoFocus = false,
  sound = false,
  disabled = false,
  className,
}: PinSlotsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const inputId = `${uid}-input`;
  const noteId = `${uid}-note`;
  const m = SIZES[size] ?? SIZES.md;
  const paint = (PALETTE as Record<string, string>)[color] ?? color;
  const n = Math.max(1, Math.min(12, Math.round(length)));
  const cut = split && split > 0 && split < n ? Math.round(split) : 0;
  const numeric = charset !== "alphanumeric";

  const clean = React.useCallback(
    (raw: string) =>
      (numeric
        ? raw.replace(/\D+/g, "")
        : raw.replace(/[^a-z0-9]+/gi, "").toUpperCase()
      ).slice(0, n),
    [n, numeric],
  );

  const [own, setOwn] = React.useState(() => clean(defaultValue));
  const code = clean(value ?? own);
  const [model, setModel] = React.useState<Model>(() => ({
    value: code,
    glyphs: [...code].map((char) => ({ char, id: 0, delay: 0 })),
    next: 0,
  }));
  // Derived from the code during render: a host's change (a reset, an
  // autofill it relays) drops in exactly as typing does.
  if (model.value !== code) setModel(evolve(model, code));
  const [focused, setFocused] = React.useState(false);

  const shake = useMotionValue(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const shakeAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const timers = React.useRef<number[]>([]);
  const touched = React.useRef(false);
  const seen = React.useRef(state);

  const locked = state === "success";
  const refused = state === "error";
  const checking = state === "checking";
  const caret = focused && !locked && !checking ? Math.min(code.length, n) : -1;

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, Math.max(0, Math.round(ms))));
  };

  const panAt = (i: number) => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return panFrom(rect.left + (rect.width * (i + 0.5)) / n, null);
  };

  const commit = (next: string) => {
    const prev = code;
    if (next === prev) return;
    touched.current = true;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    // Ticks are heard as the glyphs land, not as the keys go down.
    let same = 0;
    while (same < next.length && next[same] === prev[same]) same += 1;
    const gap = cascade(Math.max(1, next.length - same));
    for (let i = same; i < next.length; i += 1) {
      const k = i;
      later(
        () =>
          audio.play("tick", {
            pitch: semitones(k * 1.5),
            gain: 0.45,
            pan: panAt(k),
          }),
        ((k - same) * gap + (motionSafe ? 0.09 : 0)) * 1000,
      );
    }
    if (next.length < prev.length) {
      audio.play("tick", { pitch: 0.7, gain: 0.3, pan: panAt(next.length) });
    }
    if (next.length === n && prev.length < n) onComplete?.(next);
  };

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.currentTarget.value;
    if (checking || locked) return;
    let next = clean(raw);
    // After a refusal, a new character starts a fresh code.
    if (refused && raw.length > code.length) {
      next = clean(raw.slice(code.length));
    }
    commit(next);
  };

  /** The caret lives at the end of the code; a select-all is allowed, so a paste or a keystroke replaces it. */
  const keepAtEnd = (el: HTMLInputElement) => {
    const end = el.value.length;
    const all = el.selectionStart === 0 && el.selectionEnd === end && end > 0;
    if (all) return;
    if (el.selectionStart !== end || el.selectionEnd !== end) {
      el.setSelectionRange(end, end);
    }
  };

  // The host's verdict: a refusal shakes and buzzes, an acceptance chimes as
  // the slots meet. Only a code the visitor typed is answered aloud.
  React.useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    if (state === "error") {
      if (motionSafe) {
        shakeAnim.current?.stop();
        shakeAnim.current = animate(shake, [0, -8, 7, -5, 3, -1, 0], {
          duration: 0.42,
          ease: "easeInOut",
        });
      }
      if (touched.current) audio.play("buzz", { gain: 0.5 });
    }
    if (state === "success" && touched.current) {
      const id = window.setTimeout(
        () => audio.play("chime", { pitch: 1, gain: 0.5 }),
        motionSafe ? 160 : 0,
      );
      timers.current.push(id);
    }
  }, [state, motionSafe, audio, shake]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
      shakeAnim.current?.stop();
    };
  }, []);

  const sepExtra = cut ? m.sep + m.gap : 0;
  /** How far each slot slides to close the gaps: independent of the slot's width, so it holds at any size. */
  const shiftOf = (i: number) =>
    -i * m.gap -
    (cut && i >= cut ? sepExtra : 0) +
    ((n - 1) * m.gap + sepExtra) / 2;

  const columns = cut
    ? `repeat(${cut}, minmax(0, ${m.w}px)) ${m.sep}px repeat(${n - cut}, minmax(0, ${m.w}px))`
    : `repeat(${n}, minmax(0, ${m.w}px))`;

  const note = locked
    ? successMessage
    : refused
      ? errorMessage
      : checking
        ? "Checking the code."
        : "";
  const glowShadow = `0 0 0 3px color-mix(in oklab, ${paint} 24%, transparent), 0 0 16px color-mix(in oklab, ${paint} 34%, transparent)`;

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < n; i += 1) {
    if (cut && i === cut) {
      cells.push(
        <motion.span
          key="sep"
          aria-hidden
          className="flex items-center justify-center"
          animate={
            locked
              ? { opacity: 0, scale: motionSafe ? 0.4 : 1 }
              : { opacity: 1, scale: 1 }
          }
          initial={false}
          transition={{ duration: durations.fast, ease: easings.enter }}
        >
          <span className="h-0.5 w-2/3 rounded-full bg-ink-3/60" />
        </motion.span>,
      );
    }
    const g = model.glyphs[i];
    const first = i === 0;
    const last = i === n - 1;
    const isCaret = i === caret;
    cells.push(
      <motion.span
        key={i}
        aria-hidden
        className="relative block"
        style={{ height: m.h }}
        animate={{ x: locked ? shiftOf(i) : 0 }}
        initial={false}
        transition={
          motionSafe
            ? { ...springs.snap, delay: locked ? 0.04 : 0 }
            : { duration: 0 }
        }
      >
        <span
          className={cn(
            "absolute inset-y-0 border transition-[border-color,background-color,border-radius,left,right] duration-300",
            locked
              ? cn(
                  "border-y-success",
                  first
                    ? "rounded-l-3 border-l-success"
                    : "border-l-transparent",
                  last
                    ? "rounded-r-3 border-r-success"
                    : "border-r-transparent",
                  !first && !last && "rounded-none",
                  first && !last && "rounded-r-none",
                  last && !first && "rounded-l-none",
                )
              : refused
                ? "rounded-3 border-danger"
                : g
                  ? "rounded-3 border-ink-3/45"
                  : "rounded-3 border-hairline-strong",
          )}
          style={{
            // Merged, each segment reaches 1px under its neighbours so no
            // seam shows between them; the fill is opaque, so the overlap
            // never darkens.
            left: locked && !first ? -1 : 0,
            right: locked && !last ? -1 : 0,
            background: locked
              ? "color-mix(in oklab, var(--success) 11%, var(--card))"
              : refused
                ? "color-mix(in oklab, var(--danger) 7%, var(--card))"
                : "var(--card)",
          }}
        />
        {isCaret ? (
          <motion.span
            layoutId={`${uid}-caret`}
            className="absolute inset-0 rounded-3 border"
            style={{ borderColor: paint, boxShadow: glowShadow }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        ) : null}
        {g && g.id > 0 ? (
          <motion.span
            key={`flash-${g.id}`}
            className="absolute inset-0 rounded-3 border"
            style={{ borderColor: paint }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{
              duration: 0.55,
              times: [0, 0.2, 1],
              delay: g.delay + (motionSafe ? 0.06 : 0),
              ease: "easeOut",
            }}
          />
        ) : null}
        {checking && motionSafe ? (
          <motion.span
            className="absolute inset-0 rounded-3"
            style={{
              background: `color-mix(in oklab, ${paint} 14%, transparent)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{
              duration: 0.9,
              delay: i * 0.09,
              repeat: Infinity,
              repeatDelay: Math.max(0, n * 0.09 - 0.3),
              ease: "easeInOut",
            }}
          />
        ) : null}
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center overflow-hidden font-mono leading-none tabular-nums transition-[color,opacity] duration-200",
            m.glyph,
            refused ? "text-danger" : "text-foreground",
            checking && "opacity-55",
          )}
        >
          <AnimatePresence initial={false}>
            {g ? (
              <motion.span
                key={g.id}
                className="absolute inset-0 flex items-center justify-center"
                initial={
                  motionSafe ? { y: -m.drop, opacity: 0 } : { y: 0, opacity: 0 }
                }
                animate={{ y: 0, opacity: 1 }}
                exit={
                  motionSafe
                    ? {
                        y: -(m.drop - distances.nudge),
                        opacity: 0,
                        transition: exitFor(durations.base),
                      }
                    : { opacity: 0, transition: { duration: durations.fast } }
                }
                transition={{
                  y: { ...springs.recoil, delay: g.delay },
                  opacity: {
                    duration: durations.fast,
                    delay: g.delay,
                    ease: easings.enter,
                  },
                }}
              >
                {mask ? (
                  <>
                    <motion.span
                      className="absolute"
                      initial={{ opacity: g.id > 0 ? 1 : 0 }}
                      animate={{ opacity: 0 }}
                      transition={{
                        delay: g.id > 0 ? g.delay + maskDelay / 1000 : 0,
                        duration: g.id > 0 ? durations.base : 0,
                      }}
                    >
                      {g.char}
                    </motion.span>
                    <motion.span
                      className="absolute rounded-full bg-current"
                      style={{ width: m.dot, height: m.dot }}
                      initial={{
                        opacity: g.id > 0 ? 0 : 1,
                        scale: g.id > 0 ? 0.4 : 1,
                      }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: g.id > 0 ? g.delay + maskDelay / 1000 : 0,
                        duration: g.id > 0 ? durations.base : 0,
                        ease: easings.enter,
                      }}
                    />
                  </>
                ) : (
                  g.char
                )}
              </motion.span>
            ) : null}
          </AnimatePresence>
          {isCaret && !g ? (
            <motion.span
              className="absolute h-[44%] w-0.5 rounded-full"
              style={{ background: paint }}
              initial={{ opacity: 1 }}
              animate={motionSafe ? { opacity: [1, 0.15, 1] } : { opacity: 1 }}
              transition={
                motionSafe
                  ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0 }
              }
            />
          ) : null}
        </span>
      </motion.span>,
    );
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center gap-2.5",
        disabled && "opacity-50",
        className,
      )}
    >
      <label
        htmlFor={inputId}
        className={cn(
          "max-w-full text-sm font-medium text-foreground",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </label>

      <motion.div
        ref={rowRef}
        className="relative w-fit max-w-full"
        style={{ x: shake }}
      >
        <div
          className="grid justify-center"
          style={{ gridTemplateColumns: columns, columnGap: m.gap }}
        >
          {cells}
        </div>
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          inputMode={numeric ? "numeric" : "text"}
          pattern={numeric ? "[0-9]*" : undefined}
          autoComplete="one-time-code"
          autoCapitalize={numeric ? "off" : "characters"}
          autoCorrect="off"
          spellCheck={false}
          maxLength={refused ? n * 2 : n}
          value={code}
          onChange={onChange}
          onFocus={(event) => {
            setFocused(true);
            keepAtEnd(event.currentTarget);
          }}
          onBlur={() => setFocused(false)}
          onSelect={(event) => keepAtEnd(event.currentTarget)}
          readOnly={checking || locked}
          aria-busy={checking || undefined}
          aria-invalid={refused || undefined}
          aria-describedby={
            (locked ? successMessage : refused ? errorMessage : hint)
              ? noteId
              : undefined
          }
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn(
            "absolute inset-0 size-full cursor-text appearance-none rounded-3 border-0 bg-transparent p-0 text-base text-transparent caret-transparent outline-none selection:bg-transparent",
            "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
            disabled && "cursor-not-allowed",
          )}
        />
      </motion.div>

      <div className="grid max-w-full text-center text-xs leading-snug">
        {[
          {
            key: "hint",
            show: !locked && !refused,
            text: hint ?? "",
            tone: "text-ink-3",
          },
          {
            key: "error",
            show: refused,
            text: errorMessage,
            tone: "text-danger",
          },
          {
            key: "success",
            show: locked,
            text: successMessage,
            tone: "text-success",
          },
        ].map((line) => (
          <motion.p
            key={line.key}
            id={line.show ? noteId : undefined}
            aria-hidden={!line.show || undefined}
            className={cn("col-start-1 row-start-1", line.tone)}
            initial={false}
            animate={
              line.show
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: motionSafe ? -distances.nudge : 0 }
            }
            transition={
              line.show
                ? motionSafe
                  ? { ...springs.glide, opacity: { duration: durations.base } }
                  : { duration: durations.fast }
                : { duration: durations.fast, ease: easings.exit }
            }
          >
            {line.text || " "}
          </motion.p>
        ))}
      </div>

      <span className="sr-only" aria-live="polite">
        {note}
      </span>
    </div>
  );
}
