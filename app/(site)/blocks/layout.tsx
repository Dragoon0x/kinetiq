import { DocsShell } from "@/components/chrome/docs-shell";

export default function BlocksLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DocsShell>{children}</DocsShell>;
}
