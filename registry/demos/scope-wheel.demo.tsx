"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultScopeWheelScopes, ScopeWheel } from "@/registry/ui/scope-wheel";

export const tweaks = defineTweaks({
  detents: {
    kind: "range",
    label: "Detents",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.1,
  },
  mapStyle: {
    kind: "choice",
    label: "Map",
    default: "blocks",
    options: ["blocks", "wire", "dots"],
    names: { blocks: "Blocks", wire: "Wire", dots: "Dots" },
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

/** The gallery card turns the wheel once: out to the workspace, in to the page, back. */
const TOUR = ["workspace", "page", "project"];

const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Fieldline, on the Larch Street project's site notes: a site lead decides
 * how far the assistant should look before asking about the crane permit.
 */
export function ScopeWheelDemo({
  chrome = true,
  // The composer is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [scope, setScope] = React.useState("project");
  const [event, setEvent] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.4 });

  const [touring, setTouring] = React.useState(0);
  React.useEffect(() => {
    if (chrome || !inView || touring >= TOUR.length) return;
    const t = window.setTimeout(
      () => {
        setScope(TOUR[touring] ?? "project");
        setTouring((n) => n + 1);
      },
      touring === 0 ? 900 : 1500,
    );
    return () => window.clearTimeout(t);
  }, [chrome, inView, touring]);

  const current =
    defaultScopeWheelScopes.find((s) => s.id === scope) ??
    defaultScopeWheelScopes[1];

  const surface = (
    <ScopeWheel
      key={round}
      scope={scope}
      onScopeChange={(id) => {
        setScope(id);
        setEvent(null);
      }}
      onLockedPick={() => setEvent("locked · open web search is off")}
      onSubmit={({ scope: s }) => setEvent(`asked · ${s.label.toLowerCase()}`)}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  return (
    <div ref={frame} className="flex w-full max-w-2xl flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Fieldline · Larch Street · Site notes
      </p>
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setScope("project");
            setEvent(null);
            setRound((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
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
          {event ??
            (current
              ? `${current.label.toLowerCase()}${current.count !== undefined ? ` · ${grouped(current.count)} ${current.unit ?? "items"}` : ""}`
              : "")}
        </span>{" "}
        · fieldline workspace
      </p>
    </div>
  );
}
