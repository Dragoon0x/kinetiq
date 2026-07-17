"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Chip = {
  /** Stable identity — also the value reported by `onValueChange`. */
  id: string;
  label: string;
};

export type ChipCloudProps = {
  /** The full set. Picked chips gather in the tray; the rest stay in the cloud. */
  chips: Chip[];
  /** Controlled picks, in pick order. */
  value?: string[];
  /** Initial picks for uncontrolled usage. */
  defaultValue?: string[];
  onValueChange?: (ids: string[]) => void;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  /** Copy shown while the tray is empty. */
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

/**
 * A multi-select field split into two zones: a tray of what you have picked and
 * a cloud of what is left. Picking a chip flies it out of the cloud and into the
 * tray — one shared element per chip, keyed by `layoutId`, so motion FLIPs the
 * same pill across containers on `glide` while the survivors close the gap.
 * Picking it again flies it home.
 *
 * Each chip is a real toggle button (`aria-pressed`), so the whole field is
 * keyboard-operable with Tab and Space. Because a chip changes container when it
 * is picked, its DOM node is replaced — focus would be dropped on the floor, so
 * the flown chip is re-focused on the next commit and the keyboard never loses
 * its place. The tray count is announced politely.
 *
 * Reduced motion: chips reposition in a single frame; the same picks, order,
 * focus handling, and announcements.
 */
export function ChipCloud({
  chips,
  value,
  defaultValue,
  onValueChange,
  label,
  placeholder = "Nothing picked yet.",
  className,
  "aria-label": ariaLabel,
}: ChipCloudProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    defaultValue ?? [],
  );
  const isControlled = value !== undefined;
  const picks = isControlled ? value : uncontrolled;
  const pickedSet = new Set(picks);

  /** The chip whose button must be re-focused once it lands in its new zone. */
  const refocusRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = refocusRef.current;
    if (!id) return;
    refocusRef.current = null;
    document.getElementById(`${baseId}-chip-${id}`)?.focus();
  });

  const toggle = (id: string) => {
    const next = pickedSet.has(id)
      ? picks.filter((pick) => pick !== id)
      : [...picks, id];
    refocusRef.current = id;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  // The tray keeps pick order; the cloud keeps the roster order it was given.
  const picked = picks
    .map((id) => chips.find((chip) => chip.id === id))
    .filter((chip): chip is Chip => Boolean(chip));
  const loose = chips.filter((chip) => !pickedSet.has(chip.id));
  const flight = motionSafe ? springs.snap : { duration: 0 };

  return (
    <div
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      {label && (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      )}

      {/* THE TRAY — what you have picked, in the order you picked it. */}
      <div className="border-hairline bg-surface-2 flex min-h-14 flex-wrap content-start items-start gap-2 rounded-3 border p-2">
        {picked.length === 0 ? (
          <p className="text-muted-foreground px-1 py-1.5 text-sm">
            {placeholder}
          </p>
        ) : (
          picked.map((chip) => (
            <ChipButton
              key={chip.id}
              chip={chip}
              id={`${baseId}-chip-${chip.id}`}
              picked
              flight={flight}
              onToggle={toggle}
            />
          ))
        )}
      </div>

      {/* THE CLOUD — what is left. */}
      {loose.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {loose.map((chip) => (
            <ChipButton
              key={chip.id}
              chip={chip}
              id={`${baseId}-chip-${chip.id}`}
              picked={false}
              flight={flight}
              onToggle={toggle}
            />
          ))}
        </div>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {picked.length === 0
          ? "Nothing picked"
          : `${picked.length} picked: ${picked.map((chip) => chip.label).join(", ")}`}
      </span>
    </div>
  );
}

/**
 * One pill. The `layoutId` is what lets motion carry the very same chip from the
 * cloud into the tray instead of cross-fading two unrelated elements.
 */
function ChipButton({
  chip,
  id,
  picked,
  flight,
  onToggle,
}: {
  chip: Chip;
  id: string;
  picked: boolean;
  flight: React.ComponentProps<typeof motion.button>["transition"];
  onToggle: (id: string) => void;
}) {
  return (
    <motion.button
      type="button"
      id={id}
      layoutId={id}
      layout="position"
      transition={flight}
      aria-pressed={picked}
      onClick={() => onToggle(chip.id)}
      className={cn(
        "border-hairline rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
        picked
          ? "bg-surface-0 text-foreground border-hairline-strong"
          : "bg-surface-1 text-muted-foreground hover:text-foreground",
      )}
    >
      {chip.label}
    </motion.button>
  );
}
