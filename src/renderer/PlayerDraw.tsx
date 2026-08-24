import { useCallback, useEffect, useRef } from "react"

/**
 * Drawing on the frame.
 *
 * For pointing at things: the ward that was not there, the path somebody took,
 * the three people you did not see. It is what a coach does with a marker on a
 * screenshot, except the screenshot is the game you just played.
 *
 * ⚠️ Strokes are kept in FRACTIONS of the frame, not pixels. The panel resizes
 * — the window changes, fullscreen doubles it — and a circle drawn around the
 * dragon pit has to stay around the dragon pit. Stored in pixels it would slide
 * off the thing it was pointing at the moment anything moved.
 *
 * Nothing is saved. A drawing is a gesture made while talking about a game, not
 * a document, and a player that quietly accumulated annotations would be one
 * more thing to manage.
 */
export type Stroke = { x: number; y: number }[]

export default function PlayerDraw({
  active,
  strokes,
  onChange,
}: {
  active: boolean
  strokes: Stroke[]
  onChange: (strokes: Stroke[]) => void
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef<Stroke | null>(null)

  const paint = useCallback(() => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    const h = c.clientHeight
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#00d992"
    ctx.lineWidth = 3
    ctx.shadowColor = "rgba(0,217,146,0.65)"
    ctx.shadowBlur = 10

    const all = drawing.current ? [...strokes, drawing.current] : strokes
    for (const s of all) {
      if (s.length < 2) {
        if (s.length === 1) {
          ctx.beginPath()
          ctx.arc(s[0]!.x * w, s[0]!.y * h, 2, 0, Math.PI * 2)
          ctx.fillStyle = "#00d992"
          ctx.fill()
        }
        continue
      }
      ctx.beginPath()
      ctx.moveTo(s[0]!.x * w, s[0]!.y * h)
      for (const p of s.slice(1)) ctx.lineTo(p.x * w, p.y * h)
      ctx.stroke()
    }
  }, [strokes])

  useEffect(paint, [paint])

  // The panel changes size — the window, and fullscreen. Fractions survive it;
  // the canvas backing store has to be told.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ro = new ResizeObserver(() => paint())
    ro.observe(c)
    return () => ro.disconnect()
  }, [paint])

  const at = (e: React.PointerEvent) => {
    const box = canvas.current!.getBoundingClientRect()
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height }
  }

  return (
    <canvas
      ref={canvas}
      className="absolute inset-0 z-10 h-full w-full"
      style={{ pointerEvents: active ? "auto" : "none", cursor: active ? "crosshair" : undefined }}
      onPointerDown={(e) => {
        if (!active) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drawing.current = [at(e)]
        paint()
      }}
      onPointerMove={(e) => {
        if (!active || !drawing.current) return
        drawing.current.push(at(e))
        paint()
      }}
      onPointerUp={() => {
        if (!drawing.current) return
        const done = drawing.current
        drawing.current = null
        onChange([...strokes, done])
      }}
    />
  )
}
