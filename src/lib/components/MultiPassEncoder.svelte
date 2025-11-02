<script>
  export let onEncode = null; // Optional callback when encoding succeeds
  export let multiPassData = null; // Optional pre-populated MultiPass data
  export let isLoadingMultiPass = false; // Whether we're loading a pre-populated MultiPass
  
  let multiPassFile = null;
  let gifFile = null;
  let gifPreview = null;
  let error = null;
  let isProcessing = false;
  let isLoadingGif = false;
  let isDraggingMultiPass = false;
  let isDraggingGif = false;

  import { injectMultipassIntoGif, isValidMultipass } from '$lib/utils.js';
  import { onMount, onDestroy } from 'svelte';
  import Loading from '$lib/components/Loading.svelte';
  
  // Watch for external multiPassData changes (when loaded from explore page)
  $: if (multiPassData && !multiPassFile) {
    // Create a fake file object for display purposes
    multiPassFile = { name: 'current-query.json', size: JSON.stringify(multiPassData).length };
    
    // Check if we should auto-load GIF from meta.image
    if (multiPassData?.meta?.image && multiPassData.meta.image.toLowerCase().endsWith('.gif')) {
      loadGifFromUrl(multiPassData.meta.image);
    }
  }
  
  // Listen for event to load GIF from meta.image
  let eventListener;
  onMount(() => {
    eventListener = (event) => {
      const mp = event.detail.multiPass;
      if (mp?.meta?.image && mp.meta.image.toLowerCase().endsWith('.gif')) {
        loadGifFromUrl(mp.meta.image);
      }
    };
    window.addEventListener('load-multipass-gif', eventListener);
  });
  
  onDestroy(() => {
    if (eventListener) {
      window.removeEventListener('load-multipass-gif', eventListener);
    }
  });
  
  async function loadGifFromUrl(url) {
    isLoadingGif = true;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        if (blob.type === 'image/gif') {
          const arrayBuffer = await blob.arrayBuffer();
          gifFile = arrayBuffer;
          gifPreview = URL.createObjectURL(blob);
        }
      }
    } catch (err) {
      console.warn('Could not load GIF from meta.image:', err);
    } finally {
      isLoadingGif = false;
    }
  }

  async function handleMultiPassUpload(event) {
    const file = event.target.files?.[0] || event.dataTransfer?.files?.[0];
    if (!file) return;

    error = null;
    isDraggingMultiPass = false;

    if (!file.name.toLowerCase().endsWith('.json')) {
      error = 'MultiPass must be a .json file';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const validation = isValidMultipass(parsed);
        if (!validation.valid) {
          throw new Error(validation.error);
        }
        multiPassData = parsed;
        multiPassFile = file;

        // Pre-load GIF from meta.image if it's a .gif URL
        if (parsed.meta?.image && parsed.meta.image.toLowerCase().endsWith('.gif')) {
          try {
            const response = await fetch(parsed.meta.image);
            if (response.ok) {
              const blob = await response.blob();
              if (blob.type === 'image/gif') {
                const arrayBuffer = await blob.arrayBuffer();
                gifFile = arrayBuffer;
                gifPreview = URL.createObjectURL(blob);
              }
            }
          } catch (fetchErr) {
            // Silently fail - user can still manually upload a GIF
            console.warn('Could not pre-load GIF from meta.image:', fetchErr);
          }
        }
      } catch (err) {
        error = `Invalid MultiPass: ${err.message}`;
        multiPassData = null;
        multiPassFile = null;
      }
    };
    reader.readAsText(file);

    // Reset file input
    if (event.target) event.target.value = '';
  }

  function handleGifUpload(event) {
    const file = event.target.files?.[0] || event.dataTransfer?.files?.[0];
    if (!file) return;

    error = null;
    isDraggingGif = false;

    if (!file.type.includes('gif') && !file.name.toLowerCase().endsWith('.gif')) {
      error = 'Image must be a .gif file';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // Create preview
        const blob = new Blob([e.target.result], { type: 'image/gif' });
        gifPreview = URL.createObjectURL(blob);
        gifFile = e.target.result; // Store ArrayBuffer
      } catch (err) {
        error = `Error loading GIF: ${err.message}`;
        gifFile = null;
        gifPreview = null;
      }
    };
    reader.readAsArrayBuffer(file);

    // Reset file input
    if (event.target) event.target.value = '';
  }

  async function encodeMultiPass() {
    if (!multiPassData || !gifFile) {
      error = 'Please upload both a MultiPass JSON and a GIF file';
      return;
    }

    isProcessing = true;
    error = null;

    try {
      // Inject MultiPass into GIF (client-side only)
      const encodedGif = injectMultipassIntoGif(gifFile, multiPassData);

      // Create download link
      const blob = new Blob([encodedGif], { type: 'image/gif' });
      const url = URL.createObjectURL(blob);
      
      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = 'multipass.gif';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // Cleanup after a short delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      // Call optional callback
      if (onEncode) {
        onEncode({ multiPass: multiPassData, success: true });
      }

      // Success feedback
      error = null;
    } catch (err) {
      error = `Encoding failed: ${err.message}`;
      if (onEncode) {
        onEncode({ multiPass: multiPassData, success: false, error: err.message });
      }
    } finally {
      isProcessing = false;
    }
  }

  function reset() {
    multiPassFile = null;
    gifFile = null;
    multiPassData = null;
    gifPreview = null;
    error = null;
    isProcessing = false;
  }
</script>

<div class="encoder-container">
  {#if isLoadingMultiPass || isLoadingGif}
    <Loading message={isLoadingGif ? "Loading GIF from MultiPass..." : "Loading MultiPass..."} />
  {:else}
  <div class="upload-zones">
    <!-- MultiPass JSON Upload -->
    <div 
      class="upload-zone"
      class:has-file={multiPassFile}
      class:dragging={isDraggingMultiPass}
      role="button"
      tabindex="0"
      on:dragover={(e) => { e.preventDefault(); isDraggingMultiPass = true; }}
      on:dragleave={(e) => { e.preventDefault(); isDraggingMultiPass = false; }}
      on:drop={(e) => { e.preventDefault(); handleMultiPassUpload(e); }}
    >
      <label>
        <div class="zone-content">
          {#if multiPassFile}
            <div class="file-info">
              <div class="checkmark">✓</div>
              <div class="filename">{multiPassFile.name}</div>
              <div class="file-size">{(multiPassFile.size / 1024).toFixed(1)} KB</div>
            </div>
          {:else}
            <div class="upload-prompt">
              <div class="icon">📄</div>
              {#if multiPassData}
                <div class="text">Current query loaded</div>
                <div class="subtext">or upload different JSON</div>
              {:else}
                <div class="text">Drop MultiPass JSON</div>
                <div class="subtext">or click to browse</div>
              {/if}
            </div>
          {/if}
        </div>
        <input
          type="file"
          accept=".json,application/json"
          on:change={handleMultiPassUpload}
          style="display: none;"
        />
      </label>
    </div>

    <!-- GIF Upload -->
    <div 
      class="upload-zone"
      class:has-file={gifFile}
      class:dragging={isDraggingGif}
      role="button"
      tabindex="0"
      on:dragover={(e) => { e.preventDefault(); isDraggingGif = true; }}
      on:dragleave={(e) => { e.preventDefault(); isDraggingGif = false; }}
      on:drop={(e) => { e.preventDefault(); handleGifUpload(e); }}
    >
      <label>
        <div class="zone-content">
          {#if gifPreview}
            <div class="gif-preview">
              <img src={gifPreview} alt="GIF preview" />
            </div>
          {:else}
            <div class="upload-prompt">
              <div class="icon">🖼️</div>
              <div class="text">Drop GIF Image</div>
              <div class="subtext">or click to browse</div>
            </div>
          {/if}
        </div>
        <input
          type="file"
          accept=".gif,image/gif"
          on:change={handleGifUpload}
          style="display: none;"
        />
      </label>
    </div>
  </div>

  {#if error}
    <div class="error-message">
      {error}
    </div>
  {/if}

  <div class="actions">
    <button 
      class="encode-button"
      on:click={encodeMultiPass}
      disabled={!multiPassFile || !gifFile || isProcessing}
    >
      {isProcessing ? 'Encoding...' : 'Encode & Download MultiPass GIF'}
    </button>
    
    {#if multiPassFile || gifFile}
      <button 
        class="reset-button"
        on:click={reset}
        disabled={isProcessing}
      >
        Reset
      </button>
    {/if}
  </div>
  {/if}
</div>

<style>
  .encoder-container {
    max-width: 800px;
    margin: 0 auto;
  }

  .upload-zones {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-block-end: 1rem;
  }

  .upload-zone {
    border: 2px dashed var(--txt-color);
    background-color: var(--bg-color);
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .upload-zone:hover {
    background-color: lightgoldenrodyellow;
    border-color: blue;
  }

  .upload-zone.dragging {
    background-color: lightgoldenrodyellow;
    border-color: blue;
    border-style: solid;
  }

  .upload-zone.has-file {
    border-style: solid;
    border-color: green;
  }

  .upload-zone label {
    width: 100%;
    height: 100%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .zone-content {
    text-align: center;
    padding: 1rem;
    width: 100%;
  }

  .upload-prompt .icon {
    font-size: 3rem;
    margin-block-end: 0.5rem;
  }

  .upload-prompt .text {
    font-family: var(--sans-stack);
    font-size: var(--txt-0);
    font-weight: bold;
    margin-block-end: 0.25rem;
  }

  .upload-prompt .subtext {
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    color: #666;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .checkmark {
    font-size: 2rem;
    color: green;
  }

  .filename {
    font-family: var(--mono-stack);
    font-size: var(--txt--1);
    font-weight: bold;
    word-break: break-all;
  }

  .file-size {
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    color: #666;
  }

  .gif-preview {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gif-preview img {
    max-width: 100%;
    max-height: 180px;
    border: 1px solid var(--txt-color);
  }

  .error-message {
    background-color: yellow;
    border: 2px solid red;
    padding: 0.75rem;
    margin-block-end: 1rem;
    font-family: var(--mono-stack);
    font-size: var(--txt--1);
    font-weight: bold;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .encode-button {
    font-family: var(--sans-stack);
    font-size: var(--txt-0);
    padding: 0.75rem 1.5rem;
    background-color: blue;
    color: white;
    border: 2px solid var(--txt-color);
    cursor: pointer;
    font-weight: bold;
    box-shadow: 3px 3px 0 var(--txt-color);
  }

  .encode-button:hover:not(:disabled) {
    background-color: darkblue;
    transform: translate(1px, 1px);
    box-shadow: 2px 2px 0 var(--txt-color);
  }

  .encode-button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
    color: #666;
  }

  .reset-button {
    font-family: var(--sans-stack);
    font-size: var(--txt--1);
    padding: 0.5rem 1rem;
    background-color: var(--bg-color);
    border: 1px solid var(--txt-color);
    cursor: pointer;
  }

  .reset-button:hover:not(:disabled) {
    background-color: lightgoldenrodyellow;
  }

  .reset-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  @media (max-width: 600px) {
    .upload-zones {
      grid-template-columns: 1fr;
    }
  }
</style>
