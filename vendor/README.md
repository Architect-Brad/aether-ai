# AETHER Offline Vendor Pack

Documents Supremacy loads heavy libraries **local-first**, then CDN.

## Layout

Place ESM-compatible bundles here:

```
vendor/
  docx.js            # or docx/index.js
  mammoth.js
  jszip.js
  pptxgenjs.js
  xlsx.js
  pdf-lib.js
  sql-wasm.js
  sql-wasm.wasm
```

## Fetch script

From `aether-ai/`:

```bash
chmod +x scripts/fetch-vendor.sh
./scripts/fetch-vendor.sh
```

## Runtime override

```js
// custom base URL (e.g. CDN mirror of your pack)
localStorage.setItem('aether_vendor_base', 'https://your.cdn/aether-vendor');

// or pin exact module URLs
window.AETHER_VENDOR_MAP = {
  docx: './vendor/docx.js',
  xlsx: 'https://your.mirror/xlsx.mjs',
};
```

## Check status

```js
AETHER_Vendor.status()
// { docx: { source: './vendor/docx.js', ok: true, ms: 12 }, ... }
```

Without this pack, AETHER falls back to esm.sh / jsDelivr automatically.
