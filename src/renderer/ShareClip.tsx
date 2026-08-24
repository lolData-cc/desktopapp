import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { KIND } from "./PlayerMarks"
import { mmss, type AppState, type Recording } from "./types"

/**
 * Cutting a moment out to send somebody.
 *
 * ⚠️ The choice is a MOMENT, not a time range. Somebody sharing a kill does not
 * want to hunt for 14:32 on a scrub bar — they want "that triple", and the
 * recording already knows when that was. The marks are the menu; the seconds
 * around them are the only adjustment worth offering.
 *
 * ⚠️ And it says the SIZE before it makes anything. A clip that turns out to be
 * 14 MB is a clip Discord refuses after you have waited for it, so the estimate
 * is on the button and the limit that matters is named beside it.
 */
const BEFORE = 8000
const AFTER = 6000

/** Roughly what a second of the export weighs — 3 Mbit of video plus audio.
 *  Used only to warn before the wait, never reported as a fact afterwards. */
const BYTES_PER_SECOND = 3_000_000 / 8

export default function ShareClip({
  rec,
  s,
  onClose,
}: {
  rec: Recording
  s: AppState
  onClose: () => void
}) {
  const marks = useMemo(() => [...rec.highlights].sort((a, b) => a.at - b.at), [rec.highlights])
  const [pick, setPick] = useState(0)
  const [pad, setPad] = useState(0)

  const at = marks[pick]?.at ?? Math.floor(rec.durationMs / 2)
  const fromMs = Math.max(0, at - BEFORE - pad * 1000)
  const toMs = Math.min(rec.durationMs, at + AFTER + pad * 1000)
  const seconds = Math.max(1, Math.round((toMs - fromMs) / 1000))
  const guess = seconds * BYTES_PER_SECOND

  const clip = s.clip
  const working = clip.state === "working"

  // Leaving with a finished clip on the panel should not leave it on the next
  // one; the state belongs to this act of sharing.
  useEffect(() => () => { void window.desktop.forgetClip() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !working) onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [working, onClose])

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center" style={{ background: "rgba(1,11,13,0.86)", backdropFilter: "blur(8px)" }}>
      <div className="clip-arrive w-[560px] px-7 py-6" style={{ background: "rgba(4,10,12,0.96)", boxShadow: "inset 0 0 0 1px rgba(0,217,146,0.22), inset 0 0 30px rgba(0,217,146,0.05)" }}>
        <div className="flex items-baseline gap-3">
          <h3 className="font-chakrapetch text-[17px] font-bold leading-none">Share a moment</h3>
          <p className="font-jetbrains text-[9px] uppercase tracking-[0.18em] text-flash/30">
            {rec.championName ?? "recording"}
          </p>
          {!working && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="win-btn danger ml-auto grid h-7 w-7 place-items-center rounded-[3px] text-flash/40"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
                <path d="M1 1 L10 10 M10 1 L1 10" stroke="currentColor" strokeWidth="1.3" fill="none" />
              </svg>
            </button>
          )}
        </div>

        {clip.state === "done" ? (
          <Done file={clip.file} bytes={clip.bytes} seconds={clip.seconds} onAgain={() => void window.desktop.forgetClip()} />
        ) : (
          <>
            <p className="mt-2 max-w-[56ch] font-chakrapetch text-[11.5px] leading-snug text-flash/30">
              A whole game is over a gigabyte and nothing will carry it. This cuts out
              the seconds around one moment — small enough to send anywhere.
            </p>

            {marks.length === 0 ? (
              <p className="mt-5 font-chakrapetch text-[12.5px] text-flash/40">
                Nothing was marked in this game, so there is no moment to cut around.
              </p>
            ) : (
              <>
                <p className="mb-2 mt-5 font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/30">
                  which moment
                </p>
                <div className="flex max-h-[124px] flex-wrap gap-1.5 overflow-y-auto pr-1">
                  {marks.map((mk, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={working}
                      onClick={() => setPick(i)}
                      className="px-2.5 py-1.5 text-left transition disabled:opacity-40"
                      style={{
                        background: i === pick ? "rgba(0,217,146,0.10)" : "rgba(215,216,217,0.03)",
                        boxShadow: `inset 2px 0 0 0 ${i === pick ? KIND[mk.kind].colour : "transparent"}`,
                      }}
                    >
                      <span className="block font-jetbrains text-[8.5px] uppercase tracking-[0.16em]" style={{ color: KIND[mk.kind].colour }}>
                        {KIND[mk.kind].label}
                      </span>
                      <span className="block font-chakrapetch text-[12px] font-bold tabular-nums leading-tight text-flash/70">
                        {mmss(mk.at / 1000)}
                      </span>
                    </button>
                  ))}
                </div>

                <p className="mb-2 mt-5 font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/30">
                  how much around it
                </p>
                <div className="flex gap-1.5">
                  {[0, 5, 12].map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={working}
                      onClick={() => setPad(p)}
                      className="h-8 px-3.5 font-jetbrains text-[9.5px] uppercase tracking-[0.14em] transition disabled:opacity-40"
                      style={{
                        background: pad === p ? "rgba(0,217,146,0.10)" : "rgba(215,216,217,0.03)",
                        color: pad === p ? "#00d992" : "rgba(215,216,217,0.45)",
                      }}
                    >
                      {p === 0 ? "just the moment" : `+${p}s either side`}
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={working}
                    onClick={() =>
                      void window.desktop.makeClip({
                        recordingId: rec.id,
                        fromMs,
                        toMs,
                        label: `${rec.championName ?? "clip"} ${KIND[marks[pick]!.kind].label}`,
                      })
                    }
                    className="act-btn h-9 rounded-[3px] px-6 font-chakrapetch text-[12px] font-bold uppercase tracking-[0.16em] disabled:opacity-50"
                  >
                    {working ? "cutting…" : `cut ${seconds}s`}
                  </button>

                  <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.14em] text-flash/30">
                    {mmss(fromMs / 1000)}–{mmss(toMs / 1000)} · about {Math.max(1, Math.round(guess / 1048576))} MB
                    {guess > 10 * 1048576 && (
                      <span className="ml-2 text-citrine/70">over Discord's 10 MB</span>
                    )}
                  </p>
                </div>

                {working && (
                  <div className="mt-4">
                    <div className="h-[3px] w-full" style={{ background: "rgba(215,216,217,0.1)" }}>
                      <div
                        className="h-full transition-[width] duration-200"
                        style={{ width: `${Math.round(clip.fraction * 100)}%`, background: "#00d992" }}
                      />
                    </div>
                    {/* ⚠️ Said out loud, because it is not obvious and it looks
                        like a hang otherwise: the segment is re-encoded by
                        playing it, so it takes about as long as it lasts. */}
                    <p className="mt-2 font-chakrapetch text-[11.5px] text-flash/30">
                      Re-encoding the segment — it takes about as long as the clip does.
                    </p>
                  </div>
                )}

                {clip.state === "failed" && (
                  <p className="mt-4 px-3 py-2 font-chakrapetch text-[12px] text-citrine/80" style={{ background: "rgba(255,182,21,0.07)" }}>
                    {clip.message}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

/**
 * The finished clip.
 *
 * ⚠️ Dragging it out of the window is the whole point. Everything else —
 * reveal it, find it in Explorer, attach it — is four steps for something that
 * should be one gesture, and the app already has the file.
 */
function Done({
  file,
  bytes,
  seconds,
  onAgain,
}: {
  file: string
  bytes: number
  seconds: number
  onAgain: () => void
}) {
  const mb = bytes / 1048576
  const name = file.split(/[\\/]/).pop() ?? "clip.mp4"

  return (
    <div className="mt-5">
      <div
        draggable
        onDragStart={(e) => {
          e.preventDefault()
          window.desktop.dragClip(file)
        }}
        title="Drag me into Discord"
        className="flex items-center gap-4 px-4 py-4"
        style={{ background: "rgba(0,217,146,0.06)", boxShadow: "inset 0 0 0 1px rgba(0,217,146,0.3)", cursor: "grab" }}
      >
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden className="shrink-0">
          <path d="M17 2 L32 17 L17 32 L2 17 Z" fill="rgba(0,217,146,0.10)" stroke="#00d992" strokeWidth="1.3" />
          <path d="M13.5 11 L23 17 L13.5 23 Z" fill="#00d992" />
        </svg>
        <div className="min-w-0">
          <p className="truncate font-chakrapetch text-[13.5px] font-bold text-flash/90">{name}</p>
          <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.14em] text-flash/35">
            {seconds}s · {mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`} · 720p
            {mb <= 10 && <span className="ml-2 text-jade/70">fits Discord</span>}
          </p>
          <p className="mt-1.5 font-chakrapetch text-[11.5px] text-flash/30">
            Drag this straight into a chat, or use the buttons below.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-1.5">
        <button
          type="button"
          onClick={() => void window.desktop.revealClip(file)}
          className="win-btn h-8 rounded-[3px] px-4 font-chakrapetch text-[11px] font-bold uppercase tracking-[0.14em] text-flash/60"
        >
          show in folder
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="win-btn h-8 rounded-[3px] px-4 font-chakrapetch text-[11px] font-bold uppercase tracking-[0.14em] text-flash/40"
        >
          cut another
        </button>
      </div>
    </div>
  )
}
