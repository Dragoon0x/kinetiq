import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site-config";

/**
 * Answer engines and their crawlers, named so the invitation is explicit.
 * The wildcard already admits them; listing them means a future rule that
 * narrows `*` cannot shut them out by accident, and it documents intent to
 * anyone auditing the file.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "Amazonbot",
  "CCBot",
  "DuckAssistBot",
  "meta-externalagent",
  "cohere-ai",
  "YouBot",
  "Bytespider",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: AI_CRAWLERS, allow: "/" },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
