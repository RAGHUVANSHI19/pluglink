import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.js';

let app: ReturnType<typeof createApp> | undefined;

export default function handleVercelRequest(request: IncomingMessage, response: ServerResponse) {
  try {
    app ??= createApp({ serveFrontend: false, uploadStorage: 'blob' });
  } catch {
    response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ status: 'unavailable', message: 'PlugLink deployment configuration is incomplete.' }));
    return;
  }
  app(request, response);
}
