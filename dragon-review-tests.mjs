// Runs every Dragon review suite even when one fails; exits 1 if any failed.
import { spawnSync } from 'child_process'
const files = ['dragon-fuzz-tests.mjs', 'schwab-import-edge-tests.mjs', 'dragon-dates-prices-tests.mjs', 'dragon-security-tests.mjs']
let failed = 0
for (const f of files) {
  console.log(`\n=== ${f}`)
  if (spawnSync(process.execPath, [f], { stdio: 'inherit' }).status !== 0) failed++
}
console.log(`\n${files.length - failed}/${files.length} review suites green`)
process.exitCode = failed ? 1 : 0
