"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultEditDraft,
  defaultEditFlags,
  EditBeforeSend,
} from "@/registry/ui/edit-before-send";

export const tweaks = defineTweaks({
  trackStyle: {
    kind: "choice",
    label: "Changes",
    default: "inline",
    options: ["inline", "clean", "bars"],
    names: { inline: "Inline", clean: "Clean", bars: "Bars" },
  },
  envelope: {
    kind: "choice",
    label: "Envelope",
    default: "plain",
    options: ["plain", "airmail", "window"],
    names: { plain: "Plain", airmail: "Airmail", window: "Window" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const SEND_MS = 900;
/** The reviewer has already fixed the price; the payment terms still hold the send. */
const STARTING_TEXT = defaultEditDraft.body.replace(
  "$14.20 per unit",
  "$13.80 per unit",
);

/**
 * Fernworks' procurement agent has drafted a supplier confirmation and held
 * it for review because it quotes a price and payment terms. The relay
 * answers after a short beat, or refuses when "Fail send" is on.
 */
export function EditBeforeSendDemo({
  chrome = true,
  // The frame is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [text, setText] = React.useState(STARTING_TEXT);
  const [changes, setChanges] = React.useState(1);
  const [failing, setFailing] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const surface = (
    <EditBeforeSend
      key={round}
      value={text}
      onValueChange={setText}
      onEdit={(_, list) => {
        setChanges(list.length);
        setNote(null);
      }}
      onApprove={() =>
        new Promise<void>((resolve, reject) => {
          setNote("sending");
          timers.current.push(
            window.setTimeout(() => {
              if (failing) {
                setNote("send failed · retry");
                reject(
                  new Error(
                    "The mail relay refused the 1.2 MB attachment from an unverified sender.",
                  ),
                );
              } else {
                setNote(
                  `sent · ${changes} ${changes === 1 ? "change" : "changes"} kept`,
                );
                resolve();
              }
            }, SEND_MS),
          );
        })
      }
      onRequestChanges={(t) =>
        setNote(t ? "returned with a note" : "returned to the agent")
      }
      onDiscard={() => setNote("discarded")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const flagsLive = defaultEditFlags.filter((f) => text.includes(f.match));
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failing}
          onClick={() => setFailing((v) => !v)}
          className={cn(
            button,
            failing && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail send
        </button>
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            setText(STARTING_TEXT);
            setChanges(1);
            setFailing(false);
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
            `held · ${flagsLive.length} ${flagsLive.length === 1 ? "flag" : "flags"} · ${changes} ${changes === 1 ? "change" : "changes"}`}
        </span>
      </p>
    </div>
  );
}
