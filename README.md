# MCU Document Studio - Bonto Ready

Versi Node.js untuk Bonto. Fitur utama:

- Dashboard responsive untuk desktop, tablet, dan ponsel
- Layout MCU tiga halaman
- Batch scan PDF dan gambar melalui Gemini
- Fallback model Gemini otomatis
- Cetak PDF
- Export Word `.docx` editable dari template Word
- Upload cap dan tanda tangan
- Credit pembuat dan tombol WhatsApp

## Environment Variables Bonto

Buka aplikasi di Bonto, pilih panel **Environment**, lalu tambahkan:

```text
GEMINI_API_KEY=API_KEY_GEMINI_BARU
GEMINI_PRIMARY_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODELS=gemini-2.5-flash-lite,gemini-2.0-flash
```

`PORT` disediakan otomatis oleh Bonto. Jangan menyimpan API key di GitHub.

## Deploy dari GitHub

Repository tujuan:

```text
https://github.com/aifrfx/mcu-jp.git
```

Di Bonto:

1. Buat **New App**.
2. Buka **Settings > Git Remote**.
3. Masukkan URL repository GitHub di atas.
4. Pilih branch `main`.
5. Klik **Pull**.
6. Tambahkan Environment Variables.
7. Restart aplikasi.

Bonto menjalankan:

```text
npm install
npm start
```

Aplikasi mendengarkan `process.env.PORT` secara otomatis.

## Push langsung ke Git Bonto

Salin Git URL dari **Settings** Bonto. Formatnya biasanya:

```text
https://api.bonto.dev/git/NAMA-APP
```

Tambahkan remote baru:

```bash
git remote add bonto https://api.bonto.dev/git/NAMA-APP
git push bonto main:master
```

Branch deploy bawaan Bonto adalah `master`.

## Menjalankan lokal

```bash
npm install
npm start
```

Buka:

```text
http://localhost:3000
```

## Credit

© Syaeful Imam Al Kusyaeri  
Blok Selasa, Desa Kertabasuki, Kecamatan Maja, Kabupaten Majalengka, Jawa Barat, Indonesia  
WhatsApp: 0853-2129-6926
