"use strict";

const MAX_DOTS = 5;
const DOT_PAD = MAX_DOTS - 1;
const DOT_STEP = 16;

const app = document.querySelector("#app");
let albumData = null;
let openedIndex = null;
let dotsSettled = null;
let dotsToken = 0;
let dotsTimer = 0;
let dotsFallback = 0;

init();

async function init() {
  try {
    const response = await fetch("data/album.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Не удалось загрузить data/album.json");
    }
    albumData = normalize(await response.json());
    app.addEventListener("click", onAppClick);
    document.addEventListener("keydown", onKeyDown);
    render();
  } catch (error) {
    app.innerHTML = errorView(error);
  }
}

function render() {
  if (openedIndex == null && albumData.events.length) openedIndex = 0;
  const opened = openedIndex == null ? null : albumData.events[openedIndex];
  dotsToken += 1;
  window.clearTimeout(dotsTimer);
  window.clearTimeout(dotsFallback);
  app.innerHTML = homeView(albumData, opened);
  dotsSettled = opened && opened.photos.length > MAX_DOTS ? initialActive(opened.photos.length) : null;
  document.title = opened ? `${opened.title} — ${albumData.title}` : albumData.title;
  const rail = app.querySelector(".event-rail");
  const selected = rail?.querySelector(".is-selected");
  if (rail && selected) {
    rail.scrollTop = Math.max(0, selected.offsetTop - (rail.clientHeight - selected.offsetHeight) / 2);
  }
  bindBrokenImages();
}

function onAppClick(event) {
  const open = event.target.closest("[data-open]");
  if (open && app.contains(open)) {
    const next = Number(open.dataset.open);
    if (next === openedIndex) return;
    openedIndex = next;
    render();
    return;
  }

  const dot = event.target.closest("[data-dot]");
  if (dot && app.contains(dot)) {
    setActive(dot.closest(".event").querySelector(".carousel"), Number(dot.dataset.dot));
    return;
  }

  const about = event.target.closest("[data-about]");
  if (about && app.contains(about)) {
    const overlay = about.closest(".event").querySelector(".event-overlay");
    if (about.getAttribute("aria-expanded") === "true") closeOverlay(overlay);
    else openOverlay(about, overlay);
    return;
  }

  if (event.target.classList.contains("event-overlay")) {
    closeOverlay(event.target);
    return;
  }

  const photo = event.target.closest("[data-flip]");
  if (!photo || !app.contains(photo)) return;
  const slot = photo.closest(".slot");
  const offset = Number(slot?.dataset.offset);
  if (offset !== 0) {
    moveCarousel(slot, offset);
    return;
  }
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && photo.contains(selection.anchorNode)) return;
  const flipped = photo.classList.toggle("is-flipped");
  photo.setAttribute("aria-pressed", flipped ? "true" : "false");
}

function onKeyDown(event) {
  if (event.key !== "Escape") return;
  app.querySelectorAll(".event-overlay.is-open").forEach(closeOverlay);
}

function openOverlay(about, overlay) {
  overlay.classList.add("is-open");
  about.setAttribute("aria-expanded", "true");
}

function closeOverlay(overlay) {
  if (!overlay) return;
  overlay.classList.remove("is-open");
  overlay.closest(".event")?.querySelector("[data-about]")?.setAttribute("aria-expanded", "false");
}

function homeView(album, opened) {
  const stage = album.events.length
    ? `<div class="stage">
        <div class="event-rail" aria-label="Мероприятия">${album.events.map((item, index) => eventPick(item, index)).join("")}</div>
        ${opened ? eventSection(opened) : ""}
      </div>`
    : `<section class="empty">
        <h2>Пока пусто</h2>
        <p class="lead">Добавьте мероприятие в data/album.json и положите снимки в папку photos.</p>
      </section>`;

  return `<main>
    ${stage}
  </main>`;
}

function eventPick(item, index) {
  const selected = index === openedIndex;
  const preview = item.preview
    ? `<img src="${esc(srcAttr(item.preview))}" alt="">`
    : "";
  return `<button class="event-pick${selected ? " is-selected" : ""}" type="button" data-open="${index}" aria-label="${esc(item.title)}"${selected ? " aria-current=\"true\"" : ""}>
    <span class="event-preview${item.preview ? "" : " is-empty"}">${preview}</span>
  </button>`;
}

function eventSection(item) {
  const active = initialActive(item.photos.length);
  const dots = item.photos.length
    ? `<div class="event-progress">${progressMarkup(item.photos, active)}</div>`
    : "";
  const photos = item.photos.length
    ? `<div class="carousel" data-active="${active}">${item.photos.map((photo, index) => photoCard(photo, index, active, item.photos.length)).join("")}</div>`
    : `<p class="lead">В этом разделе пока нет снимков.</p>`;
  const about = item.description
    ? `<button class="event-about" type="button" data-about aria-expanded="false" aria-label="Описание мероприятия">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 10.6V17"></path>
          <circle cx="12" cy="7.2" r="1.15"></circle>
        </svg>
      </button>
      <div class="event-overlay">
        <p>${esc(item.description)}</p>
      </div>`
    : "";

  return `<section class="event">
    ${dots}
    ${photos}
    <h2 class="event-title">${esc(item.title)}</h2>
    ${about}
  </section>`;
}

function progressMarkup(photos, active) {
  if (photos.length > MAX_DOTS) return slidingDots(photos, active, DOT_PAD);
  return progressDots(photos, active);
}

function progressDots(photos, active) {
  return photos.map((photo, index) => dotButton(photo, index, index === active)).join("");
}

function slidingDots(photos, active, pad) {
  const count = photos.length;
  let html = "";
  for (let offset = -pad; offset <= pad; offset += 1) {
    const index = wrapIndex(active + offset, count);
    html += dotButton(photos[index], index, offset === 0, offset);
  }
  const rest = restTranslate(pad);
  return `<div class="dot-viewport"><div class="dot-track" data-center="${active}" data-pad="${pad}" style="transform: translateX(${rest}px)">${html}</div></div>`;
}

function restTranslate(pad) {
  const hiddenLeft = pad - Math.floor(MAX_DOTS / 2);
  return -hiddenLeft * DOT_STEP;
}

function wrapIndex(index, count) {
  return (index % count + count) % count;
}

function dotButton(photo, index, on, offset) {
  const label = photo.caption || `Фото ${index + 1}`;
  const pos = offset == null ? "" : ` data-pos="${offset}"`;
  const shown = offset == null || Math.abs(offset) <= Math.floor(MAX_DOTS / 2);
  const hidden = shown ? "" : ` tabindex="-1" aria-hidden="true"`;
  return `<button class="dot${on ? " is-active" : ""}" type="button" data-dot="${index}"${pos} aria-label="${esc(label)}"${on ? " aria-current=\"true\"" : ""}${hidden}></button>`;
}

function photoCard(photo, index, active, count) {
  const offset = photoOffset(index, active, count);
  const visible = Math.abs(offset) <= 2;
  const caption = photo.caption
    ? `<span class="caption">${esc(photo.caption)}</span>`
    : "";
  const title = photo.caption
    ? `<span class="back-title">${esc(photo.caption)}</span>`
    : "";
  const label = slotLabel(offset, photo.caption, visible);

  return `<div class="slot${visible ? "" : " is-offstage"}" data-index="${index}" data-offset="${visible ? offset : "off"}" data-side="${offset < 0 ? "-1" : "1"}">
    <button class="photo" type="button" data-flip data-caption="${esc(photo.caption)}" aria-pressed="false" aria-label="${esc(label)}"${visible ? "" : " tabindex=\"-1\" aria-hidden=\"true\""}>
      <span class="photo-scene">
        <span class="photo-card">
          <span class="photo-face photo-front">
            <img src="${esc(srcAttr(photo.file))}" alt="${esc(photo.caption || "Фотография")}"${visible ? "" : " loading=\"lazy\""}>
            ${caption}
            <span class="flip-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
                <path d="M21 3v5h-5"></path>
              </svg>
            </span>
          </span>
          <span class="photo-face photo-back">
            ${title}
            <span class="back-text">${esc(photo.description || "Описания пока нет.")}</span>
            <span class="back-hint">Нажмите, чтобы перевернуть</span>
          </span>
        </span>
      </span>
    </button>
  </div>`;
}

function moveCarousel(slot, delta) {
  const carousel = slot.closest(".carousel");
  const count = carousel.querySelectorAll(".slot").length;
  const active = (Number(carousel.dataset.active) + delta + count) % count;
  setActive(carousel, active);
}

function setActive(carousel, active) {
  const slots = [...carousel.querySelectorAll(".slot")];
  const count = slots.length;
  carousel.dataset.active = String(active);
  slots.forEach((item) => {
    const photo = item.querySelector("[data-flip]");
    photo.classList.remove("is-flipped");
    photo.setAttribute("aria-pressed", "false");
    applySlot(item, Number(item.dataset.index), active, count);
  });
  const progress = carousel.closest(".event")?.querySelector(".event-progress");
  const photos = albumData.events[openedIndex]?.photos;
  if (progress && photos) shiftDots(progress, photos, active);
}

function shiftDots(progress, photos, active) {
  const count = photos.length;
  if (count <= MAX_DOTS) {
    progress.innerHTML = progressDots(photos, active);
    dotsSettled = null;
    return;
  }

  const from = dotsSettled ?? active;
  const delta = photoOffset(active, from, count);
  if (delta === 0) {
    window.clearTimeout(dotsTimer);
    window.clearTimeout(dotsFallback);
    dotsToken += 1;
    progress.innerHTML = slidingDots(photos, active, DOT_PAD);
    dotsSettled = active;
    return;
  }

  window.clearTimeout(dotsTimer);
  window.clearTimeout(dotsFallback);
  const token = ++dotsToken;

  const pad = Math.max(DOT_PAD, Math.abs(delta));
  let track = progress.querySelector(".dot-track");
  if (!track || Number(track.dataset.center) !== from || Number(track.dataset.pad) < pad) {
    progress.innerHTML = slidingDots(photos, from, pad);
    track = progress.querySelector(".dot-track");
  }
  const { step, rest } = measureTrack(track);
  track.style.transition = "none";
  track.style.transform = `translateX(${rest}px)`;
  focusDot(track, delta);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    progress.innerHTML = slidingDots(photos, active, DOT_PAD);
    dotsSettled = active;
    return;
  }

  const settle = () => {
    if (token !== dotsToken) return;
    dotsToken += 1;
    progress.innerHTML = slidingDots(photos, active, DOT_PAD);
    dotsSettled = active;
  };

  dotsTimer = window.setTimeout(() => {
    if (token !== dotsToken) return;
    track.style.transition = "none";
    track.style.transform = `translateX(${rest}px)`;
    void track.offsetWidth;
    track.style.transition = "transform 320ms ease-out";
    track.style.transform = `translateX(${rest - delta * step}px)`;
    track.addEventListener("transitionend", (event) => {
      if (event.propertyName !== "transform") return;
      settle();
    });
    dotsFallback = window.setTimeout(settle, 420);
  }, 160);
}

function measureTrack(track) {
  const dot = track.querySelector(".dot");
  const gap = Number.parseFloat(getComputedStyle(track).gap) || 0;
  const width = dot?.getBoundingClientRect().width || DOT_STEP - gap;
  const step = width + gap || DOT_STEP;
  const pad = Number(track.dataset.pad);
  const hiddenLeft = pad - Math.floor(MAX_DOTS / 2);
  return { step, rest: -hiddenLeft * step };
}

function focusDot(track, delta) {
  track.querySelectorAll(".dot").forEach((dot) => {
    const on = Number(dot.dataset.pos) === delta;
    dot.classList.toggle("is-active", on);
    if (on) dot.setAttribute("aria-current", "true");
    else dot.removeAttribute("aria-current");
  });
}

function applySlot(slot, index, active, count) {
  const offset = photoOffset(index, active, count);
  const visible = Math.abs(offset) <= 2;
  const photo = slot.querySelector("[data-flip]");
  slot.classList.toggle("is-offstage", !visible);
  slot.dataset.offset = visible ? String(offset) : "off";
  slot.dataset.side = offset < 0 ? "-1" : "1";
  photo.tabIndex = visible ? 0 : -1;
  if (visible) photo.removeAttribute("aria-hidden");
  else photo.setAttribute("aria-hidden", "true");
  photo.setAttribute("aria-label", slotLabel(offset, photo.dataset.caption, visible));
}

function slotLabel(offset, caption, visible) {
  if (!visible) return caption || "Фотография";
  if (offset === 0) {
    return caption ? `Открыть описание: ${caption}` : "Открыть описание фотографии";
  }
  return caption ? `Показать в центре: ${caption}` : "Показать фотографию в центре";
}

function initialActive(count) {
  return count > 0 ? Math.floor((count - 1) / 2) : 0;
}

function photoOffset(index, active, count) {
  if (count <= 1) return 0;
  let offset = index - active;
  const half = count / 2;
  if (offset > half) offset -= count;
  if (offset < -half) offset += count;
  return offset;
}

function errorView(error) {
  let message;
  if (location.protocol === "file:") {
    message = "Страница открыта как файл с диска, поэтому браузер не отдаёт album.json. В папке проекта выполните python3 -m http.server и откройте http://localhost:8000 — либо выложите папку на GitHub Pages.";
  } else if (error instanceof SyntaxError) {
    message = "Файл data/album.json не разобрался. Проверьте кавычки и запятые: после последнего элемента запятая не нужна.";
  } else {
    message = error.message || "Не удалось открыть альбом.";
  }

  return `<main>
    <h1>Альбом не открылся</h1>
    <p class="lead">${esc(message)}</p>
  </main>`;
}

function bindBrokenImages() {
  app.querySelectorAll("img").forEach((img) => {
    const markBroken = () => {
      const front = img.closest(".photo-front");
      if (front) {
        front.classList.add("is-broken");
        return;
      }
      const preview = img.closest(".event-preview");
      if (preview) {
        preview.classList.add("is-empty");
        img.remove();
        return;
      }
      img.alt = "Файл не найден";
    };
    img.addEventListener("error", markBroken);
    if (img.complete && img.naturalWidth === 0) markBroken();
  });
}

function normalize(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("В data/album.json должен быть объект с массивом «мероприятия».");
  }
  if (!Array.isArray(data["мероприятия"])) {
    throw new Error("В data/album.json нужен массив «мероприятия».");
  }

  const events = data["мероприятия"].map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Мероприятие №${index + 1} должно быть объектом.`);
    }
    const title = text(item["название"]) || "Без названия";
    const photosRaw = item["фото"] ?? [];
    if (!Array.isArray(photosRaw)) {
      throw new Error(`У мероприятия «${title}» поле «фото» должно быть массивом.`);
    }
    const photos = photosRaw.map((photo, photoIndex) => {
      if (!photo || typeof photo !== "object" || Array.isArray(photo)) {
        throw new Error(`Снимок №${photoIndex + 1} в «${title}» должен быть объектом.`);
      }
      const file = text(photo["файл"]);
      if (!file) {
        throw new Error(`У снимка №${photoIndex + 1} в «${title}» нет поля «файл».`);
      }
      return {
        file,
        caption: text(photo["подпись"]),
        description: text(photo["описание"]),
      };
    });
    return {
      title,
      description: text(item["описание"]),
      preview: text(item["превью"]),
      photos,
    };
  });

  return {
    title: text(data["название"]) || "Фотоальбом",
    events,
  };
}

function srcAttr(file) {
  if (/^https?:\/\//i.test(file)) return file;
  if (/^[a-z][a-z0-9+.-]*:/i.test(file)) return "";
  return file.split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/");
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
