// SŁOWNIK MIEJSC — plik POZA arkuszem (nie dodajemy kolumn ani zakładek w Sheets).
// Aplikacja łączy te wpisy z wbudowanym słownikiem (js/maps.js -> PLACES).
// Klucz = nazwa dokładnie taka, jak w arkuszu (wielkość liter i znaki diakrytyczne
// są normalizowane automatycznie przy dopasowywaniu, ale pisownia musi pasować,
// np. "Stalag I A", "Warszawa", "Dąbrowa Górnicza").
//
// Aby poznać listę miejsc wymagających GPS, otwórz konsolę (F12) po załadowaniu
// danych — diagnostyka (reportUnmatched w js/app.js) wypisze gotowy szablon
// z surowymi wartościami komórek; tutaj przepisujesz je na prawdziwe współrzędne.
//
// Współrzędne są przybliżone (miasta wojewódzkie itp.); możesz je dowolnie
// poprawiać. Poniżej zalążek — dopisz brakujące miejsca z raportu w konsoli.
window.EXTRA_PLACES = {
  // --- główne miasta Polski ---
  "Warszawa": { lat: 52.2297, lng: 21.0122 },
  "Kraków": { lat: 50.0647, lng: 19.9450 },
  "Poznań": { lat: 52.4064, lng: 16.9252 },
  "Wrocław": { lat: 51.1079, lng: 17.0385 },
  "Lublin": { lat: 51.2465, lng: 22.5684 },
  "Szczecin": { lat: 53.4285, lng: 14.5528 },
  "Bydgoszcz": { lat: 53.1235, lng: 18.0084 },
  "Toruń": { lat: 53.0138, lng: 18.5984 },
  "Katowice": { lat: 50.2649, lng: 19.0238 },
  "Rzeszów": { lat: 50.0412, lng: 21.9990 },
  "Olsztyn": { lat: 53.7784, lng: 20.4801 },
  "Kielce": { lat: 50.8661, lng: 20.6286 },
  "Opole": { lat: 50.6751, lng: 17.9213 },
  "Zielona Góra": { lat: 51.9356, lng: 15.5062 },
  "Gorzów Wielkopolski": { lat: 52.7369, lng: 15.2286 },
  "Częstochowa": { lat: 50.8118, lng: 19.1203 },
  "Radom": { lat: 51.4027, lng: 21.1471 },
  "Gdynia": { lat: 54.5189, lng: 18.5305 },
  "Sopot": { lat: 54.4418, lng: 18.5600 },
  "Białystok": { lat: 53.1325, lng: 23.1688 },

  // --- konkretne miejscowości z danych arkusza ---
  "Łańcut": { lat: 50.0673, lng: 22.2336 },
  "Dąbrowa Górnicza": { lat: 50.3155, lng: 19.1784 },
  "Morąg": { lat: 53.9115, lng: 19.9295 },
  "Gliwice": { lat: 50.2946, lng: 18.6714 },
  "Iłża": { lat: 51.1667, lng: 21.1970 },
  "Wysokie Mazowieckie": { lat: 52.6950, lng: 22.5200 },
  "Złoczów": { lat: 49.8106, lng: 24.2833 },

  // --- miejsca poza Polską wspomniane w losach życiowych ---
  "Drezno": { lat: 51.0504, lng: 13.7373 },
  "Zgorzelec": { lat: 51.1520, lng: 14.9750 },
  "Głogów": { lat: 51.6640, lng: 16.0828 },

  // --- obozy jenieckie z kolumny "1939-1945" (uzupełnienie słownika) ---
  "Auschwitz": { lat: 50.0269, lng: 19.1783 },
  "Oświęcim": { lat: 50.0269, lng: 19.1783 }
};
