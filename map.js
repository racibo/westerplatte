/* Inicjalizacja map Leaflet dla witryny Obrońców Westerplatte.
   Każda mapa pobiera punkty z <script type="application/json"> o id podanym
   jako drugi argument. Wymaga załadowanej biblioteki Leaflet (L).

   Format danych (tablica lub obiekt):
     [ {lat, lon, label, name, color, phase_label, context}, ... ]   – bez kategorii
     { cats:[{key,label,color}], points:[ {..., cat:"klucz"}, ... ] } – z kategoriami

   Jeśli przekazano opts.legend (id elementu legendy), pod mapą pojawiają
   się przełączniki włączające/wyłączające poszczególne kategorie. */

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function initMapFromScript(containerId, jsonScriptId, opts) {
  opts = opts || {};
  var el = document.getElementById(containerId);
  var script = document.getElementById(jsonScriptId);
  if (!el || !script) return;

  var raw;
  try {
    raw = JSON.parse(script.textContent);
  } catch (e) {
    console.error("Błąd danych mapy:", e);
    return;
  }

  var points, cats;
  if (Array.isArray(raw)) {
    points = raw;
    cats = [];
  } else {
    points = raw.points || [];
    cats = raw.cats || [];
  }

  if (typeof L === "undefined") {
    el.innerHTML =
      '<p class="map-error">Mapa wymaga połączenia z internetem (biblioteka Leaflet).</p>';
    return;
  }

  var map = L.map(el, { scrollWheelZoom: true, zoomControl: true, attributionControl: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap",
  }).addTo(map);

  // Grupujemy punkty w warstwy według kategorii (nawet bez legendy).
  var layers = {};
  var catMeta = {};
  cats.forEach(function (c) {
    catMeta[c.key] = c;
    layers[c.key] = L.layerGroup();
  });

  var bounds = [];
  points.forEach(function (p) {
    var lat = parseFloat(p.lat);
    var lon = parseFloat(p.lon);
    if (isNaN(lat) || isNaN(lon)) return;
    var cat = p.cat || "inne";
    if (!layers[cat]) layers[cat] = L.layerGroup();
    var color =
      p.color || (catMeta[cat] && catMeta[cat].color) || "#b02a2a";
    var marker = L.circleMarker([lat, lon], {
      radius: opts.radius || 7,
      color: color,
      fillColor: color,
      fillOpacity: 0.75,
      weight: 2,
    });
    var html = "";
    if (p.name && p.name !== p.label)
      html += "<strong>" + escapeHtml(p.name) + "</strong><br>";
    if (p.label) html += escapeHtml(p.label);
    if (p.phase_label) html += "<br><em>" + escapeHtml(p.phase_label) + "</em>";
    if (p.context) html += "<br><small>" + escapeHtml(p.context) + "</small>";
    if (p.url) {
      var urlLabel = p.url_label || "Zobacz biogram →";
      html += '<br><a href="' + escapeHtml(p.url) + '">' + escapeHtml(urlLabel) + "</a>";
    }
    marker.bindPopup(html);
    marker.addTo(layers[cat]);
    bounds.push([lat, lon]);
  });

  if (!bounds.length) {
    map.setView([54.4, 18.67], 6);
    el.innerHTML = '<p class="map-error">Brak współrzędnych dla tego widoku.</p>';
    return;
  }

  // Dodaj wszystkie warstwy do mapy.
  Object.keys(layers).forEach(function (k) {
    if (layers[k].getLayers().length) layers[k].addTo(map);
  });

  // Strzałki pokazujące przemieszczanie się żołnierza (jak w pierwotnej wersji).
  if (opts.arrows && points.length > 1) {
    var PHASE_ARROW = {
      dzieciństwo: { color: "#2a6fb0", dash: null },
      bitwa:       { color: "#b02a2a", dash: null },
      wojna:       { color: "#d98a1f", dash: "6,6" },
      powojnie:    { color: "#2e8b57", dash: "2,6" },
    };
    for (var i = 0; i < points.length - 1; i++) {
      var a = points[i], b = points[i + 1];
      var st = PHASE_ARROW[b.phase] || PHASE_ARROW.bitwa;
      var popts = { color: st.color, weight: 3, opacity: 0.85 };
      if (st.dash) popts.dashArray = st.dash;
      L.polyline([
        [parseFloat(a.lat), parseFloat(a.lon)],
        [parseFloat(b.lat), parseFloat(b.lon)],
      ], popts).addTo(map);
      var midLat = (parseFloat(a.lat) + parseFloat(b.lat)) / 2;
      var midLon = (parseFloat(a.lon) + parseFloat(b.lon)) / 2;
      var bearing = Math.atan2(
        parseFloat(b.lat) - parseFloat(a.lat),
        parseFloat(b.lon) - parseFloat(a.lon)
      ) * 180 / Math.PI;
      var rot = 90 - bearing;
      var icon = L.divIcon({
        className: "arrow-head",
        html: '<div style="transform:rotate(' + rot +
              'deg);border-bottom-color:' + st.color + '"></div>',
        iconSize: [14, 14], iconAnchor: [7, 7],
      });
      L.marker([midLat, midLon], { icon: icon, interactive: false }).addTo(map);
    }
  }

  if (bounds.length === 1) {
    // Pojedynczy punkt – duży zoom (jak w pierwotnej wersji).
    map.setView(bounds[0], opts.battle ? 15 : 15);
  } else {
    var maxZoom = opts.battle ? 16 : 15;
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: maxZoom });
    // Mapa pola bitwy (lub bardzo bliskie punkty) – nie oddalaj za bardzo.
    var minZoom = opts.battle ? 14 : 4;
    if (map.getZoom() < minZoom) map.setZoom(minZoom);
  }

  // Legenda z przełącznikami kategorii.
  if (opts.legend) {
    var legendEl = document.getElementById(opts.legend);
    if (legendEl) {
      var present = cats.filter(function (c) {
        return layers[c.key] && layers[c.key].getLayers().length;
      });
      if (!present.length) {
        legendEl.style.display = "none";
      }
      present.forEach(function (c) {
        var id = "tg-" + containerId + "-" + c.key;
        var label = document.createElement("label");
        label.className = "legend-item";
        label.setAttribute("for", id);
        label.innerHTML =
          '<input type="checkbox" id="' + id + '" data-cat="' + c.key + '" checked>' +
          '<span class="swatch" style="background:' + c.color + '"></span>' +
          escapeHtml(c.label) + " (" + layers[c.key].getLayers().length + ")";
        legendEl.appendChild(label);
        var cb = label.querySelector("input");
        cb.addEventListener("change", function () {
          if (cb.checked) map.addLayer(layers[c.key]);
          else map.removeLayer(layers[c.key]);
        });
      });
    }
  }
}
