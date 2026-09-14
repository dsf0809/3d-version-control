'use client';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
export default function AIConnection({open,onOpenChange,status,refresh}:{open:boolean;onOpenChange:(open:boolean)=>void;status:{configured:boolean;model:string}|null;statusError:boolean;refresh:()=>Promise<unknown>}){
 const [key,setKey]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{if(!open){setKey('');setError('');setSaved(false);}},[open]);
 const apply=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setError('');setSaved(false);try{
  const response=await fetch('/api/ai-connection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
  const data=await response.json() as {error?:string};
  if(!response.ok)throw new Error(data.error||'Could not save your key.');
  setKey('');setSaved(true);await refresh();
 }catch(e){setError(e instanceof Error?e.message:'Could not save your key.');}finally{setSaving(false);}};
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="ai-connection-dialog sm:max-w-md p-6"><DialogTitle>AI connection</DialogTitle><DialogDescription>Add your OpenAI API key. It is stored encrypted for your account.</DialogDescription>
 <form onSubmit={apply} className="grid gap-3"><label htmlFor="openai-key" className="text-sm font-medium">API key</label><input id="openai-key" type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" value={key} onChange={e=>{setKey(e.target.value);setSaved(false);}} placeholder={status?.configured?'Paste a key to replace your connection':'sk-…'} disabled={saving} className="w-full min-w-0 rounded-lg border p-3"/>
 {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
 {saved&&<p role="status" className="text-sm">Key saved. Your next AI request will use it.</p>}
 <button className="quiet primary" type="submit" disabled={saving||!key.trim()}>{saving?'Applying…':'Apply'}</button>
 <p className="text-xs text-slate-500">AI requests use your API billing. Applying saves the key without making a paid test call.</p>
 </form></DialogContent></Dialog>;
}
