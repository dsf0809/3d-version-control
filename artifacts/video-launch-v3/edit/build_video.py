from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]
svg=(R/'assets/brand-cube.svg').read_text().replace('width="64" height="64"','width="310" height="310"').replace('<path ','<path pathLength="1" ')
style='''@font-face{font-family:Arial;src:url('assets/Arial.ttf');font-weight:400}@font-face{font-family:Arial;src:url('assets/Arial-Bold.ttf');font-weight:700}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#202830;background:#f4f6fc}#root{width:100%;height:100%;position:relative;overflow:hidden}.clip{position:absolute;inset:0;width:100%;height:100%}.card{position:absolute;inset:0;background:linear-gradient(125deg,#f9fafc 20%,#eef2fd 75%,#e7edff);perspective:1600px}.mark{position:absolute;left:805px;top:160px;width:310px;height:310px;transform-origin:50% 50%}.mark img,.mark svg{position:absolute;inset:0;width:100%;height:100%}.mark img{opacity:.12}.mark path{stroke-dasharray:1;stroke-dashoffset:0}.wordmark{position:absolute;top:502px;left:0;width:100%;text-align:center;font-weight:700;font-size:124px;letter-spacing:-7px;line-height:1.05;margin:0}.dot{color:#315ce8}.tag{position:absolute;left:0;top:676px;width:100%;text-align:center;font-size:32px;letter-spacing:4px;color:#4f5c70;margin:0}.rule{position:absolute;left:890px;top:644px;width:140px;height:5px;background:#315ce8;border-radius:4px;transform-origin:center}.url{position:absolute;left:0;top:785px;width:100%;text-align:center;color:#315ce8;font-size:34px;letter-spacing:.3px;margin:0}.film{object-fit:contain;display:block}'''
def card(id,start,closing=False):
 tag='KEEP CREATING.' if closing else 'MAKE. CHANGE. CREATE.'
 url='<p class="url">github.com/dsf0809/3d-version-control</p>' if closing else ''
 return f'<section id="{id}" class="clip" data-start="{start}" data-duration="3.75" data-track-index="1"><div class="card"><div class="mark"><img src="assets/brand-cube.svg"/>{svg}</div><h1 class="wordmark">form<span class="dot">.</span></h1><div class="rule"></div><p class="tag">{tag}</p>{url}</div></section>'
js="const tl=gsap.timeline({paused:true});\n"
for id,start in [('opening',0),('ending',37.5)]:
 js+=f"""tl.fromTo('#{id} .mark',{{scale:.76,rotationY:-32}},{{scale:1,rotationY:0,duration:.8,ease:'power3.out'}},{start});
 tl.fromTo('#{id} .mark path',{{strokeDashoffset:1}},{{strokeDashoffset:0,duration:.85,stagger:.12,ease:'power2.inOut'}},{start});
 tl.fromTo('#{id} .wordmark',{{y:44,opacity:0}},{{y:0,opacity:1,duration:.5,ease:'expo.out'}},{start+.46875});
 tl.fromTo('#{id} .rule',{{scaleX:0}},{{scaleX:1,duration:.45,ease:'power3.out'}},{start+.9375});
 tl.fromTo('#{id} .tag',{{y:20,opacity:0}},{{y:0,opacity:1,duration:.4,ease:'power3.out'}},{start+1.171875});
 tl.to('#{id} .mark',{{scale:1.035,duration:.234375,ease:'power2.out'}},{start+1.875});
 tl.to('#{id} .mark',{{scale:1,duration:.46875,ease:'sine.out'}},{start+2.109375});\n"""
js+="tl.fromTo('#ending .url',{y:22,opacity:0},{y:0,opacity:1,duration:.4,ease:'power3.out'},38.90625);window.__timelines['form-logo-film']=tl;"
(R/'index.html').write_text(f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Form — Make. Change. Create.</title><script src="assets/gsap.min.js"></script><style>{style}</style></head><body><div id="root" data-composition-id="form-logo-film" data-width="1920" data-height="1080" data-duration="41.25">{card('opening',0)}<video id="feature-film" class="clip film" src="assets/feature-film.mp4" data-start="3.75" data-duration="33.75" data-track-index="1" muted playsinline></video>{card('ending',37.5,True)}<audio id="score" src="assets/music.wav" data-start="0" data-duration="41.25" data-track-index="3"></audio></div><script>{js}</script></body></html>''')
(R/'edit/timeline.json').write_text(json.dumps({'duration':41.25,'fps':60,'bpm':128,'scenes':[{'id':'opening','start':0,'duration':3.75},{'id':'feature-film','start':3.75,'duration':33.75},{'id':'ending','start':37.5,'duration':3.75}]},indent=2))
print('Logo bookends authored: 41.25s total')
