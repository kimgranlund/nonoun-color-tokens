// plugin/color-tokens.mjs — the ultimate-tokens PLUGIN skill gate: the color-tokens consumption
// skill must stay in parity with the product's canonical role table (every --c- token it names is a
// real role; the role count it claims matches). The check itself lives WITH the skill
// (plugin/.../scripts/role-parity.mjs) so the shipped plugin carries its own gate; this wrapper
// runs it inside npm test so a role change reddens the suite until the skill is serviced.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "plugin/ultimate-tokens/skills/color-tokens/scripts/role-parity.mjs");
if (!existsSync(SCRIPT)) { console.error("plugin FAIL: role-parity.mjs missing"); process.exit(1); }

const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
if (r.status !== 0) { console.error("plugin FAIL: color-tokens skill drifted from the role table"); process.exit(1); }
console.log("plugin PASS — color-tokens skill in parity with the canonical role table");
process.exit(0);
