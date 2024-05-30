!async function(w, d) {
  const js = d.querySelector('script[data-register]')

  const hs = js
              .dataset
              .register
              .replace(/\n/g, "")
              .replace(/\t/g, "")
              .replaceAll(" ", "")
              .split(',')
              .map(h => h.endsWith('/') ? h.slice(0, -1) : h)

  const post = ({s, p, o}) => {
    hs.map(h => {
      let f = new FormData()
      f.append('s', s)
      f.append('p', p)
      fetch(`${h}/>/${o}`, {
        method: "POST",
        body: f
      })
    })
  }

  d
    .querySelectorAll('[rel="octo:octothorpes"]')
    .forEach(n => {
      let s = w.location.href
      let p = "octo:octothorpes"
      let o = encodeURIComponent(n.getAttribute("href"))
      post({s, p, o})
    })
}(window, document)