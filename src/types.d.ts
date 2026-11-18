// foliate-js ships plain ES modules without type definitions.
declare module 'foliate-js/view.js';

// Image decoders without type definitions for the entry points used here.
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  const factory: () => unknown;
  export default factory;
}
declare module 'utif' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const UTIF: any;
  export default UTIF;
}
declare module 'exifr/dist/lite.esm.mjs' {
  const exifr: {
    parse(input: Blob | ArrayBuffer, options?: Record<string, unknown>): Promise<Record<string, unknown> | undefined>;
    orientation(input: Blob | ArrayBuffer): Promise<number | undefined>;
  };
  export default exifr;
}

// Open CASCADE importer (Emscripten module, CommonJS).
declare module 'occt-import-js';
declare module 'dxf-parser/dist/AutoCadColorIndex.js' {
  const colors: number[];
  export default colors;
}
