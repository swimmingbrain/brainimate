# Filmisches Erzählen (P6)

Diese Phase macht aus dem Storyboard einen kleinen Filmschnitt: Ego-Perspektive, Kamera-Vorlagen,
Filmsprache, neue Bewegungen der Figuren, Sprechtempo mit empfohlener Szenendauer und Aufnahmen, die
an Skriptzeilen hängen. Alles läuft im Browser auf dem iPad, ohne externe Dienste.

Alles hier ist Teil des bestehenden Studios (Dock → **Studio**). Das Storyboard baut wie bisher die
Zeitleiste; was es baut, ist markiert und wird beim nächsten **Build the timeline** ersetzt. Was du
selbst von Hand animiert hast, bleibt stehen.

## Ego-Perspektive (First Person)

Die Kamera sitzt in den Augen einer Figur. Die Figur selbst ist in dieser Szene ausgeblendet, nur ihre
Arme und Hände kommen von unten ins Bild – in der Hautfarbe und der Shirtfarbe der Figur.

So geht's:

1. Storyboard → Szene antippen (▸) → **Camera** auf eine der First-Person-Vorlagen stellen:
   - **First Person Walk** – gehen, der Blick wippt, die Welt kommt näher
   - **First Person Run** – laufen, Arme pumpen, der Blick wackelt
   - **First Person Look Around** – stehen und nach links und rechts schauen
   - **First Person Interaction** – die Hände tun etwas
2. Im Kasten **First person** einstellen:
   - **Whose eyes** – durch wessen Augen (Tom, Lina, …)
   - **Looks** – geradeaus, umschauen, links, rechts, oben, unten
   - **Hands** – was die Hände tun:
     - *Pick up an object*: der Blick geht nach unten, die Hand greift, das Objekt verschwindet vom
       Boden und liegt in der Hand (Objekt wählbar: Schlüssel, Handy, Tasse, Buch, Box …)
     - *Open a door*: eine Tür steht vor einem, die Hand drückt, die Tür schwingt auf, die Kamera geht
       hindurch
     - *Look at the phone*: beide Hände halten ein Handy, der Blick senkt sich
     - *Drive (steering wheel)*: Lenkrad unten im Bild, die Hände lenken, leichtes Ruckeln
     - *Fight (fists)*: Deckung und Schläge, die Kamera bebt
     - *Reach out*, *Wave*
   - **When in the scene** – wann die Handlung passiert (Anteil der Szene)
   - **Show hands** – Hände an oder aus
3. **Build the timeline**.

Was dabei auf der Zeitleiste entsteht:

- Kamera-Keyframes in Augenhöhe der Figur (Zoom, Blickrichtung, Wippen/Wackeln)
- die Ebene **POV hands**: bleibt fest auf dem Bildschirm (Parallaxe 0), die Hände haben in jeder Pose
  dieselben Teile, darum gehen die Bewegungen weich ineinander über
- die Ebene **POV props**: das Objekt am Boden, die Tür
- die Figur ist in der Szene ausgeblendet, andere Figuren bleiben sichtbar (man „sieht“ sie)

Beispiele für typische Szenen: durch die Stadt gehen (Walk + Street), Tür öffnen (Interaction + Door),
Objekt aufheben (Interaction + Pick up), Auto fahren (Interaction + Drive), aufs Handy schauen
(Interaction + Phone), kämpfen/rennen (Run oder Interaction + Fight), eine andere Figur sehen
(Look Around, die andere Figur steht in der Szene), sich umsehen (Look Around).

## Perspektivwechsel und Kamera-Vorlagen

Jede Szene hat ihre eigene Kamera. Ein Wechsel von außen in die Ego-Perspektive und zurück ist einfach
ein Wechsel der Vorlage von Szene zu Szene (siehe Testprojekt B).

| Vorlage | Wirkung |
| --- | --- |
| First Person Walk / Run / Look Around / Interaction | durch die Augen einer Figur |
| Over the Shoulder | hinter einer Figur (Subject) auf die andere (Partner) |
| Close Up | nah am Gesicht des Subjects |
| Dramatic Close Up | leicht gekippt, langsam näher |
| Tracking Shot | folgt dem Subject seitlich |
| Pan to Character | fährt von der leeren Seite zur neuen Figur |
| Wide Shot | der ganze Ort |
| Low Angle / High Angle | von unten (Figur wirkt groß) / von oben (wirkt klein) |
| Cinematic Push In | langsam näher, auf etwas Wichtiges |
| Handheld Camera | leicht unruhig |
| Whip Pan | schneller Schwenk auf das Subject |
| Scare Zoom | Ruck aufs Gesicht mit Beben |
| Still, Push in (light), Pull out, Pan, Shake | die einfachen Bewegungen aus P5 |

**Camera on** (Subject) legt fest, um wen es geht; bei Over the Shoulder zusätzlich **Looking at**.
Die Kamera bleibt immer über der gezeichneten Bühne, damit kein leerer Rand ins Bild kommt.

## Filmsprache

Unter **Film language** setzt ein Tipp Kamera, Übergang und Tempo einer Szene auf einmal. Alles bleibt
danach einzeln änderbar.

- **Action** – harter Schnitt, Handkamera
- **Emotion** – langsamer Crossfade (länger als normal), langsame Fahrt aufs Gesicht
- **Important object** – Push In
- **Surprise** – Schnitt in die Ego-Perspektive
- **New character** – Schwenk zur neuen Figur
- **Pause** – kurzer Schwarzblitz (*Short dip to black*)
- **Slow motion** – Bewegungen in halber Geschwindigkeit, langsame Fahrt
- **Scare** – schneller Kamera-Ruck
- **Dramatic close-up** – gekippte, langsame Nahaufnahme

Übergänge: Cut, Short dip to black, Fade through color, Crossfade, Zoom, Slide.

## Bewegungen der Figuren

Unter **Moves** bekommt eine Szene Bewegungen: wer, welche, ab wann (Anteil der Szene). Neu dazu
gekommen sind (auch im Character-Panel unter Animate):

Stand up, Fall (and get up), Dodge, Explain with the hands, Look around, Nod, Shrug, Startled step
back, Talk (small gestures) – zusätzlich zu Idle, Walk, Run, Jump, Wave, Point, Sit down, Turn
around, Reach and grab.

- Gehen und Laufen dauern bis zum Szenenende, aber nur so weit, wie auf der Bühne Platz ist.
- Zeigen, Greifen und Fallen kehren von selbst in die Ruhehaltung zurück, Hinsetzen bleibt sitzen.
- **Slow motion** an einer Szene spielt ihre Bewegungen in halber Geschwindigkeit.
- Alle Bewegungen starten aus der Haltung, die die Figur gerade hat, und enden mit einem Ease –
  keine Sprünge.

**Characters gesture while talking** (unter Speaking pace) lässt Figuren, die in einer Szene sprechen
und keine eigene Bewegung haben, mit kleinen Gesten reden. Der Mund bewegt sich bei jeder Dialogzeile
einer Figur automatisch (sechs Mundformen pro Sekunde, damit die Datei auf dem iPad leicht bleibt).

## Sprechtempo und Szenendauer

Storyboard → **Speaking pace and scene lengths**:

- **Words per second** (Standard 2,5), **Pause after a line**, **Room for reactions**
- für 60, 90 und 120 s: passt / wie viele Wörter frei / wie viele zu viel
- jede Szenenkarte zeigt ihre Dauer; ist sie kürzer als ihr Text, wird sie markiert (⚠)
- in der geöffneten Karte: geschätzte Sprechzeit, empfohlene Dauer und **Use … s**
- **Lengthen scenes that are too short** verlängert nur zu kurze Szenen, **All scenes to the
  recommended length** setzt alle auf die Empfehlung

Die Empfehlung ist Sprechzeit + Reaktionszeit + Zeit für Kamerafahrten, Ego-Handlungen und
Bewegungen. **Der Text wird nie verändert** – es sind nur Vorschläge, du entscheidest. Die Prüfungen
im Reiter Videos warnen zusätzlich, wenn Szenen kürzer als ihr Text sind oder der Text allein länger
als die Ziel-Länge ist.

Hängt an einer Zeile eine Aufnahme, zählt deren echte Länge statt der Schätzung.

## Stimmen und Audio (Vorbereitung für KI-Stimmen)

- **Stimme pro Sprecher** (Sound → Voices): Tonhöhe, Tempo, Lautheit, Stil (z. B. „warm, ruhig“),
  Stimmen-ID für einen späteren Generator. Für Figuren wird die Stimme an der Figur gespeichert und
  kommt mit ihr aus der Bibliothek ins nächste Projekt – auch bei gesperrtem Look.
- **Aufnahme einer Zeile**: Script → 🎙 an der Zeile wählt eine Datei und verknüpft sie, oder im
  Feld **Recording of the line** eine schon importierte Aufnahme wählen. Beim Bauen startet die
  Aufnahme genau dort, wo die Zeile beginnt, und die Untertitel dauern so lang wie die Aufnahme.
- **Scene of the line** legt fest, in welcher Szene eine Zeile gesprochen wird.
- **Pausen** zwischen Sätzen: *Pause after a line*.
- **Genaue Platzierung** von Musik und Effekten (Sound → Sounds of this video): −½ s, −1 Frame,
  +1 Frame, +½ s, *To playhead*, *Move to the start of…* einer Szene, Lautstärke, Tempo.
- Es ist **keine kostenpflichtige API** eingebaut; Generator-IDs werden nur gespeichert.

## Storyboard als kleiner Filmschnitt

Jede Szenenkarte zeigt auf einen Blick: Ort, Figuren, Kamera (bei Ego-Perspektive wessen Augen und
die Handlung), Bewegungen, Handlung, Dialog/Erzähler, Geräusche und Untertitel, Übergang/Zeitlupe/
Filmsprache und die Dauer – nach dem Bauen mit einem kleinen Vorschaubild aus der Szenenmitte. Ein
Tipp öffnet die Karte zum Bearbeiten, die Nummer springt zur Szene auf der Zeitleiste.

## Vorschau = Export

Ego-Perspektive, Kamerawechsel, Bewegungen, Hände, Objekte, Untertitel, Übergänge und Audio liegen als
normale Keyframes, Ebenen und Clips im Projekt. Vorschau, Vorschaubilder und MP4-Export zeichnen über
dieselbe Funktion. Export unverändert: 1080 × 1920, 24 oder 30 fps, MP4 (H.264) mit AAC-Ton,
eingebrannte Untertitel.

## Die drei Testprojekte

Studio → Videos → Format **D Thrilling short stories** → Vorlage wählen → **Start this video**. Gibt
es keine Hauptfiguren in der Bibliothek, werden **Tom** und **Lina** angelegt; sonst spielen
Hauptfigur 1 und 2.

- **Test A: first person walk** – durch die Stadt gehen, umschauen, Schlüssel aufheben, Tür öffnen
- **Test B: perspective switch** – von außen (Wide, Tracking) → durch die Augen → zurück (Close-up
  mit erschrockenem Schritt zurück)
- **Test C: cinematic dialogue** – Schwenk zu Lina, Over the Shoulder hin und her, Gesten, Nicken,
  Schulterzucken, Push In, dramatische Nahaufnahme mit Schwarzblitz

Danach: Storyboard → **Build the timeline** → abspielen → Videos → **Keep in My videos** → Export
(MP4) → später unter My videos **Open**.

## Auf dem iPad testen

1. Studio → Videos → D → *Test A* → 60 s → Start.
2. Storyboard → Speaking pace öffnen → *Lengthen scenes that are too short* → **Build the timeline**.
3. Play drücken: Hände unten im Bild, Blick schaut sich um, Schlüssel werden aufgehoben, Tür geht auf.
4. Eine Karte öffnen, Hands auf *Drive* stellen, neu bauen, ansehen.
5. Sound → *Whoosh* → *Move to the start of… Scene 3* → Feinjustierung mit ±1.
6. Videos → Keep → Export als MP4 → in Fotos/Dateien ansehen.
7. Mit Test B und Test C wiederholen.

## Grenzen

- Die Ego-Perspektive ist 2D: Die Kamera sitzt am Kopf der Figur und schaut in die gezeichnete Szene;
  „Vorwärtsgehen“ wird mit Zoom, Wippen und Parallaxe angedeutet, nicht mit echter Raumtiefe.
- Hände sind eine stilisierte, eigene Zeichnung (keine Finger-Rigs) und sitzen auf einer
  Bildschirm-Ebene; zum Nachbearbeiten liegen sie als normale Keyframes auf **POV hands**.
- Spricht die Ego-Figur, hört man sie, ihr Mund ist nicht zu sehen.
- Gehen in Szenen ist auf die Bühne begrenzt; längere Wege brauchen mehrere Szenen oder eine
  Verfolgungskamera.
- Die Mundbewegung folgt dem Text (Muster), nicht dem Klang einer Aufnahme; genaues Lippensynchron
  aus dem Ton gibt es wie bisher im Character-Panel (Animate → Voice).
- Das Tempo einer Aufnahme (0,8–1,25×) verändert auch ihre Tonhöhe leicht.
- Bewegungen mit der Bühne (Moves) überschreiben beim Bauen Keyframes des Rigs, die du im selben
  Zeitraum von Hand gesetzt hast.
- Die Empfehlungen zur Szenendauer sind Schätzungen aus Wortzahl und Tempo.
