// Client and pure rules for the DHBW App Store backend (FastAPI).
//
// Requests are same-origin and carry no token: in a deployment the oauth2-proxy
// in front injects the Keycloak bearer (see APP-STORE.md). The dev login's
// dummy identity is NOT an App Store login — the backend only accepts a real
// access token, so in that mode every call answers 401.

// HTTP statuses the views tell apart.
export const UNAUTHORIZED = 401;
export const FORBIDDEN = 403;
export const NOT_FOUND = 404;
export const PRECONDITION_FAILED = 412;

// The backend's page size limit; `list` walks pages of this size.
const PAGE_SIZE = 100;

/**
 * createAppStoreApi returns the backend calls this UI makes.
 *
 * `onUnauthorized` runs on every 401 — the caller decides whether that means
 * "session expired" (behind the proxy) or "not possible here" (dev login).
 * Errors carry `status` and, where the backend sends one, the structured
 * `reason` (e.g. `role_required`, `openstack_credentials_missing`).
 */
export function createAppStoreApi({ baseUrl, onUnauthorized = () => {}, fetchImpl = fetch }) {
    const root = baseUrl.replace(/\/$/, '');

    async function request(path, { method = 'GET', body, signal } = {}) {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        // redirect: 'error' — a proxy answering an expired session with a
        // redirect to the login page must fail here, not hand that HTML page
        // to the JSON parser as if it were data.
        const response = await fetchImpl(`${root}${path}`, {
            method,
            credentials: 'same-origin',
            redirect: 'error',
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal,
        });
        if (response.status === UNAUTHORIZED) onUnauthorized();
        if (!response.ok) throw await httpError(response);
        if (!response.headers.get('content-type')?.includes('application/json')) {
            throw new Error('App Store response is not JSON');
        }
        return response.json();
    }

    async function list(path, signal) {
        const result = [];
        for (let skip = 0; ; skip += PAGE_SIZE) {
            const page = await request(`${path}?skip=${skip}&limit=${PAGE_SIZE}`, { signal });
            if (!Array.isArray(page)) throw new Error('App Store response is not a list');
            result.push(...page);
            if (page.length < PAGE_SIZE) return result;
        }
    }

    const id = value => encodeURIComponent(value);

    return {
        me: signal => request('/users/me', { signal }),
        apps: signal => list('/apps/', signal),
        app: (appId, signal) => request(`/apps/${id(appId)}`, { signal }),
        appVariables: (appId, version, signal) =>
            request(`/apps/${id(appId)}/variables?version=${id(version)}`, { signal }),
        deployments: signal => list('/deployments/', signal),
        myAccess: (deploymentId, signal) => request(`/deployments/${id(deploymentId)}/my-access`, { signal }),
        createDeployment: body => request('/deployments/', { method: 'POST', body }),
    };
}

// httpError turns a failed response into an Error with `status` and `reason`.
// FastAPI sends `{"detail": "..."}` or `{"detail": {"reason": "..."}}`; a body
// that is not JSON (a proxy's error page) leaves both message parts generic.
async function httpError(response) {
    let detail;
    try {
        detail = (await response.json())?.detail;
    } catch {
        detail = undefined;
    }
    const reason = typeof detail === 'object' && detail !== null ? detail.reason : undefined;
    const message = typeof detail === 'string' ? detail : reason;
    const error = new Error(message ? `App Store HTTP ${response.status}: ${message}` : `App Store HTTP ${response.status}`);
    error.status = response.status;
    error.reason = reason;
    return error;
}

/**
 * frontendLink builds a link into the existing (Vue) App Store frontend, or
 * null when its address is missing or not http(s) — a configured
 * `javascript:` URL must never end up in an href.
 */
export function frontendLink(baseUrl, path) {
    if (!baseUrl) return null;
    try {
        const base = new URL(baseUrl, window.location.origin);
        if (!['http:', 'https:'].includes(base.protocol)) return null;
        return `${base.href.replace(/\/$/, '')}${path}`;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Catalog

// filterApps applies the search box and the two selects. Search matches name
// and description, case-insensitively in the UI language.
export function filterApps(apps, { search, visibility, sort }, locale) {
    const needle = search.trim().toLocaleLowerCase(locale);
    return apps
        .filter(app => `${app.name} ${app.description || ''}`.toLocaleLowerCase(locale).includes(needle))
        .filter(app => visibility === 'all' || app.is_private === (visibility === 'private'))
        .sort((a, b) => sort === 'newest'
            ? Date.parse(b.created_at) - Date.parse(a.created_at)
            : a.name.localeCompare(b.name, locale));
}

/**
 * plainSummary turns a Markdown description into the plain text a catalog card
 * shows: headings, emphasis, code ticks, links and table rows reduced to
 * their words. Rendering the Markdown inside a three-line preview would show
 * a heading and nothing else; showing it raw showed `#` and `|---|`.
 */
export function plainSummary(markdown) {
    if (!markdown) return '';
    return markdown
        .split('\n')
        .filter(line => !/^\s*\|?\s*:?-{3,}/.test(line))      // table separator rows
        .map(line => line
            .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/, '')  // heading, quote, list markers
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')        // links and images → their text
            .replace(/[*_`~]+/g, '')                          // emphasis, code
            .replace(/\s*\|\s*/g, ' ')                        // table cells
            .trim())
        .filter(Boolean)
        .join(' ');
}

// ---------------------------------------------------------------------------
// Roles

// Staff set environments up; students get access to them. The backend enforces
// this (`role_required` on POST /deployments/), the UI only stops offering what
// would be refused.
export function isStaff(user) {
    return user?.role === 'teacher' || user?.role === 'admin';
}

// ---------------------------------------------------------------------------
// Deployment status

// States a deployment passes through on its own. While any deployment is in
// one of them the list polls; once all have settled it stops.
const TRANSITIONAL = new Set(['pending', 'running', 'destroying', 'pausing', 'resuming']);

export function isTransitional(status) {
    return TRANSITIONAL.has(status);
}

// statusColor maps a status to a badge colour. `status` comes from the latest
// task and is null for a deployment that has none yet.
export function statusColor(status) {
    if (!status) return 'gray';
    if (status === 'success') return 'green';
    if (status.endsWith('failed')) return 'red';
    if (isTransitional(status)) return 'blue';
    return 'gray';
}

// ---------------------------------------------------------------------------
// Deploying from this UI

/**
 * versionOptions lists the tags a deployment can be created from, stable
 * releases first. The backend already filters to approved tags for anyone but
 * the owner or an admin; an entry is a dict with the tag under `version`.
 */
export function versionOptions(versions) {
    return (versions ?? [])
        .filter(v => v && typeof v.version === 'string' && v.version)
        .map(v => ({ value: v.version, label: v.name && v.name !== v.version ? `${v.version} – ${v.name}` : v.version, prerelease: v.prerelease === 'True' }))
        .sort((a, b) => Number(a.prerelease) - Number(b.prerelease));
}

/**
 * quickDeployBlocker says why an app cannot be deployed with one click, or
 * null when it can. One click means: no teams, no inputs. Anything the app
 * declares that needs a value — a required variable without default, a file
 * upload, a per-team or per-user value — needs the full wizard of the existing
 * App Store, so this returns 'inputs' and the view links there instead.
 */
export function quickDeployBlocker(variables) {
    for (const v of variables ?? []) {
        if (v.osType === 'file') return 'inputs';
        if (v.varScope === 'team' || v.varScope === 'user') return 'inputs';
        if (v.required && (v.default === undefined || v.default === null)) return 'inputs';
    }
    return null;
}

// deploymentPayload is what POST /deployments/ receives for a one-click
// deployment; the same shape the existing frontend's wizard sends with no
// teams and no inputs.
export function deploymentPayload({ name, appId, releaseTag }) {
    return { name: name.trim(), appId, releaseTag, userInputVar: { tofu: {} }, teams: [] };
}

// ---------------------------------------------------------------------------
// Access credentials (GET /deployments/{id}/my-access)

/**
 * accessEntries flattens the my-access answer into one entry per account.
 * `user_accounts` mirrors the app's tofu output: each value has `username`,
 * `auth` (password or key, per `type`), and an address as `url` or
 * `ip`/`port`. `team_vms` adds the team machine's address where the account
 * has none of its own.
 */
export function accessEntries(access) {
    const vms = Object.values(access?.team_vms ?? {});
    return Object.entries(access?.user_accounts ?? {}).map(([key, account]) => {
        const vm = vms[0] ?? {};
        const host = account.ip || vm.floating_ip || vm.fixed_ip || '';
        const address = account.url || vm.url || (host && account.port ? `${host}:${account.port}` : host);
        return {
            key,
            username: account.username || key,
            address,
            protocol: account.protocol || account.authtype || '',
            secret: account.auth || '',
            secretIsKey: account.type === 'ssh_key',
        };
    });
}
