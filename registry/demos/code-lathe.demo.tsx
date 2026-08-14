"use client";

import * as React from "react";

import { CodeLathe } from "@/registry/ui/code-lathe";

const WRITTEN = `// Pick the freezer windows cold enough to churn in.
export function churnSchedule(slots: Slot[]) {
  const windows = slots.filter((s) => s.temp <= -12);
  if (windows.length === 0) {
    throw new Error("no window under -12C");
  }
  return schedule(windows, { hero: "pistachio" });
}`;

const EDIT = `   const slots = await readFreezerSlots();
-  const windows = slots.filter((s) => s.temp <= -10);
-  return schedule(windows, { hero: "vanilla" });
+  const windows = slots.filter((s) => s.temp <= -12);
+  return schedule(windows, { hero: "pistachio" });
   log.info("churn order settled");`;

export function CodeLatheDemo() {
  const [run, setRun] = React.useState(0);
  const [mode, setMode] = React.useState<"write" | "edit">("write");

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      {mode === "write" ? (
        <CodeLathe
          key={run}
          code={WRITTEN}
          filename="ChurnSchedule.ts"
          language="ts"
          stream
        />
      ) : (
        <CodeLathe code={EDIT} filename="ChurnSchedule.ts" language="ts" diff />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("write");
            setRun((n) => n + 1);
          }}
          className="border-hairline text-ink-2 hover:bg-surface-2 hover:text-ink rounded-2 border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Replay
        </button>
        <button
          type="button"
          onClick={() => setMode((m) => (m === "write" ? "edit" : "write"))}
          className="border-hairline text-ink-2 hover:bg-surface-2 hover:text-ink rounded-2 border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          {mode === "write" ? "Show edit" : "Show write"}
        </button>
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Turning{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {mode === "write" ? "line by line" : "proposed edit"}
        </span>
      </p>
    </div>
  );
}
