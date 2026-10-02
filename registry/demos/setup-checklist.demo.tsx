"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultSetupProgress,
  defaultSetupSteps,
  SetupChecklist,
  type SetupProgress,
} from "@/registry/ui/setup-checklist";

export const tweaks = defineTweaks({
  ring: {
    kind: "choice",
    label: "Ring",
    default: "arc",
    options: ["arc", "segments", "ticks"],
    names: { arc: "Arc", segments: "Segments", ticks: "Ticks" },
  },
  expand: {
    kind: "choice",
    label: "Expand",
    default: "lift",
    options: ["lift", "inline"],
    names: { lift: "Lift", inline: "Inline" },
  },
  celebrate: {
    kind: "choice",
    label: "Celebrate",
    default: "burst",
    options: ["burst", "stamp", "quiet"],
    names: { burst: "Burst", stamp: "Stamp", quiet: "Quiet" },
  },
});

/** How long each step's action takes to answer, ms: seeded, not random. */
const LATENCY: Record<string, number> = {
  business: 640,
  currency: 560,
  bank: 900,
  team: 720,
  test: 840,
};

const REFUSALS: Record<string, string> = {
  bank: "Coldbrook Bank didn't answer. Try again.",
  team: "That invite bounced. Check the address.",
  test: "The test card was declined. Try again.",
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * A new merchant's home screen in Waylight Pay: name the business, pick a
 * payout currency, connect a Coldbrook Bank account, invite a teammate and
 * take a €1 test payment.
 */
export function SetupChecklistDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [progress, setProgress] =
    React.useState<SetupProgress>(defaultSetupProgress);
  const [dismissed, setDismissed] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);

  const steps = defaultSetupSteps;
  const done = steps.filter((s) => progress[s.id] !== undefined).length;
  const minutes = steps.reduce(
    (sum, s) => sum + (progress[s.id] ? 0 : (s.minutes ?? 0)),
    0,
  );

  const checklist = (
    <SetupChecklist
      key={round}
      title="Get started with Waylight Pay"
      subtitle="Five short steps and you can take your first payment."
      value={progress}
      onValueChange={(next) => {
        const fresh = steps.find((s) => next[s.id] && !progress[s.id]);
        const upcoming = steps.find((s) => next[s.id] === undefined);
        setProgress(next);
        if (!upcoming) setNote("all set · ready to dismiss");
        else if (fresh && next[fresh.id] === "done")
          setNote(
            `${lower(fresh.doneLabel ?? fresh.title)} · next: ${lower(upcoming.title)}`,
          );
      }}
      dismissed={dismissed}
      onDismissedChange={(next) => {
        setDismissed(next);
        setNote(next ? "checklist dismissed" : null);
      }}
      onSkip={(id) => {
        const step = steps.find((s) => s.id === id);
        if (step) setNote(`skipped · ${lower(step.title)}`);
      }}
      onAction={(id) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          setFailNext(false);
          window.setTimeout(() => {
            if (!fail) {
              resolve();
              return;
            }
            const step = steps.find((s) => s.id === id);
            setNote(`failed · ${lower(step?.title ?? "that step")}`);
            reject(new Error(REFUSALS[id] ?? "That didn't save. Try again."));
          }, LATENCY[id] ?? 700);
        })
      }
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{checklist}</div>;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      {checklist}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">
                {done} of {steps.length} done
              </span>
              {minutes > 0 ? ` · about ${minutes} min left` : null}
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => {
              const next = !failRef.current;
              failRef.current = next;
              setFailNext(next);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger/50 aria-pressed:text-danger"
          >
            Fail next
          </button>
          <button
            type="button"
            onClick={() => {
              setProgress(defaultSetupProgress);
              setDismissed(false);
              setNote(null);
              failRef.current = false;
              setFailNext(false);
              setRound((r) => r + 1);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
