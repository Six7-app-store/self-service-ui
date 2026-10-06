import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Badge, Box, Button, CopyButton, Group, Modal, Paper, PasswordInput, Stack, Table, Text, Textarea, Title, Tooltip } from '@mantine/core';
import { Check, Copy, KeyRound, RefreshCw, Server } from 'lucide-react';
import { CopyableText } from '/helper/copyable-text.jsx';
import { accessEntries, statusColor } from './api.js';
import { useApps, useDeployments, useMyAccess, useRole } from './queries.jsx';
import { EmptyState, LegacyLink, StateView } from './shared.jsx';

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

// The student's own credentials for one environment. Loaded only while the
// dialog is open: they are secrets, and most rows are never opened.
function AccessModal({ deployment, onClose }) {
    const { t } = useTranslation();
    const query = useMyAccess(deployment?.deploymentId, Boolean(deployment));
    const entries = accessEntries(query.data);
    return (
        <Modal opened={Boolean(deployment)} onClose={onClose} centered size="lg"
            title={t('appStore.access.title', { name: deployment?.name ?? '' })}>
            <StateView query={query}>
                {entries.length > 0
                    ? <Stack gap="sm">{entries.map(e => <AccessEntry key={e.key} entry={e} />)}</Stack>
                    : <Text size="sm" c="dimmed">{t('appStore.access.none')}</Text>}
            </StateView>
        </Modal>
    );
}

function DeploymentRow({ deployment, appName, staff, onShowAccess }) {
    const { t, i18n } = useTranslation();
    const status = deployment.status;
    return (
        <Table.Tr>
            <Table.Td>
                <Group gap="sm" wrap="nowrap">
                    <Server size={18} />
                    <Box>
                        <Text size="sm" fw={500}>{deployment.name}</Text>
                        {appName && <Text size="xs" c="dimmed">{appName}</Text>}
                    </Box>
                </Group>
            </Table.Td>
            <Table.Td>
                <Badge variant="light" color={statusColor(status)}>
                    {status ? t(`appStore.statuses.${status}`, { defaultValue: status }) : t('appStore.statusUnknown')}
                </Badge>
            </Table.Td>
            <Table.Td>{deployment.created_at ? new Date(deployment.created_at).toLocaleDateString(i18n.language) : '–'}</Table.Td>
            <Table.Td>
                {staff ? (
                    <LegacyLink path={`/deployments/${encodeURIComponent(deployment.deploymentId)}`} size="xs" variant="subtle">
                        {t('appStore.openDeployment')}
                    </LegacyLink>
                ) : (
                    <Button size="xs" variant="light" leftSection={<KeyRound size={14} />} onClick={() => onShowAccess(deployment)}>
                        {t('appStore.access.show')}
                    </Button>
                )}
            </Table.Td>
        </Table.Tr>
    );
}

export function Deployments() {
    const { t } = useTranslation();
    const query = useDeployments();
    // Only for the app's name in each row; the list renders without it.
    const apps = useApps();
    const { staff } = useRole();
    const [accessFor, setAccessFor] = useState(null);

    const appNames = new Map((apps.data ?? []).map(app => [app.appId, app.name]));

    return (
        <Stack gap="lg">
            <Group justify="space-between">
                <Box>
                    <Title order={1} size="h2">{t(staff ? 'appStore.deployments' : 'appStore.myEnvironments')}</Title>
                    <Text c="dimmed" mt={6}>{t(staff ? 'appStore.deploymentIntroStaff' : 'appStore.deploymentIntroStudent')}</Text>
                </Box>
                <Button variant="default" leftSection={<RefreshCw size={16} />} onClick={() => query.refetch()} loading={query.isFetching}>
                    {t('appStore.refresh')}
                </Button>
            </Group>
            <StateView query={query}>
                {query.data?.length ? (
                    <Paper withBorder>
                        <Table.ScrollContainer minWidth={660}>
                            <Table verticalSpacing="md" horizontalSpacing="md">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>{t('appStore.deploymentName')}</Table.Th>
                                        <Table.Th>{t('appStore.status')}</Table.Th>
                                        <Table.Th>{t('appStore.created')}</Table.Th>
                                        <Table.Th><span className="app-store-sr-only">{t('appStore.actions')}</span></Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {query.data.map(d => (
                                        <DeploymentRow key={d.deploymentId} deployment={d} appName={appNames.get(d.appId)}
                                            staff={staff} onShowAccess={setAccessFor} />
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Paper>
                ) : (
                    <EmptyState title={t('appStore.noDeployments')}
                        description={t(staff ? 'appStore.noDeploymentsHintStaff' : 'appStore.noDeploymentsHintStudent')}>
                        {staff && <Button component={Link} href="/apps" variant="light">{t('appStore.catalog')}</Button>}
                    </EmptyState>
                )}
            </StateView>
            <AccessModal deployment={accessFor} onClose={() => setAccessFor(null)} />
        </Stack>
    );
}
