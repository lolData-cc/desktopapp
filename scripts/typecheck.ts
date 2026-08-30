/**
 * Two type-checks, because there are two bodies of code here with two different
 * contracts.
 *
 * ⚠️ THE PORTED TREE IS A COPY, and its value is that it stays one. Everything
 * under src/renderer/{explorer,ui,hooks,constants,lib} is byte-for-byte the
 * website's, so a fix made in either place still applies to the other. This app
 * turns on `noUncheckedIndexedAccess`; the site does not, and that single
 * difference produces ~54 complaints — every one about indexing an array, none
 * of them a defect the site suffers from. Rewriting them would fork the copy on
 * its first day and turn every future Explorer change into a manual merge.
 *
 * So: the app's own code is checked STRICTLY and must be clean. The ported tree
 * is checked under the rules it was written to, and must also be clean. What is
 * NOT allowed is the third thing — the app's own code quietly losing the
 * stricter check because a copied file made it inconvenient.
 *
 * `tsconfig.json` excludes those directories, but TypeScript still follows
 * imports into them, so the strict pass reports them anyway. Its diagnostics are
 * filtered by path here rather than by turning the option off.
 */
import { spawnSync } from "node:child_process"

const PORTED = /src[\\/]renderer[\\/](explorer|ui|hooks|constants|lib)[\\/]/

function run(project: string): string {
  const r = spawnSync("bunx", ["tsc", "--noEmit", "-p", project], {
    encoding: "utf8",
    shell: true,
  })
  return `${r.stdout ?? ""}${r.stderr ?? ""}`
}

const strict = run("tsconfig.json")
  .split(/\r?\n/)
  .filter((l) => l.includes("error TS") && !PORTED.test(l))

const ported = run("tsconfig.ported.json")
  .split(/\r?\n/)
  .filter((l) => l.includes("error TS"))

for (const l of [...strict, ...ported]) console.log(l)

if (strict.length || ported.length) {
  console.log(`\n${strict.length} in the app, ${ported.length} in the ported tree`)
  process.exit(1)
}
console.log("clean — the app strictly, the ported tree under the site's rules")
