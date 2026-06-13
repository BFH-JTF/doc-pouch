import {gt} from 'semver';
import type {Logger} from 'winston';

interface PackageInfo {
    version: string;
    name: string;
    repository?: {
        type: string;
        url: string;
    };
}

export interface UpdateCheckResult {
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string;
}

let cachedUpdateCheckResult: UpdateCheckResult | null = null;

function getGitHubRawUrl(packageInfo: PackageInfo): string | null {
    if (!packageInfo.repository?.url) {
        return null;
    }

    let repoUrl = packageInfo.repository.url;

    if (repoUrl.startsWith('git+')) {
        repoUrl = repoUrl.slice(4);
    }

    if (repoUrl.endsWith('.git')) {
        repoUrl = repoUrl.slice(0, -4);
    }

    try {
        const parsed = new URL(repoUrl);
        if (parsed.hostname === 'github.com' || parsed.hostname.endsWith('.github.com')) {
            const repoPath = parsed.pathname.slice(1);
            return `https://raw.githubusercontent.com/${repoPath}/main/package.json`;
        }
    } catch {
        return null;
    }

    return null;
}

async function fetchRemotePackageJson(url: string): Promise<PackageInfo | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch {
        return null;
    }
}

export async function checkForUpdates(logger: Logger): Promise<UpdateCheckResult | null> {
    const localPackageJson: PackageInfo = (await import('../../package.json', {with: {type: 'json'}})).default as PackageInfo;

    const remoteUrl = getGitHubRawUrl(localPackageJson);
    if (!remoteUrl) {
        logger.warn('Could not determine repository URL for update check');
        return null;
    }

    const remotePackageJson = await fetchRemotePackageJson(remoteUrl);
    if (!remotePackageJson) {
        logger.warn('Could not fetch remote package.json for update check');
        return null;
    }

    const currentVersion = localPackageJson.version;
    const latestVersion = remotePackageJson.version;

    if (!currentVersion || !latestVersion) {
        logger.warn('Invalid version in package.json');
        return null;
    }

    const hasUpdate = gt(latestVersion, currentVersion);

    if (hasUpdate) {
        logger.info(`Update available: ${currentVersion} -> ${latestVersion}`);
    } else {
        logger.info(`Application is up to date (version ${currentVersion})`);
    }

    cachedUpdateCheckResult = {
        hasUpdate,
        currentVersion,
        latestVersion
    };

    return cachedUpdateCheckResult;
}

export function getCachedUpdateResult(): UpdateCheckResult | null {
    return cachedUpdateCheckResult;
}