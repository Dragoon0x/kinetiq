/**
 * The reader's chosen package manager, shared by every install plate and by
 * the command deck's copy action. localStorage is the store; a custom event
 * covers same-tab updates so everything switches together.
 */
import { siteConfig } from "./site-config";

export const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export const RUNNERS: Record<PackageManager, string> = {
  pnpm: "pnpm dlx",
  npm: "npx",
  yarn: "yarn dlx",
  bun: "bunx --bun",
};

export const PM_STORAGE_KEY = "kinetiq-pm";
export const PM_CHANGE_EVENT = "kinetiq-pm-change";

export function subscribePackageManager(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PM_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PM_CHANGE_EVENT, onChange);
  };
}

export function getPackageManager(): PackageManager {
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

export function getServerPackageManager(): PackageManager {
  return "pnpm";
}

export function setPackageManager(next: PackageManager): void {
  try {
    localStorage.setItem(PM_STORAGE_KEY, next);
    window.dispatchEvent(new Event(PM_CHANGE_EVENT));
  } catch {
    // Storage unavailable — the tabs simply won't persist.
  }
}

/** The one command that puts an item's source in the reader's repo. */
export function installCommand(slug: string, pm: PackageManager): string {
  return `${RUNNERS[pm]} shadcn@latest add ${siteConfig.registryNamespace}/${slug}`;
}
