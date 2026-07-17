"use client";

import * as React from "react";

import { AlertBar, type AlertSeverity } from "@/registry/ui/alert-bar";

const SEVERITIES: AlertSeverity[] = ["info", "success", "warn", "danger"];

const COPY: Record<AlertSeverity, { title: string; body: string }> = {
  info: {
    title: "Calibration due",
    body: "The rig drifts about a tenth a month. Next pass is scheduled for the 14th.",
  },
  success: {
    title: "Tolerance held",
    body: "Four passes, no excursions. The cell is cleared for the next run.",
  },
  warn: {
    title: "Drifting wide",
    body: "Pass three ran 0.3 mm over. Re-seat the jig before the next cut.",
  },
  danger: {
    title: "Run aborted",
    body: "The press lost pressure mid-cycle. The cell is locked until it is inspected.",
  },
};

export function AlertBarDemo() {
  const [severity, setSeverity] = React.useState<AlertSeverity>("warn");
  const [open, setOpen] = React.useState(true);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="min-h-20">
        <AlertBar
          open={open}
          onOpenChange={setOpen}
          severity={severity}
          title={COPY[severity].title}
        >
          {COPY[severity].body}
        </AlertBar>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SEVERITIES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setSeverity(option);
              setOpen(true);
            }}
            className="border-input hover:bg-accent rounded-2 border px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors"
          >
            {option}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Raised{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {open ? severity : "dismissed"}
        </span>
      </p>
    </div>
  );
}
