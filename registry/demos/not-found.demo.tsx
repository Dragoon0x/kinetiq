"use client";

import * as React from "react";

import {
  NotFound,
  type NotFoundFace,
} from "@/registry/blocks/not-found/not-found";
import { cn } from "@/registry/lib/utils";

const FACES: { value: NotFoundFace; label: string }[] = [
  { value: "radar", label: "Radar" },
  { value: "shatter", label: "Shatter" },
  { value: "elastic", label: "Elastic" },
  { value: "echo", label: "Echo" },
  { value: "bands", label: "Bands" },
  { value: "spotlight", label: "Spotlight" },
];

export function NotFoundDemo() {
  const [event, setEvent] = React.useState<string | null>(null);
  const [face, setFace] = React.useState<NotFoundFace>("radar");

  // Keep the stage put: swallow the link's navigation, log the intent.
  const interceptNav = (mouseEvent: React.MouseEvent) => {
    const anchor =
      mouseEvent.target instanceof Element
        ? mouseEvent.target.closest("a")
        : null;
    if (anchor === null) return;
    mouseEvent.preventDefault();
    setEvent("NAV → HOME");
  };

  return (
    <div className="w-[420px] max-w-full">
      <div
        role="group"
        aria-label="Choose face"
        className="mx-auto mb-4 flex w-fit flex-wrap items-center justify-center gap-1 rounded-3 border border-border bg-surface-1 p-1"
      >
        {FACES.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={face === item.value}
            onClick={() => setFace(item.value)}
            className={cn(
              "rounded-2 px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.08em] uppercase transition-colors",
              face === item.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div onClickCapture={interceptNav}>
        <NotFound
          homeHref="/"
          onCommandDeck={() => setEvent("DECK OPENED")}
          face={face}
          className="py-6"
        />
      </div>
      <p
        aria-live="polite"
        className={
          event === null
            ? "mt-2 text-center font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
            : "mt-2 text-center font-mono text-[10px] font-medium tracking-[0.08em] text-[var(--signal,var(--primary))] uppercase"
        }
      >
        {event ?? "Standing by"}
      </p>
    </div>
  );
}
