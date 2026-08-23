/**
 * Claiming loldata:// on Windows.
 *
 * setAsDefaultProtocolClient reported success on a launch after which the key
 * was still absent from HKCU\Software\Classes, and present on a later one.
 * Whether that is a deferred write or a failed one was not established — which
 * is exactly why the result is VERIFIED rather than believed, and the
 * association written by hand when the key is genuinely missing. A link that
 * silently does nothing is the worst failure this feature has.
 *
 * Scope, deliberately: HKCU only. This is a per-user association — the same one
 * every installer makes for its own scheme — it needs no elevation, touches no
 * machine-wide or security setting, and is undone with one command:
 *
 *   reg delete "HKCU\Software\Classes\loldata" /f
 *
 * In a packaged build the installer would normally do this; a development run
 * has no installer, and the feature is untestable without it.
 *
 * ⚠️ The NAME Windows shows in "How do you want to open this link?" does not
 * come from the scheme key — it comes from the registered application, and with
 * nothing registered Windows falls back to the executable's own description.
 * In development that executable is electron.exe, so the prompt read "Open
 * Electron", which tells the player nothing about what is being opened or
 * whether they should trust it. `Application\ApplicationName` is the value
 * that fixes it, and it is written on BOTH paths — Electron's own registration
 * never sets it either.
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(execFile)
const KEY = (protocol: string) => `HKCU\\Software\\Classes\\${protocol}`

async function keyExists(protocol: string): Promise<boolean> {
  try {
    await run("reg", ["query", `${KEY(protocol)}\\shell\\open\\command`])
    return true
  } catch {
    return false
  }
}

export type ProtocolResult = {
  ok: boolean
  /** How it ended up registered, for the log — the two paths fail differently. */
  via: "electron" | "registry" | "none"
  command?: string
  /** Whether the prompt will name us rather than the executable. */
  named?: boolean
}

/**
 * What the open-with prompt calls us.
 *
 * Failure here is not fatal and never blocks the association: a link that works
 * under an ugly name beats a link that does not work.
 */
async function nameApplication(protocol: string, label: string, icon: string): Promise<boolean> {
  try {
    const key = `${KEY(protocol)}\\Application`
    await run("reg", ["add", key, "/v", "ApplicationName", "/d", label, "/f"])
    await run("reg", ["add", key, "/v", "ApplicationIcon", "/d", `${icon},0`, "/f"])
    await run("reg", ["add", `${KEY(protocol)}\\DefaultIcon`, "/ve", "/d", `${icon},0`, "/f"])
    // Shown as the type description in some Windows surfaces.
    await run("reg", ["add", KEY(protocol), "/v", "FriendlyTypeName", "/d", label, "/f"])
    return true
  } catch {
    return false
  }
}

/**
 * `launch` is what Windows should run: the executable, plus any arguments
 * needed before the URL. In development that is Electron plus the app
 * directory; packaged, it is just the binary.
 */
export async function ensureProtocol(
  protocol: string,
  electronClaimed: boolean,
  launch: { exe: string; args: string[]; label: string; icon: string }
): Promise<ProtocolResult> {
  if (electronClaimed && (await keyExists(protocol))) {
    // Registered, but by a call that does not name the application — so the
    // prompt would still say "Electron". Name it anyway.
    const named = await nameApplication(protocol, launch.label, launch.icon)
    return { ok: true, via: "electron", named }
  }

  // "%1" is the URL Windows substitutes. Every path is quoted separately, so a
  // space in the install path cannot split into two arguments.
  const parts = [launch.exe, ...launch.args, "%1"].map((p) => `"${p}"`).join(" ")

  try {
    await run("reg", ["add", KEY(protocol), "/ve", "/d", `URL:${protocol} Protocol`, "/f"])
    // The empty "URL Protocol" value is the flag that makes Windows treat this
    // key as a scheme at all. Without it the key is inert.
    await run("reg", ["add", KEY(protocol), "/v", "URL Protocol", "/d", "", "/f"])
    await run("reg", ["add", `${KEY(protocol)}\\shell\\open\\command`, "/ve", "/d", parts, "/f"])
  } catch {
    return { ok: false, via: "none" }
  }

  const named = await nameApplication(protocol, launch.label, launch.icon)

  return (await keyExists(protocol))
    ? { ok: true, via: "registry", command: parts, named }
    : { ok: false, via: "none" }
}
