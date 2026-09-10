"use client";

import * as React from "react";

import {
  SectionCollapse,
  type RoomSection,
  type SectionChannel,
} from "@/registry/ui/section-collapse";

const room = (
  id: string,
  name: string,
  unread = 0,
  extra: Partial<SectionChannel> = {},
): SectionChannel => ({ id, name, unread, ...extra });

const SEED: RoomSection[] = [
  {
    id: "rooms",
    title: "Rooms",
    channels: [
      room("dispatch", "dispatch", 2),
      room("returns", "returns"),
      room("pay", "waylight-pay", 1),
      room("basinworks", "basinworks"),
    ],
  },
  {
    id: "direct",
    title: "Direct",
    channels: [
      room("ines", "Ines Corta", 1, { direct: true }),
      room("marta", "Marta Vey", 0, { direct: true }),
      room("rui", "Rui Alcan", 0, { direct: true }),
    ],
  },
  {
    id: "muted",
    title: "Muted",
    channels: [
      room("night", "night-shift", 0, { muted: true }),
      room("gate", "gate-b", 0, { muted: true }),
    ],
  },
];

const unreadIn = (section: RoomSection): number =>
  section.channels.reduce((sum, channel) => sum + (channel.unread ?? 0), 0);

/** A seeded script, so an arrival is a press rather than a clock. */
const SCRIPT = ["returns", "ines", "pay", "marta"];

export function SectionCollapseDemo() {
  const [sections, setSections] = React.useState(SEED);
  const [open, setOpen] = React.useState<string[]>(["rooms", "muted"]);
  const [active, setActive] = React.useState("dispatch");
  const [step, setStep] = React.useState(0);

  const target = SCRIPT[step];
  const hidden = sections
    .filter((section) => !open.includes(section.id))
    .reduce((total, section) => total + unreadIn(section), 0);

  const deliver = () => {
    if (!target) return;
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        channels: section.channels.map((channel) =>
          channel.id === target
            ? { ...channel, unread: (channel.unread ?? 0) + 1 }
            : channel,
        ),
      })),
    );
    setStep((value) => value + 1);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SectionCollapse
        label="Coldbrook depot sidebar"
        sections={sections}
        open={open}
        onOpenChange={(id, next) =>
          setOpen((prev) =>
            next ? [...prev, id] : prev.filter((value) => value !== id),
          )
        }
        activeChannel={active}
        onChannelSelect={setActive}
      />

      <button
        type="button"
        onClick={deliver}
        disabled={!target}
        className="flex h-8 items-center justify-center rounded-2 border border-hairline-strong bg-card px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      >
        {target ? "Deliver a message" : "Script played out"}
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {sections
          .map(
            (section) =>
              `${section.title} ${open.includes(section.id) ? "open" : "folded"}`,
          )
          .join(" · ")}{" "}
        · <span className="text-signal">{hidden} unread hidden</span>
      </p>
    </div>
  );
}
