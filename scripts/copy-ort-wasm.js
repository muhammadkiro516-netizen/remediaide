// Copies the onnxruntime-web WASM runtime to public/ort/ so on-device Mode AI (T68) works offline
// (otherwise onnxruntime-web fetches it from a CDN). Runs before `next dev` / `next build`.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');
const dst = path.join(__dirname, '..', 'public', 'ort');
fs.mkdirSync(dst, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
console.log('[copy-ort-wasm] copied runtime to public/ort');
