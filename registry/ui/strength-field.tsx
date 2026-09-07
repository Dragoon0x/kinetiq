"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StrengthRule = {
  id: string;
  label: string;
  test: (value: string) => boolean;
};

/** Module scope keeps the identities stable, so the memo below never churns. */
export const DEFAULT_STRENGTH_RULES: StrengthRule[] = [
  { id: "length", label: "8+ characters", test: (value) => value.length >= 8 },
  { id: "digit", label: "A number", test: (value) => /\d/.test(value) },
  {
    id: "symbol",
    label: "A symbol",
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
  {
    id: "case",
    label: "Upper and lower case",
    test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value),
  },
];

const SEGMENTS = [0, 1, 2, 3];
const SEGMENT_COUNT = SEGMENTS.length;
const TIERS = ["Empty", "Weak", "Fair", "Good", "Strong"] as const;
const FILL_TONE = [
  "bg-transparent",
  "bg-danger",
  "bg-warn",
  "bg-warn",
  "bg-success",
] as const;
const TEXT_TONE = [
  "text-muted-foreground",
  "text-danger",
  "text-warn",
  "text-warn",
  "text-success",
] as const;

export type StrengthFieldProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "value" | "defaultValue" | "onChange" | "type"
> & {
  /** Controlled password. */
  value?: string;
  /** Initial password for uncontrolled usage. */
  defaultValue?: string;
  /** Fires on typing. */
  onValueChange?: (value: string) => void;
  /** Fires with the 0–4 strength and how many rules are met. */
  onStrengthChange?: (strength: number, met: number) => void;
  /** The requirements, as data — products bring their own. */
  rules?: StrengthRule[];
  /** Visible label. */
  label: string;
  /** Renders the reveal toggle. @default true */
  showReveal?: boolean;
};

/**
 * A password field that shows its work. Four segments fill on `snap` as rules
 * are met — one crisp overshoot each, staggered by `cascade()` so a pasted
 * passphrase fills the bar left to right instead of flashing whole — and the
 * bar steps danger → warn → success on a colour tween, never a spring, because
 * a grade is not a landing.
 *
 * Each rule keeps its own chip: satisfied, the chip fills and a tick draws
 * inside it (`pathLength` on `flick`); broken, the tick un-draws on a tween so
 * the rule is seen coming undone rather than blinking off. The reveal toggle
 * strikes its eye on `snap`, the slash drawing across as the pupil shrinks.
 *
 * Reduced motion keeps every fill and every tick — a met rule is information,
 * not decoration — and simply arrives at them without the spring.
 */
export function StrengthField({
  value,
  defaultValue,
  onValueChange,
  onStrengthChange,
  rules = DEFAULT_STRENGTH_RULES,
  label,
  showReveal = true,
  className,
  disabled,
  id,
  ...props
}: StrengthFieldProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const inputId = id ?? `${baseId}-input`;
  const meterId = `${baseId}-meter`;
  const rulesId = `${baseId}-rules`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const [revealed, setRevealed] = React.useState(false);
  const isControlled = value !== undefined;
  const password = isControlled ? value : uncontrolled;

  const met = React.useMemo(
    () => rules.map((rule) => rule.test(password)),
    [rules, password],
  );
  const metCount = met.filter(Boolean).length;
  const strength =
    rules.length === 0
      ? 0
      : Math.round((metCount / rules.length) * SEGMENT_COUNT);
  const tier = TIERS[strength] ?? TIERS[0];

  /**
   * Where the bar stood a moment ago. One rule met fills one segment now; a
   * pasted passphrase walks the bar from the old level to the new one. Derived
   * during render, because a segment mounting a frame later would stagger from
   * the wrong place.
   */
  const [level, setLevel] = React.useState({ at: strength, from: strength });
  let filledFrom = level.from;
  if (level.at !== strength) {
    filledFrom = level.at;
    setLevel({ at: strength, from: level.at });
  }
  const segmentStep = cascade(SEGMENT_COUNT);

  // A latest-value ref keeps the report out of the effect's dependencies, so an
  // inline callback cannot re-fire it on every render.
  const report = React.useRef(onStrengthChange);
  React.useEffect(() => {
    report.current = onStrengthChange;
  });
  React.useEffect(() => {
    report.current?.(strength, metCount);
  }, [strength, metCount]);

  const commit = (next: string) => {
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div>
        <label
          htmlFor={inputId}
          className={cn(
            "mb-1.5 block text-sm font-medium text-foreground",
            disabled && "opacity-50",
          )}
        >
          {label}
        </label>

        <div
          className={cn(
            "relative flex h-11 items-center gap-2 rounded-2 border border-input bg-surface-1 pr-1.5 pl-3",
            "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <input
            id={inputId}
            type={revealed ? "text" : "password"}
            autoComplete="new-password"
            autoCorrect="off"
            spellCheck={false}
            disabled={disabled}
            value={password}
            onChange={(event) => commit(event.target.value)}
            aria-describedby={`${meterId} ${rulesId}`}
            className="h-full w-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            {...props}
          />

          {showReveal && (
            <button
              type="button"
              aria-pressed={revealed}
              aria-label={revealed ? "Hide password" : "Show password"}
              disabled={disabled}
              onClick={() => setRevealed((shown) => !shown)}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-2 text-muted-foreground transition-colors outline-none hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="size-4 shrink-0"
              >
                <path d="M1.5 8C3.2 5 5.5 3.5 8 3.5S12.8 5 14.5 8C12.8 11 10.5 12.5 8 12.5S3.2 11 1.5 8Z" />
                <motion.circle
                  cx={8}
                  cy={8}
                  r={2.25}
                  // Only origin* keys survive motion's transform-origin rewrite.
                  style={{ originX: 0.5, originY: 0.5 }}
                  initial={false}
                  animate={{ scale: revealed ? 1 : 0.45 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
                <motion.path
                  d="M3.2 12.8 12.8 3.2"
                  initial={false}
                  animate={{ pathLength: revealed ? 0 : 1 }}
                  transition={
                    motionSafe
                      ? revealed
                        ? { duration: durations.fast, ease: easings.exit }
                        : springs.snap
                      : { duration: 0 }
                  }
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Strength</span>
          <span
            className={cn(
              "text-xs font-medium transition-colors",
              TEXT_TONE[strength] ?? TEXT_TONE[0],
            )}
            style={{ transitionDuration: `${durations.base}s` }}
          >
            {tier}
          </span>
        </div>

        <div
          id={meterId}
          role="meter"
          aria-label="Password strength"
          aria-valuenow={strength}
          aria-valuemin={0}
          aria-valuemax={SEGMENT_COUNT}
          aria-valuetext={`${tier}, ${strength} of ${SEGMENT_COUNT}`}
          className="flex items-center gap-1"
        >
          {SEGMENTS.map((index) => {
            const on = index < strength;
            const delay =
              on && index >= filledFrom
                ? (index - filledFrom) * segmentStep
                : 0;
            return (
              <div
                key={index}
                className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2"
              >
                <motion.div
                  className={cn(
                    "h-full w-full origin-left rounded-full transition-colors",
                    FILL_TONE[strength] ?? FILL_TONE[0],
                  )}
                  style={{ transitionDuration: `${durations.base}s` }}
                  initial={false}
                  animate={{ scaleX: on ? 1 : 0 }}
                  transition={
                    motionSafe
                      ? on
                        ? { ...springs.snap, delay }
                        : { duration: durations.fast, ease: easings.exit }
                      : { duration: 0 }
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <ul id={rulesId} className="flex flex-wrap gap-1.5">
        {rules.map((rule, index) => {
          const satisfied = met[index] === true;
          return (
            <li
              key={rule.id}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                satisfied
                  ? "border-hairline-strong bg-cobalt-wash text-foreground"
                  : "border-hairline bg-surface-2 text-muted-foreground",
              )}
              style={{ transitionDuration: `${durations.base}s` }}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 transition-colors",
                  satisfied ? "text-cobalt-bright" : "text-muted-foreground",
                )}
              >
                <motion.path
                  d="M3.5 8.4 6.6 11.5 12.5 4.8"
                  initial={false}
                  animate={{ pathLength: satisfied ? 1 : 0 }}
                  transition={
                    motionSafe
                      ? satisfied
                        ? springs.flick
                        : { duration: durations.fast, ease: easings.exit }
                      : { duration: 0 }
                  }
                />
              </svg>
              {rule.label}
            </li>
          );
        })}
      </ul>

      <span role="status" className="sr-only">
        {`${tier}. ${metCount} of ${rules.length} rules met.`}
      </span>
    </div>
  );
}
