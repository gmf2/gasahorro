# GasOLE ⛽

La gasolinera más barata cerca de ti, ordenada por **ahorro real**: precio oficial menos lo que gastas en llegar.

- Precios oficiales del Geoportal de Gasolineras (Ministerio de Industria), actualizados a diario por una GitHub Action.
- Ahorro neto por depósito: (media de la zona − precio) × litros − coste del viaje de ida y vuelta.
- Mapa con marcadores por color (verde = barata, rojo = cara), favoritas, abierto-ahora, calculadora de depósito.
- Web app instalable (PWA): Safari → Compartir → Añadir a pantalla de inicio en iPhone; en Android, "Añadir a pantalla de inicio" desde Chrome.
- Sin registro, sin anuncios, sin cuentas.

## Desarrollo

- App estática: `index.html`, `app.js`, `styles.css`, `sw.js`.
- Datos: `data/stations.json`, generado por `tools/update_data.py` (Action `.github/workflows/update-prices.yml`, 2 veces al día).
- Mapa: Leaflet + OpenStreetMap.

Los datos de precios son datos abiertos de la Administración (MITERD), reutilizables libremente.
