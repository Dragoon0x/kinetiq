"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultShelfOutbox,
  defaultShelfPinned,
  OfflineShelf,
  type OutboxItem,
  type ShelfStatus,
} from "@/registry/ui/offline-shelf";

export const tweaks = defineTweaks({
  shelfPosition: {
    kind: "choice",
    label: "Shelf",
    default: "foot",
    options: ["foot", "side"],
    names: { foot: "Foot", side: "Side" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "success", "ink"],
    names: { cobalt: "Cobalt", success: "Green", ink: "Ink" },
  },
});

const LOAD_MS = 900;

/**
 * A Fieldline Field crew on the Coldbrook run, out of signal: the shelf holds
 * five job sheets and two maps, two notes wait in the outbox, and bringing the
 * connection back sends them — one of them into a conflict with Mara's.
 */
export function OfflineShelfDemo({
  chrome = true,
  // The shelf is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [online, setOnline] = React.useState(false);
  const [status, setStatus] = React.useState<ShelfStatus>("ready");
  const [outbox, setOutbox] = React.useState<OutboxItem[]>(defaultShelfOutbox);
  const [pinned, setPinned] = React.useState<string[]>(defaultShelfPinned);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  // A reload out of signal fails; Retry once the connection is back succeeds.
  const reload = (willBeOnline: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    setNote(null);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(willBeOnline ? "ready" : "error");
    }, LOAD_MS);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <OfflineShelf online={false} height={540} {...values} />
      </div>
    );
  }

  const surface = (
    <OfflineShelf
      key={round}
      online={online}
      status={status}
      onRetry={() => reload(online)}
      outbox={outbox}
      onOutboxChange={setOutbox}
      onSync={(item) => setNote(`sent note on ${item.itemId.toUpperCase()}`)}
      onResolveConflict={(item, choice) =>
        setNote(
          `${choice === "mine" ? "kept mine" : "took theirs"} on ${item.itemId.toUpperCase()}`,
        )
      }
      pinned={pinned}
      onPinChange={(next, change) => {
        setPinned(next);
        setNote(
          `${change.id.toUpperCase()} ${change.pinned ? "pinned" : "unpinned"}`,
        );
      }}
      onOpenItem={(item) => setNote(`opened ${item.ref}`)}
      height={540}
      {...values}
    />
  );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-cobalt-bright/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const conflicts = outbox.filter((o) => o.conflict).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={!online}
          onClick={() => {
            setOnline((o) => !o);
            setNote(null);
          }}
          className={button}
        >
          {online ? "Go offline" : "Go online"}
        </button>
        <button
          type="button"
          aria-pressed={status !== "ready"}
          onClick={() => reload(online)}
          className={button}
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            setOnline(false);
            setStatus("ready");
            setOutbox(defaultShelfOutbox);
            setPinned(defaultShelfPinned);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {note ??
            (status === "loading"
              ? "loading"
              : status === "error"
                ? "load failed"
                : online
                  ? "online"
                  : "offline")}
        </span>{" "}
        · {outbox.length} in the outbox
        {conflicts > 0 ? ` · ${conflicts} conflict` : ""} · {pinned.length} on
        the shelf
      </p>
    </div>
  );
}
