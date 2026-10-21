import { useTranslation } from 'react-i18next';
import { ActionIcon, Badge, Box, Button, CopyButton, Group, Paper, PasswordInput, Stack, Text, Textarea, Title, Tooltip } from '@mantine/core';
import { Check, Copy, RefreshCw, Server } from 'lucide-react';
import { CopyableText } from '/helper/copyable-text.jsx';
import { accessDenied, accessEntries, isDeployed } from './api.js';
import { useApps, useDeployments, useMyAccessList } from './queries.jsx';
import { EmptyState, StateView } from './shared.jsx';

function CopyIcon({ value }) {
    const { t } = useTranslation();
    return (
        <CopyButton value={value} timeout={1500}>
            {({ copied, copy }) => (
                <Tooltip label={copied ? t('helper.copyableText.copied') : t('appStore.access.copy')} withArrow>
                    <ActionIcon variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy} aria-label={t('appStore.access.copy')}>
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                    </ActionIcon>
                </Tooltip>
            )}
        </CopyButton>
    );
}

// One account: who, where, and the secret — a password stays masked until
// asked for, a key is shown as the block of text it is.
function AccessEntry({ entry }) {
    const { t } = useTranslation();
    return (
        <Paper withBorder p="md">
            <Stack gap="xs">
                <Group gap="xs">
                    <Text size="sm" c="dimmed" w={110}>{t('appStore.access.username')}</Text>
                    <CopyableText value={entry.username}><Text size="sm" ff="monospace">{entry.username}</Text></CopyableText>
                </Group>
                {entry.address && (
                    <Group gap="xs">
                        <Text size="sm" c="dimmed" w={110}>{t('appStore.access.address')}</Text>
                        <CopyableText value={entry.address}><Text size="sm" ff="monospace">{entry.address}</Text></CopyableText>
                        {entry.protocol && <Badge variant="light" size="sm">{entry.protocol}</Badge>}
                    </Group>
                )}
                {entry.secret && (entry.secretIsKey ? (
                    <Box>
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">{t('appStore.access.key')}</Text>
                            <CopyIcon value={entry.secret} />
                        </Group>
                        <Textarea readOnly value={entry.secret} autosize maxRows={8} styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }} />
                    </Box>
                ) : (
                    <Group gap="xs" align="flex-end">
                        <PasswordInput readOnly value={entry.secret} label={t('appStore.access.password')} style={{ flex: 1 }} />
                        <CopyIcon value={entry.secret} />
                    </Group>
                ))}
            </Stack>
        </Paper>
    );
}

// The user's own accounts in one environment.
function AccessCard({ deployment, appName, query }) {
    return (
        <Paper withBorder p="lg">
            <Stack gap="md">
                <Group gap="sm" wrap="nowrap">
                    <Server size={18} />
                    <Box>
                        <Title order={2} size="h4">{deployment.name}</Title>
                        {appName && <Text size="xs" c="dimmed">{appName}</Text>}
                    </Box>
                </Group>
                <StateView query={query}>
                    <Stack gap="sm">
                        {accessEntries(query.data).map(e => <AccessEntry key={e.key} entry={e} />)}
                    </Stack>
                </StateView>
            </Stack>
        </Paper>
    );
}

// What My Access leaves out: a deployment the backend says is not the user's,
// and one whose app issues no personal accounts. Neither is something to show
// — the first is the "only for those entitled" rule, the second an empty box.
function hidden(query) {
    if (query.isError) return accessDenied(query.error);
    return query.isSuccess && accessEntries(query.data).length === 0;
}

/**
 * MyAccess is the one place a user finds their credentials: every deployed
 * environment they have an account in, with the accounts the backend reports
 * for them. The deployment list polls while something is still being set up,
 * so credentials appear here by themselves once a deployment has finished.
 */
export function MyAccess() {
    const { t } = useTranslation();
    const deployments = useDeployments();
    // Only for the app's name on each card; the page renders without it.
    const apps = useApps();

    const deployed = (deployments.data ?? []).filter(d => isDeployed(d.status));
    const access = useMyAccessList(deployed.map(d => d.deploymentId));
    const appNames = new Map((apps.data ?? []).map(app => [app.appId, app.name]));
    const cards = deployed
        .map((deployment, i) => ({ deployment, query: access[i] }))
        .filter(({ query }) => !hidden(query));

    const refresh = () => {
        deployments.refetch();
        access.forEach(q => q.refetch());
    };

    return (
        <Stack gap="lg">
            <Group justify="space-between">
                <Box>
                    <Title order={1} size="h2">{t('appStore.myAccess')}</Title>
                    <Text c="dimmed" mt={6}>{t('appStore.access.intro')}</Text>
                </Box>
                <Button variant="default" leftSection={<RefreshCw size={16} />} onClick={refresh}
                    loading={deployments.isFetching || access.some(q => q.isFetching)}>
                    {t('appStore.refresh')}
                </Button>
            </Group>
            <StateView query={deployments}>
                {cards.length > 0 ? (
                    <Stack gap="md">
                        {cards.map(({ deployment, query }) => (
                            <AccessCard key={deployment.deploymentId} deployment={deployment}
                                appName={appNames.get(deployment.appId)} query={query} />
                        ))}
                    </Stack>
                ) : (
                    <EmptyState title={t('appStore.access.empty')} description={t('appStore.access.emptyHint')} />
                )}
            </StateView>
        </Stack>
    );
}
