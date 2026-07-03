// plugin/geometry-tokens.mjs — the ultimate-tokens PLUGIN gate for the geometry-tokens consumption
// skill: every --size-*/--radius-*/--space-*/--inset-*/--gap-*/--border-*/--focus-* token and
// .control-* class it names must match the geometry engine. The check lives WITH the skill
// (plugin/.../scripts/dimension-parity.mjs); this wrapper runs it in npm test so a dimension change
// reddens the suite until the skill is serviced.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "plugin/ultimate-tokens/skills/geometry-tokens/scripts/dimension-parity.mjs");
if (!existsSync(SCRIPT)) { console.error("plugin FAIL: dimension-parity.mjs missing"); process.exit(1); }

const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
if (r.status !== 0) { console.error("plugin FAIL: geometry-tokens skill drifted from the geometry engine"); process.exit(1); }
console.log("plugin PASS — geometry-tokens skill in parity with the geometry engine");
process.exit(0);
