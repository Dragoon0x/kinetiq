"use client";

import * as React from "react";

import {
  AttachPreview,
  type Attachment,
  type PreviewMessage,
} from "@/registry/ui/attach-preview";

/** The depot's camera roll, in order; the seeds draw the thumbnails. */
const QUEUE: Omit<Attachment, "id">[] = [
  { name: "pallet-a.jpg", kind: "photo", seed: 17 },
  { name: "pallet-b.jpg", kind: "photo", seed: 42 },
  { name: "packing-list.pdf", kind: "doc", seed: 8 },
  { name: "counts.csv", kind: "sheet", seed: 23 },
  { name: "dock-door.jpg", kind: "photo", seed: 61 },
];

const OPENING: PreviewMessage[] = [
  {
    id: "m1",
    from: "peer",
    text: "Send me 4471 before it leaves the dock.",
    time: "9:41",
  },
];

export function AttachPreviewDemo() {
  const [messages, setMessages] = React.useState<PreviewMessage[]>(OPENING);
  const [pending, setPending] = React.useState<Attachment[]>([]);
  const [queued, setQueued] = React.useState(0);
  const [sent, setSent] = React.useState(0);
  const [files, setFiles] = React.useState(0);

  const attach = () => {
    const file = QUEUE[queued % QUEUE.length];
    if (!file) return;
    setPending((prev) => [...prev, { ...file, id: `f${queued + 1}` }]);
    setQueued((n) => n + 1);
  };

  const send = (draft: { text: string; attachments: Attachment[] }) => {
    const n = sent + 1;
    setSent(n);
    setFiles((count) => count + draft.attachments.length);
    // Clearing the strip and appending the message in one commit is what lets
    // each thumbnail fly from the strip into the bubble.
    setPending([]);
    setMessages((prev) =>
      [
        ...prev,
        {
          id: `s${n}`,
          from: "me" as const,
          text: draft.text === "" ? undefined : draft.text,
          attachments: draft.attachments,
          time: `9:${42 + n}`,
        },
      ].slice(-3),
    );
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AttachPreview
        label="Depot chat with Marta"
        peerName="Marta"
        messages={messages}
        pending={pending}
        onAttach={attach}
        onRemove={(id) =>
          setPending((prev) => prev.filter((item) => item.id !== id))
        }
        onSend={send}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {pending.length === 0
            ? "Nothing to send"
            : `${pending.length} to send`}
        </span>{" "}
        · {sent} sent{files > 0 ? ` · ${files} files` : ""}
      </p>
    </div>
  );
}
