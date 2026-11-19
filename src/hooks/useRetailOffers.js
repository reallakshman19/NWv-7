import { useCallback, useEffect, useState } from 'react';
import { loadRetailOffers } from '../services/retailOffers.js';

export function useRetailOffers(refreshKey=0,enabled=true){
  const [state,setState]=useState({snapshot:null,loading:true,error:null,fromCache:false});
  const [attempt,setAttempt]=useState(0);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{if(!enabled)return;const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[enabled]);
  useEffect(()=>{
    if(!enabled)return;
    let active=true;
    loadRetailOffers({force:refreshKey>0||attempt>0}).then(result=>{
      if(active)setState({...result,loading:false});
    });
    return()=>{active=false;};
  },[refreshKey,attempt,enabled]);
  const refresh=useCallback(()=>{setState(previous=>({...previous,loading:true}));setAttempt(value=>value+1);},[]);
  return{...state,now,refresh};
}
