/**
 * Converts SPARQL query response into a structured blobject format
 * @async
 * @param {Object} response - The SPARQL query response object
 * @param {Object} [filters={}] - Filter options for processing results
 * @param {number} [filters.limitResults=100] - Maximum number of results to return
 * @param {number} [filters.offsetResults=0] - Number of results to skip
 * @param {Object|null} [filters.dateRange=null] - Date range filter object
 * @param {number} [filters.dateRange.after] - Unix timestamp for earliest date
 * @param {number} [filters.dateRange.before] - Unix timestamp for latest date
 * @returns {Promise<Array>} Array of processed blobjects with metadata
 */
export const getBlobjectFromResponse = async (response, filters = { limitResults: 100, offsetResults: 0, dateRange: null }) => {
  const limit = filters.limitResults
  const offset = filters.offsetResults

  const urlMap = {};

  response.results.bindings.forEach(binding => {
    const url = binding.s.value;

    if (!urlMap[url]) {
      urlMap[url] = {
        '@id': url,
        title: null,
        description: null,
        image: null,
        date: null,
        postDate: null,
        octothorpes: []
      };
    }

    const current = urlMap[url];

    if (binding.title?.value && !current.title) {
      current.title = binding.title.value;
    }
    if (binding.description?.value && !current.description) {
      current.description = binding.description.value;
    }
    if (binding.image?.value && !current.image) {
      current.image = binding.image.value;
    }
    if (binding.date?.value && !current.date) {
      current.date = parseInt(binding.date.value);
    }
    if (binding.postDate?.value && !current.postDate) {
      current.postDate = parseInt(binding.postDate.value);
    }
    // Process octothorpe links
    if (binding.o?.value) {
      const targetUrl = binding.o.value;
      let oType = "";
      if (binding.oType?.value) {
        oType = binding.oType.value
      }
      // deal with Terms
      if (oType.startsWith('octo:')) {
        oType = oType.substring(5); // Remove 'octo:' prefix
      }
      if (oType === "Term") {
        // For Terms, only include if starts with instance
        // Trim to value after last /
        const termValue = targetUrl.substring(targetUrl.lastIndexOf('~/') + 2);
        if (!current.octothorpes.includes(termValue)) {
          current.octothorpes.push(termValue);
        }
      }
      else {
        // For Pages, determine type
        // blank nodes are only set when there is a more specific object type
        // so if they have a value we use that
        oType = "link"
        if (binding.blankNodeObj?.value?.startsWith('octo:')) {
          oType = binding.blankNodeObj.value.substring(5); // Remove 'octo:' prefix
        }

        // Check if this target already exists in the array
        const existingIndex = current.octothorpes.findIndex(
          item => typeof item === 'object' && (item.target === targetUrl || item.uri === targetUrl)
        );

        // Check if this blank node has associated terms (terms on relationships)
        let relationTerm = null
        if (binding.blankNodeObj?.value?.includes('/~/')) {
          const termValue = binding.blankNodeObj.value.substring(
            binding.blankNodeObj.value.lastIndexOf('~/') + 2
          )
          relationTerm = termValue
        }

        if (existingIndex === -1) {
          const newEntry = {
            uri: targetUrl,
            type: oType
          }
          if (relationTerm) {
            newEntry.terms = [relationTerm]
          }
          current.octothorpes.push(newEntry);
        } else {
          if (oType !== 'link') {
            current.octothorpes[existingIndex].type = oType;
          }
          if (relationTerm) {
            if (!current.octothorpes[existingIndex].terms) {
              current.octothorpes[existingIndex].terms = []
            }
            if (!current.octothorpes[existingIndex].terms.includes(relationTerm)) {
              current.octothorpes[existingIndex].terms.push(relationTerm)
            }
          }
        }
      }
    }
  });

  // Filter by date range if specified
  // Use postDate when available, falling back to date (matches SPARQL ORDER BY behavior)
  let filteredMap = urlMap;
  if (filters.dateRange) {
    const { after, before } = filters.dateRange;
    filteredMap = Object.fromEntries(
      Object.entries(urlMap).filter(([_, item]) => {
        const effectiveDate = item.postDate || item.date;
        if (!effectiveDate) return false;
        if (after && effectiveDate < after) return false;
        if (before && effectiveDate > before) return false;
        return true;
      })
    );
  }

  const output = limit === 0 ? filteredMap : Object.fromEntries(Object.entries(filteredMap).slice(offset, limit));

  return Object.values(output);
}
