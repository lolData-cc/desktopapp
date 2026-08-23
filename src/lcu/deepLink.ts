/**
 * loldata:// links, as sent by the website.
 *
 * The site knows which page you are LOOKING at — which may not be the most
 * played one — so the link carries that exact page rather than a champion to go
 * and look up. Otherwise the button would import something other than what is
 * on screen, which is worse than having no button.
 *
 * ⚠️ Everything here arrives from a web page, which means from anywhere. A
 * crafted link is cheap to make and this code writes to the player's client, so
 * the payload is validated rather than trusted: nine perks, all of them ids
 * League actually publishes, styles that exist, and a champion name that cannot
 * carry anything but a name. A link that fails any of it is dropped whole — no
 * partial page, no "best effort".
 *
 * The blast radius is small by construction, since an import can only ever
 * replace a page we named. That is a reason to keep the validation, not to skip
 * it.
 */
import type { BuildPage } from "./runes"

export const PROTOCOL = "loldata"

export type RuneLink = {
  champion: string
  patch: string | null
  page: BuildPage
}

/** Riot's perk ids are five digits; the stat shards are the 5000s. */
const isPerkId = (n: number) => Number.isInteger(n) && n >= 5000 && n < 100000
const isStyleId = (n: number) => Number.isInteger(n) && n >= 8000 && n <= 8500

/** A champion name, and nothing that could be mistaken for anything else. */
const CHAMPION = /^[A-Za-z][A-Za-z0-9 '.&:-]{0,31}$/
/** "16.16.1" — nothing else goes in a page name we write. */
const PATCH = /^\d{1,2}\.\d{1,2}(\.\d{1,3})?$/

function ints(raw: string | null): number[] {
  if (!raw) return []
  return raw.split(",").map((p) => Number(p.trim()))
}

/**
 * Null for anything that is not a well-formed rune link — an unknown host, a
 * bad id, a name with characters a champion cannot have. The caller shows
 * nothing rather than guessing at intent.
 */
export function parseRuneLink(raw: string): RuneLink | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== `${PROTOCOL}:`) return null
  // loldata://runes?… — the host carries the verb, so other actions can be
  // added later without this function having to guess.
  if (url.hostname !== "runes") return null

  const q = url.searchParams
  const champion = (q.get("champion") ?? "").trim()
  if (!CHAMPION.test(champion)) return null

  const patch = (q.get("patch") ?? "").trim()

  const primaryStyle = Number(q.get("primary"))
  const subStyle = Number(q.get("sub"))
  if (!isStyleId(primaryStyle) || !isStyleId(subStyle)) return null
  if (primaryStyle === subStyle) return null

  const perks = ints(q.get("perks"))
  // Four primary, two secondary, three shards — the client's own shape, and a
  // page with any other count is rejected by it with an unhelpful error.
  if (perks.length !== 9 || !perks.every(isPerkId)) return null

  const primary = perks.slice(0, 4)
  const secondary = perks.slice(4, 6)
  const shards = perks.slice(6, 9)
  // Shards are the only ones with a range of their own, and mixing them up with
  // real perks produces a page the client accepts and the player did not ask for.
  if (!shards.every((id) => id >= 5000 && id < 6000)) return null
  if (primary.some((id) => id < 8000) || secondary.some((id) => id < 8000)) return null

  return {
    champion,
    patch: PATCH.test(patch) ? patch : null,
    page: {
      keystone: primary[0]!,
      primaryStyle,
      primary,
      subStyle,
      secondary,
      shards,
    },
  }
}

export type AuthLink = { token: string; email: string | null; tier: string | null }

/**
 * loldata://auth?token=… — a session handed back after signing in on the site.
 *
 * The token is a bearer credential, so it is shape-checked before being kept
 * and NEVER logged. A JWT is three dot-separated base64url segments; anything
 * else is refused rather than sent to the API to find out.
 *
 * This does not verify the signature — we are not the issuer and could not. The
 * API rejects a forged token, which is the check that matters; this one only
 * stops obvious rubbish from being stored and replayed.
 */
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/
const TIER = /^(free|premium|elite)$/i

export function parseAuthLink(raw: string): AuthLink | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== `${PROTOCOL}:` || url.hostname !== "auth") return null

  const token = (url.searchParams.get("token") ?? "").trim()
  if (!JWT.test(token) || token.length > 4096) return null

  const email = (url.searchParams.get("email") ?? "").trim()
  const tier = (url.searchParams.get("tier") ?? "").trim()

  return {
    token,
    email: EMAIL.test(email) ? email : null,
    tier: TIER.test(tier) ? tier.toLowerCase() : null,
  }
}

/** Which verb a link carries, without parsing it twice. */
export function linkKind(raw: string): "runes" | "auth" | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== `${PROTOCOL}:`) return null
    return u.hostname === "runes" ? "runes" : u.hostname === "auth" ? "auth" : null
  } catch {
    return null
  }
}

/** The first loldata:// argument Windows passed when it launched us. */
export function linkFromArgv(argv: string[]): string | null {
  return argv.find((a) => a.startsWith(`${PROTOCOL}://`)) ?? null
}
