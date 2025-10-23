<script>
  import { page } from '$app/stores'
  import { browser } from '$app/environment'

  // React to URL changes
  $: currentUrl = browser ? $page.url : null

  // Generate RSS URL and description from current URL params
  $: rssUrl = (() => {
    if (!currentUrl) return ''
    if (!browser) return ''
    const url = new URL(window.location.href)
    const pathname = url.pathname
    const params = new URLSearchParams(url.search)



    // For domain pages or other non-/get/ pages, construct RSS URL from params
    if (!pathname.includes('/get/')) {
      // Default to /get/everything/thorped/rss
      return `${url.origin}/get/everything/thorped/rss${params.toString() ? '?' + params.toString() : ''}`
    }

    // For /get/ endpoints, replace format with rss
    const parts = pathname.split('/')
    if (parts.length >= 4) {
      return `${url.origin}/get/${parts[2]}/${parts[3]}/rss${params.toString() ? '?' + params.toString() : ''}`
    }

    return `${url.origin}/get/everything/thorped/rss${params.toString() ? '?' + params.toString() : ''}`
  })()

  // Generate human-readable description from URL params
  $: description = (() => {
    if (!currentUrl) return ''
    if (!browser) return ''
    const url = new URL(window.location.href)
    const params = new URLSearchParams(url.search)
    const pathname = url.pathname
    const parts = []

    // Extract what/by from pathname or default to everything/thorped
    let what = 'everything'
    let by = ''
    if (pathname.includes('/get/')) {
      const pathParts = pathname.split('/')
      if (pathParts[2]) what = pathParts[2]
      if (pathParts[3]) by = pathParts[3]
    }

    parts.push(what)

    // Determine match type
    const match = params.get('match') || 'auto'
    if (match === 'exact' || match === 'auto') {
      parts.push('')
    } else if (match === 'fuzzy-s' || match === 'fuzzy-o') {
      parts.push('mostly')
    } else if (match === 'fuzzy' || match === 'very-fuzzy-o') {
      parts.push('kinda sorta')
    }

    // Add by clause
    parts.push(by)

    // Add thorpe list (objects) - before the site list
    const objects = params.get('o')
    if (objects) {
      const objectList = objects.split(',').map(o => o.trim()).filter(Boolean)
      if (objectList.length > 0) {
        parts.push('#' + objectList.join(' #'))
      }
    }

    // Add site list (subjects)
    const subjects = params.get('s')
    if (subjects) {
      const subjectList = subjects.split(',').map(s => s.trim()).filter(Boolean)
      if (subjectList.length > 0) {
        parts.push('from ' + subjectList.join(', '))
      }
    }

    // Build filters
    const filters = []

    const notSubjects = params.get('not-s')
    if (notSubjects) {
      const notSubjectList = notSubjects.split(',').map(s => s.trim()).filter(Boolean)
      if (notSubjectList.length > 0) {
        filters.push(`excluding sites: ${notSubjectList.join(', ')}`)
      }
    }

    const notObjects = params.get('not-o')
    if (notObjects) {
      const notObjectList = notObjects.split(',').map(o => o.trim()).filter(Boolean)
      if (notObjectList.length > 0) {
        filters.push(`excluding thorpes: ${notObjectList.join(', ')}`)
      }
    }

    const when = params.get('when')
    if (when) {
      filters.push(`when: ${when}`)
    }

    // Build options
    const options = []

    const limit = params.get('limit')
    if (limit) {
      options.push(`limit: ${limit}`)
    }

    const offset = params.get('offset')
    if (offset && offset !== '0') {
      options.push(`offset: ${offset}`)
    }

    // Combine all parts
    let baseDescription = parts.join(' ')
    if (filters.length > 0) {
      baseDescription += ' • ' + filters.join(' • ')
    }
    if (options.length > 0) {
      baseDescription += ' • ' + options.join(' • ')
    }

    return baseDescription
  })()
</script>

<section class="rss-section-header">
  <a href={rssUrl} class="rss-link">
    <img src="/Rss_Shiny_Icon.svg" alt="RSS" width="20" height="20">
    RSS
  </a>
  <p class="rss-caption">{description}</p>
</section>

<style>
  .rss-section-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .rss-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: OCRA;
    font-size: .6rem;
    text-decoration: none;
    color: var(--dark-gray);
    padding: 0.25rem;
    white-space: nowrap;
  }

  .rss-link:hover {
    background-color: yellow;
  }

  .rss-link img {
    flex-shrink: 0;
  }

  .rss-caption {
    margin: 0;
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    color: #666;
    line-height: 1.4;
    flex: 1;
  }
</style>
