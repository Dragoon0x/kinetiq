"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  AddressCascade,
  defaultAddressCountries,
  defaultAddressValue,
  type AddressStatus,
  type AddressValue,
} from "@/registry/ui/address-cascade";

export const tweaks = defineTweaks({
  layout: {
    kind: "choice",
    label: "Layout",
    default: "grid",
    options: ["stack", "grid"],
    names: { stack: "Stack", grid: "Grid" },
  },
  preview: { kind: "toggle", label: "Preview", default: true },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const LOAD_MS = 900;

/**
 * A Basinworks shipping address: start typing a street to be offered a
 * seeded address, or change the country and watch the lines rebuild.
 */
export function AddressCascadeDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<AddressValue>(defaultAddressValue);
  const [status, setStatus] = React.useState<AddressStatus>("ready");
  const [load, setLoad] = React.useState(0);
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const failRef = React.useRef(false);

  React.useEffect(() => {
    if (load === 0) return;
    const fail = failRef.current;
    failRef.current = false;
    const t = window.setTimeout(() => {
      setStatus(fail ? "error" : "ready");
      setFailNext(false);
    }, LOAD_MS);
    return () => window.clearTimeout(t);
  }, [load]);

  const reload = () => {
    setStatus("loading");
    setLoad((n) => n + 1);
    setNote(null);
  };

  const surface = (
    <AddressCascade
      value={value}
      onChange={(next, change) => {
        setValue(next);
        if (change.field === "country") {
          setNote(
            `country · ${defaultAddressCountries.find((c) => c.code === change.to)?.name.toLowerCase() ?? change.to}`,
          );
        } else if (change.field === "suggestion") {
          setNote(`filled · ${change.to?.toLowerCase() ?? ""}`);
        }
      }}
      onSubmit={(_next, lines) => setNote(`saved · ${lines.length} lines`)}
      status={status}
      onRetry={reload}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const country = defaultAddressCountries.find((c) => c.code === value.country);
  const fieldsFilled = country
    ? country.fields.filter((f) => value[f.key].trim() !== "").length
    : 0;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reload} className={button}>
          Reload
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => {
            failRef.current = !failNext;
            setFailNext(!failNext);
          }}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next load
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(defaultAddressValue);
            setNote(null);
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
        <span className="text-signal">
          {status === "loading"
            ? "loading countries"
            : status === "error"
              ? "country list failed"
              : (note ?? (country ? country.name : "no country"))}
        </span>{" "}
        · {fieldsFilled} of {country?.fields.length ?? 0} lines filled
      </p>
    </div>
  );
}
