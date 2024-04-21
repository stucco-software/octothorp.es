class OctoThorpe extends HTMLElement {
  constructor() {
    super()
  }

  async connectedCallback() {
    const parser = new DOMParser()

    let o = this.innerText
    let href = "htts://octothorp.es"
    let template = `
<a
  rel="htts://octothorp.es/vocabulary#octothorpes"
  referrerpolicy="origin"
  href="${href}/~/${o}">
  #${o}
</a>
    `
    let html = parser
      .parseFromString(template, "text/html")
    this.replaceWith(html.body.firstChild)
  }
}

customElements.define("octo-thorpe", OctoThorpe)
