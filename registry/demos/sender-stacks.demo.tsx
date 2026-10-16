"use client";

import * as React from "react";

import { Bell, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSenderItems,
  defaultSenderSources,
  SenderStacks,
  type SenderStacksStatus,
} from "@/registry/ui/sender-stacks";

export const tweaks = defineTweaks({
  stackDepth: {
    kind: "range",
    label: "Depth",
    default: 2,
    min: 0,
    max: 4,
    step: 1,
  },
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "raised",
    options: ["raised", "flat", "outline"],
    names: { raised: "Raised", flat: "Flat", outline: "Outline" },
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

const nameOf = (id: string) =>
  (defaultSenderSources.find((s) => s.id === id)?.name ?? id).toLowerCase();
const TOTAL = defaultSenderItems.filter((i) => !i.read).length;

/**
 * A Coldbrook workspace's notification panel on a Monday morning: deploys,
 * review requests, mentions and billing, each gathered into its own stack.
 */
export function SenderStacksDemo({
  chrome = true,
  // The panel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [unread, setUnread] = React.useState(TOTAL);
  const [status, setStatus] = React.useState<SenderStacksStatus>("ready");
  const [empty, setEmpty] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const panel = (
    <SenderStacks
      key={round}
      items={empty ? [] : defaultSenderItems}
      status={status}
      onOpen={(id) => {
        const n = defaultSenderItems.filter((i) => i.source === id).length;
        setNote(`opened ${nameOf(id)} · ${n} ${n === 1 ? "card" : "cards"}`);
      }}
      onDismiss={(id, ids) => {
        setUnread((u) => Math.max(0, u - ids.length));
        setNote(`dismissed ${nameOf(id)} · undo for 5 s`);
      }}
      onRestore={(id) => setNote(`restored ${nameOf(id)}`)}
      onMarkRead={(id, ids) => {
        setUnread((u) => Math.max(0, u - ids.length));
        setNote(`marked ${nameOf(id)} read`);
      }}
      onMarkAllRead={() => {
        setUnread(0);
        setNote("everything read");
      }}
      onItemOpen={(item) => setNote(`opened “${item.title.toLowerCase()}”`)}
      className="mx-auto"
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{panel}</div>;

  const reset = () => {
    window.clearTimeout(timer.current);
    setUnread(TOTAL);
    setStatus("ready");
    setEmpty(false);
    setNote(null);
    setRound((r) => r + 1);
  };
  const reload = () => {
    setStatus("loading");
    setNote("loading");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setStatus("ready");
      setNote(null);
    }, 1400);
  };
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="mx-auto flex h-11 w-full max-w-[25rem] items-center justify-between gap-3 rounded-3 border border-hairline bg-card px-3">
          <span className="truncate text-[13px] font-semibold">Coldbrook</span>
          <span className="relative inline-flex size-8 items-center justify-center rounded-2 text-ink-2">
            <Bell aria-hidden className="size-4" />
            {unread > 0 && !empty ? (
              <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-cobalt-bright px-1 font-mono text-[10px] text-white">
                {unread}
              </span>
            ) : null}
            <span className="sr-only">{`${unread} unread`}</span>
          </span>
        </div>
        {panel}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <button type="button" onClick={reload} className={button}>
          Reload
        </button>
        <button
          type="button"
          aria-pressed={empty}
          onClick={() => {
            setEmpty((e) => !e);
            setNote(null);
          }}
          className={button}
        >
          {empty ? "Fill" : "Empty"}
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <span className="text-signal">{note}</span>
        ) : empty ? (
          <>
            <span className="text-signal">all caught up</span> · nothing new
          </>
        ) : (
          <>
            <span className="text-signal">{unread} unread</span> · gathered by
            sender
          </>
        )}
      </p>
    </div>
  );
}
