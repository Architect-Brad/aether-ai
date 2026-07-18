#!/usr/bin/env bash
# Fetch offline vendor ESM packs for Documents Supremacy.
# Requires: curl, network once. After this, AETHER can create docs offline
# (for deps that resolve as pure ESM — sql.js still needs wasm).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V="$ROOT/vendor"
mkdir -p "$V"

fetch() {
  local url="$1" out="$2"
  echo "→ $out"
  curl -fsSL "$url" -o "$out" || echo "  WARN: failed $url"
}

echo "Fetching vendor packs into $V …"

# Prefer jsDelivr ESM where available; esm.sh as alternate documented in loader.
fetch "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm" "$V/jszip.js"
fetch "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm" "$V/xlsx.js"
fetch "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm" "$V/pdf-lib.js"

# These packages often need esm.sh for browser ESM interop
fetch "https://esm.sh/docx@8?bundle" "$V/docx.js" 2>/dev/null || \
  fetch "https://esm.sh/docx@8" "$V/docx.js"
fetch "https://esm.sh/mammoth@1.6.0?bundle" "$V/mammoth.js" 2>/dev/null || \
  fetch "https://esm.sh/mammoth@1.6.0" "$V/mammoth.js"
fetch "https://esm.sh/pptxgenjs@3.12.0?bundle" "$V/pptxgenjs.js" 2>/dev/null || \
  fetch "https://esm.sh/pptxgenjs@3.12.0" "$V/pptxgenjs.js"
fetch "https://esm.sh/sql.js@1.10.2" "$V/sql.js"
fetch "https://esm.sh/sql.js@1.10.2/dist/sql-wasm.wasm" "$V/sql-wasm.wasm" 2>/dev/null || true
# also try dist path used by sql.js locateFile
fetch "https://cdn.jsdelivr.net/npm/sql.js@1.10.2/dist/sql-wasm.js" "$V/sql-wasm.js" 2>/dev/null || true
fetch "https://cdn.jsdelivr.net/npm/sql.js@1.10.2/dist/sql-wasm.wasm" "$V/sql-wasm.wasm" 2>/dev/null || true

echo ""
echo "Done. Files:"
ls -la "$V" | sed 's/^/  /'
echo ""
echo "Tip: hard-refresh AETHER (or bump SW) so vendor/ is cached."
