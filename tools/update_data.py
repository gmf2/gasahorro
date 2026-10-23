#!/usr/bin/env python3
"""Download MITERD fuel prices and write a compact data/stations.json."""
import json, urllib.request, datetime

URL = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/"

# fuel key -> (source field, short code)
FUELS = {
    "g95":  "Precio Gasolina 95 E5",
    "g98":  "Precio Gasolina 98 E5",
    "goa":  "Precio Gasoleo A",
    "goap": "Precio Gasoleo Premium",
    "glp":  "Precio Gases licuados del petr\u00f3leo",
    "gnc":  "Precio Gas Natural Comprimido",
}

def fnum(s):
    if not s: return None
    try: return float(s.replace(",", "."))
    except ValueError: return None

def fcoord(s):
    try: return round(float(s.replace(",", ".")), 6)
    except (ValueError, AttributeError): return None

req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
with urllib.request.urlopen(req, timeout=120) as r:
    raw = json.load(r)

out = []
for s in raw["ListaEESSPrecio"]:
    lat, lon = fcoord(s.get("Latitud")), fcoord(s.get("Longitud (WGS84)"))
    if lat is None or lon is None: continue
    prices = {}
    for code, field in FUELS.items():
        v = fnum(s.get(field))
        if v and 0.3 < v < 5:  # sanity filter
            prices[code] = v
    if not prices: continue
    out.append({
        "id": s.get("IDEESS"), "r": (s.get("Rótulo") or "").strip(),
        "d": (s.get("Dirección") or "").strip(), "m": (s.get("Municipio") or "").strip(),
        "p": (s.get("Provincia") or "").strip(), "h": (s.get("Horario") or "").strip(),
        "lat": lat, "lon": lon, "pr": prices,
    })

data = {
    "updated": raw.get("Fecha", ""),
    "generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "count": len(out),
    "stations": out,
}
with open("data/stations.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print(f"wrote {len(out)} stations, source date: {data['updated']}")
