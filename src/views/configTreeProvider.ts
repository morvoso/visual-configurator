import * as vscode from 'vscode';

import { ConfigStore } from '../core/configStore';
import { RunConfiguration } from '../core/configTypes';

export interface SavedConfigurationNode {
  type: 'savedConfiguration';
  configuration: RunConfiguration;
}

export class RunConfigurationsTreeProvider
  implements vscode.TreeDataProvider<SavedConfigurationNode>
{
  private readonly onDidChangeTreeDataEmitter =
    new vscode.EventEmitter<SavedConfigurationNode | undefined>();

  public readonly onDidChangeTreeData =
    this.onDidChangeTreeDataEmitter.event;

  public constructor(
    private readonly configStore: ConfigStore,
    private readonly extensionUri: vscode.Uri
  ) {}

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: SavedConfigurationNode): vscode.TreeItem {
    const activeId = this.configStore.getActiveConfigurationId();
    const isActive = activeId === element.configuration.id;
    const kindLabel = describeKind(element.configuration);

    const item = new vscode.TreeItem(
      element.configuration.name,
      vscode.TreeItemCollapsibleState.None
    );

    item.contextValue = 'savedConfiguration';
    item.description = isActive ? `● ${kindLabel}` : kindLabel;
    item.iconPath = this.getIconForKind(element.configuration);
    item.tooltip = createTooltip(element.configuration, isActive);
    item.command = {
      command: 'visualConfigurator.setActiveConfiguration',
      title: 'Set Active Configuration',
      arguments: [element]
    };

    return item;
  }

  public getChildren(
    element?: SavedConfigurationNode
  ): SavedConfigurationNode[] {
    if (element) {
      return [];
    }

    return this.configStore.list().map(configuration => ({
      type: 'savedConfiguration' as const,
      configuration
    }));
  }

  private getIconForKind(
    configuration: RunConfiguration
  ): { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon {
    if (configuration.kind === 'custom') {
      const typeDef = this.configStore.getCustomType(configuration.typeId);
      return new vscode.ThemeIcon(typeDef?.icon ?? 'terminal');
    }

    const base =
      configuration.kind === 'npm-script'
        ? 'npm'
        : configuration.kind === 'docker'
          ? 'docker'
          : configuration.kind === 'docker-compose'
            ? 'compose'
            : 'dotnet';

    return {
      light: vscode.Uri.joinPath(
        this.extensionUri,
        'resources',
        'icons',
        `${base}-light.svg`
      ),
      dark: vscode.Uri.joinPath(
        this.extensionUri,
        'resources',
        'icons',
        `${base}-dark.svg`
      )
    };
  }
}

function describeKind(configuration: RunConfiguration): string {
  switch (configuration.kind) {
    case 'npm-script':
      return `npm: ${configuration.script}`;
    case 'dotnet-launch-profile':
      return `.NET: ${configuration.launchSettingsProfile}`;
    case 'dotnet-project':
      return '.NET project';
    case 'docker':
      return `${configuration.containerRuntime}: ${configuration.image}`;
    case 'docker-compose':
      return `${configuration.containerRuntime} compose`;
    case 'custom':
      return configuration.typeLabel;
  }
}

function createTooltip(
  configuration: RunConfiguration,
  isActive: boolean
): string {
  const lines = [configuration.name, describeKind(configuration)];

  if (isActive) {
    lines.push('● Active configuration');
  }

  lines.push(configuration.workingDirectory);
  return lines.join('\n');
}