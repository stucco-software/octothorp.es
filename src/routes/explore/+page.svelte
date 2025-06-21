<script>
  import TokenInput from '$lib/components/TokenInput.svelte';

  let what = 'everything';
  let by = 'all';
  let s = '';
  let o = '';
  let notS = '';
  let notO = '';
  let sTokens = [];
  let oTokens = [];
  let notSTokens = [];
  let notOTokens = [];

  $: s = sTokens.join(',');
  $: o = oTokens.join(',');
  $: notS = notSTokens.join(',');
  $: notO = notOTokens.join(',');

  let match = 'unset';
  let limit = 10;
  let offset = 0;
  let whenAfter = '';
  let whenBefore = '';
  let posterImage = null;
  let posterImageFile = null;
  let svgTitle = '';

  let actualResults = null;
  let multiPass = null;
  let error = null;
  let queryUrl = '';
  let downloadUrl = '';
  let svgForDisplay = '';

  async function handleSubmit() {
    error = null;
    actualResults = null;
    multiPass = null;
    downloadUrl = '';
    svgForDisplay = '';
    
    const params = new URLSearchParams();
    if (s) params.set('s', s);
    if (o) params.set('o', o);
    if (notS) params.set('not-s', notS);
    if (notO) params.set('not-o', notO);
    if (limit) params.set('limit', limit);
    if (offset) params.set('offset', offset);
    if (match !== 'unset') params.set('match', match);
    
    let whenParts = [];
    if (whenAfter) whenParts.push(`after:${whenAfter}`);
    if (whenBefore) whenParts.push(`before:${whenBefore}`);
    if (whenParts.length > 0) params.set('when', whenParts.join(','));

    queryUrl = `/get/${what}/${by}?${decodeURIComponent(params.toString())}`;

    try {
      const response = await fetch(queryUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      actualResults = data.actualResults;
      multiPass = data.multiPass;
      if (multiPass) {
        await createDownloadableSvg(multiPass, posterImageFile, svgTitle);
      }
    } catch (e) {
      error = e.message;
    }
  }

  function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      posterImageFile = file;
      posterImage = URL.createObjectURL(file);
    }
  }

  async function createDownloadableSvg(jsonData, imageFile, title) {
    const jsonString = JSON.stringify(jsonData);
    const safeJsonString = jsonString.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

    let imageElement = '<rect width="100%" height="100%" fill="#f0f0f0" stroke="#ccc" stroke-width="1"/>';
    let titleText = '';

    if (imageFile) {
      try {
        // Process the uploaded image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = URL.createObjectURL(imageFile);
        });

        // Set canvas size for higher resolution dithering
        canvas.width = 300;
        canvas.height = 150;
        
        // Draw and dither the image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const ditheredData = ditherImage(imageData);
        ctx.putImageData(ditheredData, 0, 0);
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/png');
        
        // Create beveled border effect
        imageElement = `
          <!-- Beveled border -->
          <rect x="0" y="0" width="300" height="150" fill="#c0c0c0" stroke="#808080" stroke-width="1"/>
          <rect x="1" y="1" width="298" height="148" fill="#e0e0e0" stroke="#a0a0a0" stroke-width="1"/>
          <rect x="2" y="2" width="296" height="146" fill="#f0f0f0" stroke="#c0c0c0" stroke-width="1"/>
          <!-- Inner shadow -->
          <rect x="3" y="3" width="294" height="144" fill="none" stroke="#808080" stroke-width="1"/>
          <!-- Image with inset -->
          <image href="${dataUrl}" x="4" y="4" width="292" height="142" />
        `;
      } catch (error) {
        console.warn('Failed to embed poster image:', error);
        // Fall back to default background with beveled border
        imageElement = `
          <!-- Beveled border -->
          <rect x="0" y="0" width="300" height="150" fill="#c0c0c0" stroke="#808080" stroke-width="1"/>
          <rect x="1" y="1" width="298" height="148" fill="#e0e0e0" stroke="#a0a0a0" stroke-width="1"/>
          <rect x="2" y="2" width="296" height="146" fill="#f0f0f0" stroke="#c0c0c0" stroke-width="1"/>
          <!-- Inner shadow -->
          <rect x="3" y="3" width="294" height="144" fill="none" stroke="#808080" stroke-width="1"/>
          <!-- Default background -->
          <rect x="4" y="4" width="292" height="142" fill="#f0f0f0"/>
        `;
      }
    }

    // Add title text if provided
    if (title && title.trim()) {
      titleText = `<text x="150" y="140" font-family="monospace" font-size="12" fill="#333" text-anchor="middle" font-weight="bold" style="paint-order: stroke; stroke: #fff; stroke-width: 2px; stroke-linejoin: round;">${title.toUpperCase()}</text>`;
    }

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150" data-multipass="${safeJsonString}">
  <!-- Beveled border around entire SVG -->
  <rect x="0" y="0" width="300" height="150" fill="#c0c0c0" stroke="#808080" stroke-width="1"/>
  <rect x="1" y="1" width="298" height="148" fill="#e0e0e0" stroke="#a0a0a0" stroke-width="1"/>
  <rect x="2" y="2" width="296" height="146" fill="#f0f0f0" stroke="#c0c0c0" stroke-width="1"/>
  <rect x="3" y="3" width="294" height="144" fill="none" stroke="#808080" stroke-width="1"/>
  
  <!-- Content area with inset -->
  <g transform="translate(4, 4)">
    <!-- Black sidebar -->
    <rect x="0" y="0" width="30" height="142" fill="#000000"/>
    <!-- Rotated MULTIPASS text with heavy weight and letter spacing -->
    <text x="15" y="71" font-family="monospace" font-size="12" fill="#ffffff" text-anchor="middle" font-weight="900" letter-spacing="2" transform="rotate(-90, 15, 71)">MULTIPASS</text>
    <!-- Main content area -->
    <g transform="translate(30, 0)">
      ${imageElement.replace(/x="0" y="0" width="300" height="150"/g, 'x="0" y="0" width="262" height="142"').replace(/x="1" y="1" width="298" height="148"/g, 'x="1" y="1" width="260" height="140"').replace(/x="2" y="2" width="296" height="146"/g, 'x="2" y="2" width="258" height="138"').replace(/x="3" y="3" width="294" height="144"/g, 'x="3" y="3" width="256" height="136"').replace(/x="4" y="4" width="292" height="142"/g, 'x="4" y="4" width="254" height="134"')}
      ${titleText}
    </g>
  </g>
</svg>`;
    downloadUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
    svgForDisplay = svgContent;
  }

  function ditherImage(imageData) {
    const { data, width, height } = imageData;
    const newData = new Uint8ClampedArray(data);
    
    // 16-color palette (classic EGA colors)
    const palette = [
      [0, 0, 0],       // Black
      [0, 0, 170],     // Blue
      [0, 170, 0],     // Green
      [0, 170, 170],   // Cyan
      [170, 0, 0],     // Red
      [170, 0, 170],   // Magenta
      [170, 85, 0],    // Brown
      [170, 170, 170], // Light Gray
      [85, 85, 85],    // Dark Gray
      [85, 85, 255],   // Light Blue
      [85, 255, 85],   // Light Green
      [85, 255, 255],  // Light Cyan
      [255, 85, 85],   // Light Red
      [255, 85, 255],  // Light Magenta
      [255, 255, 85],  // Yellow
      [255, 255, 255]  // White
    ];
    
    // Find closest color in palette
    function findClosestColor(r, g, b) {
      let minDistance = Infinity;
      let closestColor = [0, 0, 0];
      
      for (const color of palette) {
        const distance = Math.sqrt(
          Math.pow(r - color[0], 2) + 
          Math.pow(g - color[1], 2) + 
          Math.pow(b - color[2], 2)
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestColor = color;
        }
      }
      
      return closestColor;
    }
    
    // Floyd-Steinberg dithering with 16-color palette
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Get original RGB values
        const r = newData[idx];
        const g = newData[idx + 1];
        const b = newData[idx + 2];
        
        // Find closest color in palette
        const [newR, newG, newB] = findClosestColor(r, g, b);
        
        // Calculate errors for each channel
        const errorR = r - newR;
        const errorG = g - newG;
        const errorB = b - newB;
        
        // Set the pixel
        newData[idx] = newR;
        newData[idx + 1] = newG;
        newData[idx + 2] = newB;
        
        // Distribute error to neighboring pixels (Floyd-Steinberg)
        if (x + 1 < width) {
          newData[idx + 4] += errorR * 7 / 16;
          newData[idx + 5] += errorG * 7 / 16;
          newData[idx + 6] += errorB * 7 / 16;
        }
        if (x - 1 >= 0 && y + 1 < height) {
          newData[idx + width * 4 - 4] += errorR * 3 / 16;
          newData[idx + width * 4 - 3] += errorG * 3 / 16;
          newData[idx + width * 4 - 2] += errorB * 3 / 16;
        }
        if (y + 1 < height) {
          newData[idx + width * 4] += errorR * 5 / 16;
          newData[idx + width * 4 + 1] += errorG * 5 / 16;
          newData[idx + width * 4 + 2] += errorB * 5 / 16;
        }
        if (x + 1 < width && y + 1 < height) {
          newData[idx + width * 4 + 4] += errorR * 1 / 16;
          newData[idx + width * 4 + 5] += errorG * 1 / 16;
          newData[idx + width * 4 + 6] += errorB * 1 / 16;
        }
      }
    }
    
    return new ImageData(newData, width, height);
  }

  function loadQueryFromJson(data) {
    what = data.meta.what || 'everything';
    by = data.meta.by || 'all';
    match = data.meta.match || 'unset';
    sTokens = data.subjects.include;
    notSTokens = data.subjects.exclude;
    oTokens = data.objects.include;
    notOTokens = data.objects.exclude;
    limit = data.filters.limitResults;
    offset = data.filters.offsetResults;

    if (data.filters.dateRange) {
        const { after, before } = data.filters.dateRange;
        whenAfter = after ? new Date(after * 1000).toISOString().split('T')[0] : '';
        whenBefore = before ? new Date(before * 1000).toISOString().split('T')[0] : '';
    } else {
        whenAfter = '';
        whenBefore = '';
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (re) => {
        const svgText = re.target.result;
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
        const svgElement = svgDoc.documentElement;
        if (svgElement && svgElement.hasAttribute('data-multipass')) {
          try {
            const jsonString = svgElement.getAttribute('data-multipass');
            const jsonData = JSON.parse(jsonString);
            loadQueryFromJson(jsonData);
            alert('Query loaded from SVG! Running query...');
            handleSubmit();
          } catch (err) {
            error = 'Failed to parse JSON from SVG data attribute.';
            console.error(err);
          }
        } else {
          error = 'No query data found in the dropped SVG.';
        }
      };
      reader.onerror = () => {
        error = 'Failed to read the dropped file.';
      };
      reader.readAsText(file);
    } else {
      error = 'Please drop a valid SVG file created by this tool.';
    }
  }

  const whatOptions = ['everything', 'pages', 'links', 'backlinks', 'thorpes', 'domains'];
  const byOptions = [
    'octothorped',  
    'linked', 'backlinked', 'cited', 'bookmarked', 
    'posted', 'member-of'
  ];
  const matchOptions = [
    'unset', 'exact', 'fuzzy', 'fuzzy-s', 'fuzzy-subject', 
    'fuzzy-o', 'fuzzy-object', 'very-fuzzy-o', 'very-fuzzy-object', 'very-fuzzy'
  ];
</script>

<svelte:head>
  <title>API Query Builder</title>
</svelte:head>

<div class="page-layout">
  <div class="form-column">
    <h1>API Query Builder</h1>
    
    <div 
      class="drop-zone"
      on:dragover={handleDragOver}
      on:drop={handleDrop}
    >
      <p>Drop a query SVG here to load it</p>
    </div>

    <form on:submit|preventDefault={handleSubmit}>
      <div class="grid">
        <div>
          <label for="what">Get what?</label>
          <select id="what" bind:value={what}>
            {#each whatOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </div>

        <div>
          <label for="by">Matched by?</label>
          <select id="by" bind:value={by}>
            {#each byOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </div>
      </div>

      <label for="s">Subjects (s)</label>
      <TokenInput bind:tokens={sTokens} placeholder="add subject and press enter..." />

      <label for="o">Objects (o)</label>
      <TokenInput bind:tokens={oTokens} placeholder="add object and press enter..." />

      <label for="notS">Exclude Subjects (not-s)</label>
      <TokenInput bind:tokens={notSTokens} placeholder="add excluded subject and press enter..." />
      
      <label for="notO">Exclude Objects (not-o)</label>
      <TokenInput bind:tokens={notOTokens} placeholder="add excluded object and press enter..." />

      <label for="posterImage">Poster Image</label>
      <input 
        id="posterImage" 
        type="file" 
        accept="image/*"
        on:change={handleImageUpload}
      />
      {#if posterImage}
        <div class="image-preview">
          <img src={posterImage} alt="Poster preview" />
        </div>
      {/if}

      <label for="svgTitle">SVG Title (optional)</label>
      <input 
        id="svgTitle" 
        type="text" 
        bind:value={svgTitle}
        placeholder="Enter title to display below image"
      />

      <div class="grid">
        <div>
          <label for="match">Match mode</label>
          <select id="match" bind:value={match}>
            {#each matchOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </div>

        <div>
          <label for="limit">Limit</label>
          <input id="limit" type="number" bind:value={limit} min="0">
        </div>

        <div>
          <label for="offset">Offset</label>
          <input id="offset" type="number" bind:value={offset} min="0">
        </div>
      </div>
      
      <div class="grid">
          <div>
              <label for="whenAfter">Date After</label>
              <input id="whenAfter" type="date" bind:value={whenAfter}>
          </div>
          <div>
              <label for="whenBefore">Date Before</label>
              <input id="whenBefore" type="date" bind:value={whenBefore}>
          </div>
      </div>


      <button type="submit">Query API</button>
    </form>
  </div>

  <div class="results-column">
    {#if queryUrl}
      <p><strong>Query URL:</strong> <a href={queryUrl} target="_blank">{queryUrl}</a></p>
    {/if}

    {#if svgForDisplay}
      <div class="svg-display">
          <h3>Generated SVG</h3>
          <div class="svg-container">
              {@html svgForDisplay}
          </div>
          <a href={downloadUrl} download="multipass.svg" class="button">Download SVG</a>
      </div>
    {/if}

    {#if error}
      <pre class="error">{error}</pre>
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
</div>

<style>
  .page-layout {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 2rem;
    align-items: flex-start;
    padding: 1rem;
  }

  @media (max-width: 900px) {
    .page-layout {
      grid-template-columns: 1fr;
    }
  }

  .form-column {
    position: sticky;
    top: 1rem;
  }

  .container {
    max-width: 800px;
    margin: 2rem auto;
    padding: 0 1rem;
  }
  .drop-zone {
    border: 2px dashed #ccc;
    border-radius: 8px;
    padding: 0.5rem;
    text-align: center;
    margin-bottom: 1rem;
    background: #fafafa;
  }
  .drop-zone p {
    margin: 0;
    font-size: 0.6rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 2rem;
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 8px;
    background: #f9f9f9;
  }
  label {
    margin-bottom: 0;
    font-weight: bold;
    display: block;
    font-size: 0.6rem;
  }
  input, select {
    width: 100%;
    padding: 0.25rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.6rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.5rem;
  }
  button, .button {
    padding: 0.3rem 0.65rem;
    border: none;
    border-radius: 4px;
    background-color: #007bff;
    color: white;
    cursor: pointer;
    font-size: 0.6rem;
    text-decoration: none;
    display: inline-block;
  }
  button:hover, .button:hover {
    background-color: #0056b3;
  }
  pre {
    background: #eee;
    padding: 1rem;
    white-space: pre-wrap;
    word-break: break-all;
    border-radius: 4px;
  }
  .error {
    color: red;
    border: 1px solid red;
  }
  .multipass-download {
    margin: 1rem 0;
  }
  .svg-display {
    margin-bottom: 2rem;
  }
  .svg-display .button {
    margin-top: 1rem;
  }
  .svg-container :global(svg) {
    border: 1px solid #ddd;
    border-radius: 4px;
    max-width: 100%;
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
  .image-preview {
    margin-top: 0.5rem;
  }
  .image-preview img {
    max-width: 100%;
    max-height: 100px;
    border-radius: 4px;
    border: 1px solid #ddd;
  }
</style> 