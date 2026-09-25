'use strict'
const DEFAULT_WINDOW=Object.freeze({width:1120,height:820,frame:true,transparent:false,alwaysOnTop:false,opacity:1})
function windowPatch(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['width','height','frame','transparent','alwaysOnTop','opacity'].includes(k)))throw Error('invalid_window_settings')
  for(const [k,v] of Object.entries(value)){
    if(['width','height'].includes(k)&&(!Number.isInteger(v)||v<240||v>2560))throw Error('invalid_window_settings')
    if(['frame','transparent','alwaysOnTop'].includes(k)&&typeof v!=='boolean')throw Error('invalid_window_settings')
    if(k==='opacity'&&(typeof v!=='number'||!Number.isFinite(v)||v<0.35||v>1))throw Error('invalid_window_settings')
  }
  return {...value}
}
function localOrigin(value){try{const u=new URL(value);return u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port&&u.origin===value}catch{return false}}
function navigationAllowed(value,origin,{main=true}={}){
  try{const u=new URL(value);return u.origin===origin&&!u.search&&!u.hash&&(main?['/','/recover'].includes(u.pathname):/^\/interface-frame\/[a-f0-9]{48}$/.test(u.pathname))}catch{return false}
}
function requestAllowed(value,origin){
  try{const u=new URL(value);return (u.origin===origin&&u.protocol==='http:')||['data:','blob:'].includes(u.protocol)}catch{return false}
}
module.exports={DEFAULT_WINDOW,windowPatch,localOrigin,navigationAllowed,requestAllowed}
