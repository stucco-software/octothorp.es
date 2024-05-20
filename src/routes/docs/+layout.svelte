<div>
  <nav>
    <details>
      <summary>Getting Started</summary>
      <ul>
        <li>
          <a href="#">Register a Domain</a>
        </li>
        <li>
          <a href="#">Verify a Domain</a>
        </li>
        <li>
          <a href="#">Domain Approval</a>
        </li>
      </ul>
    </details>

    <details>
      <summary>Creating Octothorpes</summary>
      <ul>
        <li>
          <a href="#">Web Component</a>
        </li>
        <li>
          <a href="#">Link Tag</a>
        </li>
        <li>
          <a href="#">JSON Index</a>
        </li>
      </ul>
    </details>

    <details>
      <summary>Backlinks</summary>
      <ul>
        <li>
          <a href="#">Creating Backlinks</a>
        </li>
        <li>
          <a href="#">Approving Backlinks</a>
        </li>
        <li>
          <a href="#">Fetching Backlinks</a>
        </li>
      </ul>
    </details>

    <details>
      <summary>The Community Server</summary>
      <ul>
        <li>
          <a href="#">RSS Feeds</a>
        </li>
        <li>
          <a href="#">REST API</a>
        </li>
        <li>
          <a href="#">Hosting a Community</a>
        </li>
      </ul>
    </details>
  </nav>

  <main>
    <slot></slot>
  </main>
</div>

<style>
  div {
    padding-inline: var(--grid-gutter);
    margin-inline: auto;
  }
</style>
