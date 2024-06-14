<script type="text/javascript">
  export let data
  console.log(data)
</script>

<h1>{data.instance}</h1>

<style>
  header {
    margin-block: var(--lead-4);
    text-align: center;
  }
  header h1 {
    font-size: var(--txt-4);
    word-wrap: anywhere;
    margin: 0;
    line-height: 0.9;
  }
  header p {
    font-size: var(--txt-2);
    line-height: 1.1;
    font-weight: 900;
    letter-spacing: 3px;
  }
  a {
    color: var(--yellow);
    text-align: center;
  }
  a:hover,
  a:focus {
    color: var(--brown);
  }
  main {
    grid-auto-flow: row;
    font-size: var(--txt-1);
    margin-block-end: 12rem;
    grid-template-columns: 1fr 1fr 1fr;
  }
  section p {
    text-align: center;
  }
</style>