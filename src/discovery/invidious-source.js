const FALLBACK_INSTANCES = [
  "https://inv.nadeko.net",
  "https://yewtu.be",
  "https://invidious.nerdvpn.de",
  "https://inv.us.projectsegfau.lt"
];

function normalizeBase(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function bestThumbnail(item) {
  const thumbnails = item.videoThumbnails || item.video_thumbnails || [];
  const preferred = thumbnails.find(thumb => thumb.quality === "medium") || thumbnails.find(thumb => thumb.quality === "high") || thumbnails[0];
  return preferred?.url || (item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg` : "");
}

function normalizeVideo(item) {
  const videoId = item.videoId || item.video_id || item.id;
  if (!videoId) return null;
  return {
    id: `youtube:${videoId}`,
    videoId,
    kind: "youtube",
    source: "YouTube",
    title: item.title || videoId,
    author: item.author || item.authorName || "",
    durationSeconds: Number(item.lengthSeconds || item.length_seconds || item.duration || 0),
    thumbnail: bestThumbnail({ ...item, videoId }),
    url: `https://www.youtube.com/watch?v=${videoId}`
  };
}

async function fetchJson(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { mode: "cors", cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function extractYouTubeVideoId(value) {
  const raw = String(value || "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || null;
    if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] || null;
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

export function extractYouTubePlaylistId(value) {
  const raw = String(value || "").trim();
  if (/^(PL|UU|OLAK5uy_)[a-zA-Z0-9_-]{8,}$/.test(raw)) return raw;
  try {
    return new URL(raw).searchParams.get("list");
  } catch {
    return null;
  }
}

export class InvidiousSource {
  constructor(preferredBase = "") {
    this.preferredBase = normalizeBase(preferredBase);
    this.dynamicInstances = [];
    this.lastWorkingBase = "";
    this.lastError = null;
  }

  setPreferredBase(value) {
    this.preferredBase = normalizeBase(value);
  }

  bases() {
    return unique([this.preferredBase, this.lastWorkingBase, ...this.dynamicInstances, ...FALLBACK_INSTANCES]).slice(0, 10);
  }

  async discoverInstances() {
    try {
      const payload = await fetchJson("https://api.invidious.io/instances.json?sort_by=health", 7000);
      this.dynamicInstances = payload
        .filter(([, info]) => info?.api && info?.type === "https" && info?.monitor?.dailyRatios?.[0]?.ratio > 85)
        .map(([host]) => normalizeBase(`https://${host}`))
        .filter(Boolean)
        .slice(0, 6);
    } catch {
      this.dynamicInstances = [];
    }
    return this.dynamicInstances;
  }

  async request(path, options = {}) {
    let lastError;
    for (const base of this.bases().slice(0, options.maxBases || 5)) {
      try {
        const payload = await fetchJson(`${base}${path}`, options.timeoutMs || 9000);
        this.lastWorkingBase = base;
        this.lastError = null;
        return { payload, base };
      } catch (error) {
        lastError = error;
      }
    }
    this.lastError = lastError || new Error("No playlist provider responded.");
    throw this.lastError;
  }

  async playlist(value, maxPages = 10) {
    const listId = extractYouTubePlaylistId(value);
    if (!listId) throw new Error("That does not look like a YouTube playlist URL.");
    const items = [];
    const seen = new Set();
    for (let page = 1; page <= maxPages; page += 1) {
      const { payload } = await this.request(`/api/v1/playlists/${encodeURIComponent(listId)}?page=${page}`);
      const videos = Array.isArray(payload?.videos) ? payload.videos : [];
      if (!videos.length) break;
      for (const raw of videos) {
        const item = normalizeVideo(raw);
        if (item && !seen.has(item.videoId)) {
          seen.add(item.videoId);
          items.push(item);
        }
      }
      if (videos.length < 20) break;
    }
    return items;
  }

  fromVideoUrl(value) {
    const videoId = extractYouTubeVideoId(value);
    if (!videoId) return null;
    return normalizeVideo({ videoId, title: `YouTube ${videoId}` });
  }
}
