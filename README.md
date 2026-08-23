# lolData Desktop

    bun run dev      # vite + electron together
    bun run probe    # the LCU connection on its own, in a terminal

The interface also runs in a plain browser (`bunx vite`, then
<http://localhost:5199>) against a stubbed shell — much faster to iterate on than
restarting Electron. `?state=waiting | lobby | select | game` jumps straight to a
state that would otherwise need a queue and a champion select to reach.

## Shape

    shell/          Electron: owns the window and the League connection
    src/lcu/        the ONLY code that speaks to the client
    src/data/       our own domain (champion identity, and later builds)
    src/renderer/   the interface — no client access, ever

Two boundaries are deliberate and worth keeping.

`src/lcu/` is the only place that knows what an `/lol-champ-select/v1/session`
is. Riot has announced a new integrated client after 2026 that replaces the one
the LCU *is*; when it lands we want to rewrite an adapter, not an application.

`shell/` is the only place that talks to Electron. The renderer receives a
snapshot of our own state over IPC and holds no credential, so moving to Tauri
later means rewriting one file.
