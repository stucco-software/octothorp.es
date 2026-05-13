<script>
  import { assets } from '$app/paths';
</script>

<footer class="footer op-footer">
	<nav class="cluster op-footer-nav">
  	<a href="/terms">Terms</a>
    <a href="/about/">About</a>
    <a href="https://opencollective.com/stucco-software/projects/octothorpes/donate?interval=oneTime&amount=20&contributeAs=me">
      Support
    </a>
   	<a href="/report">Report a Site</a>
	</nav>

  <div class="op-footer-credit">
  	<p>
    	From <a href="https://stucco.software">Stucco Software</a> & <a href="https://ideastore.dev/">The Idea Store</a>
  	</p>
    <a href="https://octothorp.es">
      <img
        src="{assets}/badge.png"
        alt="Badge for the Octothorpes main ring" />
    </a>
  </div>
</footer>

<style type="text/css">
  /* extend lewk .footer — stack columns, center contents,
   * add page gutters and a hairline above */
  .op-footer {
    flex-direction: column;
    align-items: center;
    text-transform: none;
    letter-spacing: 0;
    font-family: var(--font-body);
    font-size: var(--fs-3);
    color: var(--text-color);
  }
  .op-footer-nav {
    justify-content: center;
    gap: var(--sp-4);
  }
  .op-footer-credit {
    display: grid;
    justify-items: center;
    gap: var(--sp-2);
  }
  .op-footer a {
    color: currentColor;
    text-decoration-skip-ink: auto;
  }
</style>
