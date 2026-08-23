"use client";

import { ContentPrinciplesList } from "@/registry/blocks/content-principles-list/content-principles-list";

/** The section at its own scale — full width, default narrative. */
export function ContentPrinciplesListDemo() {
  return (
    <div className="w-full">
      <ContentPrinciplesList />
    </div>
  );
}
