"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ShyLabel, type ShyLabelState } from "@/registry/ui/shy-label";

const SHORT = "We send one letter a month.";
const LONG =
  "One letter on the first Sunday of the month. Leave whenever you like.";

export const tweaks = defineTweaks({
  scatter: {
    kind: "range",
    label: "Scatter",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  state: {
    kind: "choice",
    label: "State",
    default: "default",
    options: ["default", "success", "error"],
    names: { default: "Default", success: "Success", error: "Error" },
  },
  hint: {
    kind: "choice",
    label: "Hint",
    default: SHORT,
    options: [SHORT, LONG, ""],
    names: { [SHORT]: "Short", [LONG]: "Long", "": "None" },
  },
});

const verdict = (email: string): { state: ShyLabelState; message: string } => {
  const at = email.indexOf("@");
  if (at < 1)
    return { state: "error", message: "That address is missing an @." };
  if (!/\.[a-z]{2,}$/i.test(email.slice(at + 1))) {
    return {
      state: "error",
      message: "Add the part after the @, like coldbrook.co.",
    };
  }
  return { state: "success", message: "Looks good. You’re on the list." };
};

/**
 * Coldbrook's newsletter sign-up: the field's label steps aside, letter by
 * letter, as the address is typed over it.
 */
export function ShyLabelDemo({
  chrome = true,
  // The label is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [email, setEmail] = React.useState("");
  const [checked, setChecked] = React.useState<string | null>(null);

  const forced =
    values.state && values.state !== "default" ? values.state : null;
  const judged = checked !== null && checked === email ? verdict(email) : null;
  const state: ShyLabelState = forced ?? judged?.state ?? "default";
  const message = forced
    ? forced === "success"
      ? "Looks good. You’re on the list."
      : "That address is missing an @."
    : judged?.message;

  const field = (
    <div className="flex w-full flex-col gap-3 rounded-4 border border-hairline bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">
          The Coldbrook Steep
        </p>
        <p className="text-xs text-ink-3">
          Brew notes and new roasts, monthly.
        </p>
      </div>
      <ShyLabel
        label="Email address"
        type="email"
        name="email"
        autoComplete="email"
        hint={SHORT}
        {...values}
        value={email}
        onValueChange={(next) => {
          setEmail(next);
          if (checked !== null && next !== checked) setChecked(null);
        }}
        onBlur={(event) => {
          const typed = event.currentTarget.value;
          setChecked(typed ? typed : null);
        }}
        state={state}
        message={message}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-sm justify-center">{field}</div>;
  }

  const count = [...email].length;
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {count > 0 ? `${count} character${count === 1 ? "" : "s"}` : "empty"}
        </span>
        {state === "success"
          ? " · address looks right"
          : state === "error"
            ? " · address needs a fix"
            : " · checked when you leave"}
      </p>
    </div>
  );
}
