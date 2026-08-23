// shell/preload.ts
import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  getState: () => ipcRenderer.invoke("state:get"),
  onState: (fn) => {
    const handler = (_e, s) => fn(s);
    ipcRenderer.on("state", handler);
    return () => ipcRenderer.off("state", handler);
  },
  minimise: () => ipcRenderer.send("win:minimise"),
  close: () => ipcRenderer.send("win:close"),
  pinOverlay: (on) => ipcRenderer.send("overlay:pin", on),
  demoOverlay: () => ipcRenderer.send("overlay:demo"),
  demoRecal: () => ipcRenderer.send("overlay:demo-recal"),
  importRunes: () => ipcRenderer.invoke("runes:import"),
  chooseRunes: (index) => ipcRenderer.send("runes:choose", index),
  refreshProfile: () => ipcRenderer.invoke("profile:refresh"),
  setSetting: (patch) => ipcRenderer.invoke("settings:set", patch),
  revealSettings: () => ipcRenderer.invoke("settings:reveal"),
  signIn: () => ipcRenderer.send("account:signin"),
  signOut: () => ipcRenderer.invoke("account:signout"),
  askAi: (messages) => ipcRenderer.invoke("ai:ask", messages),
  openExternal: (url) => ipcRenderer.send("shell:open", url),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.send("update:install"),
  relaunch: () => ipcRenderer.send("app:relaunch"),
  demoGold: () => ipcRenderer.send("gold:demo"),
  saveBuild: () => ipcRenderer.invoke("builds:save"),
  updateBuild: (id, items, runes) => ipcRenderer.invoke("builds:update", id, items, runes),
  toggleBuild: (id, on) => ipcRenderer.invoke("builds:toggle", id, on),
  deleteBuild: (id) => ipcRenderer.invoke("builds:delete", id),
  calibrate: (patch) => ipcRenderer.send("hud:calibrate", patch),
  calibrateTopRight: (patch) => ipcRenderer.send("hud:calibrate-topright", patch),
  hint: (ability) => ipcRenderer.send("hud:hint", ability),
  report: (info) => ipcRenderer.send("overlay:report", info)
});
