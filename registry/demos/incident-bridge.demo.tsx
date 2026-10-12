"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultBridgeIncident,
  defaultBridgeNow,
  defaultBridgePeople,
  IncidentBridge,
  type BridgeIncident,
} from "@/registry/ui/incident-bridge";

export const tweaks = defineTweaks({
  severityPalette: {
    kind: "choice",
    label: "Palette",
    default: "heat",
    options: ["heat", "cool", "ink"],
    names: { heat: "Heat", cool: "Cool", ink: "Ink" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  timelineSide: {
    kind: "choice",
    label: "Timeline",
    default: "left",
    options: ["left", "right"],
    names: { left: "Left", right: "Right" },
  },
});

const MIN = 60_000;
const LAST = {
  id: "INC-2409",
  resolvedAt: defaultBridgeNow - 2 * 24 * 60 * MIN,
};

/**
 * Gaugeworks Pay's checkout latency, forty-two minutes in: the ledger's
 * connection pool ran dry after a deploy and the rollback is draining it.
 */
export function IncidentBridgeDemo({
  chrome = true,
  // The bridge is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [incident, setIncident] = React.useState<BridgeIncident | null>(
    defaultBridgeIncident,
  );
  const [kept, setKept] = React.useState<BridgeIncident | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const surface = (
    <IncidentBridge
      key={round}
      incident={incident}
      onIncidentChange={setIncident}
      onSeverityChange={(sev, prev) =>
        setNote(`${sev < prev ? "raised" : "lowered"} to sev ${sev}`)
      }
      onPostUpdate={() => setNote("posted update")}
      onResolve={(inc) =>
        setNote(
          `resolved after ${Math.round((defaultBridgeNow - inc.openedAt) / MIN)} min`,
        )
      }
      onAssignRole={(role, id) =>
        setNote(
          `${defaultBridgePeople.find((p) => p.id === id)?.name.split(" ")[0] ?? id} is ${role}`,
        )
      }
      onRefresh={() => {
        setIncident((inc) =>
          inc ? { ...inc, updatedAt: defaultBridgeNow - 20_000 } : inc,
        );
        setNote("refreshed");
      }}
      lastIncident={LAST}
      now={defaultBridgeNow}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const stale = !!incident && defaultBridgeNow - incident.updatedAt > 5 * MIN;
  const commander = incident?.roles.commander
    ? (defaultBridgePeople
        .find((p) => p.id === incident.roles.commander)
        ?.name.split(" ")[0] ?? "")
    : "none";
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
          aria-pressed={stale}
          aria-disabled={!incident || undefined}
          onClick={() => {
            if (!incident) return;
            setIncident((inc) =>
              inc
                ? {
                    ...inc,
                    updatedAt: stale
                      ? defaultBridgeNow - 20_000
                      : defaultBridgeNow - 7 * MIN,
                  }
                : inc,
            );
            setNote(null);
          }}
          className={cn(button, "aria-disabled:opacity-50")}
        >
          Make data stale
        </button>
        <button
          type="button"
          aria-pressed={!incident}
          onClick={() => {
            if (incident) {
              setKept(incident);
              setIncident(null);
            } else {
              setIncident(kept ?? defaultBridgeIncident);
            }
            setNote(null);
          }}
          className={button}
        >
          All clear
        </button>
        <button
          type="button"
          onClick={() => {
            setIncident(defaultBridgeIncident);
            setKept(null);
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
        {!incident ? (
          <span className="text-signal">all clear</span>
        ) : (
          <>
            <span className="text-signal">
              {note ??
                (stale
                  ? `data ${Math.round((defaultBridgeNow - incident.updatedAt) / MIN)} min old`
                  : `sev ${incident.severity} · ${incident.state}`)}
            </span>{" "}
            · {incident.updates.length} updates · commander {commander}
          </>
        )}
      </p>
    </div>
  );
}
