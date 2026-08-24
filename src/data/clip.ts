/**
 * How a recording is addressed.
 *
 * Shared by the shell, which answers on this scheme, and the renderer, which
 * puts the URL in a <video src>. One definition rather than the same string
 * typed on both sides — a scheme that only half the app agrees on is a video
 * player that silently shows nothing.
 *
 * ⚠️ An ID, never a path. The shell looks the id up in its own library, so a
 * URL cannot name a file outside it however it is spelled.
 */
export const CLIP_SCHEME = "loldata-clip"

export const clipUrl = (id: string): string => `${CLIP_SCHEME}://recording/${id}`
