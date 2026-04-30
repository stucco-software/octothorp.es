export async function load() {
  const post = await import('../../md/ethos.md')
  return {
    body: post.default.render().html
  }
}
