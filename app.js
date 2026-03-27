/* Pure HTML/CSS/JS album.
   - Import text copied from Mudae
   - Parse "Name - URL"
   - Export a shareable zip (index.html + images/)
   - Keep architecture open for future sources/resolvers
*/

const $ = (id) => document.getElementById(id);

const els = {
  pasteBtn: $("pasteBtn"),
  q: $("q"),
  count: $("count"),
  countLabel: $("countLabel"),
  exportAlbum: $("exportAlbum"),
  status: $("status"),
  grid: $("grid"),
  cardView: $("cardView"),
  cardStage: $("cardStage"),
  cardSurface: $("cardSurface"),
  cardClose: $("cardClose"),
  cardPrev: $("cardPrev"),
  cardNext: $("cardNext"),
  emptyState: $("emptyState"),
  emptyTitle: $("emptyTitle"),
  emptyText: $("emptyText"),

  pasteModal: $("pasteModal"),
  pasteClose: $("pasteClose"),
  pasteCancel: $("pasteCancel"),
  pasteLoad: $("pasteLoad"),
  pasteText: $("pasteText"),
  pasteTitle: $("pasteTitle"),
  pasteHelp: $("pasteHelp"),
};

const TEXT = {
  countLabel: "stickers",
  searchPlaceholder: "Search...",
  exportAlbum: "Export album (ZIP)",
  exportAlbumTitle: "Creates a zip with index.html + images/ (shareable)",
  pasteText: "Import",
  pasteTextTitle: "Paste your mudae.txt content instead of selecting a file",
  emptyTitle: "Load your list",
  emptyText:
    'Paste your <code>mudae.txt</code> (format: <code>Name - URL</code>), then export a shareable ZIP with <code>index.html</code> + <code>images/</code>.',
  pasteTitle: "Paste your list",
  pasteHelp:
    'Paste the contents of <code>mudae.txt</code> here (format: <code>Name - URL</code>). Example:<br/><code>Diane - https://mudae.net/uploads/3900740/iy1DIZM~QFuV9Ta.png</code>',
  pasteCancel: "Cancel",
  pasteLoad: "Load list",
  googleSearchTitle: "Search on Google (text + image)",
  downloadTitle: "Download image",
  statusLoaded: (n) => `Loaded ${n} stickers`,
  statusResolving: (i, n) => `Resolving ${i}/${n}...`,
  statusFetching: (i, n) => `Fetching ${i}/${n}...`,
  statusZipping: "Building ZIP...",
  statusExporting: "Exporting album...",
  statusDoneWith: (ok, fail) => `Done (${ok} ok, ${fail} failed)`,
  errorExportFailed: "Could not export the album ZIP (likely CORS).",
  errorReadFile: "Could not read file.",
  errorResolve: "Could not resolve some image URLs (see console).",
  errorDownload: "Some downloads failed (see console).",
};

function t() {
  return TEXT;
}

const LAST_PASTE_KEY = "mudae_album_last_paste_text";

function applyEnglishText() {
  document.documentElement.lang = "en";
  els.pasteBtn.textContent = t().pasteText;
  els.pasteBtn.title = t().pasteTextTitle;
  els.q.placeholder = t().searchPlaceholder;
  els.exportAlbum.textContent = t().exportAlbum;
  els.exportAlbum.title = t().exportAlbumTitle;
  els.countLabel.textContent = t().countLabel;
  els.emptyTitle.textContent = t().emptyTitle;
  els.emptyText.innerHTML = t().emptyText;
  els.pasteTitle.textContent = t().pasteTitle;
  els.pasteHelp.innerHTML = t().pasteHelp;
  els.pasteCancel.textContent = t().pasteCancel;
  els.pasteLoad.textContent = t().pasteLoad;
}

let viewMode = "grid"; // "grid" | "card"
let cardIndex = 0;
let isCardAnimating = false;
const CARD_ANIM_MS = 160;

function getFilteredItems() {
  const term = normalizeQuery(els.q.value);
  const parts = term ? term.split(/\s+/g).filter(Boolean) : [];
  return !parts.length ? stickers : stickers.filter((s) => parts.every((p) => (s.nameLc || "").includes(p)));
}

function setViewMode(next, opts) {
  const o = opts || {};
  viewMode = next === "card" ? "card" : "grid";
  if (viewMode === "card") {
    els.grid.style.display = "none";
    els.cardView.hidden = false;
    if (typeof o.cardIndex === "number" && Number.isFinite(o.cardIndex)) {
      cardIndex = o.cardIndex;
    } else if (o.reset !== false) {
      cardIndex = 0;
    }
    renderCard();
  } else {
    els.grid.style.display = "";
    els.cardView.hidden = true;
    renderFiltered().catch(() => {});
  }
}

function clampCardIndex(items) {
  if (!items.length) return 0;
  if (cardIndex < 0) cardIndex = 0;
  if (cardIndex >= items.length) cardIndex = items.length - 1;
  return cardIndex;
}

async function renderCard() {
  const items = getFilteredItems();
  // Show progress in card view: "# / total"
  if (items.length) {
    els.count.textContent = `${cardIndex + 1}/${items.length}`;
    els.countLabel.textContent = "";
  } else {
    els.count.textContent = "0/0";
    els.countLabel.textContent = "";
  }
  els.emptyState.style.display = stickers.length ? "none" : "block";

  if (!items.length) {
    els.cardSurface.innerHTML = `<div class="cardFooter"><div class="cardTitle">0</div><div class="iconBar"></div></div>`;
    return;
  }
  clampCardIndex(items);

  const center = items[cardIndex];
  const left = cardIndex > 0 ? items[cardIndex - 1] : null;
  const right = cardIndex < items.length - 1 ? items[cardIndex + 1] : null;
  const offLeft = cardIndex > 1 ? items[cardIndex - 2] : null;
  const offRight = cardIndex < items.length - 2 ? items[cardIndex + 2] : null;

  const [centerUrl, leftUrl, rightUrl, offLeftUrl, offRightUrl] = await Promise.all([
    resolveForDisplay(center.resolvedUrl || center.sourceUrl),
    left ? resolveForDisplay(left.resolvedUrl || left.sourceUrl) : Promise.resolve(""),
    right ? resolveForDisplay(right.resolvedUrl || right.sourceUrl) : Promise.resolve(""),
    offLeft ? resolveForDisplay(offLeft.resolvedUrl || offLeft.sourceUrl) : Promise.resolve(""),
    offRight ? resolveForDisplay(offRight.resolvedUrl || offRight.sourceUrl) : Promise.resolve(""),
  ]);
  center.resolvedUrl = centerUrl;
  if (left) left.resolvedUrl = leftUrl;
  if (right) right.resolvedUrl = rightUrl;
  if (offLeft) offLeft.resolvedUrl = offLeftUrl;
  if (offRight) offRight.resolvedUrl = offRightUrl;

  const paneHtml = (pos, s, url, isCenter) => {
    if (!s || !url) return `<div class="cardPane ${pos}"></div>`;
    const prog = isCenter ? `<span class="cardProgress">${cardIndex + 1} / ${items.length}</span>` : "";
    return `
      <div class="cardPane ${pos}">
        <div class="cardHero">
          <img loading="eager" referrerpolicy="no-referrer" alt="${escHtml(s.name)}" src="${escHtml(url)}" />
        </div>
        <div class="cardFooter">
          <a class="cardTitle nameLink" data-role="open" href="${escHtml(url)}" target="_blank" rel="noreferrer" title="${escHtml(s.name)}">${escHtml(s.name)}</a>
          <div class="iconBar">
            ${prog}
            <a class="iconLink" data-role="download" href="${escHtml(url)}" download="${escHtml(s.name)}" title="${escHtml(t().downloadTitle)}">💾</a>
            <a class="iconLink" href="${googleTextAndImageUrl(s.name, s.resolvedUrl || s.sourceUrl)}" target="_blank" rel="noreferrer" title="${escHtml(t().googleSearchTitle)}">🔎</a>
          </div>
        </div>
      </div>
    `;
  };

  els.cardSurface.innerHTML = `
    <div class="cardDeck">
      ${paneHtml("is-off-left", offLeft, offLeftUrl, false)}
      ${paneHtml("is-left", left, leftUrl, false)}
      ${paneHtml("is-center", center, centerUrl, true)}
      ${paneHtml("is-right", right, rightUrl, false)}
      ${paneHtml("is-off-right", offRight, offRightUrl, false)}
      <div class="cardTapZone" id="cardTapZone">
        <div data-dir="-1"></div>
        <div data-dir="1"></div>
      </div>
    </div>
  `;

  const tap = $("cardTapZone");
  if (tap) {
    tap.addEventListener("click", (e) => {
      const dir = e.target && e.target.dataset ? Number(e.target.dataset.dir) : 0;
      if (dir === 1) nextCard();
      else if (dir === -1) prevCard();
    });
  }
}

function nextCard() {
  const items = getFilteredItems();
  if (!items.length) return;
  if (isCardAnimating) return;
  if (cardIndex >= items.length - 1) return;
  isCardAnimating = true;
  els.cardStage.classList.add("anim-next");
  setTimeout(() => {
    cardIndex = Math.min(cardIndex + 1, items.length - 1);
    renderCard()
      .catch(() => {})
      .finally(() => {
        els.cardStage.classList.remove("anim-next");
        isCardAnimating = false;
      });
  }, CARD_ANIM_MS);
}

function prevCard() {
  const items = getFilteredItems();
  if (!items.length) return;
  if (isCardAnimating) return;
  if (cardIndex <= 0) return;
  isCardAnimating = true;
  els.cardStage.classList.add("anim-prev");
  setTimeout(() => {
    cardIndex = Math.max(cardIndex - 1, 0);
    renderCard()
      .catch(() => {})
      .finally(() => {
        els.cardStage.classList.remove("anim-prev");
        isCardAnimating = false;
      });
  }, CARD_ANIM_MS);
}

// ---- Source architecture (future-proof) ----

class StickerSource {
  async load() {
    throw new Error("not implemented");
  }
}

class MudaeTxtSource extends StickerSource {
  constructor(text) {
    super();
    this.text = text;
  }
  async load() {
    const out = [];
    for (const raw of this.text.split(/\r?\n/g)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const parsed = parseMudaeLine(line);
      if (!parsed) continue;
      out.push(parsed);
    }
    return out;
  }
}

function parseMudaeLine(line) {
  let s = String(line || "").trim();
  if (!s) return null;

  // Common Discord paste prefixes (numbers, bullets, etc.)
  s = s.replace(/^\s*(?:[-*•]+\s+|\d+\s*[.)]\s+|\[\d+\]\s+|#\d+\s+)+/g, "");

  // Normalize fancy dashes to "-"
  s = s.replace(/[–—]/g, "-");

  // Prefer: "<name> - <url>"
  const m = s.match(/^(.*?)\s+-\s+(https?:\/\/\S+)\s*$/i);
  if (m) {
    const name = (m[1] || "").trim();
    const url = (m[2] || "").trim();
    if (!name || !url) return null;
    return { name, sourceUrl: url };
  }

  // Fallback: split at the first URL
  const m2 = s.match(/^(.*?)\s+(https?:\/\/\S+)\s*$/i);
  if (m2) {
    const left = (m2[1] || "").trim();
    const url = (m2[2] || "").trim();
    const name = left.replace(/\s+-\s*$/g, "").trim();
    if (!name || !url) return null;
    return { name, sourceUrl: url };
  }

  return null;
}

// ---- Resolver architecture (direct images, imgur pages) ----

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
function looksLikeDirectImage(url) {
  try {
    const p = new URL(url);
    const path = p.pathname.toLowerCase();
    return IMAGE_EXTS.some((e) => path.endsWith(e));
  } catch {
    return false;
  }
}

async function resolveImageUrl(url) {
  const u = String(url || "").trim();
  if (!u) return u;

  // Imgur: convert known patterns to direct i.imgur.com URLs.
  // - https://imgur.com/<id>.<ext>   -> https://i.imgur.com/<id>.<ext>
  // - https://imgur.com/<id>         -> https://i.imgur.com/<id>.png (best-effort)
  // - https://i.imgur.com/<id>.<ext> -> (already direct)
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase();
    if (host === "imgur.com" || host === "www.imgur.com" || host === "m.imgur.com") {
      const m2 = parsed.pathname.match(/^\/([A-Za-z0-9]+)(\.(png|jpg|jpeg|gif|webp))?$/i);
      if (m2) {
        const id = m2[1];
        const ext = m2[2] || ".png";
        return `https://i.imgur.com/${id}${ext}`;
      }
    }
    if (host === "i.imgur.com") return u;
  } catch {
    // ignore URL parse errors
  }

  if (looksLikeDirectImage(u)) return u;

  // Imgur page -> og:image
  const m = u.match(/^https?:\/\/(www\.)?imgur\.com\/([A-Za-z0-9]+)([/?#].*)?$/);
  if (m) {
    const html = await fetchText(u);
    const og = extractMetaContent(html, "property", "og:image");
    if (og) return og;
    const tw = extractMetaContent(html, "name", "twitter:image");
    if (tw) return tw;
    return u;
  }

  return u;
}

async function fetchText(url) {
  const resp = await fetch(url, { cache: "force-cache", referrerPolicy: "no-referrer" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  return await resp.text();
}

function extractMetaContent(html, attrName, attrValue) {
  // Simple regex-based extraction (works well for these pages)
  const re = new RegExp(
    `<meta[^>]+${attrName}=["']${escapeRegExp(attrValue)}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- App state ----

let stickers = [];
const RESOLVE_CONCURRENCY = 8;
const EXPORT_FETCH_CONCURRENCY = 6;
const SEARCH_DEBOUNCE_MS = 120;
const GRID_BATCH_SIZE = 500;

let currentRenderLimit = GRID_BATCH_SIZE;
let lastFilterKey = "";
let loadMoreObserver = null;
let loadMoreSentinel = null;
let currentFilteredTotal = 0;
let isLoadingMore = false;

function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let nextIndex = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return out;
}

function setStatus(msg) {
  els.status.textContent = msg || "";
}

function normalizeQuery(q) {
  return (q || "").trim().toLowerCase();
}

function googleTextAndImageUrl(name, imageUrl) {
  const q = encodeURIComponent(String(name || ""));
  const u = String(imageUrl || "");
  if (u.startsWith("http://") || u.startsWith("https://")) {
    const img = encodeURIComponent(u);
    return `https://www.google.com/searchbyimage?image_url=${img}&q=${q}`;
  }
  return `https://www.google.com/search?tbm=isch&q=${q}`;
}

async function resolveForDisplay(url) {
  const u = String(url || "").trim();
  if (!u) return u;
  return await resolveImageUrl(u);
}

// ---- Rendering ----

function escHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function renderFiltered() {
  const term = normalizeQuery(els.q.value);
  const parts = term ? term.split(/\s+/g).filter(Boolean) : [];
  const filterKey = parts.join("|");
  if (filterKey !== lastFilterKey) {
    lastFilterKey = filterKey;
    currentRenderLimit = GRID_BATCH_SIZE;
  }
  const items = !parts.length
    ? stickers
    : stickers.filter((s) => parts.every((p) => (s.nameLc || "").includes(p)));
  currentFilteredTotal = items.length;
  const visible = items.slice(0, currentRenderLimit);

  els.count.textContent = String(items.length);
  els.countLabel.textContent = t().countLabel;

  els.emptyState.style.display = stickers.length ? "none" : "block";

  els.grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  const imgsToWire = [];

  // Render quickly with placeholders; hydrate thumbs async
  for (let idx = 0; idx < visible.length; idx++) {
    const s = visible[idx];
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <a class="thumbLink" data-role="open-card" data-idx="${idx}" href="${escHtml(s.resolvedUrl || s.sourceUrl)}" target="_blank" rel="noreferrer">
        <div class="thumb" data-sticker-id="${escHtml(s._id)}" data-img-url="${escHtml(s.resolvedUrl || s.sourceUrl)}" data-img-alt="${escHtml(s.name)}">
          <img class="thumbImg" loading="lazy" referrerpolicy="no-referrer" alt="${escHtml(s.name)}" src="${escHtml(s.resolvedUrl || s.sourceUrl)}" />
        </div>
      </a>
      <div class="meta">
        <div class="nameRow">
          <a class="nameLink" data-role="open" href="${escHtml(s.resolvedUrl || s.sourceUrl)}" target="_blank" rel="noreferrer" title="${escHtml(s.name)}">${escHtml(s.name)}</a>
          <div class="iconBar">
            <a class="iconLink" data-role="download" href="${escHtml(s.resolvedUrl || s.sourceUrl)}" download="${escHtml(s.name)}" title="${escHtml(t().downloadTitle)}">💾</a>
            <a class="iconLink" href="${googleTextAndImageUrl(s.name, s.resolvedUrl || s.sourceUrl)}" target="_blank" rel="noreferrer" title="${escHtml(t().googleSearchTitle)}">🔎</a>
          </div>
        </div>
      </div>
    `;
    frag.appendChild(card);
    const img = card.querySelector("img.thumbImg");
    if (img) imgsToWire.push(img);
  }

  // Infinite scroll sentinel
  if (!loadMoreSentinel) {
    loadMoreSentinel = document.createElement("div");
    loadMoreSentinel.style.height = "1px";
  }
  frag.appendChild(loadMoreSentinel);

  els.grid.appendChild(frag);

  // If an image fails (e.g. imgur.com page), resolve to direct image URL and retry once.
  for (const img of imgsToWire) {
    img.addEventListener(
      "error",
      async () => {
        if (img.dataset.resolvedOnce === "1") return;
        img.dataset.resolvedOnce = "1";
        const thumb = img.closest(".thumb");
        const originalUrl = thumb ? (thumb.dataset.imgUrl || img.src) : img.src;
        const stickerId = thumb ? (thumb.dataset.stickerId || "") : "";
        const resolved = await resolveForDisplay(originalUrl);
        if (resolved && resolved !== img.src) {
          if (thumb) thumb.dataset.imgUrl = resolved;
          if (stickerId) {
            const s = stickers.find((x) => x._id === stickerId);
            if (s) s.resolvedUrl = resolved;
          }
          const card = img.closest(".card");
          if (card) {
            const opens = card.querySelectorAll('a[data-role="open"]');
            const aDl = card.querySelector('a[data-role="download"]');
            for (const a of opens) a.href = resolved;
            if (aDl) aDl.href = resolved;
          }
          img.src = resolved;
        }
      },
      { once: true }
    );
  }

  // Observe the sentinel and load more when near bottom.
  if (!loadMoreObserver && typeof IntersectionObserver !== "undefined") {
    loadMoreObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (isLoadingMore) continue;
          // Only load more if there is more to show.
          if (currentRenderLimit < currentFilteredTotal) {
            isLoadingMore = true;
            currentRenderLimit = Math.min(currentRenderLimit + GRID_BATCH_SIZE, currentFilteredTotal);
            // Render more, but avoid tight loops by deferring.
            setTimeout(() => {
              renderFiltered()
                .catch(() => {})
                .finally(() => {
                  isLoadingMore = false;
                });
            }, 0);
          }
        }
      },
      { root: null, rootMargin: "800px 0px", threshold: 0 }
    );
  }
  if (loadMoreObserver) {
    loadMoreObserver.disconnect();
    loadMoreObserver.observe(loadMoreSentinel);
  }
}

// ---- Downloading ----

function slugifyFilename(name) {
  const s = String(name || "sticker")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return (s || "sticker").slice(0, 80);
}

function shortStableHash(input) {
  // FNV-1a 32-bit, sufficient for filename disambiguation.
  let h = 0x811c9dc5;
  const str = String(input || "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

async function fetchBlob(url) {
  const resp = await fetch(url, { referrerPolicy: "no-referrer" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`);
  const blob = await resp.blob();
  // Guard: if we accidentally fetched HTML (e.g., Imgur page), don't treat it as an image.
  if (blob.type && !blob.type.startsWith("image/")) {
    throw new Error(`Non-image content-type: ${blob.type} (${url})`);
  }
  return blob;
}

function guessExtFromUrl(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    const m = p.match(/\.(png|jpg|jpeg|gif|webp)$/);
    if (m) return `.${m[1]}`;
  } catch {
    // ignore
  }
  return "";
}

async function downloadAsFile(url, baseName) {
  const resolved = await resolveForDisplay(url);
  const blob = await fetchBlob(resolved);
  const ext = guessExtFromUrl(resolved) || (blob.type ? `.${blob.type.split("/")[1]}` : "");
  const safeBase = slugifyFilename(baseName || "image");
  const filename = `${safeBase}${ext || ""}`;
  const objUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Safe to revoke right after triggering the download.
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
  }
}

// Minimal ZIP builder (store-only) to keep it dependency-free.
function crc32(buf) {
  const table = crc32._table || (crc32._table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function u16(n) { const b = new Uint8Array(2); b[0]=n&255; b[1]=(n>>>8)&255; return b; }
function u32(n) { const b = new Uint8Array(4); b[0]=n&255; b[1]=(n>>>8)&255; b[2]=(n>>>16)&255; b[3]=(n>>>24)&255; return b; }
function concat(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
async function buildZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralHeaders = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
    const crc = crc32(data);
    const size = data.length >>> 0;
    const localHeader = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, data);
    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralHeaders.push(central);
    offset += localHeader.length + data.length;
  }
  const centralStart = offset;
  const centralDir = concat(centralHeaders);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(centralDir.length), u32(centralStart),
    u16(0),
  ]);
  return new Blob([...localParts, centralDir, end], { type: "application/zip" });
}

function buildExportIndexHtml(title, stickersMeta) {
  const safeTitle = String(title || "Mudae Album").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const payload = JSON.stringify(stickersMeta);
  // Single-file viewer (no external assets).
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>${safeTitle}</title>
  <style>
    :root{--bg:#0b0f17;--panel:#111827;--panel2:#0f172a;--text:#e5e7eb;--muted:#9ca3af;--border:#24324a;--accent:#60a5fa;}
    *{box-sizing:border-box;}
    body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:radial-gradient(1200px 800px at 20% 0%, #111827 0%, var(--bg) 50%, #070a10 100%);color:var(--text);}
    .wrap{max-width:1200px;margin:0 auto;padding:16px;}
    .wrapFull{max-width:90vw;}
    header{position:sticky;top:0;z-index:10;background:rgba(11,15,23,.85);backdrop-filter:blur(10px);border-bottom:1px solid rgba(36,50,74,.6);}
    .topbar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;}
    .brand{display:flex;gap:10px;align-items:center;}
    .title{font-weight:800;letter-spacing:.2px;}
    .pill{color:var(--muted);font-size:12px;border:1px solid rgba(36,50,74,.8);background:rgba(15,23,42,.55);padding:6px 10px;border-radius:999px;}
    .actions{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex:1;flex-wrap:wrap;}
    select,input{border-radius:10px;border:1px solid rgba(36,50,74,.9);background:rgba(17,24,39,.9);color:var(--text);outline:none;}
    select{padding:10px;}
    input{flex:1;min-width:240px;padding:10px 12px;background:rgba(17,24,39,.7);}
    input:focus{border-color:rgba(96,165,250,.8);box-shadow:0 0 0 4px rgba(96,165,250,.15);}
    button{padding:10px 12px;border-radius:10px;border:1px solid rgba(36,50,74,.9);background:rgba(17,24,39,.9);color:var(--text);cursor:pointer;}
    button:hover{border-color:rgba(96,165,250,.8);}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:14px;}
    .card{border:1px solid rgba(36,50,74,.8);border-radius:14px;overflow:hidden;background:linear-gradient(180deg, rgba(17,24,39,.65), rgba(15,23,42,.65));box-shadow:0 10px 25px rgba(0,0,0,.25);}
    .thumb{aspect-ratio:3/4;background:rgba(0,0,0,.25);display:grid;place-items:center;overflow:hidden;}
    .thumb img{width:100%;height:100%;object-fit:cover;display:block;}
    .thumbLink{display:block;color:inherit;text-decoration:none;}
    .meta{padding:10px 10px 12px;display:flex;flex-direction:column;gap:6px;}
    .nameRow{display:flex;gap:8px;align-items:flex-start;}
    .nameLink{flex:1;min-width:0;font-size:13px;font-weight:650;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:32px;color:var(--text);text-decoration:none;}
    .nameLink:hover{text-decoration:underline;}
    .iconBar{display:flex;gap:4px;align-items:center;justify-content:center;flex-wrap:wrap;flex:0 0 auto;}
    .cardProgress{color:var(--muted);font-size:12px;margin:0 4px 0 0;}
    .iconLink{width:28px;height:28px;display:inline-grid;place-items:center;border-radius:10px;border:1px solid rgba(36,50,74,.9);background:rgba(17,24,39,.75);color:var(--text);text-decoration:none;font-size:14px;line-height:1;}
    .iconLink:hover{border-color:rgba(96,165,250,.8);}

    /* Card (tinder) view */
    .cardView{margin-top:14px;}
    .cardView[hidden]{display:none;}
    .cardStage{position:relative;height:calc(100vh - 120px);min-height:520px;max-width:90vw;margin:0 auto;border:1px solid rgba(36,50,74,.8);border-radius:14px;overflow:hidden;background:linear-gradient(180deg, rgba(17,24,39,.65), rgba(15,23,42,.65));box-shadow:0 10px 25px rgba(0,0,0,.25);}
    .cardSurface{position:absolute;inset:0;display:grid;grid-template-rows:1fr auto;}
    .cardDeck{position:absolute;inset:0;display:grid;place-items:center;perspective:1200px;}
    .cardPane{position:absolute;width:min(680px,86%);height:100%;border-radius:14px;overflow:hidden;background:rgba(0,0,0,.12);border:1px solid rgba(36,50,74,.55);box-shadow:0 18px 60px rgba(0,0,0,.35);transform-style:preserve-3d;transition:transform 160ms ease, opacity 160ms ease, filter 160ms ease;display:grid;grid-template-rows:1fr auto;}
    .cardPane.is-left{transform:translateX(-94%) rotateY(26deg) scale(0.86);opacity:.55;filter:blur(0.2px);}
    .cardPane.is-center{transform:translateX(0) rotateY(0) scale(1);opacity:1;}
    .cardPane.is-right{transform:translateX(94%) rotateY(-26deg) scale(0.86);opacity:.55;filter:blur(0.2px);}
    .cardStage.anim-next .cardPane.is-off-left{transform:translateX(-160%) rotateY(40deg) scale(0.80);opacity:0;}
    .cardStage.anim-next .cardPane.is-left{transform:translateX(-120%) rotateY(35deg) scale(0.84);opacity:0;}
    .cardStage.anim-next .cardPane.is-center{transform:translateX(-94%) rotateY(26deg) scale(0.86);opacity:.55;filter:blur(0.2px);}
    .cardStage.anim-next .cardPane.is-right{transform:translateX(0) rotateY(0) scale(1);opacity:1;filter:none;}
    .cardStage.anim-next .cardPane.is-off-right{transform:translateX(94%) rotateY(-26deg) scale(0.86);opacity:.55;filter:blur(0.2px);}
    .cardStage.anim-prev .cardPane.is-off-right{transform:translateX(160%) rotateY(-40deg) scale(0.80);opacity:0;}
    .cardStage.anim-prev .cardPane.is-right{transform:translateX(120%) rotateY(-35deg) scale(0.84);opacity:0;}
    .cardStage.anim-prev .cardPane.is-center{transform:translateX(94%) rotateY(-26deg) scale(0.86);opacity:.55;filter:blur(0.2px);}
    .cardStage.anim-prev .cardPane.is-left{transform:translateX(0) rotateY(0) scale(1);opacity:1;filter:none;}
    .cardStage.anim-prev .cardPane.is-off-left{transform:translateX(-94%) rotateY(26deg) scale(0.86);opacity:.55;filter:blur(0.2px);}
    .cardHero{position:relative;overflow:hidden;background:rgba(0,0,0,.25);}
    .cardHero img{width:100%;height:100%;object-fit:contain;display:block;background:rgba(0,0,0,.35);}
    .cardFooter{padding:12px 12px 14px;border-top:1px solid rgba(36,50,74,.6);display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;}
    .cardTitle{font-weight:800;letter-spacing:.2px;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;}
    .cardNav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:14px;border:1px solid rgba(36,50,74,.9);background:rgba(17,24,39,.65);color:var(--text);cursor:pointer;z-index:5;}
    .cardNav.left{left:10px;}
    .cardNav.right{right:10px;}
    .cardNav:hover{border-color:rgba(96,165,250,.8);}
    .cardClose{position:absolute;top:10px;right:10px;width:44px;height:44px;border-radius:14px;border:1px solid rgba(36,50,74,.9);background:rgba(17,24,39,.65);color:var(--text);cursor:pointer;z-index:6;font-size:22px;line-height:1;display:grid;place-items:center;}
    .cardClose:hover{border-color:rgba(96,165,250,.8);}
    .cardTapZone{position:absolute;left:0;right:0;top:0;bottom:64px;display:grid;grid-template-columns:1fr 1fr;z-index:4;pointer-events:none;}
    .cardTapZone>div{cursor:pointer;pointer-events:auto;}
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="topbar">
        <div class="brand">
          <div class="title">${safeTitle}</div>
          <div class="pill"><span id="count"></span> <span id="countLabel"></span></div>
        </div>
        <div class="actions">
          <input id="q" type="search" autocomplete="off" />
        </div>
      </div>
    </div>
  </header>
  <main class="wrap wrapFull">
    <div class="grid" id="grid"></div>
    <section id="cardView" class="cardView" hidden>
      <div class="cardStage" id="cardStage">
        <button class="cardClose" id="cardClose" type="button" aria-label="Close">×</button>
        <button class="cardNav left" id="cardPrev" type="button" aria-label="Previous">◀</button>
        <button class="cardNav right" id="cardNext" type="button" aria-label="Next">▶</button>
        <div class="cardSurface" id="cardSurface"></div>
      </div>
    </section>
  </main>
  <script>
    const STICKERS = ${payload};
    const TXT = { countLabel:"stickers", search:"Search...", downloadTitle:"Download image", googleSearchTitle:"Search on Google (text + image)" };
    const q = document.getElementById("q");
    const grid = document.getElementById("grid");
    const cardView = document.getElementById("cardView");
    const cardSurface = document.getElementById("cardSurface");
    const cardPrev = document.getElementById("cardPrev");
    const cardNext = document.getElementById("cardNext");
    const cardClose = document.getElementById("cardClose");
    const count = document.getElementById("count");
    const countLabel = document.getElementById("countLabel");
    function esc(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));}
    function googleTextAndImageUrl(name, imageUrl){
      const q = encodeURIComponent(String(name||""));
      const u = String(imageUrl||"");
      if(u.startsWith("http://") || u.startsWith("https://")){
        const img = encodeURIComponent(u);
        return "https://www.google.com/searchbyimage?image_url="+img+"&q="+q;
      }
      return "https://www.google.com/search?tbm=isch&q="+q;
    }
    let viewMode = localStorage.getItem("mudae_album_view") || "grid";
    let cardIndex = 0;

    function applyEnglish(){
      document.documentElement.lang = "en";
      q.placeholder = TXT.search;
      render();
    }

    function getItems(){
      const term = (q.value||"").trim().toLowerCase();
      const parts = term ? term.split(/\\s+/g).filter(Boolean) : [];
      return !parts.length ? STICKERS : STICKERS.filter(s => parts.every(p => (s.name_lc||"").includes(p)));
    }

    let isAnimating = false;
    const CARD_ANIM_MS = 160;
    function renderCard(){
      const items = getItems();
      if(items.length){
        count.textContent = (cardIndex + 1) + "/" + items.length;
        countLabel.textContent = "";
      }else{
        count.textContent = "0/0";
        countLabel.textContent = "";
      }
      if(!items.length){ cardSurface.innerHTML=""; return; }
      if(cardIndex<0) cardIndex=0;
      if(cardIndex>=items.length) cardIndex=items.length-1;
      const center = items[cardIndex];
      const left = cardIndex>0 ? items[cardIndex-1] : null;
      const right = cardIndex<items.length-1 ? items[cardIndex+1] : null;
      function pane(pos, s){
        if(!s) return '<div class="cardPane '+pos+'"></div>';
        const prog = pos==="is-center" ? ('<span class="cardProgress">'+(cardIndex+1)+' / '+items.length+'</span>') : '';
        return \`
          <div class="cardPane \${pos}">
            <div class="cardHero">
              <img loading="eager" referrerpolicy="no-referrer" alt="\${esc(s.name)}" src="\${esc(s.local_path)}" />
            </div>
            <div class="cardFooter">
              <a class="cardTitle nameLink" href="\${esc(s.local_path)}" target="_blank" rel="noreferrer" title="\${esc(s.name)}">\${esc(s.name)}</a>
              <div class="iconBar">
                \${prog}
                <a class="iconLink" href="\${esc(s.local_path)}" download="\${esc(s.filename)}" title="\${TXT.downloadTitle}">💾</a>
                <a class="iconLink" href="\${googleTextAndImageUrl(s.name, s.resolved_url || s.source_url)}" target="_blank" rel="noreferrer" title="\${TXT.googleSearchTitle}">🔎</a>
              </div>
            </div>
          </div>\`;
      }
      cardSurface.innerHTML = \`
        <div class="cardDeck">
          \${pane("is-left", left)}
          \${pane("is-center", center)}
          \${pane("is-right", right)}
          <div class="cardTapZone" id="cardTapZone">
            <div data-dir="-1"></div>
            <div data-dir="1"></div>
          </div>
        </div>
        \`;
      const tap = document.getElementById("cardTapZone");
      if(tap){
        tap.onclick = (e) => {
          const dir = e.target && e.target.dataset ? Number(e.target.dataset.dir) : 0;
          if(dir===1) { cardIndex=Math.min(cardIndex+1, items.length-1); renderCard(); }
          if(dir===-1){ cardIndex=Math.max(cardIndex-1, 0); renderCard(); }
        };
      }
    }

    function setView(next){
      viewMode = next==="card" ? "card" : "grid";
      localStorage.setItem("mudae_album_view", viewMode);
      if(viewMode==="card"){
        grid.style.display="none";
        cardView.hidden=false;
        renderCard();
      }else{
        grid.style.display="";
        cardView.hidden=true;
        render();
      }
    }
    function render(){
      const items = getItems();
      count.textContent = String(items.length);
      countLabel.textContent = TXT.countLabel;
      grid.innerHTML = "";
      const frag = document.createDocumentFragment();
      for(let i=0;i<items.length;i++){
        const s = items[i];
        const d = document.createElement("div");
        d.className = "card";
        d.innerHTML = \`
          <a class="thumbLink" data-role="open-card" data-idx="\${i}" href="\${esc(s.local_path)}" target="_blank" rel="noreferrer">
            <div class="thumb"><img loading="lazy" src="\${esc(s.local_path)}" alt="\${esc(s.name)}"/></div>
          </a>
          <div class="meta">
            <div class="nameRow">
              <a class="nameLink" href="\${esc(s.local_path)}" target="_blank" rel="noreferrer" title="\${esc(s.name)}">\${esc(s.name)}</a>
              <div class="iconBar">
                <a class="iconLink" href="\${esc(s.local_path)}" download="\${esc(s.filename)}" title="\${TXT.downloadTitle}">💾</a>
                <a class="iconLink" href="\${googleTextAndImageUrl(s.name, s.resolved_url || s.source_url)}" target="_blank" rel="noreferrer" title="\${TXT.googleSearchTitle}">🔎</a>
              </div>
            </div>
          </div>\`;
        frag.appendChild(d);
      }
      grid.appendChild(frag);
    }
    // Clicking any grid image opens Card view at that index.
    grid.addEventListener("click", (e) => {
      if(viewMode!=="grid") return;
      const a = e.target && e.target.closest ? e.target.closest('a[data-role="open-card"]') : null;
      if(!a) return;
      const idx = Number(a.getAttribute("data-idx") || "");
      if(!Number.isFinite(idx)) return;
      e.preventDefault();
      cardIndex = idx;
      setView("card");
    });
    q.addEventListener("input", () => { if(viewMode==="card") renderCard(); else render(); });
    function nextStep(){
      if(viewMode!=="card") return;
      const items=getItems();
      if(isAnimating) return;
      if(cardIndex>=items.length-1) return;
      isAnimating=true;
      document.getElementById("cardStage").classList.add("anim-next");
      setTimeout(() => {
        cardIndex=Math.min(cardIndex+1,items.length-1);
        renderCard();
        document.getElementById("cardStage").classList.remove("anim-next");
        isAnimating=false;
      }, CARD_ANIM_MS);
    }
    function prevStep(){
      if(viewMode!=="card") return;
      const items=getItems();
      if(isAnimating) return;
      if(cardIndex<=0) return;
      isAnimating=true;
      document.getElementById("cardStage").classList.add("anim-prev");
      setTimeout(() => {
        cardIndex=Math.max(cardIndex-1,0);
        renderCard();
        document.getElementById("cardStage").classList.remove("anim-prev");
        isAnimating=false;
      }, CARD_ANIM_MS);
    }
    cardPrev.addEventListener("click", prevStep);
    cardNext.addEventListener("click", nextStep);
    if(cardClose) cardClose.addEventListener("click", () => setView("grid"));
    document.addEventListener("keydown", (e) => {
      if(viewMode!=="card") return;
      if(e.key==="Escape"){ setView("grid"); return; }
      if(e.key==="ArrowRight"){ nextStep(); }
      if(e.key==="ArrowLeft"){ prevStep(); }
    });
    applyEnglish();
    setView(viewMode);
    if(viewMode==="grid") render();
  </script>
</body>
</html>`;
}

async function exportAlbumZip() {
  if (!stickers.length) return;
  els.exportAlbum.disabled = true;
  try {
    const resolveFailures = await resolveAll();
    if (resolveFailures) setStatus(t().errorResolve);

    setStatus(t().statusExporting);
    const files = [];
    const stickerMeta = [];
    let ok = 0;
    let fail = 0;
    const usedFilenames = new Set();
    await mapWithConcurrency(stickers, EXPORT_FETCH_CONCURRENCY, async (s, i) => {
      setStatus(t().statusFetching(i + 1, stickers.length));
      const url = s.resolvedUrl || s.sourceUrl;
      try {
        const blob = await fetchBlob(url);
        const ab = await blob.arrayBuffer();
        const ext = (() => {
          try {
            const p = new URL(url).pathname.toLowerCase();
            const m = p.match(/\.(png|jpg|jpeg|gif|webp)$/);
            return m ? `.${m[1]}` : ".img";
          } catch { return ".img"; }
        })();
        const base = slugifyFilename(s.name);
        const suffix = shortStableHash(`${s.name}\n${s.sourceUrl}`);
        let filename = `${base}__${suffix}${ext}`;
        // Guard against extremely rare hash collisions
        let n = 1;
        while (usedFilenames.has(filename)) {
          filename = `${base}__${suffix}-${n}${ext}`;
          n++;
        }
        usedFilenames.add(filename);
        const localPath = `images/${filename}`;
        files.push({ name: localPath, data: ab });
        stickerMeta.push({
          name: s.name,
          name_lc: s.nameLc,
          source_url: s.sourceUrl,
          resolved_url: url,
          filename,
          local_path: localPath,
          ext,
        });
        ok++;
      } catch (e) {
        fail++;
        console.warn("Export fetch failed", s, e);
      }
    });

    if (ok === 0 && fail > 0) {
      setStatus(t().errorExportFailed);
      alert(t().errorExportFailed);
      return;
    }

    // Build index.html that only references images/
    const exportIndex = buildExportIndexHtml("Mudae Album", stickerMeta);
    files.push({ name: "index.html", data: new TextEncoder().encode(exportIndex).buffer });
    files.push({ name: "album.json", data: new TextEncoder().encode(JSON.stringify({ stickers: stickerMeta }, null, 2)).buffer });

    setStatus(t().statusZipping);
    const zipBlob = await buildZipBlob(files);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(zipBlob);
    a.download = "mudae-album-export.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setStatus(t().statusDoneWith(ok, fail));
  } finally {
    els.exportAlbum.disabled = false;
    setTimeout(() => setStatus(""), 6000);
  }
}

async function resolveAll() {
  let resolveFailures = 0;
  await mapWithConcurrency(stickers, RESOLVE_CONCURRENCY, async (s, i) => {
    setStatus(t().statusResolving(i + 1, stickers.length));
    try {
      s.resolvedUrl = await resolveImageUrl(s.sourceUrl);
    } catch (e) {
      resolveFailures++;
      console.warn("Resolve failed", s, e);
      s.resolvedUrl = s.sourceUrl;
    }
  });
  if (resolveFailures) console.warn("Resolve failures:", resolveFailures);
  return resolveFailures;
}

// ---- File loading ----

async function loadFromText(text) {
  const source = new MudaeTxtSource(text || "");
  const loaded = await source.load();

  stickers = loaded.map((s, idx) => ({
    _id: `s${idx}`,
    name: s.name,
    nameLc: s.name.toLowerCase(),
    sourceUrl: s.sourceUrl,
    resolvedUrl: null,
  }));

  currentRenderLimit = GRID_BATCH_SIZE;
  lastFilterKey = "";
  currentFilteredTotal = 0;
  isLoadingMore = false;
  setStatus(t().statusLoaded(stickers.length));
  await renderFiltered();
  setTimeout(() => setStatus(""), 2500);
}

function openPasteModal() {
  els.pasteModal.hidden = false;
  const saved = localStorage.getItem(LAST_PASTE_KEY) || "";
  // Pre-fill with last pasted text (so user doesn't need to reload)
  if (!els.pasteText.value) els.pasteText.value = saved;
  if (!els.pasteText.value) els.pasteText.value = "";
  els.pasteText.focus();
}

function closePasteModal() {
  els.pasteModal.hidden = true;
}

// ---- UI events ----

const debouncedRenderFiltered = debounce(() => {
  if (viewMode === "card") renderCard().catch(() => {});
  else renderFiltered().catch(() => {});
}, SEARCH_DEBOUNCE_MS);

els.q.addEventListener("input", debouncedRenderFiltered);
els.exportAlbum.addEventListener("click", () => exportAlbumZip());
els.pasteBtn.addEventListener("click", () => openPasteModal());

// Clicking a grid image opens Card view at that index.
els.grid.addEventListener("click", (e) => {
  if (viewMode !== "grid") return;
  const a = e.target && e.target.closest ? e.target.closest('a[data-role="open-card"]') : null;
  if (!a) return;
  const idxStr = a.getAttribute("data-idx") || "";
  const idx = Number(idxStr);
  if (!Number.isFinite(idx)) return;
  e.preventDefault();
  setViewMode("card", { cardIndex: idx, reset: false });
});

// Force-download for cross-origin images (avoids opening Imgur pages, etc.)
document.addEventListener("click", (e) => {
  const a = e.target && e.target.closest ? e.target.closest('a[data-role="download"]') : null;
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute("href") || "";
  const card = a.closest(".card");
  const nameEl = card ? card.querySelector(".nameLink") : null;
  const name = nameEl ? nameEl.textContent : "image";
  downloadAsFile(href, name).catch((err) => {
    console.warn("Download failed", err);
  });
});

els.cardPrev.addEventListener("click", () => prevCard());
els.cardNext.addEventListener("click", () => nextCard());
if (els.cardClose) {
  els.cardClose.addEventListener("click", () => setViewMode("grid"));
}
document.addEventListener("keydown", (e) => {
  if (viewMode !== "card") return;
  if (!els.pasteModal.hidden) return;
  if (e.key === "Escape") {
    setViewMode("grid");
    return;
  }
  if (e.key === "ArrowRight") nextCard();
  if (e.key === "ArrowLeft") prevCard();
});

els.pasteClose.addEventListener("click", () => closePasteModal());
els.pasteCancel.addEventListener("click", () => closePasteModal());
els.pasteModal.addEventListener("click", (e) => {
  if (e.target === els.pasteModal) closePasteModal();
});
document.addEventListener("keydown", (e) => {
  if (!els.pasteModal.hidden && e.key === "Escape") closePasteModal();
});
els.pasteLoad.addEventListener("click", async () => {
  const text = els.pasteText.value || "";
  try {
    localStorage.setItem(LAST_PASTE_KEY, text);
  } catch {
    // ignore storage errors
  }
  closePasteModal();
  try {
    await loadFromText(text);
  } catch (e) {
    console.error(e);
    setStatus(t().errorReadFile);
  }
});

// Init
applyEnglishText();
setViewMode("grid");
// Auto-restore last pasted text (if any) on reload
(() => {
  const saved = localStorage.getItem(LAST_PASTE_KEY);
  if (saved && String(saved).trim()) {
    loadFromText(saved).catch(() => {});
  }
})();
renderFiltered();

