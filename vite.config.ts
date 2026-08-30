import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

export default defineConfig({
  root: ".",
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, "src/renderer") },
    // WARNING: .tsx and .ts BEFORE .js. The site worktree these files came from
    // carries a compiled .js beside every source, and Vite's default order
    // prefers .js - so an extensionless import would silently resolve to a
    // stale build artifact instead of the source next to it. Only the sources
    // were copied, and this makes a mistake there fail loudly.
    extensions: [".mjs", ".tsx", ".ts", ".jsx", ".js", ".json"],
  },
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5199, strictPort: true },
})
