/**
 * Two volumes out of one stereo track.
 *
 * A recording made with split capture carries the game in its LEFT channel and
 * Discord in its RIGHT. Playing it back normally, you would hear the game out of
 * one ear and your friends out of the other. So the channels are pulled apart,
 * given a gain each, and put back to CENTRE — the file is a container for two
 * programmes, not a stereo image, and nothing about it should be heard as one.
 *
 * ⚠️ `crossOrigin` MUST be set before `src`, and this app was not setting it at
 * all. The page is not on the `loldata-clip` origin, and
 * `createMediaElementSource` on a cross-origin element that has not passed a
 * CORS check outputs SILENCE — not an error. The clip handler already sends
 * `Access-Control-Allow-Origin: *` on every response, so the check passes; the
 * attribute just has to be there first, which is why the element is left with no
 * `src` in the markup and given one here.
 *
 * ⚠️ IT VERIFIES ITSELF, and falls back to the plain element if it cannot. A
 * graph that produces silence is far worse than a single volume slider, and
 * several of the ways this can fail are silent by nature.
 */
import { useEffect, useRef, useState } from "react"

export type Channel = "game" | "voice"

export type SplitAudio = {
  /** True once the graph is running and has been heard to produce something. */
  live: boolean
  set: (ch: Channel, value: number) => void
  setMaster: (value: number) => void
}

export function useSplitAudio(
  video: React.RefObject<HTMLVideoElement | null>,
  src: string,
  enabled: boolean
): SplitAudio {
  const [live, setLive] = useState(false)
  const rig = useRef<{
    ctx: AudioContext
    game: GainNode
    voice: GainNode
    master: GainNode
    probe: AnalyserNode
  } | null>(null)

  useEffect(() => {
    const v = video.current
    if (!v) return

    // ⚠️ Order matters and is the whole reason this runs in an effect rather
    // than as JSX props: React sets attributes in declaration order, and `src`
    // arriving before `crossOrigin` is the silent-audio bug.
    if (enabled) v.crossOrigin = "anonymous"
    if (v.getAttribute("src") !== src) v.setAttribute("src", src)

    if (!enabled) return

    let ctx: AudioContext | null = null
    let cancelled = false

    try {
      ctx = new AudioContext()
      const source = ctx.createMediaElementSource(v)
      const splitter = ctx.createChannelSplitter(2)
      const merger = ctx.createChannelMerger(2)
      const game = ctx.createGain()
      const voice = ctx.createGain()
      const master = ctx.createGain()
      const probe = ctx.createAnalyser()
      probe.fftSize = 512

      source.connect(splitter)
      splitter.connect(game, 0)
      splitter.connect(voice, 1)

      // ⚠️ Each gain feeds BOTH merger inputs, so each programme is heard
      // CENTRED. Wired one-to-one the game would come out of the left speaker
      // and Discord out of the right, and turning one down would swing the
      // other across the stereo field — a volume control that moves what it is
      // not touching.
      for (const g of [game, voice]) {
        g.connect(merger, 0, 0)
        g.connect(merger, 0, 1)
      }
      merger.connect(master)
      master.connect(probe)
      master.connect(ctx.destination)

      // In split mode the ELEMENT is wide open and every level is a gain node.
      // Whether `.volume` still applies upstream of a MediaElementSource was
      // measured ambiguously — two probes disagreed — so nothing is bet on it.
      v.volume = 1
      v.muted = false

      rig.current = { ctx, game, voice, master, probe }
      void ctx.resume().catch(() => undefined)
      setLive(true)
    } catch {
      // A second MediaElementSource on the same element throws, and so does a
      // context the platform will not give us. Either way: no graph, one slider.
      rig.current = null
      setLive(false)
      return
    }

    /**
     * ⚠️ The check that this actually made a sound. Every failure mode above
     * this line is silent — a tainted element, a suspended context, a file whose
     * audio never decoded — so the graph is asked, once, whether anything came
     * through it while the video was playing. If nothing did, it is torn down
     * and the element goes back to driving its own volume.
     */
    const buf = new Uint8Array(512)
    let heard = false
    const watch = setInterval(() => {
      const r = rig.current
      if (cancelled || !r) return
      if (v.paused || v.currentTime === 0) return
      r.probe.getByteTimeDomainData(buf)
      for (let i = 0; i < buf.length; i++) {
        if (Math.abs(buf[i]! - 128) > 2) {
          heard = true
          break
        }
      }
      if (heard) {
        clearInterval(watch)
        return
      }
      // Give it four seconds of actual playback before giving up on it.
      if (v.currentTime > 4) {
        clearInterval(watch)
        rig.current = null
        setLive(false)
        v.volume = 1
        void r.ctx.close().catch(() => undefined)
      }
    }, 500)

    return () => {
      cancelled = true
      clearInterval(watch)
      rig.current = null
      setLive(false)
      void ctx?.close().catch(() => undefined)
    }
  }, [video, src, enabled])

  return {
    live,
    set: (ch, value) => {
      const r = rig.current
      if (!r) return
      ;(ch === "game" ? r.game : r.voice).gain.value = value
    },
    setMaster: (value) => {
      const r = rig.current
      if (!r) return
      r.master.gain.value = value
    },
  }
}
