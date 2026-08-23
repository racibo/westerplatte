"use strict";

// Pomocnik: dopasowanie klucza kolumny niezależnie od wielkości liter/akcentów
function normKey(s) {
  if (!s) return "";
  return s.toLowerCase()
    .replace(/[ąćęłńóśźż]/g, c => ({ą:"a",ć:"c",ę:"e",ł:"l",ń:"n",ó:"o",ś:"s",ź:"z",ż:"z"}[c]))
    .trim();
}

// Proste escapowanie HTML (tekst z arkusza)
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Pobiera wartość z rekordu według listy możliwych nazw kolumn (z arkusza)
function getCol(rec, names) {
  if (!rec) return "";
  if (!rec.__norm) {
    rec.__norm = {};
    for (const k in rec) rec.__norm[normKey(k)] = k;
  }
  for (const n of names) {
    const real = rec.__norm[normKey(n)];
    if (real !== undefined && rec[real] != null && String(rec[real]).trim() !== "") {
      return rec[real];
    }
  }
  // Fallback: dopasowanie częściowe (nagłówek zawiera szukaną nazwę,
  // np. "obozy jenieckie (1939-1945)" -> szukane "obozy jenieckie")
  for (const n of names) {
    const nn = normKey(n);
    if (nn.length < 8) continue; // unikamy ambigu dla krótkich nazw (np. "1 wrz")
    let best = null, bestLen = Infinity;
    for (const hk in rec.__norm) {
      if (hk.includes(nn) && rec[rec.__norm[hk]] != null && String(rec[rec.__norm[hk]]).trim() !== "") {
        if (hk.length < bestLen) { bestLen = hk.length; best = rec.__norm[hk]; }
      }
    }
    if (best) return rec[best];
  }
  return "";
}

// Czy zaczyszczony tekst zawiera daną miejscowość (uwzględnia odmiany przez przyrostek)
function textHasPlace(clean, key) {
  if (!clean || !key) return false;
  clean = normKey(clean);
  key = normKey(key);
  if (clean.includes(key)) return true;
  if (key.length < 4) return false;
  const words = clean.split(/\s+/);
  // Odcinamy końcówkę odmiany (np. "warszawie" -> temat "warszaw"), by dopasować
  // miejscownik/所在的 przypadki w tekstach typu "mieszkał w Warszawie".
  const bases = [key];
  if (key.length >= 5) { bases.push(key.slice(0, -1)); bases.push(key.slice(0, -2)); }
  return words.some(w => w.length >= 4 && bases.some(b =>
    (w.startsWith(b) || b.startsWith(w)) && Math.abs(w.length - b.length) <= 4
  ));
}

// Wyodrębnia jawne współrzędne GPS z komórki, np.:
//   "Warszawa (52.2297, 21.0122)"  lub  "54.34707, 20.53019"  lub  "52,23 21,01"
// Zwraca {lat, lng} lub null. Nie myli się z datami (wymaga kropki/przecinka
// dziesiętnego i zakresu szerokości -90..90 / długości -180..180).
function extractGPS(text) {
  if (!text) return null;
  const m = String(text).match(/(-?\d{1,2}[.,]\d{1,6})\s*[,;]\s*(-?\d{1,3}[.,]\d{1,6})/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(",", "."));
  const lng = parseFloat(m[2].replace(",", "."));
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// Usuwa jawne współrzędne GPS z tekstu przeznaczonego do WYŚWIETLENIA
// (w biogramach/rosterach), zachowując resztę treści (np. "ur. Rodziewicze").
// Nie ingeruje w mapy – tam GPS jest potrzebne.
function stripGpsForDisplay(text) {
  let t = String(text);
  t = t.replace(/\(?\s*-?\d{1,3}[.,]\d{1,6}\s*[,;]\s*-?\d{1,3}[.,]\d{1,6}\s*\)?/g, " ");
  t = t.replace(/:\s*$/, " ");
  t = t.replace(/[\(\)\[\]]/g, " ");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t;
}

// Czysta nazwa miejsca z komórki (bez współrzędnych GPS i dat).
function placeNameFromCell(text) {
  let t = String(text);
  t = t.replace(/(-?\d{1,2}[.,]\d{1,6})\s*[,;]\s*(-?\d{1,3}[.,]\d{1,6})/g, " ");
  t = t.replace(/\b\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}\b/g, " ");
  t = t.replace(/\b\d{4}\b/g, " ");
  t = t.replace(/[\(\)\[\]]/g, " ");
  t = t.replace(/\b(we|w|ze|z)\b/gi, " ");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "Miejsce";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Punkty taktyczne Westerplatte (z dokładnymi współrzędnymi)
const battlePoints = [
  { lat: 54.407042, lng: 18.667746, name: "Armata polowa", key: "armata",
    desc: "Stanowisko artylerii wybrzeżowej broniące podejścia od strony portu i Nowego Portu." },
  { lat: 54.407816, lng: 18.667418, name: "Elektrownia", key: "elektrownia",
    desc: "Elektrownia Westerplatte – zaplecze techniczne i energetyczne placówki." },
  { lat: 54.405642, lng: 18.668577, name: "Przystań", key: "przystan",
    desc: "Przystań nad Martwą Wisłą – punkt zaopatrzenia placówki." },
  { lat: 54.406564, lng: 18.671694, name: "Nowe Koszary", key: "koszary",
    desc: "Nowe Koszary – główne zgrupowanie i miejsce obrony obrońców Westerplatte." },
  { lat: 54.406610, lng: 18.671831, name: "Stanowisko moździerzy", key: "mozdzierz",
    desc: "Stanowisko moździerzy – punkt wsparcia ogniowego obrońców." },
  { lat: 54.405358, lng: 18.675937, name: "Wartownia nr 1", key: "w1",
    desc: "Wartownia nr 1 – posterunek obserwacyjno-bojowy na północnym skraju placówki." },
  { lat: 54.404811, lng: 18.671576, name: "Wartownia nr 2", key: "w2",
    desc: "Wartownia nr 2 – posterunek obserwacyjno-bojowy." },
  { lat: 54.406393, lng: 18.670717, name: "Wartownia nr 3", key: "w3",
    desc: "Wartownia nr 3 – posterunek obserwacyjno-bojowy." },
  { lat: 54.408119, lng: 18.672670, name: "Wartownia nr 4", key: "w4",
    desc: "Wartownia nr 4 – posterunek obserwacyjno-bojowy." },
  { lat: 54.407088, lng: 18.675454, name: "Wartownia nr 5", key: "w5",
    desc: "Wartownia nr 5 – posterunek obserwacyjno-bojowy." },
  { lat: 54.406457, lng: 18.671951, name: "Wartownia nr 6", key: "w6",
    desc: "Wartownia nr 6 – posterunek obserwacyjno-bojowy (współrzędne przybliżone)." },
  { lat: 54.406970, lng: 18.674623, name: "Cmentarz z 2019 r.", key: "cmentarz",
    desc: "Mogiła symboliczna obrońców Westerplatte odsłonięta w 2019 r." },
  { lat: 54.407582, lng: 18.676999, name: "Placówka Fort", key: "fort",
    desc: "Placówka „Fort” – jeden z punktów oporu na zachodzie placówki." },
  { lat: 54.404787, lng: 18.681452, name: "Placówka Wał", key: "wal",
    desc: "Placówka „Wał” – punkt oporu na wschodnim skraju placówki." },
  { lat: 54.404203, lng: 18.678780, name: "Placówka Prom", key: "prom",
    desc: "Placówka „Prom” – obsada promu przez Martwą Wisłą." },
  { lat: 54.403837, lng: 18.682286, name: "Stacja kolejowa", key: "stacja",
    desc: "Stacja kolejowa – punkt na południowym obrzeżu placówki." },
  { lat: 54.403392, lng: 18.682594, name: "Brama kolejowa", key: "brama",
    desc: "Brama kolejowa – główny wjazd na teren Westerplatte." },
  { lat: 54.400800, lng: 18.681440, name: "Pancernik Schleswig-Holstein", key: "schlezwig",
    desc: "SMS Schleswig-Holstein – pancernik, który 1 września 1939 r. ostrzelał Westerplatte, rozpoczynając II wojnę światową." }
];

// Współrzędne Cmentarza obrońców Westerplatte (używane gdy pochówek podany jako "Westerplatte, Gdańsk")
const CM_KRZYZ = (() => {
  const p = battlePoints.find(x => x.key === "cmentarz");
  return p ? { lat: p.lat, lng: p.lng } : { lat: 54.406970, lng: 18.674623 };
})();

// Słownik miejscowości/obozów z rzeczywistymi współrzędnymi (wygeocodowane z danych arkusza)
const PLACES = {
  "gdańsk": { lat: 54.34760, lng: 18.65298 },
  "stalag i a": { lat: 54.3470700, lng: 20.5301900 },
  "stalag 1 a": { lat: 54.3470700, lng: 20.5301900 },
  "bierzwnik": { lat: 53.0356400, lng: 15.6649600 },
  "choszczno": { lat: 53.1704801, lng: 15.4167349 },
  "westerplatte": { lat: 54.4093117, lng: 18.6699661 },
  "prabuty": { lat: 53.7559950, lng: 19.2044449 },
  "kraków": { lat: 50.0469432, lng: 19.9971534 },
  "niemcy": { lat: 51.1638175, lng: 10.4478313 },
  "przybyszewo": { lat: 52.9703418, lng: 20.5896722 },
  "jarosław": { lat: 50.0167000, lng: 22.6897000 },
  "luksemburg": { lat: 49.8158683, lng: 6.1296751 },
  "blachownia": { lat: 50.7820239, lng: 18.9684255 },
  "stuthoff": { lat: 54.2591755, lng: 18.6464021 },
  "stutthof": { lat: 54.3298605, lng: 19.1577211 },
  "białystok": { lat: 53.1323980, lng: 23.1591679 },
  "kielce": { lat: 50.8540285, lng: 20.6099157 },
  "łódź": { lat: 51.7687323, lng: 19.4569911 },
  "neuberg": { lat: 50.1971476, lng: 8.9863881 },
  "hohnstein": { lat: 50.9797836, lng: 14.1111221 },
  "neapol": { lat: 40.8358846, lng: 14.2487679 },
  "iława": { lat: 53.5961089, lng: 19.5761026 },
  "legionowo": { lat: 52.4048926, lng: 20.9331103 },
  "stablack": { lat: 54.4222641, lng: 20.5188860 },
  "brzostków": { lat: 50.3146833, lng: 20.8973011 },
  "chybice": { lat: 50.9263850, lng: 21.1041228 },
  "czeremcha": { lat: 52.5141029, lng: 23.3522319 },
  "cedzyna": { lat: 50.8678713, lng: 20.7208979 },
  "radkowice": { lat: 50.9817218, lng: 21.0391582 },
  "brzeziny": { lat: 51.8004949, lng: 19.7517694 },
  "dobiegniew": { lat: 52.9667749, lng: 15.7548055 },
  "świerzyn śląsk": { lat: 51.1866470, lng: 17.4259504 },
  "mirzec": { lat: 51.1362408, lng: 21.0570374 },
  "siekierno": { lat: 50.9835747, lng: 20.9497769 },
  "bodzentyn": { lat: 50.9408055, lng: 20.9582386 },
  "łobodno": { lat: 50.9308352, lng: 18.9905554 },
  "kielecczyzna": { lat: 50.8540285, lng: 20.6099157 },
  "lubeka": { lat: 53.8655000, lng: 10.6866000 },
  "borne su": { lat: 53.6250000, lng: 16.5130000 },
  "murnau": { lat: 47.6820000, lng: 11.2020000 },
  "hadamar": { lat: 50.4590000, lng: 8.0320000 },
  "lienz": { lat: 46.8333000, lng: 12.7667000 },
  "saltzburg": { lat: 47.8095000, lng: 13.0550000 },
  "berlin": { lat: 52.5200000, lng: 13.4050000 },
  "królewiec": { lat: 54.7104000, lng: 20.4522000 },
  "żelów": { lat: 51.4700000, lng: 19.0300000 },
  "mauthausen": { lat: 48.0050000, lng: 14.5200000 },
  "bagrationowsk": { lat: 54.4222641, lng: 20.5188860 },
  "buchenwald": { lat: 50.0200000, lng: 11.2480000 },
  "chełm": { lat: 53.1235000, lng: 23.4686000 },
  "otwock": { lat: 52.1200000, lng: 21.3700000 },
  "szczecin": { lat: 53.4285000, lng: 14.5528000 },
  "szczecna": { lat: 53.4285000, lng: 14.5528000 }
};

// Scalenie zewnętrznego słownika (js/places.js) — bez żadnych zmian w arkuszu.
// Pozwala dodawać/uzupełniać miejsca (np. dokładne cmentarze) poza Sheets.
// Klucze są normalizowane, by nie tworzyć duplikatów (np. "kraków" vs "krakow").
if (typeof window !== "undefined" && window.EXTRA_PLACES) {
  for (const k in window.EXTRA_PLACES) {
    const v = window.EXTRA_PLACES[k];
    if (v && typeof v.lat === "number" && typeof v.lng === "number") {
      const nk = normKey(k);
      for (const existing in PLACES) {
        if (existing !== nk && normKey(existing) === nk) delete PLACES[existing];
      }
      PLACES[nk] = { lat: v.lat, lng: v.lng };
    }
  }
}

const GM_CATS = {
  birth:  { color: "#4a9b4e", label: "Urodzenie", fields: ["data urodzenia"] },
  prewar: { color: "#7a5fb0", label: "Życie do 1939 r.", fields: ["życie do 1939 roku"] },
  camp:   { color: "#c05a3f", label: "1939-1945", fields: ["1939-1945"] },
  work:   { color: "#4e7f9b", label: "Losy powojenne", fields: ["po wojnie", "1939-1945"] },
  death:  { color: "#8b8b8b", label: "Śmierć/Pochówek", fields: ["data śmierci"] }
};

function cleanDataString(text) {
  if (!text) return "";
  return text
    .replace(/\b\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}\b/g, '')
    .replace(/\b\d{4}\b/g, '')
    .replace(/[\(\)\[\]]/g, '')
    .toLowerCase()
    .trim();
}

// Mapuje dowolny tekst na klucz punktu GPS (Wartownia, Koszary, Prom itp.)
function placowkaKeyFromText(raw) {
  if (!raw) return null;
  const t = normKey(raw);

  if (t.includes("prom")) return "prom";
  if (t.includes("koszar")) return "koszary";
  if (t.includes("mozdzierz")) return "mozdzierz";
  if (t.includes("armat")) return "armata";
  if (t.includes("elektrowni")) return "elektrownia";
  if (t.includes("lazienk")) return "lazienki";
  if (t.includes("wal")) return "wal";
  if (t.includes("fort")) return "fort";
  if (t.includes("przystan")) return "przystan";
  if (t.includes("stacja kolejowa")) return "stacja";
  if (t.includes("szpital")) return "szpital";

  const m = t.match(/w(\d)/);
  if (m) return "w" + m[1];

  return null;
}

// Mapuje tekst z kolumny "1 wrz" na klucz punktu GPS (pierwszy punkt w kolejności)
// Dni walki (kolumny z przydziałem/placówką). Każdy dzień może figurować w bazie
// pod kilkoma nazwami nagłówka – np. "1 wrz" lub "1 września 1939 cd" (i wszystkie
// skróty typu W1, W2, Koszary itd. są rozpoznawane niezależnie od nazwy kolumny).
const BATTLE_DAYS = [
  { label: "1 wrz",       cols: ["1 wrz"] },
  // Kolumna "1 września 1939 cd" to osobna kontynuacja zdarzeń 1 września
  // (często obok istniejącej kolumny "1 wrz") – osobny krok chronologiczny.
  // (nie dodajemy aliasu "1 września" – jest prefiksem tej nazwy i psułby dopasowanie)
  { label: "1 wrz (cd)",  cols: ["1 września 1939 cd"] },
  { label: "2 wrz",       cols: ["2 wrz", "2 września"] },
  { label: "3-6 wrz",     cols: ["3-6 wrz 1939", "3-6 wrz", "3–6 września", "3-6 września 1939"] },
  { label: "7 wrz",       cols: ["7 wrz", "7 września"] }
];
// Spłaszczony zestaw nazw kolumn do skanowania (przydział „główny") + data śmierci
const BP_DAY_COLS = [].concat(...BATTLE_DAYS.map(d => d.cols), ["data śmierci"]);

function getPlacowkaKey(rec) {
  // Szukamy klucza placówki we wszystkich kolumnach (kolejność 1→7 wrz, potem
  // data śmierci), bo nazwa placówki bywa wpisana w różnych komórkach bazy.
  for (const c of BP_DAY_COLS) {
    const keys = placowkaKeysFromText(getCol(rec, [c]));
    if (keys.length) return keys[0];
  }
  return null;
}

// Wyodrębnia WSZYSTKIE punkty taktyczne z tekstu, w kolejności wystąpienia
// (np. "Koszary, Prom, W1" -> ["koszary","prom","w1"]), by odtworzyć przemieszczanie wewnątrz dnia
function placowkaKeysFromText(raw) {
  if (!raw) return [];
  const t = normKey(raw);
  const found = [];
  const add = (key, token) => {
    const idx = t.indexOf(token);
    if (idx !== -1) found.push({ key, idx });
  };
  add("prom", "prom");
  add("koszary", "koszar");
  add("mozdzierz", "mozdzierz");
  add("armata", "armat");
  add("elektrownia", "elektrowni");
  add("lazienki", "lazienk");
  add("wal", "wal");
  add("fort", "fort");
  add("przystan", "przystan");
  add("stacja", "stacja");
  add("szpital", "szpital");
  add("brama", "bram");
  // Wartownie zapisane słownie, np. "wartownia nr 1", "wartowni nr 2", "wartownia 5"
  const wmText = [...t.matchAll(/wartowni[au]?\s+(?:nr\.?\s*)?(\d)/g)];
  wmText.forEach(m => found.push({ key: "w" + m[1], idx: m.index }));
  const wm = [...t.matchAll(/\bw(\d)\b/g)];
  wm.forEach(m => found.push({ key: "w" + m[1], idx: m.index }));

  const seen = {};
  found.forEach(f => { if (!(f.key in seen) || f.idx < seen[f.key]) seen[f.key] = f.idx; });
  return Object.keys(seen)
    .map(k => ({ key: k, idx: seen[k] }))
    .sort((a, b) => a.idx - b.idx)
    .map(o => o.key);
}

// Wyodrębnia wszystkie miejscowości/obozy z tekstu (w kolejności wystąpienia, bez duplikatów wg współrzędnych)
// opts.death = true => pochówek na Westerplatte kieruje na Cmentarz (klucz "cmentarz"), a nie ogólny punkt Westerplatte
function findPlacesInText(text, opts) {
  if (!text) return [];
  const raw = String(text);
  const t = normKey(raw);

  // 1) Jawne współrzędne GPS w komórce — używamy ich bezpośrednio
  const gps = extractGPS(raw);
  if (gps) {
    // Reguła pochówku na Westerplatte: zawsze Cmentarz (nawet gdy podano GPS Westerplatte)
    if (opts && opts.death && CM_KRZYZ && t.includes("westerplatte")) {
      return [{ key: "cmentarz", lat: CM_KRZYZ.lat, lng: CM_KRZYZ.lng, name: "Cmentarz Westerplatte" }];
    }
    return [{ key: "gps:" + gps.lat.toFixed(4) + "," + gps.lng.toFixed(4), lat: gps.lat, lng: gps.lng, name: placeNameFromCell(raw) }];
  }

  // 2) Fallback: dopasowanie z słownika PLACES
  const out = [];
  for (const key in PLACES) {
    if (textHasPlace(t, key)) {
      const nkey = normKey(key);
      let idx = t.indexOf(nkey);
      if (idx === -1) {
        const w = t.split(/\s+/).find(x => x.startsWith(nkey) || nkey.startsWith(x));
        idx = w ? t.indexOf(w) : 999;
      }
      const lat = PLACES[key].lat, lng = PLACES[key].lng;
      // deduplikacja wg współrzędnych (np. "Stalag I A" i "Stalag 1 A" to to samo)
      if (!out.some(o => Math.abs(o.lat - lat) < 1e-6 && Math.abs(o.lng - lng) < 1e-6)) {
        out.push({ key, idx, lat, lng });
      }
    }
  }
  // Specjalnie: pochówek na Westerplatte -> TYLKO Cmentarz (pomijamy ogólny punkt Westerplatte i Gdańsk)
  if (opts && opts.death && CM_KRZYZ && t.includes("westerplatte")) {
    out.length = 0;
    out.push({ key: "cmentarz", idx: -1, lat: CM_KRZYZ.lat, lng: CM_KRZYZ.lng });
  }
  out.sort((a, b) => a.idx - b.idx);
  return out;
}

// Ładna nazwa miejsca z klucza PLACES (do list w panelu bocznym)
const PLACE_PRETTY = {
  "stalag i a": "Stalag I A", "stalag 1 a": "Stalag 1 A", "zelow": "Żelów",
  "westerplatte": "Westerplatte", "stutthof": "Stutthof", "stuthoff": "Stuthoff"
};
function placeName(key) {
  if (!key) return "";
  if (PLACE_PRETTY[key]) return PLACE_PRETTY[key];
  return key.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Miejsca znajdujące się w kontekście słowa kluczowego (od niego w dół tekstu).
// Używane by wyciągnąć miejsce urodzenia / pochówku z kolumn mieszanych.
function placesInContext(text, kwRegex, opts) {
  if (!text || !kwRegex.test(text)) return [];
  const m = text.match(kwRegex);
  return findPlacesInText(text.slice(m.index), opts);
}

const BIRTH_KW = /(ur\.|urodzi[łl]|urodzon[ay]|miejsce urodzin|urodzeni[ae])/i;
const DEATH_KW = /(pochowany|pochowana|poch\.|zmar[łl]|umar[łl]|zm\.|zgon|zgina[łl]|zgine[łl]|śmierć|smierc)/i;

// Grupuje miejsca życiowe żołnierza według kategorii mapy:
// birth / prewar / camp / work / death.
// - Urodzenie: z "data urodzenia" ORAZ z kontekstu urodzenia w "życie do 1939 roku"
//   (słowa: ur., Urodził się, urodzony, miejsce urodzin…)
// - Śmierć/Pochówek: z "data śmierci" ORAZ z kontekstu śmierci w "po wojnie"
//   (słowa: pochowany:, zmarł, umarł, zgon…) — bo tam często jest miejsce pochówku
function getLifePlacesByCat(rec) {
  const out = { birth: [], prewar: [], camp: [], work: [], death: [] };
  const nm = (p) => p.name || placeName(p.key);

  // Urodzenie
  findPlacesInText(getCol(rec, ["data urodzenia"])).forEach(p => out.birth.push({ ...p, name: nm(p) }));
  const zycie = getCol(rec, ["życie do 1939 roku"]);
  // z kontekstu urodzenia bierzemy tylko PIERWSZE miejsce (właściwe miejsce urodzenia,
  // a nie późniejsze miejsca pobytu w tej samej kolumnie)
  placesInContext(zycie, BIRTH_KW).slice(0, 1).forEach(p => out.birth.push({ ...p, name: nm(p) }));
  // Reszta "życie do 1939 roku" (bez kontekstu urodzenia) -> przedwojenne
  findPlacesInText(zycie).forEach(p => {
    if (!out.birth.some(b => Math.abs(b.lat - p.lat) < 1e-4 && Math.abs(b.lng - p.lng) < 1e-4)) {
      out.prewar.push({ ...p, name: nm(p) });
    }
  });

  // Obozy jenieckie / losy 1939-1945 (kolumna "1939-1945") – to tu są obozy jenieckie
  findPlacesInText(getCol(rec, ["1939-1945"])).forEach(p => out.camp.push({ ...p, name: nm(p) }));

  // po wojnie: podział na losy powojenne (work) i pochówek/śmierć (death)
  const poW = getCol(rec, ["po wojnie"]);
  const deathPoW = placesInContext(poW, DEATH_KW, { death: true });
  findPlacesInText(poW).forEach(p => {
    if (deathPoW.some(d => Math.abs(d.lat - p.lat) < 1e-4 && Math.abs(d.lng - p.lng) < 1e-4)) out.death.push({ ...p, name: nm(p) });
    else out.work.push({ ...p, name: nm(p) });
  });

  // Osobna kolumna daty śmierci
  findPlacesInText(getCol(rec, ["data śmierci"]), { death: true }).forEach(p => out.death.push({ ...p, name: nm(p) }));

  return out;
}

// Ścieżka na polu bitwy: pozycje z kolejnych dni (1 → 2 → 3-6 → 7 września),
// a w obrębie jednego dnia — wszystkie wymienione punkty w kolejności (np. Koszary → Prom → W1)
function buildBattlePath(rec) {
  const pts = [];
  BATTLE_DAYS.forEach(d => {
    const keys = placowkaKeysFromText(getCol(rec, d.cols));
    keys.forEach(k => {
      const b = battlePoints.find(p => p.key === k);
      if (b) pts.push({ lat: b.lat, lng: b.lng, phase: "battle", label: d.label, name: b.name });
    });
  });
  return pts;
}

// Ścieżka życiowa: urodzenie → życie do 1939 → Westerplatte → obozy → losy powojenne → śmierć
function buildLifePath(rec) {
  const c = getLifePlacesByCat(rec);
  const pts = [];

  c.birth.forEach(p => pts.push({ ...p, phase: "prewar", label: "Urodzenie", name: p.name }));
  c.prewar.forEach(p => pts.push({ ...p, phase: "prewar", label: "Życie do 1939 r.", name: p.name }));

  const pk = getPlacowkaKey(rec);
  if (pk) {
    const b = battlePoints.find(p => p.key === pk);
    if (b) pts.push({ lat: b.lat, lng: b.lng, phase: "battle", label: "Westerplatte (1 wrz)", name: b.name });
  }

  c.camp.forEach(p => pts.push({ ...p, phase: "camp", label: "Obóz jeniecki", name: p.name }));
  c.work.forEach(p => pts.push({ ...p, phase: "postwar", label: "Losy powojenne", name: p.name }));
  c.death.forEach(p => pts.push({ ...p, phase: "death", label: "Śmierć / pochówek", name: p.name }));

  return pts;
}

// Style strzałek wg fazy życia (różna faktura)
const PHASE_STYLE = {
  prewar:  { color: "#2c6fb0", dash: null },
  battle:  { color: "#d1654f", dash: null },
  camp:    { color: "#e08a3c", dash: "6,6" },
  postwar: { color: "#4a9b4e", dash: "2,6" },
  death:   { color: "#777777", dash: null }
};

// Rysuje punkty i strzałki (z glowicami) na podanej mapie; target = opcjonalny L.layerGroup
function drawSoldierPath(map, points, target) {
  if (!points || !points.length) return;
  const add = (layer) => (target || map).addLayer(layer);

  points.forEach((p, i) => {
    const st = PHASE_STYLE[p.phase] || PHASE_STYLE.battle;
    add(L.circleMarker([p.lat, p.lng], { radius: 6, color: "#333", weight: 1, fillColor: st.color, fillOpacity: 0.9 })
      .bindTooltip(`${i + 1}. ${p.label}`));
  });

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const st = PHASE_STYLE[b.phase] || PHASE_STYLE.battle;
    const opts = { color: st.color, weight: 3, opacity: 0.85 };
    if (st.dash) opts.dashArray = st.dash;
    add(L.polyline([[a.lat, a.lng], [b.lat, b.lng]], opts));

    const midLat = (a.lat + b.lat) / 2, midLng = (a.lng + b.lng) / 2;
    const bearing = Math.atan2(b.lat - a.lat, b.lng - a.lng) * 180 / Math.PI;
    const rot = 90 - bearing;
    const icon = L.divIcon({
      className: "arrow-head",
      html: `<div style="transform:rotate(${rot}deg);border-bottom-color:${st.color}"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7]
    });
    add(L.marker([midLat, midLng], { icon, interactive: false }));
  }

  const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
}

// Dopasowuje widok mapy do WSZYSTKICH punktów ścieżki (poprawne przybliżenie).
// Dla pojedynczego punktu przybliża na niego. Wywoływać PO invalidateSize(),
// gdy kontener ma już poprawny rozmiar (zakładki bywają początkowo ukryte).
function fitToPoints(map, pts) {
  if (!map || !pts || !pts.length) return;
  const b = L.latLngBounds(pts.map(p => [p.lat, p.lng]));
  if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 13);
  else map.fitBounds(b, { padding: [30, 30], maxZoom: 14 });
}

const BattleMap = (() => {
  let map = null;
  let rosterData = [];
  let tacticalLayer = null;
  let pathLayer = null;
  let markers = {};            // p.key -> marker (punkty taktyczne + cmentarz)
  let currentPointKey = null; // ostatnio kliknięty punkt (do odświeżenia po filtrze)
  // Dni walki (z BATTLE_DAYS) = opcje filtra daty
  let selectedDays = null;    // null = wszystkie dni; tablica wybranych wpisów BATTLE_DAYS

  // Klucz placówki wyciągnięty TYLKO z konkretnej kolumny dnia (entry.cols to
  // możliwe nazwy tej kolumny, np. "1 wrz" lub "1 września 1939 cd")
  function placowkaKeyForDay(rec, dayEntry) {
    const keys = placowkaKeysFromText(getCol(rec, dayEntry.cols));
    return keys.length ? keys[0] : null;
  }

  // Obrońcy przypisani do punktu p, uwzględniając filtr daty
  function defendersForPoint(p) {
    if (p.key === "cmentarz") {
      // Wszyscy pochowani na Westerplatte + dowódca Henryk Sucharski
      let def = rosterData
        .map((s, i) => ({ s, i }))
        .filter(o => {
          const d = getCol(o.s, ["data śmierci"]);
          return d && normKey(d).includes("westerplatte");
        });
      const hasSucharski = def.some(o => normKey(getCol(o.s, ["nazwisko imię"])).includes("sucharski"));
      if (!hasSucharski) def.unshift({ s: { "nazwisko imię": "Henryk Sucharski (dowódca placówki)" }, i: -1 });
      return def;
    }
    return rosterData
      .map((s, i) => ({ s, i }))
      .filter(o => {
        if (!selectedDays) return getPlacowkaKey(o.s) === p.key;
        // przypisany do tego punktu w KTÓRYMKOLWIEK z zaznaczonych dni
        return selectedDays.some(d => placowkaKeyForDay(o.s, d) === p.key);
      });
  }

  function renderRoster(p) {
    const div = document.getElementById('battleRoster');
    if (!div || !p) return;
    const defenders = defendersForPoint(p);
    const header = `<h3 class="place-title" data-place-key="${p.key}">${p.name} &#9432;</h3>`;
    if (defenders.length === 0) {
      div.innerHTML = header + `<p class="note">Brak przypisanych obrońców w bazie.</p>`;
    } else {
      div.innerHTML = header +
        `<p class="hint">Kliknij nazwisko, by otworzyć biogram:</p>` +
        defenders.map(o => o.i >= 0
          ? `<div class="soldier-link" data-soldier-idx="${o.i}">• ${esc(getCol(o.s, ["nazwisko imię"]) || "Nieznany")}</div>`
          : `<div>• ${esc(getCol(o.s, ["nazwisko imię"]))}</div>`).join('');
    }
  }

  // Przyciemnia punkty taktyczne bez obrońców pod bieżącym filtrem daty
  function applyDateFilter() {
    if (!map) return;
    battlePoints.forEach(p => {
      const m = markers[p.key];
      if (!m) return;
      if (p.key === "cmentarz") { m.setStyle({ opacity: 1, fillOpacity: 0.9 }); return; }
      const has = defendersForPoint(p).length > 0;
      m.setStyle({ opacity: has ? 1 : 0.15, fillOpacity: has ? 0.9 : 0.2 });
    });
    if (currentPointKey) {
      const p = battlePoints.find(x => x.key === currentPointKey);
      if (p) renderRoster(p);
    }
  }

  return {
    build: () => {
      if (map) return;
      map = L.map('battleMap').setView([54.4058, 18.6730], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

      tacticalLayer = L.layerGroup().addTo(map);
      pathLayer = L.layerGroup();

      battlePoints.forEach(p => {
        const marker = L.circleMarker([p.lat, p.lng], { radius: 9, color: "#000", fillColor: "#d1654f", fillOpacity: 0.9 }).addTo(tacticalLayer);
        marker.bindTooltip(p.name);

        marker.on('click', () => { currentPointKey = p.key; renderRoster(p); });
        markers[p.key] = marker;
      });
    },
    setSoldiers: (data) => { rosterData = data; },
    // Filtr daty: tablica wybranych kolumn dni lub null = wszystkie
    setDateFilter: (days) => { selectedDays = (days && days.length) ? days : null; applyDateFilter(); },
    // Pokazuje TYLKO miejsca związane z danym uczestnikiem (jego przemieszczanie 1–7 IX)
    showSoldier: (idx) => {
      if (!map) return;
      map.removeLayer(tacticalLayer);
      pathLayer.clearLayers();
      const rec = rosterData[idx];
      const roster = document.getElementById('battleRoster');
      const bar = document.getElementById('battleFocusBar');
      const fname = document.getElementById('battleFocusName');
      if (rec) {
        const name = getCol(rec, ["nazwisko imię"]) || "Nieznany";
        const pts = buildBattlePath(rec);
        if (pts.length) {
          map.invalidateSize();
          drawSoldierPath(map, pts, pathLayer);
          map.addLayer(pathLayer);
          setTimeout(() => { map.invalidateSize(); fitToPoints(map, pts); }, 120);
        }
        if (roster) {
          let html = `<h3>Przemieszczanie: ${esc(name)}</h3>` +
            `<p class="focus-sub">Kliknij pozycję, by przejść do niej na mapie:</p><ol class="focus-list">`;
          pts.forEach((p, i) => {
            html += `<li class="fly-item" data-map="battle" data-lat="${p.lat}" data-lng="${p.lng}">${esc(p.label)} — ${esc(p.name || "")}</li>`;
          });
          html += `</ol>`;
          if (!pts.length) html += `<p class="note">Brak danych o przemieszczaniu w arkuszu.</p>`;
          roster.innerHTML = html;
        }
        if (bar && fname) { fname.textContent = name; bar.dataset.idx = idx; bar.classList.add('focus-active'); }
      }
      setTimeout(() => map.invalidateSize(), 100);
    },
    // Przywraca widok wszystkich punktów taktycznych
    showAll: () => {
      if (!map) return;
      selectedDays = null;
      currentPointKey = null;
      pathLayer.clearLayers();
      map.removeLayer(pathLayer);
      map.addLayer(tacticalLayer);
      battlePoints.forEach(p => {
        const m = markers[p.key];
        if (m) m.setStyle({ opacity: 1, fillOpacity: 0.9 });
      });
      const bar = document.getElementById('battleFocusBar');
      if (bar) bar.classList.remove('focus-active');
      const roster = document.getElementById('battleRoster');
      if (roster) roster.innerHTML = 'Kliknij punkt na mapie.';
      setTimeout(() => map.invalidateSize(), 100);
    },
    flyTo: (lat, lng) => { if (map) map.flyTo([lat, lng], 15); },
    invalidate: () => { if (map) setTimeout(() => map.invalidateSize(), 100); }
  };
})();

const GeneralMap = (() => {
  let map = null;
  let layers = {};
  let soldierLayer = null;
  let soldiers = [];
  const MAX_LINKS = 60;

    function populate(data) {
      soldiers = data || [];
      if (!map) return;
      for (const c in layers) layers[c].clearLayers();

      // Agregacja: JEDEN marker na miejsce (kategoria + współrzędne),
      // z listą wszystkich żołnierzy powiązanych z tym miejscem.
      // Kliknięcie miejsca pokazuje nazwiska — każde klikalne -> biogram
      // (tak samo jak kliknięcie punktu taktycznego na mapie bitew).
      const placeMap = {};
      soldiers.forEach((soldier, idx) => {
        const cats = getLifePlacesByCat(soldier);
        const name = getCol(soldier, ["nazwisko imię"]) || "Nieznany";
        for (const cat in cats) {
          cats[cat].forEach(pl => {
            // Zaokrąglamy współrzędne w kluczu agregacji (~1 km), by te same
            // miejscowości podane z lekko różnymi GPS tworzyły JEDEN marker.
            const plat = Math.round(pl.lat * 100) / 100;
            const plng = Math.round(pl.lng * 100) / 100;
            const pkey = cat + "|" + plat + "|" + plng;
            if (!placeMap[pkey]) placeMap[pkey] = { lat: pl.lat, lng: pl.lng, cat: cat, key: pl.key, name: pl.name, soldiers: [] };
            // deduplikacja tego samego żołnierza w jednym miejscu
            if (!placeMap[pkey].soldiers.some(s => s.idx === idx)) {
              placeMap[pkey].soldiers.push({ idx, name });
            }
          });
        }
      });

      for (const pkey in placeMap) {
        const pl = placeMap[pkey];
        const marker = L.circleMarker([pl.lat, pl.lng], {
          radius: 6, color: "#000", weight: 1, fillColor: GM_CATS[pl.cat].color, fillOpacity: 0.8
        });
        marker.bindTooltip(pl.name || placeName(pl.key));
        marker.on('click', () => renderGeneralPlace(pl));
        marker.addTo(layers[pl.cat]);
      }
    }

    // Pokazuje w panelu bocznym (#generalSidebar) informacje o klikniętym
    // miejscu i listę powiązanych żołnierzy (każde nazwisko -> biogram).
    function renderGeneralPlace(pl) {
      const div = document.getElementById('generalSidebar');
      if (!div || !pl) return;
      const name = pl.name || placeName(pl.key);
      const cat = GM_CATS[pl.cat];
      const header = `<h3>${esc(name)} <span class="cat-tag" style="color:${cat.color}">(${cat.label})</span></h3>`;
      if (!pl.soldiers.length) {
        div.innerHTML = header + `<p class="note">Brak powiązanych żołnierzy w bazie.</p>`;
        return;
      }
      const shown = pl.soldiers.slice(0, MAX_LINKS);
      div.innerHTML = header +
        `<p class="hint">Kliknij nazwisko, by otworzyć biogram:</p>` +
        shown.map(s => `<div class="soldier-link" data-soldier-idx="${s.idx}">• ${esc(s.name)}</div>`).join('') +
        (pl.soldiers.length > MAX_LINKS ? `<div class="note">…i ${pl.soldiers.length - MAX_LINKS} więcej</div>` : '');
    }

  return {
    build: () => {
      if (map) return;
      map = L.map('generalMap').setView([52.0, 19.0], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

      for (const c in GM_CATS) {
        layers[c] = L.layerGroup().addTo(map);
      }
      soldierLayer = L.layerGroup();
    },
    populate: populate,
    // Pokazuje TYLKO miejsca związane z danym uczestnikiem (jego losy życiowe)
    showSoldier: (idx) => {
      if (!map) return;
      for (const c in layers) layers[c].clearLayers();
      soldierLayer.clearLayers();
      const rec = soldiers[idx];
      const sidebar = document.getElementById('generalSidebar');
      const bar = document.getElementById('generalFocusBar');
      const fname = document.getElementById('generalFocusName');
      if (rec) {
        const name = getCol(rec, ["nazwisko imię"]) || "Nieznany";
        const pts = buildLifePath(rec);
        if (pts.length) {
          map.invalidateSize();
          drawSoldierPath(map, pts, soldierLayer);
          map.addLayer(soldierLayer);
          setTimeout(() => { map.invalidateSize(); fitToPoints(map, pts); }, 120);
        }
        if (sidebar) {
          let html = `<h3>Losy: ${esc(name)}</h3>` +
            `<p class="focus-sub">Kliknij miejsce, by przejść do niego na mapie:</p><ol class="focus-list">`;
          pts.forEach((p, i) => {
            html += `<li class="fly-item" data-map="general" data-lat="${p.lat}" data-lng="${p.lng}">${esc(p.name || p.label)}</li>`;
          });
          html += `</ol>`;
          if (!pts.length) html += `<p class="note">Brak danych o miejscach w arkuszu.</p>`;
          sidebar.innerHTML = html;
        }
        if (bar && fname) { fname.textContent = name; bar.dataset.idx = idx; bar.classList.add('focus-active'); }
      }
      setTimeout(() => map.invalidateSize(), 100);
    },
    // Przywraca widok wszystkich miejsc
    showAll: () => {
      if (!map) return;
      soldierLayer.clearLayers();
      map.removeLayer(soldierLayer);
      populate(soldiers);
      const bar = document.getElementById('generalFocusBar');
      if (bar) bar.classList.remove('focus-active');
      const sidebar = document.getElementById('generalSidebar');
      if (sidebar) sidebar.innerHTML = 'Wybierz żołnierza z biogramu.';
      setTimeout(() => map.invalidateSize(), 100);
    },
    flyTo: (lat, lng) => { if (map) map.flyTo([lat, lng], 9); },
    setCategory: (cat, visible) => {
      if (!map || !layers[cat]) return;
      if (visible) map.addLayer(layers[cat]);
      else map.removeLayer(layers[cat]);
    },
    // Łączenie zewnętrznego słownika miejsc (np. osobna zakładka arkusza): [{name, lat, lng}]
    mergePlaces: (rows) => {
      (rows || []).forEach(r => {
        const key = normKey(r.name);
        const lat = parseFloat(r.lat), lng = parseFloat(r.lng);
        if (key && !isNaN(lat) && !isNaN(lng)) PLACES[key] = { lat, lng };
      });
    },
    invalidate: () => { if (map) setTimeout(() => map.invalidateSize(), 100); }
  };
})();

// Mała, orientacyjna mapa w biogramie żołnierza — pokazuje CAŁĄ ścieżkę życiową
// (urodzenie → Westerplatte → obozy → losy → śmierć) jednego uczestnika.
const BioMap = (() => {
  let map = null, layer = null;
  return {
    build: () => {
      if (map) return;
      const el = document.getElementById('bioMiniMap');
      if (!el) return;
      map = L.map('bioMiniMap').setView([52.0, 19.0], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      layer = L.layerGroup().addTo(map);
    },
    showSoldier: (rec) => {
      if (!map) return;
      layer.clearLayers();
      map.removeLayer(layer);
      const pts = buildLifePath(rec);
      if (pts.length) {
        map.invalidateSize();            // najpierw poprawny rozmiar kontenera
        drawSoldierPath(map, pts, layer);
        map.addLayer(layer);
        // powtórne dopasowanie po reflow – gwarantuje widoczność wszystkich
        // punktów (i strzałek); dla 1 punktu przybliża na niego
        setTimeout(() => { map.invalidateSize(); fitToPoints(map, pts); }, 120);
      } else {
        setTimeout(() => map.invalidateSize(), 80);
      }
    },
    invalidate: () => { if (map) setTimeout(() => map.invalidateSize(), 80); }
  };
})();
