"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  BillingPanel,
  defaultBillingMeter,
  defaultBillingMethods,
  defaultBillingPlan,
  estimateBill,
  type BillingMethod,
} from "@/registry/ui/billing-panel";

export const tweaks = defineTweaks({
  stack: {
    kind: "choice",
    label: "Stack",
    default: "fan",
    options: ["fan", "wallet", "none"],
    names: { fan: "Fan", wallet: "Wallet", none: "Flat" },
  },
  estimate: {
    kind: "choice",
    label: "Estimate",
    default: "itemized",
    options: ["total", "itemized"],
    names: { total: "Total", itemized: "Itemized" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "comfortable"],
    names: { compact: "Compact", regular: "Regular", comfortable: "Roomy" },
  },
});

/** The card Add puts on file, once. */
const SPARE: BillingMethod = {
  id: "bwc-5208",
  issuer: "Basinworks Credit",
  kind: "Corporate card",
  last4: "5208",
  expires: "05/30",
  holder: "Fieldline Labs",
  network: "basin",
  tint: "var(--danger)",
};

const TAX = 0.08;
/** Day 18 of 30 at 182k events: the pace carries the cycle to 300k. */
const PACE = 300_000;

const usd = (v: number) =>
  `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/**
 * Fieldline Labs' billing: the Team plan on a Coldbrook Bank card, 182k
 * events used on day 18 of the cycle, and six months of invoices.
 */
export function BillingPanelDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [methods, setMethods] = React.useState(defaultBillingMethods);
  const [primary, setPrimary] = React.useState("cbk-4417");
  const [usage, setUsage] = React.useState(PACE);
  const [event, setEvent] = React.useState<string | null>(null);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const running = timers.current;
    return () => {
      for (const t of running) window.clearTimeout(t);
      running.clear();
    };
  }, []);

  const card = (id: string) => methods.find((m) => m.id === id);
  const short = (m?: BillingMethod) =>
    m ? `${m.issuer.toLowerCase()} ···· ${m.last4}` : "no card";
  const total = estimateBill(
    defaultBillingPlan,
    defaultBillingMeter,
    TAX,
    usage,
  ).total;

  const panel = (
    <BillingPanel
      methods={methods}
      primaryMethod={primary}
      onPrimaryMethodChange={(id) => {
        setPrimary(id);
        setEvent(`default is now ${short(card(id))}`);
      }}
      onAddMethod={
        methods.some((m) => m.id === SPARE.id)
          ? undefined
          : () => {
              setMethods((list) => [...list, SPARE]);
              setEvent(`added ${short(SPARE)}`);
            }
      }
      onRemoveMethod={(id) => {
        const gone = card(id);
        setMethods((list) => list.filter((m) => m.id !== id));
        setEvent(`removed ${short(gone)}`);
      }}
      taxRate={TAX}
      usage={usage}
      onUsageChange={(next) => {
        setUsage(next);
        setEvent(null);
      }}
      onDownload={(invoice) =>
        new Promise<void>((resolve) => {
          const id = window.setTimeout(() => {
            timers.current.delete(id);
            setEvent(`downloaded ${invoice.number.toLowerCase()}`);
            resolve();
          }, 900);
          timers.current.add(id);
        })
      }
      onChangePlan={() => setEvent("plans open in a new view")}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{panel}</div>;

  return (
    <div className="flex w-full flex-col gap-4">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {event ?? `default ${short(card(primary))}`}
        </span>{" "}
        · next bill {usd(total)} · due oct 1
      </p>
    </div>
  );
}
