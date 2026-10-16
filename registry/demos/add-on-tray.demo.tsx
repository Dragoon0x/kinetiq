"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  AddOnTray,
  defaultAddOnBase,
  defaultAddOns,
} from "@/registry/ui/add-on-tray";

export const tweaks = defineTweaks({
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "outline",
    options: ["outline", "tile", "row"],
    names: { outline: "Outline", tile: "Tile", row: "Row" },
  },
  trayPosition: {
    kind: "choice",
    label: "Tray",
    default: "bottom",
    options: ["bottom", "side", "float"],
    names: { bottom: "Bottom", side: "Side", float: "Float" },
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

type Note = { lead: string; rest: string };

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const totalOf = (ids: string[]) =>
  defaultAddOnBase.price +
  ids.reduce(
    (t, id) => t + (defaultAddOns.find((a) => a.id === id)?.price ?? 0),
    0,
  );
const nameOf = (id: string) =>
  (defaultAddOns.find((a) => a.id === id)?.name ?? id).toLowerCase();

/** Prices come from the billing service a moment after the page opens. */
function usePricesArriving(round: number) {
  const [loading, setLoading] = React.useState(true);
  const [seen, setSeen] = React.useState(round);
  if (seen !== round) {
    setSeen(round);
    setLoading(true);
  }
  React.useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 1100);
    return () => window.clearTimeout(t);
  }, [round]);
  return loading;
}

/**
 * A Fieldline Team workspace adding extras before its renewal: storage is
 * already on, EU residency and US backups cannot run together, and single
 * sign-on needs the Business plan.
 */
export function AddOnTrayDemo({
  chrome = true,
  // The picker is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const loading = usePricesArriving(round);
  const [note, setNote] = React.useState<Note | null>(null);
  const [ids, setIds] = React.useState<string[]>(["storage"]);

  if (!chrome) {
    return (
      <div className="w-full">
        <AddOnTray className="h-[548px]" pricesLoading={loading} {...values} />
      </div>
    );
  }

  const line: Note = loading
    ? { lead: "prices loading", rest: "fieldline team" }
    : (note ?? {
        lead: `${ids.length} ${ids.length === 1 ? "add-on" : "add-ons"}`,
        rest: `$${totalOf(ids)}/mo`,
      });

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <AddOnTray
        key={round}
        pricesLoading={loading}
        onValueChange={setIds}
        onToggle={(id, on) => {
          setNote({
            lead: `${on ? "added" : "removed"} ${nameOf(id)}`,
            rest: `$${totalOf(
              on ? [...ids, id] : ids.filter((x) => x !== id),
            )}/mo`,
          });
        }}
        onBlocked={(id, reason) =>
          setNote({ lead: `can't add ${nameOf(id)}`, rest: reason })
        }
        onCheckout={({ total }) =>
          setNote({ lead: "checkout", rest: `$${total}/mo` })
        }
        {...values}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setNote(null);
            setIds(["storage"]);
            setRound((n) => n + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
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
        <span className="text-signal">{line.lead}</span> · {line.rest}
      </p>
    </div>
  );
}
