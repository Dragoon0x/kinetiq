"use client";

import * as React from "react";

import { DigestFold, type DigestGroup } from "@/registry/ui/digest-fold";

type Line = [author: string, time: string, text: string];

const group = (id: string, room: string, lines: Line[]): DigestGroup => ({
  id,
  room,
  messages: lines.map(([author, time, text], at) => ({
    id: `${id}-${at}`,
    author,
    time,
    text,
  })),
});

const GROUPS: DigestGroup[] = [
  group("yard", "coldbrook-yard", [
    ["Ines Moreau", "01:48", "Gate is locked, all on dock two."],
    ["Rui Baptista", "02:31", "Dock three is free from nine."],
  ]),
  group("dock", "basinworks-dock", [
    ["Marta Ferreira", "01:55", "Loader keys are back on the hook."],
    ["Rui Baptista", "02:04", "Two crates came back short a label."],
    ["Marta Ferreira", "02:16", "Paperwork is under the sheet."],
  ]),
  group("pay", "waylight-pay", [
    ["Ines Moreau", "02:14", "Pallet 4471 is held, fee has not cleared."],
    ["Ines Moreau", "02:40", "Depot closes Thursday from noon."],
  ]),
];

/** A seeded script, walked by index — no clock, no randomness. */
const SCRIPT: { group: string; line: Line }[] = [
  {
    group: "yard",
    line: ["Rui Baptista", "02:52", "Yard lights are back on."],
  },
  { group: "pay", line: ["Marta Ferreira", "03:01", "Fee for 4471 cleared."] },
  {
    group: "dock",
    line: ["Ines Moreau", "03:09", "Loader booked until four."],
  },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function DigestFoldDemo() {
  const [groups, setGroups] = React.useState(GROUPS);
  const [open, setOpen] = React.useState(false);
  const [jumped, setJumped] = React.useState("");
  const [step, setStep] = React.useState(0);

  const deliver = () => {
    const next = SCRIPT[step % SCRIPT.length];
    if (!next) return;
    const [author, time, text] = next.line;
    setStep(step + 1);
    setGroups(
      groups.map((one) =>
        one.id === next.group
          ? {
              ...one,
              messages: [
                ...one.messages,
                { id: `late-${step}`, author, time, text },
              ],
            }
          : one,
      ),
    );
  };

  const missed = groups.reduce((sum, one) => sum + one.messages.length, 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <DigestFold
        groups={groups}
        since="01:40"
        open={open}
        onOpenChange={setOpen}
        onJump={(message, room) => setJumped(`${message.author} in #${room}`)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={deliver} className={chip}>
          Miss one more
        </button>
        <button
          type="button"
          onClick={() => {
            setGroups(GROUPS);
            setStep(0);
            setJumped("");
          }}
          disabled={step === 0 && jumped === ""}
          className={chip}
        >
          Put the digest back
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{open ? "open" : "folded"}</span>
        {jumped
          ? ` · jumped to ${jumped}`
          : ` · ${missed} missed in ${groups.length} rooms`}
      </p>
    </div>
  );
}
