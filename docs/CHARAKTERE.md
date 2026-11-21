# Charaktere, Animation, Gesichter, Stimme und Bibliothek

Diese Anleitung beschreibt das Charaktersystem von brainIMATE. Alles läuft im Browser, auch auf dem iPad in Safari, ohne PC, Terminal oder kostenpflichtige Dienste.

## Aufbau eines Charakters

Ein Charakter ist ein **Ordner** in der Timeline mit zwei Ebenen:

| Ebene | Inhalt |
|-------|--------|
| *Name* skeleton | Das Skelett mit 23 Knochen: Hip, Spine, Chest, Neck, Head, je Seite Upper arm, Lower arm, Hand, Fingers, Index, Thumb, Upper leg, Lower leg, Foot (Figuren aus P3: 17 ohne Finger) |
| *Name* body | Die Körperteile und das Gesicht |

Jedes Körperteil ist fest (rigid) an seinen Knochen gebunden. Arme und Beine sind an den Gelenken rund, ein gebeugter Ellbogen oder ein gebeugtes Knie reißt deshalb nie auf. „L“ ist die ferne Seite hinter dem Körper, „R“ die nahe.

Da Charaktere normale Ebenen sind, funktioniert alles Bisherige mit ihnen:
- Kamera und Parallax
- Szenenübergänge
- Zwiebelhaut
- Undo
- Export

## Character Creator

Panel **Character** öffnen (im Hochformat über das Zahnrad in der Touch-Leiste), dann **New** antippen. Einstellbar sind:

- **Name, Höhe** (Anteil der Bühnenhöhe), **Build** (schlank, normal, kräftig), **Kopfgröße**
- **Haare:** kurz, lang, Dutt, keine
- **Blickrichtung:** rechts oder links (3/4-Ansicht)
- **Outline** (Linienstärke) und **Hand drawn** (wie stark die Linien wackeln)
- **Farben** für Haut, Haare, Shirt, Hose, Schuhe und Outline aus der gedämpften Comic-Palette

Zum Stil:
- Jedes Teil besteht aus einer flachen Füllung, einem kühleren, entsättigten Cel-Schatten auf der lichtabgewandten Seite und einer leicht unregelmäßigen dunklen Outline.
- Derselbe Startwert zeichnet immer dieselbe Linie.

## Körperteile bearbeiten

- **Parts** im Panel: Auge-Symbol blendet ein Teil ein oder aus, Antippen des Namens wählt es aus. Dann verschieben, skalieren, drehen und umfärben wie jede Form.
- **Colors:** färbt alle Teile in allen Keyframes um, Outlines und Gesicht eingeschlossen.
- **Duplicate:** Kopie mit allen Animationen. **Rename:** umbenennen. Papierkorb: löschen.
- Gruppieren funktioniert wie bei jeder Form, über *Modify → Group* oder *Mehr* in der Touch-Leiste.

## Skelett und Posen

- **Selektionswerkzeug:** Ein Gelenk mit Finger oder Pencil ziehen. Die Inverse Kinematik (IK) bewegt die verbundenen Knochen mit. Am Playhead entsteht ein Pose-Keyframe.
- **Arme und Beine:** Oberarm und Oberschenkel sind angepinnt (rosa Punkt). Zieht man an Hand oder Fuß, beugt sich nur der Ellbogen bzw. das Knie, der Körper bleibt gerade. Ein Zug am Kopf neigt den Oberkörper mit. Pins lassen sich im Rig-Panel lösen.
- **Alt + Ziehen** dreht einen einzelnen Knochen.
- **Hüfte ziehen** verschiebt den ganzen Charakter.

## Animationen

Unter **Move** eine Animation wählen und **Animate from frame …** antippen. Sie landet als Pose-Keyframes auf der Skelett-Ebene und lässt sich dort wie jeder Keyframe verschieben, löschen oder mit einer anderen Ease versehen.

| Animation | Einstellungen |
|-----------|---------------|
| Idle, Walk, Run, Wave | Repeat (Wiederholungen), Speed, bei Walk/Run Distance und Richtung |
| Jump | Speed, Distance, Richtung |
| Point, Sit down, Reach and grab | Hold (Sekunden), Go back (zurück zur Ausgangshaltung) |
| Turn around | Spiegelt die Figur über die Hüfte, sie schaut danach in die andere Richtung |

- **Mirror:** Der ferne Arm bzw. das ferne Bein übernimmt die Bewegung.
- **Reach and grab:** Ist ein Objekt ausgewählt, greift die Hand per IK genau danach.
- **Knochen behalten ihre Haltung:** Knochen, die eine Animation nicht bewegt, bleiben, wie sie waren. Ein Arm mit Handy bleibt beim Umdrehen oben, die Beine bleiben beim Zeigen im Sitzen gebeugt.
- **Stop here:** Die Pose am Playhead bleibt, alles danach entfällt. Das unterbricht eine Bewegung.
- **Rest pose:** Grundhaltung am Playhead, die Position bleibt.
- **Einblenden:** Gehen und Rennen werden aus der aktuellen Haltung eingeblendet. Endet eine Bewegung hinter dem Szenenende, halten alle Ebenen ihr letztes Bild.

## Gesichter und Emotionen

Unter **Face**:

- **Emotionen:** Neutral, Happy, Sad, Angry, Surprised, Scared, Confused. Der Wechsel wird über 4 Frames weich eingeblendet. Alle Gesichtsteile haben in jeder Emotion gleich viele Ankerpunkte, deshalb morphen sie flüssig.
- **Mund:** Closed, Slightly open, Wide open. Die Mundform wird mit der Emotion kombiniert.
- **Blink:** Die Augen sind 2 Frames geschlossen. **Add blinks** setzt Blinzeln alle paar Sekunden.
- **Talk:** Sprechbewegung ohne Ton für die eingestellte Dauer.

Alle Gesichtsänderungen sind Keyframes auf der Body-Ebene.

## Stimme und Lippensynchronität

Unter **Voice and lip sync**:

1. **Add a sound** wählt eine Audiodatei (MP3, M4A, WAV, …) aus der Dateien-App. Sie beginnt am Playhead. Alternativ geht der normale Import oder Ziehen auf das Fenster.
2. **Starts** (Startframe) und **Volume** einstellen.
3. **Lip sync** *Name* antippen: Die Mundbewegung folgt der Lautstärke der Stimme. Leise ergibt einen geschlossenen Mund, mittel einen leicht offenen, laut einen weit offenen. Jede Form hält mindestens 2 Frames.

Grenzen und Verhalten:
- Die Erkennung arbeitet über die Lautstärke, nicht über einzelne Laute (Phoneme). Das läuft offline, ohne externe Dienste, und ist auf dem iPad schnell.
- Die Mund-Keyframes lassen sich danach von Hand korrigieren.
- Der Ton spielt beim Abspielen mit und landet im Video.

## Gegenstände in der Hand

1. Den Gegenstand auf der Bühne antippen (z. B. ein Smartphone auf der Foreground-Ebene).
2. Playhead auf den Moment setzen, in dem die Hand ihn nimmt.
3. **Near hand takes it** oder **Far hand takes it**: Ab diesem Frame sitzt der Gegenstand in der Hand und bewegt sich mit. Vorher liegt er, wo er war.
4. **Put down** legt ihn am Playhead dort ab, wo er gerade ist.

Tipp: Erst *Reach and grab* mit ausgewähltem Gegenstand und ohne „Go back“, dann am Ende der Greifbewegung *Near hand takes it*.

## Charakterbibliothek

- **Save to library:** Speichert den Charakter mit allen Animationen und Gesichtern im Browser (IndexedDB). Erneutes Speichern aktualisiert denselben Eintrag.
- **Library-Einträge:** Vorschaubild, **Insert** (in die aktuelle Szene, auch in jedem anderen Projekt), **Rename**, **Copy**, **File**, Papierkorb.
- **File** erzeugt eine `.brainimate-character`-Datei für die Dateien-App, ein anderes Gerät oder als Sicherung. **Open file** liest sie wieder ein.
- Die Bibliothek bleibt nach einem Neustart des Browsers erhalten.

Beachten:
- Die App auf dem Home-Bildschirm hat eine **eigene** Bibliothek, getrennt von Safari. Mit der Datei überträgst du Charaktere zwischen beiden.
- Im privaten Modus speichert Safari keine Bibliothek.

## Export

Der Export (MP4/H.264 in 1080 × 1920, 24 oder 30 fps) zeichnet Charaktere, Posen, Gesichter und gehaltene Gegenstände mit demselben Renderer wie die Vorschau. Kamera, Parallax und Szenenübergänge wirken auch auf Charaktere.

Ton im Video:
- **MP4:** AAC. Hat der Browser keinen eigenen AAC-Encoder, wie Safari auf iPadOS 18, wird ein AAC-Encoder in WebAssembly nachgeladen (etwa 1,1 MB, nur beim ersten Export mit Ton).
- **WebM:** Opus, sofern der Browser es kann. Sonst gibt es einen Hinweis und das Video bleibt stumm.

## Szene aus dem Beispiel

| Schritt | Aktion |
|---------|--------|
| 1 | Neuer Charakter, **Idle** mit Repeat 3 (verlängert die Szene auf etwa 9 s) |
| 2 | Smartphone mit dem Rechteck-Werkzeug auf die Foreground-Ebene zeichnen |
| 3 | Frame 25: Smartphone auswählen, **Reach and grab** ohne Go back |
| 4 | Frame 45: **Near hand takes it** |
| 5 | Frame 50: **Surprised** |
| 6 | Frame 60: **Add a sound**, dann **Lip sync** |
| 7 | Frame 110: **Turn around**, Frame 122: **Walk** nach links, Repeat 3 |
| 8 | **Export and share** |

## Technik

| Datei | Inhalt |
|-------|--------|
| `src/lib/character/model.ts` | Generator: Skelett, Körperteile im Graphic-Novel-Stil, Gesichter und Emotionen, Umfärben |
| `src/lib/character/anim.ts` | Animationen (Wellenzyklen und Pose-zu-Pose), IK-Greifen, Talk, Lip-Sync, Blinzeln |
| `src/lib/character/pack.ts` | Packen und Entpacken mit neuen IDs (Duplizieren, Bibliothek, Datei) |
| `src/lib/character/library.ts` | IndexedDB-Bibliothek, Vorschaubilder, Datei |
| `src/lib/editor/character.ts` | Editor-Befehle |
| `src/lib/io/audio.ts` | Ton: Import, Abspielen, Lautstärke pro Frame, Mischen für den Export |
| `src/lib/ui/panels/Character.svelte` | Panel |

Datenmodell:
- Eine Pose hat zusätzlich `sx` (Spiegeln/Drehen).
- Items haben eine optionale `role`.
- Ein Ordner kann `character` tragen.
- Ein Keyframe kann `face` tragen.
- Das Dokument hat optional `audio`.

Ältere Dateien bleiben unverändert lesbar.

> Neu in P4a: Look (Frisur, Augen, Brauen, Nase optional), Finger und Hand-Posen, Gehen ohne rutschende Füße, mehrere Figuren mit Interaktionen, Bewegungs-Vorlagen und die Szenen-Bibliothek: siehe [FIGUREN-UND-SZENEN.md](FIGUREN-UND-SZENEN.md).
