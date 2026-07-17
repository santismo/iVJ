import { SessionStore } from "./core/store.js";
import { MixerEngine } from "./core/mixer.js";
import { EffectsEngine, SCENES } from "./core/effects.js";
import { AudioReactiveEngine } from "./core/audio.js";
import { planVisualSet, scoreVideo, splitAcrossDecks } from "./discovery/prompt-planner.js";
import { enhancePlanWithProxy } from "./discovery/ai-planner.js";
import { InvidiousSource, extractYouTubePlaylistId } from "./discovery/invidious-source.js";
import { setActiveTab, renderScenes, renderPlan, renderResults, renderDeck, showToast, downloadText, shuffled } from "./ui/render.js";

const $ = id => document.getElementById(id);
const store = new SessionStore();
let currentPlan = store.get().discovery.lastPlan;
let discoveryResults = [];
let selectedResults = new Set();
let urlTarget = "A";
let wakeLock = null;
let sourceDiscoveryAttempted = false;
let lastBeatCut = 0;

const STARTER_DECKS = {
  A: [{ id: "youtube:3pxrECZYEAA", videoId: "3pxrECZYEAA", kind: "youtube", source: "YouTube", title: "iVJ starter visual A", author: "", durationSeconds: 0, thumbnail: "https://i.ytimg.com/vi/3pxrECZYEAA/hqdefault.jpg", url: "https://www.youtube.com/watch?v=3pxrECZYEAA" }],
  B: [{ id: "youtube:dS-MaUk6YBI", videoId: "dS-MaUk6YBI", kind: "youtube", source: "YouTube", title: "iVJ starter visual B", author: "", durationSeconds: 0, thumbnail: "https://i.ytimg.com/vi/dS-MaUk6YBI/hqdefault.jpg", url: "https://www.youtube.com/watch?v=dS-MaUk6YBI" }]
};

const source = new InvidiousSource(store.get().settings.invidiousBase);

function updateSourceStatus(text, mode = "ready") {
  $("sourceStatus").textContent = text;
  $("sourceDot").className = `status-dot${mode === "error" ? " error" : mode === "working" ? " working" : ""}`;
}

function setStageStatus(text) {
  $("stageCenterStatus").textContent = String(text || "READY").toUpperCase();
}

function selectedItems() {
  return discoveryResults.filter(item => selectedResults.has(item.id));
}

function persistDeck(deck, snapshot) {
  store.update(state => {
    state.decks[deck] = { queue: snapshot.queue, index: snapshot.index };
  });
}

function updateStageTitles() {
  const A = mixer.snapshot("A").current;
  const B = mixer.snapshot("B").current;
  $("stageTitleA").textContent = A?.title || "No clip loaded";
  $("stageTitleB").textContent = B?.title || "No clip loaded";
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
  updateStageTitles();
}

function syncCrossfader(value) {
  const percentB = Math.round(value * 100);
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
    if (event.type === "auto") {
      store.update(state => { state.mixer.autoEnabled = event.enabled; });
      $("autoVjToggle").checked = event.enabled;
      $("autoVjButton").classList.toggle("active", event.enabled);
      setStageStatus(event.enabled ? "AUTO" : "READY");
    }
  },
  onCrossfade: value => {
    syncCrossfader(value);
    store.update(state => { state.mixer.crossfade = value; });
  },
  onAutoStep: ({ target }) => {
    setStageStatus(`NEXT ${target}`);
    if (store.get().fx.autoRoll) effects.randomScene();
    setTimeout(() => setStageStatus("AUTO"), 1800);
  }
});

const effects = new EffectsEngine({
  stage: $("stage"),
  overlay: $("screenFx"),
  onScene: (name, sceneState) => {
    mixer.setBlendMode(sceneState.blendMode || store.get().mixer.blendMode);
    $("blendMode").value = sceneState.blendMode || "normal";
    store.update(state => {
      state.fx = { ...state.fx, ...sceneState, scene: name };
      state.mixer.blendMode = sceneState.blendMode || state.mixer.blendMode;
    });
    syncFxControls();
    renderScenePicker();
    setStageStatus(name);
  }
});

const audio = new AudioReactiveEngine({
  player: $("audioPlayer"),
  onFrame: frame => {
    const sensitivity = store.get().audio.sensitivity;
    $("audioLevel").style.width = `${Math.min(100, frame.level * sensitivity * 125)}%`;
    effects.updateAudio(frame);
    if (frame.beat && store.get().audio.beatCuts && performance.now() - lastBeatCut > 1800) {
      lastBeatCut = performance.now();
      const hidden = mixer.activeDeck() === "A" ? "B" : "A";
      mixer.next(hidden);
      setStageStatus(`BEAT ${hidden}`);
    }
  },
  onStatus: message => showToast(message)
});

function renderScenePicker() {
  renderScenes($("sceneGrid"), SCENES, effects.state.scene, name => effects.setScene(name));
}

function syncFxControls() {
  const fx = effects.state;
  $("fxIntensity").value = fx.intensity ?? .65;
  $("fxHue").value = fx.hue ?? 0;
  $("fxSaturation").value = fx.saturation ?? 1;
  $("fxContrast").value = fx.contrast ?? 1;
  $("fxZoom").value = fx.zoom ?? 1;
  $("scanlinesToggle").checked = Boolean(fx.scanlines);
  $("vignetteToggle").checked = Boolean(fx.vignette);
  $("autoFxToggle").checked = Boolean(store.get().fx.autoRoll);
  $("fxIntensityValue").textContent = `${Math.round((fx.intensity ?? .65) * 100)}%`;
  $("fxHueValue").textContent = `${Math.round(fx.hue || 0)}°`;
  $("fxSaturationValue").textContent = `${Math.round((fx.saturation || 1) * 100)}%`;
  $("fxContrastValue").textContent = `${Math.round((fx.contrast || 1) * 100)}%`;
  $("fxZoomValue").textContent = `${Number(fx.zoom || 1).toFixed(2)}×`;
}

function syncStateToUi() {
  const state = store.get();
  $("setPrompt").value = state.discovery.prompt || "";
  $("blendMode").value = state.mixer.blendMode;
  $("transitionStyle").value = state.mixer.transitionStyle;
  $("transitionTime").value = state.mixer.transitionSeconds;
  $("transitionTimeValue").textContent = `${Number(state.mixer.transitionSeconds).toFixed(1)}s`;
  $("autoInterval").value = state.mixer.autoSeconds;
  $("autoIntervalValue").textContent = `${state.mixer.autoSeconds}s`;
  $("autoVjToggle").checked = state.mixer.autoEnabled;
  $("avoidRepeats").checked = state.mixer.avoidRepeats;
  $("randomOrder").checked = state.mixer.randomOrder;
  $("blackoutButton").classList.toggle("active", state.mixer.blackout);
  $("audioSensitivity").value = state.audio.sensitivity;
  $("audioSensitivityValue").textContent = `${Number(state.audio.sensitivity).toFixed(1)}×`;
  $("audioPulseToggle").checked = state.audio.pulse;
  $("audioColorToggle").checked = state.audio.color;
  $("beatCutsToggle").checked = state.audio.beatCuts;
  $("invidiousBase").value = state.settings.invidiousBase || "";
  $("aiProxyUrl").value = state.settings.aiProxyUrl || "";
  $("qualityMode").value = state.settings.quality || "auto";
  applyQuality(state.settings.quality);
  syncCrossfader(state.mixer.crossfade);
  syncFxControls();
}

function applyQuality(mode) {
  document.body.classList.toggle("quality-mobile", mode === "mobile" || (mode === "auto" && matchMedia("(max-width: 820px)").matches));
  $("fpsStatus").textContent = `${String(mode || "auto").toUpperCase()} quality`;
}

async function createPlan({ search = false } = {}) {
  const prompt = $("setPrompt").value.trim();
  let plan;
  try {
    plan = planVisualSet(prompt);
  } catch (error) {
    showToast(error.message);
    $("setPrompt").focus();
    return;
  }
  const proxy = store.get().settings.aiProxyUrl;
  if (proxy) {
    $("discoveryProgress").classList.remove("hidden");
    $("discoveryProgressText").textContent = "Asking AI planner…";
    try {
      plan = await enhancePlanWithProxy(prompt, plan, proxy);
    } catch (error) {
      showToast(`AI planner unavailable; using keyless plan. ${error.message}`);
    }
  }
  currentPlan = plan;
  store.update(state => {
    state.discovery.prompt = prompt;
    state.discovery.lastPlan = plan;
  });
  renderPlan(plan, { queryContainer: $("queryChips"), summaryContainer: $("planSummary") });
  $("searchPlan").classList.remove("hidden");
  $("discoveryProgress").classList.add("hidden");
  if (!search) return plan;

  effects.setScene(plan.suggestedScene || "Clean");
  mixer.setAutoSeconds(plan.suggestedInterval || 22);
  $("autoInterval").value = plan.suggestedInterval || 22;
  $("autoIntervalValue").textContent = `${plan.suggestedInterval || 22}s`;
  store.update(state => { state.mixer.autoSeconds = plan.suggestedInterval || 22; });
  $("discoveryProgress").classList.remove("hidden");
  $("discoveryProgressText").textContent = "Connecting to video search…";
  updateSourceStatus("Searching videos", "working");
  try {
    if (!sourceDiscoveryAttempted) {
      sourceDiscoveryAttempted = true;
      await source.discoverInstances();
    }
    const found = await source.searchMany(plan.queries, progress => {
      $("discoveryProgressText").textContent = `Search ${progress.completed}/${progress.total} · ${progress.count} candidates`;
    });
    discoveryResults = found
      .map(item => ({ ...item, score: scoreVideo(item, plan) }))
      .filter(item => item.score > -80)
      .sort((a, b) => b.score - a.score)
      .slice(0, 72);
    selectedResults = new Set(discoveryResults.slice(0, 30).map(item => item.id));
    renderDiscoveryResults();
    $("resultsBlock").classList.remove("hidden");
    $("resultsTitle").textContent = `${discoveryResults.length} visual candidates`;
    updateSourceStatus(source.lastWorkingBase ? `Search via ${new URL(source.lastWorkingBase).hostname}` : "Search ready");
    if (!discoveryResults.length) showToast("No videos matched. Try broader wording or add a playlist URL.");
  } catch (error) {
    updateSourceStatus("Search source unavailable", "error");
    showToast("Video search could not connect. Try a custom Invidious instance or add a YouTube playlist.", 4200);
    console.warn(error);
  } finally {
    $("discoveryProgress").classList.add("hidden");
  }
  return plan;
}

function renderDiscoveryResults() {
  renderResults($("resultsGrid"), discoveryResults, selectedResults, item => {
    if (selectedResults.has(item.id)) selectedResults.delete(item.id);
    else selectedResults.add(item.id);
    renderDiscoveryResults();
  });
}

function buildDecksFromResults() {
  const items = selectedItems();
  if (!items.length) return showToast("Select at least one result first.");
  const split = splitAcrossDecks(items);
  if (!split.B.length) split.B = split.A.slice();
  mixer.setQueue("A", split.A);
  mixer.setQueue("B", split.B);
  if (currentPlan?.suggestedScene) effects.setScene(currentPlan.suggestedScene);
  setActiveTab("decks");
  showToast(`Built Deck A with ${split.A.length} and Deck B with ${split.B.length} clips.`);
}

function appendByTarget(items, target = urlTarget) {
  if (!items.length) return;
  if (target === "both") {
    const split = splitAcrossDecks(items);
    mixer.appendQueue("A", split.A);
    mixer.appendQueue("B", split.B.length ? split.B : split.A);
  } else {
    mixer.appendQueue(target, items);
  }
}

async function addMediaUrl() {
  const value = $("mediaUrl").value.trim();
  if (!value) return;
  const playlistId = extractYouTubePlaylistId(value);
  updateSourceStatus(playlistId ? "Loading playlist" : "Adding video", "working");
  try {
    if (playlistId) {
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
    updateSourceStatus(source.lastWorkingBase ? `Playlists via ${new URL(source.lastWorkingBase).hostname}` : "Sources ready");
  } catch (error) {
    updateSourceStatus("Could not add media", "error");
    showToast(error.message, 3600);
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
  showToast(`Added ${items.length} local video${items.length === 1 ? "" : "s"}.`);
}

function updateFxFromControls() {
  const next = {
    intensity: Number($("fxIntensity").value),
    hue: Number($("fxHue").value),
    saturation: Number($("fxSaturation").value),
    contrast: Number($("fxContrast").value),
    zoom: Number($("fxZoom").value),
    scanlines: $("scanlinesToggle").checked,
    vignette: $("vignetteToggle").checked
  };
  effects.setState(next);
  store.update(state => { state.fx = { ...state.fx, ...next }; });
  syncFxControls();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("stage").requestFullscreen({ navigationUI: "hide" });
  } catch {
    togglePerformance(true);
  }
}

function togglePerformance(force) {
  const enabled = typeof force === "boolean" ? force : !document.body.classList.contains("performance-mode");
  document.body.classList.toggle("performance-mode", enabled);
  $("performanceButton").classList.toggle("active", enabled);
  if (enabled) setStageStatus(mixer.autoEnabled ? "AUTO" : effects.state.scene);
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
  $("promptPresets").addEventListener("click", event => {
    const button = event.target.closest("[data-prompt]");
    if (button) $("setPrompt").value = button.dataset.prompt;
  });
  $("buildSetButton").addEventListener("click", () => createPlan({ search: true }));
  $("planOnlyButton").addEventListener("click", () => createPlan({ search: false }));
  $("editPlanButton").addEventListener("click", () => $("setPrompt").focus());
  $("selectAllResults").addEventListener("click", () => { selectedResults = new Set(discoveryResults.map(item => item.id)); renderDiscoveryResults(); });
  $("clearResults").addEventListener("click", () => { selectedResults.clear(); renderDiscoveryResults(); });
  $("shuffleResultsButton").addEventListener("click", () => { discoveryResults = shuffled(discoveryResults); renderDiscoveryResults(); });
  $("buildDecksButton").addEventListener("click", buildDecksFromResults);

  $("urlDeckTarget").addEventListener("click", event => {
    const button = event.target.closest("[data-value]");
    if (!button) return;
    urlTarget = button.dataset.value;
    $("urlDeckTarget").querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
  });
  $("addUrlButton").addEventListener("click", addMediaUrl);
  $("mediaUrl").addEventListener("keydown", event => { if (event.key === "Enter") addMediaUrl(); });
  $("localFiles").addEventListener("change", event => addLocalFiles(event.target.files));
  $("clearQueuesButton").addEventListener("click", () => {
    if (!confirm("Clear both iVJ deck queues?")) return;
    mixer.setQueue("A", []);
    mixer.setQueue("B", []);
  });
  document.querySelectorAll("[data-next-deck]").forEach(button => button.addEventListener("click", () => mixer.next(button.dataset.nextDeck)));
  document.querySelectorAll("[data-shuffle-deck]").forEach(button => button.addEventListener("click", () => mixer.shuffle(button.dataset.shuffleDeck)));

  for (const id of ["crossfader", "mixCrossfader"]) $(id).addEventListener("input", event => mixer.setCrossfade(event.target.value));
  $("cutAButton").addEventListener("click", () => mixer.transitionTo("A", { style: "cut", seconds: 0 }));
  $("cutBButton").addEventListener("click", () => mixer.transitionTo("B", { style: "cut", seconds: 0 }));
  $("nextAButton").addEventListener("click", () => mixer.next("A"));
  $("nextBButton").addEventListener("click", () => mixer.next("B"));
  $("blendMode").addEventListener("change", event => { mixer.setBlendMode(event.target.value); store.update(state => { state.mixer.blendMode = event.target.value; }); });
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
  const toggleAuto = enabled => { mixer.setAuto(enabled); };
  $("autoVjToggle").addEventListener("change", event => toggleAuto(event.target.checked));
  $("autoVjButton").addEventListener("click", () => toggleAuto(!mixer.autoEnabled));
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
  for (const id of ["fxIntensity", "fxHue", "fxSaturation", "fxContrast", "fxZoom"]) $(id).addEventListener("input", updateFxFromControls);
  for (const id of ["scanlinesToggle", "vignetteToggle"]) $(id).addEventListener("change", updateFxFromControls);
  $("autoFxToggle").addEventListener("change", event => store.update(state => { state.fx.autoRoll = event.target.checked; }));

  $("audioSensitivity").addEventListener("input", event => {
    const sensitivity = Number(event.target.value);
    audio.setSensitivity(sensitivity);
    effects.configureAudio({ sensitivity });
    $("audioSensitivityValue").textContent = `${sensitivity.toFixed(1)}×`;
    store.update(state => { state.audio.sensitivity = sensitivity; });
  });
  const updateAudioOptions = () => {
    const next = { pulse: $("audioPulseToggle").checked, color: $("audioColorToggle").checked, beatCuts: $("beatCutsToggle").checked };
    effects.configureAudio({ ...next, sensitivity: store.get().audio.sensitivity });
    store.update(state => { state.audio = { ...state.audio, ...next }; });
  };
  for (const id of ["audioPulseToggle", "audioColorToggle", "beatCutsToggle"]) $(id).addEventListener("change", updateAudioOptions);
  $("micButton").addEventListener("click", async () => {
    try { await audio.startMicrophone(); } catch (error) { showToast(`Microphone unavailable: ${error.message}`, 3600); }
  });
  $("audioFile").addEventListener("change", async event => {
    try { await audio.loadFile(event.target.files[0]); } catch (error) { showToast(`Could not play audio: ${error.message}`, 3600); }
  });
  $("stopAudioButton").addEventListener("click", () => audio.stop());

  $("invidiousBase").addEventListener("change", event => {
    source.setPreferredBase(event.target.value);
    store.update(state => { state.settings.invidiousBase = event.target.value.trim(); });
  });
  $("aiProxyUrl").addEventListener("change", event => store.update(state => { state.settings.aiProxyUrl = event.target.value.trim(); }));
  $("qualityMode").addEventListener("change", event => { applyQuality(event.target.value); store.update(state => { state.settings.quality = event.target.value; }); });
  $("testSourceButton").addEventListener("click", async () => {
    updateSourceStatus("Testing search", "working");
    try {
      const base = await source.test();
      updateSourceStatus(`Connected to ${new URL(base).hostname}`);
      showToast("Video search is working.");
    } catch {
      updateSourceStatus("No provider responded", "error");
      showToast("No Invidious provider responded. Try another instance URL.", 3600);
    }
  });

  $("exportSessionButton").addEventListener("click", () => downloadText(`ivj-set-${new Date().toISOString().slice(0,10)}.json`, store.exportJson()));
  $("importSessionFile").addEventListener("change", async event => {
    try { store.importJson(await event.target.files[0].text()); location.reload(); } catch (error) { showToast(`Import failed: ${error.message}`); }
  });
  $("resetSessionButton").addEventListener("click", () => {
    if (!confirm("Reset iVJ settings, decks, and saved session?")) return;
    store.reset();
    location.reload();
  });

  $("fullscreenButton").addEventListener("click", toggleFullscreen);
  $("performanceButton").addEventListener("click", () => togglePerformance());
  $("exitPerformanceButton").addEventListener("click", () => togglePerformance(false));
  $("wakeButton").addEventListener("click", toggleWakeLock);
  document.addEventListener("fullscreenchange", () => { $("fullscreenButton").textContent = document.fullscreenElement ? "Exit" : "Fullscreen"; });
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && $("wakeButton").classList.contains("active") && !wakeLock) {
      try { wakeLock = await navigator.wakeLock.request("screen"); } catch {}
    }
  });

  document.addEventListener("keydown", event => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    if (event.key === "1") mixer.next("A");
    if (event.key === "2") mixer.next("B");
    if (event.key === "ArrowLeft") mixer.setCrossfade(mixer.crossfade - .04);
    if (event.key === "ArrowRight") mixer.setCrossfade(mixer.crossfade + .04);
    if (event.key.toLowerCase() === "r") effects.randomScene();
    if (event.key.toLowerCase() === "b") $("blackoutButton").click();
    if (event.key.toLowerCase() === "f") toggleFullscreen();
    if (event.code === "Space") { event.preventDefault(); mixer.setAuto(!mixer.autoEnabled); }
  });
}

function boot() {
  const state = store.get();
  bindUi();
  mixer.configure(state.mixer);
  effects.setState({ ...state.fx });
  effects.configureAudio({ ...state.audio });
  audio.setSensitivity(state.audio.sensitivity);
  const queueA = state.decks.A.queue.length ? state.decks.A.queue : STARTER_DECKS.A;
  const queueB = state.decks.B.queue.length ? state.decks.B.queue : STARTER_DECKS.B;
  mixer.setQueue("A", queueA, { index: Math.max(0, state.decks.A.index) });
  mixer.setQueue("B", queueB, { index: Math.max(0, state.decks.B.index) });
  renderScenePicker();
  syncStateToUi();
  if (currentPlan) {
    renderPlan(currentPlan, { queryContainer: $("queryChips"), summaryContainer: $("planSummary") });
    $("searchPlan").classList.remove("hidden");
  }
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(error => console.warn("Service worker registration failed", error));
  updateSourceStatus("Sources ready");
  setStageStatus(state.mixer.autoEnabled ? "AUTO" : "READY");
}

boot();
window.addEventListener("beforeunload", () => { mixer.destroy(); audio.destroy(); });
