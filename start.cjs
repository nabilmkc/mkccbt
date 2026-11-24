'use strict';

const fs = require('node:fs');
const path = require('node:path');

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

const serverBundlePath = path.resolve(__dirname, 'api', '_server.cjs');
const distIndexPath = path.resolve(__dirname, 'dist', 'index.html');

if (!fs.existsSync(serverBundlePath) || !fs.existsSync(distIndexPath)) {
  console.error(
    '[MKC CBT] Hasil build produksi belum lengkap (api/_server.cjs atau dist/index.html tidak ditemukan).'
  );
  console.error('[MKC CBT] Jalankan perintah "npm run build" terlebih dahulu sebelum "npm start".');
  process.exit(1);
}

const serverModule = require(serverBundlePath);
const app = serverModule && (serverModule.default || serverModule.app || serverModule);

module.exports = app;
