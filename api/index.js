import { createRequire } from 'node:module';
import path from 'node:path';

let handlerModule = null;
let loadError = null;

try {
  const reqFn =
    typeof import.meta !== 'undefined' && import.meta.url
      ? createRequire(import.meta.url)
      : require;

  const candidates = [
    './_server.cjs',
    path.resolve(process.cwd(), 'api', '_server.cjs'),
  ];

  for (const target of candidates) {
    try {
      handlerModule = reqFn(target);
      if (handlerModule) {
        loadError = null;
        break;
      }
    } catch (err) {
      loadError = err;
    }
  }
} catch (err) {
  loadError = err;
  console.error('Failed to initialize bundled server handler:', err);
}

const app =
  handlerModule &&
  (handlerModule.default || handlerModule.app || handlerModule);

export const config = {
  maxDuration: 30,
};

export default function handler(req, res) {
  if (typeof app !== 'function') {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error:
            (loadError && loadError.message) ||
            'Server handler CBT gagal dimuat.',
        })
      );
    }
    return;
  }

  try {
    return app(req, res);
  } catch (err) {
    console.error('Vercel handler runtime error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error:
            (err && err.message) ||
            'Terjadi kesalahan saat memproses permintaan CBT.',
        })
      );
    }
  }
}
