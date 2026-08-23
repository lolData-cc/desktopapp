import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

export default defineConfig({
  root: ".",
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "src/renderer") } },
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5199, strictPort: true },
})
