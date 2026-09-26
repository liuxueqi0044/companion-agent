import {h,ref} from 'vue'
import {STARTERS} from './appearance.mjs'
import {button,emblem,cornerMenu} from './starter-common.mjs'
import {WhaleRoom,whaleCharacter,hasCharacter} from './starter-character.mjs'
export {emblem} from './starter-common.mjs'
export {whaleCharacter} from './starter-character.mjs'
const FormSpace={name:'FormSpace',props:['context'],setup(props){
  return ()=>{const c=props.context;return h('div',{class:['workspace','form-space',c.hasConversation?'form-reading':''],inert:c.inert?'':undefined},[
    cornerMenu(c,'form'),c.banner,
    h('main',{class:'form-canvas'},c.hasConversation?[
      h('div',{class:'form-reading-title'},[h('span',c.name),button('新的对话',c.newConversation,{class:'form-new',disabled:c.busy},c.icon('plus',18))]),
      c.conversation,h('div',{class:'form-write'},[c.composer]),
    ]:[h('div',{class:'form-entry'},[h('span',{class:'form-point','aria-hidden':'true'}),h('h1','此刻，想些什么？'),c.composer])]),
  ])}
}}
function journalDrawing(){return h('svg',{class:'journal-drawing',viewBox:'0 0 300 160',fill:'none','aria-hidden':'true'},[
  h('path',{d:'M31 116c33 7 80 12 128 7s84-4 114 3M95 120l-5-68 76 4-3 68M99 66l53 3m-51 11 39 2m-38 12 43 3m-40 10 26 2',stroke:'currentColor','stroke-width':1.1,'stroke-linecap':'round'}),
  h('path',{d:'M196 119c-8-20-10-40-7-59m0 18c-23-16-22-29-10-23s12 22 10 23Zm2 15c28-16 33-6 20 4-7 6-15 6-20 2m4 17c-16-10-33-3-17 6',stroke:'currentColor','stroke-width':1.1}),
  h('path',{d:'m48 72 4-10 4 10 10 4-10 4-4 10-4-10-10-4Zm184-31 2-6 2 6 6 2-6 2-2 6-2-6-6-2Z',stroke:'currentColor','stroke-width':.8}),
])}
const JournalSpace={name:'JournalSpace',props:['context'],setup(props){
  const page=ref(null)
  const date=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'}).format(new Date())
  function outcome(){const cards=page.value?.querySelectorAll('.activity-card');cards?.item(cards.length-1)?.scrollIntoView({behavior:'smooth',block:'center'})}
  return ()=>{const c=props.context;return h('div',{class:['workspace','journal-space',c.hasConversation?'journal-reading':''],inert:c.inert?'':undefined},[
    cornerMenu(c,'atelier'),c.banner,
    h('main',{class:'journal-desk'},[
      h('div',{class:'journal-underlay','aria-hidden':'true'}),
      h('div',{class:'journal-book'},[
        h('section',{class:'journal-left'},[
          h('header',{class:'page-running-head'},[h('span','NOTES BETWEEN US'),h('span',date)]),
          h('div',{ref:page,class:'journal-reading-page'},c.hasConversation?[c.conversation]:[
            h('span',{class:'journal-star'},emblem('atelier')),h('p',{class:'journal-salutation'},'亲爱的，你：'),
            h('h1',['今天的空白，',h('br'),'留给',h('em','你。')]),
            h('p',{class:'journal-letter'},['不用先理好思绪。',h('br'),'从一句话开始，我们慢慢往下写。']),journalDrawing(),
          ]),
          h('footer',{class:'page-number'},[button('我们的对话',()=>c.open('history'),{class:'journal-index'},[c.icon('history',14),'翻翻以前']),h('span','01')]),
        ]),
        h('div',{class:'journal-spine','aria-hidden':'true'}),
        h('section',{class:'journal-right'},[
          h('header',{class:'page-running-head'},[h('span','A THOUGHT, A BEGINNING'),button('新的对话',c.newConversation,{class:'journal-new',disabled:c.busy,title:'另起一页'},c.icon('plus',16))]),
          h('div',{class:'journal-writing-page'},[h('div',{class:'journal-write-title'},[h('span','写给'),h('strong',c.name)]),c.composer,
            c.lastArtifact?h('div',{class:'journal-keepsake'},[h('small','这一页，留下了'),h('strong',c.lastArtifact.title),button('翻到这次成果',outcome,{class:'journal-index'},['翻到成果',c.icon('arrow',15)])]):
            h('div',{class:'journal-postscript'},[h('span','P.S.'),h('p',['想聊天就聊天，',h('br'),'想做点什么，也可以交给我。'])]),
          ]),h('footer',{class:'page-number'},[h('span','未完待续'),h('span','02')]),
        ]),
      ]),
      h('nav',{class:'journal-tabs','aria-label':'手记索引'},[
        button('记忆',()=>c.open('memory'),{class:'book-tab tab-memory'},'记忆'),button('我的工具',()=>c.open('tools'),{class:'book-tab tab-tools'},'工具'),button('近况',()=>c.open('inbox'),{class:'book-tab tab-inbox'},'来信'),
      ]),
    ]),
  ])}
}}
export function renderStarter(context){return h(context.theme==='whale'?WhaleRoom:context.theme==='form'?FormSpace:JournalSpace,{context})}
export function appearanceGallery({theme,select,recover}){
  return h('div',{class:'appearance-gallery'},[
    h('p',{class:'gallery-intro'},'换一种相处方式。'),h('p',{class:'muted'},'一片安静的空白，或一本共同写下的手记。属于你的东西，都在。'),
    ...STARTERS.map(item=>button(`使用${item.name}`,()=>select(item.id),{class:['theme-choice',theme===item.id?'chosen':''],'aria-pressed':theme===item.id},[
      h('div',{class:['theme-preview',`preview-${item.id}`]},item.id==='whale'?[
        h('span',{class:'mini-room-horizon'}),h('span',{class:'preview-wordmark'},'blue hour'),h('span',{class:'mini-bubble'},'你来啦。'),whaleCharacter('idle'),h('span',{class:'mini-dock'}),
      ]:item.id==='form'?[
        h('span',{class:'preview-wordmark'},'form.'),h('span',{class:'mini-form-prompt'},'此刻，想些什么？'),h('span',{class:'mini-form-line'}),
      ]:[h('span',{class:'mini-book'},[h('i'),h('span',['今天的空白，',h('br'),'留给你。']),h('b','写给 我的 AI')])]),
      h('div',{class:'theme-choice-caption'},[h('div',[h('strong',item.name),h('span',item.note)]),h('span',{class:'theme-choice-radio'},theme===item.id?'✓':'')]),
    ])),
    h('div',{class:'source-entry'},[h('strong','界面可以继续生长。'),h('p','这些起点都是可替换的源码，也可以导入你自己的完整界面。'),button('管理界面源码与恢复',recover,{class:'text-button'})]),
    hasCharacter&&h('details',{class:'art-credit'},[h('summary','鲸鱼娘素材来源'),h('p','角色：ZipZipPipe。Q 版精灵图：vlln/whale-girl。用于本地设计预览；商业分发许可尚未确认。')]),
  ])
}
