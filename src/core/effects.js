export const SCENES = Object.freeze({
  Clean: {
    hue: 0, saturation: 1, contrast: 1.03, brightness: 1, blur: 0, zoom: 1,
    scanlines: false, vignette: false, noise: false, blendMode: "normal",
    swatch: "linear-gradient(135deg,#111827,#40506d)"
  },
  Dream: {
    hue: 12, saturation: 1.35, contrast: 1.08, brightness: 1.06, blur: 0.25, zoom: 1.015,
    scanlines: false, vignette: true, noise: true, blendMode: "screen",
    swatch: "linear-gradient(135deg,#334dff,#dc69d3 58%,#8cf5e0)"
  },
  VHS: {
    hue: -8, saturation: 1.22, contrast: 1.28, brightness: .96, blur: .18, zoom: 1.025,
    scanlines: true, vignette: true, noise: true, blendMode: "difference",
    swatch: "linear-gradient(120deg,#14111c 0 28%,#ff3eaa 29% 34%,#43dbff 35% 40%,#292036 41%)"
  },
  Neon: {
    hue: 18, saturation: 1.9, contrast: 1.3, brightness: 1.02, blur: 0, zoom: 1.01,
    scanlines: false, vignette: true, noise: false, blendMode: "screen",
    swatch: "linear-gradient(135deg,#13022b,#9c2cff,#00ffd5)"
  },
  Acid: {
    hue: 80, saturation: 2.35, contrast: 1.52, brightness: 1.05, blur: 0, zoom: 1.04,
    scanlines: true, vignette: false, noise: true, blendMode: "difference",
    swatch: "conic-gradient(from 45deg,#ffed00,#ff1385,#5628ff,#00ffa8,#ffed00)"
  },
  Noir: {
    hue: 0, saturation: .08, contrast: 1.58, brightness: .82, blur: .1, zoom: 1.025,
    scanlines: true, vignette: true, noise: true, blendMode: "multiply",
    swatch: "linear-gradient(135deg,#050505,#787878,#171717)"
  },
  Mono: {
    hue: 0, saturation: 0, contrast: 1.24, brightness: 1.04, blur: 0, zoom: 1,
    scanlines: false, vignette: true, noise: false, blendMode: "lighten",
    swatch: "linear-gradient(135deg,#fff,#777,#050505)"
  },
  Heat: {
    hue: -35, saturation: 1.75, contrast: 1.25, brightness: .98, blur: 0, zoom: 1.018,
    scanlines: false, vignette: true, noise: true, blendMode: "hard-light",
    swatch: "linear-gradient(135deg,#1c0010,#ff304f,#ffca57)"
  },
  Night: {
    hue: 115, saturation: 1.45, contrast: 1.42, brightness: .72, blur: 0, zoom: 1.02,
    scanlines: true, vignette: true, noise: false, blendMode: "screen",
    swatch: "linear-gradient(135deg,#00150d,#00b96b,#d4ff9e)"
  }
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

export class EffectsEngine {
  constructor({ stage, overlay, onScene = () => {} }) {
    this.stage = stage;
    this.overlay = overlay;
    this.onScene = onScene;
    this.state = {
      scene: "Dream",
      intensity: 0.65,
      ...SCENES.Dream
    };
    this.audio = { pulse: false, color: false, sensitivity: 1.4 };
    this.lastFlash = 0;
    this.apply();
  }

  setState(next) {
    this.state = { ...this.state, ...next };
    this.apply();
  }

  setScene(name, options = {}) {
    const scene = SCENES[name] || SCENES.Clean;
    this.state = { ...this.state, ...scene, scene: SCENES[name] ? name : "Clean" };
    this.apply();
    if (options.notify !== false) this.onScene(this.state.scene, { ...this.state });
    return this.state;
  }

  randomScene() {
    const names = Object.keys(SCENES).filter(name => name !== this.state.scene);
    return this.setScene(names[Math.floor(Math.random() * names.length)]);
  }

  configureAudio(options) {
    this.audio = { ...this.audio, ...options };
    if (!this.audio.pulse) document.documentElement.style.setProperty("--audio-pulse", "1");
  }

  apply() {
    const root = document.documentElement;
    const intensity = clamp(this.state.intensity ?? 0.65, 0, 1);
    const hue = Number(this.state.hue || 0) * intensity;
    const saturation = 1 + (Number(this.state.saturation || 1) - 1) * intensity;
    const contrast = 1 + (Number(this.state.contrast || 1) - 1) * intensity;
    const brightness = 1 + (Number(this.state.brightness || 1) - 1) * intensity;
    const blur = Math.max(0, Number(this.state.blur || 0)) * intensity;
    const zoom = 1 + (Math.max(1, Number(this.state.zoom || 1)) - 1) * intensity;
    root.style.setProperty("--fx-hue", `${hue}deg`);
    root.style.setProperty("--fx-saturation", saturation.toFixed(3));
    root.style.setProperty("--fx-contrast", contrast.toFixed(3));
    root.style.setProperty("--fx-brightness", brightness.toFixed(3));
    root.style.setProperty("--fx-blur", `${blur.toFixed(2)}px`);
    root.style.setProperty("--fx-zoom", zoom.toFixed(4));
    root.style.setProperty("--fx-intensity", intensity.toFixed(2));
    this.overlay.classList.toggle("scanlines", Boolean(this.state.scanlines));
    this.overlay.classList.toggle("vignette", Boolean(this.state.vignette));
    this.overlay.classList.toggle("noise", Boolean(this.state.noise));
  }

  updateAudio({ level = 0, bass = 0, high = 0, beat = false }) {
    const sensitivity = Number(this.audio.sensitivity || 1.4);
    if (this.audio.pulse) {
      const pulse = 1 + Math.min(.065, bass * sensitivity * .055);
      document.documentElement.style.setProperty("--audio-pulse", pulse.toFixed(4));
    }
    if (this.audio.color) {
      const baseHue = Number(this.state.hue || 0);
      document.documentElement.style.setProperty("--fx-hue", `${baseHue + high * sensitivity * 35}deg`);
      document.documentElement.style.setProperty("--fx-saturation", `${Math.max(0, Number(this.state.saturation || 1) + level * sensitivity * .5)}`);
    }
    if (beat && performance.now() - this.lastFlash > 120) {
      this.lastFlash = performance.now();
      this.overlay.classList.remove("flash");
      void this.overlay.offsetWidth;
      this.overlay.classList.add("flash");
    }
  }
}
