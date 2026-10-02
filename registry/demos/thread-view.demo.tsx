"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultThreadMessages,
  ThreadView,
  type ThreadMessage,
} from "@/registry/ui/thread-view";

export const tweaks = defineTweaks({
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  branches: { kind: "toggle", label: "Branches", default: true },
  toolbar: {
    kind: "choice",
    label: "Toolbar",
    default: "hover",
    options: ["hover", "always", "off"],
    names: { hover: "On hover", always: "Always", off: "Off" },
  },
});

const MODEL = "Fernworks Model 3";

/** What the model says next, in turn: a seeded script, never a live model. */
const REPLIES = [
  "Then spread the first retry too. A fixed first delay means every upload that failed together comes back together; start the jittered window at attempt one, not attempt two.",
  "Keep the cap under the bucket's request timeout, so a retry is never still waiting when the next upload starts:\n\n```ts\nconst cap = Math.min(30_000, timeoutMs - 1_000);\n```",
  "Log the attempt number and the delay you chose with every retry. When the next outage comes you can check that the waits really spread out.",
];

/** A word (with its spacing) every 45 ms, after a short pause to think. */
const WORD_MS = 45;
const THINK_MS = 650;

/**
 * Fieldline's engineering assistant: Rae Okafor working out why Basin
 * export retries swamp the bucket. Edits and new messages get a reply
 * streamed in from the script above.
 */
export function ThreadViewDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [messages, setMessages] = React.useState<ThreadMessage[]>(
    defaultThreadMessages,
  );
  const [note, setNote] = React.useState<string | null>(null);
  const [streamingWords, setStreamingWords] = React.useState<number | null>(
    null,
  );
  const timers = React.useRef<number[]>([]);
  const turn = React.useRef(0);

  const stopAll = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  React.useEffect(() => stopAll, []);

  const reply = (to: ThreadMessage) => {
    stopAll();
    // Any reply still arriving is finished off where it stands.
    setMessages((list) =>
      list.map((m) =>
        m.status === "streaming" ? { ...m, status: undefined } : m,
      ),
    );
    const script = REPLIES[turn.current % REPLIES.length] ?? "";
    turn.current += 1;
    const id = `reply-${turn.current}`;
    const words = script.split(/(?<=\s)/);
    setMessages((list) => [
      ...list,
      {
        id,
        parentId: to.id,
        role: "assistant",
        author: MODEL,
        at: to.at + 2000,
        text: "",
        status: "streaming",
      },
    ]);
    setStreamingWords(0);
    let shown = 0;
    const step = () => {
      // A hidden page holds the stream where it is.
      if (document.hidden) {
        timers.current.push(window.setTimeout(step, 200));
        return;
      }
      shown += 1;
      const done = shown >= words.length;
      const text = words.slice(0, shown).join("");
      setMessages((list) =>
        list.map((m) =>
          m.id === id
            ? { ...m, text, status: done ? undefined : "streaming" }
            : m,
        ),
      );
      setStreamingWords(done ? null : shown);
      if (done) {
        setNote(`reply from ${MODEL.toLowerCase()} · ${words.length} words`);
      } else {
        timers.current.push(window.setTimeout(step, WORD_MS));
      }
    };
    timers.current.push(window.setTimeout(step, THINK_MS));
  };

  const reset = () => {
    stopAll();
    setMessages(defaultThreadMessages);
    setStreamingWords(null);
    setNote(null);
    turn.current = 0;
  };

  const thread = (
    <ThreadView
      messages={messages}
      onMessagesChange={setMessages}
      onSend={(_, message) => {
        setNote("sent · waiting for a reply");
        reply(message);
      }}
      onEdit={(_, version) => {
        setNote("edited · the thread forked");
        reply(version);
      }}
      onCopy={() => setNote("copied to the clipboard")}
      onReact={(_, r) =>
        setNote(
          r === "up"
            ? "marked a good reply"
            : r === "down"
              ? "marked a bad reply"
              : "reaction cleared",
        )
      }
      onLeafChange={() => setNote("switched to another version")}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{thread}</div>;

  const versions = messages.filter((m) => m.parentId === null).length;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {thread}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {streamingWords !== null ? (
            <>
              <span className="text-signal">streaming a reply</span> ·{" "}
              {streamingWords} {streamingWords === 1 ? "word" : "words"}
            </>
          ) : note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">
                {values.branches === false
                  ? "edits replace the message"
                  : `${versions} versions of the first turn`}
              </span>{" "}
              ·{" "}
              {values.toolbar === "off"
                ? "a read-only transcript"
                : values.toolbar === "always"
                  ? "every message shows its tools"
                  : "hover a message for its tools"}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
