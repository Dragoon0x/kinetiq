"use client";

import * as React from "react";

import { RotateCcw, WifiOff } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultDraftNow,
  defaultDraftValues,
  DraftKeeper,
  draftSummaryBase,
  type DraftRemoteEdit,
} from "@/registry/ui/draft-keeper";

export const tweaks = defineTweaks({
  indicatorStyle: {
    kind: "choice",
    label: "Indicator",
    default: "pill",
    options: ["pill", "dot", "line"],
    names: { pill: "Pill", dot: "Dot", line: "Line" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "neutral",
    options: ["neutral", "paper", "slate"],
    names: { neutral: "Neutral", paper: "Paper", slate: "Slate" },
  },
});

/** Mira's rewrite of the same summary, made from the original line. */
const MIRA_SUMMARY: DraftRemoteEdit = {
  id: "mira-summary",
  field: "summary",
  value:
    "Quiet Hours lets each team set focus windows when notifications wait, then sends them in one calm digest.",
  by: "mira",
  at: defaultDraftNow - 40_000,
  base: draftSummaryBase,
};

const JONAH_DATE: DraftRemoteEdit = {
  id: "jonah-launch",
  field: "launch",
  value: "2026-11-11",
  by: "jonah",
  at: defaultDraftNow + 3_000,
  base: defaultDraftValues.launch,
};

const MIRA_ROLLOUT: DraftRemoteEdit = {
  id: "mira-rollout",
  field: "rollout",
  value:
    "Beta group on Monday; every workspace on Thursday if support stays quiet.",
  by: "mira",
  at: defaultDraftNow + 20_000,
  base: defaultDraftValues.rollout,
};

/**
 * Waylight's 4.2 launch brief, shared with Mira (product) and Jonah (support).
 * Mira's version of the summary is waiting from the first frame; Jonah moves
 * the launch date three seconds in; edit the rollout plan and Mira edits it
 * too a moment later.
 */
export function DraftKeeperDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [incoming, setIncoming] = React.useState<DraftRemoteEdit[]>([
    MIRA_SUMMARY,
  ]);
  const [online, setOnline] = React.useState(true);
  const [last, setLast] = React.useState<string | null>(null);
  const rolloutQueued = React.useRef(false);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const t = window.setTimeout(
      () =>
        setIncoming((list) =>
          list.some((e) => e.id === JONAH_DATE.id)
            ? list
            : [...list, JONAH_DATE],
        ),
      3000,
    );
    return () => window.clearTimeout(t);
  }, [round]);

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    rolloutQueued.current = false;
    setIncoming([MIRA_SUMMARY]);
    setOnline(true);
    setLast(null);
    setRound((r) => r + 1);
  };

  const form = (
    <DraftKeeper
      key={round}
      incoming={incoming}
      online={online}
      onValuesChange={(next) => {
        if (
          !rolloutQueued.current &&
          next.rollout !== defaultDraftValues.rollout
        ) {
          rolloutQueued.current = true;
          timers.current.push(
            window.setTimeout(
              () => setIncoming((list) => [...list, MIRA_ROLLOUT]),
              2500,
            ),
          );
        }
      }}
      onSave={(_values, changed) =>
        new Promise<void>((resolve) => {
          setLast(
            `saving ${changed.length} ${changed.length === 1 ? "change" : "changes"}`,
          );
          timers.current.push(
            window.setTimeout(() => {
              setLast("saved · just now");
              resolve();
            }, 600),
          );
        })
      }
      onConflict={(field, _yours, _theirs, by) =>
        setLast(`${field} · yours or ${by.name.split(" ")[0]?.toLowerCase()}'s`)
      }
      onResolve={(field, kept) =>
        setLast(kept === "yours" ? `kept your ${field}` : `kept their ${field}`)
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{form}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {form}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={!online}
          onClick={() => {
            setOnline((o) => !o);
            setLast(online ? "offline · edits queue" : "back online");
          }}
          className={cn(
            button,
            !online &&
              "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] text-warn",
          )}
        >
          <WifiOff aria-hidden className="size-3.5" />
          Offline
        </button>
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
          {last ?? "summary · yours or mira's"}
        </span>
        {online ? " · autosave on" : " · offline"}
      </p>
    </div>
  );
}
