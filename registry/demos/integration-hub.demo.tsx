"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultIntegrationConnected,
  defaultIntegrations,
  IntegrationHub,
} from "@/registry/ui/integration-hub";

export const tweaks = defineTweaks({
  grid: {
    kind: "choice",
    label: "Grid",
    default: "cards",
    options: ["cards", "compact", "list"],
    names: { cards: "Cards", compact: "Compact", list: "List" },
  },
  sheet: {
    kind: "choice",
    label: "Sheet",
    default: "side",
    options: ["side", "bottom", "center"],
    names: { side: "Side", bottom: "Bottom", center: "Centre" },
  },
  status: {
    kind: "choice",
    label: "Status",
    default: "pill",
    options: ["dot", "pill", "bar"],
    names: { dot: "Dot", pill: "Pill", bar: "Stripe" },
  },
});

const NAMES: Record<string, string> = Object.fromEntries(
  defaultIntegrations.map((it) => [it.id, it.name.toLowerCase()]),
);
/** Connected, but its token has expired until it is reconnected. */
const BROKEN = "gauge-metrics";

/**
 * Fieldline's integrations: twelve tools from Basinworks, Waylight,
 * Gaugeworks, Fernworks and Coldbrook, three of them connected. Connecting
 * takes 800 ms, disconnecting 500 ms and a sync 1.1 s.
 */
export function IntegrationHubDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [connected, setConnected] = React.useState(defaultIntegrationConnected);
  const [fixed, setFixed] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [shown, setShown] = React.useState(defaultIntegrations.length);
  const [event, setEvent] = React.useState<string | null>(null);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const running = timers.current;
    return () => {
      for (const t of running) window.clearTimeout(t);
      running.clear();
    };
  }, []);

  const wait = (ms: number, then: () => void) =>
    new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        timers.current.delete(id);
        then();
        resolve();
      }, ms);
      timers.current.add(id);
    });

  const hub = (
    <IntegrationHub
      connected={connected}
      onConnectedChange={setConnected}
      onConnect={(id, scopes) =>
        wait(800, () => {
          if (id === BROKEN) setFixed(true);
          setEvent(
            `${NAMES[id] ?? id} ${connected.includes(id) ? "reconnected" : "connected"} · ${scopes.length} ${scopes.length === 1 ? "permission" : "permissions"}`,
          );
        })
      }
      onDisconnect={(id) =>
        wait(500, () => setEvent(`${NAMES[id] ?? id} disconnected`))
      }
      onSync={(id) => wait(1100, () => setEvent(`${NAMES[id] ?? id} synced`))}
      query={query}
      onQueryChange={(q) => {
        setQuery(q);
        const needle = q.trim().toLowerCase();
        setShown(
          defaultIntegrations.filter((it) =>
            [it.name, it.maker ?? "", it.category, it.description].some((s) =>
              s.toLowerCase().includes(needle),
            ),
          ).length,
        );
        setEvent(null);
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{hub}</div>;

  const broken = connected.includes(BROKEN) && !fixed;

  return (
    <div className="flex w-full flex-col gap-4">
      {hub}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {event ? (
          <span className="text-signal">{event}</span>
        ) : query.trim() ? (
          <>
            <span className="text-signal">
              {shown} match “{query.trim().toLowerCase()}”
            </span>{" "}
            · escape clears
          </>
        ) : (
          <>
            <span className="text-signal">
              {connected.length} of {defaultIntegrations.length} connected
            </span>
            {broken ? ` · ${NAMES[BROKEN]} needs attention` : " · no errors"}
          </>
        )}
      </p>
    </div>
  );
}
