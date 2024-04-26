class OctoThorpe extends HTMLElement {
  constructor() {
    super()
  }

  async connectedCallback() {
    const parser = new DOMParser()

    let s = window.location.href
    let p = "octo:octothorpes"
    let o = encodeURIComponent(this.getAttribute("href") || this.innerText.trim())
    let label = this.innerText.trim()

    let script = document.querySelector('script[data-register]')
    let webhooks = script
      .dataset
      .register
      .replace(/\n/g, "")
      .replace(/\t/g, "")
      .replaceAll(" ", "")
      .split(',')
      .map(hook => hook.endsWith('/') ? hook.slice(0, -1) : hook)

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
      let oTxt = decodeURIComponent(o)
      return `<section>
<p><b>${origin}</b> ${label !== oTxt ? '#' + oTxt : ''}</p>
<ul>${data.octothorpedBy.map(linkTemplate)}</ul></section>`
  }

    let template = `
<details class="octo-thorpe">
  <summary>${label}</summary>
  <article>${links.map(serverTemplate)}</article>
</details>
    `
    let html = parser
      .parseFromString(template, "text/html")
    this.replaceWith(html.body.firstChild)
  }
}

customElements.define("octo-thorpe", OctoThorpe)
