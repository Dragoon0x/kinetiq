"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultGuardValues,
  LeaveGuard,
  type GuardLeaveRequest,
  type GuardOutcome,
  type GuardValues,
} from "@/registry/ui/leave-guard";

export const tweaks = defineTweaks({
  sheetSide: {
    kind: "choice",
    label: "Sheet",
    default: "foot",
    options: ["foot", "centre"],
    names: { foot: "Foot", centre: "Centre" },
  },
  armSeconds: {
    kind: "range",
    label: "Arm",
    default: 4,
    min: 2,
    max: 8,
    step: 1,
    unit: "s",
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/**
 * Gaugeworks' workspace settings: change a field or two, then try to go to
 * Billing or close the tab and the guard asks what to do with the edits.
 */
export function LeaveGuardDemo({
  chrome = true,
  // The guard is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [form, setForm] = React.useState<GuardValues>(defaultGuardValues);
  const [request, setRequest] = React.useState<GuardLeaveRequest | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const seq = React.useRef(0);

  const ask = (destination: string, kind: "navigate" | "close") => {
    seq.current += 1;
    setRequest({ id: seq.current, destination, kind });
    setNote(null);
  };

  const save = () =>
    new Promise<void>((resolve, reject) => {
      const fail = failNext;
      setFailNext(false);
      window.setTimeout(() => {
        if (fail) reject(new Error("The settings service timed out."));
        else resolve();
      }, 1100);
    });

  const left = (outcome: GuardOutcome, req: GuardLeaveRequest) => {
    const where =
      req.kind === "close" ? "closed the tab" : `went to ${req.destination}`;
    setNote(
      outcome === "saved"
        ? `saved, then ${where}`
        : outcome === "discarded"
          ? `${where} without saving`
          : `${where}, nothing to save`,
    );
  };

  const surface = (
    <LeaveGuard
      key={round}
      value={form}
      onChange={setForm}
      leaveRequest={request}
      onSave={save}
      onLeave={left}
      onStay={() => setNote("stayed")}
      onDiscard={(changes) => setNote(`discarded ${changes.length}`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const dirty = Object.keys(defaultGuardValues).filter(
    (k) => form[k] !== defaultGuardValues[k],
  ).length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-cobalt-bright/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => ask("Billing", "navigate")}
          className={button}
        >
          Go to Billing
        </button>
        <button
          type="button"
          onClick={() => ask("the tab", "close")}
          className={button}
        >
          Close tab
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={button}
        >
          Fail next save
        </button>
        <button
          type="button"
          onClick={() => {
            setForm(defaultGuardValues);
            setRequest(null);
            setFailNext(false);
            setNote(null);
            setRound((r) => r + 1);
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
          {note ?? (dirty > 0 ? `${dirty} unsaved` : "clean")}
        </span>{" "}
        · {failNext ? "next save fails" : "saves succeed"}
      </p>
    </div>
  );
}
