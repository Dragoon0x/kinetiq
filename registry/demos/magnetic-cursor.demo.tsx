"use client";

import * as React from "react";

import { ArrowUpRight } from "lucide-react";

import {
  MagneticCursor,
  MagneticTarget,
} from "@/registry/ui/magnetic-cursor";
import { cn } from "@/registry/lib/utils";

const ACTIONS = ["Deploy", "Configure", "Docs"] as const;

export function MagneticCursorDemo() {
  const [selected, setSelected] = React.useState<string>("Deploy");

  return (
    <MagneticCursor className="flex w-full max-w-sm flex-col items-center gap-8 py-6">
      <div className="flex flex-wrap items-center justify-center gap-4">
        {ACTIONS.map((action) => (
          <MagneticTarget key={action}>
            <button
              type="button"
              onClick={() => setSelected(action)}
              className={cn(
                "border-border bg-card text-foreground rounded-full border px-5 py-2 text-sm transition-colors",
                "hover:border-input focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                selected === action && "border-input bg-secondary",
              )}
            >
              {action}
            </button>
          </MagneticTarget>
        ))}

        <MagneticTarget radius={70}>
          <button
            type="button"
            aria-label="Open in new tab"
            onClick={() => setSelected("External")}
            className={cn(
              "border-border bg-card text-foreground flex size-10 items-center justify-center rounded-full border transition-colors",
              "hover:border-input focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              selected === "External" && "border-input bg-secondary",
            )}
          >
            <ArrowUpRight className="size-4" />
          </button>
        </MagneticTarget>
      </div>

      <p
        role="status"
        className="text-muted-foreground text-label border-border border-t pt-3"
      >
        Fine pointer only — targets lean toward the cursor
        <span className="sr-only"> · Selected {selected}</span>
      </p>
    </MagneticCursor>
  );
}
