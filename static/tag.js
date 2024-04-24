class OctoThorpe extends HTMLElement {
  constructor() {
    super()
  }

  async connectedCallback() {
    const parser = new DOMParser()

    let s = window.location.href
    let p = "#:octothorpes"
    let o = this.innerText.trim()
    // let href = "https://octothorp.es"

    let script = document.querySelector('script[data-register]')
    let webhooks = script
      .dataset
      .register
      .replace(/\n/g, "")
      .replace(/\t/g, "")
      .replaceAll(" ", "")
      .split(',')


    webhooks.map(webhook => {
      let formData = new FormData()
      formData.append('s', s)
      formData.append('p', p)
      console.log(formData)
      fetch(`${webhook}/~/${o}`, {
        method: "POST",
        mode: "cors",
        referrerPolicy: "origin",
        body: formData
      })
    })

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
