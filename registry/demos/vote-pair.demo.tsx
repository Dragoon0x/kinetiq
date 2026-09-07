"use client";

import * as React from "react";

import { VotePair, type Vote } from "@/registry/ui/vote-pair";

const ANSWERS = [
  {
    id: "reeve",
    author: "Reeve",
    score: 41,
    body: "Pin the runner to the release tag. The drift you are seeing comes from the floating one.",
  },
  {
    id: "okonjo",
    author: "Okonjo",
    score: 12,
    body: "Cache the lockfile hash rather than the lockfile — invalidation gets much cheaper.",
  },
];

export function VotePairDemo() {
  const [votes, setVotes] = React.useState<Record<string, Vote>>({
    reeve: 0,
    okonjo: 0,
  });

  const setVote = (id: string, next: Vote) =>
    setVotes((previous) => ({ ...previous, [id]: next }));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <span className="text-label text-ink-3">Fernworks · two answers</span>

      {ANSWERS.map((answer) => (
        <div key={answer.id} className="flex items-start gap-3">
          <VotePair
            score={answer.score}
            value={votes[answer.id]}
            onVote={(next) => setVote(answer.id, next)}
            subject={`answer from ${answer.author}`}
          />
          <div className="flex min-w-0 flex-col gap-1 pt-0.5">
            <span className="text-sm font-medium">{answer.author}</span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              {answer.body}
            </span>
          </div>
        </div>
      ))}

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {ANSWERS.map((answer) => (
          <span key={answer.id} className="mr-3 inline-block">
            {answer.author}{" "}
            <span className="text-signal tabular-nums">
              {answer.score + (votes[answer.id] ?? 0)}
            </span>
          </span>
        ))}
      </p>
    </div>
  );
}
