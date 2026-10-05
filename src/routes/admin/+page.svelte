<script>
  import { enhance } from '$app/forms'
  export let form
  export let data
</script>

<svelte:head>
  <title>Relay Admin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<h1>Relay Admin</h1>

{#if !data.configured}
  <section>
    <p>
      <span>
        Admin is not configured. Set <code>admin_secret</code> in this relay's
        environment to enable approvals and bans.
      </span>
    </p>
  </section>
{:else}
  <section class="dotgrid">
    <form method="POST" use:enhance>
      <label for="domain">
        <span>Domain:</span>
      </label>
      <input
        value={form?.domain ?? ''}
        required
        type="url"
        id="domain"
        placeholder="https://example.com"
        name="domain">

      <label for="secret">
        <span>Admin Secret:</span>
      </label>
      <input
        required
        type="password"
        id="secret"
        name="secret"
        autocomplete="off">

      <div class="grid">
        <button formaction="?/approve">Approve</button>
        <button formaction="?/ban">Ban</button>
        <button formaction="?/unban">Unban</button>
      </div>

      {#if form?.error}
        <p>
          <span><mark>{form.error}</mark></span>
        </p>
      {/if}

      {#if form?.message}
        <p>
          <span>{form.message}</span>
        </p>
      {/if}
    </form>
  </section>
{/if}
