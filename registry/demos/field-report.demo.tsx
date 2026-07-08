"use client";

import * as React from "react";

import { FieldReport } from "@/registry/blocks/field-report/field-report";

export function FieldReportDemo() {
  const [log, setLog] = React.useState("try filing with no rating first");

  return (
    <div className="flex min-h-[420px] w-full max-w-sm flex-col items-center justify-center gap-4 py-4">
      <p className="font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Post-session calibration
      </p>
      <FieldReport
        prompt="How did the session feel?"
        onSubmit={({ rating, note }) =>
          setLog(
            `filed — rating ${rating}/5${
              note.trim() ? ` · note ${note.trim().length} chars` : ""
            }`,
          )
        }
        resetAfterMs={4000}
      />
      <p className="max-w-full truncate font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        ▸ {log}
      </p>
    </div>
  );
}
