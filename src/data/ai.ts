/**
 * lolData AI, over the same endpoint the website uses.
 *
 * It requires a signed-in account — verified against the live API, which
 * answers 401 "Sign in to use lolData AI." to an unauthenticated call — so the
 * app carries the session token rather than pretending the feature is open.
 *
 * The token goes in the Authorization header and nowhere else: not in a query
 * string, not in a log line, not in an error message handed back to the
 * interface.
 */
const API = "https://api2.loldata.cc"

export type ChatMessage = { role: "user" | "assistant"; content: string }

export type ChatResult =
  | { ok: true; reply: string }
  | { ok: false; reason: "signed-out" | "not-premium" | "no-credits" | "failed"; message: string }

/**
 * Distinguishes the reasons a request is refused, because they need different
 * answers from the interface: sign in, upgrade, wait for credits, or try again.
 * Lumping them into one "error" would leave the player guessing which.
 */
export async function askAi(
  token: string | null,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<ChatResult> {
  if (!token) {
    return { ok: false, reason: "signed-out", message: "Sign in to use lolData AI." }
  }

  let res: Response
  try {
    res = await fetch(`${API}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages }),
      signal,
    })
  } catch {
    return { ok: false, reason: "failed", message: "Could not reach lolData." }
  }

  const body = (await res.json().catch(() => null)) as
    | { reply?: string; message?: string; error?: string }
    | null

  if (res.ok && body?.reply) return { ok: true, reply: body.reply }

  // The API's own words where it has them: it knows why better than we do.
  const said = body?.error ?? body?.message ?? ""
  if (res.status === 401) return { ok: false, reason: "signed-out", message: said || "Sign in to use lolData AI." }
  if (res.status === 403) return { ok: false, reason: "not-premium", message: said || "lolData AI needs a premium plan." }
  if (res.status === 402 || /credit/i.test(said)) {
    return { ok: false, reason: "no-credits", message: said || "You are out of AI credits." }
  }
  return { ok: false, reason: "failed", message: said || `lolData AI returned ${res.status}.` }
}
