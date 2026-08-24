// shell/preload.ts
import { contextBridge, ipcRenderer } from "electron";

// src/data/clip.ts
var CLIP_SCHEME = "loldata-clip";
var clipUrl = (id) => `${CLIP_SCHEME}://recording/${id}`;

// shell/preload.ts
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
  demoLoading: () => ipcRenderer.send("loading:demo"),
  calibrateLoading: (patch) => ipcRenderer.send("loading:calibrate", patch),
  importRunes: () => ipcRenderer.invoke("runes:import"),
  chooseRunes: (index) => ipcRenderer.send("runes:choose", index),
  refreshProfile: () => ipcRenderer.invoke("profile:refresh"),
  setSetting: (patch) => ipcRenderer.invoke("settings:set", patch),
  revealSettings: () => ipcRenderer.invoke("settings:reveal"),
  model: (championId, key) => ipcRenderer.invoke("model:get", championId, key),
  listRecordings: () => ipcRenderer.invoke("capture:list"),
  keepRecording: (id, keep) => ipcRenderer.invoke("capture:keep", id, keep),
  deleteRecording: (id) => ipcRenderer.invoke("capture:delete", id),
  revealRecording: (id) => ipcRenderer.invoke("capture:reveal", id),
  demoCapture: () => ipcRenderer.invoke("capture:demo"),
  clipUrl: (id) => clipUrl(id),
  makeClip: (req) => ipcRenderer.invoke("clip:make", req),
  revealClip: (file) => ipcRenderer.invoke("clip:reveal", file),
  forgetClip: () => ipcRenderer.invoke("clip:forget"),
  dragClip: (file) => ipcRenderer.send("clip:drag", file),
  revealClipFolder: () => ipcRenderer.invoke("clip:folder"),
  emptyRecordings: (includeKept) => ipcRenderer.invoke("storage:empty-recordings", includeKept),
  emptyClips: () => ipcRenderer.invoke("storage:empty-clips"),
  uninstall: () => ipcRenderer.invoke("app:uninstall"),
  ranks: (riotIds, region) => ipcRenderer.invoke("ranks:get", riotIds, region),
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
