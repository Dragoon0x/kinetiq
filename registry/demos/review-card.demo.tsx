"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultReviewPhotos,
  ReviewCard,
  type ReviewVote,
} from "@/registry/ui/review-card";

export const tweaks = defineTweaks({
  fill: {
    kind: "range",
    label: "Fill",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  unroll: {
    kind: "choice",
    label: "Unroll",
    default: "glide",
    options: ["snap", "glide", "drift"],
    names: { snap: "Snap", glide: "Glide", drift: "Drift" },
  },
  fan: {
    kind: "range",
    label: "Fan",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const HELPFUL = 24;

/**
 * A review of Fernworks' Harbour tote on its product page: the stars fill as
 * the review inks in, the long part folds away, and you can say whether it
 * helped.
 */
export function ReviewCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [vote, setVote] = React.useState<ReviewVote>(null);
  const [open, setOpen] = React.useState(false);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [replay, setReplay] = React.useState(0);
  const shown = defaultReviewPhotos.findIndex((p) => p.id === photo);

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <ReviewCard
        key={replay}
        className="self-center"
        vote={vote}
        onVoteChange={(v) => {
          setVote(v);
          setPhoto(null);
        }}
        expanded={open}
        onExpandedChange={(o) => {
          setOpen(o);
          setPhoto(null);
        }}
        onPhotoOpen={setPhoto}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {shown !== -1 ? (
              <>
                <span className="text-signal">photo {shown + 1} of 3</span> ·
                opened
              </>
            ) : vote === "up" ? (
              <>
                <span className="text-signal">helpful</span> · {HELPFUL + 1}{" "}
                people
              </>
            ) : vote === "down" ? (
              <>
                <span className="text-signal">not helpful</span> · noted
              </>
            ) : open ? (
              <>
                <span className="text-signal">unrolled</span> · read in full
              </>
            ) : (
              <>
                <span className="text-signal">4 of 5</span> · {HELPFUL} found
                this helpful
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setReplay((r) => r + 1);
            }}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5 shrink-0" />
            Replay
          </button>
        </div>
      ) : null}
    </div>
  );
}
