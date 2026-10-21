import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Badge, Box, Button, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { KeyRound, RefreshCw, Server } from 'lucide-react';
import { statusColor } from './api.js';
import { useApps, useDeployments, useRole } from './queries.jsx';
import { EmptyState, LegacyLink, StateView } from './shared.jsx';

function DeploymentRow({ deployment, appName, staff }) {
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
                    // Credentials live in one place, My Access, not in a
                    // dialog per row.
                    <Button component={Link} href="/my-access" size="xs" variant="light" leftSection={<KeyRound size={14} />}>
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
                                            staff={staff} />
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
        </Stack>
    );
}
