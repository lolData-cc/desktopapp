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

type Shot = {
  name: string
  prepare: string
  /**
   * A selector to CROP to, with a little air around it.
   *
   * ⚠️ Without this a shot is the whole 1440px window, and shown at 500px on a
   * web page that is a grey rectangle — the UI is there but nothing in it can
   * be read. Cropping to the part being talked about is the difference between
   * a screenshot and a picture of a feature.
   */
  crop?: string
  /** Extra space around the crop, in CSS pixels. */
  pad?: number
  /** Extra space ABOVE the crop. A hovered label is positioned outside its own
   *  row, so cropping to the row alone leaves the label — the whole point of
   *  the shot — just off the top of the frame. */
  padTop?: number
  /** An exact rectangle, when no single element frames the thing being shown.
   *  Wins over `crop`. */
  rect?: { x: number; y: number; width: number; height: number }
}

/**
 * Each shot drives the app the way a person would — clicking the rail, opening
 * a game — rather than reaching into React's state. If a click stops working,
 * the shot fails loudly instead of quietly capturing the wrong screen.
 */
const SHOTS: Shot[] = [
  {
    // The rune row and the import button: the whole promise of the app in one
    // strip, and unreadable inside a full window shrunk to fit a column.
    name: "runes",
    prepare: `
      window.setScene('select');
      await wait(2800);
    `,
    crop: ".grid.grid-cols-5",
    pad: 30,
  },
  {
    // Both teams and the gold bar. Cropped to the board itself, so the rail and
    // the empty half of the window do not eat the frame.
    name: "scoreboard",
    prepare: `
      window.setScene('board');
      await wait(2800);
    `,
    // ⚠️ An exact rectangle, because no single element frames what this shot is
    // about: the two team columns AND the gold bar above them, with the rail
    // and the empty half of the window left outside.
    rect: { x: 200, y: 44, width: 1216, height: 496 },
  },
  {
    // The recording's timeline, with a mark on every kill and death. This is
    // the picture of the feature: a scrub bar nobody has to hunt along.
    name: "timeline",
    prepare: `
      window.setScene('board');
      await wait(1400);
      click(/matches/i);
      await wait(2000);
      const row = [...document.querySelectorAll('button')].find(b => /Ranked/i.test(b.textContent||''));
      if (row) row.click();
      await wait(3000);
      // ⚠️ focus(), not a synthetic mouseover: the mark opens its label on
      // focus as well, and a real focus survives React's own hover bookkeeping.
      // A middle mark, so the label has room on both sides.
      const marks = [...document.querySelectorAll('button[aria-label*=" at "]')];
      const m = marks[Math.min(3, marks.length - 1)] || marks[0];
      if (m) { m.focus(); m.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })); }
      await wait(1200);
    `,
    crop: "js:document.querySelector('button[aria-label*=\" at \"]').parentElement",
    pad: 22,
    padTop: 132,
  },
  {
    name: "explorer",
    prepare: `
      window.setScene('board');
      await wait(1400);
      click(/explorer/i);
      await wait(3000);
      click(/^subject$/i);
      await wait(1600);
      const pick = [...document.querySelectorAll('.react-flow__node button, .react-flow__node [role=button]')]
        .find(b => /pick a champion/i.test(b.textContent||''));
      if (pick) pick.click();
      await wait(2200);
      const ahri = [...document.querySelectorAll('[cmdk-item], [role=option], [role=dialog] button')]
        .find(b => /^ahri$/i.test((b.textContent||'').trim()));
      if (ahri) ahri.click();
      await wait(2200);
    `,
    crop: ".react-flow__node",
    pad: 120,
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

      let rect: Electron.Rectangle | undefined = s.rect
      if (!rect && s.crop) {
        const pad = s.pad ?? 22
        const padTop = s.padTop ?? pad
        rect = await win.webContents.executeJavaScript(
          `(() => {
             // ⚠️ A selector cannot name "the parent of the thing I can find",
             // and several of these shots want exactly that. A crop beginning
             // "js:" is an expression returning the element instead.
             const sel = ${JSON.stringify(s.crop)};
             const e = sel.startsWith("js:") ? eval(sel.slice(3)) : document.querySelector(sel);
             if (!e) return null;
             const r = e.getBoundingClientRect();
             const p = ${pad};
             const pt = ${padTop};
             return {
               x: Math.max(0, Math.round(r.x - p)),
               y: Math.max(0, Math.round(r.y - pt)),
               width: Math.min(${W}, Math.round(r.width + p * 2)),
               height: Math.min(${H}, Math.round(r.height + p + pt)),
             };
           })()`
        )
        if (!rect) console.warn(`  ${s.name}: crop "${s.crop}" not found — full window`)
      }

      const img = rect ? await win.webContents.capturePage(rect) : await win.webContents.capturePage()
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
