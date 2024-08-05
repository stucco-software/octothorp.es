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

<section class="dotgrid">
  {#each thorpes as thorpe}
    <span>
      <a class="thorpe" href="{thorpe}">#{thorpe.split('/~/')[1]}</a>
    </span>
  {/each}
</section>

<style type="text/css">
  form {
    margin-block-end: var(--baseline);
  }
  input {
    width: 100%;
  }
  span {
    margin-inline-end: 1ch;
  }
</style>