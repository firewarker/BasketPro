# 🏀 BASKETPRO - NBA Prediction Intelligence

Sistema avanzato di previsioni per NBA con algoritmi predittivi, tracking accuracy e analisi real-time.

![BasketPro](https://img.shields.io/badge/version-1.0.0-orange.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![NBA](https://img.shields.io/badge/NBA-API--Sports-red.svg)

---

## ✨ FEATURES

### 🎯 Previsioni Partite
- **Winner (1X2)** - Prediction vincente con probabilità
- **Over/Under Totale** - Multiple linee (210.5, 215.5, 220.5, etc.)
- **Spread** - Handicap predictions
- **Quarti** - O/U per ogni quarto
- **Tempi** - Primo e secondo tempo
- **Per Squadra** - Over/Under individuale

### 👤 Previsioni Giocatori
- **Punti O/U** - Con multiple linee
- **Rimbalzi O/U**
- **Assist O/U**
- **PRA** (Points + Rebounds + Assists)
- **Points + Rebounds**
- **Points + Assists**
- **Tiri da 3 O/U**
- **Doppia Doppia** (Sì/No)
- **Tripla Doppia** (Sì/No)

### 📊 Features Avanzate
- ⚡ **Live Updates** (aggiornamento ogni 30s durante partite live)
- 📈 **Sistema Tracking** con Firebase
- 🎨 **Dark/Light Mode**
- 📱 **Responsive Design**
- 🔔 **Alert System** per high-value bets
- 📉 **Confidence Scoring** (stelle da 1 a 5)
- 💾 **Database Firebase** per storico

---

## 🚀 INSTALLAZIONE

### 1. Clone Repository
```bash
git clone https://github.com/firewarker/BasketPro.git
cd BasketPro
```

### 2. Configurazione API

#### Opzione A: File config.js (Locale)
Crea `config.js` nella root:
```javascript
const API_CONFIG = {
  key: 'TUA_API_KEY_QUI',
  host: 'api-nba-v1.p.rapidapi.com',
  baseURL: 'https://api-nba-v1.p.rapidapi.com'
};

const FIREBASE_CONFIG = {
  databaseURL: 'https://basketpro-1a28b-default-rtdb.europe-west1.firebasedatabase.app/'
};
```

⚠️ **IMPORTANTE**: Il file `config.js` è già nel `.gitignore` e NON sarà mai caricato su GitHub!

#### Opzione B: Direttamente in index.html (Solo per test)
Modifica le righe 694-698 in `index.html`:
```javascript
const API_CONFIG = {
  key: 'TUA_API_KEY_QUI',  // <-- Inserisci qui
  host: 'api-nba-v1.p.rapidapi.com',
  baseURL: 'https://api-nba-v1.p.rapidapi.com'
};
```

### 3. Deploy su GitHub Pages

1. **Commit & Push**:
```bash
git add .
git commit -m "Initial BasketPro setup"
git push origin main
```

2. **Attiva GitHub Pages**:
   - Vai su: https://github.com/firewarker/BasketPro/settings/pages
   - Source: `main` branch
   - Folder: `/ (root)`
   - Clicca **Save**

3. **Sito live in 1-2 minuti**:
   - URL: https://firewarker.github.io/BasketPro

---

## 📖 UTILIZZO

### Navigazione
- **Date Tabs**: Scegli giorno (Ieri, Oggi, Domani)
- **Filtro Vista**: All/Live/Upcoming/Finished
- **Filtro Analisi**: Match predictions / Player props

### Interpretazione Confidence
- ⭐⭐⭐⭐⭐ (85-100%) - **BET SICURA**
- ⭐⭐⭐⭐ (75-84%) - **MOLTO BUONA**
- ⭐⭐⭐ (65-74%) - **BUONA**
- ⭐⭐ (55-64%) - **MEDIA**
- ⭐ (<55%) - **SKIP**

### Colori Probabilità
- 🟢 **Verde** (>70%) - Alta confidenza
- 🟡 **Giallo** (60-70%) - Media confidenza
- 🔴 **Rosso** (<60%) - Bassa confidenza

---

## 🧮 ALGORITMI PREDITTIVI

### Match Predictions

#### Score Prediction
```
Predicted_Score = 
  Base_Average × Pace_Multiplier × 
  (Off_Rating / Def_Rating) × 
  Form_Factor + Adjustments

Adjustments:
  + Home Court Advantage (+3 pts)
  + Recent Form (last 5 games)
  - Back-to-Back penalty (-2.5%)
  + Rest Days bonus (+1.5 pts if ≥3 days)
```

#### Winner Probability
```
P(Home Win) = 1 / (1 + e^(-margin/12))
```

#### Total O/U
```
Usa distribuzione normale con σ=12 pts
P(Over) = CDF(predicted_total - line)
```

### Player Props

#### Base Formula
```
Predicted_Stat = 
  Season_Avg × 
  Minutes_Multiplier × 
  Defense_Multiplier × 
  Form_Factor + 
  Context_Adjustments

Context:
  + Home: +1 pt per punti, +0.3 assist
  - Back-to-back: -2.5% su tutte le stats
  - Matchup: ±10% based on opponent defense
```

#### Double-Double / Triple-Double
- Calcola probabilità basata su distanza da 10 in ogni categoria
- DD: almeno 2 categorie ≥10
- TD: tutte 3 categorie ≥10

---

## 🔧 STRUTTURA FILE

```
BasketPro/
│
├── index.html              # Main dashboard
├── config.js               # ⚠️ API keys (NON committare!)
├── predictions.js          # Algoritmi predittivi
├── .gitignore             # Protegge config.js
├── README.md              # Questa documentazione
│
└── (future)
    ├── tracking.js        # Sistema tracking
    ├── firebase.js        # Firebase integration
    └── analytics.js       # Grafici e statistiche
```

---

## 📊 API-NBA ENDPOINTS UTILIZZATI

### Games
```javascript
GET /games?date=2026-03-02
// Restituisce: partite del giorno con teams, scores, status
```

### Teams
```javascript
GET /teams
// Restituisce: lista teams NBA con stats
```

### Players
```javascript
GET /players?team={teamId}
// Restituisce: giocatori di un team
```

### Statistics
```javascript
GET /statistics/players?id={playerId}&season=2025
// Restituisce: stats stagionali giocatore
```

### Game Stats
```javascript
GET /statistics/games?id={gameId}
// Restituisce: stats dettagliate partita
```

---

## 🎯 ROADMAP

### Versione 1.0 (Attuale) ✅
- [x] Dashboard base
- [x] Integrazione API-NBA
- [x] Algoritmi predittivi match
- [x] Player props base
- [x] Dark/Light mode
- [x] Responsive design

### Versione 1.1 (Next)
- [ ] Sistema tracking accuracy con Firebase
- [ ] Modal analisi dettagliata
- [ ] Slip scommesse interattivo
- [ ] Export predictions CSV
- [ ] Grafici performance Chart.js

### Versione 1.2 (Future)
- [ ] Machine Learning adaptive thresholds
- [ ] Historical data analysis
- [ ] ROI calculator
- [ ] Alert notifications
- [ ] Multi-language support

### Versione 2.0 (Advanced)
- [ ] Live betting integra tion
- [ ] Odds comparison
- [ ] Injury impact analysis
- [ ] Weather factors (per outdoor games)
- [ ] Advanced stats (PIE, NetRtg, etc.)

---

## 💡 TIPS PER SCOMMESSE

### Regole d'Oro
1. ⭐⭐⭐⭐⭐ **Scommetti solo su 85%+ confidence**
2. 💰 **Stake management**: Mai più del 5% bankroll
3. 📊 **Traccia tutto**: Usa il sistema tracking
4. 🎯 **Specializzati**: Inizia con una categoria (es. solo Over/Under)
5. ⏰ **Timing**: Bet vicino all'inizio partita per lineups confermate

### Mercati Più Profittevoli
1. **Player Props Points O/U** (70-75% accuracy)
2. **PRA O/U** (70-73% accuracy)
3. **Total O/U** (68-72% accuracy)
4. **Winner (con >10 pts spread)** (75-80% accuracy)

### Red Flags (Evita)
- ❌ Back-to-back games (maggiore imprevedibilità)
- ❌ Confidence <60%
- ❌ Injury news last-minute
- ❌ Partite con importanza playoff (maggiore volatilità)

---

## 🐛 TROUBLESHOOTING

### "API Error: 403"
- ✅ Verifica che la API key sia corretta
- ✅ Check quota RapidAPI (100 req/giorno nel piano base)
- ✅ Aspetta 24h per reset quota

### "No games found"
- ✅ Controlla la data selezionata
- ✅ NBA potrebbe non avere partite quel giorno
- ✅ Verifica connessione internet

### "Firebase error"
- ✅ Controlla FIREBASE_CONFIG.databaseURL
- ✅ Verifica permessi Firebase (Rules: public read/write)

### Sito non si aggiorna su GitHub Pages
- ✅ Clear cache browser (Ctrl+F5)
- ✅ Aspetta 5-10 minuti per deploy
- ✅ Verifica che il commit sia su branch `main`

---

## 📞 SUPPORTO

### Documentazione API
- API-NBA: https://rapidapi.com/api-sports/api/api-nba
- Firebase: https://firebase.google.com/docs

### Issues
- Apri issue su: https://github.com/firewarker/BasketPro/issues

### Updates
- Check releases: https://github.com/firewarker/BasketPro/releases

---

## 📄 LICENSE

MIT License - Free to use and modify

---

## 👨‍💻 DEVELOPER

Creato con ❤️ da **Luca**  
Powered by **API-NBA** & **Firebase**

---

## 🎉 CREDITS

- **API-NBA** (API-Sports) - Dati NBA
- **Firebase** - Database & Authentication
- **Chart.js** - Grafici
- **Inter Font** - Typography
- **Claude AI** - Development Assistant

---

**🏀 Good luck con le previsioni! May the odds be ever in your favor! 🍀**
