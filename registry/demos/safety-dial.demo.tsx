"use client";

import * as React from "react";

import { SafetyDial, type SafetyLevel } from "@/registry/ui/safety-dial";

const TOOLS = [
  { id: "search", name: "Search" },
  { id: "file", name: "File" },
  { id: "shell", name: "Shell", strictLocks: true },
  { id: "mail", name: "Mail", strictLocks: true },
];

export function SafetyDialDemo() {
  const [level, setLevel] = React.useState<SafetyLevel>("guarded");
  const [locked, setLocked] = React.useState<string[]>([]);

  const lockedNames = TOOLS.filter((tool) => locked.includes(tool.id)).map(
    (tool) => tool.name,
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SafetyDial
        label="Fernworks Model 3 · Coldbrook desk"
        value={level}
        tools={TOOLS}
        onValueChange={(next, ids) => {
          setLevel(next);
          setLocked(ids);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{level}</span>
        {lockedNames.length
          ? ` · Locked ${lockedNames.join(" · ")}`
          : " · All tools open"}
      </p>
    </div>
  );
}
