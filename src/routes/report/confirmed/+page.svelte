<script type="text/javascript">
  import { page } from '$app/stores'
  let url = $page.url.searchParams.get('u')
</script>

<h1>
  Report received.
</h1>

<p>
  Your report of the following URL has been received:
</p>

<pre>
  <code>
{url}
  </code>
</pre>