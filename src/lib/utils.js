
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

  export const getFuzzyTags = (tag) => {
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
