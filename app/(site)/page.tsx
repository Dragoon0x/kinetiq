import { ThemeToggle } from "@/components/chrome/theme-toggle";

export default function HomePage() {
  return (
    <main className="bg-grid bg-grid-fade flex min-h-screen flex-col items-center justify-center gap-4 px-6">
      <ThemeToggle className="border-hairline-strong bg-surface-1 text-ink-2 hover:text-ink fixed top-4 right-4 flex size-9 items-center justify-center rounded-2 border" />
      <p className="text-label text-ink-3">KQ-000 · SCAFFOLD/ONLINE</p>
      <h1 className="text-5xl font-semibold tracking-tight">
        Motion, calibrated.
      </h1>
      <p className="text-ink-2 max-w-md text-center">
        A React component library where every animation shares five calibrated
        springs.
      </p>
    </main>
  );
}
