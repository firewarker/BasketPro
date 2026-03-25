// ═══════════════════════════════════════════════════════════════
// BASKETPRO AI v6 — MOTORE PREDITTIVO AVANZATO
// 6 Modelli + Consensus + AI Analysis + Real Odds + Over/Under
// ═══════════════════════════════════════════════════════════════

const W = 'https://basketproai.lucalagan.workers.dev';
const FB = 'https://basketpro-1a28b-default-rtdb.europe-west1.firebasedatabase.app';

const LEAGUES = [
  { id:12, name:'NBA',            country:'USA',     flag:'🇺🇸', season:'2025-2026', top:true },
  { id:13, name:'Euroleague',     country:'Europa',  flag:'🇪🇺', season:'2025-2026', top:true },
  { id:117,name:'Liga ACB',       country:'Spagna',  flag:'🇪🇸', season:'2025-2026', top:true },
  { id:120,name:'Serie A',        country:'Italia',  flag:'🇮🇹', season:'2025-2026' },
  { id:116,name:'NCAA',           country:'USA',     flag:'🇺🇸', season:'2025-2026' },
  { id:5,  name:'Pro A',          country:'Francia', flag:'🇫🇷', season:'2025-2026' },
  { id:4,  name:'BBL',            country:'Germania',flag:'🇩🇪', season:'2025-2026' },
  { id:2,  name:'Greek League',   country:'Grecia',  flag:'🇬🇷', season:'2025-2026' },
  { id:22, name:'BSL',            country:'Turchia', flag:'🇹🇷', season:'2025-2026' },
  { id:80, name:'CBA',            country:'Cina',    flag:'🇨🇳', season:'2025-2026' },
];

// ═══ STATE ═══
const S = {
  view:'home',        // home | matches | analysis
  league:null,
  matches:[],
  match:null,
  dateOffset:0,
  loading:false,
  bref:null,          // Basketball-Reference advanced data
  odds:{},            // Real odds per game
  elo:{},             // Elo ratings per team
  picks:[],           // Daily picks
  aiCache:{},         // AI analysis cache
  gamesCache:{},      // team → games cache
  statsCache:{},      // team → stats cache
};

// ═══ MATH UTILITIES ═══
function normCDF(x){
  if(x<-8)return 0;if(x>8)return 1;
  const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911;
  const s=x<0?-1:1;const ax=Math.abs(x)/Math.SQRT2;
  const t=1/(1+p*ax);const y=1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-ax*ax);
  return .5*(1+s*y);
}
function log5(pA,pB){
  pA=Math.max(.01,Math.min(.99,pA));pB=Math.max(.01,Math.min(.99,pB));
  return(pA*(1-pB))/(pA*(1-pB)+(1-pA)*pB);
}
function clamp(lo,v,hi){return Math.max(lo,Math.min(hi,v))}
function fm(v,d=1){return(typeof v==='number'&&!isNaN(v))?v.toFixed(d):'—'}
function pct(v){return fm(v,0)+'%'}

function getDateStr(off=0){
  const d=new Date();d.setDate(d.getDate()+off);
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function getDateLabel(off){
  if(off===0)return'Oggi';if(off===1)return'Domani';if(off===-1)return'Ieri';
  const d=new Date();d.setDate(d.getDate()+off);
  return d.toLocaleDateString('it',{weekday:'short',day:'numeric',month:'short'});
}
function formatTime(dateStr){
  try{return new Date(dateStr).toLocaleTimeString('it',{hour:'2-digit',minute:'2-digit'})}catch(e){return'—'}
}

// ═══ API LAYER ═══
async function callWorker(path){
  try{
    const r=await fetch(W+path,{signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    return await r.json();
  }catch(e){console.warn('Worker error:',path,e.message);return null}
}

async function loadGamesForLeague(leagueId,date,season){
  const key=leagueId+'_'+date;
  if(S.gamesCache[key])return S.gamesCache[key];
  const d=await callWorker(`/api/basketball/games?league=${leagueId}&season=${season}&date=${date}&timezone=Europe/Rome`);
  const games=(d?.response||[]).filter(g=>g.teams?.home&&g.teams?.away);
  S.gamesCache[key]=games;
  return games;
}

async function loadTeamStats(teamId,leagueId,season){
  const key=teamId+'_'+season;
  if(S.statsCache[key])return S.statsCache[key];
  const d=await callWorker(`/api/basketball/statistics?team=${teamId}&league=${leagueId}&season=${season}`);
  S.statsCache[key]=d?.response||null;
  return S.statsCache[key];
}

async function loadTeamGames(teamId,leagueId,season){
  const key='g_'+teamId+'_'+season;
  if(S.gamesCache[key])return S.gamesCache[key];
  const d=await callWorker(`/api/basketball/games?team=${teamId}&league=${leagueId}&season=${season}`);
  const games=(d?.response||[]).filter(g=>['FT','AOT'].includes(g.status?.short)&&g.scores?.home?.total!=null);
  S.gamesCache[key]=games;
  return games;
}

async function loadBRefAdvanced(){
  if(S.bref)return S.bref;
  const d=await callWorker('/api/bref/team-stats?season=2026&type=advanced');
  if(d?.teams)S.bref=d.teams;
  return S.bref;
}

async function loadOdds(sport='basketball_nba'){
  const d=await callWorker(`/api/odds/${sport}`);
  if(!d?.games)return;
  d.games.forEach(g=>{
    const key=(g.home_team+'_'+g.away_team).toLowerCase().replace(/\s+/g,'');
    S.odds[key]=g;
  });
}

// ═══ DATA ANALYSIS ═══
function analyzeTeam(games,teamId){
  const fin=games.sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(!fin.length)return null;
  let tP=0,tO=0,w=0,hW=0,hG=0,aW=0,aG=0,wP=0,wO=0,wS=0;
  const form=[],margins=[],totals=[];
  fin.forEach((g,i)=>{
    const isH=g.teams.home.id===teamId;
    const my=isH?g.scores.home.total:g.scores.away.total;
    const op=isH?g.scores.away.total:g.scores.home.total;
    tP+=my;tO+=op;margins.push(my-op);totals.push(my+op);
    if(my>op)w++;
    if(isH){hG++;if(my>op)hW++}else{aG++;if(my>op)aW++}
    const wt=Math.pow(.93,i);wP+=my*wt;wO+=op*wt;wS+=wt;
    if(i<6)form.push(my>op?'W':'L');
  });
  const N=fin.length,ppg=tP/N,opg=tO/N;
  const l5=fin.slice(0,5);
  const l5ppg=l5.reduce((s,g)=>{const h=g.teams.home.id===teamId;return s+(h?g.scores.home.total:g.scores.away.total)},0)/Math.max(l5.length,1);
  const avgMar=margins.reduce((s,x)=>s+x,0)/N;
  const std=Math.sqrt(margins.reduce((s,x)=>s+(x-avgMar)**2,0)/N);

  // Over rate
  const avgT=totals.reduce((s,x)=>s+x,0)/N;
  const overRate=totals.filter(t=>t>210).length/N;

  // Streak
  let streak=0;
  if(form.length){const f=form[0];for(const r of form){if(r===f)streak++;else break}if(f==='L')streak=-streak}

  // Pythagorean Win% (Morey exponent 13.91)
  const exp=13.91;
  const pythWP=Math.pow(tP,exp)/(Math.pow(tP,exp)+Math.pow(tO,exp));

  return{ppg,opg,wPpg:wP/wS,wOpg:wO/wS,wp:w/N,hWP:hG?hW/hG:w/N,aWP:aG?aW/aG:w/N,
    net:ppg-opg,avgT,trend:(l5ppg-ppg)/Math.max(ppg,1),std,form,streak,N,w,
    pythWP,overRate,l5ppg,margins};
}

function headToHead(tid,opp){
  const all=Object.values(S.gamesCache).flat();
  const m=all.filter(g=>['FT','AOT'].includes(g.status?.short)&&
    ((g.teams.home.id===tid&&g.teams.away.id===opp)||(g.teams.home.id===opp&&g.teams.away.id===tid)));
  let w=0,pts=0;
  m.forEach(g=>{const h=g.teams.home.id===tid;const my=h?g.scores.home.total:g.scores.away.total;
    const op=h?g.scores.away.total:g.scores.home.total;if(my>op)w++;pts+=my});
  return{w,n:m.length,avgPts:m.length?pts/m.length:0};
}

function buildElo(games){
  const elo={};const K=20;
  games.filter(g=>['FT','AOT'].includes(g.status?.short)&&g.scores?.home?.total!=null)
    .sort((a,b)=>new Date(a.date)-new Date(b.date))
    .forEach(g=>{
      const h=g.teams.home.id,a=g.teams.away.id;
      if(!elo[h])elo[h]=1500;if(!elo[a])elo[a]=1500;
      const hs=g.scores.home.total,as_=g.scores.away.total;
      const exp=1/(1+Math.pow(10,-(elo[h]+75-elo[a])/400));
      const res=hs>as_?1:hs<as_?0:.5;
      const mov=Math.log(Math.abs(hs-as_)+1)*2.2/(Math.abs(elo[h]+75-elo[a])*.001+2.2);
      const adj=K*mov*(res-exp);
      elo[h]+=adj;elo[a]-=adj;
    });
  return elo;
}

// ═══ 6-MODEL PREDICTION ENGINE ═══
function predict(hD,aD,game,brefData){
  const hid=game.teams.home.id,aid=game.teams.away.id;
  const HCA=3; // Home court advantage in points
  const results=[];

  // === MODEL 1: EFFICIENCY (28%) — Weighted PPG/OPG ===
  const hPts=(hD.wPpg*.55+aD.wOpg*.45)+HCA*.6;
  const aPts=(aD.wPpg*.55+hD.wOpg*.45)-HCA*.4;
  const m1H=clamp(.2,hPts/(hPts+aPts),.8);
  results.push({name:'Efficiency',weight:.28,home:m1H,away:1-m1H,hPts,aPts});

  // === MODEL 2: ELO RATING (18%) ===
  const hElo=S.elo[hid]||1500,aElo=S.elo[aid]||1500;
  const eloAdj=hElo+75; // +75 HCA in Elo
  const m2H=clamp(.15,1/(1+Math.pow(10,-(eloAdj-aElo)/400)),.85);
  results.push({name:'Elo',weight:.18,home:m2H,away:1-m2H,hElo,aElo});

  // === MODEL 3: LOG5 METHOD (22%) ===
  const hWP=hD.wp,aWP=aD.wp;
  const l5Raw=log5(hWP,aWP);
  const m3H=clamp(.15,l5Raw*1.04,.85); // slight HCA boost
  results.push({name:'Log5',weight:.22,home:m3H,away:1-m3H});

  // === MODEL 4: MOMENTUM (12%) — Form + Streak ===
  let momH=.5;
  momH+=hD.trend*.25;momH-=aD.trend*.25;
  momH+=hD.streak*.015;momH-=aD.streak*.015;
  // H2H bonus
  const h2h=headToHead(hid,aid);
  if(h2h.n>=2)momH+=(h2h.w/h2h.n-.5)*.15;
  const m4H=clamp(.2,momH,.8);
  results.push({name:'Momentum',weight:.12,home:m4H,away:1-m4H,h2h});

  // === MODEL 5: PYTHAGOREAN WIN% (12%) ===
  const m5H=clamp(.15,log5(hD.pythWP,aD.pythWP)*1.03,.85);
  results.push({name:'Pythagorean',weight:.12,home:m5H,away:1-m5H,hPyth:hD.pythWP,aPyth:aD.pythWP});

  // === MODEL 6: FOUR FACTORS / B-REF (8%) ===
  let m6H=.5;
  if(brefData){
    const hName=game.teams.home.name.toLowerCase();
    const aName=game.teams.away.name.toLowerCase();
    const hBR=brefData.find(t=>(t.Team||'').toLowerCase().includes(hName.split(' ').pop()));
    const aBR=brefData.find(t=>(t.Team||'').toLowerCase().includes(aName.split(' ').pop()));
    if(hBR&&aBR){
      // ORtg difference + DRtg difference
      const hORtg=parseFloat(hBR.ORtg)||110,aORtg=parseFloat(aBR.ORtg)||110;
      const hDRtg=parseFloat(hBR.DRtg)||110,aDRtg=parseFloat(aBR.DRtg)||110;
      const hNet=(hORtg-hDRtg),aNet=(aORtg-aDRtg);
      m6H=clamp(.2,.5+(hNet-aNet)*0.015,.8);
    }
  }
  results.push({name:'Four Factors',weight:.08,home:m6H,away:1-m6H});

  // === CONSENSUS BLEND ===
  let cH=0,cA=0;
  results.forEach(m=>{cH+=m.home*m.weight;cA+=m.away*m.weight});
  // Normalize
  const tot=cH+cA;cH/=tot;cA/=tot;

  // === PREDICTED SCORE ===
  const baseH=(results[0].hPts||hD.ppg)*(1+hD.trend*.15);
  const baseA=(results[0].aPts||aD.ppg)*(1+aD.trend*.15);
  const predH=Math.round(clamp(80,baseH,145));
  const predA=Math.round(clamp(75,baseA,140));
  const predTotal=predH+predA;

  // === OVER/UNDER (Gaussian CDF) ===
  const avgT=(hD.avgT+aD.avgT)/2;
  const pace=avgT; // combined pace proxy
  const stdDev=Math.sqrt(hD.std**2+aD.std**2)*.65+8; // empirical SD for totals
  const line=Math.round(avgT*10)/10;
  const zOver=(predTotal-line)/Math.max(stdDev,5);
  const pOver=clamp(10,normCDF(zOver)*100,90);
  const pUnder=100-pOver;

  // Over/Under confidence reason
  let ouReason='';
  if(pOver>=65)ouReason=`Ritmo alto (avg ${fm(avgT,0)} pts), attesi ${predTotal}`;
  else if(pUnder>=65)ouReason=`Difese solide, attesi solo ${predTotal} pts`;
  else ouReason=`Linea equilibrata a ${fm(line,1)}, totale atteso ${predTotal}`;

  return{
    models:results,home:cH,away:cA,
    predH,predA,predTotal,
    line,pOver,pUnder,stdDev,ouReason,
    hElo,aElo,h2h,
    confidence:Math.abs(cH-cA)>.15?'high':Math.abs(cH-cA)>.08?'medium':'low',
    winner:cH>=cA?'home':'away',
    winnerProb:Math.max(cH,cA),
    spread:Math.round((cH-cA)*15*10)/10, // approx point spread
  };
}

// ═══ VALUE BET (Kelly Criterion) ═══
function calcValue(pred,odds){
  if(!odds)return null;
  const bk=odds.bookmakers?.[0];if(!bk)return null;
  const h2h=bk.markets?.find(m=>m.key==='h2h');
  const totals=bk.markets?.find(m=>m.key==='totals');
  const spreads=bk.markets?.find(m=>m.key==='spreads');
  const vals=[];

  if(h2h){
    const hOdds=h2h.outcomes?.find(o=>o.name===odds.home_team)?.price;
    const aOdds=h2h.outcomes?.find(o=>o.name===odds.away_team)?.price;
    if(hOdds){
      const edge=pred.home-1/hOdds;
      if(edge>.03)vals.push({bet:odds.home_team+' ML',odds:hOdds,prob:pred.home,edge,kelly:clamp(0,edge/(hOdds-1),.15)});
    }
    if(aOdds){
      const edge=pred.away-1/aOdds;
      if(edge>.03)vals.push({bet:odds.away_team+' ML',odds:aOdds,prob:pred.away,edge,kelly:clamp(0,edge/(aOdds-1),.15)});
    }
  }
  if(totals){
    const ov=totals.outcomes?.find(o=>o.name==='Over');
    const un=totals.outcomes?.find(o=>o.name==='Under');
    if(ov){
      const edge=pred.pOver/100-1/ov.price;
      if(edge>.03)vals.push({bet:`Over ${ov.point}`,odds:ov.price,prob:pred.pOver/100,edge,kelly:clamp(0,edge/(ov.price-1),.15)});
    }
    if(un){
      const edge=pred.pUnder/100-1/un.price;
      if(edge>.03)vals.push({bet:`Under ${un.point}`,odds:un.price,prob:pred.pUnder/100,edge,kelly:clamp(0,edge/(un.price-1),.15)});
    }
  }
  return vals.length?vals.sort((a,b)=>b.edge-a.edge):null;
}

// ═══ AI ANALYSIS (Groq via Worker) ═══
async function askAI(game,pred,hD,aD){
  const key=game.id;
  if(S.aiCache[key])return S.aiCache[key];

  const hName=game.teams.home.name,aName=game.teams.away.name;
  const prompt=`Analizza questa partita di basket:
${hName} (Casa) vs ${aName} (Trasferta)
Statistiche Casa: ${hD.N}g, ${pct(hD.wp*100)}W, PPG ${fm(hD.ppg)}, OPG ${fm(hD.opg)}, forma ${hD.form.join('')}, Pyth% ${pct(hD.pythWP*100)}
Statistiche Ospite: ${aD.N}g, ${pct(aD.wp*100)}W, PPG ${fm(aD.ppg)}, OPG ${fm(aD.opg)}, forma ${aD.form.join('')}, Pyth% ${pct(aD.pythWP*100)}
Elo: ${Math.round(S.elo[game.teams.home.id]||1500)} vs ${Math.round(S.elo[game.teams.away.id]||1500)}
Consensus AI: ${hName} ${pct(pred.home*100)} — ${aName} ${pct(pred.away*100)}
Score previsto: ${pred.predH}-${pred.predA} | Linea O/U: ${fm(pred.line,1)} (Over ${pct(pred.pOver)})
H2H: ${pred.h2h.n} partite, ${hName} vinte ${pred.h2h.w}

Rispondi in italiano con:
1. Pronostico principale (1 o 2 e perché, max 2 frasi)
2. Over o Under e perché (1 frase)
3. Livello di confidenza: ALTA / MEDIA / BASSA
4. Un fattore chiave da considerare`;

  try{
    const r=await fetch(W+'/api/groq',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt})
    });
    if(!r.ok)throw new Error('HTTP '+r.status);
    const d=await r.json();
    const text=d.text||d.choices?.[0]?.message?.content||'';
    S.aiCache[key]=text;
    return text;
  }catch(e){
    console.warn('AI error:',e.message);
    return null;
  }
}

// ═══ DAILY PICKS ═══
function calculatePicks(){
  if(!S.matches.length)return;
  const picks=[];

  S.matches.forEach(game=>{
    if(!game._pred)return;
    const p=game._pred;
    const matchName=game.teams.home.name.split(' ').slice(-1)[0]+' - '+game.teams.away.name.split(' ').slice(-1)[0];
    const league=S.league?.name||'';
    const time=formatTime(game.date);

    // Best pick: highest probability prediction
    if(p.winnerProb>=.60){
      const winTeam=p.winner==='home'?game.teams.home.name:game.teams.away.name;
      picks.push({
        game,matchName,league,time,
        bet:winTeam,
        type:'winner',
        prob:p.winnerProb,
        confidence:p.confidence,
        reason:`Consensus ${pct(p.winnerProb*100)} (${p.models.filter(m=>m[p.winner]>.55).length}/6 modelli)`
      });
    }

    // Over pick
    if(p.pOver>=62){
      picks.push({
        game,matchName,league,time,
        bet:`Over ${fm(p.line,1)}`,
        type:'over',
        prob:p.pOver/100,
        confidence:p.pOver>=70?'high':'medium',
        reason:p.ouReason
      });
    }
    // Under pick
    if(p.pUnder>=62){
      picks.push({
        game,matchName,league,time,
        bet:`Under ${fm(p.line,1)}`,
        type:'under',
        prob:p.pUnder/100,
        confidence:p.pUnder>=70?'high':'medium',
        reason:p.ouReason
      });
    }
  });

  picks.sort((a,b)=>b.prob-a.prob);
  S.picks=picks;
}

// ═══ FULL MATCH ANALYSIS ═══
async function analyzeMatch(game){
  S.loading=true;S.match=game;S.view='analysis';render();

  const hid=game.teams.home.id,aid=game.teams.away.id;
  const lid=S.league.id,ssn=S.league.season;

  // Load data in parallel
  const [hGames,aGames,bref]=await Promise.all([
    loadTeamGames(hid,lid,ssn),
    loadTeamGames(aid,lid,ssn),
    lid===12?loadBRefAdvanced():Promise.resolve(null),
  ]);

  // Build Elo from all loaded games
  const allGames=[...hGames,...aGames];
  const eloMap=buildElo(allGames);
  Object.assign(S.elo,eloMap);

  // Analyze teams
  const hD=analyzeTeam(hGames,hid);
  const aD=analyzeTeam(aGames,aid);

  if(!hD||!aD){
    game._pred=null;game._hD=null;game._aD=null;
    S.loading=false;render();return;
  }

  game._hD=hD;game._aD=aD;

  // Run prediction engine
  const pred=predict(hD,aD,game,bref);
  game._pred=pred;

  // Find real odds
  const hKey=(game.teams.home.name+'_'+game.teams.away.name).toLowerCase().replace(/\s+/g,'');
  const odds=S.odds[hKey]||null;
  if(odds)game._odds=odds;
  game._value=calcValue(pred,odds);

  // Load AI analysis (non-blocking)
  askAI(game,pred,hD,aD).then(text=>{game._ai=text;render()});

  S.loading=false;render();
}

// ═══ LOAD MATCHES ═══
async function loadMatches(){
  if(!S.league)return;
  S.loading=true;S.view='matches';S.matches=[];render();

  const date=getDateStr(S.dateOffset);
  const games=await loadGamesForLeague(S.league.id,date,S.league.season);

  // Quick Elo + quick predictions for match list
  if(games.length){
    const allGames=[];
    // Load recent games for all teams to get quick stats
    const teamIds=new Set();
    games.forEach(g=>{teamIds.add(g.teams.home.id);teamIds.add(g.teams.away.id)});

    const loads=[];
    teamIds.forEach(tid=>{loads.push(loadTeamGames(tid,S.league.id,S.league.season))});
    const allResults=await Promise.all(loads);
    allResults.forEach(g=>allGames.push(...g));

    // Build Elo
    const eloMap=buildElo(allGames);
    Object.assign(S.elo,eloMap);

    // Load B-Ref for NBA
    if(S.league.id===12)await loadBRefAdvanced();

    // Load odds for NBA / Euroleague
    if(S.league.id===12)await loadOdds('basketball_nba');
    if(S.league.id===13)await loadOdds('basketball_euroleague');

    // Quick predict each match
    games.forEach(game=>{
      const hid=game.teams.home.id,aid=game.teams.away.id;
      const hGames=S.gamesCache['g_'+hid+'_'+S.league.season]||[];
      const aGames=S.gamesCache['g_'+aid+'_'+S.league.season]||[];
      const hD=analyzeTeam(hGames,hid);
      const aD=analyzeTeam(aGames,aid);
      if(hD&&aD){
        game._hD=hD;game._aD=aD;
        game._pred=predict(hD,aD,game,S.bref);
      }
    });
  }

  S.matches=games;
  calculatePicks();
  S.loading=false;
  render();
}

// ═══ RENDER ENGINE ═══
function render(){
  const app=document.getElementById('app');
  if(!app)return;
  app.innerHTML=renderHeader()+renderBody()+renderBottomNav();
  attachEvents();
}

function renderHeader(){
  return`<div class="header"><div class="header-top">
    <div class="logo"><div class="logo-icon">B</div><div class="logo-text">Basket<span>Pro</span> AI</div></div>
    <div class="header-actions">
      <button class="header-btn${S.view==='home'?' active':''}" data-nav="home">Home</button>
    </div>
  </div></div>`+
  (S.view==='matches'||S.view==='home'?renderDateTabs():'');
}

function renderDateTabs(){
  let h='<div class="date-tabs">';
  for(let i=-1;i<=3;i++){
    h+=`<div class="date-tab${S.dateOffset===i?' active':''}" data-date="${i}">${getDateLabel(i)}</div>`;
  }
  return h+'</div>';
}

function renderBody(){
  if(S.view==='analysis')return renderAnalysis();
  if(S.view==='matches')return renderMatches();
  return renderHome();
}

// === HOME ===
function renderHome(){
  let h='<div class="section-title">Campionati</div><div class="league-list">';
  LEAGUES.forEach(l=>{
    h+=`<div class="league-item" data-league="${l.id}">
      <div class="league-flag">${l.flag}</div>
      <div class="league-info"><div class="league-name">${l.name}</div><div class="league-country">${l.country}</div></div>
      ${l.top?'<div class="league-badge">TOP</div>':''}
      <div class="league-arrow">›</div>
    </div>`;
  });
  h+='</div>';

  // Show picks if any
  if(S.picks.length){
    h+='<div class="section-title">Picks del giorno</div><div class="picks-section">';
    S.picks.slice(0,8).forEach(pk=>{
      const conf=pk.confidence==='high'?'high':pk.confidence==='medium'?'medium':'low';
      h+=`<div class="pick-card" data-pickgame="${pk.game.id}">
        <div class="pick-top"><div class="pick-match">${pk.matchName}</div><div class="pick-league">${pk.league} ${pk.time}</div></div>
        <div class="pick-bottom">
          <div class="pick-bet${pk.type==='over'||pk.type==='under'?' over':''}">${pk.bet}</div>
          <div class="pick-confidence ${conf}">${pct(pk.prob*100)}</div>
          <div class="pick-reason">${pk.reason}</div>
        </div>
      </div>`;
    });
    h+='</div>';
  }
  return h;
}

// === MATCH LIST ===
function renderMatches(){
  let h=`<div class="back-bar" data-back="home"><span class="back-arrow">‹</span><span class="back-title">${S.league?.flag||''} ${S.league?.name||''}</span></div>`;

  if(S.loading){
    h+='<div class="sk-card"><div class="sk sk-line l"></div><div class="sk sk-line m"></div><div class="sk sk-line s"></div></div>'.repeat(4);
    return h;
  }
  if(!S.matches.length)return h+'<div class="empty"><div class="empty-icon">🏀</div><div class="empty-text">Nessuna partita per questa data</div></div>';

  // Show picks for this league
  if(S.picks.length){
    h+='<div class="section-title">Migliori picks</div><div class="picks-section">';
    S.picks.slice(0,3).forEach(pk=>{
      const conf=pk.confidence==='high'?'high':pk.confidence==='medium'?'medium':'low';
      h+=`<div class="pick-card" data-match="${pk.game.id}">
        <div class="pick-top"><div class="pick-match">${pk.matchName}</div></div>
        <div class="pick-bottom">
          <div class="pick-bet${pk.type!=='winner'?' over':''}">${pk.bet}</div>
          <div class="pick-confidence ${conf}">${pct(pk.prob*100)}</div>
          <div class="pick-reason">${pk.reason}</div>
        </div>
      </div>`;
    });
    h+='</div>';
  }

  h+='<div class="section-title">Tutte le partite</div>';
  S.matches.forEach(g=>{
    const isLive=['1H','2H','HT','QT1','QT2','QT3','QT4'].includes(g.status?.short);
    const isFT=['FT','AOT'].includes(g.status?.short);
    const p=g._pred;
    let quickH='';
    if(p){
      const winner=p.winner==='home'?'home':'away';
      const winName=p.winner==='home'?g.teams.home.name.split(' ').pop():g.teams.away.name.split(' ').pop();
      quickH=`<div class="match-quick">
        <div class="match-pick ${winner}">${winName} ${pct(p.winnerProb*100)}</div>
        <div class="match-pick ${p.pOver>=55?'over':'under'}">${p.pOver>=55?'O':'U'} ${fm(p.line,0)}</div>
      </div>`;
    }

    h+=`<div class="match-item" data-match="${g.id}">
      <div class="match-time${isLive?' live':''}">${isLive?'LIVE':isFT?'FT':formatTime(g.date)}</div>
      <div class="match-teams">
        <div class="match-team home">${g.teams.home.name}</div>
        <div class="match-team">${g.teams.away.name}</div>
      </div>
      ${isFT||isLive?`<div class="match-scores"><span>${g.scores.home.total??'—'}</span><span>${g.scores.away.total??'—'}</span></div>`:''}
      ${quickH}
    </div>`;
  });
  return h;
}

// === FULL ANALYSIS ===
function renderAnalysis(){
  const g=S.match;if(!g)return'';
  const p=g._pred,hD=g._hD,aD=g._aD;

  let h=`<div class="back-bar" data-back="matches"><span class="back-arrow">‹</span><span class="back-title">Torna alle partite</span></div>`;
  h+=`<div class="analysis-hero fade-in">
    <div class="hero-vs">${S.league?.name||''} · ${formatTime(g.date)}</div>
    <div class="hero-teams">
      <div class="hero-team home">${g.teams.home.name}</div>
      <div class="hero-divider">vs</div>
      <div class="hero-team away">${g.teams.away.name}</div>
    </div>
  </div>`;

  if(S.loading||!p){
    h+='<div style="padding:40px;text-align:center"><div class="spinner"></div><div style="margin-top:12px;color:var(--text-d);font-size:.8rem">Analisi in corso...</div></div>';
    return h;
  }

  // === PREDICTION CARDS ===
  h+='<div class="pred-grid fade-in">';
  // Winner
  const winTeam=p.winner==='home'?g.teams.home.name:g.teams.away.name;
  h+=`<div class="pred-card highlight">
    <div class="pred-badge best">BEST</div>
    <div class="pred-label">Vincitore</div>
    <div class="pred-value ${p.winner}">${pct(p.winnerProb*100)}</div>
    <div class="pred-sub">${winTeam}</div>
    <div class="pred-bar"><div class="pred-bar-fill" style="width:${p.winnerProb*100}%;background:${p.winner==='home'?'var(--accent)':'var(--blue)'}"></div></div>
  </div>`;
  // Score
  h+=`<div class="pred-card">
    <div class="pred-label">Score previsto</div>
    <div class="score-pred"><span class="score-num h">${p.predH}</span><span class="score-dash">—</span><span class="score-num a">${p.predA}</span></div>
    <div class="pred-sub">Spread: ${p.spread>0?'+':''}${fm(p.spread,1)}</div>
  </div>`;
  // Over
  h+=`<div class="pred-card${p.pOver>=60?' highlight':''}">
    ${p.pOver>=65?'<div class="pred-badge best">PICK</div>':''}
    <div class="pred-label">Over ${fm(p.line,1)}</div>
    <div class="pred-value over">${pct(p.pOver)}</div>
    <div class="pred-sub">Totale atteso: ${p.predTotal}</div>
    <div class="pred-bar"><div class="pred-bar-fill" style="width:${p.pOver}%;background:var(--green)"></div></div>
  </div>`;
  // Under
  h+=`<div class="pred-card${p.pUnder>=60?' highlight':''}">
    ${p.pUnder>=65?'<div class="pred-badge best">PICK</div>':''}
    <div class="pred-label">Under ${fm(p.line,1)}</div>
    <div class="pred-value under">${pct(p.pUnder)}</div>
    <div class="pred-sub">${p.ouReason}</div>
    <div class="pred-bar"><div class="pred-bar-fill" style="width:${p.pUnder}%;background:var(--gold)"></div></div>
  </div>`;
  h+='</div>';

  // === CONSENSUS BAR ===
  h+=`<div class="consensus fade-in"><div class="consensus-card">
    <div class="consensus-title">⚡ Consensus Engine (6 modelli)</div>
    <div class="consensus-bar">
      <div class="consensus-seg h" style="width:${p.home*100}%">${pct(p.home*100)}</div>
      <div class="consensus-seg a" style="width:${p.away*100}%">${pct(p.away*100)}</div>
    </div>
    <div class="consensus-labels">
      <span class="hl">${g.teams.home.name}</span>
      <span>Confidenza: ${p.confidence==='high'?'🟢 Alta':p.confidence==='medium'?'🟡 Media':'⚪ Bassa'}</span>
      <span class="al">${g.teams.away.name}</span>
    </div>
  </div></div>`;

  // === MODEL DETAILS ===
  h+='<div class="panel fade-in"><div class="panel-header" data-toggle="models"><div class="panel-title">📊 Dettaglio 6 modelli</div><div class="panel-chevron">▼</div></div>';
  h+='<div class="panel-body"><div class="model-row">';
  p.models.forEach(m=>{
    const winner=m.home>=.5?'h':'a';
    const prob=Math.max(m.home,m.away);
    h+=`<div class="model-pill"><div class="dot ${winner}"></div>${m.name} ${pct(prob*100)} (${Math.round(m.weight*100)}%)</div>`;
  });
  h+='</div>';
  // Elo detail
  h+=`<table class="stats-table"><tr><th>Metrica</th><th>${g.teams.home.name}</th><th>${g.teams.away.name}</th></tr>
    <tr><td>Elo Rating</td><td class="val">${Math.round(p.hElo)}</td><td class="val">${Math.round(p.aElo)}</td></tr>
    <tr><td>H2H (${p.h2h.n}g)</td><td class="val">${p.h2h.w}W</td><td class="val">${p.h2h.n-p.h2h.w}W</td></tr>
    <tr><td>Pyth Win%</td><td class="val">${pct(hD.pythWP*100)}</td><td class="val">${pct(aD.pythWP*100)}</td></tr>
  </table></div></div>`;

  // === OVER/UNDER VISUAL ===
  h+='<div class="panel fade-in"><div class="panel-header" data-toggle="ou"><div class="panel-title">📈 Over/Under Analysis</div><div class="panel-chevron">▼</div></div>';
  h+=`<div class="panel-body">
    <div class="ou-visual">
      <div class="ou-seg over" style="width:${p.pOver}%">Over ${pct(p.pOver)}</div>
      <div class="ou-seg under" style="width:${p.pUnder}%">Under ${pct(p.pUnder)}</div>
    </div>
    <table class="stats-table">
      <tr><td>Linea</td><td class="val">${fm(p.line,1)} pts</td></tr>
      <tr><td>Totale previsto</td><td class="val ${p.predTotal>p.line?'good':'bad'}">${p.predTotal} pts</td></tr>
      <tr><td>Media casa (tot)</td><td class="val">${fm(hD.avgT,1)}</td></tr>
      <tr><td>Media ospite (tot)</td><td class="val">${fm(aD.avgT,1)}</td></tr>
      <tr><td>Over Rate casa</td><td class="val">${pct(hD.overRate*100)}</td></tr>
      <tr><td>Over Rate ospite</td><td class="val">${pct(aD.overRate*100)}</td></tr>
      <tr><td>Deviazione std</td><td class="val">±${fm(p.stdDev,1)}</td></tr>
    </table>
  </div></div>`;

  // === TEAM STATS ===
  h+='<div class="panel fade-in"><div class="panel-header" data-toggle="stats"><div class="panel-title">📋 Statistiche squadre</div><div class="panel-chevron">▼</div></div>';
  h+=`<div class="panel-body"><table class="stats-table">
    <tr><th>Stat</th><th>${g.teams.home.name}</th><th>${g.teams.away.name}</th></tr>
    <tr><td>PPG</td><td class="val">${fm(hD.ppg)}</td><td class="val">${fm(aD.ppg)}</td></tr>
    <tr><td>OPG (subiti)</td><td class="val">${fm(hD.opg)}</td><td class="val">${fm(aD.opg)}</td></tr>
    <tr><td>Net Rating</td><td class="val ${hD.net>0?'good':'bad'}">${hD.net>0?'+':''}${fm(hD.net)}</td><td class="val ${aD.net>0?'good':'bad'}">${aD.net>0?'+':''}${fm(aD.net)}</td></tr>
    <tr><td>Win%</td><td class="val">${pct(hD.wp*100)}</td><td class="val">${pct(aD.wp*100)}</td></tr>
    <tr><td>Casa/Trasf%</td><td class="val">${pct(hD.hWP*100)}</td><td class="val">${pct(aD.aWP*100)}</td></tr>
    <tr><td>L5 PPG</td><td class="val">${fm(hD.l5ppg)}</td><td class="val">${fm(aD.l5ppg)}</td></tr>
    <tr><td>Trend</td><td class="val ${hD.trend>0?'good':'bad'}">${hD.trend>0?'+':''}${fm(hD.trend*100)}%</td><td class="val ${aD.trend>0?'good':'bad'}">${aD.trend>0?'+':''}${fm(aD.trend*100)}%</td></tr>
    <tr><td>Streak</td><td class="val ${hD.streak>0?'good':'bad'}">${hD.streak>0?'+'+hD.streak:hD.streak}</td><td class="val ${aD.streak>0?'good':'bad'}">${aD.streak>0?'+'+aD.streak:aD.streak}</td></tr>
    <tr><td>Partite</td><td class="val">${hD.N}</td><td class="val">${aD.N}</td></tr>
  </table>
  <div style="display:flex;justify-content:space-between;margin-top:10px">
    <div><div style="font-size:.65rem;color:var(--text-d);margin-bottom:4px">Forma ${g.teams.home.name}</div><div class="form-row">${hD.form.map(f=>`<div class="form-dot ${f}">${f}</div>`).join('')}</div></div>
    <div><div style="font-size:.65rem;color:var(--text-d);margin-bottom:4px">Forma ${g.teams.away.name}</div><div class="form-row">${aD.form.map(f=>`<div class="form-dot ${f}">${f}</div>`).join('')}</div></div>
  </div>
  </div></div>`;

  // === REAL ODDS ===
  if(g._odds||g._value){
    h+='<div class="panel fade-in"><div class="panel-header" data-toggle="odds"><div class="panel-title">💰 Quote reali & Value Bet</div><div class="panel-chevron">▼</div></div>';
    h+='<div class="panel-body">';
    if(g._odds){
      const bk=g._odds.bookmakers?.[0];
      if(bk){
        const h2h=bk.markets?.find(m=>m.key==='h2h');
        const totals=bk.markets?.find(m=>m.key==='totals');
        if(h2h){
          h+='<div style="font-size:.65rem;color:var(--text-d);margin-bottom:4px">Moneyline ('+bk.title+')</div><div class="odds-row">';
          h2h.outcomes.forEach(o=>{h+=`<div class="odds-chip"><div class="lbl">${o.name}</div><div class="val">${fm(o.price,2)}</div></div>`});
          h+='</div>';
        }
        if(totals){
          h+='<div style="font-size:.65rem;color:var(--text-d);margin-bottom:4px;margin-top:8px">Totali</div><div class="odds-row">';
          totals.outcomes.forEach(o=>{h+=`<div class="odds-chip"><div class="lbl">${o.name} ${o.point||''}</div><div class="val">${fm(o.price,2)}</div></div>`});
          h+='</div>';
        }
      }
    }
    if(g._value&&g._value.length){
      h+='<div style="font-size:.72rem;color:var(--green);font-weight:600;margin-top:12px;margin-bottom:6px">Value Bets trovate</div>';
      g._value.forEach(v=>{
        h+=`<div class="odds-chip value" style="margin-bottom:6px;text-align:left;padding:10px 12px">
          <div style="font-weight:700;font-size:.82rem;color:var(--green)">${v.bet} @ ${fm(v.odds,2)}</div>
          <div style="font-size:.68rem;color:var(--text-g);margin-top:2px">Edge: +${pct(v.edge*100)} | Kelly: ${pct(v.kelly*100)} del capitale | Prob: ${pct(v.prob*100)}</div>
        </div>`;
      });
    }
    h+='</div></div>';
  }

  // === AI ANALYSIS ===
  h+='<div class="ai-card fade-in"><div class="ai-title">🤖 Analisi AI</div>';
  if(g._ai){
    h+=`<div class="ai-text">${g._ai.replace(/\n/g,'<br>')}</div>`;
  }else{
    h+='<div class="ai-loading"><div class="spinner" style="display:inline-block;width:14px;height:14px;border-width:1.5px;vertical-align:middle;margin-right:6px"></div>Analisi AI in corso...</div>';
  }
  h+='</div>';

  return h;
}

function renderBottomNav(){
  return`<div class="bottom-nav"><div class="bottom-nav-inner">
    <div class="nav-btn${S.view==='home'?' active':''}" data-nav="home"><span class="nav-icon">🏠</span>Home</div>
    <div class="nav-btn${S.view==='matches'?' active':''}" data-nav="matches"><span class="nav-icon">🏀</span>Partite</div>
  </div></div>`;
}

// ═══ EVENTS ═══
function attachEvents(){
  document.querySelectorAll('[data-league]').forEach(el=>{
    el.onclick=()=>{S.league=LEAGUES.find(l=>l.id==el.dataset.league);loadMatches()};
  });
  document.querySelectorAll('[data-match]').forEach(el=>{
    el.onclick=()=>{const g=S.matches.find(m=>m.id==el.dataset.match);if(g)analyzeMatch(g)};
  });
  document.querySelectorAll('[data-pickgame]').forEach(el=>{
    el.onclick=()=>{
      const pk=S.picks.find(p=>p.game.id==el.dataset.pickgame);
      if(pk){S.match=pk.game;S.view='analysis';render();if(!pk.game._pred)analyzeMatch(pk.game)}
    };
  });
  document.querySelectorAll('[data-date]').forEach(el=>{
    el.onclick=()=>{S.dateOffset=parseInt(el.dataset.date);if(S.league)loadMatches();else render()};
  });
  document.querySelectorAll('[data-back]').forEach(el=>{
    el.onclick=()=>{S.view=el.dataset.back;render()};
  });
  document.querySelectorAll('[data-nav]').forEach(el=>{
    el.onclick=()=>{S.view=el.dataset.nav;render()};
  });
  document.querySelectorAll('[data-toggle]').forEach(el=>{
    el.onclick=()=>{
      const body=el.nextElementSibling;
      const chev=el.querySelector('.panel-chevron');
      if(body){body.classList.toggle('open');if(chev)chev.classList.toggle('open')}
    };
  });
}

// ═══ INIT ═══
async function init(){
  console.log('🏀 BasketPro AI v6 — Starting...');
  render();

  // Pre-load NBA games for today for picks on home
  const nbaLeague=LEAGUES.find(l=>l.id===12);
  if(nbaLeague){
    S.league=nbaLeague;
    await loadMatches();
    S.view='home';
    S.league=null;
    render();
  }
}

document.addEventListener('DOMContentLoaded',init);
