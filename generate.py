#!/usr/bin/env python3
"""
Generator statycznej strony Obrońców Westerplatte (Static Site Generation).

- Pobiera dane CSV z arkusza Google Sheets.
- Oczyszcza daty i wyciąga współrzędne GPS (dla map).
- Generuje:
    * index.html ........................ strona główna (lista żołnierzy)
    * zolnierze/<slug>.html ............. podstrona każdego żołnierza
    * sitemap.xml / robots.txt .......... ułatwienia SEO
    * assets/style.css .................. styl (kopiowany z szablonu)

Uruchomienie:
    python generate.py            # pobiera CSV z sieci
    python generate.py --local    # używa lokalnego pliku data.csv

Wymagania: tylko Python 3 (biblioteka standardowa).
"""

import argparse
import csv
import html
import json
import os
import re
import shutil
import urllib.request
from datetime import datetime, timezone

# --------------------------------------------------------------------------- #
# Konfiguracja
# --------------------------------------------------------------------------- #
SHEET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1TmRHJDv6IMlGwg761JV50M8vS4zXTdWBtjDziAleSQI/gviz/tq?tqx=out:csv&gid=586136597"
)

ROOT = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(ROOT, "public")   # wygenerowana witryna (publikowana)
SOLDIERS_DIR = os.path.join(OUTPUT_DIR, "zolnierze")
ASSETS_DIR = os.path.join(OUTPUT_DIR, "assets")
TEMPLATE_PATH = os.path.join(ROOT, "template.html")
TEMPLATE_MAPS_PATH = os.path.join(ROOT, "template_maps.html")
STYLE_SRC = os.path.join(ROOT, "style.css")
MAPJS_SRC = os.path.join(ROOT, "map.js")
ABOUTJS_SRC = os.path.join(ROOT, "about.js")

# Tekst „po co powstał ten serwis” – zaczerpnięty z opisu autorskiego
# (Jakub Raciborski, racibo.pl). Wyświetlany na stronie głównej i w /o-projekcie.html.
PURPOSE_PARAGRAPHS = [
    "Wiele razy publikowałem tu różnego rodzaju relacje z oprowadzania turystów "
    "po Westerplatte. Za mną wiele kursów i szkoleń. Dochodzą do tego bieżące "
    "odkrycia archeologiczne. No i można powiedzieć, że tak oprowadzam, "
    "oprowadzam i oprowadzam.",

    "Po oprowadzeniu kolejnej grupy mam różne refleksje. Powiedziałem o walkach, "
    "poległych, wymieniałem nazwiska tych którzy walczyli w konkretnych miejscach "
    "na półwyspie. Warto by było dokończyć te wszystkie historie o losy tych "
    "żołnierzy. Gdzie przeszli po wycofaniu się z placówki na przedpolu? Do którego "
    "obozu jenieckiego trafili po kapitulacji?",

    "Najczęściej nie ma czasu na opowiadanie tych wszystkich historii. Nie mam też "
    "wiedzy na temat losów wszystkich obrońców. Zazwyczaj opowiada się te najbardziej "
    "charakterystyczne, wyraziste, najciekawsze.",

    "Gdy turyści mówią skąd przyjechali to wtedy nieraz myślę na temat związków ich "
    "miejscowości z Westerplatczykami. Dlatego m.in. stworzyłem podstronę "
    "„Związki z Trójmiastem” na miastonamapie.racibo.pl. Dzięki temu mogę dokładnie "
    "wskazać na wsie na Kielecczyźnie związane z walczącymi tu w Gdańsku.",

    "Bo Westerplatte to nie tylko symbol, wydarzenie, ale przede wszystkim ludzie, "
    "którzy tu walczyli.",

    "Dlatego miesiąc temu (VI 2026) postanowiłem zacząć tworzyć bazę danych. Nazwiska "
    "ujęte w tabeli. Na początku tylko one, ale kolejne kolumny czekały na "
    "uzupełnienia. Zająłem się tym dopiero teraz. Po dwóch dniach przepisywania danych "
    "do tabel mam jakieś 30% wypełnienia. To znaczy, że daty urodzin mam jedynie w 9% "
    "a daty śmierci w 10% przypadków. Kolejne dni walki oraz losy powojenne także "
    "stopniowo wypełniam. Przy wielu nazwiskach mam „?” bo obrońców było 207, ale "
    "wcześniejsze ustalenia dodawały też inne nazwiska. Stąd więcej nazwisk niż "
    "obrońców. Warto je mieć w danych by pokazać, że np. Józef Grudzień syn Marcina "
    "z powodu choroby przed wojną opuścił przyszłe pole bitwy.",

    "Mając uzupełnianą ciągle bazę danych można stworzyć stronę, która w sposób "
    "przejrzysty pokazuje to na mapie. Taki był właśnie cel tej strony. Przez to są tu "
    "uproszczenia. Nie zawsze daty i lokalizacje są poprawnie odczytywane. Sprawdzam "
    "to i pewnie będzie lepiej.",

    "Strona ma charakter prywatnego projektu i nie zawiera przypisów naukowych, "
    "aparatu naukowego – jest przede wszystkim narzędziem w mojej pracy przewodnika. "
    "Podczas wycieczki łączę te pozornie suche dane w opowieść o bitwie, która "
    "rozegrała się na tym skrawku ziemi. Na takie wycieczki oczywiście zapraszam.",
]

# Nagłówki kolumn w arkuszu (według pierwszego wiersza).
COLUMNS = [
    "nazwisko_imie",      # 0
    "data_urodzenia",     # 1
    "zycie_do_1939",      # 2
    "wrzesnia_1",         # 3
    "wrzesnia_1_cd",      # 4
    "wrzesnia_2",         # 5
    "wrzesnia_3_6",       # 6
    "wrzesnia_7",         # 7
    "lata_1939_1945",     # 8
    "po_wojnie",          # 9
]

# Etykiety sekcji chronologicznych (H2 na podstronie).
SECTION_LABELS = {
    "zycie_do_1939": ("Życie do 1939 roku", "prewar"),
    "wrzesnia_1": ("1 września 1939", "battle"),
    "wrzesnia_1_cd": ("1 września 1939 (cd.)", "battle"),
    "wrzesnia_2": ("2 września 1939", "battle"),
    "wrzesnia_3_6": ("3–6 września 1939", "battle"),
    "wrzesnia_7": ("7 września 1939", "battle"),
    "lata_1939_1945": ("Lata 1939–1945", "camp"),
    "po_wojnie": ("Po wojnie", "postwar"),
}

# Fazy życia żołnierza – służą do kolorowania i grupowania miejsc na mapach.
# Każda faza wiąże się z określonymi kolumnami arkusza.
PHASE_META = {
    "dzieciństwo": {
        "label": "Dzieciństwo i lata przedwojenne",
        "color": "#2a6fb0",   # niebieski
    },
    "bitwa": {
        "label": "Wrzesień 1939 – obrona Westerplatte",
        "color": "#b02a2a",   # czerwony
    },
    "wojna": {
        "label": "Lata 1939–1945 (niewola, przymusowa praca)",
        "color": "#d98a1f",   # pomarańczowy
    },
    "powojnie": {
        "label": "Po wojnie (miejsca zamieszkania i pochówku)",
        "color": "#2e8b57",   # zielony
    },
}

PHASE_FIELDS = {
    "dzieciństwo": ["zycie_do_1939"],
    "bitwa": ["wrzesnia_1", "wrzesnia_1_cd", "wrzesnia_2", "wrzesnia_3_6", "wrzesnia_7"],
    "wojna": ["lata_1939_1945"],
    "powojnie": ["po_wojnie"],
}

# Kategorie punktów na Mapie bitwy (pole walki Westerplatte). Każdy obiekt
# taktyczny otrzymuje jedną z poniższych kategorii – można je włączać
# i wyłączać z poziomu legendy (przełączniki).
BATTLE_CATS = [
    {"key": "wartownie", "label": "Wartownie", "color": "#b02a2a"},
    {"key": "placowki",  "label": "Placówki i stanowiska", "color": "#d98a1f"},
    {"key": "zaplecze",  "label": "Zaplecze placówki", "color": "#2a6fb0"},
    {"key": "pamiec",    "label": "Upamiętnienia", "color": "#6a4c93"},
    {"key": "agresor",   "label": "Agresor (1 IX 1939)", "color": "#444444"},
]
BATTLE_CAT_COLOR = {c["key"]: c["color"] for c in BATTLE_CATS}

# Przypisanie kategorii do obiektów taktycznych Westerplatte.
_BATTLE_PLACE_CAT = {
    "Placówka Prom": "placowki",
    "Przystań": "zaplecze",
    "Wartownia nr 1": "wartownie",
    "Wartownia nr 2": "wartownie",
    "Wartownia nr 3": "wartownie",
    "Wartownia nr 4": "wartownie",
    "Wartownia nr 5": "wartownie",
    "Wartownia nr 6": "wartownie",
    "Nowe Koszary": "zaplecze",
    "Stanowisko moździerzy": "placowki",
    "Armata polowa": "placowki",
    "Elektrownia": "zaplecze",
    "Placówka Fort": "placowki",
    "Placówka Wał": "placowki",
    "Stacja kolejowa": "zaplecze",
    "Brama kolejowa": "zaplecze",
    "Cmentarz (2019)": "pamiec",
    "Pancernik Schleswig-Holstein": "agresor",
}

# Opisy obiektów taktycznych (wyświetlane w oknach mapy po kliknięciu).
_BATTLE_PLACE_DESC = {
    "Armata polowa": "Stanowisko artylerii wybrzeżowej broniące podejścia od strony portu i Nowego Portu.",
    "Elektrownia": "Elektrownia Westerplatte – zaplecze techniczne i energetyczne placówki.",
    "Przystań": "Przystań nad Martwą Wisłą – punkt zaopatrzenia placówki.",
    "Nowe Koszary": "Nowe Koszary – główne zgrupowanie i miejsce obrony obrońców Westerplatte.",
    "Stanowisko moździerzy": "Stanowisko moździerzy – punkt wsparcia ogniowego obrońców.",
    "Wartownia nr 1": "Wartownia nr 1 – posterunek obserwacyjno-bojowy na północnym skraju placówki.",
    "Wartownia nr 2": "Wartownia nr 2 – posterunek obserwacyjno-bojowy.",
    "Wartownia nr 3": "Wartownia nr 3 – posterunek obserwacyjno-bojowy.",
    "Wartownia nr 4": "Wartownia nr 4 – posterunek obserwacyjno-bojowy.",
    "Wartownia nr 5": "Wartownia nr 5 – posterunek obserwacyjno-bojowy.",
    "Wartownia nr 6": "Wartownia nr 6 – posterunek obserwacyjno-bojowy (współrzędne przybliżone).",
    "Cmentarz (2019)": "Mogiła symboliczna obrońców Westerplatte odsłonięta w 2019 r.",
    "Placówka Fort": "Placówka „Fort” – jeden z punktów oporu na zachodzie placówki.",
    "Placówka Wał": "Placówka „Wał” – punkt oporu na wschodnim skraju placówki.",
    "Placówka Prom": "Placówka „Prom” – obsada promu przez Martwą Wisłą.",
    "Stacja kolejowa": "Stacja kolejowa – punkt na południowym obrzeżu placówki.",
    "Brama kolejowa": "Brama kolejowa – główny wjazd na teren Westerplatte.",
    "Pancernik Schleswig-Holstein": "SMS Schleswig-Holstein – pancernik, który 1 września 1939 r. "
    "ostrzelał Westerplatte, rozpoczynając II wojnę światową.",
}

# Kategorie punktów na Mapie ogólnej (całościowe losy życiowe obrońców).
LIFE_CATS = [
    {"key": "urodzenie", "label": "Urodzenie", "color": "#4a9b4e"},
    {"key": "przedwoj",  "label": "Lata przed wojną", "color": "#2a6fb0"},
    {"key": "bitwa",     "label": "Wrzesień 1939", "color": "#b02a2a"},
    {"key": "wojna",     "label": "Lata 1939–1945", "color": "#d98a1f"},
    {"key": "powojnie",  "label": "Losy powojenne", "color": "#4e7f9b"},
]
LIFE_CAT_COLOR = {c["key"]: c["color"] for c in LIFE_CATS}

# Znane obiekty na Półwyspie Westerplatte (wartownie, koszary, przystań itd.).
# W arkuszu w kolumnach wrześniowych występują one tylko jako nazwy (bez GPS),
# więc przypisujemy im współrzędne. Wartości są PRZEPISANE 1:1 z pierwotnej
# wersji serwisu (js/maps.js -> punkty taktyczne Westerplatte), by odtworzyć
# dokładne położenie obiektów tworzących pole bitwy.
_W_PLACES_RAW = [
    ("Placówka Prom", 54.404203, 18.678780, ["prom"]),
    ("Przystań", 54.405642, 18.668577, ["przystan", "przystani"]),
    ("Wartownia nr 1", 54.405358, 18.675937, ["w1", "wartownia nr 1", "wartownia 1"]),
    ("Wartownia nr 2", 54.404811, 18.671576, ["w2", "wartownia nr 2", "wartownia 2"]),
    ("Wartownia nr 3", 54.406393, 18.670717, ["w3", "wartownia nr 3", "wartownia 3"]),
    ("Wartownia nr 4", 54.408119, 18.672670, ["w4", "wartownia nr 4", "wartownia 4"]),
    ("Wartownia nr 5", 54.407088, 18.675454, ["w5", "wartownia nr 5", "wartownia 5"]),
    ("Wartownia nr 6", 54.406457, 18.671951, ["w6", "wartownia nr 6", "wartownia 6"]),
    ("Nowe Koszary", 54.406564, 18.671694, ["koszary", "koszar"]),
    ("Stanowisko moździerzy", 54.406610, 18.671831, ["mozdzierz", "moździerz"]),
    ("Armata polowa", 54.407042, 18.667746, ["armat", "armata"]),
    ("Elektrownia", 54.407816, 18.667418, ["elektrownia", "elektrowni"]),
    ("Placówka Fort", 54.407582, 18.676999, ["fort"]),
    ("Placówka Wał", 54.404787, 18.681452, ["wal", "wał"]),
    ("Stacja kolejowa", 54.403837, 18.682286, ["stacja kolejowa", "stacja"]),
    ("Brama kolejowa", 54.403392, 18.682594, ["brama kolejowa", "brama"]),
    ("Cmentarz (2019)", 54.406970, 18.674623, ["cmentarz"]),
    ("Pancernik Schleswig-Holstein", 54.400800, 18.681440,
     ["schleswig", "schlezwig", "pancernik"]),
]

_PL_MAP = {}
for _label, _lat, _lon, _toks in _W_PLACES_RAW:
    for _t in _toks:
        _PL_MAP[_t] = (_label, _lat, _lon)


def _norm(s: str) -> str:
    s = s.lower()
    for _pl, _en in {"ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
                     "ó": "o", "ś": "s", "ź": "z", "ż": "z"}.items():
        s = s.replace(_pl, _en)
    return s

POLISH_MONTHS = {
    "stycznia": 1, "styczen": 1, "styczeń": 1,
    "lutego": 2, "luty": 2,
    "marca": 3, "marzec": 3,
    "kwietnia": 4, "kwiecień": 4,
    "maja": 5, "maj": 5,
    "czerwca": 6, "czerwiec": 6,
    "lipca": 7, "lipiec": 7,
    "sierpnia": 8, "sierpień": 8,
    "wrzesnia": 9, "września": 9, "wrzesien": 9, "wrzesień": 9,
    "pazdziernika": 10, "października": 10, "pazdziernik": 10, "październik": 10,
    "listopada": 11, "listopad": 11,
    "grudnia": 12, "grudzien": 12, "grudzień": 12,
}

COORD_RE = re.compile(r"(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)")
# Dopasowanie samej liczby dziesiętnej (do oczyszczania dat z koordynatów).
NUM_RE = re.compile(r"-?\d+\.\d+")


# --------------------------------------------------------------------------- #
# Pomocnicze funkcje czyszczące
# --------------------------------------------------------------------------- #
def slugify(text: str) -> str:
    """Tworzy przyjazny adres URL z polskich znaków, np. 'Bąk Jan' -> 'bak-jan'."""
    text = text.strip().lower()
    mapping = {
        "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
        "ó": "o", "ś": "s", "ź": "z", "ż": "z",
    }
    for pl, en in mapping.items():
        text = text.replace(pl, en)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "nieznany"


def clean_text(value: str) -> str:
    """Usuwa białe znaki, normalizuje, zwraca pusty ciąg gdy brak danych."""
    if value is None:
        return ""
    value = value.strip()
    value = re.sub(r"\s+", " ", value)
    return value


def clean_date(raw: str) -> str:
    """Oczyszcza pole daty z niepotrzebnych słów ('r.', 'roku')."""
    raw = clean_text(raw)
    if not raw:
        return ""
    raw = re.sub(r"\b(r\.|roku|r)\b", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s+", " ", raw).strip(" ,.;-")
    return raw


def strip_gps(text: str) -> str:
    """Usuwa współrzędne GPS z tekstu przeznaczonego do wyświetlenia
    (tak jak w pierwotnej wersji serwisu – pokazujemy nazwy miejscowości,
    nie surowe szerokości/długości geograficzne)."""
    if not text:
        return ""
    text = COORD_RE.sub(" ", text)      # pary "szerokość, długość"
    text = NUM_RE.sub(" ", text)        # pojedyncze współrzędne
    text = re.sub(r"\s*[:;]\s*$", "", text)
    text = text.replace(" :", ":")
    text = re.sub(r"\s+", " ", text).strip(" :;,")
    return text


def parse_iso_date(raw: str):
    """Próbuje wygenerować datę ISO (YYYY-MM-DD / YYYY-MM / YYYY) do JSON-LD."""
    raw = clean_text(raw)
    if not raw:
        return ""
    raw = re.sub(r"\b(r\.|roku)\b", "", raw, flags=re.IGNORECASE).strip()

    # Format DD.MM.RRRR lub DD.MM.RRRR r.
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", raw)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"

    # Format '17 kwietnia 1904' itp.
    m = re.match(r"^(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})$", raw, re.IGNORECASE)
    if m:
        month = POLISH_MONTHS.get(m.group(2).lower())
        if month:
            return f"{m.group(3)}-{month:02d}-{int(m.group(1)):02d}"

    # Sama rocznica np. '1908' lub '1914-1916' -> bierzemy pierwszy rok.
    m = re.match(r"^(\d{4})", raw)
    if m:
        return m.group(1)
    return ""


def extract_places(record: dict, name: str = ""):
    """
    Przeszukuje kolumny arkusza powiązane z poszczególnymi fazami życia
    żołnierza i wyciąga współrzędne GPS zapisane jako
    'Miejsce: szerokość, długość'. Zwraca listę słowników:
        {lat, lon, label, phase, phase_label, color, is_birth, context, name}
    """
    out = []
    seen = set()
    for phase, fields in PHASE_FIELDS.items():
        meta = PHASE_META[phase]
        for fk in fields:
            value = clean_text(record.get(fk, ""))
            if not value:
                continue
            for match in COORD_RE.finditer(value):
                lat, lon = match.group(1), match.group(2)
                # Etykieta = ostatni niepusty segment tekstu przed współrzędnymi,
                # rozdzielony delimiterami : ; , . (pomija przeciekające liczby).
                prefix = value[:match.start()]
                label = ""
                for part in reversed(re.split(r"[:;,]", prefix)):
                    part = part.strip()
                    if part and not NUM_RE.match(part):
                        label = part
                        break
                label = re.sub(r"^ur\.\s*", "", label, flags=re.IGNORECASE) or "Miejsce"
                is_birth = bool(re.search(r"\bur\.?", prefix, re.IGNORECASE))
                key = (phase, label.lower(), lat, lon)
                if key in seen:
                    continue
                seen.add(key)
                out.append({
                    "lat": lat, "lon": lon, "label": label,
                    "phase": phase, "phase_label": meta["label"],
                    "color": meta["color"], "is_birth": is_birth,
                    "context": value, "name": name,
                })

            # Dodatkowo: znane obiekty Westerplatte (Prom, wartownie, koszary…)
            # występujące w opisach obrony, ale bez współrzędnych.
            # Tak jak w pierwotnej wersji – tylko faza bitwy (wrzesień 1939).
            if phase == "bitwa":
                nval = _norm(value)
                for tok, (plabel, plat, plon) in _PL_MAP.items():
                    if re.search(r"\b" + re.escape(tok) + r"\b", nval):
                        k2 = (phase, plabel.lower(), plat, plon)
                        if k2 in seen:
                            continue
                        seen.add(k2)
                        out.append({
                            "lat": str(plat), "lon": str(plon), "label": plabel,
                            "phase": phase, "phase_label": meta["label"],
                            "color": meta["color"], "is_birth": False,
                            "context": value, "name": name,
                        })
    return out


# --------------------------------------------------------------------------- #
# Statystyki wypełnienia bazy i hiperłącza między żołnierzami
# --------------------------------------------------------------------------- #
def compute_db_stats(records: list) -> dict:
    """Procent wypełnienia bazy (jak w pierwotnej wersji: % niepustych komórek A–J)."""
    total = len(records)
    if not total:
        return {"pct": 0, "records": 0, "names": 0, "gps": 0, "birth": 0, "birthplace": 0}
    fill_cols = [
        "nazwisko_imie", "data_urodzenia", "zycie_do_1939",
        "wrzesnia_1", "wrzesnia_1_cd", "wrzesnia_2", "wrzesnia_3_6", "wrzesnia_7",
        "lata_1939_1945", "po_wojnie",
    ]
    cell_total = total * len(fill_cols)
    filled = 0
    names = 0
    gps = 0
    birth = 0
    birthplace = 0
    for rec in records:
        for c in fill_cols:
            if (rec.get(c) or "").strip():
                filled += 1
        raw = clean_text(rec.get("nazwisko_imie", "")).lstrip("?!").strip()
        if raw:
            names += 1
        pts = extract_places(rec, raw)
        gps += len(pts)
        if any(p for p in pts if p["phase"] == "dzieciństwo" and p.get("is_birth")):
            birthplace += 1
        if any(p for p in pts if p["phase"] == "dzieciństwo"):
            birth += 1
    pct = lambda n: round(n / total * 100)
    return {
        "pct": round(filled / cell_total * 100),
        "records": total, "names": names, "gps": gps,
        "birth": pct(birth), "birthplace": pct(birthplace),
    }


def build_name_map(records: list) -> dict:
    """Mapa: nazwisko imię (oryginalna pisownia) -> slug podstrony żołnierza."""
    m = {}
    for rec in records:
        raw = clean_text(rec.get("nazwisko_imie", "")).lstrip("?!").strip()
        if raw:
            m[raw] = slugify(rec["nazwisko_imie"])
    return m


def format_fill_tip(s: dict) -> str:
    """Treść tooltipu przy „ⓘ” (jak w pierwotnej wersji)."""
    return (
        f"Rekordów: <b>{s['records']}</b><br>"
        f"Nazwiska: <b>{s['names']}</b><br>"
        f"Miejsca z GPS: <b>{s['gps']}</b><br>"
        f"Daty urodzin: <b>{s['birth']}%</b><br>"
        f"Miejsca urodzin: <b>{s['birthplace']}%</b><br>"
        f"Wypełnienie komórek (A–J): <b>{s['pct']}%</b> "
        f'<span class="db-goal">(cel: 100%)</span>'
    )


def link_soldier_names(escaped_html: str, name_map: dict, exclude: str = "") -> str:
    """Zamienia wystąpienia innych żołnierzy w tekście na hiperłącza do ich biogramów.

    Działa na już wyescapowanym HTML (sekcje biogramu). Używa pojedynczego
    wyrażenia alternatywnego (najdłuższe nazwiska najpierw), by uniknąć
    zagnieżdżonych linków. Re.sub nie skanuje na nowo podmienionego tekstu."""
    names = [n for n in name_map if n and n != exclude and len(n) >= 4]
    if not names:
        return escaped_html
    low = {k.lower(): v for k, v in name_map.items()}
    names.sort(key=lambda s: -len(s))
    alt = "|".join(re.escape(n) for n in names)
    pat = re.compile(r"(?<![\w>])(?:" + alt + r")(?![\w])", re.IGNORECASE)

    def repl(m):
        n = m.group(0)
        slug = low.get(n.lower())
        if not slug:
            return n
        return f'<a href="/zolnierze/{slug}.html">{n}</a>'

    return pat.sub(repl, escaped_html)


def osm_embed(lat: str, lon: str, label: str) -> str:
    """Zwraca kod <iframe> z mapą OpenStreetMap (bez klucza API)."""
    try:
        flat, flon = float(lat), float(lon)
    except ValueError:
        return ""
    d = 0.02
    bbox = f"{flon - d:.5f},{flat - d:.5f},{flon + d:.5f},{flat + d:.5f}"
    url = (
        "https://www.openstreetmap.org/export/embed.html"
        f"?bbox={bbox}&layer=mapnik&marker={lat},{lon}"
    )
    return (
        f'<iframe class="map" loading="lazy" title="{html.escape(label)}" '
        f'src="{url}" referrerpolicy="no-referrer-when-downgrade"></iframe>'
    )


# --------------------------------------------------------------------------- #
# Pobieranie danych
# --------------------------------------------------------------------------- #
def fetch_csv(url: str) -> str:
    print(f"Pobieram dane z arkusza Google: {url}")
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        # Arkusz jest kodowany w UTF-8.
        return resp.read().decode("utf-8-sig")


def load_records(local: bool):
    if local and os.path.exists(os.path.join(ROOT, "data.csv")):
        print("Używam lokalnego pliku data.csv")
        with open(os.path.join(ROOT, "data.csv"), encoding="utf-8-sig", newline="") as f:
            content = f.read()
    else:
        content = fetch_csv(SHEET_CSV_URL)
        # Zapisz kopię, by móc generować offline (--local).
        with open(os.path.join(ROOT, "data.csv"), "w", encoding="utf-8", newline="") as f:
            f.write(content)

    reader = csv.reader(content.splitlines())
    rows = list(reader)
    if not rows:
        raise SystemExit("Arkusz jest pusty.")

    header = [h.strip().lower() for h in rows[0]]
    data_rows = rows[1:]

    records = []
    for row in data_rows:
        if not row or not any(cell.strip() for cell in row):
            continue
        rec = {}
        for i, col in enumerate(COLUMNS):
            rec[col] = row[i] if i < len(row) else ""
        records.append(rec)
    print(f"Wczytano {len(records)} żołnierzy.")
    return records


# --------------------------------------------------------------------------- #
# Renderowanie
# --------------------------------------------------------------------------- #
def load_template() -> str:
    with open(TEMPLATE_PATH, encoding="utf-8") as f:
        return f.read()


def render_purpose_panel() -> str:
    body = "\n".join(f"  <p>{html.escape(p)}</p>" for p in PURPOSE_PARAGRAPHS)
    return (
        '<section class="timeline-block purpose-block">\n'
        '  <h2>Słowo wstępne</h2>\n'
        + body
        + '\n</section>'
    )


def render_section(label: str, body: str, cls: str = "", name_map: dict = None,
                    exclude: str = "") -> str:
    if not body:
        return ""
    text = html.escape(body)
    if name_map:
        text = link_soldier_names(text, name_map, exclude=exclude)
    return (
        f'<section class="timeline-block bio-row {cls}">\n'
        f'  <h2>{html.escape(label)}</h2>\n'
        f'  <p>{text}</p>\n'
        f'</section>'
    )


def _escape_json(text: str) -> str:
    """Bezpieczne osadzenie danych w <script type="application/json">."""
    return text.replace("</", "<\\/")


def render_places_list(points: list) -> str:
    """Lista miejsc pogrupowana według faz życia (tekstowa, dla czytelności i SEO).

    Nazwy placówek są hiperłączami prowadzącymi do mapy danego żołnierza
    (tak jak w pierwotnej wersji kliknięcie placówki przenosiło na mapę)."""
    if not points:
        return ""
    groups = {}
    for p in points:
        groups.setdefault(p["phase_label"], []).append(p)
    blocks = ""
    for phase_label, items in groups.items():
        lis = "".join(
            f'<li><span class="coord">{html.escape(i["lat"])}, {html.escape(i["lon"])}</span> '
            f'<a class="place-link" href="#soldier-map">{html.escape(i["label"])}</a></li>'
            for i in items
        )
        blocks += (
            f'<section class="timeline-block">\n'
            f'  <h2>{html.escape(phase_label)} – miejsca</h2>\n'
            f'  <ul class="places">{lis}</ul>\n'
            f'</section>'
        )
    return blocks


def render_bio_table(rec: dict, name_map: dict, name: str) -> str:
    """Zwarta tabela biogramu (etykieta | wartość) bez współrzędnych GPS
    – odtwarza czytelną formę z pierwotnej wersji serwisu."""
    rows = []

    def add_row(label, value):
        v = strip_gps(clean_text(value))
        if not v:
            return
        text = html.escape(v)
        if name_map:
            text = link_soldier_names(text, name_map, exclude=name)
        rows.append(f'<tr><th>{html.escape(label)}</th><td>{text}</td></tr>')

    add_row("Nazwisko i imię", name)
    birth = clean_date(rec["data_urodzenia"])
    if birth:
        rows.append(f'<tr><th>Data urodzenia</th><td>{html.escape(birth)}</td></tr>')
    for key, (label, cls) in SECTION_LABELS.items():
        add_row(label, rec.get(key, ""))

    if not rows:
        return ""
    return '<table class="bio">' + "".join(rows) + "</table>"


def render_soldier_map(points: list) -> str:
    """Interaktywna mapa losów żołnierza (Leaflet) z kolorami faz życia."""
    if not points:
        return ""
    data = [
        {
            "lat": p["lat"], "lon": p["lon"], "label": p["label"],
            "phase": p["phase"], "phase_label": p["phase_label"],
            "color": p["color"], "context": p["context"][:400],
        }
        for p in points
    ]
    json_str = _escape_json(json.dumps(data, ensure_ascii=False))
    legend = "".join(
        f'<span class="legend-item"><span class="swatch" '
        f'style="background:{m["color"]}"></span>{html.escape(m["label"])}</span>'
        for m in PHASE_META.values()
    )
    return (
        '<section class="timeline-block map-block">\n'
        '  <h2>Mapa losów żołnierza</h2>\n'
        '  <p class="map-hint">Kolory oznaczają kolejne etapy życia: '
        '<span class="swatch" style="background:#2a6fb0"></span>dzieciństwo, '
        '<span class="swatch" style="background:#b02a2a"></span>wrzesień 1939, '
        '<span class="swatch" style="background:#d98a1f"></span>lata 1939–1945, '
        '<span class="swatch" style="background:#2e8b57"></span>po wojnie. '
        'Kliknij punkt, by poznać szczegóły.</p>\n'
        '  <div id="soldier-map" class="leaflet-map"></div>\n'
        f'  <div class="legend">{legend}</div>\n'
        f'  <script type="application/json" id="soldier-points">{json_str}</script>\n'
        '  <script>initMapFromScript("soldier-map","soldier-points",{radius:8, minZoom:13, arrows:true});</script>\n'
        '</section>'
    )


def build_soldier_page(template: str, rec: dict, url_base: str,
                       name_map: dict = None) -> str:
    raw_name = clean_text(rec["nazwisko_imie"])
    # Usuwamy znaczniki wątpliwości/niepotwierdzenia z początku nazwiska.
    note = ""
    name = raw_name
    if name.startswith("?"):
        name = name[1:].strip()
        note = "Dane tego żołnierza wymagają dodatkowego potwierdzenia źródłowego."
    elif name.startswith("!"):
        name = name[1:].strip()
        note = "Wpis oznaczony jako szczególnie istotny w źródłach."

    birth_raw = clean_date(rec["data_urodzenia"])
    iso_birth = parse_iso_date(rec["data_urodzenia"])
    points = extract_places(rec, name)

    # Zwarta tabela biogramu (etykiety | wartości, bez współrzędnych GPS)
    # – odtwarza czytelną, zwartą formę z pierwotnej wersji serwisu.
    bio_table = render_bio_table(rec, name_map, name)

    # Interaktywna mapa losów żołnierza (Leaflet) z strzałkami przemieszczania.
    map_block = render_soldier_map(points)

    if note:
        note_html = f'<p class="note">{html.escape(note)}</p>'
    else:
        note_html = ""

    # Przypisana placówka bojowa (jak w pierwotnej wersji).
    battle_place = next((p for p in points if p["phase"] == "bitwa"), None)
    place_line = ""
    if battle_place:
        place_line = (
            '<p class="place-ref">Przypisana placówka bojowa: '
            f'<a class="soldier-link" href="/kategoria/{slugify(battle_place["label"])}.html">'
            f'{html.escape(battle_place["label"])}</a></p>'
        )

    intro = '<h2 class="bio-name">' + html.escape(name) + "</h2>" + place_line + bio_table

    canonical = f"{url_base.rstrip('/')}/zolnierze/{slugify(rec['nazwisko_imie'])}.html"
    title = f"{name} – Obrońca Westerplatte"
    description = (
        f"Biogram {name}, obrońcy Westerplatte z września 1939 roku. "
        f"Losy wojenne, niewola i życie powojenne."
    )
    if birth_raw:
        description += f" Data urodzenia: {birth_raw}."

    # JSON-LD (structured data) – bardzo pomocne dla SEO.
    json_ld = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": name,
        "description": description,
        "subjectOf": {
            "@type": "CreativeWork",
            "about": "Obrona Westerplatte (1939)",
        },
    }
    if iso_birth:
        json_ld["birthDate"] = iso_birth
    if points:
        json_ld["birthPlace"] = f"{points[0]['label']} ({points[0]['lat']}, {points[0]['lon']})"

    page = template
    replacements = {
        "{{TITLE}}": html.escape(title),
        "{{DESCRIPTION}}": html.escape(description),
        "{{CANONICAL}}": html.escape(canonical),
        "{{NAME}}": html.escape(name),
        "{{NOTE}}": note_html,
        "{{BASICS}}": '<div class="bio-cols"><div class="bio-text">' + intro,
        "{{INTRO}}": "",
        "{{SECTIONS}}": "",
        "{{PLACES}}": "",
        "{{MAP_BLOCK}}": '</div><div class="bio-viz">' + map_block + '</div></div>',
        "{{PAGE_CLASS}}": "soldier-page",
        "{{JSON_LD}}": json.dumps(json_ld, ensure_ascii=False),
        "{{YEAR}}": str(datetime.now().year),
        "{{GENERATED}}": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    for key, val in replacements.items():
        page = page.replace(key, val)
    return page


def build_index(template: str, records: list, url_base: str, db_stats: dict) -> str:
    """Strona główna – lista alfabetyczna z odnośnikami do podstron."""
    items = []
    for rec in records:
        raw_name = clean_text(rec["nazwisko_imie"]).lstrip("?!").strip()
        if not raw_name:
            continue
        slug = slugify(rec["nazwisko_imie"])
        birth = clean_date(rec["data_urodzenia"])
        snippet = clean_text(rec["zycie_do_1939"]) or clean_text(rec["wrzesnia_1"])
        li = (
            f'  <li class="soldier">\n'
            f'    <a href="/zolnierze/{slug}.html">{html.escape(raw_name)}</a>'
        )
        if birth:
            li += f'<span class="meta"> ({html.escape(birth)})</span>'
        li += '  </li>'
        items.append(li)

    search_html = (
        '<div class="search-box">\n'
        '  <input type="search" id="soldierSearch" autocomplete="off"\n'
        '         placeholder="Szukaj żołnierza po nazwisku…" '
        'aria-label="Szukaj żołnierza po nazwisku">\n'
        '  <span class="search-count" id="soldierCount"></span>\n'
        '</div>\n'
    )
    script_html = (
        '<script>\n'
        '(function () {\n'
        '  var inp = document.getElementById("soldierSearch");\n'
        '  if (!inp) return;\n'
        '  var main = inp.closest("main");\n'
        '  var list = main && main.querySelector(".soldier-list");\n'
        '  var count = document.getElementById("soldierCount");\n'
        '  if (!list) return;\n'
        '  var items = Array.prototype.slice.call(list.querySelectorAll("li.soldier"));\n'
        '  function apply() {\n'
        '    var q = inp.value.trim().toLowerCase();\n'
        '    var shown = 0;\n'
        '    items.forEach(function (li) {\n'
        '      var hit = !q || li.textContent.toLowerCase().indexOf(q) !== -1;\n'
        '      li.style.display = hit ? "" : "none";\n'
        '      if (hit) shown++;\n'
        '    });\n'
        '    if (count) count.textContent = q ? (shown + " / " + items.length) : "";\n'
        '  }\n'
        '  inp.addEventListener("input", apply);\n'
        '  apply();\n'
        '})();\n'
        '</script>\n'
    )
    list_html = (
        search_html
        + '<ul class="soldier-list compact">\n' + "\n".join(items) + '\n</ul>'
        + script_html
    )

    title = "Obrońcy Westerplatte – biogramy żołnierzy z 1939 roku"
    description = (
        f"Katalog {len(records)} obrońców Westerplatte. "
        "Biogramy, losy wojenne i miejsca pochówku żołnierzy września 1939."
    )

    maps_block = (
        '<section class="timeline-block map-block">\n'
        '  <h2>Zbiorcze mapy losów obrońców</h2>\n'
        '  <p>Przeglądaj na mapach pole bitwy Westerplatte oraz miejsca urodzenia, '
        'dzieciństwa, walk września 1939, niewoli i życia powojennego żołnierzy. '
        'Kategorie na mapach można włączać i wyłączać.</p>\n'
        '  <p>'
        '<a class="btn" href="/mapy.html#map-bitwa">🗺 Mapa bitwy →</a> '
        '<a class="btn btn-alt" href="/mapy.html#map-ogolna">🌍 Mapa ogólna →</a></p>\n'
        '</section>'
    )

    page = template
    replacements = {
        "{{TITLE}}": html.escape(title),
        "{{DESCRIPTION}}": html.escape(description),
        "{{CANONICAL}}": html.escape(url_base.rstrip("/") + "/"),
        "{{NAME}}": "Obrońcy Westerplatte",
        "{{PAGE_CLASS}}": "",
        "{{NOTE}}": "",
        "{{BASICS}}": (
            '<aside class="guide-cta">\n'
            '  <div class="guide-cta-text">\n'
            '    <h3>Chcesz zobaczyć Westerplatte z przewodnikiem? '
            '<button class="info-btn info-btn-inline" data-about title="O stronie i autorze">i</button></h3>\n'
            '    <p>Ta baza powstała, żeby odtworzyć losy ludzi, którzy bronili '
            'Wojskowej Składnicy Tranzytowej. Jeśli chcesz poznać Westerplatte '
            'nie tylko jako miejsce, ale również przez historie jego obrońców '
            '— zapraszam na oprowadzanie.</p>\n'
            '  </div>\n'
            '  <a class="guide-cta-btn" href="https://racibo.pl/" target="_blank" rel="noopener">'
            'Umów zwiedzanie z przewodnikiem →</a>\n'
            '</aside>'
        ),
        "{{INTRO}}": "",
        "{{SECTIONS}}": "",
        "{{PLACES}}": "",
        "{{MAP_BLOCK}}": maps_block,
        "{{FILL_PCT}}": str(db_stats["pct"]),
        "{{FILL_TIP}}": format_fill_tip(db_stats),
        "{{JSON_LD}}": json.dumps(
            {
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                "name": title,
                "description": description,
            },
            ensure_ascii=False,
        ),
        "{{YEAR}}": str(datetime.now().year),
        "{{GENERATED}}": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    # Podstrona żołnierza używa {{SECTIONS}}; dla strony głównej
    # wstawiamy listę w miejsce sekcji.
    page = page.replace("{{SECTIONS}}", list_html)
    for key, val in replacements.items():
        if key == "{{SECTIONS}}":
            continue
        page = page.replace(key, val)
    return page


def compute_place_assignments(records: list):
    """Zwraca słownik: etykieta obiektu taktycznego -> lista (nazwisko, slug)
    oraz odwrotną mapę: nazwisko -> lista etykiet (do nawigacji między tagami)."""
    assigns = {}
    name_to_places = {}
    for rec in records:
        name = clean_text(rec["nazwisko_imie"]).lstrip("?!").strip()
        if not name:
            continue
        slug = slugify(rec["nazwisko_imie"])
        for p in extract_places(rec, name):
            if p["phase"] == "bitwa" and p["label"] in _BATTLE_PLACE_CAT:
                assigns.setdefault(p["label"], []).append((name, slug))
                name_to_places.setdefault(name, set()).add(p["label"])
    return assigns, name_to_places


def render_simple_page(template: str, title: str, description: str,
                       canonical: str, body_html: str, db_stats: dict) -> str:
    """Wypełnia wspólny szablon strony (template.html) treścią sekcji."""
    replacements = {
        "{{TITLE}}": html.escape(title),
        "{{DESCRIPTION}}": html.escape(description),
        "{{CANONICAL}}": html.escape(canonical),
        "{{NAME}}": html.escape(title),
        "{{NOTE}}": "",
        "{{BASICS}}": "",
        "{{INTRO}}": "",
        "{{SECTIONS}}": body_html,
        "{{PLACES}}": "",
        "{{MAP_BLOCK}}": "",
        "{{PAGE_CLASS}}": "",
        "{{JSON_LD}}": json.dumps(
            {"@context": "https://schema.org", "@type": "WebPage", "name": title},
            ensure_ascii=False,
        ),
        "{{YEAR}}": str(datetime.now().year),
        "{{GENERATED}}": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "{{FILL_PCT}}": str(db_stats["pct"]),
        "{{FILL_TIP}}": format_fill_tip(db_stats),
    }
    page = template
    for k, v in replacements.items():
        page = page.replace(k, v)
    return page


def build_category_pages(records: list, template: str, url_base: str,
                         db_stats: dict) -> dict:
    """Zwraca słownik {slug_kategorii: (etykieta, html_strony)}.

    Układ: po lewej lista żołnierzy (nazwisko dużą czcionką, przydziały
    mniejszą), po prawej przylegająca mapa z zaznaczonymi losami
    przypisanych obrońców – tak by zmieściło się na jednym ekranie.
    """
    assigns, name_to_places = compute_place_assignments(records)
    rec_by_slug = {
        slugify(rec["nazwisko_imie"]): rec
        for rec in records
        if clean_text(rec.get("nazwisko_imie", "")).strip()
    }
    pages = {}
    for label, members in assigns.items():
        slug = slugify(label)
        items = []
        map_points = []
        for name, sslug in members:
            other = [pl for pl in name_to_places.get(name, set()) if pl != label]
            other_links = ""
            if other:
                links = ", ".join(
                    f'<a class="place-link" href="/kategoria/{slugify(pl)}.html">'
                    f'{html.escape(pl)}</a>'
                    for pl in sorted(other)
                )
                other_links = f'<span class="cat-assign">przydziały: {links}</span>'
            items.append(
                f'  <li class="cat-item">\n'
                f'    <a class="cat-name" href="/zolnierze/{sslug}.html">'
                f'{html.escape(name)}</a>\n'
                f'    {other_links}\n'
                f'  </li>'
            )
            # Punkty na mapę: wszystkie miejsca z życia przypisanego żołnierza.
            rec = rec_by_slug.get(sslug)
            if rec:
                for p in extract_places(rec, name):
                    cat = _life_cat(p)
                    map_points.append({
                        "lat": p["lat"], "lon": p["lon"], "label": p["label"],
                        "name": p["name"], "cat": cat,
                        "color": LIFE_CAT_COLOR[cat],
                        "phase_label": p["phase_label"],
                        "context": p.get("context", ""),
                        "url": f"/zolnierze/{sslug}.html",
                    })
        members_html = (
            '<ul class="cat-soldiers">\n' + "\n".join(items) + '\n</ul>'
        )
        related = []
        for rlabel, rmembers in assigns.items():
            if rlabel == label:
                continue
            related.append(
                f'<li><a href="/kategoria/{slugify(rlabel)}.html">'
                f'{html.escape(rlabel)}</a> <span class="tag-count">'
                f'({len(rmembers)})</span></li>'
            )
        related_html = '<ul class="tag-list">\n' + "\n".join(related) + '\n</ul>'
        map_html = render_categorized_map(
            f"kat-{slug}", "", map_points, LIFE_CATS,
            {"battle": False, "radius": 6},
        )
        body = (
            f'<div class="cat-layout">\n'
            f'  <div class="cat-list-col">\n'
            f'    <section class="timeline-block">\n'
            f'      <h2>Obrońcy przypisani do: {html.escape(label)}</h2>\n'
            f'      <p>Ta kategoria grupuje obrońców Westerplatte, których biogram '
            f'wskazuje przydział do tego miejsca podczas obrony września 1939 roku. '
            f'Kliknij nazwisko, by przejść do biogramu.</p>\n'
            f'      <p class="tag-count">Liczba powiązanych biogramów: '
            f'<b>{len(members)}</b></p>\n'
            f'      {members_html}\n'
            f'    </section>\n'
            f'    <section class="timeline-block">\n'
            f'      <h2>Powiązane kategorie (inne placówki)</h2>\n'
            f'      <p>Przejdź do innych placówek bojowych, by zobaczyć przypisanych '
            f'im obrońców:</p>\n'
            f'      {related_html}\n'
            f'    </section>\n'
            f'  </div>\n'
            f'  <div class="cat-map-col">\n'
            f'    <div class="cat-map-sticky">\n'
            f'      <h2 class="cat-map-title">Mapa losów obrońców</h2>\n'
            f'      {map_html}\n'
            f'    </div>\n'
            f'  </div>\n'
            f'</div>'
        )
        title = f"Obrońcy placówki {label} – Westerplatte"
        pages[slug] = (
            title,
            render_simple_page(
                template, title,
                f"Lista obrońców Westerplatte przypisanych do placówki {label}.",
                url_base.rstrip("/") + f"/kategoria/{slug}.html",
                body, db_stats,
            ),
        )
    return pages


def build_categories_index(records: list, template: str, url_base: str,
                          db_stats: dict) -> str:
    assigns, _ = compute_place_assignments(records)
    items = []
    for label, members in sorted(assigns.items(), key=lambda kv: kv[0].lower()):
        slug = slugify(label)
        items.append(
            f'<li><a href="/kategoria/{slug}.html">{html.escape(label)}</a> '
            f'<span class="tag-count">({len(members)})</span></li>'
        )
    body = (
        '<section class="timeline-block">\n'
        '  <h2>Kategorie placówek bojowych</h2>\n'
        '  <p>Wszystkie placówki i obiekty Westerplatte, do których przypisano '
        'obrońców w bazie danych. Kliknij kategorię, by zobaczyć listę '
        'powiązanych biogramów i przejść do innych placówek.</p>\n'
        f'  <ul class="tag-list">\n' + "\n".join(items) + '\n</ul>\n'
        '</section>'
    )
    return render_simple_page(
        template, "Kategorie placówek – Westerplatte",
        "Lista kategorii placówek bojowych Westerplatte z przypisanymi obrońcami.",
        url_base.rstrip("/") + "/kategorie.html",
        body, db_stats,
    )


def build_sitemap(records: list, url_base: str) -> str:
    urls = [f"  <url><loc>{url_base}/</loc></url>"]
    urls.append(f"  <url><loc>{url_base}/mapy.html</loc></url>")
    urls.append(f"  <url><loc>{url_base}/o-projekcie.html</loc></url>")
    urls.append(f"  <url><loc>{url_base}/kategorie.html</loc></url>")
    assigns, _ = compute_place_assignments(records)
    for label in assigns:
        urls.append(f"  <url><loc>{url_base}/kategoria/{slugify(label)}.html</loc></url>")
    for rec in records:
        slug = slugify(rec["nazwisko_imie"])
        urls.append(f"  <url><loc>{url_base}/zolnierze/{slug}.html</loc></url>")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )


def render_aggregate_map(pid: str, title: str, points: list, phase: str = None) -> str:
    """Pojedyncza zbiorcza mapa Leaflet z punktami dla danej fazy."""
    if not points:
        return ""
    data = [
        {
            "lat": p["lat"], "lon": p["lon"], "label": p["label"],
            "name": p["name"], "color": p["color"], "phase_label": p["phase_label"],
        }
        for p in points
    ]
    js = _escape_json(json.dumps(data, ensure_ascii=False))
    if phase:
        meta = PHASE_META[phase]
        legend = (
            f'<span class="legend-item"><span class="swatch" '
            f'style="background:{meta["color"]}"></span>{html.escape(meta["label"])}</span>'
        )
    else:
        legend = "".join(
            f'<span class="legend-item"><span class="swatch" '
            f'style="background:{m["color"]}"></span>{html.escape(m["label"])}</span>'
            for m in PHASE_META.values()
        )
    battle_opt = ", battle:true" if phase == "bitwa" else ""
    return (
        f'<section class="timeline-block map-block">\n'
        f'  <h2>{html.escape(title)}</h2>\n'
        f'  <p class="map-count">Liczba zaznaczonych miejsc: {len(points)}</p>\n'
        f'  <div id="map-{pid}" class="leaflet-map"></div>\n'
        f'  <div class="legend">{legend}</div>\n'
        f'  <script type="application/json" id="pts-{pid}">{js}</script>\n'
        f'  <script>initMapFromScript("map-{pid}","pts-{pid}",'
        f'{{radius:6{battle_opt}}});</script>\n'
        f'</section>'
    )


def render_categorized_map(pid: str, title: str, points: list, cats: list,
                           opts: dict = None, desc: str = "") -> str:
    """Mapa Leaflet z punktami podzielonymi na kategorie, które można
    włączać i wyłączać z poziomu legendy (przełączniki).

    Punkty muszą zawierać klucz ``cat`` (zgodny z ``cats``). Legenda jest
    budowana dynamicznie przez map.js na podstawie listy ``cats``.
    """
    if not points:
        return ""
    data = {
        "cats": cats,
        "points": [
            {
                "lat": p["lat"], "lon": p["lon"], "label": p.get("label", ""),
                "name": p.get("name", ""), "color": p.get("color", ""),
                "cat": p.get("cat", ""), "phase_label": p.get("phase_label", ""),
                "context": p.get("context", ""),
                "url": p.get("url", ""),
            }
            for p in points
        ],
    }
    js = _escape_json(json.dumps(data, ensure_ascii=False))
    opts = opts or {}
    battle_opt = ", battle:true" if opts.get("battle") else ""
    legend_id = f"legend-{pid}"
    map_inner = (
        f'  <div id="map-{pid}" class="leaflet-map"></div>\n'
        f'  <div class="legend legend-toggle" id="{legend_id}"></div>\n'
        f'  <script type="application/json" id="pts-{pid}">{js}</script>\n'
        f'  <script>initMapFromScript("map-{pid}","pts-{pid}",'
        f'{{radius:{opts.get("radius", 6)}{battle_opt}, legend:"{legend_id}"}});'
        f'</script>\n'
    )
    if opts.get("two_col"):
        return (
            f'<section class="timeline-block map-block map-2col" id="sec-{pid}">\n'
            f'  <div class="map-info">\n'
            f'    <h2>{html.escape(title)}</h2>\n'
            f'    {("<p>" + html.escape(desc) + "</p>") if desc else ""}\n'
            f'  </div>\n'
            f'  <div class="map-viz">\n'
            f'{map_inner}'
            f'  </div>\n'
            f'</section>'
        )
    return (
        f'<section class="timeline-block map-block" id="sec-{pid}">\n'
        f'  <h2>{html.escape(title)}</h2>\n'
        f'{map_inner}'
        f'</section>'
    )


def _life_cat(point: dict) -> str:
    """Przypisuje punktowi życiowemu jedną z kategorii Mapy ogólnej."""
    if point["phase"] == "bitwa":
        return "bitwa"
    if point["phase"] == "wojna":
        return "wojna"
    if point["phase"] == "powojnie":
        return "powojnie"
    if point["phase"] == "dzieciństwo":
        return "urodzenie" if point.get("is_birth") else "przedwoj"
    return "przedwoj"


def build_maps_page(records: list, url_base: str, db_stats: dict) -> str:
    """Strona ze zbiorczymi mapami: Mapa bitwy i Mapa ogólna.

    Obie mapy mają kategorie włączane i wyłączane z poziomu legendy.
    """
    all_points = []
    for rec in records:
        name = clean_text(rec["nazwisko_imie"]).lstrip("?!").strip()
        all_points.extend(extract_places(rec, name))

    # --- Mapa bitwy: obiekty taktyczne Westerplatte (bez warstwy żołnierzy) ---
    # Przypisanych obrońców agregujemy i pokazujemy w oknie po kliknięciu
    # w dany obiekt (jak w archiwalnej wersji), ale nie jako osobną warstwę.
    assigned = {}
    for rec in records:
        name = clean_text(rec["nazwisko_imie"]).lstrip("?!").strip()
        for p in extract_places(rec, name):
            if p["phase"] == "bitwa" and p["label"] in _BATTLE_PLACE_CAT:
                assigned.setdefault(p["label"], set()).add(name)

    battle_points = []
    for label, lat, lon, _toks in _W_PLACES_RAW:
        cat = _BATTLE_PLACE_CAT.get(label, "zaplecze")
        desc = _BATTLE_PLACE_DESC.get(label, "")
        names = sorted(assigned.get(label, []))
        n = len(names)
        ctx = desc
        if n:
            ctx += ((" " if ctx else "") +
                    f"Przydzieleni obrońcy: {n} (zobacz listę po kliknięciu "
                    f'„Zobacz przydział obrońców →”).')
        battle_points.append({
            "lat": lat, "lon": lon, "label": label, "name": label,
            "cat": cat, "color": BATTLE_CAT_COLOR[cat],
            "phase_label": "Pole bitwy Westerplatte", "context": ctx,
            "url": f"/kategoria/{slugify(label)}.html",
            "url_label": f"Zobacz przydział obrońców ({n}) →",
        })

    # --- Mapa ogólna: wszystkie miejsca z życia, z kategoriami ---
    general_points = []
    for rec in records:
        name = clean_text(rec["nazwisko_imie"]).lstrip("?!").strip()
        slug = slugify(rec["nazwisko_imie"])
        for p in extract_places(rec, name):
            cat = _life_cat(p)
            general_points.append({
                "lat": p["lat"], "lon": p["lon"], "label": p["label"],
                "name": p["name"], "cat": cat, "color": LIFE_CAT_COLOR[cat],
                "phase_label": p["phase_label"], "context": p.get("context", ""),
                "url": f"/zolnierze/{slug}.html",
            })

    maps_html = render_categorized_map(
        "bitwa", "Mapa bitwy – pole walki Westerplatte (wrzesień 1939)",
        battle_points, BATTLE_CATS,
        {"battle": True, "radius": 6, "two_col": True},
        desc="Obiekty taktyczne półwyspu Westerplatte i przypisani do nich "
             "obrońcy. Kliknij punkt, by otworzyć opis i listę żołnierzy.",
    )
    maps_html += render_categorized_map(
        "ogolna", "Mapa ogólna – losy życiowe obrońców",
        general_points, LIFE_CATS,
        {"battle": False, "radius": 6, "two_col": True},
        desc="Miejsca urodzenia, walk września 1939, niewoli i życia powojennego "
             "wszystkich obrońców. Włączaj i wyłączaj kategorie w legendzie.",
    )

    with open(TEMPLATE_MAPS_PATH, encoding="utf-8") as f:
        tpl = f.read()

    intro = (
        '<section class="timeline-block">\n'
        '  <h2>O mapach zbiorczych</h2>\n'
        '  <p>Poniższe mapy pokazują zestawienie miejsc związanych z losami obrońców '
        'Westerplatte. Każdy punkt to współrzędna geograficzna zaczerpnięta z archiwalnego '
        'opisu żołnierza. Kliknij punkt, aby poznać imię i nazwisko oraz kontekst miejsca.</p>\n'
        '  <p class="map-hint">Kategorie na mapie można włączać i wyłączać za pomocą '
        'przełączników w legendzie pod każdą mapą.</p>\n'
        '</section>'
    )
    replacements = {
        "{{TITLE}}": "Zbiorcze mapy losów obrońców Westerplatte",
        "{{DESCRIPTION}}": (
            "Mapy miejsc urodzenia, dzieciństwa, walk września 1939, niewoli "
            "i życia powojennego obrońców Westerplatte."
        ),
        "{{CANONICAL}}": url_base.rstrip("/") + "/mapy.html",
        "{{NAME}}": "Zbiorcze mapy losów",
        "{{INTRO}}": intro,
        "{{MAPS}}": maps_html,
        "{{JSON_LD}}": json.dumps(
            {
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                "name": "Zbiorcze mapy losów obrońców Westerplatte",
            },
            ensure_ascii=False,
        ),
        "{{YEAR}}": str(datetime.now().year),
        "{{GENERATED}}": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "{{FILL_PCT}}": str(db_stats["pct"]),
        "{{FILL_TIP}}": format_fill_tip(db_stats),
    }
    for k, v in replacements.items():
        tpl = tpl.replace(k, v)
    return tpl


# --------------------------------------------------------------------------- #
# Główna funkcja
# --------------------------------------------------------------------------- #
def build_about_page(template: str, records: list, url_base: str, db_stats: dict) -> str:
    """Strona „O projekcie” z pełnym opisem celu powstania serwisu."""
    title = "O projekcie – po co powstał serwis Westerplatte"
    description = (
        "Cel i historia powstania serwisu o obrońcach Westerplatte, "
        "stworzonego przez Jakuba Raciborskiego (racibo.pl) jako narzędzie "
        "w pracy przewodnika."
    )
    page = template
    replacements = {
        "{{TITLE}}": html.escape(title),
        "{{DESCRIPTION}}": html.escape(description),
        "{{CANONICAL}}": url_base.rstrip("/") + "/o-projekcie.html",
        "{{NAME}}": "O projekcie",
        "{{PAGE_CLASS}}": "",
        "{{NOTE}}": "",
        "{{BASICS}}": (
            f'<section class="timeline-block">\n'
            f'  <h2>Kilka liczb</h2>\n'
            f'  <p>W bazie: <strong>{len(records)}</strong> nazwisk i biogramów '
            f'obrońców Westerplatte. Dane uzupełniane są na bieżąco z otwartego '
            f'arkusza Google Sheets.</p>\n'
            f'</section>'
        ),
        "{{INTRO}}": render_purpose_panel(),
        "{{SECTIONS}}": "",
        "{{PLACES}}": "",
        "{{MAP_BLOCK}}": (
            '<section class="timeline-block map-block">\n'
            '  <h2>Mapy losów</h2>\n'
            '  <p>Zobacz zestawienie miejsc urodzenia, walk i życia powojennego '
            'obrońców na zbiorczych mapach.</p>\n'
            '  <p><a class="btn" href="/mapy.html">Otwórz zbiorcze mapy →</a></p>\n'
            '</section>'
        ),
        "{{JSON_LD}}": json.dumps(
            {
                "@context": "https://schema.org",
                "@type": "AboutPage",
                "name": title,
                "description": description,
            },
            ensure_ascii=False,
        ),
        "{{YEAR}}": str(datetime.now().year),
        "{{GENERATED}}": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "{{FILL_PCT}}": str(db_stats["pct"]),
        "{{FILL_TIP}}": format_fill_tip(db_stats),
    }
    for key, val in replacements.items():
        page = page.replace(key, val)
    return page


def main():
    parser = argparse.ArgumentParser(description="Generator statycznej strony Westerplatte")
    parser.add_argument(
        "--local", action="store_true",
        help="Użyj lokalnego pliku data.csv zamiast pobierać z sieci",
    )
    parser.add_argument(
        "--url-base", default="https://example.com",
        help="Bazowy URL witryny (do sitemap.xml), np. https://twoja-nazwa.github.io",
    )
    args = parser.parse_args()

    os.makedirs(SOLDIERS_DIR, exist_ok=True)
    os.makedirs(ASSETS_DIR, exist_ok=True)

    records = load_records(args.local)
    template = load_template()

    # Skopiuj style.css, map.js i about.js do assets/ (jeśli istnieją).
    if os.path.exists(STYLE_SRC):
        shutil.copyfile(STYLE_SRC, os.path.join(ASSETS_DIR, "style.css"))
    else:
        print("Uwaga: brak pliku style.css.")

    def _copy(src, name):
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(ASSETS_DIR, name))
        else:
            print(f"Uwaga: brak pliku {name}.")

    _copy(MAPJS_SRC, "map.js")
    _copy(ABOUTJS_SRC, "about.js")

    # Statystyki wypełnienia bazy i mapa nazwisk (do hiperłączy).
    db_stats = compute_db_stats(records)
    name_map = build_name_map(records)
    print(f"Baza danych: {db_stats['pct']}% wypełnienia, {db_stats['names']} nazwisk.")

    # Strona główna (używa tego samego szablonu, ale z listą zamiast sekcji).
    index_html = build_index(template, records, args.url_base, db_stats)
    with open(os.path.join(OUTPUT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_html)
    print("Wygenerowano index.html")

    # Strona „O projekcie” (cel serwisu).
    about_html = build_about_page(template, records, args.url_base, db_stats)
    with open(os.path.join(OUTPUT_DIR, "o-projekcie.html"), "w", encoding="utf-8") as f:
        f.write(about_html)
    print("Wygenerowano o-projekcie.html")

    # Podstrony żołnierzy.
    for rec in records:
        slug = slugify(rec["nazwisko_imie"])
        page = build_soldier_page(template, rec, args.url_base, name_map)
        out_path = os.path.join(SOLDIERS_DIR, f"{slug}.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(page)
    print(f"Wygenerowano {len(records)} podstron w folderze zolnierze/")

    # Zbiorcze mapy losów.
    maps_html = build_maps_page(records, args.url_base, db_stats)
    with open(os.path.join(OUTPUT_DIR, "mapy.html"), "w", encoding="utf-8") as f:
        f.write(maps_html)
    print("Wygenerowano mapy.html (zbiorcze mapy losów)")

    # SEO: sitemap + robots.
    with open(os.path.join(OUTPUT_DIR, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(build_sitemap(records, args.url_base.rstrip("/")))
    with open(os.path.join(OUTPUT_DIR, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(
            "User-agent: *\n"
            "Allow: /\n"
            f"Sitemap: {args.url_base.rstrip('/')}/sitemap.xml\n"
        )
    print("Wygenerowano sitemap.xml i robots.txt")

    # Strony kategorii (tagi placówek) + indeks kategorii.
    CAT_DIR = os.path.join(OUTPUT_DIR, "kategoria")
    os.makedirs(CAT_DIR, exist_ok=True)
    cat_pages = build_category_pages(records, template, args.url_base, db_stats)
    for slug, (title, html_page) in cat_pages.items():
        with open(os.path.join(CAT_DIR, f"{slug}.html"), "w", encoding="utf-8") as f:
            f.write(html_page)
    with open(os.path.join(OUTPUT_DIR, "kategorie.html"), "w", encoding="utf-8") as f:
        f.write(build_categories_index(records, template, args.url_base, db_stats))
    print(f"Wygenerowano {len(cat_pages)} stron kategorii i indeks kategorii")
    print("Gotowe.")


if __name__ == "__main__":
    main()
