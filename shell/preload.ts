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
})
