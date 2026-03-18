// Re-export all utils from octothorpes.
// Client-side Svelte files import from here (extractMultipassFromGif, etc.).
// Other src/lib/ files also depend on this during the transition period.
// After Phase 3 deletes the duplicate src/lib/ files, this can be trimmed
// to only the client-safe functions.
export {
  deslash,
  getUnixDateFromString,
  parseBindings,
  parseDateStrings,
  isSparqlSafe,
  cleanInputs,
  areUrlsFuzzy,
  getFuzzyTags,
  isValidMultipass,
  extractMultipassFromGif,
  injectMultipassIntoGif,
  getWebrings,
  countWebrings,
} from 'octothorpes'
