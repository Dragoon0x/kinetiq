"use client";

import * as React from "react";

import { TypingPill, typingCaption } from "@/registry/ui/typing-pill";

const PEOPLE = ["Ana", "Bo", "Iris"];

export function TypingPillDemo() {
  const [active, setActive] = React.useState<string[]>(["Ana"]);

  // Filtering the roster keeps the caption in roster order however the
  // buttons were pressed.
  const names = PEOPLE.filter((person) => active.includes(person));
  const caption = typingCaption(names);

  const toggle = (person: string) =>
    setActive((current) =>
      current.includes(person)
        ? current.filter((name) => name !== person)
        : [...current, person],
    );

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-3 border border-border bg-card p-3">
        <div className="flex flex-col gap-0.5 rounded-2 bg-surface-2 px-3 py-2">
          <span className="text-[11px] font-medium text-ink-3">Ana</span>
          <span className="text-xs">
            The Coldbrook run sheet is on the board.
          </span>
        </div>
        <TypingPill names={names} />
      </div>

      <div className="flex flex-wrap gap-2">
        {PEOPLE.map((person) => {
          const on = active.includes(person);
          return (
            <button
              key={person}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(person)}
              className="inline-flex h-8 items-center gap-2 rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span
                aria-hidden
                className={
                  on
                    ? "size-1.5 shrink-0 rounded-full bg-signal transition-colors"
                    : "size-1.5 shrink-0 rounded-full bg-ink-3 transition-colors"
                }
              />
              {person}
            </button>
          );
        })}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {caption ? (
          <span className="text-signal">{caption}</span>
        ) : (
          "No one is typing"
        )}
      </p>
    </div>
  );
}
