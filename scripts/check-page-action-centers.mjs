import assert from 'node:assert/strict';

export async function checkPageActionCenters(page) {
 const actions=await page.$$eval('.app-page-toolbar > :is(a,button)',buttons=>buttons.map(button=>{
  const rect=button.getBoundingClientRect(),svg=button.querySelector('svg'),path=svg?.querySelector('path');
  if(!path)return {label:button.getAttribute('aria-label'),missing:true};
  const bounds=path.getBBox(),matrix=path.getScreenCTM();
  const center=new DOMPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2).matrixTransform(matrix);
  return {label:button.getAttribute('aria-label'),dx:center.x-(rect.x+rect.width/2),dy:center.y-(rect.y+rect.height/2),width:rect.width,height:rect.height};
 }));
 assert(actions.length>0,'header action exists');
 for(const action of actions){
  assert(!action.missing,action.label+' vector icon exists');
  assert.equal(action.width,44,action.label+' touch width preserved');
  assert.equal(action.height,44,action.label+' touch height preserved');
  assert(Math.abs(action.dx)<.1&&Math.abs(action.dy)<.1,action.label+' visible path centered '+JSON.stringify(action));
 }
}
