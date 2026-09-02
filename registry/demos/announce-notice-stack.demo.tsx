"use client";

import { AnnounceNoticeStack } from "@/registry/blocks/announce-notice-stack/announce-notice-stack";

/** The section at its own scale — full width, default narrative. */
export function AnnounceNoticeStackDemo() {
  return (
    <div className="w-full">
      <AnnounceNoticeStack />
    </div>
  );
}
