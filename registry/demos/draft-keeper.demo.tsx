"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  countKeeperUnsaved,
  defaultKeeperDrafts,
  defaultKeeperFields,
  defaultKeeperValues,
  DraftKeeper,
  type KeeperDraft,
  type KeeperLeaveOutcome,
  type KeeperStatus,
  type KeeperValues,
} from "@/registry/ui/draft-keeper";

export const tweaks = defineTweaks({
  autosaveSeconds: {
    kind: "range",
    label: "Autosave after",
    default: 4,
    min: 2,
    max: 10,
    step: 1,
    unit: "s",
  },
  chipStyle: {
    kind: "choice",
    label: "Keeper",
    default: "ring",
    options: ["ring", "bar", "dot"],
    names: { ring: "Ring", bar: "Bar", dot: "Dot" },
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
 * Fernmoor Allotment Society's Coldbrook grant application, three drafts in:
 * type into a field and the keeper counts down to the fourth, make a save
 * fail, compare and restore an earlier draft, then try to navigate away.
 */
export function DraftKeeperDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [form, setForm] = React.useState<KeeperValues>(defaultKeeperValues);
  const [drafts, setDrafts] =
    React.useState<KeeperDraft[]>(defaultKeeperDrafts);
  const [status, setStatus] = React.useState<KeeperStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [lastLeave, setLastLeave] = React.useState<KeeperLeaveOutcome | null>(
    null,
  );
  const [epoch, setEpoch] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <DraftKeeper height={540} {...values} />
      </div>
    );
  }

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setForm(defaultKeeperValues);
    setDrafts(defaultKeeperDrafts);
    setFailNext(false);
    setLeaving(false);
    setLastLeave(null);
    setEpoch((e) => e + 1);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus("ready");
    }, 900);
  };

  const unsaved = countKeeperUnsaved(
    defaultKeeperFields,
    form,
    drafts[drafts.length - 1]?.values ?? defaultKeeperValues,
  );

  const button =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <DraftKeeper
        key={epoch}
        height={560}
        value={form}
        onChange={setForm}
        drafts={drafts}
        onDraftsChange={setDrafts}
        saveFails={failNext}
        onSaveError={() => setFailNext(false)}
        leaving={leaving}
        onLeave={(outcome) => {
          setLeaving(false);
          setLastLeave(outcome);
        }}
        status={status}
        onRetry={() => setStatus("ready")}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {drafts.length} {drafts.length === 1 ? "draft" : "drafts"} ·{" "}
            {unsaved} unsaved
          </span>{" "}
          ·{" "}
          {lastLeave === null
            ? "editing"
            : lastLeave === "clean"
              ? "left, nothing unsaved"
              : lastLeave}
          {failNext ? " · next save fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLeaving(true)}
            aria-pressed={leaving}
            className={button}
          >
            Navigate away
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className={button}
          >
            Fail next save
          </button>
          <button type="button" onClick={reset} className={button}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
