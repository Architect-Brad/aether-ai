# AETHER vendor directory

**No ESM bundles ship by default.** This checkout contains only this `README.md` — there
are no `docx.js`, `xlsx.js`, `sql-wasm.wasm`, etc. files here until you supply them.

`core/vendor-loader.js` resolves heavy Documents Supremacy dependencies at runtime:

1. `window.AETHER_VENDOR_MAP[key]` — runtime override
2. `localStorage.aether_vendor_base` + the catalogued local path
3. `./vendor/<file>` from the catalog
4. CDN URLs (esm.sh / jsDelivr)

Catalogued keys: `docx`, `mammoth`, `jszip`, `pptxgen`, `xlsx`, `pdf-lib`, `sql.js`.
`sql.js` additionally needs `sql-wasm.wasm`. When no local copy resolves, the loader
falls back to the CDN — so offline document generation requires your own local pack.

## Optional: fetch a local pack

`scripts/fetch-vendor.sh` downloads bundles into `vendor/` (needs `curl` and network once).
It is opt-in and is not run by setup; nothing is committed here by default.

```bash
bash scripts/fetch-vendor.sh
```

Hard-refresh the app (or bump the service-worker cache) after adding files so `sw.js`
picks them up.

## Overrides and status

```js
AETHER_Vendor.setMap({ docx: './vendor/docx.js' }); // per-session URL override
AETHER_Vendor.resolveUrls('docx');                  // exact candidates, in order
AETHER_Vendor.status();                             // { docx: { source, ok, error, ms }, ... }
AETHER_Vendor.isOfflineReady('docx');               // true only if loaded from a local URL
```

`localStorage.setItem('aether_vendor_base', 'https://your.cdn/aether-vendor')` prepends a
custom base to every catalogued local path.
