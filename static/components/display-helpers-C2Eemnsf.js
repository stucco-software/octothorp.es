function getTitle(item) {
  return item.title || item["@id"] || item.uri || item.term || "Untitled";
}
function getUrl(item) {
  return item["@id"] || item.uri || "#";
}
function formatDate(timestamp) {
  if (!timestamp)
    return "";
  const date = new Date(parseInt(timestamp));
  return date.toLocaleDateString();
}
export {
  getUrl as a,
  formatDate as f,
  getTitle as g
};
//# sourceMappingURL=display-helpers-C2Eemnsf.js.map
