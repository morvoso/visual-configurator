import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { ConfigStore } from './core/configStore';
import {
  CustomRunConfiguration,
  CustomTypeDefinition,
  DockerComposeConfiguration,
  DockerConfiguration,
  DotnetProjectConfiguration,
  NpmScriptConfiguration,
  RunConfiguration,
  DetectedDotnetProject,
  DetectedNpmPackage,
  LaunchSettingsProfile
} from './core/configTypes';
import { DotnetDiscoveryService } from './core/dotnetDiscoveryService';
import { ExecutionService } from './core/executionService';
import { FileSyncService } from './core/fileSyncService';
import { NpmDiscoveryService } from './core/npmDiscoveryService';
import {
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
    context.extensionUri
  );
  const statusBar = new ActiveConfigurationStatusBar(configStore);

  context.subscriptions.push(
    vscode.window.createTreeView('visualConfigurator.runConfigurations', {
      treeDataProvider: treeProvider,
      showCollapseAll: false
    }),
    statusBar,
    { dispose: () => executionService.dispose() }
  );

  // Watch .vscode/visual-configurator.json for external edits
  const wsFolder = vscode.workspace.workspaceFolders?.[0];
  if (wsFolder) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(wsFolder, '.vscode/visual-configurator.json')
    );
    watcher.onDidChange(() => {
      configStore.reload();
      treeProvider.refresh();
      statusBar.refresh();
    });
    context.subscriptions.push(watcher);
  }

  // Auto-populate on first run: silently discover .NET projects and npm scripts
  if (configStore.isFirstRun) {
    void autoPopulateDefaults(
      configStore,
      dotnetDiscoveryService,
      npmDiscoveryService
    ).then(() => {
      treeProvider.refresh();
      statusBar.refresh();
    });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('visualConfigurator.refresh', () => {
      treeProvider.refresh();
      statusBar.refresh();
    }),
    vscode.commands.registerCommand(
      'visualConfigurator.addConfiguration',
      async () => {
        interface AddConfigItem extends vscode.QuickPickItem {
          configKind?: 'dotnet-project' | 'dotnet-launch-profile' | 'npm-script' | 'docker' | 'docker-compose';
          customType?: CustomTypeDefinition;
        }

        const builtinItems: AddConfigItem[] = [
          {
            label: '$(symbol-class) .NET Project',
            description: 'Import a discovered .NET project',
            configKind: 'dotnet-project'
          },
          {
            label: '$(globe) .NET Launch Profile',
            description: 'Import from launchSettings.json',
            configKind: 'dotnet-launch-profile'
          },
          {
            label: '$(package) npm Script',
            description: 'Import a script from package.json',
            configKind: 'npm-script'
          },
          {
            label: '$(server-environment) Docker / Podman',
            description: 'Run a container image',
            configKind: 'docker'
          },
          {
            label: '$(layers) Docker / Podman Compose',
            description: 'Run services from a compose file',
            configKind: 'docker-compose'
          }
        ];

        const customTypes = configStore.listCustomTypes();
        const customItems: AddConfigItem[] = customTypes.map(ct => ({
          label: `$(${ct.icon ?? 'terminal'}) ${ct.label}`,
          description: ct.description,
          customType: ct
        }));

        const allItems: AddConfigItem[] = [...builtinItems];
        if (customItems.length > 0) {
          allItems.push({ label: 'Custom Types', kind: vscode.QuickPickItemKind.Separator });
          allItems.push(...customItems);
        }

        const choice = await vscode.window.showQuickPick(allItems, {
          title: 'Add Run Configuration',
          placeHolder: 'Select configuration type'
        });

        if (!choice) {
          return;
        }

        let configuration: RunConfiguration | undefined;

        if (choice.customType) {
          configuration = buildCustomConfiguration(choice.customType);
        } else {
          switch (choice.configKind) {
            case 'dotnet-project': {
              configuration = await pickDotnetProject(dotnetDiscoveryService);
              break;
            }
            case 'dotnet-launch-profile': {
              configuration = await pickLaunchProfile(dotnetDiscoveryService);
              break;
            }
            case 'npm-script': {
              configuration = await pickNpmScript(npmDiscoveryService);
              break;
            }
            case 'docker': {
              configuration = buildDockerConfiguration();
              break;
            }
            case 'docker-compose': {
              configuration = buildDockerComposeConfiguration();
              break;
            }
          }
        }

        if (!configuration) {
          return;
        }

        await configStore.upsert(configuration);
        await configStore.setActiveConfiguration(configuration.id);
        treeProvider.refresh();
        statusBar.refresh();

        await configEditorPanel.open(context, configuration, async updated => {
          await configStore.upsert(updated);
          treeProvider.refresh();
          statusBar.refresh();
        });
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
        treeProvider.refresh();
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
            'Add a run configuration first.'
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
            'Add a run configuration first.'
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
        treeProvider.refresh();
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
          treeProvider.refresh();
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
    ),
    vscode.commands.registerCommand(
      'visualConfigurator.manageCustomTypes',
      async () => {
        const filePath = configStore.getFilePath();
        if (!filePath) {
          void vscode.window.showErrorMessage(
            'Visual Configurator: open a workspace folder to manage configurations.'
          );
          return;
        }

        // Ensure the file exists before opening it
        const uri = vscode.Uri.file(filePath);
        try {
          await vscode.workspace.fs.stat(uri);
        } catch {
          // File doesn't exist yet — create a starter template
          const template = {
            version: 1,
            customTypes: [
              {
                id: 'my-custom-type',
                label: 'My Custom Type',
                description: 'A custom shell command template',
                icon: 'terminal',
                command: 'echo',
                defaultArgs: ['hello world'],
                defaultEnv: {}
              }
            ],
            configurations: configStore.list(),
            activeConfigurationId: configStore.getActiveConfigurationId()
          };
          await vscode.workspace.fs.writeFile(
            uri,
            Buffer.from(`${JSON.stringify(template, null, 2)}\n`, 'utf-8')
          );
        }

        await vscode.window.showTextDocument(uri);
      }
    )
  );

  statusBar.show();
}

async function pickDotnetProject(
  discoveryService: DotnetDiscoveryService
): Promise<DotnetProjectConfiguration | undefined> {
  const projects = await discoveryService.discover();

  if (projects.length === 0) {
    void vscode.window.showInformationMessage(
      'No .NET projects found in the workspace.'
    );
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    projects.map(project => ({
      label: project.name,
      description:
        project.targetFrameworks.join(', ') || project.projectKind,
      detail: project.projectPath,
      project
    })),
    { title: 'Select .NET Project' }
  );

  if (!picked) {
    return undefined;
  }

  return buildDotnetProjectConfiguration(picked.project);
}

async function pickLaunchProfile(
  discoveryService: DotnetDiscoveryService
): Promise<DotnetProjectConfiguration | undefined> {
  const projects = await discoveryService.discover();
  const withProfiles = projects.filter(
    project => project.launchProfiles.length > 0
  );

  if (withProfiles.length === 0) {
    void vscode.window.showInformationMessage(
      'No .NET projects with launch profiles found.'
    );
    return undefined;
  }

  const pickedProject = await vscode.window.showQuickPick(
    withProfiles.map(project => ({
      label: project.name,
      detail: project.projectPath,
      project
    })),
    { title: 'Select .NET Project' }
  );

  if (!pickedProject) {
    return undefined;
  }

  const pickedProfile = await vscode.window.showQuickPick(
    pickedProject.project.launchProfiles.map(profile => ({
      label: profile.name,
      description: profile.applicationUrl ?? '',
      profile
    })),
    { title: 'Select Launch Profile' }
  );

  if (!pickedProfile) {
    return undefined;
  }

  return buildLaunchProfileConfiguration(
    pickedProject.project,
    pickedProfile.profile
  );
}

async function pickNpmScript(
  discoveryService: NpmDiscoveryService
): Promise<NpmScriptConfiguration | undefined> {
  const packages = await discoveryService.discover();

  if (packages.length === 0) {
    void vscode.window.showInformationMessage(
      'No npm packages found in the workspace.'
    );
    return undefined;
  }

  const scriptItems = packages.flatMap(pkg =>
    pkg.scripts.map(script => ({
      label: script.scriptName,
      description: `${pkg.displayName} (${pkg.packageManager})`,
      detail: script.command,
      packageInfo: pkg,
      scriptName: script.scriptName
    }))
  );

  if (scriptItems.length === 0) {
    void vscode.window.showInformationMessage('No npm scripts found.');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(scriptItems, {
    title: 'Select npm Script'
  });

  if (!picked) {
    return undefined;
  }

  return buildNpmScriptConfiguration(
    picked.packageInfo,
    picked.scriptName
  );
}

function buildDotnetProjectConfiguration(
  project: DetectedDotnetProject
): DotnetProjectConfiguration {
  return {
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
}

function buildLaunchProfileConfiguration(
  project: DetectedDotnetProject,
  profile: LaunchSettingsProfile
): DotnetProjectConfiguration {
  return {
    id: randomUUID(),
    name: `${project.name} (${profile.name})`,
    kind: 'dotnet-launch-profile',
    workspaceFolder: project.workspaceFolder.uri.fsPath,
    workingDirectory: path.dirname(project.projectPath),
    environment: profile.environmentVariables,
    allowMultipleInstances: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectPath: project.projectPath,
    targetFramework: project.targetFrameworks[0],
    programArgs: profile.commandLineArgs,
    runtimeArgs: [],
    console: 'integratedTerminal',
    launchBrowser: profile.launchBrowser,
    launchUrlPath: profile.applicationUrl,
    launchSettingsProfile: profile.name
  };
}

function buildNpmScriptConfiguration(
  packageInfo: DetectedNpmPackage,
  scriptName: string
): NpmScriptConfiguration {
  return {
    id: randomUUID(),
    name: `${packageInfo.displayName}: ${scriptName}`,
    kind: 'npm-script',
    workspaceFolder: packageInfo.workspaceFolder.uri.fsPath,
    workingDirectory: path.dirname(packageInfo.packageJsonPath),
    environment: {},
    allowMultipleInstances: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packageJsonPath: packageInfo.packageJsonPath,
    packageManager: packageInfo.packageManager,
    script: scriptName,
    scriptArgs: []
  };
}

function buildDockerConfiguration(): DockerConfiguration {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspaceFolder = workspaceFolders?.[0]?.uri.fsPath ?? '';

  return {
    id: randomUUID(),
    name: 'Docker Container',
    kind: 'docker',
    workspaceFolder,
    workingDirectory: workspaceFolder,
    environment: {},
    allowMultipleInstances: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    containerRuntime: 'docker',
    image: '',
    command: '',
    containerArgs: [],
    ports: [],
    volumes: []
  };
}

function buildDockerComposeConfiguration(): DockerComposeConfiguration {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspaceFolder = workspaceFolders?.[0]?.uri.fsPath ?? '';

  return {
    id: randomUUID(),
    name: 'Docker Compose',
    kind: 'docker-compose',
    workspaceFolder,
    workingDirectory: workspaceFolder,
    environment: {},
    allowMultipleInstances: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    containerRuntime: 'docker',
    composeFilePath: 'docker-compose.yml',
    downOnStop: false,
    services: [],
    profiles: [],
    composeArgs: [],
    upArgs: []
  };
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

function buildCustomConfiguration(
  typeDef: CustomTypeDefinition
): CustomRunConfiguration {
  const workspaceFolder =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

  return {
    id: randomUUID(),
    name: typeDef.label,
    kind: 'custom',
    typeId: typeDef.id,
    typeLabel: typeDef.label,
    command: typeDef.command,
    args: [...typeDef.defaultArgs],
    workspaceFolder,
    workingDirectory: workspaceFolder,
    environment: { ...typeDef.defaultEnv },
    allowMultipleInstances: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Called on first activation when no configs exist yet.
 * Silently discovers .NET projects and npm scripts and adds them to the store.
 */
async function autoPopulateDefaults(
  configStore: ConfigStore,
  dotnetDiscovery: DotnetDiscoveryService,
  npmDiscovery: NpmDiscoveryService
): Promise<void> {
  const [dotnetProjects, npmPackages] = await Promise.all([
    dotnetDiscovery.discover().catch(() => []),
    npmDiscovery.discover().catch(() => [])
  ]);

  const configurations: RunConfiguration[] = [
    ...dotnetProjects.map(project => buildDotnetProjectConfiguration(project)),
    ...npmPackages.flatMap(pkg =>
      pkg.scripts.map(script =>
        buildNpmScriptConfiguration(pkg, script.scriptName)
      )
    )
  ];

  for (const config of configurations) {
    await configStore.upsert(config);
  }
}
