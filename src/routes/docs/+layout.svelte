<div>
  <nav>
    <details>
      <summary>Getting Started</summary>
      <ul>
        <li>
          <a href="/docs/register-a-domain">Register a Domain</a>
        </li>
        <li>
          <a href="/docs/verify-a-domain">Verify a Domain</a>
        </li>
        <li>
          <a href="/docs/domain-approval">Domain Approval</a>
        </li>
      </ul>
    </details>

    <details>
      <summary>Creating Octothorpes</summary>
      <ul>
        <li>
          <a href="/docs/web-component">Web Component</a>
        </li>
        <li>
          <a href="/docs/link-tag">Link Tag</a>
        </li>
        <li>
          <a href="/docs/json-index">JSON Index</a>
        </li>
      </ul>
    </details>

    <details>
      <summary>Backlinks</summary>
      <ul>
        <li>
          <a href="/docs/creating-backlinks">Creating Backlinks</a>
        </li>
        <li>
          <a href="/docs/approving-backlinks">Approving Backlinks</a>
        </li>
        <li>
          <a href="/docs/fetching-backlinks">Fetching Backlinks</a>
        </li>
      </ul>
    </details>

    <details>
      <summary>The Community Server</summary>
      <ul>
        <li>
          <a href="/docs/rss-feeds">RSS Feeds</a>
        </li>
        <li>
          <a href="/docs/rest-api">REST API</a>
        </li>
        <li>
          <a href="/docs/hosting-a-community">Hosting a Community</a>
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
