"use client";

import * as React from "react";

import {
  Building2,
  CreditCard,
  Mail,
  ReceiptText,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { StepUpCheck } from "@/registry/ui/step-up-check";

export const tweaks = defineTweaks({
  frostAmount: {
    kind: "range",
    label: "Frost",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  lockStyle: {
    kind: "choice",
    label: "Lock",
    default: "padlock",
    options: ["padlock", "keyhole", "shield"],
    names: { padlock: "Padlock", keyhole: "Keyhole", shield: "Shield" },
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

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

type Row = {
  id: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  action: string;
  danger?: boolean;
};

const ROWS: Row[] = [
  {
    id: "payout account",
    icon: Building2,
    label: "Payout account",
    value: "Coldbrook Bank ••42 · weekly",
    action: "Change",
  },
  {
    id: "statement email",
    icon: Mail,
    label: "Statement email",
    value: "ap@basinworks.io",
    action: "Edit",
  },
  {
    id: "tax id",
    icon: ReceiptText,
    label: "Tax ID",
    value: "GB 284 1193 07",
    action: "Edit",
  },
  {
    id: "card on file",
    icon: CreditCard,
    label: "Card on file",
    value: "Card ending 7710 · expires 08/28",
    action: "Replace",
  },
  {
    id: "close account",
    icon: TriangleAlert,
    label: "Close account",
    value: "Ends billing and removes workspace data",
    action: "Close",
    danger: true,
  },
];

/** The Basinworks billing settings the check stands in front of. */
function BillingPanel({ onOpen }: { onOpen: (what: string) => void }) {
  return (
    <div className="flex flex-col">
      <p className="px-4 pt-3.5 pb-1 text-[13px] leading-5 text-ink-2">
        Next payout{" "}
        <span className="font-medium text-foreground tabular-nums">
          €4,812.40
        </span>{" "}
        on Friday, from 38 settled orders.
      </p>
      <ul role="list" className="flex flex-col divide-y divide-hairline px-4">
        {ROWS.map((row) => (
          <li key={row.id} className="flex items-center gap-3 py-3">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2",
                row.danger ? "text-danger" : "text-ink-2",
              )}
            >
              <row.icon aria-hidden className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  "text-[13px] leading-5 font-medium",
                  row.danger ? "text-danger" : "text-foreground",
                )}
              >
                {row.label}
              </span>
              <span
                className="truncate text-[12px] leading-4 text-ink-3"
                title={row.value}
              >
                {row.value}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onOpen(row.id)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-2 border border-input px-3 text-[12px] font-medium transition-colors hover:bg-surface-2",
                row.danger ? "text-danger" : "text-foreground",
                FOCUS,
              )}
            >
              {row.action}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Basinworks billing and payouts, locked behind a step-up check. A passkey
 * is accepted after a short wait; the first password is refused so the
 * counted tries show, and any later one passes. The elevated session lasts
 * 45 seconds here, so its end is seen.
 */
export function StepUpCheckDemo({
  chrome = true,
  // The check is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [note, setNote] = React.useState("locked · 5 tries left");
  const tries = React.useRef(0);

  const reset = () => {
    tries.current = 0;
    setNote("locked · 5 tries left");
    setRound((r) => r + 1);
  };

  const surface = (
    <StepUpCheck
      key={round}
      heading="Billing and payouts"
      action="change where payouts go"
      sessionDuration={45_000}
      warnAt={15_000}
      onVerify={async ({ method }) => {
        if (method === "passkey") {
          await wait(900);
          setNote("elevated by passkey · 45 s session");
          return true;
        }
        await wait(450);
        tries.current += 1;
        if (tries.current === 1) return false;
        setNote("elevated by password · 45 s session");
        return true;
      }}
      onFail={({ method, remaining }) =>
        setNote(
          `${method} refused · ${remaining} ${remaining === 1 ? "try" : "tries"} left`,
        )
      }
      onExpire={() => setNote("session expired · locked again")}
      onLock={() => setNote("locked by you")}
      onCancel={() => setNote("not now · still locked")}
      {...values}
    >
      <BillingPanel onOpen={(what) => setNote(`opened ${what} · elevated`)} />
    </StepUpCheck>
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
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
        <span className="text-signal">{note}</span> · Basinworks billing
      </p>
    </div>
  );
}
