/**
 * Dev launcher. Builds the main process, waits for Vite to actually answer, and
 * only then starts Electron — starting it first gives a blank window and a
 * confusing "did it break?" moment every single time.
 */
import { spawn } from "node:child_process"

const URL = "http://localhost:5199"

async function waitForVite(timeoutMs = 20_000): Promise<boolean> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const r = await fetch(URL, { signal: AbortSignal.timeout(800) })
      if (r.ok) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

const build = spawn("bun", ["run", "build:main"], { stdio: "inherit", shell: true })
await new Promise<void>((res) => build.on("exit", () => res()))

if (!(await waitForVite())) {
  console.error(`\n  vite never answered on ${URL} — is it running?\n`)
  process.exit(1)
}

const electron = spawn("bunx", ["electron", "."], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, VITE_DEV_SERVER_URL: URL },
})
electron.on("exit", (code) => process.exit(code ?? 0))
