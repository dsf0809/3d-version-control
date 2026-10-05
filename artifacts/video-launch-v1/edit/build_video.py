"""Generate the local Hyperframes launch film from genuine Form captures."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
FRAMES=ROOT/'compositions/frames'
FRAMES.mkdir(parents=True,exist_ok=True)

STYLE='''
@font-face{font-family:Arial;src:url('assets/Arial.ttf') format('truetype');font-weight:400}
@font-face{font-family:Arial;src:url('assets/Arial-Bold.ttf') format('truetype');font-weight:700}
*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#202830;font-family:Arial,sans-serif}
#root{width:100%;height:100%;position:relative;overflow:hidden}
.clip{position:absolute;inset:0}.base{background:#f5f6f8}
.brand{position:absolute;left:76px;top:59px;display:flex;align-items:center;gap:16px;font-size:65px;font-weight:700;letter-spacing:-4px}
.brand img{width:54px;height:54px}.brand .dot{color:#315ce8}
.descriptor{position:absolute;right:82px;top:91px;font-size:23px;letter-spacing:2.8px;color:#67717d}
.header-rule{position:absolute;left:76px;right:76px;top:164px;height:1px;background:#dce1e6}
.form-scene{position:relative;width:100%;height:100%;overflow:hidden}
.visual{position:absolute;left:76px;top:224px;width:1088px;height:670px;perspective:1800px}
.stage{position:absolute;inset:0;border-radius:14px;background:rgba(49,92,232,.04);border:1.5px solid rgba(49,92,232,.2);overflow:hidden}
.media-shell{position:absolute;left:22px;top:75px;width:1044px;height:575px;overflow:hidden;border-radius:12px}
.screen-video{width:100%;height:100%;object-fit:cover;display:block}
.stage-label{position:absolute;top:25px;left:29px;font-size:22px;font-weight:700;color:#315ce8;letter-spacing:.3px}
.stage-sub{position:absolute;right:27px;top:28px;font-size:17px;color:#202830}
.stage-media{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain}
.capture{position:absolute;object-fit:contain;display:block;border-radius:12px}
.float-card{position:absolute;left:150px;top:70px;width:790px;height:550px;display:flex;align-items:center;justify-content:center}
.float-card img{max-width:100%;max-height:100%;display:block;border-radius:12px}
.panel-label{position:absolute;left:30px;top:26px;font-size:22px;letter-spacing:.4px;color:#315ce8;font-weight:700}
.aside{position:absolute;left:1236px;top:265px;width:608px}
.eyebrow{font-size:22px;letter-spacing:3px;color:#315ce8;font-weight:700;margin:0 0 28px;text-transform:uppercase}
.headline{font-size:78px;line-height:1.02;letter-spacing:-3.6px;font-weight:700;margin:0 0 37px}
.headline span{display:block}.headline .blue{color:#315ce8}
.points{--hf-panel-open:1;overflow:hidden;max-height:calc(var(--hf-panel-open)*380px);opacity:var(--hf-panel-open)}
.point{font-size:29px;line-height:1.38;margin:0 0 20px;color:#67717d;display:flex;align-items:flex-start;gap:15px}
.point::before{content:'';flex:0 0 8px;width:8px;height:8px;border-radius:100%;background:#315ce8;margin-top:15px}
.point.green::before{background:#059669}.point.red::before{background:#dc2626}
.point.green{color:#04724f}.point.red{color:#b52323}
.footnote{font-size:21px;line-height:1.4;color:#67717d;margin-top:33px}
.footer{position:absolute;left:76px;right:76px;bottom:49px;height:68px}
.steps{display:flex;gap:12px;align-items:center}.step{font-size:22px;padding:11px 23px;border-radius:100px;color:#67717d;background:transparent}
.step-dot{font-size:18px;color:#67717d}.footer-tag{position:absolute;right:0;top:13px;font-size:21px;color:#67717d}
.progress-track{position:absolute;left:76px;right:76px;bottom:31px;height:4px;background:rgba(49,92,232,.10)}
.progress-fill{height:4px;width:100%;background:#315ce8;transform-origin:left center}
.badge{position:absolute;left:29px;bottom:23px;display:flex;align-items:center;gap:12px;color:#315ce8;font-size:22px;font-weight:700}
.badge .pill{background:white;padding:11px 19px;border-radius:100px;border:1px solid #dce1e6}
.model-close{width:100%;height:100%;object-fit:cover}
.url{font-size:24px;line-height:1.5;color:#315ce8;margin-top:34px;word-break:normal}
.end-action{display:inline-block;padding:15px 24px;background:#315ce8;color:#f5f6f8;border-radius:100px;font-size:25px;margin-top:10px}
'''

def aside(id, eyebrow, lines, points, note=''):
    hs=''.join(f'<span class="{"blue" if i==len(lines)-1 else ""}">{line}</span>' for i,line in enumerate(lines))
    ps=''.join(f'<p class="point {tone}">{text}</p>' for text,tone in points)
    return f'<aside id="{id}-copy" class="aside"><p class="eyebrow">{eyebrow}</p><h1 class="headline">{hs}</h1><div id="{id}-points" class="points">{ps}</div>{note}</aside>'

def frame(id,duration,visual,copy,extra=''):
    # Common motion is a restrained entrance; UI changes inside each shot carry the story.
    js=f'''const tl=gsap.timeline({{paused:true}});
    tl.fromTo('#{id}-visual',{{opacity:0,x:40,rotationY:-3}},{{opacity:1,x:0,rotationY:0,duration:.65,ease:'power3.out'}},.02);
    tl.fromTo('#{id}-copy .eyebrow',{{opacity:0,y:14}},{{opacity:1,y:0,duration:.35,ease:'power2.out'}},.08);
    tl.fromTo('#{id}-copy .headline span',{{opacity:0,y:30}},{{opacity:1,y:0,duration:.55,stagger:.12,ease:'power3.out'}},.2);
    tl.fromTo('#{id}-points',{{'--hf-panel-open':0}},{{'--hf-panel-open':1,duration:.7,ease:'power3.inOut'}},.65);
    {extra}
    window.__timelines['{id}']=tl;'''
    file=FRAMES/f'{id}.html'
    file.write_text(f'''<template><div id="{id}-root" class="form-scene" data-composition-id="{id}" data-duration="{duration}" data-width="1920" data-height="1080"><div id="{id}-visual" class="visual">{visual}</div>{copy}</div><script>{js}</script></template>''')

hero='''<div class="stage"><div class="stage-label">A little idea. A real-world object.</div><div class="stage-sub">FORM WORKSHOP</div><div class="media-shell"><video id="hero-video" class="screen-video" src="assets/workshop.mp4" data-start="0" data-duration="4" data-media-start="1" muted playsinline></video></div></div>'''
frame('hero',4,hero,aside('hero','Meet Form',['Ideas take','shape.'],[('Simple 3D parts.',''),('A history of every step.','')]))

guide='''<div class="stage"><div class="panel-label">GUIDED FIRST PROJECT</div><div id="guide-choice" class="float-card"><img src="assets/guide-choose.png" style="width:790px" /></div><div id="guide-size" class="float-card"><img src="assets/guide-size.png" style="height:548px" /></div></div>'''
frame('guide',6,guide,aside('guide','01 / Get started',['Start with','something','useful.'],[('Tray, enclosure or bracket',''),('Set your dimensions','')]),'''
    tl.set('#guide-size',{opacity:0},0);
    tl.to('#guide-choice',{opacity:0,x:-42,duration:.32,ease:'power2.in'},2.8);
    tl.fromTo('#guide-size',{opacity:0,x:55},{opacity:1,x:0,duration:.55,ease:'power3.out'},2.9);
''')

edit='''<div class="stage"><div class="panel-label">DIRECT CONTROLS + AI ASSISTANCE</div><div id="edit-direct" class="float-card"><img src="assets/edit-dimensions.png" style="height:550px" /></div><div id="edit-ai" style="position:absolute;left:164px;top:103px;width:760px"><p style="margin:0 0 18px;font-size:26px;color:#202830;font-weight:700">Describe a change</p><img src="assets/assistant-input.png" style="width:760px;height:400px;object-fit:cover;object-position:top;display:block;border-radius:14px" /><p style="margin-top:16px;font-size:20px;color:#202830">Example request · review the proposal before saving</p></div></div>'''
frame('edit',6,edit,aside('edit','02 / Make changes',['Make it','your own.'],[('Adjust dimensions directly',''),('Describe changes to the AI','')]),'''
    tl.set('#edit-ai',{opacity:0},0);
    tl.to('#edit-direct',{opacity:0,x:-42,duration:.3,ease:'power2.in'},2.6);
    tl.fromTo('#edit-ai',{opacity:0,x:55},{opacity:1,x:0,duration:.55,ease:'power3.out'},2.75);
''')

compare='''<div class="stage"><div class="stage-label">SAVED VERSION COMPARISON</div><div class="stage-sub">V0 → V1</div><div style="position:absolute;left:20px;top:92px;width:1048px;height:515px;overflow:hidden;border-radius:12px"><video id="compare-video" class="screen-video" style="object-fit:contain" src="assets/comparison.mp4" data-start="0" data-duration="8" muted playsinline></video></div><div class="badge"><span class="pill">Same outer dimensions</span><span>120 × 80 × 26 mm</span></div></div>'''
frame('compare',8,compare,aside('compare','03 / Compare versions',['See every','change.'],[('Removed geometry','red'),('Added geometry','green')],'<p class="footnote">A moved divider. A visible difference.</p>'),'''
    tl.fromTo('#compare-copy .footnote',{opacity:0,y:16},{opacity:1,y:0,duration:.5,ease:'power2.out'},2.1);
    tl.fromTo('#compare-visual .badge',{opacity:0,y:12},{opacity:1,y:0,duration:.5,ease:'power2.out'},3.1);
''')

export='''<div class="stage"><div class="panel-label" id="export-label">YOUR DESIGN HISTORY</div><div id="export-v0" style="position:absolute;left:233px;top:74px;width:620px;height:560px"><img src="assets/version-0.png" style="width:100%;height:100%;object-fit:contain;border-radius:12px" /></div><div id="export-v1" style="position:absolute;left:233px;top:74px;width:620px;height:560px"><img src="assets/version-1.png" style="width:100%;height:100%;object-fit:contain;border-radius:12px" /></div><div id="export-dialog" class="float-card" style="left:126px;top:103px;width:835px;height:550px"><img src="assets/export.png" style="width:780px" /></div></div>'''
frame('export',8,export,aside('export','04 / Keep going',['Keep the','progress.'],[('Revisit saved revisions',''),('Export STL or 3MF','')]),'''
    tl.set('#export-v1,#export-dialog',{opacity:0},0);
    tl.to('#export-v0',{opacity:0,duration:.2},1.7);
    tl.to('#export-v1',{opacity:1,duration:.3},1.7);
    tl.to('#export-v1',{opacity:0,x:-35,duration:.3,ease:'power2.in'},3.6);
    tl.set('#export-label',{innerText:'EXPORT & PRINT'},3.8);
    tl.fromTo('#export-dialog',{opacity:0,x:50},{opacity:1,x:0,duration:.55,ease:'power3.out'},3.8);
''')

close='''<div class="stage"><div class="stage-label">YOUR NEXT IDEA STARTS HERE</div><div class="media-shell"><video id="close-video" class="screen-video" src="assets/workshop.mp4" data-start="0" data-duration="4" data-media-start="4" muted playsinline></video></div></div>'''
frame('close',4,close,aside('close','Form / Open source',['Build.','Compare.','Improve.'],[], '<span class="end-action">Explore the project</span><div class="url">github.com/dsf0809/<span style="display:block">3d-version-control</span></div>'),'''
    tl.fromTo('#close-copy .end-action,#close-copy .url',{opacity:0,y:15},{opacity:1,y:0,duration:.5,stagger:.12,ease:'power3.out'},1.0);
''')

timeline=[('hero',0,4),('guide',4,6),('edit',10,6),('compare',16,8),('export',24,8),('close',32,4)]
hosts='\n'.join(f'<div id="{id}" class="clip" data-composition-id="{id}" data-composition-src="compositions/frames/{id}.html" data-start="{start}" data-duration="{duration}" data-track-index="1"></div>' for id,start,duration in timeline)
mainjs='''const tl=gsap.timeline({paused:true});
tl.fromTo('#progress',{scaleX:0},{scaleX:1,duration:36,ease:'none'},0);
'''
for id,start,end in [('start',4,10),('edit',10,16),('compare',16,24),('export',24,32)]:
    mainjs+=f"tl.to('#nav-{id}',{{backgroundColor:'#315ce8',color:'#f5f6f8',duration:.3}}, {start});\n"
    mainjs+=f"tl.to('#nav-{id}',{{backgroundColor:'rgba(49,92,232,0)',color:'#67717d',duration:.3}}, {end});\n"
mainjs+="window.__timelines['form-launch']=tl;"
(ROOT/'index.html').write_text(f'''<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920,height=1080"><title>Form — Make. Compare. Improve.</title><script src="assets/gsap.min.js"></script><style>{STYLE}</style></head><body><div id="root" data-composition-id="form-launch" data-width="1920" data-height="1080" data-duration="36"><div id="ground" class="clip base"></div>{hosts}<div id="chrome" class="clip" style="pointer-events:none"><div class="brand"><img src="assets/brand-cube.svg"/><span>form<span class="dot">.</span></span></div><div class="descriptor">3D DESIGN · VERSION HISTORY</div><div class="header-rule"></div><div class="footer"><div class="steps"><span id="nav-start" class="step">Start</span><span class="step-dot">/</span><span id="nav-edit" class="step">Edit</span><span class="step-dot">/</span><span id="nav-compare" class="step">Compare</span><span class="step-dot">/</span><span id="nav-export" class="step">Export</span></div><div class="footer-tag">Simple parts. Clear changes.</div></div><div class="progress-track"><div id="progress" class="progress-fill"></div></div></div><audio id="music" src="assets/music.wav" data-start="0" data-duration="36" data-track-index="4" data-volume="1"></audio></div><script>{mainjs}</script></body></html>''')

(ROOT/'edit/timeline.json').write_text(json.dumps({'duration':36,'fps':30,'voiceover':False,'scenes':[{'id':id,'start':st,'duration':d} for id,st,d in timeline]},indent=2))
print('Authored 6 scenes, 36 seconds, no voiceover.')
