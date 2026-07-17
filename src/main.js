import { SessionStore } from "./core/store.js";
import { MixerEngine } from "./core/mixer.js";
import { EffectsEngine, SCENES } from "./core/effects.js";
import { InvidiousSource, extractYouTubePlaylistId } from "./discovery/invidious-source.js";
import { BUILT_IN_PLAYLISTS, REMOTE_PLAYLISTS, STARTER_DECKS, splitAcrossDecks, uniqueClips } from "./data/playlists.js";
import { setActiveTab, renderScenes, renderPlaylistCards, renderDeck, showToast, downloadText } from "./ui/render.js";

const $ = id => document.getElementById(id);
const store = new SessionStore();
const source = new InvidiousSource(store.get().settings.invidiousBase);
const playlistCatalog = [...BUILT_IN_PLAYLISTS, ...REMOTE_PLAYLISTS];
const globalLibrary = uniqueClips();
let urlTarget = "A";
let wakeLock = null;
let sourceDiscoveryAttempted = false;

const SCENE_MIGRATIONS = Object.freeze({
  Dream: "Dream Trails",
  VHS: "VHS Smear",
  Neon: "Neon Edges",
  Acid: "Kaleido Acid",
  Noir: "Noir Trails",
  Mono: "Chrome Split",
  Heat: "Heat Echo",
  Night: "Surveillance"
});

function updateSourceStatus(text, mode = "ready") {
  $("sourceStatus").textContent = text;
  $("sourceDot").className = `status-dot${mode === "error" ? " error" : mode === "working" ? " working" : ""}`;
}

function setTransportStatus(text) {
  $("transportStatus").textContent = text || "Ready";
}

function persistDeck(deck, snapshot) {
  store.update(state => {
    state.decks[deck] = { queue: snapshot.queue, index: snapshot.index };
  });
}

function renderDeckView(deck) {
  const snapshot = mixer.snapshot(deck);
  renderDeck({
    deck,
    snapshot,
    queueContainer: $(`deck${deck}Queue`),
    nowContainer: $(`deck${deck}Now`),
    countContainer: $(`deck${deck}Count`),
    onLoad: index => mixer.loadIndex(deck, index),
    onRemove: index => mixer.remove(deck, index)
  });
}

function syncCrossfader(value) {
  const percentB = Math.round(Number(value) * 100);
  const percentA = 100 - percentB;
  $("crossfader").value = value;
  $("mixCrossfader").value = value;
  $("crossfadeReadout").textContent = `${percentA} / ${percentB}`;
  $("mixCrossfadeValue").textContent = `${percentB}% B`;
}

const mixer = new MixerEngine({
  outputA: $("deckAOutput"),
  outputB: $("deckBOutput"),
  blackout: $("blackout"),
  onChange: event => {
    if (event.type === "deck") {
      persistDeck(event.deck, event.state);
      renderDeckView(event.deck);
    }
    if (event.type === "playback") {
      renderDeckView(event.deck);
      setTransportStatus(event.message);
      if (event.important) showToast(event.message, 3800);
    }
    if (event.type === "auto") {
      store.update(state => { state.mixer.autoEnabled = event.enabled; });
      $("autoVjToggle").checked = event.enabled;
      $("autoVjButton").classList.toggle("active", event.enabled);
      setTransportStatus(event.enabled ? "Auto VJ running" : "Manual mixing");
    }
  },
  onCrossfade: value => {
    syncCrossfader(value);
    store.update(state => { state.mixer.crossfade = value; });
  },
  onAutoStep: ({ target }) => {
    setTransportStatus(`Auto VJ preparing Deck ${target}`);
    if (store.get().fx.autoRoll) effects.randomScene();
  }
});

const effects = new EffectsEngine({
  layer: $("visualLayer"),
  overlay: $("screenFx"),
  geometry: $("geometryFx"),
  onScene: (name, sceneState) => {
    const blendMode = sceneState.blendMode || store.get().mixer.blendMode;
    mixer.setBlendMode(blendMode);
    $("blendMode").value = blendMode;
    const { swatch, ...persistentFx } = sceneState;
    store.update(state => {
      state.fx = { ...state.fx, ...persistentFx, scene: name };
      state.mixer.blendMode = blendMode;
    });
    syncFxControls();
    renderScenePicker();
    setTransportStatus(`FX · ${name}`);
  }
});

function renderScenePicker() {
  renderScenes($("sceneGrid"), SCENES, effects.state.scene, name => effects.setScene(name));
}

function syncFxControls() {
  const fx = effects.state;
  $("fxIntensity").value = fx.intensity ?? .7;
  $("fxHue").value = fx.hue ?? 0;
  $("fxSaturation").value = fx.saturation ?? 1;
  $("fxContrast").value = fx.contrast ?? 1;
  $("fxZoom").value = fx.zoom ?? 1;
  $("fxRotation").value = fx.rotation ?? 0;
  $("geometryMode").value = fx.geometry || "none";
  $("mirrorXToggle").checked = Boolean(fx.mirrorX);
  $("mirrorYToggle").checked = Boolean(fx.mirrorY);
  $("scanlinesToggle").checked = Boolean(fx.scanlines);
  $("vignetteToggle").checked = Boolean(fx.vignette);
  $("noiseToggle").checked = Boolean(fx.noise);
  $("autoFxToggle").checked = Boolean(store.get().fx.autoRoll);
  $("fxIntensityValue").textContent = `${Math.round((fx.intensity ?? .7) * 100)}%`;
  $("fxHueValue").textContent = `${Math.round(fx.hue || 0)}°`;
  $("fxSaturationValue").textContent = `${Math.round((fx.saturation || 1) * 100)}%`;
  $("fxContrastValue").textContent = `${Math.round((fx.contrast || 1) * 100)}%`;
  $("fxZoomValue").textContent = `${Number(fx.zoom || 1).toFixed(2)}×`;
  $("fxRotationValue").textContent = `${Number(fx.rotation || 0).toFixed(1).replace(".0", "")}°`;
  $("filterModeGrid").querySelectorAll("[data-filter-mode]").forEach(button => button.classList.toggle("active", button.dataset.filterMode === (fx.filterMode || "none")));
}

function syncStateToUi() {
  const state = store.get();
  $("blendMode").value = state.mixer.blendMode;
  $("transitionStyle").value = state.mixer.transitionStyle;
  $("transitionTime").value = state.mixer.transitionSeconds;
  $("transitionTimeValue").textContent = `${Number(state.mixer.transitionSeconds).toFixed(1)}s`;
  $("autoInterval").value = state.mixer.autoSeconds;
  $("autoIntervalValue").textContent = `${state.mixer.autoSeconds}s`;
  $("autoVjToggle").checked = state.mixer.autoEnabled;
  $("autoVjButton").classList.toggle("active", state.mixer.autoEnabled);
  $("avoidRepeats").checked = state.mixer.avoidRepeats;
  $("randomOrder").checked = state.mixer.randomOrder;
  $("blackoutButton").classList.toggle("active", state.mixer.blackout);
  $("invidiousBase").value = state.settings.invidiousBase || "";
  $("qualityMode").value = state.settings.quality || "auto";
  applyQuality(state.settings.quality);
  syncCrossfader(state.mixer.crossfade);
  syncFxControls();
}

function applyQuality(mode) {
  document.body.classList.toggle("quality-mobile", mode === "mobile" || (mode === "auto" && matchMedia("(max-width: 820px)").matches));
  $("fpsStatus").textContent = `${String(mode || "auto").toUpperCase()} quality`;
}

function replaceByTarget(items, target) {
  if (target === "both") {
    const split = splitAcrossDecks(items);
    mixer.setQueue("A", split.A);
    mixer.setQueue("B", split.B);
  } else {
    mixer.setQueue(target, items);
  }
  mixer.playAll();
}

function appendByTarget(items, target = urlTarget) {
  if (!items.length) return;
  if (target === "both") {
    const split = splitAcrossDecks(items);
    mixer.appendQueue("A", split.A);
    mixer.appendQueue("B", split.B);
  } else {
    mixer.appendQueue(target, items);
  }
}

async function loadPlaylist(playlist, target, button) {
  const originalText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Loading…";
  }
  updateSourceStatus(`Loading ${playlist.title}`, "working");
  try {
    let items = playlist.items ? playlist.items.slice() : [];
    if (!items.length && playlist.url) {
      if (!sourceDiscoveryAttempted) {
        sourceDiscoveryAttempted = true;
        await source.discoverInstances();
      }
      items = await source.playlist(playlist.url);
    }
    if (!items.length) throw new Error("That playlist did not return any playable videos.");
    replaceByTarget(items, target);
    setActiveTab("decks");
    updateSourceStatus(playlist.items ? "Built-in visual library ready" : `Playlist via ${new URL(source.lastWorkingBase).hostname}`);
    showToast(`${playlist.title}: loaded ${items.length} clips${target === "both" ? " across both decks" : ` on Deck ${target}`}.`);
  } catch (error) {
    updateSourceStatus("Online playlist unavailable", "error");
    showToast(`${error.message} The built-in playlists still work offline.`, 4400);
    console.warn(error);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function renderPlaylistLibrary() {
  renderPlaylistCards($("playlistGrid"), playlistCatalog, loadPlaylist);
}

function resetDefaultDecks(showMessage = true) {
  mixer.setQueue("A", STARTER_DECKS.A);
  mixer.setQueue("B", STARTER_DECKS.B);
  mixer.playAll();
  if (showMessage) showToast("Restored the default visual banks on both decks.");
}

function randomBoth(showMessage = true) {
  mixer.random("A");
  mixer.random("B");
  mixer.playAll();
  setTransportStatus("Randomized both loaded decks");
  if (showMessage) showToast("Randomized both decks without repeating the current clips.");
}

function pickDifferent(pool, excludedId = "") {
  const choices = pool.filter(item => item.id !== excludedId);
  return choices[Math.floor(Math.random() * choices.length)] || pool[0];
}

function fullRandom(showMessage = true) {
  const itemA = pickDifferent(globalLibrary);
  const itemB = pickDifferent(globalLibrary, itemA?.id);
  if (itemA) mixer.loadItem("A", itemA);
  if (itemB) mixer.loadItem("B", itemB);
  mixer.playAll();
  setTransportStatus("New pair from the full visual library");
  if (showMessage) showToast("Loaded a new random pair from the full built-in library.");
}

function setBlendMode(mode) {
  mixer.setBlendMode(mode);
  $("blendMode").value = mode;
  store.update(state => { state.mixer.blendMode = mode; });
}

function globalRoll() {
  fullRandom(false);
  effects.randomScene();
  const modes = ["screen", "difference", "exclusion", "overlay", "hard-light", "lighten", "color-dodge"];
  setBlendMode(modes[Math.floor(Math.random() * modes.length)]);
  const positions = [0, .18, .32, .5, .68, .82, 1];
  mixer.setCrossfade(positions[Math.floor(Math.random() * positions.length)]);
  mixer.playAll();
  setTransportStatus(`GLOBAL · ${effects.state.scene} · ${mixer.blendMode}`);
  showToast("Global roll: new videos, effect preset, blend, and mix position.");
}

async function addMediaUrl() {
  const value = $("mediaUrl").value.trim();
  if (!value) return;
  const playlistId = extractYouTubePlaylistId(value);
  updateSourceStatus(playlistId ? "Loading playlist" : "Adding video", "working");
  try {
    if (playlistId) {
      if (!sourceDiscoveryAttempted) {
        sourceDiscoveryAttempted = true;
        await source.discoverInstances();
      }
      const items = await source.playlist(value);
      appendByTarget(items);
      showToast(`Added ${items.length} playlist clips.`);
    } else {
      const item = source.fromVideoUrl(value);
      if (!item) throw new Error("Paste a valid YouTube video or playlist URL.");
      appendByTarget([item]);
      showToast("Video added.");
    }
    $("mediaUrl").value = "";
    mixer.playAll();
    updateSourceStatus(source.lastWorkingBase ? `Playlists via ${new URL(source.lastWorkingBase).hostname}` : "Visual library ready");
  } catch (error) {
    updateSourceStatus("Could not add media", "error");
    showToast(error.message, 3800);
  }
}

function addLocalFiles(fileList) {
  const items = [...fileList].map(file => ({
    id: `local:${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
    kind: "local",
    source: "Local",
    title: file.name,
    author: "This device",
    durationSeconds: 0,
    thumbnail: "./assets/icon.svg",
    url: URL.createObjectURL(file)
  }));
  appendByTarget(items);
  mixer.playAll();
  showToast(`Added ${items.length} local video${items.length === 1 ? "" : "s"}.`);
}

function updateFxFromControls() {
  const next = {
    intensity: Number($("fxIntensity").value),
    hue: Number($("fxHue").value),
    saturation: Number($("fxSaturation").value),
    contrast: Number($("fxContrast").value),
    zoom: Number($("fxZoom").value),
    rotation: Number($("fxRotation").value),
    geometry: $("geometryMode").value,
    mirrorX: $("mirrorXToggle").checked,
    mirrorY: $("mirrorYToggle").checked,
    scanlines: $("scanlinesToggle").checked,
    vignette: $("vignetteToggle").checked,
    noise: $("noiseToggle").checked
  };
  effects.setState(next);
  store.update(state => { state.fx = { ...state.fx, ...next }; });
  syncFxControls();
}

function setFilterMode(mode) {
  effects.setState({ filterMode: mode });
  store.update(state => { state.fx.filterMode = mode; });
  syncFxControls();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      mixer.playAll();
      await $("stage").requestFullscreen({ navigationUI: "hide" });
    }
  } catch {
    togglePerformance(true);
  }
}

function togglePerformance(force) {
  const enabled = typeof force === "boolean" ? force : !document.body.classList.contains("performance-mode");
  document.body.classList.toggle("performance-mode", enabled);
  $("performanceButton").classList.toggle("active", enabled);
  if (enabled) mixer.playAll();
}

async function toggleWakeLock() {
  if (!("wakeLock" in navigator)) return showToast("Screen wake lock is not supported in this browser.");
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
      $("wakeButton").classList.remove("active");
      showToast("Normal screen sleep restored.");
    } else {
      wakeLock = await navigator.wakeLock.request("screen");
      $("wakeButton").classList.add("active");
      wakeLock.addEventListener("release", () => { wakeLock = null; $("wakeButton").classList.remove("active"); });
      showToast("Screen will stay awake during the set.");
    }
  } catch (error) {
    showToast(`Wake lock unavailable: ${error.message}`);
  }
}

function bindUi() {
  document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => setActiveTab(button.dataset.tab)));

  $("urlDeckTarget").addEventListener("click", event => {
    const button = event.target.closest("[data-value]");
    if (!button) return;
    urlTarget = button.dataset.value;
    $("urlDeckTarget").querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
  });
  $("addUrlButton").addEventListener("click", addMediaUrl);
  $("mediaUrl").addEventListener("keydown", event => { if (event.key === "Enter") addMediaUrl(); });
  $("localFiles").addEventListener("change", event => addLocalFiles(event.target.files));
  $("resetDefaultDecksButton").addEventListener("click", () => resetDefaultDecks());
  $("randomBothPanelButton").addEventListener("click", () => randomBoth());
  $("fullRandomPanelButton").addEventListener("click", () => fullRandom());
  $("globalRollPanelButton").addEventListener("click", globalRoll);

  $("clearQueuesButton").addEventListener("click", () => {
    if (!confirm("Clear both iVJ deck queues?")) return;
    mixer.setQueue("A", []);
    mixer.setQueue("B", []);
  });
  document.querySelectorAll("[data-deck-action]").forEach(button => button.addEventListener("click", () => {
    const deck = button.dataset.deck;
    const action = button.dataset.deckAction;
    if (action === "restart") mixer.restart(deck);
    if (action === "random") mixer.random(deck);
    if (action === "next") mixer.next(deck);
    if (action === "shuffle") mixer.shuffle(deck);
  }));

  for (const id of ["crossfader", "mixCrossfader"]) $(id).addEventListener("input", event => mixer.setCrossfade(event.target.value));
  $("cutAButton").addEventListener("click", () => mixer.transitionTo("A", { style: "cut", seconds: 0 }));
  $("cutBButton").addEventListener("click", () => mixer.transitionTo("B", { style: "cut", seconds: 0 }));
  $("nextAButton").addEventListener("click", () => mixer.next("A"));
  $("nextBButton").addEventListener("click", () => mixer.next("B"));
  $("randomAButton").addEventListener("click", () => mixer.random("A"));
  $("randomBButton").addEventListener("click", () => mixer.random("B"));
  $("playBothButton").addEventListener("click", () => { mixer.playAll(); setTransportStatus("Play requested on both decks"); });
  $("randomBothButton").addEventListener("click", () => randomBoth());
  $("fullRandomButton").addEventListener("click", () => fullRandom());
  $("globalRollButton").addEventListener("click", globalRoll);
  $("blendMode").addEventListener("change", event => setBlendMode(event.target.value));
  $("transitionStyle").addEventListener("change", event => { mixer.transitionStyle = event.target.value; store.update(state => { state.mixer.transitionStyle = event.target.value; }); });
  $("transitionTime").addEventListener("input", event => {
    mixer.transitionSeconds = Number(event.target.value);
    $("transitionTimeValue").textContent = `${Number(event.target.value).toFixed(1)}s`;
    store.update(state => { state.mixer.transitionSeconds = Number(event.target.value); });
  });
  $("autoInterval").addEventListener("input", event => {
    const seconds = Number(event.target.value);
    mixer.setAutoSeconds(seconds);
    $("autoIntervalValue").textContent = `${seconds}s`;
    store.update(state => { state.mixer.autoSeconds = seconds; });
  });
  $("autoVjToggle").addEventListener("change", event => mixer.setAuto(event.target.checked));
  $("autoVjButton").addEventListener("click", () => mixer.setAuto(!mixer.autoEnabled));
  $("avoidRepeats").addEventListener("change", event => { mixer.avoidRepeats = event.target.checked; store.update(state => { state.mixer.avoidRepeats = event.target.checked; }); });
  $("randomOrder").addEventListener("change", event => { mixer.randomOrder = event.target.checked; store.update(state => { state.mixer.randomOrder = event.target.checked; }); });
  $("blackoutButton").addEventListener("click", () => {
    const enabled = !store.get().mixer.blackout;
    mixer.setBlackout(enabled);
    $("blackoutButton").classList.toggle("active", enabled);
    store.update(state => { state.mixer.blackout = enabled; });
  });

  $("randomSceneButton").addEventListener("click", () => effects.randomScene());
  $("resetFxButton").addEventListener("click", () => effects.setScene("Clean"));
  $("filterModeGrid").addEventListener("click", event => {
    const button = event.target.closest("[data-filter-mode]");
    if (button) setFilterMode(button.dataset.filterMode);
  });
  for (const id of ["fxIntensity", "fxHue", "fxSaturation", "fxContrast", "fxZoom", "fxRotation"]) $(id).addEventListener("input", updateFxFromControls);
  for (const id of ["geometryMode", "mirrorXToggle", "mirrorYToggle", "scanlinesToggle", "vignetteToggle", "noiseToggle"]) $(id).addEventListener("change", updateFxFromControls);
  $("autoFxToggle").addEventListener("change", event => store.update(state => { state.fx.autoRoll = event.target.checked; }));

  $("invidiousBase").addEventListener("change", event => {
    source.setPreferredBase(event.target.value);
    store.update(state => { state.settings.invidiousBase = event.target.value.trim(); });
  });
  $("testSourceButton").addEventListener("click", async () => {
    updateSourceStatus("Testing playlist source", "working");
    try {
      source.setPreferredBase($("invidiousBase").value);
      if (!sourceDiscoveryAttempted) {
        sourceDiscoveryAttempted = true;
        await source.discoverInstances();
      }
      const items = await source.playlist(REMOTE_PLAYLISTS[0].url, 1);
      if (!items.length) throw new Error("The provider returned no playlist videos.");
      updateSourceStatus(`Playlist source ready · ${new URL(source.lastWorkingBase).hostname}`);
      showToast(`Playlist source works — read ${items.length} clips.`);
    } catch (error) {
      updateSourceStatus("Playlist source unavailable", "error");
      showToast(`Provider test failed: ${error.message}`, 4000);
    }
  });
  $("qualityMode").addEventListener("change", event => { applyQuality(event.target.value); store.update(state => { state.settings.quality = event.target.value; }); });
  $("exportSessionButton").addEventListener("click", () => downloadText(`ivj-session-${new Date().toISOString().slice(0,10)}.json`, store.exportJson()));
  $("importSessionFile").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      store.importJson(await file.text());
      showToast("Session imported. Reloading…");
      setTimeout(() => location.reload(), 500);
    } catch (error) {
      showToast(error.message, 3600);
    }
  });
  $("resetSessionButton").addEventListener("click", () => {
    if (!confirm("Reset iVJ queues, FX, and settings?")) return;
    store.reset();
    location.reload();
  });

  $("fullscreenButton").addEventListener("click", toggleFullscreen);
  $("performanceButton").addEventListener("click", () => togglePerformance());
  $("wakeButton").addEventListener("click", toggleWakeLock);
  $("stage").addEventListener("click", () => {
    if (document.body.classList.contains("performance-mode")) togglePerformance(false);
    else {
      mixer.playAll();
      setTransportStatus("Play requested on both decks");
    }
  });
  document.addEventListener("fullscreenchange", () => {
    $("fullscreenButton").textContent = document.fullscreenElement ? "Exit full" : "Fullscreen";
  });
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    mixer.playAll();
    if ($("wakeButton").classList.contains("active") && !wakeLock) {
      try { wakeLock = await navigator.wakeLock.request("screen"); } catch {}
    }
  });

  document.addEventListener("keydown", event => {
    if (["INPUT", "SELECT"].includes(document.activeElement?.tagName)) return;
    const key = event.key.toLowerCase();
    if (event.key === "1") mixer.next("A");
    if (event.key === "2") mixer.next("B");
    if (key === "q") mixer.random("A");
    if (key === "w") mixer.random("B");
    if (event.key === "ArrowLeft") mixer.setCrossfade(mixer.crossfade - .04);
    if (event.key === "ArrowRight") mixer.setCrossfade(mixer.crossfade + .04);
    if (key === "r") effects.randomScene();
    if (key === "g") globalRoll();
    if (key === "b") $("blackoutButton").click();
    if (key === "f") toggleFullscreen();
    if (event.code === "Space") { event.preventDefault(); mixer.setAuto(!mixer.autoEnabled); }
  });
}

function isOldSingleStarter(queue) {
  return queue.length === 1 && ["youtube:3pxrECZYEAA", "youtube:dS-MaUk6YBI"].includes(queue[0]?.id);
}

function boot() {
  const state = store.get();
  bindUi();
  renderPlaylistLibrary();
  mixer.configure(state.mixer);
  const sceneName = SCENE_MIGRATIONS[state.fx.scene] || state.fx.scene;
  effects.setState({ ...state.fx, scene: SCENES[sceneName] ? sceneName : "Dream Trails" });
  const queueA = state.decks.A.queue.length && !isOldSingleStarter(state.decks.A.queue) ? state.decks.A.queue : STARTER_DECKS.A;
  const queueB = state.decks.B.queue.length && !isOldSingleStarter(state.decks.B.queue) ? state.decks.B.queue : STARTER_DECKS.B;
  mixer.setQueue("A", queueA, { index: Math.max(0, state.decks.A.index) });
  mixer.setQueue("B", queueB, { index: Math.max(0, state.decks.B.index) });
  renderScenePicker();
  syncStateToUi();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(error => console.warn("Service worker registration failed", error));
  updateSourceStatus("Built-in visual library ready");
  setTransportStatus("Tap Play both if your browser pauses the embeds");
}

boot();
window.addEventListener("pageshow", () => mixer.playAll());
window.addEventListener("beforeunload", () => mixer.destroy());
