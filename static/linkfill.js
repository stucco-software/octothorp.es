const currentUrl = window.location.href;

// Badge images: <img src="https://octothorp.es?uri=https://yoursite.here">
document.querySelectorAll('img[src*="/badge"]').forEach(img => {
  try {
    const url = new URL(img.src);
    if (!url.searchParams.has('uri')) {
      url.searchParams.set('uri', currentUrl);
      img.src = url.toString();
    }
  } catch (e) {}
});

// Preload links: <link rel="preload" as="fetch" href="https://octothorp.es?uri=https://yoursite.here">
document.querySelectorAll('link[rel="preload"][as="fetch"]').forEach(link => {
  const href = link.getAttribute('href');
  if (!href) return;
  try {
    const url = new URL(href, window.location.origin);
    if (!url.searchParams.has('uri')) {
      url.searchParams.set('uri', currentUrl);
      link.setAttribute('href', url.toString());
    }
  } catch (e) {}
});
