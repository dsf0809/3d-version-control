from pathlib import Path
import json
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
ROOT=Path(__file__).resolve().parent
engine=Kokoro('/tmp/form-video-tools/kokoro-v1.0.onnx','/tmp/form-video-tools/voices-v1.0.bin')
lines=[
 "I've been building a little three D design tool called Form.",
 "You can start with a simple part, and try out an idea.",
 "Move a divider. Then see exactly what's changed, before saving a new version.",
 "It's still a work in progress. Let me show you around."
]
rate=24000
samples=[np.zeros(int(.5*rate),dtype=np.float32)]
timing=[]; cursor=.5
for i,line in enumerate(lines):
 audio,sr=engine.create(line,voice='af_heart',speed=.98,lang='en-us')
 assert sr==rate
 # Trim extra silence, preserving a little breath between spoken phrases.
 active=np.flatnonzero(abs(audio)>.008)
 if len(active): audio=audio[max(0,active[0]-1200):min(len(audio),active[-1]+2000)]
 sf.write(ROOT/f'voice-{i+1}.wav',audio,rate)
 duration=len(audio)/rate
 timing.append({'start':cursor,'end':cursor+duration,'text':line.replace('three D','3D')})
 samples.append(audio); gap=.55 if i<3 else 1.0
 samples.append(np.zeros(int(gap*rate),dtype=np.float32)); cursor+=duration+gap
voice=np.concatenate(samples)
voice=.78*voice/max(abs(voice))
sf.write(ROOT/'voice.wav',voice,rate)
(ROOT/'timing.json').write_text(json.dumps({'duration':len(voice)/rate,'lines':timing},indent=2))
print(json.dumps(timing),flush=True)
