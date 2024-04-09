let origins = ['http://localhost:5174/', 'https://nikolas.ws/']
let thorpes = ['https://nikolas.ws/is']

export async function load(req) {

  const path = req.url.searchParams.get('/')
  const origin = req.request.headers.get('referer')

  // if the origin is registered…
  const verifiedOrigin = origins.includes(origin)
  console.log(`is this origin trusted? ${verifiedOrigin ? 'yes': 'no'}.`)
  if (verifiedOrigin) {
    // add the url to the list of thorpes
    thorpes = [...thorpes, `${origin}${path}`]
  }
  // rturn this thorpe and all subjects which thorpe it
  return {
    thorpe: req.params.thorpe,
    thorpes
  }
}