const tag = (o, label, flags) => {
  return `<style>
    a {
      color: inherit;
    }
    .octo-thorpe {
      display: inline;
      -webkit-appearance:none;
    }
    .octo-thorpe[open] {
      display: block;
    }

    .octo-thorpe summary {
      list-style: none;
      cursor: zoom-in;
      -webkit-appearance:none;
    }

    .octo-thorpe summary::-webkit-details-marker {
      display:none;
    }

    .octo-thorpe summary::before {
      padding-inline-end: 0.1em;
      content: "#";
      font-weight: bold;
      display: inline-block;
      transform: rotate(30deg);
    }
    .octo-thorpe[open] summary::before {
      transform: rotate(0);
    }

    .octo-thorpe p {
      padding: 0;
      margin: 0;
    }

    .octo-thorpe ul {
      padding: 0 0 1em 1em;
      margin: 0;
    }
  </style>
  <details class="octo-thorpe" data-o="${o}">
    <summary>${label}</summary>
    <article>
      …
    </article>
  </details>`
}

const linkTemplate = (node) => `<li>
    <a href="${node.uri}">
      ${node.title ? node.title : node.uri}
    </a>
  </li>
`

const serverTemplate = (o) => (data) => {
  let url = new URL(data.uri)
  let origin = url.origin
  let oTxt = decodeURIComponent(o)
  return `
    <section>
      <p>
        <b>
          <a
            rel="octo:octothorpes"
            href="${origin}/~/${oTxt}">
            ${origin}
          </a>
        </b>
      </p>
      <ul>
        ${data.thorpes.map(linkTemplate).join(' ')}
      </ul>
    </section>
  `
}

const script = document.querySelector('script[src*="tag.js"]')

const plugins = script.dataset.plugins

if (plugins === "linkfill") {
  console.log("do link fill");
  const preloadLink = document.querySelector('link[rel="preload"][as="fetch"]');
  const baseUrl = script.dataset.register+"?uri=";
  const currentUrl = encodeURI(window.location.href);

  if (preloadLink) {
  const preloadLinks = document.querySelectorAll('link[rel="preload"][as="fetch"]');
        preloadLinks.forEach(preloadLink => {

            let existingHref = preloadLink.getAttribute('href');
            if (existingHref && existingHref.trim() !== '') {
                preloadLink.setAttribute('href', existingHref + currentUrl);
            } else {
                preloadLink.setAttribute('href', baseUrl + currentUrl);
            }
        });
      } else {
          preloadLink.setAttribute('href', baseUrl + currentUrl);
      }
  }
else
{
  let link = document.createElementNS('http://www.w3.org/1999/XHTML/V10', 'link');
  link.setAttribute("rel", 'preload');
  link.setAttribute("as", 'fetch');
  link.setAttribute("href", preloadHref);
  document.head.appendChild(link);
}


const webhooks = script
      .dataset
      .register
      .replace(/\n/g, "")
      .replace(/\t/g, "")
      .replaceAll(" ", "")
      .split(',')
      .map(hook => hook.endsWith('/') ? hook.slice(0, -1) : hook)

const hydrate = async (shadow, o) => {
  let responses = await Promise.allSettled(
    webhooks.map(async webhook => await fetch(`${webhook}/~/${o}`))
  )

  let data = await Promise.allSettled(
    responses
      .filter(r => r.status === 'fulfilled')
      .map(async r => r.value.json())
  )

  let links = data.map(d => d.value)
  let template = `${links.map(serverTemplate(o))}`

  let nodes = [...shadow.querySelectorAll(`[data-o="${o}"] article`)]
  nodes.forEach(node => node.innerHTML = template)
}

const instantiate = (node) => {
  let o = encodeURIComponent(node.getAttribute("href") || node.innerText.trim())
  const attributes = Array.from(node.attributes).filter(attr => attr.name.startsWith('data-'))
  let flags =  attributes.map(attr => ({ [attr.name]: attr.value }))
  let label = node.innerText.trim()
  const wrapper = document.createElement('span');
  wrapper.innerHTML = tag(o, label)
  const shadow = node.attachShadow({mode: 'open'})
  shadow.appendChild(wrapper)
  hydrate(shadow, o, flags)
}

customElements.define('octo-thorpe', class extends HTMLElement {
  constructor () {
    super()
    document.addEventListener("DOMContentLoaded", (event) => {
      let o = encodeURIComponent(this.getAttribute("href") || this.innerText.trim())
      if (o) {
        instantiate(this)
      }
    });
  }
  connectedCallback () {
    let o = encodeURIComponent(this.getAttribute("href") || this.innerText.trim())
    if (o.length > 0) {
      instantiate(this)
    }
  }
})
