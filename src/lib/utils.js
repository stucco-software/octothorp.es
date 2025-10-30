import normalizeUrl from "normalize-url";
import { arrayify } from "./arrayify";

/**
 * Removes trailing slashes from URLs
 * @param {string} urlstring - The URL string to process
 * @returns {string} URL without trailing slash, or empty string if invalid input
 */
export const deslash = (urlstring) => {
  if (typeof urlstring !== 'string') return '';
  if (!urlstring) return '';
  return urlstring.replace(/\/$/, '')
}
/**
 * Converts various date formats to Unix timestamps
 * @param {string} datestring - Date string to convert (ISO, YYYY-MM-DD, or Unix timestamp)
 * @returns {number} Unix timestamp (seconds since epoch)
 * @throws {Error} If the date string is invalid
 */
export const getUnixDateFromString = (datestring) => {
  // Utility function for the various places we might want to accept
  // a human readable date but want to send a UNIX date because
  // they're faster in SPARQL queries. Also functions as a format validator

  // Handle Unix timestamp directly
  if (/^\d+$/.test(datestring)) return parseInt(datestring);

  // Try parsing as ISO date first
  let date = new Date(datestring);

  // If that fails, try parsing as YYYY-MM-DD
  if (isNaN(date.getTime())) {
    const [year, month, day] = datestring.split('-').map(Number);
    if (year && month && day) {
      date = new Date(year, month - 1, day);
    }
  }

  // If still invalid, throw error
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${datestring}`);
  }

  return Math.floor(date.getTime() / 1000);
};

////////// Clean up raw db return for simple queries //////////

/**
 * Parses SPARQL bindings into structured objects based on mode
 * @param {Array|Object} bindings - SPARQL query result bindings (array or single binding object)
 * @param {string} [mode="pages"] - Parsing mode: "pages" or "thorpes"/"terms"
 * @returns {Array} Parsed results based on mode
 * @returns {Array} pages mode - Array of objects with role, uri, title, description, date, image
 * @returns {Array} thorpes/terms mode - Array of objects with term and date
 */
export function parseBindings(bindings, mode="pages") {
  let output = {}
  
  // Handle case where bindings might be a single object instead of array
  const bindingArray = Array.isArray(bindings) ? bindings : [bindings];
  
  switch (mode) {
    case "pages":
     // Create a flat list with type property
     const result = [];
     const seenUris = new Set();

     bindingArray.forEach((b) => {
       // Check if s and o exist with values before accessing
       const subjectUri = b.s?.value;
       const objectUri = b.o?.value;

       // Add subject if not already seen and subject exists
       if (subjectUri && !seenUris.has(subjectUri)) {
         seenUris.add(subjectUri);
         result.push({
           role: 'subject',
           uri: subjectUri,
           title: b.title?.value || null,
           description: b.description?.value || null,
           date: parseInt(b.date?.value || null),
           image: b.image?.value || null
         });
       }

       // Add object if not already seen and object exists
       if (objectUri && !seenUris.has(objectUri)) {
         seenUris.add(objectUri);
         result.push({
           role: 'object',
           uri: objectUri,
           title: b.ot?.value || null,
           description: b.od?.value || null,
           // tktk think about object dates more
           image: b.omg?.value || null
         });
       }
     });

     output = result;
      break
    case "thorpes":
    case "terms":
      output = bindingArray.map((b) => {
      return {
        term: b.o?.value ? b.o.value.substring(b.o.value.lastIndexOf('/') + 1) : null,
        date: parseInt(b.date?.value || null)
      };
    });
     break
  }

  return output;
}

////////// Parse Date Inputs //////////
// higher order than getUnixDateFromString
// can take human readable strings and keywords
// and return MultiPass compatible dateRange objects

/**
 * Parses date filter strings into MultiPass-compatible date range objects
 * @param {string} [datestring=""] - Date filter string (recent, after-DATE, before-DATE, between-DATE-and-DATE)
 * @returns {Object} Date filter object with after/before properties
 * @throws {Error} If date format is invalid
 */
export function parseDateStrings(datestring = "") {
  let dateFilter = {};

  // Return empty filter if no date string provided

  if (datestring && datestring.toString() !== "") {
    if (datestring === "recent") {
      const now = Math.floor(Date.now());
      const twoWeeksAgo = now - 1209600000;
      dateFilter.after = twoWeeksAgo;
    } else {
      // Split on first hyphen to separate command from date
      const firstHyphen = datestring.indexOf('-');
      if (firstHyphen === -1) {
        throw new Error('Invalid date filter format. Use: recent, after-DATE, before-DATE, or between-DATE-and-DATE');
      }

      const command = datestring.substring(0, firstHyphen);
      const datePart = datestring.substring(firstHyphen + 1);

      try {
        switch (command) {
          case "after":
            dateFilter.after = getUnixDateFromString(datePart);
            break;
          case "before":
            dateFilter.before = getUnixDateFromString(datePart);
            break;
          case "between": {
            const [start, end] = datePart.split("-and-");
            if (!start || !end) {
              throw new Error("Between filter requires both start and end dates");
            }
            dateFilter.after = getUnixDateFromString(start);
            dateFilter.before = getUnixDateFromString(end);
            break;
          }
          default:
            throw new Error(`Unknown date filter type: ${command}`);
        }
      } catch (error) {
        console.error(`Date parsing failed for "${datestring}":`, error.message);
        throw new Error(`Invalid time filter. Use: recent, after-DATE, before-DATE, or between-DATE-and-DATE`);
      }
    }
  }
  return dateFilter;
}

/**
 * Validates strings for safe use in SPARQL, with optional URL scheme checking
 * @param {string|string[]} inputs - String or array of strings to validate
 * @param {object} options - Configuration
 * @param {number} [options.maxLength=256] - Max string length
 * @param {number} [options.maxInputs=50] - Max strings to validate
 * @param {boolean} [options.checkUrlSchemes=true] - Whether to validate URL schemes
 * @returns {{valid: true}|{valid: false, error: string}}
 */
export const isSparqlSafe = (inputs, options = {}) => {
  const { maxLength = 512, maxInputs = 50, checkUrlSchemes = true } = options;

  // Normalize to array
  const inputArray = Array.isArray(inputs) ? inputs : [inputs];

  // 1. DoS Protection - Limit input size
  if (inputArray.length > maxInputs) {
    return {
      valid: false,
      error: `Exceeded maximum input count (${maxInputs})`,
    };
  }

  for (const input of inputArray) {
    if (typeof input !== "string") {
      return {
        valid: false,
        error: "Input must be a string",
      };
    }

    const trimmed = input.trim();

    // 2. Length Check
    if (trimmed.length > maxLength) {
      return {
        valid: false,
        error: `Input exceeds maximum length (${maxLength})`,
      };
    }

    // 3. SPARQL Injection Protection
    if (/["'<>\\{}]/.test(trimmed)) {
      return {
        valid: false,
        error: 'Input contains dangerous characters (<>"{}\\)',
      };
    }

    // 4. Path Traversal Attack Protection
    if (/\.\.\/|\.\.\\|\/\.\.|\\\.\.|\.\.%2f|%2e%2e%2f|%2e%2e\/|\.\.%5c|%2e%2e%5c/i.test(trimmed)) {
      return {
        valid: false,
        error: "Path traversal attack pattern detected",
      };
    }

    // 5. URL Scheme Check (only if enabled and string looks like a URL)
    if (checkUrlSchemes && /^[a-z]+:/i.test(trimmed)) {
      if (/^(javascript|data|file|ftp):/i.test(trimmed)) {
        return {
          valid: false,
          error: "Dangerous URL scheme detected. Why would you do that?",
        };
      }
    }
  }

  return { valid: true };
};

// utility to check for malicious input and optionally
// normalize urls into either valid urls

/**
 * Cleans and validates input strings for safe use in queries
 * @param {string|Array} imp - Input string or array of strings to clean
 * @param {string} [mod="fuzzy"] - Mode: "fuzzy" for validation only, "exact" for URL normalization
 * @returns {Array} Cleaned and validated array of strings
 * @throws {Error} If input fails SPARQL safety validation
 */
export function cleanInputs(imp, mod = "fuzzy") {
  // skip if none provided
  if (imp === "") {
    return imp;
  } else {
    let output = arrayify(imp);
    const validation1 = isSparqlSafe(output);
    if (!validation1.valid) throw new Error(validation1.error);
    if (mod === "exact") {
      // TKTK this should probably respect http: when set explicitly
      output = imp.map((item) => normalizeUrl(item, { forceHttps: true }));
    }
    return output;
  }
}

// check if they provided inexact URLs
/**
 * Checks if provided URIs are fuzzy (not valid URLs)
 * @param {Array|string} uris - Array of URI strings or single URI string to check
 * @returns {boolean} True if any URI is not a valid URL, false otherwise
 */
export function areUrlsFuzzy(uris) {
  let output = false;
  
  // Handle case where uris might be a single string instead of array
  const uriArray = Array.isArray(uris) ? uris : [uris];
  
  uriArray.forEach((string) => {
    // Skip non-string values
    if (typeof string !== 'string') {
      output = true;
      return;
    }
    
    try {
      new URL(string);
    } catch (_) {
      output = true;
    }
  });
  return output;
}

// Returns common variations of tag when given a tag ie "tag name" becomes:
//  "tagName, tag_name, tag-name, tagname, and #-prefixed versions of each
/**
 * Generates common variations of tags for fuzzy matching
 * @param {string|Array} tags - Tag or array of tags to generate variations for
 * @returns {Array} Array of tag variations including different cases and separators
 */
export const getFuzzyTags = (tags) => {
  // Handle single string input (convert to array)
  if (typeof tags === "string") {
    tags = [tags];
  }

  // Handle empty or invalid input
  if (!Array.isArray(tags)) return [];
  if (tags.length === 0) return [];

  const allVariations = new Set();

  for (const tag of tags) {
    // Skip non-string elements
    if (typeof tag !== "string") continue;

    // Remove # prefix if present and trim
    const cleanTag = tag.startsWith("#") ? tag.slice(1) : tag;
    const trimmedTag = cleanTag.trim();
    if (trimmedTag.length === 0) continue;

    // Convert all separators to spaces first for consistent processing
    const withSpaces = trimmedTag
    // TKTK fix this -- errors when run
      // .replace(/[-_]/g, " ") // Convert hyphens and underscores to spaces
      // .replace(/([a-z])([A-Z])/g, "$1 $2"); // Split camelCase

    // Generate base forms
    const base = withSpaces.toLowerCase().trim();
    const words = base.split(/\s+/).filter(Boolean);
    const singleWord = words.join("");

    // Generate variations for this tag (without #)
    const variations = [
      // Original form (if it was already in some case)
      trimmedTag,
      trimmedTag.toLowerCase(),

      // Space separated
      words.join(" "),

      // Snake case
      words.join("_"),
      words.map((w) => w[0].toUpperCase() + w.slice(1)).join("_"),

      // Kebab case
      words.join("-"),
      words.map((w) => w[0].toUpperCase() + w.slice(1)).join("-"),

      // Camel case variations
      words[0] +
        words
          .slice(1)
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(""),
      words.map((w) => w[0].toUpperCase() + w.slice(1)).join(""),

      // Without any separators
      singleWord,
      singleWord[0].toUpperCase() + singleWord.slice(1),
    ];

    // Add # prefixed versions of all variations
    variations.push(...variations.map((v) => `#${v}`));

    // Add all variations to our master set
    variations.forEach((v) => allVariations.add(v));
  }

  return Array.from(allVariations).filter((v) => v.length > 0);
};

/**
 * Validates if an object is a properly structured MultiPass
 * 
 * A valid MultiPass must have:
 * - meta object with required fields (title, resultMode, version, server)
 * - subjects object with mode and include/exclude arrays
 * - objects object with type, mode, and include/exclude arrays
 * - filters object with limitResults, offsetResults, and optional dateRange/subtype
 * 
 * @param {*} data - Data to validate as MultiPass
 * @returns {{valid: true}|{valid: false, error: string}} Validation result
 * 
 * @example
 * const result = isValidMultipass(myData);
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 */
export function isValidMultipass(data) {
  // Must be an object
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'MultiPass must be a JSON object' };
  }

  // Check meta object
  if (!data.meta || typeof data.meta !== 'object') {
    return { valid: false, error: 'MultiPass must have a "meta" object' };
  }

  const requiredMetaFields = ['title', 'resultMode', 'version', 'server'];
  for (const field of requiredMetaFields) {
    if (!data.meta[field]) {
      return { valid: false, error: `MultiPass meta must have "${field}" field` };
    }
  }

  // Check subjects object
  if (!data.subjects || typeof data.subjects !== 'object') {
    return { valid: false, error: 'MultiPass must have a "subjects" object' };
  }

  if (!data.subjects.mode || typeof data.subjects.mode !== 'string') {
    return { valid: false, error: 'MultiPass subjects must have a "mode" string' };
  }

  if (!Array.isArray(data.subjects.include)) {
    return { valid: false, error: 'MultiPass subjects must have an "include" array' };
  }

  if (!Array.isArray(data.subjects.exclude)) {
    return { valid: false, error: 'MultiPass subjects must have an "exclude" array' };
  }

  // Check objects object
  if (!data.objects || typeof data.objects !== 'object') {
    return { valid: false, error: 'MultiPass must have an "objects" object' };
  }

  if (!data.objects.type || typeof data.objects.type !== 'string') {
    return { valid: false, error: 'MultiPass objects must have a "type" string' };
  }

  if (!data.objects.mode || typeof data.objects.mode !== 'string') {
    return { valid: false, error: 'MultiPass objects must have a "mode" string' };
  }

  if (!Array.isArray(data.objects.include)) {
    return { valid: false, error: 'MultiPass objects must have an "include" array' };
  }

  if (!Array.isArray(data.objects.exclude)) {
    return { valid: false, error: 'MultiPass objects must have an "exclude" array' };
  }

  // Check filters object
  if (!data.filters || typeof data.filters !== 'object') {
    return { valid: false, error: 'MultiPass must have a "filters" object' };
  }

  // limitResults and offsetResults can be strings or numbers
  if (data.filters.limitResults === undefined && data.filters.limitResults !== 0) {
    return { valid: false, error: 'MultiPass filters must have "limitResults"' };
  }

  if (data.filters.offsetResults === undefined && data.filters.offsetResults !== 0) {
    return { valid: false, error: 'MultiPass filters must have "offsetResults"' };
  }

  // dateRange is optional but must be object if present
  if (data.filters.dateRange !== undefined && data.filters.dateRange !== null) {
    if (typeof data.filters.dateRange !== 'object') {
      return { valid: false, error: 'MultiPass filters.dateRange must be an object or null' };
    }
  }

  return { valid: true };
}

/**
 * Extracts MultiPass JSON from a GIF file's comment extension block
 * 
 * GIF files can contain comment blocks (0x21 0xFE) that store arbitrary text.
 * This function searches through all comment blocks looking for valid JSON.
 * 
 * To extend for future MultiPass versions:
 * 1. This function returns the raw parsed JSON - no validation
 * 2. The calling code should handle version detection and field mapping
 * 3. Consider checking multiPass.meta.version to handle different formats
 * 4. New fields will automatically be included in the returned object
 * 
 * @param {ArrayBuffer} arrayBuffer - The GIF file contents as ArrayBuffer
 * @returns {Object} Parsed MultiPass JSON object
 * @throws {Error} If file is not a valid GIF or no valid JSON found in comments
 * 
 * @example
 * const file = event.target.files[0];
 * const reader = new FileReader();
 * reader.onload = (e) => {
 *   const multiPass = extractMultipassFromGif(e.target.result);
 *   // Handle different versions:
 *   if (multiPass.meta?.version === '2') {
 *     // Handle v2 format with new fields
 *   }
 * };
 * reader.readAsArrayBuffer(file);
 */
export function extractMultipassFromGif(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  
  // Verify GIF signature (GIF87a or GIF89a)
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (!signature.startsWith('GIF')) {
    throw new Error('Not a valid GIF file');
  }
  
  // Skip GIF header (6 bytes) + Logical Screen Descriptor (7 bytes)
  let pos = 13;
  
  // Skip Global Color Table if present
  const packed = bytes[10];
  if (packed & 0x80) {
    const colorTableSize = 2 << (packed & 0x07);
    pos += colorTableSize * 3;
  }
  
  // Scan through GIF data blocks looking for comment extensions
  while (pos < bytes.length - 1) {
    // Comment Extension Block identifier: 0x21 (Extension) 0xFE (Comment)
    if (bytes[pos] === 0x21 && bytes[pos + 1] === 0xFE) {
      pos += 2;
      let comment = '';
      
      // Read comment sub-blocks (each has size byte, then data, terminated by 0x00)
      while (pos < bytes.length && bytes[pos] !== 0x00) {
        const blockSize = bytes[pos];
        pos++;
        
        if (pos + blockSize > bytes.length) {
          throw new Error('Malformed GIF: comment block extends beyond file');
        }
        
        comment += String.fromCharCode(...bytes.slice(pos, pos + blockSize));
        pos += blockSize;
      }
      
      // Try to parse comment as JSON
      try {
        const parsed = JSON.parse(comment);
        // Basic sanity check - should be an object
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed;
        }
      } catch (e) {
        // Not valid JSON, keep looking for other comment blocks
      }
    }
    pos++;
  }
  
  throw new Error('No MultiPass JSON found in GIF comment blocks');
}

/**
 * Injects MultiPass JSON into a GIF file's comment extension block
 * 
 * Creates a new GIF file with the MultiPass data embedded in a comment block.
 * This operation is performed entirely client-side - no data is sent to any server.
 * 
 * The function:
 * 1. Validates the GIF structure
 * 2. Serializes the MultiPass object to JSON
 * 3. Splits JSON into 255-byte sub-blocks (GIF spec requirement)
 * 4. Inserts comment extension after the header but before image data
 * 5. Returns a new ArrayBuffer with the modified GIF
 * 
 * @param {ArrayBuffer} arrayBuffer - The original GIF file contents
 * @param {Object} multiPassObject - The MultiPass query object to embed
 * @returns {Uint8Array} New GIF file with embedded MultiPass JSON
 * @throws {Error} If file is not a valid GIF
 * 
 * @example
 * const gifFile = await file.arrayBuffer();
 * const multiPass = { uris: ['https://example.com'], what: 'pages' };
 * const encodedGif = injectMultipassIntoGif(gifFile, multiPass);
 * // Download or use encodedGif
 */
export function injectMultipassIntoGif(arrayBuffer, multiPassObject) {
  const bytes = new Uint8Array(arrayBuffer);
  
  // Verify GIF signature (GIF87a or GIF89a)
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (!signature.startsWith('GIF')) {
    throw new Error('Not a valid GIF file');
  }
  
  // Convert MultiPass to JSON string
  const jsonString = JSON.stringify(multiPassObject);
  const jsonBytes = new TextEncoder().encode(jsonString);
  
  // Build comment extension block
  const commentBlocks = [];
  
  // Extension Introducer + Comment Label
  commentBlocks.push(0x21, 0xFE);
  
  // Split JSON into 255-byte sub-blocks (max size per GIF spec)
  let offset = 0;
  while (offset < jsonBytes.length) {
    const chunkSize = Math.min(255, jsonBytes.length - offset);
    const chunk = jsonBytes.slice(offset, offset + chunkSize);
    
    // Sub-block: size byte + data
    commentBlocks.push(chunkSize);
    commentBlocks.push(...chunk);
    
    offset += chunkSize;
  }
  
  // Block terminator
  commentBlocks.push(0x00);
  
  // Find insertion point (after header + global color table, before image data)
  // Skip GIF header (6 bytes) + Logical Screen Descriptor (7 bytes)
  let insertPos = 13;
  
  // Skip Global Color Table if present
  const packed = bytes[10];
  if (packed & 0x80) {
    const colorTableSize = 2 << (packed & 0x07);
    insertPos += colorTableSize * 3;
  }
  
  // Build new GIF: header + comment block + rest of data
  const result = new Uint8Array(bytes.length + commentBlocks.length);
  
  // Copy header and global color table
  result.set(bytes.slice(0, insertPos), 0);
  
  // Insert comment block
  result.set(commentBlocks, insertPos);
  
  // Copy rest of original GIF
  result.set(bytes.slice(insertPos), insertPos + commentBlocks.length);
  
  return result;
}
