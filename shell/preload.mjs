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
  previewOverlay: (on) => ipcRenderer.send("overlay:preview", on),
  calibrate: (patch) => ipcRenderer.send("hud:calibrate", patch),
  hint: (ability) => ipcRenderer.send("hud:hint", ability),
  report: (info) => ipcRenderer.send("overlay:report", info)
});
