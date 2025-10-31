/**
 * Cosmographify - Convert OP data to Cosmograph CSV format
 * 
 * Transforms Octothorpes Protocol blobjects and results into CSV format
 * suitable for visualization at https://cosmograph.app/run/
 */

// Filters for cosmograph export
const EXCLUDED_SOURCES = ['https://docs.octothorp.es/pitch'];
const EXCLUDED_TARGETS = ['https://octothorp.es/~'];

/**
 * Converts OP results to Cosmograph-compatible graph data
 * @param {Array} results - Array of result objects (blobjects or parsed bindings)
 * @param {string} resultType - Type of results: 'blobjects' or 'parsed'
 * @returns {Object} Object with nodes Map and edges Array
 */
export function resultsToGraph(results, resultType = 'blobjects') {
  const nodes = new Map();
  const edges = [];

  if (resultType === 'blobjects') {
    // Process blobjects (from /everything endpoint)
    for (const item of results) {
      const source = item['@id'];
      if (!source) continue;
      
      // Filter out excluded sources
      if (EXCLUDED_SOURCES.includes(source)) continue;
      
      // Add source node
      if (!nodes.has(source)) {
        nodes.set(source, {
          id: source,
          title: (item.title || '').replace(/"/g, '""'),
          type: 'page',
          date: item.date || ''
        });
      }
      
      // Process octothorpes
      const octothorpes = item.octothorpes || [];
      for (const o of octothorpes) {
        let target;
        let targetType;
        
        if (typeof o === 'string') {
          // It's a term
          target = `https://octothorp.es/~/` + o;
          targetType = 'term';
        } else if (o.uri) {
          // It's a page link
          target = o.uri;
          targetType = 'page';
        }
        
        if (target) {
          // Filter out excluded targets
          if (EXCLUDED_TARGETS.includes(target)) continue;
          
          edges.push({ source, target });
          
          if (!nodes.has(target)) {
            nodes.set(target, {
              id: target,
              title: targetType === 'term' ? (typeof o === 'string' ? o : target.split('/~/')[1]) : (o.title || ''),
              type: targetType,
              date: ''
            });
          }
        }
      }
    }
  } else {
    // Process parsed results (from /pages, /links, etc.)
    for (const item of results) {
      const source = item.uri;
      if (!source) continue;
      
      // Filter out excluded sources
      if (EXCLUDED_SOURCES.includes(source)) continue;
      
      if (!nodes.has(source)) {
        nodes.set(source, {
          id: source,
          title: (item.title || '').replace(/"/g, '""'),
          type: 'page',
          date: item.date || ''
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Converts graph data to CSV string
 * @param {Map} nodes - Map of node data
 * @param {Array} edges - Array of edge objects
 * @param {string} format - 'edges' or 'nodes'
 * @returns {string} CSV string
 */
export function graphToCSV(nodes, edges, format = 'edges') {
  if (format === 'nodes') {
    return [
      'id,title,type,date',
      ...Array.from(nodes.values()).map(n => 
        `"${n.id}","${n.title}","${n.type}","${n.date}"`
      )
    ].join('\n');
  } else {
    return [
      'source,target',
      ...edges.map(e => `"${e.source}","${e.target}"`)
    ].join('\n');
  }
}

/**
 * Main export function - converts results to Cosmograph CSV
 * @param {Array} results - OP results array
 * @param {string} resultType - Type of results: 'blobjects' or 'parsed'
 * @param {string} format - Output format: 'edges' or 'nodes'
 * @returns {Object} Object with csv string and counts
 */
export function cosmographify(results, resultType = 'blobjects', format = 'edges') {
  const { nodes, edges } = resultsToGraph(results, resultType);
  const csv = graphToCSV(nodes, edges, format);
  
  return {
    csv,
    edgesCount: edges.length,
    nodesCount: nodes.size
  };
}

// Vitest tests
if (import.meta.vitest) {
  const { it, expect, describe } = import.meta.vitest;
  
  describe('resultsToGraph', () => {
    it('converts blobjects to graph data', () => {
      const blobjects = [
        {
          '@id': 'https://example.com/page',
          title: 'Test Page',
          date: '1234567890',
          octothorpes: ['demo', { uri: 'https://other.com/page', type: 'link' }]
        }
      ];
      
      const { nodes, edges } = resultsToGraph(blobjects, 'blobjects');
      expect(nodes.size).toBe(3); // page + term + linked page
      expect(edges.length).toBe(2);
    });
    
    it('filters out excluded sources', () => {
      const blobjects = [
        {
          '@id': 'https://docs.octothorp.es/pitch',
          octothorpes: ['demo']
        }
      ];
      
      const { nodes, edges } = resultsToGraph(blobjects, 'blobjects');
      expect(edges.length).toBe(0);
    });
    
    it('filters out excluded targets', () => {
      const blobjects = [
        {
          '@id': 'https://example.com/page',
          octothorpes: [{ uri: 'https://octothorp.es/~', type: 'link' }]
        }
      ];
      
      const { nodes, edges } = resultsToGraph(blobjects, 'blobjects');
      expect(edges.length).toBe(0);
    });
  });
  
  describe('graphToCSV', () => {
    it('generates edges CSV', () => {
      const nodes = new Map();
      const edges = [
        { source: 'https://a.com', target: 'https://b.com' }
      ];
      
      const csv = graphToCSV(nodes, edges, 'edges');
      expect(csv).toContain('source,target');
      expect(csv).toContain('https://a.com');
    });
    
    it('generates nodes CSV', () => {
      const nodes = new Map([
        ['https://a.com', { id: 'https://a.com', title: 'Test', type: 'page', date: '123' }]
      ]);
      const edges = [];
      
      const csv = graphToCSV(nodes, edges, 'nodes');
      expect(csv).toContain('id,title,type,date');
      expect(csv).toContain('Test');
    });
  });
  
  describe('cosmographify', () => {
    it('returns csv and counts', () => {
      const blobjects = [
        {
          '@id': 'https://example.com/page',
          octothorpes: ['demo']
        }
      ];
      
      const result = cosmographify(blobjects, 'blobjects', 'edges');
      expect(result).toHaveProperty('csv');
      expect(result).toHaveProperty('edgesCount');
      expect(result).toHaveProperty('nodesCount');
    });
  });
}
