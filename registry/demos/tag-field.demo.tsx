"use client";

import * as React from "react";

import { TagField } from "@/registry/ui/tag-field";

export function TagFieldDemo() {
  const [tags, setTags] = React.useState(["design", "motion"]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TagField
        value={tags}
        onValueChange={setTags}
        placeholder="Add a label…"
        maxTags={8}
      />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Tags{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {tags.length}
        </span>
      </p>
    </div>
  );
}
