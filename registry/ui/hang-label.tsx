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
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type HangLabelStyle = "outline" | "filled" | "line";
export type HangLabelType =
  "text" | "email" | "tel" | "url" | "password" | "search";

export type HangLabelProps = {
  /** What the field is for. The visible label, and the input's accessible name. */
  label: string;
  /** Controlled text. */
  value?: string;
  /** Initial text when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires with the new text on every edit: typing, paste, composition, autofill. */
  onValueChange?: (value: string) => void;
  /** What is wrong, in a sentence. Shown under the field; the label shakes when it arrives. */
  error?: string | null;
  /** Change it to shake the label again with the same error, e.g. a form's submit count. */
  shakeKey?: string | number;
  /** Helper text under the field. */
  hint?: string;
  /** The character budget, also the input's native `maxlength`. */
  maxLength?: number;
  /** How far the tag swings when it lands on the edge, in degrees, 0 to 10. @default 5 */
  swing?: number;
  /** The pendulum's spring stiffness, 60 to 600: low sways slowly, high wobbles quick and tight. @default 220 */
  stiffness?: number;
  /** A framed field with a notch, a filled field with a raised tab, or an underline. @default "outline" */
  style?: HangLabelStyle;
  /** Show the budget as a thread filling under the field, with a count. Needs `maxLength`. @default true */
  budget?: boolean;
  /** @default "text" */
  type?: HangLabelType;
  name?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  /** Shown inside the field only once the label has lifted out of the way. */
  placeholder?: string;
  required?: boolean;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  /** The input element. */
  ref?: React.Ref<HTMLInputElement>;
  /** Play the landing tick, the error shrug and the full-budget detent. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The field box, px. */
const FIELD_H = 44;
/** The label's line box at rest, px (text-sm, leading-5). */
const LINE_H = 20;
/** The hung tag's size against the resting label. */
const HUNG = 0.8;
/** Room above the field for the hung tag's upper half and its swing, px. */
const CLEAR = 16;
/** How far the tag's rising corner may climb while it swings, px: inside `CLEAR`. */
const HEADROOM = 7;
/** The flip's deepest tilt, mid-lift, in degrees. */
const FLIP = 64;
/** The pendulum's damping ratio: about three visible swings. */
const ZETA = 0.18;
/** The lift is on the edge from here: the tag has landed. */
const LANDED = 0.97;
const SHAKE = [0, -6, 6, -4, 3, -1, 0];
/** The notch is cut through a band this deep along the frame's top, px. */
const BAND = 3;
const MASK_SIZE = `100% ${BAND}px, 100% calc(100% - ${BAND}px)`;
const MASK_POSITION = `0 0, 0 ${BAND}px`;

type Geometry = {
  /** The tag's left edge at rest (the input's own padding less the tag's). */
  restX: number;
  /** The tag's left edge hung on the edge. */
  hungX: number;
};

// Every style keeps the same inset: the shake and the swing's lower corner
// need about 10px on the left to stay inside the component's box.
const GEOMETRY: Record<HangLabelStyle, Geometry> = {
  outline: { restX: 8, hungX: 10 },
  filled: { restX: 8, hungX: 10 },
  line: { restX: 8, hungX: 10 },
};

const REST_Y = (FIELD_H - LINE_H) / 2;
const HUNG_Y = -LINE_H / 2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Browsers name the autofill state differently; neither is known to all. */
const isAutofilled = (input: HTMLInputElement): boolean => {
  for (const selector of [":autofill", ":-webkit-autofill"]) {
    try {
      if (input.matches(selector)) return true;
    } catch {
      // An unknown pseudo-class throws; try the next spelling.
    }
  }
  return false;
};

/** The spoken budget, only at the thresholds a typist needs to hear. */
function budgetNote(from: number, to: number, max: number): string | null {
  const zone = Math.max(1, Math.ceil(max * 0.2));
  const before = max - from;
  const left = max - to;
  if (left <= 0 && before > 0) return "No characters left.";
  if (left > 0 && left <= zone && before > zone) {
    return `${plural(left, "character", "characters")} left.`;
  }
  return null;
}

/**
 * A text field whose label is a small hanging tag. At rest the label sits
 * where a placeholder would. Focus the field, or give it any text, and the
 * label lifts off, flipping up on a hinge along its top edge as it travels,
 * lands on the field's top edge and hangs there, swinging a little like a
 * sign on a rail before it comes to rest. Left empty, it drops back.
 *
 * The travel is the house glide spring; the flip is derived from it, so the
 * two can never disagree; the swing is an underdamped pendulum about the
 * tag's top centre, kicked on the frame the tag lands, whose first swing
 * peaks at `swing` degrees (less for a long label, so no corner ever leaves
 * the component's box). In the outline style the top border opens a notch
 * under the tag as it arrives, drawn as a mask, not a cover, so the field
 * sits on any background. An error shakes the tag; a character budget fills
 * as a thread under the field.
 *
 * It is a real input named by a real label: typing, selection, IME
 * composition, paste and autofill are the browser's own. The field's frame is
 * its focus indicator — an outline ring would run through the hanging tag.
 * Under reduced motion the label cross-fades between its two places with no
 * travel, flip, swing or shake, while the notch, colours, error and budget
 * still answer.
 */
export function HangLabel({
  label,
  value,
  defaultValue = "",
  onValueChange,
  error,
  shakeKey,
  hint,
  maxLength,
  swing = 5,
  stiffness = 220,
  style: variant = "outline",
  budget = true,
  type = "text",
  name,
  autoComplete,
  inputMode,
  placeholder,
  required,
  onFocus,
  onBlur,
  ref,
  sound = false,
  disabled = false,
  className,
}: HangLabelProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const id = React.useId();
  const inputId = `${id}-input`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const budgetId = `${id}-budget`;

  const g = GEOMETRY[variant] ?? GEOMETRY.outline;
  const [own, setOwn] = React.useState(defaultValue);
  const controlled = value !== undefined;
  const text = value ?? own;
  const errorText = error ? error : "";
  const max =
    maxLength !== undefined && maxLength > 0 ? Math.floor(maxLength) : 0;
  const showBudget = budget && max > 0;
  const count = text.length;

  const [focused, setFocused] = React.useState(false);
  const [autofilled, setAutofilled] = React.useState(false);
  const lifted = focused || count > 0 || autofilled;

  const [input, setInput] = React.useState<HTMLInputElement | null>(null);
  const [tag, setTag] = React.useState<HTMLLabelElement | null>(null);
  const [tagWidth, setTagWidth] = React.useState<number | null>(null);
  const [message, setMessage] = React.useState<HTMLDivElement | null>(null);
  const [messageHeight, setMessageHeight] = React.useState<number | null>(null);
  React.useImperativeHandle(ref, () => input as HTMLInputElement, [input]);

  // Until the tag is measured, an estimate from its length keeps the server's
  // notch and the first client render identical.
  const width = tagWidth ?? label.length * 7.4 + 8;
  const hungWidth = width * HUNG;
  // The swing is capped by geometry: a long tag's rising corner reaches the
  // headroom sooner, so it swings less.
  const cap = r2(
    (Math.asin(clamp01(HEADROOM / Math.max(1, hungWidth / 2))) * 180) / Math.PI,
  );

  const lift = useMotionValue(lifted ? 1 : 0);
  const angle = useMotionValue(0);
  const shakeX = useMotionValue(0);
  const veil = useMotionValue(1);
  const fill = useMotionValue(max > 0 ? clamp01(count / max) : 0);

  /** Where the label is headed: hung (true) or resting (false). */
  const shown = React.useRef(lifted);
  const liftRun = React.useRef<AnimationPlaybackControls[]>([]);
  const swingRun = React.useRef<AnimationPlaybackControls | null>(null);
  const shakeRun = React.useRef<AnimationPlaybackControls | null>(null);
  const fillRun = React.useRef<AnimationPlaybackControls | null>(null);

  const panOfTag = () => {
    const rect = tag?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** A kick to the pendulum, sized so its first swing peaks at `degrees`. */
  const kick = (degrees: number, direction: 1 | -1) => {
    const amplitude = Math.min(degrees, cap);
    if (!motionSafe || amplitude <= 0) return;
    const k = clamp(stiffness, 20, 2000);
    const omega = Math.sqrt(k);
    swingRun.current?.stop();
    swingRun.current = animate(angle, 0, {
      type: "spring",
      stiffness: k,
      damping: 2 * ZETA * omega,
      mass: 1,
      // A lightly damped spring's first peak is about 0.78 of v/ω.
      velocity: direction * amplitude * omega * 1.29,
      restDelta: 0.01,
      restSpeed: 0.2,
    });
  };

  const land = () => {
    // The tick belongs to someone's hand on the field; a host filling it
    // from elsewhere lands silently.
    if (typeof document !== "undefined" && input === document.activeElement) {
      audio.play("tick", { pitch: 1.3, gain: 0.45, pan: panOfTag() });
    }
    kick(clamp(swing, 0, 10), 1);
  };

  const move = (to: boolean) => {
    for (const c of liftRun.current) c.stop();
    const target = to ? 1 : 0;
    if (!motionSafe) {
      // Fade out, change places, fade in: the label is still seen to move
      // from the placeholder to the edge, without travelling.
      liftRun.current = [
        animate(veil, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            lift.set(target);
            liftRun.current = [
              animate(veil, 1, {
                duration: durations.fast,
                ease: easings.enter,
              }),
            ];
          },
        }),
      ];
      return;
    }
    liftRun.current = [
      animate(lift, target, {
        ...springs.glide,
        velocity: lift.getVelocity(),
      }),
    ];
    if (veil.get() < 1) {
      liftRun.current.push(
        animate(veil, 1, { duration: durations.fast, ease: easings.enter }),
      );
    }
    // Dropping back is a layout move, not a landing: the swing settles out.
    if (!to) {
      swingRun.current?.stop();
      swingRun.current = animate(angle, 0, springs.glide);
    }
  };

  const shake = () => {
    audio.play("shrug", { gain: 0.35, pan: panOfTag() });
    if (!motionSafe) return;
    shakeRun.current?.stop();
    // More than two keyframes, so a tween: a spring would drop the middle.
    shakeRun.current = animate(shakeX, SHAKE, {
      duration: 0.42,
      ease: easings.move,
    });
    // Only a tag that is staying on the edge swings; one already dropping
    // back (a blur a moment before the error) just shakes.
    if (shown.current && lift.get() > 0.5) {
      kick(clamp(swing, 0, 10) * 1.6, -1);
    }
  };

  // What the listeners and effects below need, current on every render.
  const latest = React.useRef({ move, land, shake });
  React.useEffect(() => {
    latest.current = { move, land, shake };
  });

  // The tag lands on the frame the lift reaches the edge, whatever drove it.
  React.useEffect(() => {
    let prev = lift.get();
    return lift.on("change", (v) => {
      if (prev < LANDED && v >= LANDED) latest.current.land();
      prev = v;
    });
  }, [lift]);

  // Focus, text and autofill decide where the label is; it moves once per
  // change, from wherever it is.
  React.useEffect(() => {
    if (shown.current === lifted) return;
    shown.current = lifted;
    latest.current.move(lifted);
  }, [lifted]);

  // A new error, or the same one asked for again, shakes the label.
  const shaken = React.useRef({ error: errorText, key: shakeKey });
  React.useEffect(() => {
    const last = shaken.current;
    if (last.error === errorText && last.key === shakeKey) return;
    shaken.current = { error: errorText, key: shakeKey };
    if (errorText) latest.current.shake();
  }, [errorText, shakeKey]);

  // The thread follows the count.
  const ratio = max > 0 ? clamp01(count / max) : 0;
  React.useEffect(() => {
    fillRun.current?.stop();
    fillRun.current = animate(
      fill,
      ratio,
      motionSafe
        ? springs.glide
        : { duration: durations.fast, ease: easings.enter },
    );
  }, [fill, motionSafe, ratio]);

  // Reduced motion mid-swing: the tag comes to rest where it is.
  React.useEffect(() => {
    if (motionSafe) return;
    swingRun.current?.stop();
    shakeRun.current?.stop();
    angle.set(0);
    shakeX.set(0);
  }, [angle, motionSafe, shakeX]);

  // Unmounting (or a development re-run) finishes every move rather than
  // freezing the tag half way up or mid-swing.
  React.useEffect(
    () => () => {
      for (const c of liftRun.current) c.complete();
      swingRun.current?.complete();
      shakeRun.current?.complete();
      fillRun.current?.complete();
    },
    [],
  );

  // Autofill can paint a value before the page has had a key, with no input
  // event and an empty `value`. The browser's autofill style is applied
  // through the input's 1ms background and filter transition, so it
  // announces itself with a transition event; the check runs once on arrival
  // too.
  React.useEffect(() => {
    if (!input) return;
    const check = () => setAutofilled(isAutofilled(input));
    input.addEventListener("transitionrun", check);
    input.addEventListener("transitionend", check);
    input.addEventListener("animationstart", check);
    const raf = window.requestAnimationFrame(check);
    return () => {
      input.removeEventListener("transitionrun", check);
      input.removeEventListener("transitionend", check);
      input.removeEventListener("animationstart", check);
      window.cancelAnimationFrame(raf);
    };
  }, [input]);

  // The tag's own width sets the notch and the swing's cap; it changes when
  // a web font lands or the label does.
  // (An observer reports once on arrival, so this also takes the first size.)
  React.useEffect(() => {
    if (!tag) return;
    const observer = new ResizeObserver(() => setTagWidth(r2(tag.offsetWidth)));
    observer.observe(tag);
    return () => observer.disconnect();
  }, [tag]);

  // The message line's height is measured, never reserved.
  React.useEffect(() => {
    if (!message) return;
    const observer = new ResizeObserver(() =>
      setMessageHeight(r2(message.offsetHeight)),
    );
    observer.observe(message);
    return () => observer.disconnect();
  }, [message]);

  // The spoken budget, frozen from the new length in the render that
  // changes it, after the host has answered.
  const [seenCount, setSeenCount] = React.useState(count);
  const [note, setNote] = React.useState("");
  if (seenCount !== count) {
    setSeenCount(count);
    const next = max > 0 ? budgetNote(seenCount, count, max) : null;
    if (next) setNote(next);
  }

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    if (!controlled) setOwn(next);
    onValueChange?.(next);
    // The thread goes taut on the key that fills the budget.
    if (showBudget && next.length === max && text.length < max) {
      audio.play("detent", { pitch: 0.7, gain: 0.4, pan: panOfTag() });
    }
    setAutofilled(isAutofilled(event.target));
  };

  // Per frame, all from the motion values, every number rounded.
  const x = useTransform(
    [lift, shakeX] as MotionValue<number>[],
    ([l = 0, s = 0]: number[]) => r2(lerp(g.restX, g.hungX, clamp01(l)) + s),
  );
  const y = useTransform(lift, (l) => r2(lerp(REST_Y, HUNG_Y, l)));
  const scale = useTransform(lift, (l) => r3(lerp(1, HUNG, clamp01(l))));
  const sway = useTransform(angle, (a) => r2(a));
  const flip = useTransform(lift, (l) =>
    r2(-FLIP * Math.sin(Math.PI * clamp01(l))),
  );
  const notch = useTransform(lift, (l) => {
    const p = clamp01(l);
    if (variant !== "outline" || p < 0.01) return "none";
    // Opens from the tag's centre outward, a little wider than the tag.
    const centre = g.hungX + hungWidth / 2;
    const half = (hungWidth / 2 + 2) * p;
    const a = r2(centre - half);
    const b = r2(centre + half);
    return `linear-gradient(to right, black ${a}px, transparent ${a}px, transparent ${b}px, black ${b}px), linear-gradient(black, black)`;
  });
  const threadWidth = useTransform(
    fill,
    (f) => `calc(3px + (100% - 6px) * ${r3(clamp01(f))})`,
  );

  const tone =
    count > max && max > 0
      ? "bg-danger"
      : max > 0 && count >= max * 0.8
        ? "bg-warn"
        : "bg-cobalt-bright";

  const describedBy = [
    errorText ? errorId : hint ? hintId : null,
    max > 0 ? budgetId : null,
  ]
    .filter(Boolean)
    .join(" ");

  const labelTone = errorText
    ? "text-danger"
    : lifted && focused
      ? "text-cobalt-bright"
      : lifted
        ? "text-ink-2"
        : "text-ink-3";
  const ruleTone = errorText
    ? "bg-danger"
    : focused
      ? "bg-ring"
      : "bg-ink-3/60";

  return (
    <div
      className={cn(
        "group/hang-label w-full",
        disabled && "opacity-50",
        className,
      )}
      style={{ paddingTop: CLEAR }}
    >
      <div className="relative" style={{ height: FIELD_H }}>
        {variant === "outline" ? (
          <motion.span
            aria-hidden
            className={cn(
              // Focus is a 2px border, not an inset shadow: forced-colours
              // mode keeps a border's width and drops shadows.
              "pointer-events-none absolute inset-0 rounded-3 transition-colors",
              focused ? "border-2" : "border",
              errorText
                ? "border-danger"
                : focused
                  ? "border-ring"
                  : "border-hairline-strong",
              !errorText &&
                !focused &&
                !disabled &&
                "group-hover/hang-label:border-ink-3/60",
            )}
            style={{
              maskImage: notch,
              WebkitMaskImage: notch,
              maskSize: MASK_SIZE,
              WebkitMaskSize: MASK_SIZE,
              maskPosition: MASK_POSITION,
              WebkitMaskPosition: MASK_POSITION,
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
            }}
          />
        ) : (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0",
              variant === "filled" && "rounded-t-3 bg-surface-2",
            )}
          >
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 h-0.5 origin-bottom transition-[transform,background-color]",
                focused || errorText ? "scale-y-100" : "scale-y-50",
                ruleTone,
                focused
                  ? "forced-colors:bg-[Highlight]"
                  : "forced-colors:bg-[CanvasText]",
                !errorText &&
                  !focused &&
                  !disabled &&
                  "group-hover/hang-label:bg-ink-3",
              )}
            />
          </span>
        )}

        <input
          ref={setInput}
          id={inputId}
          type={type}
          name={name}
          autoComplete={autoComplete}
          inputMode={inputMode}
          required={required}
          disabled={disabled}
          maxLength={max > 0 ? max : undefined}
          value={text}
          placeholder={lifted ? placeholder : undefined}
          aria-invalid={errorText ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={onChange}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            setAutofilled(isAutofilled(event.currentTarget));
            onBlur?.(event);
          }}
          className={cn(
            "relative z-[1] block h-full w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-ink-3",
            // The autofill style arrives through this transition, and fires
            // its events; 1ms is too short to see.
            "transition-[background-color,filter] duration-[1ms]",
            "px-3",
            variant === "outline" && "rounded-3",
            variant === "filled" && "rounded-t-3",
            disabled && "cursor-not-allowed",
          )}
        />

        <motion.label
          ref={setTag}
          htmlFor={inputId}
          className={cn(
            "absolute top-0 left-0 z-[2] block max-w-[calc(100%-16px)] text-sm leading-5 whitespace-nowrap transition-colors select-none",
            lifted && !disabled ? "cursor-text" : "pointer-events-none",
            labelTone,
          )}
          style={{ x, y, scale, opacity: veil, originX: 0, originY: 0.5 }}
        >
          <motion.span
            className={cn(
              "block truncate rounded-2 px-1",
              variant === "filled" && "bg-surface-2",
            )}
            title={label}
            style={{
              rotate: sway,
              rotateX: flip,
              transformPerspective: 240,
              originX: 0.5,
              originY: 0,
            }}
          >
            {label}
          </motion.span>
        </motion.label>
      </div>

      {showBudget ? (
        <div aria-hidden className="mt-2 flex items-center gap-2">
          <span className="relative h-2 min-w-0 flex-1">
            <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-hairline-strong" />
            <motion.span
              className={cn(
                "absolute top-1/2 left-0 h-0.5 -translate-y-1/2 rounded-full transition-colors",
                tone,
              )}
              style={{ width: threadWidth }}
            />
            <motion.span
              className={cn(
                "absolute top-1/2 left-0 size-1.5 -translate-y-1/2 rounded-full transition-colors",
                tone,
              )}
              style={{ marginLeft: -3, left: threadWidth }}
            />
          </span>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.04em] text-ink-3 tabular-nums">
            {count}/{max}
          </span>
        </div>
      ) : null}

      <motion.div
        className="overflow-clip"
        initial={false}
        animate={{ height: messageHeight ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.enter }
        }
      >
        <div
          ref={setMessage}
          className={cn("grid", (hint || errorText) && "pt-1.5")}
        >
          {hint ? (
            <p
              id={hintId}
              aria-hidden={errorText ? true : undefined}
              className={cn(
                "col-start-1 row-start-1 text-xs text-ink-3 transition-opacity",
                errorText ? "opacity-0" : "opacity-100",
              )}
            >
              {hint}
            </p>
          ) : null}
          <p
            id={errorId}
            aria-live="polite"
            className={cn(
              "col-start-1 row-start-1 flex items-start gap-1.5 text-xs text-danger transition-opacity",
              errorText ? "opacity-100" : "opacity-0",
            )}
          >
            {errorText ? (
              <>
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="mt-px size-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                >
                  <circle cx={8} cy={8} r={6.25} />
                  <path d="M8 4.75V8.5M8 11.1v.15" />
                </svg>
                <span>{errorText}</span>
              </>
            ) : null}
          </p>
        </div>
      </motion.div>

      {max > 0 ? (
        <span id={budgetId} className="sr-only">
          {`Up to ${plural(max, "character", "characters")}.`}
        </span>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {note}
      </span>
    </div>
  );
}
