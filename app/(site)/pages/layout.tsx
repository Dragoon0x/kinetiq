import { DocsShell } from "@/components/chrome/docs-shell";

export default function PagesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DocsShell>{children}</DocsShell>;
}
