<script type="text/javascript">
  export let form
</script>

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
    name="domain">
  <label
    for="acceptTerms">
    I've read the terms of use and verify that my domain is chill.
  </label>
  <input
    required
    type="checkbox"
    id="acceptTerms"
    name="acceptTerms">

  {#if form?.banned}
    <p>
      <mark>This domain has been banned.</mark>
    </p>
  {/if}

  <button>
    Register
  </button>
</form>