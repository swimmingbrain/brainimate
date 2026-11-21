# Ansichten: Figuren von vorn, schräg, von der Seite und von hinten (P4b)

Neue Figuren lassen sich aus jedem Blickwinkel zeigen und flüssig drehen. Das funktioniert auf dem iPad 7 in Safari mit Finger und Apple Pencil. Die Bedienung liegt im Panel **Character** im Bereich **Views**.

## So funktioniert es

Eine Figur ist intern ein räumliches Proportionsmodell, sozusagen eine Gliederpuppe im Raum. Darin stehen die Gelenke, die Kopfmitte, die Augen, die Nase, der Mund und die Frisur, jeweils mit „vorn/hinten“, „seitlich“ und „Höhe“.

Jede Ansicht ist dieselbe Figur, nur aus einem anderen Winkel betrachtet:

| Ansicht | Winkel |
|---|---|
| Front | 90° |
| 3/4 | 50° |
| Side (Seite) | 12°, ganz leicht zur Kamera gedreht, damit beide Arme lesbar bleiben |
| Back 3/4 | −50° |
| Back (Rücken) | −90° |
| Seite, andere Richtung | 168° |

Daraus folgt:
- **Die Figur bleibt immer dieselbe.** Gesicht, Frisur, Kleidung, Farben und Proportionen kommen in jeder Ansicht aus denselben Daten.
- **Das Skelett passt sich an.** Die Knochen behalten ID und Namen, nur ihre Ruhelage folgt dem Winkel. Deshalb funktionieren Animationen, Hand-Posen, Gegenstände in der Hand, Interaktionen und eigene Bewegungen in jeder Ansicht. Auch Gelenke mit dem Finger ziehen geht.
- **Drehungen sind fließend.** Jedes Körperteil hat in jeder Ansicht dieselbe Punktzahl. Beim Drehen setzt die App etwa alle 30° einen Zwischen-Keyframe, die Teile verwandeln sich weich ineinander.
- **Die Zeichenreihenfolge stimmt in jedem Winkel.** Der nahe Arm liegt vorn, der ferne dahinter. Von hinten liegt das lange Haar über dem Rücken, das Gesicht verschwindet.
- **Gesichtsteile wandern über den Kopf.** Das ferne Auge verschwindet im Profil hinter dem Kopf. Von vorn sitzen beide Augen symmetrisch, von hinten ist kein Gesicht zu sehen.
- **Die Nase bleibt optional.** Bei neuen Figuren ist sie aus und lässt sich unter „Look“ ein- und wieder ganz ausschalten.

## Bedienung (Character → Views)

- **Vorschauleiste:** fünf Bilder der Figur (Front, 3/4, Side, Back 3/4, Back). Antippen dreht die Figur ab dem Abspielkopf in diese Ansicht.
- **Turn in:** wie viele Frames eine Drehung dauert. 0 bedeutet harter Schnitt.
- **To the camera / Away / Turn around:** zur Kamera drehen, von ihr wegdrehen, auf die andere Seite drehen (über die Vorderansicht).
- **Look at camera:** Nur der Kopf dreht sich zur Kamera, so weit ein Hals es erlaubt (±110°).
- **Over the shoulder:** Die Figur dreht der Kamera den Rücken zu und schaut seitlich über die Schulter zurück.
- **Head forward:** Der Kopf schaut wieder in Körperrichtung.
- **Head turn:** Regler, der nur den Kopf am Abspielkopf dreht.
- Beim Anlegen einer Figur legt **„Seen from“** die Startansicht fest.

## Turnaround-Editor („Open the turnaround editor“)

**Für alle Seiten gleich:**
- Körperbau und Kopfgröße. Das Skelett wird mit denselben Knochen neu gesetzt, Bewegungen bleiben erhalten.
- Ärmel: kurz oder lang.
- Brille: keine, rund oder eckig.
- Kopfbedeckung: keine, Kappe (der Schirm zeigt dorthin, wohin die Figur schaut) oder Mütze.
- Frisur, Augen, Brauen, Nase und Mund wie bisher unter „Look“.

**Nur für die gewählte Ansicht:**
- Verfügbar sind Kopfgröße, Körperbreite, Frisur (seitlich, Höhe, Größe), Augen, Nase und Mund (seitlich und in der Höhe).
- Die gewählte Ansicht ist in der Vorschauleiste umrandet.
- Die Bereiche sind bewusst klein gehalten, damit die Figur wiedererkennbar bleibt.
- Zwischen zwei Ansichten wird weich überblendet, eine Drehung verändert die Anpassung also allmählich.
- „Reset this view“ setzt die Ansicht zurück.

## Animationen in den Ansichten

- **Gehen und Laufen:**
  - Seite und 3/4: der Gang mit festen Füßen aus P4a. Auch zur anderen Seite gedreht (168°) läuft alles gespiegelt richtig.
  - Front und Rücken: die Beine heben sich abwechselnd, die Hüfte schwingt über das Standbein und federt, die Arme schwingen leicht.
- **Walk toward the camera:** dreht zur Kamera und geht auf sie zu. Die Figur wird größer und rückt nach unten. Diese Größe bleibt danach erhalten, auch beim Weitergehen.
- **Walk away from the camera:** dreht den Rücken zu, wird kleiner und rückt nach oben.
- **Stehen und Sprechen:** Gewichtsverlagerung, Stimmungen, Lippensynchronität und Blinzeln funktionieren in jeder Ansicht. Das Gesicht wird im Winkel des jeweiligen Keyframes gezeichnet.
- **Zeigen und Winken** funktionieren in jeder Ansicht. Von vorn hebt sich der Arm seitlich.
- **Interaktionen** (Händeschütteln, Übergeben, Umarmen, Hinlaufen): Eine Figur, die frontal oder von hinten zu sehen ist, dreht sich zuerst in die Seitenansicht zum Partner.
- **Ältere Figuren** (P3/P4a) funktionieren unverändert. **„Make turnable“** macht sie drehbar:
  - Ihre Bewegungen bleiben erhalten.
  - Fehlende Fingerknochen werden ergänzt.
  - Der Körper wird aus Größe, Kopf, Frisur, Farben und Gesicht neu gezeichnet. Von Hand veränderte Körperteile werden dabei durch die Modellzeichnung ersetzt.

## Speichern

Alle Ansichtsdaten werden mitgespeichert und beim Öffnen vollständig wiederhergestellt:
- Projektdatei `.brainimate`
- Figurenbibliothek und `.brainimate-character`-Dateien
- Szenen-Bibliothek und `.brainimate-scene`-Dateien
- Duplizieren

Beim Einfügen in eine Bühne anderer Größe wird alles mit eingepasst.

## Einschränkungen

- „Sitzen“ und „Springen“ sind für Seite und 3/4 gedacht; von vorn sehen sie nur angedeutet aus.
- Seitwärts über den Bildschirm laufen in Front- oder Rückansicht ist ein Seitschritt, dabei gleiten die Füße leicht. Zum Durchqueren des Bildes dreht man die Figur besser zur Seite. Hinlaufen-Befehle tun das automatisch.
- Bei einer Drehung werden die Körperteile im Winkel jedes Keyframes neu gezeichnet. Von Hand an Körperteilen geänderte Formen werden in diesen Keyframes durch die Modellzeichnung ersetzt. Farben, Frisur und Gesicht stellt man deshalb über „Look“ und den Turnaround-Editor ein.
- Eine Animation über einen Zeitraum ersetzt dort die Skelett-Keyframes. Drehungen liegen dagegen auf der Körperebene und bleiben erhalten.
