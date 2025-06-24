<script>
  let actualResults = null;
  let multiPass = null;
  let error = null;
  let queryUrl = '';
  let uploadedSvg = '';
  let decodeMethod = ''; // Track how the query was decoded

  // Code 128B patterns (bar/space widths)
  const CODE128B_PATTERNS = [
    "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
    "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
    "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
    "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
    "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
    "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
    "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
    "114131","311141","411131","211412","211214","211232","2331112"
  ];

  // Map ASCII 32-127 to Code 128B values
  function code128BValue(char) {
    return char.charCodeAt(0) - 32;
  }

  function code128BEncode(str) {
    // Start code B = 104
    let codes = [104];
    for (let i = 0; i < str.length; i++) {
      codes.push(code128BValue(str[i]));
    }
    // Checksum
    let checksum = 104;
    for (let i = 0; i < str.length; i++) {
      checksum += code128BValue(str[i]) * (i + 1);
    }
    codes.push(checksum % 103);
    codes.push(106); // Stop code

    // Convert codes to bar/space patterns
    let x = 0;
    let svg = `<g>`;
    let barHeight = 32;
    let barY = 0;
    for (let code of codes) {
      let pattern = CODE128B_PATTERNS[code];
      for (let i = 0; i < pattern.length; i++) {
        let w = parseInt(pattern[i], 10);
        if (i % 2 === 0) {
          // Bar
          svg += `<rect x="${x}" y="${barY}" width="${w}" height="${barHeight}" fill="#000"/>`;
        }
        x += w;
      }
    }
    svg += `</g>`;
    return { svg, width: x };
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleDrop(e) {
    e.preventDefault();
    
    // Clear previous state
    error = null;
    actualResults = null;
    queryUrl = '';
    uploadedSvg = '';
    decodeMethod = '';
    
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (re) => {
        const svgText = re.target.result;
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
        const svgElement = svgDoc.documentElement;
        
        let jsonData = null;
        
        // First try to get data from data-multipass attribute
        if (svgElement && svgElement.hasAttribute('data-multipass')) {
          try {
            const jsonString = svgElement.getAttribute('data-multipass');
            jsonData = JSON.parse(jsonString);
            decodeMethod = 'data-attribute';
          } catch (err) {
            console.error('Failed to parse data-multipass attribute:', err);
          }
        }
        
        // If no data attribute, try to decode barcode
        if (!jsonData) {
          try {
            jsonData = decodeBarcodeFromSvg(svgDoc);
            decodeMethod = 'barcode';
          } catch (err) {
            console.error('Failed to decode barcode:', err);
          }
        }
        
        if (jsonData) {
          uploadedSvg = svgText;
          runQuery(jsonData);
        } else {
          error = 'No query data found in the dropped SVG (neither data attribute nor barcode).';
        }
      };
      reader.onerror = () => {
        error = 'Failed to read the dropped file.';
      };
      reader.readAsText(file);
    } else if (file && file.type === 'image/gif') {
      // GIF barcode decode logic
      const reader = new FileReader();
      reader.onload = (re) => {
        const url = re.target.result;
        const img = new window.Image();
        img.src = url;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          try {
            const jsonData = decodeBarcodeFromCanvas(canvas);
            decodeMethod = 'barcode-gif';
            uploadedSvg = '';
            runQuery(jsonData);
          } catch (err) {
            error = 'Failed to decode barcode from GIF: ' + err.message;
          }
        };
        img.onerror = () => {
          error = 'Failed to load GIF image.';
        };
      };
      reader.onerror = () => {
        error = 'Failed to read the dropped GIF file.';
      };
      reader.readAsDataURL(file);
    } else {
      error = 'Please drop a valid SVG or GIF file created by the query builder.';
    }
  }

  function decodeBarcodeFromSvg(svgDoc) {
    // Look for barcode elements (rects that form the barcode)
    const rects = svgDoc.querySelectorAll('rect[fill="#000"]');
    if (rects.length === 0) {
      throw new Error('No barcode found in SVG');
    }
    
    // Sort rects by x position to get the barcode sequence
    const sortedRects = Array.from(rects).sort((a, b) => {
      return parseFloat(a.getAttribute('x')) - parseFloat(b.getAttribute('x'));
    });
    
    // Extract bar widths and positions
    let bars = [];
    let currentX = 0;
    
    for (let rect of sortedRects) {
      const x = parseFloat(rect.getAttribute('x'));
      const width = parseFloat(rect.getAttribute('width'));
      
      // Add space before this bar if there's a gap
      if (x > currentX) {
        bars.push({ type: 'space', width: x - currentX });
      }
      
      // Add the bar
      bars.push({ type: 'bar', width: width });
      currentX = x + width;
    }
    
    // Decode the barcode pattern
    const decodedString = decodeCode128B(bars);
    if (!decodedString) {
      throw new Error('Failed to decode barcode pattern');
    }
    
    // Try to decode base64 and parse JSON
    try {
      const jsonString = atob(decodedString);
      return JSON.parse(jsonString);
    } catch (err) {
      throw new Error('Failed to decode base64 or parse JSON from barcode');
    }
  }

  function decodeCode128B(bars) {
    // Find the start code B (104) and stop code (106)
    let codes = [];
    let currentPattern = '';
    let moduleWidth = 1; // Assume 1 unit = 1 module for now
    
    // Convert bars to pattern string
    for (let bar of bars) {
      const modules = Math.round(bar.width / moduleWidth);
      currentPattern += modules.toString();
    }
    
    // Find start code (104) - pattern "211214"
    const startIndex = currentPattern.indexOf('211214');
    if (startIndex === -1) {
      return null;
    }
    
    // Find stop code (106) - pattern "2331112"
    const stopIndex = currentPattern.indexOf('2331112', startIndex);
    if (stopIndex === -1) {
      return null;
    }
    
    // Extract the data portion (between start and stop)
    const dataPattern = currentPattern.substring(startIndex + 6, stopIndex);
    
    // Decode the pattern to codes
    let i = 0;
    while (i < dataPattern.length) {
      // Each code is 6 digits
      if (i + 6 <= dataPattern.length) {
        const codePattern = dataPattern.substring(i, i + 6);
        const code = CODE128B_PATTERNS.indexOf(codePattern);
        if (code !== -1) {
          codes.push(code);
        }
        i += 6;
      } else {
        break;
      }
    }
    
    // Remove checksum (second to last code)
    if (codes.length >= 2) {
      codes = codes.slice(0, -2);
    }
    
    // Convert codes to characters (skip start code)
    let result = '';
    for (let i = 1; i < codes.length; i++) {
      const charCode = codes[i] + 32;
      if (charCode >= 32 && charCode <= 127) {
        result += String.fromCharCode(charCode);
      }
    }
    
    return result;
  }

  function decodeBarcodeFromCanvas(canvas) {
    // Scan a horizontal line in the barcode area (bottom of the image)
    const ctx = canvas.getContext('2d');
    const y = canvas.height - 20; // Scan 20px from the bottom
    const imageData = ctx.getImageData(0, y, canvas.width, 1);
    const data = imageData.data;
    // Threshold to black/white
    let bars = [];
    let current = null;
    let width = 0;
    for (let x = 0; x < canvas.width; x++) {
      const i = x * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      const isBlack = (r + g + b) < 384; // crude threshold
      if (current === null) {
        current = isBlack;
        width = 1;
      } else if (isBlack === current) {
        width++;
      } else {
        bars.push({ type: current ? 'bar' : 'space', width });
        current = isBlack;
        width = 1;
      }
    }
    if (width > 0) {
      bars.push({ type: current ? 'bar' : 'space', width });
    }
    // Decode using the same logic as SVG
    const decodedString = decodeCode128B(bars);
    if (!decodedString) {
      throw new Error('Failed to decode barcode pattern');
    }
    try {
      const jsonString = atob(decodedString);
      return JSON.parse(jsonString);
    } catch (err) {
      throw new Error('Failed to decode base64 or parse JSON from barcode');
    }
  }

  async function runQuery(multiPassData) {
    error = null;
    actualResults = null;
    queryUrl = '';

    const params = new URLSearchParams();
    
    if (multiPassData.subjects.include.length > 0) {
      params.set('s', multiPassData.subjects.include.join(','));
    }
    if (multiPassData.objects.include.length > 0) {
      params.set('o', multiPassData.objects.include.join(','));
    }
    if (multiPassData.subjects.exclude.length > 0) {
      params.set('not-s', multiPassData.subjects.exclude.join(','));
    }
    if (multiPassData.objects.exclude.length > 0) {
      params.set('not-o', multiPassData.objects.exclude.join(','));
    }
    
    if (multiPassData.filters.limitResults) {
      params.set('limit', multiPassData.filters.limitResults);
    }
    if (multiPassData.filters.offsetResults) {
      params.set('offset', multiPassData.filters.offsetResults);
    }
    if (multiPassData.meta.match && multiPassData.meta.match !== 'unset') {
      params.set('match', multiPassData.meta.match);
    }
    
    if (multiPassData.filters.dateRange) {
      const { after, before } = multiPassData.filters.dateRange;
      let whenParts = [];
      if (after) whenParts.push(`after:${new Date(after * 1000).toISOString().split('T')[0]}`);
      if (before) whenParts.push(`before:${new Date(before * 1000).toISOString().split('T')[0]}`);
      if (whenParts.length > 0) params.set('when', whenParts.join(','));
    }

    queryUrl = `/get/${multiPassData.meta.what}/${multiPassData.meta.by}?${decodeURIComponent(params.toString())}`;

    try {
      const response = await fetch(queryUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      actualResults = data.actualResults;
      multiPass = data.multiPass;
    } catch (e) {
      error = e.message;
    }
  }
</script>

<svelte:head>
  <title>Swipe MultiPass</title>
</svelte:head>

<div class="container">
  <h1>Swipe MultiPass</h1>
  <p class="description">Drop a MultiPass SVG here to quickly run the query</p>
  
  <div class="svg-display-area">
    {#if uploadedSvg}
      <div class="uploaded-svg">
        {@html uploadedSvg}
      </div>
    {:else}
      <div 
        class="drop-zone"
        on:dragover={handleDragOver}
        on:drop={handleDrop}
      >
        <div class="drop-content">
          <div class="drop-icon">📄</div>
          <p>Drop a MultiPass SVG file here</p>
          <p class="drop-hint">The query will run automatically</p>
        </div>
      </div>
    {/if}
  </div>

  {#if queryUrl}
    <div class="query-info">
      <p><strong>Query URL:</strong> <a href={queryUrl} target="_blank">{queryUrl}</a></p>
      {#if decodeMethod}
        <p><strong>Decoded from:</strong> <span class="decode-method">{decodeMethod === 'data-attribute' ? 'Data Attribute' : decodeMethod === 'barcode' ? 'Barcode' : 'Barcode (GIF)'}</span></p>
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="error-message">
      <pre class="error">{error}</pre>
    </div>
  {/if}

  {#if actualResults}
    <h2>Results</h2>
    <div class="results-container">
      {#each actualResults as result}
        <div class="card">
          {#if result['@id']} <!-- Blobject rendering -->
            <h4><a href={result['@id']} target="_blank" rel="noopener noreferrer">{result.title || result['@id']}</a></h4>
            {#if result.description}
              <p>{result.description}</p>
            {/if}
            {#if result.image}
              <img src={result.image} alt="Preview" class="preview-image"/>
            {/if}
            {#if result.date}
              <p><small>Date: {new Date(result.date * 1000).toLocaleString()}</small></p>
            {/if}
            {#if result.octothorpes && result.octothorpes.length > 0}
              <div class="tags">
                {#each result.octothorpes as ot}
                  {#if typeof ot === 'string'}
                    <span class="tag">{ot}</span>
                  {:else if ot.uri}
                    <span class="tag {ot.type}"><a href={ot.uri} target="_blank">{ot.uri.split('/').pop()} ({ot.type})</a></span>
                  {/if}
                {/each}
              </div>
            {/if}
          {:else} <!-- Raw binding rendering -->
            <div class="raw-bindings">
                {#each Object.entries(result) as [key, value]}
                    {#if value.value}
                        <p><strong>{key}:</strong> {value.value}</p>
                    {/if}
                {/each}
            </div>
          {/if}
        </div>
      {:else}
        <p>No results found for this query.</p>
      {/each}
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  h1 {
    text-align: center;
    margin-bottom: 0.5rem;
  }

  .description {
    text-align: center;
    color: #666;
    margin-bottom: 2rem;
  }

  .svg-display-area {
    display: flex;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .drop-zone {
    border: 3px dashed #ccc;
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
    background: #fafafa;
    transition: all 0.3s ease;
    width: 320px;
    height: 170px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .drop-zone:hover {
    border-color: #007bff;
    background: #f0f8ff;
  }

  .drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .drop-icon {
    font-size: 2rem;
    opacity: 0.7;
  }

  .drop-zone p {
    margin: 0;
    font-size: 0.9rem;
    color: #333;
  }

  .drop-hint {
    font-size: 0.7rem !important;
    color: #666 !important;
  }

  .uploaded-svg {
    display: flex;
    justify-content: center;
  }

  .uploaded-svg :global(svg) {
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  .query-info {
    background: #e3f2fd;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 2rem;
  }

  .query-info a {
    color: #1976d2;
    text-decoration: none;
  }

  .query-info a:hover {
    text-decoration: underline;
  }

  .decode-method {
    background: #4caf50;
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: bold;
  }

  .error-message {
    margin-bottom: 2rem;
  }

  .error {
    background: #ffebee;
    color: #c62828;
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid #ffcdd2;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .results-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    background: #fff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .card h4 {
    margin: 0;
    font-size: 1.1rem;
  }

  .card a {
    text-decoration: none;
    color: #007bff;
  }

  .card a:hover {
    text-decoration: underline;
  }

  .preview-image {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tag {
    background-color: #e9ecef;
    padding: 0.25rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.8rem;
  }

  .raw-bindings p {
    margin: 0.25rem 0;
    font-size: 0.9rem;
  }
</style> 