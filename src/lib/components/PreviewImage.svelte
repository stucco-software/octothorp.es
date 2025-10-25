<script>
  export let url
  export let image = null
  export let title = ''
  export let cssClass = 'preview-image'

  function getPreviewImageUrl(url) {
    // Use microlink.io to get social preview image
    return `https://api.microlink.io/?url=${encodeURIComponent(url)}&embed=image.url`
  }
</script>

{#if image}
  <img
    src={image}
    alt="Preview for {title || url}"
    class={cssClass}
    on:error={(e) => e.target.style.display = 'none'}
  />
{:else}
  <img
    src={getPreviewImageUrl(url)}
    alt="Preview for {title || url}"
    class={cssClass}
    on:error={(e) => e.target.style.display = 'none'}
  />
{/if}

<style>
  .preview-image {
    width: 120px;
    height: 90px;
    object-fit: cover;
    background-image: url(/wonkgraph.png);
  }
</style>
