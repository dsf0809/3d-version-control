"""A narrated model demonstration using actual Form/JSCAD geometry."""
from pathlib import Path
import json, math, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT=Path(__file__).resolve().parent
S=1.5; W,H=1920,1080; FPS=24
DATA=json.loads((ROOT/'meshes.json').read_text()); timing=json.loads((ROOT/'timing.json').read_text()); DURATION=math.ceil(timing['duration']*FPS)/FPS
meshes={k:np.array(v,dtype=np.float32).reshape(-1,3,3) for k,v in DATA.items() if k!='movement'}
movement=[np.array(v,dtype=np.float32).reshape(-1,3,3) for v in DATA['movement']]
FONT='/System/Library/Fonts/Helvetica.ttc'; fonts={}
INK='#263346'; MUTED='#758094'; BLUE=(99,150,217); GREEN=(54,177,129); RED=(224,101,109); GRAY=(180,188,201)

def ft(n):
 if n not in fonts: fonts[n]=ImageFont.truetype(FONT,round(n*S))
 return fonts[n]
def pos(xy): return tuple(round(x*S) for x in xy)
def ease(x): x=np.clip(x,0,1); return float(x*x*(3-2*x))
def text(d,xy,label,size=18,color=INK): d.text(pos(xy),label,font=ft(size),fill=color)
def multi(d,xy,label,size=38,color=INK): d.multiline_text(pos(xy),label,font=ft(size),fill=color,spacing=round(7*S))
def rr(d,box,fill,outline=None,r=15,width=1): d.rounded_rectangle(pos(box),radius=round(r*S),fill=fill,outline=outline,width=round(width*S))
def line(d,points,color,width=1): d.line([pos(p) for p in points],fill=color,width=max(1,round(width*S)))
def pill(d,x,y,label,fill='#eef1f6',color=INK):
 width=d.textlength(label,font=ft(14))/S+24; rr(d,(x,y,x+width,y+30),fill,r=15); text(d,(x+12,y+6),label,14,color); return width

def render_mesh(im,layers,center=(840,343),scale=3.6,yaw=.7,elev=.64,wire=0):
 right=np.array([math.cos(yaw),-math.sin(yaw),0]); up=np.array([math.sin(yaw)*math.sin(elev),math.cos(yaw)*math.sin(elev),math.cos(elev)]); front=np.cross(right,up)
 def project(v): v=np.asarray(v); return np.stack([center[0]*S+scale*S*(v@right),center[1]*S-scale*S*(v@up)],axis=-1)
 # Soft contact shadow and a ground grid give the models depth.
 shadow=Image.new('RGBA',(W,H)); sd=ImageDraw.Draw(shadow); cx,cy=center
 sd.ellipse(pos((cx-60*scale,cy-17*scale,cx+60*scale,cy+26*scale)),fill=(40,51,70,25))
 shadow=shadow.filter(ImageFilter.GaussianBlur(14*S)); im=Image.alpha_composite(im.convert('RGBA'),shadow).convert('RGB')
 d=ImageDraw.Draw(im)
 # Only draw the grid within the model region.
 grid=Image.new('RGBA',(W,H)); gd=ImageDraw.Draw(grid)
 for k in range(-100,101,20):
  for v in [((k,-90,-1),(k,90,-1)),((-90,k,-1),(90,k,-1))]:
   gd.line([tuple(p) for p in project(v)],fill=(182,191,204,65),width=1)
 im=Image.alpha_composite(im.convert('RGBA'),grid).convert('RGB')
 pixels=np.array(im); zbuffer=np.full((H,W),-np.inf,dtype=np.float32)
 light=np.array([-.4,-.25,.86]); light/=np.linalg.norm(light)
 edge_groups=[]
 for tri,color in layers:
  pts=project(tri); depths=tri@front
  norms=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]); norms/=np.maximum(np.linalg.norm(norms,axis=1)[:,None],1e-8)
  for i,p in enumerate(pts):
   if norms[i]@front<=0: continue
   x0=max(0,int(np.floor(p[:,0].min()))); x1=min(W-1,int(np.ceil(p[:,0].max())))
   y0=max(100,int(np.floor(p[:,1].min()))); y1=min(int(580*S),int(np.ceil(p[:,1].max())))
   if x1<x0 or y1<y0: continue
   den=(p[1,1]-p[2,1])*(p[0,0]-p[2,0])+(p[2,0]-p[1,0])*(p[0,1]-p[2,1])
   if abs(den)<1e-6: continue
   x,y=np.meshgrid(np.arange(x0,x1+1,dtype=np.float32)+.5,np.arange(y0,y1+1,dtype=np.float32)+.5)
   a=((p[1,1]-p[2,1])*(x-p[2,0])+(p[2,0]-p[1,0])*(y-p[2,1]))/den
   b=((p[2,1]-p[0,1])*(x-p[2,0])+(p[0,0]-p[2,0])*(y-p[2,1]))/den; c=1-a-b
   z=a*depths[i,0]+b*depths[i,1]+c*depths[i,2]
   region=zbuffer[y0:y1+1,x0:x1+1]; mask=(a>=-1e-6)&(b>=-1e-6)&(c>=-1e-6)&(z>region)
   shade=.63+.37*max(0,float(norms[i]@light)); rgb=np.array(color)*shade
   rgb=rgb*(1-wire)+np.array([246,245,241])*wire
   pixels[y0:y1+1,x0:x1+1][mask]=rgb.astype(np.uint8); region[mask]=z[mask]
  if wire>0: edge_groups.append(pts)
 im=Image.fromarray(pixels)
 if wire>.05:
  d=ImageDraw.Draw(im)
  for group in edge_groups:
   for p in group: d.line([tuple(v) for v in p]+[tuple(p[0])],fill=tuple(int(225+(c-225)*wire) for c in (108,144,197)),width=1)
 return im

def background():
 im=Image.new('RGB',(W,H),'#f7f6f2');d=ImageDraw.Draw(im)
 text(d,(42,25),'form.',27)
 text(d,(124,35),'a small project I’m building',14,MUTED)
 line(d,[(42,78),(1238,78)],'#dfe3e9')
 text(d,(1078,35),'MODEL WALKTHROUGH',11,MUTED)
 return im

def frame_at(t):
 im=background(); d=ImageDraw.Draw(im)
 # Four short scenes, cut around the narration instead of a static title card.
 if t<4.0:
  a=ease(t/1.45)
  im=render_mesh(im,[(meshes['before'],BLUE)],center=(835,365),scale=3.6+.22*ease(t/4),yaw=.40+.26*ease(t/4),wire=1-a)
  d=ImageDraw.Draw(im)
  pill(d,48,125,'01  /  a small experiment','#e8e9fb','#5a5a95')
  multi(d,(48,188),'I made a little\n3D workshop.',38)
  text(d,(50,304),'It’s called Form.',21,MUTED)
  line(d,[(50,391),(318,391)],'#dfe3e9')
  text(d,(50,412),'An idea, made editable.',17)
  pill(d,772,527,'Organizer tray · V0')
 elif t<7.8:
  u=(t-4)/3.8
  # Two other real templates show the breadth of starting points.
  im=render_mesh(im,[(meshes['before'],BLUE)],center=(625,348),scale=2.85,yaw=.66+.1*u)
  im=render_mesh(im,[(meshes['enclosure'],(176,150,210))],center=(1035,232),scale=1.45,yaw=.61)
  im=render_mesh(im,[(meshes['bracket'],(221,165,114))],center=(1035,449),scale=1.45,yaw=.68)
  d=ImageDraw.Draw(im)
  pill(d,48,125,'02  /  try an idea','#e8e9fb','#5a5a95')
  multi(d,(48,188),'Start with\nsomething simple.',32)
  text(d,(50,296),'A tray, a box, a bracket.',17,MUTED)
  text(d,(50,326),'Then make it fit your idea.',17,MUTED)
  pill(d,531,518,'120 × 80 × 26 mm')
  pill(d,988,319,'Enclosure');pill(d,993,521,'L bracket')
  rr(d,(52,410,344,488),'#ffffff','#e0e4eb')
  text(d,(69,424),'TRY A CHANGE',10,MUTED)
  prompt='Move the divider left.'; length=round(len(prompt)*ease((u-.2)/.5))
  text(d,(69,446),prompt[:length]+('|' if u<.82 else ''),18)
 elif t<13.1:
  u=t-7.8
  if u<1.5:
   idx=round(48*ease(u/1.3)); layers=[(movement[idx],BLUE)]
  else: layers=[(meshes['unchanged'],GRAY),(meshes['removed'],RED),(meshes['added'],GREEN)]
  im=render_mesh(im,layers,center=(846,367),scale=3.8,yaw=.65+.08*ease(u/5.3),elev=.77)
  d=ImageDraw.Draw(im)
  pill(d,48,125,'03  /  see the difference','#e8e9fb','#5a5a95')
  multi(d,(48,188),'What changed?',36)
  if u<1.5:
   text(d,(50,264),'Moving the divider…',21,MUTED)
   pill(d,51,337,'Same outside dimensions')
  else:
   pill(d,51,270,'Removed','#fbe7e8','#b74959');pill(d,51,309,'Added','#e0f4eb','#218361');pill(d,51,348,'Unchanged','#e9ecf1','#5d687b')
   multi(d,(50,422),'Check the difference\nbefore you save.',19,MUTED)
   angle=.65+.08*ease(u/5.3)
   old=(846+3.8*17*math.cos(angle),367-3.8*(17*math.sin(angle)*math.sin(.77)+26*math.cos(.77)))
   new=(846-3.8*17*math.cos(angle),367-3.8*(-17*math.sin(angle)*math.sin(.77)+26*math.cos(.77)))
   line(d,[(819,151),old],'#b74959',2);pill(d,752,121,'old position','#fbe7e8','#b74959')
   line(d,[(667,454),new],'#218361',2);pill(d,607,451,'new position','#e0f4eb','#218361')
  # Version markers, with a new revision appearing after the comparison.
  line(d,[(812,550),(1055,550)],'#ccd4e1',3)
  for x,label,active in [(812,'V0',True),(1055,'V1',u>4.15)]:
   rr(d,(x-9,541,x+9,559),'#315ce8' if active else '#dce2eb',r=9)
   text(d,(x-10,568),label,14,MUTED)
  if u>4.15:pill(d,1063,528,'Saved','#e0f4eb','#218361')
 else:
  u=ease((t-13.1)/(DURATION-13.1))
  im=render_mesh(im,[(meshes['after'],BLUE)],center=(843,363),scale=3.7,yaw=.75+.12*u,elev=.67)
  d=ImageDraw.Draw(im)
  pill(d,48,125,'04  /  let’s have a look','#e8e9fb','#5a5a95')
  multi(d,(48,188),'Still a work\nin progress.',36)
  text(d,(50,305),'Let me show you around.',20,MUTED)
  rr(d,(51,408,341,472),'#ffffff','#dce2e9')
  text(d,(69,423),'NEXT: YOUR FIRST PROJECT',12,'#526bb0')
  text(d,(69,444),'Choose a shape. Set its size.',15)
  pill(d,766,533,'Updated tray · V1','#e3edf9','#486f9b')
 # A consistent low-key caption area with ample contrast.
 d=ImageDraw.Draw(im); d.rectangle(pos((0,612,1280,720)),fill='#f7f6f2')
 line(d,[(42,612),(1238,612)],'#dfe3e9')
 current=next((v for v in timing['lines'] if v['start']<=t<v['end']+.2),None)
 if current:
  caption=current['text']; words=caption.split(); lines=['']
  for word in words:
   test=(lines[-1]+' '+word).strip()
   if d.textlength(test,font=ft(23))>1120*S: lines.append(word)
   else: lines[-1]=test
  for k,label in enumerate(lines):
   width=d.textlength(label,font=ft(23))/S;text(d,((1280-width)/2,630+k*28),label,23)
 text(d,(43,698),'Illustrated with actual Form geometry',10,MUTED)
 text(d,(1114,698),'PART 1 · INTRO',10,MUTED)
 # A subtle shot progress marker.
 line(d,[(42,610),(42+1196*t/DURATION,610)],'#b8c8ed',2)
 return im

cmd=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(ROOT/'mix.wav'),'-map','0:v','-map','1:a','-t',str(DURATION),'-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',str(ROOT/'form-intro-v2.mp4')]
proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
for i in range(round(DURATION*FPS)):
 im=frame_at(i/FPS)
 if i in [48,144,240,360]: im.save(ROOT/f'shot-{i}.png')
 proc.stdin.write(im.tobytes())
 if i%96==0: print(f'Rendered {i}/{round(DURATION*FPS)} frames',flush=True)
proc.stdin.close()
if proc.wait():raise RuntimeError('Encode failed')
print('Completed',ROOT/'form-intro-v2.mp4',flush=True)
