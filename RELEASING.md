# Releasing

## The short version

```bash
# 1. bump the version
#    package.json → "version": "0.0.2"

# 2. build
bun run dist

# 3. upload EVERYTHING from the output directory to the CDN under /desktop/
#    (the path is printed at the end of step 2)
```

That is the whole loop. Step 3 is the only part that needs credentials.

---

## What gets built

`bun run dist` produces three files, and **all three must be uploaded together**:

| file | why it matters |
|---|---|
| `lolData-Setup-<version>-x64.exe` | the installer people download |
| `latest.yml` | the feed the installed app polls. **Without it nobody ever updates** |
| `*.exe.blockmap` | lets an update download only the CHANGED blocks instead of the whole 100 MB |

Uploading the `.exe` without `latest.yml` means new users get the new version and
existing users never hear about it. Uploading `latest.yml` without the `.exe`
means every installed app offers an update that 404s. They go up together.

The output goes to `%USERPROFILE%\loldata-releases`, **not** into the project.

Two reasons, both learned the hard way:

- This repository lives under OneDrive, which locks files while it syncs them.
  Packaging extracts several hundred Electron binaries and then renames the
  directory, and OneDrive makes that rename fail with `EPERM` every time.
- `%LOCALAPPDATA%` was the first alternative and was worse: the build succeeded
  and produced a folder that was not visible to the rest of the machine. A
  release you cannot open is harder to notice than one that failed.

## Where it goes

`https://cdn2.loldata.cc/desktopapp/` — matching `publish.url` in
`electron-builder.yml`. The app asks for `latest.yml` there on every start.

Both the download page and the app read the version from that one file, so
neither can drift out of date behind a release.

## The CDN caches the installer for four hours

Measured, not assumed:

| file | content-type | Cloudflare |
|---|---|---|
| `latest.yml` | `text/yaml` | `DYNAMIC` — never cached, always fresh |
| `*.exe` | `application/octet-stream` | `max-age=14400`, so **cached for 4 hours** |
| `*.blockmap` | `application/octet-stream` | `DYNAMIC` — not cached |

The manifest updates instantly and the binary does not. That asymmetry is the
dangerous one: for up to four hours `latest.yml` can advertise a version whose
`.exe` Cloudflare is still serving from the old copy, and every update in that
window fails its hash check.

**A normal release does not hit this.** Bumping the version changes the
filename, and a filename nobody has requested cannot have a stale cache entry.

It only bites when the SAME filename is re-uploaded — fixing a bad build,
usually. When that happens, purge the cache for that URL in Cloudflare before
telling anyone, or wait out the four hours.

To tell a stale cache from a bad upload, ask twice:

```bash
# a query string forces a MISS, so this is what the ORIGIN holds
curl -sI "https://cdn2.loldata.cc/desktopapp/lolData-Setup-0.0.1-x64.exe?v=1" | grep -i content-length
# and this is what people actually get
curl -sI "https://cdn2.loldata.cc/desktopapp/lolData-Setup-0.0.1-x64.exe"     | grep -i content-length
```

Different numbers mean the upload worked and the cache is stale. The same
number means the upload did not.

## Architectures

x64 only, deliberately. League of Legends requires 64-bit Windows, so a machine
that cannot run this build cannot run the game it exists to sit beside. `ia32`
and `arm64` targets are written into `electron-builder.yml` and commented out —
one line each if that ever changes.

## Not signed

The installer is not code-signed, so Windows SmartScreen shows "Windows
protected your PC" on first run and some people will not click past it. The
download page says so plainly rather than letting it be a surprise.

Fixing it needs a certificate — OV is a few hundred a year and still needs
reputation to build up; EV skips that wait and costs more. It is a purchase, not
a build setting, which is why it is not done here.

## Testing an update before shipping one

The updater is inert in development (`app.isPackaged` is false), so this cannot
be tested with `bun start`. It takes two real builds:

1. build `0.0.1`, upload it, install it
2. bump to `0.0.2`, build, upload
3. reopen the installed `0.0.1` — the bar should appear within a few seconds

Nothing downloads or restarts on its own at any point. The check is automatic;
everything after it is a button.
