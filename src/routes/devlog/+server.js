import { loadPosts } from '$lib/devlog'

const SITE_TITLE = 'Octothorpes Dev Review'
const SITE_LINK = 'https://octothorp.es/devlog'

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET() {
  const posts = await loadPosts()
  
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${SITE_LINK}</link>
    <description>Development notes and code review items for Octothorpes</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_LINK}" rel="self" type="application/rss+xml"/>
${posts.map(p => `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(p.link)}</link>
      <guid isPermaLink="false">${escapeXml(p.guid)}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${escapeXml(p.title)}</description>
      <content:encoded><![CDATA[${p.html}]]></content:encoded>
    </item>`).join('\n')}
  </channel>
</rss>`

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml'
    }
  })
}
