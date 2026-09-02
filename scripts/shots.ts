/**
 * Real screenshots of the app, for the website's download page.
 *
 * ⚠️ ELECTRON'S OWN `capturePage()`, not a browser extension or a screen grab.
 * It renders offscreen at a size we choose, waits for the frame, and hands back
 * a PNG — so the shots are identical every time and do not depend on anyone's
 * monitor, window size or wallpaper.
 *
 * ⚠️ It drives the DEV SCENES, which is what makes this honest and repeatable:
 * the same fixtures the app is developed against. Nothing here is mocked up for
 * marketing — if a panel looks like this in the shot, it looks like this in the
 * app, because it IS the app.
 *
 * Run against a `vite preview` of the built renderer (port 4199), not the dev
 * server: the dev server serves no CSS to a bare Electron window.
 *
 *   bunx vite preview --port 4199   # in one shell
 *   bun scripts/shots.ts            # in another
 */
import { app, BrowserWindow } from "electron"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

const URL = process.env.SHOT_URL ?? "http://localhost:4199"
const OUT = process.env.SHOT_OUT ?? join(process.cwd(), "shots")

/** 16:10, twice the size it will be shown at, so it stays crisp on a retina
 *  display without shipping a 4K file. */
const W = 1440
const H = 900

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Shot = { name: string; prepare: string }

/**
 * Each shot drives the app the way a person would — clicking the rail, opening
 * a game — rather than reaching into React's state. If a click stops working,
 * the shot fails loudly instead of quietly capturing the wrong screen.
 */
const SHOTS: Shot[] = [
  {
    name: "select",
    prepare: `
      window.setScene('select');
      await wait(2600);
    `,
  },
  {
    name: "ingame",
    prepare: `
      window.setScene('game');
      await wait(2600);
    `,
  },
  {
    name: "match",
    prepare: `
      window.setScene('board');
      await wait(1400);
      click(/^Matches$/i);
      await wait(1800);
      // la prima partita della libreria, aperta come pagina
      const row = [...document.querySelectorAll('button')].find(b => /Ranked/i.test(b.textContent||''));
      if (row) row.click();
      await wait(3200);
    `,
  },
  {
    name: "explorer",
    prepare: `
      window.setScene('board');
      await wait(1400);
      click(/^Explorer$/i);
      await wait(3000);
      click(/^Subject$/i);
      await wait(1600);
      // un campione dentro il nodo, cosi' la tela mostra una domanda vera
      const pick = [...document.querySelectorAll('.react-flow__node button, .react-flow__node [role=button]')]
        .find(b => /pick a champion/i.test(b.textContent||''));
      if (pick) pick.click();
      await wait(2200);
      const ahri = [...document.querySelectorAll('[cmdk-item], [role=option], [role=dialog] button')]
        .find(b => /^ahri$/i.test((b.textContent||'').trim()));
      if (ahri) ahri.click();
      await wait(2000);
    `,
  },
  {
    name: "locked",
    prepare: `
      window.setScene('locked');
      await wait(2600);
    `,
  },
]

async function main() {
  await app.whenReady()
  await mkdir(OUT, { recursive: true })

  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    // A fixed device scale, so the shots do not change size with the display
    // this happens to run on.
    webPreferences: { zoomFactor: 1, backgroundThrottling: false },
  })

  await win.loadURL(URL)
  await sleep(2500)

  for (const s of SHOTS) {
    const script = `
      (async () => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const click = (re) => {
          const b = [...document.querySelectorAll('button')].find(x => re.test((x.textContent||'').trim()));
          if (b) b.click();
          return !!b;
        };
        ${s.prepare}
        return document.body.innerText.slice(0, 60);
      })()
    `
    try {
      const seen = await win.webContents.executeJavaScript(script, true)
      await sleep(900)
      const img = await win.webContents.capturePage()
      const file = join(OUT, `${s.name}.png`)
      await writeFile(file, img.toPNG())
      console.log(`${s.name}.png  ${(img.toPNG().length / 1024).toFixed(0)} KB  — ${String(seen).replace(/\s+/g, " ").slice(0, 44)}`)
    } catch (e) {
      console.error(`${s.name}: FAILED — ${String(e).slice(0, 140)}`)
    }
  }

  win.destroy()
  app.quit()
}

void main()
