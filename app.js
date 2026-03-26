// ═══════════════════════════════════════════════════════════════
// BASKETPRO AI v6 — MOTORE PREDITTIVO AVANZATO
// 6 Modelli + Consensus + AI Analysis + Real Odds + Over/Under
// ═══════════════════════════════════════════════════════════════

const W = 'https://basketproai.lucalagan.workers.dev';
const FB = 'https://basketpro-1a28b-default-rtdb.europe-west1.firebasedatabase.app';

// Lista espansa per trovare tutti i campionati principali e secondari
const LEAGUES = [
  { id:12, name:'NBA', country:'USA', flag:'🇺🇸', season:'2025-2026', top:true },
  { id:13, name:'Euroleague', country:'Europa', flag:'🇪🇺', season:'2025-2026', top:true },
  { id:117,name:'Liga ACB', country:'Spagna', flag:'🇪🇸', season:'2025-2026', top:true },
  { id:120,name:'Serie A', country:'Italia', flag:'🇮🇹', season:'2025-2026', top:true },
  { id:116,name:'NCAA', country:'USA', flag:'🇺🇸', season:'2025-2026' },
  { id:142,name:'Lega A2', country:'Italia', flag:'🇮🇹', season:'2025-2026' },
  { id:5,  name:'Pro A', country:'Francia', flag:'🇫🇷', season:'2025-2026' },
  { id:4,  name:'BBL', country:'Germania', flag:'🇩🇪', season:'2025-2026' },
  { id:2,  name:'Greek League', country:'Grecia', flag:'🇬🇷', season:'2025-2026' },
  { id:22, name:'BSL', country:'Turchia', flag:'🇹🇷', season:'2025-2026' },
  { id:80, name:'CBA', country:'Cina', flag:'🇨🇳', season:'2025-2026' },
  { id:15, name:'Eurocup', country:'Europa', flag:'🇪🇺', season:'2025-2026' },
  { id:18, name:'Champions League', country:'Europa', flag:'🇪🇺', season:'2025-2026' },
  { id:19, name:'BNXT League', country:'Belgio/Olanda', flag:'🇧🇪', season:'2025-2026' },
  { id:7,  name:'VTB United League', country:'Russia', flag:'🇷🇺', season:'2025-2026' },
  { id:24, name:'KBL', country:'Corea del Sud', flag:'🇰🇷', season:'2025-2026' },
  { id:21, name:'NBL', country:'Australia', flag:'🇦🇺', season:'2025-2026' },
  { id:20, name:'B.League', country:'Giappone', flag:'🇯🇵', season:'2025-2026' },
  { id:26, name:'Super League', country:'Israele', flag:'🇮🇱', season:'2025-2026' },
  { id:119,name:'Liga Nacional', country:'Argentina', flag:'🇦🇷', season:'2025-2026' },
  { id:118,name:'NBB', country:'Brasile', flag:'🇧🇷', season:'2025-2026' },
  { id:23, name:'LKL', country:'Lituania', flag:'🇱🇹', season:'2025-2026' },
  { id:6,  name:'PBL', country:'Polonia', flag:'🇵🇱', season:'2025-2026' },
];

// ═══ STATE ═══
const S = {
  dynamicLeagues:[],
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

async function saveToFirebase(path, data) {
  try {
    await fetch(`${FB}/${path}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch(e) { console.error('Firebase save error:', e); }
}

async function loadFromFirebase(path) {
  try {
    const r = await fetch(`${FB}/${path}.json`);
    if(r.ok) return await r.json();
  } catch(e) { console.error('Firebase load error:', e); }
  return null;
}

async function callWorker(path){
  try{
    const r=await fetch(W+path,{signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    return await r.json();
  }catch(e){console.warn('Worker error:',path,e.message);return null}
}

async function loadGamesForLeague(leagueId,date){
  const key="ALL_GAMES_"+date;
  if(!S.gamesCache[key]){
    const d=await callWorker(`/api/basketball/games?date=${date}&timezone=Europe/Rome`);
    S.gamesCache[key]=(d?.response||[]).filter(g=>g.teams?.home&&g.teams?.away);
  }
  return S.gamesCache[key].filter(g=>g.league?.id==leagueId);
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

// ═══ STAR PLAYER ABSENCE DETECTION (BallDontLie) ═══
// Solo NBA: cerca star player (20+ PPG) assenti dalle ultime 3 partite
const starCache={};

// Mappa nomi squadre API-Basketball → BDL search terms
const NBA_TEAM_MAP={
  'Los Angeles Lakers':'Lakers','Boston Celtics':'Celtics','Golden State Warriors':'Warriors',
  'Milwaukee Bucks':'Bucks','Denver Nuggets':'Nuggets','Philadelphia 76ers':'76ers',
  'Phoenix Suns':'Suns','Miami Heat':'Heat','Dallas Mavericks':'Mavericks',
  'Cleveland Cavaliers':'Cavaliers','Memphis Grizzlies':'Grizzlies','Sacramento Kings':'Kings',
  'New York Knicks':'Knicks','Brooklyn Nets':'Nets','LA Clippers':'Clippers',
  'Minnesota Timberwolves':'Timberwolves','New Orleans Pelicans':'Pelicans',
  'Oklahoma City Thunder':'Thunder','Atlanta Hawks':'Hawks','Chicago Bulls':'Bulls',
  'Toronto Raptors':'Raptors','Indiana Pacers':'Pacers','Orlando Magic':'Magic',
  'Portland Trail Blazers':'Trail Blazers','Utah Jazz':'Jazz','Charlotte Hornets':'Hornets',
  'San Antonio Spurs':'Spurs','Detroit Pistons':'Pistons','Washington Wizards':'Wizards',
  'Houston Rockets':'Rockets',
};

async function detectStarAbsences(teamName){
  // Solo NBA
  const shortName=NBA_TEAM_MAP[teamName];
  if(!shortName)return[];

  const cKey='star_'+shortName;
  if(starCache[cKey])return starCache[cKey];

  try{
    // Step 1: Trova giocatori della squadra via BDL
    const playersRes=await callWorker(`/api/bdl/players?search=${encodeURIComponent(shortName)}&per_page=25`);
    const players=playersRes?.data;
    if(!players||!players.length){starCache[cKey]=[];return[];}

    // Filtra solo giocatori attivi della squadra giusta
    const teamPlayers=players.filter(p=>
      p.team&&(p.team.full_name||'').toLowerCase().includes(shortName.toLowerCase())
    );
    if(!teamPlayers.length){starCache[cKey]=[];return[];}

    // Step 2: Prendi le season averages per trovare gli star player
    const pIds=teamPlayers.slice(0,15).map(p=>p.id);
    const idsParam=pIds.map(id=>`player_ids[]=${id}`).join('&');
    const avgRes=await callWorker(`/api/bdl/season_averages?season=2025&${idsParam}`);
    const avgs=avgRes?.data||[];

    // Star = 18+ PPG (soglia leggermente più bassa per catturare più star)
    const stars=avgs.filter(a=>a.pts>=18).map(a=>{
      const player=teamPlayers.find(p=>p.id===a.player_id);
      return{
        id:a.player_id,
        name:player?`${player.first_name} ${player.last_name}`:'Unknown',
        ppg:a.pts,
        rpg:a.reb,
        apg:a.ast,
        gp:a.games_played
      };
    }).sort((a,b)=>b.ppg-a.ppg);

    if(!stars.length){starCache[cKey]=[];return[];}

    // Step 3: Controlla le ultime 3 date di gioco
    const dates=[];
    for(let i=1;i<=5;i++){
      const d=new Date();d.setDate(d.getDate()-i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const datesParam=dates.map(d=>`dates[]=${d}`).join('&');

    const absences=[];
    for(const star of stars.slice(0,3)){ // max 3 star player per squadra
      const statsRes=await callWorker(`/api/bdl/stats?${datesParam}&player_ids[]=${star.id}&per_page=10`);
      const stats=statsRes?.data||[];
      const gamesPlayed=stats.filter(s=>s.min&&s.min!=='00'&&s.min!=='0:00'&&parseInt(s.min)>0);

      if(gamesPlayed.length===0){
        // Star player non ha giocato nessuna partita negli ultimi 5 giorni
        absences.push({
          ...star,
          status:'absent',
          label:`${star.name} (${fm(star.ppg,1)} PPG) assente ultime partite`,
          impact: star.ppg>=25?'critical':star.ppg>=20?'high':'moderate'
        });
      }else if(gamesPlayed.length===1&&dates.length>=3){
        // Ha giocato solo 1 su 3+ → possibile gestione minutaggio
        const lastGame=gamesPlayed[0];
        if(parseInt(lastGame.min)<20){
          absences.push({
            ...star,
            status:'limited',
            label:`${star.name} (${fm(star.ppg,1)} PPG) minutaggio limitato (${lastGame.min} min)`,
            impact:'moderate'
          });
        }
      }
    }

    starCache[cKey]=absences;
    return absences;

  }catch(e){
    console.warn('BDL star detection error:',teamName,e.message);
    starCache[cKey]=[];
    return[];
  }
}

// Penalità da applicare al Consensus basata sulle assenze
function calcAbsencePenalty(absences){
  if(!absences||!absences.length)return 0;
  let penalty=0;
  absences.forEach(a=>{
    if(a.impact==='critical')penalty+=0.06;      // -6% per star 25+ PPG
    else if(a.impact==='high')penalty+=0.04;     // -4% per star 20-25 PPG
    else if(a.impact==='moderate')penalty+=0.02; // -2% per star 18-20 PPG
  });
  return Math.min(penalty,0.10); // max -10%
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

  // Over rate and Totals Std
  const avgT=totals.reduce((s,x)=>s+x,0)/N;
  const totStd=Math.sqrt(totals.reduce((s,x)=>s+(x-avgT)**2,0)/N);

  // Calculate specific over rate based on average (instead of arbitrary 210)
  const overRate=totals.filter(t=>t>avgT).length/N;

  // Streak
  let streak=0;
  if(form.length){const f=form[0];for(const r of form){if(r===f)streak++;else break}if(f==='L')streak=-streak}

  // Pythagorean Win% (Morey exponent 13.91)
  const exp=13.91;
  const pythWP=Math.pow(tP,exp)/(Math.pow(tP,exp)+Math.pow(tO,exp));

  // REST DAYS — giorni dall'ultima partita
  let restDays=2; // default
  if(fin[0]){
    const lastGame=new Date(fin[0].date);
    const today=new Date();
    restDays=Math.max(0,Math.round((today-lastGame)/(1000*60*60*24)));
  }
  const isBackToBack=restDays<=1;

  // TRAP DETECTOR — squadra forte (wp>.55) che perde in trasferta contro squadre deboli
  // Segnale: alta varianza nelle ultime partite, perdite recenti come favorita in trasferta
  let trapScore=0;
  if(w/N>.55){
    // Conta sconfitte trasferta nelle ultime 8
    const recentAway=fin.slice(0,8).filter(g=>g.teams.away.id===teamId);
    const awayLosses=recentAway.filter(g=>{
      const my=g.scores.away.total,op=g.scores.home.total;return my<op;
    });
    if(recentAway.length>=3&&awayLosses.length/recentAway.length>=.4)trapScore=2; // Trappola forte
    else if(recentAway.length>=2&&awayLosses.length>=2)trapScore=1; // Trappola lieve
  }
  // Alta varianza = imprevedibilità
  if(std>12)trapScore=Math.min(3,trapScore+1);

  // Close games ratio (partite decise da ≤5 punti = clutch indicator)
  const closeGames=margins.filter(m=>Math.abs(m)<=5).length;
  const clutchRatio=N>0?closeGames/N:0;

  return{ppg,opg,wPpg:wP/wS,wOpg:wO/wS,wp:w/N,hWP:hG?hW/hG:w/N,aWP:aG?aW/aG:w/N,
    net:ppg-opg,avgT,totStd,trend:(l5ppg-ppg)/Math.max(ppg,1),std,form,streak,N,w,
    pythWP,overRate,l5ppg,margins,
    restDays,isBackToBack,trapScore,clutchRatio};
}

function headToHead(tid,opp){
  const all=Object.values(S.gamesCache).flat();
  const m=all.filter(g=>['FT','AOT'].includes(g.status?.short)&&
    ((g.teams.home.id===tid&&g.teams.away.id===opp)||(g.teams.home.id===opp&&g.teams.away.id===tid)));
  let w=0,myPts=0,totalPts=0;
  m.forEach(g=>{const h=g.teams.home.id===tid;const my=h?g.scores.home.total:g.scores.away.total;
    const op=h?g.scores.away.total:g.scores.home.total;if(my>op)w++;myPts+=my;totalPts+=(my+op)});
  return{w,n:m.length,avgPts:m.length?totalPts/m.length:0,avgMyPts:m.length?myPts/m.length:0};
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

  // === BACK-TO-BACK PENALTY ===
  // Squadra in B2B perde ~2-4% di win probability (studio NBA)
  if(hD.isBackToBack&&!aD.isBackToBack){cH-=.03;cA+=.03}
  else if(aD.isBackToBack&&!hD.isBackToBack){cA-=.03;cH+=.03}
  // Entrambe B2B = nessun aggiustamento

  // === TRAP DETECTOR ADJUSTMENT ===
  // Squadra favorita con trapScore alto → riduci confidenza
  if(cH>cA&&aD.trapScore>=2){cH-=.015*aD.trapScore;cA+=.015*aD.trapScore} // ospite trappola: meno sicuri del favorito casa
  if(cA>cH&&hD.trapScore>=2){cA-=.015*hD.trapScore;cH+=.015*hD.trapScore}

  // === CLUTCH ADJUSTMENT ===
  // Squadra con alto clutch ratio (>35% partite decise da ≤5 pts) in partite equilibrate
  if(Math.abs(cH-cA)<.08){
    const hClutchBonus=hD.clutchRatio>.35?(hD.wp-.5)*.04:0;
    const aClutchBonus=aD.clutchRatio>.35?(aD.wp-.5)*.04:0;
    cH+=hClutchBonus;cA+=aClutchBonus;
  }

  // Re-normalize after adjustments
  const tot2=cH+cA;cH=clamp(.12,cH/tot2,.88);cA=clamp(.12,cA/tot2,.88);

  // Flags for display
  const flags=[];
  if(hD.isBackToBack)flags.push({team:'home',type:'b2b',label:`${game.teams.home.name} in Back-to-Back`});
  if(aD.isBackToBack)flags.push({team:'away',type:'b2b',label:`${game.teams.away.name} in Back-to-Back`});
  if(hD.trapScore>=2)flags.push({team:'home',type:'trap',label:`⚠️ Trap: ${game.teams.home.name} (score ${hD.trapScore})`});
  if(aD.trapScore>=2)flags.push({team:'away',type:'trap',label:`⚠️ Trap: ${game.teams.away.name} (score ${aD.trapScore})`});

  // === PREDICTED SCORE ===
  // Punteggio più accurato basato su pace e rating
  const baseH=(results[0].hPts||hD.ppg)*(1+hD.trend*.15);
  const baseA=(results[0].aPts||aD.ppg)*(1+aD.trend*.15);

  const gamePace = (hD.avgT + aD.avgT) / 2;
  const paceAdj = gamePace > 0 ? (gamePace / 200) : 1;
  const hOff = hD.ppg;
  const aOff = aD.ppg;
  const hDef = hD.opg;
  const aDef = aD.opg;

  let fH = Math.round((hOff * 0.5 + aDef * 0.5) * paceAdj + HCA/2);
  let fA = Math.round((aOff * 0.5 + hDef * 0.5) * paceAdj - HCA/2);

  fH = Math.round(clamp(80, fH*(1+hD.trend*.15), 145));
  fA = Math.round(clamp(75, fA*(1+aD.trend*.15), 140));

  const predH=fH;
  const predA=fA;
  const predTotal=predH+predA;


  // === OVER/UNDER (Gaussian CDF Advanced) ===
  const rawLine=(hD.avgT+aD.avgT)/2;
  const mL=Math.round(rawLine*2)/2; // arrotanda a .5

  // Combined standard deviation for totals
  const combinedTotStd=Math.sqrt((hD.totStd**2)+(aD.totStd**2))/Math.SQRT2;
  const effectiveMean=(predTotal*0.6+rawLine*0.4); // Blend tra predetto e storico
  const effectiveStd=Math.max(combinedTotStd, 8); // Floor a 8 punti per sicurezza

  const zOU=(mL-effectiveMean)/effectiveStd;

  // H2H Over Rate Adjustment (se ci sono scontri diretti)
  const avgOverRate = (hD.overRate + aD.overRate) / 2;
  let ouAdj = Math.round((avgOverRate - 0.5) * 10);
  if(h2h.n >= 3) {
      if(h2h.avgPts > mL + 8) ouAdj += 4;
      else if(h2h.avgPts > mL + 3) ouAdj += 2;
      else if(h2h.avgPts < mL - 8) ouAdj -= 4;
      else if(h2h.avgPts < mL - 3) ouAdj -= 2;
  }

  const oPRaw = clamp(10, (1-normCDF(zOU))*100, 90);
  const pOver = clamp(10, oPRaw + ouAdj, 90);
  const pUnder = 100 - pOver;
  const line = mL;

  // Over/Under confidence reason
  let ouReason='';
  if(pOver>=60)ouReason=`Trend da OVER (avg ${fm(rawLine,1)}), attesi ${fm(predTotal,1)} pts con std ${fm(effectiveStd,1)}`;
  else if(pUnder>=60)ouReason=`Trend da UNDER (avg ${fm(rawLine,1)}), attesi ${fm(predTotal,1)} pts con std ${fm(effectiveStd,1)}`;
  else ouReason=`Linea incerta a ${fm(line,1)}, totale atteso ${fm(predTotal,1)}`;

  return{
    models:results,home:cH,away:cA,
    predH,predA,predTotal,
    line,pOver,pUnder,stdDev:effectiveStd,ouReason,
    hElo,aElo,h2h,
    confidence:Math.abs(cH-cA)>.15?'high':Math.abs(cH-cA)>.08?'medium':'low',
    winner:cH>=cA?'home':'away',
    winnerProb:Math.max(cH,cA),
    spread:Math.round((cH-cA)*15*10)/10,
    flags,
    hB2B:hD.isBackToBack,aB2B:aD.isBackToBack,
    hTrap:hD.trapScore,aTrap:aD.trapScore,
    hClutch:hD.clutchRatio,aClutch:aD.clutchRatio,
    hRest:hD.restDays,aRest:aD.restDays,
  };
}

// ═══ REGRESSION SCORE — 7 fattori pesati 0-100 con tier ═══
// Adattato da BettingPro: Gold/Silver/Bronze/Skip + Smart Money
function calcRegressionScore(pred,hD,aD,game,odds){
  const cl=(lo,v,hi)=>Math.max(lo,Math.min(hi,v));
  const factors=[];let totS=0,totW=0;

  // 1. PROBABILITÀ MODELLO (18%)
  {const w=18;const favP=pred.winnerProb*100;
  const s=cl(0,(favP-45)/30*100,100);
  factors.push({n:'🎯 Prob Modello',s:Math.round(s),w,c:s>65?'var(--green)':s>40?'var(--gold)':'var(--red)'});
  totS+=s*w;totW+=w}

  // 2. CONCORDANZA MODELLI (17%)
  {const w=17;const favDir=pred.winner;
  const agree=pred.models.filter(m=>m[favDir]>.52).length;
  const s=cl(0,agree/6*100,100);
  factors.push({n:'🤝 Concordanza',s:Math.round(s),w,c:s>65?'var(--green)':s>40?'var(--gold)':'var(--red)'});
  totS+=s*w;totW+=w}

  // 3. CONFERMA QUOTE (13%)
  {const w=13;let s=50;
  if(odds){
    const bk=odds.bookmakers?.[0];
    const h2hMkt=bk?.markets?.find(m=>m.key==='h2h');
    if(h2hMkt){
      const favName=pred.winner==='home'?odds.home_team:odds.away_team;
      const favOdds=h2hMkt.outcomes?.find(o=>o.name===favName)?.price;
      if(favOdds){
        const impliedProb=1/favOdds;
        s=cl(0,(impliedProb-0.30)/0.40*100,100);
      }
    }
  }
  factors.push({n:'💰 Conferma Quote',s:Math.round(s),w,c:s>65?'var(--green)':s>40?'var(--gold)':'var(--red)'});
  totS+=s*w;totW+=w}

  // 4. NET RATING DIFF (13%)
  {const w=13;const diff=Math.abs(hD.net-aD.net);
  const s=cl(0,diff/10*100,100);
  factors.push({n:'📊 Net Rating',s:Math.round(s),w,c:s>65?'var(--green)':s>40?'var(--gold)':'var(--red)'});
  totS+=s*w;totW+=w}

  // 5. FORMA RECENTE (13%)
  {const w=13;const favD=pred.winner==='home'?hD:aD;
  const favFormW=favD.form.filter(f=>f==='W').length/Math.max(favD.form.length,1);
  const s=cl(0,(favFormW-0.2)/0.6*100,100);
  factors.push({n:'🔥 Forma',s:Math.round(s),w,c:s>65?'var(--green)':s>40?'var(--gold)':'var(--red)'});
  totS+=s*w;totW+=w}

  // 6. ELO GAP (13%)
  {const w=13;const gap=Math.abs(pred.hElo-pred.aElo);
  const s=cl(0,gap/250*100,100);
  factors.push({n:'⚡ Elo Gap',s:Math.round(s),w,c:s>65?'var(--green)':s>40?'var(--gold)':'var(--red)'});
  totS+=s*w;totW+=w}

  // 7. SMART MONEY (13%) — Consensus bookmaker vs modello
  // Se più bookmaker concordano col nostro modello → smart money conferma
  // Se le quote divergono dal modello → possibile sharp action contraria
  {const w=13;let s=50; // default neutro se no odds
  if(odds&&odds.bookmakers&&odds.bookmakers.length>0){
    const favName=pred.winner==='home'?odds.home_team:odds.away_team;
    const undName=pred.winner==='home'?odds.away_team:odds.home_team;
    let bkAgree=0,bkTotal=0;
    let avgFavOdds=0,avgUndOdds=0,oddsCount=0;
    // Scan all bookmakers
    odds.bookmakers.forEach(bk=>{
      const h2hMkt=bk.markets?.find(m=>m.key==='h2h');
      if(!h2hMkt)return;
      const favO=h2hMkt.outcomes?.find(o=>o.name===favName)?.price;
      const undO=h2hMkt.outcomes?.find(o=>o.name===undName)?.price;
      if(favO&&undO){
        bkTotal++;
        if(favO<undO)bkAgree++; // bookmaker agrees with model
        avgFavOdds+=favO;avgUndOdds+=undO;oddsCount++;
      }
    });
    if(bkTotal>0){
      const agreeRate=bkAgree/bkTotal; // % di bookmaker che concordano
      // Edge: differenza tra nostra prob e implied odds media
      if(oddsCount>0){
        avgFavOdds/=oddsCount;avgUndOdds/=oddsCount;
        const impliedFav=1/avgFavOdds;
        const modelFav=pred.winnerProb;
        const edge=modelFav-impliedFav; // positivo = noi più convinti del mercato
        // Smart Money score: agreement + edge combo
        s=cl(0,agreeRate*70 + cl(-15,edge*200,30),100);
      }else{
        s=cl(0,agreeRate*100,100);
      }
    }
  }
  factors.push({n:'💎 Smart Money',s:Math.round(s),w,c:s>65?'var(--green)':s>40?'var(--gold)':'var(--red)'});
  totS+=s*w;totW+=w}

  const final=totW>0?totS/totW:50;
  let tier,tierLabel,tierColor,tierIcon;
  if(final>=65){tier='gold';tierLabel='ORO';tierColor='#fbbf24';tierIcon='🥇'}
  else if(final>=48){tier='silver';tierLabel='ARGENTO';tierColor='#94a3b8';tierIcon='🥈'}
  else if(final>=32){tier='bronze';tierLabel='BRONZO';tierColor='#cd7f32';tierIcon='🥉'}
  else{tier='skip';tierLabel='SKIP';tierColor='#ef4444';tierIcon='⛔'}

  let grade,gc;
  if(final>=78){grade='A+';gc='var(--green)'}
  else if(final>=65){grade='A';gc='var(--green)'}
  else if(final>=55){grade='B+';gc='var(--blue)'}
  else if(final>=45){grade='B';gc='var(--gold)'}
  else if(final>=35){grade='C';gc='var(--red)'}
  else{grade='D';gc='var(--red)'}

  const rec=final>=65?'GIOCA':final>=45?'POSSIBILE':'EVITA';
  return{score:Math.round(final),grade,gc,rec,factors,tier,tierLabel,tierColor,tierIcon,
    favName:pred.winner==='home'?game.teams.home.name:game.teams.away.name};
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
${game._starAbsences?.home?.length?'ATTENZIONE - Star assenti '+hName+': '+game._starAbsences.home.map(a=>a.name+' '+fm(a.ppg,1)+' PPG').join(', '):''}
${game._starAbsences?.away?.length?'ATTENZIONE - Star assenti '+aName+': '+game._starAbsences.away.map(a=>a.name+' '+fm(a.ppg,1)+' PPG').join(', '):''}

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
  S.loading=true;S.match=game;S.view='analysis';game._ai=undefined;render();

  const hid=game.teams.home.id,aid=game.teams.away.id;
  const lid=S.league.id,ssn=S.league.season;

  try{
    // Load data in parallel (include BDL star check for NBA)
    const [hGames,aGames,bref,hStarAbs,aStarAbs]=await Promise.all([
      loadTeamGames(hid,lid,ssn),
      loadTeamGames(aid,lid,ssn),
      lid===12?loadBRefAdvanced():Promise.resolve(null),
      lid===12?detectStarAbsences(game.teams.home.name):Promise.resolve([]),
      lid===12?detectStarAbsences(game.teams.away.name):Promise.resolve([]),
    ]);

    // Store star absences on game
    game._starAbsences={home:hStarAbs||[],away:aStarAbs||[]};

    // Build Elo from all loaded games
    const allGames=[...(hGames||[]),...(aGames||[])];
    const eloMap=buildElo(allGames);
    Object.assign(S.elo,eloMap);

    // Analyze teams
    const hD=analyzeTeam(hGames||[],hid);
    const aD=analyzeTeam(aGames||[],aid);

    if(!hD||!aD){
      game._pred=null;game._hD=null;game._aD=null;
      game._ai='⚠️ Dati insufficienti per questa partita (meno di 5 partite storiche trovate per una delle due squadre).';
      S.loading=false;render();return;
    }

    game._hD=hD;game._aD=aD;

    // Run prediction engine
    const pred=predict(hD,aD,game,bref);

    // Apply star absence penalty (NBA only)
    const hAbsPenalty=calcAbsencePenalty(game._starAbsences?.home);
    const aAbsPenalty=calcAbsencePenalty(game._starAbsences?.away);
    if(hAbsPenalty>0||aAbsPenalty>0){
      pred.home=clamp(.10,pred.home-hAbsPenalty+aAbsPenalty,.90);
      pred.away=clamp(.10,pred.away-aAbsPenalty+hAbsPenalty,.90);
      // Re-normalize
      const t2=pred.home+pred.away;pred.home/=t2;pred.away/=t2;
      // Update winner
      pred.winner=pred.home>=pred.away?'home':'away';
      pred.winnerProb=Math.max(pred.home,pred.away);
      pred.confidence=Math.abs(pred.home-pred.away)>.15?'high':Math.abs(pred.home-pred.away)>.08?'medium':'low';
      // Add star flags
      if(hAbsPenalty>0)pred.flags.push({team:'home',type:'star',label:`🚨 Star assente: ${game._starAbsences.home.map(a=>a.name+' ('+fm(a.ppg,1)+' PPG)').join(', ')}`});
      if(aAbsPenalty>0)pred.flags.push({team:'away',type:'star',label:`🚨 Star assente: ${game._starAbsences.away.map(a=>a.name+' ('+fm(a.ppg,1)+' PPG)').join(', ')}`});
    }

    game._pred=pred;

    // Find real odds
    const hKey=(game.teams.home.name+'_'+game.teams.away.name).toLowerCase().replace(/\s+/g,'');
    const odds=S.odds[hKey]||null;
    if(odds)game._odds=odds;
    game._value=calcValue(pred,odds);

    // Regression Score (Gold/Silver/Bronze)
    game._regression=calcRegressionScore(pred,hD,aD,game,odds);

    // Load AI analysis (non-blocking)
    askAI(game,pred,hD,aD).then(text=>{
      game._ai=text||'⚠️ Analisi AI non disponibile al momento (errore Groq API).';
      render();
    }).catch(()=>{
      game._ai='⚠️ Analisi AI non disponibile al momento.';
      render();
    });

  }catch(err){
    console.error('analyzeMatch error',err);
    game._pred=null;
    game._ai='⚠️ Errore durante il caricamento: '+err.message;
  }

  S.loading=false;render();
}

// ═══ LOAD MATCHES ═══
// Helper per caricare a gruppi (evita rate limit sul Worker)
async function batchLoad(items,fn,batchSize=4){
  const results=[];
  for(let i=0;i<items.length;i+=batchSize){
    const chunk=items.slice(i,i+batchSize);
    const r=await Promise.all(chunk.map(fn));
    results.push(...r);
  }
  return results;
}

async function loadMatches(){
  if(!S.league)return;
  S.loading=true;S.view='matches';S.matches=[];render();

  try{
    const date=getDateStr(S.dateOffset);
    const games=await loadGamesForLeague(S.league.id,date);

    if(!games||!games.length){
      S.matches=[];S.loading=false;render();return;
    }

    const allGames=[];
    // Carica partite storiche squadre a GRUPPI di 4 (evita rate limit)
    const teamIds=[...new Set(games.flatMap(g=>[g.teams.home.id,g.teams.away.id]))];
    const teamResults=await batchLoad(
      teamIds,
      tid=>loadTeamGames(tid,S.league.id,S.league.season),
      4
    );
    teamResults.forEach(g=>{if(g&&g.length)allGames.push(...g);});

    // Build Elo
    const eloMap=buildElo(allGames);
    Object.assign(S.elo,eloMap);

    // Extra per NBA
    if(S.league.id===12){
      await loadBRefAdvanced();
      await loadOdds('basketball_nba');
    }
    if(S.league.id===13)await loadOdds('basketball_euroleague');

    // Quick predict ogni partita
    games.forEach(game=>{
      try{
        const hid=game.teams.home.id,aid=game.teams.away.id;
        const hGames=S.gamesCache['g_'+hid+'_'+S.league.season]||[];
        const aGames=S.gamesCache['g_'+aid+'_'+S.league.season]||[];
        const hD=analyzeTeam(hGames,hid);
        const aD=analyzeTeam(aGames,aid);
        if(hD&&aD){
          game._hD=hD;game._aD=aD;
          game._pred=predict(hD,aD,game,S.bref);
          // Quick regression score
          const hKey=(game.teams.home.name+'_'+game.teams.away.name).toLowerCase().replace(/\s+/g,'');
          const odds=S.odds[hKey]||null;
          if(odds)game._odds=odds;
          game._regression=calcRegressionScore(game._pred,hD,aD,game,odds);
        }
      }catch(e){console.warn('predict error',game.id,e.message);}
    });

    // ← ASSEGNA I MATCH (era mancante! causa principale di nessuna partita mostrata)
    S.matches=games;

  }catch(err){
    console.error('loadMatches error',err);
    S.matches=[];
  }

  // Se ancora vuoto (es. per errore), usa quello che c'è nel cache
  if(!S.matches.length && S.gamesCache["ALL_GAMES_"+getDateStr(S.dateOffset)]){
    S.matches=S.gamesCache["ALL_GAMES_"+getDateStr(S.dateOffset)].filter(g=>g.league?.id==S.league.id)||[];
  }
  calculatePicks();
  S.loading=false;
  render();
  startLiveTimer();
}

// ═══ RENDER HELPERS ═══
function renderQuarterScores(g){
  if(!g.scores)return'';
  const qs=[];
  const quarters=['quarter_1','quarter_2','quarter_3','quarter_4','over_time'];
  const labels=['Q1','Q2','Q3','Q4','OT'];
  quarters.forEach((q,i)=>{
    const h=g.scores?.home?.[q];const a=g.scores?.away?.[q];
    if(h!=null&&a!=null)qs.push(`<span>${labels[i]}:${h}-${a}</span>`);
  });
  return qs.length?qs.join(' '):'';
}

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
  const leagues=S.dynamicLeagues&&S.dynamicLeagues.length?S.dynamicLeagues:LEAGUES;
  let h='<div class="section-title">Campionati ('+leagues.length+' con partite oggi)</div><div class="league-list">';
  if(S.loading){
    h+='<div style="text-align:center;padding:40px"><div class="spinner"></div><div style="margin-top:12px;color:var(--text-d);font-size:.8rem">Caricamento campionati...</div></div>';
  } else {
    leagues.forEach(l=>{
      h+=`<div class="league-item" data-league="${l.id}">
        <div class="league-flag">${l.flag}</div>
        <div class="league-info"><div class="league-name">${l.name}</div><div class="league-country">${l.country}${l.count?' · '+l.count+' partite':''}</div></div>
        ${l.top?'<div class="league-badge">TOP</div>':''}
        <div class="league-arrow">›</div>
      </div>`;
    });
  }
  h+='</div>';

  // Show picks if any
  if(S.picks.length){
    h+='<div class="section-title">Picks del giorno</div><div class="picks-section">';
    S.picks.slice(0,8).forEach(pk=>{
      const conf=pk.confidence==='high'?'high':pk.confidence==='medium'?'medium':'low';
          // Add checkmarks to picks
          let pickIcon='';
          if(pk.game.scores && ['FT','AOT'].includes(pk.game.status?.short)) {
            const h=pk.game.scores.home.total, a=pk.game.scores.away.total;
            if(pk.type==='winner'){
               const actW = h>a ? pk.game.teams.home.name : pk.game.teams.away.name;
               pickIcon = (pk.bet === actW) ? ' ✅' : ' ❌';
            } else if(pk.type==='over' || pk.type==='under'){
               const t = h+a;
               const actOU = t>pk.line?'over':(t<pk.line?'under':'push');
               pickIcon = (actOU==='push') ? ' ➖' : (pk.type===actOU ? ' ✅' : ' ❌');
            }
          }
          const betText = `<div class="pick-bet${pk.type!=='winner'?' over':''}">${pk.bet}${pickIcon}</div>`;

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
          // Add checkmarks to picks
          let pickIcon='';
          if(pk.game.scores && ['FT','AOT'].includes(pk.game.status?.short)) {
            const h=pk.game.scores.home.total, a=pk.game.scores.away.total;
            if(pk.type==='winner'){
               const actW = h>a ? pk.game.teams.home.name : pk.game.teams.away.name;
               pickIcon = (pk.bet === actW) ? ' ✅' : ' ❌';
            } else if(pk.type==='over' || pk.type==='under'){
               const t = h+a;
               const actOU = t>pk.line?'over':(t<pk.line?'under':'push');
               pickIcon = (actOU==='push') ? ' ➖' : (pk.type===actOU ? ' ✅' : ' ❌');
            }
          }
          const betText = `<div class="pick-bet${pk.type!=='winner'?' over':''}">${pk.bet}${pickIcon}</div>`;

      h+=`<div class="pick-card" data-match="${pk.game.id}">
        <div class="pick-top"><div class="pick-match">${pk.matchName}</div></div>
        <div class="pick-bottom">
          ${betText}
          <div class="pick-confidence ${conf}">${pct(pk.prob*100)}</div>
          <div class="pick-reason">${pk.reason}</div>
        </div>
      </div>`;
    });
    h+='</div>';
  }

  h+='<div class="section-title">Tutte le partite</div>';
  S.matches.forEach(g=>{
    const isLive=LIVE_STATUSES.includes(g.status?.short);
    const isFT=['FT','AOT'].includes(g.status?.short);
    const p=g._pred;
    
    let quickH='';
    if(p){
      const winner=p.winner==='home'?'home':'away';
      const winName=p.winner==='home'?g.teams.home.name.split(' ').pop():g.teams.away.name.split(' ').pop();
      let winIcon=''; let ouIcon='';
      if(isFT && g.scores.home.total != null && g.scores.away.total != null){
        const hS=g.scores.home.total; const aS=g.scores.away.total; const aT=hS+aS;
        const actW=hS>aS?'home':'away';
        winIcon=(winner===actW)?' <span style="font-size:12px;margin-left:4px">✅</span>':' <span style="font-size:12px;margin-left:4px">❌</span>';

        const predOU=p.pOver>=55?'over':'under';
        let actOU=aT>p.line?'over':(aT<p.line?'under':'push');
        if(actOU==='push') ouIcon=' ➖';
        else ouIcon=(predOU===actOU)?' <span style="font-size:12px;margin-left:4px">✅</span>':' <span style="font-size:12px;margin-left:4px">❌</span>';
      }
      quickH=`<div class="match-quick">
        ${g._regression?`<div class="match-tier" style="color:${g._regression.tierColor}">${g._regression.tierIcon}${g._regression.score}</div>`:''}
        <div class="match-pick ${winner}">${winName} ${pct(p.winnerProb*100)}${winIcon}</div>
        <div class="match-pick ${p.pOver>=55?'over':'under'}">${p.pOver>=55?'O':'U'} ${fm(p.line,0)}${ouIcon}</div>
      </div>`;
    }


    h+=`<div class="match-item" data-match="${g.id}">
      <div class="match-time${isLive?' live':''}">${isLive?`<span class="live-dot"></span>${getQuarterLabel(g.status?.short)}`:isFT?'FT':formatTime(g.date)}</div>
      <div class="match-teams">
        <div class="match-team home">${g.teams.home.name}</div>
        <div class="match-team">${g.teams.away.name}</div>
      </div>
      ${isFT||isLive?`<div class="match-scores${isLive?' live-scores':''}"><span>${g.scores?.home?.total??'—'}</span><span>${g.scores?.away?.total??'—'}</span></div>`:``}
      ${isLive?`<div class="live-quarters">${renderQuarterScores(g)}</div>`:``}
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

  // === SEGNALI DI RISCHIO (sempre visibili) ===
  const confColor=p.confidence==='high'?'var(--green)':p.confidence==='medium'?'var(--gold)':'var(--red)';
  const confLabel=p.confidence==='high'?'ALTA':p.confidence==='medium'?'MEDIA':'BASSA';
  const confIcon=p.confidence==='high'?'🟢':p.confidence==='medium'?'🟡':'🔴';

  h+=`<div class="panel fade-in"><div class="panel-header" data-toggle="signals"><div class="panel-title">🛡️ Segnali di rischio</div><div class="panel-chevron open">▼</div></div>`;
  h+='<div class="panel-body open">';

  // Confidence badge
  h+=`<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;margin-bottom:12px;background:${confColor}12;border:1px solid ${confColor}25;border-radius:var(--radius-sm)">
    <span style="font-size:1.1rem">${confIcon}</span>
    <span style="font-size:.85rem;font-weight:700;color:${confColor}">Confidenza ${confLabel}</span>
    <span style="font-size:.72rem;color:var(--text-g)">(gap ${pct(Math.abs(p.home-p.away)*100)})</span>
  </div>`;

  // Signal rows
  function sigRow(icon,label,hVal,aVal,hColor,aColor){
    return`<div style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
      <div style="width:24px;font-size:.85rem;text-align:center">${icon}</div>
      <div style="width:100px;font-size:.72rem;color:var(--text-g)">${label}</div>
      <div style="flex:1;text-align:center;font-size:.72rem;font-weight:600;color:${hColor}">${hVal}</div>
      <div style="flex:1;text-align:center;font-size:.72rem;font-weight:600;color:${aColor}">${aVal}</div>
    </div>`;
  }

  // Header
  h+=`<div style="display:flex;align-items:center;padding:4px 0 6px;border-bottom:1px solid var(--border)">
    <div style="width:124px"></div>
    <div style="flex:1;text-align:center;font-size:.65rem;font-weight:600;color:var(--accent)">${g.teams.home.name.split(' ').pop()}</div>
    <div style="flex:1;text-align:center;font-size:.65rem;font-weight:600;color:var(--blue)">${g.teams.away.name.split(' ').pop()}</div>
  </div>`;

  // Rest Days
  const hRestC=hD.isBackToBack?'var(--red)':hD.restDays<=1?'var(--gold)':'var(--green)';
  const aRestC=aD.isBackToBack?'var(--red)':aD.restDays<=1?'var(--gold)':'var(--green)';
  h+=sigRow('⏰','Riposo',
    `${hD.restDays}g${hD.isBackToBack?' ⚠️ B2B':''}`,
    `${aD.restDays}g${aD.isBackToBack?' ⚠️ B2B':''}`,
    hRestC, aRestC);

  // Trap Score
  const hTrapC=hD.trapScore>=2?'var(--red)':hD.trapScore>=1?'var(--gold)':'var(--green)';
  const aTrapC=aD.trapScore>=2?'var(--red)':aD.trapScore>=1?'var(--gold)':'var(--green)';
  h+=sigRow('🪤','Trap Score',
    `${hD.trapScore}/3${hD.trapScore>=2?' ⚠️ TRAP':''}`,
    `${aD.trapScore}/3${aD.trapScore>=2?' ⚠️ TRAP':''}`,
    hTrapC, aTrapC);

  // Clutch
  const hClC=hD.clutchRatio>.35?'var(--green)':hD.clutchRatio>.25?'var(--gold)':'var(--text-g)';
  const aClC=aD.clutchRatio>.35?'var(--green)':aD.clutchRatio>.25?'var(--gold)':'var(--text-g)';
  h+=sigRow('🎯','Clutch (≤5pts)',pct(hD.clutchRatio*100),pct(aD.clutchRatio*100),hClC,aClC);

  // Streak
  const hSkC=hD.streak>0?'var(--green)':hD.streak<0?'var(--red)':'var(--text-g)';
  const aSkC=aD.streak>0?'var(--green)':aD.streak<0?'var(--red)':'var(--text-g)';
  h+=sigRow('🔥','Streak',
    `${hD.streak>0?'+':''}${hD.streak}`,
    `${aD.streak>0?'+':''}${aD.streak}`,
    hSkC, aSkC);

  // Over Rate
  h+=sigRow('📈','Over Rate',pct(hD.overRate*100),pct(aD.overRate*100),
    hD.overRate>.55?'var(--green)':'var(--text-g)',
    aD.overRate>.55?'var(--green)':'var(--text-g)');

  // Star Player Absences (NBA only, from BallDontLie)
  const allAbs=[...(g._starAbsences?.home||[]),...(g._starAbsences?.away||[])];
  if(allAbs.length>0){
    h+=`<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
      <div style="font-size:.7rem;font-weight:700;color:var(--red);margin-bottom:6px">🚨 STAR PLAYER ASSENTI (BallDontLie)</div>`;
    (g._starAbsences?.home||[]).forEach(a=>{
      const impColor=a.impact==='critical'?'var(--red)':a.impact==='high'?'var(--gold)':'var(--text-g)';
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:5px 0">
        <div style="width:8px;height:8px;border-radius:50%;background:${impColor};flex-shrink:0"></div>
        <div style="font-size:.72rem;color:var(--accent);font-weight:600">${g.teams.home.name.split(' ').pop()}</div>
        <div style="font-size:.72rem;color:var(--text)">${a.name}</div>
        <div style="font-family:var(--mono);font-size:.68rem;color:${impColor};margin-left:auto">${fm(a.ppg,1)} PPG</div>
        <div style="font-size:.6rem;padding:1px 6px;border-radius:3px;background:${impColor}20;color:${impColor};font-weight:600">${a.impact==='critical'?'CRITICO':a.impact==='high'?'ALTO':'MOD'}</div>
      </div>`;
    });
    (g._starAbsences?.away||[]).forEach(a=>{
      const impColor=a.impact==='critical'?'var(--red)':a.impact==='high'?'var(--gold)':'var(--text-g)';
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:5px 0">
        <div style="width:8px;height:8px;border-radius:50%;background:${impColor};flex-shrink:0"></div>
        <div style="font-size:.72rem;color:var(--blue);font-weight:600">${g.teams.away.name.split(' ').pop()}</div>
        <div style="font-size:.72rem;color:var(--text)">${a.name}</div>
        <div style="font-family:var(--mono);font-size:.68rem;color:${impColor};margin-left:auto">${fm(a.ppg,1)} PPG</div>
        <div style="font-size:.6rem;padding:1px 6px;border-radius:3px;background:${impColor}20;color:${impColor};font-weight:600">${a.impact==='critical'?'CRITICO':a.impact==='high'?'ALTO':'MOD'}</div>
      </div>`;
    });
    h+='</div>';
  }else if(S.league?.id===12){
    h+=`<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
      <div style="font-size:.68rem;color:var(--green)">✅ Nessuna star player assente rilevata (BallDontLie)</div>
    </div>`;
  }

  h+='</div></div>';

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
    <tr><td>Riposo</td><td class="val ${hD.isBackToBack?'bad':'good'}">${hD.restDays}g${hD.isBackToBack?' B2B':''}</td><td class="val ${aD.isBackToBack?'bad':'good'}">${aD.restDays}g${aD.isBackToBack?' B2B':''}</td></tr>
    <tr><td>Trap Score</td><td class="val ${hD.trapScore>=2?'bad':''}">${hD.trapScore}/3</td><td class="val ${aD.trapScore>=2?'bad':''}">${aD.trapScore}/3</td></tr>
    <tr><td>Clutch (≤5pts)</td><td class="val">${pct(hD.clutchRatio*100)}</td><td class="val">${pct(aD.clutchRatio*100)}</td></tr>
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

  // === REGRESSION SCORE ===
  if(g._regression){
    const R=g._regression;
    h+=`<div class="panel fade-in" style="border-color:${R.tierColor}40"><div class="panel-header" data-toggle="regression"><div class="panel-title">${R.tierIcon} Regression Score — ${R.tierLabel} (${R.score}/100)</div><div class="panel-chevron open">▼</div></div>`;
    h+='<div class="panel-body open">';
    // Score bar
    h+=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div style="flex:1;height:8px;background:var(--bg-surface);border-radius:4px;overflow:hidden">
        <div style="width:${R.score}%;height:100%;border-radius:4px;background:${R.tierColor};transition:width .6s"></div>
      </div>
      <div style="font-family:var(--mono);font-size:1.1rem;font-weight:800;color:${R.gc}">${R.grade}</div>
    </div>`;
    // Recommendation
    h+=`<div style="text-align:center;padding:8px;background:${R.tierColor}15;border:1px solid ${R.tierColor}30;border-radius:var(--radius-sm);margin-bottom:10px">
      <div style="font-size:.85rem;font-weight:700;color:${R.tierColor}">${R.rec}: ${R.favName}</div>
    </div>`;
    // Factor bars
    R.factors.forEach(f=>{
      h+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="width:110px;font-size:.68rem;color:var(--text-g)">${f.n}</div>
        <div style="flex:1;height:5px;background:var(--bg-surface);border-radius:3px;overflow:hidden">
          <div style="width:${f.s}%;height:100%;background:${f.c};border-radius:3px"></div>
        </div>
        <div style="width:30px;text-align:right;font-family:var(--mono);font-size:.68rem;font-weight:600;color:${f.c}">${f.s}</div>
      </div>`;
    });
    h+='</div></div>';
  }

  // === AI ANALYSIS ===
  h+='<div class="ai-card fade-in"><div class="ai-title">🤖 Analisi AI</div>';
  if(g._ai===undefined){
    h+='<div class="ai-loading"><div class="spinner" style="display:inline-block;width:14px;height:14px;border-width:1.5px;vertical-align:middle;margin-right:6px"></div>Analisi AI in corso...</div>';
  }else if(!g._ai||g._ai===null){
    h+='<div class="ai-loading" style="color:var(--gold)">⚠️ Analisi AI non disponibile al momento.</div>';
  }else{
    h+=`<div class="ai-text">${g._ai.replace(/\n/g,'<br>')}</div>`;
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
    el.onclick=()=>{
    const allLgs=[...(S.dynamicLeagues.length?S.dynamicLeagues:[]),...LEAGUES];
    S.league=allLgs.find(l=>l.id==el.dataset.league)||null;
    if(S.league)loadMatches();
  };
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
    el.onclick=()=>{S.dateOffset=parseInt(el.dataset.date);if(S.league)loadMatches();else loadHome();};
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
// Carica TUTTE le partite del giorno e costruisce la lista campionati dinamicamente
// Esattamente come faceva il vecchio BasketPro
async function loadHome(){
  S.loading=true;
  render();

  const date=getDateStr(S.dateOffset);
  const cacheKey='ALL_GAMES_'+date;

  if(!S.gamesCache[cacheKey]||!S.gamesCache[cacheKey].length){
    const d=await callWorker(`/api/basketball/games?date=${date}&timezone=Europe/Rome`);
    const all=(d?.response||[]).filter(g=>g.teams?.home&&g.teams?.away);
    if(all.length) S.gamesCache[cacheKey]=all;
  }

  // Costruisce la lista campionati dai dati reali (come il vecchio BasketPro)
  const all=S.gamesCache[cacheKey]||[];
  const map=new Map();
  all.forEach(g=>{
    const id=g.league?.id;
    if(!id)return;
    if(!map.has(id)){
      // Cerca nella lista LEAGUES per avere flag e info extra
      const known=LEAGUES.find(l=>l.id==id);
      map.set(id,{
        id,
        name: g.league.name,
        country: g.country?.name||'Altro',
        flag: known?.flag||'🏀',
        top: known?.top||false,
        season: g.league?.season||known?.season||'2025-2026',
        count: 0
      });
    }
    map.get(id).count++;
  });

  S.dynamicLeagues=[...map.values()].sort((a,b)=>{
    if(a.top&&!b.top)return -1;
    if(!a.top&&b.top)return 1;
    return a.country.localeCompare(b.country)||a.name.localeCompare(b.name);
  });

  S.loading=false;
  render();
}

// ═══ LIVE SCORE REFRESH ═══
let liveTimer=null;
const LIVE_STATUSES=['Q1','Q2','Q3','Q4','OT','HT','BT','1H','2H','QT1','QT2','QT3','QT4'];

function hasLiveGames(){
  return S.matches.some(g=>LIVE_STATUSES.includes(g.status?.short));
}

function getQuarterLabel(st){
  const map={'Q1':'1° Q','Q2':'2° Q','Q3':'3° Q','Q4':'4° Q','QT1':'1° Q','QT2':'2° Q','QT3':'3° Q','QT4':'4° Q',
    'OT':'OT','HT':'Intervallo','BT':'Pausa','1H':'1° T','2H':'2° T'};
  return map[st]||st;
}

async function refreshLiveScores(){
  if(!S.league||S.view==='home')return;
  const date=getDateStr(S.dateOffset);
  try{
    const d=await callWorker(`/api/basketball/games?league=${S.league.id}&date=${date}&timezone=Europe/Rome`);
    const fresh=(d?.response||[]).filter(g=>g.teams?.home&&g.teams?.away);
    if(!fresh.length)return;
    let changed=false;
    fresh.forEach(fg=>{
      const existing=S.matches.find(m=>m.id===fg.id);
      if(!existing)return;
      if(existing.scores?.home?.total!==fg.scores?.home?.total||
         existing.scores?.away?.total!==fg.scores?.away?.total||
         existing.status?.short!==fg.status?.short){
        existing.scores=fg.scores;
        existing.status=fg.status;
        existing.timer=fg.timer||fg.time;
        changed=true;
      }
    });
    if(changed){console.log('🔴 Live scores updated');render()}
  }catch(e){console.warn('Live refresh error:',e.message)}
}

function startLiveTimer(){
  if(liveTimer)clearInterval(liveTimer);
  liveTimer=setInterval(()=>{
    if(hasLiveGames()||S.matches.some(g=>g.status?.short==='NS'))refreshLiveScores();
  },30000);
}

function stopLiveTimer(){if(liveTimer){clearInterval(liveTimer);liveTimer=null}}

async function init(){
  console.log('🏀 BasketPro AI v6 — Starting...');
  S.dynamicLeagues=[];
  render();
  await loadHome();
}

document.addEventListener('DOMContentLoaded',init);
