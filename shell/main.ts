/**
 * The shell.
 *
 * It owns the window and the League connection, and pushes a single snapshot of
 * OUR state to the renderer. The renderer never touches the LCU, never sees a
 * client URI, and never holds a credential — which is what keeps the shell
 * swappable. If this becomes Tauri later, this file is what gets rewritten;
 * everything under src/renderer keeps working untouched.
 */
import { app, BrowserWindow, ipcMain, shell } from "electron"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { LcuConnection, type Phase } from "../src/lcu/connection"
import { championById, currentPatch, type Champion } from "../src/data/champions"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEV_URL = process.env.VITE_DEV_SERVER_URL

/** Everything the interface is allowed to know. Our words, not Riot's. */
export type AppState = {
  client: "waiting" | "attached"
  summoner: { name: string; tag: string; level: number } | null
  phase: Phase | null
  patch: string | null
  select: {
    champion: Champion | null
    role: string | null
    allies: { locked: number; total: number }
    enemies: { locked: number; total: number }
  } | null
}

let state: AppState = {
  client: "waiting",
  summoner: null,
  phase: null,
  patch: null,
  select: null,
}

let win: BrowserWindow | null = null

function push(patch: Partial<AppState>): void {
  state = { ...state, ...patch }
  win?.webContents.send("state", state)
}

// ── the League connection ──────────────────────────────────────────────────

const lcu = new LcuConnection({
  onConnect: async () => {
    const [summoner, phase, patchVersion] = await Promise.all([
      lcu.currentSummoner(),
      lcu.phase(),
      currentPatch().catch(() => null),
    ])
    push({ client: "attached", summoner, phase, patch: patchVersion })

    // Pull what is already true. LCU events only fire on CHANGES, so attaching
    // mid-select would otherwise leave the window blank until someone locked in.
    if (phase === "ChampSelect") await readSelect(await lcu.champSelect())
  },

  onDisconnect: () => push({ client: "waiting", summoner: null, phase: null, select: null }),

  onEvent: (e) => {
    if (e.uri === "/lol-gameflow/v1/gameflow-phase") {
      const phase = e.data as Phase
      push({ phase, ...(phase === "ChampSelect" ? {} : { select: null }) })
      return
    }
    if (e.uri === "/lol-champ-select/v1/session") void readSelect(e.data)
  },
})

async function readSelect(data: unknown): Promise<void> {
  const s = data as any
  if (!s?.myTeam) return push({ select: null })

  const me = s.myTeam.find((p: any) => p.cellId === s.localPlayerCellId)
  if (!me) return push({ select: null })

  const locked = (t: any[]) => t.filter((p) => p.championId > 0).length
  const theirTeam = s.theirTeam ?? []

  push({
    select: {
      champion: await championById(me.championId),
      // Empty in customs and blind pick — the client only fills it for queues
      // that assign roles, so the interface has to cope with not knowing.
      role: me.assignedPosition || null,
      allies: { locked: locked(s.myTeam), total: s.myTeam.length },
      enemies: { locked: locked(theirTeam), total: theirTeam.length },
    },
  })
}

// ── window ─────────────────────────────────────────────────────────────────

function createWindow(): void {
  win = new BrowserWindow({
    width: 980,
    height: 620,
    minWidth: 760,
    minHeight: 520,
    show: false,
    // Frameless with our own title bar: a native chrome bar on a dark HUD reads
    // like two applications stacked on each other.
    frame: false,
    backgroundColor: "#040A0C",
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once("ready-to-show", () => win?.show())

  // External links open in the browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: "deny" }
  })

  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(join(__dirname, "../dist/index.html"))
}

// ── ipc ────────────────────────────────────────────────────────────────────

ipcMain.handle("state:get", () => state)
ipcMain.on("win:minimise", () => win?.minimize())
ipcMain.on("win:close", () => win?.close())

app.whenReady().then(async () => {
  createWindow()
  await lcu.start()
})

app.on("window-all-closed", () => {
  lcu.stop()
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
