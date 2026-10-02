"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultFiles,
  FileBrowser,
  type FileBrowserHandle,
  type FileItem,
} from "@/registry/ui/file-browser";

export const tweaks = defineTweaks({
  view: {
    kind: "choice",
    label: "View",
    default: "grid",
    options: ["grid", "list"],
    names: { grid: "Grid", list: "List" },
  },
  lasso: {
    kind: "choice",
    label: "Lasso",
    default: "touch",
    options: ["touch", "contain", "off"],
    names: { touch: "Touch", contain: "Contain", off: "Off" },
  },
  spring: {
    kind: "choice",
    label: "Spring",
    default: "glide",
    options: ["snap", "glide", "recoil"],
    names: { snap: "Snap", glide: "Glide", recoil: "Recoil" },
  },
});

const START = "q4";

/** Three files to upload without a picker: a PDF, a still and a sheet. */
const SAMPLES: [string, string, number][] = [
  ["launch-notes.pdf", "application/pdf", 1_200_000],
  ["dock-dusk.png", "image/png", 2_400_000],
  ["press-list.csv", "text/csv", 64_000],
];

const nameOf = (files: FileItem[], id: string) =>
  id === "root"
    ? "files"
    : (files.find((f) => f.id === id)?.name.toLowerCase() ?? id);

/**
 * The Basinworks shared drive, open on the Q4 launch: campaign, contracts
 * and footage folders, a brief, a budget, a launch deck, renders and a film.
 */
export function FileBrowserDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [files, setFiles] = React.useState(defaultFiles);
  const [folder, setFolder] = React.useState(START);
  const [note, setNote] = React.useState<string | null>(null);
  const browser = React.useRef<FileBrowserHandle | null>(null);

  const reset = () => {
    setRun((r) => r + 1);
    setFiles(defaultFiles);
    setFolder(START);
    setNote(null);
  };

  const view = (
    <FileBrowser
      key={run}
      ref={browser}
      defaultFolder={START}
      onFilesChange={setFiles}
      onFolderChange={(id) => {
        setFolder(id);
        setNote(null);
      }}
      onSelectedChange={(ids) =>
        setNote(ids.length > 1 ? `${ids.length} selected` : null)
      }
      onMove={(ids, to) =>
        setNote(
          `moved ${ids.length === 1 ? "1 item" : `${ids.length} items`} to ${nameOf(files, to)}`,
        )
      }
      onDelete={(ids) =>
        setNote(
          `deleted ${ids.length === 1 ? "1 item" : `${ids.length} items`}`,
        )
      }
      onUploadComplete={(item) => setNote(`uploaded ${item.name}`)}
      onOpen={(item) => setNote(`opened ${item.name}`)}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{view}</div>;

  const count = files.filter((f) => f.parentId === folder).length;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {view}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">
                {count === 1 ? "1 item" : `${count} items`}
              </span>{" "}
              · drag files onto a folder and hold to open it
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              browser.current?.upload(
                SAMPLES.map(
                  ([name, type, size]) =>
                    new File([new Uint8Array(size)], name, { type }),
                ),
              );
              setNote("uploading 3 files");
            }}
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Upload samples
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
