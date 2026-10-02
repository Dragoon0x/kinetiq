"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultWizardSteps,
  defaultWizardValues,
  SetupWizard,
  type WizardValues,
} from "@/registry/ui/setup-wizard";

export const tweaks = defineTweaks({
  rail: {
    kind: "choice",
    label: "Rail",
    default: "side",
    options: ["side", "top", "bar"],
    names: { side: "Side", top: "Top", bar: "Bar" },
  },
  validate: {
    kind: "choice",
    label: "Validate",
    default: "next",
    options: ["next", "blur", "live"],
    names: { next: "On next", blur: "On leave", live: "As you type" },
  },
  direction: {
    kind: "choice",
    label: "Direction",
    default: "horizontal",
    options: ["horizontal", "vertical", "depth"],
    names: { horizontal: "Sideways", vertical: "Vertical", depth: "Depth" },
  },
});

const STEPS = defaultWizardSteps;
const COUNT = STEPS.length + 1;

const titleOf = (i: number) =>
  (i >= STEPS.length ? "review" : (STEPS[i]?.title ?? "")).toLowerCase();

const nameOf = (v: WizardValues) =>
  typeof v.name === "string" && v.name.trim()
    ? v.name.trim().toLowerCase()
    : "the workspace";

/**
 * Setting up Fieldline for the Fernworks team: the workspace and its
 * address, the team, the plan, then a review. Creating answers after 900 ms.
 */
export function SetupWizardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] =
    React.useState<WizardValues>(defaultWizardValues);
  const [note, setNote] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);

  const wizard = (
    <SetupWizard
      key={round}
      title="Set up Fieldline"
      subtitle="Four steps. What you answer stays on the rail."
      step={step}
      onStepChange={(i) => {
        setStep(i);
        setNote(null);
      }}
      value={answers}
      onValueChange={setAnswers}
      onInvalid={(_, ids) =>
        setNote(
          `held · ${ids.length} ${ids.length === 1 ? "field needs" : "fields need"} attention`,
        )
      }
      onSubmit={(v) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          setFailNext(false);
          setNote("creating");
          window.setTimeout(() => {
            if (fail) {
              setNote("failed · address not reserved");
              reject(
                new Error(
                  "Fieldline couldn't reserve that address. Try again.",
                ),
              );
              return;
            }
            setNote(`${nameOf(v)} is ready · ${STEPS.length} steps kept`);
            resolve();
          }, 900);
        })
      }
      onRestart={() => {
        setAnswers(defaultWizardValues);
        setNote(null);
      }}
      sound={sound}
      className={chrome ? undefined : "max-h-[588px]"}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{wizard}</div>;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      {wizard}
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
                step {Math.min(step, COUNT - 1) + 1} of {COUNT}
              </span>{" "}
              · {titleOf(step)}
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
              setStep(0);
              setAnswers(defaultWizardValues);
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
