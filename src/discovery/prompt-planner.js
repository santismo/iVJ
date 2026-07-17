const GROUPS = {
  era: {
    "1920s": ["1920s", "silent film", "art deco"],
    "1950s": ["1950s", "mid century", "atomic age"],
    "1960s": ["1960s", "psychedelic", "mod"],
    "1970s": ["1970s", "analog", "disco"],
    "1980s": ["1980s", "80s", "vhs", "retrowave"],
    "1990s": ["1990s", "90s", "camcorder", "public access"],
    "2000s": ["2000s", "y2k", "mini dv", "webcore"]
  },
  texture: {
    "VHS": ["vhs", "videotape", "tracking", "analog glitch", "camcorder"],
    "film": ["film grain", "16mm", "super 8", "archive footage"],
    "digital": ["digital glitch", "datamosh", "compression", "pixel"],
    "CRT": ["crt", "scanline", "television", "broadcast"]
  },
  mood: {
    "dreamy": ["dreamy", "dreamlike", "ethereal", "soft", "hypnotic"],
    "ominous": ["ominous", "creepy", "eerie", "unsettling", "dark"],
    "chaotic": ["chaotic", "frantic", "maximal", "intense", "glitchy"],
    "playful": ["playful", "silly", "colorful", "toy", "cute"],
    "liminal": ["liminal", "empty", "abandoned", "uncanny", "backrooms"],
    "cosmic": ["cosmic", "space", "astral", "nebula", "planet"]
  },
  subject: {
    "commercials": ["commercial", "advertisement", "infomercial", "product demo"],
    "architecture": ["architecture", "building", "corridor", "mall", "office", "interior"],
    "technology": ["technology", "computer", "robot", "machine", "electronics"],
    "nature": ["nature", "ocean", "forest", "cloud", "plant", "microscope"],
    "driving": ["driving", "dashcam", "city at night", "highway", "train ride"],
    "animation": ["animation", "cartoon", "anime", "motion graphics"],
    "surveillance": ["surveillance", "security camera", "cctv", "monitoring"],
    "geometry": ["geometry", "fractal", "abstract", "generative", "oscilloscope"]
  },
  motion: {
    "slow": ["slow", "floating", "drifting", "calm", "ambient"],
    "fast": ["fast", "rapid", "kinetic", "speed", "frantic"],
    "looping": ["loop", "seamless", "repeating", "visual loop"]
  },
  color: {
    "neon": ["neon", "fluorescent", "electric color"],
    "monochrome": ["monochrome", "black and white", "grayscale"],
    "purple": ["purple", "violet", "magenta"],
    "green": ["green", "acid green", "night vision"],
    "warm": ["orange", "red", "gold", "warm color"],
    "blue": ["blue", "cyan", "cold color"]
  }
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "have", "i", "in", "into", "is", "it", "kind", "like", "more", "my", "of", "on", "or", "that", "the", "then", "this", "to", "video", "videos", "visual", "visuals", "want", "with"
]);

const NEGATIVE_PATTERNS = [
  /(?:no|without|avoid|exclude|not)\s+([^,.;]+)/gi,
  /(?:less of)\s+([^,.;]+)/gi
];

function clean(text) {
  return String(text || "").toLowerCase().replace(/[“”]/g, '"').replace(/[^a-z0-9\s'"-]/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function detectedGroups(text) {
  const found = {};
  for (const [group, entries] of Object.entries(GROUPS)) {
    found[group] = [];
    for (const [label, words] of Object.entries(entries)) {
      if (words.some(word => text.includes(word))) found[group].push(label);
    }
  }
  return found;
}

function extractExclusions(original) {
  const exclusions = [];
  for (const pattern of NEGATIVE_PATTERNS) {
    for (const match of original.matchAll(pattern)) {
      const phrase = clean(match[1]).split(/\s+(?:and|but|then)\s+/)[0].trim();
      if (phrase) exclusions.push(phrase);
    }
  }
  return unique(exclusions);
}

function importantTerms(text, exclusions) {
  const excludedWords = new Set(exclusions.flatMap(value => value.split(/\s+/)));
  const words = text.split(/\s+/).filter(word => word.length > 2 && !STOP_WORDS.has(word) && !excludedWords.has(word));
  const counts = new Map();
  words.forEach(word => counts.set(word, (counts.get(word) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word).slice(0, 12);
}

function chooseScene(groups) {
  if (groups.mood.includes("chaotic")) return "Acid";
  if (groups.texture.includes("VHS") || groups.texture.includes("CRT")) return "VHS";
  if (groups.mood.includes("ominous") || groups.mood.includes("liminal")) return "Noir";
  if (groups.mood.includes("dreamy") || groups.mood.includes("cosmic")) return "Dream";
  if (groups.color.includes("neon")) return "Neon";
  if (groups.color.includes("monochrome")) return "Mono";
  return "Clean";
}

function queryParts(groups, terms) {
  const subjects = groups.subject.length ? groups.subject : terms.slice(0, 3);
  const moods = groups.mood.length ? groups.mood : terms.slice(3, 5);
  const eras = groups.era.length ? groups.era : [];
  const textures = groups.texture.length ? groups.texture : [];
  const colors = groups.color.length ? groups.color : [];
  const motion = groups.motion.length ? groups.motion : [];
  return { subjects, moods, eras, textures, colors, motion };
}

function buildQueries(parts) {
  const { subjects, moods, eras, textures, colors, motion } = parts;
  const subjectPool = subjects.length ? subjects : ["abstract visuals"];
  const moodPool = moods.length ? moods : ["experimental"];
  const formats = ["archive footage", "visual loop", "experimental film", "music visuals", "video art", "compilation"];
  const queries = [];
  const count = Math.min(6, Math.max(4, subjectPool.length * 2));
  for (let i = 0; i < count; i += 1) {
    const pieces = [
      subjectPool[i % subjectPool.length],
      moodPool[i % moodPool.length],
      eras.length ? eras[i % eras.length] : "",
      textures.length ? textures[(i + 1) % textures.length] : "",
      colors.length ? colors[i % colors.length] : "",
      motion.length ? motion[(i + 1) % motion.length] : "",
      formats[i % formats.length]
    ];
    queries.push(unique(pieces).join(" ").trim());
  }
  return unique(queries).slice(0, 6);
}

export function planVisualSet(prompt) {
  const original = String(prompt || "").trim();
  if (original.length < 3) throw new Error("Describe the visuals you want first.");
  const normalized = clean(original);
  const exclusions = extractExclusions(original);
  const positiveText = exclusions.reduce((text, phrase) => text.replace(phrase, ""), normalized);
  const groups = detectedGroups(positiveText);
  const terms = importantTerms(positiveText, exclusions);
  const parts = queryParts(groups, terms);
  const queries = buildQueries(parts);
  const scene = chooseScene(groups);
  const tempo = groups.motion.includes("fast") || groups.mood.includes("chaotic") ? "fast" : groups.motion.includes("slow") || groups.mood.includes("dreamy") ? "slow" : "medium";
  return {
    original,
    queries,
    exclusions,
    terms,
    groups,
    suggestedScene: scene,
    suggestedInterval: tempo === "fast" ? 10 : tempo === "slow" ? 34 : 22,
    summary: `${scene} treatment · ${tempo} pacing · ${queries.length} searches${exclusions.length ? ` · avoiding ${exclusions.join(", ")}` : ""}`
  };
}

export function mergeAiPlan(localPlan, aiPlan) {
  if (!aiPlan || !Array.isArray(aiPlan.queries)) return localPlan;
  return {
    ...localPlan,
    ...aiPlan,
    queries: unique(aiPlan.queries.map(clean)).slice(0, 8),
    exclusions: unique([...(localPlan.exclusions || []), ...(aiPlan.exclusions || []).map(clean)]),
    summary: aiPlan.summary || localPlan.summary
  };
}

export function scoreVideo(video, plan) {
  const title = clean(`${video.title || ""} ${video.author || ""}`);
  let score = 0;
  for (const term of plan.terms || []) if (title.includes(term)) score += 3;
  for (const group of Object.values(plan.groups || {})) for (const term of group) if (title.includes(clean(term))) score += 2;
  for (const excluded of plan.exclusions || []) if (title.includes(clean(excluded))) score -= 100;
  if (video.durationSeconds > 0 && video.durationSeconds < 20) score -= 2;
  if (video.durationSeconds >= 60 && video.durationSeconds <= 1800) score += 2;
  if (/shorts?|reaction|review|tutorial|explained|podcast|interview/i.test(title)) score -= 4;
  if (/loop|archive|footage|visual|film|animation|commercial|compilation/i.test(title)) score += 2;
  return score;
}

export function splitAcrossDecks(items) {
  const A = [];
  const B = [];
  items.forEach((item, index) => (index % 2 === 0 ? A : B).push(item));
  return { A, B };
}
