# DHBW-App-Store im Self-Service-Portal

Dieses Repository ergänzt `pfisterer/self-service-ui` um einen Bereich für den
DHBW-App-Store. Der bestehende Vue-App-Store (`frontend/` im App-Store-Projekt)
bleibt erhalten; was dieser Bereich nicht selbst kann, übergibt er per Link dorthin.

## Umfang

| Seite | Lehrende und Admins | Studierende |
| --- | --- | --- |
| `/app-store/apps` | Katalog mit Suche, Sichtbarkeitsfilter, Sortierung; Link „Apps verwalten“ | Katalog |
| `/app-store/apps/:id` | Details und **Bereitstellen mit einem Klick** | Details und Hinweis, wo ihre Umgebungen erscheinen |
| `/app-store/deployments` | „Deployments“: Status, Link „Deployment verwalten“ | „Meine Umgebungen“: Status und **eigene Zugangsdaten** |

Die Rolle kommt aus `GET /users/me` des App-Store-Backends. Das UI blendet nur
aus, was das Backend ohnehin ablehnen würde (`role_required`); durchgesetzt wird
die Rolle dort.

**Bereitstellen mit einem Klick** heißt: Version und Name wählen, ohne Teams und
ohne Eingaben. Vorher liest das UI die Variablen der gewählten Version
(`GET /apps/:id/variables`). Verlangt die Version eine Eingabe ohne
Standardwert, eine Datei oder Werte je Team oder Person, verweist es auf den
Assistenten des bestehenden App-Stores. Fehlen OpenStack-Zugangsdaten (HTTP 412),
führt ein Link zu deren Pflege.

**Zugangsdaten** kommen aus `GET /deployments/:id/my-access` und werden erst
geladen, wenn der Dialog geöffnet wird. Passwörter bleiben bis zum Aufdecken
maskiert.

Weiterhin im bestehenden App-Store: Kurs- und Teamzuordnung, Eingaben und
Dateien, App-Verwaltung, Freigaben, LTI und die Detailansicht eines Deployments
für Lehrende. Es wird kein Vue-Code eingebettet.

Die Deployment-Liste aktualisiert sich alle 15 Sekunden, aber nur, solange ein
Deployment noch in Bewegung ist (wartet, läuft, wird gelöscht, pausiert oder
fortgesetzt).

React rendert die Oberfläche, Mantine liefert die Komponenten. Gebaut wird wie im
Upstream mit Vite; der App-Store fügt keine eigene Build-Kette hinzu, damit
Updates aus `pfisterer/self-service-ui` ohne Konflikte im Build übernommen werden.
Der Code liegt unter `web/app-store/`: `api.js` (Client und reine Regeln),
`queries.jsx` (Abfragen), je Seite eine Datei.

## API und Anmeldung

```text
Browser → /api/app-store/* → oauth2-proxy → Caddy → FastAPI
                           fügt Bearer ein       entfernt /api/app-store
```

Vor Caddy steht der oauth2-proxy. Er muss einen vom App-Store-Backend
akzeptierten **Access-Token** als `Authorization: Bearer …` weitergeben; ein
ID-Token oder eine E-Mail allein genügt nicht. API-Anfragen ohne Sitzung müssen
HTTP 401 statt einer HTML-Loginseite erhalten (`--api-route=^/api/`). Der
Browser speichert keine Tokens; ein 401 öffnet den Dialog zur erneuten Anmeldung.

| Variable | Zweck |
| --- | --- |
| `APP_STORE_ENABLED` | `true` (Standard) oder `false`; `false` blendet Reiter und Routen aus. Andere Werte verweigert der Container |
| `APP_STORE_UPSTREAM` | `host:port` des App-Store-Backends, an das Caddy weiterleitet. **Pflicht**, solange der Bereich aktiv ist; es gibt bewusst keinen Standard |
| `APP_STORE_BASE_URL` | Browser-Pfad der API, Standard `/api/app-store` |
| `APP_STORE_FRONTEND_URL` | Adresse des bestehenden App-Stores für alle Übergaben. Leer zeigt einen Hinweis statt eines Links |

Im Helm-Chart heißen sie `selfServiceUI.appStore.{enabled, upstream, baseUrl,
frontendUrl}`. Dort ist der Bereich standardmäßig aus, weil nur die Umgebung das
Backend-Ziel kennt; mit `enabled: true` verlangt das Schema ein `upstream`.

Cloud-Projekte, DNS-Zonen und API-Tokens behalten ihre Einstellungen und
erscheinen wie bisher nur, wenn ihre APIs konfiguriert sind.

## Lokal starten

Voraussetzungen: Node.js 22.22+ oder 24.15+, npm, und der Dev-Stack des
App-Store-Projekts (`deployment/`, `make dev-up`) für Backend und Keycloak.

### Nur die Oberfläche

```powershell
cd self-service-ui
npm ci
$env:DUMMY_AUTH = 'true'
npm run dev
```

Adresse: http://localhost:8084/app-store/apps

Die Variablen kommen aus der Prozessumgebung oder aus `.env`/`.env.local`; Vite
schreibt daraus beim Start `web/config.js`. **Der Dev-Login meldet nicht am
App-Store-Backend an**, das nur echte Keycloak-Tokens annimmt. Die Seiten
rendern, zeigen aber statt der Daten einen Hinweis darauf.

### Mit echtem Login

Dafür läuft ein oauth2-proxy auf dem Rechner, nicht in Docker: Browser und
Proxy müssen Keycloak unter derselben Adresse erreichen. Die Konfiguration liegt
in [`dev/oauth2-proxy.alpha.yaml`](dev/oauth2-proxy.alpha.yaml).

1. [oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy/releases)
   herunterladen (getestet mit v7.15).
2. Der Keycloak-Client `appstore-frontend` braucht `http://localhost:8084/*` als
   Redirect-URI. Das Realm im App-Store-Projekt bringt sie mit; in einem älteren
   Dev-Keycloak in der Admin-Konsole nachtragen.
3. Proxy starten (Git Bash: `MSYS_NO_PATHCONV=1` davor, sonst wird `^/api/` zu
   einem Windows-Pfad):

   ```bash
   oauth2-proxy --alpha-config dev/oauth2-proxy.alpha.yaml \
     --redirect-url=http://localhost:8084/oauth2/callback \
     --cookie-secret="$(node -e 'console.log(require("crypto").randomBytes(16).toString("hex"))')" \
     --cookie-secure=false --email-domain='*' --skip-provider-button=true \
     --api-route='^/api/' --whitelist-domain=localhost:8080
   ```

4. UI über den Proxy starten:

   ```powershell
   $env:DUMMY_AUTH = 'false'
   $env:AUTH_PROXY_UPSTREAM = 'http://127.0.0.1:4180'
   $env:APP_STORE_BFF_UPSTREAM = 'http://127.0.0.1:4180'
   $env:OIDC_CLIENT_ID = 'appstore-frontend'
   $env:OIDC_ISSUER_URL = 'http://localhost:8080/realms/dhbw'
   npm run dev
   ```

Anmelden mit den Seed-Benutzern des App-Store-Projekts, etwa
`tobias.admin@dhbw.de` (Admin) oder `luca.baeck@dhbw.de` (Student), Passwort `1234`.

| Variable (nur Entwicklung) | Zweck |
| --- | --- |
| `AUTH_PROXY_UPSTREAM` | Ziel für `/oauth2/*` |
| `APP_STORE_BFF_UPSTREAM` | Ziel für `/api/app-store/*`, Pfad bleibt erhalten |
| `APP_STORE_UPSTREAM` | Ohne Proxy: `/api/app-store/*` direkt an FastAPI, Präfix entfernt. Standard `http://localhost:8000` |

Nur `/oauth2` über den Proxy zu leiten und die API direkt an FastAPI zu schicken,
reicht nicht: dann fehlt der Bearer-Token.

## Prüfung

```powershell
npm run check            # ESLint, Unit- und Render-Tests
npm run build
npx playwright install chromium
npm run test:e2e         # Browser-Tests
```

Die Render-Tests (`web/app-store/app-store.test.jsx`) prüfen, dass jede Seite
rendert und die Rolle bestimmt, was sie anbietet. Die Browser-Tests decken
Navigation, direkte Unterseiten samt Reload, Suche, Bereitstellen, Zugangsdaten,
Wiederholung fehlgeschlagener Anfragen und die mobile Darstellung ab. Beide laufen
gegen abgefangene API-Antworten und ersetzen keinen Test des echten
Keycloak-/Proxy-/Backend-Verbunds. Screenshots entstehen unter `test-results/`.
In der CI laufen beide (`.github/workflows/checks.yml`).
