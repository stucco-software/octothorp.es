import normalizeUrl from "normalize-url";
import { arrayify } from "./arrayify";
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

export function parseBindings(bindings) {
  let output = bindings.map((b) => {
    return {
      uri: b.s.value,
      title: b.title ? b.title.value : null,
      description: b.description ? b.description.value : null,
      date: parseInt(b.date ? b.date.value : null),
      image: b.image ? b.image.value : null,
    };
  });
  // deduplicate output
  output = output.filter((item, index, self) =>
    index === self.findIndex((t) => t.uri === item.uri)
  );
  return output;
}

////////// Parse Date Inputs //////////
// higher order than getUnixDateFromString
// can take human readable strings and keywords
// and return MultiPass compatible dateRange objects

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

    // 4. URL Scheme Check (only if enabled and string looks like a URL)
    if (checkUrlSchemes && /^[a-z]+:/i.test(trimmed)) {
      if (/^(javascript|data|file|ftp):/i.test(trimmed)) {
        return {
          valid: false,
          error: "Dangerous URL scheme detected",
        };
      }
    }
  }

  return { valid: true };
};

// utility to check for malicious input and optionally
// normalize urls into either valid urls

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
export function areUrlsFuzzy(uris) {
  let output = false;
  uris.forEach((string) => {
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
