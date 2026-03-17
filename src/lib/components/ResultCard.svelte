<script>
  import PreviewImage from '$lib/components/PreviewImage.svelte'

  export let url
  export let title = null
  export let description = null
  export let image = null
  export let postDate = null
  export let date = null
</script>

<article class="result-card">
  <PreviewImage
    url={url}
    image={image}
    title={title || url}
  />
  <div class="result-content">
    <h4 class="result-title">
      <a href={url} target="_blank" rel="noopener noreferrer">
        {title || url}
      </a>
    </h4>
    <div class="result-url">{url}</div>
    {#if postDate || date}
      <div class="result-date">
        {#if postDate}
          {new Date(postDate).toLocaleDateString()}
        {:else}
          Indexed {new Date(date).toLocaleDateString()}
        {/if}
      </div>
    {/if}
    {#if description}
      <p class="result-description">{description}</p>
    {/if}
    <slot />
  </div>
</article>

<style>
  .result-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    border-bottom: 1px solid #e0e0e0;
    padding-block-end: 0.75rem;
    align-items: start;
  }

  .result-card:has(:global(.preview-image[style*="display: none"])) {
    grid-template-columns: 1fr;
  }

  .result-card:last-child {
    border-bottom: none;
    padding-block-end: 0;
  }

  .result-content {
    min-width: 0;
  }

  .result-title {
    margin: 0 0 0.125rem 0;
    font-family: var(--serif-stack);
    font-size: var(--txt-0);
    font-weight: normal;
    line-height: 1.2;
  }

  .result-title a {
    color: var(--txt-color);
    text-decoration: none;
  }

  .result-title a:hover {
    text-decoration: underline;
    background-color: yellow;
  }

  .result-url {
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    color: #666;
    margin-block-end: 0.25rem;
    word-break: break-all;
  }

  .result-date {
    font-family: OCRA;
    font-size: var(--txt--2);
    color: #999;
    margin-block-start: -0.125rem;
    margin-block-end: 0.25rem;
  }

  .result-description {
    margin: 0.25rem 0;
    font-size: var(--txt--2);
    line-height: 1.4;
    color: #333;
  }
</style>
