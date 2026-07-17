function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function shuffled(values) {
  const next = values.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function youtubeEmbed(videoId) {
  const origin = encodeURIComponent(location.origin);
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&playsinline=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&loop=1&playlist=${encodeURIComponent(videoId)}&enablejsapi=1&origin=${origin}`;
}

export class MixerEngine {
  constructor({ outputA, outputB, blackout, onChange = () => {}, onCrossfade = () => {}, onAutoStep = () => {} }) {
    this.slots = { A: outputA, B: outputB };
    this.blackout = blackout;
    this.onChange = onChange;
    this.onCrossfade = onCrossfade;
    this.onAutoStep = onAutoStep;
    this.decks = {
      A: { queue: [], index: -1, current: null, history: [] },
      B: { queue: [], index: -1, current: null, history: [] }
    };
    this.crossfade = 0.5;
    this.blendMode = "screen";
    this.transitionStyle = "smooth";
    this.transitionSeconds = 1.2;
    this.randomOrder = true;
    this.avoidRepeats = true;
    this.autoEnabled = false;
    this.autoSeconds = 24;
    this.autoTimer = null;
    this.animationFrame = 0;
    this.pendingTransition = 0;
    this.renderPlaceholders();
    this.applyMix();
  }

  renderPlaceholders() {
    for (const deck of ["A", "B"]) {
      if (!this.slots[deck].children.length) this.slots[deck].innerHTML = `<div class="deck-placeholder">Deck ${deck}</div>`;
    }
  }

  configure(mixerState) {
    this.blendMode = mixerState.blendMode || this.blendMode;
    this.transitionStyle = mixerState.transitionStyle || this.transitionStyle;
    this.transitionSeconds = Number(mixerState.transitionSeconds ?? this.transitionSeconds);
    this.randomOrder = mixerState.randomOrder !== false;
    this.avoidRepeats = mixerState.avoidRepeats !== false;
    this.autoSeconds = Math.max(5, Number(mixerState.autoSeconds || 24));
    this.setCrossfade(mixerState.crossfade ?? this.crossfade, false);
    this.setBlackout(Boolean(mixerState.blackout));
    this.setAuto(Boolean(mixerState.autoEnabled), false);
  }

  setQueue(deck, queue, options = {}) {
    const target = this.decks[deck];
    target.queue = (queue || []).slice();
    target.history = [];
    target.index = target.queue.length ? clamp(options.index ?? 0, 0, target.queue.length - 1) : -1;
    if (options.load !== false && target.index >= 0) this.loadIndex(deck, target.index);
    if (!target.queue.length) {
      target.current = null;
      this.slots[deck].innerHTML = `<div class="deck-placeholder">Deck ${deck}</div>`;
    }
    this.notify(deck);
  }

  appendQueue(deck, items, options = {}) {
    const target = this.decks[deck];
    const wasEmpty = target.queue.length === 0;
    const existing = new Set(target.queue.map(item => item.id || item.url));
    for (const item of items || []) {
      const key = item.id || item.url;
      if (key && !existing.has(key)) {
        existing.add(key);
        target.queue.push(item);
      }
    }
    if (wasEmpty && target.queue.length && options.load !== false) this.loadIndex(deck, 0);
    this.notify(deck);
  }

  remove(deck, index) {
    const target = this.decks[deck];
    if (index < 0 || index >= target.queue.length) return;
    const [removed] = target.queue.splice(index, 1);
    if (removed?.kind === "local" && removed.url?.startsWith("blob:")) URL.revokeObjectURL(removed.url);
    if (!target.queue.length) {
      target.index = -1;
      target.current = null;
      this.slots[deck].innerHTML = `<div class="deck-placeholder">Deck ${deck}</div>`;
    } else if (index === target.index) {
      this.loadIndex(deck, Math.min(index, target.queue.length - 1));
    } else if (index < target.index) {
      target.index -= 1;
    }
    this.notify(deck);
  }

  shuffle(deck) {
    const target = this.decks[deck];
    const currentId = target.current?.id;
    target.queue = shuffled(target.queue);
    target.index = Math.max(0, target.queue.findIndex(item => item.id === currentId));
    this.notify(deck);
  }

  pickNextIndex(deck) {
    const target = this.decks[deck];
    if (!target.queue.length) return -1;
    if (!this.randomOrder) return (target.index + 1) % target.queue.length;
    const recent = new Set(this.avoidRepeats ? target.history.slice(-Math.min(10, Math.ceil(target.queue.length / 2))) : []);
    const choices = target.queue.map((item, index) => ({ item, index })).filter(({ item, index }) => index !== target.index && !recent.has(item.id));
    const pool = choices.length ? choices : target.queue.map((item, index) => ({ item, index })).filter(({ index }) => index !== target.index);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].index : 0;
  }

  next(deck) {
    const index = this.pickNextIndex(deck);
    if (index >= 0) this.loadIndex(deck, index);
    return index;
  }

  loadIndex(deck, index) {
    const target = this.decks[deck];
    const item = target.queue[index];
    if (!item) return;
    target.index = index;
    target.current = item;
    if (item.id) target.history.push(item.id);
    if (target.history.length > 30) target.history.splice(0, target.history.length - 30);
    this.mount(deck, item);
    this.notify(deck);
  }

  mount(deck, item) {
    const slot = this.slots[deck];
    slot.replaceChildren();
    if (item.kind === "local" || item.kind === "direct") {
      const video = document.createElement("video");
      video.src = item.url;
      video.muted = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      if (item.kind === "direct") video.crossOrigin = "anonymous";
      slot.append(video);
      video.play().catch(() => {});
      return;
    }
    if (item.videoId) {
      const iframe = document.createElement("iframe");
      iframe.src = youtubeEmbed(item.videoId);
      iframe.title = item.title || `Deck ${deck} video`;
      iframe.allow = "autoplay; encrypted-media; picture-in-picture";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      slot.append(iframe);
      return;
    }
    slot.innerHTML = `<div class="deck-placeholder">Unsupported clip</div>`;
  }

  setBlendMode(mode) {
    this.blendMode = mode || "normal";
    this.applyMix();
  }

  setCrossfade(value, notify = true) {
    this.crossfade = clamp(value);
    this.applyMix();
    if (notify) this.onCrossfade(this.crossfade);
  }

  applyMix() {
    const angle = this.crossfade * Math.PI * 0.5;
    const opacityA = Math.cos(angle);
    const opacityB = Math.sin(angle);
    this.slots.A.style.opacity = String(opacityA);
    this.slots.B.style.opacity = String(opacityB);
    this.slots.B.style.mixBlendMode = this.blendMode;
    this.slots.A.style.mixBlendMode = "normal";
  }

  activeDeck() {
    return this.crossfade < 0.5 ? "A" : "B";
  }

  async transitionTo(deck, options = {}) {
    const target = deck === "B" ? 1 : 0;
    const duration = Math.max(0, Number(options.seconds ?? this.transitionSeconds)) * 1000;
    const style = options.style || this.transitionStyle;
    cancelAnimationFrame(this.animationFrame);
    if (style === "cut" || duration === 0) {
      this.setCrossfade(target);
      return;
    }
    if (style === "dip") {
      this.blackout.classList.add("active");
      await new Promise(resolve => setTimeout(resolve, Math.min(320, duration / 2)));
      this.setCrossfade(target);
      this.blackout.classList.remove("active");
      return;
    }
    const start = performance.now();
    const from = this.crossfade;
    await new Promise(resolve => {
      const tick = now => {
        const progress = clamp((now - start) / duration);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        this.setCrossfade(from + (target - from) * eased);
        if (progress < 1) this.animationFrame = requestAnimationFrame(tick);
        else resolve();
      };
      this.animationFrame = requestAnimationFrame(tick);
    });
  }

  setBlackout(enabled) {
    this.blackout.classList.toggle("active", Boolean(enabled));
  }

  setAuto(enabled, notify = true) {
    this.autoEnabled = Boolean(enabled);
    clearInterval(this.autoTimer);
    clearTimeout(this.pendingTransition);
    this.autoTimer = null;
    if (this.autoEnabled) {
      this.autoTimer = setInterval(() => this.autoStep(), this.autoSeconds * 1000);
    }
    if (notify) this.onChange({ type: "auto", enabled: this.autoEnabled });
  }

  setAutoSeconds(seconds) {
    this.autoSeconds = Math.max(5, Number(seconds || 24));
    if (this.autoEnabled) this.setAuto(true, false);
  }

  autoStep() {
    const active = this.activeDeck();
    const target = active === "A" ? "B" : "A";
    if (!this.decks[target].queue.length) return;
    this.next(target);
    this.onAutoStep({ active, target });
    this.pendingTransition = setTimeout(() => this.transitionTo(target), 900);
  }

  notify(deck) {
    this.onChange({ type: "deck", deck, state: this.snapshot(deck) });
  }

  snapshot(deck) {
    const target = this.decks[deck];
    return { queue: target.queue.slice(), index: target.index, current: target.current };
  }

  destroy() {
    clearInterval(this.autoTimer);
    clearTimeout(this.pendingTransition);
    cancelAnimationFrame(this.animationFrame);
  }
}
