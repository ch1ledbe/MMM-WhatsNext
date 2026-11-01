# MMM-WhatsNext

Ein [MagicMirror²](https://magicmirror.builders/)-Modul, das anstehende Ereignisse mit Countdown anzeigt – Geburtstage, Ferien, Termine, Jubiläen. Die Ereignisse werden bequem über eine **Weboberfläche** (z. B. vom Handy aus) verwaltet, ganz ohne `config.js` anzufassen.

**Sprachen:** Deutsch, Englisch, Französisch, Italienisch (Spiegel und Weboberfläche).

![Anzeige auf dem Spiegel](images/screenshot.png)

![Weboberfläche](images/web-config.png)

## Funktionen

- Liste der nächsten Ereignisse mit Symbol, Farbe, Datum und Countdown
- Drei Countdown-Formate: automatisch (`morgen`, `in 3 Tagen`, `in 2 Std. 15 Min.`), nur Tage (große Zahl), detailliert (`2 T 04:15:09`)
- Ganztägige und zeitgebundene Ereignisse; „Jetzt“-Anzeige während eines laufenden Termins
- Wiederholung: wöchentlich, monatlich, jährlich (inkl. 29. Februar / 31. des Monats)
- Optional Anzahl Jahre anzeigen (z. B. „Anna wird 40“)
- Ereignisse ausblenden, ohne sie zu löschen
- Weboberfläche unter `http://<spiegel>:8080/whatsnext`, Änderungen erscheinen sofort auf dem Spiegel
- Optionaler Zugriffsschutz per Token

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/ch1ledbe/MMM-WhatsNext
```

Das Modul hat keine Laufzeit-Abhängigkeiten, ein `npm install` ist nicht nötig.

## Update

```bash
cd ~/MagicMirror/modules/MMM-WhatsNext
git pull
```

Danach den MagicMirror neu starten. Gespeicherte Ereignisse in `data/` bleiben erhalten. Änderungen stehen im [CHANGELOG](CHANGELOG.md).

## Konfiguration

In `~/MagicMirror/config/config.js`:

```js
{
	module: "MMM-WhatsNext",
	position: "top_left",
	header: "Was steht an?",
	config: {
		maxEvents: 5,
		countdownFormat: "auto",
		apiToken: "mein-geheimer-schluessel" // optional
	}
},
```

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `maxEvents` | `5` | Maximale Anzahl angezeigter Ereignisse (`0` = alle) |
| `maxDaysAhead` | `0` | Nur Ereignisse der nächsten _n_ Tage (`0` = alle) |
| `countdownFormat` | `"auto"` | `"auto"`, `"days"` oder `"detailed"` |
| `showDate` | `true` | Datum unter dem Titel anzeigen |
| `showIcons` | `true` | Symbole anzeigen |
| `highlightNext` | `true` | Nächstes Ereignis größer darstellen |
| `showSeconds` | `false` | Sekunden im Format `"detailed"` |
| `nowWindowMinutes` | `60` | Wie lange ein Termin nach Beginn als „Jetzt“ angezeigt wird |
| `defaultIcon` | `"calendar-day"` | Symbol für Ereignisse ohne eigenes Symbol |
| `apiToken` | `""` | Wenn gesetzt, verlangt die Weboberfläche diesen Schlüssel |
| `events` | `[]` | Startereignisse – werden nur übernommen, solange noch nichts über die Weboberfläche gespeichert wurde |

Die Anzeigeoptionen (`maxEvents` bis `nowWindowMinutes`) lassen sich auch in der Weboberfläche ändern; dort gespeicherte Werte haben Vorrang vor der `config.js`.

Die Anzeigesprache folgt der `language`-Einstellung des MagicMirrors. Die Sprache der Weboberfläche lässt sich oben rechts umschalten.

### Ereignisse in der config.js (optional)

```js
events: [
	{ title: "Weihnachten", date: "2026-12-24", repeat: "yearly", icon: "tree", color: "#2ecc71" },
	{ title: "Annas Geburtstag", date: "1986-11-14", repeat: "yearly", icon: "cake-candles", showYears: true },
	{ title: "Zahnarzt", date: "2026-11-20", time: "14:30", icon: "tooth" }
]
```

Felder: `title`, `date` (`YYYY-MM-DD`), `time` (`HH:MM`, leer = ganztägig), `repeat` (`none`/`weekly`/`monthly`/`yearly`), `icon` ([Font-Awesome](https://fontawesome.com/search?o=r&m=free&s=solid)-Name), `color` (`#rrggbb`), `showYears`, `enabled`.

## Weboberfläche

Aufruf: `http://<ip-des-spiegels>:8080/whatsnext`

Damit die Seite von anderen Geräten erreichbar ist, muss der MagicMirror im Netzwerk lauschen. In der `config.js`:

```js
address: "0.0.0.0",
ipWhitelist: [], // oder z. B. ["127.0.0.1", "::ffff:192.168.1.0/24"]
```

Die Daten liegen in `modules/MMM-WhatsNext/data/whatsnext.json` (wird bei `git pull` nicht überschrieben).

**Sicherheit:** Ohne `apiToken` kann jeder im erlaubten Netzwerk Ereignisse ändern. Der Token schützt vor versehentlichen Änderungen, ist aber kein starker Schutz: Er wird – wie die gesamte MagicMirror-Konfiguration – an den Browser des Spiegels ausgeliefert. Die Weboberfläche nicht ins Internet freigeben.

Die Symbole der Weboberfläche werden von cdnjs geladen; ohne Internetzugang funktioniert die Seite weiterhin, nur ohne Symbolvorschau.

## Entwicklung

```bash
npm install       # nur für Entwicklung (ESLint)
npm run lint      # Code-Stil prüfen
npm test          # Tests der Datumslogik
npm run preview   # Vorschau ohne MagicMirror: http://localhost:8090
```

Die Vorschau speichert ihre Daten in `dev/data/` und berührt eine echte Installation nicht.

## API

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| `GET` | `/whatsnext/api/meta` | Status, Sprache, ob ein Token nötig ist |
| `GET` | `/whatsnext/api/state` | Ereignisse und Einstellungen |
| `POST` | `/whatsnext/api/events` | Ereignis anlegen |
| `PUT` | `/whatsnext/api/events/:id` | Ereignis ersetzen |
| `DELETE` | `/whatsnext/api/events/:id` | Ereignis löschen |
| `PUT` | `/whatsnext/api/settings` | Anzeigeeinstellungen speichern |

Bei gesetztem `apiToken` muss der Header `X-WhatsNext-Token` mitgeschickt werden.

## Lizenz

[MIT](LICENSE)
