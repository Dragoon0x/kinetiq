"use client";

import * as React from "react";

import { TypeOn } from "@/registry/ui/type-on";

const LINES = [
  "Precision is a feeling.",
  "You know a good spring on contact.",
  "One crisp overshoot, then still.",
];

export function TypeOnDemo() {
  const [index, setIndex] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(() => {
    timer.current = window.setTimeout(() => {
      setIndex((value) => (value + 1) % LINES.length);
    }, 3200);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [index]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="border-hairline bg-surface-1 flex min-h-16 items-center rounded-3 border p-4">
        <TypeOn text={LINES[index] ?? ""} as="p" className="text-lg font-semibold" />
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Line{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {index + 1} of {LINES.length}
        </span>
      </p>
    </div>
  );
}
