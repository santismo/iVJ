const STORAGE_KEY = "ivj2.session.v1";

export const DEFAULT_STATE = Object.freeze({
  mixer: {
    crossfade: 0.5,
    blendMode: "screen",
    transitionStyle: "smooth",
    transitionSeconds: 1.2,
    autoEnabled: false,
    autoSeconds: 24,
    avoidRepeats: true,
    randomOrder: true,
    blackout: false
  },
  fx: {
    scene: "Dream Trails",
    intensity: 0.7,
    hue: 14,
    saturation: 1.45,
    contrast: 1.08,
    brightness: 1,
    blur: 0.18,
    zoom: 1.025,
    rotation: 0,
    mirrorX: false,
    mirrorY: false,
    filterMode: "trails",
    geometry: "none",
    scanlines: false,
    vignette: true,
    noise: true,
    autoRoll: false
  },
  decks: {
    A: { queue: [], index: -1 },
    B: { queue: [], index: -1 }
  },
  settings: {
    invidiousBase: "",
    quality: "auto"
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, incoming) {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (!(key in base)) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && base?.[key] && typeof base[key] === "object") {
      output[key] = deepMerge(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function persistentItem(item) {
  if (!item || item.kind === "local" || item.url?.startsWith("blob:")) return null;
  const { file, ...safe } = item;
  return safe;
}

function persistentState(state) {
  const next = clone(state);
  for (const deck of ["A", "B"]) {
    next.decks[deck].queue = (state.decks[deck].queue || []).map(persistentItem).filter(Boolean);
    next.decks[deck].index = Math.min(next.decks[deck].index, next.decks[deck].queue.length - 1);
  }
  return next;
}

export class SessionStore {
  constructor() {
    this.listeners = new Set();
    this.state = this.load();
    this.saveTimer = null;
  }

  load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return deepMerge(clone(DEFAULT_STATE), parsed || {});
    } catch {
      return clone(DEFAULT_STATE);
    }
  }

  get() {
    return this.state;
  }

  update(recipe, options = {}) {
    const draft = clone(this.state);
    const returned = recipe(draft);
    this.state = returned || draft;
    if (options.save !== false) this.scheduleSave();
    this.emit();
    return this.state;
  }

  replace(nextState) {
    this.state = deepMerge(clone(DEFAULT_STATE), nextState || {});
    this.saveNow();
    this.emit();
  }

  reset() {
    this.state = clone(DEFAULT_STATE);
    localStorage.removeItem(STORAGE_KEY);
    this.emit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this.state);
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 180);
  }

  saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentState(this.state)));
    } catch (error) {
      console.warn("Could not save iVJ session", error);
    }
  }

  exportJson() {
    return JSON.stringify({
      app: "iVJ",
      version: 3,
      exportedAt: new Date().toISOString(),
      state: persistentState(this.state)
    }, null, 2);
  }

  importJson(text) {
    const parsed = JSON.parse(text);
    const state = parsed?.state || parsed;
    if (!state || typeof state !== "object") throw new Error("This is not an iVJ session.");
    this.replace(state);
    return this.state;
  }
}
