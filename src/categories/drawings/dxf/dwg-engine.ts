/**
 * DWG → plain drawing data with LibreDWG (GPL-3.0, @mlightcad/libredwg-web, unmodified).
 * Its Emscripten glue needs run-time code generation, which the page's policy
 * forbids, so on the website this runs in dwg-worker.ts (like the 3D CAD engines).
 */
export async function readDwg(bytes: Uint8Array): Promise<unknown> {
  const { LibreDwg, Dwg_File_Type } = await import('@mlightcad/libredwg-web');
  // The package finds its own WebAssembly (bundled next to it by the build).
  const lib = await LibreDwg.create();
  const dwg = lib.dwg_read_data(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, Dwg_File_Type.DWG);
  if (!dwg) throw new Error('This DWG file could not be read.');
  try {
    // Plain objects only (they cross to the page with postMessage).
    return JSON.parse(JSON.stringify(lib.convert(dwg), (_k, v) => (typeof v === 'bigint' ? Number(v) : v instanceof Uint8Array ? undefined : v)));
  } finally {
    lib.dwg_free(dwg);
  }
}
