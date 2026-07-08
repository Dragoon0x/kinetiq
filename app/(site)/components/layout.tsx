import { DocsShell } from "@/components/chrome/docs-shell";

export default function ComponentsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DocsShell>{children}</DocsShell>;
}
