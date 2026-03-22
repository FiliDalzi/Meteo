# 🌤 Cielo — Weather PWA

App meteo progressiva (PWA) in stile Apple con previsioni a 7 giorni.

## Stack tecnico (tutto gratuito, zero API key)

| Servizio | Uso | Limite gratuito |
|---|---|---|
| **Open-Meteo** | Dati meteo | Illimitato (CC BY 4.0) |
| **Nominatim / OpenStreetMap** | Geocoding / reverse geocoding | Illimitato (fair use) |
| **OpenStreetMap Embed** | Mappa interattiva | Illimitato |
| **Google Fonts** | Font SF Pro-like | Illimitato |

## Funzionalità

- 🌍 Geolocalizzazione automatica
- 📅 Previsioni 7 giorni con barre temperatura
- ⏱ Previsioni orarie (24h scroll)
- 🗺 Mappa integrata OpenStreetMap
- 🔍 Ricerca qualsiasi città nel mondo
- 📱 PWA installabile (service worker + manifest)
- 💾 Offline support (cache strategy)
- 🌙 Sfondo animato dinamico (cambia con il meteo)
- 📊 Dettagli: umidità, vento, UV, visibilità, pressione, alba/tramonto
- 🔄 Pull-to-refresh

## Deploy

### GitHub Pages (raccomandato)

```bash
# 1. Crea un repo su GitHub (es: cielo-meteo)
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TUO_USERNAME/cielo-meteo.git
git push -u origin main

# 2. Su GitHub: Settings → Pages → Source: GitHub Actions
# Il workflow .github/workflows/deploy.yml farà tutto automaticamente
```

URL finale: `https://TUO_USERNAME.github.io/cielo-meteo/`

⚠️ **Nota GitHub Pages**: il service worker funziona solo su HTTPS (che Pages fornisce).
Il percorso `/sw.js` deve essere alla root. Se il repo è in un sottopercorso, 
aggiorna `start_url` in manifest.json e la registrazione in app.js.

### Vercel (alternativa, più veloce)

```bash
npm i -g vercel
vercel --prod
```

Oppure collega il repo GitHub a vercel.com → import → deploy automatico.

### Fix per GitHub Pages con sottopercorso

Se il tuo sito è su `username.github.io/cielo-meteo/`, modifica in `app.js`:
```js
navigator.serviceWorker.register('/cielo-meteo/sw.js')
```
E in `manifest.json`:
```json
"start_url": "/cielo-meteo/",
"scope": "/cielo-meteo/"
```

## Struttura file

```
cielo-meteo/
├── index.html          # App shell + UI
├── app.js              # Logica principale
├── sw.js               # Service Worker
├── manifest.json       # PWA manifest
├── vercel.json         # Config Vercel
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── .github/
    └── workflows/
        └── deploy.yml  # CI/CD GitHub Pages
```

## API usate

### Open-Meteo
- Endpoint: `https://api.open-meteo.com/v1/forecast`
- No API key richiesta
- Dati: temperatura, umidità, vento, UV, precipitazioni, codice meteo WMO, alba/tramonto
- Aggiornamento: ogni ora

### Nominatim (OpenStreetMap)
- Endpoint: `https://nominatim.openstreetmap.org`
- No API key richiesta
- Fair use: max 1 req/sec, user-agent richiesto
- Usato per: reverse geocoding e ricerca città

## Note legali

- Open-Meteo: [Creative Commons Attribution 4.0](https://open-meteo.com/en/license)
- OpenStreetMap: [ODbL](https://www.openstreetmap.org/copyright)
- Entrambi richiedono attribuzione (inclusa nel footer dell'app)
