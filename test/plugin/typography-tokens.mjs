// plugin/typography-tokens.mjs — the ultimate-tokens PLUGIN gate for the typography-tokens
// consumption skill: every --type-*/--font-* token and .type-* class it names must match the type
// engine (voices·steps·props·fonts·count). The check lives WITH the skill
// (plugin/.../scripts/voice-parity.mjs) so the shipped plugin carries its own gate; this wrapper
// runs it in npm test so a voice/step change reddens the suite until the skill is serviced.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "plugin/ultimate-tokens/skills/typography-tokens/scripts/voice-parity.mjs");
if (!existsSync(SCRIPT)) { console.error("plugin FAIL: voice-parity.mjs missing"); process.exit(1); }

const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
if (r.status !== 0) { console.error("plugin FAIL: typography-tokens skill drifted from the type engine"); process.exit(1); }
console.log("plugin PASS — typography-tokens skill in parity with the type engine");
process.exit(0);
