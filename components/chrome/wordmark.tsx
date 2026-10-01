import { cn } from "@/registry/lib/utils";

import { LogoMark } from "./logo-mark";

/** The Kinetiq lockup: the mark and the name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-[17px] text-foreground" />
      <span className="text-[15px] font-semibold tracking-tight">Kinetiq</span>
    </span>
  );
}
