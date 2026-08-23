/**
 * The only surface the interface can reach. Deliberately four functions: the
 * renderer gets our state and two window controls, and nothing else — no
 * client, no credential, no arbitrary IPC channel.
 */
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("desktop", {
  getState: () => ipcRenderer.invoke("state:get"),
  onState: (fn: (s: unknown) => void) => {
    const handler = (_e: unknown, s: unknown) => fn(s)
    ipcRenderer.on("state", handler)
    return () => ipcRenderer.off("state", handler)
  },
  minimise: () => ipcRenderer.send("win:minimise"),
  close: () => ipcRenderer.send("win:close"),
  pinOverlay: (on: boolean) => ipcRenderer.send("overlay:pin", on),
  demoOverlay: () => ipcRenderer.send("overlay:demo"),
  demoRecal: () => ipcRenderer.send("overlay:demo-recal"),
  importRunes: () => ipcRenderer.invoke("runes:import"),
  chooseRunes: (index: number) => ipcRenderer.send("runes:choose", index),
  refreshProfile: () => ipcRenderer.invoke("profile:refresh"),
  setSetting: (patch: unknown) => ipcRenderer.invoke("settings:set", patch),
  revealSettings: () => ipcRenderer.invoke("settings:reveal"),
  model: (championId: string, key: number) => ipcRenderer.invoke("model:get", championId, key),
  ranks: (riotIds: string[], region: string | null) => ipcRenderer.invoke("ranks:get", riotIds, region),
  // Signing in opens a BROWSER. This surface deliberately has no way to send a
  // password anywhere — the site hands a session back over loldata://auth.
  signIn: () => ipcRenderer.send("account:signin"),
  signOut: () => ipcRenderer.invoke("account:signout"),
  askAi: (messages: unknown) => ipcRenderer.invoke("ai:ask", messages),
  openExternal: (url: string) => ipcRenderer.send("shell:open", url),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.send("update:install"),
  relaunch: () => ipcRenderer.send("app:relaunch"),
  demoGold: () => ipcRenderer.send("gold:demo"),
  saveBuild: () => ipcRenderer.invoke("builds:save"),
  updateBuild: (id: string, items: number[], runes: string | null) =>
    ipcRenderer.invoke("builds:update", id, items, runes),
  toggleBuild: (id: string, on: boolean) => ipcRenderer.invoke("builds:toggle", id, on),
  deleteBuild: (id: string) => ipcRenderer.invoke("builds:delete", id),
  calibrate: (patch: unknown) => ipcRenderer.send("hud:calibrate", patch),
  calibrateTopRight: (patch: unknown) => ipcRenderer.send("hud:calibrate-topright", patch),
  hint: (ability: string | null) => ipcRenderer.send("hud:hint", ability),
  // Diagnostic: the overlay says how big the surface it draws into really is,
  // because the shell only knows what it ASKED for, not what it got.
  report: (info: unknown) => ipcRenderer.send("overlay:report", info),
})
