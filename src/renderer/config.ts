/**
 * What the ported Explorer expects to find at `@/config`.
 *
 * ⚠️ A SHIM, deliberately, and not a copy of the website's config module. That
 * file is ~200 lines of things this app has no use for — a site URL, share
 * images, Supabase keys, a light theme's assets — and copying it would put a
 * second, drifting definition of every one of them in a codebase that already
 * has its own. Only the five names the Explorer actually imports live here.
 *
 * ⚠️ The CDN VERSION is the one real difference from the site. The site keeps a
 * module-level `_cdnVersion` that a floating promise fills in, so `cdnBaseUrl()`
 * returns a stale value until that lands. This app already resolves the patch
 * properly — `currentPatch()` in src/data/champions.ts reads the same marker and
 * caches it — so the shim leans on that instead of running a second race.
 */
import { currentPatch } from "../data/champions"

const CDN_ORIGIN = "https://cdn2.loldata.cc"

/** Filled the first time the champion table loads, which every Explorer screen
 *  does before it can draw anything. Until then the fallback is used, and the
 *  fallback is only ever wrong about which patch's ART is served. */
let patch = "16.16.1"
export function cdnBaseUrl(): string {
  return `${CDN_ORIGIN}/${patch}`
}

/**
 * Settles when the patch is known.
 *
 * ⚠️ Awaited by callers that build URLs ONCE and keep them — a rune table, for
 * instance — where reading `cdnBaseUrl()` a moment too early bakes the fallback
 * patch into every image for the life of the session. Anything that rebuilds
 * its URL on each render does not need this.
 */
export const cdnVersionReady: Promise<string> = currentPatch()
  .then((p) => {
    patch = p
    return p
  })
  .catch(() => patch)

/** Rune and keystone art, at an UNVERSIONED path on our own CDN. */
export const PERK_CDN = `${CDN_ORIGIN}/img/perk-images`

/**
 * The box, always.
 *
 * ⚠️ No environment override here, unlike the site. The site can point this at a
 * local backend because it runs behind a Vite proxy in development; a packaged
 * desktop app has no proxy and no dev server, and an installed copy that tried
 * to reach localhost would simply fail. The box is the only address that is
 * true in every context this app runs in.
 */
export const EXPLORER_API_BASE_URL = "https://api2.loldata.cc"

/**
 * Champion names that Riot spells one way and the CDN files another.
 *
 * ⚠️ Kept as data rather than fixed at the call sites: the Explorer asks for
 * these by name in several places, and a table is the only shape where a
 * missing entry is a missing entry rather than a forgotten branch.
 */
const ICON_NAME_FIXES: Record<string, string> = {
  FiddleSticks: "Fiddlesticks",
}

const DISPLAY_NAME_FIXES: Record<string, string> = {
  MonkeyKing: "Wukong",
  Fiddlesticks: "Fiddlesticks",
  FiddleSticks: "Fiddlesticks",
}

export function normalizeChampName(name: string): string {
  return ICON_NAME_FIXES[name] ?? name
}

export function champDisplayName(name: string): string {
  return DISPLAY_NAME_FIXES[name] ?? name
}
