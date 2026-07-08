import { CopyButton } from "@/components/docs/copy-button";
import { highlight, type CodeLang } from "@/lib/highlighter";
import { cn } from "@/registry/lib/utils";

/**
 * Build-time highlighted code panel. `code` comes from .generated/sources.ts,
 * so what renders here is byte-identical to what ships in the registry.
 */
export async function CodeBlock({
  code,
  lang = "tsx",
  filename,
  className,
  maxHeight = 480,
}: {
  code: string;
  lang?: CodeLang;
  filename?: string;
  className?: string;
  maxHeight?: number;
}) {
  const html = await highlight(code, lang);

  return (
    <figure
      className={cn(
        "border-hairline bg-surface-1 overflow-hidden rounded-3 border",
        className,
      )}
    >
      <figcaption className="border-hairline flex h-10 items-center justify-between border-b pr-1.5 pl-4">
        <span className="text-label text-ink-3">
          {filename ?? lang.toUpperCase()}
        </span>
        <CopyButton value={code} />
      </figcaption>
      <div
        className="overflow-auto p-4 [&_pre]:outline-none"
        style={{ maxHeight }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </figure>
  );
}
