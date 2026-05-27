// TTF font files imported as binary data (see wrangler.jsonc rules).
declare module "*.ttf" {
  const content: ArrayBuffer;
  export default content;
}

// WASM modules imported directly (wrangler/esbuild native support).
declare module "*.wasm" {
  const content: WebAssembly.Module;
  export default content;
}
