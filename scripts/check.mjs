import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SCENES } from "../src/core/effects.js";
import { STARTER_DECKS, DEFAULT_CLIPS, splitAcrossDecks, uniqueClips } from "../src/data/playlists.js";
import { extractYouTubeVideoId, extractYouTubePlaylistId } from "../src/discovery/invidious-source.js";

function filesIn(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

for (const file of [...filesIn("src").filter(path => path.endsWith(".js")), "sw.js"]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

const html = readFileSync("index.html", "utf8");
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) throw new Error(`Duplicate HTML ids: ${[...new Set(duplicateIds)].join(", ")}`);

const referencedIds = [...readFileSync("src/main.js", "utf8").matchAll(/\$\("([^"]+)"\)/g)].map(match => match[1]);
const missingIds = [...new Set(referencedIds.filter(id => !ids.includes(id)))];
if (missingIds.length) throw new Error(`main.js references missing HTML ids: ${missingIds.join(", ")}`);

if (STARTER_DECKS.A.length < 6 || STARTER_DECKS.B.length < 6) throw new Error("Starter decks need enough clips for reliable Next and Random controls.");
if (new Set(DEFAULT_CLIPS.map(item => item.videoId)).size !== DEFAULT_CLIPS.length) throw new Error("Default clip library contains duplicate videos.");
if (uniqueClips().length !== DEFAULT_CLIPS.length) throw new Error("Built-in playlist de-duplication failed.");
const split = splitAcrossDecks(DEFAULT_CLIPS.slice(0, 5));
if (split.A.length !== 3 || split.B.length !== 2) throw new Error("Deck splitting failed.");

for (const requiredScene of ["Mirror Tunnel", "Kaleido Acid", "RGB Ghost", "Dream Trails", "Neon Edges", "Warp Drive"]) {
  if (!SCENES[requiredScene]) throw new Error(`Missing advanced effect scene: ${requiredScene}`);
}
if (!html.includes('id="ivj-edges"') || !html.includes('id="ivj-rgb-trails"')) throw new Error("SVG effect filters are missing.");
if (html.includes('data-panel="discover"') || html.includes('data-panel="audio"')) throw new Error("Removed Find/Audio panels are still present.");
for (const removed of ["src/core/audio.js", "src/discovery/ai-planner.js", "src/discovery/prompt-planner.js"]) {
  if (existsSync(removed)) throw new Error(`Removed module still exists: ${removed}`);
}

if (extractYouTubeVideoId("https://youtu.be/3pxrECZYEAA") !== "3pxrECZYEAA") throw new Error("Short YouTube URLs are not parsed.");
if (extractYouTubePlaylistId("https://youtube.com/watch?v=x&list=PLuyTQuSXZ5EUeHHskJJmWqicuyKJK4kc2") !== "PLuyTQuSXZ5EUeHHskJJmWqicuyKJK4kc2") throw new Error("Playlist URLs are not parsed.");

JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
console.log(`Checks passed: ${ids.length} unique UI ids, ${DEFAULT_CLIPS.length} default clips, ${Object.keys(SCENES).length} FX scenes.`);
