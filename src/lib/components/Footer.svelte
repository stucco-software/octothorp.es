<script>
  import { assets } from '$app/paths';
</script>
<footer>
	<nav>
  	<a href="/terms">Terms</a>
  	<a href="/privacy">Privacy</a>
    <a href="/about">Demo</a>
	</nav>

  <div class="center">

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
  footer {
    max-width: var(--grid-max-width);
    margin-top: calc(var(--baseline) * 2 - 2px);
    border-top: 2px dotted var(--dark-blue);
    padding-block: calc(var(--baseline) * 1);
    padding-inline: 2ch
  }

  nav {
    display: grid;
    justify-content: center;
    margin-bottom: 2rem;
    display: flex;
    gap: 4ch;
    grid-auto-columns: min-content;
    grid-auto-flow: row dense;
  }

  a {
    text-decoration-skip-ink: auto;
    /*text-decoration: none;*/
    color: currentColor;
  }  
  .center {
    display: grid;
    justify-content: center;
  }
  .center a {
    margin: auto;
  }
</style>