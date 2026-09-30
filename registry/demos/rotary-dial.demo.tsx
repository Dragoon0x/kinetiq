"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RotaryDial } from "@/registry/ui/rotary-dial";

export const tweaks = defineTweaks({
  returnSpeed: {
    kind: "range",
    label: "Return speed",
    default: 10,
    min: 6,
    max: 20,
    step: 2,
    unit: "pps",
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "bakelite",
    options: ["bakelite", "chrome"],
    names: { bakelite: "Bakelite", chrome: "Chrome" },
  },
  digits: {
    kind: "range",
    label: "Digits",
    default: 7,
    min: 3,
    max: 10,
    step: 1,
  },
  display: { kind: "toggle", label: "Display", default: true },
});

/** Long numbers read as two groups, the last four apart. */
const grouped = (number: string, size: number) =>
  size >= 7 && number.length > size - 4
    ? `${number.slice(0, size - 4)} ${number.slice(size - 4)}`
    : number;

/**
 * The Fieldline switchboard: dial an outside line, digit by digit. The
 * prefix is already in; the line rings once the last digit lands.
 */
export function RotaryDialDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [number, setNumber] = React.useState("555");
  const size = values.digits ?? 7;
  const shown = number.slice(0, size);

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <RotaryDial
        label="Fieldline switchboard, outside line"
        value={number}
        onValueChange={setNumber}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {shown === "" ? (
            <>
              <span className="text-signal">no number</span> · drag a hole to
              the stop
            </>
          ) : shown.length >= size ? (
            <>
              <span className="text-signal">
                ringing {grouped(shown, size)}
              </span>{" "}
              · backspace to fix
            </>
          ) : (
            <>
              <span className="text-signal">{grouped(shown, size)}</span> ·{" "}
              {shown.length} of {size} digits
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
