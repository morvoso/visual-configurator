import * as vscode from 'vscode';

export type ConfigurationKind =
  | 'dotnet-project'
  | 'dotnet-launch-profile'
  | 'npm-script';

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

export interface BaseRunConfiguration {
  id: string;
  name: string;
  kind: ConfigurationKind;
  workspaceFolder: string;
  workingDirectory: string;
  environment: Record<string, string>;
  allowMultipleInstances: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DotnetProjectConfiguration extends BaseRunConfiguration {
  kind: 'dotnet-project' | 'dotnet-launch-profile';
  projectPath: string;
  targetFramework?: string;
  programArgs: string[];
  runtimeArgs: string[];
  console: 'internalConsole' | 'integratedTerminal';
  launchBrowser: boolean;
  launchUrlPath?: string;
  launchSettingsProfile?: string;
}

export interface NpmScriptConfiguration extends BaseRunConfiguration {
  kind: 'npm-script';
  packageJsonPath: string;
  packageManager: PackageManager;
  script: string;
  scriptArgs: string[];
}

export type RunConfiguration =
  | DotnetProjectConfiguration
  | NpmScriptConfiguration;

export interface LaunchSettingsProfile {
  name: string;
  commandLineArgs: string[];
  launchBrowser: boolean;
  applicationUrl?: string;
  environmentVariables: Record<string, string>;
}

export interface DetectedDotnetProject {
  type: 'dotnetProject';
  workspaceFolder: vscode.WorkspaceFolder;
  projectPath: string;
  name: string;
  targetFrameworks: string[];
  projectKind: 'web' | 'console' | 'library' | 'unknown';
  launchProfiles: LaunchSettingsProfile[];
}

export interface DetectedNpmPackage {
  workspaceFolder: vscode.WorkspaceFolder;
  packageJsonPath: string;
  displayName: string;
  packageManager: PackageManager;
  scripts: DetectedNpmScript[];
}

export interface DetectedNpmScript {
  type: 'npmScript';
  workspaceFolder: vscode.WorkspaceFolder;
  packageJsonPath: string;
  packageManager: PackageManager;
  packageDisplayName: string;
  scriptName: string;
  command: string;
}

export interface PersistedConfigState {
  activeConfigurationId?: string;
  configurations: RunConfiguration[];
}