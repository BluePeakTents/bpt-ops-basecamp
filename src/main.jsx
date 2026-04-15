import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/basecamp.css'
import App from './App.jsx'

// ── Error Logger — captures unhandled errors to Dataverse ──
;(function(){
  const FLUSH_MS = 10000, BATCH = 5, MAX_Q = 50;
  let queue = [], sessionId;
  try { sessionId = sessionStorage.getItem('bpt_err_sess') || (Date.now()+'-'+Math.random().toString(36).substring(2,10)); sessionStorage.setItem('bpt_err_sess', sessionId); } catch(_){ sessionId = Date.now().toString(); }
  function enqueue(entry){ if(queue.length >= MAX_Q) queue.shift(); queue.push(entry); if(queue.length >= BATCH) flush(); }
  function flush(){
    if(!queue.length) return;
    const batch = queue.splice(0, BATCH);
    fetch('/api/error-log', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(batch) }).catch(()=>{});
  }
  function build(msg, stack, sev){
    return { appName:'ops-basecamp', environment:1, severity:sev||2, errorMessage:msg, stackTrace:stack||'', url:location.href, userAgent:navigator.userAgent, sessionId, occurredOn:new Date().toISOString(), browserInfo:navigator.userAgent.substring(0,200) };
  }
  window.onerror = function(msg, src, line, col, err){ enqueue(build(msg, err?.stack||src+':'+line, 1)); };
  window.onunhandledrejection = function(e){ const msg = e.reason instanceof Error ? e.reason.message : String(e.reason); enqueue(build('Unhandled rejection: '+msg, e.reason?.stack||'', 1)); };
  setInterval(flush, FLUSH_MS);
  window.addEventListener('beforeunload', ()=>{ if(queue.length) navigator.sendBeacon('/api/error-log', new Blob([JSON.stringify(queue)],{type:'application/json'})); });
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
