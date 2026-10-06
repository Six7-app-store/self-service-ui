import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Box, Button, Divider, Group, Loader, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { AlertCircle, ArrowLeft, Rocket } from 'lucide-react';
import { FORBIDDEN, PRECONDITION_FAILED, deploymentPayload, quickDeployBlocker, versionOptions } from './api.js';
import { useApp, useAppVariables, useCreateDeployment, useRole } from './queries.jsx';
import { AppDescription } from './markdown.jsx';
import { AppIcon, LegacyLink, StateView } from './shared.jsx';

// What a failed create means for the user, and where they can fix it.
function DeployError({ error }) {
    const { t } = useTranslation();
    if (error.status === PRECONDITION_FAILED && error.reason === 'openstack_credentials_missing') {
        return (
            <Alert color="yellow" icon={<AlertCircle size={18} />} title={t('appStore.deploy.credentialsMissingTitle')}>
                <Stack gap="sm">
                    <Text size="sm">{t('appStore.deploy.credentialsMissing')}</Text>
                    <LegacyLink path="/user/openstack" size="xs" variant="light">{t('appStore.deploy.openCredentials')}</LegacyLink>
                </Stack>
            </Alert>
        );
    }
    const message = error.status === FORBIDDEN ? t('appStore.deploy.forbidden') : error.message;
    return <Alert color="red" icon={<AlertCircle size={18} />} title={t('appStore.deploy.failed')}>{message}</Alert>;
}

/**
 * DeployPanel creates a deployment of this app without teams or inputs.
 *
 * Whether that is enough depends on the version: its variables are read from
 * the app's repository, and anything that needs a value hands over to the
 * existing App Store's wizard, which can collect it. Students never see this
 * panel — creating environments is staff work, and the backend refuses it.
 */
function DeployPanel({ app }) {
    const { t } = useTranslation();
    const [, navigate] = useLocation();
    const versions = versionOptions(app.versions);
    const [version, setVersion] = useState(versions[0]?.value ?? null);
    const [name, setName] = useState(app.name);
    const variables = useAppVariables(app.appId, version);
    const create = useCreateDeployment({ onSuccess: () => navigate('/deployments') });

    // An empty list is either "nothing approved yet" or the backend failing
    // to reach the repository (it logs that and answers []). The UI cannot
    // tell which, so it says both and offers the wizard, which can.
    if (versions.length === 0) {
        return (
            <Stack gap="sm" align="flex-start">
                <Text size="sm" c="dimmed">{t('appStore.deploy.noVersions')}</Text>
                <LegacyLink path={`/apps/${encodeURIComponent(app.appId)}`} size="xs" variant="light">
                    {t('appStore.deploy.openWizard')}
                </LegacyLink>
            </Stack>
        );
    }

    const blocker = variables.isSuccess ? quickDeployBlocker(variables.data) : null;
    const ready = variables.isSuccess && !blocker && name.trim() !== '';

    return (
        <Stack gap="md">
            <Group grow align="flex-start">
                <Select label={t('appStore.deploy.version')} data={versions} value={version}
                    onChange={setVersion} allowDeselect={false} />
                <TextInput label={t('appStore.deploy.name')} value={name} required
                    onChange={e => setName(e.currentTarget.value)} />
            </Group>

            {variables.isPending && (
                <Group gap="xs"><Loader size="xs" /><Text size="sm" c="dimmed">{t('appStore.deploy.checking')}</Text></Group>
            )}
            {variables.isError && (
                <Text size="sm" c="red">{t('appStore.deploy.variablesFailed')}</Text>
            )}
            {blocker === 'inputs' && (
                <Alert color="blue" icon={<AlertCircle size={18} />}>
                    <Stack gap="sm">
                        <Text size="sm">{t('appStore.deploy.needsInputs')}</Text>
                        <LegacyLink path={`/apps/${encodeURIComponent(app.appId)}`} size="xs" variant="light">
                            {t('appStore.deploy.openWizard')}
                        </LegacyLink>
                    </Stack>
                </Alert>
            )}
            {create.error && <DeployError error={create.error} />}

            <Group>
                <Button leftSection={<Rocket size={16} />} disabled={!ready} loading={create.isPending}
                    onClick={() => create.mutate(deploymentPayload({ name, appId: app.appId, releaseTag: version }))}>
                    {t('appStore.deploy.submit')}
                </Button>
                <Text size="xs" c="dimmed">{t('appStore.deploy.hint')}</Text>
            </Group>
        </Stack>
    );
}

export function AppDetail({ params }) {
    const { t } = useTranslation();
    const query = useApp(params.id);
    const { staff, loaded } = useRole();
    const app = query.data;
    // Only http(s): the link is rendered as an anchor, and the field is
    // whatever the app's author typed.
    const repository = app?.git_link && /^https?:\/\//i.test(app.git_link) ? app.git_link : null;

    return (
        <Stack gap="lg">
            <Anchor component={Link} href="/apps" size="sm">
                <Group gap={6}><ArrowLeft size={15} />{t('appStore.back')}</Group>
            </Anchor>
            <StateView query={query}>
                {app && (
                    <Paper withBorder p="xl">
                        <Stack gap="lg">
                            <Group>
                                <AppIcon app={app} size={64} />
                                <Box>
                                    <Title order={1} size="h2">{app.name}</Title>
                                    <Group mt="xs">
                                        {app.releaseTag && <Badge variant="light">{t('appStore.version')} {app.releaseTag}</Badge>}
                                        <Badge color="gray" variant="light">
                                            {t(app.is_private ? 'appStore.private' : 'appStore.public')}
                                        </Badge>
                                    </Group>
                                </Box>
                            </Group>
                            {app.description
                                ? <AppDescription>{app.description}</AppDescription>
                                : <Text c="dimmed">{t('appStore.noDescription')}</Text>}
                            {repository && (
                                <Anchor href={repository} target="_blank" rel="noopener noreferrer" size="sm">
                                    {t('appStore.repository')} ↗
                                </Anchor>
                            )}

                            {/* Nothing until the role is known: a deploy form
                                that turns into a hint a moment later is worse
                                than either alone. */}
                            {loaded && (
                                <>
                                    <Divider />
                                    <Title order={2} size="h4">{t('appStore.deploy.title')}</Title>
                                    {staff ? <DeployPanel app={app} /> : (
                                        <Stack gap="xs">
                                            <Text size="sm">{t('appStore.deploy.studentHint')}</Text>
                                            <Anchor component={Link} href="/deployments" size="sm">
                                                {t('appStore.myEnvironments')}
                                            </Anchor>
                                        </Stack>
                                    )}
                                </>
                            )}
                        </Stack>
                    </Paper>
                )}
            </StateView>
        </Stack>
    );
}
