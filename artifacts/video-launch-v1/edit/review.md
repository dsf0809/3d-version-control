# Render verification

- MP4: 36.000 seconds, 1,080 frames, H.264 1920×1080 at 30 fps; AAC stereo at 48 kHz.
- Full FFmpeg decode: clean (`verify/decode.log` is empty).
- Integrated loudness: −17.9 LUFS. True peak: −3.9 dBFS. Measured without clipping. Audio source is only the locally generated instrumental; no voiceover track exists in this composition. These are measurements, not a listening assessment.
- Browser check: zero lint/runtime/layout/contrast findings. Layout sampled at 11 times.
- Inspected rendered first/last, each feature and both sides of the main cuts. Side copy, comparison legend and closing GitHub link are legible; UI cards stay inside the stage. Tray motion changes between sampled frames, including the comparison orbit.
- No source keyframe freeze seen in the final film. The renderer warned that the two source clips have sparse keyframes; it extracted their frames before capture, and the output motion was verified.
- Local Studio responds HTTP 200 on port 3017.
- Prior personal intro SHA-256 still matches the preserved checksum.
- Independent critic review: passed with no blocking fixes (`critic-review.md`). Optional future refinements: larger V0/V1 labels and a consistent width across the separate setup and saved-comparison examples.
- Section RMS stays between −19.39 and −20.10 dBFS, including the closing fade; see `verify/section-rms.json`.
