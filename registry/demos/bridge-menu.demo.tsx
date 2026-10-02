"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { BridgeMenu, defaultBridgeMenuItems } from "@/registry/ui/bridge-menu";

export const tweaks = defineTweaks({
  travel: {
    kind: "range",
    label: "Travel",
    default: 16,
    min: 0,
    max: 48,
    step: 4,
    unit: "px",
  },
  bridge: {
    kind: "choice",
    label: "Bridge",
    default: "on",
    options: ["off", "on", "show"],
    names: { off: "Off", on: "On", show: "Visible" },
  },
  delay: {
    kind: "range",
    label: "Delay",
    default: 120,
    min: 0,
    max: 400,
    step: 20,
    unit: "ms",
  },
});

const linkCount = (id: string | null) => {
  const item = defaultBridgeMenuItems.find((i) => i.id === id);
  if (!item) return 0;
  const links = (item.sections ?? []).reduce((n, s) => n + s.links.length, 0);
  return links + (item.feature ? 1 : 0);
};

/**
 * The Fieldline site's header over its hero: two big menus, a small one and
 * a plain link, with the panel sliding between them.
 */
export function BridgeMenuDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [chose, setChose] = React.useState<string | null>(null);
  const openItem = defaultBridgeMenuItems.find((i) => i.id === open);
  const n = linkCount(open);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="@container/fieldline-site w-full overflow-clip rounded-3 border border-hairline bg-card">
        <BridgeMenu
          label="Fieldline"
          value={open}
          onValueChange={setOpen}
          onSelect={(link, _item, event) => {
            event.preventDefault();
            setChose(link.label);
          }}
          start={
            <span className="mr-1 flex items-center gap-2 pl-1 @max-[26rem]/fieldline-site:hidden">
              <span
                aria-hidden
                className="flex size-6 items-center justify-center rounded-2 bg-primary font-mono text-[11px] font-semibold text-primary-foreground"
              >
                F
              </span>
              <span className="text-sm font-semibold text-foreground">
                Fieldline
              </span>
            </span>
          }
          end={
            <span className="hidden items-center gap-2 pr-1 @min-[40rem]/fieldline-site:flex">
              <span className="text-[13px] text-ink-2">Sign in</span>
              <span className="inline-flex h-7 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground">
                Start free
              </span>
            </span>
          }
          sound={sound}
          {...values}
        >
          <div
            className={cn(
              "flex flex-col justify-center gap-2 overflow-clip border-t border-hairline bg-[radial-gradient(120%_90%_at_85%_0%,var(--accent-wash),transparent_60%)] px-5",
              chrome ? "h-60" : "h-[180px]",
            )}
          >
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Fieldline for finance teams
            </p>
            <p className="max-w-md text-xl leading-7 font-semibold text-balance text-foreground @min-[40rem]/fieldline-site:text-2xl">
              Books that close themselves.
            </p>
            <p className="max-w-md text-[13px] leading-5 text-ink-2 @max-[26rem]/fieldline-site:hidden">
              Ledger, payouts and cards on one platform, reconciled the moment
              money moves.
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-3 tabular-nums">
              <span>9 → 1 day close</span>
              <span>40 currencies</span>
              <span className="@max-[26rem]/fieldline-site:hidden">
                2,400 teams
              </span>
            </div>
          </div>
        </BridgeMenu>
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {openItem ? (
            <>
              <span className="text-signal">{openItem.label} open</span> · {n}{" "}
              {n === 1 ? "link" : "links"} · move across the bar
            </>
          ) : chose ? (
            <>
              <span className="text-signal">chose {chose}</span> · menu closed
            </>
          ) : (
            <>
              <span className="text-signal">menu closed</span> · hover a trigger
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
