"use client";

import { useSyncExternalStore } from "react";

import { CopyButton } from "@/components/docs/copy-button";
import { siteConfig } from "@/lib/site-config";
import { cn } from "@/registry/lib/utils";

const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"] as const;

type PackageManager = (typeof PACKAGE_MANAGERS)[number];

const RUNNERS: Record<PackageManager, string> = {
  pnpm: "pnpm dlx",
  npm: "npx",
  yarn: "yarn dlx",
  bun: "bunx --bun",
};

const PM_STORAGE_KEY = "kinetiq-pm";
const PM_CHANGE_EVENT = "kinetiq-pm-change";

/** localStorage is the store; a custom event covers same-tab updates so
 * every install plate on the page switches together. */
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PM_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PM_CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): PackageManager {
  try {
    const stored = localStorage.getItem(PM_STORAGE_KEY);
    if (PACKAGE_MANAGERS.includes(stored as PackageManager)) {
      return stored as PackageManager;
    }
  } catch {
    // Storage unavailable — use the default.
  }
  return "pnpm";
}

function getServerSnapshot(): PackageManager {
  return "pnpm";
}

/**
 * One-command install plate with package-manager tabs. The chosen manager
 * persists across pages and sessions.
 */
export function InstallCommand({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const pm = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const choose = (next: PackageManager) => {
    try {
      localStorage.setItem(PM_STORAGE_KEY, next);
      window.dispatchEvent(new Event(PM_CHANGE_EVENT));
    } catch {
      // Storage unavailable — the tabs simply won't persist.
    }
  };

  const command = `${RUNNERS[pm]} shadcn@latest add ${siteConfig.registryNamespace}/${slug}`;

  return (
    <div
      className={cn(
        "border-hairline bg-surface-1 overflow-hidden rounded-3 border",
        className,
      )}
    >
      <div className="border-hairline flex h-10 items-center justify-between border-b pr-1.5 pl-2">
        <div role="group" aria-label="Package manager" className="flex gap-1">
          {PACKAGE_MANAGERS.map((manager) => (
            <button
              key={manager}
              type="button"
              onClick={() => choose(manager)}
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
      <p className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] whitespace-nowrap">
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
