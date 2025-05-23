// src/routes/api/debug/[...params]/+server.js

export async function load({ params, url, request }) {
  const debugInfo = {
    routeParams: params,       // /debug/foo/bar → { params: "foo/bar" }
    queryParams: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(request.headers),
    method: request.method
  };

  console.log('Full debug info:', debugInfo);
  
  return new Response(JSON.stringify(debugInfo), {
    headers: { 'Content-Type': 'application/json' }
  });
}