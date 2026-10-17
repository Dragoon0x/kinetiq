"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CrossroadsPlan,
  defaultCrossroadsPlan,
} from "@/registry/ui/crossroads-plan";

export const tweaks = defineTweaks({
  branchStyle: {
    kind: "choice",
    label: "Branches",
    default: "rails",
    options: ["rails", "cards", "lines"],
    names: { rails: "Rails", cards: "Cards", lines: "Lines" },
  },
  witherSpeed: {
    kind: "range",
    label: "Wither",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const DECISIONS = defaultCrossroadsPlan.flatMap((s) =>
  s.kind === "decision" ? [s.decision] : [],
);

const branchTitle = (decisionId: string, branchId: string) =>
  DECISIONS.find((d) => d.id === decisionId)
    ?.branches.find((b) => b.id === branchId)
    ?.title.toLowerCase() ?? branchId;

/**
 * Fieldline, switching freight vendors: the agent stops at the two questions
 * only a person should answer, and recommends a path at each.
 */
export function CrossroadsPlanDemo({
  chrome = true,
  // The plan is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [choices, setChoices] = React.useState<Record<string, string>>({});
  const [said, setSaid] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.35 });

  // The card takes the agent's recommendation at the first crossroads once,
  // a beat after it is seen, so the grow and the wither play by themselves.
  const [played, setPlayed] = React.useState(false);
  React.useEffect(() => {
    if (chrome || !inView || played) return;
    const t = window.setTimeout(() => {
      setChoices((c) => ({ ...c, cutover: "waves" }));
      setPlayed(true);
    }, 1600);
    return () => window.clearTimeout(t);
  }, [chrome, inView, played]);

  const decided = DECISIONS.filter((d) => choices[d.id]).length;

  const surface = (
    <CrossroadsPlan
      key={round}
      choices={choices}
      onChooseBranch={(decision, branch) => {
        setChoices((c) => ({ ...c, [decision]: branch }));
        setSaid(`chose ${branchTitle(decision, branch)}`);
      }}
      onReopen={(decision) => {
        setChoices((c) => {
          const next = { ...c };
          delete next[decision];
          return next;
        });
        setSaid("reopened a crossroads");
      }}
      onApprove={(picked) =>
        setSaid(`approved · ${Object.keys(picked).length} paths`)
      }
      maxHeight={chrome ? undefined : 440}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setChoices({});
            setSaid(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span
          className={decided < DECISIONS.length ? "text-warn" : "text-signal"}
        >
          {said ??
            (decided < DECISIONS.length
              ? "held at a crossroads"
              : "ready to run")}
        </span>
        {` · ${decided} of ${DECISIONS.length} decided`}
      </p>
    </div>
  );
}
