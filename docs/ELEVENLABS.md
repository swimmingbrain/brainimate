# Vertonung mit ElevenLabs (P7)

brainIMATE bereitet das Skript für die Vertonung vor. Die Stimmen erzeugst du selbst auf der
ElevenLabs-Webseite, danach holst du die Dateien zurück ins Projekt. Es gibt **keine API, keinen
Schlüssel, keinen Server und keine Kosten** in brainIMATE. Alles läuft im Studio, Reiter **Voice-over**.

## Was der kostenlose ElevenLabs-Plan bietet

Stand: 21.11.2026, von elevenlabs.io/pricing und der ElevenLabs-Doku abgelesen. Prüfe es vor dem Start
selbst, Preise und Pläne ändern sich.

- **Free: 0 $, 10.000 Credits im Monat.** Sprache kostet etwa 1 Credit pro Zeichen. Ein 60-s-Video hat
  rund 1.000 Zeichen, du kommst also auf grob 10 Videos im Monat. Jede neue Generierung kostet erneut,
  bis zu 2 Neu-Generierungen desselben Texts sind gratis.
- **Keine kommerzielle Nutzung im Free-Plan.** „Commercial usage rights are only available with paid
  plans.“ Die Testvideos sind also zum Testen da, nicht zum Monetarisieren.
- Voice Design (eine Stimme aus einer Beschreibung erzeugen) steht in der Liste des Free-Plans. Stimmen
  klonen gibt es erst ab Starter.
- Downloads im Free-Plan: MP3 mit 128 kbps und 44,1 kHz. Das reicht für TikTok.
- Ungenutzte Credits verfallen im Free-Plan am Monatsende.

## Emotionen (Audio-Tags)

brainIMATE setzt die gewählte Emotion als Tag vor den Text, z. B. `[excited] Hallo Lina!`.

- Laut ElevenLabs-Doku funktionieren Audio-Tags mit **Eleven v3 und Eleven v4**. Ältere Modelle wie
  Multilingual v2 lesen eckige Klammern nicht als Anweisung.
- In den Beispielen der Doku stehen unter anderem: `[whispers]`, `[laughs]`, `[sighs]`, `[sarcastic]`,
  `[curious]`, `[excited]`, `[crying]`, `[mischievously]`, `[shouting]`.
- `[angry]`, `[calm]`, `[nervous]` sind in brainIMATE mit „test it“ markiert. Sie stehen nicht in den
  Beispielen, das Modell kann sie befolgen, muss aber nicht.
- Pausen: v3 und v4 kennen **kein** `<break>`. Nutze Auslassungspunkte (…), Gedankenstriche oder einen
  neuen Satz. Ein GROSS geschriebenes Wort wird betont.
- **Noch nicht geprüft:** Welche Modelle der Free-Plan im Webformular anbietet und ob die Tags auf
  Deutsch gut wirken, konnte ich ohne ElevenLabs-Konto nicht testen. Prüfe es in der Modellauswahl:
  Ist v3 oder v4 da, nimm es. Teste dann einen Satz mit und ohne Tag.

## Die drei festen Stimmen

| Figur | Beschreibung für Voice Design (in brainIMATE kopierbar) |
|---|---|
| Erzähler | Male German narrator, mid 40s, warm, slightly deep and a little raspy, calm and professional |
| Tom | Young German man, mid 20s, natural and relaxed, casual, slightly deep voice |
| Lina | Young German woman, mid 20s, friendly, lively and very expressive |

So bleiben die Stimmen gleich:

1. Erzeuge jede Stimme **einmal** (Voice Design oder eine passende Stimme aus der Voice Library) und
   speichere sie in deinen Stimmen. Nimm danach immer genau diese.
2. Trage den Namen der Stimme in brainIMATE unter **Voice-over** beim Sprecher ein, damit du ihn in
   jedem Video siehst. Bei Figuren wird er an der Figur gespeichert und reist mit ihr aus der Bibliothek
   ins nächste Projekt.
3. Bleib bei **demselben Modell und denselben Einstellungen** (Stabilität, Tempo). Ein Modellwechsel
   verändert den Klang.

## Der Ablauf in brainIMATE

1. **Skript:** Studio → Script. Jede Zeile hat einen Sprecher (Erzähler, Tom, Lina).
2. **Voice-over:** Jede Zeile bekommt automatisch eine feste Nummer (Z01, Z02, …). Die Nummer bleibt
   gleich, auch wenn du Zeilen verschiebst oder neue einfügst.
3. Die Zeilen sind **nach Sprecher getrennt**. Oben kannst du auf einen Sprecher filtern.
4. Pro Zeile wählst du eine **Emotion**. Mit **Copy** kopierst du Tag und Text, mit **Copy all lines**
   alle Zeilen eines Sprechers als Liste zum Durchgehen.
5. In ElevenLabs einfügen, die richtige Stimme wählen, generieren, herunterladen.
6. Zurück in brainIMATE gibt es zwei Wege:
   - **Pro Zeile** (am iPad am einfachsten): **Import** an der Zeile tippen und die Datei wählen. Der
     Dateiname ist egal.
   - **Viele auf einmal:** Speichere die Dateien unter dem angezeigten Namen (z. B. `Z03_Tom.mp3`). Dann
     **Import recordings** tippen und alle markieren. Die Nummer im Namen findet die Zeile. Dateien ohne
     erkennbare Nummer stehen unter „Files without a line“ und lassen sich per Auswahl zuordnen.
7. Mit „Build the timeline after importing“ (Standard: an) werden die Szenen bei Bedarf so verlängert,
   dass die Aufnahmen hineinpassen. Danach wird die Timeline neu gebaut: Jede Aufnahme beginnt genau mit
   ihrem Untertitel, und die Untertitel dauern so lang wie die Aufnahme.
8. **Neu generieren:** Ist eine Zeile nicht gut, gibt es an ihr **Replace**. Die alte Aufnahme
   verschwindet samt Datei aus dem Projekt. ✕ entfernt eine Aufnahme ganz.

Erkannte Namen sind zum Beispiel `Z03_Tom.mp3`, `z3 tom.wav`, `03-Tom.m4a` und
`ElevenLabs_…_Z12_Lina (1).mp3`.

## Die drei Testvideos

Alle drei starten mit Tom und Lina (aus der Bibliothek als Hauptfigur 1/2, sonst werden sie angelegt),
mit nummerierten Zeilen, Emotionen, Kamerafahrten und Bewegungen:

| Video | Format → Vorlage | Inhalt |
|---|---|---|
| A – Wissen | Knowledge → *ElevenLabs test A: three hearts* | Drei Herzen, blaues Blut, mitdenkende Arme – Lina, Tom und Erzähler |
| B – Comedy | Comedy → *ElevenLabs test B: the fridge says no* | Toms Kühlschrank verweigert ihm den Käse |
| C – Storytelling | Thrilling short stories → *ElevenLabs test C: the voice message* | Lina bekommt eine Sprachnachricht von sich selbst, mit Ego-Perspektive |

Bei Video A sind die Fakten-Zeilen als „Fact“ markiert. Trag unter **Sources** deine Quelle ein, sonst
warnt die Prüfung im Reiter Videos.

## Schritt für Schritt auf dem iPad

**Einmalig (ca. 20 Minuten):**

1. Safari: elevenlabs.io öffnen, kostenloses Konto anlegen. Keine Zahlungsdaten eingeben, kein
   Abo abschließen.
2. In brainIMATE ein Testvideo starten (siehe unten), Reiter **Voice-over** öffnen, beim Erzähler auf
   **Copy description** tippen.
3. In ElevenLabs unter Voices eine Stimme mit dieser Beschreibung entwerfen (Voice Design), probehören
   und speichern, z. B. als „bI Erzähler“. Dasselbe für Tom und Lina.
4. Die drei Stimmennamen in brainIMATE beim jeweiligen Sprecher eintragen.

**Pro Video:**

1. Studio → Videos → Format wählen → Vorlage *ElevenLabs test A/B/C* → 60 s → 30 fps → **Start this
   video**.
2. Script: Texte nach Wunsch anpassen.
3. Voice-over: Emotionen prüfen. Am besten zwei Fenster nebeneinander (Split View): links brainIMATE,
   rechts ElevenLabs.
4. Für jede Zeile: **Copy** → in ElevenLabs einfügen → Stimme wählen → generieren → anhören →
   herunterladen.
5. In brainIMATE an der Zeile **Import** tippen → in der Dateien-App unter „Downloads“ die neue Datei
   wählen. Die Zeile wird ✓ grün, die Timeline wird gebaut.
6. Gefällt eine Zeile nicht: in ElevenLabs neu generieren, dann in brainIMATE **Replace**.
7. Bei Video C: Sound → Musik **Tense** und Effekt **Whoosh** an der passenden Stelle (Abspielkopf
   setzen, dann Effekt tippen). Bei Video B ein **Pop** für den Witz.
8. Abspielen und prüfen: Passen Mund, Untertitel und Sprache zusammen?
9. Videos → **Keep in My videos** → Export → MP4.

## Getestet

Ohne ElevenLabs-Konto im Browser durchgespielt, mit echten deutschen Sprachdateien eines lokalen
Ersatz-Generators unter den von brainIMATE vorgeschlagenen Namen:

- A, B und C: Kopieren einer Zeile und aller Zeilen eines Sprechers über die Zwischenablage
- 9, 9 und 7 Dateien auf einmal importiert und automatisch zugeordnet
- eine Datei ohne Nummer von Hand zugeordnet, eine Zeile per Replace ersetzt
- danach genau so viele Clips wie Zeilen, keine Reste
- Timeline gebaut, gespeichert, als MP4 exportiert (1080×1920, 30 fps, H.264 und AAC, ca. 60 s),
  wieder geöffnet: alle Zuordnungen da

Maschinelle Zeiten (ohne deine Arbeit in ElevenLabs): Video anlegen ca. 50 s, Import mit Zuordnung ca.
15 s, Export ca. 30 s.

Nicht getestet: die ElevenLabs-Webseite selbst (Klang, Tags auf Deutsch, Download-Namen) und das
Ganze auf einem echten iPad.

## Grenzen

- Der Free-Plan erlaubt keine kommerzielle Nutzung; für monetarisierte Videos braucht es einen
  bezahlten Plan.
- Aufnahmen kommen ohne Zeitmarken pro Wort. Die Untertitel teilen die Länge einer Aufnahme nach
  Wortanzahl auf, die Mundbewegung folgt dem Text.
- Mehrfach-Import braucht die Nummer im Dateinamen. Am iPad ist Umbenennen in der Dateien-App
  umständlich, dafür gibt es den Import pro Zeile.
- Eine spätere API-Anbindung wäre möglich (die Stimme pro Figur ist schon gespeichert, Aufnahmen laufen
  über dieselbe Zuordnung), braucht aber einen kleinen Server für den geheimen Schlüssel und ist nicht
  Teil von P7.
