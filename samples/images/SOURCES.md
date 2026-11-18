# Sample images

All made for FormatReader (no third-party content):

- `wind-farm.*`, `logo.*`: drawn as SVG, rendered in Chrome, converted with macOS `sips`
  (JPEG, HEIC, PSD, BMP, GIF, LZW TIFF), Chrome (WebP), gzip (SVGZ) and a small
  script (ICO holding a PNG).
- `two-pages.tiff`: two pictures in one TIFF (`tiffutil -cat`), for page switching.
- `camera-preview.dng`: a minimal camera-RAW-style TIFF whose first IFD points at an
  embedded JPEG preview (JPEGInterchangeFormat), the way CR2/NEF/ARW/DNG files carry theirs.
