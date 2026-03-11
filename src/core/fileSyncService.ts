import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  DotnetProjectConfiguration,
  NpmScriptConfiguration,
  RunConfiguration
} from './configTypes';

interface LaunchJson {
  version: string;
  configurations: vscode.DebugConfiguration[];
}

interface TasksJson {
  version: string;
  tasks: Array<Record<string, unknown>>;
}

export class FileSyncService {
  public async sync(configurations: RunConfiguration[]): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('Open a workspace folder before syncing launch/tasks files.');
    }

    const vscodeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
    await vscode.workspace.fs.createDirectory(vscodeDir);

    const launchJson = this.createLaunchJson(configurations);
    const tasksJson = this.createTasksJson(configurations);

    const launchPath = vscode.Uri.joinPath(vscodeDir, 'launch.json');
    const tasksPath = vscode.Uri.joinPath(vscodeDir, 'tasks.json');

    await vscode.workspace.fs.writeFile(
      launchPath,
      Buffer.from(`${JSON.stringify(launchJson, null, 2)}\n`, 'utf8')
    );

    await vscode.workspace.fs.writeFile(
      tasksPath,
      Buffer.from(`${JSON.stringify(tasksJson, null, 2)}\n`, 'utf8')
    );
  }

  private createLaunchJson(configurations: RunConfiguration[]): LaunchJson {
    const launchConfigurations = configurations.flatMap(configuration => {
      switch (configuration.kind) {
        case 'dotnet-project':
        case 'dotnet-launch-profile':
          return [this.createDotnetLaunchConfiguration(configuration)];
        case 'npm-script':
          return [this.createNpmLaunchConfiguration(configuration)];
      }
    });

    return {
      version: '0.2.0',
      configurations: launchConfigurations
    };
  }

  private createTasksJson(configurations: RunConfiguration[]): TasksJson {
    const tasks = configurations.map(configuration => {
      switch (configuration.kind) {
        case 'dotnet-project':
        case 'dotnet-launch-profile':
          return this.createDotnetTaskDefinition(configuration);
        case 'npm-script':
          return this.createNpmTaskDefinition(configuration);
      }
    });

    return {
      version: '2.0.0',
      tasks
    };
  }

  private createDotnetLaunchConfiguration(
    configuration: DotnetProjectConfiguration
  ): vscode.DebugConfiguration {
    const projectName = path.basename(configuration.projectPath, '.csproj');
    const framework = configuration.targetFramework ?? 'net8.0';
    const program = path.join(
      path.dirname(configuration.projectPath),
      'bin',
      'Debug',
      framework,
      `${projectName}.dll`
    );

    const debugConfiguration: vscode.DebugConfiguration = {
      name: configuration.name,
      type: 'coreclr',
      request: 'launch',
      program,
      cwd: configuration.workingDirectory,
      args: configuration.programArgs,
      env: configuration.environment,
      console: configuration.console,
      preLaunchTask: this.taskLabelFor(configuration)
    };

    if (configuration.launchBrowser) {
      debugConfiguration.serverReadyAction = {
        action: 'openExternally',
        pattern: '\\bNow listening on:\\s+(https?://\\S+)',
        uriFormat: configuration.launchUrlPath
      };
    }

    return debugConfiguration;
  }

  private createNpmLaunchConfiguration(
    configuration: NpmScriptConfiguration
  ): vscode.DebugConfiguration {
    const runtimeArgs = ['run', configuration.script];
    if (configuration.scriptArgs.length > 0) {
      runtimeArgs.push('--', ...configuration.scriptArgs);
    }

    return {
      name: configuration.name,
      type: 'pwa-node',
      request: 'launch',
      runtimeExecutable: configuration.packageManager,
      runtimeArgs,
      cwd: path.dirname(configuration.packageJsonPath),
      env: configuration.environment,
      console: 'integratedTerminal',
      preLaunchTask: this.taskLabelFor(configuration),
      autoAttachChildProcesses: true
    };
  }

  private createDotnetTaskDefinition(
    configuration: DotnetProjectConfiguration
  ): Record<string, unknown> {
    const args: string[] = ['run', '--project', configuration.projectPath];

    if (configuration.targetFramework) {
      args.push('--framework', configuration.targetFramework);
    }

    if (
      configuration.kind === 'dotnet-launch-profile' &&
      configuration.launchSettingsProfile
    ) {
      args.push('--launch-profile', configuration.launchSettingsProfile);
    }

    if (configuration.runtimeArgs.length > 0) {
      args.push(...configuration.runtimeArgs);
    }

    if (configuration.programArgs.length > 0) {
      args.push('--', ...configuration.programArgs);
    }

    return {
      label: this.taskLabelFor(configuration),
      type: 'shell',
      command: 'dotnet',
      args,
      options: {
        cwd: configuration.workingDirectory,
        env: configuration.environment
      },
      problemMatcher: []
    };
  }

  private createNpmTaskDefinition(
    configuration: NpmScriptConfiguration
  ): Record<string, unknown> {
    const args: string[] = ['run', configuration.script];
    if (configuration.scriptArgs.length > 0) {
      args.push('--', ...configuration.scriptArgs);
    }

    return {
      label: this.taskLabelFor(configuration),
      type: 'shell',
      command: configuration.packageManager,
      args,
      options: {
        cwd: path.dirname(configuration.packageJsonPath),
        env: configuration.environment
      },
      problemMatcher: []
    };
  }

  private taskLabelFor(configuration: RunConfiguration): string {
    return `visualConfigurator:${configuration.name}`;
  }
}
