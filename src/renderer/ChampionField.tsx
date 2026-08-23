import { useEffect, useRef, useState } from "react"
import { championById } from "../data/champions"
import type { AppState } from "./types"

/**
 * A champion splash re-materialised as a drifting field of jade points.
 *
 * The website does this on the homepage in WebGL, with three.js and 25k points
 * in real 3D. The app does the same THING with none of that: it has no 3D
 * dependency and no reason to grow one for a background, so this samples the
 * same way and draws to a 2D canvas.
 *
 * The relief is faked and honest about it — luminance becomes a depth, and
 * depth becomes a horizontal sway. Nothing rotates, but bright edges lead the
 * dark ones as it moves, which is the part the eye reads as turning.
 *
 * ⚠️ The image arrives as a DATA URL from the shell, never fetched here. Reading
 * pixels means getImageData, which throws on a canvas tainted by a cross-origin
 * image, and our CDN sits behind a cache known to serve copies without the CORS
 * header. See the art:splash handler.
 *
 * ⚠️ It stops dead when the window is hidden. This app sits in the background
 * for a whole game; a decorative rAF loop running behind League would be taking
 * frames from the thing the player actually cares about.
 */
type Point = { x: number; y: number; z: number; a: number }

/**
 * Whose art to show.
 *
 * The champion in front of you if there is one, otherwise the one from your
 * last game. Tying it to the session is the difference between decoration and
 * a page that knows who is looking at it — and it means the art changes on its
 * own, without a rotation nobody asked for.
 *
 * Null rather than a house champion when there is nothing to go on: a fixed
 * face on an empty screen is wallpaper.
 */
export function useArtChampion(s: AppState): string | null {
  const picked = s.select?.champion?.slug ?? null
  const lastKey = s.matches?.find((m) => !m.remake)?.championId ?? null
  const [fromMatch, setFromMatch] = useState<string | null>(null)

  useEffect(() => {
    if (!lastKey) return setFromMatch(null)
    let alive = true
    void championById(lastKey)
      .then((c) => { if (alive) setFromMatch(c?.slug ?? null) })
      .catch(() => { if (alive) setFromMatch(null) })
    return () => { alive = false }
  }, [lastKey])

  return picked ?? fromMatch
}

export default function ChampionField({
  championId,
  className,
}: {
  championId: string | null
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointsRef = useRef<Point[]>([])
  const fadeRef = useRef(0)

  // ── sample ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!championId) {
      pointsRef.current = []
      return
    }

    let alive = true
    void (async () => {
      const url = await window.desktop.splash(championId).catch(() => null)
      if (!alive || !url) return

      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => resolve(null)
        i.src = url
      })
      if (!alive || !img) return

      pointsRef.current = sample(img)
      fadeRef.current = 0
    })()

    return () => {
      alive = false
    }
  }, [championId])

  // ── draw ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let t = 0

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(r.width * dpr))
      canvas.height = Math.max(1, Math.round(r.height * dpr))
    }
    resize()
    window.addEventListener("resize", resize)

    const frame = () => {
      raf = requestAnimationFrame(frame)

      // Hidden means hidden: no work at all while a game has the screen.
      if (document.hidden) return

      const pts = pointsRef.current
      const { width: W, height: H } = canvas
      ctx.clearRect(0, 0, W, H)
      if (!pts.length) return

      t += 0.0016
      fadeRef.current = Math.min(1, fadeRef.current + 0.02)

      // Fit the sampled 0..1 field into the canvas, tall side leading, and push
      // it right so the figure sits away from the copy on the left.
      const scale = Math.max(W * 0.62, H * 0.95)
      const cx = W * 0.66
      const cy = H * 0.52

      const sway = Math.sin(t) * 14
      const bob = Math.cos(t * 0.7) * 6
      const breathe = 1 + Math.sin(t * 0.5) * 0.012

      ctx.globalCompositeOperation = "lighter"

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!
        // Depth leads the sway: the lit edges move further than the dark body,
        // which is what reads as relief without any actual rotation.
        const x = cx + (p.x - 0.5) * scale * breathe + p.z * sway
        const y = cy + (p.y - 0.5) * scale * breathe + p.z * bob
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue

        const a = p.a * fadeRef.current * (0.35 + p.z * 0.65)
        // Two-tone, as the site does it: jade body, near-white on the brightest
        // points, so the highlights carry the shape.
        ctx.fillStyle =
          p.z > 0.72
            ? `rgba(214,255,240,${a * 0.85})`
            : `rgba(0,217,146,${a * 0.6})`
        ctx.fillRect(x, y, 1.15, 1.15)
      }

      ctx.globalCompositeOperation = "source-over"
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  )
}

/**
 * Champion art → points, traced by EDGE rather than by brightness.
 *
 * ⚠️ This is the second attempt, and the first one is worth recording. It
 * thresholded on luminance, exactly as the website's homepage does — and it
 * produced random dots. The homepage gets away with it because its source is
 * CURATED: a near-monochrome figure on a black field, where "bright" and
 * "figure" are the same set of pixels. Champion art in general is a lit scene,
 * so a brightness threshold keeps half of the background too, and half a
 * background is noise.
 *
 * A gradient keeps the places where the image CHANGES — silhouette, armour
 * lines, the edge of a face — and drops flat areas whether they are bright or
 * dark. Outlines are also simply what the eye reads as a figure: a shape is its
 * contour long before it is its shading.
 *
 * Brightness is not discarded, it is demoted: it survives as the point's weight
 * so lit edges still lead the dark ones, which is what the sway needs to read
 * as relief.
 */
function sample(img: HTMLImageElement): Point[] {
  const W = 300
  const H = Math.max(1, Math.round((img.height / img.width) * W))

  const cv = document.createElement("canvas")
  cv.width = W
  cv.height = H
  const ctx = cv.getContext("2d", { willReadFrequently: true })
  if (!ctx) return []

  ctx.drawImage(img, 0, 0, W, H)

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, W, H).data
  } catch {
    // Tainted canvas. Should not happen with a data URL, and is a blank
    // background rather than a crash if it ever does.
    return []
  }

  // Luminance once, so the gradient below is three array reads per pixel
  // instead of nine multiplications.
  const lum = new Float32Array(W * H)
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = (0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!) / 255
  }

  // Sobel over the whole image first, because the threshold cannot be chosen
  // until the gradients are known.
  const grad = new Float32Array(W * H)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      const gx =
        -lum[i - W - 1]! - 2 * lum[i - 1]! - lum[i + W - 1]! +
        lum[i - W + 1]! + 2 * lum[i + 1]! + lum[i + W + 1]!
      const gy =
        -lum[i - W - 1]! - 2 * lum[i - W]! - lum[i - W + 1]! +
        lum[i + W - 1]! + 2 * lum[i + W]! + lum[i + W + 1]!
      grad[i] = Math.sqrt(gx * gx + gy * gy) / 4
    }
  }

  /**
   * ⚠️ The threshold is chosen PER IMAGE, as a percentile, not fixed.
   *
   * A constant was the first version's second mistake. Champion art is lit
   * wildly differently: measured on the real files, keeping the top 6% of
   * gradients means a cut of 0.082 on Nocturne and 0.129 on Lillia. One number
   * either buries the dark champions in nothing or drowns the bright ones in
   * texture — 0.34 gave Nocturne 896 points out of 90,000, which is why it
   * looked like scattered dots rather than anyone.
   *
   * A histogram walked from the top is O(n) and needs no sort.
   */
  const KEEP = 0.06
  const BINS = 256
  const hist = new Int32Array(BINS)
  for (let i = 0; i < grad.length; i++) {
    hist[Math.min(BINS - 1, (grad[i]! * BINS) | 0)]!++
  }
  const target = Math.round(grad.length * KEEP)
  let acc = 0
  let cut = BINS - 1
  for (let b = BINS - 1; b >= 0; b--) {
    acc += hist[b]!
    if (acc >= target) {
      cut = b
      break
    }
  }
  const EDGE = cut / BINS

  const raw: Point[] = []
  const aspect = W / H

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      const g = grad[i]!
      if (g < EDGE) continue

      raw.push({
        x: (x / W - 0.5) * aspect + 0.5,
        y: y / H,
        // Depth from BRIGHTNESS, not from the edge: a lit rim should lead a
        // shadowed one even when both are hard lines.
        z: Math.min(1, lum[i]! * 1.35),
        a: Math.min(1, 0.34 + g * 1.4),
      })
    }
  }

  // A busy champion can trace forty thousand edge pixels and a plain one four
  // thousand. Thinning to a budget keeps the frame cost flat and, because it
  // thins EVENLY, keeps the shape — dropping the weakest instead would erase
  // whole soft edges and leave the loud ones looking like litter.
  const BUDGET = 9000
  if (raw.length <= BUDGET) return raw

  const step = raw.length / BUDGET
  const out: Point[] = []
  for (let i = 0; i < raw.length; i += step) out.push(raw[Math.floor(i)]!)
  return out
}
