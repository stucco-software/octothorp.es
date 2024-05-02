<script type="text/javascript">
  export let data
</script>

<div class="container">
  <header class="grid">
    <h1>#Octothorpes</h1>
    <p>Hashtags for Websites.</p>
  </header>

  <main class="grid">
    {#each data.thorpes as t}
      <a href="{t}">
        #{t.split('/~/')[1]}
      </a>
    {/each}
  </main>

  <section>
    <p><a href="/docs">What is this?</a></p>
  </section>
</div>

<style>
  header {
    margin-block: var(--lead-4);
    text-align: center;
  }
  header h1 {
    font-size: var(--txt-4);
    word-wrap: anywhere;
    margin: 0;
    line-height: 0.9;
  }
  header p {
    font-size: var(--txt-2);
    line-height: 1.1;
    font-weight: 900;
    letter-spacing: 3px;
  }
  a {
    color: var(--yellow);
    text-align: center;
  }
  a:hover,
  a:focus {
    color: var(--brown);
  }
  main {
    grid-auto-flow: row;
    font-size: var(--txt-1);
    margin-block-end: 12rem;
    grid-template-columns: 1fr 1fr 1fr;
  }
  section p {
    text-align: center;
  }
</style>