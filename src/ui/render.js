export function setActiveTab(name) {
  document.querySelectorAll("[data-tab]").forEach(button => button.classList.toggle("active", button.dataset.tab === name));
  document.querySelectorAll("[data-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === name));
  if (matchMedia("(max-width: 820px)").matches) document.querySelector(".control-workspace")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

export function renderScenes(container, scenes, activeName, onSelect) {
  container.replaceChildren();
  for (const [name, scene] of Object.entries(scenes)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `scene-button${name === activeName ? " active" : ""}`;
    button.style.setProperty("--scene-bg", scene.swatch);
    button.title = `${name} · ${scene.filterMode === "none" ? "color treatment" : scene.filterMode}`;
    const label = document.createElement("span");
    label.textContent = name;
    const effect = document.createElement("small");
    effect.textContent = scene.filterMode === "none" ? "COLOR" : scene.filterMode.toUpperCase();
    button.append(label, effect);
    button.addEventListener("click", () => onSelect(name));
    container.append(button);
  }
}

function addImageFallback(image) {
  image.addEventListener("error", () => {
    image.referrerPolicy = "";
    image.src = "./assets/icon.svg";
  }, { once: true });
}

export function renderPlaylistCards(container, playlists, onAction) {
  container.replaceChildren();
  for (const playlist of playlists) {
    const card = document.createElement("article");
    card.className = "playlist-card";
    card.style.setProperty("--playlist-accent", playlist.accent || "#72a7ff");

    const image = document.createElement("img");
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.alt = "";
    image.src = playlist.thumbnail || playlist.items?.[0]?.thumbnail || "./assets/icon.svg";
    addImageFallback(image);

    const body = document.createElement("div");
    body.className = "playlist-card-body";
    const heading = document.createElement("div");
    heading.className = "playlist-card-heading";
    const title = document.createElement("strong");
    title.textContent = playlist.title;
    const count = document.createElement("span");
    count.textContent = playlist.items ? `${playlist.items.length} READY` : "ONLINE";
    heading.append(title, count);
    const description = document.createElement("p");
    description.textContent = playlist.description;
    const actions = document.createElement("div");
    actions.className = "playlist-actions";
    for (const [target, label] of [["A", "Load A"], ["both", "Split A+B"], ["B", "Load B"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = target === "both" ? "playlist-action primary" : "playlist-action";
      button.textContent = label;
      button.addEventListener("click", () => onAction(playlist, target, button));
      actions.append(button);
    }
    body.append(heading, description, actions);
    card.append(image, body);
    container.append(card);
  }
}

export function renderDeck({ deck, snapshot, queueContainer, nowContainer, countContainer, onLoad, onRemove }) {
  const count = snapshot.queue.length;
  countContainer.textContent = `${count} clip${count === 1 ? "" : "s"}`;
  nowContainer.replaceChildren();
  if (snapshot.current) {
    const image = document.createElement("img");
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.src = snapshot.current.thumbnail || "./assets/icon.svg";
    addImageFallback(image);
    const text = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.textContent = `DECK ${deck} · ${String(snapshot.status || "ready").toUpperCase()}`;
    const title = document.createElement("strong");
    title.textContent = snapshot.current.title || "Untitled clip";
    text.append(eyebrow, title);
    nowContainer.append(image, text);
  } else {
    nowContainer.textContent = `Deck ${deck} is empty`;
  }

  queueContainer.replaceChildren();
  snapshot.queue.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = `queue-item${index === snapshot.index ? " current" : ""}`;
    card.title = item.title || `Deck ${deck} clip`;
    card.tabIndex = 0;
    const image = document.createElement("img");
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.alt = "";
    image.src = item.thumbnail || "./assets/icon.svg";
    addImageFallback(image);
    const position = document.createElement("b");
    position.textContent = String(index + 1).padStart(2, "0");
    const title = document.createElement("span");
    title.textContent = item.title || "Local video";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "queue-remove";
    remove.textContent = "×";
    remove.title = "Remove clip";
    remove.addEventListener("click", event => {
      event.stopPropagation();
      onRemove(index);
    });
    const load = () => onLoad(index);
    card.append(image, position, title, remove);
    card.addEventListener("click", load);
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        load();
      }
    });
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
