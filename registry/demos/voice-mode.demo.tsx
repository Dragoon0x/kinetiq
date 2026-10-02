"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  VoiceMode,
  defaultVoiceTurns,
  type VoicePhase,
  type VoiceStatus,
} from "@/registry/ui/voice-mode";

export const tweaks = defineTweaks({
  orb: {
    kind: "choice",
    label: "Orb",
    default: "blob",
    options: ["blob", "rings", "dots"],
    names: { blob: "Blob", rings: "Rings", dots: "Dots" },
  },
  captions: {
    kind: "choice",
    label: "Captions",
    default: "transcript",
    options: ["transcript", "live", "off"],
    names: { transcript: "Transcript", live: "Live", off: "Off" },
  },
  level: {
    kind: "range",
    label: "Level",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const TAIL = (text: string) => {
  const words = text.split(/\s+/);
  return words.slice(-3).join(" ").toLowerCase();
};

/**
 * Coldbrook Bank's card line: a customer reports a fuel charge they did not
 * make, and the assistant freezes the card, disputes the charge and explains
 * the replacement. The line connects for a moment first.
 */
export function VoiceModeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [take, setTake] = React.useState(0);
  const [status, setStatus] = React.useState<VoiceStatus>("connecting");
  const [phase, setPhase] = React.useState<VoicePhase>("connecting");
  const [muted, setMuted] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);

  // The line takes a moment to connect, on every take.
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setStatus("ready");
      setPhase("listening");
    }, 900);
    return () => window.clearTimeout(id);
  }, [take]);

  const line =
    note ??
    (status === "connecting"
      ? "connecting · coldbrook card line"
      : phase === "ended"
        ? "call ended · press call again"
        : muted && phase === "listening"
          ? "muted · waiting for you"
          : phase === "thinking"
            ? "thinking · checking your card"
            : phase === "speaking"
              ? "speaking · tap interrupt to cut in"
              : "listening");

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <VoiceMode
        key={take}
        className={chrome ? "h-[500px]" : "h-[560px]"}
        turns={defaultVoiceTurns}
        status={status}
        muted={muted}
        onMutedChange={(next) => {
          setNote(null);
          setMuted(next);
        }}
        onPhaseChange={(next) => {
          setNote(null);
          setPhase(next);
        }}
        onInterrupt={(_turn, spoken) =>
          setNote(
            spoken
              ? `interrupted · …${TAIL(spoken)}`
              : "interrupted · reply cancelled",
          )
        }
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{line.split(" · ")[0]}</span>
            {line.includes(" · ")
              ? ` · ${line.split(" · ").slice(1).join(" · ")}`
              : null}
          </p>
          <button
            type="button"
            onClick={() => {
              setNote(null);
              setMuted(false);
              setStatus("connecting");
              setPhase("connecting");
              setTake((t) => t + 1);
            }}
            className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Restart
          </button>
        </div>
      ) : null}
    </div>
  );
}
