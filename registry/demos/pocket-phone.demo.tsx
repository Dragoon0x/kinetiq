"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  PocketPhone,
  type PocketPhoneOrientation,
} from "@/registry/ui/pocket-phone";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 8,
    min: 0,
    max: 15,
    step: 1,
    unit: "°",
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "graphite",
    options: ["graphite", "silver", "sand"],
    names: { graphite: "Graphite", silver: "Silver", sand: "Sand" },
  },
  glare: { kind: "toggle", label: "Glare", default: true },
});

const PAYMENTS = [
  { id: "coffee", name: "Coldbrook Coffee", note: "08:12", amount: "−£3.40" },
  { id: "rail", name: "Fieldline Rail", note: "08:31", amount: "−£12.80" },
  { id: "refund", name: "Basinworks", note: "Refund", amount: "+£24.00" },
];

/** Waylight Pay's home screen; side by side when the phone lies down. */
function WalletScreen() {
  return (
    <div className="flex size-full flex-col gap-3 px-3 pt-1 pb-2 [@container(orientation:landscape)]:flex-row [@container(orientation:landscape)]:gap-4 [@container(orientation:landscape)]:pt-2">
      <div className="flex shrink-0 flex-col gap-3 [@container(orientation:landscape)]:w-[38%] [@container(orientation:landscape)]:gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-semibold text-foreground">
            Waylight Pay
          </span>
          <span
            aria-hidden
            className="size-5 shrink-0 rounded-full bg-cobalt-wash ring-1 ring-cobalt-bright/40 [@container(orientation:landscape)]:hidden"
          />
        </div>
        <div className="rounded-3 bg-surface-2 px-3 py-2.5 [@container(orientation:landscape)]:bg-transparent [@container(orientation:landscape)]:p-0">
          <p className="text-[10px] text-ink-3">Balance</p>
          <p className="font-mono text-lg leading-tight font-medium text-foreground tabular-nums [@container(orientation:landscape)]:text-base">
            £2,480.16
          </p>
          <p className="mt-0.5 text-[10px] text-success">+£24.00 today</p>
        </div>
        <div className="grid grid-cols-2 gap-2 [@container(orientation:landscape)]:hidden">
          <span className="flex h-7 items-center justify-center rounded-2 bg-primary text-[11px] font-medium text-primary-foreground">
            Send
          </span>
          <span className="flex h-7 items-center justify-center rounded-2 border border-hairline text-[11px] font-medium text-foreground">
            Request
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[10px] font-medium tracking-[0.06em] text-ink-3 uppercase">
          Today
        </p>
        <ul role="list" className="flex flex-col">
          {PAYMENTS.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 border-b border-hairline py-1.5 last:border-b-0 [@container(orientation:landscape)]:py-1"
            >
              <span className="min-w-0">
                <span className="block truncate text-[11px] text-foreground [@container(orientation:landscape)]:text-[10px]">
                  {p.name}
                </span>
                <span className="block text-[9px] text-ink-3 [@container(orientation:landscape)]:hidden">
                  {p.note}
                </span>
              </span>
              <span
                className={
                  p.amount.startsWith("+")
                    ? "shrink-0 font-mono text-[11px] text-success tabular-nums [@container(orientation:landscape)]:text-[10px]"
                    : "shrink-0 font-mono text-[11px] text-foreground tabular-nums [@container(orientation:landscape)]:text-[10px]"
                }
              >
                {p.amount}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A Fieldline Rail live activity, as the island holds it. */
function TrainActivity() {
  return (
    <div className="flex size-full flex-col justify-center gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-[oklch(0.78_0.15_160)]"
          />
          <span className="truncate text-[11px] font-semibold">
            Fieldline Rail
          </span>
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums">
          09:52
        </span>
      </div>
      <p className="truncate text-[10px] opacity-70">Platform 4 · 6 min</p>
      <span
        aria-hidden
        className="h-1 overflow-clip rounded-full bg-[oklch(1_0_0/0.18)]"
      >
        <span className="block h-full w-[64%] rounded-full bg-[oklch(0.78_0.15_160)]" />
      </span>
    </div>
  );
}

/**
 * Waylight Pay on a phone in the hand: lean it with the pointer, turn it, use
 * its keys, open the train that is on its way in the island.
 */
export function PocketPhoneDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [orientation, setOrientation] =
    React.useState<PocketPhoneOrientation>("portrait");
  const [volume, setVolume] = React.useState(0.5);
  const [awake, setAwake] = React.useState(true);

  const phone = (
    <PocketPhone
      label="Waylight Pay preview"
      island={<TrainActivity />}
      islandLabel="Fieldline Rail, 09:52 from platform 4"
      orientation={orientation}
      onOrientationChange={setOrientation}
      volume={volume}
      onVolumeChange={setVolume}
      awake={awake}
      onAwakeChange={setAwake}
      sound={sound}
      {...values}
    >
      <WalletScreen />
    </PocketPhone>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[300px]">{phone}</div>;
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex w-full max-w-[256px] self-center">{phone}</div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{orientation}</span> · volume{" "}
        {Math.round(volume * 16)} of 16 · screen {awake ? "on" : "off"}
      </p>
    </div>
  );
}
