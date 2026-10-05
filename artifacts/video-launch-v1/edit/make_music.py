from pathlib import Path
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parent
sr=48000; duration=36; n=int(duration*sr)
rng=np.random.default_rng(19); music=np.zeros((n,2)); beat=60/120

def add(signal,start,level=1,pan=0):
 i=int(start*sr); j=min(n,i+len(signal))
 if i<0 or i>=n: return
 gain=np.array([np.cos((pan+1)*np.pi/4),np.sin((pan+1)*np.pi/4)])
 music[i:j]+=signal[:j-i,None]*gain*level

def note(midi,length=1.4,kind='keys'):
 t=np.arange(int(length*sr))/sr; f=440*2**((midi-69)/12)
 if kind=='pad': return (np.sin(2*np.pi*f*t)+.18*np.sin(2*np.pi*f*2*t))*(1-np.exp(-t*3))*np.minimum(1,(length-t)/.8)*.55
 return (np.sin(2*np.pi*f*t)+.3*np.sin(2*np.pi*2*f*t)*np.exp(-t*4)+.12*np.sin(2*np.pi*3*f*t)*np.exp(-t*8))*(1-np.exp(-t*80))*np.exp(-t*2.8)
# An original mellow Dmaj7 – Bm7 – Gmaj7 – Aadd9 loop, with sparse keys.
chords=[[50,57,61,66],[47,54,57,62],[43,50,54,59],[45,52,59,61]]
for bar,start in enumerate(np.arange(0,duration,beat*4)):
 chord=chords[0] if start >= duration-2 else chords[bar%4]
 for k,m in enumerate(chord[1:]): add(note(m+12,beat*4+.6,'pad'),start,.065,(k-1)*.65)
 add(note(chord[0]-12,beat*3),start,.22,0)
 for k in range(4):
  add(note(chord[1+k%3]+12,1.6),start+beat*(k+.03),.16,(-1)**k*.4)
  add(note(chord[1+k%3]+12,1.4),start+beat*(k+.03)+beat*.75,.035,(-1)**(k+1)*.6)
for i,start in enumerate(np.arange(0,duration,beat/2)):
 t=np.arange(int(.055*sr))/sr
 hat=rng.normal(0,1,len(t)); hat[1:]-=.8*hat[:-1]; hat*=np.exp(-t*85)
 add(hat,start,.013 if i%2 else .02,.45)
 if i%4==0:
  t=np.arange(int(.24*sr))/sr; kick=np.sin(2*np.pi*(44*t+4*(1-np.exp(-t*20))))*np.exp(-t*20)
  add(kick,start,.18)
 if i%8 in [2,6]:
  t=np.arange(int(.13*sr))/sr; snare=rng.normal(0,1,len(t))*np.exp(-t*36)
  add(snare,start,.035,-.25)
fade=np.minimum(np.arange(n)/sr/.7,1)*np.minimum((n-np.arange(n))/sr/1.0,1)
music*=fade[:,None]
sf.write(ROOT/'music.wav',music,sr)

# Instrumental-only score. The final master has no speech or sampled vocals.
print('Original 120 BPM instrumental:', duration, 'seconds')
