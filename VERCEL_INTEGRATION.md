# GeoGTA — Vercel telepítés (csak a weboldal!)

**A bot maga (slash parancsok, `index.js`) ide NEM kerül** — az továbbra is a
Railway/Render/VPS szerveren fut, ahogy eddig. Ez a Vercel-projekt **csak** a
GeoGTA térkép-oldalt és a hozzá tartozó 2 API végpontot szolgálja ki.

## 1. Milyen fájlokat töltsél fel / pusholj

```
geogta-vercel/
├── api/
│   └── geogta/
│       ├── _shared.js          ← közös logika (pontszámítás, Supabase, Discord REST)
│       ├── guess.js             ← POST /api/geogta/guess
│       └── session/
│           └── [token].js       ← GET /api/geogta/session/:token
├── public/
│   └── geogta/
│       ├── index.html
│       ├── style.css
│       ├── app.js
│       ├── assets/
│       │   └── gta5-map-placeholder.svg
│       └── images/
│           └── *.svg
├── package.json
└── vercel.json
```

Legegyszerűbb, ha ezt egy **külön GitHub repóba** teszed (vagy a meglévő repódban egy
`geogta-web/` almappába, és a Vercel projekt "Root Directory" beállításánál ezt az
almappát jelölöd ki gyökérnek). A Vercel a GitHub-repót figyeli és minden pushnál
újra deploy-ol — nem kell kézzel fájlokat feltöltened a felületen, csak összekötöd a
repót a Vercel dashboardon ("Add New Project" → Import Git Repository).

## 2. Vercel projekt beállítások (Import képernyő)

| Mező | Érték |
|---|---|
| Framework Preset | **Other** (nincs Next.js/React, sima static + serverless functions) |
| Root Directory | a mappa, ahol a fenti `api/`, `public/`, `package.json` van |
| Build Command | *(üresen hagyható)* |
| Output Directory | *(üresen hagyható — a `public/` mappát a Vercel automatikusan a domain gyökeréből szolgálja ki)* |
| Install Command | `npm install` (alapértelmezett, nem kell módosítani) |

## 3. Environment Variables (Vercel → Project Settings → Environment Variables)

Ezeket a Vercel felületén add meg (NE kerüljenek bele a repóba!):

| Név | Érték |
|---|---|
| `SUPABASE_URL` | ugyanaz, mint a bot `.env`-jében |
| `SUPABASE_SERVICE_KEY` | ugyanaz, mint a bot `.env`-jében |
| `DISCORD_BOT_TOKEN` | a bot tokenje (a `config.json`-odból — de itt env változóként, nem fájlban!) |
| `GEOGTA_MAP_WIDTH` | pl. `2048` |
| `GEOGTA_MAP_HEIGHT` | pl. `2048` |
| `GEOGTA_MAP_IMAGE` | pl. `/geogta/assets/gta5-map-placeholder.svg` |
| `GEOGTA_MAX_SCORE` | pl. `5000` |
| `GEOGTA_MAX_COINS` | pl. `400` |
| `GEOGTA_MAX_XP` | pl. `200` |
| `GEOGTA_PARTICIPATION_XP` | pl. `15` |

> ⚠️ A `config.json`-odban most egy éles bot token van egyszerű szövegként — azt
> SOHA ne töltsd fel semmilyen Git repóba (se a bot repójába, se ide). A Vercel
> Environment Variables pontosan erre való: titkok biztonságos tárolására.

## 4. Mit írj a bot oldali `config.json`-ba

A bot szerveren (Railway/Render/VPS) a `config.json` `geogta.publicBaseUrl` mezőjébe
a Vercel-en kapott domain kerül:

```json
"geogta": {
  "enabled": true,
  "publicBaseUrl": "https://a-te-projekted.vercel.app",
  "mapImage": "/geogta/assets/gta5-map-placeholder.svg",
  "mapWidth": 2048,
  "mapHeight": 2048,
  "maxScore": 5000,
  "maxCoins": 400,
  "maxXp": 200,
  "participationXp": 15,
  "roundExpiresMinutes": 10,
  "publicStart": true
}
```

Ezt a domaint a Vercel projekt "Deployments" oldalán vagy a "Domains" fülön látod
(alapból `<projektnev>.vercel.app`, de saját domaint is beköthetsz).

**Fontos:** a bot oldali `geogtaGame.js`-ben ekkor **nem kell** meghívnod a
`geogtaGame.registerRoutes(app, client)` sort, mert az API-t most a Vercel szolgálja
ki, nem az Express szervered. A `handleStartCommand` / `handleStatsCommand` /
`handleLeaderboardCommand` viszont továbbra is a bot oldalon fut (ezek csak
Supabase-t és a Discord interakciót használják, gateway-független funkciók
maradnak a boton).

## 5. Tesztelés

1. Deploy-old a Vercel projektet (git push, vagy `vercel --prod` a CLI-vel).
2. Nyisd meg böngészőben: `https://a-projekted.vercel.app/geogta` — a placeholder
   térképnek látszódnia kell (token nélkül hibaüzenetet fog írni, ez normális).
3. A boton futtasd: `/geogta start` — a linknek a Vercel domainre kell mutatnia.
4. Kattints a linkre, tegyél le egy jelölőt, küldd be — nézd meg a Vercel
   projekt "Functions" logjait (Vercel dashboard → Deployments → Functions), ha
   valami nem működne.
