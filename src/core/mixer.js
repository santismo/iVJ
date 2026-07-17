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

let youtubeApiPromise;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === "function") previousReady();
      resolve(window.YT);
    };

    let script = document.getElementById("youtube-iframe-api");
    if (!script) {
      script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("YouTube player API did not load."));
      document.head.append(script);
    }

    setTimeout(() => {
      if (!window.YT?.Player) reject(new Error("YouTube player API timed out."));
    }, 14000);
  }).catch(error => {
    youtubeApiPromise = undefined;
    throw error;
  });

  return youtubeApiPromise;
}

function fallbackEmbed(videoId) {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    controls: "0",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
    disablekb: "1",
    loop: "1",
    playlist: videoId
  });
  if (location.origin && location.origin !== "null") params.set("origin", location.origin);
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params}`;
}

export class MixerEngine {
  constructor({ outputA, outputB, blackout, onChange = () => {}, onCrossfade = () => {}, onAutoStep = () => {} }) {
    this.slots = { A: outputA, B: outputB };
    this.blackout = blackout;
    this.onChange = onChange;
    this.onCrossfade = onCrossfade;
    this.onAutoStep = onAutoStep;
    this.decks = {
      A: { queue: [], index: -1, current: null, history: [], status: "empty" },
      B: { queue: [], index: -1, current: null, history: [], status: "empty" }
    };
    this.players = { A: null, B: null };
    this.media = { A: null, B: null };
    this.mountTokens = { A: 0, B: 0 };
    this.recoveryTimers = { A: [], B: [] };
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
      if (!this.slots[deck].children.length) this.showPlaceholder(deck, `Deck ${deck}`);
    }
  }

  showPlaceholder(deck, text) {
    this.slots[deck].replaceChildren();
    const placeholder = document.createElement("div");
    placeholder.className = "deck-placeholder";
    placeholder.textContent = text;
    this.slots[deck].append(placeholder);
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
    target.index = target.queue.length ? Math.round(clamp(options.index ?? 0, 0, target.queue.length - 1)) : -1;
    if (options.load !== false && target.index >= 0) this.loadIndex(deck, target.index);
    if (!target.queue.length) {
      target.current = null;
      target.status = "empty";
      this.destroyMedia(deck);
      this.showPlaceholder(deck, `Deck ${deck}`);
      this.notify(deck);
    }
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
    else this.notify(deck);
  }

  loadItem(deck, item) {
    const target = this.decks[deck];
    let index = target.queue.findIndex(candidate => (candidate.id || candidate.url) === (item.id || item.url));
    if (index < 0) {
      target.queue.push(item);
      index = target.queue.length - 1;
    }
    this.loadIndex(deck, index);
  }

  remove(deck, index) {
    const target = this.decks[deck];
    if (index < 0 || index >= target.queue.length) return;
    const [removed] = target.queue.splice(index, 1);
    if (removed?.kind === "local" && removed.url?.startsWith("blob:")) URL.revokeObjectURL(removed.url);
    if (!target.queue.length) {
      target.index = -1;
      target.current = null;
      target.status = "empty";
      this.destroyMedia(deck);
      this.showPlaceholder(deck, `Deck ${deck}`);
      this.notify(deck);
    } else if (index === target.index) {
      this.loadIndex(deck, Math.min(index, target.queue.length - 1));
    } else {
      if (index < target.index) target.index -= 1;
      this.notify(deck);
    }
  }

  shuffle(deck) {
    const target = this.decks[deck];
    const currentKey = target.current?.id || target.current?.url;
    target.queue = shuffled(target.queue);
    target.index = Math.max(0, target.queue.findIndex(item => (item.id || item.url) === currentKey));
    this.notify(deck);
  }

  pickSequentialIndex(deck) {
    const target = this.decks[deck];
    if (!target.queue.length) return -1;
    return (target.index + 1) % target.queue.length;
  }

  pickRandomIndex(deck) {
    const target = this.decks[deck];
    if (!target.queue.length) return -1;
    if (target.queue.length === 1) return 0;
    const recentLimit = Math.min(10, Math.max(1, Math.ceil(target.queue.length / 2)));
    const recent = new Set(this.avoidRepeats ? target.history.slice(-recentLimit) : []);
    let choices = target.queue
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => index !== target.index && !recent.has(item.id || item.url));
    if (!choices.length) choices = target.queue.map((item, index) => ({ item, index })).filter(({ index }) => index !== target.index);
    return choices[Math.floor(Math.random() * choices.length)].index;
  }

  next(deck, options = {}) {
    const index = options.random ? this.pickRandomIndex(deck) : this.pickSequentialIndex(deck);
    if (index >= 0) this.loadIndex(deck, index);
    return index;
  }

  random(deck) {
    return this.next(deck, { random: true });
  }

  loadIndex(deck, index) {
    const target = this.decks[deck];
    const item = target.queue[index];
    if (!item) return false;
    target.index = index;
    target.current = item;
    target.status = "loading";
    const key = item.id || item.url;
    if (key) target.history.push(key);
    if (target.history.length > 30) target.history.splice(0, target.history.length - 30);
    this.mount(deck, item);
    this.notify(deck);
    this.notifyPlayback(deck, "loading", `Loading Deck ${deck}`);
    return true;
  }

  async mount(deck, item) {
    const token = ++this.mountTokens[deck];
    this.clearRecovery(deck);

    if (item.kind === "local" || item.kind === "direct") {
      this.destroyMedia(deck);
      const video = document.createElement("video");
      video.src = item.url;
      video.muted = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      if (item.kind === "direct") video.crossOrigin = "anonymous";
      this.slots[deck].replaceChildren(video);
      this.media[deck] = video;
      video.addEventListener("playing", () => {
        if (token !== this.mountTokens[deck]) return;
        this.decks[deck].status = "playing";
        this.notifyPlayback(deck, "playing", `Deck ${deck} playing`);
      });
      video.addEventListener("error", () => this.handleFailure(deck, token, "Video file could not play."));
      video.play().catch(() => this.armRecovery(deck, token));
      this.armRecovery(deck, token);
      return;
    }

    if (!item.videoId) {
      this.destroyMedia(deck);
      this.showPlaceholder(deck, "Unsupported clip");
      this.notifyPlayback(deck, "error", `Deck ${deck} clip is unsupported`);
      return;
    }

    try {
      const YT = await loadYouTubeApi();
      if (token !== this.mountTokens[deck]) return;

      const existing = this.players[deck];
      if (existing?.loadVideoById && existing.getIframe?.()?.isConnected) {
        existing.mute();
        existing.setVolume?.(0);
        existing.loadVideoById(item.videoId);
        existing.playVideo();
        this.armRecovery(deck, token);
        return;
      }

      this.destroyMedia(deck);
      const host = document.createElement("div");
      host.className = "youtube-player-host";
      this.slots[deck].replaceChildren(host);
      const playerVars = {
        autoplay: 1,
        mute: 1,
        playsinline: 1,
        controls: 0,
        rel: 0,
        fs: 0,
        disablekb: 1,
        modestbranding: 1,
        iv_load_policy: 3,
        loop: 1,
        playlist: item.videoId
      };
      if (location.origin && location.origin !== "null") playerVars.origin = location.origin;
      this.players[deck] = new YT.Player(host, {
        videoId: item.videoId,
        width: "100%",
        height: "100%",
        playerVars,
        events: {
          onReady: () => this.startPlayer(deck),
          onStateChange: event => this.handlePlayerState(deck, event.data),
          onError: () => this.handleFailure(deck, this.mountTokens[deck], "YouTube rejected this embed.")
        }
      });
      this.armRecovery(deck, token);
    } catch (error) {
      if (token !== this.mountTokens[deck]) return;
      this.destroyMedia(deck);
      const iframe = document.createElement("iframe");
      iframe.src = fallbackEmbed(item.videoId);
      iframe.title = item.title || `Deck ${deck} video`;
      iframe.allow = "autoplay; encrypted-media; picture-in-picture";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      this.slots[deck].replaceChildren(iframe);
      this.media[deck] = iframe;
      this.decks[deck].status = "fallback";
      this.notifyPlayback(deck, "fallback", `Deck ${deck} using fallback player`);
      console.warn(error);
    }
  }

  startPlayer(deck) {
    const player = this.players[deck];
    if (!player) return;
    try {
      player.mute();
      player.setVolume?.(0);
      player.playVideo();
      this.armRecovery(deck, this.mountTokens[deck]);
    } catch {}
  }

  handlePlayerState(deck, state) {
    const YT = window.YT;
    if (!YT?.PlayerState) return;
    if (state === YT.PlayerState.PLAYING) {
      this.clearRecovery(deck);
      this.decks[deck].status = "playing";
      this.notifyPlayback(deck, "playing", `Deck ${deck} playing`);
      return;
    }
    if (state === YT.PlayerState.ENDED) {
      this.restart(deck);
      return;
    }
    if ([YT.PlayerState.UNSTARTED, YT.PlayerState.BUFFERING, YT.PlayerState.CUED, YT.PlayerState.PAUSED].includes(state)) {
      this.decks[deck].status = state === YT.PlayerState.BUFFERING ? "buffering" : "loading";
      this.notifyPlayback(deck, this.decks[deck].status, `Deck ${deck} ${this.decks[deck].status}`);
      this.armRecovery(deck, this.mountTokens[deck]);
    }
  }

  armRecovery(deck, token) {
    this.clearRecovery(deck);
    const kick = setTimeout(() => {
      if (token !== this.mountTokens[deck]) return;
      if (document.hidden) return this.armRecovery(deck, token);
      const player = this.players[deck];
      if (player) {
        try {
          player.mute();
          player.playVideo();
        } catch {}
      } else if (this.media[deck]?.play) {
        this.media[deck].play().catch(() => {});
      }
    }, 2600);
    const skip = setTimeout(() => {
      if (token !== this.mountTokens[deck]) return;
      if (document.hidden) return this.armRecovery(deck, token);
      const player = this.players[deck];
      let playing = false;
      try { playing = player?.getPlayerState() === window.YT?.PlayerState?.PLAYING; } catch {}
      if (!playing && this.decks[deck].status !== "playing" && this.decks[deck].status !== "fallback") {
        this.handleFailure(deck, token, "Playback stalled.");
      }
    }, 14000);
    this.recoveryTimers[deck] = [kick, skip];
  }

  handleFailure(deck, token, reason) {
    if (token !== this.mountTokens[deck]) return;
    this.clearRecovery(deck);
    const target = this.decks[deck];
    target.status = "error";
    if (target.queue.length > 1) {
      this.notifyPlayback(deck, "skipping", `${reason} Skipping Deck ${deck}.`, true);
      this.next(deck);
    } else {
      this.notifyPlayback(deck, "error", `${reason} Add another clip or tap restart.`, true);
    }
  }

  clearRecovery(deck) {
    for (const timer of this.recoveryTimers[deck]) clearTimeout(timer);
    this.recoveryTimers[deck] = [];
  }

  destroyMedia(deck) {
    this.clearRecovery(deck);
    if (this.players[deck]) {
      try { this.players[deck].destroy(); } catch {}
      this.players[deck] = null;
    }
    if (this.media[deck]?.pause) {
      try { this.media[deck].pause(); } catch {}
    }
    this.media[deck] = null;
  }

  play(deck) {
    const player = this.players[deck];
    if (player) {
      try { player.mute(); player.playVideo(); } catch {}
    } else if (this.media[deck]?.play) {
      this.media[deck].play().catch(() => {});
    } else if (this.decks[deck].current) {
      this.mount(deck, this.decks[deck].current);
    }
  }

  playAll() {
    this.play("A");
    this.play("B");
  }

  restart(deck) {
    const player = this.players[deck];
    if (player) {
      try { player.seekTo(0, true); player.mute(); player.playVideo(); } catch {}
    } else if (this.media[deck]?.play) {
      try { this.media[deck].currentTime = 0; } catch {}
      this.media[deck].play().catch(() => {});
    } else if (this.decks[deck].current) {
      this.mount(deck, this.decks[deck].current);
    }
    this.armRecovery(deck, this.mountTokens[deck]);
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
    this.slots.A.style.opacity = String(Math.cos(angle));
    this.slots.B.style.opacity = String(Math.sin(angle));
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
    if (this.autoEnabled) this.autoTimer = setInterval(() => this.autoStep(), this.autoSeconds * 1000);
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
    this.next(target, { random: this.randomOrder });
    this.onAutoStep({ active, target });
    this.pendingTransition = setTimeout(() => this.transitionTo(target), 900);
  }

  notify(deck) {
    this.onChange({ type: "deck", deck, state: this.snapshot(deck) });
  }

  notifyPlayback(deck, status, message, important = false) {
    this.onChange({ type: "playback", deck, status, message, important, state: this.snapshot(deck) });
  }

  snapshot(deck) {
    const target = this.decks[deck];
    return { queue: target.queue.slice(), index: target.index, current: target.current, status: target.status };
  }

  destroy() {
    clearInterval(this.autoTimer);
    clearTimeout(this.pendingTransition);
    cancelAnimationFrame(this.animationFrame);
    for (const deck of ["A", "B"]) this.destroyMedia(deck);
  }
}
