<script type="text/javascript">
  import TKCard from '$lib/components/TKCard.svelte'
  export let data
  let rss = `${data.instance}rss/`
</script>

<link
  rel="alternate"
  type="application/rss+xml"
  title={data.instance}
  href={rss}>



<section class="dashboard">
  <p>
    <span>
    Welcome to the first Octothorpes ring. add some content. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi aliquam laoreet metus, id elementum tellus vulputate et. Mauris eros est, pulvinar vitae condimentum ac, laoreet tincidunt sem. Proin vel lacus mattis libero varius iaculis. Morbi rutrum porta tristique.
  </span>
  </p>

  <p>
    <span>This Octothorpes Ring is a network of <mark>{data.thorpes}</mark> <a href="/~">tags</a>, <mark>{data.links}</mark> <a href="/backlinks">backlinks</a> and <mark>{data.assertions}</mark> <a href="/bookmarks">bookmarks</a> across <mark>{data.domains}</mark> <a href="/domains">websites.</a></span>
  </p>
</section>

<style type="text/css">
  h1 {
    word-break: break-all;
  }
  .dashboard {
    display: grid;
    grid-template-columns: repeat(auto-fill, 24ch);
    gap: 4ch;
    grid-auto-rows: minmax(0, auto);
  }

  .dashboard p {
    /* border-top: 16px solid var(--bg-color); */
    padding: 1ch;
    font-family: "DOS";

  }
</style>