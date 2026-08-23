/**
 * Packaging, with the output kept OUT of the synced folder.
 *
 * This project lives under OneDrive. Packaging extracts a few hundred Electron
 * binaries and then renames the directory they landed in; OneDrive locks files
 * while it uploads them, and the rename fails with EPERM — reliably, not
 * occasionally. Nothing about the build is wrong, the folder just is not a
 * place a build can safely write.
 *
 * So artifacts go to LOCALAPPDATA, which nothing syncs. The path is printed
 * rather than assumed, because a build whose output you cannot find is a build
 * that did not happen.
 *
 * Pass architectures through: `bun run dist -- --ia32` and so on. x64 is the
 * default and the only one that ships — League requires 64-bit Windows, so an
 * x86 build of a League companion has no possible user.
 */
import { spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

const base =
  process.env.LOCALAPPDATA ??
  process.env.XDG_CACHE_HOME ??
  join(process.env.HOME ?? ".", ".cache")

const out = join(base, "loldata-desktop-release")
mkdirSync(out, { recursive: true })

const passthrough = process.argv.slice(2)
const args = [
  "electron-builder",
  "--win",
  ...(passthrough.length ? passthrough : []),
  "--publish",
  "never",
  `-c.directories.output=${out}`,
]

console.log(`[dist] building into ${out}`)

const r = spawnSync("bunx", args, { stdio: "inherit", shell: true })
if (r.status !== 0) process.exit(r.status ?? 1)

console.log(`\n[dist] done — artifacts and latest.yml are in:\n       ${out}`)
