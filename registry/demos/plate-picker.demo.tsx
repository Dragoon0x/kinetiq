"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultPlateTemplates,
  PlatePicker,
  type PlateFields,
  type PlateStatus,
  type PlateTemplate,
} from "@/registry/ui/plate-picker";

export const tweaks = defineTweaks({
  rackStyle: {
    kind: "choice",
    label: "Rack",
    default: "rack",
    options: ["rack", "grid", "list"],
    names: { rack: "Rack", grid: "Grid", list: "List" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
});

const LOAD_MS = 900;

/**
 * Gaugeworks Docs' new-document rack: nine templates standing as plates,
 * with Meeting notes and Spec in the recently used row.
 */
export function PlatePickerDemo({
  chrome = true,
  // The rack is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<PlateStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [chosen, setChosen] = React.useState<string | null>(null);
  const [recent, setRecent] = React.useState<string[]>([
    "meeting-notes",
    "spec",
  ]);
  const [created, setCreated] = React.useState<
    { template: PlateTemplate; fields: PlateFields }[]
  >([]);
  const [seq, setSeq] = React.useState(0);
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
        <PlatePicker height={540} {...values} />
      </div>
    );
  }

  const load = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, LOAD_MS);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setStatus("ready");
    setFailNext(false);
    setChosen(null);
    setRecent(["meeting-notes", "spec"]);
    setCreated([]);
    setSeq((n) => n + 1);
  };

  const last = created[created.length - 1];
  const chosenName =
    chosen !== null
      ? (defaultPlateTemplates.find((t) => t.id === chosen)?.name ?? chosen)
      : null;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <PlatePicker
        key={seq}
        height={560}
        value={chosen}
        onChange={setChosen}
        recent={recent}
        status={status}
        onRetry={load}
        onUse={(template, fields) => {
          setCreated((list) => [...list, { template, fields }]);
          setRecent((ids) => [
            template.id,
            ...ids.filter((id) => id !== template.id),
          ]);
        }}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {chosenName ? `${chosenName} out` : "rack closed"} ·{" "}
            {created.length} created
          </span>
          {last ? (
            <>
              {" "}
              · last: {last.fields.title} ({last.fields.owner})
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFailNext(true)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:text-danger"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
