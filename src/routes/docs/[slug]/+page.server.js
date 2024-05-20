export async function load({ params }){
  const post = await import(`../../../md/${params.slug}.md`)
  return {
    meta: post.metadata,
    body: post.default.render().html
  }
}