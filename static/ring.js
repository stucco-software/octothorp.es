// TODO: 
// - don't duplicate custom welcome messages with multiple components on a page
// - styling
const ring = (o) => {
  return `<style>
  .web-ring {
    background-color: whitesmoke;
    width: 400px;
    padding: 2rem;
    border: outset 6px #333;
  }
  </style>
  <div class="web-ring" data-ring="${o}">
    <article>
      …
    </article>
  </div>`
}

// while not strictly necessary to keep this as a separate template
// doing so makes room to ship multiple templates that can be set by some param

const ringTemplate = (p, d, o) => {
  // let url = new URL(data.uri)
  // let origin = url.origin
  // let oTxt = decodeURIComponent(o)
  let neighbors = webring(p, d);
  console.log(neighbors.previous);
  // hook up params to set labels
  return `
    <section>
        <h3>${o}</h3>
       <a href="${webhooks}"><img src="${webhooks}/badge.png" ></a>
    <p><em>Previous site</em>
    <a href="${neighbors.previous}">${neighbors.previous}</a>
    </p>

  <p><em>Next site</em>
      <a href="${neighbors.next}">${neighbors.next}</a>
  </p>
    </section>

  `
}



const webring = (parentDoc, links) => {
  // Find the index of the current origin in the links array
  const currentIndex = links.indexOf(parentDoc);
  if (currentIndex === -1) {
    return { previous: null, next: null };
  }
    const previousIndex = currentIndex === 0 
    ? links.length - 1 
    : currentIndex - 1;
  
  const nextIndex = currentIndex === links.length - 1 
    ? 0 
    : currentIndex + 1;
  console.log(links[previousIndex])
  console.log(links[nextIndex])

  return {
    previous: links[previousIndex],
    next: links[nextIndex]
  };    
};

const script = document.querySelector('script[data-register]')
const webhooks = script
      .dataset
      .register
      .replace(/\n/g, "")
      .replace(/\t/g, "")
      .replaceAll(" ", "")
      .split(',')
      .map(hook => hook.endsWith('/') ? hook.slice(0, -1) : hook)
const hydrate = async (shadow, o) => {
  console.log(o);
  let responses = await Promise.allSettled(
    webhooks.map(async webhook => await fetch(`${webhook}/domains/`))
  )

  let data = await Promise.allSettled(
    responses
      .filter(r => r.status === 'fulfilled')
      .map(async r => r.value.json())
  )
  let links = data.map(d => d.value.domains)
  console.log(links[0])
  const parentOrigin = window.location.origin;
  console.log("Parent origin: " + parentOrigin)
  const currentSite = "https://sarahkateemerson.com/"

  let template = `${ringTemplate(currentSite, links[0], o)}`
  
  let nodes = [...shadow.querySelectorAll(`[data-ring="${webhooks}"] article`)]
  nodes.forEach(node => node.innerHTML = template)
}
let bannerMsg = "<h3>This site is part of the "+ webhooks +" webring</h3>"
const instantiate = (node) => {


  let o = node.getAttribute("title") || node.innerText.trim()
  if (o){
    bannerMsg = o
  }
  const wrapper = document.createElement('div');
  wrapper.innerHTML = ring(webhooks)
  const shadow = node.attachShadow({mode: 'open'})
  shadow.appendChild(wrapper)
  hydrate(shadow, bannerMsg)
}

customElements.define('web-ring', class extends HTMLElement {
  constructor () {
    super()
    document.addEventListener("DOMContentLoaded", (event) => {
// turning off for now to avoid calling twice

      // let o = encodeURIComponent(this.getAttribute("href") || this.innerText.trim())
      // if (o) {
        // instantiate(this)
      // }
    });
  }
  connectedCallback () {
    // let o = encodeURIComponent(this.getAttribute("href") || this.innerText.trim())
    // if (o.length > 0) {
      instantiate(this)
    // }
  }
})