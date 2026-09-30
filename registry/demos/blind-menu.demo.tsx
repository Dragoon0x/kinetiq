"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BlindMenu, type BlindMenuItem } from "@/registry/ui/blind-menu";

export const tweaks = defineTweaks({
  slats: {
    kind: "range",
    label: "Slats",
    default: 5,
    min: 4,
    max: 8,
    step: 1,
  },
  stagger: {
    kind: "range",
    label: "Stagger",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "aluminium",
    options: ["wood", "aluminium", "fabric"],
    names: { wood: "Wood", aluminium: "Aluminium", fabric: "Fabric" },
  },
});

function Icon({ d }: { d: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
    >
      <path d={d} />
    </svg>
  );
}

const ITEMS: BlindMenuItem[] = [
  {
    id: "profile",
    label: "Profile",
    icon: (
      <Icon d="M8 8.2a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4ZM3 13.5c.6-2.3 2.6-3.6 5-3.6s4.4 1.3 5 3.6" />
    ),
    shortcut: "⌘P",
  },
  {
    id: "workspace",
    label: "Workspace settings",
    icon: (
      <Icon d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
    ),
    shortcut: "⌘,",
  },
  {
    id: "billing",
    label: "Billing",
    icon: <Icon d="M2 4.5h12v7H2zM2 7h12M4.5 9.5h2" />,
  },
  {
    id: "members",
    label: "Members",
    icon: (
      <Icon d="M6 7.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM2 13c.4-2 2-3.2 4-3.2s3.6 1.2 4 3.2M10.5 3.3a2.2 2.2 0 0 1 0 4.1M12 9.9c1 .5 1.8 1.6 2 3.1" />
    ),
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    icon: (
      <Icon d="M1.8 4.5h12.4v7H1.8zM4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M5 9.3h6" />
    ),
    shortcut: "?",
  },
  {
    id: "help",
    label: "Help and support",
    icon: (
      <Icon d="M8 14.2A6.2 6.2 0 1 0 8 1.8a6.2 6.2 0 0 0 0 12.4ZM6.3 6.2a1.8 1.8 0 0 1 3.5.6c0 1.2-1.8 1.5-1.8 2.6M8 11.3h.01" />
    ),
  },
  {
    id: "sign-out",
    label: "Sign out",
    tone: "danger",
    icon: <Icon d="M6 2.5H3.2v11H6M10.5 5.2 13.3 8l-2.8 2.8M13.2 8H6.5" />,
    shortcut: "⇧⌘Q",
  },
];

const ROWS = [
  { name: "Harbour Coffee", amount: "−4.20" },
  { name: "Fieldline payroll", amount: "+2,310.00" },
  { name: "Gaugeworks invoice", amount: "−186.40" },
  { name: "Coldbrook transfer", amount: "+500.00" },
  { name: "Fernworks seeds", amount: "−32.75" },
  { name: "Basinworks refund", amount: "+18.90" },
];

/**
 * The Waylight Pay dashboard's header: the account menu hangs from the chip
 * at the right, down over the page.
 */
export function BlindMenuDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(true);
  const [last, setLast] = React.useState<string | null>(null);
  const chosen = ITEMS.find((i) => i.id === last);
  // The page under the menu is long enough for the longest blind.
  const slats = values.slats ?? tweaks.slats.default;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex w-full flex-col rounded-3 border border-hairline bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-hairline py-1 pr-1 pl-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
            <svg
              aria-hidden
              width={16}
              height={16}
              viewBox="0 0 16 16"
              className="block shrink-0 text-cobalt-bright"
            >
              <path
                d="M2 12 5.5 4l2.5 5.5L10.5 4 14 12"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="truncate" title="Waylight Pay">
              Waylight
            </span>
          </span>
          <BlindMenu
            label="Mara Ellison"
            detail="Owner"
            items={ITEMS}
            open={open}
            onOpenChange={setOpen}
            onSelect={setLast}
            sound={sound}
            {...values}
          />
        </div>
        <div className="flex flex-col gap-2 px-3 pt-3 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-ink-3">Balance</span>
            <span className="font-mono text-lg text-foreground tabular-nums">
              12,480.35
            </span>
          </div>
          <ul role="list" className="flex flex-col">
            {ROWS.slice(0, Math.max(3, slats - 2)).map((r) => (
              <li
                key={r.name}
                className="flex h-8 items-center justify-between gap-3 border-t border-hairline text-xs"
              >
                <span className="truncate text-ink-2">{r.name}</span>
                <span className="shrink-0 font-mono text-ink-3 tabular-nums">
                  {r.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {open ? "menu open" : "menu closed"}
          </span>{" "}
          · {ITEMS.length} items
          {chosen ? ` · chose ${chosen.label}` : " · nothing chosen yet"}
        </p>
      ) : null}
    </div>
  );
}
