export function youtubeClip(videoId, title) {
  return {
    id: `youtube:${videoId}`,
    videoId,
    kind: "youtube",
    source: "YouTube",
    title,
    author: "Adult Swim — Off The Air",
    durationSeconds: 0,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${videoId}`
  };
}

export const DEFAULT_CLIPS = Object.freeze([
  youtubeClip("sLkwdr74FVI", "Patterns"),
  youtubeClip("PhxE1RFtAWY", "Light"),
  youtubeClip("PQdVTMZQtAk", "Color"),
  youtubeClip("vWiCVO3X_Ec", "Dreams"),
  youtubeClip("nBSBtKZacH8", "Fire"),
  youtubeClip("s8QxXuSg4HM", "Journeys"),
  youtubeClip("c2fs8Eg0Vcc", "Plants"),
  youtubeClip("dS-MaUk6YBI", "Drugs"),
  youtubeClip("NCKWYr2JW74", "Liminal"),
  youtubeClip("MD0JLUaIDS4", "Moon"),
  youtubeClip("0L1SlmeN2oM", "Holes"),
  youtubeClip("5M2A-_JkR0c", "Music"),
  youtubeClip("1vzgaNfTUw4", "Tradigital / Ambient Swim")
]);

function clips(...ids) {
  const wanted = new Set(ids);
  return DEFAULT_CLIPS.filter(item => wanted.has(item.videoId));
}

export const BUILT_IN_PLAYLISTS = Object.freeze([
  {
    id: "off-the-air",
    title: "Off The Air",
    description: "Surreal animation, collage, nature, glitches, and dream logic.",
    accent: "#7467ff",
    items: DEFAULT_CLIPS
  },
  {
    id: "dream-geometry",
    title: "Dream Geometry",
    description: "Patterns, color, light, moons, holes, and slow abstract movement.",
    accent: "#31d6ff",
    items: clips("sLkwdr74FVI", "PhxE1RFtAWY", "PQdVTMZQtAk", "vWiCVO3X_Ec", "MD0JLUaIDS4", "0L1SlmeN2oM")
  },
  {
    id: "organic-surreal",
    title: "Organic Surreal",
    description: "Plants, fire, strange journeys, and saturated living textures.",
    accent: "#68ed91",
    items: clips("c2fs8Eg0Vcc", "nBSBtKZacH8", "s8QxXuSg4HM", "dS-MaUk6YBI", "1vzgaNfTUw4")
  },
  {
    id: "night-transmission",
    title: "Night Transmission",
    description: "Liminal spaces, music, moonlight, and ambient broadcast energy.",
    accent: "#ff63be",
    items: clips("NCKWYr2JW74", "5M2A-_JkR0c", "MD0JLUaIDS4", "1vzgaNfTUw4", "vWiCVO3X_Ec")
  }
]);

export const REMOTE_PLAYLISTS = Object.freeze([
  {
    id: "trippy-visuals",
    title: "Trippy Visuals",
    description: "A larger community playlist of psychedelic visual material.",
    accent: "#ffcf4f",
    thumbnail: "https://i.ytimg.com/vi/sLkwdr74FVI/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=sLkwdr74FVI&list=PLuyTQuSXZ5EUeHHskJJmWqicuyKJK4kc2"
  },
  {
    id: "strange-cartoons",
    title: "Strange Cartoons",
    description: "Animation and cartoon sources that work well with difference blends.",
    accent: "#ff7d5e",
    thumbnail: "https://i.ytimg.com/vi/2lBjRpRtQjY/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=2lBjRpRtQjY&list=PL1ZB2TfCq41TxhYoCOeYiwONkig6Lt_C3"
  },
  {
    id: "vintage-commercials",
    title: "Vintage Commercials",
    description: "Old ads and broadcast fragments for VHS and edge presets.",
    accent: "#66b7ff",
    thumbnail: "https://i.ytimg.com/vi/0tJ_KhgI4TY/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=0tJ_KhgI4TY&list=PLxqMsrhM_WC25QOMHMQp-Cm9k6nfc_vPu"
  }
]);

export const STARTER_DECKS = Object.freeze({
  A: DEFAULT_CLIPS.filter((_, index) => index % 2 === 0),
  B: DEFAULT_CLIPS.filter((_, index) => index % 2 === 1)
});

export function splitAcrossDecks(items) {
  const result = { A: [], B: [] };
  items.forEach((item, index) => result[index % 2 === 0 ? "A" : "B"].push(item));
  if (!result.B.length && result.A.length) result.B = result.A.slice();
  return result;
}

export function uniqueClips(playlists = BUILT_IN_PLAYLISTS) {
  const seen = new Set();
  return playlists.flatMap(playlist => playlist.items || []).filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
