"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { RadioGroup, RadioGroupItem } from "@/registry/ui/radio-group";
import { StageProgress } from "@/registry/ui/stage-progress";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TraceInput } from "@/registry/ui/trace-input";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type IntakeField = {
  id: string;
  label: string;
  placeholder?: string;
};

export type IntakeRoute = {
  id: string;
  label: string;
  description: string;
  /** The route's own stages — this is what makes the rail re-form. */
  steps: { id: string; label: string; title: string; fields: IntakeField[] }[];
  /** What happens at the end of this particular route. */
  outcome: string;
};

export type StepformBranchingIntakeProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  routeQuestion?: string;
  routes?: IntakeRoute[];
  onSubmit?: (routeId: string, answers: Record<string, string>) => void;
  className?: string;
};

const DEFAULT_ROUTES: IntakeRoute[] = [
  {
    id: "yard",
    label: "I run a yard",
    description: "One site, your own crews. The short route.",
    steps: [
      {
        id: "y1",
        label: "Yard",
        title: "About the yard",
        fields: [
          { id: "yardName", label: "Yard name", placeholder: "North basin" },
          { id: "crews", label: "How many crews", placeholder: "Two" },
        ],
      },
      {
        id: "y2",
        label: "You",
        title: "Where to send the first board",
        fields: [
          { id: "email", label: "Work email", placeholder: "you@yard.example" },
        ],
      },
    ],
    outcome:
      "A board for your yard lands before the next shift. No call unless you ask.",
  },
  {
    id: "group",
    label: "I run several",
    description:
      "Multiple sites sharing gear. One extra step for the constraints.",
    steps: [
      {
        id: "g1",
        label: "Sites",
        title: "About the sites",
        fields: [
          { id: "group", label: "Group name", placeholder: "Fieldline north" },
          { id: "sites", label: "How many sites", placeholder: "Four" },
        ],
      },
      {
        id: "g2",
        label: "Shared gear",
        title: "What the sites share",
        fields: [
          {
            id: "shared",
            label: "Shared equipment",
            placeholder: "Two cranes, one rig",
          },
        ],
      },
      {
        id: "g3",
        label: "You",
        title: "Where to send the plan",
        fields: [
          {
            id: "email",
            label: "Work email",
            placeholder: "you@group.example",
          },
        ],
      },
    ],
    outcome:
      "We model the shared gear first, then cut boards for every site. Usually two days.",
  },
  {
    id: "vendor",
    label: "I supply yards",
    description: "You are not the buyer. This route is short on purpose.",
    steps: [
      {
        id: "v1",
        label: "You",
        title: "Who you are",
        fields: [
          { id: "company", label: "Company", placeholder: "Halyard Works" },
          {
            id: "email",
            label: "Work email",
            placeholder: "you@supplier.example",
          },
        ],
      },
    ],
    outcome:
      "Partnerships reads these weekly. We will not put you into a sales sequence.",
  },
];

/**
 * A branching intake: the first answer decides the route, and the rail
 * visibly re-forms to the length that route actually takes — two stages, or
 * three, or one. Long forms lose people because the end is invisible; a form
 * that shortens itself in front of you when you say who you are makes the
 * opposite promise. The last route is deliberately one step, because not
 * every visitor is a buyer.
 */
export function StepformBranchingIntake({
  eyebrow = "Waylight · getting you to the right place",
  headline = "Tell us who you are, and the form gets shorter.",
  copy = "Three routes. Each one only asks for what its own path needs.",
  routeQuestion = "Which of these is you?",
  routes = DEFAULT_ROUTES,
  onSubmit,
  className,
}: StepformBranchingIntakeProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();

  const [routeId, setRouteId] = React.useState<string | null>(null);
  const [index, setIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  const route = routes.find((r) => r.id === routeId) ?? null;

  // The rail re-forms with the route: the pick is always the first stage, and
  // the rest come from whichever path the reader is on.
  const stages = React.useMemo(
    () => [
      { id: "__route", label: "You" },
      ...(route?.steps.map((s) => ({ id: s.id, label: s.label })) ?? [
        { id: "__pending", label: "…" },
      ]),
    ],
    [route],
  );

  const step = route?.steps[index] ?? null;

  const advance = (event: React.FormEvent) => {
    event.preventDefault();
    if (!route || !step) return;
    const missing = step.fields.find((f) => !(answers[f.id] ?? "").trim());
    if (missing) {
      setError(`${missing.label} is needed to carry on.`);
      return;
    }
    setError(null);
    if (index + 1 < route.steps.length) {
      setIndex(index + 1);
      return;
    }
    setSent(true);
    onSubmit?.(route.id, answers);
  };

  const pickRoute = (id: string) => {
    setRouteId(id);
    setIndex(0);
    setError(null);
  };

  const enter = motionSafe
    ? { duration: durations.base, ease: easings.enter }
    : { duration: 0 };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-2xl px-6 py-20 sm:py-24">
        <p className="text-label text-ink-3">{eyebrow}</p>
        <h2
          id={headingId}
          className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {headline}
        </h2>
        <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>

        <div className="mt-10 rounded-4 border border-hairline bg-surface-1 p-6 shadow-raised sm:p-8">
          <StageProgress
            stages={stages}
            current={route ? Math.min(index + 1, stages.length - 1) : 0}
            progress={sent ? 1 : undefined}
            aria-label="Intake progress"
          />

          <div className="mt-8">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={sent ? "__done" : !route ? "__pick" : (step?.id ?? "")}
                initial={{
                  opacity: 0,
                  x: motionSafe ? distances.shift : 0,
                }}
                animate={{ opacity: 1, x: 0 }}
                exit={{
                  opacity: 0,
                  transition: exitFor(
                    motionSafe ? durations.base : durations.fast,
                  ),
                }}
                transition={enter}
              >
                {sent && route ? (
                  <div>
                    <StatusSeal variant="success">sent</StatusSeal>
                    <p className="mt-4 text-xl font-semibold tracking-tight text-balance text-ink">
                      That is everything we need.
                    </p>
                    <p className="mt-2 leading-relaxed text-ink-2">
                      {route.outcome}
                    </p>
                  </div>
                ) : !route ? (
                  <div>
                    <p className="text-xl font-semibold tracking-tight text-ink">
                      {routeQuestion}
                    </p>
                    <div className="mt-5">
                      <RadioGroup
                        aria-label={routeQuestion}
                        value=""
                        onValueChange={pickRoute}
                      >
                        {routes.map((option) => (
                          <RadioGroupItem
                            key={option.id}
                            value={option.id}
                            description={option.description}
                          >
                            {option.label}
                          </RadioGroupItem>
                        ))}
                      </RadioGroup>
                    </div>
                  </div>
                ) : step ? (
                  <form onSubmit={advance}>
                    <p className="text-xl font-semibold tracking-tight text-ink">
                      {step.title}
                    </p>
                    <div className="mt-5 flex flex-col gap-4">
                      {step.fields.map((field) => (
                        <TraceInput
                          key={field.id}
                          label={field.label}
                          placeholder={field.placeholder}
                          value={answers[field.id] ?? ""}
                          onChange={(event) => {
                            setError(null);
                            setAnswers((prev) => ({
                              ...prev,
                              [field.id]: event.target.value,
                            }));
                          }}
                        />
                      ))}
                    </div>
                    {error && (
                      <p className="mt-3 flex items-center gap-2 text-xs text-destructive">
                        <span
                          aria-hidden
                          className="h-px w-3 shrink-0 bg-destructive"
                        />
                        {error}
                      </p>
                    )}
                    <div className="mt-6 flex items-center justify-between gap-3 border-t border-hairline pt-5">
                      <button
                        type="button"
                        onClick={() =>
                          index === 0 ? setRouteId(null) : setIndex(index - 1)
                        }
                        className="text-sm text-ink-3 underline underline-offset-4 transition-colors hover:text-ink"
                      >
                        Back
                      </button>
                      <PressureButton type="submit">
                        {index + 1 === route.steps.length ? "Send it" : "Next"}
                      </PressureButton>
                    </div>
                  </form>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
