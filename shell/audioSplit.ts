/**
 * Recording the game and Discord as two separate programmes.
 *
 * ⚠️ WINDOWS 11 ONLY, and that is not a policy decision. The capture underneath
 * is WASAPI process loopback (`ActivateAudioInterfaceAsync` with
 * `VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK`), documented as needing build 20348+.
 * No consumer Windows 10 build reaches that — 22H2 tops out at 19045, and 20348
 * is Windows Server 2022 — and Chromium gates its own use of it on
 * `GetVersion() >= Version::WIN11`. On Windows 10 the option must be OFFERED
 * DISABLED WITH A REASON, never offered and then silently downgraded.
 *
 * ⚠️ The whole thing is a per-process id, and a WRONG one is SILENT. A
 * nonexistent PID opens a live track of pure digital silence with no exception
 * and no console output; a malformed suffix throws `NotReadableError`, and
 * Chromium `CHECK`s while parsing it. So every id is built from a process this
 * module has just seen in a live snapshot, never from anything a caller passed
 * in, and the recorder meters both channels so silence can be reported instead
 * of shipped.
 */
import { execFile } from "node:child_process"
import { release } from "node:os"

/** What a recording's audio turned out to be. */
export type AudioLayout = "split" | "stereo"

export type AudioPlan = {
  layout: AudioLayout
  /** League. Absent when its window was found but its process was not. */
  gamePid?: number
  /** Discord. Absent when it is not running, which is the common case. */
  voicePid?: number
}

type Proc = { ProcessId: number; ParentProcessId: number; Name: string }

/**
 * ⚠️ Build 22000 is Windows 11's first. `os.release()` gives "10.0.26200" —
 * Windows 11 still reports a major of 10, so the BUILD is the only part of that
 * string that answers the question.
 */
export function splitSupported(): boolean {
  const build = Number(release().split(".")[2] ?? 0)
  return build >= 22000
}

/** One PowerShell call per recording, ~1s. Everything else here is arithmetic
 *  on its result. */
async function snapshot(): Promise<Proc[]> {
  return new Promise((resolve) => {
    execFile(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress",
      ],
      { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve([])
        try {
          const j = JSON.parse(stdout)
          resolve(Array.isArray(j) ? j : [j])
        } catch {
          resolve([])
        }
      }
    )
  })
}

const GAME = "league of legends.exe"
const VOICE = ["discord.exe", "discordptb.exe", "discordcanary.exe"]

/**
 * The process to point a loopback capture at.
 *
 * ⚠️ THE APP'S MAIN PROCESS, not a child and not an ancestor. Measured:
 * targeting an app's main pid captures the audio actually rendered by its direct
 * child (Electron's `audio.mojom.AudioService` utility process), while targeting
 * a GRANDparent captured nothing at all. Chrome itself resolves this the same
 * way, via `GetAppMainProcessId`.
 *
 * Discord runs a tree of same-named processes, so the main one is the one whose
 * parent is NOT itself a Discord process. Oldest pid wins a tie, which is the
 * one that spawned the rest.
 */
function rootOf(procs: Proc[], names: string[]): number | undefined {
  const mine = procs.filter((p) => names.includes(String(p.Name ?? "").toLowerCase()))
  if (!mine.length) return undefined
  const ids = new Set(mine.map((p) => p.ProcessId))
  const roots = mine.filter((p) => !ids.has(p.ParentProcessId))
  const pick = (roots.length ? roots : mine).sort((a, b) => a.ProcessId - b.ProcessId)[0]
  return pick?.ProcessId
}

/**
 * What this machine can actually record right now.
 *
 * ⚠️ Falls back to `"stereo"` — today's single mixed track — at every step, and
 * that is the design. The player asked for a recording; a recording of the whole
 * mix is the thing they asked for minus a convenience, while no recording is a
 * lost game. Discord closed, Windows 10, a PowerShell that did not answer: all
 * of them land here.
 */
export async function planAudio(wantSplit: boolean): Promise<AudioPlan> {
  if (!wantSplit || !splitSupported()) return { layout: "stereo" }

  const procs = await snapshot()
  if (!procs.length) return { layout: "stereo" }

  const gamePid = rootOf(procs, [GAME])
  const voicePid = rootOf(procs, VOICE)

  // ⚠️ Both, or neither. One channel of a two-channel layout is a recording
  // where half the stereo field is digital silence, and the player would be
  // given a slider that controls nothing.
  if (!gamePid || !voicePid) return { layout: "stereo", gamePid, voicePid }

  return { layout: "split", gamePid, voicePid }
}
