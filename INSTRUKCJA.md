# Instrukcja – statyczna strona Obrońców Westerplatte (SSG)

Generator pobiera dane z arkusza Google Sheets (CSV) i tworzy w pełni
statyczną witrynę: stronę główną z listą żołnierzy oraz osobną podstronę
dla każdego z nich (z unikalnym `<title>`, nagłówkiem `<h1>`, danymi
JSON-LD i mapą OpenStreetMap). Dzięki temu każdy żołnierz jest indeksowany
przez wyszukiwarki (SEO).

## 1. Co się znajduje w projekcie

| Plik / folder            | Opis                                                         |
|--------------------------|--------------------------------------------------------------|
| `generate.py`            | Główny skrypt generatora (Python, tylko biblioteka standardowa) |
| `template.html`          | Szablon podstrony żołnierza (i strony głównej)              |
| `style.css`              | Arkusz stylów (kopiowany do `public/assets/style.css`)      |
| `public/`                | **Wygenerowana witryna** (to publikujemy)                   |
| `public/index.html`      | Strona główna (lista żołnierzy)                             |
| `public/zolnierze/*.html`| Podstrony każdego żołnierza                                  |
| `public/assets/style.css`| Plik stylów                                                  |
| `public/sitemap.xml`, `public/robots.txt` | Pliki ułatwiające SEO                            |
| `data.csv`               | Kopia pobranego arkusza (do generowania offline)            |
| `netlify.toml`           | Ustawienia wdrożenia Netlify (SSG)                          |
| `.github/workflows/generate.yml` | Automatyczna aktualizacja przez GitHub Actions     |

## 2. Wymagania

- Zainstalowany **Python 3.8+** (sprawdź: `python --version`).
- Dostęp do internetu przy pierwszym uruchomieniu (aby pobrać CSV).

## 3. Uruchomienie lokalne (ręczne)

Otwórz terminal w folderze projektu i wykonaj:

```bash
python generate.py --url-base https://twoja-domena.example.com
```

Parametr `--url-base` to adres docelowy witryny – służy do wygenerowania
poprawnych linków kanonicznych, mapy stron (`sitemap.xml`) oraz danych
strukturalnych JSON-LD. Podaj tu swój przyszły adres (GitHub Pages / Netlify).

Po chwili w folderze `public/` pojawią się wygenerowane pliki:
- `public/index.html`
- folder `public/zolnierze/` z podstronami (np. `public/zolnierze/baran-wladyslaw.html`)
- `public/sitemap.xml`, `public/robots.txt`, `public/assets/style.css`

### Podgląd lokalny

Ponieważ linki są względne do katalogu głównego (`/assets/...`, `/zolnierze/...`),
najlepiej uruchomić prosty serwer WWW **wewnątrz folderu `public/`**:

```bash
cd public
python -m http.server 8000
```

a następnie otworzyć <http://localhost:8000> .

### Generowanie z lokalnego pliku (bez sieci)

Jeśli masz plik `data.csv` w folderze projektu, użyj:

```bash
python generate.py --local --url-base https://twoja-domena.example.com
```

## 4. Jak to działa (krótko)

1. Skrypt pobiera CSV z arkusza Google (lub czyta `data.csv`).
2. Dla każdego wiersza:
   - tworzy **slug** z nazwiska i imienia (np. `baran-wladyslaw`),
   - oczyszcza datę urodzenia (i próbuje wygenerować datę ISO do JSON-LD),
   - wyszukuje współrzędne GPS (`szerokość, długość`) we wszystkich
     polach i zapisuje je jako „Miejsca na mapie” z osadzoną mapą
     OpenStreetMap (bez klucza API),
   - buduje sekcje chronologiczne (życie do 1939, 1–7 września, lata
     1939–1945, po wojnie).
3. Zapisuje `index.html`, podstrony, `sitemap.xml` oraz `robots.txt`.

## 5. Automatyczna aktualizacja po zmianie w arkuszu

Arkusz Google nie wysyła powiadomień na zewnątrz, więc najprostszym
rozwiązaniem jest **harmonogram na GitHubie** (GitHub Actions), który co
kilka godzin pobiera najnowszy arkusz, generuje stronę i publikuje zmiany.

### Krok A – wrzucenie projektu na GitHub

1. Utwórz repozytorium na GitHub (np. `westerplatte`) i wypchnij pliki
   projektu: `generate.py`, `template.html`, `style.css`, `netlify.toml`,
   `.github/workflows/generate.yml`.
2. W **Settings → Secrets and variables → Actions** dodaj dwa sekrety:
   - `NETLIFY_AUTH_TOKEN` – Personal access token
     (Netlify → *User settings → Applications → New access token*),
   - `NETLIFY_SITE_ID` – ID witryny
     (Netlify → *Site settings → General → Site ID*), dla tego projektu:
     `6854a688-6e00-4e1b-bb7b-01ddf4c9a25a`.

### Krok B – harmonogram

Plik `.github/workflows/generate.yml` jest już skonfigurowany do
**generowania i wdrażania bezpośrednio na Netlify**:
- uruchamia się **automatycznie co 6 godzin** (`cron: "0 */6 * * *"`),
- można go też uruchomić ręcznie
  (*Actions → Generuj i wdróż na Netlify → Run workflow*),
- pobiera najnowszy arkusz, generuje `public/` i wysyła na Netlify.

Każda zmiana w arkuszu Google zostanie więc odzwierciedlona na stronie
maksymalnie po kilku godzinach – bez Twojej ingerencji.

> Chcesz częściej? Zmień linijkę `cron` w pliku workflow, np.
> `"0 */3 * * *"` (co 3 godziny) lub `"*/30 * * * *"` (co 30 minut).
>
> Alternatywa: połącz repozytorium z Netlify (*Site settings → Build & deploy
> → Connect repository*) – wtedy każdy `git push` sam uruchamia build
> zdefiniowany w `netlify.toml`.

## 6. Publikacja

### GitHub Pages (strona użytkownika/organizacji – polecane)
1. W repozytorium: **Settings → Pages → Build and deployment**.
2. Source: **Deploy from a branch**, Branch: `main`, Folder: `/public`.
3. Gotowe – witryna pod `https://twoja-nazwa.github.io/`.

> Uwaga: przy **stronie projektu** (`github.io/NAZWA-REPO`) linki
> zaczynające się od `/` wymagają poprawki. Najprościej:
> - użyj **Netlify** (patrz niżej), lub
> - w `generate.py` zamień `/assets` na `/NAZWA-REPO/assets` i
>   `/zolnierze` na `/NAZWA-REPO/zolnierze` (lub dodaj argument `--base-path`).

### Netlify
W projekcie znajduje się już plik `netlify.toml`, który ustawia:
- Build command: `python generate.py --url-base https://twoja-domena`
- Publish directory: `public` (tam trafia wygenerowana witryna)

Wystarczy więc:
1. Nowy site → **Import from Git** (lub `netlify deploy --prod --dir public`).
2. Netlify samo uruchomi generator przy każdym `git push`
   (a GitHub Action dba o to, by push następował po zmianie w arkuszu).

## 7. Mapy losów żołnierzy

Witryna zawiera mapy oparte na **Leaflet** (OpenStreetMap, bez klucza API):

- **Na podstronie każdego żołnierza** – „Mapa losów żołnierza”: punkty
  kolorowane według etapów życia (niebieski – dzieciństwo, czerwony –
  wrzesień 1939, pomarańczowy – lata 1939–1945, zielony – po wojnie).
  Kliknięcie punktu pokazuje kontekst z arkusza.
- **Zbiorcze mapy** (`/mapy.html`, odnośnik w nagłówku): sześć map –
  wszystkie miejsca razem oraz osobno: miejsca urodzenia, dzieciństwa/
  wychowania, walk września 1939, niewoli (1939–1945) i życia powojennego.

Współrzędne są wyciągane automatycznie z opisów w arkuszu (zapis
`Miejsce: szerokość, długość`). Dodatkowo, ponieważ w kolumnach
wrześniowych obiekty Westerplatte występują tylko jako nazwy (Prom,
Wartownia nr 5, koszary…), w `generate.py` znajduje się **gazetera**
słownik `_W_PLACES_RAW` z przybliżonymi współrzędnymi tych obiektów –
dzięki temu mapa obrony (wrzesień 1939) rysuje się poprawnie. Gdy w arkuszu
dopiszesz dokładne GPS przy danym obiekcie, zostanie ono użyte zamiast
przybliżenia.

Pliki map: `map.js` (logika Leaflet) oraz `template_maps.html` (szablon
strony zbiorczej). Styl map: sekcja „Mapy (Leaflet)” w `style.css`.

## 8. Dodawanie / edycja żołnierzy

Wszystkie dane edytujesz **tylko w arkuszu Google**. Generator sam
przetworzy nowe wiersze, utworzy nowe podstrony i zaktualizuje
`index.html`, `mapy.html` oraz `sitemap.xml`. Nie musisz ręcznie tworzyć
plików HTML.

## 9. Personalizacja wyglądu

- Kolory, czcionki, układ: plik `style.css`.
- Układ podstrony, nagłówki, mapa: plik `template.html`
  (zmienne w nawiasach `{{...}}` wypełnia skrypt).
- Kolejność i nazwy sekcji: słownik `SECTION_LABELS` w `generate.py`.
