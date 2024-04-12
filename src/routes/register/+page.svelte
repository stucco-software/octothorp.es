<script type="text/javascript">
  export let form
</script>
<div class="container">
  <main class="grid">
    <h1>Register your Domain</h1>

    <form
      method="POST"
      action="/register">
      <label
        for="domain">
        Your Domain
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
        Email Address for Updates
      </label>
      <input
        placeholder="you@example.com"
        type="email"
        name="email"
        id="email">
      <p>We'll send you an email once your website has been verified.</p>


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
  </main>
</div>

<style type="text/css">
  label, input {
    display: block;
  }
  label {
    margin-block-start: var(--lead-1);
  }
  input {
    margin-block: var(--lead-quarter);
  }
  .inline {
    display: inline-block;
  }
</style>