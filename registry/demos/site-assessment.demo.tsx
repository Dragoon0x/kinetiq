"use client";

import * as React from "react";

import { CloudOff, RotateCcw, Wifi } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSiteAssessmentAnswers,
  defaultSiteAssessmentQuestions,
  scoreSiteAssessment,
  SiteAssessment,
  type SiteAssessmentAnswers,
} from "@/registry/ui/site-assessment";

export const tweaks = defineTweaks({
  bandCount: {
    kind: "range",
    label: "Bands",
    default: 4,
    min: 3,
    max: 5,
    step: 1,
  },
  chipStyle: {
    kind: "choice",
    label: "Chips",
    default: "solid",
    options: ["solid", "wash", "pebble"],
    names: { solid: "Solid", wash: "Wash", pebble: "Pebble" },
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "signal",
    options: ["signal", "cobalt", "ember", "mono"],
    names: { signal: "Signal", cobalt: "Cobalt", ember: "Ember", mono: "Mono" },
  },
});

type Phase = "draft" | "queued" | "sent";

/**
 * Noor Haddad, Fieldline crew lead, on Tuesday's pre-work visit to the
 * Riverside pump station: three checks answered at the gate, five to go.
 */
export function SiteAssessmentDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [online, setOnline] = React.useState(true);
  const [answers, setAnswers] = React.useState<SiteAssessmentAnswers>(
    defaultSiteAssessmentAnswers,
  );
  const [last, setLast] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<Phase>("draft");

  const reset = () => {
    setAnswers(defaultSiteAssessmentAnswers);
    setLast(null);
    setPhase("draft");
    setOnline(true);
    setRound((r) => r + 1);
  };

  const surface = (
    <SiteAssessment
      key={round}
      online={online}
      onValueChange={(next) => {
        setAnswers(next);
        setPhase("draft");
      }}
      onAnswer={(id, value) => {
        const q = defaultSiteAssessmentQuestions.find((x) => x.id === id);
        const o = q?.options.find((x) => x.value === value);
        if (!q || !o) return;
        const add = o.points * q.weight;
        setLast(`${q.short ?? q.prompt} ${add === 0 ? "clear" : `+${add}`}`);
      }}
      onQueue={() => setPhase("queued")}
      onSubmit={() => setPhase("sent")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const s = scoreSiteAssessment(
    defaultSiteAssessmentQuestions,
    answers,
    values.bandCount ?? 4,
  );
  const total = defaultSiteAssessmentQuestions.length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={!online}
          onClick={() => setOnline((o) => !o)}
          className={button}
        >
          {online ? (
            <CloudOff aria-hidden className="size-3.5" />
          ) : (
            <Wifi aria-hidden className="size-3.5" />
          )}
          {online ? "Go offline" : "Back online"}
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
        {phase === "sent" ? (
          <>
            <span className="text-signal">submitted</span> · score {s.score} ·{" "}
            {s.band}
          </>
        ) : phase === "queued" ? (
          <>
            <span className="text-signal">queued</span> · sends when online
          </>
        ) : (
          <>
            <span className="text-signal">
              score {s.score} · {s.band}
            </span>{" "}
            ·{" "}
            {last ??
              `${total - s.unanswered.length} of ${total} answered${
                online ? "" : " · offline"
              }`}
          </>
        )}
      </p>
    </div>
  );
}
