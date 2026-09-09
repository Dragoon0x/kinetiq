"use client";

import * as React from "react";

import { ModeSwitch, type ComposerMode } from "@/registry/ui/mode-switch";

const MODES: ComposerMode[] = [
  {
    value: "chat",
    label: "Chat",
    placeholder: "Message Fernworks Model 3",
    action: "Send",
    tools: ["Attach"],
    note: "Fernworks Model 3",
  },
  {
    value: "task",
    label: "Task",
    placeholder: "Describe the task to run",
    action: "Run",
    tools: ["Browser", "Files"],
    note: "≤ 12 steps",
    tint: "wash",
  },
];

/** One seeded line per mode, so a paste reads in the mode's own voice. */
const LINES: Record<string, string> = {
  chat: "Summarise the sync fix for crews",
  task: "Read the release notes and draft a crew summary.",
};

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Sent = { mode: string; chars: number } | null;

export function ModeSwitchDemo() {
  const [mode, setMode] = React.useState("chat");
  const [text, setText] = React.useState("");
  const [sent, setSent] = React.useState<Sent>(null);

  const current = MODES.find((entry) => entry.value === mode) ?? MODES[0];
  const tools = current?.tools?.length ?? 0;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ModeSwitch
        label="Fernworks Model 3"
        modes={MODES}
        value={mode}
        onValueChange={(next) => {
          setMode(next);
          setSent(null);
        }}
        text={text}
        onTextChange={setText}
        onSubmit={(submitted, line) =>
          setSent({ mode: submitted, chars: line.length })
        }
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => setText(LINES[mode] ?? "")}
        >
          Paste a line
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setText("");
            setSent(null);
          }}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {sent && current
          ? `${current.action} · ${current.label} · ${sent.chars} chars`
          : current
            ? `Mode ${current.label} · ${current.action}${tools > 1 ? ` · ${tools} tools` : ""}`
            : "No modes"}
      </p>
    </div>
  );
}
