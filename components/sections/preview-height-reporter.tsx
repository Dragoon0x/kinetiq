"use client";

import * as React from "react";

/**
 * Tells the parent document how tall this preview really is, so the frame can
 * fit the section instead of scrolling it. Same-origin only by design — the
 * parent verifies the origin and the slug before trusting a message.
 */
export function PreviewHeightReporter({ slug }: { slug: string }) {
  React.useEffect(() => {
    if (window.parent === window) return;
    const report = () => {
      window.parent.postMessage(
        {
          source: "kinetiq-preview",
          slug,
          height: document.documentElement.scrollHeight,
        },
        window.location.origin,
      );
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [slug]);

  return null;
}
