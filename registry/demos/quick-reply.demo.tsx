"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { QuickReply, type QuickReplyNotice } from "@/registry/ui/quick-reply";

export const tweaks = defineTweaks({
  suggestions: { kind: "toggle", label: "Suggestions", default: true },
  typing: { kind: "toggle", label: "Typing", default: true },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "neutral",
    options: ["neutral", "warm"],
    names: { neutral: "Neutral", warm: "Warm" },
  },
});

const FIRST: QuickReplyNotice[] = [
  {
    id: "asha",
    title: "Asha Morrow",
    body: "Is the van on its way? The crew at Lot 9 is ready to load.",
    time: "now",
  },
  {
    id: "tomas",
    title: "Tomas Reyes",
    body: "Pallets for Basin Road are wrapped and waiting at bay 2.",
    time: "4m",
  },
  {
    id: "ines",
    title: "Ines Varga",
    body: "Can you sign off the Fernworks order before noon?",
    time: "12m",
  },
];

const MORE: QuickReplyNotice[] = [
  {
    id: "kai",
    title: "Kai Brennan",
    body: "The yard gate code changed this morning. Want me to text it?",
    time: "now",
  },
  {
    id: "noor",
    title: "Noor Haddad",
    body: "Gauge readings look good. Should I send the full report?",
    time: "now",
  },
];

/**
 * Messages from a Fernworks crew, answered from the notification itself.
 * The stack keeps coming, so the card is never bare.
 */
export function QuickReplyDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [list, setList] = React.useState<QuickReplyNotice[]>(FIRST);
  const [replied, setReplied] = React.useState<Record<string, string>>({});
  const sent = React.useRef(0);

  const send = React.useCallback(() => {
    const n = sent.current;
    sent.current = n + 1;
    const next = MORE[n % MORE.length] as QuickReplyNotice;
    setList((l) => [{ ...next, id: `${next.id}-${n}` }, ...l]);
  }, []);

  React.useEffect(() => {
    if (list.length > 0) return;
    const t = window.setTimeout(send, 1400);
    return () => window.clearTimeout(t);
  }, [list.length, send]);

  const front = list[0];
  const first = front?.title.split(" ")[0]?.toLowerCase() ?? "";
  const answer = front ? replied[front.id] : undefined;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <QuickReply
        notices={list}
        onDismiss={(id) => setList((l) => l.filter((n) => n.id !== id))}
        onReply={(id, text) => setReplied((r) => ({ ...r, [id]: text }))}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex w-full items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {front ? (
              answer ? (
                <>
                  <span className="text-signal">replied</span> · {answer}
                </>
              ) : (
                <>
                  <span className="text-signal">from {first}</span>
                  {list.length > 1 ? ` · ${list.length - 1} waiting` : ""}
                </>
              )
            ) : (
              <span className="text-signal">all caught up</span>
            )}
          </p>
          <button
            type="button"
            onClick={send}
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Send one
          </button>
        </div>
      ) : null}
    </div>
  );
}
