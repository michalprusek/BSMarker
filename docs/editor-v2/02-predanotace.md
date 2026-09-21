# Předanotace: neuronky a prahování v editoru

*Návrh k 21. 9. 2026 · zatím nic z toho není naimplementované*

Cílem je zrychlit anotaci tím, že část boxů navrhne stroj a člověk je jen potvrdí nebo opraví.
Vycházíme z `birds_research_project` (MixIT + prahování, viz `latex/proposed_classic.tex`,
`proposed_mixit.tex`, `results_and_discussion.tex`).

## 1. Společný mezivýstup: křivka aktivity

Obě uvažované cesty se dají převést na jeden tvar dat: **křivku aktivity v čase** (hodnoty 0–1,
krok řádově 5–10 ms) a k ní doporučený práh.

| Zdroj | Křivka |
|---|---|
| Okénková variance (případně adaptivní práh à la Sauvola) | variance signálu |
| Neuronová síť | pravděpodobnost „tady zpívá“ po snímcích |
| MixIT | variance vybraného separovaného kanálu (jeden kanál = jedna křivka) |

Aplikace z křivky a prahu živě vyrábí navržené boxy. Pravidla jsou pro všechny zdroje stejná:
minimální délka, spojení blízkých úseků, mezera nejméně 12 ms (shodně s kontrolou konfliktů).

Důsledek: posuvník prahu funguje nad **libovolným modelem**, nejen nad variancí. Když síť
nesegmentuje dobře, anotátor posune práh místo ručního překlikávání. Zároveň to obchází problém
z práce, že nejde spolehlivě určit dominantní MixIT kanál — kanál vybere člověk.

## 2. Kde se co počítá

Produkční server má 2 jádra, 15 GB RAM a žádné GPU, takže inference sítí na něm nemá co dělat.

| Co | Kde | Proč |
|---|---|---|
| Variance a Sauvola nad originálem | v prohlížeči (Web Worker) | audio je už dekódované, výpočet je v řádu ms, jde měnit i délka okna |
| Neuronky (MixIT a další) | předpočítané dávkově mimo aplikaci | na 2 jádrech bez GPU by inference zdržovala anotátory |
| Křivka + práh → boxy | v prohlížeči | posuvník musí reagovat okamžitě |

## 3. Sdílený kontrakt pro modely

Samostatný Python balíček (`bsmarker-models`) mimo webovou aplikaci. Aplikace nepotřebuje znát
PyTorch ani TensorFlow, jen výsledný formát.

```python
class SegmentationModel(Protocol):
    name: str          # "mixit-var", "unet-v2", …
    version: str
    def run(self, audio: np.ndarray, sr: int) -> ModelOutput: ...

@dataclass
class ModelOutput:
    hop_s: float                       # krok křivek
    channels: list[ActivityCurve]      # 1..N křivek (např. MixIT kanály), hodnoty 0–1
    default_threshold: float
    segments: list[Segment] | None     # volitelné, když model vrací rovnou úseky
    params: dict                       # s čím to běželo (reprodukovatelnost)
```

- **Běh:** CLI `bsmarker-run --model mixit-var --project 5` stáhne audio přes API, spustí model
  a výsledek nahraje na nový endpoint `PUT /recordings/{id}/proposals/{model}`.
- **Uložení:** metadata do nové tabulky `proposals`, křivky jako binární soubory do MinIO
  (47 s při kroku 10 ms ≈ 5 000 hodnot, tedy jednotky kB).
- **Návrhy se nikdy nemíchají s `bounding_boxes`.** Do datasetu se dostanou až tím, že je
  anotátor přijme.

## 4. Chování v editoru

1. Panel „Návrhy“ s výběrem zdroje: *Variance (živě)*, *MixIT kanál 1–4*, *model X*.
2. Nad spektrogramem křivka a vodorovná čára prahu. Posuvník nebo tažení čáry mění navržené
   boxy, které jsou čárkované a zatím neexistují.
3. „Přijmout“ je převede na skutečné boxy jedním krokem (jedno Ctrl+Z je vrátí). Překryvy
   s existujícími boxy řeší stejná pravidla jako konflikty.
4. Přijatý box si v `extra_metadata` pamatuje zdroj (model, verze, práh).

Pozn.: tohle je první zásah do vnitřku editoru od přepisu — přibude nová vykreslovaná vrstva.
Má být čistě přidaná; kreslení, editace ani ukládání se měnit nemají.

## 5. Vedlejší přínos: měření kvality modelů

Ze značky zdroje u přijatých boxů jde spočítat, kolik návrhů anotátor přijal beze změny, kolik
posunul a kolik smazal. Z běžné práce tak vzniká evaluační sada pro článek, zadarmo.

## 6. Doporučené pořadí

1. Variance počítaná živě v prohlížeči + posuvník + přijetí návrhů (nepotřebuje backend,
   ověří UX).
2. Tabulka `proposals`, endpoint a Python balíček s kontraktem. První model = stejná variance
   (kontrola, že Python a prohlížeč dávají totéž), druhý = existující síť.
3. Statistiky přijatých a opravených návrhů po modelech.

## 7. Otevřené otázky na zadavatele

1. Co přesně vrací síť po postprocessingu: křivku pravděpodobnosti po snímcích, nebo rovnou
   úseky? Dá se dostat výstup před prahováním?
2. Kde je GPU pro dávkovou inferenci?
3. Mají návrhy fungovat jen u nenaanotovaných nahrávek, nebo i jako kontrolní vrstva přes
   hotové anotace?
