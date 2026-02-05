// Parse frontmatter from markdown
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  
  const meta = {}
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length) {
      let value = rest.join(':').trim()
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1)
      }
      meta[key.trim()] = value
    }
  }
  return { meta, body: match[2] }
}

// Minimal markdown to HTML
function mdToHtml(md) {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .split('\n\n')
    .map(block => {
      block = block.trim()
      if (!block) return ''
      if (block.startsWith('<')) return block
      return `<p>${block}</p>`
    })
    .join('\n')
}

// Load all posts using Vite's glob import
export async function loadPosts() {
  const modules = import.meta.glob('./posts/*.md', { query: '?raw', import: 'default' })
  const posts = []
  
  for (const [path, loader] of Object.entries(modules)) {
    const content = await loader()
    const { meta, body } = parseFrontmatter(content)
    const filename = path.split('/').pop().replace('.md', '')
    
    posts.push({
      slug: filename,
      title: meta.title || filename,
      date: meta.date || new Date().toISOString(),
      link: meta.link || '',
      guid: meta.guid || filename,
      body,
      html: mdToHtml(body)
    })
  }
  
  return posts.sort((a, b) => new Date(b.date) - new Date(a.date))
}

export { parseFrontmatter, mdToHtml }
