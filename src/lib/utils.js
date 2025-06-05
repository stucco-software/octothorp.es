import normalizeUrl from 'normalize-url';

  export const getUnixDateFromString = (datestring) => { 
  // Utility function for the various places we might want to accept
  // a human readable date but want to send a UNIX date because 
  // they're faster in SPARQL queries. Also functions as a format validator


    if (/^\d+$/.test(datestring)) return parseInt(datestring);
    
    const date = new Date(datestring);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${datestring}`);
    }
    return Math.floor(date.getTime() / 1000);
  }

  // utility to check for malicious input and optionally
  // normalize urls into either valid urls

    export function cleanInputs (imp, mod = "fuzzy") {
      // defaults
        let s = ["?s"]
        let o = ["?o"]
        // skip if none provided
        if (imp === s || imp === o ) {
          return imp
        }
        else {
          let output = imp
          if (mod === "exact") {
            // this should probably respect http: when set explicitly
            output = imp.map((item) => normalizeUrl(item, {forceHttps: true}))
          }
          //TKTK RUN A REAL SECURITY CHECK <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
          for (const i of imp) {
            if (i === "obviouslyMalicious") {
              console.log ("DO NO PASS")
            }
          }
          return output
        }
      }

        // check if they provided inexact URLs
      export function areUrlsFuzzy (uris) { 
        let output = false 
          uris.forEach((string) => {
            try {
              new URL(string);
            } catch (_) {
                output = true
            }
          })
          return output
      }

    // Returns common variations of tag when given a tag ie "tag name" becomes:
    //  "tagName, tag_name, tag-name, tagname, and #-prefixed versions of each
    export const getFuzzyTags = (tags) => {
      // Handle single string input (convert to array)
    if (typeof tags === 'string') {
      tags = [tags];
    }
    
    // Handle empty or invalid input
    if (!Array.isArray(tags)) return [];
    if (tags.length === 0) return [];

    const allVariations = new Set();

    for (const tag of tags) {
      // Skip non-string elements
      if (typeof tag !== 'string') continue;
      
      // Remove # prefix if present and trim
      const cleanTag = tag.startsWith('#') ? tag.slice(1) : tag;
      const trimmedTag = cleanTag.trim();
      if (trimmedTag.length === 0) continue;
      
      // Convert all separators to spaces first for consistent processing
      const withSpaces = trimmedTag
          .replace(/[-_]/g, ' ')  // Convert hyphens and underscores to spaces
          .replace(/([a-z])([A-Z])/g, '$1 $2');  // Split camelCase
      
      // Generate base forms
      const base = withSpaces.toLowerCase().trim();
      const words = base.split(/\s+/).filter(Boolean);
      const singleWord = words.join('');
      
      // Generate variations for this tag (without #)
      const variations = [
        // Original form (if it was already in some case)
        trimmedTag,
        trimmedTag.toLowerCase(),
        
        // Space separated
        words.join(' '),
        
        // Snake case
        words.join('_'),
        words.map(w => w[0].toUpperCase() + w.slice(1)).join('_'),
        
        // Kebab case
        words.join('-'),
        words.map(w => w[0].toUpperCase() + w.slice(1)).join('-'),
        
        // Camel case variations
        words[0] + words.slice(1).map(w => w[0].toUpperCase() + w.slice(1)).join(''),
        words.map(w => w[0].toUpperCase() + w.slice(1)).join(''),
        
        // Without any separators
        singleWord,
        singleWord[0].toUpperCase() + singleWord.slice(1)
      ];

      // Add # prefixed versions of all variations
      variations.push(...variations.map(v => `#${v}`));

      // Add all variations to our master set
      variations.forEach(v => allVariations.add(v));
    }

    return Array.from(allVariations).filter(v => v.length > 0);
  }

  ////////// Parse Date Inputs //////////

  export function parseDateStrings(datestring="default") {

    let dateFilter = {};
    
        if (datestring != "")  {
          if (datestring === 'recent') {
            const now = Math.floor(Date.now() / 1000);
            const twoWeeksAgo = now - (14 * 24 * 60 * 60);
            dateFilter["after"] = twoWeeksAgo
          }
          else {
          const [command, ...dateParts] = datestring.split('-');
              const newdatestring = dateParts.join('-');
    
              try {
                switch (command) {
                  case 'after':
                    dateFilter.after = getUnixDateFromString(newdatestring);
                    break;
                  case 'before':
                    dateFilter.before = getUnixDateFromString(newdatestring);
                    break;
                  case 'between': {
                    const [start, end] = newdatestring.split('-and-');
                    if (!start || !end) {
                      throw new Error('Between filter requires both start and end dates');
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
        return dateFilter
  }