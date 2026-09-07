"use client";

import * as React from "react";

import { ShareTray } from "@/registry/ui/share-tray";

const ARTICLE = {
  title: "What the third sweep tells you",
  url: "waylight.example/field/third-sweep",
};

const NAMES: Record<string, string> = {
  copy: "Copy link",
  fieldline: "Fieldline",
  fernworks: "Fernworks",
  coldbrook: "Coldbrook",
  gaugeworks: "Gaugeworks",
  more: "System sheet",
};

export function ShareTrayDemo() {
  const [last, setLast] = React.useState("");

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="relative h-[300px] w-full overflow-hidden rounded-3 border border-border bg-surface-1">
        <div className="flex flex-col gap-3 p-4">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight · field
          </span>
          <h3 className="max-w-[70%] text-base leading-snug font-semibold">
            {ARTICLE.title}
          </h3>
          <div className="h-20 w-full rounded-2 bg-linear-to-br from-cobalt-wash to-surface-2" />
          <p className="text-xs leading-relaxed text-ink-2">
            A vane that reads long on every third pass is not broken. It is
            telling you where the stop sits, and the tape is the only witness
            the next shift will accept.
          </p>
        </div>

        <ShareTray
          url={ARTICLE.url}
          title={ARTICLE.title}
          onAction={(id) => setLast(NAMES[id] ?? id)}
          targets={[
            {
              id: "fieldline",
              label: "Fieldline",
              icon: "note",
              onSelect: () => {},
            },
            {
              id: "fernworks",
              label: "Fernworks",
              icon: "chat",
              onSelect: () => {},
            },
            {
              id: "coldbrook",
              label: "Coldbrook",
              icon: "mail",
              onSelect: () => {},
            },
            {
              id: "gaugeworks",
              label: "Gaugeworks",
              icon: "board",
              onSelect: () => {},
            },
          ]}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last ? (
          <>
            Shared to <span className="text-signal">{last}</span>
          </>
        ) : (
          "Open the tray to share"
        )}
      </p>
    </div>
  );
}
