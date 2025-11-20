/**
 * MultiPass Conversion Utilities
 * 
 * Converts MultiPass objects to API query parameters and endpoints.
 * Based on the logic from /routes/explore
 */

/**
 * Converts MultiPass to API query parameters
 * @param {Object} multiPass - MultiPass object
 * @returns {Object} Query parameters for octo-store
 */
export function multipassToParams(multiPass) {
  if (!multiPass) return {};
  
  return {
    server: multiPass.meta?.server || 'https://octothorp.es',
    s: multiPass.subjects?.include?.join(',') || '',
    o: multiPass.objects?.include?.join(',') || '',
    nots: multiPass.subjects?.exclude?.join(',') || '',
    noto: multiPass.objects?.exclude?.join(',') || '',
    match: determineMatch(multiPass),
    limit: String(multiPass.filters?.limitResults || 10),
    offset: String(multiPass.filters?.offsetResults || 0),
    when: parseDateRange(multiPass.filters?.dateRange)
  };
}

/**
 * Extracts what/by endpoint from MultiPass
 * @param {Object} multiPass - MultiPass object
 * @returns {Object} { what, by } endpoint parameters
 */
export function extractWhatBy(multiPass) {
  if (!multiPass) return { what: 'pages', by: 'thorped' };
  
  // Determine 'what' from resultMode
  let what = 'pages';
  if (multiPass.meta?.resultMode === 'blobjects') {
    what = 'everything';
  } else if (multiPass.meta?.resultMode === 'octothorpes') {
    what = 'thorpes';
  } else if (multiPass.meta?.resultMode === 'links') {
    what = 'pages';
  }
  
  // Determine 'by' from object type and subtype
  let by = 'thorped';
  
  if (multiPass.objects?.type === 'termsOnly') {
    by = 'thorped';
  } else if (multiPass.filters?.subtype === 'Backlink') {
    by = 'backlinked';
  } else if (multiPass.filters?.subtype === 'Cite') {
    by = 'cited';
  } else if (multiPass.filters?.subtype === 'Bookmark') {
    by = 'bookmarked';
  } else if (multiPass.subjects?.mode === 'byParent') {
    by = 'in-webring';
  } else if (multiPass.objects?.type === 'notTerms') {
    by = 'linked';
  } else if (multiPass.objects?.type === 'none') {
    by = 'posted';
  } else {
    // Default to linked if objects are present
    by = 'linked';
  }
  
  return { what, by };
}

/**
 * Determines match parameter from subject/object modes
 * @param {Object} multiPass - MultiPass object
 * @returns {string} Match mode string
 */
function determineMatch(multiPass) {
  const sMode = multiPass.subjects?.mode || 'auto';
  const oMode = multiPass.objects?.mode || 'auto';
  
  if (sMode === 'fuzzy' && oMode === 'auto') return 'fuzzy-s';
  if (oMode === 'fuzzy' && sMode === 'auto') return 'fuzzy-o';
  if (oMode === 'very-fuzzy') return 'very-fuzzy-o';
  if (sMode === 'fuzzy' || oMode === 'fuzzy') return 'fuzzy';
  
  return ''; // auto/exact
}

/**
 * Converts MultiPass dateRange to 'when' parameter
 * @param {Object} dateRange - MultiPass dateRange object
 * @returns {string} When parameter string
 */
function parseDateRange(dateRange) {
  if (!dateRange) return '';
  
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0];
  };
  
  if (dateRange.after && dateRange.before) {
    return `between-${formatDate(dateRange.after)}-and-${formatDate(dateRange.before)}`;
  } else if (dateRange.after) {
    return `after-${formatDate(dateRange.after)}`;
  } else if (dateRange.before) {
    return `before-${formatDate(dateRange.before)}`;
  }
  
  return '';
}

/**
 * Validates if an object is a properly structured MultiPass
 * @param {*} data - Data to validate
 * @returns {boolean} True if valid MultiPass
 */
export function isValidMultipass(data) {
  if (typeof data !== 'object' || data === null) return false;
  
  // Check required top-level properties
  if (!data.meta || !data.subjects || !data.objects || !data.filters) {
    return false;
  }
  
  // Check meta has required fields
  if (!data.meta.resultMode || !data.meta.version || !data.meta.server) {
    return false;
  }
  
  // Check subjects structure
  if (!Array.isArray(data.subjects.include) || !Array.isArray(data.subjects.exclude)) {
    return false;
  }
  
  // Check objects structure
  if (!Array.isArray(data.objects.include) || !Array.isArray(data.objects.exclude)) {
    return false;
  }
  
  // Check filters
  if (data.filters.limitResults === undefined || data.filters.offsetResults === undefined) {
    return false;
  }
  
  return true;
}

/**
 * Parses MultiPass from various input formats
 * @param {string|Object} input - JSON string or object
 * @returns {Object|null} Parsed MultiPass or null if invalid
 */
export function parseMultipass(input) {
  if (!input) return null;
  
  try {
    let parsed;
    
    // If string, parse as JSON
    if (typeof input === 'string') {
      parsed = JSON.parse(input);
    } else if (typeof input === 'object') {
      parsed = input;
    } else {
      return null;
    }
    
    // Validate structure
    if (!isValidMultipass(parsed)) {
      console.warn('Invalid MultiPass structure:', parsed);
      return null;
    }
    
    return parsed;
  } catch (e) {
    console.error('Failed to parse MultiPass:', e);
    return null;
  }
}
