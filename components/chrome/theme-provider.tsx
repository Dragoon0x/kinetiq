"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

import { THEME_STORAGE_KEY } from "@/lib/theme-script";

export type Theme = "dark" | "light";

/** Approximations of --bg-0 for the browser UI chrome. */
const THEME_COLOR: Record<Theme, string> = {
  dark: "#10131a",
  light: "#fafbfd",
};

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The <html> class — stamped before first paint by the pre-hydration
 * script — is the single source of truth. React reads it as an external
 * store, so there is no state to keep in sync.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("light")
    ? "light"
    : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

function applyTheme(theme: Theme) {
  const classList = document.documentElement.classList;
  classList.remove("light", "dark");
  classList.add(theme);

  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[theme];
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable (private mode); the session theme still applies.
    }
  }, []);

  // Follow OS changes only while the user hasn't made an explicit choice,
  // and follow explicit choices made in other tabs.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onMediaChange = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(THEME_STORAGE_KEY)) return;
      } catch {
        // fall through: without storage, keep following the OS
      }
      applyTheme(event.matches ? "light" : "dark");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      if (event.newValue === "light" || event.newValue === "dark") {
        applyTheme(event.newValue);
      }
    };
    media.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
