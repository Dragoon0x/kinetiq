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

const SLOT_TESTS: Record<string, RegExp> = {
  "#": /[0-9]/,
  A: /[A-Za-z]/,
};

const isSlot = (cell: string): boolean => cell === "#" || cell === "A";

/** The mask's slot characters, in order — "(###) ###" gives six of them. */
function slotsOf(mask: string): string[] {
  return mask.split("").filter(isSlot);
}

/**
 * Keeps only the characters a slot will accept, in slot order, so a pasted
 * "(555) 010-9999" and a hand-typed "5550109999" reduce to the same raw value.
 */
function toRaw(input: string, mask: string): string {
  const slots = slotsOf(mask);
  let raw = "";
  for (const char of input) {
    const slot = slots[raw.length];
    if (slot === undefined) break;
    if (SLOT_TESTS[slot]?.test(char)) raw += char;
  }
  return raw;
}

/**
 * Literals are emitted eagerly — the moment a group fills, its closing
 * separator joins the value, so the caret waits at the next slot instead of
 * behind punctuation the user would have to type past.
 */
function toFormatted(raw: string, mask: string): string {
  if (raw.length === 0) return "";
  let formatted = "";
  let index = 0;
  for (const cell of mask) {
    if (isSlot(cell)) {
      if (index >= raw.length) break;
      formatted += raw.charAt(index);
      index += 1;
    } else {
      formatted += cell;
    }
  }
  return formatted;
}

export type MaskFieldProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "value" | "defaultValue" | "onChange" | "maxLength"
> & {
  /** The shape, `#` for a digit and `A` for a letter, e.g. `"(###) ###-####"`. */
  mask: string;
  /** Controlled raw characters, without separators. */
  value?: string;
  /** Initial raw characters for uncontrolled usage. */
  defaultValue?: string;
  /** Both readings on every change. */
  onValueChange?: (raw: string, formatted: string) => void;
  /** Visible label above the box. */
  label: string;
  /** The ghost glyph standing in for an empty slot. @default "_" */
  placeholderChar?: string;
};

/**
 * A field that wears its format. Ghost glyphs hold the shape of what is
 * expected; as characters land, the mask's separators arrive on `flick` —
 * scaling up from 0.6 as the ink comes in — and deleting pulls them back out
 * the same way, so the format is never a thing that merely appeared.
 *
 * One real `<input>` carries the value, so selection, undo and IME behave
 * natively. Its text is transparent and a monospace cell grid draws the glyphs
 * instead: 1ch is exactly one monospace advance, so the native caret lands
 * between drawn glyphs rather than beside them. That layer is `aria-hidden` —
 * the input's own value is the accessible reading.
 *
 * A paste fills every slot in one `cascade()` pass, which tightens as the mask
 * lengthens so a sixteen-digit card still lands inside the 600ms budget.
 * Reduced motion keeps the ink change and drops the scale and the travel.
 */
export function MaskField({
  mask,
  value,
  defaultValue,
  onValueChange,
  label,
  placeholderChar = "_",
  className,
  disabled,
  id,
  ...props
}: MaskFieldProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const inputId = id ?? `${baseId}-input`;
  const hintId = `${baseId}-hint`;
  const ghostChar = placeholderChar.charAt(0) || "_";

  const { cells, slotCount, digitsOnly } = React.useMemo(() => {
    const slots = slotsOf(mask);
    return {
      slotCount: slots.length,
      digitsOnly: slots.length > 0 && slots.every((slot) => slot === "#"),
      cells: mask.split("").map((cell) => ({
        separator: !isSlot(cell),
        ghost: isSlot(cell) ? ghostChar : cell,
      })),
    };
  }, [mask, ghostChar]);

  const [uncontrolled, setUncontrolled] = React.useState(() =>
    toRaw(defaultValue ?? "", mask),
  );
  const isControlled = value !== undefined;
  const raw = isControlled ? toRaw(value, mask) : uncontrolled;
  const formatted = toFormatted(raw, mask);

  /**
   * Where the value ended last time. One keystroke lands one cell; a paste
   * walks from the old end to the new one, which turns the same transition
   * into a cascade without a second code path. Adjusting during render (rather
   * than in an effect) means the cells that are about to mount already carry
   * their delay — an effect would land a frame late and stagger nothing.
   */
  const [landed, setLanded] = React.useState({
    at: formatted.length,
    from: formatted.length,
  });
  let cascadeFrom = landed.from;
  if (landed.at !== formatted.length) {
    cascadeFrom = landed.at;
    setLanded({ at: formatted.length, from: landed.at });
  }
  const step = cascade(mask.length);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const node = event.currentTarget;
    const typed = node.value;
    let nextRaw = toRaw(typed, mask);

    // Backspacing a separator would otherwise re-format straight back to where
    // it was and trap the caret; when a deletion leaves the raw value intact,
    // take the character that separator was standing in front of.
    if (typed.length < formatted.length && nextRaw === raw) {
      nextRaw = nextRaw.slice(0, -1);
    }

    const nextFormatted = toFormatted(nextRaw, mask);
    if (node.value !== nextFormatted) {
      // A rejected character never reaches state, so nothing would re-render to
      // wipe it from the DOM — put the mask's own reading back by hand.
      node.value = nextFormatted;
      node.setSelectionRange(nextFormatted.length, nextFormatted.length);
    }

    if (nextRaw === raw) return;
    if (!isControlled) setUncontrolled(nextRaw);
    onValueChange?.(nextRaw, nextFormatted);
  };

  return (
    <div className={cn("w-full", className)}>
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
          "relative flex h-11 items-center overflow-hidden rounded-2 border border-input bg-surface-1 px-3",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <input
          id={inputId}
          type="text"
          inputMode={digitsOnly ? "numeric" : "text"}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={formatted}
          onChange={handleChange}
          aria-describedby={hintId}
          // The glyphs are drawn by the cell grid below; the input keeps the
          // caret, the selection and the value.
          className="relative z-10 h-full w-full min-w-0 bg-transparent font-mono text-sm text-transparent caret-foreground outline-none placeholder:text-transparent"
          {...props}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3 flex items-stretch font-mono text-sm"
        >
          {cells.map((cell, index) => {
            const real = index < formatted.length;
            const delay =
              real && index >= cascadeFrom ? (index - cascadeFrom) * step : 0;
            return (
              <span key={index} className="relative w-[1ch] shrink-0">
                <motion.span
                  className="absolute inset-0 flex items-center justify-center text-muted-foreground"
                  initial={false}
                  animate={{ opacity: real ? 0 : cell.separator ? 0.5 : 1 }}
                  transition={{ duration: durations.fast }}
                >
                  {cell.ghost}
                </motion.span>
                <AnimatePresence initial={false}>
                  {real && (
                    <motion.span
                      key="ink"
                      className="absolute inset-0 flex items-center justify-center text-foreground"
                      initial={
                        motionSafe
                          ? {
                              opacity: 0,
                              scale: 0.6,
                              y: cell.separator ? 0 : -distances.nudge,
                            }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={
                        motionSafe
                          ? {
                              opacity: 0,
                              scale: 0.6,
                              transition: exitFor(durations.fast),
                            }
                          : { opacity: 0, transition: exitFor(durations.blink) }
                      }
                      transition={
                        motionSafe
                          ? { ...springs.flick, delay }
                          : { duration: durations.fast, delay }
                      }
                    >
                      {formatted.charAt(index)}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            );
          })}
        </div>
      </div>

      <span id={hintId} className="sr-only">
        {slotCount} characters. Separators are added as you type.
      </span>
    </div>
  );
}
