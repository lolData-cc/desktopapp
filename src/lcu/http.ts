/**
 * HTTP to the client, over `node:https` rather than `fetch`.
 *
 * This is not a style preference. `fetch(url, { tls: { rejectUnauthorized:
 * false } })` is a BUN EXTENSION: under Node — which is what Electron's main
 * process runs — the option is silently ignored and the client's self-signed
 * certificate is rejected with SELF_SIGNED_CERT_IN_CHAIN. Silently, because a
 * fetch that ignores an unknown option looks identical to one that honours it,
 * right up until the request fails.
 *
 * `node:https` works in both runtimes and takes the flag for real, so there is
 * one code path and no way for a dev-only runtime to flatter us again.
 */
import { request as httpsRequest } from "node:https"

export type HttpResult<T> = { status: number; data: T | null }

export function lcuFetch<T = unknown>(
  port: number,
  authHeader: string,
  method: string,
  path: string,
  body?: unknown
): Promise<HttpResult<T>> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))

    const req = httpsRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        // The client presents a self-signed certificate on loopback. Scoped to
        // this one request — never NODE_TLS_REJECT_UNAUTHORIZED, which would
        // switch off verification for the whole process and outlive the reason.
        rejectUnauthorized: false,
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (c: Buffer) => chunks.push(c))
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8")
          let data: T | null = null
          if (text) { try { data = JSON.parse(text) as T } catch { data = null } }
          resolve({ status: res.statusCode ?? 0, data })
        })
      }
    )

    req.on("error", reject)
    if (payload) req.write(payload)
    req.end()
  })
}
