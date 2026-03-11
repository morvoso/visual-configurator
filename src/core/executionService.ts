import * as path from 'node:path';
import * as vscode from 'vscode';

import {
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
    if (!debugSessionName) {
      return;
    }

    const matchingSessions = [
      ...(this.debugSessionsByName.get(debugSessionName) ?? new Set())
    ];
    for (const session of matchingSessions) {
      await vscode.debug.stopDebugging(session);
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
}