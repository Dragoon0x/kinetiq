"use client";

import * as React from "react";

import { SlashMenu, type SlashCommand } from "@/registry/ui/slash-menu";

const COMMANDS: SlashCommand[] = [
  { id: "summarise", label: "summarise", hint: "shorten" },
  { id: "translate", label: "translate", hint: "to a language" },
  { id: "rewrite", label: "rewrite", hint: "new tone" },
  { id: "outline", label: "outline", hint: "headings" },
  { id: "cite", label: "cite", hint: "add sources" },
  { id: "explain", label: "explain", hint: "step by step" },
];

/** The turn the reader is following up on; the list rises over it. */
const REPLY =
  "The sync fix ships in 4.2. Crews in the field now see a queued badge while a report waits for signal, and the retry runs on a backoff of 2, 8 and 30 seconds instead of every minute, so a dead spot no longer drains the battery. The desk app is unchanged; the only visible difference there is a last-synced time under each report.";

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Last = { kind: "Inserted" | "Removed"; label: string } | null;

export function SlashMenuDemo() {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [chips, setChips] = React.useState<string[]>([]);
  const [text, setText] = React.useState("");
  const [last, setLast] = React.useState<Last>(null);

  const count = `${chips.length} chip${chips.length === 1 ? "" : "s"}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="max-w-[85%] self-end rounded-3 rounded-br-1 bg-primary px-3 py-2 text-sm leading-5 text-primary-foreground">
          What changed in the sync fix?
        </p>
        <div className="rounded-3 rounded-bl-1 border border-hairline bg-surface-1 px-3 py-2">
          <p className="mb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks Reasoner
          </p>
          <p className="text-sm leading-5 text-ink-2">{REPLY}</p>
        </div>
      </div>

      <SlashMenu
        ref={inputRef}
        label="Ask Gaugeworks Reasoner"
        commands={COMMANDS}
        chips={chips}
        onChipsChange={setChips}
        value={text}
        onValueChange={setText}
        onInsert={(command) =>
          setLast({ kind: "Inserted", label: command.label })
        }
        onRemove={(command) =>
          setLast({ kind: "Removed", label: command.label })
        }
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setText("/");
            inputRef.current?.focus();
          }}
        >
          Type /
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setChips([]);
            setText("");
            setLast(null);
          }}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last
          ? `${last.kind} /${last.label} · ${count}`
          : chips.length > 0
            ? `${count} · ${chips.join(", ")}`
            : "No chips · type / for commands"}
      </p>
    </div>
  );
}
