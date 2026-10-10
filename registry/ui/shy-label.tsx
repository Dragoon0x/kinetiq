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
import { Check, CircleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ShyLabelState = "default" | "success" | "error";

export type ShyLabelSize = "sm" | "md" | "lg";

/** Pigments that read the same on a light page and a dark one. */
export type ShyLabelColor = "cobalt" | "signal" | "ember" | "rose";

export type ShyLabelProps = {
  /** The field's label: inside the field at rest, above it once there is focus or text. */
  label: string;
  /** Controlled text. */
  value?: string;
  /** Initial text when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires on every edit, with the new text. */
  onValueChange?: (value: string) => void;
  /** A line under the field while there is no validation message. */
  hint?: string;
  /** The validation state: the border, label and an end icon take its colour, and `message` slides in under the field. @default "default" */
  state?: ShyLabelState;
  /** Shown (and announced) under the field for "success" and "error"; the hint returns for "default". */
  message?: string;
  /** @default "text" */
  type?: "text" | "email" | "password" | "search" | "tel" | "url";
  /** A form field name for the input. */
  name?: string;
  /** Passed to the input, e.g. "email". */
  autoComplete?: string;
  /** How lively the letters are as they step aside, 0 to 1: 0 just fades them, 1 sends them on high, tilting arcs. @default 0.6 */
  scatter?: number;
  /** How far ahead of the caret a letter starts to step aside, in px. @default 20 */
  reach?: number;
  /** Field height and type size. @default "md" */
  size?: ShyLabelSize;
  /** The focus colour of the border and the raised label: a preset or any CSS colour. @default "cobalt" */
  color?: ShyLabelColor | (string & {});
  /** Passed to the input. @default false */
  required?: boolean;
  /** Disables the input and dims the field. @default false */
  disabled?: boolean;
  /** The input's focus handler. */
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  /** The input's blur handler: a kind place to validate. */
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  /** Classes for the outer column. */
  className?: string;
};

const PALETTE: Record<ShyLabelColor, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ember: "oklch(from var(--warn) 0.74 c h)",
  rose: "oklch(from var(--danger) 0.64 c h)",
};

type Metrics = {
  field: number;
  /** The input's type size, px; the label inside matches it. */
  font: number;
  /** The raised label's type size, px. */
  small: number;
  pad: number;
  /** The row above the field the raised label sits in. */
  row: number;
};

const SIZES: Record<ShyLabelSize, Metrics> = {
  sm: { field: 40, font: 14, small: 12, pad: 12, row: 18 },
  md: { field: 48, font: 16, small: 13, pad: 14, row: 20 },
  lg: { field: 56, font: 18, small: 14, pad: 16, row: 22 },
};

/** The gap between the raised label's row and the field. */
const LIFT_GAP = 6;
/** How visible the label's imprint is inside the focused field. */
const GHOST = 0.42;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const smooth = (a: number, b: number, t: number) => {
  const c = clamp01((t - a) / (b - a));
  return c * c * (3 - 2 * c);
};

/** Graphemes, so an accent or an emoji never splits. */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

type Letter = {
  ch: string;
  key: string;
  /** 0 at home in the imprint, 1 arrived at its twin in the raised label. */
  p: MotionValue<number>;
  /** The letter's x inside its row, measured when it is needed. */
  home: MotionValue<number>;
  /** The twin's small hop when its letter arrives. */
  arrive: MotionValue<number>;
  /** -1 or 1: which way it tips. Seeded by position, so every render agrees. */
  tilt: number;
};

type Geometry = {
  /** From the imprint's origin to the raised label's origin. */
  dx: number;
  dy: number;
  /** The raised label's scale. */
  s: number;
};

function GhostLetter({
  letter,
  geo,
  scatter,
}: {
  letter: Letter;
  geo: Geometry;
  scatter: number;
}) {
  const travel = clamp01(scatter * 3);
  const motion_ = useTransform(() => {
    const p = letter.p.get();
    const home = letter.home.get();
    const t = clamp01(p);
    // A quadratic arc from home to the twin: up and a little away from the
    // caret, so it steps aside before it rises.
    const ex = (geo.dx + home * (geo.s - 1)) * travel;
    const ey = geo.dy * travel;
    const cx = ex * 0.5 + 12 * scatter;
    const cy = Math.min(0, ey) * 0.55 - 16 * scatter;
    const u = 1 - t;
    return {
      x: r2(2 * u * t * cx + t * t * ex),
      y: r2(2 * u * t * cy + t * t * ey),
      rotate: r2(18 * scatter * Math.sin(Math.PI * t) * letter.tilt),
      scale: r3(lerp(1, geo.s, t * travel)),
      opacity: r3(1 - smooth(travel > 0 ? 0.62 : 0, 1, t)),
    };
  });
  const x = useTransform(motion_, (m) => m.x);
  const y = useTransform(motion_, (m) => m.y);
  const rotate = useTransform(motion_, (m) => m.rotate);
  const scale = useTransform(motion_, (m) => m.scale);
  const opacity = useTransform(motion_, (m) => m.opacity);
  return (
    <motion.span
      className="inline-block whitespace-pre"
      style={{ x, y, rotate, scale, opacity, originX: 0, originY: 0.5 }}
    >
      {letter.ch}
    </motion.span>
  );
}

function TwinLetter({
  letter,
  index,
  count,
  lift,
}: {
  letter: Letter;
  index: number;
  count: number;
  lift: MotionValue<number>;
}) {
  // The rise ripples from the caret's side: each letter hops a few px, a
  // beat after the one before it, while the whole label travels.
  const y = useTransform(() => {
    const l = lift.get();
    const a = letter.arrive.get();
    const start = count > 1 ? (0.45 * index) / (count - 1) : 0;
    const u = clamp01((l - start) / 0.55);
    return r2(-3 * Math.sin(Math.PI * u) - 2.5 * a);
  });
  return (
    <motion.span className="inline-block whitespace-pre" style={{ y }}>
      {letter.ch}
    </motion.span>
  );
}

/**
 * A text field whose label sits inside it, where the text will go, and steps
 * aside as the caret approaches. Focus lifts the label to its place above the
 * field on the glide spring — its letters hopping in a ripple from the caret's
 * side — and leaves a faint imprint of it behind, inside. Typing over the
 * imprint, the letters nearest the text scatter politely: each one hops up and
 * a little away along a curved path, tipping as it goes, shrinks to the
 * label's size and flies to its twin above, which gives a small hop as its
 * letter regroups. Deleting brings them back down one by one. `scatter` sets
 * how lively that is; `reach` how far ahead of the caret it starts.
 *
 * Validation slides in under the field: the border and label take the
 * state's colour, an icon pops in at the end on the snap spring, and the
 * message rises 4px into place over the hint. It is a real `<input>` with a
 * real `<label>`; the animated letters are hidden from assistive technology.
 * Under reduced motion the label cross-fades between its two places, the
 * imprint's letters fade as the caret passes, and the message fades in place.
 */
export function ShyLabel({
  label,
  value,
  defaultValue = "",
  onValueChange,
  hint,
  state = "default",
  message,
  type = "text",
  name,
  autoComplete,
  scatter = 0.6,
  reach = 20,
  size = "md",
  color = "cobalt",
  required = false,
  disabled = false,
  onFocus,
  onBlur,
  className,
}: ShyLabelProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const inputId = `${uid}-input`;
  const noteId = `${uid}-note`;
  const m = SIZES[size] ?? SIZES.md;
  const paint = (PALETTE as Record<string, string>)[color] ?? color;
  const sc = clamp01(scatter);

  const [own, setOwn] = React.useState(defaultValue);
  const text = value ?? own;
  const [focused, setFocused] = React.useState(false);
  const raised = focused || text.length > 0;

  const letters = React.useMemo<Letter[]>(
    () =>
      graphemes(label).map((ch, i) => ({
        ch,
        key: `${i}-${ch}`,
        p: motionValue(0),
        home: motionValue(0),
        arrive: motionValue(0),
        tilt: i % 3 === 1 ? -1 : 1,
      })),
    [label],
  );

  const lift = useMotionValue(raised ? 1 : 0);
  const fade = useMotionValue(1);
  const ghost = useMotionValue(0);

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const mirrorRef = React.useRef<HTMLSpanElement | null>(null);
  const ghostRefs = React.useRef(new Map<string, HTMLSpanElement>());
  const targets = React.useRef<number[]>([]);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const shown = React.useRef(raised);

  const geo: Geometry = {
    dx: 2 - (m.pad + 1),
    dy: m.row / 2 - (m.row + LIFT_GAP + m.field / 2),
    s: r3(m.small / m.font),
  };

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };

  /** The caret's x inside the field's text box, from a hidden copy of the text before it. */
  const caretX = (el: HTMLInputElement) => {
    const mirror = mirrorRef.current;
    if (!mirror) return 0;
    const at = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, at);
    mirror.textContent =
      type === "password" ? "•".repeat(graphemes(before).length) : before;
    return mirror.offsetWidth - el.scrollLeft;
  };

  /** Which imprint letters the caret has reached, and the flights to or from their twins. */
  const shy = (el: HTMLInputElement | null, instant = false) => {
    if (!el) return;
    const x = el.value.length > 0 ? caretX(el) : Number.NEGATIVE_INFINITY;
    const moving: number[] = [];
    letters.forEach((letter, i) => {
      const node = ghostRefs.current.get(letter.key);
      if (!node) return;
      const home = node.offsetLeft;
      const centre = home + node.offsetWidth / 2;
      const want = centre < x + reach ? 1 : 0;
      if ((targets.current[i] ?? 0) === want && !instant) return;
      targets.current[i] = want;
      letter.home.set(home);
      moving.push(i);
    });
    const gap = cascade(Math.max(1, moving.length));
    moving.forEach((i, order) => {
      const letter = letters[i];
      if (!letter) return;
      const want = targets.current[i] ?? 0;
      if (instant || !motionSafe) {
        if (instant) {
          letter.p.jump(want);
        } else {
          run(
            `p-${i}`,
            animate(letter.p, want, {
              duration: durations.fast,
              ease: easings.enter,
            }),
          );
        }
        return;
      }
      // Leaving is lively and slightly underdamped; coming home is calmer.
      const toward =
        want === 1
          ? {
              type: "spring" as const,
              stiffness: lerp(360, 200, sc),
              damping: 2 * lerp(0.95, 0.72, sc) * Math.sqrt(lerp(360, 200, sc)),
              mass: 1,
            }
          : springs.glide;
      const delay = moving.length > 1 ? order * gap : 0;
      run(
        `p-${i}`,
        animate(letter.p, want, {
          ...toward,
          delay,
          onUpdate:
            want === 1
              ? (v: number) => {
                  if (v < 0.86 || letter.arrive.get() !== 0) return;
                  if (running.current.has(`a-${i}`)) return;
                  const out = animate(letter.arrive, 1, springs.flick);
                  run(`a-${i}`, out);
                  void out.then(() => {
                    run(
                      `a-${i}`,
                      animate(letter.arrive, 0, {
                        ...springs.recoil,
                        onComplete: () => running.current.delete(`a-${i}`),
                      }),
                    );
                  });
                }
              : undefined,
        }),
      );
    });
  };

  // The label rises with focus or text, and comes back down only when the
  // field is empty and left.
  React.useEffect(() => {
    if (shown.current === raised) return;
    shown.current = raised;
    const to = raised ? 1 : 0;
    if (motionSafe) {
      run("lift", animate(lift, to, springs.glide));
      return;
    }
    run(
      "fade",
      animate(fade, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => {
          lift.jump(to);
          run(
            "fade",
            animate(fade, 1, { duration: durations.fast, ease: easings.enter }),
          );
        },
      }),
    );
  }, [raised, motionSafe, lift, fade]);

  // The imprint shows only while the field has focus; leaving resets it.
  React.useEffect(() => {
    if (focused) {
      shy(inputRef.current, true);
      run(
        "ghost",
        animate(ghost, GHOST, {
          duration: durations.base,
          delay: motionSafe ? 0.1 : 0,
          ease: easings.enter,
        }),
      );
      return;
    }
    run(
      "ghost",
      animate(ghost, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => {
          targets.current = [];
          for (const l of letters) {
            l.p.jump(0);
            l.arrive.jump(0);
          }
        },
      }),
    );
    // Runs on focus changes only; `shy` reads the field as it is now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  // A host that rewrites the text while it is focused moves the caret too.
  React.useEffect(() => {
    if (focused) shy(inputRef.current);
    // The text is the only input; focus has its own effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  React.useEffect(() => {
    const anims = running.current;
    return () => {
      for (const c of anims.values()) c.stop();
      anims.clear();
    };
  }, []);

  const liftX = useTransform(lift, (l) => r2(geo.dx * l));
  const liftY = useTransform(lift, (l) => r2(geo.dy * l));
  const liftScale = useTransform(lift, (l) => r3(lerp(1, geo.s, l)));

  const tone =
    state === "error"
      ? "var(--danger)"
      : state === "success"
        ? "var(--success)"
        : null;
  const labelColor =
    tone ?? (focused ? paint : raised ? "var(--ink-2)" : "var(--ink-3)");
  const borderColor = tone ?? (focused ? paint : undefined);
  const note = state !== "default" && message ? message : "";
  const lines = [
    { key: "hint", show: !note, text: hint ?? "", tone: "text-ink-3" },
    {
      key: "error",
      show: state === "error" && !!message,
      text: state === "error" ? (message ?? "") : "",
      tone: "text-danger",
    },
    {
      key: "success",
      show: state === "success" && !!message,
      text: state === "success" ? (message ?? "") : "",
      tone: "text-success",
    },
  ];
  const described = note || hint ? noteId : undefined;
  const endIcon = state === "default" ? null : state;
  const font = { fontSize: m.font, lineHeight: 1.25 };

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="relative" style={{ paddingTop: m.row + LIFT_GAP }}>
        <div
          className={cn(
            "relative rounded-3 border bg-card transition-[border-color] duration-200",
            !borderColor &&
              !disabled &&
              "border-hairline-strong hover:border-ink-3/50",
            !borderColor && disabled && "border-hairline-strong",
          )}
          style={{
            height: m.field,
            borderColor,
          }}
        >
          <input
            ref={inputRef}
            id={inputId}
            name={name}
            type={type}
            value={text}
            autoComplete={autoComplete}
            required={required}
            disabled={disabled}
            aria-invalid={state === "error" || undefined}
            aria-describedby={described}
            onChange={(event) => {
              const next = event.currentTarget.value;
              const el = event.currentTarget;
              if (value === undefined) setOwn(next);
              onValueChange?.(next);
              shy(el);
            }}
            onSelect={(event) => shy(event.currentTarget)}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            className={cn(
              "absolute inset-0 size-full rounded-3 bg-transparent text-foreground outline-none",
              // At offset 0 the ring lies over the field's own border: one
              // clean edge, not a border and a ring side by side.
              "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid",
              disabled && "cursor-not-allowed",
            )}
            style={{
              ...font,
              paddingLeft: m.pad,
              paddingRight: endIcon ? m.pad + 22 : m.pad,
            }}
          />
          <span
            ref={mirrorRef}
            aria-hidden
            className="pointer-events-none invisible absolute top-0 left-0 whitespace-pre"
            style={font}
          />
          {/* The imprint: where the label was, letters that step aside. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-pre text-ink-3"
            style={{ ...font, left: m.pad, opacity: ghost }}
          >
            {letters.map((letter) => (
              <span
                key={letter.key}
                ref={(node) => {
                  if (node) ghostRefs.current.set(letter.key, node);
                  else ghostRefs.current.delete(letter.key);
                }}
                className="inline-block whitespace-pre"
              >
                <GhostLetter letter={letter} geo={geo} scatter={sc} />
              </span>
            ))}
          </motion.span>
          {endIcon ? (
            <motion.span
              key={endIcon}
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-1/2 flex size-4 -translate-y-1/2 items-center justify-center",
                endIcon === "error" ? "text-danger" : "text-success",
              )}
              style={{ right: m.pad }}
              initial={motionSafe ? { scale: 0.5, opacity: 0 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              {endIcon === "error" ? (
                <CircleAlert className="size-4" strokeWidth={2} />
              ) : (
                <Check className="size-4" strokeWidth={2.25} />
              )}
            </motion.span>
          ) : null}
        </div>

        <label
          htmlFor={inputId}
          className={cn(
            "absolute whitespace-pre transition-colors duration-200 select-none",
            raised ? "cursor-default" : "cursor-text",
          )}
          style={{
            ...font,
            left: m.pad + 1,
            top: m.row + LIFT_GAP + m.field / 2,
            color: labelColor,
          }}
        >
          <span className="sr-only">{label}</span>
          <motion.span
            aria-hidden
            className="block -translate-y-1/2"
            style={{
              x: liftX,
              y: liftY,
              scale: liftScale,
              originX: 0,
              originY: 0.5,
              opacity: fade,
            }}
          >
            {letters.map((letter, i) => (
              <TwinLetter
                key={letter.key}
                letter={letter}
                index={i}
                count={letters.length}
                lift={lift}
              />
            ))}
          </motion.span>
        </label>
      </div>

      <div className="grid text-xs leading-snug">
        {lines.map((line) => (
          <motion.p
            key={line.key}
            id={line.show && line.text ? noteId : undefined}
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
