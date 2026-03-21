/* ═══════════════════════════════════════════════════
   CIELO — Weather PWA  |  app.js  v2.0
   APIs: Open-Meteo (free), Nominatim/OSM (free)
   Features: city list w/ localStorage, day-detail
   sheet with temp+precip charts, liquid glass UI
═══════════════════════════════════════════════════ */

'use strict';

/* ── WEATHER CODE MAP ── */
const WMO = {
  0:{i:'☀️',d:'Sereno'},1:{i:'🌤',d:'Prevalentemente sereno'},2:{i:'⛅',d:'Parzialmente nuvoloso'},
  3:{i:'☁️',d:'Coperto'},45:{i:'🌫',d:'Nebbia'},48:{i:'🌫',d:'Nebbia gelata'},
  51:{i:'🌦',d:'Pioggerella lieve'},53:{i:'🌦',d:'Pioggerella'},55:{i:'🌧',d:'Pioggerella intensa'},
  61:{i:'🌧',d:'Pioggia lieve'},63:{i:'🌧',d:'Pioggia'},65:{i:'🌧',d:'Pioggia intensa'},
  66:{i:'🌨',d:'Pioggia gelata'},67:{i:'🌨',d:'Pioggia gelata intensa'},
  71:{i:'❄️',d:'Neve lieve'},73:{i:'❄️',d:'Neve'},75:{i:'❄️',d:'Neve intensa'},77:{i:'🌨',d:'Granelli di neve'},
  80:{i:'🌦',d:'Acquazzoni lievi'},81:{i:'🌧',d:'Acquazzoni'},82:{i:'⛈',d:'Acquazzoni intensi'},
  85:{i:'🌨',d:'Nevicate lievi'},86:{i:'🌨',d:'Nevicate'},
  95:{i:'⛈',d:'Temporale'},96:{i:'⛈',d:'Temporale con grandine'},99:{i:'⛈',d:'Temporale con grandine intensa'},
};

function wmo(code){
  return WMO[code]||WMO[Math.floor(code/10)*10]||{i:'🌡',d:'Variabile'};
}

/* ── STATE ── */
const state = {
  currentLat:null, currentLon:null,
  currentCity:'', currentCountry:'', currentRegion:'',
  weatherData:null, hourlyData:null,
  lastFetch:null,
  deferredPrompt:null,
  cities:[], // [{city,country,region,lat,lon,isPos}]
  cityWeather:{}, // key=lat,lon -> {temp,hi,lo,code,ts}
  activeSheetDay:null,
  activeSheetChart:null,
  activeSheetTab:'temp',
};

/* ── HELPERS ── */
const $=id=>document.getElementById(id);
const fmtTime=iso=>{const d=new Date(iso);return d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})};
const fmtDay=iso=>{
  const d=new Date(iso),n=new Date();
  if(d.toDateString()===n.toDateString())return'Oggi';
  const tm=new Date(n);tm.setDate(tm.getDate()+1);
  if(d.toDateString()===tm.toDateString())return'Domani';
  return d.toLocaleDateString('it-IT',{weekday:'long'}).replace(/^\w/,c=>c.toUpperCase());
};
const fmtFullDate=iso=>{
  const d=new Date(iso);
  return d.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).replace(/^\w/,c=>c.toUpperCase());
};
const degToCompass=deg=>{const dirs=['N','NE','E','SE','S','SO','O','NO'];return dirs[Math.round(deg/45)%8]};
const uvLabel=uv=>{if(uv<=2)return'Basso';if(uv<=5)return'Moderato';if(uv<=7)return'Alto';if(uv<=10)return'Molto alto';return'Estremo'};
const humLabel=h=>{if(h<30)return'Secco';if(h<60)return'Confortevole';if(h<80)return'Umido';return'Molto umido'};
const visLabel=v=>{if(v>=20)return'Eccellente';if(v>=10)return'Buona';if(v>=4)return'Discreta';return'Scarsa'};

/* ── LOCAL STORAGE ── */
const LS_KEY='cielo_cities_v2';
function saveCities(){
  const toSave=state.cities.filter(c=>!c.isPos).map(({city,country,region,lat,lon})=>({city,country,region,lat,lon}));
  localStorage.setItem(LS_KEY,JSON.stringify(toSave));
}
function loadCitiesFromLS(){
  try{return JSON.parse(localStorage.getItem(LS_KEY)||'[]');}catch{return[];}
}

/* ── ANIMATED BACKGROUND ── */
const canvas=$('bg-canvas');
const ctx=canvas.getContext('2d');
let bgAnim=null,bgParticles=[];

function resizeCanvas(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}

function initParticles(){
  bgParticles=[];
  for(let i=0;i<45;i++){
    bgParticles.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*2+0.4,speed:Math.random()*0.35+0.08,opacity:Math.random()*0.45+0.08,drift:(Math.random()-0.5)*0.25});
  }
}

function getBgColors(code,hour){
  const night=hour<6||hour>=20;
  if(night)return['#070d1a','#0c1228','#0f1535'];
  if(code===0)return['#0a1628','#0c2d52','#0f5090'];
  if(code<=2)return['#0d1f3c','#123468','#1a5888'];
  if(code<=3)return['#0e1520','#18222f','#222c3c'];
  if(code>=95)return['#090c12','#111620','#1a1f2e'];
  if(code>=61)return['#0c1420','#142030','#1c2c40'];
  if(code>=71)return['#12181e','#1c2530','#263040'];
  return['#0a1628','#0c2d52','#0f5090'];
}

function getBlobColor(code){
  if(code===0)return'#1a7cff';
  if(code<=2)return'#1060c8';
  if(code<=3)return'#405060';
  if(code>=95)return'#203050';
  if(code>=61)return'#104060';
  if(code>=71)return'#305070';
  return'#1a7cff';
}

function animateBg(code){
  if(bgAnim)cancelAnimationFrame(bgAnim);
  const hour=new Date().getHours();
  const[c1,c2,c3]=getBgColors(code,hour);
  function draw(){
    const g=ctx.createLinearGradient(0,0,0,canvas.height);
    g.addColorStop(0,c1);g.addColorStop(0.5,c2);g.addColorStop(1,c3);
    ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);
    bgParticles.forEach(p=>{
      p.y+=p.speed;p.x+=p.drift;
      if(p.y>canvas.height){p.y=0;p.x=Math.random()*canvas.width;}
      if(p.x<0)p.x=canvas.width;if(p.x>canvas.width)p.x=0;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(255,255,255,${p.opacity})`;ctx.fill();
    });
    bgAnim=requestAnimationFrame(draw);
  }
  draw();
}

/* ── GEOCODING ── */
async function reverseGeocode(lat,lon){
  try{
    const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=it`,{headers:{'Accept-Language':'it'}});
    const d=await r.json();
    const city=d.address?.city||d.address?.town||d.address?.village||d.address?.county||'Posizione';
    return{city,country:(d.address?.country_code||'').toUpperCase(),region:d.address?.state||''};
  }catch{return{city:'La tua posizione',country:'',region:''};}
}

async function searchCity(query){
  const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8&accept-language=it&addressdetails=1`,{headers:{'Accept-Language':'it'}});
  return r.json();
}

/* ── FETCH WEATHER ── */
async function fetchWeather(lat,lon){
  const params=new URLSearchParams({
    latitude:lat,longitude:lon,
    current:['temperature_2m','relative_humidity_2m','apparent_temperature','weather_code','wind_speed_10m','wind_direction_10m','surface_pressure','visibility','uv_index','precipitation'].join(','),
    hourly:['temperature_2m','apparent_temperature','weather_code','precipitation_probability','precipitation'].join(','),
    daily:['weather_code','temperature_2m_max','temperature_2m_min','sunrise','sunset','precipitation_sum','uv_index_max','precipitation_probability_max'].join(','),
    timezone:'auto',forecast_days:7,wind_speed_unit:'kmh',
  });
  const r=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if(!r.ok)throw new Error('Fetch failed');
  return r.json();
}

/* ── CITY LIST MANAGEMENT ── */
function renderCityList(){
  const wrap=$('list-content');
  wrap.innerHTML='';
  state.cities.forEach((c,idx)=>{
    const w=state.cityWeather[`${c.lat},${c.lon}`]||{};
    const blobColor=getBlobColor(w.code||0);
    const isPos=c.isPos;

    const card=document.createElement('div');
    card.className='city-card'+(isPos?' is-pos':'');
    card.dataset.idx=idx;
    card.innerHTML=`
      <div class="cc-blob" style="background:${blobColor}"></div>
      <button class="cc-del" data-idx="${idx}">−</button>
      <div class="cc-inner">
        <div class="cc-top">
          <div>
            <div class="cc-city">
              ${isPos?'<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/><circle cx="6" cy="6" r="2" fill="rgba(255,255,255,0.7)"/></svg>':''}
              ${c.city}
            </div>
            ${isPos?`<div class="cc-pos-label">La mia posizione</div>`:`<div class="cc-pos-label">${[c.region,c.country].filter(Boolean).join(', ')}</div>`}
          </div>
          <div class="cc-temp">${w.temp!=null?Math.round(w.temp)+'°':'—'}</div>
        </div>
        <div class="cc-bottom">
          <div class="cc-desc">${w.code!=null?wmo(w.code).i+' '+wmo(w.code).d:'—'}</div>
          <div class="cc-range">${w.hi!=null?'Max: '+Math.round(w.hi)+'° Min: '+Math.round(w.lo)+'°':''}</div>
        </div>
      </div>
    `;

    // Click to open detail
    card.addEventListener('click',e=>{
      if(document.body.classList.contains('editing'))return;
      if(e.target.closest('.cc-del'))return;
      openDetailForCity(c);
    });
    wrap.appendChild(card);
  });

  // Delete buttons
  wrap.querySelectorAll('.cc-del').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const idx=parseInt(btn.dataset.idx);
      if(state.cities[idx]?.isPos)return; // Can't delete position
      state.cities.splice(idx,1);
      saveCities();
      renderCityList();
    });
  });
}

async function loadAllCityWeather(){
  const promises=state.cities.map(async c=>{
    try{
      const key=`${c.lat},${c.lon}`;
      // Check cache (5 min)
      if(state.cityWeather[key]&&Date.now()-state.cityWeather[key].ts<5*60*1000)return;
      const params=new URLSearchParams({
        latitude:c.lat,longitude:c.lon,
        current:['temperature_2m','weather_code'].join(','),
        daily:['temperature_2m_max','temperature_2m_min','weather_code'].join(','),
        timezone:'auto',forecast_days:1,
      });
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      const d=await r.json();
      state.cityWeather[key]={
        temp:d.current.temperature_2m,
        code:d.current.weather_code,
        hi:d.daily.temperature_2m_max[0],
        lo:d.daily.temperature_2m_min[0],
        ts:Date.now(),
      };
    }catch{}
  });
  await Promise.allSettled(promises);
  renderCityList();
}

/* ── OPEN DETAIL FOR CITY ── */
async function openDetailForCity(c){
  state.currentLat=c.lat;
  state.currentLon=c.lon;
  state.currentCity=c.city;
  state.currentCountry=c.country;
  state.currentRegion=c.region;
  showView('detail');
  setLoading('Caricamento meteo…');
  try{
    const data=await fetchWeather(c.lat,c.lon);
    state.weatherData=data;
    state.hourlyData=data.hourly;
    state.lastFetch=Date.now();
    renderDetail(data);
    hideLoading();
  }catch{
    setLoading('Errore di rete :(');
    setTimeout(hideLoading,3000);
  }
}

/* ── SHOW VIEW ── */
function showView(name){
  $('view-list').classList.toggle('hidden',name!=='list');
  $('view-detail').classList.toggle('hidden',name!=='detail');
}

/* ── RENDER DETAIL ── */
function renderDetail(data){
  const c=data.current,d=data.daily,h=data.hourly;
  const w=wmo(c.weather_code);
  animateBg(c.weather_code);

  $('d-city').textContent=state.currentCity;
  $('d-sub').textContent=[state.currentRegion,state.currentCountry].filter(Boolean).join(' · ');
  $('d-temp').textContent=Math.round(c.temperature_2m);
  $('d-desc').textContent=w.i+' '+w.d;
  $('d-range').textContent=`Max ${Math.round(d.temperature_2m_max[0])}° · Min ${Math.round(d.temperature_2m_min[0])}°`;

  $('stat-humidity').innerHTML=`${c.relative_humidity_2m}<span class="stat-unit">%</span>`;
  $('stat-hum-sub').textContent=humLabel(c.relative_humidity_2m);
  $('stat-wind').innerHTML=`${Math.round(c.wind_speed_10m)}<span class="stat-unit"> km/h</span>`;
  $('stat-wind-dir').textContent=degToCompass(c.wind_direction_10m);
  const vk=(c.visibility/1000).toFixed(1);
  $('stat-vis').innerHTML=`${vk}<span class="stat-unit"> km</span>`;
  $('stat-vis-sub').textContent=visLabel(c.visibility/1000);
  $('stat-feels').innerHTML=`${Math.round(c.apparent_temperature)}<span class="stat-unit">°</span>`;
  $('stat-feels-sub').textContent=c.apparent_temperature<c.temperature_2m?'Percepito più freddo':'Percepito più caldo';
  const uv=Math.round(c.uv_index);
  $('stat-uv').textContent=uv;
  $('stat-uv-lbl').textContent=uvLabel(uv);
  $('uv-dot').style.left=`${Math.min((uv/12)*100,100)}%`;
  $('stat-sunrise').textContent=fmtTime(d.sunrise[0]);
  $('stat-sunset').textContent=fmtTime(d.sunset[0]);
  $('stat-precip').innerHTML=`${c.precipitation.toFixed(1)}<span class="stat-unit"> mm</span>`;
  $('stat-precip-sub').textContent=`Oggi: ${d.precipitation_sum[0].toFixed(1)} mm`;
  $('stat-pressure').innerHTML=`${Math.round(c.surface_pressure)}<span class="stat-unit" style="font-size:10px"> hPa</span>`;
  $('stat-pressure-sub').textContent=c.surface_pressure>1013?'Alta pressione':'Bassa pressione';
  $('last-updated').textContent=new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});

  renderHourly(h);
  renderWeekly(d);
  setTimeout(fixHourlyScroll,50);
}

function renderHourly(h){
  const now=new Date(),wrap=$('hourly-scroll');
  wrap.innerHTML='';
  let si=h.time.findIndex(t=>new Date(t)>=now);
  if(si<0)si=0;
  for(let i=si;i<Math.min(si+24,h.time.length);i++){
    const t=new Date(h.time[i]),isNow=i===si,w=wmo(h.weather_code[i]),pr=h.precipitation_probability[i];
    const el=document.createElement('div');
    el.className='hour-item'+(isNow?' now':'');
    el.innerHTML=`<div class="hour-time">${isNow?'Ora':t.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</div><div class="hour-icon">${w.i}</div><div class="hour-temp">${Math.round(h.temperature_2m[i])}°</div>${pr>0?`<div class="hour-precip">${pr}%</div>`:''}`;
    wrap.appendChild(el);
  }
}

function renderWeekly(d){
  const wrap=$('weekly-table');
  wrap.innerHTML='';
  const allMax=d.temperature_2m_max,allMin=d.temperature_2m_min;
  const gMin=Math.min(...allMin),gMax=Math.max(...allMax),range=gMax-gMin||1;
  for(let i=0;i<7;i++){
    const w=wmo(d.weather_code[i]);
    const hi=Math.round(allMax[i]),lo=Math.round(allMin[i]);
    const bL=((allMin[i]-gMin)/range)*100,bW=((allMax[i]-allMin[i])/range)*100;
    const row=document.createElement('div');
    row.className='day-row';
    row.dataset.dayIdx=i;
    row.innerHTML=`<div class="day-name">${fmtDay(d.time[i])}</div><div class="day-icon">${w.i}</div><div class="day-bar-wrap"><div class="day-bar-track"></div><div class="day-bar-fill" style="left:${bL}%;width:${bW}%"></div></div><div class="day-temps"><span class="day-lo">${lo}°</span><span class="day-hi">${hi}°</span></div>`;
    row.addEventListener('click',()=>openDaySheet(i));
    wrap.appendChild(row);
  }
}

/* ════════════════════════════════════════════
   DAY DETAIL SHEET
════════════════════════════════════════════ */
function openDaySheet(dayIdx){
  const data=state.weatherData;
  if(!data)return;
  const d=data.daily,h=data.hourly;
  const dayDate=d.time[dayIdx];
  const w=wmo(d.weather_code[dayIdx]);

  state.activeSheetDay=dayIdx;

  // Header
  $('sheet-icon').textContent=w.i;
  $('sheet-day-name').textContent=fmtDay(dayDate);
  $('sheet-full-date').textContent=fmtFullDate(dayDate);

  // Hero temps
  const hi=Math.round(d.temperature_2m_max[dayIdx]);
  const lo=Math.round(d.temperature_2m_min[dayIdx]);
  $('sh-big-temp').textContent=`${hi}°`;
  $('sh-desc').textContent=w.d;
  $('sh-max').textContent=`Max: ${hi}°`;
  $('sh-min').textContent=`Min: ${lo}°`;

  // Mini stats
  const uv=d.uv_index_max[dayIdx];
  $('sm-uv').textContent=uv!=null?Math.round(uv):'—';
  $('sm-uv-lbl').textContent=uv!=null?uvLabel(uv):'';
  $('sm-sun').textContent=`${fmtTime(d.sunrise[dayIdx])} / ${fmtTime(d.sunset[dayIdx])}`;
  $('sm-precip').textContent=`${d.precipitation_sum[dayIdx].toFixed(1)} mm`;
  $('sm-precip-sub').textContent='Precipitazioni totali';
  $('sm-prob').textContent=`${d.precipitation_probability_max[dayIdx]}%`;

  // Summary text
  const summaryParts=[];
  summaryParts.push(`<strong>${fmtDay(dayDate)}</strong> le temperature varieranno da <strong>${lo}°</strong> a <strong>${hi}°</strong>.`);
  const prob=d.precipitation_probability_max[dayIdx];
  if(prob>=70)summaryParts.push(`Alta probabilità di pioggia (<strong>${prob}%</strong>) con ${d.precipitation_sum[dayIdx].toFixed(1)} mm previsti.`);
  else if(prob>=30)summaryParts.push(`Probabilità di precipitazioni moderata (<strong>${prob}%</strong>).`);
  else summaryParts.push('Precipitazioni improbabili.');
  if(uv>=8)summaryParts.push(`Indice UV molto alto (<strong>${Math.round(uv)}</strong>): usa protezione solare.`);
  $('sh-summary').innerHTML=summaryParts.join(' ');

  // Reset tab
  state.activeSheetTab='temp';
  document.querySelectorAll('.sh-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab==='temp'));

  // Draw chart
  drawSheetChart('temp',dayIdx);

  // Open
  $('sheet-backdrop').classList.add('open');
  $('day-sheet').classList.add('open');

  // Swipe to close
  setupSheetSwipe();
}

function closeDaySheet(){
  $('sheet-backdrop').classList.remove('open');
  $('day-sheet').classList.remove('open');
  if(state.activeSheetChart){state.activeSheetChart.destroy();state.activeSheetChart=null;}
}

function drawSheetChart(tab,dayIdx){
  const data=state.weatherData;
  if(!data)return;
  const h=data.hourly;
  const dayDate=data.daily.time[dayIdx];

  // Filter hourly data for this day
  const indices=[];
  h.time.forEach((t,i)=>{if(t.startsWith(dayDate))indices.push(i);});

  const labels=indices.map(i=>{
    const d=new Date(h.time[i]);
    return d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  });

  if(state.activeSheetChart){state.activeSheetChart.destroy();state.activeSheetChart=null;}

  const canvas=$('sheet-chart');
  const ct=canvas.getContext('2d');

  Chart.defaults.color='rgba(255,255,255,0.5)';
  Chart.defaults.borderColor='rgba(255,255,255,0.08)';

  if(tab==='temp'){
    $('chart-note').textContent='Temperatura reale (bianco) e percepita (blu) nell\'arco della giornata';
    const realTemps=indices.map(i=>h.temperature_2m[i]);
    const feelTemps=indices.map(i=>h.apparent_temperature[i]);

    const gradReal=ct.createLinearGradient(0,0,0,160);
    gradReal.addColorStop(0,'rgba(255,255,255,0.22)');
    gradReal.addColorStop(1,'rgba(255,255,255,0.02)');
    const gradFeel=ct.createLinearGradient(0,0,0,160);
    gradFeel.addColorStop(0,'rgba(76,201,255,0.22)');
    gradFeel.addColorStop(1,'rgba(76,201,255,0.02)');

    state.activeSheetChart=new Chart(canvas,{
      type:'line',
      data:{
        labels,
        datasets:[
          {label:'Reale',data:realTemps,borderColor:'rgba(255,255,255,0.9)',backgroundColor:gradReal,borderWidth:2,pointRadius:0,pointHoverRadius:4,fill:true,tension:0.4},
          {label:'Percepita',data:feelTemps,borderColor:'rgba(76,201,255,0.85)',backgroundColor:gradFeel,borderWidth:2,pointRadius:0,pointHoverRadius:4,fill:true,tension:0.4},
        ],
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:{duration:400},
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:true,position:'top',align:'end',labels:{font:{size:11,family:'Figtree'},boxWidth:10,boxHeight:2,padding:12,color:'rgba(255,255,255,0.6)'}},
          tooltip:{backgroundColor:'rgba(15,25,40,0.9)',titleColor:'white',bodyColor:'rgba(255,255,255,0.7)',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,padding:10,cornerRadius:10,callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.raw?.toFixed(1)}°C`}},
        },
        scales:{
          x:{grid:{display:false},ticks:{font:{size:11},maxTicksLimit:6}},
          y:{grid:{color:'rgba(255,255,255,0.06)'},ticks:{font:{size:11},callback:v=>`${v}°`}},
        },
      },
    });
  } else {
    $('chart-note').textContent='Probabilità di pioggia (%) e precipitazioni (mm) nell\'arco della giornata';
    const probs=indices.map(i=>h.precipitation_probability[i]);
    const precips=indices.map(i=>(h.precipitation[i]||0));

    const gradProb=ct.createLinearGradient(0,0,0,160);
    gradProb.addColorStop(0,'rgba(76,201,255,0.30)');
    gradProb.addColorStop(1,'rgba(76,201,255,0.02)');

    state.activeSheetChart=new Chart(canvas,{
      type:'bar',
      data:{
        labels,
        datasets:[
          {label:'Prob. pioggia %',data:probs,backgroundColor:'rgba(76,201,255,0.55)',borderColor:'rgba(76,201,255,0.85)',borderWidth:1,borderRadius:4,yAxisID:'y'},
          {label:'mm',data:precips,type:'line',borderColor:'rgba(255,200,80,0.9)',backgroundColor:'transparent',borderWidth:2,pointRadius:0,tension:0.4,yAxisID:'y2'},
        ],
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:{duration:400},
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:true,position:'top',align:'end',labels:{font:{size:11,family:'Figtree'},boxWidth:10,boxHeight:2,padding:12,color:'rgba(255,255,255,0.6)'}},
          tooltip:{backgroundColor:'rgba(15,25,40,0.9)',titleColor:'white',bodyColor:'rgba(255,255,255,0.7)',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,padding:10,cornerRadius:10},
        },
        scales:{
          x:{grid:{display:false},ticks:{font:{size:11},maxTicksLimit:6}},
          y:{grid:{color:'rgba(255,255,255,0.06)'},ticks:{font:{size:11},callback:v=>`${v}%`},max:100,min:0},
          y2:{position:'right',grid:{display:false},ticks:{font:{size:11},callback:v=>`${v}mm`}},
        },
      },
    });
  }
}

// Swipe down to close sheet
function setupSheetSwipe(){
  const sheet=$('day-sheet');
  let startY=0,isDragging=false,currentY=0;

  const onStart=e=>{startY=(e.touches||[e])[0].clientY;isDragging=true;currentY=0;sheet.style.transition='none'};
  const onMove=e=>{
    if(!isDragging)return;
    const dy=(e.touches||[e])[0].clientY-startY;
    if(dy<0)return;
    currentY=dy;
    sheet.style.transform=`translateY(${dy}px)`;
  };
  const onEnd=()=>{
    isDragging=false;
    sheet.style.transition='';
    sheet.style.transform='';
    if(currentY>120)closeDaySheet();
  };

  sheet.addEventListener('touchstart',onStart,{passive:true});
  sheet.addEventListener('touchmove',onMove,{passive:true});
  sheet.addEventListener('touchend',onEnd,{passive:true});
}

/* ── SHEET TABS ── */
document.querySelectorAll('.sh-tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const tab=btn.dataset.tab;
    state.activeSheetTab=tab;
    document.querySelectorAll('.sh-tab').forEach(t=>t.classList.toggle('active',t===btn));
    if(state.activeSheetDay!=null)drawSheetChart(tab,state.activeSheetDay);
  });
});

$('sheet-close-btn').addEventListener('click',closeDaySheet);
$('sheet-backdrop').addEventListener('click',closeDaySheet);

/* ── GEOLOCATION ── */
function getPosition(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error('no geo'));return;}
    navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:12000,maximumAge:60000,enableHighAccuracy:false});
  });
}

async function initApp(){
  setLoading('Rilevamento posizione…');
  resizeCanvas();initParticles();animateBg(0);

  // Load saved cities from localStorage
  const saved=loadCitiesFromLS();

  // Try geolocation
  let posCity=null;
  try{
    const pos=await getPosition();
    setLoading('Recupero città…');
    const geo=await reverseGeocode(pos.coords.latitude,pos.coords.longitude);
    posCity={city:geo.city,country:geo.country,region:geo.region,lat:pos.coords.latitude,lon:pos.coords.longitude,isPos:true};
  }catch{
    // Fallback
    posCity={city:'Milano',country:'IT',region:'Lombardia',lat:45.4642,lon:9.1900,isPos:true};
  }

  // Build full list: position first, then saved cities
  state.cities=[posCity,...saved];

  // Show list view
  showView('list');
  hideLoading();

  // Load weather for all cities
  await loadAllCityWeather();

  // Auto-open first city detail
  openDetailForCity(posCity);
}

/* ── LOADING UI ── */
function setLoading(msg){$('loading-text').textContent=msg;$('loading').classList.remove('hidden');}
function hideLoading(){$('loading').classList.add('hidden');}

/* ── BACK BUTTON ── */
$('btn-back').addEventListener('click',()=>{
  closeDaySheet();
  showView('list');
  animateBg(0);
  loadAllCityWeather(); // refresh cards
});

/* ── EDIT MODE ── */
$('btn-edit').addEventListener('click',()=>{
  const editing=document.body.classList.toggle('editing');
  $('btn-edit').textContent=editing?'✅':'✏️';
});

/* ── SEARCH ── */
let searchTimeout=null;
$('btn-open-search').addEventListener('click',()=>{
  $('search-bg').classList.add('open');
  $('search-modal').classList.add('open');
  setTimeout(()=>$('search-input').focus(),200);
});
$('search-cancel').addEventListener('click',closeSearch);
function closeSearch(){
  $('search-bg').classList.remove('open');
  $('search-modal').classList.remove('open');
  $('search-input').value='';
  $('search-results').innerHTML='';
}
$('search-input').addEventListener('input',e=>{
  clearTimeout(searchTimeout);
  const q=e.target.value.trim();
  if(q.length<2){$('search-results').innerHTML='';return;}
  searchTimeout=setTimeout(()=>doSearch(q),400);
});

async function doSearch(q){
  $('search-results').innerHTML='<div style="padding:16px;color:rgba(255,255,255,0.5);font-size:15px">Ricerca in corso…</div>';
  try{
    const results=await searchCity(q);
    if(!results.length){$('search-results').innerHTML='<div style="padding:16px;color:rgba(255,255,255,0.5);font-size:15px">Nessun risultato</div>';return;}
    $('search-results').innerHTML='';
    results.forEach(r=>{
      const city=r.address?.city||r.address?.town||r.address?.village||r.name;
      const country=(r.address?.country_code||'').toUpperCase();
      const region=r.address?.state||'';
      const el=document.createElement('div');
      el.className='sr-item';
      el.innerHTML=`<div class="sr-city">${city}</div><div class="sr-country">${[region,country].filter(Boolean).join(', ')}</div>`;
      el.addEventListener('click',()=>{
        // Check if already in list
        const exists=state.cities.find(c=>c.city===city&&c.country===country);
        if(!exists){
          const newCity={city,country,region,lat:parseFloat(r.lat),lon:parseFloat(r.lon),isPos:false};
          state.cities.push(newCity);
          saveCities();
        }
        closeSearch();
        document.body.classList.remove('editing');
        $('btn-edit').textContent='✏️';
        renderCityList();
        // Open detail
        const target=state.cities.find(c=>c.city===city&&c.country===country)||{city,country,region,lat:parseFloat(r.lat),lon:parseFloat(r.lon)};
        openDetailForCity(target);
      });
      $('search-results').appendChild(el);
    });
  }catch{
    $('search-results').innerHTML='<div style="padding:16px;color:#ff453a;font-size:15px">Errore di ricerca</div>';
  }
}

/* ── MAP ── */
function openMap(){
  const lat=state.currentLat||45.4642,lon=state.currentLon||9.19;
  $('map-iframe').src=`https://www.openstreetmap.org/export/embed.html?bbox=${lon-0.1},${lat-0.1},${lon+0.1},${lat+0.1}&layer=mapnik&marker=${lat},${lon}`;
  $('map-bg').classList.add('open');
  $('map-modal').classList.add('open');
}
function closeMap(){$('map-bg').classList.remove('open');$('map-modal').classList.remove('open');}
$('btn-map-fab').addEventListener('click',openMap);
$('map-close-btn').addEventListener('click',closeMap);
$('map-bg').addEventListener('click',closeMap);

/* ── PWA INSTALL ── */

function showInstallButton(){
  $('btn-install-hdr').classList.add('visible');
}
function hideInstallButton(){
  $('btn-install-hdr').classList.remove('visible');
  $('install-banner').classList.remove('show');
}

async function triggerInstall(){
  if(!state.deferredPrompt)return;
  state.deferredPrompt.prompt();
  const {outcome}=await state.deferredPrompt.userChoice;
  state.deferredPrompt=null;
  if(outcome==='accepted')hideInstallButton();
}

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  state.deferredPrompt=e;
  showInstallButton();
  // Also show banner after 4s (mobile)
  setTimeout(()=>$('install-banner').classList.add('show'),4000);
});

// If already installed as PWA, hide buttons
window.addEventListener('appinstalled',()=>{
  state.deferredPrompt=null;
  hideInstallButton();
});

// Wire all install buttons to same handler
$('btn-install-hdr').addEventListener('click',triggerInstall);
$('inst-btn').addEventListener('click',triggerInstall);
$('inst-x').addEventListener('click',()=>$('install-banner').classList.remove('show'));

/* ── SERVICE WORKER ── */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

/* ── PTR (Pull to refresh) — soglia alta, no conflitti ── */
const detailScroll=$('detail-scroll');
let ptrStartY=0,ptrStartX=0,ptrActive=false,ptrIntent=null; // intent: 'v'|'h'|null

detailScroll.addEventListener('touchstart',e=>{
  if(detailScroll.scrollTop===0){
    ptrStartY=e.touches[0].clientY;
    ptrStartX=e.touches[0].clientX;
    ptrIntent=null;
  }
},{passive:true});

detailScroll.addEventListener('touchmove',e=>{
  if(detailScroll.scrollTop>0){ptrIntent=null;return;}
  const dy=e.touches[0].clientY-ptrStartY;
  const dx=Math.abs(e.touches[0].clientX-ptrStartX);

  // Determine intent from first significant movement
  if(!ptrIntent){
    if(dx>8)ptrIntent='h';         // horizontal → cancel PTR
    else if(dy>6)ptrIntent='v';    // vertical → might PTR
  }

  // If horizontal gesture detected, do NOT activate PTR
  if(ptrIntent==='h'){ptrActive=false;return;}

  // Vertical: need 110px threshold to activate (was 65, too easy)
  if(ptrIntent==='v'&&!ptrActive&&dy>110){
    ptrActive=true;
    $('ptr-ind').classList.add('show');
  }
},{passive:true});

detailScroll.addEventListener('touchend',()=>{
  if(ptrActive){
    ptrActive=false;
    ptrIntent=null;
    $('ptr-ind').classList.remove('show');
    if(state.currentLat)openDetailForCity({
      city:state.currentCity,country:state.currentCountry,
      region:state.currentRegion,lat:state.currentLat,lon:state.currentLon
    });
  }
  ptrIntent=null;
},{passive:true});

/* ── HOURLY SCROLL — fix touch conflict ── */
// Prevent the parent vertical scroll from stealing horizontal swipe on hourly strip
function fixHourlyScroll(){
  const strip=$('hourly-scroll');
  if(!strip)return;
  let hStartX=0,hStartY=0,hScrolling=null;

  strip.addEventListener('touchstart',e=>{
    hStartX=e.touches[0].clientX;
    hStartY=e.touches[0].clientY;
    hScrolling=null;
  },{passive:true});

  strip.addEventListener('touchmove',e=>{
    const dx=Math.abs(e.touches[0].clientX-hStartX);
    const dy=Math.abs(e.touches[0].clientY-hStartY);
    if(hScrolling===null){
      hScrolling=dx>dy?'h':'v'; // first movement decides
    }
    if(hScrolling==='h'){
      // Prevent parent from scrolling vertically
      e.stopPropagation();
    }
  },{passive:true});
}

/* ── AUTO REFRESH ── */
setInterval(()=>{
  if(state.lastFetch&&Date.now()-state.lastFetch>10*60*1000&&state.currentLat)
    openDetailForCity({city:state.currentCity,country:state.currentCountry,region:state.currentRegion,lat:state.currentLat,lon:state.currentLon});
},60000);

window.addEventListener('resize',resizeCanvas);

/* ── START ── */
initApp();
