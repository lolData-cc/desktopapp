import { useEffect, useState } from "react"
import { CDN, type AppState } from "../types"
import { runeTrees, shardRows, type Perk, type RuneTree } from "../../data/perks"
import { searchItems, type CatalogItem } from "../../data/itemCatalog"

/**
 * One champion's default page and default build.
 *
 * This is the screen that makes a profile a DECISION rather than a leftover: an
 * import gives you a starting point, and this is where it becomes yours. The
 * item order it produces is exactly what the in-game notices walk through, so
 * the order is the point rather than a detail — slot 1 is what you are told
 * about first.
 *
 * Nothing is written until Save. An editor that persisted on every click would
 * make "let me see what this looks like" destructive.
 */

type Draft = {
  primaryStyle: number
  subStyle: number
  /** Four, keystone first. */
  primary: number[]
  /** Two, from different rows. */
  secondary: number[]
  shards: number[]
}

const SIG = (d: Draft) =>
  `${d.primaryStyle}:${d.subStyle}:${[...d.primary, ...d.secondary, ...d.shards].join(",")}`

/** Null for anything that is not a complete page — a half-parsed one would be
 *  drawn as gaps and saved as a page the client refuses. */
function parseSignature(sig: string | null | undefined): Draft | null {
  if (!sig) return null
  const [p, sub, rest] = sig.split(":")
  const ids = (rest ?? "").split(",").map(Number)
  if (ids.length !== 9 || ids.some((n) => !Number.isFinite(n))) return null
  const primaryStyle = Number(p)
  const subStyle = Number(sub)
  if (!Number.isFinite(primaryStyle) || !Number.isFinite(subStyle)) return null
  return {
    primaryStyle,
    subStyle,
    primary: ids.slice(0, 4),
    secondary: ids.slice(4, 6),
    shards: ids.slice(6, 9),
  }
}

/** A page for a tree that has none yet: the first rune of every row. It is a
 *  real, legal page rather than an empty one, so switching trees never leaves
 *  the editor in a state that cannot be saved. */
const defaultPrimary = (tree: RuneTree) => tree.slots.slice(0, 4).map((row) => row[0]?.id ?? 0)
const defaultSecondary = (tree: RuneTree) => tree.slots.slice(1, 3).map((row) => row[0]?.id ?? 0)

export default function BuildEditor({
  s,
  championId,
  onBack,
}: {
  s: AppState
  championId: string
  onBack: () => void
}) {
  const profile = s.builds?.find((b) => b.championId === championId) ?? null
  const patch = s.patch ?? "16.16.1"

  const [trees, setTrees] = useState<RuneTree[]>([])
  const [shards, setShards] = useState<Perk[][]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [items, setItems] = useState<(number | null)[]>([null, null, null, null, null, null])
  const [picking, setPicking] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void runeTrees().then(setTrees)
    void shardRows().then(setShards)
  }, [])

  // Seeded from the profile once, NOT on every state push: the app sends state
  // constantly, and re-seeding each time would wipe an edit half made.
  useEffect(() => {
    const p = s.builds?.find((b) => b.championId === championId)
    if (!p) return
    setDraft(parseSignature(p.runes))
    const six = [...p.items.slice(0, 6)] as (number | null)[]
    while (six.length < 6) six.push(null)
    setItems(six)
    setDirty(false)
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [championId])

  const primaryTree = trees.find((t) => t.id === draft?.primaryStyle) ?? null
  const secondaryTree = trees.find((t) => t.id === draft?.subStyle) ?? null

  const touched = () => {
    setDirty(true)
    setSaved(false)
  }

  const edit = (fn: (d: Draft) => Draft) => {
    setDraft((d) => (d ? fn(d) : d))
    touched()
  }

  const setItem = (slot: number, id: number | null) => {
    setItems((prev) => prev.map((v, i) => (i === slot ? id : v)))
    touched()
  }

  const move = (slot: number, by: -1 | 1) => {
    const to = slot + by
    if (to < 0 || to > 5) return
    setItems((prev) => {
      const next = [...prev]
      const a = next[slot] ?? null
      next[slot] = next[to] ?? null
      next[to] = a
      return next
    })
    touched()
  }

  const save = async () => {
    const order = items.filter((v): v is number => !!v)
    await window.desktop.updateBuild(championId, order, draft ? SIG(draft) : null)
    setDirty(false)
    setSaved(true)
  }

  if (!profile) {
    return (
      <div className="grid h-full place-items-center">
        <p className="font-chakrapetch text-[13px] text-flash/35">This build is no longer saved.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="win-btn h-7 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/40"
        >
          back
        </button>

        <img
          src={`${CDN}/${patch}/img/champion/${profile.championId}.png`}
          alt=""
          className="h-9 w-9 rounded-[3px] ring-1 ring-jade/20"
        />
        <div>
          <h2 className="font-chakrapetch text-[19px] font-bold leading-none">{profile.championName}</h2>
          <p className="font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/25">
            {profile.enabled ? "notices on" : "notices off"}
            {profile.role ? ` · ${profile.role.toLowerCase()}` : ""}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {saved && (
            <span className="font-jetbrains text-[9px] uppercase tracking-[0.16em] text-jade/60">saved</span>
          )}
          <button
            type="button"
            disabled={!dirty}
            onClick={() => void save()}
            className="act-btn h-7 rounded-[3px] px-4 font-chakrapetch text-[11px] font-bold uppercase tracking-[0.12em]"
          >
            save
          </button>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {/* A setting rather than a hidden behaviour: it changes what the app
            tells you mid-game, and it costs a query each time the inventory
            moves, so it is the player's call. */}
        <button
          type="button"
          onClick={() => void window.desktop.smartBuild(championId, !profile.smart)}
          className="mb-5 flex w-full items-center gap-3 rounded-[3px] px-3 py-2.5 text-left transition"
          style={{
            background: profile.smart ? "rgba(0,217,146,0.06)" : "rgba(215,216,217,0.025)",
            boxShadow: profile.smart
              ? "inset 0 0 0 1px rgba(0,217,146,0.28)"
              : "inset 0 0 0 1px rgba(215,216,217,0.05)",
          }}
        >
          <span
            className="grid h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition"
            style={{ background: profile.smart ? "rgba(0,217,146,0.32)" : "rgba(215,216,217,0.10)" }}
          >
            <span
              className="h-4 w-4 rounded-full transition-transform"
              style={{
                background: profile.smart ? "#00d992" : "rgba(215,216,217,0.35)",
                transform: profile.smart ? "translateX(16px)" : "translateX(0)",
              }}
            />
          </span>

          <span className="min-w-0">
            <span className="block font-chakrapetch text-[13px] font-bold uppercase tracking-[0.1em]">
              smart build
            </span>
            <span className="block max-w-[64ch] font-chakrapetch text-[11.5px] leading-snug text-flash/35">
              If you buy something that is not in this plan, stop following it and ask what
              players who reached your actual inventory built next. Off, the order below is
              followed to the letter.
            </span>
          </span>
        </button>

        <Label>build order</Label>
        <p className="mb-2 max-w-[70ch] font-chakrapetch text-[11.5px] leading-snug text-flash/30">
          The order the in-game notices follow. You are told about slot 1 first, and only
          once you can actually afford it — components already in your inventory count
          towards the price.
        </p>

        <div className="flex flex-wrap gap-2">
          {items.map((id, i) => (
            <ItemSlot
              key={i}
              index={i}
              id={id}
              patch={patch}
              onPick={() => setPicking(i)}
              onClear={() => setItem(i, null)}
              onMove={(by) => move(i, by)}
            />
          ))}
        </div>

        <div className="mt-7">
          <Label>runes</Label>
        </div>

        {!draft ? (
          <div className="flex items-center gap-3 rounded-[3px] bg-flash/[0.03] px-4 py-3">
            <p className="font-chakrapetch text-[12px] text-flash/35">
              No page saved for {profile.championName} yet.
            </p>
            <button
              type="button"
              onClick={() => {
                const first = trees[0]
                const second = trees[1]
                if (!first || !second) return
                setDraft({
                  primaryStyle: first.id,
                  subStyle: second.id,
                  primary: defaultPrimary(first),
                  secondary: defaultSecondary(second),
                  shards: [5008, 5008, 5001],
                })
                touched()
              }}
              className="win-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-jade/70"
            >
              build one
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <TreeRow
                trees={trees}
                active={draft.primaryStyle}
                disabled={draft.subStyle}
                onPick={(t) => edit((d) => ({ ...d, primaryStyle: t.id, primary: defaultPrimary(t) }))}
              />
              {primaryTree && (
                <div className="mt-3 space-y-2.5">
                  {primaryTree.slots.slice(0, 4).map((row, ri) => (
                    <PerkRow
                      key={ri}
                      row={row}
                      big={ri === 0}
                      selected={draft.primary[ri] ?? 0}
                      onPick={(perk) =>
                        edit((d) => ({
                          ...d,
                          primary: d.primary.map((v, i) => (i === ri ? perk.id : v)),
                        }))
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <TreeRow
                trees={trees}
                active={draft.subStyle}
                disabled={draft.primaryStyle}
                onPick={(t) => edit((d) => ({ ...d, subStyle: t.id, secondary: defaultSecondary(t) }))}
              />
              {secondaryTree && (
                <div className="mt-3 space-y-2.5">
                  {secondaryTree.slots.slice(1, 4).map((row, i) => {
                    const ri = i + 1
                    const chosen = row.find((p) => draft.secondary.includes(p.id))
                    return (
                      <PerkRow
                        key={ri}
                        row={row}
                        big={false}
                        selected={chosen?.id ?? 0}
                        onPick={(perk) => edit((d) => pickSecondary(d, secondaryTree, ri, perk.id))}
                      />
                    )
                  })}
                  <p className="pt-0.5 font-jetbrains text-[8.5px] uppercase tracking-[0.14em] text-flash/20">
                    two, from different rows
                  </p>
                </div>
              )}

              <div className="mt-4 space-y-2.5">
                {shards.map((row, ri) => (
                  <PerkRow
                    key={ri}
                    row={row}
                    big={false}
                    small
                    selected={draft.shards[ri] ?? 0}
                    onPick={(perk) =>
                      edit((d) => ({
                        ...d,
                        shards: d.shards.map((v, i) => (i === ri ? perk.id : v)),
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {picking !== null && (
        <ItemPicker
          slot={picking}
          onClose={() => setPicking(null)}
          onChoose={(item) => {
            setItem(picking, item.id)
            setPicking(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * Choosing a secondary rune, keeping the page legal.
 *
 * The client allows exactly two, and never two from the same row. Rather than
 * refusing a click that would break either rule, the older pick gives way — a
 * picker that goes dead once you have two makes you work out which one to
 * remove first, when the click already said what you wanted.
 */
function pickSecondary(d: Draft, tree: RuneTree, row: number, perk: number): Draft {
  const rowOf = (id: number) => tree.slots.findIndex((slot) => slot.some((p) => p.id === id))
  const kept = d.secondary.filter((id) => rowOf(id) !== row)
  return { ...d, secondary: [...kept, perk].slice(-2) }
}

const Label = ({ children }: { children: string }) => (
  <p className="mb-1.5 font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">{children}</p>
)

function TreeRow({
  trees,
  active,
  disabled,
  onPick,
}: {
  trees: RuneTree[]
  active: number
  disabled: number
  onPick: (t: RuneTree) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {trees.map((t) => {
        const on = t.id === active
        const off = t.id === disabled
        return (
          <button
            key={t.id}
            type="button"
            disabled={off}
            title={off ? `${t.name} is the other tree` : t.name}
            onClick={() => onPick(t)}
            className={`grid h-8 w-8 place-items-center rounded-full transition ${
              on ? "bg-jade/15 ring-1 ring-jade/50" : off ? "opacity-15" : "opacity-45 hover:opacity-90"
            }`}
          >
            <img src={t.icon} alt="" className="h-5 w-5" />
          </button>
        )
      })}
    </div>
  )
}

function PerkRow({
  row,
  selected,
  big,
  small,
  onPick,
}: {
  row: Perk[]
  selected: number
  big: boolean
  small?: boolean
  onPick: (p: Perk) => void
}) {
  const box = big ? "h-10 w-10" : small ? "h-6 w-6" : "h-8 w-8"
  const img = big ? "h-9 w-9" : small ? "h-5 w-5" : "h-7 w-7"
  return (
    <div className="flex items-center gap-2">
      {row.map((p) => {
        const on = p.id === selected
        return (
          <button
            key={p.id}
            type="button"
            title={p.name}
            onClick={() => onPick(p)}
            className={`grid place-items-center rounded-full transition ${box} ${
              on ? "ring-1 ring-jade/60 brightness-110" : "opacity-35 hover:opacity-80"
            }`}
            style={on ? { background: "rgba(0,217,146,0.12)" } : undefined}
          >
            <img src={p.icon} alt="" className={img} />
          </button>
        )
      })}
    </div>
  )
}

function ItemSlot({
  index,
  id,
  patch,
  onPick,
  onClear,
  onMove,
}: {
  index: number
  id: number | null
  patch: string
  onPick: () => void
  onClear: () => void
  onMove: (by: -1 | 1) => void
}) {
  return (
    <div className="w-[74px]">
      <button
        type="button"
        onClick={onPick}
        className="relative grid h-[62px] w-[74px] place-items-center rounded-[3px] transition"
        style={{
          background: id ? "rgba(0,217,146,0.06)" : "rgba(215,216,217,0.03)",
          boxShadow: id
            ? "inset 0 0 0 1px rgba(0,217,146,0.28)"
            : "inset 0 0 0 1px rgba(215,216,217,0.06)",
        }}
      >
        <span className="absolute left-1.5 top-1 font-jetbrains text-[8.5px] tracking-[0.14em] text-flash/25">
          {index + 1}
        </span>
        {id ? (
          <img src={`${CDN}/${patch}/img/item/${id}.png`} alt="" className="h-9 w-9 rounded-[2px]" />
        ) : (
          <span className="font-jetbrains text-[15px] leading-none text-flash/20">+</span>
        )}
      </button>

      <div className="mt-1 flex items-center justify-center gap-0.5">
        <MiniBtn label="‹" onClick={() => onMove(-1)} disabled={index === 0} />
        <MiniBtn label="×" onClick={onClear} disabled={!id} />
        <MiniBtn label="›" onClick={() => onMove(1)} disabled={index === 5} />
      </div>
    </div>
  )
}

const MiniBtn = ({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="win-btn h-5 w-6 rounded-[2px] font-jetbrains text-[10px] leading-none text-flash/30 disabled:opacity-15"
  >
    {label}
  </button>
)

/**
 * The item picker.
 *
 * Search first, because 161 finished items is far too many to scan and everyone
 * already knows the name of the one they want.
 */
function ItemPicker({
  slot,
  onChoose,
  onClose,
}: {
  slot: number
  onChoose: (item: CatalogItem) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CatalogItem[]>([])

  useEffect(() => {
    let live = true
    void searchItems(query).then((r) => {
      if (live) setResults(r.slice(0, 80))
    })
    return () => {
      live = false
    }
  }, [query])

  // Escape closes it — a picker you can only leave by choosing something is a
  // trap when you opened it by mistake.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-10 py-10"
      style={{ background: "rgba(4,10,12,0.82)" }}
      onClick={onClose}
    >
      <div
        className="ds-enter flex max-h-full w-full max-w-[560px] flex-col rounded-[4px] p-4"
        style={{ background: "#0a1114", boxShadow: "inset 0 0 0 1px rgba(0,217,146,0.16)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-baseline gap-3">
          <p className="font-chakrapetch text-[15px] font-bold leading-none">Slot {slot + 1}</p>
          <p className="font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/25">
            {results.length} items
          </p>
          <button
            type="button"
            onClick={onClose}
            className="win-btn ml-auto h-6 rounded-[3px] px-2 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/30"
          >
            esc
          </button>
        </div>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items"
          className="mt-3 h-8 shrink-0 rounded-[3px] bg-flash/[0.04] px-3 font-chakrapetch text-[13px] text-flash outline-none placeholder:text-flash/20"
          style={{ boxShadow: "inset 0 0 0 1px rgba(0,217,146,0.14)" }}
        />

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(46px,1fr))] gap-1.5">
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                title={`${item.name} — ${item.cost}g`}
                onClick={() => onChoose(item)}
                className="grid place-items-center rounded-[3px] p-1 transition hover:bg-jade/10"
              >
                <img src={item.icon} alt="" className="h-9 w-9 rounded-[2px]" />
              </button>
            ))}
          </div>
          {!results.length && (
            <p className="py-6 text-center font-chakrapetch text-[12px] text-flash/25">
              Nothing matches that.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
