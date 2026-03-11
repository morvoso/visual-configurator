import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { ConfigStore } from './core/configStore';
import {
  DotnetProjectConfiguration,
  NpmScriptConfiguration,
  RunConfiguration
} from './core/configTypes';
import { DotnetDiscoveryService } from './core/dotnetDiscoveryService';
import { ExecutionService } from './core/executionService';
import { FileSyncService } from './core/fileSyncService';
import { NpmDiscoveryService } from './core/npmDiscoveryService';
import {
  DotnetProjectNode,
  LaunchProfileNode,
  NpmScriptNode,
  RunConfigurationsTreeProvider,
  SavedConfigurationNode
} from './views/configTreeProvider';
import { ConfigEditorPanel } from './views/configEditorPanel';
import { ActiveConfigurationStatusBar } from './views/statusBar';

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const configStore = new ConfigStore(context.workspaceState);
  const dotnetDiscoveryService = new DotnetDiscoveryService();
  const npmDiscoveryService = new NpmDiscoveryService();
  const executionService = new ExecutionService();
  const fileSyncService = new FileSyncService();
  const configEditorPanel = new ConfigEditorPanel();
  const treeProvider = new RunConfigurationsTreeProvider(
    configStore,
    dotnetDiscoveryService,
    npmDiscoveryService
  );
  const statusBar = new ActiveConfigurationStatusBar(configStore);

  context.subscriptions.push(
    vscode.window.createTreeView('visualConfigurator.runConfigurations', {
      treeDataProvider: treeProvider,
      showCollapseAll: true
    }),
    statusBar,
    { dispose: () => executionService.dispose() }
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualConfigurator.refresh', async () => {
      await treeProvider.refresh();
      statusBar.refresh();
    }),
    vscode.commands.registerCommand(
      'visualConfigurator.importDotnetProject',
      async (node: DotnetProjectNode) => {
        const project = node.project;
        const configuration: DotnetProjectConfiguration = {
          id: randomUUID(),
          name: project.name,
          kind: 'dotnet-project',
          workspaceFolder: project.workspaceFolder.uri.fsPath,
          workingDirectory: path.dirname(project.projectPath),
          environment: {},
          allowMultipleInstances: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          projectPath: project.projectPath,
          targetFramework: project.targetFrameworks[0],
          programArgs: [],
          runtimeArgs: [],
          console: 'integratedTerminal',
          launchBrowser: project.projectKind === 'web'
        };

        await configStore.upsert(configuration);
        await configStore.setActiveConfiguration(configuration.id);
        await treeProvider.refresh();
        statusBar.refresh();
      }
    ),
    vscode.commands.registerCommand(
      'visualConfigurator.importLaunchProfile',
      async (node: LaunchProfileNode) => {
        const configuration: DotnetProjectConfiguration = {
          id: randomUUID(),
          name: `${node.project.name} (${node.profile.name})`,
          kind: 'dotnet-launch-profile',
          workspaceFolder: node.project.workspaceFolder.uri.fsPath,
          workingDirectory: path.dirname(node.project.projectPath),
          environment: node.profile.environmentVariables,
          allowMultipleInstances: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          projectPath: node.project.projectPath,
          targetFramework: node.project.targetFrameworks[0],
          programArgs: node.profile.commandLineArgs,
          runtimeArgs: [],
          console: 'integratedTerminal',
          launchBrowser: node.profile.launchBrowser,
          launchUrlPath: node.profile.applicationUrl,
          launchSettingsProfile: node.profile.name
        };

        await configStore.upsert(configuration);
        await configStore.setActiveConfiguration(configuration.id);
        await treeProvider.refresh();
        statusBar.refresh();
      }
    ),
    vscode.commands.registerCommand(
      'visualConfigurator.importNpmScript',
      async (node: NpmScriptNode) => {
        const configuration: NpmScriptConfiguration = {
          id: randomUUID(),
          name: `${node.packageInfo.displayName}: ${node.scriptName}`,
          kind: 'npm-script',
          workspaceFolder: node.packageInfo.workspaceFolder.uri.fsPath,
          workingDirectory: path.dirname(node.packageInfo.packageJsonPath),
          environment: {},
          allowMultipleInstances: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          packageJsonPath: node.packageInfo.packageJsonPath,
          packageManager: node.packageInfo.packageManager,
          script: node.scriptName,
          scriptArgs: []
        };

        await configStore.upsert(configuration);
        await configStore.setActiveConfiguration(configuration.id);
        await treeProvider.refresh();
        statusBar.refresh();
      }
    ),
    vscode.commands.registerCommand(
      'visualConfigurator.setActiveConfiguration',
      async (node?: SavedConfigurationNode) => {
        const configuration = await resolveConfigurationSelection(
          configStore,
          node?.configuration
        );

        if (!configuration) {
          return;
        }

        await configStore.setActiveConfiguration(configuration.id);
        statusBar.refresh();
        await treeProvider.refresh();
      }
    ),
    vscode.commands.registerCommand(
      'visualConfigurator.runConfiguration',
      async (node?: SavedConfigurationNode) => {
        const configuration = await resolveConfigurationSelection(
          configStore,
          node?.configuration
        );

        if (!configuration) {
          void vscode.window.showInformationMessage(
            'Import a .NET project, launch profile, or npm script first.'
          );
          return;
        }

        await configStore.setActiveConfiguration(configuration.id);
        statusBar.refresh();
        await executionService.run(configuration);
      }
    ),
    vscode.commands.registerCommand(
      'visualConfigurator.debugConfiguration',
      async (node?: SavedConfigurationNode) => {
        const configuration = await resolveConfigurationSelection(
          configStore,
          node?.configuration
        );

        if (!configuration) {
          void vscode.window.showInformationMessage(
            'Import a .NET project, launch profile, or npm script first.'
          );
          return;
        }

        await configStore.setActiveConfiguration(configuration.id);
        statusBar.refresh();
        const started = await executionService.debug(configuration);
        if (!started) {
          void vscode.window.showWarningMessage(
            'Could not start a debug session for the selected configuration.'
          );
        }
      }
    ),
    vscode.commands.registerCommand(
      'visualConfigurator.deleteConfiguration',
      async (node?: SavedConfigurationNode) => {
        const configuration = await resolveConfigurationSelection(
          configStore,
          node?.configuration
        );

        if (!configuration) {
          return;
        }

        const confirmation = await vscode.window.showWarningMessage(
          `Delete configuration ${configuration.name}?`,
          { modal: true },
          'Delete'
        );

        if (confirmation !== 'Delete') {
          return;
        }

        await configStore.remove(configuration.id);
        await treeProvider.refresh();
        statusBar.refresh();
      }
    ),
    vscode.commands.registerCommand(
      'visualConfigurator.editConfiguration',
      async (node?: SavedConfigurationNode) => {
        const configuration = await resolveConfigurationSelection(
          configStore,
          node?.configuration
        );

        if (!configuration) {
          return;
        }

        await configEditorPanel.open(context, configuration, async updated => {
          await configStore.upsert(updated);
          await treeProvider.refresh();
          statusBar.refresh();
        });
      }
    ),
    vscode.commands.registerCommand(
      'visualConfigurator.stopConfiguration',
      async (node?: SavedConfigurationNode) => {
        const configuration = await resolveConfigurationSelection(
          configStore,
          node?.configuration
        );

        if (!configuration) {
          return;
        }

        await executionService.stop(configuration);
      }
    ),
    vscode.commands.registerCommand(
      'visualConfigurator.syncWorkspaceFiles',
      async () => {
        const configurations = configStore.list();
        if (configurations.length === 0) {
          void vscode.window.showInformationMessage(
            'No saved configurations to sync.'
          );
          return;
        }

        await fileSyncService.sync(configurations);
        void vscode.window.showInformationMessage(
          'Synced .vscode/launch.json and .vscode/tasks.json.'
        );
      }
    )
  );

  statusBar.show();
  await treeProvider.refresh();
}

async function resolveConfigurationSelection(
  configStore: ConfigStore,
  preferred?: RunConfiguration
): Promise<RunConfiguration | undefined> {
  if (preferred) {
    return preferred;
  }

  const configurations = configStore.list();
  if (configurations.length === 0) {
    return undefined;
  }

  if (configurations.length === 1) {
    return configurations[0];
  }

  const picked = await vscode.window.showQuickPick(
    configurations.map(configuration => ({
      label: configuration.name,
      description: configuration.kind,
      configuration
    })),
    {
      title: 'Select Run Configuration'
    }
  );

  return picked?.configuration;
}