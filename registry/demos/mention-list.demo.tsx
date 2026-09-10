"use client";

import * as React from "react";

import { MentionList, type Mention } from "@/registry/ui/mention-list";

const mention = (
  id: string,
  author: string,
  room: string,
  time: string,
  text: string,
): Mention => ({ id, author, room, time, text });

const MENTIONS: Mention[] = [
  mention(
    "m5",
    "Marta Ferreira",
    "coldbrook-yard",
    "02:14",
    "Pallet 4471 is still held at the gate, @you — can you clear it?",
  ),
  mention(
    "m4",
    "Rui Baptista",
    "basinworks-dock",
    "01:58",
    "@you the loader keys are back on the hook by the office.",
  ),
  mention(
    "m3",
    "Ines Moreau",
    "waylight-pay",
    "01:31",
    "Yard fee posted. @you should see it on the night sheet.",
  ),
  mention(
    "m2",
    "Marta Ferreira",
    "night-shift",
    "00:47",
    "Handover at three, @you and Rui on dock two.",
  ),
  mention(
    "m1",
    "Ines Moreau",
    "coldbrook-yard",
    "00:12",
    "Depot closes Thursday from noon, @you — nothing leaves after eleven.",
  ),
];

/** A seeded script, walked by index — no clock, no randomness. */
const SCRIPT: Mention[] = [
  mention(
    "s1",
    "Rui Baptista",
    "coldbrook-yard",
    "02:26",
    "@you dock three is free from nine if the yard needs it.",
  ),
  mention(
    "s2",
    "Marta Ferreira",
    "waylight-pay",
    "02:33",
    "@you the fee for 4471 cleared, paperwork is under the sheet.",
  ),
  mention(
    "s3",
    "Ines Moreau",
    "basinworks-dock",
    "02:41",
    "Two crates are short a label, @you.",
  ),
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

const READ_AT_START = ["m1", "m2"];

export function MentionListDemo() {
  const [mentions, setMentions] = React.useState(MENTIONS);
  const [read, setRead] = React.useState<string[]>(READ_AT_START);
  const [open, setOpen] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0);

  const deliver = () => {
    const next = SCRIPT[step % SCRIPT.length];
    if (!next) return;
    const round = Math.floor(step / SCRIPT.length);
    setStep(step + 1);
    setMentions([{ ...next, id: `${next.id}-${round}` }, ...mentions]);
  };

  const reset = () => {
    setMentions(MENTIONS);
    setRead(READ_AT_START);
    setOpen(null);
    setStep(0);
  };

  const unread = mentions.filter((one) => !read.includes(one.id)).length;
  const opened = mentions.find((one) => one.id === open);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MentionList
        mentions={mentions}
        label="Mentions"
        openId={open}
        onOpenChange={setOpen}
        readIds={read}
        onReadIdsChange={setRead}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={deliver} className={chip}>
          Name me somewhere
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={mentions.length === MENTIONS.length && open === null}
          className={chip}
        >
          Put them back
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {unread === 0 ? "all read" : `${unread} new`}
        </span>
        {opened
          ? ` · opened ${opened.author} in #${opened.room}`
          : " · nothing open"}
      </p>
    </div>
  );
}
