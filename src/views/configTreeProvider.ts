import * as path from 'node:path';
import * as vscode from 'vscode';

import { ConfigStore } from '../core/configStore';
import {
  DetectedDotnetProject,
  DetectedNpmPackage,
  LaunchSettingsProfile,
  RunConfiguration
} from '../core/configTypes';
import { DotnetDiscoveryService } from '../core/dotnetDiscoveryService';
import { NpmDiscoveryService } from '../core/npmDiscoveryService';

type TreeNode =
  | GroupNode
  | SavedConfigurationNode
  | DotnetProjectNode
  | LaunchProfileNode
  | NpmPackageNode
  | NpmScriptNode;

interface GroupNode {
  type: 'group';
  id: string;
  label: string;
}

export interface SavedConfigurationNode {
  type: 'savedConfiguration';
  configuration: RunConfiguration;
}

export interface DotnetProjectNode {
  type: 'dotnetProject';
  project: DetectedDotnetProject;
}

export interface LaunchProfileNode {
  type: 'launchProfile';
  project: DetectedDotnetProject;
  profile: LaunchSettingsProfile;
}

interface NpmPackageNode {
  type: 'npmPackage';
  packageInfo: DetectedNpmPackage;
}

export interface NpmScriptNode {
  type: 'npmScript';
  packageInfo: DetectedNpmPackage;
  scriptName: string;
  command: string;
}

export class RunConfigurationsTreeProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private readonly onDidChangeTreeDataEmitter =
    new vscode.EventEmitter<TreeNode | undefined>();

  private dotnetProjects: DetectedDotnetProject[] = [];
  private npmPackages: DetectedNpmPackage[] = [];

  public readonly onDidChangeTreeData =
    this.onDidChangeTreeDataEmitter.event;

  public constructor(
    private readonly configStore: ConfigStore,
    private readonly dotnetDiscoveryService: DotnetDiscoveryService,
    private readonly npmDiscoveryService: NpmDiscoveryService
  ) {}

  public async refresh(): Promise<void> {
    const [dotnetProjects, npmPackages] = await Promise.all([
      this.dotnetDiscoveryService.discover(),
      this.npmDiscoveryService.discover()
    ]);

    this.dotnetProjects = dotnetProjects;
    this.npmPackages = npmPackages;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: TreeNode): vscode.TreeItem {
    switch (element.type) {
      case 'group':
        return new vscode.TreeItem(
          element.label,
          vscode.TreeItemCollapsibleState.Expanded
        );
      case 'savedConfiguration':
        return this.createSavedConfigurationItem(element);
      case 'dotnetProject':
        return this.createDotnetProjectItem(element.project);
      case 'launchProfile':
        return this.createLaunchProfileItem(element);
      case 'npmPackage':
        return this.createNpmPackageItem(element.packageInfo);
      case 'npmScript':
        return this.createNpmScriptItem(element);
    }
  }

  public getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return [
        { type: 'group', id: 'saved', label: 'Saved Configurations' },
        { type: 'group', id: 'dotnet', label: '.NET Discovery' },
        { type: 'group', id: 'npm', label: 'npm Discovery' }
      ];
    }

    if (element.type === 'group') {
      switch (element.id) {
        case 'saved':
          return this.configStore.list().map(configuration => ({
            type: 'savedConfiguration',
            configuration
          }));
        case 'dotnet':
          return this.dotnetProjects.map(project => ({
            type: 'dotnetProject',
            project
          }));
        case 'npm':
          return this.npmPackages.map(packageInfo => ({
            type: 'npmPackage',
            packageInfo
          }));
      }
    }

    if (element.type === 'dotnetProject') {
      return element.project.launchProfiles.map(profile => ({
        type: 'launchProfile',
        project: element.project,
        profile
      }));
    }

    if (element.type === 'npmPackage') {
      return element.packageInfo.scripts.map(script => ({
        type: 'npmScript',
        packageInfo: element.packageInfo,
        scriptName: script.scriptName,
        command: script.command
      }));
    }

    return [];
  }

  private createSavedConfigurationItem(
    node: SavedConfigurationNode
  ): vscode.TreeItem {
    const activeId = this.configStore.getActiveConfigurationId();
    const isActive = activeId === node.configuration.id;
    const item = new vscode.TreeItem(
      node.configuration.name,
      vscode.TreeItemCollapsibleState.None
    );

    item.contextValue = 'savedConfiguration';
    item.description = isActive ? 'active' : node.configuration.kind;
    item.iconPath = new vscode.ThemeIcon(isActive ? 'debug-alt' : 'circle-filled');
    item.tooltip = node.configuration.workingDirectory;
    item.command = {
      command: 'visualConfigurator.setActiveConfiguration',
      title: 'Set Active Configuration',
      arguments: [node]
    };

    return item;
  }

  private createDotnetProjectItem(project: DetectedDotnetProject): vscode.TreeItem {
    const item = new vscode.TreeItem(
      project.name,
      project.launchProfiles.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );

    item.contextValue = 'discoveredDotnetProject';
    item.description = project.targetFrameworks.join(', ') || project.projectKind;
    item.tooltip = project.projectPath;
    item.iconPath = new vscode.ThemeIcon('symbol-class');
    item.command = {
      command: 'visualConfigurator.importDotnetProject',
      title: 'Import .NET Project',
      arguments: [{ type: 'dotnetProject', project } satisfies DotnetProjectNode]
    };

    return item;
  }

  private createLaunchProfileItem(node: LaunchProfileNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.profile.name,
      vscode.TreeItemCollapsibleState.None
    );

    item.contextValue = 'discoveredLaunchProfile';
    item.description = node.profile.launchBrowser ? 'browser' : 'profile';
    item.tooltip = node.profile.applicationUrl ?? node.project.projectPath;
    item.iconPath = new vscode.ThemeIcon('globe');
    item.command = {
      command: 'visualConfigurator.importLaunchProfile',
      title: 'Import Launch Profile',
      arguments: [node]
    };

    return item;
  }

  private createNpmPackageItem(packageInfo: DetectedNpmPackage): vscode.TreeItem {
    const item = new vscode.TreeItem(
      packageInfo.displayName,
      vscode.TreeItemCollapsibleState.Expanded
    );

    item.description = packageInfo.packageManager;
    item.tooltip = packageInfo.packageJsonPath;
    item.iconPath = new vscode.ThemeIcon('package');

    return item;
  }

  private createNpmScriptItem(node: NpmScriptNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.scriptName,
      vscode.TreeItemCollapsibleState.None
    );

    item.contextValue = 'discoveredNpmScript';
    item.description = node.packageInfo.packageManager;
    item.tooltip = `${path.dirname(node.packageInfo.packageJsonPath)}\n${node.command}`;
    item.iconPath = new vscode.ThemeIcon('terminal');
    item.command = {
      command: 'visualConfigurator.importNpmScript',
      title: 'Import npm Script',
      arguments: [node]
    };

    return item;
  }
}