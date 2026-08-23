/**
 * Writing a rune page into the client.
 *
 * This is the one thing a companion app can do that the website cannot, and it
 * is squarely inside what Riot permits: a rune page is static data chosen
 * before the game, applied to the client, with no live state read and nothing
 * reacted to.
 *
 * ⚠️ The hard rule here is about someone else's data. Rune pages are the
 * player's, often carefully made, and slots are limited — three, for an account
 * that has not bought more. So:
 *
 *   - we only ever delete a page WE created, identified by its name
 *   - if there is no room and no page of ours, we STOP and say so
 *
 * We never pick one of the player's pages to sacrifice, not even the one that
 * looks least used. Getting that wrong destroys something a person built, and
 * "it had a generic name" is not consent.
 */
import type { LcuConnection } from "./connection"

/**
 * "Lillia - LolData 16.16.1".
 *
 * The patch is in the name on purpose: a rune page has no visible age in the
 * client, and a page built two patches ago looks exactly like a fresh one. This
 * way it is obvious at a glance, in the client's own page list, without us
 * needing to be running.
 *
 * The marker is CONTAINED in the name rather than prefixed, since the champion
 * comes first — and it is the only thing that makes a page replaceable by us.
 */
export const PAGE_MARKER = "LolData"

/**
 * A page reduced to what it IS, for recognising the same one later.
 *
 * Deliberately not an index: variant order is a popularity ranking that moves
 * between patches, so "the fourth one" means a different page next week. The
 * runes do not move.
 *
 * Pure, and kept out of the preferences module so it does not drag Electron in
 * and become untestable outside the app.
 */
export type PageSignature = string

export function signatureOf(p: {
  primaryStyle: number
  subStyle: number
  primary: number[]
  secondary: number[]
  shards: number[]
}): PageSignature {
  return `${p.primaryStyle}:${p.subStyle}:${[...p.primary, ...p.secondary, ...p.shards].join(",")}`
}

export const pageName = (champion: string, patch: string) =>
  `${champion} - ${PAGE_MARKER} ${patch}`

/** Ours to replace: named by us, and not locked by the client. */
const isOurs = (name: string) => name.toLowerCase().includes(PAGE_MARKER.toLowerCase())

export type RunePage = {
  id: number
  name: string
  isDeletable: boolean
  isEditable: boolean
  current: boolean
  primaryStyleId: number
  subStyleId: number
  selectedPerkIds: number[]
}

export type PerkInventory = {
  canAddCustomPage: boolean
  customPageCount: number
  ownedPageCount: number
}

/** A page as our backend describes it, before it becomes the client's shape. */
export type BuildPage = {
  keystone: number
  primaryStyle: number
  primary: number[]
  subStyle: number
  secondary: number[]
  shards: number[]
  games?: number
  winrate?: number
}

/**
 * The client wants ONE flat list of nine: four primary (the keystone first),
 * two secondary, three shards. Our backend already keeps them in that order, so
 * this is a concatenation — but it is checked, because a page with the wrong
 * count is rejected by the client with an error that explains nothing.
 */
export function toSelectedPerkIds(page: BuildPage): number[] {
  const ids = [...page.primary, ...page.secondary, ...page.shards]
  if (ids.length !== 9 || ids.some((id) => !Number.isFinite(id) || id <= 0)) {
    throw new Error(`a rune page needs 9 valid perks, got ${ids.length}`)
  }
  return ids
}

export async function listPages(lcu: LcuConnection): Promise<RunePage[]> {
  const { data } = await lcu.request<RunePage[]>("GET", "/lol-perks/v1/pages")
  return data ?? []
}

export async function inventory(lcu: LcuConnection): Promise<PerkInventory | null> {
  const { data } = await lcu.request<PerkInventory>("GET", "/lol-perks/v1/inventory")
  return data
}

export type ImportResult =
  | { ok: true; pageId: number; replaced: boolean }
  | { ok: false; reason: "no-room"; pages: { id: number; name: string }[] }
  | { ok: false; reason: "failed"; status: number; message: string }

/**
 * Put a page in the client and select it.
 *
 * Returns "no-room" rather than throwing when every slot is taken, because that
 * is not an error — it is a decision the player has to make, and the caller
 * needs the list of pages to be able to ask.
 */
export async function importPage(
  lcu: LcuConnection,
  champion: string,
  patch: string,
  page: BuildPage
): Promise<ImportResult> {
  const selectedPerkIds = toSelectedPerkIds(page)
  const name = pageName(champion, patch)

  const pages = await listPages(lcu)
  // Ours by name, and only if the client says it may be removed — a page can be
  // locked, and forcing it would fail anyway.
  const ourOld = pages.filter((p) => isOurs(p.name) && p.isDeletable)

  const inv = await inventory(lcu)
  const room = inv?.canAddCustomPage ?? false

  if (!room && ourOld.length === 0) {
    return {
      ok: false,
      reason: "no-room",
      pages: pages.map((p) => ({ id: p.id, name: p.name })),
    }
  }

  // Replace ours rather than accumulating one per champion — the name carries
  // the champion, so a new champion would otherwise mean a new page, and the
  // player has three slots and we are a guest in them.
  for (const old of ourOld) {
    await lcu.request("DELETE", `/lol-perks/v1/pages/${old.id}`).catch(() => undefined)
  }

  const created = await lcu.request<RunePage>("POST", "/lol-perks/v1/pages", {
    name,
    primaryStyleId: page.primaryStyle,
    subStyleId: page.subStyle,
    selectedPerkIds,
    current: true,
  })

  if (created.status >= 300 || !created.data?.id) {
    return {
      ok: false,
      reason: "failed",
      status: created.status,
      message: (created.data as unknown as { message?: string })?.message ?? "the client rejected the page",
    }
  }

  // Selecting it is a separate call: creating with current:true is honoured in
  // most client versions and quietly ignored in some, and a page that was
  // imported but not selected is the kind of thing nobody notices until they
  // are already in the game.
  await lcu
    .request("PUT", "/lol-perks/v1/currentpage", created.data.id)
    .catch(() => undefined)

  return { ok: true, pageId: created.data.id, replaced: ourOld.length > 0 }
}
