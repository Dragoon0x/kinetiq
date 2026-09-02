"use client";

import { ErrorNotFound } from "@/registry/pages/error-not-found/error-not-found";

/** The whole page, at its own scale, showing a non-default face. */
export function ErrorNotFoundDemo() {
  return <ErrorNotFound face="bands" />;
}
