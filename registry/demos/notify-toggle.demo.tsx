"use client";

import * as React from "react";

import { NotifyToggle, type NotifyLevel } from "@/registry/ui/notify-toggle";

const READING: Record<NotifyLevel, string> = {
  all: "every message",
  mentions: "only when named",
  none: "nothing until you look",
};

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function NotifyToggleDemo() {
  const [level, setLevel] = React.useState<NotifyLevel>("mentions");
  const [event, setEvent] = React.useState<"post" | "mention" | null>(null);

  const notified =
    event === "mention"
      ? level !== "none"
      : event === "post" && level === "all";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <NotifyToggle
        room="coldbrook-yard"
        value={level}
        onValueChange={(next) => {
          setLevel(next);
          setEvent(null);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEvent("post")} className={chip}>
          Rui posts
        </button>
        <button
          type="button"
          onClick={() => setEvent("mention")}
          className={chip}
        >
          Rui names you
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{READING[level]}</span>
        {event
          ? ` · ${notified ? "that would reach you" : "that stays quiet"}`
          : " · #coldbrook-yard"}
      </p>
    </div>
  );
}
