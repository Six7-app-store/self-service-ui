import { test, expect } from '@playwright/test';

// Browser tests of the App Store section against intercepted API answers.
// They cover navigation, direct reloads of sub-pages, the role split and the
// one-click deployment — not the real Keycloak/proxy/backend chain.

const apps = [
    { appId: 'ubuntu', name: 'Ubuntu Desktop', description: 'Eine Linux-Arbeitsumgebung für Studium und Lehre.', releaseTag: 'v1.0', is_private: false, created_at: '2026-09-01' },
    { appId: 'lab', name: 'Programmierlabor', description: 'Entwicklungsumgebung für praktische Übungen.', releaseTag: 'v2.1', is_private: true, created_at: '2026-09-02' },
];
const appDetail = { ...apps[0], versions: [{ version: 'v1.0', name: 'v1.0', prerelease: 'False' }] };
const deployments = [{ deploymentId: 'deployment-1', appId: 'ubuntu', name: 'Linux-Kurs', status: 'success', created_at: '2026-09-29' }];
const access = { user_accounts: { 'Team-1-anna': { username: 'anna', ip: '10.0.0.5', port: 22, auth: 'geheim', type: 'password', protocol: 'ssh' } }, team_vms: {} };

async function mockBackend(page, role) {
    const created = [];
    await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.appconfig = { dummyAuth: true, appStoreBaseUrl: "/api/app-store", appStoreFrontendUrl: "http://localhost:5173" };' }));
    await page.route('**/api/app-store/**', route => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace('/api/app-store', '');
        if (request.method() === 'POST' && path === '/deployments/') {
            created.push(request.postDataJSON());
            return route.fulfill({ status: 201, json: { ...deployments[0], deploymentId: 'new' } });
        }
        const answers = {
            '/users/me': { role },
            '/apps/': apps,
            '/apps/ubuntu': appDetail,
            '/apps/ubuntu/variables': [],
            '/deployments/': deployments,
            '/deployments/deployment-1/my-access': access,
        };
        return path in answers ? route.fulfill({ json: answers[path] }) : route.fulfill({ status: 404, json: {} });
    });
    return created;
}

test('teacher: catalog, search, details, one-click deploy and direct reload', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const created = await mockBackend(page, 'teacher');

    await page.goto('/app-store');
    await expect(page).toHaveURL(/\/app-store\/apps$/);
    await expect(page.getByRole('heading', { name: 'Ubuntu Desktop' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Apps suchen' }).fill('keine app');
    await expect(page.getByRole('heading', { name: 'Keine passenden Apps' })).toBeVisible();
    await page.getByRole('button', { name: 'Filter zurücksetzen' }).click();

    await page.getByRole('article').filter({ hasText: 'Ubuntu Desktop' }).getByRole('link', { name: 'Details ansehen' }).click();
    await expect(page).toHaveURL(/\/app-store\/apps\/ubuntu$/);
    await page.reload();
    const deploy = page.getByRole('button', { name: 'Jetzt bereitstellen' });
    await expect(deploy).toBeEnabled();
    await deploy.click();
    await expect(page).toHaveURL(/\/app-store\/deployments$/);
    expect(created).toEqual([{ name: 'Ubuntu Desktop', appId: 'ubuntu', releaseTag: 'v1.0', userInputVar: { tofu: {} }, teams: [] }]);

    await expect(page.getByText('Linux-Kurs')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Deployment verwalten' })).toHaveAttribute('href', 'http://localhost:5173/deployments/deployment-1');
    expect(errors).toEqual([]);
});

test('student: no deploy form, own environments with credentials', async ({ page }) => {
    await mockBackend(page, 'student');
    await page.goto('/app-store/apps/ubuntu');
    await expect(page.getByText(/Umgebungen richten deine Lehrenden ein/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jetzt bereitstellen' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Meine Umgebungen', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Meine Umgebungen' })).toBeVisible();
    await page.getByRole('button', { name: 'Zugangsdaten' }).click();
    await expect(page.getByText('anna')).toBeVisible();
    await expect(page.getByText('10.0.0.5:22')).toBeVisible();
});

test('mobile catalog has no horizontal overflow', async ({ page }) => {
    await mockBackend(page, 'teacher');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app-store/apps');
    await expect(page.getByRole('heading', { name: 'Ubuntu Desktop' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Navigation öffnen' }).click();
    await page.getByRole('link', { name: 'Deployments', exact: true }).click();
    await expect(page.getByText('Linux-Kurs')).toBeVisible();
    await page.screenshot({ path: 'test-results/app-store-mobile.png', fullPage: true });
});

test('errors can be retried and empty data is distinct from failed requests', async ({ page }) => {
    await mockBackend(page, 'teacher');
    let failed = true;
    await page.route('**/api/app-store/apps/?**', route => failed ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: [] }));
    await page.goto('/app-store/apps');
    await expect(page.getByRole('alert')).toContainText('App-Store konnte nicht geladen werden');
    failed = false;
    await page.getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(page.getByRole('heading', { name: 'Noch keine Apps verfügbar' })).toBeVisible();
});

test('desktop header keeps every section visible', async ({ page }) => {
    await mockBackend(page, 'teacher');
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.appconfig = { dummyAuth: true, cloudResourcesBaseUrl: "http://localhost:8084/api/projects/", dynamicZonesBaseUrl: "http://localhost:8084/api/dyndns/", appStoreBaseUrl: "/api/app-store", appStoreFrontendUrl: "http://localhost:5173" };' }));
    await page.route('**/api/projects/**', route => route.fulfill({ status: 503, json: {} }));
    await page.route('**/api/dyndns/**', route => route.fulfill({ status: 503, json: {} }));
    await page.goto('/app-store/apps');
    await expect(page.getByRole('heading', { name: 'Ubuntu Desktop' })).toBeVisible();
    for (const name of ['Start', 'Cloud-Projekte', 'DNS-Zonen', 'API-Tokens', 'App-Store']) {
        await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await page.screenshot({ path: 'test-results/app-store-desktop.png', fullPage: true });
});
