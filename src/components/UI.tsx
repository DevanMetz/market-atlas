import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { asset, BENCHMARKS, CATALOG, PERIODS } from '../lib/catalog'
import { pct } from '../lib/analytics'
import type { Asset, Period } from '../lib/types'

export function Change({value,suffix}:{value:number|null|undefined;suffix?:string}){return <span className={value==null?'muted':value>=0?'positive':'negative'}>{suffix&&value!=null?`${value>0?'+':''}${value.toFixed(2)} ${suffix}`:pct(value)}</span>}
export function Panel({title,eyebrow,action,children,className=''}:{title?:string;eyebrow?:string;action?:ReactNode;children:ReactNode;className?:string}){return <section className={`panel ${className}`}>{(title||action)&&<div className="panel-head"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>}{children}</section>}
export function PeriodPicker({value,onChange}:{value:Period;onChange:(value:Period)=>void}){return <div className="period-picker" role="group" aria-label="Time period">{PERIODS.map(p=><button key={p} aria-pressed={p===value} className={p===value?'active':''} onClick={()=>onChange(p)}>{p}</button>)}</div>}
export function BenchmarkPicker({value,onChange}:{value:string;onChange:(value:string)=>void}){return <label className="select-label">Benchmark <span className="select-wrap"><select aria-label="Benchmark" value={value} onChange={e=>onChange(e.target.value)}>{BENCHMARKS.map(b=><option value={b.symbol} key={b.symbol}>{b.name} · {b.symbol}</option>)}</select><ChevronDown size={14}/></span></label>}
export function Stat({label,value,detail,children}:{label:string;value:ReactNode;detail?:ReactNode;children?:ReactNode}){return <div className="stat"><span className="stat-label">{label}</span><strong>{value}</strong>{detail&&<span className="stat-detail">{detail}</span>}{children}</div>}
export function Empty({title,children,action}:{title:string;children?:ReactNode;action?:ReactNode}){return <div className="empty"><div className="empty-mark"><Search size={26}/></div><h3>{title}</h3><p>{children}</p>{action}</div>}

export function SymbolSearch({onSelect,placeholder='Search stocks, ETFs, or a ticker…',compact=false}:{onSelect:(symbol:string)=>void;placeholder?:string;compact?:boolean}){
  const resultId=useId()
  const [query,setQuery]=useState(''),[focused,setFocused]=useState(false),[remote,setRemote]=useState<Asset[]>([]),[busy,setBusy]=useState(false)
  const wrap=useRef<HTMLDivElement>(null)
  useEffect(()=>{const handler=(e:PointerEvent)=>{if(!wrap.current?.contains(e.target as Node))setFocused(false)};document.addEventListener('pointerdown',handler);return()=>document.removeEventListener('pointerdown',handler)},[])
  useEffect(()=>{
    setRemote([])
    if(query.trim().length<2){setBusy(false);return}
    const controller=new AbortController()
    const timer=setTimeout(async()=>{setBusy(true);try{const response=await fetch(`/api/search?q=${encodeURIComponent(query)}`,{signal:controller.signal});const body=await response.json() as {matches?:Asset[]};if(!controller.signal.aborted)setRemote(body.matches??[])}catch{/* Local catalog and exact ticker entry remain available. */}finally{if(!controller.signal.aborted)setBusy(false)}},350)
    return()=>{clearTimeout(timer);controller.abort()}
  },[query])
  const local=CATALOG.filter(a=>`${a.symbol} ${a.name} ${a.sector??''}`.toLowerCase().includes(query.toLowerCase()))
  const options=[...new Map([...local,...remote].map(a=>[a.symbol,a])).values()].slice(0,7)
  const select=(symbol:string)=>{onSelect(symbol);setQuery('');setFocused(false)}
  return <div ref={wrap} className={`symbol-search ${compact?'compact':''}`}><Search size={17}/><input aria-label={placeholder} aria-expanded={focused&&query.length>0} aria-controls={resultId} placeholder={placeholder} value={query} onFocus={()=>setFocused(true)} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setFocused(false);if(e.key==='Enter'&&query.trim()){e.preventDefault();const exact=query.trim().toUpperCase();if(options.some(a=>a.symbol===exact))select(exact);else if(options.length)select(options[0].symbol);else if(/^[A-Z0-9^][A-Z0-9.^=\-]{0,19}$/i.test(exact))select(exact)}}}/>{query&&<button className="icon-button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={14}/></button>}
    {focused&&query.length>0&&<div id={resultId} className="search-results">{options.map(a=><button key={a.symbol} onClick={()=>select(a.symbol)}><span className="symbol-badge">{a.symbol}</span><span className="search-name">{a.name}<small>{a.sector??a.kind}</small></span><Plus size={15}/></button>)}{busy&&<div className="search-note">Searching exchanges…</div>}{/^[A-Z0-9^][A-Z0-9.^=\-]{0,19}$/i.test(query.trim())&&!options.some(a=>a.symbol===query.trim().toUpperCase())&&<button onClick={()=>select(query.trim().toUpperCase())}><Plus size={17}/><span>Look up <strong>{query.trim().toUpperCase()}</strong></span></button>}{!options.length&&!busy&&<div className="search-note">Enter an exchange ticker, then press Enter.</div>}</div>}
  </div>
}

export function SymbolChips({symbols,onRemove,onAdd,benchmark}:{symbols:string[];onRemove:(s:string)=>void;onAdd?:(s:string)=>void;benchmark?:string}){return <div className="symbol-chips">{symbols.map((s,i)=><span className="symbol-chip" key={s}><i style={{background:asset(s).color??['#b8e986','#8ab4ed','#d89390','#bfabeb','#f0b26f','#76c7c2'][i%6]}}/>{s}<span className="chip-name">{asset(s).name}</span>{s===benchmark?<span className="benchmark-tag">BM</span>:<button aria-label={`Remove ${s}`} onClick={()=>onRemove(s)}><X size={13}/></button>}</span>)}{onAdd&&<details className="add-asset"><summary><Plus size={14}/> Add asset</summary><div className="add-menu">{CATALOG.filter(a=>!symbols.includes(a.symbol)).slice(0,28).map(a=><button key={a.symbol} onClick={e=>{onAdd(a.symbol);e.currentTarget.closest('details')?.removeAttribute('open')}}><span>{a.symbol}</span>{a.name}</button>)}</div></details>}</div>}
export function Toggle({checked,onChange,children}:{checked:boolean;onChange:()=>void;children:ReactNode}){return <button className={`check-button ${checked?'checked':''}`} onClick={onChange} aria-pressed={checked}><span>{checked&&<Check size={11}/>}</span>{children}</button>}
