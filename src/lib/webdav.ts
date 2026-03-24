import { createClient, WebDAVClient, getPatcher } from "webdav";

export interface WebDAVConfig {
  url: string;
  username?: string;
  password?: string;
  directory: string;
  rememberPassword?: boolean;
  useProxy?: boolean;
}

let client: WebDAVClient | null = null;
let currentConfig: WebDAVConfig | null = null;

// Store the original fetch function
const originalFetch = window.fetch || fetch;

const customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  // Only intercept if proxy is enabled and we have a target URL
  if (!currentConfig?.useProxy || !currentConfig?.url) {
    return originalFetch(input, init);
  }

  let targetUrl = '';
  let requestInit = init || {};

  if (typeof input === 'string') {
    targetUrl = input;
  } else if (input instanceof URL) {
    targetUrl = input.toString();
  } else if (typeof Request !== 'undefined' && input instanceof Request) {
    targetUrl = input.url;
    requestInit = {
      method: input.method,
      headers: new Headers(input.headers),
      body: input.body,
      ...init
    };
  } else {
    targetUrl = String(input);
  }

  // Check if this request is for our WebDAV server
  const normalizedBaseUrl = currentConfig.url.replace(/\/$/, '');
  if (!targetUrl.startsWith(normalizedBaseUrl)) {
    return originalFetch(input, init);
  }

  // Fix double slashes in the path (but preserve the protocol slashes like https://)
  targetUrl = targetUrl.replace(/([^:]\/)\/+/g, "$1");
  
  const proxyUrl = `${window.location.origin}/api/proxy`;
  
  // Filter out forbidden headers that the browser might not allow setting via fetch
  const forbiddenHeaders = [
    'host', 'connection', 'content-length', 'origin', 'referer', 
    'user-agent', 'cookie', 'sec-ch-ua', 'sec-ch-ua-mobile', 
    'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 
    'sec-fetch-site', 'sec-fetch-user', 'upgrade-insecure-requests'
  ];
  
  const proxyHeaders = new Headers();
  if (requestInit.headers) {
    const originalHeaders = new Headers(requestInit.headers);
    originalHeaders.forEach((value, key) => {
      if (!forbiddenHeaders.includes(key.toLowerCase())) {
        proxyHeaders.append(key, value);
      }
    });
  }
  
  // Encode the target URL to ensure it only contains ASCII characters, 
  // as it will be used in an HTTP header (x-target-url).
  // We use encodeURI but we need to be careful not to double encode if it's already encoded.
  // A safer way is to ensure it's a valid URL string.
  const encodedTargetUrl = encodeURI(decodeURI(targetUrl));
  
  proxyHeaders.set('x-target-url', encodedTargetUrl);
  
  const method = (requestInit.method || 'GET').toUpperCase();
  try {
    const hasBody = requestInit.body !== undefined && requestInit.body !== null;
    const bodyAllowed = !['GET', 'HEAD'].includes(method);
    
    const fetchOptions: any = {
      method,
      headers: Object.fromEntries(proxyHeaders.entries()),
      body: bodyAllowed && hasBody ? requestInit.body : undefined,
      cache: 'no-store', // Disable browser caching for proxy requests
    };
    
    if (bodyAllowed && hasBody && typeof ReadableStream !== 'undefined' && requestInit.body instanceof ReadableStream) {
      fetchOptions.duplex = 'half';
    }
    
    return await originalFetch(proxyUrl, fetchOptions);
  } catch (error: any) {
    console.error("Proxy fetch network error:", error, "Target:", targetUrl, "Method:", method);
    return new Response(`Proxy Fetch Error: ${error.message || String(error)} (Target: ${targetUrl}, Method: ${method})`, {
      status: 599,
      statusText: "Custom Fetch Error"
    });
  }
};

// Apply the patch globally for webdav
getPatcher().patch("fetch", customFetch);

export const initWebDAV = (config: WebDAVConfig) => {
  currentConfig = config;
  
  if (!config.url) {
    client = null;
    return;
  }
  
  const options: any = {
    username: config.username,
    password: config.password,
  };
  
  client = createClient(config.url, options);
};

export const getWebDAVClient = () => client;

export const ensureDirectory = async (dir: string) => {
  if (!client) throw new Error("WebDAV client not initialized");
  if (dir === "/" || dir === "") return;
  
  try {
    const exists = await client.exists(dir);
    if (!exists) {
      await client.createDirectory(dir);
    }
  } catch (error) {
    console.error("Failed to ensure directory:", error);
    throw error;
  }
};

export const testConnection = async (config: WebDAVConfig) => {
  // Temporarily set current config for the test
  const previousConfig = currentConfig;
  currentConfig = config;
  
  const options: any = {
    username: config.username,
    password: config.password,
  };
  
  const testClient = createClient(config.url, options);
  try {
    // Try to get directory contents of the root directory to verify credentials
    await testClient.getDirectoryContents("/");
    
    // Restore previous config if test succeeds
    currentConfig = previousConfig;
    return true;
  } catch (error: any) {
    // Restore previous config if test fails
    currentConfig = previousConfig;
    
    console.error("Test connection failed:", error);
    
    // Extract more detailed error information if available
    let errorMsg = error.message;
    if (error.response) {
      errorMsg = `HTTP ${error.response.status}: ${error.response.statusText}`;
      try {
        const text = await error.response.text();
        if (text) errorMsg += ` - ${text.substring(0, 100)}`;
      } catch (e) {
        // Ignore text parsing errors
      }
    }
    
    throw new Error(errorMsg);
  }
};

export const listNotes = async (dir: string) => {
  if (!client) throw new Error("WebDAV client not initialized");
  
  try {
    await ensureDirectory(dir);
    const contents = await client.getDirectoryContents(dir);
    return (contents as any[])
      .filter((item) => item.type === "file" && item.basename.endsWith(".md"))
      .map((item) => ({
        filename: item.basename,
        lastmod: item.lastmod,
        size: item.size,
      }));
  } catch (error) {
    console.error("Failed to list notes:", error);
    throw error;
  }
};

export const readNote = async (path: string): Promise<string> => {
  if (!client) throw new Error("WebDAV client not initialized");
  try {
    const content = await client.getFileContents(path, { format: "text" });
    return content as string;
  } catch (error) {
    console.error(`Failed to read note ${path}:`, error);
    throw error;
  }
};

export const writeNote = async (path: string, content: string) => {
  if (!client) throw new Error("WebDAV client not initialized");
  try {
    await client.putFileContents(path, content, { overwrite: true });
  } catch (error) {
    console.error(`Failed to write note ${path}:`, error);
    throw error;
  }
};

export const deleteNote = async (path: string) => {
  if (!client) throw new Error("WebDAV client not initialized");
  try {
    await client.deleteFile(path);
  } catch (error) {
    console.error(`Failed to delete note ${path}:`, error);
    throw error;
  }
};
