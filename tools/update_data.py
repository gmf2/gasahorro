#!/usr/bin/env python3
"""Download MITERD fuel prices and write a compact data/stations.json."""
import json, time, subprocess, urllib.request, datetime

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

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

def get_curl(url):
    out = subprocess.run(["curl", "-sS", "--fail", "--http1.1", "--compressed", "-m", "180", "--retry", "2",
                          "-H", "User-Agent: " + UA, "-H", "Accept: application/json, text/plain, */*",
                          "-H", "Accept-Language: es-ES,es;q=0.9", url],
                         capture_output=True, check=True, timeout=400)
    return json.loads(out.stdout)

def get_urllib(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)

def fetch(url, rounds=3):
    last = None
    for i in range(rounds):
        for name, fn in (("curl", get_curl), ("urllib", get_urllib)):
            try:
                raw = fn(url)
                if "ListaEESSPrecio" not in raw or len(raw["ListaEESSPrecio"]) < 10000:
                    raise ValueError("respuesta inesperada o incompleta del Ministerio")
                print(f"descarga ok con {name}", flush=True)
                return raw
            except Exception as e:
                last = e
                detail = getattr(e, "stderr", b"")
                print(f"ronda {i+1}/{rounds} {name} fallido: {e} {detail[-200:] if detail else ''}", flush=True)
        time.sleep(20 * (i + 1))
    raise last

def fnum(s):
    if not s: return None
    try: return float(s.replace(",", "."))
    except ValueError: return None

def fcoord(s):
    try: return round(float(s.replace(",", ".")), 6)
    except (ValueError, AttributeError): return None

raw = fetch(URL)

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
