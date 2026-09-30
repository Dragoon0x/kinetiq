"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  PneumaticTube,
  type PneumaticTubeNotice,
} from "@/registry/ui/pneumatic-tube";

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
  glass: {
    kind: "choice",
    label: "Glass",
    default: "clear",
    options: ["clear", "frosted", "amber"],
    names: { clear: "Clear", frosted: "Frosted", amber: "Amber" },
  },
  capsule: {
    kind: "choice",
    label: "Capsule",
    default: "brass",
    options: ["brass", "copper", "steel"],
    names: { brass: "Brass", copper: "Copper", steel: "Steel" },
  },
});

const FIRST: PneumaticTubeNotice[] = [
  {
    id: "tube-a",
    title: "Invoice approved",
    body: "Invoice 2231 cleared finance. Payment runs on Thursday.",
    tone: "success",
  },
  {
    id: "tube-b",
    title: "Courier downstairs",
    body: "A parcel from Coldbrook Bank is waiting at the front desk.",
    tone: "info",
  },
  {
    id: "tube-c",
    title: "Server room warm",
    body: "Rack B is at 29 °C. Facilities are on their way up.",
    tone: "warn",
  },
];

const MORE: Omit<PneumaticTubeNotice, "id">[] = [
  {
    title: "Lease signed",
    body: "Gaugeworks returned the signed lease for the third floor.",
    tone: "success",
  },
  {
    title: "Payroll file failed",
    body: "The March run did not lock. Rerun it before 17:00.",
    tone: "danger",
  },
  {
    title: "Fire drill at 14:00",
    body: "Leave by the east stairs and meet in the car park.",
    tone: "warn",
  },
  {
    title: "Visitors from Fernworks",
    body: "Two guests for the 11:30 in the long room.",
    tone: "info",
  },
];

/**
 * The mailroom at Basinworks head office: messages from every floor arrive
 * by tube, one at a time, and go back down once read.
 */
export function PneumaticTubeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [notices, setNotices] = React.useState(FIRST);
  const [sent, setSent] = React.useState(0);
  const [last, setLast] = React.useState<{
    what: "sent" | "sent back";
    title: string;
  } | null>(null);
  const waiting = Math.max(0, notices.length - 1);

  const send = () => {
    const next = MORE[sent % MORE.length];
    if (!next) return;
    setNotices((list) => [...list, { ...next, id: `tube-${sent}` }]);
    setSent((n) => n + 1);
    setLast({ what: "sent", title: next.title });
  };

  const dismiss = (id: string) => {
    const gone = notices.find((n) => n.id === id);
    setNotices((list) => list.filter((n) => n.id !== id));
    if (gone) setLast({ what: "sent back", title: gone.title });
  };

  return (
    <div className="flex w-full max-w-96 flex-col gap-3">
      <PneumaticTube
        label="Basinworks mail"
        notices={notices}
        onDismiss={dismiss}
        sound={sound}
        {...values}
        className="self-center"
      />
      {chrome ? (
        <>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={send}
              className="inline-flex h-8 items-center justify-center rounded-2 border border-hairline bg-card px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Send one
            </button>
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {last ? (
              <>
                <span className="text-signal">{last.what}</span> · {last.title}{" "}
                · {waiting} waiting
              </>
            ) : (
              <>
                <span className="text-signal">reading</span> ·{" "}
                {notices[0]?.title ?? "nothing"} · {waiting} waiting
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
