"use client";

import * as React from "react";

import { RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSafetyNow,
  defaultYourCode,
  SafetyNumbers,
} from "@/registry/ui/safety-numbers";

export const tweaks = defineTweaks({
  groupStyle: {
    kind: "choice",
    label: "Groups",
    default: "cells",
    options: ["cells", "chips", "digits"],
    names: { cells: "Cells", chips: "Chips", digits: "Digits" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
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

/** Swaps the digits of the given five-digit groups, deterministically. */
const alter = (code: string, groups: number[]) =>
  code
    .split("")
    .map((ch, i) =>
      groups.includes(Math.floor(i / 5)) ? String((Number(ch) + 3) % 10) : ch,
    )
    .join("");

const CHANGED_CODE = alter(defaultYourCode, [2, 6, 9]);

/**
 * Verifying Rafi Okafor in a Waylight secure chat. Compare the numbers aloud,
 * scan, or mark verified; the chrome can simulate a changed number or a
 * mismatch.
 */
export function SafetyNumbersDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [verified, setVerified] = React.useState(false);
  const [verifiedAt, setVerifiedAt] = React.useState<number | undefined>();
  const [changed, setChanged] = React.useState(false);
  const [wrong, setWrong] = React.useState(false);
  const [event, setEvent] = React.useState<string | null>(null);
  const scan = React.useRef(0);

  React.useEffect(() => () => window.clearTimeout(scan.current), []);

  const restart = (next: { changed?: boolean; wrong?: boolean }) => {
    window.clearTimeout(scan.current);
    setChanged(next.changed ?? false);
    setWrong(next.wrong ?? false);
    setVerified(false);
    setVerifiedAt(undefined);
    setEvent(null);
    setRound((r) => r + 1);
  };

  const yours = changed ? CHANGED_CODE : defaultYourCode;
  const theirs = wrong ? alter(yours, [7]) : yours;

  const surface = (
    <SafetyNumbers
      key={round}
      yourCode={yours}
      theirCode={theirs}
      previousCode={changed ? defaultYourCode : undefined}
      changed={changed}
      verified={verified}
      verifiedAt={verifiedAt}
      now={defaultSafetyNow}
      onVerify={() => {
        setVerified(true);
        setVerifiedAt(defaultSafetyNow);
        setEvent("verified · rafi okafor");
      }}
      onReset={() => {
        setVerified(false);
        setEvent("verification cleared");
      }}
      onScan={() => {
        setEvent("scanning rafi's code");
        window.clearTimeout(scan.current);
        scan.current = window.setTimeout(() => {
          if (wrong) {
            setEvent("scan · numbers differ");
            return;
          }
          setVerified(true);
          setVerifiedAt(defaultSafetyNow);
          setEvent("scanned · verified");
        }, 900);
      }}
      onCompare={(i, result) =>
        setEvent(`group ${i + 1} · ${result === "same" ? "same" : "different"}`)
      }
      onAcknowledgeChange={() => setEvent("comparing the new number")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = (on: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-2 border px-3 text-xs transition-colors outline-none",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      on
        ? "border-hairline-strong bg-surface-2 text-foreground"
        : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
    );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={changed}
          className={button(changed)}
          onClick={() => restart({ changed: !changed, wrong })}
        >
          <ShieldAlert aria-hidden className="size-3.5" />
          Number changed
        </button>
        <button
          type="button"
          aria-pressed={wrong}
          className={button(wrong)}
          onClick={() => restart({ changed, wrong: !wrong })}
        >
          <TriangleAlert aria-hidden className="size-3.5" />
          Mismatch
        </button>
        <button
          type="button"
          className={button(false)}
          onClick={() => restart({})}
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
          {event ?? (verified ? "verified · rafi okafor" : "not verified")}
        </span>{" "}
        · 12 groups{changed ? " · new number" : ""}
        {wrong ? " · 1 differs" : ""}
      </p>
    </div>
  );
}
