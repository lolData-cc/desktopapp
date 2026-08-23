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
  importRunes: () => ipcRenderer.invoke("runes:import"),
  chooseRunes: (index) => ipcRenderer.send("runes:choose", index),
  refreshProfile: () => ipcRenderer.invoke("profile:refresh"),
  signIn: () => ipcRenderer.send("account:signin"),
  signOut: () => ipcRenderer.invoke("account:signout"),
  askAi: (messages) => ipcRenderer.invoke("ai:ask", messages),
  openExternal: (url) => ipcRenderer.send("shell:open", url),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.send("update:install"),
  relaunch: () => ipcRenderer.send("app:relaunch"),
  demoGold: () => ipcRenderer.send("gold:demo"),
  calibrate: (patch) => ipcRenderer.send("hud:calibrate", patch),
  hint: (ability) => ipcRenderer.send("hud:hint", ability),
  report: (info) => ipcRenderer.send("overlay:report", info)
});
