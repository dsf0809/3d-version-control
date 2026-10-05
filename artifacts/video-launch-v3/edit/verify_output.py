from pathlib import Path
import json, subprocess
from PIL import Image, ImageDraw
r=Path(__file__).resolve().parents[1];v=r/'renders/form-launch-v3.mp4';out=r/'edit/verify'
p=json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(v)]));(out/'probe.json').write_text(json.dumps(p,indent=2))
times=[.5,1.5,3.7,3.9,20,37.4,37.7,40.7]
sheet=Image.new('RGB',(1920,596),'#edf1f8');draw=ImageDraw.Draw(sheet)
for i,t in enumerate(times):
 f=out/f'frame-{t:04.1f}.png';subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-y','-ss',str(t),'-i',str(v),'-frames:v','1',str(f)],check=True)
 x=i%4*480;y=i//4*298;sheet.paste(Image.open(f).resize((480,270)),(x,y));draw.text((x+10,y+278),f'{t:.1f} sec',fill='#172234')
sheet.save(out/'contact-sheet.jpg',quality=94)
print(p['format']['duration'],[{k:s.get(k) for k in ['codec_name','width','height','r_frame_rate','nb_frames','channels']} for s in p['streams']])
