import { createHighlighter, type Highlighter } from "shiki";

/**
 * Module-level singleton — every docs page shares one highlighter and all
 * highlighting happens at build time (pages are SSG). Dual-theme output:
 * tokens carry --shiki-dark/--shiki-light vars and CSS flips them, so theme
 * switching never re-highlights.
 */
let instancePromise: Promise<Highlighter> | null = null;

const LANGS = ["tsx", "ts", "bash", "json", "css"] as const;

export type CodeLang = (typeof LANGS)[number];

function getHighlighter(): Promise<Highlighter> {
  instancePromise ??= createHighlighter({
    themes: ["github-dark-default", "github-light-default"],
    langs: [...LANGS],
  });
  return instancePromise;
}

export async function highlight(code: string, lang: CodeLang): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code.trimEnd(), {
    lang,
    themes: {
      dark: "github-dark-default",
      light: "github-light-default",
    },
    defaultColor: false,
  });
}
