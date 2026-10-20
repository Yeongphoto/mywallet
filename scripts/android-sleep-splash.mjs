import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {createServer} from 'node:http';

// Decode frame zero of the supplied GIF. Preserve its pixels and transparency;
// only trim empty margins and resize for Android's splash density buckets.
const source=readFileSync('public/images/met-sleep.gif');
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,timeout:5000});
const server=createServer((_,response)=>response.end('<!doctype html><title>Local artwork conversion</title>'));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 for(const [density,scale] of [['mdpi',1],['hdpi',1.5],['xhdpi',2],['xxhdpi',3],['xxxhdpi',4]]){
  const result=await page.evaluate(async({bytes,scale})=>{
   const decoder=new ImageDecoder({data:new Uint8Array(bytes),type:'image/gif'});
   const {image}=await decoder.decode({frameIndex:0});
   const canvas=document.createElement('canvas');canvas.width=canvas.height=288*scale;
   const context=canvas.getContext('2d');context.imageSmoothingQuality='high';
   const artworkSize=184*.3*scale;
   const offset=(canvas.width-artworkSize)/2;
   context.drawImage(image,96,220,320,320,offset,offset,artworkSize,artworkSize);
   image.close();decoder.close();
   const data=context.getImageData(0,0,canvas.width,canvas.height).data;
   let outside=0;
   for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    if(data[(y*canvas.width+x)*4+3]>8&&Math.hypot(x+.5-canvas.width/2,y+.5-canvas.height/2)>96*scale)outside++;
   }
   return {png:canvas.toDataURL('image/png').split(',')[1],outside};
  },{bytes:[...source],scale});
  assert.equal(result.outside,0,`${density}: artwork must fit inside the Android safe circle`);
  const folder=resolve('android/app/src/main/res',`drawable-${density}`);mkdirSync(folder,{recursive:true});
  writeFileSync(resolve(folder,'met_sleep_splash_v1.png'),Buffer.from(result.png,'base64'));
 }
 console.log('Sleep splash: original GIF frame zero, transparent background, five densities, no pixels outside safe circle.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
