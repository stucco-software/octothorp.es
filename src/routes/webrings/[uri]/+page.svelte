<script type="text/javascript">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import PreviewImage from '$lib/components/PreviewImage.svelte'

  export let data

  function goToRandomMember() {
    if (data.members.length === 0) return
    const randomMember = data.members[Math.floor(Math.random() * data.members.length)]
    window.open(randomMember.uri, '_blank')
  }
</script>

<svelte:head>
  <title>{data.webringTitle || data.webringUri} - Webring - Octothorpes Protocol</title>
</svelte:head>

<div class="webring-page">
  <header>
    {#if data.webringImage}
      <div class="webring-header-image">
        <img src={data.webringImage} alt={data.webringTitle || data.webringUri} />
      </div>
    {/if}
    <div class="webring-header-content">
      <h1>
        <a href={data.webringUri} target="_blank" rel="noopener noreferrer">
          {data.webringTitle || data.webringUri}
        </a>
      </h1>
      {#if data.webringDescription}
        <p class="webring-description">{data.webringDescription}</p>
      {/if}
      <div class="webring-url">{data.webringUri}</div>
      <p class="member-count">{data.members.length} member site{data.members.length === 1 ? '' : 's'} *
          <a href="#" on:click={goToRandomMember}>Random Member</a>
          *
          <a href="/explore?by=in-webring&s={encodeURIComponent(data.webringUri)}" >
            Explore →
          </a>
</p>

    </div>
    <div class="rss-container">
      <a href="/get/everything/in-webring/rss?s={encodeURIComponent(data.webringUri)}" class="rss-link">
        <img src="/Rss_Shiny_Icon.svg" alt="RSS" width="20" height="20">
        RSS
      </a>
    </div>
  </header>

  {#if !data.webringExists}
    <div class="error">
      <p>This webring does not exist or has not been indexed yet.</p>
      <p><a href="/webrings">← Back to all webrings</a></p>
    </div>
  {:else}
    <div class="content">

      {#if data.members.length > 0}
        <section class="members-list">
          {#each data.members as member}
            <article class="member-card">
              <PreviewImage
                url={member.uri}
                image={member.image}
                title={member.title || member.uri}
                cssClass="member-preview"
              />
              <div class="member-content">
                <h3 class="member-title">
                  <a href="/domains/{encodeURIComponent(member.uri)}">
                    {member.title || member.uri}
                  </a>
                </h3>
                <div class="member-url">{member.uri}</div>
                {#if member.description}
                  <p class="member-description">{member.description}</p>
                {/if}
                <div class="member-actions">
                  <a href={member.uri} target="_blank" rel="noopener noreferrer" class="visit-link">
                    Visit site ↗
                  </a>
                </div>
              </div>
            </article>
          {/each}
        </section>
      {:else}
        <p class="no-data">No members found for this webring.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .webring-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }

  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 1rem;
    align-items: start;
    margin-block-end: 1.5rem;
    padding-block-end: 0.5rem;
    border-bottom: 1px solid var(--txt-color);
  }

  header:not(:has(.webring-header-image)) {
    grid-template-columns: 1fr auto;
  }

  .webring-header-image {
    max-width: 200px;
    max-height: 200px;
  }

  .webring-header-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border: 1px solid var(--txt-color);
  }

  .webring-header-content {
    min-width: 0;
  }

  h1 {
    font-family: var(--serif-stack);
    font-size: var(--txt-2);
    margin: 0 0 0.5rem 0;
  }

  h1 a {
    color: var(--txt-color);
    text-decoration: none;
  }

  h1 a:hover {
    background-color: yellow;
  }

  .webring-description {
    font-size: var(--txt-0);
    line-height: 1.4;
    margin: 0 0 0.5rem 0;
    color: #333;
  }

  .webring-url {
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    color: #666;
    word-break: break-all;
  }

  .rss-container {
    align-self: start;
  }

  .rss-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: OCRA;
    font-size: .6rem;
    text-decoration: none;
    color: var(--dark-gray);
    padding: 0.25rem;
    white-space: nowrap;
  }

  .rss-link:hover {
    background-color: yellow;
  }

  .rss-link img {
    flex-shrink: 0;
  }

  h2 {
    font-family: var(--sans-stack);
    font-size: var(--txt-1);
    margin: 0;
  }

  .error {
    padding: 2rem;
    text-align: center;
    border: 2px solid red;
    background-color: #ffeeee;
  }

  .error p {
    margin: 0.5rem 0;
  }

  .error a {
    color: var(--txt-color);
    text-decoration: underline;
  }

  .error a:hover {
    background-color: yellow;
  }

  .content {
    max-width: 800px;
  }


  .explore-link {
    background-color: lightgoldenrodyellow;
    text-decoration: none;
    display: inline-block;
  }

  .explore-link:hover {
    background-color: yellow;
  }

  button {
      padding: 0.25rem .5rem;
    background-color: var(--bg-color);
    border: 1px solid var(--txt-color);
    cursor: pointer;
    font-family: var(--sans-stack);
    font-size: var(--txt--1);
  }

  button:hover {
    background-color: yellow;
  }

  .member-count {
    font-family: var(--mono-stack);
    font-size: var(--txt--1);
    color: #666;
    margin: 0;
  }

  .members-list {
    margin-block-start: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .member-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    border-bottom: 1px solid #e0e0e0;
    padding-block-end: 1.5rem;
    align-items: start;
  }

  .member-card:has(.member-preview[style*="display: none"]) {
    grid-template-columns: 1fr;
  }

  .member-card:last-child {
    border-bottom: none;
    padding-block-end: 0;
  }

  :global(.member-preview) {
    width: 200px;
    height: 150px;
    object-fit: cover;
    background-image: url(/wonkgraph.png);
  }

  .member-content {
    min-width: 0;
  }

  .member-title {
    margin: 0 0 0.25rem 0;
    font-family: var(--serif-stack);
    font-size: var(--txt-0);
    font-weight: normal;
    line-height: 1.3;
  }

  .member-title a {
    color: var(--txt-color);
    text-decoration: none;
  }

  .member-title a:hover {
    background-color: yellow;
  }

  .member-url {
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    color: #666;
    margin-block-end: 0.5rem;
    word-break: break-all;
  }

  .member-description {
    margin: 0.5rem 0;
    font-size: var(--txt--1);
    line-height: 1.5;
    color: #333;
  }

  .member-actions {
    margin-block-start: 0.5rem;
  }

  .visit-link {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background-color: var(--bg-color);
    border: 1px solid var(--txt-color);
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    color: var(--txt-color);
    text-decoration: none;
  }

  .visit-link:hover {
    background-color: yellow;
  }

  .no-data {
    color: #666;
    font-style: italic;
    font-size: var(--txt--1);
    margin-block-start: 1rem;
  }

  @media (max-width: 700px) {
    header {
      grid-template-columns: 1fr;
    }

    .webring-header-image {
      max-width: 100%;
    }

    .members-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .actions {
      width: 100%;
      justify-content: flex-start;
    }

    .member-count {
      margin-inline-start: auto;
    }

    .member-card {
      grid-template-columns: 1fr;
    }

    :global(.member-preview) {
      width: 100%;
      max-height: 200px;
    }
  }
</style>
