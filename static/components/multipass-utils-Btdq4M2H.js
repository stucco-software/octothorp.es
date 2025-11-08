function multipassToParams(multiPass) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  if (!multiPass)
    return {};
  return {
    server: ((_a = multiPass.meta) == null ? void 0 : _a.server) || "https://octothorp.es",
    s: ((_c = (_b = multiPass.subjects) == null ? void 0 : _b.include) == null ? void 0 : _c.join(",")) || "",
    o: ((_e = (_d = multiPass.objects) == null ? void 0 : _d.include) == null ? void 0 : _e.join(",")) || "",
    nots: ((_g = (_f = multiPass.subjects) == null ? void 0 : _f.exclude) == null ? void 0 : _g.join(",")) || "",
    noto: ((_i = (_h = multiPass.objects) == null ? void 0 : _h.exclude) == null ? void 0 : _i.join(",")) || "",
    match: determineMatch(multiPass),
    limit: String(((_j = multiPass.filters) == null ? void 0 : _j.limitResults) || 10),
    offset: String(((_k = multiPass.filters) == null ? void 0 : _k.offsetResults) || 0),
    when: parseDateRange((_l = multiPass.filters) == null ? void 0 : _l.dateRange)
  };
}
function extractWhatBy(multiPass) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  if (!multiPass)
    return { what: "pages", by: "thorped" };
  let what = "pages";
  if (((_a = multiPass.meta) == null ? void 0 : _a.resultMode) === "blobjects") {
    what = "everything";
  } else if (((_b = multiPass.meta) == null ? void 0 : _b.resultMode) === "octothorpes") {
    what = "thorpes";
  } else if (((_c = multiPass.meta) == null ? void 0 : _c.resultMode) === "links") {
    what = "pages";
  }
  let by = "thorped";
  if (((_d = multiPass.objects) == null ? void 0 : _d.type) === "termsOnly") {
    by = "thorped";
  } else if (((_e = multiPass.filters) == null ? void 0 : _e.subtype) === "Backlink") {
    by = "backlinked";
  } else if (((_f = multiPass.filters) == null ? void 0 : _f.subtype) === "Cite") {
    by = "cited";
  } else if (((_g = multiPass.filters) == null ? void 0 : _g.subtype) === "Bookmark") {
    by = "bookmarked";
  } else if (((_h = multiPass.subjects) == null ? void 0 : _h.mode) === "byParent") {
    by = "in-webring";
  } else if (((_i = multiPass.objects) == null ? void 0 : _i.type) === "notTerms") {
    by = "linked";
  } else if (((_j = multiPass.objects) == null ? void 0 : _j.type) === "none") {
    by = "posted";
  } else {
    by = "linked";
  }
  return { what, by };
}
function determineMatch(multiPass) {
  var _a, _b;
  const sMode = ((_a = multiPass.subjects) == null ? void 0 : _a.mode) || "auto";
  const oMode = ((_b = multiPass.objects) == null ? void 0 : _b.mode) || "auto";
  if (sMode === "fuzzy" && oMode === "auto")
    return "fuzzy-s";
  if (oMode === "fuzzy" && sMode === "auto")
    return "fuzzy-o";
  if (oMode === "very-fuzzy")
    return "very-fuzzy-o";
  if (sMode === "fuzzy" || oMode === "fuzzy")
    return "fuzzy";
  return "";
}
function parseDateRange(dateRange) {
  if (!dateRange)
    return "";
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toISOString().split("T")[0];
  };
  if (dateRange.after && dateRange.before) {
    return `between-${formatDate(dateRange.after)}-and-${formatDate(dateRange.before)}`;
  } else if (dateRange.after) {
    return `after-${formatDate(dateRange.after)}`;
  } else if (dateRange.before) {
    return `before-${formatDate(dateRange.before)}`;
  }
  return "";
}
function isValidMultipass(data) {
  if (typeof data !== "object" || data === null)
    return false;
  if (!data.meta || !data.subjects || !data.objects || !data.filters) {
    return false;
  }
  if (!data.meta.resultMode || !data.meta.version || !data.meta.server) {
    return false;
  }
  if (!Array.isArray(data.subjects.include) || !Array.isArray(data.subjects.exclude)) {
    return false;
  }
  if (!Array.isArray(data.objects.include) || !Array.isArray(data.objects.exclude)) {
    return false;
  }
  if (data.filters.limitResults === void 0 || data.filters.offsetResults === void 0) {
    return false;
  }
  return true;
}
function parseMultipass(input) {
  if (!input)
    return null;
  try {
    let parsed;
    if (typeof input === "string") {
      parsed = JSON.parse(input);
    } else if (typeof input === "object") {
      parsed = input;
    } else {
      return null;
    }
    if (!isValidMultipass(parsed)) {
      console.warn("Invalid MultiPass structure:", parsed);
      return null;
    }
    return parsed;
  } catch (e) {
    console.error("Failed to parse MultiPass:", e);
    return null;
  }
}
export {
  extractWhatBy as e,
  multipassToParams as m,
  parseMultipass as p
};
//# sourceMappingURL=multipass-utils-Btdq4M2H.js.map
