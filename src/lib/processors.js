export const getBlobject = async (response, instance) => {
    const urlMap = {};
  
    response.results.bindings.forEach(binding => {
      const url = binding.s.value;
      
      if (!urlMap[url]) {
        urlMap[url] = {
          '@id': url,
          title: null,
          description: null,
          octothorpes: []
        };
      }
  
      const current = urlMap[url];
  
      // Set title and description at top level if they exist
      if (binding.title?.value && !current.title) {
        current.title = binding.title.value;
      }
      if (binding.description?.value && !current.description) {
        current.description = binding.description.value;
      }
  
      // Process octothorpe links
      if (binding.o?.value) {
        const targetUrl = binding.o.value;
        const isTerm = binding.type?.value === 'Term';
  
        if (isTerm) {
          // For Terms, only include if starts with instance
          if (targetUrl.startsWith(instance)) {
            // Trim to value after last /
            const termValue = targetUrl.substring(targetUrl.lastIndexOf('/') + 1);
            if (!current.octothorpes.includes(termValue)) {
              current.octothorpes.push(termValue);
            }
          }
        } else {
          // For Pages, determine type
          let pageType = 'link';
          if (binding.blankNodeObj?.value?.startsWith('octo:')) {
            pageType = binding.blankNodeObj.value.substring(5); // Remove 'octo:' prefix
          }
  
          // Check if this target already exists in the array
          const existingIndex = current.octothorpes.findIndex(
            item => typeof item === 'object' && item.target === targetUrl
          );

          // TKTK handle blank nodes, incl terms on triples like hashtagged bookmarks

          if (existingIndex === -1) {
            current.octothorpes.push({
              uri: targetUrl,
              type: pageType
            });
          } else if (pageType !== 'link') {
            // Update existing entry if we have a more specific type
            current.octothorpes[existingIndex].type = pageType;
          }
        }
      }
    });
  
    return Object.values(urlMap);
  }