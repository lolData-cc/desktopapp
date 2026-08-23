/**
 * Checking for a newer version, and installing it when asked.
 *
 * Nothing here happens on its own except the CHECK. Downloading starts when the
 * player presses a button and restarting happens when they press another — an
 * app that decides for itself to close and reinstall mid-champion-select is an
 * app people uninstall.
 *
 * A failed check is not an error worth showing. The feed may be unreachable, the
 * machine may be offline, the CDN may be mid-deploy; none of that is the
 * player's problem and none of it stops the app working. It is reported to the
 * interface as a state, not as an alarm.
 */
import { app } from "electron"
import electronUpdater from "electron-updater"

const { autoUpdater } = electronUpdater

export type UpdateState =
  | { state: "idle"; version: string }
  | { state: "checking"; version: string }
  | { state: "current"; version: string; checkedAt: number }
  | { state: "available"; version: string; next: string; notes: string | null }
  | { state: "downloading"; version: string; next: string; percent: number }
  | { state: "ready"; version: string; next: string }
  | { state: "failed"; version: string; message: string }

type Emit = (s: UpdateState) => void

let emit: Emit = () => {}
let current: UpdateState

/** In development there is no packaged app to replace, so the whole feature is
 *  inert rather than pretending — electron-updater would throw on every call. */
export const canUpdate = (): boolean => app.isPackaged

export function initUpdater(onChange: Emit): UpdateState {
  emit = onChange
  current = { state: "idle", version: app.getVersion() }

  // Both off: the point of this module is that the player decides.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  const set = (s: UpdateState) => { current = s; emit(s) }
  const v = () => app.getVersion()

  autoUpdater.on("checking-for-update", () => set({ state: "checking", version: v() }))
  autoUpdater.on("update-not-available", () =>
    set({ state: "current", version: v(), checkedAt: Date.now() })
  )
  autoUpdater.on("update-available", (info) =>
    set({
      state: "available",
      version: v(),
      next: info.version,
      // releaseNotes can be a string or a list of objects; only a plain string
      // is worth showing, and anything else becomes "no notes" rather than
      // "[object Object]".
      notes: typeof info.releaseNotes === "string" ? info.releaseNotes : null,
    })
  )
  autoUpdater.on("download-progress", (p) =>
    set({
      state: "downloading",
      version: v(),
      next: current.state === "downloading" || current.state === "available" ? (current as any).next : "",
      percent: Math.round(p.percent),
    })
  )
  autoUpdater.on("update-downloaded", (info) =>
    set({ state: "ready", version: v(), next: info.version })
  )
  autoUpdater.on("error", (e) =>
    set({ state: "failed", version: v(), message: e?.message ?? "the update check failed" })
  )

  return current
}

export async function checkForUpdate(): Promise<void> {
  if (!canUpdate()) return
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    // Already surfaced by the error handler; swallowing here stops an
    // unhandled rejection taking the main process with it.
    void e
  }
}

export async function downloadUpdate(): Promise<void> {
  if (!canUpdate()) return
  try {
    await autoUpdater.downloadUpdate()
  } catch (e) {
    void e
  }
}

/**
 * Quit and install.
 *
 * `isSilent` true so the installer does not ask the questions it already asked
 * at install time, and `isForceRunAfter` true so the app comes BACK — an update
 * button that closes the app and leaves it closed is indistinguishable from a
 * crash.
 */
export function installUpdate(): void {
  if (!canUpdate()) return
  autoUpdater.quitAndInstall(true, true)
}
