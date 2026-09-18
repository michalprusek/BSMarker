# Editor v2 – inventura starého editoru a návrh UX

*Stav k 18. 9. 2026 · větev `feature/editor-v2`*

## 1. Co je hotové: jádro editoru v2

Otevření: `https://bsmarker.utia.cas.cz/recordings/<id>/annotate-v2` (starý editor běží beze změny na `/annotate`).
Fáze 1 je **jen prohlížení a navigace**: nic neukládá, takže je bezpečné ji zkoušet na produkčních datech.

| Oblast | Jak je to udělané |
|---|---|
| Souřadnice | Box = čas (s) + frekvence (Hz). Pixely se vždy jen dopočítají, takže nezávisí na monitoru ani na zoomu. |
| Spektrogram | Počítá se v prohlížeči z audia ve Web Workerech (FFT), po dlaždicích a jen pro viditelnou část plus okolí. |
| Úrovně detailu | Při oddálení se sloupce slučují **maximem**, takže krátká slabika nikdy „nepropadne“. Při přiblížení se počítá jemněji (až 4 vzorky na sloupec). |
| Vykreslení | WebGL2 plátno velké jako obrazovka. Kontrast, paleta i frekvenční zoom se mění v shaderu bez přepočtu. |
| Zvuk | Web Audio. Kurzor se bere z hodin zvukové karty, takže je přesně synchronní. Zpomalení 0,125×–2× (zpomalení snižuje výšku tónu). |
| React | Jen tlačítka a stavový řádek. Kreslení běží mimo React v jedné smyčce `requestAnimationFrame`. |

### Naměřeno (produkce, nejdelší nahrávka 584 s, server se 2 jádry bez GPU)

| Metrika | Hodnota |
|---|---|
| Výpočet celého přehledu 584 s (1 worker) | 1,0 s (na běžném notebooku se 4 workery ~0,3 s) |
| Výpočet jedné dlaždice (256 sloupců, FFT 1024) | ~4 ms |
| Práce hlavního vlákna na snímek při zoomu a posunu | medián 0,5 ms, max 3,9 ms (rozpočet 16,7 ms) |
| Long tasks (> 50 ms) během gest | 0 |
| Stažení a dekódování audia 584 s | ~4,7 s (jednorázově, na serveru; po síti záleží na lince) |

## 2. Inventura starého editoru

Legenda: ✅ převzít · 🔁 převzít, ale jinak · ❌ vypustit · ❓ rozhodnutí na vás

### Navigace a zobrazení
| Funkce ve starém editoru | Rozhodnutí | Poznámka |
|---|---|---|
| Zoom jen v čase, max 5000 %, obraz se jen roztahuje | 🔁 **hotovo** | Zoom až na ~24 px/ms, ostrý detail, navíc frekvenční zoom. |
| Kolečko = zoom (bez modifikátoru) | 🔁 **hotovo** | Podle Figmy: kolečko = posun, Ctrl/⌘ + kolečko nebo pinch = zoom. |
| Posun: pravé tlačítko, prostřední, Shift/Ctrl + drag, ←/→ o 100 px | 🔁 **hotovo** | Drag, prostřední tlačítko, kolečko, ←/→ (o 20 % / se Shiftem 80 %), Home/End, minimapa. |
| Kontrast přes CSS filtr | 🔁 **hotovo** | Práh šumu + maximum v dB a tlačítko **Auto** (práh = medián šumu nahrávky). |
| Frekvenční osa (10 dílků), časová osa | ✅ **hotovo** | Dílky 1-2-5 se přizpůsobují zoomu, až na ms. |
| Waveform (skrytý WaveSurfer + vlastní vykreslování) | 🔁 **hotovo** | Vlastní min/max pyramida, přesná při jakémkoli zoomu. |
| „Zrcadla“ boxů na waveformu | 🔁 **hotovo** | Nahradil je **časový pruh**: boxy zploštělé na časovou osu. |
| Fullscreen | ✅ **hotovo** | Editor v2 zabírá celou obrazovku. |

### Přehrávání
| Funkce | Rozhodnutí | Poznámka |
|---|---|---|
| Space = play/pause | ✅ **hotovo** | |
| Rychlosti 0,25–4× (klik na odznak) | 🔁 **hotovo** | Výběr 0,125×–2×. Pomalé rychlosti jsou pro ptáky užitečnější. |
| Dvojklik na box = přehrát box | ✅ **hotovo** | Navíc Enter přehraje vybraný box nebo viditelný úsek, L zapne smyčku. |
| Klik = přesun kurzoru přehrávání | ✅ **hotovo** | |
| „Rewind“ (držením) | ❌ | Mrtvý kód, nikdy nebyl připojený. |
| Sledování kurzoru při přehrávání | 🔁 **hotovo** | Přepínač „Follow“. Když se uživatel sám podívá jinam, sledování se vypne. |

### Anotace (fáze 2, zatím neimplementováno)
| Funkce | Rozhodnutí | Poznámka |
|---|---|---|
| Režim kreslení (`.`), tažení = nový box | 🔁 | Viz návrh UX níže. |
| Výběr klikem, Shift = přidat, Ctrl = přepnout, obdélníkový výběr | 🔁 | Sjednotit podle Figmy (Shift = přepnout). |
| Přesun vybraných boxů tažením | ✅ | |
| Změna velikosti **jen za 4 rohy** | 🔁 | Přidat úchyty i na **hrany**. Posun začátku a konce v čase je nejčastější úprava. |
| Labely: volný text, rychlé přiřazení písmenem A–Z | ❓ | Viz otázka 1. |
| Barvy podle labelu (10 barev) | ✅ **hotovo** | |
| Kopírovat/vložit (Ctrl+C/V), mazání, undo/redo (20 kroků) | 🔁 | Undo bez limitu na operace, přidat Ctrl+D (duplikovat). |
| „Bottom line“: frekvenční hranice, pod kterou nesmí zasahovat žádný box | ❓ | Viz otázka 4. |
| Detekce konfliktů (mezera < 10 ms, vnořené boxy) + auto-řešení | 🔁 | Zobrazovat průběžně v časovém pruhu, neblokovat navigaci. |
| Měření vzdálenosti (Alt + hover) | ✅ | Hodí se na intervaly mezi slabikami. |
| Kontextové menu (upravit label, kopírovat, smazat, vložit) | ✅ | |
| Seznam boxů v panelu (řazení čas/abeceda, hromadné mazání) | 🔁 | Klik na řádek skočí na box, filtr podle labelu. |

### Ukládání a navigace
| Funkce | Rozhodnutí | Poznámka |
|---|---|---|
| Ukládání přepisem celé sady boxů (1 anotace na uživatele a nahrávku) | ✅ | Formát API zachovat, zdrojem pravdy bude čas/Hz. |
| Autosave (3 s po změně + každých 30 s) + 3 různé `beforeunload` handlery | 🔁 | Jeden mechanismus a viditelný stav „Uloženo před 2 s“. |
| Blokace odchodu při konfliktech („Discard & Continue“ nic nechrání) | ❌ | Nahradí to autosave a varování v pruhu. |
| Předchozí/další nahrávka v projektu | 🔁 | **Rozbité**: načítá jen prvních 50 nahrávek, projekt jich má 1 011. |
| Přepínač „Finished“ | ✅ | |

### Nalezené chyby ve starém systému (důležité pro data)
1. **Pixelové souřadnice jako zdroj pravdy.** Při otevření na jiném monitoru se časy boxů přepočítají špatně (analýza ukázala šířky ~2000 px vs ~1300 px). Editor v2 to řeší z principu. Před přepnutím ještě zkontrolujeme konzistenci uložených časů.
2. **`metadata` se nikdy neuloží.** Frontend posílá `metadata`, backend čeká `extra_metadata`, takže se hodnota tiše zahodí. `confidence` nemá v UI žádné použití. Obojí budeme potřebovat pro předanotace z MixIT pipeline.
3. **Navigace mezi nahrávkami** funguje jen v prvních 50 nahrávkách projektu.
4. **Mrtvý kód:** `annotationApiService.ts` (332 řádků), `KEYBOARD_SHORTCUTS`, `AUTOSAVE_INTERVAL`, starý WaveSurfer, rewind, zakomentovaný export, `segmentDuration`, vrstva shimů v `AnnotationEditor.tsx`, nepoužívané metody `useConflictDetection`.

## 3. Návrh UX pro editaci (fáze 2)

Cíl: ovládání, které lidé znají z Figmy nebo z úprav fotek, doplněné o konvence audio nástrojů (Raven, Audacity).

### Nástroje (jako ve Figmě)
| Klávesa | Nástroj | Chování |
|---|---|---|
| `V` | **Výběr** (výchozí) | Klik = vybrat, tažení boxu = přesun, tažení hrany/rohu = změna velikosti, tažení v prázdnu = obdélníkový výběr. |
| `B` | **Box** | Tažení = nový box (čas × frekvence). Nástroj zůstává aktivní, takže jde kreslit slabiku za slabikou. |
| `T` | **Časový segment** | Tažení = box přes celé frekvenční pásmo, jen začátek a konec. Nejrychlejší pro segmentaci na časové ose. |
| prostřední tlačítko / kolečko | posun | V jakémkoli nástroji. |

### Úpravy
- **8 úchytů** (rohy + hrany). Kurzor se mění podle směru jako ve Figmě.
- **Přichytávání hran** k sousedním boxům a k časové mřížce, Alt při tažení přichytávání vypne.
- **Šipky** posunou vybraný box o 1 sloupec spektrogramu (se Shiftem o 10). `Alt + ←/→` posune jen začátek, `Alt + Shift + ←/→` jen konec. Tak jde doladit hranice na milisekundy bez myši.
- `Ctrl+Z / Ctrl+Shift+Z`, `Ctrl+C / Ctrl+V`, `Ctrl+D` (duplikovat), `Ctrl+A`, `Delete`, `Esc`.
- Shift + klik přidá box do výběru nebo ho z něj odebere.

### Labely
- Panel labelů projektu s klávesami **1–9** (vybraný box dostane label jedním stiskem), `Enter` na vybraném boxu = pole s našeptávačem.
- Nový box dostane naposledy použitý label (dnes to je volitelné přes `Ctrl+2`).

### Průběžná kontrola kvality
- Časový pruh zvýrazní **překryvy a mezery < 10 ms** přímo tam, kde jsou. „Opravit vše“ je jedno tlačítko, nic neblokuje.

### Pracovní tok
- `Tab / Shift+Tab` projde boxy (**hotovo**), `N / Shift+N` přejde na další nebo předchozí nahrávku (s autosave), přepínač „Finished“ v hlavičce.

## 4. Otázky na vás

1. **Labely:** zůstat u volného textu, nebo mít **pevný seznam labelů pro projekt**? Pro trénovací dataset doporučuji pevný seznam, protože volný text vede k překlepům (`A`, `a`, `A `) a nekonzistentním datům.
2. **Anotace na uživatele:** dnes má každý uživatel vlastní sadu boxů (dva anotátoři se navzájem nevidí). Chcete to tak nechat (hodí se pro měření shody anotátorů), nebo sdílenou sadu?
3. **Mezerník:** v audio nástrojích je to play/pause, ve Figmě „ruka“ pro posun. Navrhuji **Space = play/pause**. Posun zajistí kolečko, prostřední tlačítko a tažení v prázdném místě v nástroji Box. Souhlasíte?
4. **„Bottom line“** (spodní frekvenční hranice): používá se? Pokud ano, zobecnil bych ji na volitelný „frekvenční rozsah projektu“.
5. **Výchozí FFT:** teď 1024 (okno 21–23 ms). Pro rychlé trylky může být lepší 512. Máte zkušenost, co anotátoři preferují?
