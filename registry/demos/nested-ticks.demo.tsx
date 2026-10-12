"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultNestedTickLazyChildren,
  defaultNestedTickValue,
  NestedTicks,
  type NestedTickNode,
} from "@/registry/ui/nested-ticks";

export const tweaks = defineTweaks({
  indent: {
    kind: "range",
    label: "Indent",
    default: 18,
    min: 8,
    max: 28,
    step: 2,
    unit: "px",
  },
  tickStyle: {
    kind: "choice",
    label: "Tick",
    default: "check",
    options: ["check", "ring", "gauge"],
    names: { check: "Check", ring: "Ring", gauge: "Gauge" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "graphite"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      amber: "Amber",
      graphite: "Graphite",
    },
  },
});

/** People in the two crews that load on demand, before they have loaded. */
const LAZY_SIZE: Record<string, number> = { night: 4, relief: 3 };
const TOTAL = 28;

/**
 * Fieldline's dispatch filter: pick whole crews or a few of their people.
 * The Night crew loads when first opened; the Relief crew's first load fails
 * and its Retry row brings it in.
 */
export function NestedTicksDemo({
  chrome = true,
  // The tree is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [leaves, setLeaves] = React.useState<string[]>(defaultNestedTickValue);
  const [note, setNote] = React.useState<string | null>(null);
  const [generation, setGeneration] = React.useState(0);
  const attempts = React.useRef<Record<string, number>>({});

  const loadChildren = (node: NestedTickNode) =>
    new Promise<NestedTickNode[]>((resolve, reject) => {
      const n = (attempts.current[node.id] ?? 0) + 1;
      attempts.current[node.id] = n;
      window.setTimeout(
        () => {
          if (node.id === "relief" && n === 1) {
            setNote("relief crew failed once");
            reject(new Error("The crew list timed out."));
            return;
          }
          setNote(`${node.label.toLowerCase()} loaded`);
          resolve(defaultNestedTickLazyChildren[node.id] ?? []);
        },
        node.id === "relief" ? 700 : 900,
      );
    });

  if (!chrome) {
    return (
      <div className="w-full">
        <NestedTicks
          className="h-[548px]"
          onLoadChildren={loadChildren}
          {...values}
        />
      </div>
    );
  }

  const people = leaves.reduce((n, id) => n + (LAZY_SIZE[id] ?? 1), 0);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <NestedTicks
        key={generation}
        className="h-[440px]"
        onChange={setLeaves}
        onLoadChildren={loadChildren}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {people} of {TOTAL} people
          </span>
          {note ? ` · ${note}` : " · ticked"}
        </p>
        <button
          type="button"
          onClick={() => {
            attempts.current = {};
            setLeaves(defaultNestedTickValue);
            setNote(null);
            setGeneration((g) => g + 1);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
    </div>
  );
}
