"use client";

import * as React from "react";

import {
  MentionChip,
  type MentionPerson,
  type MentionValue,
} from "@/registry/ui/mention-chip";

const TEAM: MentionPerson[] = [
  { id: "rae", name: "Rae Nolan", handle: "rae.n" },
  { id: "ivo", name: "Ivo Marsh", handle: "ivo.m" },
  { id: "petra", name: "Petra Cole", handle: "petra.c" },
  { id: "dane", name: "Dane Okoro", handle: "dane.o" },
  { id: "sunni", name: "Sunni Vale", handle: "sunni.v" },
  { id: "hal", name: "Hal Brenner", handle: "hal.b" },
];

const THREAD = [
  { id: "ivo", text: "North line is clear to the ridge." },
  { id: "petra", text: "Rebased the survey against Tuesday's marks." },
];

const initials = (name: string) =>
  name
    .split(" ", 2)
    .map((part) => part.charAt(0))
    .join("");

export function MentionChipDemo() {
  const [comment, setComment] = React.useState<MentionValue>({
    text: "Baseline is signed off. @Rae\u00A0Nolan take the north line.",
    mentions: ["rae"],
  });

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MentionChip
        label="Fernworks survey · comment"
        people={TEAM}
        value={comment}
        onChange={setComment}
        placeholder="Say something. Type @ to mention."
      />

      <ul className="flex flex-col gap-2.5">
        {THREAD.map((entry) => {
          const person = TEAM.find((member) => member.id === entry.id);
          if (!person) return null;
          return (
            <li key={entry.id} className="flex items-start gap-2">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] text-ink-2"
              >
                {initials(person.name)}
              </span>
              <span className="min-w-0 text-xs leading-6 text-ink-2">
                <span className="font-medium text-ink">{person.name}</span>{" "}
                {entry.text}
              </span>
            </li>
          );
        })}
      </ul>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Mentioned{" "}
        <span className="text-signal">
          {comment.mentions.length > 0 ? comment.mentions.join(", ") : "nobody"}
        </span>
      </p>
    </div>
  );
}
