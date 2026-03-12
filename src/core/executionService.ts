import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  CustomRunConfiguration,
  DockerComposeConfiguration,
  DockerConfiguration,
  DotnetProjectConfiguration,
  NpmScriptConfiguration,
  RunConfiguration
} from './configTypes';

export class ExecutionService {
  private readonly runningTaskExecutions = new Map<string, vscode.TaskExecution[]>();
  private readonly debugSessionNames = new Map<string, string>();
  private readonly debugSessionsByName = new Map<string, Set<vscode.DebugSession>>();
  private readonly disposables: vscode.Disposable[];

  public constructor() {
    this.disposables = [
      vscode.debug.onDidStartDebugSession(session => {
        const sessions = this.debugSessionsByName.get(session.name) ?? new Set();
        sessions.add(session);
        this.debugSessionsByName.set(session.name, sessions);
      }),
      vscode.debug.onDidTerminateDebugSession(session => {
        const sessions = this.debugSessionsByName.get(session.name);
        if (!sessions) {
          return;
        }

        sessions.delete(session);
        if (sessions.size === 0) {
          this.debugSessionsByName.delete(session.name);
        }
      })
    ];
  }

  public async run(configuration: RunConfiguration): Promise<void> {
    const task = this.createTask(configuration);
    const execution = await vscode.tasks.executeTask(task);
    const executions = this.runningTaskExecutions.get(configuration.id) ?? [];
    executions.push(execution);
    this.runningTaskExecutions.set(configuration.id, executions);

    const disposable = vscode.tasks.onDidEndTask(event => {
      if (event.execution !== execution) {
        return;
      }

      const remainingExecutions =
        this.runningTaskExecutions
          .get(configuration.id)
          ?.filter(current => current !== execution) ?? [];
      this.runningTaskExecutions.set(configuration.id, remainingExecutions);
      disposable.dispose();
    });
  }

  public async debug(configuration: RunConfiguration): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.find(
      folder => folder.uri.fsPath === configuration.workspaceFolder
    );

    if (!workspaceFolder) {
      return false;
    }

    const debugConfiguration = this.createDebugConfiguration(configuration);
    if (!debugConfiguration) {
      return false;
    }

    this.debugSessionNames.set(configuration.id, debugConfiguration.name as string);

    return vscode.debug.startDebugging(workspaceFolder, debugConfiguration);
  }

  public async stop(configuration: RunConfiguration): Promise<void> {
    const executions = this.runningTaskExecutions.get(configuration.id) ?? [];
    for (const execution of executions) {
      execution.terminate();
    }
    this.runningTaskExecutions.set(configuration.id, []);

    const debugSessionName = this.debugSessionNames.get(configuration.id);
    if (debugSessionName) {
      const matchingSessions = [
        ...(this.debugSessionsByName.get(debugSessionName) ?? new Set())
      ];
      for (const session of matchingSessions) {
        await vscode.debug.stopDebugging(session);
      }
    }

    if (configuration.kind === 'docker-compose' && configuration.downOnStop) {
      const downTask = this.createDockerComposeDownTask(configuration);
      await vscode.tasks.executeTask(downTask);
    }
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private createTask(configuration: RunConfiguration): vscode.Task {
    switch (configuration.kind) {
      case 'dotnet-project':
      case 'dotnet-launch-profile':
        return this.createDotnetTask(configuration);
      case 'npm-script':
        return this.createNpmTask(configuration);
      case 'docker':
        return this.createDockerTask(configuration);
      case 'docker-compose':
        return this.createDockerComposeTask(configuration);
      case 'custom':
        return this.createCustomTask(configuration);
    }
  }

  private createDotnetTask(
    configuration: DotnetProjectConfiguration
  ): vscode.Task {
    const args = ['run', '--project', configuration.projectPath];

    if (configuration.targetFramework) {
      args.push('--framework', configuration.targetFramework);
    }

    if (configuration.kind === 'dotnet-launch-profile' && configuration.launchSettingsProfile) {
      args.push('--launch-profile', configuration.launchSettingsProfile);
    }

    if (configuration.runtimeArgs.length > 0) {
      args.push(...configuration.runtimeArgs);
    }

    if (configuration.programArgs.length > 0) {
      args.push('--', ...configuration.programArgs);
    }

    const execution = new vscode.ProcessExecution('dotnet', args, {
      cwd: configuration.workingDirectory,
      env: configuration.environment
    });

    return new vscode.Task(
      {
        type: 'process',
        name: configuration.name
      },
      vscode.TaskScope.Workspace,
      configuration.name,
      'Visual Configurator',
      execution
    );
  }

  private createNpmTask(
    configuration: NpmScriptConfiguration
  ): vscode.Task {
    const args = ['run', configuration.script];

    if (configuration.scriptArgs.length > 0) {
      args.push('--', ...configuration.scriptArgs);
    }

    const execution = new vscode.ProcessExecution(
      configuration.packageManager,
      args,
      {
        cwd: path.dirname(configuration.packageJsonPath),
        env: configuration.environment
      }
    );

    return new vscode.Task(
      {
        type: 'process',
        name: configuration.name
      },
      vscode.TaskScope.Workspace,
      configuration.name,
      'Visual Configurator',
      execution
    );
  }

  private createDebugConfiguration(
    configuration: RunConfiguration
  ): vscode.DebugConfiguration | undefined {
    switch (configuration.kind) {
      case 'dotnet-project':
      case 'dotnet-launch-profile':
        return this.createDotnetDebugConfiguration(configuration);
      case 'npm-script':
        return this.createNpmDebugConfiguration(configuration);
      case 'docker':
      case 'docker-compose':
      case 'custom':
        return undefined;
    }
  }

  private createDotnetDebugConfiguration(
    configuration: DotnetProjectConfiguration
  ): vscode.DebugConfiguration {
    const projectBaseName = path.basename(configuration.projectPath, '.csproj');
    const targetFramework = configuration.targetFramework ?? 'net8.0';
    const programPath = path.join(
      path.dirname(configuration.projectPath),
      'bin',
      'Debug',
      targetFramework,
      `${projectBaseName}.dll`
    );

    const debugConfiguration: vscode.DebugConfiguration = {
      type: 'coreclr',
      name: `${configuration.name} (Debug)`,
      request: 'launch',
      program: programPath,
      cwd: configuration.workingDirectory,
      args: configuration.programArgs,
      env: configuration.environment,
      console: configuration.console
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

  private createNpmDebugConfiguration(
    configuration: NpmScriptConfiguration
  ): vscode.DebugConfiguration {
    const runtimeArgs = ['run', configuration.script];

    if (configuration.scriptArgs.length > 0) {
      runtimeArgs.push('--', ...configuration.scriptArgs);
    }

    return {
      type: 'pwa-node',
      name: `${configuration.name} (Debug)`,
      request: 'launch',
      runtimeExecutable: configuration.packageManager,
      runtimeArgs,
      cwd: path.dirname(configuration.packageJsonPath),
      env: configuration.environment,
      console: 'integratedTerminal',
      autoAttachChildProcesses: true
    };
  }

  private createCustomTask(
    configuration: CustomRunConfiguration
  ): vscode.Task {
    const execution = new vscode.ShellExecution(
      configuration.command,
      configuration.args,
      {
        cwd: configuration.workingDirectory,
        env: configuration.environment
      }
    );

    return new vscode.Task(
      { type: 'shell', name: configuration.name },
      vscode.TaskScope.Workspace,
      configuration.name,
      'Visual Configurator',
      execution
    );
  }

  private createDockerTask(
    configuration: DockerConfiguration
  ): vscode.Task {
    const runtime = configuration.containerRuntime;
    const args = ['run', '--rm'];

    for (const port of configuration.ports) {
      args.push('-p', port);
    }

    for (const volume of configuration.volumes) {
      args.push('-v', volume);
    }

    for (const [key, value] of Object.entries(configuration.environment)) {
      args.push('-e', `${key}=${value}`);
    }

    args.push(...configuration.containerArgs);
    args.push(configuration.image);

    if (configuration.command) {
      args.push(...configuration.command.split(/\s+/));
    }

    const execution = new vscode.ProcessExecution(runtime, args, {
      cwd: configuration.workingDirectory
    });

    return new vscode.Task(
      {
        type: 'process',
        name: configuration.name
      },
      vscode.TaskScope.Workspace,
      configuration.name,
      'Visual Configurator',
      execution
    );
  }

  private createDockerComposeTask(
    configuration: DockerComposeConfiguration
  ): vscode.Task {
    const runtime = configuration.containerRuntime;
    const args = ['compose', '-f', configuration.composeFilePath];

    for (const arg of configuration.composeArgs) {
      args.push(arg);
    }

    for (const profile of configuration.profiles) {
      args.push('--profile', profile);
    }

    args.push('up');

    for (const arg of configuration.upArgs) {
      args.push(arg);
    }

    if (configuration.services.length > 0) {
      args.push(...configuration.services);
    }

    const execution = new vscode.ProcessExecution(runtime, args, {
      cwd: configuration.workingDirectory,
      env: configuration.environment
    });

    return new vscode.Task(
      {
        type: 'process',
        name: configuration.name
      },
      vscode.TaskScope.Workspace,
      configuration.name,
      'Visual Configurator',
      execution
    );
  }

  private createDockerComposeDownTask(
    configuration: DockerComposeConfiguration
  ): vscode.Task {
    const runtime = configuration.containerRuntime;
    const args = ['compose', '-f', configuration.composeFilePath];

    for (const arg of configuration.composeArgs) {
      args.push(arg);
    }

    for (const profile of configuration.profiles) {
      args.push('--profile', profile);
    }

    args.push('down');

    const execution = new vscode.ProcessExecution(runtime, args, {
      cwd: configuration.workingDirectory,
      env: configuration.environment
    });

    return new vscode.Task(
      {
        type: 'process',
        name: `${configuration.name}:down`
      },
      vscode.TaskScope.Workspace,
      `${configuration.name}:down`,
      'Visual Configurator',
      execution
    );
  }
}