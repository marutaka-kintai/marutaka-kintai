'use strict';
// GASの「ウェブアプリURL（/exec）」です。再デプロイでURLが変わった場合のみ変更。
const API_URL='https://script.google.com/macros/s/AKfycbwKGhuOYuuQ-EVeApftEAC8wwpw6vpqVg01fS-f5olof9RMF6eVe1nfDMyeTORNZHUrww/exec';
const KEY_STORAGE='attendance-key-v1',EVENTS_STORAGE='attendance-events-v1';
const $=id=>document.getElementById(id);
let events=[],busy=false,notice='',retryTimer=null;
function read(){try{const v=JSON.parse(localStorage.getItem(EVENTS_STORAGE)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function persist(){localStorage.setItem(EVENTS_STORAGE,JSON.stringify(events));render()}
function key(){return localStorage.getItem(KEY_STORAGE)||''}
function stamp(t){return new Date(t).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})}
function render(){
 const ready=!!key();$('config').hidden=ready;$('app').hidden=!ready;$('history').hidden=!ready;if(!ready)return;
 const working=events.length?events[events.length-1].action==='start':false;
 $('mode').textContent=working?'勤務中':'勤務していません';$('punch').textContent=working?'仕事を終了':'仕事を開始';$('punch').className=working?'end':'';
 $('clock').textContent=new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
 const n=events.filter(x=>!x.synced).length;$('count').textContent='未送信：'+n+'件';$('net').textContent=navigator.onLine?'通信：オンライン':'通信：オフライン';
 $('status').textContent=notice;$('sync').disabled=busy;
 $('events').replaceChildren(...events.slice(-12).reverse().map(e=>{const li=document.createElement('li');li.textContent=`${stamp(e.timestamp)} ${e.action==='start'?'開始':'終了'} ／ ${e.synced?'送信済み':'未送信'}`;return li}));
}
function add(){
 const working=events.length?events[events.length-1].action==='start':false;
 const event={eventId:crypto.randomUUID(),action:working?'end':'start',timestamp:Date.now(),synced:false};
 events.push(event);try{persist()}catch(err){events.pop();alert('保存できません。ブラウザの保存容量を確認してください。');return}
 notice='この端末に保存しました';render();sync();
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
// GAS ContentService のリダイレクトに対応した JSONP 照合。
function check(event){return new Promise((resolve,reject)=>{
 const cb='attendanceCallback_'+Date.now()+'_'+Math.random().toString(36).slice(2);
 const script=document.createElement('script');let finished=false;
 const cleanup=()=>{if(finished)return;finished=true;clearTimeout(timer);script.remove();delete window[cb]};
 const timer=setTimeout(()=>{cleanup();reject(new Error('サーバー照合がタイムアウトしました'))},12000);
 window[cb]=result=>{cleanup();resolve(result)};
 script.onerror=()=>{cleanup();reject(new Error('サーバー照合に接続できません'))};
 const params=new URLSearchParams({mode:'check',eventId:event.eventId,key:key(),callback:cb});
 script.src=API_URL+'?'+params.toString();document.head.append(script);
})}
// POSTはレスポンスを直接読まず、必ずイベントIDでサーバー保存を照合する。
function post(event){return new Promise(resolve=>{
 const iframe=$('uploadTarget');const form=document.createElement('form');form.method='POST';form.action=API_URL;form.target='uploadTarget';form.hidden=true;
 for(const [name,value] of Object.entries({eventId:event.eventId,action:event.action,timestamp:event.timestamp,key:key()})){
  const input=document.createElement('input');input.name=name;input.value=String(value);form.append(input);
 }
 document.body.append(form);
 try{form.submit()}catch(err){form.remove();resolve(false);return}
 form.remove();resolve(true);
})}
async function sync(){
 if(busy||!navigator.onLine||!key())return;
 const pending=events.filter(e=>!e.synced);if(!pending.length){notice='すべて送信済みです';render();return}
 busy=true;render();
 try{
  for(const event of pending){
   if(!navigator.onLine)break;
   notice='確認中… '+stamp(event.timestamp);render();
   let result=await check(event);
   if(!result.ok)throw Error(result.error||'照合に失敗しました');
   if(!result.recorded){
    notice='送信中… '+stamp(event.timestamp);render();
    await post(event);
    // GASの書き込みが完了するまで待ち、照合を繰り返す。
    let confirmed=false;
    for(let i=0;i<6;i++){
     await wait(i===0?2000:2500);
     result=await check(event);
     if(!result.ok)throw Error(result.error||'照合に失敗しました');
     if(result.recorded){confirmed=true;break}
    }
    if(!confirmed)throw Error('登録を確認できません。時間をおいて再同期してください');
   }
   event.synced=true;persist();
  }
  notice=events.some(e=>!e.synced)?'未送信データが残っています':'スプレッドシートへの登録を確認しました';
 }catch(err){notice='同期保留：'+String(err.message||err)+'。記録は端末に保存されています';}
 finally{busy=false;render()}
}
$('saveKey').onclick=()=>{const k=$('key').value.trim();if(k.length<10)return alert('専用キーを入力してください');localStorage.setItem(KEY_STORAGE,k);render();sync()};
$('punch').onclick=add;$('sync').onclick=sync;
window.addEventListener('online',()=>{render();sync()});window.addEventListener('offline',render);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
setInterval(()=>{render();sync()},30000);
events=read();render();sync();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);
