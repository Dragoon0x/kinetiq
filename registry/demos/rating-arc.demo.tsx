"use client";

import * as React from "react";

import { RatingArc } from "@/registry/ui/rating-arc";

export function RatingArcDemo() {
  const [score, setScore] = React.useState(3.5);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <RatingArc
        label="Calibration score"
        value={score}
        onValueChange={setScore}
        max={5}
        step={0.5}
      />

      <p
        role="status"
        className="text-muted-foreground border-border w-full border-t pt-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Score{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {score.toFixed(1)}
        </span>{" "}
        · half marks
      </p>
    </div>
  );
}
