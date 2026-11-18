# Sample images

All made for FormatReader (no third-party content):

- `wind-farm.*`, `logo.*`: drawn as SVG, rendered in Chrome, converted with macOS `sips`
  (JPEG, HEIC, PSD, BMP, GIF, LZW TIFF), Chrome (WebP), gzip (SVGZ) and a small
  script (ICO holding a PNG).
- `two-pages.tiff`: two pictures in one TIFF (`tiffutil -cat`), for page switching.
- `camera-preview.dng`: a minimal camera-RAW-style TIFF whose first IFD points at an
  embedded JPEG preview (JPEGInterchangeFormat), the way CR2/NEF/ARW/DNG files carry theirs.
- `sky.exr`, `sky.hdr`, `pattern.tga`, `ct-phantom.dcm`, `ct-phantom-rle.dcm`: written by
  `scripts/make-image-samples.py` (HDR sky with a 40× "sun", a TGA test pattern, a synthetic CT
  chest phantom in Hounsfield units, uncompressed and RLE).
- `motion-photo.jpg`: `wind-farm.jpg` with `../videos/turbine.mp4` appended, the way Samsung/Pixel/Huawei motion photos store their video.
