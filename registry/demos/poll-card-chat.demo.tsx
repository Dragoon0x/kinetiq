"use client";

import * as React from "react";

import {
  PollCardChat,
  type ChatPollOption,
} from "@/registry/ui/poll-card-chat";

const OPENING: ChatPollOption[] = [
  { id: "o1", label: "07:00, before the yard fills", votes: 4 },
  { id: "o2", label: "12:30, after the morning run", votes: 5 },
  { id: "o3", label: "16:45, last slot", votes: 2 },
];

/** A fixed rotation, so the demo's colleagues always vote the same way. */
const ROTATION = ["o3", "o1", "o2", "o3"];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function PollCardChatDemo() {
  const [options, setOptions] = React.useState(OPENING);
  const [mine, setMine] = React.useState<string | null>(null);
  const [closed, setClosed] = React.useState(false);
  const [round, setRound] = React.useState(0);

  const counts = options.map(
    (option) => option.votes + (mine === option.id ? 1 : 0),
  );
  const total = counts.reduce((sum, count) => sum + count, 0);
  const leadIndex = counts.reduce(
    (best, count, index) => (count > (counts[best] ?? -1) ? index : best),
    0,
  );
  const lead = options[leadIndex];
  const chosen = options.find((option) => option.id === mine);
  const share = chosen
    ? Math.round(((chosen.votes + 1) / Math.max(1, total)) * 100)
    : 0;

  const colleagueVotes = () => {
    const target = ROTATION[round % ROTATION.length];
    setOptions((prev) =>
      prev.map((option) =>
        option.id === target ? { ...option, votes: option.votes + 1 } : option,
      ),
    );
    setRound((prev) => prev + 1);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PollCardChat
        label="Coldbrook depot thread"
        peerName="Marta"
        poll={{
          id: "poll-1",
          from: "peer",
          question: "When should Friday's collection run?",
          options,
          time: "14:08",
          closesAt: "Closes 17:00",
        }}
        value={mine}
        onVote={setMine}
        closed={closed}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={closed}
          onClick={colleagueVotes}
        >
          A colleague votes
        </button>
        <button
          type="button"
          className={chip}
          disabled={closed}
          onClick={() => setClosed(true)}
        >
          Close poll
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {closed ? (
          <>
            Closed ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {lead?.label ?? "no winner"}
            </span>{" "}
            wins with {counts[leadIndex] ?? 0} of {total}
          </>
        ) : chosen ? (
          <>
            {chosen.label} ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              your vote
            </span>{" "}
            · {share}% of {total} votes
          </>
        ) : (
          <>
            <span className="text-[var(--signal,var(--primary))]">
              not voted
            </span>{" "}
            · {total} votes · {lead?.label ?? "no lead"} leads
          </>
        )}
      </p>
    </div>
  );
}
