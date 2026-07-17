export function setActiveTab(name) {
  document.querySelectorAll("[data-tab]").forEach(button => button.classList.toggle("active", button.dataset.tab === name));
  document.querySelectorAll("[data-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === name));
  if (matchMedia("(max-width: 820px)").matches) document.querySelector(".control-workspace")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

export function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return "";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function renderScenes(container, scenes, activeName, onSelect) {
  container.replaceChildren();
  for (const [name, scene] of Object.entries(scenes)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `scene-button${name === activeName ? " active" : ""}`;
    button.style.setProperty("--scene-bg", scene.swatch);
    const label = document.createElement("span");
    label.textContent = name;
    button.append(label);
    button.addEventListener("click", () => onSelect(name));
    container.append(button);
  }
}

export function renderPlan(plan, { queryContainer, summaryContainer }) {
  queryContainer.replaceChildren();
  for (const query of plan.queries || []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "query-chip";
    chip.textContent = query;
    chip.title = "Tap to copy";
    chip.addEventListener("click", () => navigator.clipboard?.writeText(query).catch(() => {}));
    queryContainer.append(chip);
  }
  for (const exclusion of plan.exclusions || []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "negative-chip";
    chip.textContent = `− ${exclusion}`;
    queryContainer.append(chip);
  }
  summaryContainer.textContent = plan.summary || "Search plan ready.";
}

export function renderResults(container, items, selected, onToggle) {
  container.replaceChildren();
  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = `result-card${selected.has(item.id) ? " selected" : ""}`;
    card.tabIndex = 0;
    const image = document.createElement("img");
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.alt = "";
    image.src = item.thumbnail || "./assets/icon.svg";
    const check = document.createElement("span");
    check.className = "result-check";
    check.textContent = selected.has(item.id) ? "✓" : "";
    const meta = document.createElement("div");
    meta.className = "result-meta";
    const title = document.createElement("strong");
    title.textContent = item.title || "Untitled";
    const detail = document.createElement("small");
    detail.textContent = [item.author, formatDuration(item.durationSeconds)].filter(Boolean).join(" · ");
    meta.append(title, detail);
    card.append(image, check, meta);
    const toggle = () => onToggle(item, index);
    card.addEventListener("click", toggle);
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
    container.append(card);
  });
}

export function renderDeck({ deck, snapshot, queueContainer, nowContainer, countContainer, onLoad, onRemove }) {
  const count = snapshot.queue.length;
  countContainer.textContent = `${count} clip${count === 1 ? "" : "s"}`;
  nowContainer.textContent = snapshot.current ? `NOW · ${snapshot.current.title}` : "No clip loaded";
  queueContainer.replaceChildren();
  snapshot.queue.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = `queue-item${index === snapshot.index ? " current" : ""}`;
    card.title = item.title || `Deck ${deck} clip`;
    const image = document.createElement("img");
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.alt = "";
    image.src = item.thumbnail || "./assets/icon.svg";
    const title = document.createElement("span");
    title.textContent = item.title || "Local video";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "queue-remove";
    remove.textContent = "×";
    remove.title = "Remove";
    remove.addEventListener("click", event => {
      event.stopPropagation();
      onRemove(index);
    });
    card.append(image, title, remove);
    card.addEventListener("click", () => onLoad(index));
    queueContainer.append(card);
  });
}

let toastTimer = 0;
export function showToast(message, duration = 2400) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

export function downloadText(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function shuffled(values) {
  const output = values.slice();
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}
