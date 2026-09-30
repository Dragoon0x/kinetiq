"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GlobePhone, PHONE_COUNTRIES } from "@/registry/ui/globe-phone";

export const tweaks = defineTweaks({
  spin: {
    kind: "range",
    label: "Spin",
    default: 1,
    min: 0.3,
    max: 1.5,
    step: 0.1,
  },
  grid: { kind: "toggle", label: "Grid", default: true },
  format: { kind: "toggle", label: "Format", default: true },
});

/**
 * Fieldline account security: the number sign-in codes are texted to, with
 * its country picked on the globe.
 */
export function GlobePhoneDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [country, setCountry] = React.useState("GB");
  const [number, setNumber] = React.useState("");
  const picked = PHONE_COUNTRIES.find((c) => c.code === country);
  const need = (picked?.pattern.match(/#/g) ?? []).length;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <GlobePhone
        label="Mobile number"
        hint="Sign-in codes are texted here."
        country={country}
        onCountryChange={setCountry}
        value={number}
        onValueChange={setNumber}
        name="phone"
        className="self-center"
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {country} +{picked?.dial}
          </span>{" "}
          ·{" "}
          {number.length === need && need > 0
            ? `number complete · +${picked?.dial}${number}`
            : `${number.length} of ${need} digits`}
        </p>
      ) : null}
    </div>
  );
}
