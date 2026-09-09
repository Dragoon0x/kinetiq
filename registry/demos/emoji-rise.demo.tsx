"use client";

import * as React from "react";

import { EmojiRise, type EmojiPickerState } from "@/registry/ui/emoji-rise";

const CLOSED: EmojiPickerState = { open: false, query: "", matches: 0 };

export function EmojiRiseDemo() {
  const [draft, setDraft] = React.useState("Friday is on. ");
  const [picker, setPicker] = React.useState<EmojiPickerState>(CLOSED);
  const [inserted, setInserted] = React.useState(0);
  const [last, setLast] = React.useState<string | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <p className="max-w-[82%] self-start rounded-3 rounded-bl-1 bg-surface-2 px-3 py-2 text-sm leading-snug">
        Door 3 is clear from nine, Ines.
      </p>
      <p className="text-xs text-ink-3">
        Type <span className="font-mono text-signal">:sm</span> then Enter.
      </p>

      <EmojiRise
        label="Message Marta"
        value={draft}
        onValueChange={setDraft}
        onPickerChange={(state) => {
          setPicker(state);
          // The picker opening is the next thing that happened, so the line
          // stops reporting the insert before it.
          if (state.open) setLast(null);
        }}
        onInsert={(item) => {
          setInserted((n) => n + 1);
          setLast(`Inserted ${item.name}`);
        }}
        onSend={() => setLast("Sent")}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last ? (
          <>
            <span className="text-signal">{last}</span> · {inserted} inserted
          </>
        ) : picker.open ? (
          <>
            Picker open ·{" "}
            <span className="text-signal">
              {picker.matches} match :{picker.query}
            </span>
          </>
        ) : (
          <>Picker closed · {inserted} inserted</>
        )}
      </p>
    </div>
  );
}
