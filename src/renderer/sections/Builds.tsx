import { useEffect, useState } from "react"
import { CDN, type AppState } from "../types"

/**
 * The builds you have kept.
 *
 * One per champion, because that is what a decision looks like: "this is how I
 * build Lillia". Keeping a history nobody asked for would turn a choice into a
 * list to manage.
 *
 * Enabled is what decides whether the shop notices fire during a game. Turning
 * one off means SILENCE on that champion, not a fallback to the live
 * calculation — an off switch that quietly substitutes something else is not an
 * off switch.
 */
export default function Builds({ s, onOpen }: { s: AppState; onOpen: (championId: string) => void }) {
  const builds = s.builds ?? []
  const patch = s.patch ?? "16.16.1"

  // Saving is only possible with something to save: a champion locked in and a
  // build worked out for it.
  const canSave = !!s.matchup?.slots.length && !!s.select?.champion

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-3">
        <h2 className="font-chakrapetch text-[22px] font-bold leading-none">Builds</h2>
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
          {builds.length ? `${builds.length} saved` : "none saved yet"}
        </p>

        {canSave && (
          <button
            type="button"
            onClick={() => void window.desktop.saveBuild()}
            className="act-btn ml-auto h-7 rounded-[3px] px-3 font-chakrapetch text-[11px] font-bold uppercase tracking-[0.12em]"
          >
            save {s.select!.champion!.name}
          </button>
        )}
      </div>

      {builds.length === 0 ? (
        <div className="grid flex-1 place-items-center px-8 text-center">
          <p className="max-w-[46ch] font-chakrapetch text-[13px] leading-relaxed text-flash/35">
            Import runes or a build from the site, or lock a champion in and let the
            app work one out against the enemy comp. Either saves a profile here, and
            clicking a profile lets you set its default page and item order — which is
            what the in-game notices then walk you through.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {builds.map((b, i) => (
            <Row key={b.championId} b={b} patch={patch} index={i} onOpen={() => onOpen(b.championId)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Row({
  b,
  patch,
  index,
  onOpen,
}: {
  b: AppState["builds"][number]
  patch: string
  index: number
  onOpen: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  // A delete that fires on the first click deletes things nobody meant to.
  useEffect(() => {
    if (!confirming) return
    const id = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(id)
  }, [confirming])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      title={`Edit ${b.championName}`}
      className="ds-row flex items-center gap-3 rounded-[3px] py-2 pl-3 pr-3 outline-none transition hover:brightness-125 focus-visible:ring-1 focus-visible:ring-jade/50"
      style={{
        background: b.enabled ? "rgba(0,217,146,0.05)" : "rgba(215,216,217,0.02)",
        boxShadow: b.enabled ? "inset 2px 0 0 0 rgba(0,217,146,0.55)" : undefined,
        animationDelay: `${Math.min(index, 12) * 28}ms`,
      }}
    >
      <img
        src={`${CDN}/${patch}/img/champion/${b.championId}.png`}
        alt=""
        className={`h-10 w-10 shrink-0 rounded-[3px] ring-1 ring-jade/15 ${b.enabled ? "" : "grayscale opacity-50"}`}
      />

      <div className="w-[112px] shrink-0">
        <p className="truncate font-chakrapetch text-[13px] font-bold leading-tight">{b.championName}</p>
        <p className="font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/25">
          {b.role?.toLowerCase() ?? "any role"}
          {b.patch ? ` · ${b.patch}` : ""}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {/* A rune import creates a profile with no items yet. Saying so beats
            an empty gap, which reads as something failing to load — and it says
            what to DO about it, since without items there are no notices. */}
        {b.items.length === 0 && (
          <span className="font-jetbrains text-[9px] uppercase tracking-[0.14em] text-citrine/40">
            runes only · click to add a build
          </span>
        )}
        {b.items.map((id, i) => (
          <img
            key={`${id}-${i}`}
            src={`${CDN}/${patch}/img/item/${id}.png`}
            alt=""
            className={`h-7 w-7 rounded-[2px] ${b.enabled ? "" : "grayscale opacity-50"}`}
          />
        ))}
        {b.runes && (
          <span className="ml-1 font-jetbrains text-[8.5px] uppercase tracking-[0.14em] text-jade/40">
            + runes
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          void window.desktop.toggleBuild(b.championId, !b.enabled)
        }}
        className={`win-btn h-6 shrink-0 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] ${
          b.enabled ? "bg-jade/15 text-jade" : "text-flash/30"
        }`}
      >
        {b.enabled ? "on" : "off"}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (confirming) void window.desktop.deleteBuild(b.championId)
          else setConfirming(true)
        }}
        className={`win-btn h-6 shrink-0 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] ${
          confirming ? "text-citrine" : "text-flash/25"
        }`}
      >
        {confirming ? "sure?" : "remove"}
      </button>
    </div>
  )
}
