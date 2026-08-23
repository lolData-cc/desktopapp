import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

export default defineConfig({
  root: ".",
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "src/renderer") } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // ⚠️ Cursor SVGs must be EMITTED AS FILES, never inlined.
    //
    // Both are under the 4KB inline threshold, so Vite turned them into data
    // URIs — and Chromium does not reliably accept an SVG cursor from a data
    // URI. When it refuses one it falls back to `auto`, which is the Windows
    // arrow, and re-evaluating it on hover is what made the cursor flicker.
    // The website serves these as files and works, so the app does too.
    //
    // Emitted into dist/assets alongside the stylesheet, so the rewritten
    // relative URL still resolves under file://.
    assetsInlineLimit: (filePath: string) =>
      filePath.includes("cursors/") ? false : undefined,
  },
  server: { port: 5199, strictPort: true },
})
