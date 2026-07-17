const BASE = Object.freeze({
  hue: 0,
  saturation: 1,
  contrast: 1.04,
  brightness: 1,
  blur: 0,
  zoom: 1,
  rotation: 0,
  mirrorX: false,
  mirrorY: false,
  filterMode: "none",
  geometry: "none",
  scanlines: false,
  vignette: false,
  noise: false,
  blendMode: "normal"
});

function scene(options) {
  return Object.freeze({ ...BASE, ...options });
}

export const SCENES = Object.freeze({
  Clean: scene({
    swatch: "linear-gradient(135deg,#111827,#40506d)"
  }),
  "Mirror Tunnel": scene({
    saturation: 1.38, contrast: 1.18, zoom: 1.08, mirrorX: true, filterMode: "trails", geometry: "tunnel", blendMode: "screen", vignette: true,
    swatch: "repeating-radial-gradient(circle,#10132d 0 8%,#735dff 9% 13%,#0cf 14% 18%)"
  }),
  "Kaleido Acid": scene({
    hue: 78, saturation: 2.2, contrast: 1.48, brightness: 1.04, zoom: 1.07, rotation: 4, mirrorX: true, filterMode: "rgbtrails", geometry: "kaleido", blendMode: "difference", noise: true,
    swatch: "conic-gradient(from 30deg,#ffed00,#ff1385,#5628ff,#00ffa8,#ffed00)"
  }),
  "RGB Ghost": scene({
    saturation: 1.6, contrast: 1.25, zoom: 1.025, filterMode: "rgb", blendMode: "screen", vignette: true,
    swatch: "linear-gradient(100deg,#ff284f 0 30%,#18e5a4 31% 63%,#276cff 64%)"
  }),
  "Dream Trails": scene({
    hue: 14, saturation: 1.45, contrast: 1.08, brightness: 1.08, blur: .18, zoom: 1.025, filterMode: "trails", blendMode: "screen", vignette: true, noise: true,
    swatch: "linear-gradient(135deg,#334dff,#dc69d3 58%,#8cf5e0)"
  }),
  "Neon Edges": scene({
    hue: 18, saturation: 1.95, contrast: 1.38, brightness: .96, filterMode: "neon", blendMode: "screen", vignette: true,
    swatch: "linear-gradient(135deg,#080018,#ff23bd,#00f7ff)"
  }),
  "Toxic Outline": scene({
    hue: 92, saturation: 2.25, contrast: 1.65, brightness: .86, filterMode: "edges", blendMode: "difference", scanlines: true,
    swatch: "linear-gradient(135deg,#07130a,#80ff2c,#d9ff00,#020202)"
  }),
  "Warp Drive": scene({
    hue: 34, saturation: 1.75, contrast: 1.3, zoom: 1.05, rotation: -2, filterMode: "warp", geometry: "prism", blendMode: "hard-light", vignette: true,
    swatch: "radial-gradient(circle,#fff 0 2%,#00bcff 12%,#5b2dff 38%,#03030e 70%)"
  }),
  "VHS Smear": scene({
    hue: -9, saturation: 1.28, contrast: 1.35, brightness: .94, blur: .16, zoom: 1.035, filterMode: "rgbtrails", blendMode: "difference", scanlines: true, vignette: true, noise: true,
    swatch: "linear-gradient(120deg,#14111c 0 28%,#ff3eaa 29% 34%,#43dbff 35% 40%,#292036 41%)"
  }),
  "Heat Echo": scene({
    hue: -36, saturation: 1.86, contrast: 1.32, brightness: .98, zoom: 1.025, filterMode: "trails", geometry: "prism", blendMode: "hard-light", vignette: true, noise: true,
    swatch: "linear-gradient(135deg,#1c0010,#ff304f,#ffca57)"
  }),
  "Chrome Split": scene({
    saturation: .25, contrast: 1.72, brightness: 1.12, filterMode: "rgb", blendMode: "exclusion", geometry: "prism", vignette: true,
    swatch: "linear-gradient(135deg,#050505,#f5f7ff 45%,#3a69ff 51%,#050505)"
  }),
  Surveillance: scene({
    hue: 112, saturation: 1.4, contrast: 1.48, brightness: .72, zoom: 1.02, filterMode: "edges", blendMode: "screen", scanlines: true, vignette: true,
    swatch: "linear-gradient(135deg,#00150d,#00b96b,#d4ff9e)"
  }),
  "Noir Trails": scene({
    saturation: .03, contrast: 1.7, brightness: .8, blur: .08, zoom: 1.035, mirrorY: true, filterMode: "trails", blendMode: "multiply", scanlines: true, vignette: true, noise: true,
    swatch: "linear-gradient(135deg,#020202,#989898,#111)"
  })
});

const FILTER_IDS = Object.freeze({
  rgb: "ivj-rgb",
  edges: "ivj-edges",
  trails: "ivj-trails",
  warp: "ivj-warp",
  neon: "ivj-neon",
  rgbtrails: "ivj-rgb-trails"
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function setAttribute(id, name, value) {
  document.getElementById(id)?.setAttribute(name, String(value));
}

export class EffectsEngine {
  constructor({ layer, overlay, geometry, onScene = () => {} }) {
    this.layer = layer;
    this.overlay = overlay;
    this.geometry = geometry;
    this.onScene = onScene;
    this.state = { scene: "Dream Trails", intensity: .7, ...SCENES["Dream Trails"] };
    this.apply();
  }

  setState(next) {
    this.state = { ...this.state, ...next };
    this.apply();
  }

  setScene(name, options = {}) {
    const selectedName = SCENES[name] ? name : "Clean";
    this.state = { ...this.state, ...SCENES[selectedName], scene: selectedName };
    this.apply();
    if (options.notify !== false) this.onScene(selectedName, { ...this.state });
    return this.state;
  }

  randomScene() {
    const names = Object.keys(SCENES).filter(name => name !== this.state.scene);
    return this.setScene(names[Math.floor(Math.random() * names.length)]);
  }

  apply() {
    const intensity = clamp(this.state.intensity ?? .7, 0, 1);
    const hue = Number(this.state.hue || 0) * intensity;
    const saturation = 1 + (Number(this.state.saturation || 1) - 1) * intensity;
    const contrast = 1 + (Number(this.state.contrast || 1) - 1) * intensity;
    const brightness = 1 + (Number(this.state.brightness || 1) - 1) * intensity;
    const blur = Math.max(0, Number(this.state.blur || 0)) * intensity;
    const zoom = 1 + (Math.max(1, Number(this.state.zoom || 1)) - 1) * intensity;
    const rotation = Number(this.state.rotation || 0) * intensity;
    const scaleX = this.state.mirrorX ? -1 : 1;
    const scaleY = this.state.mirrorY ? -1 : 1;
    const filterId = FILTER_IDS[this.state.filterMode];
    const filters = [];
    if (filterId) filters.push(`url("#${filterId}")`);
    filters.push(`hue-rotate(${hue}deg)`, `saturate(${saturation})`, `contrast(${contrast})`, `brightness(${brightness})`);
    if (blur > .01) filters.push(`blur(${blur}px)`);
    this.layer.style.filter = filters.join(" ");
    this.layer.style.transform = `scaleX(${scaleX}) scaleY(${scaleY}) rotate(${rotation}deg) scale(${zoom})`;

    document.documentElement.style.setProperty("--fx-intensity", intensity.toFixed(2));
    this.overlay.classList.toggle("scanlines", Boolean(this.state.scanlines));
    this.overlay.classList.toggle("vignette", Boolean(this.state.vignette));
    this.overlay.classList.toggle("noise", Boolean(this.state.noise));
    this.geometry.className = `geometry-fx${this.state.geometry && this.state.geometry !== "none" ? ` ${this.state.geometry}` : ""}`;

    const rgbDistance = 2 + intensity * 13;
    setAttribute("ivjRgbRedOffset", "dx", rgbDistance.toFixed(1));
    setAttribute("ivjRgbBlueOffset", "dx", (-rgbDistance).toFixed(1));
    setAttribute("ivjComboRedOffset", "dx", (rgbDistance * .85).toFixed(1));
    setAttribute("ivjComboBlueOffset", "dx", (-rgbDistance * .85).toFixed(1));
    setAttribute("ivjTrailLeft", "dx", (-5 - intensity * 22).toFixed(1));
    setAttribute("ivjTrailRight", "dx", (5 + intensity * 22).toFixed(1));
    setAttribute("ivjTrailAlphaLeft", "slope", (.08 + intensity * .2).toFixed(2));
    setAttribute("ivjTrailAlphaRight", "slope", (.08 + intensity * .16).toFixed(2));
    setAttribute("ivjWarpMap", "scale", (4 + intensity * 28).toFixed(1));
    setAttribute("ivjEdgeAlpha", "slope", (.35 + intensity * .65).toFixed(2));
  }
}
