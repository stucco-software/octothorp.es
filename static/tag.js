class OctoThorpe extends HTMLElement {
  constructor() {
    super()
  }

  async connectedCallback() {
    const parser = new DOMParser()

    let s = window.location.href
    let p = "#:octothorpes"
    console.log(this.getAttribute("href"), this.innerText.trim())
    let o = this.getAttribute("href") || this.innerText.trim()
    console.log(o)
    let label = this.innerText.trim()
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
      fetch(`${webhook}/~/${o}`, {
        method: "POST",
        mode: "cors",
        referrerPolicy: "origin",
        body: formData
      })
    })

    let responses = await Promise.allSettled(
      webhooks.map(async webhook => await fetch(`${webhook}/~/${o}`))
    )

    let data = await Promise.allSettled(
      responses
        .filter(r => r.status === 'fulfilled')
        .map(async r => r.value.json())
    )

    let links = data.map(d => d.value)
    console.log(links)

    const linkTemplate = (uri) => `<li>
<a href="${uri}">
  ${uri}
</a>`

    const serverTemplate = (data) => {
      let url = new URL(data.uri)
      let origin = url.origin
      return `
<p><b>${origin}</b> ${label !== o ? '#' + o : ''}</p>
<ul>${data.octothorpedBy.map(linkTemplate)}</ul>`
  }

    let template = `
<details>
  <summary>#${label}</summary>
  ${links.map(serverTemplate)}
</details>
    `
    let html = parser
      .parseFromString(template, "text/html")
    this.replaceWith(html.body.firstChild)
  }
}

customElements.define("octo-thorpe", OctoThorpe)
