"use client";

import * as React from "react";

import { SourceStack, type StackSource } from "@/registry/ui/source-stack";

/** Fernworks Model 3 asked whether the Coldbrook shipyard is still on schedule. */
const SOURCES: StackSource[] = [
  {
    id: "notes",
    title: "Coldbrook yard notes",
    site: "coldbrook.example",
    excerpt:
      "Hull 14 left the dry dock on 28 August, six days inside the window the yard gave the bank in June.",
  },
  {
    id: "letter",
    title: "Basinworks quarterly letter",
    site: "basinworks.example",
    excerpt:
      "The yard's second-half schedule assumes both cranes stay in service; a repeat of May would push hull 15 into the new year.",
  },
  {
    id: "rota",
    title: "Fieldline rota export",
    site: "fieldline.example",
    excerpt:
      "Overrun hours fell from 31 in May to 4 in August as the back shifts returned to plan.",
  },
  {
    id: "tides",
    title: "Gaugeworks tide table",
    site: "gaugeworks.example",
    excerpt:
      "Spring tides on 9 and 23 October give the only two float-out windows before December.",
  },
];

const TEXT =
  "The shipyard is on schedule: hull 14 floated out inside its window[1] and the crews are back to plan[3]. The risk is the cranes[2], and there are only two float-out tides left this year[4].";

export function SourceStackDemo() {
  const [front, setFront] = React.useState("notes");
  const [preview, setPreview] = React.useState<string | null>(null);

  const shown = preview ?? front;
  const index = SOURCES.findIndex((s) => s.id === shown) + 1;
  const source = SOURCES.find((s) => s.id === shown);
  const statusText = `${preview ? "Preview" : "Front"} ${index} of ${SOURCES.length} · ${source?.title ?? ""}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SourceStack
        label="Answer from Fernworks Model 3"
        text={TEXT}
        sources={SOURCES}
        value={front}
        onValueChange={setFront}
        onPreviewChange={setPreview}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {statusText}
      </p>
    </div>
  );
}
