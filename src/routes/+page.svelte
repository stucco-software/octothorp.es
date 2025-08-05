<script type="text/javascript">
  import BearblogCard from '$lib/components/bearblogCard.svelte'
  import Contribute from '$lib/components/Contribute.svelte'
  export let data
  export let server_name
  import { assets } from '$app/paths';
  let rss = `${data.instance}rss/`
</script>

<link
  rel="alternate"
  type="application/rss+xml"
  title={data.instance}
  href={rss}>

<div class="title-card">
  <h1>Enjoy the World <br><em>Wide</em> Web</h1>
  <p>
    Octothorpes are hashtags and backlinks that can be used on regular websites, connecting pages across the open internet regardless of where they're hosted.
  </p>

  <p>
    This Server is a network of <mark>{data.thorpes}</mark> <a href="/~">Tags</a> across <mark>{data.domains}</mark> <a href="/domains">Websites.</a>
   </p>

</div>

<div class="dotgrid">
  <div class="dashboard">
    <section class="testimonial">
      <p>The latest web nerd feature.</p>
      <p class="attribution">—&nbsp;Anil Dash</p>
    </section>
    <section class="testimonial">
      <p>You've built something that has enriched a human life a little bit! That's rad as hell.</p>
      <p class="attribution"><a href="https://mastodon.sprawl.club/@ludicity/113354467436519124">—&nbsp;Ludic</a></p>
    </section>
    <section class="testimonial">
      <p>The whole thing is clearly half-baked, written by someone who doesn't understand the meanings and reasons for things.</p>
      <p class="attribution"><a href="https://news.ycombinator.com/item?id=41761873">—&nbsp;Some dude on hackernews</a></p>
    </section>
  </div>

  <Contribute />
</div>


<div class="breaking">
  <header>
    <h2>Server News</h2>
    <p># # # # # # # # # # </p>
  </header>

  <section>
    {#if data.server_name === 'Bear Blog'}
      <date>June 9th, 2025</date>
      <h3><mark>Welcome, Bear Bloggers</mark></h3>
      <p>This is an <a href="https://octothorpe.es/about">Octothorpe relay</a> that lets you use hashtags and backlinks on your blog.</p>
      <p>It's only open to blogs using the Bear platform.</p>
    {:else}
      <!-- <p>Please stand by while we resolve resolve technical difficulties.</p> -->
      <img
        class="launch"
        src="https://docs.octothorp.es/img/duplo-VhqQHkGxOq-__482__.webp">
      <date>August 1st, 2025</date>
      <h3><mark>Version 0.5 released</mark></h3>
      <p>Take a journey through what <a href="https://docs.octothorp.es/pitch">Octothorpes has to offer</a> on our <a href="https://docs.octothorp.es/">New documentation site.</a></p>
    {/if}
  </section>
</div>

<style type="text/css">

  h1 {
    text-align: center;
    font-family: var(--serif-stack);
    font-weight: 400;
    font-size: var(--txt-4);
    line-height: 1.1;
  }
  .title-card p {
    font-size: var(--txt-1);
    line-height: 1.1;
    max-width: 18em;
    margin: auto;
    margin-block-end: var(--lead-2);
  }

  .dashboard {
    font-family: "DOS";
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4ch;
    grid-auto-rows: max-content
  }
  @media (max-width: 800px) {
    .dashboard {
      grid-template-columns: repeat(1, 1fr);
    }

  }


  .dashboard section, .dashboard p span {
    background-color: lightgoldenrodyellow;
    outline: 1ch solid var(--bg-color);
    }
  .dashboard section {
    padding: 1ch 1ch 2ch 1ch;
  }
  section.testimonial {
    border: 1px solid var(--txt-color);
    background-color: var(--bg-color);
    filter: drop-shadow(1ch 1ch 1px var(--bios-gray));
    display: flex;
    flex-direction: column;
  }

  section.testimonial p {
    font-size: var(--txt-0);
    line-height: 1.1;
    margin-block-end: 1rem;
    padding: .5ch;
    color: var(--txt-color);
  }

  section.testimonial p:hover {
    color: blue;
  }
  hr {
    border: 2px dashed var(--bg-color);
  }

  .attribution {
    text-align: right;
    margin-block-start: auto;
}

  .breaking {
    max-width: 24rem;
    margin-inline: auto;
  }
  .breaking section {
    margin-top: 0;
    background-color: lightgoldenrodyellow;
    padding: 3ch;
  }
  .breaking header {
    margin-block-start: 2rem;
    text-align: center;
  }
  .breaking header h2 {
    font-family: var(--serif-stack);
    font-size: var(--txt-1);
    margin-block: 0;
  }
  .breaking  h3 {
    font-family: var(--serif-stack);
    font-size: var(--txt-0);
    margin-block-end: 0.5rem;
    margin-block-start: 0.5rem;
  }
  .breaking header p {
    /*letter-spacing: -0.2ch;*/
    font-weight: bold;
    font-family: var(--sans-stack);
    font-size: var(--txt--1);
  }
  .breaking p {
    font-family: var(--sans-stack);
    font-size: var(--txt--1);
    line-height: 1.3;
  }
  .launch {
    width: 190px;
    max-width: 40%;
    float: right;
    padding: 1ch;
  }
</style>
