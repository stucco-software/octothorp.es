<script type="text/javascript">
  import { page } from '$app/stores'
  let domain = $page.url.searchParams.get('d')
  let challenge = $page.url.searchParams.get('c')
</script>

<h1>
  Verify your domain.
</h1>

<p>
  To ensure that you own <code>{domain}</code>, please add the following TXT record to your DNS records:
</p>

<pre>
  <code>
TXT _#-challenge {challenge}
  </code>
</pre>