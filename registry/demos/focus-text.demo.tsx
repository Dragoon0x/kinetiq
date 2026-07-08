"use client";

import * as React from "react";

import { FocusText } from "@/registry/ui/focus-text";

export function FocusTextDemo() {
  const [run, setRun] = React.useState(0);

  return (
    <div className="flex w-[300px] max-w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
          FIELD NOTE 07
        </span>
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className="border-input hover:bg-accent rounded-2 border px-2.5 py-1 text-xs font-medium"
        >
          Replay
        </button>
      </div>
      <FocusText
        key={`words-${run}`}
        as="p"
        by="word"
        className="text-2xl font-semibold"
      >
        Precision is a feeling. You know a good spring the moment your cursor
        touches it.
      </FocusText>
      <FocusText
        key={`chars-${run}`}
        as="p"
        by="char"
        startDelay={0.15}
        className="text-muted-foreground font-mono text-sm"
      >
        calibrated to the millisecond
      </FocusText>
    </div>
  );
}
