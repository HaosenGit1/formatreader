# How big a file can FormatReader open?

Measured on 2026-11-18 in Chrome (headless, macOS, 16 GB Mac) with generated test files.
Phones and tablets have far less memory per tab: count on about a quarter of these sizes
(and about 16 megapixels for pictures on iPhone/iPad).

| Kind | Opened fine | Failed | Notes |
|---|---|---|---|
| Text, logs | 300 MB in 7 s | 600 MB showed a blank page (browser text limit ≈ 500 M characters) | Now: files over 256 MB (64 MB on phones) show the first 256 MB, with “Show the end instead” |
| CSV | 100 MB (1 million rows) in 3 s | — | Larger CSVs are shown in parts like text |
| Excel (.xlsx) | 109 MB (1 million rows) in 17 s | — | Warning above 150 MB |
| Archives (zip, rar, 7z…) | 2.0 GB in 3 s | 2.1 GB never answered | Hard limit 2 GB (the WebAssembly engine): now a clear message with free apps to use |
| EPUB | 1.2 GB in 1 s | — | Chapters are read when needed |
| DXF | 150 MB (2.7 million objects) in 6 s | 400 MB (7 million objects) crashed the tab | Warning above 250 MB. A 50 MB DXF failed before a fix (too many function arguments) |
| DWG | not measured (no tool can write a big DWG) | — | Warning above 60 MB (estimate: DWG is packed several times smaller than DXF) |
| Pictures | 16000 × 16000 (256 MP) | 24000 × 24000 (576 MP) | Browser limit ≈ 268 MP; now the message gives the size and why |
| Video, sound | streamed by the browser, any size | — | MP4/WebM/MOV/MKV are not loaded into memory |

## What the user sees

- **Over 150 MB:** a note under the loading animation (“Large file … can take a moment”, then “Still working…”).
- **Beyond the measured limit for that kind of file** (`heavyAbove` in each viewer entry): a warning first,
  with *Try anyway*, *How to open it elsewhere* and *Cancel*.
- **Memory errors:** “Too big for this browser’s memory”, with what to try, instead of a raw error.
- **If the tab crashes:** the next visit says which file did not finish opening and why.

The test files were generated and deleted after measuring (scripts not kept: plain repeated log lines,
stored-zip random data, LINE-only DXF, single-colour PNGs, an EPUB with 200 chapters plus a large binary).
