"use client";

import * as React from "react";

import { BellPlus, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultStackNotifications,
  defaultStackNow,
  SenderStacks,
  type StackNotification,
  type StackStatus,
} from "@/registry/ui/sender-stacks";

export const tweaks = defineTweaks({
  stackStyle: {
    kind: "choice",
    label: "Stacks",
    default: "fan",
    options: ["fan", "accordion"],
    names: { fan: "Fan", accordion: "Accordion" },
  },
  avatarShape: {
    kind: "choice",
    label: "Avatars",
    default: "circle",
    options: ["circle", "rounded", "square"],
    names: { circle: "Circle", rounded: "Rounded", square: "Square" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/** What the host pushes in, one at a time, each onto its own sender's stack. */
const ARRIVALS: Omit<StackNotification, "id" | "at">[] = [
  {
    sender: "coldbrook-alerts",
    title: "Pump 3 pressure low again",
    body: "Riverside station dropped to 1.5 bar.",
  },
  {
    sender: "mara",
    title: "Replied on WO-1183",
    body: "Thursday works. Booking the crew now.",
  },
  {
    sender: "tomas",
    title: "Approved WO-1192",
    body: "Cable joint repair closed out.",
  },
  {
    sender: "basinworks",
    title: "Lot 15 trench opened",
    body: "Backfill expected Wednesday.",
  },
  {
    sender: "kenji",
    title: "Uploaded the survey report",
    body: "Valve chamber, 9 pages.",
  },
  {
    sender: "billing",
    title: "Payment received",
    body: "September invoice settled.",
  },
];

/**
 * A Fieldline inbox on a Monday morning: Coldbrook Alerts stacked four deep,
 * three notes from Mara Lind, and a new notification waiting on the button.
 */
export function SenderStacksDemo({
  chrome = true,
  // The inbox is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [items, setItems] = React.useState<StackNotification[]>(
    defaultStackNotifications,
  );
  const [status, setStatus] = React.useState<StackStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [arrived, setArrived] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <SenderStacks height={540} {...values} />
      </div>
    );
  }

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const arrive = () => {
    const next = ARRIVALS[arrived % ARRIVALS.length];
    if (!next) return;
    const k = arrived + 1;
    setArrived(k);
    setItems((list) => [
      { ...next, id: `new-${k}`, at: defaultStackNow + k * 1000 },
      ...list,
    ]);
  };

  const unread = items.filter((n) => !n.read).length;
  const sendersShown = new Set(items.map((n) => n.sender)).size;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <SenderStacks
        height={560}
        notifications={items}
        onChange={setItems}
        onDismiss={(gone) => setDismissed((n) => n + gone.length)}
        status={status}
        onRetry={reload}
        now={defaultStackNow + arrived * 1000}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {unread} unread · {items.length} notifications
          </span>{" "}
          · {sendersShown} {sendersShown === 1 ? "sender" : "senders"}
          {dismissed > 0 ? ` · dismissed ${dismissed}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={arrive}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <BellPlus aria-hidden className="size-3.5" />
            New notification
          </button>
          <button
            type="button"
            onClick={() => setFailNext(true)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-hairline-strong aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              setItems(defaultStackNotifications);
              setArrived(0);
              setDismissed(0);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
