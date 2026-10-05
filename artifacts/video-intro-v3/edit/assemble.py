"""Assemble the approved 10-second intro from real browser capture and local audio."""
from pathlib import Path
import json
import shutil
import subprocess
import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
DURATION = 10
SOURCE_START = 1.3
SOURCE = ROOT / 'workshop-source.webm'
shutil.copy2(REPO/'output/playwright/form-workshop-take2.webm', SOURCE)

# Keep the approved generated narration intact; only pad its trailing silence.
voice, sr = sf.read(ROOT/'voice-natural.wav')
assert len(voice)/sr <= DURATION
voice = np.pad(voice, (0, int(DURATION*sr)-len(voice)))
sf.write(ROOT/'voice.wav', voice, sr)
music, music_sr = sf.read(REPO/'artifacts/video-intro-v2/music.wav')
assert music_sr == sr
music = music[:len(voice)].copy()
t = np.arange(len(voice))/sr
music *= np.minimum(1, np.maximum(0, (DURATION-t)/.7))[:,None]
env = np.convolve(np.abs(voice), np.ones(2400)/2400, mode='same')
music *= (1-.35*np.clip(env/.035,0,1))[:,None]
# The original instrumental averages 19 dB below the speech before mastering.
music *= np.sqrt(np.mean(voice**2))*10**(-19/20)/np.sqrt(np.mean(music**2))
mixed = np.column_stack((voice,voice)) + music
sf.write(ROOT/'music.wav', music, sr)
sf.write(ROOT/'mix-premaster.wav', mixed, sr)
audio_filter = 'highpass=f=65,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.03,afade=t=out:st=9.97:d=0.03'
subprocess.run(['ffmpeg','-v','error','-y','-i',str(ROOT/'mix-premaster.wav'),'-af',audio_filter,'-ar','48000',str(ROOT/'mix.wav')],check=True)

# Captions occupy a separate band below the unmodified app picture.
captions = [
    {'start':0.0,'end':3.12,'text':"Hey, I’ve been working on a small project called Form."},
    {'start':3.12,'end':7.86,'text':"It’s a tool for making simple 3D parts\nand keeping track of the changes you make."},
    {'start':7.86,'end':10.0,'text':"Let me show you how it works."},
]
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 40)
for i,cap in enumerate(captions):
    img = Image.new('RGBA',(1920,120),(247,248,251,255))
    draw = ImageDraw.Draw(img)
    lines=cap['text'].splitlines()
    line_height=46
    y=(120-line_height*len(lines))/2
    for line in lines:
        width=draw.textlength(line,font=font)
        draw.text(((1920-width)/2,y),line,font=font,fill='#273442',stroke_width=0)
        y+=line_height
    img.save(ROOT/f'caption-{i+1}.png')

def stamp(seconds):
    ms=round(seconds*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
(ROOT/'captions.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(captions))+'\n')

# Recorder scales the 1920x960 CSS viewport into a 1894x947 content rectangle.
# Remove only recorder padding, then restore the viewport size. UI is not rebuilt.
command=['ffmpeg','-hide_banner','-y','-ss',str(SOURCE_START),'-i',str(SOURCE),'-i',str(ROOT/'mix.wav')]
for i in range(3):
    command += ['-loop','1','-framerate','30','-i',str(ROOT/f'caption-{i+1}.png')]
filters=['[0:v]setpts=PTS-STARTPTS,crop=1894:947:0:0:exact=1,scale=1920:960:flags=lanczos,pad=1920:1080:0:0:color=0xf7f8fb,fps=30,setsar=1[v0]']
# Captions are the final visual operation, after crop/scale/pad.
for i,cap in enumerate(captions):
    out='outv' if i==2 else f'v{i+1}'
    filters.append(f"[v{i}][{i+2}:v]overlay=0:960:enable='gte(t,{cap['start']})*lt(t,{cap['end']})'[{out}]")
command += ['-filter_complex',';'.join(filters),'-map','[outv]','-map','1:a','-t','10','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(ROOT/'form-intro-v3.mp4')]
(ROOT/'render-command.json').write_text(json.dumps(command,indent=2))
(ROOT/'edl.json').write_text(json.dumps({'duration':10,'source':str(SOURCE),'source_start':SOURCE_START,'source_end':SOURCE_START+10,'picture':'Actual local workshop recording; tray orbit only.','voice':'Exact approved intro, Kokoro af_heart, speed 1.02; no temporal retiming.','captions':captions,'music':'Original locally synthesized instrumental from v2; 19 dB below narration before mastering.'},indent=2))
subprocess.run(command,check=True)
print('Rendered:', ROOT/'form-intro-v3.mp4')
