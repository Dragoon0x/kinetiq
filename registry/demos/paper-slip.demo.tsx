"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PaperSlip, type PaperSlipNotice } from "@/registry/ui/paper-slip";

export const tweaks = defineTweaks({
  curl: {
    kind: "range",
    label: "Curl",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  paper: {
    kind: "choice",
    label: "Paper",
    default: "thermal",
    options: ["white", "cream", "thermal"],
    names: { white: "White", cream: "Cream", thermal: "Thermal" },
  },
  max: {
    kind: "range",
    label: "Max",
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
});

const FIRST: PaperSlipNotice[] = [
  {
    id: "slip-a",
    title: "Card payment",
    body: "Table 6 paid 38.40 by card. The receipt went to the diner.",
    tone: "success",
  },
  {
    id: "slip-b",
    title: "Refund issued",
    body: "4.20 back to the card for an oat flat white.",
    tone: "info",
  },
  {
    id: "slip-c",
    title: "Paper running low",
    body: "About three metres left on the roll. Swap it before lunch.",
    tone: "warn",
  },
];

const MORE: Omit<PaperSlipNotice, "id">[] = [
  {
    title: "Card declined",
    body: "Table 2 tried twice. Ask for another way to pay.",
    tone: "danger",
  },
  {
    title: "Tip added",
    body: "Table 9 left 5.00 on the terminal.",
    tone: "success",
  },
  {
    title: "Order ready",
    body: "Two soups and a rye toastie for the window seat.",
    tone: "info",
  },
  {
    title: "Shift report",
    body: "Morning takings are counted and ready for the close.",
    tone: "info",
  },
];

/**
 * Till 2 at a café that takes Waylight Pay: every payment event prints a slip
 * at the counter, and staff tear them off as they deal with them.
 */
export function PaperSlipDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [notices, setNotices] = React.useState(FIRST);
  const [sent, setSent] = React.useState(0);
  const [last, setLast] = React.useState<{
    what: "printed" | "torn off";
    title: string;
  } | null>(null);
  const standing = Math.min(notices.length, values.max ?? 4);

  const print = () => {
    const next = MORE[sent % MORE.length];
    if (!next) return;
    setNotices((list) => [...list, { ...next, id: `slip-${sent}` }]);
    setSent((n) => n + 1);
    setLast({ what: "printed", title: next.title });
  };

  const dismiss = (id: string) => {
    const gone = notices.find((n) => n.id === id);
    setNotices((list) => list.filter((n) => n.id !== id));
    if (gone) setLast({ what: "torn off", title: gone.title });
  };

  return (
    <div className="flex w-full max-w-96 flex-col gap-3">
      <PaperSlip
        label="Till 2"
        notices={notices}
        onDismiss={dismiss}
        sound={sound}
        {...values}
        className="self-center"
      />
      {chrome ? (
        <>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={print}
              className="inline-flex h-8 items-center justify-center rounded-2 border border-hairline bg-card px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Print one
            </button>
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {last ? (
              <>
                <span className="text-signal">{last.what}</span> · {last.title}{" "}
                · {standing} on paper
              </>
            ) : (
              <>
                <span className="text-signal">{standing} on paper</span> · last:{" "}
                {notices[notices.length - 1]?.title ?? "none"}
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
