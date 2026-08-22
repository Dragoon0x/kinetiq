"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Select } from "@/registry/ui/select";
import { StatusSeal } from "@/registry/ui/status-seal";
import { StepperFlow } from "@/registry/ui/stepper-flow";
import { TraceInput } from "@/registry/ui/trace-input";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GatehouseSubmission = {
  name: string;
  email: string;
  teamSize: string;
  need: string;
};

export type StepformGatehouseProps = {
  eyebrow?: string;
  headline?: string;
  onSubmit?: (submission: GatehouseSubmission) => void;
  className?: string;
};

const STEPS = [
  { id: "who", label: "Who you are" },
  { id: "team", label: "Your team" },
  { id: "review", label: "Review" },
] as const;

const TEAM_SIZES = [
  { value: "solo", label: "Just me" },
  { value: "small", label: "2 – 10" },
  { value: "mid", label: "11 – 50" },
  { value: "large", label: "More than 50" },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A gatehouse for longer asks: the journey drawn by the library's own
 * stepper — connectors filling, cleared steps stamping their check — while
 * each stage slides in from the direction of travel. The shell's contribution
 * is the data layer: per-step validation that blocks forward but never back,
 * a review stage that shows everything before anything is sent, and a
 * finished state that says what happens next.
 */
export function StepformGatehouse({
  eyebrow = "Fieldline · request access",
  headline = "Three short steps to a bench.",
  onSubmit,
  className,
}: StepformGatehouseProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const [current, setCurrent] = React.useState(0);
  const [direction, setDirection] = React.useState(1);
  const [done, setDone] = React.useState(false);
  const [values, setValues] = React.useState<GatehouseSubmission>({
    name: "",
    email: "",
    teamSize: "small",
    need: "",
  });
  const [tried, setTried] = React.useState(false);

  const set = (patch: Partial<GatehouseSubmission>) =>
    setValues((v) => ({ ...v, ...patch }));

  const stepValid =
    current === 0
      ? values.name.trim().length > 0 && EMAIL.test(values.email)
      : current === 1
        ? values.need.trim().length > 0
        : true;

  const go = (next: number) => {
    if (next > current && !stepValid) {
      setTried(true);
      return;
    }
    setTried(false);
    setDirection(next > current ? 1 : -1);
    setCurrent(Math.max(0, Math.min(STEPS.length - 1, next)));
  };

  const submit = () => {
    onSubmit?.(values);
    setDone(true);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-2xl px-6 py-20 sm:py-24">
        <div className="text-center">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
        </div>

        <div className="border-hairline bg-surface-1 rounded-4 mt-10 border p-6 shadow-raised sm:p-8">
          {done ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <StatusSeal variant="success">Request received</StatusSeal>
              <p className="text-ink text-lg font-medium">
                The bench is being set for {values.name.split(" ")[0] || "you"}.
              </p>
              <p className="text-ink-3 max-w-sm text-sm">
                A confirmation is on its way to {values.email}. Most benches
                open within the hour.
              </p>
            </div>
          ) : (
            <>
              <StepperFlow
                steps={STEPS.map((step) => ({ id: step.id, label: step.label }))}
                current={current}
                onStepChange={go}
              />

              <div className="relative mt-8 min-h-48 overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={current}
                    initial={
                      motionSafe
                        ? { opacity: 0, x: direction * distances.shift }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, transition: { duration: durations.fast } }}
                    transition={
                      motionSafe
                        ? { duration: durations.base, ease: easings.enter }
                        : { duration: durations.fast }
                    }
                    className="flex flex-col gap-4"
                  >
                    {current === 0 && (
                      <>
                        <TraceInput
                          label="Your name"
                          value={values.name}
                          onChange={(e) => set({ name: e.target.value })}
                          error={
                            tried && !values.name.trim()
                              ? "A name gets the bench labelled."
                              : undefined
                          }
                          autoComplete="name"
                        />
                        <TraceInput
                          label="Work email"
                          type="email"
                          value={values.email}
                          onChange={(e) => set({ email: e.target.value })}
                          error={
                            tried && !EMAIL.test(values.email)
                              ? "Enter a valid address — the bench link lands there."
                              : undefined
                          }
                          autoComplete="email"
                        />
                      </>
                    )}
                    {current === 1 && (
                      <>
                        <Select
                          label="Team size"
                          items={TEAM_SIZES}
                          value={values.teamSize}
                          onValueChange={(v) => set({ teamSize: v })}
                        />
                        <TraceInput
                          label="What will the bench hold first?"
                          value={values.need}
                          onChange={(e) => set({ need: e.target.value })}
                          error={
                            tried && !values.need.trim()
                              ? "One line is enough — it seeds the example."
                              : undefined
                          }
                          placeholder="A torque calibration recipe"
                        />
                      </>
                    )}
                    {current === 2 && (
                      <dl className="border-hairline divide-hairline rounded-3 divide-y border">
                        {(
                          [
                            ["Name", values.name],
                            ["Email", values.email],
                            [
                              "Team",
                              TEAM_SIZES.find((t) => t.value === values.teamSize)
                                ?.label ?? values.teamSize,
                            ],
                            ["First work", values.need],
                          ] as const
                        ).map(([label, value]) => (
                          <div
                            key={label}
                            className="flex items-baseline justify-between gap-4 px-4 py-3"
                          >
                            <dt className="text-label text-ink-3">{label}</dt>
                            <dd className="text-ink min-w-0 truncate text-sm">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <PressureButton
                  variant="ghost"
                  onClick={() => go(current - 1)}
                  disabled={current === 0}
                >
                  Back
                </PressureButton>
                {current < STEPS.length - 1 ? (
                  <PressureButton onClick={() => go(current + 1)}>
                    Continue
                  </PressureButton>
                ) : (
                  <PressureButton onClick={submit}>Send the request</PressureButton>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
