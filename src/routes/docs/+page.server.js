export async function load({ params }){
  const post = await import(`../../md/docs.md`)
  return {
    meta: post.metadata,
    body: post.default.render().html
  }
}