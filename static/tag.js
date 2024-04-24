class OctoThorpe extends HTMLElement {
  constructor() {
    super()
  }

  async connectedCallback() {
    const parser = new DOMParser()
    let path = window.location.pathname
    let s = path.startsWith('/')
      ? path.replace('/', '')
      : path
    let p = "https://octothorp.es/vocabulary#octothorpes"
    let o = this.innerText.trim()
    // let href = "https://octothorp.es"

    let script = document.querySelector('script[data-register]')
    let register = script
      .dataset
      .register
      .replace(/\n/g, "")
      .replace(/\t/g, "")
      .replaceAll(" ", "")
      .split(',')

    let webhooks = register.map(href => `${href}/~/${o}?/=${s}`)
    webhooks.map(webhook => fetch(webhook, {
      method: "POST",
      mode: "cors",
      referrerPolicy: "origin"
    }))

    let template = `
<a
  rel="${p}"
  href="#">
  #${o}
</a>
    `
    let html = parser
      .parseFromString(template, "text/html")
    this.replaceWith(html.body.firstChild)
  }
}

customElements.define("octo-thorpe", OctoThorpe)
