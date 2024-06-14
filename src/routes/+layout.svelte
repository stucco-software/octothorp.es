<script type="text/javascript">
  import { page } from '$app/stores';
</script>

<pushbroom url={$page.url.pathname} />

<div class="container">
  <nav class="head grid">
    <a href="/"># octothorpes</a>
  </nav>

  <div class="layout">
    <aside>
      <ul>
        <li>
          <a href="/domains">sites</a>
        </li>
        <li>
          <a href="/register">register</a>
        </li>
        <li>
          <a href="/docs">docs</a>
        </li>
      </ul>
    </aside>
    <main>
      <slot></slot>
    </main>
  </div>

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
    grid-auto-flow: row;
    gap: 0;
    border-bottom: 2px dotted var(--dark-blue);
    padding-block: 1rem;
  }
  .layout {
    display: grid;
    grid-auto-flow: row;
    grid-template-columns: 1fr auto;
    max-width: 100%;
  }
  aside {
    width: max-content;
  }
</style>