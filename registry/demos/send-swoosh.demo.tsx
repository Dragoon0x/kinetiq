"use client";

import * as React from "react";

import { SendSwoosh, type SendStatus } from "@/registry/ui/send-swoosh";

/** How long the desk holds a send, then how long the verdict stays up. */
const MS = { verdict: 700, settle: 1200 };
const SHOWN = 3;

const firstWords = (text: string) => {
  const words = text.trim().split(/\s+/);
  return words.length > 7 ? `${words.slice(0, 7).join(" ")}…` : text.trim();
};

export function SendSwooshDemo() {
  const [text, setText] = React.useState(
    "Hi Marta, the payout for order 4471 left Waylight Pay this morning.",
  );
  const [status, setStatus] = React.useState<SendStatus>("idle");
  const [pending, setPending] = React.useState("");
  const [count, setCount] = React.useState(0);
  const [thread, setThread] = React.useState<{ id: string; text: string }[]>(
    [],
  );

  // A seeded script plays the verdict: every third send fails. The timer
  // waits out any stretch where the tab is hidden, so nothing lands unseen.
  React.useEffect(() => {
    if (status === "idle") return;
    const next: SendStatus =
      status === "sending" ? (count % 3 === 0 ? "failed" : "sent") : "idle";
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => {
          if (next === "sent") {
            setThread((prev) =>
              [...prev, { id: `s${count}`, text: pending }].slice(-SHOWN),
            );
          }
          setStatus(next);
        },
        status === "sending" ? MS.verdict : MS.settle,
      );
    };
    const onVisibility = () => {
      if (document.hidden) window.clearTimeout(timer);
      else arm();
    };
    if (!document.hidden) arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, count, pending]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {thread.length > 0 ? (
        <ol
          role="list"
          aria-label="Sent to Marta"
          className="flex flex-col items-end gap-1.5"
        >
          {thread.map((line) => (
            <li
              key={line.id}
              className="max-w-[88%] rounded-3 rounded-br-1 bg-surface-2 px-3 py-1.5 text-sm leading-5 wrap-break-word text-foreground"
            >
              {line.text}
            </li>
          ))}
        </ol>
      ) : null}

      <SendSwoosh
        label="Message Marta"
        value={text}
        onValueChange={setText}
        status={status}
        onSend={(sent) => {
          setPending(sent);
          setCount((n) => n + 1);
          setStatus("sending");
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "sending" ? (
          "Sending…"
        ) : status === "failed" ? (
          <span className="text-danger">Not sent · text returned</span>
        ) : status === "sent" ? (
          <>
            <span className="text-signal">Sent</span>
            {` · ${firstWords(pending)}`}
          </>
        ) : (
          `Ready · ${count} sent`
        )}
      </p>
    </div>
  );
}
