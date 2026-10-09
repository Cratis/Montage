#!/usr/bin/env node
// Browser-level regression: real SVG geometry, transitions, reverse seeks and frame timing.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../dist/preview');
const node = {id:'one',label:'Screenplay',x:550,y:300,width:500,height:220,at:0,duration:1,effect:'pen'};
const spec = {width:640,height:360,fps:60,duration:4,brand:{name:'',product:''},scenes:[
  {id:'old',type:'diagram',start:0,end:1.8,params:{nodes:[],design:{bg:'#112244'}}},
  {id:'new',type:'diagram',start:2,end:4,transitionIn:'wipe',transitionDuration:0.6,params:{nodes:[node],design:{bg:'#772211'},effect:'pen'}},
]};
const server=createServer((req,res)=>{
  const url=(req.url??'/').split('?')[0]!;
  if(url==='/pkg/show.json'){res.setHeader('content-type','application/json');res.end(JSON.stringify(spec));return;}
  const path=resolve(root,url==='/'?'index.html':url.slice(1));
  if(!path.startsWith(root)||!existsSync(path)){res.writeHead(404).end();return;}
  const types:Record<string,string>={'.js':'text/javascript','.html':'text/html','.woff2':'font/woff2','.css':'text/css'};
  res.setHeader('content-type',types[extname(path)]??'application/octet-stream');res.end(readFileSync(path));
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const port=(server.address() as {port:number}).port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/?pkg=/pkg&export=1`);
  await page.waitForFunction(()=>(window as any).__motion?.ready);
  const errors=await page.evaluate(()=>(window as any).__motion.errors());assert.deepEqual(errors,[]);
  const sample=async(t:number)=>page.evaluate(t=>{
    const m=(window as any).__motion;m.engine.renderAt(t);
    const c=document.getElementById('c') as HTMLCanvasElement;
    const ctx=c.getContext('2d')!;
    return Array.from(ctx.getImageData(620,100,1,1).data);
  },t);
  assert.equal(await page.evaluate(()=>(window as any).__motion.engine.renderAt(1.9)),'old','gaps must hold the preceding scene, never flash the final scene');
  const old=await sample(1.9), during=await sample(2.1), after=await sample(2.7);
  assert.ok(during.slice(0,3).every((v,i)=>Math.abs(v-old[i]!)<=12),'wipe must retain outgoing pixels on the unrevealed side (allowing film grain)');
  assert.notDeepEqual(after,old,'completed wipe must show incoming scene');
  const hash=async(t:number)=>page.evaluate(t=>{
    const m=(window as any).__motion;m.engine.renderAt(t);
    const bytes=m.engine.pixels();let hash=2166136261;
    for(const byte of bytes){hash^=byte;hash=Math.imul(hash,16777619);}
    return hash>>>0;
  },t);
  const mid=await hash(2.35);await hash(3.8);assert.equal(await hash(2.35),mid,'reverse seek must match the same frame');
  const sequence=[];for(let frame=132;frame<180;frame++)sequence.push(await hash(frame/60));
  assert.ok(new Set(sequence).size>40,'frames must advance, not freeze');
  const bright=async(t:number)=>page.evaluate(t=>{
    const m=(window as any).__motion;m.engine.renderAt(t);
    const c=document.getElementById('c') as HTMLCanvasElement;
    const data=c.getContext('2d')!.getImageData(180,80,280,140).data;
    let count=0;for(let i=0;i<data.length;i+=4)if(data[i]!>160&&data[i+1]!>160&&data[i+2]!>160)count++;
    return count;
  },t);
  assert.ok(await bright(2.95)>await bright(2.6),'SVG outline and label must actually progress, not just grain');
  assert.equal(await hash(2.35),mid,'sequential playback must match direct seeking');
  console.log('PASS: transition pixels, SVG pen build, 60 fps progression, reverse-seek determinism');
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
