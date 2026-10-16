"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultHazardActions,
  defaultHazardMembers,
  HazardShelf,
  type HazardStatus,
} from "@/registry/ui/hazard-shelf";

export const tweaks = defineTweaks({
  stripeStyle: {
    kind: "choice",
    label: "Stripes",
    default: "tape",
    options: ["tape", "rail", "hatch", "plain"],
    names: { tape: "Tape", rail: "Rail", hatch: "Hatch", plain: "Plain" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "amber",
    options: ["amber", "red", "ink"],
    names: { amber: "Amber", red: "Red", ink: "Ink" },
  },
});

const WAIT = 900;

/**
 * The bottom of the Fernworks workspace settings. "Fail next" makes the next
 * confirmed action reject, so the panel can say what was not done; "Recount"
 * reloads the consequence counts.
 */
export function HazardShelfDemo({
  chrome = true,
  // The shelf is silent: nothing here should sound like a confirmation.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<HazardStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [line, setLine] = React.useState<{ lead: string; rest: string }>({
    lead: "delete workspace",
    rest: "412 documents counted",
  });
  const [round, setRound] = React.useState(0);
  const timer = React.useRef<number | null>(null);
  // A confirmed action rolls its panel up too; that roll-up is not news.
  const landed = React.useRef(false);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const settle = (lead: string, rest: string) =>
    new Promise<void>((resolve, reject) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      const fail = failNext;
      setFailNext(false);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (fail) {
          setLine({ lead: `not ${lead}`, rest: "nothing changed" });
          reject(new Error("The storage service did not answer."));
        } else {
          landed.current = true;
          setLine({ lead, rest });
          resolve();
        }
      }, WAIT);
    });

  const recount = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    setLine({ lead: "counting", rest: "what each action touches" });
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus("ready");
      setLine({ lead: "counted", rest: "412 documents · 18 members" });
    }, 1200);
  };

  const shelf = (
    <HazardShelf
      key={round}
      // The delete panel starts unrolled, so the shelf opens on what it is
      // for; roll it up or open another to see it unroll.
      defaultValue="delete"
      status={status}
      onRetry={recount}
      onValueChange={(id) => {
        const action = defaultHazardActions.find((a) => a.id === id);
        if (action) {
          setLine({
            lead: action.title.toLowerCase(),
            rest:
              status === "ready"
                ? `${action.touches[0]?.count ?? 0} ${action.touches[0]?.other ?? ""} counted`
                : "counting",
          });
        } else if (landed.current) {
          landed.current = false;
        } else {
          setLine({ lead: "rolled up", rest: "nothing changed" });
        }
      }}
      onTransfer={(memberId) =>
        settle(
          "transferred",
          `owned by ${(defaultHazardMembers.find((m) => m.id === memberId)?.name ?? "").toLowerCase()}`,
        )
      }
      onArchive={() => settle("archived", "fernworks is read-only")}
      onDelete={() => settle("deletion scheduled", "412 documents queued")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{shelf}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {shelf}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((v) => !v)}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next
        </button>
        <button type="button" onClick={recount} className={button}>
          Recount
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            setStatus("ready");
            setFailNext(false);
            setRound((r) => r + 1);
            setLine({
              lead: "delete workspace",
              rest: "412 documents counted",
            });
          }}
          className={button}
        >
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line.lead}</span> · {line.rest}
      </p>
    </div>
  );
}
