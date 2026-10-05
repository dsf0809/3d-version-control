"""Locate the actual orbit in the recorded source; save a small filmstrip."""
from pathlib import Path
import subprocess
import sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parents[2] / 'output/playwright' / (sys.argv[1] if len(sys.argv)>1 else 'form-workshop-take1.webm')
raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(SOURCE), '-vf', 'fps=5,scale=480:240', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 240, 480, 3)
# Inspect the canvas area, excluding the changing cursor and all UI text.
crop = frames[:, 85:195, 100:270].astype(np.float32)
delta = np.mean(np.abs(np.diff(crop, axis=0)), axis=(1,2,3))
motion = np.flatnonzero(delta > .2) / 5
print('Motion intervals:', motion.tolist())
print('Total sampled seconds:', len(frames)/5)
indices = np.linspace(0, len(frames)-1, 12).astype(int)
sheet = Image.new('RGB', (480*3, 270*4), '#fff')
draw = ImageDraw.Draw(sheet)
for k,i in enumerate(indices):
    x,y = (k%3)*480, (k//3)*270
    sheet.paste(Image.fromarray(frames[i]), (x,y))
    draw.text((x+10,y+246), f'{i/5:.1f}s', fill='#222')
sheet.save(ROOT/'source-filmstrip.jpg')
