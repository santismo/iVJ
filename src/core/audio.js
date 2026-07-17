export class AudioReactiveEngine {
  constructor({ player, onFrame = () => {}, onStatus = () => {} }) {
    this.player = player;
    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.context = null;
    this.analyser = null;
    this.sourceNode = null;
    this.mediaElementNode = null;
    this.stream = null;
    this.data = null;
    this.frame = 0;
    this.running = false;
    this.sensitivity = 1.4;
    this.averageEnergy = .08;
    this.lastBeat = 0;
    this.objectUrl = "";
  }

  async ensureContext() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = .76;
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  disconnectSource() {
    if (this.sourceNode && this.sourceNode !== this.mediaElementNode) {
      try { this.sourceNode.disconnect(); } catch {}
    }
    this.sourceNode = null;
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  async startMicrophone() {
    await this.ensureContext();
    this.disconnectSource();
    this.player.pause();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.sourceNode = this.context.createMediaStreamSource(this.stream);
    this.sourceNode.connect(this.analyser);
    this.startLoop();
    this.onStatus("Microphone listening");
  }

  async loadFile(file) {
    if (!file) return;
    await this.ensureContext();
    this.disconnectSource();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.player.src = this.objectUrl;
    this.player.classList.add("active");
    if (!this.mediaElementNode) {
      this.mediaElementNode = this.context.createMediaElementSource(this.player);
      this.mediaElementNode.connect(this.analyser);
      this.mediaElementNode.connect(this.context.destination);
    }
    this.sourceNode = this.mediaElementNode;
    await this.player.play();
    this.startLoop();
    this.onStatus(`Listening to ${file.name}`);
  }

  setSensitivity(value) {
    this.sensitivity = Math.max(.2, Math.min(4, Number(value) || 1.4));
  }

  startLoop() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running || !this.analyser) return;
      this.analyser.getByteFrequencyData(this.data);
      const bins = this.data.length;
      const average = (start, end) => {
        let total = 0;
        const from = Math.max(0, Math.floor(start));
        const to = Math.min(bins, Math.ceil(end));
        for (let index = from; index < to; index += 1) total += this.data[index];
        return to > from ? total / (to - from) / 255 : 0;
      };
      const bass = average(0, bins * .1);
      const mid = average(bins * .1, bins * .42);
      const high = average(bins * .42, bins * .9);
      const level = bass * .48 + mid * .34 + high * .18;
      this.averageEnergy = this.averageEnergy * .965 + level * .035;
      const now = performance.now();
      const threshold = Math.max(.12, this.averageEnergy * 1.48);
      const beat = bass * this.sensitivity > threshold && now - this.lastBeat > 260;
      if (beat) this.lastBeat = now;
      this.onFrame({ level, bass, mid, high, beat });
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.disconnectSource();
    this.player.pause();
    this.onFrame({ level: 0, bass: 0, mid: 0, high: 0, beat: false });
    this.onStatus("Audio reaction stopped");
  }

  destroy() {
    this.stop();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.context?.close().catch(() => {});
  }
}
