# Form — corporate launch video

A complete 36-second, 1920×1080, 30 fps launch film. Actual Form interface captures, animated side text, original instrumental music, no voiceover.

## Watch and edit

- Finished file: `renders/form-launch-v1.mp4`
- Local Studio: http://localhost:3017/#project/video-launch-v1
- Composition: `index.html` and `compositions/frames/`
- Rebuild HTML after edits: `python3 edit/build_video.py`
- Start Studio: `npx --yes hyperframes@0.8.124 preview --background --port 3017`
- Render: `npx --yes hyperframes@0.8.124 render --fps 30 --quality delivery --output renders/form-launch-v1.mp4`

The prior personal intro remains in `../video-intro-v3/edit/form-intro-v3.mp4`; its checksum was rechecked after this export.

## Timeline

| Time | Feature |
| --- | --- |
| 0–4s | Form introduction and rotating tray |
| 4–10s | Guided first project: templates and dimensions |
| 10–16s | Direct dimensions and an example AI request |
| 16–24s | Red/green comparison of saved V0 and V1 |
| 24–32s | Earlier revisions and STL/3MF export |
| 32–36s | Product close and GitHub link |

## Sources and credits

Interface footage and screenshots come from the local Form workshop. The AI request is an unsent example; the comparison uses already-saved revisions. The film does not imply a new paid AI result or a completed physical print. No new app project or revision was saved while capturing.

Music was synthesized locally with `edit/make_music.py`: an original instrumental arrangement with keys, pads, bass and light percussion. No samples, lyrics, voiceover, or third-party music track were used. The app logo uses the same Lucide Box icon as the application; fonts follow the app's Arial styling. GSAP 3.14.2 and the HyperFrames panel-reveal primitive drive the motion.

The user-provided LangEase launch video by Zelios informed the light background, blue accents, enlarged interface details and short animated headings. No reference-video footage, graphics or audio were included.

## Verification

`edit/check-final.json` records browser composition checks. `edit/verify/` contains decoded output frames, a contact sheet, stream metadata, full-decode log and audio measurements. `edit/critic-review.md` records independent visual review.

All artifacts remain local and uncommitted. No hosting or application deployment was performed.
