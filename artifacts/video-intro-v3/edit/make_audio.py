"""Synthesize the approved introduction locally. No provider API calls."""
from pathlib import Path
import json
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent
SCRIPT = "Hey, I’ve been working on a small project called Form. It’s a tool for making simple 3D parts and keeping track of the changes you make. Let me show you how it works."
PHRASES = [
    "Hey, I've been working on a small project called Form.",
    "It's a tool for making simple three D parts and keeping track of the changes you make.",
    "Let me show you how it works.",
]
engine = Kokoro('/tmp/form-video-tools/kokoro-v1.0.onnx', '/tmp/form-video-tools/voices-v1.0.bin')
rate = 24000
parts = [np.zeros(int(.12 * rate), dtype=np.float32)]
cursor = .12
timing = []
for i, text in enumerate(PHRASES):
    audio, sr = engine.create(text, voice='af_heart', speed=1.02, lang='en-us')
    assert sr == rate
    active = np.flatnonzero(np.abs(audio) > .008)
    if len(active):
        audio = audio[max(0, active[0] - 1000):min(len(audio), active[-1] + 1700)]
    # Short edge fades avoid clicks without affecting the spoken words.
    fade = min(720, len(audio) // 2)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio[-fade:] *= np.linspace(1, 0, fade)
    sf.write(ROOT / f'voice-{i + 1}.wav', audio, rate)
    length = len(audio) / rate
    timing.append({'start': cursor, 'end': cursor + length, 'text': text.replace('three D', '3D')})
    parts.append(audio)
    gap = .16 if i < 2 else .3
    parts.append(np.zeros(int(gap * rate), dtype=np.float32))
    cursor += length + gap
voice = np.concatenate(parts)
voice *= .84 / max(abs(voice))
sf.write(ROOT / 'voice-natural.wav', voice, rate)
(ROOT / 'script.txt').write_text(SCRIPT + '\n')
(ROOT / 'voice-timing-natural.json').write_text(json.dumps({'duration': len(voice) / rate, 'phrases': timing}, indent=2))
print(json.dumps({'duration': len(voice) / rate, 'phrases': timing}, indent=2), flush=True)
