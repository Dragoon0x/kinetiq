"use client";

import * as React from "react";

import { ReportSheet, type ReportReason } from "@/registry/ui/report-sheet";

const MESSAGE = {
  author: "Rui Baptista",
  time: "08:12",
  text: "Whoever packed pallet 4471 cannot count. Useless.",
};

const REASONS: ReportReason[] = [
  {
    id: "rude",
    label: "Rude to a driver",
    hint: "A driver or packer was insulted by name or by shift.",
  },
  {
    id: "off-topic",
    label: "Off topic",
    hint: "Nothing to do with the depot run this room is for.",
  },
  {
    id: "wrong-room",
    label: "Wrong room",
    hint: "Belongs in the Basinworks yard room, not here.",
  },
  {
    id: "repeat",
    label: "Repeated posting",
    hint: "The same message went up more than three times.",
  },
  {
    id: "rule-3",
    label: "Breaks room rule 3",
    hint: "Coldbrook room rule 3: keep it civil about the drivers.",
  },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

type Sent = { label: string; note: number };

export function ReportSheetDemo() {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const [sent, setSent] = React.useState<Sent | null>(null);

  const chosen = REASONS.find((item) => item.id === reason);

  const status = sent
    ? `sent · ${sent.label} · note ${sent.note} ${sent.note === 1 ? "char" : "chars"}`
    : open
      ? chosen
        ? `sheet open · ${chosen.label} · note ${note.length}/140`
        : "sheet open · no reason"
      : "sheet closed · no reason";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ReportSheet
        label="Report a message to the room hosts"
        message={MESSAGE}
        reasons={REASONS}
        open={open}
        onOpenChange={setOpen}
        reason={reason}
        onReasonChange={setReason}
        note={note}
        onNoteChange={setNote}
        onSubmit={(report) =>
          setSent({ label: report.label, note: report.note.length })
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={open}
          className={chip}
        >
          Open the sheet
        </button>
        <button
          type="button"
          onClick={() => {
            setSent(null);
            setReason("");
            setNote("");
            setOpen(false);
          }}
          disabled={!sent && reason === "" && note === "" && !open}
          className={chip}
        >
          Start over
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{status}</span>
      </p>
    </div>
  );
}
