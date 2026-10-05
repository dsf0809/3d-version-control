from pathlib import Path
r=Path(__file__).resolve().parent
paths='''<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>'''
def cube(x,y,w,stroke,opacity=1):return f'<svg x="{x}" y="{y}" width="{w}" height="{w}" viewBox="0 0 24 24" fill="none" stroke="{stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="{opacity}">{paths}</svg>'
s=f'''<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1440" viewBox="0 0 2560 1440" role="img" aria-label="Form YouTube channel banner: Make. Change. Create.">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbfcff"/><stop offset=".54" stop-color="#f0f4ff"/><stop offset="1" stop-color="#dce5ff"/></linearGradient><radialGradient id="focus"><stop stop-color="#ffffff" stop-opacity=".94"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient><pattern id="grid" width="84" height="84" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M84 0H0V84" fill="none" stroke="#315ce8" stroke-width="1" opacity=".09"/></pattern></defs>
<rect width="2560" height="1440" fill="url(#bg)"/><rect width="2560" height="1440" fill="url(#grid)"/><ellipse cx="1280" cy="720" rx="1060" ry="630" fill="url(#focus)"/>
{cube(140,105,300,'#315ce8',.09)}{cube(2110,940,330,'#315ce8',.1)}
<g id="brand-content" transform="translate(104 17)">{cube(765,575,270,'#202830')}
<text x="1100" y="707" font-family="Arial,sans-serif" font-size="156" font-weight="700" letter-spacing="-8" fill="#202830">form<tspan fill="#315ce8">.</tspan></text>
<text x="1107" y="784" font-family="Arial,sans-serif" font-size="42" letter-spacing="1" fill="#315ce8">Make. Change. Create.</text>
<text x="1107" y="834" font-family="Arial,sans-serif" font-size="27" letter-spacing="1.2" fill="#57647a">3D design · Version history</text></g></svg>'''
(r/'form-youtube-banner.svg').write_text(s)
(r/'banner.html').write_text('<!doctype html><html><body style="margin:0">'+s+'</body></html>')
