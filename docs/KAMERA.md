# Kamera, Parallax und Szenenübergänge

Diese Anleitung beschreibt das Kamerasystem von brainIMATE. Alles funktioniert mit Touch und Apple Pencil auf dem iPad genauso wie mit Maus und Tastatur.

## Grundidee

Die Kamera ist eine eigene Ebene **Camera** ganz oben in der Timeline. Ihre Keyframes speichern, was das Video zeigt:

| Wert | Bedeutung |
|------|-----------|
| X, Y | Der Punkt der Bühne in der Bildmitte |
| Zoom | 100 % zeigt die ganze Bühne, 200 % die Hälfte doppelt so groß |
| Turn | Drehung in Grad |
| Handheld | Wackeln wie aus der Hand, in Pixeln des Videos |
| Walk bob | Auf und Ab der Schritte beim Gehen |
| Transition | Ein neuer Shot beginnt auf diesem Keyframe |

Zwischen zwei Keyframes bewegt sich die Kamera nur, wenn der erste Keyframe einen Tween hat (Ease). Ohne Tween hält sie bis zum nächsten Keyframe. Der Zoom wird gleichmäßig über das Verhältnis gemischt, langsame Zooms wirken deshalb ruhig.

Handheld und Walk bob werden aus der Frame-Nummer berechnet. Jeder Durchlauf (Vorschau, Export, erneuter Export) zeigt dasselbe Wackeln.

## Erste Schritte

1. Panel **Camera** öffnen (rechts oben, im Hochformat über das Zahnrad in der Touch-Leiste) und **Add a camera** antippen.
2. Playhead auf einen Frame setzen und Zoom, X oder Y ändern. Mit Auto Key entsteht dort ein Keyframe.
3. Zum vorherigen Keyframe gehen und unter **Move to the next keyframe** eine Ease wählen, zum Beispiel *Ease in and out*.
4. **Camera view** in der Touch-Leiste oder im Panel einschalten: Die Bühne zeigt jetzt genau das Video.

### Beispiel aus einer Geschichte

| Zeit | Aktion |
|------|--------|
| 0 s | Keyframe mit Zoom 100 %, die ganze Umgebung, Ease *Ease in and out* |
| 2 s | Keyframe mit Zoom 100 % (Key-Knopf), Ease *Ease in and out* |
| 4 s | Person auswählen, **Focus selection**: Die Kamera zoomt auf die Person |
| 6 s | X kleiner stellen: Die Kamera fährt nach links |
| 7 s | Gegenstand auswählen, **Focus selection** |

## Kamerawerkzeug

Das Werkzeug **Camera** (Taste `C`, Kamera-Symbol in der Werkzeugleiste, **Tool** im Panel):

- **Bearbeitungsansicht:** Rahmen ziehen verschiebt die Kamera, eine Ecke ziehen zoomt, der Knopf über dem Rahmen dreht (mit Shift in 15-Grad-Schritten).
- **Kameraansicht:** Mit dem Finger das Bild ziehen, wie eine Kamera in der Hand.
- Zwei Finger zoomen weiterhin nur die Ansicht, nie die Kamera.
- Jeder Zug ist ein Undo-Schritt. Escape bzw. ✕ während des Ziehens setzt zurück.

In der Kameraansicht sind Zeichenwerkzeuge gesperrt, weil die Ebenen dort durch Kamera und Parallax verschoben erscheinen. Zum Zeichnen die Kameraansicht ausschalten.

## Parallax

Jede Ebene und jeder Ordner hat im Abschnitt **Depth** einen Faktor:

| Faktor | Wirkung |
|--------|---------|
| 1 | Bewegt sich mit der Kamera (Standard) |
| 0,3 | Weit hinten: bewegt und zoomt sich deutlich weniger |
| 1,4 | Vordergrund: bewegt sich schneller als die Kamera |
| 0 | Bleibt fest auf dem Bildschirm, z. B. Sprechblasen, Logos, Untertitel |

Ebenen in einem Ordner übernehmen den Wert des Ordners, wenn sie keinen eigenen haben. **Comic layers** setzt für die Comic-Szenen-Ebenen: Background 0,3, Midground 0,65, Characters 1, Foreground 1,4, Speech bubbles 0.

## Kamerafahrten (Presets)

Unter **Camera moves** eine Fahrt wählen, Länge, Stärke und Ease einstellen, dann **Put down from frame …** antippen. Die Fahrt landet als normale Keyframes in der Kamera-Spur und lässt sich dort verschieben, löschen und ändern.

| Preset | Wirkung |
|--------|---------|
| First person walk | Ich-Perspektive: gleichmäßiges Vorwärtsgehen mit Schritt-Wippen, kommt am Ende zur Ruhe |
| Slow push in | Langsames Heranfahren, auf die Auswahl, wenn etwas gewählt ist |
| Cinematic zoom | Kräftiger Zoom mit starkem Ein- und Ausschwingen |
| Pan left / Pan right | Schwenk zur Seite |
| Look left and right | Blick nach links, nach rechts und zurück, mit leichter Neigung |
| Tracking shot | Folgt dem ausgewählten Objekt auf seinem Weg (Abtastung alle ¼ Sekunde) |
| Focus pull | Schneller Wechsel auf das ausgewählte Objekt |
| Handheld camera | Wackeln aus der Hand für die gewählte Dauer |

Endet die Fahrt hinter dem Ende der Szene, halten alle Ebenen ihr letztes Bild, bis die Fahrt vorbei ist.

## Szenenübergänge

Unter **New shot on this frame** wird der Keyframe am Playhead zum Beginn eines neuen Shots:

| Übergang | Ablauf |
|----------|--------|
| Cut | Harter Schnitt, die Kamera springt |
| Fade through color | Halb vor und halb nach dem Keyframe durch eine Farbe (Schwarz, Weiß, Comic Ink, Old paper). Auf Frame 1 ein Einblenden |
| Crossfade | Das letzte Bild des vorigen Shots löst sich über dem neuen auf |
| Zoom | Das letzte Bild des vorigen Shots fliegt auf den Betrachter zu und verblasst |
| Slide | Der neue Shot schiebt den alten hinaus, Richtung einstellbar |
| Camera move | Kein Schnitt: Die Kamera fliegt in der eingestellten Dauer zur neuen Position |

Die Länge wird in Frames eingestellt, daneben steht die Dauer in Sekunden. Inhalte für einen neuen Shot entstehen wie bisher mit leeren Keyframes (F7) auf den Ebenen. Die Liste **Shots** springt zu jedem Shot.

## Vorschau und Export

- Export (MP4, WebM, GIF, PNG, Sequenz, Spritesheet), Vorschaubilder und Kameraansicht zeichnen über dieselbe Funktion `renderCameraFrame`. Das Video sieht deshalb genauso aus wie die Vorschau.
- Der SVG-Export übernimmt Kamera, Parallax und Fades. Crossfade, Zoom und Slide brauchen mehrere Frames und fehlen in einem einzelnen SVG-Bild.
- Während der Wiedergabe schaltet die Bühne automatisch in die Kameraansicht.
- **Preview** im Panel: *Faster while playing on a tablet* (Standard) zeichnet die Kameraansicht beim Abspielen auf dem iPad mit halber Pixelzahl. Der Export ist immer in voller Auflösung, 1080 × 1920 bei 24 oder 30 fps.
- Der Schalter **Layer visible** (oder das Auge der Kamera-Ebene) schaltet die Kamera aus: Dann zeigt das Video die ganze Bühne wie früher.

## Technik

| Datei | Inhalt |
|-------|--------|
| `src/lib/anim/camera.ts` | Interpolation, Easing, Wackeln, Kameramatrix, Parallax, Übergänge, Presets, Bereinigung beim Laden |
| `src/lib/render/camera.ts` | `renderCameraFrame` für Export, Vorschaubilder und Kameraansicht, gehaltenes Bild für Übergänge |
| `src/lib/editor/camera.ts` | Befehle: Kamera anlegen, Werte setzen, Ease, Übergänge, Presets, Fokus, Tracking, Tiefe |
| `src/lib/tools/camera.ts` | Kamerawerkzeug |
| `src/lib/ui/panels/Camera.svelte` | Panel |

- Pro Dokument gibt es höchstens eine Kamera-Ebene, nur auf der Haupt-Timeline. Ältere Dateien ohne Kamera sehen unverändert aus.
- Beim Laden werden Kamerawerte geprüft und begrenzt: Zoom 10–2000 %, Parallax 0–4.
