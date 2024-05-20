export async function load({ params }){
  const post = await import(`../../../md/${params.slug}.md`)
  console.log(post)
  return {
    "post": 'hey'
  }
}