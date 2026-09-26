import {h} from 'vue'
export const button=(label,action,props={},children=label)=>h('button',{type:'button','aria-label':label,onClick:action,...props},children)
const svg=(nodes,props={})=>h('svg',{viewBox:'0 0 100 100',fill:'none','aria-hidden':'true',...props},nodes)
export function emblem(theme){
  if(theme==='whale')return svg([h('path',{d:'M17 48C17 28 37 22 51 31c11-14 28-6 27 9l14-7-2 20-13-5c-3 24-33 30-49 17C20 59 17 53 17 48Z',fill:'currentColor'}),h('circle',{cx:34,cy:43,r:3,fill:'white'})])
  if(theme==='form')return svg([h('circle',{cx:50,cy:50,r:25,stroke:'currentColor','stroke-width':2})])
  return svg(Array.from({length:12},(_,i)=>h('path',{d:'M50 15v21',stroke:'currentColor','stroke-width':5,transform:`rotate(${i*30} 50 50)`})))
}
export function cornerMenu(c,theme){return h('header',{class:`experience-header ${theme}-header`},[
  button('切换界面',()=>c.open('appearance'),{class:'edition-switch',title:'切换空间'},theme==='whale'?[h('span',{class:'edition-icon'},emblem('whale')),h('span','blue hour'),h('small','by morrow')]:theme==='atelier'?[h('span','atelier'),h('i','a personal journal')]:h('span','form.')),
  button('打开空间菜单',()=>c.open('about'),{class:'space-menu',title:'空间菜单'},[c.icon('more',22),c.unread?h('i',{class:'menu-unread'}):null]),
])}
