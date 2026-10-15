'use strict';
// デプロイを新規作成した場合のみ、最新の /exec URLに変更してください。
const API_URL = 'https://script.google.com/macros/s/AKfycbwKGhuOYuuQ-EVeApftEAC8wwpw6vpqVg01fS-f5olof9RMF6eVe1nfDMyeTORNZHUrww/exec';
// 既存の専用キー・未送信記録を保持するため、以下の保存名は変更しません。
const KEY_STORAGE = 'attendance-key-v1';
const EVENTS_STORAGE = 'attendance-events-v1';
const $ = id => document.getElementById(id);
let events = [], sending = false, timer = null, currentId = '', blockedId = '';
function read() { try { const v = JSON.parse(localStorage.getItem(EVENTS_STORAGE) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function persist() { localStorage.setItem(EVENTS_STORAGE, JSON.stringify(events)); render(); }
function key() { return localStorage.getItem(KEY_STORAGE) || ''; }
function stamp(t) { return new Date(t).toLocaleString('ja-JP', {timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
function render() {
  const ready = !!key(); $('config').hidden = ready; $('app').hidden = !ready; $('history').hidden = !ready;
  if (!ready) return;
  const working = events.length ? events[events.length-1].action === 'start' : false;
  $('mode').textContent = working ? '勤務中' : '勤務していません';
  $('punch').textContent = working ? '仕事を終了' : '仕事を開始'; $('punch').className = working ? 'end' : '';
  $('clock').textContent = new Date().toLocaleString('ja-JP', {timeZone:'Asia/Tokyo'});
  $('count').textContent = '未送信：' + events.filter(e => !e.synced).length + '件';
  $('net').textContent = navigator.onLine ? '通信：オンライン' : '通信：オフライン';
  $('events').replaceChildren(...events.slice(-12).reverse().map(e => { const li=document.createElement('li'); li.textContent=`${stamp(e.timestamp)} ${e.action==='start'?'開始':'終了'} ／ ${e.synced?'送信済み':'未送信'}`; return li; }));
}
function add() {
  const working = events.length ? events[events.length-1].action === 'start' : false;
  const event = {eventId:crypto.randomUUID(), action:working?'end':'start', timestamp:Date.now(), synced:false};
  events.push(event);
  try { persist(); $('status').textContent='端末に記録しました'; sync(); }
  catch (err) { events.pop(); alert('保存に失敗しました。プライベートモードや容量を確認してください。'); }
}
function finishSend() { clearTimeout(timer); timer=null; sending=false; currentId=''; }
// GETは登録状況の照会専用。勤務記録の書き込みは従来どおりPOSTのみ。
function checkSaved(item, attempt=0) {
  const cb='attendanceCheck_'+Math.random().toString(36).slice(2,14);
  const script=document.createElement('script');
  let settled=false;
  const cleanup=()=>{if(settled)return;settled=true;clearTimeout(wait);script.remove();delete window[cb];};
  window[cb]=res=>{
    cleanup();
    if(res.status==='saved'){
      const row=events.find(x=>x.eventId===item.eventId);
      if(row){row.synced=true;persist();}
      blockedId='';$('status').textContent='スプレッドシートへの登録を確認しました';$('debug').textContent='イベントIDで登録確認済み';
      setTimeout(()=>sync(),200);
    } else if(res.status==='error') {
      blockedId=item.eventId;
      $('status').textContent='Google側のエラー：'+String(res.error||'不明');
      $('debug').textContent='未送信データは端末に保存されています。';
    } else if(attempt<3){setTimeout(()=>checkSaved(item,attempt+1),2500);}
    else {blockedId=item.eventId;$('status').textContent='Google側に登録が確認できません';$('debug').textContent='未送信データは保存中です。管理者が送信エラーシートを確認してください。';}
  };
  const wait=setTimeout(()=>{cleanup();if(attempt<3)setTimeout(()=>checkSaved(item,attempt+1),2500);else{$('status').textContent='確認通信がタイムアウトしました';$('debug').textContent='端末の未送信データは保持しています。';blockedId=item.eventId;}},10000);
  script.src=API_URL+'?mode=check&eventId='+encodeURIComponent(item.eventId)+'&callback='+cb;
  script.onerror=()=>{cleanup();if(attempt<3)setTimeout(()=>checkSaved(item,attempt+1),2500);else{$('status').textContent='確認通信に失敗しました';blockedId=item.eventId;}};
  document.head.append(script);
}
function sync(force=false) {
  if(sending||!navigator.onLine||!key())return;
  const item=events.find(x=>!x.synced);if(!item)return;
  // 初回同期は先に登録済み照会。過去のPOSTが成功していた場合の二重送信を防ぐ。
  if(force){blockedId='';checkSaved(item);return;}
  if(blockedId===item.eventId)return;
  sending=true;currentId=item.eventId;
  const form=document.createElement('form');form.method='POST';form.action=API_URL;form.target='uploadTarget';form.hidden=true;
  for(const [k,v] of Object.entries({eventId:item.eventId,action:item.action,timestamp:item.timestamp,key:key()})){
    const input=document.createElement('input');input.name=k;input.value=String(v);form.append(input);
  }
  document.body.append(form);$('status').textContent='送信中…';$('debug').textContent='送信ID：'+item.eventId.slice(0,8);
  timer=setTimeout(()=>{if(currentId!==item.eventId)return;finishSend();blockedId=item.eventId;$('status').textContent='送信結果を照会しています…';checkSaved(item);},8000);
  try{form.submit();}catch(err){finishSend();blockedId=item.eventId;$('status').textContent='送信できません：'+err.message;}
  setTimeout(()=>form.remove(),1500);
}
window.addEventListener('message',ev=>{
  try{const h=new URL(ev.origin).hostname;if(!(h==='google.com'||h.endsWith('.google.com')||h==='googleusercontent.com'||h.endsWith('.googleusercontent.com')))return;}catch{return;}
  const msg=ev.data;if(!msg||msg.type!=='punchAck'||!msg.payload)return;
  const p=msg.payload;if(!sending||p.eventId!==currentId)return;
  const item=events.find(x=>x.eventId===p.eventId);finishSend();
  if(p.ok){if(item){item.synced=true;persist();}blockedId='';$('status').textContent='スプレッドシートに反映しました';setTimeout(()=>sync(),250);}
  else{blockedId=p.eventId;$('status').textContent='同期エラー：'+String(p.error||'不明');$('debug').textContent='送信エラーシートも確認してください。';}
});
$('saveKey').onclick=()=>{const k=$('key').value.trim(); if(k.length<10)return alert('専用キーを入力してください'); localStorage.setItem(KEY_STORAGE,k); render(); sync();};
$('punch').onclick=add;
$('sync').onclick=()=>sync(true);
window.addEventListener('online',()=>{render();sync();});
window.addEventListener('offline',render);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
setInterval(()=>{render();sync();},30000);
events=read();render();if(events.some(e=>!e.synced))checkSaved(events.find(e=>!e.synced));
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
