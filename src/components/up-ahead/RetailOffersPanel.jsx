import React, { useEffect, useMemo, useState } from 'react';
import policy from '../../config/retailOfferSources.json';
import { useRetailOffers } from '../../hooks/useRetailOffers.js';
import { formatRetailPrice, retailOfferPlannerItem, selectRetailOffers } from '../../services/retailOffers.js';
import './RetailOffersPanel.css';

export function RetailOfferCards({items=[],onAddToPlan}){
  const [saved,setSaved]=useState(new Set());
  const [saveError,setSaveError]=useState(null);
  return <>
    {saveError&&<p role="alert">{saveError}</p>}
    <div className="ua-retail-grid">{items.map(row=><article className="modern-card ua-retail-card" key={row.id}>
      <div className="ua-retail-meta"><strong>{row.retailer}</strong><span>{row.market==='oman'?'Oman':'India'} · {row.channel==='offline'?'In store':'Online'}</span></div>
      {row.imageUrl&&<img className="ua-retail-image" src={row.imageUrl} alt={row.title} loading="lazy" referrerPolicy="no-referrer"
        onError={event=>{event.currentTarget.style.display='none';}} onLoad={event=>{event.currentTarget.style.display='';}}/>}
      <h3>{row.title}</h3>
      <div className="ua-retail-prices"><strong>{formatRetailPrice(row.price,row.currency)}</strong>
        {row.previousPrice&&<del>{formatRetailPrice(row.previousPrice,row.currency)}</del>}
        {row.discountPercent&&<span>{row.discountPercent}% off</span>}
      </div>
      <p className="ua-retail-validity">{row.validUntil?`Offer ends ${new Date(row.validUntil).toLocaleString()}`:'End date not advertised'}</p>
      <small>Price checked {new Date(row.checkedAt).toLocaleString()}</small>
      <div className="ua-retail-actions"><a href={row.url} target="_blank" rel="noopener noreferrer">View offer ↗</a>
        {onAddToPlan&&<button className="ua-cal-btn" disabled={saved.has(row.id)} onClick={async()=>{
          if(row.expiresAt<=Date.now()){setSaveError('This price has expired. Refresh offers before saving.');return;}
          try{
            const result=await onAddToPlan(retailOfferPlannerItem(row));
            if(result?.ok!==true)throw Error('Save failed');
            setSaveError(null);setSaved(previous=>new Set([...previous,row.id]));
          }catch{setSaveError('The offer could not be saved. Please try again.');}
        }}>{saved.has(row.id)?'✓ Saved':'+ Plan today'}</button>}
      </div>
    </article>)}</div>
  </>;
}

export function RetailFlyerCards({items=[],onAddToPlan}){
  const [saved,setSaved]=useState(new Set());
  const [saveError,setSaveError]=useState(null);
  const [pageById,setPageById]=useState({});
  return <>
    {saveError&&<p role="alert">{saveError}</p>}
    <div className="ua-retail-grid">{items.map(row=>{
      const page=pageById[row.id]||0;
      return <article className="modern-card ua-retail-card ua-retail-flyer" key={row.id}>
        <div className="ua-retail-meta"><strong>{row.retailer}</strong><span>{row.city} · In store</span></div>
        <h3>{row.title}</h3>
        <img className="ua-flyer-image" src={row.pages[Math.min(page,row.pages.length-1)]} alt={`${row.retailer} flyer, page ${page+1}`} loading="lazy" referrerPolicy="no-referrer"/>
        {row.pages.length>1&&<div className="ua-flyer-paging" role="group" aria-label={`${row.retailer} flyer pages`}>
          <button type="button" disabled={page===0} onClick={()=>setPageById(previous=>({...previous,[row.id]:page-1}))}>Previous page</button>
          <span>{page+1} / {row.pages.length}</span>
          <button type="button" disabled={page>=row.pages.length-1} onClick={()=>setPageById(previous=>({...previous,[row.id]:page+1}))}>Next page</button>
        </div>}
        {row.description&&<p className="ua-flyer-description">{row.description}</p>}
        <p className="ua-retail-validity">Valid through <time dateTime={row.endDateKey}>{row.endDateKey}</time> (Muscat)</p>
        <p className="ua-retail-note">Listed stores: {row.storeScope}. Check the flyer for branch and stock terms.</p>
        <small>Flyer via ClicOffer · Published <time dateTime={row.publishedDateKey}>{row.publishedDateKey}</time><br/>Checked {new Date(row.checkedAt).toLocaleString()}</small>
        <div className="ua-retail-actions"><a href={row.url} target="_blank" rel="noopener noreferrer">View full flyer ↗</a>
          {onAddToPlan&&<button type="button" className="ua-cal-btn" disabled={saved.has(row.id)} onClick={async()=>{
            if(row.expiresAt<=Date.now()){setSaveError('This flyer update has expired. Refresh offers before saving.');return;}
            try{const result=await onAddToPlan(retailOfferPlannerItem(row));if(result?.ok!==true)throw Error('Save failed');
              setSaveError(null);setSaved(previous=>new Set([...previous,row.id]));}
            catch{setSaveError('The offer could not be saved. Please try again.');}
          }}>{saved.has(row.id)?'✓ Saved':'+ Plan today'}</button>}
        </div>
      </article>;
    })}</div>
  </>;
}

export default function RetailOffersPanel(props){
  if(props.enabled===false)return <p className="ua-retail-empty">Shopping offers are disabled in Up Ahead settings.</p>;
  return props.state?<ActiveRetailOffersPanel {...props}/>:<LoadedRetailOffersPanel {...props}/>;
}

function LoadedRetailOffersPanel(props){
  const state=useRetailOffers(props.refreshKey||0);
  return <ActiveRetailOffersPanel {...props} state={state}/>;
}

function ActiveRetailOffersPanel({locations=['Chennai','Muscat'],channel='online',state,onAddToPlan}){
  const {snapshot,loading,error,fromCache,refresh}=state;
  const [retailerId,setRetailerId]=useState('all');
  const [limit,setLimit]=useState(40);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
  const sources=policy.sources.filter(source=>source.cities.some(city=>locations.some(value=>String(value).toLowerCase()===city.toLowerCase())));
  const rows=useMemo(()=>{
    if(!snapshot)return [];
    try{return selectRetailOffers(snapshot,{locations,channel,now});}catch{return [];}
  },[snapshot,locations,channel,now]);
  const channelSources=sources.filter(source=>source.channels.includes(channel)||rows.some(row=>row.retailerId===source.id));
  const activeRetailer=channelSources.some(source=>source.id===retailerId)?retailerId:'all';
  const items=activeRetailer==='all'?rows:rows.filter(row=>row.retailerId===activeRetailer);
  const visible=items.slice(0,limit);
  const flyers=visible.filter(row=>row.kind==='flyer');
  const priced=visible.filter(row=>row.kind!=='flyer');
  return <section className="ua-retail-panel" aria-label="Retailer offers">
    <div className="ua-retail-heading"><h3>{channel==='offline'?'Current in-store offers':'Current online offers'}</h3>
      <button type="button" onClick={refresh} disabled={loading}>{loading?'Checking…':'Refresh offers'}</button></div>
    <p className="ua-retail-note">{channel==='online'?'Displayed prices come from retailer pages. Confirm Chennai/Muscat delivery availability and checkout price for your address.':'Dated in-store flyers are shown below. ClicOffer listings report store coverage; check branch terms in the flyer.'}</p>
    {channel==='offline'&&locations.some(city=>String(city).toLowerCase()==='chennai')&&<p className="ua-retail-note">Chennai: a current dated in-store feed is not available yet.</p>}
    <div className="ua-retail-tabs" role="group" aria-label="Filter offers by retailer">
      <button type="button" aria-pressed={activeRetailer==='all'} onClick={()=>{setRetailerId('all');setLimit(40);}}>All ({rows.length})</button>
      {channelSources.map(source=><button type="button" key={source.id}
        aria-pressed={activeRetailer===source.id} onClick={()=>{setRetailerId(source.id);setLimit(40);}}>{source.name} ({rows.filter(row=>row.retailerId===source.id).length})</button>)}
    </div>
    {error&&<p className="ua-retail-note" role="status">{rows.length?`The latest update is unavailable. Showing unexpired cached ${channel==='offline'?'offers':'prices'}.`:'The retailer update is unavailable. Please refresh later.'}</p>}
    {loading&&!snapshot?<p role="status">Loading retailer offers…</p>:<>
      <p className="ua-retail-count">{items.length} current offer{items.length===1?'':'s'}{fromCache?' · Cached update':''}</p>
      {visible.length?<>{flyers.length>0&&<RetailFlyerCards items={flyers} onAddToPlan={onAddToPlan}/>} {priced.length>0&&<RetailOfferCards items={priced} onAddToPlan={onAddToPlan}/>}</>:<p className="ua-retail-empty">No current {channel==='offline'?'in-store':'priced'} offers could be verified for {activeRetailer==='all'?'the selected locations':sources.find(source=>source.id===activeRetailer)?.name||'this retailer'}.</p>}
      {items.length>visible.length&&<button type="button" className="ua-cal-btn" onClick={()=>setLimit(value=>value+40)}>Show {items.length-visible.length} more offers</button>}
    </>}
    {snapshot&&<details className="ua-retail-status"><summary>Retailer updates</summary><ul>{channelSources.map(source=>{
      const parent=snapshot.retailers?.[source.id];
      const health=parent?.channels?.[channel]||(channel==='online'?parent:null);
      const count=rows.filter(row=>row.retailerId===source.id).length;
      let status=health?.status==='ok'?`${count} current offer(s)`:health?.status==='empty'?'No active dated flyer found in the checked listing':health?.status==='partial'?`Partial update; ${count} current offer(s)`:`Update unavailable${count?`; ${count} unexpired cached offer(s)`:''}`;
      if(health?.status==='ok'&&!count)status='The last checked offers have expired';
      return <li key={source.id}>{source.name}: {status}{health?.checkedAt&&<small> · Checked {new Date(health.checkedAt).toLocaleString()}</small>}</li>;
    })}</ul></details>}
  </section>;
}
