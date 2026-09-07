"use client";

import * as React from "react";

import { TabBar, type TabBarTab } from "@/registry/ui/tab-bar";

const SCREENS: Record<string, { title: string; note: string }> = {
  home: {
    title: "Coldbrook",
    note: "Balance holds after the weekend transfer.",
  },
  search: { title: "Search", note: "Look up a payee, a card or a statement." },
  inbox: { title: "Inbox", note: "Statements and card notices land here." },
  wallet: { title: "Wallet", note: "Two cards, one paused since March." },
  me: { title: "Account", note: "Sign-in, limits and paper statements." },
};

const ROWS = [
  { label: "Fieldline deposit", amount: "+ 1,240.00" },
  { label: "Card · ending 4417", amount: "− 86.20" },
  { label: "Basinworks rent", amount: "− 950.00" },
];

export function TabBarDemo() {
  const [tab, setTab] = React.useState("home");
  const [unread, setUnread] = React.useState(3);

  const tabs: TabBarTab[] = React.useMemo(
    () => [
      { id: "home", label: "Home", icon: "home" },
      { id: "search", label: "Search", icon: "search" },
      { id: "inbox", label: "Inbox", icon: "inbox", badge: unread },
      { id: "wallet", label: "Wallet", icon: "wallet" },
      { id: "me", label: "Me", icon: "me" },
    ],
    [unread],
  );

  const screen = SCREENS[tab] ?? SCREENS.home;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="mx-auto flex h-[300px] w-full max-w-[300px] flex-col rounded-4 border border-hairline bg-surface-0 p-2">
        <div className="min-h-0 flex-1 overflow-y-auto rounded-3 bg-surface-2 p-3">
          <p className="text-label text-ink-3">{screen?.title}</p>
          <p className="mt-2 font-mono text-xl font-semibold text-foreground tabular-nums">
            8,412.60
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-2">{screen?.note}</p>
          <ul className="mt-3 flex flex-col gap-2 border-t border-hairline pt-3">
            {ROWS.map((row) => (
              <li key={row.label} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-ink-2">
                  {row.label}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                  {row.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-2">
          <TabBar
            tabs={tabs}
            value={tab}
            onValueChange={setTab}
            aria-label="Coldbrook"
          />
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setUnread((count) => count + 1)}
          className="flex h-8 cursor-pointer items-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Deliver a statement
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Tab <span className="text-signal">{tab}</span> · inbox{" "}
        <span className="text-signal tabular-nums">{unread}</span>
      </p>
    </div>
  );
}
