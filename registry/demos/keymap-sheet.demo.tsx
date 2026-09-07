"use client";

import * as React from "react";

import { KeymapSheet } from "@/registry/ui/keymap-sheet";

const GROUPS = [
  {
    title: "Editing",
    shortcuts: [
      { keys: ["⌘", "B"], label: "Bold" },
      { keys: ["⌘", "K"], label: "Insert link" },
      { keys: ["⌘", "⇧", "V"], label: "Paste as plain text" },
      { keys: ["⌥", "↑"], label: "Move line up" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["⌘", "P"], label: "Go to file" },
      { keys: ["⌘", "G"], label: "Go to line" },
      { keys: ["⌘", "⇧", "O"], label: "Outline" },
    ],
  },
  {
    title: "View",
    shortcuts: [
      { keys: ["⌘", "\\"], label: "Split editor" },
      { keys: ["⌘", "J"], label: "Toggle panel" },
      { keys: ["⌘", "."], label: "Focus mode" },
    ],
  },
];

const LINES = [
  "## Field notes — bay 4",
  "The vane sits 2° proud of the mark, so the",
  "gauge reads long on every third sweep.",
  "",
  "Retorque at 18 Nm and log the drift before",
  "the shift hands over.",
];

export function KeymapSheetDemo() {
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState("");

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="relative h-[320px] w-full overflow-hidden rounded-3 border border-border bg-surface-1">
        <div className="flex h-11 items-center border-b border-hairline px-3">
          <span className="text-sm font-semibold">Fernworks</span>
        </div>
        <div className="flex flex-col gap-1.5 p-3 font-mono text-[11px] leading-relaxed">
          {LINES.map((line, index) =>
            line === "" ? (
              <span key={index} className="h-2" />
            ) : (
              <span
                key={index}
                className={index === 0 ? "text-ink" : "text-ink-3"}
              >
                {line}
              </span>
            ),
          )}
          <span className="mt-1 h-4 w-px bg-cobalt-bright" />
        </div>

        <KeymapSheet
          groups={GROUPS}
          open={open}
          onOpenChange={setOpen}
          onFilterChange={setFilter}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Sheet <span className="text-signal">{open ? "open" : "closed"}</span>
        {open && filter.trim() !== "" ? (
          <> · filter “{filter}”</>
        ) : (
          <> · press ? to open</>
        )}
      </p>
    </div>
  );
}
