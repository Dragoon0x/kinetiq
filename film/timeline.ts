import type { Shot } from "./core/shot";
import { agentShot } from "./shots/agent";
import { feelShot } from "./shots/feel";
import { finaleShot } from "./shots/finale";
import { hookShot } from "./shots/hook";
import { montageShot } from "./shots/montage";
import { springsShot } from "./shots/springs";
import { tuneShot } from "./shots/tune";

/**
 * The edit, in order. Each shot owns its frames, its hand and its cues;
 * later shots draw over earlier ones where they overlap.
 *
 *   0:00.0  hook      a liquid form, a press, a hard cut, the pull-back: a switch
 *   0:04.3  springs   five springs on the bench; one language across five cards
 *   0:09.6  tune      the real tweak panel dragged; the code rewrites itself
 *   0:13.3  own       copy, the code block opens into a terminal, one command
 *   0:16.5  feel      a rotary dial wound and let go; a record scratched
 *   0:19.7  agent     an agent finds the same switch through the MCP server
 *   0:22.4  montage   eleven specimens on the eighth notes; the count rolls
 *   0:25.6  finale    the catalog wall; the last light becomes the mark
 */
export const SHOTS: Shot[] = [
  hookShot,
  springsShot,
  tuneShot,
  feelShot,
  agentShot,
  montageShot,
  finaleShot,
];
