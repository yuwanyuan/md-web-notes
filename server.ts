import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 使用 raw body 解析器，以便代理能够原样转发请求体（如 PUT 请求的文件内容）
  app.use('/api/proxy', express.raw({ type: () => true, limit: '50mb' }));

  app.use('/api/proxy', async (req, res) => {
    const targetUrl = req.headers['x-target-url'];
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send('Missing x-target-url header');
    }

    console.log(`[Proxy] ${req.method} ${targetUrl}`);

    try {
      const headers = new Headers();
      // 复制请求头，排除一些可能导致问题的头
      for (const [key, value] of Object.entries(req.headers)) {
        const lowerKey = key.toLowerCase();
        if (!['host', 'x-target-url', 'connection', 'origin', 'referer', 'accept-encoding', 'content-length'].includes(lowerKey)) {
          if (Array.isArray(value)) {
            value.forEach(v => headers.append(key, v));
          } else if (value) {
            headers.set(key, value);
          }
        }
      }

      // 确保有一个 User-Agent，有些 WebDAV 服务器（如 Infini-Cloud）可能会拒绝没有 UA 或特定 UA 的请求
      if (!headers.has('user-agent')) {
        headers.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WebDAV-Client/1.0');
      }

      // Log if authorization is present
      if (!headers.has('authorization')) {
        console.warn(`[Proxy] Warning: No authorization header found for ${targetUrl}`);
      }

      const hasBody = req.body && Buffer.isBuffer(req.body) && req.body.length > 0;

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
        body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !hasBody ? undefined : req.body,
      };

      const response = await fetch(targetUrl, fetchOptions);
      
      console.log(`[Proxy] Response from ${targetUrl}: ${response.status} ${response.statusText}`);

      // 复制响应头回客户端
      response.headers.forEach((value, key) => {
        if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      res.status(response.status);
      
      // 将响应体作为 Buffer 发送
      try {
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      } catch (bodyError: any) {
        console.error(`[Proxy] Error reading response body from ${targetUrl}:`, bodyError);
        if (!res.headersSent) {
          res.status(502).send(`Proxy Error reading body: ${bodyError.message}`);
        } else {
          res.end();
        }
      }
    } catch (error: any) {
      console.error(`[Proxy] Fetch error for ${targetUrl}:`, error);
      if (!res.headersSent) {
        res.status(502).send(`Proxy Error: ${error.message}`);
      } else {
        res.end();
      }
    }
  });

  // Vite 中间件（用于开发环境）或静态文件服务（用于生产环境）
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
