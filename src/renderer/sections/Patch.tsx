import { useEffect, useMemo, useState } from "react"
import { championById } from "../../data/champions"
import { CDN, type AppState } from "../types"

/**
 * What changed this patch, yours first.
 *
 * The list is long and most of it will never matter to you, so the champions
 * you have actually been playing are lifted to the top. That ordering is the
 * only thing the desktop app can do here that the website cannot — it knows
 * your recent games without being asked.
 *
 * ⚠️ The endpoint also returns a `prose` field and this deliberately ignores
 * it. Its entries are misattributed — the text filed under "Corki" is about the
 * Battle Pass — because the scrape matches on a patch number that DDragon and
 * Riot's marketing site do not agree on. Structured diffs are computed from
 * DDragon itself and are sound; the prose is not, and printing it would put
 * confident nonsense next to a champion's name.
 */
const API = "https://api2.loldata.cc"

type Change = {
  patch: string
  kind: string
  entity_key: string
  entity_name: string
  field: string
  label: string
  old_value: string
  new_value: string
  direction: "buff" | "nerf" | string
}

export default function Patch({ s }: { s: AppState }) {
  const [data, setData] = useState<{ patch: string; changes: Change[] } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const ctl = new AbortController()
    fetch(`${API}/api/patch-notes`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return setFailed(true)
        setData({ patch: j.patch ?? "", changes: Array.isArray(j.changes) ? j.changes : [] })
      })
      .catch(() => { if (!ctl.signal.aborted) setFailed(true) })
    return () => ctl.abort()
  }, [])

  /** Champions from recent games, so "yours" means played and not owned. */
  const [mine, setMine] = useState<Set<string>>(new Set())
  useEffect(() => {
    let alive = true
    const ids = [...new Set((s.matches ?? []).filter((m) => !m.remake).map((m) => m.championId))]
    void Promise.all(ids.map((id) => championById(id).catch(() => null))).then((cs) => {
      if (alive) setMine(new Set(cs.filter(Boolean).map((c) => c!.name)))
    })
    return () => { alive = false }
  }, [s.matches])

  const { yours, rest } = useMemo(() => {
    const byChampion = new Map<string, Change[]>()
    for (const c of data?.changes ?? []) {
      if (c.kind !== "champion") continue
      const list = byChampion.get(c.entity_name) ?? []
      list.push(c)
      byChampion.set(c.entity_name, list)
    }
    const all = [...byChampion.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    return {
      yours: all.filter(([name]) => mine.has(name)),
      rest: all.filter(([name]) => !mine.has(name)),
    }
  }, [data, mine])

  if (failed) return <Note>Could not reach lolData for this patch.</Note>
  if (!data) return <Note>Reading the patch…</Note>
  if (!yours.length && !rest.length) return <Note>No champion changes recorded for this patch.</Note>

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-3">
        <h2 className="font-chakrapetch text-[22px] font-bold leading-none">Patch {data.patch}</h2>
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
          {yours.length + rest.length} champions changed
        </p>
      </div>

      <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {yours.length > 0 && (
          <>
            <Heading>champions you play</Heading>
            {yours.map(([name, cs], i) => (
              <Card key={name} name={name} changes={cs} patch={s.patch} index={i} highlight />
            ))}
            <Heading>everything else</Heading>
          </>
        )}
        {rest.map(([name, cs], i) => (
          <Card key={name} name={name} changes={cs} patch={s.patch} index={i + yours.length} />
        ))}
      </div>
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <p className="pb-1 pt-3 font-jetbrains text-[9px] uppercase tracking-[0.22em] text-jade/45">
      {children}
    </p>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center px-8 text-center">
      <p className="max-w-[42ch] font-jetbrains text-[10px] uppercase leading-relaxed tracking-[0.18em] text-flash/25">
        {children}
      </p>
    </div>
  )
}

function Card({
  name,
  changes,
  patch,
  index,
  highlight = false,
}: {
  name: string
  changes: Change[]
  patch: string | null
  index: number
  highlight?: boolean
}) {
  const [slug, setSlug] = useState<string | null>(null)
  const v = patch ?? "16.16.1"

  // entity_key is DDragon's own champion id, which is the slug the icon path
  // wants — no lookup needed, and a wrong one just hides the image.
  useEffect(() => { setSlug(changes[0]?.entity_key ?? null) }, [changes])

  const buffs = changes.filter((c) => c.direction === "buff").length
  const nerfs = changes.filter((c) => c.direction === "nerf").length

  return (
    <div
      className="ds-row flex items-start gap-3 rounded-[3px] py-2 pl-3 pr-3"
      style={{
        background: highlight ? "rgba(0,217,146,0.05)" : "rgba(215,216,217,0.02)",
        boxShadow: highlight ? "inset 2px 0 0 0 rgba(0,217,146,0.55)" : undefined,
        animationDelay: `${Math.min(index, 14) * 24}ms`,
      }}
    >
      {slug ? (
        <img
          src={`${CDN}/${v}/img/champion/${slug}.png`}
          alt=""
          className="mt-[2px] h-8 w-8 shrink-0 rounded-[3px] ring-1 ring-jade/15"
          onError={(e) => { e.currentTarget.style.visibility = "hidden" }}
        />
      ) : (
        <span className="mt-[2px] h-8 w-8 shrink-0 rounded-[3px] bg-flash/[0.04]" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="font-chakrapetch text-[13px] font-bold leading-tight">{name}</p>
          {buffs > 0 && <Pill tone="#00d992">{buffs} buff{buffs > 1 ? "s" : ""}</Pill>}
          {nerfs > 0 && <Pill tone="#FFB615">{nerfs} nerf{nerfs > 1 ? "s" : ""}</Pill>}
        </div>

        <ul className="mt-1 space-y-[2px]">
          {changes.slice(0, 5).map((c, i) => (
            <li key={i} className="font-jetbrains text-[10px] tabular-nums leading-relaxed text-flash/40">
              {c.label}{" "}
              <span className="text-flash/25">{c.old_value}</span>
              <span className="mx-1 text-flash/20">→</span>
              <span style={{ color: c.direction === "buff" ? "#00d992" : c.direction === "nerf" ? "#FFB615" : undefined }}>
                {c.new_value}
              </span>
            </li>
          ))}
          {changes.length > 5 && (
            <li className="font-jetbrains text-[9px] text-flash/20">
              +{changes.length - 5} more
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded-[2px] px-1 font-jetbrains text-[8px] uppercase tracking-[0.12em]"
      style={{ color: tone, background: `${tone}1a` }}
    >
      {children}
    </span>
  )
}
