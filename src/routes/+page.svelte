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



<div class="dashboard dotgrid">
<section>
  <p>Welcome to the first Octothorpes ring.</p>
  <p># # # # # # # # # # # </p>
  <em>News from the Ring</em>
    <a href="/~/weirdweboctober">Weird Web October has almost wrapped! Last day to post!</a>

</section>
<section>
  <p>
    This Octothorpes Ring is a network of <mark>{data.thorpes}</mark> <a href="/~">tags</a>, <mark>{data.links}</mark> <a href="/backlinks">backlinks</a> and <mark>{data.assertions}</mark> <a href="/bookmarks">bookmarks</a> across <mark>{data.domains}</mark> <a href="/domains">websites.</a>
   </p> 
</section>
</div>

<style type="text/css">
  h1 {
    word-break: break-all;
  }
  .dashboard {
    display: grid;
    grid-template-columns: repeat(auto-fill, 24ch);
    gap: 4ch;
    grid-auto-rows: max-content
  }

  .dashboard {
    /* border-top: 16px solid var(--bg-color); */
    font-family: "DOS";

  }
  .dashboard section, .dashboard p span {
  background-color: lightgoldenrodyellow;
  outline: 1ch solid var(--bg-color);
}
  .dashboard section {
    padding: 1ch 1ch 2ch 1ch;
    border-radius: 2px;
  }

  hr {
    border: 2px dashed var(--bg-color);
  }
</style>