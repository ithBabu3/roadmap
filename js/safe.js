// Shared safety helpers, loaded as a classic script BEFORE js/app.js (see js/boot-main.js).
// They exist because the app builds most of its screens as HTML strings:
//   - esc()        escapes plain text, so "List<T>" or a title containing a quote renders as typed
//   - safeUrl()    refuses javascript:/data: links
//   - rich()       sanitises rich-text (notes, summaries, answers) and escapes everything else
//   - lsJSON()     reads a JSON value from localStorage without crashing on corrupt data
(function (g) {
  "use strict";

  const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => MAP[c]);

  // Only web links are allowed. Anything else (javascript:, data:, vbscript:) becomes "#".
  function safeUrl(u) {
    const s = String(u ?? "").trim();
    if (!s) return "";
    try {
      const p = new URL(s, location.href);
      return /^(https?:|mailto:)$/.test(p.protocol) ? s : "#";
    } catch (e) { return "#"; }
  }

  // ---- HTML sanitiser (allow-list). Used for content that came from the rich-text editor. ----
  const TAGS = new Set(["A", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "BR", "P", "DIV", "SPAN", "UL", "OL", "LI", "IMG",
    "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "CODE", "PRE", "MARK", "FONT", "SUB", "SUP", "HR",
    "TABLE", "THEAD", "TBODY", "TR", "TD", "TH"]);
  const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "SVG", "MATH", "FORM", "INPUT",
    "BUTTON", "TEXTAREA", "SELECT", "BASE", "TEMPLATE", "NOSCRIPT", "VIDEO", "AUDIO", "SOURCE"]);
  const SAFE_STYLE = /^\s*(?:(?:background(?:-color)?|color)\s*:\s*(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})\s*;?\s*)+$/i;

  function cleanNode(node) {
    [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 3) return;                       // text
      if (ch.nodeType !== 1) { ch.remove(); return; }       // comments etc.
      const tag = ch.tagName;
      if (DROP.has(tag)) { ch.remove(); return; }
      if (!TAGS.has(tag)) {                                 // unknown tag: keep its text, drop the wrapper
        cleanNode(ch);
        ch.replaceWith(...ch.childNodes);
        return;
      }
      [...ch.attributes].forEach(a => {
        const n = a.name.toLowerCase(), v = a.value;
        const ok =
          (tag === "A" && n === "href" && safeUrl(v) !== "#") ||
          (tag === "IMG" && n === "src" && /^(data:image\/(png|jpe?g|gif|webp);base64,|https:\/\/)/i.test(v)) ||
          (tag === "IMG" && (n === "alt" || n === "width" || n === "height")) ||
          (n === "style" && SAFE_STYLE.test(v)) ||
          (tag === "FONT" && (n === "color" || n === "face" || n === "size")) ||
          ((tag === "TD" || tag === "TH") && (n === "colspan" || n === "rowspan"));
        if (!ok) ch.removeAttribute(a.name);
      });
      if (tag === "A") { ch.setAttribute("target", "_blank"); ch.setAttribute("rel", "noopener noreferrer"); }
      cleanNode(ch);
    });
  }
  function sanitizeHTML(html) {
    const doc = new DOMParser().parseFromString("<body>" + String(html ?? "") + "</body>", "text/html");
    cleanNode(doc.body);
    return doc.body.innerHTML;
  }

  // Editor output contains lowercase tags (<div>, <b>, <ul>…). Plain text such as "List<T>" or
  // "Dictionary<K,V>" does not, so it must be escaped instead of being parsed as HTML.
  const LOOKS_RICH = /<\/?(?:div|p|br|ul|ol|li|b|i|u|s|strong|em|span|img|a|font|h[1-6]|blockquote|pre|code|mark|table|tr|td|th|hr|sub|sup)\b[^>]*>/;
  const isRich = s => LOOKS_RICH.test(String(s ?? ""));
  const rich = s => (isRich(s) ? sanitizeHTML(s) : esc(s));
  const stripTags = s => { const d = document.createElement("div"); d.innerHTML = sanitizeHTML(s); return d.textContent || ""; };

  // ---- localStorage helpers ----
  function lsJSON(key, fallbackJson) {
    try {
      const raw = localStorage.getItem(key);
      return JSON.parse(raw === null || raw === "" ? fallbackJson : raw);
    } catch (e) {
      console.warn("Ignoring unreadable saved value for", key, e);
      return JSON.parse(fallbackJson);
    }
  }
  // Writes can fail (storage full). Tell the user instead of silently losing their work.
  function lsSave(key, value) {
    try { localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); return true; }
    catch (e) {
      console.error("Could not save", key, e);
      (g.UI && g.UI.toast ? g.UI.toast : msg => alert(msg))("Couldn't save — browser storage is full. Remove large images and try again.", "bi-exclamation-triangle-fill");
      return false;
    }
  }
  // Local calendar date (YYYY-MM-DD). toISOString() is UTC and gives the wrong day around midnight in India.
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Shrinks a picked image so it fits comfortably in storage. Returns a data URL.
  function shrinkImage(file, maxSide = 1280, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.type)) return reject(new Error("Unsupported image type"));
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => {
        if (file.type === "image/gif" || file.size < 120 * 1024) return resolve(fr.result);   // keep tiny files + animations
        const img = new Image();
        img.onerror = () => resolve(fr.result);
        img.onload = () => {
          const k = Math.min(1, maxSide / Math.max(img.width, img.height));
          const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL(file.type === "image/png" && file.size < 600 * 1024 ? "image/png" : "image/jpeg", quality));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  g.esc = esc; g.escA = esc; g.safeUrl = safeUrl; g.sanitizeHTML = sanitizeHTML;
  g.isRich = isRich; g.rich = rich; g.stripTags = stripTags;
  g.lsJSON = lsJSON; g.lsSave = lsSave; g.ymd = ymd; g.shrinkImage = shrinkImage;
})(window);
