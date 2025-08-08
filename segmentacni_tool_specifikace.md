# Požadavky na nástroj pro segmentaci a anotaci ptačího zpěvu

## Zobrazení dat

- [ ] Zobrazení **spektrogramu** (STFT) jako obrázku
- [ ] Zobrazení **waveformu** audia pod spektrogramem
- [ ] Možnost **synchronizovaného zoomování** a posouvání mezi spektrogramem a waveformem
- [ ] Zobrazení **časových měřítek** (v ms) a **frekvenčních měřítek** (v kHz)
- [ ] Barevné rozlišení bounding boxů (asi podle labelů) 
- [ ] Nad spectrogramem zobrazit název souboru (aby viděli, co je to za ptáka)

---

## 🖱️ Manuální anotace segmentů

- [ ] Možnost **kreslit obdélníky** (bounding boxy) přímo na spektrogramu  
      → Obdélníky zahrnují **časové i frekvenční rozměry**
- [ ] Každý segment (obdélník) je **viditelně propojen** s waveformem
      → Na waveformu se zobrazí pouze **časová projekce** obdélníku
- [ ] Možnost **pohybovat obdélníky** – při posunu v čase se odpovídající indikátor na waveformu také posune

---

## Anotace motivů

- [ ] Aktivní obdélník lze **označit stiskem klávesy** `A–Z`  
      → Label (např. `A`, `B`, ...) se zobrazí **přímo nad obdélníkem**
- [ ] Každý label je jednoznačně svázaný s konkrétním segmentem
- [ ] Při výběru segmentu lze **rychle přepsat label**

---

## Navigace a informace

- [ ] Při výběru nebo označování segmentu se zobrazí vlevo nad spektrogramem:  
      → **Délka segmentu v ms** (aby vědci viděli, že segment a nebo nějaký jejich výběr má třeba 10ms)
- [ ] Možnost **klikem přehrát segment** (ze spektrogramu nebo waveformu)
- [ ] Klávesová navigace: posun mezi segmenty, undo/redo, krok zpět

---

## Export a ukládání

- [ ] Export čehokoliv, co bude nejjednodušší s časem začátku, konce, frekvenčním rozsahem a labely

---

## Uživatelská správa a prostředí

- [ ] **Výběr anotátora při spuštění nástroje**  
      → Na úvodní obrazovce ("landing page") se zobrazí **dropdown menu se jmény anotátorů**  
      → Bez přihlašování (žádné jméno/heslo)
- [ ] **Automatické přiřazení úloh anotátorům**  
      → Každý anotátor má svou **sadu souborů k anotaci** (spektrogramy + audia)  
      → Anotace obsahuje pole `annotated_by: <jméno anotátora>`
---

## 🌱 Plánované rozšíření

- [ ] **Kopírování více segmentů najednou**  
      → Označit více segmentů, kopírovat je i s labely a pozicí
- [ ] Skupinové označování segmentů
      → Když si například s Ctr vyberu 4 segmenty a zmáčknu písmeno nebo někde do inputu napíšu "A", tak se všem přiřadí label A
- [ ] Auto-save změn + možnost ručního ukládání (jen pro pohodlí)??