// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import '/test/jsdom-stubs.js';
import { renderView } from '/test/render-harness.jsx';
import { Catalog } from './catalog.jsx';
import { AppDetail } from './app-detail.jsx';
import { Deployments } from './deployments.jsx';

// Render smoke tests for the three App Store views, against a fetch that
// answers like the backend. They check that each view renders and that the
// role decides what it offers — not what it looks like.

const APPS = [
    { appId: 'ubuntu', name: 'Ubuntu Desktop', description: 'Linux for courses', releaseTag: 'v1.0', is_private: false, created_at: '2026-09-01' },
    { appId: 'lab', name: 'Programming lab', description: '', releaseTag: 'v2.1', is_private: true, created_at: '2026-09-02' },
];
const APP = { ...APPS[0], git_link: 'https://github.com/example/ubuntu', versions: [{ version: 'v1.0', name: 'v1.0', prerelease: 'False' }] };
const DEPLOYMENTS = [{ deploymentId: 'd1', appId: 'ubuntu', name: 'Linux course', status: 'success', created_at: '2026-09-29' }];
const ACCESS = { user_accounts: { 'Team-1-anna': { username: 'anna', ip: '10.0.0.5', port: 22, auth: 's3cret', type: 'password', protocol: 'ssh' } }, team_vms: {} };

function backend(role, overrides = {}) {
    const routes = {
        '/api/app-store/users/me': { role },
        '/api/app-store/apps/': APPS,
        '/api/app-store/apps/ubuntu': APP,
        '/api/app-store/apps/ubuntu/variables': [],
        '/api/app-store/deployments/': DEPLOYMENTS,
        '/api/app-store/deployments/d1/my-access': ACCESS,
        ...overrides,
    };
    return vi.fn(async url => {
        const path = new URL(url, 'http://localhost').pathname;
        if (!(path in routes)) return new Response('', { status: 404 });
        return new Response(JSON.stringify(routes[path]), { headers: { 'content-type': 'application/json' } });
    });
}

describe('App Store views', () => {
    beforeEach(() => {
        window.appconfig = { appStoreBaseUrl: '/api/app-store', appStoreFrontendUrl: 'http://store.example' };
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('lists the catalog and filters it', async () => {
        vi.stubGlobal('fetch', backend('teacher'));
        renderView(<Catalog />);
        expect(await screen.findByText('Ubuntu Desktop')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Search apps'), { target: { value: 'nothing like it' } });
        expect(screen.getByText('No matching apps')).toBeTruthy();
    });

    it('offers a teacher one-click deployment of an app without inputs', async () => {
        vi.stubGlobal('fetch', backend('teacher'));
        renderView(<AppDetail params={{ id: 'ubuntu' }} />);
        const button = await screen.findByRole('button', { name: /Deploy now/ });
        await vi.waitFor(() => expect(button.disabled).toBe(false));
    });

    it('hands a version that needs inputs over to the existing wizard', async () => {
        vi.stubGlobal('fetch', backend('teacher', {
            '/api/app-store/apps/ubuntu/variables': [{ name: 'admin_password', type: 'string', required: true }],
        }));
        renderView(<AppDetail params={{ id: 'ubuntu' }} />);
        expect(await screen.findByText(/needs inputs/)).toBeTruthy();
        expect(screen.getByRole('link', { name: /Configure in App Store/ }).getAttribute('href'))
            .toBe('http://store.example/apps/ubuntu');
        expect(screen.getByRole('button', { name: /Deploy now/ }).disabled).toBe(true);
    });

    it('never offers a student the deploy form', async () => {
        vi.stubGlobal('fetch', backend('student'));
        renderView(<AppDetail params={{ id: 'ubuntu' }} />);
        expect(await screen.findByText(/Your lecturers set environments up/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Deploy now/ })).toBeNull();
    });

    it('shows a student their own credentials', async () => {
        vi.stubGlobal('fetch', backend('student'));
        renderView(<Deployments />);
        expect(await screen.findByRole('heading', { name: 'My environments' })).toBeTruthy();
        fireEvent.click(await screen.findByRole('button', { name: /Credentials/ }));
        expect(await screen.findByText('anna')).toBeTruthy();
        expect(screen.getByText('10.0.0.5:22')).toBeTruthy();
    });

    it('explains a refused dev login instead of reporting an expired session', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
        renderView(<Catalog />, { auth: { useDummyAuth: true } });
        expect(await screen.findByText(/development login cannot load App Store data/)).toBeTruthy();
    });
});
