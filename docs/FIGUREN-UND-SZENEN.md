# Figuren zusammen, Hände, Look und Szenen-Bibliothek (P4a)

Diese Anleitung ergänzt [CHARAKTERE.md](CHARAKTERE.md). Alles hier funktioniert auf dem iPad 7 in Safari mit Finger und Apple Pencil. Jede Aktion ist **ein** Rückgängig-Schritt und erzeugt ganz normale Keyframes, die man danach in der Timeline weiter bearbeiten kann.

## Look: Gesicht und Frisur (Panel „Character“ → „Look“)

Gilt für neue **und** bestehende Figuren, und zwar in allen Keyframes. Stimmungen, Mundbewegungen und Blinzeln bleiben dabei erhalten.

| Einstellung | Möglichkeiten |
|---|---|
| Frisur | Short, Buzz cut, Side part, Spiky, Curly, Afro, Long, Ponytail, Bun, None |
| Augen | Round, Oval, Dots, Almond, Sleepy, dazu Größe, Höhe und Abstand |
| Brauen | Normal, Thin, Thick, Arched, Straight, None |
| Nase | **Standardmäßig aus.** Ein-/ausblendbar, Form (Hook, Line, Button, Wedge), Größe, nach vorn/hinten, Höhe |
| Mund | Breite und Höhe |

- Neue Münder: Smile, Grin, Frown, O, Flat, Smirk (zusätzlich zu Closed, Slightly open, Wide open).
- Neue Stimmungen: Excited, Thinking, Embarrassed (zusätzlich zu den bisherigen sieben).
- Figuren aus P3 behalten ihre Nase, bis man sie im Look ausschaltet.

## Hände und Finger (Panel „Character“ → „Hands“)

Jede Hand hat jetzt drei Fingerknochen: **Daumen**, **Zeigefinger** und **restliche Finger** (Mittel-, Ring- und kleiner Finger zusammen). Bei der Bildgröße eines TikTok-Videos wirken fünf einzeln umrandete Finger unruhig. Deshalb sind die drei hinteren Finger zusammengefasst, das passt besser zum minimalistischen Stil.

Hand-Posen für die nahe und die ferne Hand: **Relaxed, Open hand, Closed fist, Pointing, Grabbing, Holding product**. Die Hand schließt sich über drei Frames.

- „Near hand takes it“ und „Take the product“ schließen die Finger automatisch um das Objekt. Beim Loslassen entspannt sich die Hand wieder.
- Einzelne Finger lassen sich wie jedes Gelenk mit dem Auswahlwerkzeug ziehen.
- Figuren, die vor P4 erstellt wurden, haben keine Fingerknochen. Das Panel sagt das deutlich. Für Hand-Posen muss man die Figur neu erstellen.

## Gehen, Laufen, Stehen

- **Die Füße rutschen nicht mehr.** Jedes Bein wird per Zwei-Knochen-IK berechnet: Ein Fuß bleibt am Boden fest, solange er das Gewicht trägt, und schwingt dann im Bogen nach vorn.
- Die Hüfte senkt sich, wenn beide Füße am Boden sind, und hebt sich über dem gestreckten Bein. Beim Laufen gibt es eine Flugphase. Die Arme schwingen leicht verzögert gegengleich, der Oberkörper verdreht sich minimal.
- **Stehen (Idle)** verlagert das Gewicht von einem Bein aufs andere, die Füße bleiben dabei stehen.
- Neuer Knopf **„Natural step length“**: Er stellt die Schrittlänge passend zur Figurengröße ein (Gehen 0,75 × Körpergröße pro Zyklus, Laufen 1,5 ×). Bei sehr kurzen Distanzen trippelt die Figur sichtbar, bei sehr langen streckt sie die Beine durch.
- Gehen auf der Stelle (Distanz 0) ist ein Laufband, dabei gleiten die Füße naturgemäß.

## Mehrere Figuren in einer Szene

- Mit **„New“** kommen beliebig viele Figuren dazu. Der neue Regler **„Stands at“** legt fest, wo sie stehen. Die zweite Figur steht automatisch rechts und schaut nach links.
- Jede Figur hat eigene Ebenen, eigene Animationen und ein eigenes Gesicht und bewegt sich unabhängig.
- **Cast** (ab zwei Figuren): Ein Tipp auf einen Namen wählt die Figur, öffnet ihre Ebenen in der Timeline und klappt die anderen zu. „Show all“ öffnet wieder alle.
- **Gruppieren**: Figuren mit „+“ markieren und dann „Group picked“. Die Gruppe ist ein Ordner in der Timeline. „Move … together“ verschiebt alle Figuren der Gruppe ab dem Abspielkopf um denselben Betrag.
- „Duplicate“ kopiert eine Figur samt Animationen (wie bisher).

## Interaktionen (Panel „Character“ → „Together with“)

Die gewählte Figur handelt, die andere (Auswahlfeld „Other“) dreht sich ihr zu. Alles startet am Abspielkopf.

| Knopf | Was passiert |
|---|---|
| Look at | dreht sich um, falls nötig, und neigt den Kopf zum Gesicht der anderen Figur |
| Point at | zeigt mit gestrecktem Arm und Zeigefinger auf die andere Figur |
| Wave to | dreht sich zu, lächelt und winkt mit offener Hand |
| Shake hands | geht hin, beide strecken die nahe Hand aus, greifen und schütteln dreimal |
| Hand over | geht hin, beide strecken die Arme aus, das Objekt wechselt die Hand, die zweite Figur hält es vor sich, die erste lässt den Arm sinken |
| Hug | geht hin, beide umarmen sich (einfache Seitenansicht) |

**Reaktionen** (für eine Figur): Surprised (zuckt zurück, Hände hoch, kleiner Hüpfer), Happy (Arme hoch, Hüpfer), Sad, Angry (Fäuste), Scared.

## Bewegungs-Vorlagen für Produktvideos (Panel „Character“ → „Moves for product videos“)

- **Walk into the picture**: kommt von der Seite ins Bild, die hinter ihrem Rücken liegt, und bleibt dort stehen, wo die Figur vorher stand.
- **Walk toward the camera**: geht auf der Stelle, wird dabei größer und rückt im Bild nach unten.
- **Take the product**: geht zum ausgewählten Objekt (falls es zu weit weg ist), greift es und hält es vor sich.
- **Hold it to the camera**: hebt das gehaltene Objekt neben das Gesicht und lächelt.
- **Point at the object**: zeigt auf das ausgewählte Objekt.
- **Turn around**, **Leave the picture**, **Walk there / Run there** zu einer x-Position.

**Eigene Bewegungen** („My moves“): Name und Länge eingeben, dann speichert „Save this move“ die Bewegung ab dem Abspielkopf. Sie ist nach Knochennamen gespeichert und lässt sich deshalb auf **jede** Figur anwenden, in jeder Szene und jedem Projekt. Die Figur läuft dabei von ihrem eigenen Standort aus. Die Bewegungen bleiben im Browser gespeichert (IndexedDB `brainimate-motions`).

## Szenen-Bibliothek (Panel „Scenes“, im unteren Dock neben „Library“)

**Fertige Orte**: Living room, Office, Kitchen, Shop, Street, Bedroom, Storage room. Sie sind im Comic-Stil gezeichnet: Der Raum liegt auf der Ebene *Background* (Parallaxe 0,7), die Möbel auf *Midground* (0,9). Jedes Möbelstück ist ein eigenes Objekt, das man verschieben, umfärben oder in die Hand nehmen kann. Im **Shop** sind zwölf Produkte einzeln greifbar.

- In einem leeren Projekt ersetzt der Ort die leeren Ebenen. In einem Projekt mit Inhalt kommt er **unter** alles Vorhandene.
- **„Save to the scene library“** speichert die ganze Szene: alle Ebenen, die Figuren mit Bewegungen und Gesichtern, die Objekte, die Kamera mit Einstellungen und Übergängen und die Töne. Das bleibt im Browser, bis man die Website-Daten löscht.
- **Insert** fügt eine gespeicherte Szene ins aktuelle Projekt ein. Alle IDs werden neu vergeben, eine zweite Kamera wird nicht eingefügt, wenn schon eine da ist.
- **Open** öffnet sie als neues Projekt. Bei ungespeicherten Änderungen kommt vorher eine Rückfrage.
- **File** speichert eine `.brainimate-scene`-Datei (z. B. in die Dateien-App), **Open file** liest sie wieder ein. So kommen Szenen auf andere Geräte oder vom Safari-Tab in die Home-Bildschirm-App.

## Beispiel: Zwei Personen im Laden (so getestet)

1. Neues Projekt 1080 × 1920 → Panel **Scenes** → **Shop**.
2. **Character → New** → „Mia“, Frisur Ponytail → Create. Noch einmal **New** → „Ben“, Spiky → Create (steht rechts). Bei Ben im **Look** die Nase einschalten.
3. Mia wählen, Frame 1 → **Walk into the picture**.
4. Zum letzten Frame, mit dem Auswahlwerkzeug ein Produkt im Regal antippen → **Take the product**.
5. Zum letzten Frame → **Together with** Ben → **Hand over**.
6. Ben wählen, letzter Frame → Reaktion **Surprised** → letzter Frame → **Hold it to the camera**.
7. Exportieren als MP4 (1080 × 1920, H.264, 24 fps). Im Test wurden daraus 245 Frames ohne Fehler.

## Einschränkungen in P4a und was in P4b kommt

- **Perspektiven (Vorder-, Seiten-, 3/4- und Rückansicht)** sind noch nicht enthalten. Alle Figuren sind Seitenansichten, die sich per Spiegelung umdrehen. Eigene Zeichnungen pro Ansicht mit ansichtsabhängigem Skelett sind ein größerer Umbau des Figurenmodells und kommen als **P4b**.
- Weil es nur die Seitenansicht gibt, kann „Hold it to the camera“ das Produkt nicht frontal zur Kamera drehen. Die Figur hebt es neben das Gesicht.
- Umarmen ist eine einfache Seitenansicht ohne Überlappung der Arme hinter dem Rücken.
- Eine Interaktion ersetzt die Keyframes der beteiligten Skelette im betroffenen Zeitraum. Wer vorher dort Hand-Posen gesetzt hatte, muss sie danach neu setzen.
- Eigene Bewegungen werden so abgespielt, wie sie aufgenommen wurden. Schaut die Ziel-Figur in die andere Richtung, sollte sie sich vorher mit „Turn around“ drehen.
- Szenen mit anderer Bühnengröße werden eingepasst, Linienstärken bleiben dabei gleich.
