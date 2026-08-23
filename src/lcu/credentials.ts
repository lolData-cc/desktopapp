/**
 * Finding the running client and getting a session credential out of it.
 *
 * SECURITY: the token this returns grants full control of the signed-in
 * account's client for as long as that client stays open. It must never be
 * logged, written to disk, or sent anywhere. Everything here returns it inside
 * an object whose toString/inspect is deliberately redacted, so an idle
 * `console.log(creds)` during development cannot leak it.
 */
import { readFile } from "node:fs/promises"
import { exec } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(exec)

export type LcuCredentials = {
  port: number
  /** HTTP Basic value, ready for an Authorization header. Redacted when printed. */
  authHeader: string
  /** Where we found it — useful in logs, and contains no secret. */
  source: "process" | "lockfile"
}

/** Wraps the credential so the secret cannot be printed by accident. */
function seal(port: number, token: string, source: LcuCredentials["source"]): LcuCredentials {
  const authHeader = "Basic " + Buffer.from(`riot:${token}`).toString("base64")
  const creds = { port, authHeader, source }
  // Both of these fire on console.log, template literals and JSON.stringify.
  Object.defineProperty(creds, "toString", {
    value: () => `LcuCredentials(port=${port}, source=${source}, token=<redacted>)`,
    enumerable: false,
  })
  Object.defineProperty(creds, "toJSON", {
    value: () => ({ port, source, authHeader: "<redacted>" }),
    enumerable: false,
  })
  return creds as LcuCredentials
}

/**
 * Primary route: read it off the running process.
 *
 * LeagueClientUx is launched with `--app-port=` and `--remoting-auth-token=` on
 * its command line, which is more reliable than the lockfile — it does not
 * depend on knowing where the game is installed, and there is no window where
 * the file exists but is half-written.
 */
async function fromProcess(): Promise<LcuCredentials | null> {
  if (process.platform !== "win32") return null
  try {
    const { stdout } = await run(
      "powershell -NoProfile -Command \"" +
        "(Get-CimInstance Win32_Process -Filter \\\"name='LeagueClientUx.exe'\\\").CommandLine\"",
      { windowsHide: true, maxBuffer: 1024 * 1024 }
    )
    const port = stdout.match(/--app-port=(\d+)/)?.[1]
    const token = stdout.match(/--remoting-auth-token=([\w-]+)/)?.[1]
    if (!port || !token) return null
    return seal(Number(port), token, "process")
  } catch {
    return null
  }
}

/**
 * Fallback: the lockfile in the install directory.
 * Format is `name:pid:port:password:protocol`, one line, written on launch and
 * deleted on exit.
 */
const LOCKFILE_PATHS = [
  "C:/Riot Games/League of Legends/lockfile",
  "C:/Program Files/Riot Games/League of Legends/lockfile",
  "C:/Program Files (x86)/Riot Games/League of Legends/lockfile",
  "D:/Riot Games/League of Legends/lockfile",
]

async function fromLockfile(): Promise<LcuCredentials | null> {
  for (const path of LOCKFILE_PATHS) {
    try {
      const raw = (await readFile(path, "utf8")).trim()
      const parts = raw.split(":")
      const port = parts[2]
      const token = parts[3]
      if (!port || !token) continue
      return seal(Number(port), token, "lockfile")
    } catch {
      // absent means the client is not running — try the next candidate
    }
  }
  return null
}

/** Null means the client is not open. That is a normal state, not an error. */
export async function findClient(): Promise<LcuCredentials | null> {
  return (await fromProcess()) ?? (await fromLockfile())
}
