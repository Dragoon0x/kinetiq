"use client";

import { useSyncExternalStore } from "react";

import { CopyButton } from "@/components/docs/copy-button";
import {
  getPackageManager,
  getServerPackageManager,
  installCommand,
  PACKAGE_MANAGERS,
  RUNNERS,
  setPackageManager,
  subscribePackageManager,
} from "@/lib/package-manager";
import { siteConfig } from "@/lib/site-config";
import { cn } from "@/registry/lib/utils";

/**
 * One-command install plate with package-manager tabs. The chosen manager
 * persists across pages and sessions, and is shared with the command deck's
 * copy action.
 */
export function InstallCommand({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const pm = useSyncExternalStore(
    subscribePackageManager,
    getPackageManager,
    getServerPackageManager,
  );

  const command = installCommand(slug, pm);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-10 items-center justify-between border-b border-hairline pr-1.5 pl-2">
        <div role="group" aria-label="Package manager" className="flex gap-1">
          {PACKAGE_MANAGERS.map((manager) => (
            <button
              key={manager}
              type="button"
              onClick={() => setPackageManager(manager)}
              aria-pressed={manager === pm}
              className={cn(
                "rounded-1 px-2 py-0.5 font-mono text-xs transition-colors",
                manager === pm
                  ? "bg-surface-2 text-ink"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              {manager}
            </button>
          ))}
        </div>
        <CopyButton value={command} label="Copy install command" />
      </div>
      <p className="px-4 py-3.5 font-mono text-[13px] break-words whitespace-normal sm:overflow-x-auto sm:whitespace-nowrap">
        <span className="text-ink-3 select-none">$ </span>
        <span className="text-ink-2">{RUNNERS[pm]} </span>
        <span className="text-ink">shadcn@latest add </span>
        <span className="text-cobalt-bright">
          {siteConfig.registryNamespace}/{slug}
        </span>
      </p>
    </div>
  );
}
