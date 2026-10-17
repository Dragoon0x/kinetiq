"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultNightShiftAgents,
  defaultNightShiftEvents,
  NightShift,
  type NightShiftEvent,
} from "@/registry/ui/night-shift";

export const tweaks = defineTweaks({
  arcHeight: {
    kind: "range",
    label: "Arc height",
    default: 140,
    min: 80,
    max: 200,
    step: 10,
    unit: "px",
  },
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "raised",
    options: ["raised", "outline", "tinted"],
    names: { raised: "Raised", outline: "Outline", tinted: "Tinted" },
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

const START = defaultNightShiftEvents.find((e) => e.id === "ns-11");
const MIDNIGHT = Date.UTC(2026, 9, 17, 0, 0);

const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
};
const agentName = (id: string) =>
  defaultNightShiftAgents.find((a) => a.id === id)?.name ?? id;

type Said =
  | { kind: "scrub"; at: number; event: NightShiftEvent | null }
  | { kind: "open"; event: NightShiftEvent }
  | { kind: "ack" };

/**
 * Basinworks' morning: the inventory agents' night at the Harbor DC, opened
 * on the 02:14 failure that held two purchase orders.
 */
export function NightShiftDemo({
  chrome = true,
  // The digest is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [said, setSaid] = React.useState<Said>({
    kind: "scrub",
    at: START?.at ?? 0,
    event: START ?? null,
  });
  const [acked, setAcked] = React.useState(false);

  const surface = (
    <NightShift
      key={round}
      defaultValue={START?.at}
      onScrub={(at, event) => setSaid({ kind: "scrub", at, event })}
      onOpenEvent={(event) => setSaid({ kind: "open", event })}
      onAcknowledge={() => {
        setAcked(true);
        setSaid({ kind: "ack" });
      }}
      now={Date.UTC(2026, 9, 17, 7, 42)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setAcked(false);
            setSaid({
              kind: "scrub",
              at: START?.at ?? 0,
              event: START ?? null,
            });
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
        {said.kind === "ack" ? (
          <>
            <span className="text-signal">acknowledged 07:42</span> ·{" "}
            {defaultNightShiftEvents.length} events read
          </>
        ) : said.kind === "open" ? (
          <>
            <span className="text-signal">opened {clock(said.event.at)}</span> ·{" "}
            {said.event.title}
          </>
        ) : said.event ? (
          <>
            <span className="text-signal">
              {clock(said.at)} · {agentName(said.event.agent)}
            </span>{" "}
            · {said.event.outcome}
            {acked ? " · acknowledged" : ""}
          </>
        ) : (
          <>
            <span className="text-signal">{clock(said.at)}</span> ·{" "}
            {said.at < MIDNIGHT ? "dusk" : "dawn"}
            {acked ? " · acknowledged" : ""}
          </>
        )}
      </p>
    </div>
  );
}
