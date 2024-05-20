function tag(strings, s, p, o, label, hash) {
  return `<style>
    a {
      color: inherit;
    }
    .octo-thorpe {
      display: inline;
    }
    .octo-thorpe[open] {
      display: block;
    }

    .octo-thorpe summary {
      list-style: none;
      cursor: zoom-in;
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
      <mark>${s} ${p} ${o}</mark>
    </article>
  </details>`
}

const linkTemplate = (uri) => `<li>
    <a href="${uri}">
      ${uri}
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
        ${data.octothorpedBy.map(linkTemplate).join(' ')}
      </ul>
    </section>
  `
}

const script = document.querySelector('script[data-register]')
const webhooks = script
      .dataset
      .register
      .replace(/\n/g, "")
      .replace(/\t/g, "")
      .replaceAll(" ", "")
      .split(',')
      .map(hook => hook.endsWith('/') ? hook.slice(0, -1) : hook)

const post = (o) => {
  webhooks.map(webhook => {
    let formData = new FormData()
    formData.append('s', s)
    formData.append('p', p)
    fetch(`${webhook}/~/${o}`, {
      method: "POST",
      body: formData
    })
  })
}

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

customElements.define('octo-thorpe', class extends HTMLElement {
  constructor () {
    super()
    this.s = window.location.href
    console.log(this.s)
    this.p = "octo:octothorpes"
    console.log(this.p)
    this.o = encodeURIComponent(this.getAttribute("href") || this.innerText.trim())
    console.log(this.o)
    console.log(this.innerText)
    console.log(this)
    this.label = this.innerText.trim()
    console.log(this.label)
    const shadow = this.attachShadow({mode: 'open'})
    const wrapper = document.createElement('span');
    console.log(`${this.s} ${this.p} ${this.o} ${this.label}`)
    wrapper.innerHTML = tag`${this.s} ${this.p} ${this.o} ${this.label}`
    shadow.appendChild(wrapper)
    hydrate(shadow, this.o)
  }
  connectedCallback() {

  }
})