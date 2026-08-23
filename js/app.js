"use strict";

let globalData = [];
let lastView = "view-list"; // widok, z którego otwarto biogram (do przycisku „Wróć”)

// Przełącza aktywny widok (zakładkę). Zdefiniowana globalnie, by mogła być
// wywoływana też z openSoldier (poza DOMContentLoaded).
let _tabBtns = null, _tabContents = null;
function activateTab(targetId, reset) {
  if (!_tabBtns) _tabBtns = document.querySelectorAll(".tab-btn");
  if (!_tabContents) _tabContents = document.querySelectorAll(".tab-content");
  _tabBtns.forEach(t => t.classList.remove("active"));
  _tabContents.forEach(c => c.classList.remove("active"));
  const btn = document.querySelector('.tab-btn[data-target="' + targetId + '"]');
  if (btn) btn.classList.add("active");
  const c = document.getElementById(targetId);
  if (c) c.classList.add("active");

  if (targetId === "view-battlemap") { if (reset !== false) { BattleMap.showAll(); document.querySelectorAll(".bd-toggle").forEach(cb => cb.checked = true); } BattleMap.invalidate(); }
  if (targetId === "view-generalmap") { if (reset !== false) GeneralMap.showAll(); GeneralMap.invalidate(); }
  if (targetId === "view-biogram") { if (typeof BioMap !== "undefined") BioMap.invalidate(); }
}

// Pola biogramu (klucz kolumny w arkuszu -> etykieta + kategoria kolorystyczna)
// cat: prewar = przed 1 września | battle = 1–7 września | postwar = obozy i losy powojenne
const BIO_FIELDS = [
  { f: "nazwisko imię", l: "Nazwisko i imię", cat: "prewar" },
  { f: "data urodzenia", l: "Data i miejsce urodzenia", cat: "prewar" },
  { f: "życie do 1939 roku", l: "Życie do 1939 roku", cat: "prewar" },
  { f: "1 wrz", l: "1 września", cat: "battle" },
  { f: "1 września 1939 cd", l: "1 września (cd)", cat: "battle" },
  { f: "2 wrz", l: "2 września", cat: "battle" },
  { f: "3-6 wrz 1939", l: "3–6 września", cat: "battle" },
  { f: "7 wrz", l: "7 września", cat: "battle" },
  { f: "1939-1945", l: "1939-1945 (obozy jenieckie)", cat: "postwar" },
  { f: "po wojnie", l: "Losy powojenne", cat: "postwar" }
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const modal = () => document.getElementById("detailModal");

function showModal(html) {
  document.getElementById("modalBody").innerHTML = html;
  modal().hidden = false;
}

function closeModal() { modal().hidden = true; }

// Wyjaśnienie autora: czym jest strona, skąd dane, charakter amatorski.
const ABOUT_HTML = `
  <h2>O stronie i jej autorze</h2>
  <p>Nazywam się <strong>Jakub Raciborski</strong> i zawodowo oprowadzam turystów po Westerplatte i Trójmieście. Staram się przekazać słuchaczom przekrój najważniejszych informacji o półwyspie – o jego obronie we wrześniu 1939 roku oraz o losach ludzi i samego miejsca po wojnie.</p>
  <p>Z literatury dotyczącej Westerplatte staram się wyciągać te informacje, które są najciekawsze i najbardziej wartościowe dla zrozumienia obrońców oraz miejsc, w których toczyła się walka. W ten sposób powstała baza danych, która tworzy tę stronę.</p>
  <p>Strona ma charakter <strong>amatorski</strong> i nie zawiera przypisów naukowych – jest przede wszystkim narzędziem w mojej pracy przewodnika. Podczas wycieczki łączę te pozornie suche dane w opowieść o bitwie, która rozegrała się na tym skrawku ziemi.</p>
  <p class="about-cta">Jeśli chcesz poznać Westerplatte nie tylko z map i tabel, <a href="https://racibo.pl/" target="_blank" rel="noopener">zapraszam na oprowadzanie →</a></p>
`;

function openAbout() { showModal(ABOUT_HTML); }

// Otwiera biogram żołnierza (bez map — mapy otwierane są przyciskami na stronie głównej)
function openSoldier(rec) {
  if (!rec) return;
  const idx = globalData.indexOf(rec);

  const rows = BIO_FIELDS.map(({ f, l, cat }) => {
    const v = getCol(rec, Array.isArray(f) ? f : [f]);
    return v ? `<tr class="bio-row ${cat}"><th>${l}</th><td>${escapeHtml(stripGpsForDisplay(v))}</td></tr>` : "";
  }).join("");

  const pk = getPlacowkaKey(rec);
  const bp = pk ? battlePoints.find(p => p.key === pk) : null;
  const placeLine = bp
    ? `<p class="place-ref">Przypisana placówka bojowa: <span class="soldier-link" data-place-key="${bp.key}">${bp.name}</span></p>`
    : "";

  const battlePath = buildBattlePath(rec);
  const lifePath = buildLifePath(rec);

  const mapButtons = (battlePath.length || lifePath.length) ? `
    <p class="map-open-hint">Mapy zaznaczające tylko miejsca tego uczestnika:</p>
    <div class="map-open-buttons">
      ${battlePath.length ? `<button class="map-open-btn" data-map-open="battle" data-idx="${idx}">Pokaż przemieszczanie 1–7 IX na mapie bitew</button>` : ""}
      ${lifePath.length ? `<button class="map-open-btn" data-map-open="general" data-idx="${idx}">Pokaż losy życiowe na mapie ogólnej</button>` : ""}
    </div>` : "";

  const name = getCol(rec, ["nazwisko imię"]) || "Nieznany";
  const body = document.getElementById("bioBody");
  if (body) body.innerHTML =
    `<h2 class="bio-name">${escapeHtml(name)}</h2>` +
    placeLine +
    `<table class="bio">${rows}</table>` +
    mapButtons;

  const title = document.getElementById("bioTitle");
  if (title) title.textContent = name;

  // Zapamiętaj skąd przyszliśmy (lista lub mapa), by wrócić przyciskiem „Wróć”
  const active = document.querySelector(".tab-content.active");
  lastView = active ? active.id : "view-list";

  // Otwórz widok biogramu jak osobną podstronę (bez zasłaniania mapy)
  activateTab("view-biogram", false);
  if (typeof BioMap !== "undefined") BioMap.showSoldier(rec);
}

// Otwiera informacje o placówce/miejscu na mapie bitwy
function openPlace(key) {
  const bp = battlePoints.find(p => p.key === key);
  if (!bp) return;
  const defenders = globalData
    .map((s, i) => ({ s, i }))
    .filter(o => getPlacowkaKey(o.s) === key);

  const list = defenders.length
    ? defenders.map(o => `<div class="soldier-link" data-soldier-idx="${o.i}">• ${escapeHtml(getCol(o.s, ["nazwisko imię"]) || "Nieznany")}</div>`).join("")
    : `<p class="note">Brak przypisanych obrońców w bazie.</p>`;

  showModal(
    `<h2>${escapeHtml(bp.name)}</h2>` +
    `<p class="coords">Współrzędne: ${bp.lat.toFixed(5)}, ${bp.lng.toFixed(5)}</p>` +
    (bp.desc ? `<p>${escapeHtml(bp.desc)}</p>` : "") +
    `<h3>Obrońcy przypisani do placówki (${defenders.length})</h3>` +
    list
  );
}

document.addEventListener("DOMContentLoaded", () => {

  // Delegacja kliknięć: biogramy i miejsca
  document.addEventListener("click", (e) => {
    const ab = e.target.closest("[data-about]");
    if (ab) { openAbout(); return; }

    if (e.target.closest("#modalClose") || e.target === modal()) { closeModal(); return; }
    if (e.target.closest("#bioBack")) { activateTab(lastView || "view-list", true); return; }

    const rb = e.target.closest(".map-reset-btn");
    if (rb) {
      if (rb.dataset.reset === "battle") {
        BattleMap.showAll();
        document.querySelectorAll(".bd-toggle").forEach(cb => cb.checked = true);
      } else GeneralMap.showAll();
      return;
    }

    const cb = e.target.closest(".map-cross-btn");
    if (cb) {
      const idx = parseInt(cb.closest(".map-focus-bar").dataset.idx, 10);
      if (cb.dataset.cross === "general") { activateTab("view-generalmap", false); GeneralMap.showSoldier(idx); }
      else { activateTab("view-battlemap", false); BattleMap.showSoldier(idx); }
      return;
    }

    const fi = e.target.closest(".fly-item");
    if (fi) {
      const lat = parseFloat(fi.dataset.lat), lng = parseFloat(fi.dataset.lng);
      if (fi.dataset.map === "battle") BattleMap.flyTo(lat, lng);
      else GeneralMap.flyTo(lat, lng);
      return;
    }

    const mb = e.target.closest(".map-open-btn");
    if (mb) {
      const type = mb.dataset.mapOpen;
      const i = parseInt(mb.dataset.idx, 10);
      closeModal();
      if (type === "battle") { activateTab("view-battlemap", false); BattleMap.showSoldier(i); }
      else { activateTab("view-generalmap", false); GeneralMap.showSoldier(i); }
      return;
    }

    const sl = e.target.closest("[data-soldier-idx]");
    if (sl) {
      const i = parseInt(sl.dataset.soldierIdx, 10);
      if (globalData[i]) openSoldier(globalData[i]);
      return;
    }
    const pl = e.target.closest("[data-place-key]");
    if (pl) { openPlace(pl.dataset.placeKey); return; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modalEl = document.getElementById("detailModal");
      if (modalEl && !modalEl.hidden) closeModal();
      else if (document.getElementById("view-biogram") && document.getElementById("view-biogram").classList.contains("active")) {
        activateTab(lastView || "view-list", true);
      }
    }
  });

  // 1. Obsługa zakładek (Tabs) — activateTab() jest zdefiniowana globalnie (wyżej)

  document.querySelectorAll(".tab-btn").forEach(tab => {
    tab.addEventListener("click", () => {
      activateTab(tab.getAttribute("data-target"), true);
    });
  });

  // 2. Inicjalizacja Map
  BattleMap.build();
  GeneralMap.build();
  if (typeof BioMap !== "undefined") BioMap.build();

  // Filtr daty na Mapie bitwy (kolumny dni walki) – generowany z BATTLE_DAYS
  const bdWrap = document.getElementById("bdToggleWrap");
  if (bdWrap && typeof BATTLE_DAYS !== "undefined") {
    BATTLE_DAYS.forEach((d, i) => {
      const lab = document.createElement("label");
      lab.innerHTML = `<input type="checkbox" class="bd-toggle" data-day="${i}" checked> ${d.label}`;
      bdWrap.appendChild(lab);
    });
  }
  const battleDateFilter = () => {
    const days = [...document.querySelectorAll(".bd-toggle")]
      .filter(cb => cb.checked)
      .map(cb => (typeof BATTLE_DAYS !== "undefined" ? BATTLE_DAYS[+cb.dataset.day] : null))
      .filter(Boolean);
    BattleMap.setDateFilter(days.length ? days : null);
  };
  document.querySelectorAll(".bd-toggle").forEach(cb => cb.addEventListener("change", battleDateFilter));

  // Przełączanie kategorii na Mapie ogólnej
  document.querySelectorAll(".gm-toggle").forEach(cb => {
    cb.addEventListener("change", () => {
      GeneralMap.setCategory(cb.dataset.cat, cb.checked);
    });
  });

  // 4. Wyszukiwarka
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = q
        ? globalData.filter(s => getCol(s, ["nazwisko imię", "data urodzenia", "życie do 1939 roku"]).toLowerCase().includes(q))
        : globalData;
      renderList(filtered);
    });
  }

  // 3. Pobieranie danych z arkusza Google
  const sheetUrl = "https://docs.google.com/spreadsheets/d/1TmRHJDv6IMlGwg761JV50M8vS4zXTdWBtjDziAleSQI/gviz/tq?tqx=out:csv&gid=586136597";

  // Opcjonalny SŁOWNIK MIEJSC — osobna zakładka tego samego arkusza.
  // Kolumny: "miejscowość" (lub "name"), "lat" (lub "szerokosc"), "lng" (lub "dlugosc").
  // Dzięki temu nowe miejsca (np. dokładne cmentarze) dopisujesz w arkuszu, bez edycji kodu.
  const DICT_URL = ""; // np. ".../gviz/tq?tqx=out:csv&gid=XXXX"

  const statusEl = document.getElementById("dataStatus");
  statusEl.innerText = "Pobieranie danych z arkusza...";

  // Łączy zewnętrzny słownik miejsc (jeśli DICT_URL ustawione) z PLACES
  const loadDictionary = () => new Promise((resolve) => {
    if (!DICT_URL) return resolve();
    const finish = (rows) => { try { GeneralMap.mergePlaces(rows); } catch (e) {} resolve(); };
    if (typeof Papa !== "undefined") {
      Papa.parse(DICT_URL, {
        download: true, header: true, skipEmptyLines: true,
        complete: (r) => finish(r.data.map(d => ({
          name: d["miejscowość"] || d.name || d.nazwa,
          lat: d.lat || d.szerokosc,
          lng: d.lng || d.dlugosc
        }))),
        error: () => resolve()
      });
    } else {
      fetch(DICT_URL).then(r => r.text()).then(() => resolve()).catch(() => resolve());
    }
  });

  const onData = (data) => {
    globalData = data;
    statusEl.innerText = `Załadowano rekordów: ${globalData.length}`;
    renderList(globalData);
    BattleMap.setSoldiers(globalData);
    loadDictionary().then(() => {
      GeneralMap.populate(globalData);
      reportUnmatched(globalData);
      computeDbStats(globalData);
    });
  };

  // Diagnostyka: wypisuje miejsca z arkusza, które NIE mają współrzędnych GPS
  // (to one powodują "puste" punkty na mapie). Dopisz je do js/places.js.
  function reportUnmatched(data) {
    const cols = [
      ["data urodzenia", null],
      ["życie do 1939 roku", null],
      ["1939-1945", null],
      ["po wojnie", null],
      ["data śmierci", { death: true }]
    ];
    const report = {};
    cols.forEach(([col, opts]) => {
      const missing = new Set();
      data.forEach(s => {
        const v = getCol(s, Array.isArray(col) ? col : [col]);
        if (v && findPlacesInText(v, opts).length === 0) missing.add(v.trim());
      });
      if (missing.size) report[col] = [...missing];
    });
    const all = [...new Set(Object.values(report).flat())];
    if (all.length) {
      console.warn("Miejsca bez współrzędnych GPS (dopisz do js/places.js):", report);
      const safe = all.map(n => `  "${n.replace(/"/g, '\\"')}": { lat: 0.0, lng: 0.0 }`).join(",\n");
      console.log("Gotowy szablon do wklejenia do js/places.js:\nwindow.EXTRA_PLACES = {\n" + safe + "\n};");
    }
  }

  // Statystyki wypełnienia bazy: % komórek (kol. A-J), nazwiska, miejsca z GPS,
  // % dat urodzin, % dat śmierci, % miejsc urodzin.
  function computeDbStats(data) {
    const total = data.length;
    if (!total) return;
    const FILL_COLS = [
      "nazwisko imię", "data urodzenia", "życie do 1939 roku",
      "1 wrz", "1 września 1939 cd", "2 wrz", "3-6 wrz 1939", "7 wrz",
      "1939-1945", "po wojnie"
    ];
    const cellTotal = total * FILL_COLS.length;
    let filled = 0, names = 0, birthDate = 0, birthPlace = 0, death = 0, placesGps = 0;
    data.forEach(s => {
      FILL_COLS.forEach(c => { if ((getCol(s, [c]) || "").toString().trim() !== "") filled++; });
      if (getCol(s, ["nazwisko imię"]).trim()) names++;
      if (getCol(s, ["data urodzenia"]).trim()) birthDate++;
      const life = getLifePlacesByCat(s);
      if (life.birth.length) birthPlace++;
      if (life.death.length) death++;
      placesGps += buildLifePath(s).length;
    });
    const pct = n => Math.round(n / total * 100);
    const cellPct = Math.round(filled / cellTotal * 100);
    statusEl.innerHTML =
      `Baza danych: <b>${cellPct}%</b> wypełnienia <span class="db-info" tabindex="0" role="button" aria-label="Szczegóły wypełnienia bazy">&#9432;` +
      `<span class="db-tip">` +
      `Rekordów: <b>${total}</b><br>` +
      `Nazwiska: <b>${names}</b><br>` +
      `Miejsca z GPS: <b>${placesGps}</b><br>` +
      `Daty urodzin: <b>${pct(birthDate)}%</b><br>` +
      `Daty śmierci: <b>${pct(death)}%</b><br>` +
      `Miejsca urodzin: <b>${pct(birthPlace)}%</b><br>` +
      `Wypełnienie komórek (A–J): <b>${cellPct}%</b> ` +
      `<span class="db-goal">(cel: 100%)</span>` +
      `</span></span>`;
  }

  if (typeof Papa !== "undefined") {
    Papa.parse(sheetUrl, {
      download: true, header: true, skipEmptyLines: true,
      complete: (r) => onData(r.data),
      error: (err) => { statusEl.innerText = "Błąd pobierania danych!"; console.error(err); }
    });
  } else {
    fetch(sheetUrl).then(r => r.text()).then(t => onData(parseCSV(t)))
      .catch(err => { statusEl.innerText = "Błąd sieci podczas pobierania arkusza."; console.error(err); });
  }
});

// Renderuje listę żołnierzy (kafelki klikalne -> biogram)
function renderList(data) {
  const container = document.getElementById("searchResults");
  if (!container) return;

  if (!data.length) {
    container.innerHTML = `<p class="note">Brak wyników.</p>`;
    return;
  }

  container.innerHTML = data.map(s => {
    const idx = globalData.indexOf(s);
    const name = getCol(s, ["nazwisko imię"]) || "Nieznany";
    const death = getCol(s, ["data śmierci"]);

    // Pokaż przydział z tej kolumny dni, w której wykryto placówkę (może być
    // w 1, 2, 3-6 lub 7 wrz – nazwy bywają w różnych komórkach).
    let placeText = "", placeDay = "";
    for (const c of BP_DAY_COLS) {
      const v = stripGpsForDisplay(getCol(s, [c]));
      if (v) { placeText = v; placeDay = c; break; }
    }

    return `
      <div class="soldier-card clickable" data-soldier-idx="${idx}">
        <strong>${escapeHtml(name)}</strong><br>
        <small>${placeText ? 'Przydział (' + escapeHtml(placeDay) + '): ' + escapeHtml(placeText) : ''}</small>
        ${death ? '<br><small>Śmierć/Pochówek: ' + escapeHtml(stripGpsForDisplay(death)) + '</small>' : ''}
      </div>
    `;
  }).join("");
}

// Awaryjny parser CSV (gdyby nie było PapaParse)
function parseCSV(text) {
  const lines = text.split("\n");
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ''));
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const currentline = lines[i].split(",");
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = currentline[j] ? currentline[j].trim().replace(/^"|"$/g, '') : "";
    }
    result.push(obj);
  }
  return result;
}
