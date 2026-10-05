# Form — first ten seconds

**Watch:** `form-intro-v3.mp4` — 1920×1080, 30 fps, H.264/AAC stereo, exactly 10 seconds.

This cut follows the user's approved opening word for word. It shows the actual
local Form workshop with an existing tray and a gentle camera orbit. It does not
demonstrate AI generation, project creation or exporting; those belong to later
sections of the approved script. No application source was changed for this video.

## Assets and edit

- `script.txt`: exact approved narration.
- `workshop-source.webm`: actual Playwright capture from localhost:3000; source
  range 1.3–11.3 seconds. Recorder padding is removed; the app UI is not rebuilt.
- `voice-natural.wav`: local stock Kokoro `af_heart` neural narration at 1.02 speed.
  The complete performance is preserved. It is synthetic, not the user's voice.
- `voice.wav`, `music.wav`, `mix.wav`: isolated voice, original instrumental and
  mastered stereo audio. Music derives from the original synthesis in
  `../../video-intro-v2/make_music.py`, averaging 19 dB below speech before mastering.
- `captions.srt`: editable captions. The three caption PNGs are added last,
  in a separate band beneath the full workshop view.
- `edl.json`, `render-command.json`, `assemble.py`: edit decisions and reproducible
  assembly. `make_audio.py` recreates narration using the cached local model.
- `verify/`: representative final frames and contact sheet; `audio-qa.log`:
  measured output levels. Independent critique is recorded in `review.md`.

Speech dependencies: [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx),
[Kokoro model and stock voices](https://huggingface.co/hexgrad/Kokoro-82M).
No paid generation calls, cloned voices, or third-party music recordings were used.
ElevenLabs skills are installed, but no API key was available in this render's
environment; this draft therefore does not claim to use ElevenLabs speech.

## Installed skills

Installed personally under `/Users/sifeidu/.codex/skills/`; available to subsequent
turns. Entry files and supporting skills were verified on 2026-10-04.

| Requested group | Source | Installed entry points |
| --- | --- | --- |
| Hyperframes | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | hyperframes plus core, CLI, audio, creative, animation, general-video, product-launch-video, media-use |
| Video use | [browser-use/video-use](https://github.com/browser-use/video-use) | video-use |
| Remotion | [remotion-dev/skills](https://github.com/remotion-dev/skills) | remotion-best-practices, create, markup, render, captions, docs |
| Video Cut | [Ninglo/video-cut-skill](https://github.com/Ninglo/video-cut-skill) | video-cut |
| Playwright | [openai/skills](https://github.com/openai/skills/tree/main/skills/.curated/playwright) | playwright |
| ElevenLabs | [elevenlabs/skills](https://github.com/elevenlabs/skills) | text-to-speech, speech-to-text, sound-effects, music, setup-api-key, voice-changer, voice-isolator, dubbing, agents, speech-engine |
| FFmpeg | [muhammaddadu/ffmpeg-skill](https://github.com/muhammaddadu/ffmpeg-skill) | ffmpeg directory, ffmpeg-usage skill |

Generative Media remains pending at the user's request. This cut uses Playwright
capture, local narration, FFmpeg assembly and Video-use review guidance. Installing
the other skill packages does not mean their render engines were used in this cut.

## Verification

- Complete video decoded without errors; 300 frames, 10.000 seconds.
- H.264 1920×1080 at 30 fps; AAC stereo at 48 kHz; 2,509,467 bytes.
- Integrated loudness −16.1 LUFS; true peak −1.5 dBFS; loudness range 1.3 LU.
- First, middle and final frames inspected for capture borders, text readability,
  visible tray and revision controls. Narration ends before the cut.
- Audio checks are structural and measured; no claim of human listening review.

Local artifacts only: no commit, push or hosted deployment. Next section, when
requested: 10–25 seconds, opening **Guided first project** and creating a tray.
