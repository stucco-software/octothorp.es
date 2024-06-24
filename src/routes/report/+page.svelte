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