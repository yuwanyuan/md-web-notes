import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: false, // 禁用默认的 body 解析，以便我们能读取原始数据流
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  const targetUrl = req.headers['x-target-url'];
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('Missing x-target-url header');
  }

  try {
    // 读取原始请求体
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const hasBody = body.length > 0;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      if (!['host', 'x-target-url', 'connection', 'origin', 'referer', 'accept-encoding', 'content-length'].includes(lowerKey)) {
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else if (value) {
          headers.set(key, value as string);
        }
      }
    }

    // Ensure User-Agent and Accept headers are present for strict WebDAV servers
    if (!headers.has('user-agent')) {
      headers.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WebDAV-Client/1.0');
    }
    if (!headers.has('accept')) {
      headers.set('accept', '*/*');
    }

    const fetchOptions: RequestInit = {
      method: req.method || 'GET',
      headers,
      body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET') || !hasBody ? undefined : body,
    };

    const response = await fetch(targetUrl, fetchOptions);
    
    // Add CORS headers to the response
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');

    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    res.status(response.status);
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(502).send(`Proxy Error: ${error.message}`);
  }
}
