// app.js — GeoGTA kliens logika
// CRS.Simple: sima pixel-koordinátákkal dolgozunk (nem valós lat/lng), pont úgy,
// ahogy egy játék-térkép esetén elvárható.

const params = new URLSearchParams(window.location.search);
const token = params.get('token');

const els = {
  loading: document.getElementById('loadingState'),
  error: document.getElementById('errorState'),
  errorMessage: document.getElementById('errorMessage'),
  game: document.getElementById('gameState'),
  result: document.getElementById('resultState'),
  locationImage: document.getElementById('locationImage'),
  pinInfo: document.getElementById('pinInfo'),
  submitBtn: document.getElementById('submitBtn'),
  timer: document.getElementById('timer'),
  resultLocation: document.getElementById('resultLocation'),
  resultDistance: document.getElementById('resultDistance'),
  resultScore: document.getElementById('resultScore'),
  resultReward: document.getElementById('resultReward'),
};

let map = null;
let marker = null;
let sessionData = null;
let countdownInterval = null;

function showPanel(panel) {
  [els.loading, els.error, els.game, els.result].forEach(p => p.classList.add('hidden'));
  panel.classList.remove('hidden');
}

function showError(message) {
  els.errorMessage.textContent = message;
  showPanel(els.error);
}

// ─── Térkép inicializálása CRS.Simple-el ─────────────────────────────────────
function initMap(mapImage, width, height) {
  map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 3,
    zoomSnap: 0.25,
  });

  // A kép pixel-koordinátáit a Leaflet [lat, lng]-ként kezeli: [0,0] a bal alsó
  // sarok lesz, ezért az Y tengelyt invertáljuk (unproject), hogy a képünk
  // bal-felső sarka legyen (0,0) — ez egyezik a JSON-ban tárolt koordinátákkal.
  const bounds = [[0, 0], [height, width]];
  L.imageOverlay(mapImage, bounds).addTo(map);
  map.fitBounds(bounds);
  map.setMaxBounds(bounds.map(([a, b]) => [a - height * 0.3, b - width * 0.3]).concat());

  map.on('click', (e) => {
    placeMarker(e.latlng, width, height);
  });
}

function toStoredCoords(latlng, height) {
  // A Leaflet [lat,lng]-jét visszaalakítjuk a JSON-ban használt (x = balról jobbra,
  // y = fentről lefelé) koordináta-rendszerbe.
  const x = latlng.lng;
  const y = height - latlng.lat;
  return { x, y };
}

function placeMarker(latlng, width, height) {
  const clamped = L.latLng(
    Math.min(Math.max(latlng.lat, 0), height),
    Math.min(Math.max(latlng.lng, 0), width)
  );

  if (marker) {
    marker.setLatLng(clamped);
  } else {
    marker = L.marker(clamped, { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      els.pinInfo.classList.remove('hidden');
    });
  }

  els.pinInfo.classList.remove('hidden');
  els.submitBtn.disabled = false;
}

// ─── Visszaszámláló ───────────────────────────────────────────────────────────
function startCountdown(expiresAt) {
  function tick() {
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      els.timer.textContent = '00:00';
      els.timer.classList.add('low');
      clearInterval(countdownInterval);
      showError('Lejárt az idő ehhez a körhöz.');
      return;
    }
    const totalSec = Math.floor(remainingMs / 1000);
    const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const sec = String(totalSec % 60).padStart(2, '0');
    els.timer.textContent = `${min}:${sec}`;
    if (totalSec <= 30) els.timer.classList.add('low');
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

// ─── Session betöltése ────────────────────────────────────────────────────────
async function loadSession() {
  if (!token) {
    showError('Hiányzik a token az URL-ből. Nyisd meg a linket a Discord üzenetből.');
    return;
  }

  try {
    const res = await fetch(`/api/geogta/session/${encodeURIComponent(token)}`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Ismeretlen hiba történt a kör betöltésekor.');
      return;
    }

    sessionData = data;
    els.locationImage.src = data.imageUrl;
    initMap(data.mapImage, data.mapWidth, data.mapHeight);
    startCountdown(data.expiresAt);
    showPanel(els.game);
  } catch (err) {
    showError('Nem sikerült kapcsolódni a szerverhez. Próbáld újra később.');
  }
}

// ─── Tipp beküldése ───────────────────────────────────────────────────────────
async function submitGuess() {
  if (!marker || !sessionData) return;

  els.submitBtn.disabled = true;
  els.submitBtn.textContent = 'Küldés…';

  const latlng = marker.getLatLng();
  const { x, y } = toStoredCoords(latlng, sessionData.mapHeight);

  try {
    const res = await fetch('/api/geogta/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, x, y }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Nem sikerült beküldeni a tippet.');
      return;
    }

    clearInterval(countdownInterval);

    // A valós helyszín kirajzolása a térképen, hogy a játékos lássa a különbséget
    const realLatLng = L.latLng(sessionData.mapHeight - data.actualY, data.actualX);
    L.marker(realLatLng, {
      icon: L.divIcon({ className: 'real-marker', html: '🎯', iconSize: [24, 24] }),
    }).addTo(map);
    L.polyline([marker.getLatLng(), realLatLng], { color: '#f1c40f', dashArray: '6 6' }).addTo(map);

    els.resultLocation.textContent = data.locationName;
    els.resultDistance.textContent = `${data.distance} egység`;
    els.resultScore.textContent = `${data.score} / ${data.maxScore}`;
    els.resultReward.textContent = `+${data.coins} érem · +${data.xp} XP`;

    showPanel(els.result);
  } catch (err) {
    showError('Nem sikerült kapcsolódni a szerverhez. Próbáld újra később.');
  }
}

els.submitBtn.addEventListener('click', submitGuess);

loadSession();
