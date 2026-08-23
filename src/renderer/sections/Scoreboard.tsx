import { CDN, type AppState, type LivePlayer } from "../types"

/**
 * Everyone in the game, ten rows, split by side.
 *
 * The one screen where the app should look like it belongs to League rather
 * than to a dashboard: two teams facing each other across a centre line, ours
 * in jade and theirs in red, champion portraits at the size the game uses them.
 * Everything else in this app is deliberately quiet; this is the part that is
 * meant to feel like the Rift.
 *
 * ⚠️ The gold figure is what a player is CARRYING, not what they have earned.
 * Sold items, spent consumables and the coins in their pocket are all invisible
 * to it. It is labelled "worth" for that reason — calling it gold earned would
 * be wrong in a way nobody watching could check.
 */
export default function Scoreboard({ s }: { s: AppState }) {
  const board = s.scoreboard
  if (!board) return null

  const patch = s.patch ?? "16.16.1"
  const ours = board.ours
  const theirs = board.theirs

  const sum = (rows: LivePlayer[], pick: (p: LivePlayer) => number) =>
    rows.reduce((n, p) => n + pick(p), 0)

  const ourKills = sum(ours, (p) => p.kills)
  const theirKills = sum(theirs, (p) => p.kills)
  const ourGold = sum(ours, (p) => p.worth)
  const theirGold = sum(theirs, (p) => p.worth)

  return (
    <div className="flex h-full flex-col">
      <Header
        clock={board.gameTime}
        ourKills={ourKills}
        theirKills={theirKills}
        ourGold={ourGold}
        theirGold={theirGold}
      />

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-x-6 overflow-y-auto pr-1">
        <Side rows={ours} patch={patch} side="ours" />
        <Side rows={theirs} patch={patch} side="theirs" />
      </div>
    </div>
  )
}

const OURS = "#00d992"
const THEIRS = "#ff6286"

function Header({
  clock,
  ourKills,
  theirKills,
  ourGold,
  theirGold,
}: {
  clock: number
  ourKills: number
  theirKills: number
  ourGold: number
  theirGold: number
}) {
  const lead = ourGold - theirGold
  const ahead = lead > 0
  return (
    <div className="shrink-0">
      <div className="flex items-end gap-4">
        <div className="flex-1">
          <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.24em] text-flash/30">your team</p>
          <p className="font-chakrapetch text-[30px] font-bold leading-none tabular-nums" style={{ color: OURS }}>
            {ourKills}
          </p>
        </div>

        <div className="shrink-0 text-center">
          <p className="font-jetbrains text-[9px] uppercase tracking-[0.24em] text-flash/25">elapsed</p>
          <p className="font-chakrapetch text-[22px] font-bold leading-none tabular-nums text-flash/80">
            {mmss(clock)}
          </p>
        </div>

        <div className="flex-1 text-right">
          <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.24em] text-flash/30">enemy team</p>
          <p className="font-chakrapetch text-[30px] font-bold leading-none tabular-nums" style={{ color: THEIRS }}>
            {theirKills}
          </p>
        </div>
      </div>

      {/* The gold bar, as one line: two shares of one width, meeting where the
          lead actually is rather than in the middle. */}
      <div className="mt-3 flex items-center gap-3">
        <span className="w-[64px] shrink-0 text-right font-chakrapetch text-[12.5px] font-bold tabular-nums" style={{ color: OURS }}>
          {short(ourGold)}
        </span>
        <span className="relative h-[4px] min-w-0 flex-1 overflow-hidden rounded-[2px] bg-flash/[0.06]">
          <span
            className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-500"
            style={{
              width: `${share(ourGold, theirGold) * 100}%`,
              background: "rgba(0,217,146,0.75)",
            }}
          />
          <span
            className="absolute inset-y-0 right-0 rounded-[2px] transition-[width] duration-500"
            style={{
              width: `${(1 - share(ourGold, theirGold)) * 100}%`,
              background: "rgba(255,98,134,0.6)",
            }}
          />
          <span className="absolute inset-y-[-3px] left-1/2 w-px bg-liquirice" />
        </span>
        <span className="w-[64px] shrink-0 font-chakrapetch text-[12.5px] font-bold tabular-nums" style={{ color: THEIRS }}>
          {short(theirGold)}
        </span>
      </div>

      <p className="mt-1.5 text-center font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/25">
        {lead === 0 ? (
          "even on items"
        ) : (
          <>
            <span style={{ color: ahead ? OURS : THEIRS }}>
              {short(Math.abs(lead))} {ahead ? "ahead" : "behind"}
            </span>
            <span className="text-flash/20"> · item worth on the board, not gold earned</span>
          </>
        )}
      </p>
    </div>
  )
}

function Side({ rows, patch, side }: { rows: LivePlayer[]; patch: string; side: "ours" | "theirs" }) {
  if (!rows.length) {
    return (
      <div className="grid place-items-center">
        <p className="font-chakrapetch text-[12px] text-flash/25">
          {side === "theirs" ? "no enemy team on the board" : "reading the board…"}
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {rows.map((p, i) => (
        <Card key={`${p.name}-${i}`} p={p} patch={patch} side={side} index={i} />
      ))}
    </div>
  )
}

function Card({
  p,
  patch,
  side,
  index,
}: {
  p: LivePlayer
  patch: string
  side: "ours" | "theirs"
  index: number
}) {
  const accent = side === "ours" ? OURS : THEIRS
  const tint = side === "ours" ? "rgba(0,217,146," : "rgba(255,98,134,"

  return (
    <div
      className="ds-row relative flex items-center gap-2.5 rounded-[3px] py-2 pl-2.5 pr-2.5"
      style={{
        background: p.isMe ? `${tint}0.09)` : `${tint}0.035)`,
        boxShadow: p.isMe ? `inset 2px 0 0 0 ${accent}` : `inset 1px 0 0 0 ${tint}0.30)`,
        animationDelay: `${index * 34}ms`,
      }}
    >
      {/* portrait, with the level where the game puts it */}
      <div className="relative shrink-0">
        {p.championId ? (
          <img
            src={`${CDN}/${patch}/img/champion/${p.championId}.png`}
            alt=""
            className={`h-[42px] w-[42px] rounded-[3px] ${p.dead ? "opacity-35 grayscale" : ""}`}
            style={{ boxShadow: `0 0 0 1px ${tint}0.35)` }}
          />
        ) : (
          <div className="h-[42px] w-[42px] rounded-[3px] bg-flash/[0.05]" />
        )}
        <span
          className="absolute -bottom-[3px] -left-[3px] grid h-[16px] min-w-[16px] place-items-center rounded-[2px] px-[3px] font-jetbrains text-[9px] font-bold leading-none tabular-nums text-liquirice"
          style={{ background: accent }}
        >
          {p.level || "—"}
        </span>

        {p.dead && (
          <span className="absolute inset-0 grid place-items-center rounded-[3px] bg-liquirice/55">
            <span className="font-chakrapetch text-[13px] font-bold tabular-nums text-flash/85">
              {p.respawnIn}
            </span>
          </span>
        )}
      </div>

      {/* who */}
      <div className="min-w-0 w-[104px] shrink-0">
        <p className="truncate font-chakrapetch text-[12.5px] font-bold leading-tight">
          {p.name}
          {p.isMe && <span className="ml-1 font-jetbrains text-[8px] uppercase tracking-[0.14em]" style={{ color: accent }}>you</span>}
        </p>
        <p className="truncate font-jetbrains text-[8.5px] uppercase tracking-[0.14em] text-flash/25">
          {p.position ? p.position.toLowerCase() : p.champion}
        </p>
      </div>

      {/* the numbers */}
      <div className="flex shrink-0 items-baseline gap-[3px] font-chakrapetch text-[13px] font-bold tabular-nums">
        <span className="text-flash/85">{p.kills}</span>
        <span className="text-flash/20">/</span>
        <span className="text-flash/50">{p.deaths}</span>
        <span className="text-flash/20">/</span>
        <span className="text-flash/85">{p.assists}</span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3.5">
        <Stat v={String(p.cs)} k={`${p.csPerMin.toFixed(1)}/m`} />
        <Stat v={short(p.worth)} k="worth" />

        {/* what they are holding — the reason to look at an enemy row at all */}
        <div className="flex w-[92px] shrink-0 flex-wrap content-center gap-[2px]">
          {p.items.slice(0, 6).map((id, i) => (
            <img
              key={`${id}-${i}`}
              src={`${CDN}/${patch}/img/item/${id}.png`}
              alt=""
              className="h-[14px] w-[14px] rounded-[2px]"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const Stat = ({ v, k }: { v: string; k: string }) => (
  <div className="w-[42px] text-right">
    <p className="font-chakrapetch text-[12.5px] font-bold leading-none tabular-nums text-flash/70">{v}</p>
    <p className="font-jetbrains text-[8px] uppercase tracking-[0.12em] text-flash/22">{k}</p>
  </div>
)

const mmss = (s: number): string => {
  const total = Math.max(0, Math.floor(s))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

const short = (g: number): string => (g >= 1000 ? `${(g / 1000).toFixed(1)}k` : String(Math.round(g)))

/** An empty board is 50/50 rather than a divide by zero. */
const share = (ours: number, theirs: number): number => {
  const total = ours + theirs
  return total > 0 ? ours / total : 0.5
}
