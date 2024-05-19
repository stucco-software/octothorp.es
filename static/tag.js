// TODO: Golf this down to SMOL
// const parser = new DOMParser()
// const script = document.querySelector('script[data-register]')
// const webhooks = script
//       .dataset
//       .register
//       .replace(/\n/g, "")
//       .replace(/\t/g, "")
//       .replaceAll(" ", "")
//       .split(',')
//       .map(hook => hook.endsWith('/') ? hook.slice(0, -1) : hook)
// const s = window.location.href
// const p = "octo:octothorpes"
//
// const post = (o, e = '~') => {
//   webhooks.map(webhook => {
//     let formData = new FormData()
//     formData.append('s', s)
//     formData.append('p', p)
//     fetch(`${webhook}/${e}/${o}`, {
//       method: "POST",
//       body: formData
//     })
//   })
// }
//
// const getO = (node) => encodeURIComponent(node.getAttribute("href") || node.innerText.trim())
//
// const registerBacklinks = () => {
//   let backlinks = [...document.querySelectorAll("[rel='octo:octothorpes']")]
//   backlinks.forEach(a => {
//     let o = getO(a)
//     post(o, `>`)
//   })
// }
//
// const hydrate = async (o) => {
//   let responses = await Promise.allSettled(
//     webhooks.map(async webhook => await fetch(`${webhook}/~/${o}`))
//   )
//   let data = await Promise.allSettled(
//     responses
//       .filter(r => r.status === 'fulfilled')
//       .map(async r => r.value.json())
//   )
//   let links = data.map(d => d.value)
//
//   const linkTemplate = (uri) => `<li>
//   <a href="${uri}">
//     ${uri}
//   </a>
// </li>`
//
//     const serverTemplate = (data) => {
//       let url = new URL(data.uri)
//       let origin = url.origin
//       let oTxt = decodeURIComponent(o)
//       return `
//         <section>
//           <p>
//             <b>
//               <a
//                 rel="octo:octothorpes"
//                 href="${origin}/~/${oTxt}">
//                 ${origin}
//               </a>
//             </b>
//           </p>
//           <ul>
//             ${data.octothorpedBy.map(linkTemplate).join(' ')}
//           </ul>
//         </section>
//       `
//   }
//
//     let template = `<article>
//   ${links.map(serverTemplate)}
// </article>`
//
//     let html = parser
//       .parseFromString(template, "text/html")
//
//     let nodes = [...document.querySelectorAll(`[data-o="${o}"] article`)]
//     nodes.forEach(node => node.replaceWith(html.body.firstChild))
// }
//
// class OctoThorpe extends HTMLElement {
//   constructor() {
//     super()
//   }
//
//   async connectedCallback() {
//     let o = getO(this)
//     let label = this.innerText.trim()
//     let template = `
// <details class="octo-thorpe" data-o=${o}>
//   <summary>${label}</summary>
//   <article></article>
// </details>
//     `
//     let html = parser
//       .parseFromString(template, "text/html")
//     this.replaceWith(html.body.firstChild)
//     await hydrate(o)
//     post(o)
//   }
//
//   async disconnectedCallback() {
//     console.log('disconnected')
//   }
// }
//
// customElements.define("octo-thorpe", OctoThorpe)
// needs to listen on mutations like pushbroom does
// registerBacklinks()

function tag(strings, s, p, o, label, hash) {
  return `<style>
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

customElements.define('octo-thorpe', class extends HTMLElement {
  constructor () {
    super()
    this.s = window.location.href
    this.p = "octo:octothorpes"
    this.o = encodeURIComponent(this.getAttribute("href") || this.innerText.trim())
    this.label = this.innerText.trim()
    const shadow = this.attachShadow({mode: 'closed'})
    const wrapper = document.createElement('span');
    wrapper.innerHTML = tag`${this.s} ${this.p} ${this.o} ${this.label}`
    shadow.appendChild(wrapper)
  }
})