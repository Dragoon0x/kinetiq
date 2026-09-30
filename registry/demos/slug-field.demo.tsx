"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SlugField } from "@/registry/ui/slug-field";

export const tweaks = defineTweaks({
  separator: {
    kind: "choice",
    label: "Separator",
    default: "-",
    options: ["-", "_"],
    names: { "-": "Dash", _: "Underscore" },
  },
  check: { kind: "toggle", label: "Check", default: true },
  max: {
    kind: "range",
    label: "Max length",
    default: 48,
    min: 24,
    max: 80,
    step: 4,
  },
});

const PREFIX = "fernworks.journal/posts/";

/** Posts the journal already has. */
const TAKEN = new Set([
  "about",
  "autumn-menu",
  "hello-world",
  "pricing",
  "release-notes",
  "welcome",
  "winter-menu",
]);

/** The journal's check, as a network call would feel: a short wait. */
const isTaken = (slug: string) =>
  new Promise<boolean>((resolve) => {
    window.setTimeout(() => resolve(TAKEN.has(slug.replace(/_/g, "-"))), 240);
  });

/**
 * A new post in the Fernworks journal. Its title makes a slug that is already
 * taken, so the field opens on the numbered offer.
 */
export function SlugFieldDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const sep = values.separator === "_" ? "_" : "-";
  const [slug, setSlug] = React.useState("autumn-menu");
  const [linked, setLinked] = React.useState(true);

  // The journal keeps one separator: a new one rewrites the slug it holds.
  const [sepSeen, setSepSeen] = React.useState(sep);
  if (sepSeen !== sep) {
    setSepSeen(sep);
    setSlug(slug.split(sepSeen).join(sep));
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <form onSubmit={(event) => event.preventDefault()} className="w-full">
        <SlugField
          titleLabel="Post title"
          titleName="title"
          defaultTitle="Autumn Menu"
          label="URL"
          name="slug"
          prefix={PREFIX}
          value={slug}
          onValueChange={setSlug}
          onLinkedChange={setLinked}
          isTaken={isTaken}
          sound={sound}
          {...values}
        />
      </form>
      {chrome ? (
        <p
          role="status"
          className="flex min-w-0 border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="truncate text-signal" title={`${PREFIX}${slug}`}>
            {PREFIX}
            {slug || "…"}
          </span>
          <span className="shrink-0 whitespace-pre">
            {` · ${linked ? "follows the title" : "edited by hand"}`}
          </span>
        </p>
      ) : null}
    </div>
  );
}
