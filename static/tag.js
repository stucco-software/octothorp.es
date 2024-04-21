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
    let o = this.innerText
    let href = "htts://octothorp.es"
    let template = `
<a
  rel="${p}"
  referrerpolicy="origin"
  href="${href}/~/${o}?/=${s}">
  #${o}
</a>
    `
    let html = parser
      .parseFromString(template, "text/html")
    this.replaceWith(html.body.firstChild)
  }
}

customElements.define("octo-thorpe", OctoThorpe)
