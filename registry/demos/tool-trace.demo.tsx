"use client";

import { ToolTrace } from "@/registry/ui/tool-trace";

export function ToolTraceDemo() {
  return (
    <div className="flex w-full justify-center">
      <ToolTrace defaultOpen />
    </div>
  );
}
