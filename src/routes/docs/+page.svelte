<main class="container">
  <section class="grid">
    <h1>Docs</h1>
    <ol>
      <li>
        <a href="#what">What Is This?</a>
      </li>
      <li>
        <a href="#how">How It Works</a>
      </li>
      <li>
        <a href="#why">Why Tho</a>
      </li>
    </ol>
  </section>

  <section id="what" class="grid">
    <h2>What Is This?</h2>

    <p>Octothorpes are hashtags for websites — creating simple, meaningful connections across cozyweb spaces. Octothorpes are way of extending an old-school webrings into RSS feeds, and discovering stuff you can care about.</p>

    <p>
      Each Octorhorpe surfaces it's own RSS feed and JSON API endpoint. Discover new things and watch ideas grow.
    </p>
  </section>

  <section id="how" class="grid">
    <h2>How It Works</h2>
    <ol>
      <li>
        <a href="/register">Register your domain</a> with the Octothorpes community.
      </li>
      <li>
        Add the `TXT` record to your DNS to verify that it's <em>your</em> domain.
      </li>
      <li>
        <a href="/domains">Check back</a> to see when your domain is approved. We'll email you if you provided a contact address.
      </li>
      <li>
        Add a link on your website to an #octothorpe:
        <code>&lt;a href="https://octothorp.es/~/someThorpe?/=page/path"&gt;#someThorpe&lt;/a&gt;</code>
      </li>
      <li>
        Follow that link to register it.
      </li>
    </ol>

    <h3>1. Registering a Domain</h3>
    <p>
      Octothorpes is opt-in, and requires registering your domain with the server. This is how we keep track of relationships, and gives is a opportunity to enforce our <a href="/terms">community standards</a>. Octothropes is about community, and community only works with active moderation. Registration helps us weed out bad actors, spammers, and shitheads.
    </p>

    <h3>2. TXT Record Verification</h3>
    <p>
      Octothorpes has no authentication or access control systems. Instead, we just ensure that whoever registered a domain actually controls that domain. By adding a <code>TXT Record</code> to your <code>DNS</code> provider, we can make sure that a websites owner is the one who wants to contribute.
    </p>

    <h3>3. Domain Approval</h3>
    <p>
      A human being looks at every website that wants to contribute Octothorpes. If the site goes against our community standards, we don't allow them to contribute. If your website is chill, we'll greenlight it and add it to our <a href="/domains">list of sites</a>.
    </p>

    <h3>4. Octothorpe Links</h3>
    <p>
      To contribute, all you have to do is add a link to the <a href="/~/octothorpes">#octothorpe</a> to your web page.
    </p>
    <pre><code>&lt;a
  href="https://www.octothorp.es/~/octothorpes?/=your-page"&gt;
  #octothorpe
&lt;/a&gt;</code></pre>
    <p>
      There are a couple important things happening with this link that make it work as an Octothorpe. Lets go over them quickly:
    </p>
    <p>
      First thing is that the text of the link can be anything you want. In this exacle it's <code>#octothorpe</code>, but changing this doesn't change the function at all. You don't even nee the <code>#</code>, but it is fun.
    </p>

    <p>
      The link to <code>https://www.octothorp.es/~</code> is how you register with <em>this</em> Octothoropes instance.
    </p>

    <p>
      The <code>/octothorpes</code> part of the link is the octothorpe itself you want to create. You can create any octothorpe you want, but any new ones will be manually checked against our <a href="/terms">guidelines</a>.
    </p>

    <p>
      To register the source of the Octothorpe, you need to add the <code>?/=your-page</code> bit, where <code>your-page</code> is the path to the specific page on your website. Our server can see the referring domain, but we can't see the exact originating URL. This lets is connect the two and create the URL to the page that created the link.
    </p>

    <aside>
      <p>
        <b>Note:</b> before creating a new Octothorpe on the server, the system checks to make sure that this link is <em>actually present</em> on the webpage. It does this by calling the URL you provided, and making sure the link is present in the response. This means that people visiting your website can't create their own Octothropes from your pages. This also means that any Octothorpe links created in the browser don't count.
      </p>
    </aside>
  </section>

  <h3>5. Follow The Link</h3>
  <p>
    Lastly, once the link is on your website click through to follow it. The first time someone clicks an Octothorpe link on your webpage it will be validated and created.
  </p>

  <section class="grid" id="why">
    <h2>Why Tho</h2>
    <p>
      Search is broken, social media sucks, and finding good stuff on the internet is hard now. Building new ways of connecting our websites to each other can start to work against the logic of the personal, social, always-on feed of constant updates. Octothorpes is a new way to tend the garden of the internet. It's a collective, meandering, slow river that you can watch roll by.
    </p>
  </section>
</main>