import { json } from '@sveltejs/kit'
import { load } from './load.js'
import { index } from './index.js'

// Accept a request object
export async function GET({params}) {
  const post = await import(`../../../md/${params.slug}.md`)
  return json({
    meta: post.metadata,
    body: post.default.render().html
  })
}