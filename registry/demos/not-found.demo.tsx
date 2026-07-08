"use client";

import * as React from "react";

import { NotFound } from "@/registry/blocks/not-found/not-found";

export function NotFoundDemo() {
  const [event, setEvent] = React.useState<string | null>(null);

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
      <div onClickCapture={interceptNav}>
        <NotFound
          homeHref="/"
          onCommandDeck={() => setEvent("DECK OPENED")}
          className="py-6"
        />
      </div>
      <p
        aria-live="polite"
        className={
          event === null
            ? "text-muted-foreground mt-2 text-center font-mono text-[10px] font-medium tracking-[0.08em] uppercase"
            : "mt-2 text-center font-mono text-[10px] font-medium tracking-[0.08em] uppercase text-[var(--signal,var(--primary))]"
        }
      >
        {event ?? "Standing by"}
      </p>
    </div>
  );
}
