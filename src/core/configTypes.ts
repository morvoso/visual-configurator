import * as vscode from 'vscode';

export type ConfigurationKind =
  | 'dotnet-project'
  | 'dotnet-launch-profile'
  | 'npm-script'
  | 'docker'
  | 'docker-compose';

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

export type ContainerRuntime = 'docker' | 'podman';

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
  captureOutput?: boolean;
  showTimestamps?: boolean;
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

export interface DockerConfiguration extends BaseRunConfiguration {
  kind: 'docker';
  containerRuntime: ContainerRuntime;
  image: string;
  command: string;
  containerArgs: string[];
  ports: string[];
  volumes: string[];
  buildContext?: string;
  dockerfile?: string;
}

export interface DockerComposeConfiguration extends BaseRunConfiguration {
  kind: 'docker-compose';
  containerRuntime: ContainerRuntime;
  composeFilePath: string;
  services: string[];
  profiles: string[];
  composeArgs: string[];
  upArgs: string[];
}

export type RunConfiguration =
  | DotnetProjectConfiguration
  | NpmScriptConfiguration
  | DockerConfiguration
  | DockerComposeConfiguration;

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