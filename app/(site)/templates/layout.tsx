import { DocsShell } from "@/components/chrome/docs-shell";

export default function TemplatesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DocsShell>{children}</DocsShell>;
}
