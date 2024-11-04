<script type="text/javascript">
  export let form
  import { assets } from '$app/paths';
  const badgeCode = `<a href="https://octothorp.es"><img src="https://octothorp.es/badge.png" alt="Badge for the Octothorpes main ring" /></a>`;
</script>

<h1>Register your Domain</h1>
<section class="dotgrid">
  <!-- <iframe src="https://embeds.beehiiv.com/622f1b7c-3782-45cc-8991-e78207df2960" data-test-id="beehiiv-embed" width="100%" height="320" frameborder="0" scrolling="no" style="border-radius: 4px; border: 2px solid #e5e7eb; margin: 0; background-color: transparent; max-width: 44ch"></iframe>
  <p>
    Domain registrations are temporarily closed.
  </p> -->
<form
    method="POST"
    action="/register">
    <label
      for="domain">
      <span>
        Your Domain:
      </span>
    </label>
    <input
      value={form?.domain ?? ''}
      required
      type="url"
      id="domain"
      placeholder="https://example.com"
      name="domain">
    <label
      for="email">
      <span>
        Email Address:
      </span>
    </label>
    <input
      placeholder="you@example.com"
      required
      type="email"
      name="email"
      id="email">
    <p>
      <span>We'll send you an email once your website has been verified.</span>
    </p>

    <div class="grid">
      <input
      required
      class="inline"
      type="checkbox"
      id="acceptTerms"
      name="acceptTerms">
      <label
        class="inline"
        for="acceptTerms">
        <span>
          I've read the terms of use and verify that my domain is chill.
        </span>
      </label>

      <p>
        <button>
          Register
        </button>
      </p>

    </div>

    {#if form?.banned}
      <p>
        <span>
          <mark>This domain has been banned.</mark>
        </span>
      </p>
    {/if}


  </form>
  <div>
    <h3><span>Once you're verified: </span></h3>
    <p><span>Here's some flair to show off your membership in the first Octothorpes Ring.</span></p>
    <p><a href="https://octothorp.es"><img src="{assets}/badge.png" alt="Badge for the Octothorpes main ring" /></a></p>
    
    <p>Copy this to put it on your site:</p>
    <code>{badgeCode}</code>
  </div>
</section>
<section>
  
</section>