"""Original 128 BPM electro-breakbeat. Synthesized drums; no samples or vocals."""
from pathlib import Path
import json
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parent
SR=48000; BPM=128; BEAT=60/BPM; DURATION=72*BEAT; N=round(DURATION*SR)
rng=np.random.default_rng(8021)
drums=np.zeros((N,2)); tonal=np.zeros_like(drums); fx=np.zeros_like(drums)

def add(bus,sig,at,gain=1,pan=0):
 i=round(at*SR); j=min(N,i+len(sig))
 if i<0 or i>=N:return
 p=np.array([np.cos((pan+1)*np.pi/4),np.sin((pan+1)*np.pi/4)])
 bus[i:j]+=sig[:j-i,None]*gain*p

def filt(x,lo=0,hi=24000):
 f=np.fft.rfftfreq(len(x),1/SR); mask=np.ones(len(f))
 if lo:mask*=1-np.exp(-(f/lo)**4)
 if hi<24000:mask*=np.exp(-(f/hi)**4)
 return np.fft.irfft(np.fft.rfft(x)*mask,n=len(x))

def drum(kind):
 dur={'kick':.43,'snare':.24,'clap':.22,'hat':.075,'open':.26,'rim':.07,'tom':.24,'crash':1.2}[kind]
 t=np.arange(round(SR*dur))/SR; noise=rng.normal(0,1,len(t))
 if kind=='kick':
  phase=2*np.pi*(46*t+95*.027*(1-np.exp(-t/.027)))
  x=np.sin(phase)*np.exp(-t*12)+.2*filt(noise,4500,15000)*np.exp(-t*270)
  return np.tanh(x*1.6)*np.minimum(t/.0008,1)
 if kind=='snare':
  body=(np.sin(2*np.pi*183*t)+.3*np.sin(2*np.pi*330*t))*np.exp(-t*28)
  return .58*filt(noise,900,11500)*np.exp(-t*21)+.5*body
 if kind=='clap':
  env=sum(np.where(t>=d,np.exp(-np.maximum(t-d,0)*120),0) for d in [0,.009,.021])
  env+=.4*np.exp(-t*22)
  return filt(noise,1200,10000)*env*.6
 if kind in ['hat','open','crash']:
  metal=sum(np.sign(np.sin(2*np.pi*f*t)) for f in [421,587,811,1139,1619,2203])/6
  x=filt(.6*noise+.4*metal,6500,17000)
  return x*np.exp(-t*({'hat':68,'open':14,'crash':4}[kind]))
 if kind=='rim':return (np.sin(2*np.pi*1650*t)+.65*np.sin(2*np.pi*2300*t))*np.exp(-t*110)
 return np.sin(2*np.pi*(100*t+2*(1-np.exp(-t*25))))*np.exp(-t*20)

samples={k:drum(k) for k in ['kick','snare','clap','hat','open','rim','tom','crash']}
kicks=[]
for bar in range(18):
 start=bar*4*BEAT
 # Two-bar stripped drum break before the comparison drop, then full groove.
 drop=bar in [0,2,5,8,12,16]
 kickgrid=[0,1.5,2,3.25] if bar%2 else [0,.75,2,2.75]
 if bar==7:kickgrid=[0,2]
 if bar==17:kickgrid=[0,1.5,2]
 for q in kickgrid:
  at=start+q*BEAT;kicks.append(at);add(drums,samples['kick'],at,.9)
 for q in [1,3]:
  add(drums,samples['snare'],start+q*BEAT,.58)
  add(drums,samples['clap'],start+q*BEAT+.008,.22,.1)
 # Shuffled sixteenths, varied velocity and stereo placement.
 for q in range(16):
  if bar==17 and q>8:continue
  at=start+q*BEAT/4+(BEAT*.028 if q%2 else 0)
  add(drums,samples['hat'],at,[.19,.07,.11,.08][q%4],.42 if q%2 else -.24)
 for q in [1.5,3.5]:
  if bar!=17:add(drums,samples['open'],start+q*BEAT,.17,.42)
 if bar%2:add(drums,samples['rim'],start+2.5*BEAT,.11,-.45)
 if bar in [1,4,7,11,15]:
  for k,q in enumerate([3,3.25,3.5,3.625,3.75,3.875]):
   add(drums,samples['tom'] if k<2 else samples['snare'],start+q*BEAT,.15+k*.035,(k-2)*.15)
 if drop:add(drums,samples['crash'],start,.2,-.35)

# Tight syncopated bass and bright, short plucks, leaving drums in front.
chords=[[45,52,55,59],[41,48,52,57],[48,55,59,62],[43,50,55,57]]
def note(midi,dur,kind):
 t=np.arange(round(dur*SR))/SR; f=440*2**((midi-69)/12)
 if kind=='bass':
  x=np.sin(2*np.pi*f*t)+.3*np.sin(2*np.pi*2*f*t)+.12*np.sin(2*np.pi*3*f*t)
  return np.tanh(1.4*x)*np.exp(-t*6)*np.minimum(t/.006,1)*np.minimum((dur-t)/.025,1)
 x=sum(np.sin(2*np.pi*f*k*t)*np.exp(-t*(2+k*2))/(k**1.25) for k in range(1,7))
 return x*np.minimum(t/.002,1)*np.minimum((dur-t)/.04,1)
for bar in range(18):
 chord=chords[(bar//2)%4]; start=bar*4*BEAT
 if bar==17:chord=chords[0]
 if bar not in [0,7]:
  for q in [.5,1.25,1.75,2.5,3.5]:add(tonal,note(chord[0]-12,.34,'bass'),start+q*BEAT,.36)
 # Layer melody in after one bar. Small motif repeated with chord changes.
 if bar>=1 and bar!=7:
  for k,q in enumerate([0,.75,1.5,2.25,3,3.5]):
   m=chord[[1,3,2,1,2,3][k]]+12
   pluck=note(m,.65,'pluck');gain=.14 if bar<8 else .19
   add(tonal,pluck,start+q*BEAT,gain,(-1)**k*.35)
   add(tonal,pluck,start+(q+.75)*BEAT,gain*.26,(-1)**(k+1)*.55)
 if bar in [2,5,8,12,16,17]:
  for j,m in enumerate(chord[1:]):add(tonal,note(m+12,1.5,'pluck'),start,.12,(j-1)*.5)
# Noise lifts into major cuts; low cinematic down-hit without a huge boom.
for boundary in [2,5,8,12,16]:
 end=boundary*4*BEAT;length=.75*BEAT
 t=np.arange(round(length*SR))/SR
 whoosh=filt(rng.normal(0,1,len(t)),1000,13000)*(t/length)**2*.13
 add(fx,whoosh,end-length,1,0)
# Gentle sidechain duck of synths on every kick makes the groove breathe.
duck=np.ones(N)
for at in kicks:
 i=round(at*SR);ln=min(round(.3*SR),N-i);t=np.arange(ln)/SR
 duck[i:i+ln]*=1-.48*np.exp(-t*17)
tonal*=duck[:,None]
mix=drums+tonal+fx
# Tail resolves, not chopped; final bar simplifies with a closing chord.
fade=np.minimum(np.arange(N)/SR/.006,1)*np.minimum((N-np.arange(N))/SR/.55,1)
mix=np.tanh(mix*.9)/.9;mix*=fade[:,None]
mix*=.86/max(abs(mix).max(),.01)
sf.write(ROOT/'music-raw.wav',mix,SR,subtype='PCM_24')
sf.write(ROOT/'drums.wav',drums*.65,SR,subtype='PCM_24')
(ROOT/'beat-map.json').write_text(json.dumps({'bpm':BPM,'duration':DURATION,'beat':BEAT,'beats':[round(i*BEAT,6) for i in range(72)],'section_starts':[0,3.75,9.375,15,22.5,30],'kick_onsets':kicks},indent=2))
print(f'Original {BPM} BPM breakbeat: {DURATION}s, 18 bars, no samples or voice')
