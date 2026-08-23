"use client";

import { UsecaseJobStories } from "@/registry/blocks/usecase-job-stories/usecase-job-stories";

/** The section at its own scale — full width, default narrative. */
export function UsecaseJobStoriesDemo() {
  return (
    <div className="w-full">
      <UsecaseJobStories />
    </div>
  );
}
