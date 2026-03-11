import { LaunchSettingsProfile } from './configTypes';

interface RawLaunchProfile {
  commandName?: string;
  commandLineArgs?: string;
  launchBrowser?: boolean;
  applicationUrl?: string;
  environmentVariables?: Record<string, string>;
}

interface RawLaunchSettings {
  profiles?: Record<string, RawLaunchProfile>;
}

export function parseLaunchSettings(
  content: string
): LaunchSettingsProfile[] {
  const parsed = JSON.parse(content) as RawLaunchSettings;

  return Object.entries(parsed.profiles ?? {})
    .filter(([, profile]) => profile.commandName === 'Project')
    .map(([name, profile]) => ({
      name,
      commandLineArgs: splitArgs(profile.commandLineArgs ?? ''),
      launchBrowser: profile.launchBrowser ?? false,
      applicationUrl: profile.applicationUrl,
      environmentVariables: profile.environmentVariables ?? {}
    }));
}

function splitArgs(value: string): string[] {
  return value
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}