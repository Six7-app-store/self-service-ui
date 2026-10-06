import { Alert, Button, Group, Image, Loader, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { AlertCircle, ExternalLink, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '/providers/auth.jsx';
import { FORBIDDEN, NOT_FOUND, UNAUTHORIZED, frontendLink } from './api.js';

/**
 * LegacyLink points into the existing App Store frontend, for everything this
 * section hands over. Without a configured address it says so instead of
 * rendering a link to nowhere.
 */
export function LegacyLink({ path, children, ...buttonProps }) {
    const { t } = useTranslation();
    const href = frontendLink(window.appconfig?.appStoreFrontendUrl, path);
    if (!href) return <Text size="sm" c="dimmed">{t('appStore.missingLink')}</Text>;
    return (
        <Button component="a" href={href} rightSection={<ExternalLink size={15} />} {...buttonProps}>
            {children}
        </Button>
    );
}

// The app's own image (a data: URI from the backend), or a generic icon.
export function AppIcon({ app, size = 48 }) {
    if (app.image) return <Image src={app.image} alt="" w={size} h={size} fit="contain" radius="sm" />;
    return (
        <ThemeIcon size={size} variant="light" radius="md">
            <Package size={size / 2} />
        </ThemeIcon>
    );
}

export function EmptyState({ title, description, children }) {
    return (
        <Paper withBorder p="xl">
            <Stack align="center" gap="sm" py="xl">
                <ThemeIcon size={48} variant="light" color="gray"><Package size={24} /></ThemeIcon>
                <Title order={3}>{title}</Title>
                <Text c="dimmed" ta="center">{description}</Text>
                {children}
            </Stack>
        </Paper>
    );
}

// Which sentence explains a failed query. A 401 under the dev login is not an
// expired session but the backend refusing the dummy identity, and says so.
function errorKey(error, useDummyAuth) {
    if (error?.status === UNAUTHORIZED) return useDummyAuth ? 'devLogin' : 'unauthorized';
    if (error?.status === FORBIDDEN) return 'forbidden';
    if (error?.status === NOT_FOUND) return 'notFound';
    return 'errorMessage';
}

/**
 * StateView renders loading and error for `query` and `children` otherwise.
 * Retrying is offered for every error but the dev-login one, which a retry
 * cannot fix.
 */
export function StateView({ query, children }) {
    const { t } = useTranslation();
    const { useDummyAuth } = useAuth() ?? {};

    if (query.isPending) {
        return (
            <Group role="status" py="xl">
                <Loader size="sm" />
                <Text>{t('appStore.loading')}</Text>
            </Group>
        );
    }
    if (query.isError) {
        const key = errorKey(query.error, useDummyAuth);
        return (
            <Alert color={key === 'devLogin' ? 'yellow' : 'red'} title={t('appStore.error')} icon={<AlertCircle size={18} />} role="alert">
                <Stack gap="sm">
                    <Text size="sm">{t(`appStore.errors.${key}`)}</Text>
                    {key !== 'devLogin' && (
                        <Button variant="light" size="xs" w="fit-content" onClick={() => query.refetch()} loading={query.isFetching}>
                            {t('appStore.retry')}
                        </Button>
                    )}
                </Stack>
            </Alert>
        );
    }
    return children;
}
