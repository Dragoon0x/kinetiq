"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { HangLabel } from "@/registry/ui/hang-label";

export const tweaks = defineTweaks({
  swing: {
    kind: "range",
    label: "Swing",
    default: 5,
    min: 0,
    max: 10,
    step: 1,
    unit: "°",
  },
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 220,
    min: 60,
    max: 600,
    step: 20,
  },
  style: {
    kind: "choice",
    label: "Style",
    default: "outline",
    options: ["outline", "filled", "line"],
    names: { outline: "Outline", filled: "Filled", line: "Line" },
  },
  budget: { kind: "toggle", label: "Budget", default: true },
});

const BUDGET = 32;

type Status = "editing" | "saved" | "refused";

/**
 * Fernworks account settings, the public profile: a display name with a
 * 32-character budget, and the location already filled in, so one label
 * rests in its field and the other hangs on the edge. Save (or Enter) with
 * fewer than two characters refuses and shakes the label; each refusal
 * shakes it again.
 */
export function HangLabelDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [name, setName] = React.useState("");
  const [place, setPlace] = React.useState("Coldbrook");
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<Status>("editing");
  const [refusals, setRefusals] = React.useState(0);
  const nameRef = React.useRef<HTMLInputElement | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Enter at least 2 characters.");
      setRefusals((n) => n + 1);
      setStatus("refused");
      // Back to the field, so the label shakes on the edge where it hangs.
      nameRef.current?.focus();
      return;
    }
    setError(null);
    setStatus("saved");
  };

  const line =
    status === "saved"
      ? ["display name", "saved"]
      : status === "refused"
        ? ["display name", "refused, too short"]
        : ["display name", `${name.length} of ${BUDGET}`];

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex w-full max-w-sm flex-col gap-3"
    >
      <HangLabel
        ref={nameRef}
        label="Display name"
        value={name}
        onValueChange={(next) => {
          setName(next);
          if (error && next.trim().length >= 2) setError(null);
          setStatus("editing");
        }}
        maxLength={BUDGET}
        hint="Shown on your reviews and orders."
        error={error}
        shakeKey={refusals}
        autoComplete="nickname"
        sound={sound}
        {...values}
      />
      <HangLabel
        label="Location"
        value={place}
        onValueChange={setPlace}
        autoComplete="address-level2"
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{line[0]}</span>
            {` · ${line[1]}`}
          </p>
          <button
            type="submit"
            className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Save
          </button>
        </div>
      ) : null}
    </form>
  );
}
