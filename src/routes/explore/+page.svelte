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
  let barcodeBase64 = '';
  let decodeInput = '';
  let decodeResult = null;
  let decodeError = null;

  let gifDownloadUrl = '';
  let gifGenerating = false;

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

  function generateCode128Barcode(data) {
    // Convert data to base64 for encoding
    const jsonString = JSON.stringify(data);
    const base64String = btoa(jsonString);
    barcodeBase64 = base64String; // Store for UI
    
    // Start code B = 104
    let codes = [104];
    for (let i = 0; i < base64String.length; i++) {
      codes.push(code128BValue(base64String[i]));
    }
    // Checksum
    let checksum = 104;
    for (let i = 0; i < base64String.length; i++) {
      checksum += code128BValue(base64String[i]) * (i + 1);
    }
    codes.push(checksum % 103);
    codes.push(106); // Stop code

    // Convert codes to bar/space patterns
    let x = 0;
    let svg = `<g>`;
    let barHeight = 30; // Increased height for better visibility
    let barY = 0; // Start from top of barcode area
    
    for (let code of codes) {
      let pattern = CODE128B_PATTERNS[code];
      for (let i = 0; i < pattern.length; i++) {
        let w = parseInt(pattern[i], 10);
        if (i % 2 === 0) {
          // Bar
          svg += `<rect x="${x}" y="${barY}" width="${w}" height="${barHeight}" fill="#000000"/>`;
        }
        x += w;
      }
    }
    svg += `</g>`;
    return { svg, width: x };
  }

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

    // Generate barcode
    const barcode = generateCode128Barcode(jsonData);
    
    // Adjust SVG height to accommodate barcode
    const svgHeight = 170; // Increased from 150 to make room for barcode
    const contentHeight = 120; // Height for main content area

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
        canvas.height = contentHeight;
        
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
          <rect x="0" y="0" width="300" height="${contentHeight}" fill="#c0c0c0" stroke="#808080" stroke-width="1"/>
          <rect x="1" y="1" width="298" height="${contentHeight - 2}" fill="#e0e0e0" stroke="#a0a0a0" stroke-width="1"/>
          <rect x="2" y="2" width="296" height="${contentHeight - 4}" fill="#f0f0f0" stroke="#c0c0c0" stroke-width="1"/>
          <!-- Inner shadow -->
          <rect x="3" y="3" width="294" height="${contentHeight - 6}" fill="none" stroke="#808080" stroke-width="1"/>
          <!-- Image with inset -->
          <image href="${dataUrl}" x="4" y="4" width="292" height="${contentHeight - 8}" />
        `;
      } catch (error) {
        console.warn('Failed to embed poster image:', error);
        // Fall back to default background with beveled border
        imageElement = `
          <!-- Beveled border -->
          <rect x="0" y="0" width="300" height="${contentHeight}" fill="#c0c0c0" stroke="#808080" stroke-width="1"/>
          <rect x="1" y="1" width="298" height="${contentHeight - 2}" fill="#e0e0e0" stroke="#a0a0a0" stroke-width="1"/>
          <rect x="2" y="2" width="296" height="${contentHeight - 4}" fill="#f0f0f0" stroke="#c0c0c0" stroke-width="1"/>
          <!-- Inner shadow -->
          <rect x="3" y="3" width="294" height="${contentHeight - 6}" fill="none" stroke="#808080" stroke-width="1"/>
          <!-- Default background -->
          <rect x="4" y="4" width="292" height="${contentHeight - 8}" fill="#f0f0f0"/>
        `;
      }
    }

    // Add title text if provided
    if (title && title.trim()) {
      titleText = `<text x="150" y="${contentHeight - 10}" font-family="monospace" font-size="12" fill="#333" text-anchor="middle" font-weight="bold" style="paint-order: stroke; stroke: #fff; stroke-width: 2px; stroke-linejoin: round;">${title.toUpperCase()}</text>`;
    }

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="${svgHeight}" viewBox="0 0 300 ${svgHeight}" data-multipass="${safeJsonString}">
  <!-- Beveled border around entire SVG -->
  <rect x="0" y="0" width="300" height="${svgHeight}" fill="#c0c0c0" stroke="#808080" stroke-width="1"/>
  <rect x="1" y="1" width="298" height="${svgHeight - 2}" fill="#e0e0e0" stroke="#a0a0a0" stroke-width="1"/>
  <rect x="2" y="2" width="296" height="${svgHeight - 4}" fill="#f0f0f0" stroke="#c0c0c0" stroke-width="1"/>
  <rect x="3" y="3" width="294" height="${svgHeight - 6}" fill="none" stroke="#808080" stroke-width="1"/>
  
  <!-- Content area with inset -->
  <g transform="translate(4, 4)">
    <!-- Black sidebar -->
    <rect x="0" y="0" width="30" height="${contentHeight - 8}" fill="#000000"/>
    <!-- Rotated MULTIPASS text with heavy weight and letter spacing -->
    <text x="15" y="${(contentHeight - 8) / 2}" font-family="monospace" font-size="12" fill="#ffffff" text-anchor="middle" font-weight="900" letter-spacing="2" transform="rotate(-90, 15, ${(contentHeight - 8) / 2})">MULTIPASS</text>
    <!-- Main content area -->
    <g transform="translate(30, 0)">
      ${imageElement.replace(/x="0" y="0" width="300" height="${contentHeight}"/g, 'x="0" y="0" width="262" height="' + (contentHeight - 8) + '"').replace(/x="1" y="1" width="298" height="${contentHeight - 2}"/g, 'x="1" y="1" width="260" height="' + (contentHeight - 10) + '"').replace(/x="2" y="2" width="296" height="${contentHeight - 4}"/g, 'x="2" y="2" width="258" height="' + (contentHeight - 12) + '"').replace(/x="3" y="3" width="294" height="${contentHeight - 6}"/g, 'x="3" y="3" width="256" height="' + (contentHeight - 14) + '"').replace(/x="4" y="4" width="292" height="${contentHeight - 8}"/g, 'x="4" y="4" width="254" height="' + (contentHeight - 16) + '"')}
      ${titleText}
    </g>
  </g>
  
  <!-- Barcode area at bottom with white background -->
  <rect x="4" y="${contentHeight}" width="292" height="${svgHeight - contentHeight - 4}" fill="#ffffff" stroke="#cccccc" stroke-width="1"/>
  <!-- Barcode positioned in the white area -->
  <g transform="translate(4, ${contentHeight + 2})">
    ${barcode.svg}
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
        
        let jsonData = null;
        let decodeMethod = '';
        
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
          loadQueryFromJson(jsonData);
          alert(`Query loaded from ${decodeMethod === 'data-attribute' ? 'data attribute' : 'barcode'}! Running query...`);
          handleSubmit();
        } else {
          error = 'No query data found in the dropped SVG (neither data attribute nor barcode).';
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

  function handleDecodeSubmit() {
    decodeError = null;
    decodeResult = null;
    try {
      const jsonString = atob(decodeInput);
      decodeResult = JSON.parse(jsonString);
    } catch (e) {
      decodeError = e.message;
    }
  }

  async function handleGifDownload() {
    gifGenerating = true;
    gifDownloadUrl = '';
    // Render SVG to canvas
    const svgBlob = new Blob([svgForDisplay], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    const img = new window.Image();
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 170;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 300, 170);
    // Use gif.js to encode the canvas as a GIF
    const gif = new window.GIF({ workers: 2, quality: 1, width: 300, height: 170 });
    gif.addFrame(canvas, { copy: true, delay: 200 });
    gif.on('finished', function(blob) {
      gifDownloadUrl = URL.createObjectURL(blob);
      gifGenerating = false;
    });
    gif.render();
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
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js"></script>
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
          <p class="svg-info">This SVG contains the query data in both the data attribute and as a Code 128 barcode for maximum compatibility.</p>
          <div class="svg-container">
              {@html svgForDisplay}
          </div>
          <a href={downloadUrl} download="multipass.svg" class="button">Download SVG</a>
          <button type="button" class="button" on:click={handleGifDownload} disabled={gifGenerating} style="margin-left:0.5rem;">{gifGenerating ? 'Generating GIF...' : 'Download as GIF'}</button>
          {#if gifDownloadUrl}
            <a href={gifDownloadUrl} download="multipass.gif" class="button" style="margin-left:0.5rem;">Download GIF</a>
          {/if}

          <div class="barcode-debug">
            <label for="barcodeBase64">Barcode Encoded String (base64 of JSON):</label>
            <textarea id="barcodeBase64" readonly rows="2">{barcodeBase64}</textarea>
          </div>

          <div class="barcode-decode">
            <label for="decodeInput">Decode Barcode String (base64):</label>
            <input id="decodeInput" type="text" bind:value={decodeInput} placeholder="Paste base64 string here..." />
            <button type="button" on:click={handleDecodeSubmit}>Decode</button>
            {#if decodeError}
              <pre class="error">{decodeError}</pre>
            {/if}
            {#if decodeResult}
              <pre>{JSON.stringify(decodeResult, null, 2)}</pre>
            {/if}
          </div>
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
  .svg-info {
    font-size: 0.8rem;
    color: #666;
    margin-bottom: 1rem;
    font-style: italic;
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
  .barcode-debug, .barcode-decode {
    margin-top: 1.5rem;
    margin-bottom: 1rem;
  }
  .barcode-debug label, .barcode-decode label {
    font-size: 0.8rem;
    font-weight: bold;
    display: block;
    margin-bottom: 0.2rem;
  }
  .barcode-debug textarea {
    width: 100%;
    font-size: 0.8rem;
    font-family: monospace;
    resize: vertical;
    background: #f8f8f8;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 0.3rem;
  }
  .barcode-decode input[type="text"] {
    width: 80%;
    font-size: 0.8rem;
    font-family: monospace;
    margin-right: 0.5rem;
    padding: 0.3rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .barcode-decode button {
    font-size: 0.8rem;
    padding: 0.3rem 0.7rem;
    margin-top: 0.2rem;
  }
  .barcode-decode pre {
    background: #f8f8f8;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.8rem;
    font-family: monospace;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style> 