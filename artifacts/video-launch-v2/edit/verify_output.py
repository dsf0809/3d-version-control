from pathlib import Path
import subprocess, json
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
v=ROOT/'renders/form-launch-v2.mp4'
out=ROOT/'edit/verify'
out.mkdir(exist_ok=True)
meta=json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(v)]))
(out/'probe.json').write_text(json.dumps(meta,indent=2))
times=[0,.4,2,3.7,3.9,5,7.8,9.3,9.5,10.8,12,14.8,15.15,17,20.5,22.4,22.7,23.5,25.3,28,29.9,30.2,32,33.7]
for t in times:
    subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-y','-ss',str(t),'-i',str(v),'-frames:v','1',str(out/f'frame-{t:05.2f}.png')],check=True)
w,h=480,270
sheet=Image.new('RGB',(w*4,(h+28)*6),'#e7e9ed'); d=ImageDraw.Draw(sheet)
for i,t in enumerate(times):
    x=(i%4)*w;y=(i//4)*(h+28)
    im=Image.open(out/f'frame-{t:05.2f}.png').resize((w,h))
    sheet.paste(im,(x,y));d.text((x+10,y+h+6),f'{t:.2f} seconds',fill='#111111')
sheet.save(out/'contact-sheet.jpg',quality=93)
print(json.dumps({'duration':meta['format']['duration'],'streams':[{k:s.get(k) for k in ['codec_type','codec_name','width','height','r_frame_rate','nb_frames','sample_rate','channels']} for s in meta['streams']]}))
