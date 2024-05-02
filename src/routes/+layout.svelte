<script type="text/javascript">
  import { page } from '$app/stores';
</script>

<pushbroom url={$page.url.pathname} />

<div class="container">
  <nav class="head grid">
    <a href="/">#</a>
    <span></span>
    <span></span>
    <a href="/domains">Sites</a>
    <a href="/register">Register</a>
    <a href="/docs">Docs</a>
  </nav>
</div>

<slot></slot>

<div class="container">
  <nav class="foot grid">
    <a href="/terms">Terms</a>
    <a href="/privacy">Privacy</a>
  </nav>
  <p>
    From <a href="https://stucco.software">Stucco Software</a> & <a href="https://www.mmmx.cloud/">The Idea Store</a>  2024
  </p>
</div>

<style type="text/css">
  nav {
    width: max-content;
    grid-auto-flow: row;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0;
  }
  .head {
     margin-block-start: var(--lead-half);
  }
  .foot {
    margin-block-start: var(--lead-4);
    margin-block-end: var(--lead-2);
  }
  a {
    padding-inline: var(--lead-1);
    color: var(--txt-color);
    text-decoration: none;
    border: 4px solid var(--txt-color);
  }
  .head a:first-of-type {
    border-bottom: 0;
  }
  .head a:nth-of-type(3),
  .head a:nth-of-type(4) {
    border-left: 0;
  }
  .foot a:nth-of-type(2) {
    border-left: 0;
  }
  a:hover,
  a:focus {
    color: var(--brown);
    outline: none;
  }
</style>