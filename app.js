'use strict';

/* ── WMO CODES ── */
const WMO={0:{i:'☀️',d:'Sereno'},1:{i:'🌤',d:'Prevalentemente sereno'},2:{i:'⛅',d:'Parzialmente nuvoloso'},3:{i:'☁️',d:'Coperto'},45:{i:'🌫',d:'Nebbia'},48:{i:'🌫',d:'Nebbia gelata'},51:{i:'🌦',d:'Pioggerella lieve'},53:{i:'🌦',d:'Pioggerella'},55:{i:'🌧',d:'Pioggerella intensa'},61:{i:'🌧',d:'Pioggia lieve'},63:{i:'🌧',d:'Pioggia'},65:{i:'🌧',d:'Pioggia intensa'},66:{i:'🌨',d:'Pioggia gelata'},67:{i:'🌨',d:'Pioggia gelata intensa'},71:{i:'❄️',d:'Neve lieve'},73:{i:'❄️',d:'Neve'},75:{i:'❄️',d:'Neve intensa'},77:{i:'🌨',d:'Granelli di neve'},80:{i:'🌦',d:'Acquazzoni lievi'},81:{i:'🌧',d:'Acquazzoni'},82:{i:'⛈',d:'Acquazzoni intensi'},85:{i:'🌨',d:'Nevicate lievi'},86:{i:'🌨',d:'Nevicate'},95:{i:'⛈',d:'Temporale'},96:{i:'⛈',d:'Temporale con grandine'},99:{i:'⛈',d:'Temporale con grandine intensa'}};
function wmo(c){return WMO[c]||WMO[Math.floor(c/10)*10]||{i:'🌡',d:'Variabile'};}

/* ── STATE ── */
const S={lat:null,lon:null,city:'',country:'',region:'',weatherData:null,lastFetch:null,deferredPrompt:null,cities:[],cityWeather:{},activeSheetDay:null,activeSheetChart:null};

/* ── HELPERS ── */
const $=id=>document.getElementById(id);
const fmtTime=iso=>{const d=new Date(iso);return d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})};
const fmtDay=iso=>{const d=new Date(iso),n=new Date();if(d.toDateString()===n.toDateString())return'Oggi';const t=new Date(n);t.setDate(t.getDate()+1);if(d.toDateString()===t.toDateString())return'Domani';return d.toLocaleDateString('it-IT',{weekday:'long'}).replace(/^\w/,c=>c.toUpperCase())};
const fmtFullDate=iso=>{const d=new Date(iso);return d.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).replace(/^\w/,c=>c.toUpperCase())};
const degToCompass=d=>{const dirs=['N','NE','E','SE','S','SO','O','NO'];return dirs[Math.round(d/45)%8]};
const uvLabel=u=>{if(u<=2)return'Basso';if(u<=5)return'Moderato';if(u<=7)return'Alto';if(u<=10)return'Molto alto';return'Estremo'};
const humLabel=h=>{if(h<30)return'Secco';if(h<60)return'Confortevole';if(h<80)return'Umido';return'Molto umido'};
const visLabel=v=>{if(v>=20)return'Eccellente';if(v>=10)return'Buona';if(v>=4)return'Discreta';return'Scarsa'};
const blobColor=c=>{if(c===0)return'#1a7cff';if(c<=2)return'#1060c8';if(c<=3)return'#405060';if(c>=95)return'#203050';if(c>=61)return'#104060';return'#1a7cff'};

/* ── LOCALSTORAGE ── */
const LS='cielo_v3';
function saveCities(){localStorage.setItem(LS,JSON.stringify(S.cities.filter(c=>!c.isPos).map(({city,country,region,lat,lon})=>({city,country,region,lat,lon}))));}
function loadLS(){try{return JSON.parse(localStorage.getItem(LS)||'[]');}catch{return[];}}

/* ── BACKGROUND CANVAS ── */
const canvas=$('bg-canvas');
const ctx=canvas.getContext('2d');
let bgAnim=null,bgParts=[];
function resizeCanvas(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
function initParts(){bgParts=[];for(let i=0;i<45;i++)bgParts.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*2+0.4,speed:Math.random()*0.35+0.08,opacity:Math.random()*0.45+0.08,drift:(Math.random()-0.5)*0.25});}
function getBg(code,hour){const n=hour<6||hour>=20;if(n)return['#070d1a','#0c1228','#0f1535'];if(code===0)return['#0a1628','#0c2d52','#0f5090'];if(code<=2)return['#0d1f3c','#123468','#1a5888'];if(code<=3)return['#0e1520','#18222f','#222c3c'];if(code>=95)return['#090c12','#111620','#1a1f2e'];if(code>=61)return['#0c1420','#142030','#1c2c40'];return['#0a1628','#0c2d52','#0f5090'];}
function animateBg(code){if(bgAnim)cancelAnimationFrame(bgAnim);const h=new Date().getHours();const[c1,c2,c3]=getBg(code,h);function draw(){const g=ctx.createLinearGradient(0,0,0,canvas.height);g.addColorStop(0,c1);g.addColorStop(0.5,c2);g.addColorStop(1,c3);ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);bgParts.forEach(p=>{p.y+=p.speed;p.x+=p.drift;if(p.y>canvas.height){p.y=0;p.x=Math.random()*canvas.width;}if(p.x<0)p.x=canvas.width;if(p.x>canvas.width)p.x=0;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${p.opacity})`;ctx.fill();});bgAnim=requestAnimationFrame(draw);}draw();}

/* ── GEOCODING ── */
async function reverseGeocode(lat,lon){try{const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=it`,{headers:{'Accept-Language':'it'}});const d=await r.json();return{city:d.address?.city||d.address?.town||d.address?.village||d.address?.county||'Posizione',country:(d.address?.country_code||'').toUpperCase(),region:d.address?.state||''};}catch{return{city:'La mia posizione',country:'',region:''};}}
async function searchCity(q){const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&accept-language=it&addressdetails=1`,{headers:{'Accept-Language':'it'}});return r.json();}

/* ── FETCH WEATHER ── */
async function fetchWeather(lat,lon){const p=new URLSearchParams({latitude:lat,longitude:lon,current:['temperature_2m','relative_humidity_2m','apparent_temperature','weather_code','wind_speed_10m','wind_direction_10m','surface_pressure','visibility','uv_index','precipitation'].join(','),hourly:['temperature_2m','apparent_temperature','weather_code','precipitation_probability','precipitation'].join(','),daily:['weather_code','temperature_2m_max','temperature_2m_min','sunrise','sunset','precipitation_sum','uv_index_max','precipitation_probability_max'].join(','),timezone:'auto',forecast_days:7,wind_speed_unit:'kmh'});const r=await fetch(`https://api.open-meteo.com/v1/forecast?${p}`);if(!r.ok)throw new Error('fail');return r.json();}

/* ── CITY LIST ── */
function renderCityList(){
  const wrap=$('list-content');wrap.innerHTML='';
  S.cities.forEach((c,idx)=>{
    const w=S.cityWeather[`${c.lat},${c.lon}`]||{};
    const card=document.createElement('div');card.className='city-card';card.dataset.idx=idx;
    card.innerHTML=`<div class="cc-blob" style="background:${blobColor(w.code||0)}"></div><button class="cc-del" data-idx="${idx}">−</button><div class="cc-inner"><div class="cc-top"><div><div class="cc-city">${c.isPos?'<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.5" stroke="rgba(255,255,255,0.65)" stroke-width="1.4"/><circle cx="5.5" cy="5.5" r="1.8" fill="rgba(255,255,255,0.65)"/></svg>':''} ${c.city}</div><div class="cc-pos-label">${c.isPos?'La mia posizione':[c.region,c.country].filter(Boolean).join(', ')}</div></div><div class="cc-temp">${w.temp!=null?Math.round(w.temp)+'°':'—'}</div></div><div class="cc-bottom"><div class="cc-desc">${w.code!=null?wmo(w.code).i+' '+wmo(w.code).d:'—'}</div><div class="cc-range">${w.hi!=null?'Max: '+Math.round(w.hi)+'° Min: '+Math.round(w.lo)+'°':''}</div></div></div>`;
    card.addEventListener('click',e=>{if(document.body.classList.contains('editing'))return;if(e.target.closest('.cc-del'))return;openDetailForCity(c);});
    wrap.appendChild(card);
  });
  wrap.querySelectorAll('.cc-del').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();const idx=parseInt(btn.dataset.idx);if(S.cities[idx]?.isPos)return;S.cities.splice(idx,1);saveCities();renderCityList();});});
}

async function loadAllCityWeather(){
  await Promise.allSettled(S.cities.map(async c=>{
    const key=`${c.lat},${c.lon}`;
    if(S.cityWeather[key]&&Date.now()-S.cityWeather[key].ts<5*60*1000)return;
    try{const p=new URLSearchParams({latitude:c.lat,longitude:c.lon,current:['temperature_2m','weather_code'].join(','),daily:['temperature_2m_max','temperature_2m_min','weather_code'].join(','),timezone:'auto',forecast_days:1});const r=await fetch(`https://api.open-meteo.com/v1/forecast?${p}`);const d=await r.json();S.cityWeather[key]={temp:d.current.temperature_2m,code:d.current.weather_code,hi:d.daily.temperature_2m_max[0],lo:d.daily.temperature_2m_min[0],ts:Date.now()};}catch{}
  }));
  renderCityList();
}

/* ── VIEWS ── */
function showView(name){
  $('view-list').classList.toggle('hidden',name!=='list');
  $('view-detail').classList.toggle('hidden',name!=='detail');
  $('view-detail').scrollTop=0;
  const nav=$('mobile-nav');
  if(nav)nav.style.display=name==='detail'?'':'none';
}

/* ── OPEN DETAIL ── */
async function openDetailForCity(c){
  S.lat=c.lat;S.lon=c.lon;S.city=c.city;S.country=c.country;S.region=c.region;
  showView('detail');
  setLoading('Caricamento meteo…');
  try{
    const data=await fetchWeather(c.lat,c.lon);
    S.weatherData=data;S.lastFetch=Date.now();
    renderDetail(data);
    hideLoading();
  }catch{
    setLoading('Errore rete. Riprova…');
    setTimeout(hideLoading,3000);
  }
}

/* ── RENDER DETAIL ── */
function renderDetail(data){
  const c=data.current,d=data.daily,h=data.hourly,w=wmo(c.weather_code);
  animateBg(c.weather_code);
  $('d-city').textContent=S.city;
  $('d-sub').textContent=[S.region,S.country].filter(Boolean).join(' · ');
  $('d-temp').textContent=Math.round(c.temperature_2m);
  $('d-desc').textContent=w.i+' '+w.d;
  $('d-range').textContent=`Max ${Math.round(d.temperature_2m_max[0])}° · Min ${Math.round(d.temperature_2m_min[0])}°`;
  $('stat-humidity').innerHTML=`${c.relative_humidity_2m}<span class="stat-unit">%</span>`;
  $('stat-hum-sub').textContent=humLabel(c.relative_humidity_2m);
  $('stat-wind').innerHTML=`${Math.round(c.wind_speed_10m)}<span class="stat-unit"> km/h</span>`;
  $('stat-wind-dir').textContent=degToCompass(c.wind_direction_10m);
  $('stat-vis').innerHTML=`${(c.visibility/1000).toFixed(1)}<span class="stat-unit"> km</span>`;
  $('stat-vis-sub').textContent=visLabel(c.visibility/1000);
  $('stat-feels').innerHTML=`${Math.round(c.apparent_temperature)}<span class="stat-unit">°</span>`;
  $('stat-feels-sub').textContent=c.apparent_temperature<c.temperature_2m?'Percepito più freddo':'Percepito più caldo';
  const uv=Math.round(c.uv_index);
  $('stat-uv').textContent=uv;$('stat-uv-lbl').textContent=uvLabel(uv);
  $('uv-dot').style.left=`${Math.min((uv/12)*100,100)}%`;
  $('stat-sunrise').textContent=fmtTime(d.sunrise[0]);$('stat-sunset').textContent=fmtTime(d.sunset[0]);
  $('stat-precip').innerHTML=`${c.precipitation.toFixed(1)}<span class="stat-unit"> mm</span>`;
  $('stat-precip-sub').textContent=`Oggi: ${d.precipitation_sum[0].toFixed(1)} mm`;
  $('stat-pressure').innerHTML=`${Math.round(c.surface_pressure)}<span class="stat-unit" style="font-size:10px"> hPa</span>`;
  $('stat-pressure-sub').textContent=c.surface_pressure>1013?'Alta pressione':'Bassa pressione';
  $('last-updated').textContent=new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  renderHourly(h);renderWeekly(d);
  window.dispatchEvent(new Event('weatherRendered'));
}

function renderHourly(h){
  const now=new Date(),wrap=$('hourly-scroll');wrap.innerHTML='';
  let si=h.time.findIndex(t=>new Date(t)>=now);if(si<0)si=0;
  for(let i=si;i<Math.min(si+24,h.time.length);i++){
    const t=new Date(h.time[i]),isNow=i===si,w=wmo(h.weather_code[i]),pr=h.precipitation_probability[i];
    const el=document.createElement('div');el.className='hour-item'+(isNow?' now':'');
    el.innerHTML=`<div class="hour-time">${isNow?'Ora':t.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</div><div class="hour-icon">${w.i}</div><div class="hour-temp">${Math.round(h.temperature_2m[i])}°</div>${pr>0?`<div class="hour-precip">${pr}%</div>`:''}`;
    wrap.appendChild(el);
  }
}

function renderWeekly(d){
  const wrap=$('weekly-table');wrap.innerHTML='';
  const aMax=d.temperature_2m_max,aMin=d.temperature_2m_min;
  const gMin=Math.min(...aMin),gMax=Math.max(...aMax),range=gMax-gMin||1;
  for(let i=0;i<7;i++){
    const w=wmo(d.weather_code[i]),hi=Math.round(aMax[i]),lo=Math.round(aMin[i]);
    const bL=((aMin[i]-gMin)/range)*100,bW=((aMax[i]-aMin[i])/range)*100;
    const row=document.createElement('div');row.className='day-row';row.dataset.dayIdx=i;
    row.innerHTML=`<div class="day-name">${fmtDay(d.time[i])}</div><div class="day-icon">${w.i}</div><div class="day-bar-wrap"><div class="day-bar-track"></div><div class="day-bar-fill" style="left:${bL}%;width:${bW}%"></div></div><div class="day-temps"><span class="day-lo">${lo}°</span><span class="day-hi">${hi}°</span></div>`;
    row.addEventListener('click',()=>openDaySheet(i));
    wrap.appendChild(row);
  }
}

/* ── DAY SHEET ── */
function openDaySheet(dayIdx){
  const data=S.weatherData;if(!data)return;
  const d=data.daily,h=data.hourly,dayDate=d.time[dayIdx],w=wmo(d.weather_code[dayIdx]);
  S.activeSheetDay=dayIdx;
  $('sheet-icon').textContent=w.i;$('sheet-day-name').textContent=fmtDay(dayDate);$('sheet-full-date').textContent=fmtFullDate(dayDate);
  const hi=Math.round(d.temperature_2m_max[dayIdx]),lo=Math.round(d.temperature_2m_min[dayIdx]);
  $('sh-big-temp').textContent=`${hi}°`;$('sh-desc').textContent=w.d;$('sh-max').textContent=`Max: ${hi}°`;$('sh-min').textContent=`Min: ${lo}°`;
  const uv=d.uv_index_max[dayIdx];
  $('sm-uv').textContent=uv!=null?Math.round(uv):'—';$('sm-uv-lbl').textContent=uv!=null?uvLabel(uv):'';
  $('sm-sun').textContent=`${fmtTime(d.sunrise[dayIdx])} / ${fmtTime(d.sunset[dayIdx])}`;
  $('sm-precip').textContent=`${d.precipitation_sum[dayIdx].toFixed(1)} mm`;$('sm-precip-sub').textContent='Precipitazioni totali';
  $('sm-prob').textContent=`${d.precipitation_probability_max[dayIdx]}%`;
  const prob=d.precipitation_probability_max[dayIdx];
  const parts=[`<strong>${fmtDay(dayDate)}</strong> le temperature varieranno da <strong>${lo}°</strong> a <strong>${hi}°</strong>.`];
  if(prob>=70)parts.push(`Alta probabilità di pioggia (<strong>${prob}%</strong>) con ${d.precipitation_sum[dayIdx].toFixed(1)} mm previsti.`);
  else if(prob>=30)parts.push(`Probabilità di precipitazioni moderata (<strong>${prob}%</strong>).`);
  else parts.push('Precipitazioni improbabili.');
  if(uv>=8)parts.push(`Indice UV molto alto (<strong>${Math.round(uv)}</strong>): usa protezione solare.`);
  $('sh-summary').innerHTML=parts.join(' ');
  document.querySelectorAll('.sh-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab==='temp'));
  drawSheetChart('temp',dayIdx);
  $('sheet-backdrop').classList.add('open');$('day-sheet').classList.add('open');
  setupSheetSwipe();
}

function closeDaySheet(){
  $('sheet-backdrop').classList.remove('open');$('day-sheet').classList.remove('open');
  if(S.activeSheetChart){S.activeSheetChart.destroy();S.activeSheetChart=null;}
}

function drawSheetChart(tab,dayIdx){
  const data=S.weatherData;if(!data)return;
  const h=data.hourly,dayDate=data.daily.time[dayIdx];
  const idxs=[];h.time.forEach((t,i)=>{if(t.startsWith(dayDate))idxs.push(i);});
  const labels=idxs.map(i=>{const d=new Date(h.time[i]);return d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});});
  if(S.activeSheetChart){S.activeSheetChart.destroy();S.activeSheetChart=null;}
  const cv=$('sheet-chart');const ct=cv.getContext('2d');
  Chart.defaults.color='rgba(255,255,255,0.5)';Chart.defaults.borderColor='rgba(255,255,255,0.08)';
  if(tab==='temp'){
    $('chart-note').textContent='Temperatura reale (bianco) e percepita (blu) nell\'arco della giornata';
    const gr=ct.createLinearGradient(0,0,0,160);gr.addColorStop(0,'rgba(255,255,255,0.22)');gr.addColorStop(1,'rgba(255,255,255,0.02)');
    const gf=ct.createLinearGradient(0,0,0,160);gf.addColorStop(0,'rgba(76,201,255,0.22)');gf.addColorStop(1,'rgba(76,201,255,0.02)');
    S.activeSheetChart=new Chart(cv,{type:'line',data:{labels,datasets:[{label:'Reale',data:idxs.map(i=>h.temperature_2m[i]),borderColor:'rgba(255,255,255,0.9)',backgroundColor:gr,borderWidth:2,pointRadius:0,fill:true,tension:0.4},{label:'Percepita',data:idxs.map(i=>h.apparent_temperature[i]),borderColor:'rgba(76,201,255,0.85)',backgroundColor:gf,borderWidth:2,pointRadius:0,fill:true,tension:0.4}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:400},interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,position:'top',align:'end',labels:{font:{size:11},boxWidth:10,boxHeight:2,padding:12,color:'rgba(255,255,255,0.6)'}},tooltip:{backgroundColor:'rgba(15,25,40,0.9)',titleColor:'white',bodyColor:'rgba(255,255,255,0.7)',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,padding:10,cornerRadius:10,callbacks:{label:c=>`${c.dataset.label}: ${c.raw?.toFixed(1)}°C`}}},scales:{x:{grid:{display:false},ticks:{font:{size:11},maxTicksLimit:6}},y:{grid:{color:'rgba(255,255,255,0.06)'},ticks:{font:{size:11},callback:v=>`${v}°`}}}}});
  }else{
    $('chart-note').textContent='Probabilità di pioggia (%) e precipitazioni (mm) nell\'arco della giornata';
    const gp=ct.createLinearGradient(0,0,0,160);gp.addColorStop(0,'rgba(76,201,255,0.30)');gp.addColorStop(1,'rgba(76,201,255,0.02)');
    S.activeSheetChart=new Chart(cv,{type:'bar',data:{labels,datasets:[{label:'Prob. %',data:idxs.map(i=>h.precipitation_probability[i]),backgroundColor:'rgba(76,201,255,0.55)',borderColor:'rgba(76,201,255,0.85)',borderWidth:1,borderRadius:4,yAxisID:'y'},{label:'mm',data:idxs.map(i=>h.precipitation[i]||0),type:'line',borderColor:'rgba(255,200,80,0.9)',backgroundColor:'transparent',borderWidth:2,pointRadius:0,tension:0.4,yAxisID:'y2'}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:400},interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,position:'top',align:'end',labels:{font:{size:11},boxWidth:10,boxHeight:2,padding:12,color:'rgba(255,255,255,0.6)'}},tooltip:{backgroundColor:'rgba(15,25,40,0.9)',titleColor:'white',bodyColor:'rgba(255,255,255,0.7)',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,padding:10,cornerRadius:10}},scales:{x:{grid:{display:false},ticks:{font:{size:11},maxTicksLimit:6}},y:{grid:{color:'rgba(255,255,255,0.06)'},ticks:{font:{size:11},callback:v=>`${v}%`},max:100,min:0},y2:{position:'right',grid:{display:false},ticks:{font:{size:11},callback:v=>`${v}mm`}}}}});
  }
}

function setupSheetSwipe(){
  const sheet=$('day-sheet');let sy=0,isDrag=false,cur=0;
  const onStart=e=>{sy=(e.touches||[e])[0].clientY;isDrag=true;cur=0;sheet.style.transition='none'};
  const onMove=e=>{if(!isDrag)return;const dy=(e.touches||[e])[0].clientY-sy;if(dy<0)return;cur=dy;sheet.style.transform=`translateY(${dy}px)`};
  const onEnd=()=>{isDrag=false;sheet.style.transition='';sheet.style.transform='';if(cur>120)closeDaySheet();};
  sheet.addEventListener('touchstart',onStart,{passive:true});
  sheet.addEventListener('touchmove',onMove,{passive:true});
  sheet.addEventListener('touchend',onEnd,{passive:true});
}

document.querySelectorAll('.sh-tab').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.sh-tab').forEach(t=>t.classList.toggle('active',t===btn));if(S.activeSheetDay!=null)drawSheetChart(btn.dataset.tab,S.activeSheetDay);});});
$('sheet-close-btn').addEventListener('click',closeDaySheet);
$('sheet-backdrop').addEventListener('click',closeDaySheet);

/* ── GEOLOCATION ── */
function getPos(){return new Promise((res,rej)=>{if(!navigator.geolocation){rej(new Error('no geo'));return;}navigator.geolocation.getCurrentPosition(res,rej,{timeout:12000,maximumAge:60000,enableHighAccuracy:false});});}

/* ── INIT ── */
async function initApp(){
  setLoading('Rilevamento posizione…');
  resizeCanvas();initParts();animateBg(0);
  const saved=loadLS();
  let posCity;
  try{
    const pos=await getPos();
    setLoading('Recupero città…');
    const geo=await reverseGeocode(pos.coords.latitude,pos.coords.longitude);
    posCity={city:geo.city,country:geo.country,region:geo.region,lat:pos.coords.latitude,lon:pos.coords.longitude,isPos:true};
  }catch{
    posCity={city:'Milano',country:'IT',region:'Lombardia',lat:45.4642,lon:9.1900,isPos:true};
  }
  S.cities=[posCity,...saved];
  showView('list');
  hideLoading();
  loadAllCityWeather();
  openDetailForCity(posCity);
}

/* ── LOADING ── */
function setLoading(msg){$('loading-text').textContent=msg;$('loading').classList.remove('hidden');}
function hideLoading(){$('loading').classList.add('hidden');}

/* ── BACK ── */
$('btn-back').addEventListener('click',()=>{closeDaySheet();showView('list');animateBg(0);loadAllCityWeather();});

/* ── EDIT ── */
$('btn-edit').addEventListener('click',()=>{const e=document.body.classList.toggle('editing');$('btn-edit').textContent=e?'✅':'✏️';});

/* ── SEARCH ── */
let stout=null;
$('btn-open-search').addEventListener('click',()=>{$('search-bg').classList.add('open');$('search-modal').classList.add('open');setTimeout(()=>$('search-input').focus(),200);});
$('search-cancel').addEventListener('click',closeSearch);
function closeSearch(){$('search-bg').classList.remove('open');$('search-modal').classList.remove('open');$('search-input').value='';$('search-results').innerHTML='';}
$('search-input').addEventListener('input',e=>{clearTimeout(stout);const q=e.target.value.trim();if(q.length<2){$('search-results').innerHTML='';return;}stout=setTimeout(()=>doSearch(q),400);});
async function doSearch(q){
  $('search-results').innerHTML='<div style="padding:16px;color:rgba(255,255,255,0.5);font-size:15px">Ricerca…</div>';
  try{
    const res=await searchCity(q);if(!res.length){$('search-results').innerHTML='<div style="padding:16px;color:rgba(255,255,255,0.5);font-size:15px">Nessun risultato</div>';return;}
    $('search-results').innerHTML='';
    res.forEach(r=>{
      const city=r.address?.city||r.address?.town||r.address?.village||r.name;
      const country=(r.address?.country_code||'').toUpperCase();const region=r.address?.state||'';
      const el=document.createElement('div');el.className='sr-item';
      el.innerHTML=`<div class="sr-city">${city}</div><div class="sr-country">${[region,country].filter(Boolean).join(', ')}</div>`;
      el.addEventListener('click',()=>{
        const exists=S.cities.find(c=>c.city===city&&c.country===country);
        if(!exists){S.cities.push({city,country,region,lat:parseFloat(r.lat),lon:parseFloat(r.lon),isPos:false});saveCities();}
        closeSearch();document.body.classList.remove('editing');$('btn-edit').textContent='✏️';renderCityList();
        const target=S.cities.find(c=>c.city===city&&c.country===country)||{city,country,region,lat:parseFloat(r.lat),lon:parseFloat(r.lon)};
        openDetailForCity(target);
      });
      $('search-results').appendChild(el);
    });
  }catch{$('search-results').innerHTML='<div style="padding:16px;color:#ff453a;font-size:15px">Errore</div>';}
}

/* ── MAP ── */
$('btn-map-fab').addEventListener('click',()=>{
  const lat=S.lat||45.4642,lon=S.lon||9.19;
  $('map-iframe').src=`https://www.openstreetmap.org/export/embed.html?bbox=${lon-0.1},${lat-0.1},${lon+0.1},${lat+0.1}&layer=mapnik&marker=${lat},${lon}`;
  $('map-bg').classList.add('open');$('map-modal').classList.add('open');
});
$('map-close-btn').addEventListener('click',()=>{$('map-bg').classList.remove('open');$('map-modal').classList.remove('open');});
$('map-bg').addEventListener('click',()=>{$('map-bg').classList.remove('open');$('map-modal').classList.remove('open');});

/* ── INSTALL ── */
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();S.deferredPrompt=e;$('btn-install-hdr').classList.add('visible');setTimeout(()=>$('install-banner').classList.add('show'),4000);});
window.addEventListener('appinstalled',()=>{S.deferredPrompt=null;$('btn-install-hdr').classList.remove('visible');$('install-banner').classList.remove('show');});
async function triggerInstall(){if(!S.deferredPrompt)return;S.deferredPrompt.prompt();const{outcome}=await S.deferredPrompt.userChoice;S.deferredPrompt=null;if(outcome==='accepted'){$('btn-install-hdr').classList.remove('visible');$('install-banner').classList.remove('show');}}
$('btn-install-hdr').addEventListener('click',triggerInstall);
$('inst-btn').addEventListener('click',triggerInstall);
$('inst-x').addEventListener('click',()=>$('install-banner').classList.remove('show'));

/* ── SERVICE WORKER ── */
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

/* ── PTR ── */
const dScroll=$('view-detail');
let ptrSY=0,ptrSX=0,ptrOn=false,ptrInt=null;
dScroll.addEventListener('touchstart',e=>{if(dScroll.scrollTop===0){ptrSY=e.touches[0].clientY;ptrSX=e.touches[0].clientX;ptrInt=null;}},{passive:true});
dScroll.addEventListener('touchmove',e=>{if(dScroll.scrollTop>0){ptrInt=null;return;}const dy=e.touches[0].clientY-ptrSY,dx=Math.abs(e.touches[0].clientX-ptrSX);if(!ptrInt){if(dx>8)ptrInt='h';else if(dy>6)ptrInt='v';}if(ptrInt==='h'){ptrOn=false;return;}if(ptrInt==='v'&&!ptrOn&&dy>120){ptrOn=true;$('ptr-ind').classList.add('show');}},{passive:true});
dScroll.addEventListener('touchend',()=>{if(ptrOn){ptrOn=false;ptrInt=null;$('ptr-ind').classList.remove('show');if(S.lat)openDetailForCity({city:S.city,country:S.country,region:S.region,lat:S.lat,lon:S.lon});}ptrInt=null;},{passive:true});

/* ── MOBILE NAV ── */
function initMobileNav(){
  const isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
  if(!isTouch)return;
  const nav=$('mobile-nav');
  nav.classList.add('on');
  nav.style.display='none'; // nascosto finché non siamo in detail

  const hArr=$('hourly-arrows');
  const strip=$('hourly-scroll');
  const detV=$('view-detail');
  const VSTEP=Math.round(window.innerHeight*0.6);
  const HSTEP=220;

  $('mnav-up').addEventListener('click',()=>detV.scrollBy({top:-VSTEP,behavior:'smooth'}));
  $('mnav-down').addEventListener('click',()=>detV.scrollBy({top:VSTEP,behavior:'smooth'}));
  $('mnav-left').addEventListener('click',()=>strip.scrollBy({left:-HSTEP,behavior:'smooth'}));
  $('mnav-right').addEventListener('click',()=>strip.scrollBy({left:HSTEP,behavior:'smooth'}));

  function refreshV(){
    $('mnav-up').classList.toggle('dim',detV.scrollTop<10);
    $('mnav-down').classList.toggle('dim',detV.scrollTop+detV.clientHeight>=detV.scrollHeight-10);
  }
  function refreshH(){
    $('mnav-left').classList.toggle('dim',strip.scrollLeft<10);
    $('mnav-right').classList.toggle('dim',strip.scrollLeft+strip.clientWidth>=strip.scrollWidth-10);
  }

  detV.addEventListener('scroll',refreshV,{passive:true});
  strip.addEventListener('scroll',refreshH,{passive:true});

  // Mostra frecce orizzontali solo quando la card è visibile
  window.addEventListener('weatherRendered',()=>{
    setTimeout(()=>{
      refreshV();refreshH();
      const card=$('#hourly-scroll')?.closest?.('.dcard')||document.querySelector('#hourly-scroll')?.closest('.dcard');
      if(card){
        new IntersectionObserver(entries=>{
          hArr.classList.toggle('show',entries[0].isIntersecting);
          refreshH();
        },{threshold:0.2,root:detV}).observe(card);
      }
    },200);
  });

  // Nascondi nav quando sheet è aperto
  new MutationObserver(()=>{
    const open=$('day-sheet').classList.contains('open');
    nav.style.opacity=open?'0':'1';
    nav.style.pointerEvents=open?'none':'';
  }).observe($('day-sheet'),{attributes:true,attributeFilter:['class']});
}

/* ── AUTO REFRESH ── */
setInterval(()=>{if(S.lastFetch&&Date.now()-S.lastFetch>10*60*1000&&S.lat)openDetailForCity({city:S.city,country:S.country,region:S.region,lat:S.lat,lon:S.lon});},60000);
window.addEventListener('resize',resizeCanvas);

/* ── START ── */
resizeCanvas();initParts();animateBg(0);
initMobileNav();
initApp();
