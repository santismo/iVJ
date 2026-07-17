import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { planVisualSet, scoreVideo, splitAcrossDecks } from "../src/discovery/prompt-planner.js";
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

const plan = planVisualSet("grainy 1980s commercials, empty malls, dreamy purple VHS, increasingly chaotic, no talking heads");
if (plan.queries.length < 3) throw new Error("Prompt planner did not create enough searches.");
if (!plan.exclusions.some(value => value.includes("talking heads"))) throw new Error("Prompt planner missed an exclusion.");
if (scoreVideo({ title: "1980s VHS commercial archive footage", durationSeconds: 180 }, plan) <= scoreVideo({ title: "Talking heads podcast review", durationSeconds: 180 }, plan)) throw new Error("Video scoring does not respect the plan.");
const split = splitAcrossDecks([1, 2, 3, 4, 5]);
if (split.A.length !== 3 || split.B.length !== 2) throw new Error("Deck splitting failed.");
if (extractYouTubeVideoId("https://youtu.be/3pxrECZYEAA") !== "3pxrECZYEAA") throw new Error("Short YouTube URLs are not parsed.");
if (extractYouTubePlaylistId("https://youtube.com/watch?v=x&list=PLuyTQuSXZ5EUeHHskJJmWqicuyKJK4kc2") !== "PLuyTQuSXZ5EUeHHskJJmWqicuyKJK4kc2") throw new Error("Playlist URLs are not parsed.");

JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
console.log(`Checks passed: ${ids.length} unique UI ids, ${plan.queries.length} planned searches.`);
