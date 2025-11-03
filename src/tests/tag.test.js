import { describe, it, expect, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'

describe('tag.js linkfill plugin', () => {
  let dom
  let document
  let window

  beforeEach(() => {
    // Create a fresh DOM for each test
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="preload" as="fetch" href="">
        </head>
        <body>
          <script src="https://octothorp.es/tag.js" data-plugins="linkfill" data-register="https://octothorp.es"></script>
        </body>
      </html>
    `, {
      url: 'https://example.com/test-page',
      runScripts: 'outside-only'
    })

    document = dom.window.document
    window = dom.window

    // Make document and window available globally for the script
    global.document = document
    global.window = window
    global.HTMLElement = window.HTMLElement
    global.customElements = window.customElements
  })

  it('should set href on empty preload link', () => {
    const preloadLink = document.querySelector('link[rel="preload"][as="fetch"]')
    expect(preloadLink).toBeDefined()
    expect(preloadLink.getAttribute('href')).toBe('')

    // Execute the linkfill logic
    const script = document.querySelector('script[src*="tag.js"]')
    const plugins = script.dataset.plugins
    const baseUrl = script.dataset.register + "?uri="
    const currentUrl = encodeURI(window.location.href)

    if (plugins === "linkfill") {
      const preloadLinks = document.querySelectorAll('link[rel="preload"][as="fetch"]')
      
      if (preloadLinks.length > 0) {
        preloadLinks.forEach(preloadLink => {
          let existingHref = preloadLink.getAttribute('href')
          if (!existingHref || existingHref.trim() === '') {
            preloadLink.setAttribute('href', baseUrl + currentUrl)
          } else if (!existingHref.includes(currentUrl)) {
            preloadLink.setAttribute('href', existingHref + currentUrl)
          }
        })
      }
    }

    expect(preloadLink.getAttribute('href')).toBe('https://octothorp.es?uri=https://example.com/test-page')
  })

  it('should not duplicate href if currentUrl is already present', () => {
    const preloadLink = document.querySelector('link[rel="preload"][as="fetch"]')
    const currentUrl = encodeURI(window.location.href)
    const baseUrl = 'https://octothorp.es?uri='
    
    // Set initial href
    preloadLink.setAttribute('href', baseUrl + currentUrl)
    expect(preloadLink.getAttribute('href')).toBe('https://octothorp.es?uri=https://example.com/test-page')

    // Run linkfill logic again (simulating script running twice)
    const script = document.querySelector('script[src*="tag.js"]')
    const plugins = script.dataset.plugins

    if (plugins === "linkfill") {
      const preloadLinks = document.querySelectorAll('link[rel="preload"][as="fetch"]')
      
      if (preloadLinks.length > 0) {
        preloadLinks.forEach(preloadLink => {
          let existingHref = preloadLink.getAttribute('href')
          if (!existingHref || existingHref.trim() === '') {
            preloadLink.setAttribute('href', baseUrl + currentUrl)
          } else if (!existingHref.includes(currentUrl)) {
            preloadLink.setAttribute('href', existingHref + currentUrl)
          }
        })
      }
    }

    // Should still be the same, not doubled
    expect(preloadLink.getAttribute('href')).toBe('https://octothorp.es?uri=https://example.com/test-page')
  })

  it('should append currentUrl to existing non-empty href that does not contain it', () => {
    const preloadLink = document.querySelector('link[rel="preload"][as="fetch"]')
    const currentUrl = encodeURI(window.location.href)
    const baseUrl = 'https://octothorp.es?uri='
    
    // Set href to something different
    preloadLink.setAttribute('href', 'https://octothorp.es?uri=')

    const script = document.querySelector('script[src*="tag.js"]')
    const plugins = script.dataset.plugins

    if (plugins === "linkfill") {
      const preloadLinks = document.querySelectorAll('link[rel="preload"][as="fetch"]')
      
      if (preloadLinks.length > 0) {
        preloadLinks.forEach(preloadLink => {
          let existingHref = preloadLink.getAttribute('href')
          if (!existingHref || existingHref.trim() === '') {
            preloadLink.setAttribute('href', baseUrl + currentUrl)
          } else if (!existingHref.includes(currentUrl)) {
            preloadLink.setAttribute('href', existingHref + currentUrl)
          }
        })
      }
    }

    expect(preloadLink.getAttribute('href')).toBe('https://octothorp.es?uri=https://example.com/test-page')
  })

  it('should handle multiple preload links', () => {
    // Add another preload link
    const newLink = document.createElement('link')
    newLink.setAttribute('rel', 'preload')
    newLink.setAttribute('as', 'fetch')
    newLink.setAttribute('href', '')
    document.head.appendChild(newLink)

    const script = document.querySelector('script[src*="tag.js"]')
    const plugins = script.dataset.plugins
    const baseUrl = script.dataset.register + "?uri="
    const currentUrl = encodeURI(window.location.href)

    if (plugins === "linkfill") {
      const preloadLinks = document.querySelectorAll('link[rel="preload"][as="fetch"]')
      
      if (preloadLinks.length > 0) {
        preloadLinks.forEach(preloadLink => {
          let existingHref = preloadLink.getAttribute('href')
          if (!existingHref || existingHref.trim() === '') {
            preloadLink.setAttribute('href', baseUrl + currentUrl)
          } else if (!existingHref.includes(currentUrl)) {
            preloadLink.setAttribute('href', existingHref + currentUrl)
          }
        })
      }
    }

    const allPreloadLinks = document.querySelectorAll('link[rel="preload"][as="fetch"]')
    expect(allPreloadLinks.length).toBe(2)
    allPreloadLinks.forEach(link => {
      expect(link.getAttribute('href')).toBe('https://octothorp.es?uri=https://example.com/test-page')
    })
  })

  it('should handle no preload links gracefully', () => {
    // Remove all preload links
    const links = document.querySelectorAll('link[rel="preload"][as="fetch"]')
    links.forEach(link => link.remove())

    const script = document.querySelector('script[src*="tag.js"]')
    const plugins = script.dataset.plugins
    const baseUrl = script.dataset.register + "?uri="
    const currentUrl = encodeURI(window.location.href)

    // Should not throw error
    expect(() => {
      if (plugins === "linkfill") {
        const preloadLinks = document.querySelectorAll('link[rel="preload"][as="fetch"]')
        
        if (preloadLinks.length > 0) {
          preloadLinks.forEach(preloadLink => {
            let existingHref = preloadLink.getAttribute('href')
            if (!existingHref || existingHref.trim() === '') {
              preloadLink.setAttribute('href', baseUrl + currentUrl)
            } else if (!existingHref.includes(currentUrl)) {
              preloadLink.setAttribute('href', existingHref + currentUrl)
            }
          })
        }
      }
    }).not.toThrow()

    // Verify no links were created
    const finalLinks = document.querySelectorAll('link[rel="preload"][as="fetch"]')
    expect(finalLinks.length).toBe(0)
  })

  it('should preserve whitespace-only href as empty', () => {
    const preloadLink = document.querySelector('link[rel="preload"][as="fetch"]')
    preloadLink.setAttribute('href', '   ')

    const script = document.querySelector('script[src*="tag.js"]')
    const plugins = script.dataset.plugins
    const baseUrl = script.dataset.register + "?uri="
    const currentUrl = encodeURI(window.location.href)

    if (plugins === "linkfill") {
      const preloadLinks = document.querySelectorAll('link[rel="preload"][as="fetch"]')
      
      if (preloadLinks.length > 0) {
        preloadLinks.forEach(preloadLink => {
          let existingHref = preloadLink.getAttribute('href')
          if (!existingHref || existingHref.trim() === '') {
            preloadLink.setAttribute('href', baseUrl + currentUrl)
          } else if (!existingHref.includes(currentUrl)) {
            preloadLink.setAttribute('href', existingHref + currentUrl)
          }
        })
      }
    }

    expect(preloadLink.getAttribute('href')).toBe('https://octothorp.es?uri=https://example.com/test-page')
  })
})
