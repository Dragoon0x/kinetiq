"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSignOffNow,
  defaultSignOffReviewers,
  SignOffRound,
  type SignOffReviewer,
} from "@/registry/ui/sign-off-round";

export const tweaks = defineTweaks({
  stampStyle: {
    kind: "choice",
    label: "Stamp",
    default: "round",
    options: ["round", "rect", "initial"],
    names: { round: "Round", rect: "Rect", initial: "Initial" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--success)",
    options: [
      "var(--success)",
      "var(--accent-bright)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--success)": "Moss",
      "var(--accent-bright)": "Cobalt",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
      "var(--warn)": "Amber",
    },
  },
});

/** How each colleague answers a reminder in this scenario. */
const ANSWERS: Record<
  string,
  { after: number; verdict: "approved" | "changes"; comment?: string }
> = {
  tomas: {
    after: 1400,
    verdict: "changes",
    comment:
      "Support needs the renewal email live before the pricing page changes.",
  },
  priya: { after: 1100, verdict: "approved" },
};

/**
 * Fieldline's Basin plan pricing change, version 3, out for sign-off. Finance
 * has approved; you are Noor from Product. Approve or ask for changes, and
 * remind the others — each answers a moment later.
 */
export function SignOffRoundDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [reviewers, setReviewers] = React.useState<SignOffReviewer[]>(
    defaultSignOffReviewers,
  );
  const [event, setEvent] = React.useState<string | null>(null);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    setReviewers(defaultSignOffReviewers);
    setEvent(null);
    setRound((r) => r + 1);
  };

  const first = (id: string) =>
    (reviewers.find((r) => r.id === id)?.name ?? id).split(" ")[0] ?? id;

  const surface = (
    <SignOffRound
      key={round}
      reviewers={reviewers}
      onReviewersChange={setReviewers}
      viewer="noor"
      now={defaultSignOffNow}
      onApprove={(id) => setEvent(`approved · ${first(id)}`)}
      onRequestChanges={(id) => setEvent(`changes requested · ${first(id)}`)}
      onRemind={(id) => {
        setEvent(`reminded · ${first(id)}`);
        const answer = ANSWERS[id];
        if (!answer) return;
        const t = window.setTimeout(() => {
          timers.current.delete(t);
          setReviewers((list) =>
            list.map((r) =>
              r.id === id && r.verdict === "pending"
                ? {
                    ...r,
                    verdict: answer.verdict,
                    comment: answer.comment,
                    at: defaultSignOffNow,
                  }
                : r,
            ),
          );
          setEvent(
            `${answer.verdict === "changes" ? "changes requested" : "approved"} · ${first(id)}`,
          );
        }, answer.after);
        timers.current.add(t);
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const signed = reviewers.filter((r) => r.verdict !== "pending").length;
  const waiting = reviewers
    .filter((r) => r.verdict === "pending")
    .map((r) => r.name.split(" ")[0]);
  const done = signed === reviewers.length;
  const changes = reviewers.some((r) => r.verdict === "changes");
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {done
            ? `round complete · ${changes ? "changes requested" : "signed off"}`
            : (event ?? `${signed} of ${reviewers.length} signed`)}
        </span>
        {done ? null : ` · waiting on ${waiting.join(", ")}`}
      </p>
    </div>
  );
}
