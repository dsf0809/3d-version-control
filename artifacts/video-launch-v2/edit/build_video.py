"""Beat-driven Form launch: actual UI captures, no voiceover."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1];FRAMES=ROOT/'compositions/frames';FRAMES.mkdir(exist_ok=True)
B=60/128;D=72*B
STYLE='''
@font-face{font-family:Arial;src:url('assets/Arial.ttf');font-weight:400}
@font-face{font-family:Arial;src:url('assets/Arial-Bold.ttf');font-weight:700}
*{box-sizing:border-box}body{margin:0;background:#f2f5fb;color:#152033;font-family:Arial,sans-serif}
#root{width:100%;height:100%;position:relative;overflow:hidden}.clip{position:absolute;inset:0}
.background{position:absolute;inset:0;background:linear-gradient(125deg,#f9fafc 20%,#eef2fd 75%,#e7edff)}
.brand{position:absolute;left:70px;top:42px;display:flex;align-items:center;gap:14px;font-size:60px;font-weight:700;letter-spacing:-3px}.brand img{width:48px;height:48px}.dot{color:#315ce8}
.descriptor{position:absolute;right:76px;top:78px;font-size:20px;letter-spacing:2px;color:#536175}
.scene{position:relative;width:100%;height:100%;overflow:hidden}
.visual{position:absolute;left:50px;top:180px;width:1130px;height:760px;perspective:1800px}
.stage{position:absolute;inset:0;border-radius:28px;overflow:hidden;background:#edf1fa}
.stage-label{position:absolute;left:32px;top:25px;font-size:23px;letter-spacing:1px;color:#315ce8;font-weight:700;z-index:5}
.media-wrap{position:absolute;left:24px;right:24px;top:83px;bottom:32px;overflow:hidden;border-radius:20px}
.video{display:block;width:100%;height:100%;object-fit:contain}.cover{object-fit:cover}
.camera{position:absolute;inset:0;transform-origin:50% 50%}
.float{position:absolute;inset:70px 70px 45px;display:flex;align-items:center;justify-content:center;transform-origin:50% 50%}
.float img{max-width:100%;max-height:100%;display:block;border-radius:18px;box-shadow:0 22px 45px rgba(45,65,110,.08)}
.aside{position:absolute;left:1248px;top:281px;width:600px}.eyebrow{font-size:23px;letter-spacing:3px;color:#315ce8;font-weight:700;margin:0 0 32px;text-transform:uppercase}
.headline{font-size:85px;line-height:.99;letter-spacing:-3.8px;font-weight:700;margin:0 0 44px}.line{display:block;width:100%}.blue{color:#315ce8}
.point{font-size:29px;line-height:1.32;color:#4f5c70;margin:0 0 20px;display:flex;gap:15px}.point:before{content:'';width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#315ce8;margin-top:14px}
.point.red{color:#b52229}.point.red:before{background:#e54550}.point.green{color:#087954}.point.green:before{background:#06a96e}
.note{margin-top:30px;font-size:22px;line-height:1.4;color:#536175}.pill{display:inline-block;border-radius:40px;padding:12px 22px;background:#315ce8;color:white;font-size:25px;font-weight:700}
.history-pill{position:absolute;left:40px;top:25px;padding:12px 23px;border-radius:50px;background:#315ce8;color:white;font-size:29px;font-weight:700;z-index:8}
.history-image{position:absolute;left:132px;top:35px;width:870px;height:690px;object-fit:contain;transform-origin:50% 70%}
.history-card{position:absolute;inset:0}
.prompt{position:absolute;left:115px;top:175px;width:900px;height:475px;overflow:hidden;border-radius:22px;box-shadow:0 22px 45px rgba(45,65,110,.09)}
.prompt video{width:100%;height:100%;object-fit:cover}.prompt-note{position:absolute;left:120px;top:675px;color:#35445a;font-size:21px}
.detail-tag{position:absolute;left:36px;bottom:29px;background:#fff;border:1px solid #d7dff0;border-radius:40px;padding:13px 22px;font-size:23px;color:#315ce8;font-weight:700;z-index:6}
.link{font-size:27px;line-height:1.45;color:#315ce8;margin-top:33px}.link span{display:block}.cta{font-size:28px;display:inline-block;background:#315ce8;color:white;padding:16px 25px;border-radius:40px;margin-top:1px}
.footer{position:absolute;left:74px;bottom:43px;color:#536175;font-size:20px;letter-spacing:2px}.progress{position:absolute;left:74px;right:74px;bottom:26px;height:4px;background:#dce4f3}.progress i{display:block;width:100%;height:100%;background:#315ce8;transform-origin:left}
.beat-mark{position:absolute;right:80px;bottom:43px;display:flex;gap:6px;height:25px;align-items:center}.beat-mark i{display:block;width:5px;height:22px;background:#315ce8;transform-origin:center;border-radius:3px}
.accent{position:absolute;left:1207px;top:292px;width:4px;height:120px;background:#315ce8;transform-origin:top;border-radius:4px}
'''
def aside(id,eye,lines,points,note=''):
 return f'<aside id="{id}-copy" class="aside"><p class="eyebrow">{eye}</p><h1 class="headline">'+''.join(f'<span class="line {"blue" if i==len(lines)-1 else ""}">{x}</span>' for i,x in enumerate(lines))+f'</h1><div class="points">'+''.join(f'<p class="point {c}">{x}</p>' for x,c in points)+f'</div>{note}</aside>'

def frame(id,dur,visual,copy,extra='',entrance='side'):
 motion={
  'side':"{x:120,rotationY:-7,scale:.93,opacity:0},{x:0,rotationY:0,scale:1,opacity:1,duration:.55,ease:'expo.out'}",
  'rise':"{y:100,rotationX:8,scale:.91,opacity:0},{y:0,rotationX:0,scale:1,opacity:1,duration:.6,ease:'power4.out'}",
  'punch':"{scale:1.08,opacity:1},{scale:1,opacity:1,duration:.5,ease:'circ.out'}"
 }[entrance]
 # Vary entrances by axis. Hold text after its beat; camera keeps media moving.
 js=f'''const tl=gsap.timeline({{paused:true}});const beat={B};
 tl.fromTo('#{id}-visual',{motion},0);
 tl.fromTo('#{id}-copy .eyebrow',{{x:26,opacity:0}},{{x:0,opacity:1,duration:.28,ease:'power3.out'}},.05);
 tl.fromTo('#{id}-copy .line',{{y:50,opacity:0,rotation:2}},{{y:0,opacity:1,rotation:0,duration:.4,stagger:beat/2,ease:'power4.out'}},.1);
 if ('{id}' !== 'close') {{ tl.fromTo('#{id}-copy .point',{{x:40,opacity:0}},{{x:0,opacity:1,duration:.32,stagger:beat/2,ease:'power3.out'}},beat*1.5); }}
 {extra}
 window.__timelines['{id}']=tl;'''
 (FRAMES/f'{id}.html').write_text(f'<template><div class="scene" data-composition-id="{id}" data-duration="{dur}" data-width="1920" data-height="1080"><div id="{id}-visual" class="visual">{visual}</div>{copy}</div><script>{js}</script></template>')

hero='''<div class="stage"><div class="stage-label">FROM AN IDEA TO A REAL PART</div><div class="media-wrap"><div id="hero-camera" class="camera" data-layout-allow-overflow><video class="video cover" id="hero-model" src="assets/hero-motion.mp4" data-start="0" data-duration="3.75" muted playsinline></video></div></div></div>'''
frame('hero',3.75,hero,aside('hero','Meet Form',['Make.','Change.','Create.'],[('Simple 3D parts',''),('Every iteration, saved','')]),'''
 tl.fromTo('#hero-camera',{scale:1.2,x:-45},{scale:1.02,x:0,duration:1.35,ease:'power3.out'},0);
 tl.to('#hero-camera',{scale:1.12,x:-15,duration:1.75,ease:'sine.inOut'},1.875);
''','punch')

guide='''<div class="stage"><div class="stage-label">GUIDED FIRST PROJECT</div><div class="media-wrap" style="top:66px;bottom:22px"><div id="guide-camera" class="camera" data-layout-allow-overflow><video class="video" id="guide-demo" src="assets/guide-motion.mp4" data-start="0" data-duration="5.625" muted playsinline></video></div></div></div>'''
frame('guide',5.625,guide,aside('guide','01 / Start with a shape',['Your idea.','Your size.'],[('Tray, enclosure or bracket',''),('Dimensions that fit','')]),'''
 tl.fromTo('#guide-camera',{scale:.9,rotation:-2},{scale:1,rotation:0,duration:1.3,ease:'power3.out'},0);
 tl.to('#guide-camera',{scale:1.065,y:-8,duration:2.5,ease:'sine.inOut'},2.6);
''','side')

edit='''<div class="stage"><div class="stage-label">DIRECT EDITING + AI ASSISTANCE</div><div id="edit-fields" class="float"><img src="assets/edit-dimensions.png" style="height:645px"/></div><div id="edit-prompt"><div class="prompt"><video id="typing" src="assets/typing-motion.mp4" data-start="1.875" data-hf-media-start-basis="local" data-duration="3.75" muted playsinline></video></div><div class="prompt-note">Example request · review changes before saving</div></div></div>'''
frame('edit',5.625,edit,aside('edit','02 / Shape the details',['Dial it in.','Or ask AI.'],[('Edit dimensions directly',''),('Describe your next change','')]),'''
 tl.fromTo('#edit-fields',{scale:.94,rotation:2},{scale:1.015,rotation:0,duration:1.6,ease:'power2.out'},0);
 tl.set('#edit-prompt',{opacity:0},0);
 tl.to('#edit-fields',{x:-500,opacity:0,rotation:-8,duration:.3,ease:'power3.in'},1.65);
 tl.fromTo('#edit-prompt',{x:360,opacity:0,rotation:3},{x:0,opacity:1,rotation:0,duration:.38,ease:'expo.out'},1.875);
 tl.to('#edit-prompt',{scale:1.035,duration:2.9,ease:'sine.inOut'},2.4);
''','rise')

compare='''<div class="stage"><div class="stage-label">SAVED COMPARISON · V0 → V1</div><div class="media-wrap" style="top:100px;bottom:80px"><div id="compare-camera" class="camera" data-layout-allow-overflow><video class="video cover" id="compare-model" src="assets/compare-motion.mp4" data-start="0" data-duration="7.5" muted playsinline></video></div></div><div id="compare-tag" class="detail-tag">Same outside. A new layout.</div></div>'''
frame('compare',7.5,compare,aside('compare','03 / See the difference',['Every change.','In view.'],[('Red: removed','red'),('Green: added','green')],'<p class="note">Move a divider.<span style="display:block">See exactly what changed.</span></p>'),'''
 tl.fromTo('#compare-camera',{scale:1.12,x:-30},{scale:1,x:0,duration:1.3,ease:'power3.out'},0);
 tl.to('#compare-camera',{scale:1.25,x:15,y:4,duration:1,ease:'power3.inOut'},1.875);
 tl.to('#compare-camera',{scale:1.08,x:0,y:0,duration:1.3,ease:'power3.inOut'},4.6875);
 tl.fromTo('#compare-tag',{x:-320,opacity:0},{x:0,opacity:1,duration:.45,ease:'expo.out'},3.75);
''','punch')

export='''<div class="stage"><div id="history-v0" class="history-card"><span class="history-pill">V0 · Original</span><img class="history-image" src="assets/version-0.png"/></div><div id="history-v1" class="history-card"><span class="history-pill">V1 · Revised</span><img class="history-image" src="assets/version-1.png"/></div><div id="export-card" class="history-card"><div class="stage-label">EXPORT & PRINT</div><div class="float" style="inset:85px 80px 30px"><img src="assets/export.png" style="width:850px"/></div></div></div>'''
frame('export',7.5,export,aside('export','04 / Keep moving',['Revisit.','Refine.','Export.'],[('Keep earlier versions',''),('Download STL or 3MF','')]),'''
 tl.set('#history-v1,#export-card',{opacity:0},0);
 tl.fromTo('#history-v0 .history-image',{scale:.96},{scale:1.035,duration:1.7,ease:'sine.out'},0);
 tl.to('#history-v0',{x:-180,opacity:0,duration:.25,ease:'power2.in'},1.65);
 tl.fromTo('#history-v1',{x:170,opacity:0},{x:0,opacity:1,duration:.4,ease:'expo.out'},1.875);
 tl.fromTo('#history-v1 .history-image',{scale:.96},{scale:1.035,duration:1.7,ease:'sine.out'},1.875);
 tl.to('#history-v1',{scale:.88,opacity:0,duration:.25,ease:'power2.in'},3.5);
 tl.fromTo('#export-card',{scale:1.12,opacity:0},{scale:1,opacity:1,duration:.5,ease:'circ.out'},3.75);
 tl.to('#export-card .float',{scale:1.04,y:-7,duration:2.5,ease:'sine.inOut'},4.5);
''','side')

close='''<div class="stage"><div class="stage-label">WHAT WILL YOU MAKE NEXT?</div><div class="media-wrap"><div class="camera" data-layout-allow-overflow id="close-camera"><video class="video cover" id="close-model" src="assets/hero-motion.mp4" data-start="0" data-duration="3.75" muted playsinline></video></div></div></div>'''
frame('close',3.75,close,aside('close','Form / Open source',['Keep','creating.'],[], '<div class="cta">Explore the project</div><div class="link">github.com/dsf0809/<span>3d-version-control</span></div>'),'''
 tl.fromTo('#close-camera',{scale:1.14,x:15},{scale:1,x:0,duration:3.75,ease:'power2.out'},0);
 tl.fromTo('#close-copy .cta,#close-copy .link',{y:30,opacity:0},{y:0,opacity:1,duration:.4,stagger:.234375,ease:'power3.out'},.9375);
''','rise')

timeline=[('hero',0,3.75),('guide',3.75,5.625),('edit',9.375,5.625),('compare',15,7.5),('export',22.5,7.5),('close',30,3.75)]
hosts=''.join(f'<div id="{i}" class="clip" data-composition-id="{i}" data-composition-src="compositions/frames/{i}.html" data-start="{s}" data-duration="{d}" data-track-index="1"></div>' for i,s,d in timeline)
js=f"const tl=gsap.timeline({{paused:true}});tl.fromTo('#progress',{{scaleX:0}},{{scaleX:1,duration:{D},ease:'none'}},0);\n"
# Deterministic tiny rhythm marker on the same beat map as the score.
for j in range(72):
 for k in range(4):
  scale=[1,.56,.82,.36][(j+k)%4]
  js+=f"tl.fromTo('#tick-{k}',{{scaleY:{scale}}},{{scaleY:.18,duration:.32,ease:'power2.out',immediateRender:false}},{j*B:.6f});\n"
js+="window.__timelines['form-launch']=tl;"
(ROOT/'index.html').write_text(f'''<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Form — Keep creating</title><script src="assets/gsap.min.js"></script><style>{STYLE}</style></head><body><div id="root" data-composition-id="form-launch" data-width="1920" data-height="1080" data-duration="{D}"><div class="background"></div>{hosts}<div class="clip" id="chrome" style="pointer-events:none"><div class="brand"><img src="assets/brand-cube.svg"/><span>form<span class="dot">.</span></span></div><div class="descriptor">3D DESIGN · VERSION HISTORY</div><div class="accent"></div><div class="footer">MAKE / ITERATE / REPEAT</div><div class="beat-mark">{''.join(f'<i id="tick-{k}"></i>' for k in range(4))}</div><div class="progress"><i id="progress"></i></div></div><audio id="score" src="assets/music.wav" data-start="0" data-duration="{D}" data-track-index="3" data-volume="1"></audio></div><script>{js}</script></body></html>''')
(ROOT/'edit/timeline.json').write_text(json.dumps({'duration':D,'fps':60,'bpm':128,'voiceover':False,'scenes':[{'id':i,'start':s,'duration':d} for i,s,d in timeline]},indent=2))
print('Authored beat-driven cut:',D,'seconds / 60fps / 128 BPM')
