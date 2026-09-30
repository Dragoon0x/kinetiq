"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MorseStatus } from "@/registry/ui/morse-status";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  lamp: { kind: "toggle", label: "Lamp", default: true },
  trail: {
    kind: "range",
    label: "Trail",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const PHRASES = ["Opening the line", "Sending the wire", "Awaiting reply"];

/**
 * Waylight Pay wiring money to a Coldbrook Bank account: the transfer's
 * status is tapped out word by word while it goes through.
 */
export function MorseStatusDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sending, setSending] = React.useState(true);
  const [phrase, setPhrase] = React.useState(0);
  const [word, setWord] = React.useState(0);
  const words = (PHRASES[phrase] ?? "").split(" ").length;

  const strip = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight Pay · wire to Coldbrook
      </p>
      <MorseStatus
        phrases={PHRASES}
        active={sending}
        doneText="Wire received"
        onPhraseChange={setPhrase}
        onWordChange={setWord}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{strip}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {strip}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {sending && phrase >= 0 ? (
            <>
              <span className="text-signal">tapping</span> · word{" "}
              {Math.min(words, word + 1)} of {words} · press the key
            </>
          ) : (
            <>
              <span className="text-signal">received</span> · wire confirmed
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setSending((s) => !s)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {sending ? "Finish" : "Send again"}
        </button>
      </div>
    </div>
  );
}
