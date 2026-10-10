"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StarPeek } from "@/registry/ui/star-peek";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Count",
    default: 5,
    min: 3,
    max: 10,
    step: 1,
  },
  half: { kind: "toggle", label: "Half stars", default: true },
  phrases: {
    kind: "choice",
    label: "Phrases",
    default: "warm",
    options: ["warm", "plain", "off"],
    names: { warm: "Warm", plain: "Plain", off: "Off" },
  },
});

const WARM = [
  "not for me",
  "could be better",
  "it was fine",
  "really good",
  "loved it",
];
const PLAIN = ["poor", "fair", "good", "very good", "excellent"];

/** The demo's own reading of a value, for the status line. */
function said(v: number, count: number, phrases: string) {
  const set = phrases === "plain" ? PLAIN : phrases === "off" ? null : WARM;
  const text = Number.isInteger(v) ? String(v) : v.toFixed(1);
  if (!set) return text;
  const i = Math.min(
    set.length - 1,
    Math.max(0, Math.ceil((v / count) * set.length - 1e-6) - 1),
  );
  return `${text} · ${set[i] ?? ""}`;
}

/**
 * A Basinworks Lodge review card: hover, scrub or arrow across the stars to
 * see the phrase you are about to give, then press to rate.
 */
export function StarPeekDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [rating, setRating] = React.useState(0);
  const [preview, setPreview] = React.useState<number | null>(null);
  const count = values.count ?? tweaks.count.default;
  const half = values.half ?? tweaks.half.default;
  const phrases = values.phrases ?? tweaks.phrases.default;
  // A rating made with half stars is rounded up if half stars are switched off.
  const shown = half ? rating : Math.ceil(rating);

  const review = (
    <div className="flex w-full max-w-md min-w-0 flex-col gap-3 self-center rounded-3 border border-hairline bg-card p-4">
      <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Basinworks Lodge · Room 12
      </p>
      <StarPeek
        label="How was your stay?"
        value={Math.min(shown, count)}
        onValueChange={setRating}
        onPreviewChange={setPreview}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{review}</div>;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {review}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {preview !== null
            ? `previewing ${said(preview, count, phrases)}`
            : shown > 0
              ? `rated ${said(Math.min(shown, count), count, phrases)}`
              : "not rated · hover or arrow to preview"}
        </p>
        <button
          type="button"
          // Kept focusable once cleared: a disabled button would drop focus.
          onClick={() => setRating(0)}
          aria-disabled={rating === 0}
          className="inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
