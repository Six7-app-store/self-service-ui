import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appStoreEnabled } from '/features.js';
import { useApiMutation } from '/helper/query-state.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useSession } from '/providers/session.jsx';
import { createAppStoreApi, isStaff, isTransitional } from './api.js';

// How often the deployment list refreshes while something is still moving.
const POLL_MS = 15000;

// Every query key starts with this, so one invalidation reaches all of them.
const ROOT = 'app-store';

/**
 * useAppStoreApi returns the client, built once per base URL.
 *
 * A 401 means "the proxy session expired" only where there IS a proxy. With
 * the dev login there is none, and the backend refuses the dummy identity on
 * every call — reporting that as an expired session sent the browser to
 * /oauth2/start, a route the dev server does not have. In that mode the 401
 * stays an error of the query, and StateView explains it.
 */
export function useAppStoreApi() {
    const { useDummyAuth } = useAuth() ?? {};
    const { expire } = useSession();
    const baseUrl = window.appconfig?.appStoreBaseUrl || '/api/app-store';
    return useMemo(
        () => createAppStoreApi({ baseUrl, onUnauthorized: useDummyAuth ? () => {} : expire }),
        [baseUrl, useDummyAuth, expire],
    );
}

// The signed-in user decides every key: a different user must never be shown
// the previous one's cached lists.
function useUserKey() {
    const { user } = useAuth() ?? {};
    return user?.profile?.email ?? null;
}

// The App Store's own record of the user, which carries the role.
export function useMe() {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'me'],
        queryFn: ({ signal }) => api.me(signal),
        enabled: appStoreEnabled && Boolean(userKey),
        retry: false,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * useRole answers what the views need to know about the role. While it is
 * unknown (loading, failed), `staff` is false: offering a deploy button the
 * backend would refuse is worse than offering it a moment late.
 */
export function useRole() {
    const me = useMe();
    return { staff: isStaff(me.data), student: me.data?.role === 'student', loaded: me.isSuccess };
}

export function useApps() {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'apps'],
        queryFn: ({ signal }) => api.apps(signal),
        enabled: Boolean(userKey),
        retry: false,
    });
}

export function useApp(appId) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'app', appId],
        queryFn: ({ signal }) => api.app(appId, signal),
        enabled: Boolean(userKey && appId),
        retry: false,
    });
}

// Variables are read from the app's Git repository per version, which is slow
// and does not change for a given tag — hence the long staleTime.
export function useAppVariables(appId, version) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'variables', appId, version],
        queryFn: ({ signal }) => api.appVariables(appId, version, signal),
        enabled: Boolean(userKey && appId && version),
        retry: false,
        staleTime: 10 * 60 * 1000,
    });
}

/**
 * useDeployments polls only while a deployment is still changing state on its
 * own. Polling unconditionally re-fetched every page of the list every 15
 * seconds for as long as the tab was open, which for an admin is every
 * deployment there is.
 */
export function useDeployments() {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'deployments'],
        queryFn: ({ signal }) => api.deployments(signal),
        enabled: Boolean(userKey),
        retry: false,
        refetchInterval: query => (query.state.data?.some(d => isTransitional(d.status)) ? POLL_MS : false),
    });
}

export function useMyAccess(deploymentId, enabled) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useQuery({
        queryKey: [ROOT, userKey, 'my-access', deploymentId],
        queryFn: ({ signal }) => api.myAccess(deploymentId, signal),
        enabled: Boolean(enabled && userKey && deploymentId),
        retry: false,
    });
}

// Errors are shown inline by the deploy form: the reasons it can fail
// (credentials missing, role) need a link next to them, not a modal.
export function useCreateDeployment({ onSuccess } = {}) {
    const api = useAppStoreApi();
    const userKey = useUserKey();
    return useApiMutation({
        mutationFn: body => api.createDeployment(body),
        invalidates: [[ROOT, userKey, 'deployments']],
        onSuccess,
        reportErrors: 'inline',
    });
}
