export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': '*',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  const targetUrl = request.headers.get('x-target-url');
  if (!targetUrl) {
    return new Response('Missing x-target-url header', { status: 400 });
  }

  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase();
    // Filter out headers that might cause issues or shouldn't be forwarded
    if (!['host', 'x-target-url', 'connection', 'origin', 'referer', 'accept-encoding', 'content-length'].includes(lowerKey)) {
      headers.set(key, value);
    }
  }

  // Ensure User-Agent and Accept headers are present for strict WebDAV servers
  if (!headers.has('user-agent')) {
    headers.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WebDAV-Client/1.0');
  }
  if (!headers.has('accept')) {
    headers.set('accept', '*/*');
  }

  const fetchOptions = {
    method: request.method,
    headers: headers,
    body: ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? undefined : request.body,
    // Add duplex: 'half' for Node.js fetch compatibility when body is a stream
    duplex: 'half'
  };

  try {
    const response = await fetch(targetUrl, fetchOptions);
    const responseHeaders = new Headers(response.headers);
    
    // Remove headers that might interfere with the proxy response
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('transfer-encoding');
    
    // Add CORS headers to the response
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    responseHeaders.set('Access-Control-Expose-Headers', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, { 
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
