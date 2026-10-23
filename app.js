/* GasOLE - la gasolinera que de verdad te ahorra dinero */
(() => {
"use strict";

const FUELS = [
  { code: "g95",  name: "Gasolina 95" },
  { code: "goa",  name: "Diésel" },
  { code: "goap", name: "Diésel Premium" },
  { code: "g98",  name: "Gasolina 98" },
  { code: "glp",  name: "GLP" },
  { code: "gnc",  name: "GNC" },
];
const RADII = [5, 10, 25];
const SORTS = [
  { code: "net",   name: "💰 Ahorro neto" },
  { code: "price", name: "Precio" },
  { code: "dist",  name: "Distancia" },
];
const CONSUMO = 6.5; // L/100km para coste del viaje
const store = {
  get(k, d) { try { const v = localStorage.getItem("gasole_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("gasole_" + k, JSON.stringify(v)); } catch {} },
};

const state = {
  data: null, lat: null, lon: null,
  fuel: store.get("fuel", "g95"),
  tank: store.get("tank", 50),
  radius: store.get("radius", 10),
  sort: store.get("sort", "net"),
  favs: new Set(store.get("favs", [])),
  showFavs: false,
  results: [],
  zoneAvg: null,
};

const $ = id => document.getElementById(id);
const fmtP = v => v.toFixed(3).replace(".", ",");
const fmtE = v => Math.abs(v).toFixed(2).replace(".", ",");
const fmtD = km => km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1).replace(".", ",") + " km";

function haversine(a, b, c, d) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---- horarios: abierto ahora (mejor esfuerzo) ---- */
const DAYIDX = { L: 1, M: 2, X: 3, J: 4, V: 5, S: 6, D: 0 };
function openNow(h) {
  if (!h) return null;
  h = h.toUpperCase().trim();
  const now = new Date(), day = now.getDay(), mins = now.getHours() * 60 + now.getMinutes();
  if (/24\s*H/.test(h) && /L\s*-\s*D|L-D/.test(h)) return true;
  const segs = h.split(";").map(s => s.trim()).filter(Boolean);
  let hit = null;
  for (const seg of segs) {
    const m = seg.match(/^([LMXJVSD])\s*-\s*([LMXJVSD])\s*:?\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    const one = seg.match(/^([LMXJVSD])\s*:\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    let days = [], a, b;
    if (m) {
      const d1 = DAYIDX[m[1]], d2 = DAYIDX[m[2]];
      for (let i = 0; i < 7; i++) { const dd = (d1 + i) % 7; days.push(dd); if (dd === d2) break; }
      a = +m[3] * 60 + +m[4]; b = +m[5] * 60 + +m[6];
    } else if (one) {
      days = [DAYIDX[one[1]]]; a = +one[2] * 60 + +one[3]; b = +one[4] * 60 + +one[5];
    } else if (/24\s*H/.test(seg)) { return true; }
    else continue;
    if (days.includes(day)) hit = b > a ? (mins >= a && mins < b) : (mins >= a || mins < b);
  }
  return hit;
}

/* ---- datos ---- */
async function loadData() {
  const cached = store.get("data", null);
  const cachedAt = store.get("dataAt", 0);
  if (cached && Date.now() - cachedAt < 6 * 3600e3) return cached;
  const r = await fetch("data/stations.json");
  if (!r.ok) throw new Error("HTTP " + r.status);
  const d = await r.json();
  store.set("data", d); store.set("dataAt", Date.now());
  return d;
}

/* ---- UI: chips ---- */
function chipRow(el, items, active, onPick) {
  el.innerHTML = "";
  for (const it of items) {
    const b = document.createElement("button");
    b.className = "chip" + (it.code === active ? " active" : "");
    b.textContent = it.name;
    b.onclick = () => onPick(it.code);
    el.appendChild(b);
  }
}
function renderControls() {
  chipRow($("fuelChips"), FUELS, state.fuel, c => { state.fuel = c; store.set("fuel", c); renderControls(); compute(); });
  chipRow($("radiusChips"), RADII.map(r => ({ code: r, name: r + " km" })), state.radius, c => { state.radius = c; store.set("radius", c); renderControls(); compute(); });
  const sorts = SORTS.concat([{ code: "fav", name: state.showFavs ? "★ Favoritas" : "☆ Favoritas" }]);
  chipRow($("sortChips"), sorts, state.showFavs ? "fav" : state.sort, c => {
    if (c === "fav") { state.showFavs = !state.showFavs; }
    else { state.sort = c; state.showFavs = false; store.set("sort", c); }
    renderControls(); compute();
  });
  $("tank").value = state.tank; $("tankVal").textContent = state.tank;
}
$("tank").oninput = e => { state.tank = +e.target.value; $("tankVal").textContent = state.tank; store.set("tank", state.tank); compute(); };

/* ---- cálculo principal ---- */
function compute() {
  const box = $("list"), empty = $("empty");
  box.innerHTML = ""; empty.hidden = true;
  if (!state.data || state.lat == null) return;
  const code = state.fuel;
  let rows = state.data.stations
    .filter(s => s.pr[code] != null)
    .map(s => ({ ...s, price: s.pr[code], dist: haversine(state.lat, state.lon, s.lat, s.lon) }))
    .filter(s => s.dist <= state.radius);
  if (state.showFavs) rows = rows.filter(s => state.favs.has(s.id));
  if (!rows.length) {
    empty.hidden = false;
    empty.innerHTML = state.showFavs
      ? "No tienes favoritas en esta zona.<br>Toca ★ en una gasolinera para guardarla."
      : `No hay gasolineras con ${FUELS.find(f => f.code === code).name} en ${state.radius} km.<br>Prueba a ampliar el radio.`;
    $("stats").hidden = true; drawMap(rows); return;
  }
  state.zoneAvg = rows.reduce((t, s) => t + s.price, 0) / rows.length;
  for (const s of rows) {
    s.gross = (state.zoneAvg - s.price) * state.tank;
    s.trip = 2 * s.dist * (CONSUMO / 100) * s.price;
    s.net = s.gross - s.trip;
  }
  const key = state.sort === "price" ? "price" : state.sort === "dist" ? "dist" : "net";
  rows.sort((a, b) => state.sort === "dist" ? a.dist - b.dist : (key === "price" ? a.price - b.price : b.net - a.net));
  state.results = rows;
  renderStats(rows);
  renderList(rows);
  drawMap(rows);
}

function renderStats(rows) {
  const best = rows[0];
  const cheap = rows.reduce((a, b) => a.price < b.price ? a : b);
  $("stats").hidden = false;
  $("stats").innerHTML = `
    <div class="stat good"><b>${fmtP(cheap.price)} €</b><span>la más barata</span></div>
    <div class="stat"><b>${fmtP(state.zoneAvg)} €</b><span>media de la zona</span></div>
    <div class="stat"><b>${rows.length}</b><span>gasolineras</span></div>`;
  void best;
}

function renderList(rows) {
  const box = $("list");
  box.innerHTML = "";
  const frag = document.createDocumentFragment();
  rows.slice(0, 60).forEach((s, i) => {
    const open = openNow(s.h);
    const card = document.createElement("article");
    card.className = "card" + (i === 0 && !state.showFavs ? " best" : "");
    const netBadge = state.sort !== "dist"
      ? (s.net >= 0.05
          ? `<div class="saving">Ahorras ${fmtE(s.net)} €/depósito</div>`
          : `<div class="saving neg">El viaje se come ${fmtE(s.net)} €</div>`)
      : "";
    card.innerHTML = `
      <div class="rank">${i + 1}</div>
      <div class="info">
        <div class="name">${esc(s.r || "Gasolinera")}</div>
        <div class="addr">${esc(s.d)} · ${esc(s.m)} · ${fmtD(s.dist)}</div>
        <div class="meta">
          ${open === true ? '<span class="open">Abierta ahora</span>' : open === false ? '<span class="closed">Cerrada ahora</span>' : ""}
          <span>${esc(s.h || "")}</span>
        </div>
      </div>
      <div class="price">
        <div class="p">${fmtP(s.price)}<span class="u"> €/L</span></div>
        ${netBadge}
      </div>
      <div class="actions">
        <button class="abtn fav${state.favs.has(s.id) ? " on" : ""}" data-id="${s.id}">${state.favs.has(s.id) ? "★" : "☆"}</button>
        <a class="abtn go" href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}" target="_blank" rel="noopener">Cómo llegar</a>
      </div>`;
    frag.appendChild(card);
  });
  box.appendChild(frag);
  box.querySelectorAll(".fav").forEach(b => b.onclick = () => {
    const id = b.getAttribute("data-id");
    state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
    store.set("favs", [...state.favs]);
    compute();
  });
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ---- mapa ---- */
let map = null, markers = null, meMark = null;
function drawMap(rows) {
  if (!map || state.lat == null) return;
  map.setView([state.lat, state.lon], state.radius <= 5 ? 13 : state.radius <= 10 ? 12 : 10);
  if (markers) markers.remove();
  if (meMark) meMark.remove();
  markers = L.layerGroup().addTo(map);
  meMark = L.circleMarker([state.lat, state.lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#4da3ff", fillOpacity: 1 }).addTo(map);
  if (!rows.length) return;
  const prices = rows.map(r => r.price).sort((a, b) => a - b);
  const q = p => prices[Math.min(prices.length - 1, Math.floor(prices.length * p))];
  const lo = q(0.25), hi = q(0.75);
  for (const s of rows.slice(0, 200)) {
    const color = s.price <= lo ? "#3ddc6e" : s.price >= hi ? "#ff5f56" : "#ffcc3d";
    const el = L.divIcon({ className: "", html: `<div class="mk" style="width:34px;height:34px;background:${color}">${s.price.toFixed(2).replace(".", ",")}</div>`, iconSize: [34, 34] });
    L.marker([s.lat, s.lon], { icon: el })
      .bindPopup(`<b>${esc(s.r)}</b><br>${esc(s.d)}<br><b>${fmtP(s.price)} €/L</b> · ${fmtD(s.dist)}`)
      .addTo(markers);
  }
}

function initMap() {
  map = L.map("map", { attributionControl: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
}
$("tabList").onclick = () => { $("tabList").classList.add("active"); $("tabMap").classList.remove("active"); $("list").hidden = false; $("mapwrap").hidden = true; };
$("tabMap").onclick = () => { $("tabMap").classList.add("active"); $("tabList").classList.remove("active"); $("list").hidden = true; $("mapwrap").hidden = false; if (!map) initMap(); setTimeout(() => { map.invalidateSize(); drawMap(state.results); }, 60); };

/* ---- ubicación ---- */
function setPos(lat, lon, label) {
  state.lat = lat; state.lon = lon;
  $("updated").innerHTML = (state.data ? "Precios del " + esc(state.data.updated.split(" ")[0]) : "") + (label ? "<br>📍 " + esc(label) : "");
  compute();
}
$("locate").onclick = () => {
  const b = $("locate");
  b.innerHTML = '<span class="spin"></span>Localizando…';
  navigator.geolocation.getCurrentPosition(
    p => { b.innerHTML = "📍 Usar mi ubicación"; setPos(p.coords.latitude, p.coords.longitude, "tu ubicación"); },
    () => { b.innerHTML = "📍 Usar mi ubicación"; $("empty").hidden = false; $("empty").innerHTML = "No pude obtener tu ubicación.<br>Escribe tu ciudad o código postal arriba."; },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
  );
};
async function geocode(q) {
  const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=es&q=" + encodeURIComponent(q), { headers: { "Accept": "application/json" } });
  const j = await r.json();
  return j && j[0] ? { lat: +j[0].lat, lon: +j[0].lon, name: j[0].display_name.split(",")[0] } : null;
}
async function doSearch() {
  const q = $("place").value.trim(); if (!q) return;
  const g = await geocode(q).catch(() => null);
  if (g) setPos(g.lat, g.lon, g.name);
  else { $("empty").hidden = false; $("empty").textContent = "No encuentro ese sitio. Prueba con la ciudad o el CP."; }
}
$("searchBtn").onclick = doSearch;
$("place").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

/* ---- arranque ---- */
(async () => {
  renderControls();
  try {
    state.data = await loadData();
    $("updated").textContent = "Precios del " + state.data.updated.split(" ")[0];
  } catch (e) {
    $("empty").hidden = false;
    $("empty").textContent = "No pude cargar los precios. Revisa tu conexión y recarga.";
    return;
  }
  if (/view=map/.test(location.hash)) $("tabMap").onclick();
  const h = location.hash.match(/lat=(-?[\d.]+)&lon=(-?[\d.]+)/);
  if (h) setPos(+h[1], +h[2], "zona compartida");
  else {
    const last = store.get("lastPos", null);
    if (last) setPos(last.lat, last.lon, last.label || "última ubicación");
    else $("locate").focus();
  }
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone) {
    const d = document.createElement("div");
    d.className = "installhint";
    d.innerHTML = "📲 Instálala: <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>";
    document.querySelector(".hero").appendChild(d);
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
const origSetPos = setPos;
setPos = (lat, lon, label) => { store.set("lastPos", { lat, lon, label }); origSetPos(lat, lon, label); };
})();
