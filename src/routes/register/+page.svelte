<script type="text/javascript">
  export let form
</script>

<h1>Register your Domain</h1>

<form
  method="POST"
  action="/register">
  <label
    for="domain">
    Your Domain:
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
    Email Address:
  </label>


  <input
    placeholder="you@example.com"
    type="email"
    name="email"
    id="email">
  <p>We'll send you an email once your website has been verified.</p>

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
      I've read the terms of use and verify that my domain is chill.
    </label>
  </div> 

  {#if form?.banned}
    <p>
      <mark>This domain has been banned.</mark>
    </p>
  {/if}

  <p>
    <button>
      Register
    </button>
  </p>
</form>
