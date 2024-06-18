<script type="text/javascript">
  export let data
  let thorpes = [...data.thorpes]
  let value
  $: {
    thorpes = value
      ? [...data.thorpes].filter(n => n.includes(value))
      : [...data.thorpes]
  }
</script>

<form>
  <label
    for="value">
    Filter
  </label>
  <input
    placeholder="#…"
    type="text"
    bind:value={value}
    name="filter">
</form>

{#each thorpes as thorpe}
  <a class="thorpe" href="{thorpe}">#{thorpe.split('/~/')[1]}</a>
{/each}

<style type="text/css">
  form {
    margin-block-end: var(--baseline);
  }
  input {
    width: 100%;
  }
  a {
    margin-inline-end: 1ch;
  }
</style>