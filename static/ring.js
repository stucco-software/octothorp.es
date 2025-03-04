


// TODO: 
// - don't duplicate custom welcome messages with multiple components on a page

const ring = (o) => {
  return `
  <style>

:host {
  
  --ring-background: white;
  --ring-anchor: #3c7efb;
  --ring-text-color: #333;
  --ring-font: monospace;
  --ring-width: 50vw;
  --ring-highlight: yellow;
  --ring-rule: 2px dashed var(--ring-text-color);
}
.octothorpe-webring {
  background-color: var(--ring-background);
  width: var(--ring-width);
  font-family: var(--ring-font);
  text-align: center;
}

.octothorpe-webring.expanded {
  padding: 2rem;
}

.octothorpe-webring.expanded a {
padding: 1em;
font-family: var(--ring-font);
  color: var(--ring-anchor);
}


.octothorpe-webring section {
  display: grid;
  grid-auto-flow: column;
  }



.octothorpe-webring.expanded .ring-head {
  border-bottom: var(--ring-rule);
  display: block;
}

.octothorpe-webring.expanded .rand {
  float: left;
  padding: 0px;
}

  .octothorpe-webring.expanded div.ring-button-container {
    border-left: var(--ring-rule);
    border-right: var(--ring-rule);
    padding-top: 1rem;
  }

  .ring-button {
    display: none;
  }

  img.ring-button {
    margin: auto;
  }

  .octothorpe-webring.expanded .ring-button {
    overflow: auto;
    display: block;
    padding: .3rem;
  }

  .octothorpe-webring .ring-button a:hover {
    background-color: var(--ring-background);
  }
.octothorpe-webring a:hover {
  background-color: var(--ring-highlight);
  color: var(--ring-text-color);
  text-decoration-style: wavy;
  letter-spacing: 2px;

}



  </style>
  <div class="ring-content" data-ring="${o}">
  </div>`
}

// while not strictly necessary to keep this as a separate template
// doing so makes room to ship multiple templates that can be set by some param

const ringTemplate = (n, o) => {
  // hook up params to set labels
  return `
    <div class='ring-head'>${o}</div>
    <section>

      <a href="${n.previous}">< Previous site</a>

    <div class="ring-button-container">
      <a href="${n.random}">Random Site</a>
      <a class="ring-button" href="${webhooks}">
      
      <img class="ring-button" src="${webhooks}/badge.png" ></a>

    </div>

    <a href="${n.next}">Next site ></a>

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

  const filteredLinks = links.filter((link, index) => {
    return index !== previousIndex && index !== currentIndex && index !== nextIndex;
  });

  let randomIndex = Math.floor(Math.random() * filteredLinks.length);


// Get a random entry from the array that does not match any of the values we want to exclude
const randomEntry = filteredLinks[randomIndex];
  return {
    previous: links[previousIndex],
    next: links[nextIndex],
    random: filteredLinks[randomIndex]
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
    webhooks.map(async webhook => 
      await fetch(`${webhook}/domains`)
    )
  )

  let data = await Promise.allSettled(
    responses
      .filter(r => r.status === 'fulfilled')
      .map(async r => r.value.json())
  )
  let links = data.map(d => d.value.domains)
  console.log(links[0])
  const parentOrigin = window.location.origin;
  // console.log("Parent origin: " + parentOrigin)
  const currentSite = `${parentOrigin}/`
  const testSite = "https://www.mmmx.cloud/"


  let neighbors = webring(currentSite, links[0]);
  let template = `${ringTemplate(neighbors, o)}`
  
  let nodes = [...shadow.querySelectorAll(`div.ring-content`)]
  nodes.forEach(node => node.innerHTML = template)
}
let bannerMsg = "<h3>This site octothorpes on the "+ webhooks +" webring</h3>"
const instantiate = (node) => {
    
  let o = node.getAttribute("title") || node.innerText.trim()

  if (o){
    bannerMsg = o
  }

  let appearance = node.dataset.appearance;

  const wrapper = document.createElement('div')
  wrapper.classList.add("octothorpe-webring")

  if (appearance){
    wrapper.classList.add(appearance)
  }
  wrapper.innerHTML = ring(webhooks)
  const shadow = node.attachShadow({mode: 'open'})
      // Add styles first
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