"""Render the intro from Form's actual compiled sample mesh; no simulated UI."""
import json, math, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parent
W,H,FPS,DURATION = 1280,720,24,11
triangles=np.array(json.loads((ROOT/'tray.json').read_text())).reshape(-1,3,3)
font_path='/System/Library/Fonts/Helvetica.ttc'
def font(size): return ImageFont.truetype(font_path,size)
small,body,title,caption=font(17),font(22),font(42),font(25)
subtitles=[(.35,3.45,"Hey, I've been working on a small project called Form."),(3.45,6.35,"It's a tool for making simple 3D parts"),(6.35,8.25,"and keeping track of the changes you make."),(8.25,10.55,"Let me show you how it works.")]
cmd=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(ROOT/'narration.aiff'),'-filter_complex','[1:a]adelay=350|350,apad[a]','-map','0:v','-map','[a]','-t',str(DURATION),'-c:v','libx264','-crf','19','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',str(ROOT/'form-intro-v1.mp4')]
proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
for frame in range(FPS*DURATION):
 t=frame/FPS
 im=Image.new('RGB',(W,H),'#f5f4f0'); d=ImageDraw.Draw(im)
 d.text((56,37),'form.',font=font(27),fill='#293241')
 d.text((56,102),'A small project I’m working on',font=small,fill='#68717c')
 d.multiline_text((56,145),'A quick look\nat Form',font=title,fill='#263445',spacing=8)
 d.multiline_text((58,276),'Simple 3D parts,\nwith a history of your edits.',font=body,fill='#626c77',spacing=9)
 d.line((58,373,316,373),fill='#d9dce0',width=1)
 d.multiline_text((58,397),'Starting with an\norganizer tray.',font=small,fill='#707984',spacing=7)
 yaw=.67 + .32*(.5-.5*math.cos(math.pi*t/DURATION)); elev=.68
 right=np.array([math.cos(yaw),-math.sin(yaw),0]); up=np.array([math.sin(yaw)*math.sin(elev),math.cos(yaw)*math.sin(elev),math.cos(elev)]); forward=np.cross(right,up)
 def project(v):
  v=np.array(v); return np.stack([835+3.65*(v@right),351-3.65*(v@up)],axis=-1)
 # A restrained reference grid, matching the model's millimeter coordinates.
 for k in range(-100,101,20):
  for line in [((k,-100,-.5),(k,100,-.5)),((-100,k,-.5),(100,k,-.5))]:
   points=project(line); d.line([tuple(p) for p in points],fill='#e1e3e5',width=1)
 d.rectangle((0,600,W,H),fill='#f5f4f0')
 pts=project(triangles)
 depth=triangles.mean(axis=1)@forward
 normals=np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0]); lengths=np.linalg.norm(normals,axis=1); normals=normals/np.maximum(lengths[:,None],1e-8)
 light=np.array([-.35,-.45,.82]); light=light/np.linalg.norm(light)
 pixels=np.array(im); zbuffer=np.full((H,W),-np.inf)
 for i in range(len(pts)):
  if normals[i]@forward <= 0: continue
  p=pts[i]; x0=max(0,int(np.floor(p[:,0].min()))); x1=min(W-1,int(np.ceil(p[:,0].max())))
  y0=max(0,int(np.floor(p[:,1].min()))); y1=min(H-1,int(np.ceil(p[:,1].max())))
  if x1<x0 or y1<y0: continue
  x,y=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5)
  den=(p[1,1]-p[2,1])*(p[0,0]-p[2,0])+(p[2,0]-p[1,0])*(p[0,1]-p[2,1])
  if abs(den)<1e-8: continue
  a=((p[1,1]-p[2,1])*(x-p[2,0])+(p[2,0]-p[1,0])*(y-p[2,1]))/den
  b=((p[2,1]-p[0,1])*(x-p[2,0])+(p[0,0]-p[2,0])*(y-p[2,1]))/den
  c=1-a-b; depths=triangles[i]@forward; z=a*depths[0]+b*depths[1]+c*depths[2]
  region=zbuffer[y0:y1+1,x0:x1+1]; mask=(a>=-1e-6)&(b>=-1e-6)&(c>=-1e-6)&(z>region)
  shade=.7+.3*max(0,float(normals[i]@light)); color=tuple(int(v*shade) for v in (110,153,197))
  pixels[y0:y1+1,x0:x1+1][mask]=color; region[mask]=z[mask]
 im=Image.fromarray(pixels); d=ImageDraw.Draw(im)
 d.text((693,557),'Demo tray · 120 × 80 × 26 mm',font=small,fill='#657181')
 d.line((56,601,1224,601),fill='#dadde0')
 for start,end,text in subtitles:
  if start <= t < end:
   width=d.textlength(text,font=caption); d.text(((W-width)/2,637),text,font=caption,fill='#273544')
 if frame==FPS*5: im.save(ROOT/'poster.png')
 proc.stdin.write(im.tobytes())
proc.stdin.close()
if proc.wait(): raise SystemExit('Encoding failed')
(ROOT/'captions.srt').write_text('''1
00:00:00,350 --> 00:00:03,450
Hey, I've been working on a small project called Form.

2
00:00:03,450 --> 00:00:06,350
It's a tool for making simple 3D parts

3
00:00:06,350 --> 00:00:08,250
and keeping track of the changes you make.

4
00:00:08,250 --> 00:00:10,550
Let me show you how it works.
''')
print(ROOT/'form-intro-v1.mp4')
