# Sample videos

Made for FormatReader by `scripts/make-media-samples.mjs` (Chrome MediaRecorder): a 3-second
animated turbine with a tone, as `turbine.mp4` (H.264/AAC) and `turbine.webm` (VP9/Opus).

`turbine-h264.flv`: the same H.264/AAC streams copied into an FLV container by
`scripts/mp4-to-flv.py` (no re-encoding), for the FLV repackaging path.

AVI samples, made by `scripts/make-avi-samples.py` (Pillow):
- `camera-mjpeg.avi`: MJPEG frames + 16-bit PCM tone, with an idx1 index (like old digital cameras).
- `cctv-mjpeg-nodht.avi`: MJPEG frames without Huffman tables (as many webcams and CCTV recorders
  write them), μ-law sound, and no index (like an interrupted recording).
- `turbine-h264.avi`: the H.264 frames of `turbine.mp4` copied into AVI (no re-encoding), IMA ADPCM tone.
- whatsapp-phone.3gp — turbine.mp4 with its ftyp brand changed to 3gp6 (3GP is the same ISO container; H.264 + AAC, as WhatsApp sends).
- mms-phone.3g2 — same, with brand 3g2a (3GPP2, CDMA phones / MMS).
