function extractBlobject(doc, server, pageUrl, customSchema) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const s = server.replace(/\/$/, "");
  const canonical = doc.querySelector('link[rel="canonical"]');
  const id = (canonical == null ? void 0 : canonical.getAttribute("href")) || pageUrl;
  const title = ((_a = doc.querySelector("title")) == null ? void 0 : _a.textContent) || "";
  const description = ((_b = doc.querySelector('meta[name="description"]')) == null ? void 0 : _b.getAttribute("content")) || "";
  const image = ((_c = doc.querySelector('meta[property="og:image"]')) == null ? void 0 : _c.getAttribute("content")) || ((_d = doc.querySelector('link[rel="octo:image"]')) == null ? void 0 : _d.getAttribute("href")) || ((_e = doc.querySelector("[data-octo-image]")) == null ? void 0 : _e.getAttribute("href")) || ((_f = doc.querySelector("[data-octo-image]")) == null ? void 0 : _f.getAttribute("src")) || "";
  const contact = ((_g = doc.querySelector('meta[property="octo:contact"]')) == null ? void 0 : _g.getAttribute("content")) || "";
  const type = ((_h = doc.querySelector('meta[property="octo:type"]')) == null ? void 0 : _h.getAttribute("content")) || "";
  const octothorpes = [];
  const termRegex = new RegExp(`${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/~/([^/]+)`);
  doc.querySelectorAll("octo-thorpe").forEach((el) => {
    const text = el.textContent.trim();
    if (text)
      octothorpes.push(text);
  });
  doc.querySelectorAll('a[rel~="octo:octothorpes"]').forEach((el) => {
    const href = el.getAttribute("href");
    if (!href)
      return;
    const match = href.match(termRegex);
    if (match) {
      octothorpes.push(match[1]);
    } else {
      octothorpes.push({ type: "link", uri: href.replace(/\/+$/, "") });
    }
  });
  doc.querySelectorAll('link[rel="octo:octothorpes"]').forEach((el) => {
    const href = el.getAttribute("href");
    if (!href)
      return;
    const match = href.match(termRegex);
    if (match) {
      octothorpes.push(match[1]);
    }
  });
  doc.querySelectorAll('[rel~="octo:endorses"]').forEach((el) => {
    const href = el.getAttribute("href");
    if (href)
      octothorpes.push({ type: "endorse", uri: href.replace(/\/+$/, "") });
  });
  doc.querySelectorAll('[rel~="octo:bookmarks"]').forEach((el) => {
    const href = el.getAttribute("href");
    if (href)
      octothorpes.push({ type: "bookmark", uri: href.replace(/\/+$/, "") });
  });
  doc.querySelectorAll('[rel~="octo:cites"]').forEach((el) => {
    const href = el.getAttribute("href");
    if (href)
      octothorpes.push({ type: "cite", uri: href.replace(/\/+$/, "") });
  });
  return {
    "@id": id,
    title,
    description,
    image,
    contact,
    type,
    octothorpes
  };
}
(async () => {
  const scriptTag = document.currentScript;
  if (!scriptTag) {
    console.error("[octo-index] Cannot find script tag. Ensure octo-index.js is loaded via a <script> tag, not imported as a module.");
    return;
  }
  const server = scriptTag.getAttribute("data-server");
  if (!server) {
    console.error("[octo-index] data-server attribute is required.");
    return;
  }
  const debug = scriptTag.hasAttribute("data-debug");
  const harmonizerAttr = scriptTag.getAttribute("data-harmonizer");
  let customSchema = null;
  if (harmonizerAttr) {
    try {
      customSchema = JSON.parse(harmonizerAttr);
    } catch (e) {
      console.error("[octo-index] Invalid data-harmonizer JSON:", e.message);
      return;
    }
  }
  const debugEl = debug ? document.createElement("div") : null;
  if (debugEl) {
    debugEl.setAttribute("data-octo-index-debug", "");
    debugEl.style.cssText = "font-family:monospace;font-size:12px;padding:4px 8px;background:#f0f0f0;border:1px solid #ccc;margin:8px 0;";
    debugEl.textContent = "[octo-index] Extracting...";
    document.body.appendChild(debugEl);
  }
  const setStatus = (msg, isError = false) => {
    if (isError) {
      console.error(`[octo-index] ${msg}`);
    } else {
      console.log(`[octo-index] ${msg}`);
    }
    if (debugEl) {
      debugEl.textContent = `[octo-index] ${msg}`;
      if (isError)
        debugEl.style.borderColor = debugEl.style.color = "#d32f2f";
    }
  };
  try {
    const blobject = extractBlobject(document, server, window.location.href, customSchema);
    setStatus(`Extracted ${blobject.octothorpes.length} octothorpe(s). Pushing...`);
    const normalizedServer = server.replace(/\/$/, "");
    const response = await fetch(`${normalizedServer}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uri: blobject["@id"],
        as: "blobject",
        blobject
      })
    });
    if (response.ok) {
      const result = await response.json();
      setStatus(`Indexed successfully (${blobject.octothorpes.length} octothorpe(s))`);
    } else {
      const text = await response.text();
      setStatus(`Server error ${response.status}: ${text}`, true);
    }
  } catch (e) {
    setStatus(`Error: ${e.message}`, true);
  }
})();
//# sourceMappingURL=octo-index.js.map
