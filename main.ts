// Emberline's hand-in script: it stages the playable game and its screenshots
// into the grader's output folder, then asks the kit library to describe that
// folder as a dossier. Node 22 runs this file as-is; nothing is installed and
// nothing is fetched, so the whole hand-in is local file copying plus one
// deterministic JSON document.
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-threejs.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const handInDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

mkdirSync(handInDir, { recursive: true });
for (const folder of ["game", "screenshots"]) {
  cpSync(join(repoRoot, folder), join(handInDir, folder), { recursive: true });
}

const dossier = buildDossier(handInDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(handInDir, "dossier.json"), dossier);

console.log(`Emberline handed in: ${handInDir} (${dossier.length} byte dossier)`);
