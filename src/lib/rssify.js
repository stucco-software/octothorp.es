const encodedStr = rawStr => rawStr.replace(/[\u00A0-\u9999<>\&]/g, i => '&#'+i.charCodeAt(0)+';')
const rssDescription = d => d ? `<description>${encodedStr(d)}</description>` : ``
const rssID = l => l ? `<guid isPermaLink="true">${l}</guid>` : ``
const rssTitle = t => t ? `<title>${encodedStr(t)}</title>` : ``
const rssLink = l => l ? `<link>${l}</link>` : ``
const rssPubDate = d => d ? `<pubDate>${(new Date(d)).toUTCString()}</pubDate>` : ``
const rssAuthor = a => a && a.guid ? `<author>${a.guid}</author>` : ``
const atomLink = l => l ? `<atom:link href="${l}" rel="self" type="application/rss+xml" />` :
``

const rssItem = item => (new Date(item.pubDate)).toUTCString() != "Invalid Date" && (item.title || item.description) ? `
  <item>
    ${rssTitle(item.title)}
    ${rssDescription(item.description)}
    ${rssAuthor(item.author)}
    ${rssID(item.guid)}
    ${rssPubDate(item.pubDate)}
    ${rssLink(item.link)}
  </item>
` : ''

export const rss = tree => `
  <rss
    xmlns:atom="http://www.w3.org/2005/Atom"
    version="2.0">
    <channel>
      ${rssTitle(tree.channel.title)}
      ${rssLink(tree.channel.link)}
      ${atomLink(tree.channel.link)}
      ${rssDescription(tree.channel.description)}
      ${rssPubDate(tree.channel.pubDate)}
      <lastBuildDate>${(new Date).toUTCString()}</lastBuildDate>
      ${tree.channel.items.map(rssItem).join('')}
    </channel>
  </rss>
`