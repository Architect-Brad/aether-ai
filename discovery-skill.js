/**
 * ████████████████████████████████████████████████████████████████████████████
 *
 *   AETHER DISCOVERY SKILL  —  v1.2.0
 *   Single-file browser-native search, images, maps, and weather engine.
 *
 *   Search  :  Tavily → Serper → Brave  (priority fallback chain)
 *   News    :  Brave → Serper → Tavily (v1.2)
 *   Images  :  Masonry grid + lightbox + lazy load + download
 *   Maps    :  Leaflet + CartoDB tiles (free, no API key)
 *   Weather :  Open-Meteo (free, no key) + OpenWeatherMap fallback
 *   v1.3    :  soft parse + model repair retry · host key sync · Kernel logs
 *
 *   Usage:
 *     import DiscoverySkill, { KeyStore } from './discovery-skill.js'
 *     KeyStore.set('tavily', 'tvly-...')  // or sync from AETHER hooks
 *     const spec = DiscoverySkill.extractSpec(llmResponse)
 *     await DiscoverySkill.execute(spec, container)
 *
 * ████████████████████████████████████████████████████████████████████████████
 */

// ═══════════════════════════════════════════════════════════════════════════════
// §1  KEY STORE
// ═══════════════════════════════════════════════════════════════════════════════

export class KeyStore {
  static _k={};
  static set(p,k)  { this._k[p]=k; try{localStorage.setItem(`aether_key_${p}`,k);}catch{} }
  static get(p)    {
    if (this._k[p]) return this._k[p];
    try {
      // Prefer host-synced keys; never invent plaintext from encrypted vaults
      const v = localStorage.getItem(`aether_key_${p}`)
        || localStorage.getItem(`aether_hook_${p}`)
        || localStorage.getItem(p);
      if (v) this._k[p] = v;
      return v || null;
    } catch { return null; }
  }
  static has(p)    { return !!this.get(p); }
  static available(){ return ['tavily','serper','brave','openweather'].filter(p=>this.has(p)); }
  /** Pull keys from AETHER host (hooksConfig / skill-utils) */
  static syncFromHost() {
    try {
      if (typeof globalThis !== 'undefined' && globalThis.AETHER_SkillUtils?.syncKeysFromHost) {
        globalThis.AETHER_SkillUtils.syncKeysFromHost(KeyStore);
      } else if (typeof window !== 'undefined' && window.AETHER_SkillUtils?.syncKeysFromHost) {
        window.AETHER_SkillUtils.syncKeysFromHost(KeyStore);
      }
      const hooks = (typeof window !== 'undefined' && (window.hooksConfig || window.__AETHER_HOOKS)) || null;
      if (hooks) {
        if (hooks.tavily) KeyStore.set('tavily', hooks.tavily);
        if (hooks.serper) KeyStore.set('serper', hooks.serper);
        if (hooks.brave) KeyStore.set('brave', hooks.brave);
        if (hooks.openweather || hooks.openWeather) KeyStore.set('openweather', hooks.openweather || hooks.openWeather);
      }
    } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// §1.5  RESPONSE CACHE  (localStorage with TTL)
// ═══════════════════════════════════════════════════════════════════════════════

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes default

export const cache = {
  _prefix: 'aether_cache_',
  get(key) {
    try {
      const raw = localStorage.getItem(this._prefix + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() > entry.expires) { localStorage.removeItem(this._prefix + key); return null; }
      return entry.data;
    } catch { return null; }
  },
  set(key, data, ttl = CACHE_TTL) {
    try {
      localStorage.setItem(this._prefix + key, JSON.stringify({ data, expires: Date.now() + ttl }));
    } catch {}
  },
  clear() {
    try {
      Object.keys(localStorage).filter(k => k.startsWith(this._prefix)).forEach(k => localStorage.removeItem(k));
    } catch {}
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// §2  SEARCH ENGINE  (Tavily → Serper → Brave)
// ═══════════════════════════════════════════════════════════════════════════════

async function _withFallback(fns, label) {
  const errs=[];
  for(const fn of fns) { try{ return await fn(); } catch(e){ errs.push(e.message); } }
  throw new Error(`All ${label} providers failed: ${errs.join(' | ')}`);
}

async function _tavilySearch(query,opts={}) {
  const key=KeyStore.get('tavily'); if(!key) throw new Error('No Tavily key');
  const r=await fetch('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:key,query,search_depth:opts.depth||'basic',include_images:opts.images!==false,include_answer:true,max_results:opts.limit||8})});
  if(!r.ok) throw new Error(`Tavily ${r.status}`);
  const d=await r.json();
  return {provider:'tavily',query,answer:d.answer||null,results:(d.results||[]).map(i=>({title:i.title,url:i.url,snippet:i.content,score:i.score})),images:(d.images||[]).map(url=>({url,title:'',source:''}))};
}

async function _tavilyImages(query,opts={}) {
  const r=await _tavilySearch(query,{...opts,images:true,limit:opts.limit||12});
  return r.images.map(img=>({...img,provider:'tavily'}));
}

async function _serperSearch(query,opts={}) {
  const key=KeyStore.get('serper'); if(!key) throw new Error('No Serper key');
  const r=await fetch('https://google.serper.dev/search',{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({q:query,num:opts.limit||8})});
  if(!r.ok) throw new Error(`Serper ${r.status}`);
  const d=await r.json();
  return {provider:'serper',query,answer:d.answerBox?.answer||d.answerBox?.snippet||null,results:(d.organic||[]).map(i=>({title:i.title,url:i.link,snippet:i.snippet,score:null})),images:[]};
}

async function _serperImages(query,opts={}) {
  const key=KeyStore.get('serper'); if(!key) throw new Error('No Serper key');
  const r=await fetch('https://google.serper.dev/images',{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({q:query,num:opts.limit||12})});
  if(!r.ok) throw new Error(`Serper images ${r.status}`);
  const d=await r.json();
  return (d.images||[]).map(img=>({url:img.imageUrl,thumb:img.thumbnailUrl,title:img.title,source:img.link,width:img.imageWidth,height:img.imageHeight,provider:'serper'}));
}

async function _serperPlaces(query,opts={}) {
  const key=KeyStore.get('serper'); if(!key) throw new Error('No Serper key');
  const r=await fetch('https://google.serper.dev/places',{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({q:query,num:opts.limit||8})});
  if(!r.ok) throw new Error(`Serper places ${r.status}`);
  const d=await r.json();
  return (d.places||[]).map(p=>({name:p.title,address:p.address,rating:p.rating,reviews:p.ratingCount,type:p.type,phone:p.phoneNumber,website:p.website,lat:p.latitude,lng:p.longitude,provider:'serper'}));
}

async function _braveSearch(query,opts={}) {
  const key=KeyStore.get('brave'); if(!key) throw new Error('No Brave key');
  const params=new URLSearchParams({q:query,count:opts.limit||8,search_lang:opts.lang||'en'});
  const r=await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`,{headers:{'Accept':'application/json','X-Subscription-Token':key}});
  if(!r.ok) throw new Error(`Brave ${r.status}`);
  const d=await r.json();
  return {provider:'brave',query,answer:d.summarizer?.summary?.[0]?.text||null,results:(d.web?.results||[]).map(i=>({title:i.title,url:i.url,snippet:i.description,score:null})),images:(d.images?.results||[]).map(img=>({url:img.url,thumb:img.thumbnail?.src,title:img.title,source:img.source,provider:'brave'}))};
}

async function _braveImages(query,opts={}) {
  const key=KeyStore.get('brave'); if(!key) throw new Error('No Brave key');
  const params=new URLSearchParams({q:query,count:opts.limit||12});
  const r=await fetch(`https://api.search.brave.com/res/v1/images/search?${params}`,{headers:{'Accept':'application/json','X-Subscription-Token':key}});
  if(!r.ok) throw new Error(`Brave images ${r.status}`);
  const d=await r.json();
  return (d.results||[]).map(img=>({url:img.url,thumb:img.thumbnail?.src,title:img.title,source:img.source,width:img.properties?.width,height:img.properties?.height,provider:'brave'}));
}

async function _braveNews(query, opts = {}) {
  const key = KeyStore.get('brave');
  if (!key) throw new Error('No Brave key');
  const params = new URLSearchParams({ q: query, count: opts.limit || 8, search_lang: opts.lang || 'en', freshness: opts.freshness || 'day' });
  const r = await fetch(`https://api.search.brave.com/res/v1/news/search?${params}`, { headers: { 'Accept': 'application/json', 'X-Subscription-Token': key } });
  if (!r.ok) throw new Error(`Brave news ${r.status}`);
  const d = await r.json();
  return { provider: 'brave-news', query, results: (d.results || []).map(i => ({ title: i.title, url: i.url, snippet: i.description, source: i.source, published: i.age, thumbnail: i.thumbnail?.src, provider: 'brave-news' })) };
}

/** Serper news fallback (Google News via Serper) */
async function _serperNews(query, opts = {}) {
  const key = KeyStore.get('serper'); if (!key) throw new Error('No Serper key');
  const r = await fetch('https://google.serper.dev/news', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: opts.limit || 8 }),
  });
  if (!r.ok) throw new Error(`Serper news ${r.status}`);
  const d = await r.json();
  return {
    provider: 'serper-news',
    query,
    results: (d.news || []).map(i => ({
      title: i.title, url: i.link, snippet: i.snippet, source: i.source,
      published: i.date, thumbnail: i.imageUrl, provider: 'serper-news',
    })),
  };
}

/** Tavily as last-resort news (web search biased to recent) */
async function _tavilyNews(query, opts = {}) {
  const key = KeyStore.get('tavily'); if (!key) throw new Error('No Tavily key');
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query: query + ' news',
      search_depth: opts.depth || 'basic',
      topic: 'news',
      max_results: opts.limit || 8,
      include_answer: true,
    }),
  });
  if (!r.ok) throw new Error(`Tavily news ${r.status}`);
  const d = await r.json();
  return {
    provider: 'tavily-news',
    query,
    answer: d.answer || null,
    results: (d.results || []).map(i => ({
      title: i.title, url: i.url, snippet: i.content, source: i.url,
      published: i.published_date, provider: 'tavily-news',
    })),
  };
}

async function _cachedSearch(fn, cacheKey, query, opts) {
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const result = await fn(query, opts);
  cache.set(cacheKey, result);
  return result;
}

export const webSearch = (q, o = {}) => { KeyStore.syncFromHost(); return _cachedSearch(() => _withFallback([() => _tavilySearch(q, o), () => _serperSearch(q, o), () => _braveSearch(q, o)], 'web search'), 'web_' + q + '_' + (o.limit || 8), q, o); };
export const imageSearch = (q, o = {}) => { KeyStore.syncFromHost(); return _cachedSearch(() => _withFallback([() => _tavilyImages(q, o), () => _serperImages(q, o), () => _braveImages(q, o)], 'image search'), 'img_' + q + '_' + (o.limit || 12), q, o); };
export const newsSearch = (q, o = {}) => { KeyStore.syncFromHost(); return _cachedSearch(() => _withFallback([() => _braveNews(q, o), () => _serperNews(q, o), () => _tavilyNews(q, o)], 'news search'), 'news_' + q + '_' + (o.limit || 8), q, o); };
export const placeSearch = (q, o = {}) => { KeyStore.syncFromHost(); return _cachedSearch(() => _withFallback([() => _serperPlaces(q, o), async () => { const r = await _braveSearch(`${q} location address`, o); return r.results.slice(0, 5).map(i => ({ name: i.title, address: i.snippet?.match(/\d+[^,]+,[^,]+/)?.[0] || '', rating: null, reviews: null, lat: null, lng: null, provider: 'brave-fallback' })); }], 'place search'), 'plc_' + q + '_' + (o.limit || 8), q, o); };

// ═══════════════════════════════════════════════════════════════════════════════
// §3  WEATHER ENGINE  (Open-Meteo primary, OpenWeatherMap fallback)
// ═══════════════════════════════════════════════════════════════════════════════

const WMO={0:{label:'Clear Sky',icon:'☀️',bg:['F9A825','FFD54F']},1:{label:'Mainly Clear',icon:'🌤️',bg:['F9A825','FFE082']},2:{label:'Partly Cloudy',icon:'⛅',bg:['78909C','B0BEC5']},3:{label:'Overcast',icon:'☁️',bg:['546E7A','90A4AE']},45:{label:'Foggy',icon:'🌫️',bg:['78909C','CFD8DC']},48:{label:'Icy Fog',icon:'🌫️',bg:['78909C','CFD8DC']},51:{label:'Light Drizzle',icon:'🌦️',bg:['1565C0','42A5F5']},53:{label:'Drizzle',icon:'🌦️',bg:['1565C0','42A5F5']},55:{label:'Heavy Drizzle',icon:'🌧️',bg:['0D47A1','1E88E5']},61:{label:'Light Rain',icon:'🌧️',bg:['1565C0','42A5F5']},63:{label:'Rain',icon:'🌧️',bg:['0D47A1','1E88E5']},65:{label:'Heavy Rain',icon:'⛈️',bg:['0D47A1','1565C0']},71:{label:'Light Snow',icon:'🌨️',bg:['37474F','90A4AE']},73:{label:'Snow',icon:'❄️',bg:['263238','78909C']},75:{label:'Heavy Snow',icon:'❄️',bg:['263238','546E7A']},80:{label:'Showers',icon:'🌦️',bg:['1565C0','42A5F5']},81:{label:'Heavy Showers',icon:'🌧️',bg:['0D47A1','1E88E5']},82:{label:'Violent Showers',icon:'⛈️',bg:['0D47A1','1565C0']},95:{label:'Thunderstorm',icon:'⛈️',bg:['1A237E','283593']},96:{label:'Thunderstorm+Hail',icon:'⛈️',bg:['1A237E','283593']},99:{label:'Heavy Thunderstorm',icon:'🌩️',bg:['0D0D2B','1A237E']}};
const _wmo = c => WMO[c]||{label:'Unknown',icon:'🌡️',bg:['37474F','78909C']};

export async function geocode(location) {
  const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
  if(!r.ok) throw new Error(`Geocoding failed: ${r.status}`);
  const d=await r.json();
  if(!d.results?.length) throw new Error(`Location not found: "${location}"`);
  const l=d.results[0];
  return {name:l.name,country:l.country,countryCode:l.country_code,region:l.admin1||'',lat:l.latitude,lng:l.longitude,timezone:l.timezone,elevation:l.elevation};
}

export async function fetchWeather(location, opts={}) {
  const geo=typeof location==='string'?await geocode(location):location;
  const units=opts.units||'celsius';
  const tempUnit=units==='fahrenheit'?'fahrenheit':'celsius';
  let raw;
  try {
    const params=new URLSearchParams({latitude:geo.lat,longitude:geo.lng,timezone:geo.timezone||'auto',temperature_unit:tempUnit,wind_speed_unit:'kmh',current:['temperature_2m','relative_humidity_2m','apparent_temperature','weather_code','wind_speed_10m','wind_direction_10m','surface_pressure','cloud_cover','uv_index','is_day'].join(','),hourly:['temperature_2m','weather_code','precipitation_probability','wind_speed_10m'].join(','),daily:['weather_code','temperature_2m_max','temperature_2m_min','precipitation_probability_max','wind_speed_10m_max','uv_index_max','sunrise','sunset'].join(','),forecast_days:7});
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if(!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    raw=await r.json();
  } catch(e) {
    const owmKey=KeyStore.get('openweather'); if(!owmKey) throw e;
    const um=units==='celsius'?'metric':'imperial';
    const [cur,fc]=await Promise.all([fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${geo.lat}&lon=${geo.lng}&units=${um}&appid=${owmKey}`).then(r=>r.json()),fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${geo.lat}&lon=${geo.lng}&units=${um}&appid=${owmKey}`).then(r=>r.json())]);
    raw={_owm:true,current:{temperature_2m:cur.main?.temp,apparent_temperature:cur.main?.feels_like,relative_humidity_2m:cur.main?.humidity,weather_code:0,wind_speed_10m:(cur.wind?.speed||0)*3.6,wind_direction_10m:cur.wind?.deg||0,surface_pressure:cur.main?.pressure||0,cloud_cover:cur.clouds?.all||0,uv_index:null,is_day:1},daily:{time:fc.list.filter((_,i)=>i%8===0).slice(0,7).map(d=>d.dt_txt?.split(' ')[0]),weather_code:Array(7).fill(0),temperature_2m_max:fc.list.filter((_,i)=>i%8===0).slice(0,7).map(d=>d.main?.temp_max||0),temperature_2m_min:fc.list.filter((_,i)=>i%8===0).slice(0,7).map(d=>d.main?.temp_min||0),precipitation_probability_max:Array(7).fill(null),sunrise:Array(7).fill(new Date((cur.sys?.sunrise||0)*1000).toISOString()),sunset:Array(7).fill(new Date((cur.sys?.sunset||0)*1000).toISOString())},hourly:{time:[],temperature_2m:[],weather_code:[],precipitation_probability:[]}};
  }
  const cur=raw.current||{}, code=cur.weather_code??cur.weathercode??0, info=_wmo(code), isDay=cur.is_day!==undefined?cur.is_day:1;
  const now=new Date(), hourly=[];
  if(raw.hourly?.time) { for(let i=0;i<raw.hourly.time.length&&hourly.length<24;i++) { if(new Date(raw.hourly.time[i])>=now) hourly.push({time:raw.hourly.time[i],temp:Math.round(raw.hourly.temperature_2m?.[i]??0),code:raw.hourly.weather_code?.[i]??0,rain:raw.hourly.precipitation_probability?.[i]??null,wind:Math.round(raw.hourly.wind_speed_10m?.[i]??0)}); } }
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const daily=(raw.daily?.time||[]).map((t,i)=>{ const d=new Date(t); return {date:t,day:i===0?'Today':i===1?'Tomorrow':days[d.getDay()],code:raw.daily.weather_code?.[i]??0,high:Math.round(raw.daily.temperature_2m_max?.[i]??0),low:Math.round(raw.daily.temperature_2m_min?.[i]??0),rain:raw.daily.precipitation_probability_max?.[i]??null,wind:Math.round(raw.daily.wind_speed_10m_max?.[i]??0),uvIndex:Math.round(raw.daily.uv_index_max?.[i]??0),sunrise:raw.daily.sunrise?.[i]?.split('T')[1]?.slice(0,5)||'--:--',sunset:raw.daily.sunset?.[i]?.split('T')[1]?.slice(0,5)||'--:--'}; });
  const unitSym=units==='fahrenheit'?'°F':'°C';
  return {location:{name:geo.name,region:geo.region,country:geo.country,lat:geo.lat,lng:geo.lng,timezone:geo.timezone},current:{temp:Math.round(cur.temperature_2m??0),feelsLike:Math.round(cur.apparent_temperature??0),humidity:Math.round(cur.relative_humidity_2m??0),windSpeed:Math.round(cur.wind_speed_10m??0),windDir:cur.wind_direction_10m??0,pressure:Math.round(cur.surface_pressure??0),uvIndex:cur.uv_index??null,cloudCover:cur.cloud_cover??null,code,label:info.label,icon:info.icon,bg:info.bg,isDay},hourly,daily,units:unitSym,provider:raw._owm?'OpenWeatherMap':'Open-Meteo',fetchedAt:new Date().toISOString()};
}

// ═══════════════════════════════════════════════════════════════════════════════
// §3.5  WEATHER ALERTS  (NWS — US only)
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchWeatherAlerts(lat, lng) {
  try {
    const pointR = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`, { headers: { 'User-Agent': 'AETHER/1.0' } });
    if (!pointR.ok) return [];
    const point = await pointR.json();
    const alertsR = await fetch(`https://api.weather.gov/alerts/active?zone=${point.properties.county}`, { headers: { 'User-Agent': 'AETHER/1.0' } });
    if (!alertsR.ok) return [];
    const alerts = await alertsR.json();
    return (alerts.features || []).map(f => ({
      id: f.properties.id,
      headline: f.properties.headline,
      severity: f.properties.severity,
      urgency: f.properties.urgency,
      description: f.properties.description?.slice(0, 500),
      instruction: f.properties.instruction,
      expires: f.properties.expires,
      event: f.properties.event
    }));
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// §4  MAP ENGINE  (Leaflet + OpenStreetMap, no API key)
// ═══════════════════════════════════════════════════════════════════════════════

let _leafletReady=false;
async function _ensureLeaflet() {
  if(_leafletReady&&window.L) return window.L;
  if(!document.getElementById('leaflet-css')) { const l=document.createElement('link'); l.id='leaflet-css'; l.rel='stylesheet'; l.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l); }
  await new Promise((res,rej)=>{ if(window.L) return res(); const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
  _leafletReady=true; return window.L;
}

const _mapInstances=new WeakMap();
function _destroyMap(el) { const m=_mapInstances.get(el); if(m){try{m.remove();}catch{}} }

const _CAT_COLORS={restaurant:'#D85A30',hotel:'#2E75B6',museum:'#7F77DD',park:'#1D9E75',shop:'#BA7517',default:'#2E75B6'};
function _catColor(type='') { const t=type.toLowerCase(); for(const[k,v] of Object.entries(_CAT_COLORS)) if(t.includes(k)) return v; return _CAT_COLORS.default; }

function _pinIcon(L,color,label='') {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><defs><filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#00000044"/></filter></defs><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="${color}" filter="url(#s)"/><circle cx="16" cy="16" r="8" fill="white" opacity="0.9"/>${label?`<text x="16" y="20" text-anchor="middle" font-size="9" font-weight="600" font-family="system-ui" fill="${color}">${label}</text>`:''}</svg>`;
  return L.divIcon({html:svg,className:'',iconSize:[32,42],iconAnchor:[16,42],popupAnchor:[0,-44]});
}

function _popup(place,index) {
  const stars=place.rating?'★'.repeat(Math.round(place.rating))+'☆'.repeat(5-Math.round(place.rating)):'';
  return `<div style="font-family:system-ui;min-width:180px;max-width:240px;padding:4px"><div style="font-size:13px;font-weight:600;color:#111;margin-bottom:2px">${index!==undefined?`<span style="color:#2E75B6">${index+1}.</span> `:''}${place.name}</div>${place.type?`<div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.05em">${place.type}</div>`:''} ${stars?`<div style="color:#F9A825;font-size:12px">${stars} <span style="color:#666;font-size:11px">${place.rating} (${(place.reviews||0).toLocaleString()})</span></div>`:''} ${place.address?`<div style="font-size:11px;color:#666;margin-top:4px">📍 ${place.address}</div>`:''} ${place.website?`<a href="${place.website}" target="_blank" style="font-size:11px;color:#2E75B6;margin-top:4px;display:block">🌐 Website</a>`:''}</div>`;
}

const _nomQueue = [];
let _nomRunning = false;

async function _processNomQueue() {
  if (_nomRunning || !_nomQueue.length) return;
  _nomRunning = true;
  while (_nomQueue.length) {
    const { q, resolve, reject } = _nomQueue.shift();
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`, { headers: { 'User-Agent': 'AETHER/1.0' } });
      const d = await r.json();
      resolve(d.length ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) } : null);
    } catch (e) { reject(e); }
    await new Promise(r => setTimeout(r, 1100)); // 1.1s between requests
  }
  _nomRunning = false;
}

async function _geocodePlace(name, address) {
  const q = [name, address].filter(Boolean).join(', ');
  return new Promise((resolve, reject) => {
    _nomQueue.push({ q, resolve, reject });
    _processNomQueue();
  });
}

function _tiles(L,map) {
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd'}).addTo(map);
  L.control.attribution({prefix:false,position:'bottomright'}).addAttribution('© <a href="https://carto.com">CARTO</a> © <a href="https://openstreetmap.org">OSM</a>').addTo(map);
}

export async function renderPlacesMap(places, container, opts = {}) {
  const L = await _ensureLeaflet(); _destroyMap(container);
  container.style.cssText = `width:100%;height:${opts.height || 420}px;border-radius:12px;overflow:hidden;border:0.5px solid var(--color-border-tertiary,#e0e0e0);background:#f0ede6;`;
  const geocoded = await Promise.all(places.map(async p => { if (p.lat && p.lng) return p; const c = await _geocodePlace(p.name, p.address).catch(() => null); return c ? { ...p, ...c } : null; }));
  const valid = geocoded.filter(p => p?.lat && p?.lng);
  if (!valid.length) { container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:system-ui;color:#888;font-size:13px">No locations could be mapped</div>`; return; }
  const map = L.map(container, { zoomControl: true, attributionControl: false }); _mapInstances.set(container, map); _tiles(L, map);
  const bounds = L.latLngBounds(), colors = ['#2E75B6', '#7F77DD', '#1D9E75', '#BA7517', '#D85A30', '#E24B4A'];

  // Use marker clustering for 15+ markers
  if (valid.length >= 15) {
    try {
      if (!window.L.markerClusterGroup) {
        const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css'; document.head.appendChild(css);
        const css2 = document.createElement('link'); css2.rel = 'stylesheet'; css2.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css'; document.head.appendChild(css2);
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      }
      const mcg = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
      valid.forEach((p, i) => { const color = opts.colorByType ? _catColor(p.type) : colors[i % colors.length]; const marker = L.marker([p.lat, p.lng], { icon: _pinIcon(L, color, String(i + 1)) }).bindPopup(_popup(p, i), { maxWidth: 260 }); mcg.addLayer(marker); bounds.extend([p.lat, p.lng]); });
      map.addLayer(mcg);
    } catch {
      // fallback to individual markers
      valid.forEach((p, i) => { const color = opts.colorByType ? _catColor(p.type) : colors[i % colors.length]; L.marker([p.lat, p.lng], { icon: _pinIcon(L, color, String(i + 1)) }).bindPopup(_popup(p, i), { maxWidth: 260 }).addTo(map); bounds.extend([p.lat, p.lng]); });
    }
  } else {
    valid.forEach((p, i) => { const color = opts.colorByType ? _catColor(p.type) : colors[i % colors.length]; L.marker([p.lat, p.lng], { icon: _pinIcon(L, color, String(i + 1)) }).bindPopup(_popup(p, i), { maxWidth: 260 }).addTo(map); bounds.extend([p.lat, p.lng]); });
  }
  valid.length === 1 ? map.setView([valid[0].lat, valid[0].lng], opts.zoom || 15) : map.fitBounds(bounds, { padding: [40, 40] });
  return { map, places: valid };
}

export async function renderRouteMap(waypoints,container,opts={}) {
  const L=await _ensureLeaflet(); _destroyMap(container);
  container.style.cssText=`width:100%;height:${opts.height||420}px;border-radius:12px;overflow:hidden;border:0.5px solid var(--color-border-tertiary,#e0e0e0);background:#f0ede6;`;
  const points=await Promise.all(waypoints.map(async wp=>{ if(wp.lat&&wp.lng) return wp; const c=await _geocodePlace(wp.name,wp.address).catch(()=>null); return c?{...wp,...c}:null; }));
  const valid=points.filter(Boolean);
  if(valid.length<2) { container.innerHTML=`<div style="padding:20px;font-family:system-ui;color:#888">Need at least 2 valid locations for a route.</div>`; return; }
  const map=L.map(container,{zoomControl:true,attributionControl:false}); _mapInstances.set(container,map); _tiles(L,map);
  const bounds=L.latLngBounds();
  L.polyline(valid.map(p=>[p.lat,p.lng]),{color:opts.lineColor||'#2E75B6',weight:4,opacity:0.8}).addTo(map);
  valid.forEach((p,i)=>{ const isFirst=i===0,isLast=i===valid.length-1; const color=isFirst?'#1D9E75':isLast?'#D85A30':'#2E75B6'; const label=String.fromCharCode(65+i); L.marker([p.lat,p.lng],{icon:_pinIcon(L,color,label)}).bindPopup(_popup(p)).addTo(map); bounds.extend([p.lat,p.lng]); });
  map.fitBounds(bounds,{padding:[48,48]});
  return {map,points:valid};
}

// ═══════════════════════════════════════════════════════════════════════════════
// §5  IMAGE RENDERER  (masonry + lightbox)
// ═══════════════════════════════════════════════════════════════════════════════

function _injectImgCSS() {
  if(document.getElementById('aether-img-css')) return;
  const s=document.createElement('style'); s.id='aether-img-css';
  s.textContent=`.aether-img-grid{column-count:3;column-gap:10px}.aether-img-item{break-inside:avoid;margin-bottom:10px;border-radius:8px;overflow:hidden;cursor:zoom-in;position:relative;background:var(--color-background-tertiary,#f0ede6);transition:transform .18s,box-shadow .18s}.aether-img-item:hover{transform:translateY(-2px) scale(1.01);box-shadow:0 8px 24px rgba(0,0,0,.15)}.aether-img-item img{width:100%;height:auto;display:block}.aether-img-overlay{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.65));padding:20px 10px 8px;opacity:0;transition:opacity .18s}.aether-img-item:hover .aether-img-overlay{opacity:1}.aether-img-overlay-text{font-size:11px;color:rgba(255,255,255,.9);font-family:system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aether-img-btn{font-size:10px;padding:3px 8px;border-radius:4px;border:none;cursor:pointer;font-family:system-ui;background:rgba(255,255,255,.2);color:white;backdrop-filter:blur(4px)}.aether-img-btn:hover{background:rgba(255,255,255,.35)}.aether-lightbox{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;cursor:zoom-out}.aether-lightbox.visible{opacity:1}.aether-lightbox-inner{max-width:90vw;max-height:90vh;display:flex;flex-direction:column;align-items:center;gap:10px;cursor:default}.aether-lightbox-img{max-width:90vw;max-height:80vh;object-fit:contain;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.6)}.aether-lightbox-meta{color:rgba(255,255,255,.75);font-size:12px;font-family:system-ui;text-align:center;max-width:600px}.aether-lb-close{position:fixed;top:16px;right:20px;background:rgba(255,255,255,.15);border:none;color:white;font-size:22px;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)}.aether-lb-nav{position:fixed;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);border:none;color:white;font-size:20px;width:44px;height:44px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)}.aether-lb-prev{left:16px}.aether-lb-next{right:16px}.aether-skel{border-radius:8px;margin-bottom:10px;background:linear-gradient(90deg,var(--color-background-secondary,#f0ede6) 25%,var(--color-background-tertiary,#e8e4dc) 50%,var(--color-background-secondary,#f0ede6) 75%);background-size:200% 100%;animation:aether-shimmer 1.4s infinite}@keyframes aether-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`;
  document.head.appendChild(s);
}

let _lb=null, _lbImgs=[], _lbIdx=0;
function _openLightbox(imgs,idx) {
  _closeLightbox(); _lbImgs=imgs; _lbIdx=idx;
  const lb=document.createElement('div'); lb.className='aether-lightbox'; lb.id='aether-lb';
  lb.innerHTML=`<button class="aether-lb-close" id="lb-x">✕</button><button class="aether-lb-nav aether-lb-prev" id="lb-p">‹</button><button class="aether-lb-nav aether-lb-next" id="lb-n">›</button><div class="aether-lightbox-inner"><img class="aether-lightbox-img" id="lb-img" src="" alt=""/><div class="aether-lightbox-meta" id="lb-meta"></div><div style="display:flex;gap:8px;margin-top:4px"><button class="aether-img-btn" id="lb-dl" style="padding:6px 14px;font-size:11px">⬇ Download</button><a class="aether-img-btn" id="lb-src" href="#" target="_blank" style="padding:6px 14px;font-size:11px;text-decoration:none">↗ Source</a></div></div>`;
  document.body.appendChild(lb); _lb=lb;
  requestAnimationFrame(()=>lb.classList.add('visible'));
  _updateLightbox();
  lb.onclick=e=>{ if(e.target===lb) _closeLightbox(); };
  lb.querySelector('#lb-x').onclick=_closeLightbox;
  lb.querySelector('#lb-p').onclick=e=>{ e.stopPropagation(); _navLb(-1); };
  lb.querySelector('#lb-n').onclick=e=>{ e.stopPropagation(); _navLb(1); };
  lb.querySelector('#lb-dl').onclick=e=>{ e.stopPropagation(); _dlImg(_lbImgs[_lbIdx]); };
  document.addEventListener('keydown',_lbKey);
}
function _lbKey(e) { if(e.key==='Escape')_closeLightbox(); if(e.key==='ArrowLeft')_navLb(-1); if(e.key==='ArrowRight')_navLb(1); }
function _navLb(d) { _lbIdx=(_lbIdx+d+_lbImgs.length)%_lbImgs.length; _updateLightbox(); }
function _updateLightbox() {
  const img=_lbImgs[_lbIdx];
  const el=document.getElementById('lb-img'), meta=document.getElementById('lb-meta'), src=document.getElementById('lb-src');
  if(!el) return;
  el.src=img.url; el.alt=img.title||''; meta.textContent=[img.title,img.source].filter(Boolean).join(' · ');
  if(src){src.href=img.source||img.url;src.style.display=img.source?'':'none';}
  const p=document.getElementById('lb-p'),n=document.getElementById('lb-n');
  if(p)p.style.display=_lbImgs.length>1?'':'none'; if(n)n.style.display=_lbImgs.length>1?'':'none';
}
function _closeLightbox() { if(!_lb)return; _lb.classList.remove('visible'); setTimeout(()=>{_lb?.remove();_lb=null;},200); document.removeEventListener('keydown',_lbKey); }
async function _dlImg(img) {
  try {
    const r = await fetch(img.url, { mode: 'cors', credentials: 'omit' });
    if (r.ok) {
      const blob = await r.blob();
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: img.title || 'image' });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } else throw new Error('fetch failed');
  } catch {
    // fallback: open in new tab
    const a = Object.assign(document.createElement('a'), { href: img.url, download: img.title || 'image', target: '_blank' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}

export function renderImageGrid(images, container, opts={}) {
  _injectImgCSS(); container.innerHTML=''; container.style.fontFamily='system-ui,sans-serif';
  if(!images?.length) { container.innerHTML=`<div style="padding:32px;text-align:center;color:var(--color-text-tertiary,#888);font-size:13px">No images found.</div>`; return; }
  const header=document.createElement('div'); header.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:12px';
  header.innerHTML=`<div><span style="font-size:13px;font-weight:500;color:var(--color-text-primary,#111)">${opts.query?`"${opts.query}"`:''}</span><span style="font-size:11px;color:var(--color-text-tertiary,#888);margin-left:8px">${images.length} results</span></div><span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--color-background-tertiary,#f0ede6);color:var(--color-text-secondary,#555);font-weight:500">${images[0]?.provider||'search'}</span>`;
  container.appendChild(header);
  const grid=document.createElement('div'); grid.className='aether-img-grid'; container.appendChild(grid);
  images.forEach((img,i)=>{
    const item=document.createElement('div'); item.className='aether-img-item';
    const image=document.createElement('img'); image.src=img.thumb||img.url; image.alt=img.title||''; image.loading='lazy'; image.decoding='async'; image.style.minHeight='80px'; image.onerror=()=>{item.style.display='none';};
    const overlay=document.createElement('div'); overlay.className='aether-img-overlay'; overlay.innerHTML=`<div class="aether-img-overlay-text">${img.title||''}</div><div style="display:flex;gap:6px;margin-top:4px"><button class="aether-img-btn" data-action="view">⊕ View</button><button class="aether-img-btn" data-action="dl">⬇</button>${img.source?`<a class="aether-img-btn" href="${img.source}" target="_blank" style="text-decoration:none">↗</a>`:''}</div>`;
    item.appendChild(image); item.appendChild(overlay); grid.appendChild(item);
    item.addEventListener('click',e=>{ const a=e.target.dataset?.action; if(a==='dl'){e.stopPropagation();_dlImg(img);return;} openLightbox(images,i); });
  });
}

export function openLightbox(images,idx) { _openLightbox(images,idx); }

function _renderImgLoading(container,query='') {
  _injectImgCSS(); container.innerHTML='';
  const h=document.createElement('div'); h.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-family:system-ui';
  h.innerHTML=`<span style="font-size:13px;font-weight:500;color:var(--color-text-primary,#111)">${query?`Searching for "${query}"…`:'Searching…'}</span>`;
  container.appendChild(h);
  const grid=document.createElement('div'); grid.className='aether-img-grid'; container.appendChild(grid);
  [160,200,140,220,180,160,200,150,190].forEach(height=>{ const s=document.createElement('div'); s.className='aether-skel'; s.style.height=`${height}px`; grid.appendChild(s); });
}

// ═══════════════════════════════════════════════════════════════════════════════
// §6  WEATHER RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function _injectWeatherCSS() {
  if(document.getElementById('aether-wx-css')) return;
  const s=document.createElement('style'); s.id='aether-wx-css';
  s.textContent=`.aw-root{font-family:system-ui,-apple-system,sans-serif;border-radius:16px;overflow:hidden;user-select:none;box-shadow:0 8px 32px rgba(0,0,0,.12)}.aw-hero{padding:24px 24px 20px;position:relative;overflow:hidden;color:white}.aw-hero::before{content:'';position:absolute;inset:0;background:rgba(0,0,0,.08);pointer-events:none}.aw-loc{font-size:13px;font-weight:500;opacity:.85;letter-spacing:.02em;margin-bottom:2px}.aw-country{font-size:11px;opacity:.65;margin-bottom:16px}.aw-temp-row{display:flex;align-items:flex-end;gap:16px;margin-bottom:8px}.aw-temp{font-size:72px;font-weight:200;line-height:1;letter-spacing:-4px}.aw-unit{font-size:28px;font-weight:300;opacity:.8;margin-bottom:8px}.aw-icon{font-size:52px;line-height:1;margin-bottom:4px}.aw-label{font-size:15px;opacity:.9;margin-bottom:4px}.aw-feels{font-size:12px;opacity:.7;margin-bottom:16px}.aw-stats{display:flex;gap:20px;flex-wrap:wrap;padding-top:14px;border-top:1px solid rgba(255,255,255,.2)}.aw-stat{display:flex;flex-direction:column;gap:2px}.aw-stat-lbl{font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:.06em}.aw-stat-val{font-size:13px;font-weight:500}.aw-body{background:var(--color-background-primary,#fff)}.aw-hourly{overflow-x:auto;padding:16px 20px;display:flex;gap:4px;scrollbar-width:thin;border-bottom:0.5px solid var(--color-border-tertiary,#eee)}.aw-hour{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 10px;border-radius:10px;min-width:58px;transition:background .15s}.aw-hour:hover{background:var(--color-background-secondary,#f5f5f5)}.aw-hour.now{background:var(--color-background-info,#E6F1FB)}.aw-ht{font-size:10px;color:var(--color-text-tertiary,#888);font-weight:500}.aw-hi{font-size:20px}.aw-htemp{font-size:13px;font-weight:600}.aw-hrain{font-size:10px;color:#2E75B6}.aw-forecast{padding:4px 0}.aw-frow{display:flex;align-items:center;padding:10px 20px;gap:12px;transition:background .12s}.aw-frow:hover{background:var(--color-background-secondary,#f9f9f9)}.aw-fday{font-size:12px;font-weight:500;width:72px}.aw-ficon{font-size:20px;width:28px;text-align:center}.aw-frain{font-size:11px;color:#2E75B6;width:36px}.aw-ftemps{flex:1;display:flex;align-items:center;gap:8px;justify-content:flex-end}.aw-flow{font-size:12px;color:var(--color-text-tertiary,#888);min-width:28px;text-align:right}.aw-fbar{flex:1;max-width:80px;height:4px;border-radius:2px;background:var(--color-border-tertiary,#eee);position:relative}.aw-fbar-fill{position:absolute;top:0;bottom:0;border-radius:2px;background:linear-gradient(90deg,#42A5F5,#F9A825)}.aw-fhigh{font-size:12px;font-weight:600;min-width:28px}.aw-sec{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-tertiary,#888);padding:14px 20px 4px}.aw-footer{padding:10px 20px;font-size:10px;color:var(--color-text-tertiary,#888);border-top:0.5px solid var(--color-border-tertiary,#eee);display:flex;justify-content:space-between}.aw-badge{font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,.2);color:rgba(255,255,255,.8);position:absolute;top:16px;right:16px;font-weight:500}`;
  document.head.appendChild(s);
}

const _WDIR=['N','NE','E','SE','S','SW','W','NW'];
const _windDir=deg=>_WDIR[Math.round(deg/45)%8]||'—';
const _uvLbl=uv=>!uv?'—':uv<=2?`${uv} Low`:uv<=5?`${uv} Mod`:uv<=7?`${uv} High`:uv<=10?`${uv} V.High`:`${uv} Extreme`;
const _fmtHour=iso=>new Date(iso).toLocaleTimeString([],{hour:'numeric',hour12:true});
const _wmoIcon = c => { const w = WMO[c]; return w ? w.icon : '🌡️'; };

export function renderWeatherCard(data, container) {
  _injectWeatherCSS(); container.innerHTML='';
  const {current:cur,daily,hourly,location,units,provider}=data;
  const allH=daily.map(d=>d.high),allL=daily.map(d=>d.low),aH=Math.max(...allH),aL=Math.min(...allL);
  const nightGrad=!cur.isDay?'linear-gradient(145deg,#0D1B2A,#1B2A3B)':null;
  const bg=nightGrad||`linear-gradient(145deg,#${cur.bg[0].replace('#','')},#${cur.bg[1].replace('#','')})`;
  const root=document.createElement('div'); root.className='aw-root';
  const hero=document.createElement('div'); hero.className='aw-hero'; hero.style.background=bg;
  hero.innerHTML=`<div class="aw-badge">${provider}</div><div class="aw-loc">📍 ${location.name}${location.region?', '+location.region:''}</div><div class="aw-country">${location.country} · ${location.timezone||''}</div><div class="aw-temp-row"><div><div class="aw-temp">${cur.temp}<span class="aw-unit">${units}</span></div><div class="aw-label">${cur.label}</div><div class="aw-feels">Feels like ${cur.feelsLike}${units}</div></div><div class="aw-icon">${cur.icon}</div></div><div class="aw-stats"><div class="aw-stat"><span class="aw-stat-lbl">Humidity</span><span class="aw-stat-val">${cur.humidity}%</span></div><div class="aw-stat"><span class="aw-stat-lbl">Wind</span><span class="aw-stat-val">${cur.windSpeed} km/h ${_windDir(cur.windDir)}</span></div><div class="aw-stat"><span class="aw-stat-lbl">Pressure</span><span class="aw-stat-val">${cur.pressure} hPa</span></div>${cur.uvIndex!==null?`<div class="aw-stat"><span class="aw-stat-lbl">UV</span><span class="aw-stat-val">${_uvLbl(cur.uvIndex)}</span></div>`:''} ${cur.cloudCover!==null?`<div class="aw-stat"><span class="aw-stat-lbl">Cloud</span><span class="aw-stat-val">${cur.cloudCover}%</span></div>`:''} ${daily[0]?`<div class="aw-stat"><span class="aw-stat-lbl">Sun</span><span class="aw-stat-val">🌅${daily[0].sunrise} 🌇${daily[0].sunset}</span></div>`:''}</div>`;
  root.appendChild(hero);
  const body=document.createElement('div'); body.className='aw-body';
  if(hourly.length) {
    const ht=document.createElement('div'); ht.className='aw-sec'; ht.textContent='Hourly Forecast'; body.appendChild(ht);
    const hr=document.createElement('div'); hr.className='aw-hourly';
    hourly.slice(0,24).forEach((h,i)=>{ const item=document.createElement('div'); item.className='aw-hour'+(i===0?' now':''); item.innerHTML=`<span class="aw-ht">${i===0?'Now':_fmtHour(h.time)}</span><span class="aw-hi">${_wmoIcon(h.code)}</span><span class="aw-htemp">${h.temp}${units}</span>${h.rain!==null?`<span class="aw-hrain">💧${h.rain}%</span>`:'<span class="aw-hrain"></span>'}`; hr.appendChild(item); });
    body.appendChild(hr);
  }
  if(daily.length) {
    const ft=document.createElement('div'); ft.className='aw-sec'; ft.textContent='7-Day Forecast'; body.appendChild(ft);
    const fs=document.createElement('div'); fs.className='aw-forecast';
    daily.forEach(d=>{ const range=aH-aL||1,lPct=((d.low-aL)/range*100).toFixed(1),wPct=Math.max(((d.high-d.low)/range*100),8).toFixed(1); const row=document.createElement('div'); row.className='aw-frow'; row.innerHTML=`<div class="aw-fday">${d.day}</div><div class="aw-ficon">${_wmoIcon(d.code)}</div><div class="aw-frain">${d.rain!==null?`💧${d.rain}%`:''}</div><div class="aw-ftemps"><span class="aw-flow">${d.low}°</span><div class="aw-fbar"><div class="aw-fbar-fill" style="left:${lPct}%;width:${wPct}%"></div></div><span class="aw-fhigh">${d.high}°</span></div>`; fs.appendChild(row); });
    body.appendChild(fs);
  }
  const footer=document.createElement('div'); footer.className='aw-footer'; footer.innerHTML=`<span>Updated ${new Date(data.fetchedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span><span>${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}</span>`; body.appendChild(footer);
  root.appendChild(body); container.appendChild(root);
}

export function cacheWeatherData(location, data) {
  try {
    localStorage.setItem('aether_last_weather', JSON.stringify({ location, data, timestamp: Date.now() }));
  } catch {}
}

export function getCachedWeather(location) {
  try {
    const raw = localStorage.getItem('aether_last_weather');
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.location === location && Date.now() - entry.timestamp < 30 * 60 * 1000) return entry.data;
    return null;
  } catch { return null; }
}

function _renderWxLoading(container,location='') {
  container.innerHTML=`<div style="font-family:system-ui;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.1)"><div style="height:220px;background:linear-gradient(145deg,#B0BEC5,#CFD8DC);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:white"><div style="font-size:32px;animation:spin 1.5s linear infinite">🌐</div><div style="font-size:13px;opacity:.8">${location?`Loading weather for ${location}…`:'Fetching weather…'}</div></div><div style="height:80px;background:white;display:flex;align-items:center;justify-content:center;font-size:12px;color:#888">Contacting Open-Meteo…</div></div><style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §6.5  GEOLOCATION API
// ═══════════════════════════════════════════════════════════════════════════════

export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      err => reject(new Error(`Geolocation error: ${err.message}`)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// §6.6  CUSTOM PROVIDERS
// ═══════════════════════════════════════════════════════════════════════════════

export const customProviders = {
  _registry: {},
  register(id, { search, searchName }) {
    this._registry[id] = { search, searchName };
    try { localStorage.setItem('aether_custom_providers', JSON.stringify(Object.keys(this._registry))); } catch {}
  },
  unregister(id) { delete this._registry[id]; },
  list() { return Object.keys(this._registry); },
  get(id) { return this._registry[id] || null; },
  _loadSaved() {
    try {
      const saved = localStorage.getItem('aether_custom_providers');
      if (saved) JSON.parse(saved).forEach(id => { /* re-register on next use */ });
    } catch {}
  }
};
customProviders._loadSaved();

// ═══════════════════════════════════════════════════════════════════════════════
// §7  MAP RESULTS RENDERER  (split: cards + map)
// ═══════════════════════════════════════════════════════════════════════════════

function _injectMapCSS() {
  if(document.getElementById('aether-map-css')) return;
  const s=document.createElement('style'); s.id='aether-map-css';
  s.textContent=`.aether-map-root{font-family:system-ui,sans-serif;border-radius:14px;overflow:hidden;border:0.5px solid var(--color-border-tertiary,#e0e0e0)}.aether-map-hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:0.5px solid var(--color-border-tertiary,#e0e0e0);background:var(--color-background-primary,#fff)}.aether-map-body{display:flex;height:440px}.aether-places{width:280px;min-width:280px;overflow-y:auto;border-right:0.5px solid var(--color-border-tertiary,#e0e0e0);background:var(--color-background-primary,#fff);scrollbar-width:thin}.aether-place-card{padding:12px 14px;border-bottom:0.5px solid var(--color-border-tertiary,#eee);cursor:pointer;transition:background .12s;display:flex;gap:10px;align-items:flex-start}.aether-place-card:hover{background:var(--color-background-secondary,#f9f9f9)}.aether-place-card.active{background:var(--color-background-info,#E6F1FB);border-left:3px solid #2E75B6}.aether-pnum{width:22px;height:22px;border-radius:50%;color:white;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}.aether-pinfo{flex:1;min-width:0}.aether-pname{font-size:13px;font-weight:500;color:var(--color-text-primary,#111);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aether-ptype{font-size:10px;color:var(--color-text-tertiary,#888);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}.aether-prating{font-size:11px;color:#F9A825;margin-bottom:2px}.aether-paddr{font-size:11px;color:var(--color-text-secondary,#666);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aether-plink{font-size:10px;padding:2px 7px;border-radius:4px;border:0.5px solid var(--color-border-secondary,#ddd);color:#2E75B6;text-decoration:none;background:var(--color-background-primary,#fff);margin-top:6px;display:inline-block}.aether-map-panel{flex:1;position:relative}.aether-map-skel{padding:12px 14px;border-bottom:0.5px solid var(--color-border-tertiary,#eee)}.aether-map-skel-line{height:12px;border-radius:6px;margin-bottom:6px;background:linear-gradient(90deg,var(--color-background-secondary,#f0ede6) 25%,var(--color-background-tertiary,#e8e4dc) 50%,var(--color-background-secondary,#f0ede6) 75%);background-size:200% 100%;animation:aether-shimmer 1.4s infinite}`;
  document.head.appendChild(s);
}

const _PCOLORS=['#2E75B6','#7F77DD','#1D9E75','#BA7517','#D85A30','#E24B4A','#2E75B6','#7F77DD','#1D9E75','#BA7517'];

function _buildPlaceCard(place,i,onSelect) {
  const card=document.createElement('div'); card.className='aether-place-card'; card.dataset.index=i;
  const stars=place.rating?'★'.repeat(Math.round(place.rating))+'☆'.repeat(5-Math.round(place.rating)):null;
  card.innerHTML=`<div class="aether-pnum" style="background:${_PCOLORS[i%10]}">${i+1}</div><div class="aether-pinfo"><div class="aether-pname">${place.name}</div>${place.type?`<div class="aether-ptype">${place.type}</div>`:''} ${stars?`<div class="aether-prating">${stars} <span style="color:var(--color-text-tertiary,#888);font-size:10px">${place.rating} · ${(place.reviews||0).toLocaleString()}</span></div>`:''} ${place.address?`<div class="aether-paddr">📍 ${place.address}</div>`:''} ${place.website?`<a class="aether-plink" href="${place.website}" target="_blank">🌐 Website</a>`:''}</div>`;
  card.addEventListener('click',()=>onSelect(i));
  return card;
}

export async function renderMapResults(places, container, opts={}) {
  _injectMapCSS(); container.innerHTML='';
  if(!places?.length) { container.innerHTML=`<div class="aether-map-root" style="display:flex;align-items:center;justify-content:center;height:200px;flex-direction:column;gap:8px;color:var(--color-text-tertiary,#888);font-size:13px"><span style="font-size:28px">🗺️</span>No places found.</div>`; return; }
  const root=document.createElement('div'); root.className='aether-map-root';
  const hdr=document.createElement('div'); hdr.className='aether-map-hdr'; hdr.innerHTML=`<div><span style="font-size:13px;font-weight:500;color:var(--color-text-primary,#111)">${opts.query||'Places'}</span><span style="font-size:11px;color:var(--color-text-tertiary,#888);margin-left:8px">${places.length} results</span></div><span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--color-background-secondary,#f5f5f5);color:var(--color-text-secondary,#555);font-weight:500">${places[0]?.provider||'map'}</span>`;
  root.appendChild(hdr);
  const body=document.createElement('div'); body.className='aether-map-body';
  const panel=document.createElement('div'); panel.className='aether-places';
  const mapPanel=document.createElement('div'); mapPanel.className='aether-map-panel';
  const cards=[];
  function selectCard(i) { cards.forEach((c,ci)=>c.classList.toggle('active',ci===i)); cards[i]?.scrollIntoView({behavior:'smooth',block:'nearest'}); }
  places.forEach((place,i)=>{ const card=_buildPlaceCard(place,i,selectCard); cards.push(card); panel.appendChild(card); });
  body.appendChild(panel); body.appendChild(mapPanel); root.appendChild(body); container.appendChild(root);
  try { await renderPlacesMap(places,mapPanel,{height:440,colorByType:opts.colorByType!==false}); } catch(e) { mapPanel.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:12px;padding:20px;text-align:center">Map could not load: ${e.message}</div>`; }
}

function _renderMapLoading(container,query='') {
  _injectMapCSS(); container.innerHTML='';
  const root=document.createElement('div'); root.className='aether-map-root';
  const hdr=document.createElement('div'); hdr.className='aether-map-hdr'; hdr.innerHTML=`<span style="font-size:13px;font-weight:500">${query?`Searching for "${query}"…`:'Searching…'}</span>`;
  root.appendChild(hdr);
  const body=document.createElement('div'); body.className='aether-map-body';
  const panel=document.createElement('div'); panel.className='aether-places';
  for(let i=0;i<5;i++) { const s=document.createElement('div'); s.className='aether-map-skel'; s.innerHTML='<div class="aether-map-skel-line" style="width:60%;height:13px"></div><div class="aether-map-skel-line" style="width:40%;height:10px"></div><div class="aether-map-skel-line" style="width:80%;height:10px"></div>'; panel.appendChild(s); }
  const mp=document.createElement('div'); mp.className='aether-map-panel'; mp.style.cssText='background:var(--color-background-secondary,#f5f5f5);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:#888;font-size:12px'; mp.innerHTML='<span style="font-size:28px">🗺️</span> Loading map…';
  body.appendChild(panel); body.appendChild(mp); root.appendChild(body); container.appendChild(root);
}

// ═══════════════════════════════════════════════════════════════════════════════
// §8  WEB SEARCH RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function renderSearchResults(data, container, opts={}) {
  container.innerHTML=''; container.style.fontFamily='system-ui,sans-serif';
  if(!data.results?.length) { container.innerHTML=`<div style="padding:20px;color:var(--color-text-tertiary,#888);font-size:13px">No results found.</div>`; return; }
  const root=document.createElement('div');
  if(data.answer) { const ans=document.createElement('div'); ans.style.cssText='padding:14px 16px;margin-bottom:14px;border-radius:10px;background:var(--color-background-info,#E6F1FB);border-left:3px solid #2E75B6;font-size:13px;line-height:1.6;color:var(--color-text-primary,#111)'; ans.innerHTML=`<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#2E75B6;margin-bottom:6px">Answer</div>${data.answer}`; root.appendChild(ans); }
  const hdr=document.createElement('div'); hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:10px'; hdr.innerHTML=`<span style="font-size:13px;font-weight:500;color:var(--color-text-primary,#111)">${opts.query?`"${opts.query}"`:''}</span><span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--color-background-secondary,#f5f5f5);color:var(--color-text-secondary,#555);font-weight:500">${data.provider}</span>`; root.appendChild(hdr);
  data.results.forEach(item=>{ const card=document.createElement('div'); card.style.cssText='padding:12px 14px;margin-bottom:8px;border-radius:10px;border:0.5px solid var(--color-border-tertiary,#e0e0e0);background:var(--color-background-primary,#fff);transition:box-shadow .15s;cursor:pointer'; card.onmouseenter=()=>{card.style.boxShadow='0 2px 12px rgba(0,0,0,.08)';}; card.onmouseleave=()=>{card.style.boxShadow='';}; const domain=(()=>{try{return new URL(item.url).hostname.replace('www.','');}catch{return item.url;}})(); card.innerHTML=`<div style="font-size:10px;color:var(--color-text-tertiary,#888);margin-bottom:3px">${domain}${item.score?`<span style="margin-left:6px;color:#1D9E75">● ${(item.score*100).toFixed(0)}%</span>`:''}</div><a href="${item.url}" target="_blank" style="font-size:13px;font-weight:500;color:#2E75B6;text-decoration:none;display:block;margin-bottom:4px;line-height:1.4">${item.title}</a><div style="font-size:12px;color:var(--color-text-secondary,#555);line-height:1.6">${item.snippet||''}</div>`; root.appendChild(card); });
  container.appendChild(root);
}

// ═══════════════════════════════════════════════════════════════════════════════
// §9  SETTINGS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

export function renderSettingsPanel(container) {
  container.innerHTML=''; container.style.fontFamily='system-ui,sans-serif';
  const providers=[{id:'tavily',label:'Tavily API Key',placeholder:'tvly-...',link:'https://tavily.com'},{id:'serper',label:'Serper API Key',placeholder:'sk-...',link:'https://serper.dev'},{id:'brave',label:'Brave Search API Key',placeholder:'BSA...',link:'https://brave.com/search/api'},{id:'openweather',label:'OpenWeatherMap Key (optional)',placeholder:'Optional — Open-Meteo used by default',link:'https://openweathermap.org/api'}];
  container.innerHTML=`<div style="padding:16px 18px;border-bottom:0.5px solid var(--color-border-tertiary,#e0e0e0)"><div style="font-size:13px;font-weight:500;margin-bottom:2px">Discovery API Keys</div><div style="font-size:11px;color:var(--color-text-tertiary,#888)">Stored in localStorage. At least one search provider required.</div></div><div style="padding:16px 18px;display:flex;flex-direction:column;gap:14px">${providers.map(p=>`<div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px"><label style="font-size:12px;font-weight:500">${p.label}</label><a href="${p.link}" target="_blank" style="font-size:10px;color:#2E75B6">Get key ↗</a></div><input type="password" data-provider="${p.id}" placeholder="${p.placeholder}" value="${KeyStore.get(p.id)||''}" style="width:100%;padding:7px 10px;border:0.5px solid var(--color-border-secondary,#ccc);border-radius:6px;font-size:12px;font-family:inherit;background:var(--color-background-primary,#fff);color:var(--color-text-primary,#111);box-sizing:border-box"/></div>`).join('')}<button id="aether-save-keys" style="padding:8px 16px;border-radius:7px;border:none;cursor:pointer;background:var(--color-text-primary,#111);color:var(--color-background-primary,#fff);font-family:inherit;font-size:12px;font-weight:500;align-self:flex-start">Save Keys</button><div id="aether-keys-status" style="font-size:11px;color:var(--color-text-tertiary,#888)">Available: ${KeyStore.available().join(', ')||'none'}</div></div>`;
  container.querySelector('#aether-save-keys').onclick=()=>{ container.querySelectorAll('input[data-provider]').forEach(input=>{const v=input.value.trim();if(v)KeyStore.set(input.dataset.provider,v);}); const st=container.querySelector('#aether-keys-status'); st.textContent=`Saved. Available: ${KeyStore.available().join(', ')||'none'}`; st.style.color='#1D9E75'; };
}

// ═══════════════════════════════════════════════════════════════════════════════
// §10  SPEC EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════════

function _skillUtils() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.AETHER_SkillUtils)
      || (typeof window !== 'undefined' && window.AETHER_SkillUtils)
      || null;
  } catch { return null; }
}

export function extractSpec(text) {
  const su = _skillUtils();
  if (su?.parseWithRepair) {
    const r = su.parseWithRepair(text, { requireKey: 'action' });
    if (r?.spec) return r.spec;
  } else if (su?.softParseSpec) {
    const p = su.softParseSpec(text, { requireKey: 'action' });
    if (p) return p;
  }
  if (!text) return null;
  for (const s of [text.trim(), text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim()]) {
    try {
      const p = JSON.parse(s);
      if (p && p.action) return p;
    } catch {}
  }
  const m = String(text).match(/\{\s*"action"\s*:\s*"[^"]+"[\s\S]*\}/);
  if (m) {
    try {
      const p = JSON.parse(m[0].replace(/,\s*}/g, '}'));
      if (p.action) return p;
    } catch {}
  }
  return null;
}

/** Async: soft → aggressive → model repair */
export async function extractSpecAsync(text, opts = {}) {
  const su = _skillUtils();
  if (su?.parseWithRetry) {
    const r = await su.parseWithRetry(text, {
      requireKey: 'action',
      skillHint: 'discovery',
      allowModelRepair: opts.allowModelRepair !== false,
      callModel: opts.callModel,
    });
    return r?.spec || null;
  }
  return extractSpec(text);
}

// ═══════════════════════════════════════════════════════════════════════════════
// §11  MAIN EXECUTE
// ═══════════════════════════════════════════════════════════════════════════════

export async function execute(spec, container, opts = {}) {
  // Allow raw model text
  if (typeof spec === 'string') {
    const parsed = extractSpec(spec);
    if (!parsed) throw new Error('Invalid discovery spec: could not parse JSON action');
    spec = parsed;
  }
  if (!spec?.action) throw new Error('Invalid spec: missing action');

  KeyStore.syncFromHost();
  const su = _skillUtils();
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const startedFlight = su?.kernelFlight?.('discovery', spec.action + ': ' + (spec.query || spec.location || ''));
  su?.kernelLog?.('discovery.' + spec.action, (spec.query || spec.location || '').slice(0, 80), 'net');

  try {
    let result;
    switch (spec.action) {
      case 'images': {
        _renderImgLoading(container, spec.query);
        const images = await imageSearch(spec.query, { limit: spec.limit || 12 });
        renderImageGrid(images, container, { query: spec.query });
        result = { type: 'images', count: images.length, images };
        break;
      }
      case 'search': {
        const results = await webSearch(spec.query, { limit: spec.limit || 8, depth: spec.depth || 'basic' });
        renderSearchResults(results, container, { query: spec.query });
        result = { type: 'search', ...results };
        break;
      }
      case 'news': {
        const results = await newsSearch(spec.query, { limit: spec.limit || 8, freshness: spec.freshness });
        renderSearchResults(results, container, { query: spec.query });
        result = { type: 'news', ...results };
        break;
      }
      case 'places': {
        _renderMapLoading(container, spec.query);
        const places = await placeSearch(spec.query, { limit: spec.limit || 8 });
        await renderMapResults(places, container, { query: spec.query, colorByType: spec.colorByType !== false });
        result = { type: 'places', count: places.length, places };
        break;
      }
      case 'route': {
        container.style.minHeight = '420px';
        result = await renderRouteMap(spec.waypoints || [], container, { height: spec.height || 420, lineColor: spec.lineColor });
        break;
      }
      case 'weather': {
        _renderWxLoading(container, spec.location);
        const data = await fetchWeather(spec.location, { units: spec.units || 'celsius' });
        renderWeatherCard(data, container);
        cacheWeatherData(spec.location, data);
        if (data.location) fetchWeatherAlerts(data.location.lat, data.location.lng).then(alerts => {
          if (alerts.length) {
            const alertBar = document.createElement('div');
            alertBar.style.cssText = 'padding:10px 16px;background:#FFF3CD;border-bottom:1px solid #FFC107;font-size:12px;font-family:system-ui;color:#856404';
            alertBar.innerHTML = `⚠ ${alerts.length} weather alert${alerts.length > 1 ? 's' : ''}: ${alerts[0].headline}${alerts.length > 1 ? ` (+${alerts.length - 1} more)` : ''}`;
            const root = container.querySelector('.aw-root');
            if (root) root.prepend(alertBar);
          }
        });
        result = { type: 'weather', ...data };
        break;
      }
      default:
        throw new Error(`Unknown action: "${spec.action}"`);
    }
    const ms = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
    su?.kernelLog?.('discovery.' + spec.action + '.ok', (result?.type || 'done') + ' · ' + ms + 'ms', 'net', { ok: true, ms });
    if (startedFlight) su?.kernelEnd?.('landed');
    return result;
  } catch (e) {
    const ms = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
    su?.kernelLog?.('discovery.' + spec.action + '.ERR', e.message || String(e), 'net', { ok: false, ms });
    if (startedFlight) su?.kernelEnd?.('aborted');
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// §12  SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

export const SYSTEM_PROMPT = `You are the AETHER Discovery skill. Help users search, find images, discover places, check weather, and find news.
When intent matches, respond ONLY with raw JSON. No fences. No explanation.

WEB SEARCH:   { "action":"search",  "query":"...", "limit":8 }
IMAGE SEARCH: { "action":"images",  "query":"...", "limit":12 }
NEWS SEARCH:  { "action":"news",    "query":"...", "limit":8, "freshness":"day" }
PLACES / MAP: { "action":"places",  "query":"best restaurants Tokyo", "limit":8, "colorByType":true }
ROUTE:        { "action":"route",   "waypoints":[{"name":"Eiffel Tower","address":"Paris"},{"name":"Louvre","address":"Paris"}] }
WEATHER:      { "action":"weather", "location":"Tokyo, Japan", "units":"celsius" }

units: "celsius" | "fahrenheit"
freshness: "day" | "week" | "month" | "year"

ROUTING GUIDE:
"show me photos of X"     → images
"search for X"            → search
"news about X"            → news
"find restaurants in X"   → places
"directions from X to Y"  → route
"weather in X"            → weather
"show X on a map"         → places

Always pick ONE action. Output raw JSON only. For conversational questions respond normally in text.`;

// ═══════════════════════════════════════════════════════════════════════════════
// §13  SKILL DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

const DiscoverySkill = {
  name: 'discovery', version: '1.3.0',
  description: 'Web search, news, images, maps, weather — Tavily/Serper/Brave + free OSM/Open-Meteo. Soft-parse + model repair for truncated JSON.',
  category: 'research', tier: 'research',
  providers: {
    search: ['tavily', 'serper', 'brave'],
    news: ['brave', 'serper', 'tavily'],
    weather: ['open-meteo', 'openweathermap', 'nws-alerts'],
    maps: ['leaflet+osm', 'leaflet.markercluster'],
  },
  triggers: ['show me images', 'find photos', 'image search', 'pictures of', 'search for', 'look up', 'find information', 'what is', 'who is', 'tell me about', 'latest news', 'news about', 'headlines', 'find restaurants', 'find hotels', 'places near', 'show me on a map', 'map of', 'directions from', 'route from', 'how do i get to', 'things to do in', 'weather in', "what's the weather", 'will it rain', 'temperature in', 'forecast for'],
  systemPrompt: SYSTEM_PROMPT,
  skillMd: `# Discovery Skill v1.3

## Actions
search · images · news · places · route · weather

## Providers
- Search: Tavily → Serper → Brave
- News: Brave → Serper → Tavily
- Weather: Open-Meteo (free) → OpenWeatherMap
- Maps: Leaflet + OSM (no key)

## Integration
- Keys sync from AETHER HOOKS
- Soft-parse + aggressive repair + optional model repair (truncated streams)
- Kernel flight logs on every execute
`,
  settings: { render: renderSettingsPanel, keys: KeyStore },
  tools: { webSearch, imageSearch, newsSearch, placeSearch, fetchWeather, geocode, getCurrentLocation, fetchWeatherAlerts, customProviders, cache: { get: cache.get, set: cache.set, clear: cache.clear } },
  renderers: { images: { render: renderImageGrid, loading: _renderImgLoading }, map: { render: renderMapResults, loading: _renderMapLoading }, weather: { render: renderWeatherCard, loading: _renderWxLoading }, places: { renderMap: renderPlacesMap, renderRoute: renderRouteMap } },
  execute, extractSpec, extractSpecAsync, openLightbox, KeyStore,
};

export default DiscoverySkill;
