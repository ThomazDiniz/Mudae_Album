/* Pure HTML/CSS/JS album.
   - Load mudae.txt via file picker
   - Parse "Name - URL"
   - Export a shareable zip (index.html + images/)
   - Keep architecture open for future sources/resolvers
*/

const $ = (id) => document.getElementById(id);

const els = {
  lang: $("lang"),
  pasteBtn: $("pasteBtn"),
  q: $("q"),
  count: $("count"),
  countLabel: $("countLabel"),
  exportAlbum: $("exportAlbum"),
  status: $("status"),
  grid: $("grid"),
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

const I18N = {
  en: {
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
    singleDownload: "download",
    statusLoaded: (n) => `Loaded ${n} stickers`,
    statusResolving: (i, n) => `Resolving ${i}/${n}...`,
    statusFetching: (i, n) => `Fetching ${i}/${n}...`,
    statusZipping: "Building ZIP...",
    statusExporting: "Exporting album...",
    statusDone: "Done",
    statusDoneWith: (ok, fail) => `Done (${ok} ok, ${fail} failed)`,
    errorExportFailed:
      "Could not export the album ZIP (likely CORS).",
    errorReadFile: "Could not read file.",
    errorResolve: "Could not resolve some image URLs (see console).",
    errorDownload: "Some downloads failed (see console).",
  },
  "pt-BR": {
    countLabel: "figurinhas",
    searchPlaceholder: "Buscar...",
    exportAlbum: "Exportar álbum (ZIP)",
    exportAlbumTitle: "Cria um zip com index.html + images/ (compartilhável)",
    pasteText: "Importar",
    pasteTextTitle: "Cole o conteúdo do mudae.txt em vez de selecionar um arquivo",
    emptyTitle: "Carregue sua lista",
    emptyText:
      'Cole seu <code>mudae.txt</code> (formato: <code>Nome - URL</code>), depois exporte um ZIP compartilhável com <code>index.html</code> + <code>images/</code>.',
    pasteTitle: "Cole sua lista",
    pasteHelp:
      'Cole aqui o conteúdo do <code>mudae.txt</code> (formato: <code>Nome - URL</code>). Exemplo:<br/><code>Diane - https://mudae.net/uploads/3900740/iy1DIZM~QFuV9Ta.png</code>',
    pasteCancel: "Cancelar",
    pasteLoad: "Carregar lista",
    singleDownload: "baixar",
    statusLoaded: (n) => `${n} figurinhas carregadas`,
    statusResolving: (i, n) => `Resolvendo ${i}/${n}...`,
    statusDone: "Pronto",
    statusDoneWith: (ok, fail) => `Pronto (${ok} ok, ${fail} falharam)`,
    statusFetching: (i, n) => `Baixando ${i}/${n}...`,
    statusZipping: "Montando ZIP...",
    statusExporting: "Exportando álbum...",
    errorExportFailed:
      "Não consegui exportar o ZIP do álbum (provável CORS).",
    errorReadFile: "Não consegui ler o arquivo.",
    errorResolve: "Falha ao resolver algumas URLs (veja o console).",
    errorDownload: "Alguns downloads falharam (veja o console).",
  },
};

function detectDefaultLang() {
  const saved = localStorage.getItem("mudae_album_lang");
  if (saved && I18N[saved]) return saved;
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("pt")) return "pt-BR";
  return "en";
}

let LANG = detectDefaultLang();
function t() {
  return I18N[LANG] || I18N.en;
}

const LAST_PASTE_KEY = "mudae_album_last_paste_text";

function setLang(next) {
  if (!I18N[next]) return;
  LANG = next;
  localStorage.setItem("mudae_album_lang", LANG);
  document.documentElement.lang = LANG;

  els.lang.value = LANG;
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

  renderFiltered();
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
  const sep = " - ";
  const idx = line.indexOf(sep);
  if (idx === -1) return null;
  const name = line.slice(0, idx).trim();
  const url = line.slice(idx + sep.length).trim();
  if (!name || !url) return null;
  return { name, sourceUrl: url };
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
  const resp = await fetch(url, { cache: "no-store" });
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

function setStatus(msg) {
  els.status.textContent = msg || "";
}

function normalizeQuery(q) {
  return (q || "").trim().toLowerCase();
}

function getStickerImageUrl(s) {
  return s.resolvedUrl || s.sourceUrl;
}

// ---- Rendering ----

function escHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function renderFiltered() {
  const term = normalizeQuery(els.q.value);
  const parts = term ? term.split(/\s+/g).filter(Boolean) : [];
  const items = !parts.length
    ? stickers
    : stickers.filter((s) => parts.every((p) => (s.nameLc || "").includes(p)));

  els.count.textContent = String(items.length);
  els.countLabel.textContent = t().countLabel;

  els.emptyState.style.display = stickers.length ? "none" : "block";

  els.grid.innerHTML = "";
  const frag = document.createDocumentFragment();

  // Render quickly with placeholders; hydrate thumbs async
  for (const s of items) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="thumb">
        <div class="ph">...</div>
      </div>
      <div class="meta">
        <div class="name" title="${escHtml(s.name)}">${escHtml(s.name)}</div>
        <div class="small">
          <a class="link" href="${escHtml(s.resolvedUrl || s.sourceUrl)}" target="_blank" rel="noreferrer">src</a>
          <a class="link" href="${escHtml(s.resolvedUrl || s.sourceUrl)}" download="${escHtml(s.name)}">${t().singleDownload}</a>
        </div>
      </div>
    `;
    frag.appendChild(card);

    // hydrate image async
    (async () => {
      try {
        const thumb = card.querySelector(".thumb");
        const imgUrl = getStickerImageUrl(s);
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = s.name;
        img.src = imgUrl;
        thumb.innerHTML = "";
        thumb.appendChild(img);
      } catch {
        // keep placeholder
      }
    })();
  }

  els.grid.appendChild(frag);
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchBlob(url) {
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`);
  return await resp.blob();
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
async function buildZip(files) {
  const encoder = new TextEncoder();
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const data = new Uint8Array(f.data);
    const crc = crc32(data);
    const size = data.length >>> 0;
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0),
      nameBytes, data,
    ]);
    localHeaders.push(local);
    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralHeaders.push(central);
    offset += local.length;
  }
  const centralStart = offset;
  const centralDir = concat(centralHeaders);
  offset += centralDir.length;
  const end = concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(centralDir.length), u32(centralStart),
    u16(0),
  ]);
  return concat([...localHeaders, centralDir, end]);
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
  <title>${safeTitle}</title>
  <style>
    :root{--bg:#0b0f17;--panel:#111827;--panel2:#0f172a;--text:#e5e7eb;--muted:#9ca3af;--border:#24324a;--accent:#60a5fa;}
    *{box-sizing:border-box;}
    body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:radial-gradient(1200px 800px at 20% 0%, #111827 0%, var(--bg) 50%, #070a10 100%);color:var(--text);}
    .wrap{max-width:1200px;margin:0 auto;padding:16px;}
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
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:14px;}
    .card{border:1px solid rgba(36,50,74,.8);border-radius:14px;overflow:hidden;background:linear-gradient(180deg, rgba(17,24,39,.65), rgba(15,23,42,.65));box-shadow:0 10px 25px rgba(0,0,0,.25);}
    .thumb{aspect-ratio:3/4;background:rgba(0,0,0,.25);display:grid;place-items:center;overflow:hidden;}
    .thumb img{width:100%;height:100%;object-fit:cover;display:block;}
    .meta{padding:10px 10px 12px;display:flex;flex-direction:column;gap:6px;}
    .name{font-size:13px;font-weight:650;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:32px;}
    .small{font-size:12px;color:var(--muted);display:flex;gap:8px;justify-content:space-between;align-items:center;}
    a{color:var(--accent);text-decoration:none;font-size:12px;}
    a:hover{text-decoration:underline;}
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
          <select id="lang" title="Language">
            <option value="en">EN</option>
            <option value="pt-BR">PT-BR</option>
          </select>
          <input id="q" type="search" autocomplete="off" />
        </div>
      </div>
    </div>
  </header>
  <main class="wrap">
    <div class="grid" id="grid"></div>
  </main>
  <script>
    const STICKERS = ${payload};
    const I18N = {
      "en": { countLabel:"stickers", search:"Search...", download:"download" },
      "pt-BR": { countLabel:"figurinhas", search:"Buscar...", download:"baixar" }
    };
    function detectDefaultLang(){
      const saved = localStorage.getItem("mudae_album_lang");
      if (saved && I18N[saved]) return saved;
      const nav = (navigator.language || "en").toLowerCase();
      if (nav.startsWith("pt")) return "pt-BR";
      return "en";
    }
    let LANG = detectDefaultLang();
    const langSel = document.getElementById("lang");
    const q = document.getElementById("q");
    const grid = document.getElementById("grid");
    const count = document.getElementById("count");
    const countLabel = document.getElementById("countLabel");
    function esc(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));}
    function setLang(next){
      if(!I18N[next]) return;
      LANG = next;
      localStorage.setItem("mudae_album_lang", LANG);
      document.documentElement.lang = LANG;
      langSel.value = LANG;
      q.placeholder = I18N[LANG].search;
      render();
    }
    function render(){
      const term = (q.value||"").trim().toLowerCase();
      const parts = term ? term.split(/\\s+/g).filter(Boolean) : [];
      const items = !parts.length ? STICKERS : STICKERS.filter(s => parts.every(p => (s.name_lc||"").includes(p)));
      count.textContent = String(items.length);
      countLabel.textContent = I18N[LANG].countLabel;
      grid.innerHTML = "";
      const frag = document.createDocumentFragment();
      for(const s of items){
        const d = document.createElement("div");
        d.className = "card";
        d.innerHTML = \`
          <div class="thumb"><img loading="lazy" src="\${esc(s.local_path)}" alt="\${esc(s.name)}"/></div>
          <div class="meta">
            <div class="name" title="\${esc(s.name)}">\${esc(s.name)}</div>
            <div class="small">
              <span>\${esc(s.ext||"")}</span>
              <a href="\${esc(s.local_path)}" download="\${esc(s.filename)}">\${I18N[LANG].download}</a>
            </div>
          </div>\`;
        frag.appendChild(d);
      }
      grid.appendChild(frag);
    }
    q.addEventListener("input", render);
    langSel.addEventListener("change", () => setLang(langSel.value));
    setLang(LANG);
    render();
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

    for (let i = 0; i < stickers.length; i++) {
      setStatus(t().statusFetching(i + 1, stickers.length));
      const s = stickers[i];
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
        const filename = `${slugifyFilename(s.name)}${ext}`;
        const localPath = `images/${filename}`;
        files.push({ name: localPath, data: ab });
        stickerMeta.push({
          name: s.name,
          name_lc: s.nameLc,
          filename,
          local_path: localPath,
          ext,
        });
        ok++;
      } catch (e) {
        fail++;
        console.warn("Export fetch failed", s, e);
      }
    }

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
    const zipBytes = await buildZip(files.map(f => ({ name: f.name, data: f.data })));
    const zipBlob = new Blob([zipBytes], { type: "application/zip" });
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
  for (let i = 0; i < stickers.length; i++) {
    setStatus(t().statusResolving(i + 1, stickers.length));
    const s = stickers[i];
    try {
      s.resolvedUrl = await resolveImageUrl(s.sourceUrl);
    } catch (e) {
      resolveFailures++;
      console.warn("Resolve failed", s, e);
      s.resolvedUrl = s.sourceUrl;
    }
  }
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

els.lang.addEventListener("change", () => setLang(els.lang.value));
els.q.addEventListener("input", () => renderFiltered());
els.exportAlbum.addEventListener("click", () => exportAlbumZip());
els.pasteBtn.addEventListener("click", () => openPasteModal());

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
setLang(LANG);
// Auto-restore last pasted text (if any) on reload
(() => {
  const saved = localStorage.getItem(LAST_PASTE_KEY);
  if (saved && String(saved).trim()) {
    loadFromText(saved).catch(() => {});
  }
})();
renderFiltered();

