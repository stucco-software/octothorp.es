// Web component for displaying a webring navigation or blogroll
// Accepts server URL via server attribute and site URL via text content

const ring = (serverUrl) => {
  return `
  <style>
:host {
  --ring-background: white;
  --ring-anchor: #3c7efb;
  --ring-text-color: #333;
  --ring-font: monospace;
  --ring-width: 50vw;
  --ring-highlight: yellow;
  --ring-rule: 2px dashed var(--ring-text-color);
}

.octothorpe-webring {
  background-color: var(--ring-background);
  width: var(--ring-width);
  font-family: var(--ring-font);
  text-align: center;
}

.octothorpe-webring.expanded {
  padding: 2rem;
}

.octothorpe-webring.expanded a {
  padding: 1em;
  font-family: var(--ring-font);
  color: var(--ring-anchor);
}

.octothorpe-webring section {
  display: grid;
  grid-auto-flow: column;
}

.octothorpe-webring.expanded .ring-head {
  border-bottom: var(--ring-rule);
  display: block;
}

.octothorpe-webring.expanded .rand {
  float: left;
  padding: 0px;
}

.octothorpe-webring.expanded div.ring-button-container {
  border-left: var(--ring-rule);
  border-right: var(--ring-rule);
  padding-top: 1rem;
}

.ring-button {
  display: none;
}

img.ring-button {
  margin: auto;
}

.octothorpe-webring.expanded .ring-button {
  overflow: auto;
  display: block;
  padding: .3rem;
}

.octothorpe-webring .ring-button a:hover {
  background-color: var(--ring-background);
}

.octothorpe-webring a:hover {
  background-color: var(--ring-highlight);
  color: var(--ring-text-color);
  text-decoration-style: wavy;
  letter-spacing: 2px;
}

/* Blogroll specific styles */
.octothorpe-webring.blogroll {
  text-align: left;
  padding: 1rem;
}

.octothorpe-webring.blogroll .blogroll-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.octothorpe-webring.blogroll .blogroll-item {
  margin: 0.5rem 0;
  padding: 0.5rem;
  border-bottom: 1px solid #eee;
}

.octothorpe-webring.blogroll .blogroll-item:last-child {
  border-bottom: none;
}

.octothorpe-webring.blogroll .blogroll-link {
  text-decoration: none;
  color: var(--ring-anchor);
  display: block;
}

.octothorpe-webring.blogroll .blogroll-link:hover {
  background-color: var(--ring-highlight);
  color: var(--ring-text-color);
  text-decoration: underline;
}
  </style>
  <div class="ring-content" data-server="${serverUrl}">
  </div>`
}

const ringTemplate = (neighbors, bannerMessage, serverUrl, siteUrl) => {
  // Check if current page is not in the webring (all neighbors are null)
  if (neighbors.previous === null && neighbors.next === null && neighbors.random === null) {
    return `
       <div class='ring-head'><a rel="octo:octothorpes" href="${siteUrl}">${bannerMessage}</a></div>
      <div style="color: red; padding: 1rem;">
      Whoops, looks like this domain is not in that webring.
      </div>
    `;
  }

  return `
    <div class='ring-head'><a rel="octo:octothorpes" href="${siteUrl}">${bannerMessage}</a></div>
    <section>
      <a href="${neighbors.previous}">< Previous site</a>
      <div class="ring-button-container">
        <a href="${neighbors.random}">Random Site</a>
        <a class="ring-button" href="${serverUrl}">
          <img class="ring-button" src="${serverUrl}/badge.png" alt="Webring badge">
        </a>
      </div>
      <a href="${neighbors.next}">Next site ></a>
    </section>
  `
}

const blogrollTemplate = (results, bannerMessage, serverUrl) => {
  if (!results || results.length === 0) {
    return `<div class='ring-head'>${bannerMessage}</div><p>No sites found in the webring.</p>`;
  }

  const listItems = results.map(result => `
    <li class="blogroll-item">
      <a class="blogroll-link" href="${result.uri}" title="${result.title || result.uri}">
        ${result.title || result.uri}
      </a>
      ${result.description ? `<p class="blogroll-description">${result.description}</p>` : ''}
    </li>
  `).join('');

  return `
    <div class='ring-head'>${bannerMessage}</div>
    <ul class="blogroll-list">
      ${listItems}
    </ul>
  `;
}

const webring = (currentSite, links) => {
  const currentIndex = links.indexOf(currentSite);
  if (currentIndex === -1) {

    return { previous: null, next: null, random: null };
  }

  const previousIndex = currentIndex === 0 ? links.length - 1 : currentIndex - 1;
  const nextIndex = currentIndex === links.length - 1 ? 0 : currentIndex + 1;

  const filteredLinks = links.filter((link, index) => {
    return index !== previousIndex && index !== currentIndex && index !== nextIndex;
  });

  const randomIndex = Math.floor(Math.random() * filteredLinks.length);
  const randomEntry = filteredLinks[randomIndex];

  return {
    previous: links[previousIndex],
    next: links[nextIndex],
    random: randomEntry
  };
};

const normalizeUrl = (url) => {
  if (!url) return null;
  // Remove any whitespace
  let normalized = url.replace(/\s/g, '');

  // Ensure it starts with http:// or https://
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }

  // Remove trailing slash
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
};

const constructEndpointUrl = (serverUrl, siteUrl) => {
  if (!serverUrl || !siteUrl) return null;

  const encodedSite = encodeURIComponent(siteUrl);
  return `${serverUrl}/get/domains/in-webring?s=${encodedSite}`;
};

const extractDomainsFromResults = (results) => {
  if (!results || !Array.isArray(results)) {
    return [];
  }

  // Extract URIs from results array, filtering out any null/undefined values
  return results
    .map(result => result?.uri)
    .filter(uri => uri && typeof uri === 'string');
};

const hydrate = async (shadow, bannerMessage, serverUrl, siteUrl, mode) => {
  try {
    if (!serverUrl) {
      throw new Error('No server URL provided');
    }

    if (!siteUrl) {
      throw new Error('No Webring URL provided in component content');
    }

    const endpointUrl = constructEndpointUrl(serverUrl, siteUrl);
    console.log('Fetching from endpoint:', endpointUrl);

    const response = await fetch(endpointUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error('Invalid response format: expected results array');
    }

    let template;

    if (mode === 'blogroll') {
      // Use blogroll mode - display all results as a list
      template = blogrollTemplate(data.results, bannerMessage, serverUrl, siteUrl);
    } else {
      // Use default navigation mode
      const domains = extractDomainsFromResults(data.results);

      if (domains.length === 0) {
        throw new Error('No valid domains found in response');
      }

      // Get current page domain without trailing slash
      const currentDomain = window.location.origin.replace(/\/$/, '');
      console.log(currentDomain)
      const neighbors = webring(currentDomain, domains);
      template = ringTemplate(neighbors, bannerMessage, serverUrl, siteUrl);
    }


    const contentNodes = [...shadow.querySelectorAll('div.ring-content')];
    contentNodes.forEach(node => {
      node.innerHTML = template;
    });
  } catch (error) {
    console.error('Error loading webring data:', error);
    const contentNodes = [...shadow.querySelectorAll('div.ring-content')];
    contentNodes.forEach(node => {
      node.innerHTML = `<div style="color: red; padding: 1rem;">Error loading webring: ${error.message}</div>`;
    });
  }
};

const instantiate = (node) => {
  // Get server URL from server attribute
  let serverUrl = node.getAttribute('server');
  serverUrl = normalizeUrl(serverUrl);

  // Get site URL from text content
  console.log('Raw text content:', node.getAttribute('href'));
  let siteUrl = node.getAttribute('href');
  console.log('Trimmed site URL:', siteUrl);
  siteUrl = normalizeUrl(siteUrl);
  console.log('Normalized site URL:', siteUrl);

  // Get banner message from title attribute or use default
  const bannerMessage = node.getAttribute('title') || `This site is part of the webring`;

  // Get mode from data-mode attribute (defaults to navigation mode)
  const mode = node.getAttribute('data-mode') || 'navigation';
  const appearance = node.dataset.appearance;

  const wrapper = document.createElement('div');
  wrapper.classList.add('octothorpe-webring');

  if (appearance) {
    wrapper.classList.add(appearance);
  }

  if (mode === 'blogroll') {
    wrapper.classList.add('blogroll');
  }

  wrapper.innerHTML = ring(serverUrl);
  const shadow = node.attachShadow({ mode: 'open' });
  shadow.appendChild(wrapper);

  if (!siteUrl) {
    console.error('Site URL is empty after normalization');
    const contentNodes = [...shadow.querySelectorAll('div.ring-content')];
    contentNodes.forEach(node => {
      node.innerHTML = `<div style="color: red; padding: 1rem;">Error: No site URL provided in component content. Make sure to include the URL between the web-ring tags.</div>`;
    });
    return;
  }

  hydrate(shadow, bannerMessage, serverUrl, siteUrl, mode);
};

customElements.define('web-ring', class extends HTMLElement {
  connectedCallback() {
    instantiate(this);
  }
});
