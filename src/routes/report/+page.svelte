<script type="text/javascript">
  export let form
</script>

<h1>
	Report a URL
</h1>
<p>
  If a <mark>Web Page</mark> or <mark>Tag</mark> is innapropriate, spam, malicious, or otherwise against the <a href="/terms">Terms of Use</a> please report the URL here.
</p>

<section class="dotgrid">
  <form
    method="POST"
    action="/report">
    <label
      for="url">
      <span>
        Report this URL:
      </span>
    </label>
    <input
      value={form?.url ?? ''}
      required
      type="url"
      id="url"
      placeholder="https://example.com/~/spam"
      name="url">
    <p>
      <button>
        Submit Report
      </button>
    </p>      
  </form>
</section>

<!-- 
  TK: Authenticated URL Moderation
   1. Enter a URL to authenticate, hit GO
   2. Generate a SK/PK pair and save to local: {url, sk, pk}
   3. Show URL with pk `<link>` tag code, instructions to add to url
   4. Select URL to report with
   5. Add auth url to form
   6. create jwt of payload url, sign with sk
   7. submit to server
   8. Server fetches auth url for pk
   9. uses pk to verify signature on jwt
  10. Grab the payload of the reported url
  11. Create a new Report
        - target: reported url
        - targetDomain: reported URL hostname
        - sound: authenticated url
        - timestamp: now()
 -->
