# Form — drum-driven launch revision

The second full launch film uses a new 128 BPM electronic breakbeat, real moving guide and typing captures, faster model footage, camera push-ins, distinct kinetic entrances and prominent V0/V1 labels. No voiceover.

## Output

- `renders/form-launch-v2.mp4`: 33.75 seconds, 1920×1080, 60 fps.
- Local editable Studio: http://localhost:3018/#project/video-launch-v2
- Earlier corporate cut: `../video-launch-v1/renders/form-launch-v1.mp4`, preserved.
- Earlier personal intro: `../video-intro-v3/edit/form-intro-v3.mp4`, preserved.

## Timing

| Time | Demonstration |
| --- | --- |
| 0–3.75s | Moving tray; Make / Change / Create |
| 3.75–9.375s | Actual template selections and dimensions |
| 9.375–15s | Direct controls and typing an unsent AI example |
| 15–22.5s | Moving red/green comparison of saved V0 and V1 |
| 22.5–30s | Large V0/V1 labels, model views, export options |
| 30–33.75s | Closing model and GitHub link |

## Rebuild

`python3 edit/build_video.py` regenerates the HTML. The source score is `edit/make_music.py`; beat positions are saved in `edit/beat-map.json`. Render with:

```
npx --yes hyperframes@0.8.125 render --fps 60 --quality delivery --output renders/form-launch-v2.mp4
```

The new project updates the CLI pin from 0.8.124 to 0.8.125; browser verification passed after the update. The previous project remains unchanged.

## Credits and truthfulness

All product media comes from the local Form app. Captures show actual template selection, input focus and typing. No AI request was sent; the example input was cleared. The comparison and revision screenshots use saved demonstration revisions. No new project, accepted edit, or physical print was produced for this capture.

The instrumental is an original locally synthesized arrangement: kick, snare/clap, metallic hats, tom fills, syncopated bass, bright plucks and transition lifts. It uses no samples, vocals, or third-party recording. The prior LangEase reference informed general pacing and visual direction; none of its media is included. Form's Lucide Box logo, app Arial styling and local GSAP remain in use.

Final measurements, decoded frames and critic review are retained under `edit/`. This revision remains local and uncommitted.
