# Panduan Hosting MKC CBT (Vercel, VPS/cPanel, Railway/Render, Docker)

Aplikasi ini siap di-hosting di berbagai platform, baik **Serverless (Vercel)** maupun **Node.js Server (VPS, cPanel, Railway, Render, Fly.io, Docker)**.

---

## 1. Deploy ke Vercel (`vercel.json` + `api/index.js`)
Konfigurasi `vercel.json` sudah otomatis membangun frontend (`dist/`) dan backend API (`api/_server.cjs`) dalam satu deployment.

Atur **Environment Variables** di **Vercel Project Settings → Environment Variables**:
- `SESSION_SECRET`: string acak minimal 32 karakter (wajib sama antar instance agar sesi login tetap valid).
- **Pilih salah satu penyimpanan permanen** (wajib di Vercel agar akun siswa, bank soal, ujian, dan nilai tidak hilang saat serverless restart):
  1. **PostgreSQL (`DATABASE_URL` / `POSTGRES_URL` — Direkomendasikan)**: Hubungkan **Neon** atau **Supabase** dari tab **Storage** di Vercel. Tabel dibuat otomatis saat aplikasi pertama kali diakses.
  2. **Upstash Redis (`KV_REST_API_URL` & `KV_REST_API_TOKEN`)**: Hubungkan **Upstash Redis** dari tab **Storage** Vercel.
  3. **Firebase Admin (`FIREBASE_SERVICE_ACCOUNT_JSON`)**: Isi JSON (atau base64) **Firebase Service Account Key**.

---

## 2. Deploy ke Railway / Render / Fly.io (Node.js)
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start` (menjalankan `node start.cjs`)
- **Environment Variables**:
  - `NODE_ENV=production`
  - `SESSION_SECRET=<string-acak-minimal-32-karakter>`
  - `DATABASE_URL=<postgres-url>` *(opsional; jika tidak diisi, atur Persistent Disk dan arahkan `CBT_DATA_DIR=/var/data`)*
- Health check endpoint tersedia di `/api/health`.

---

## 3. Deploy ke VPS Linux / PM2 / cPanel Node.js
### A. VPS dengan PM2 + Nginx
1. Salin kode ke server, buat file `.env` dari `.env.example`, lalu isi `SESSION_SECRET` (dan `DATABASE_URL` jika memakai PostgreSQL).
2. Build dan jalankan:
   ```bash
   npm install
   npm run build
   pm2 start start.cjs --name mkc-cbt
   ```
3. Arahkan reverse proxy Nginx ke `http://127.0.0.1:3000`.

### B. Shared Hosting / cPanel (Setup Node.js App)
1. Upload proyek (atau hasil `npm run build`: `dist/`, `api/_server.cjs`, `start.cjs`, `package.json`, `firebase-applet-config.json`).
2. Di menu **Setup Node.js App** cPanel:
   - **Node.js version**: 20 atau 22
   - **Application mode**: Production
   - **Application startup file**: `start.cjs`
   - Tambahkan Environment Variable `SESSION_SECRET`.
3. Klik **Run NPM Install** (jika upload source tanpa `node_modules`) lalu **Restart**.

---

## 4. Deploy dengan Docker
```bash
docker build -t mkc-cbt .
docker run -d -p 3000:3000 \
  -e SESSION_SECRET="ganti-dengan-secret-acak-panjang" \
  -v mkc_cbt_data:/app/.data \
  --name mkc-cbt mkc-cbt
```

---

## 5. Catatan Keamanan Exam Mode
Browser web standar tidak dapat menjamin penguncian perangkat 100% pada tingkat sistem operasi. Untuk ujian berisiko tinggi, gunakan perangkat terkelola (*managed device* / Chromebook Kiosk) atau peramban ujian khusus (*Safe Exam Browser*).
