import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  DetectedDotnetProject,
  LaunchSettingsProfile
} from './configTypes';
import { parseLaunchSettings } from './launchSettingsParser';

const DOTNET_EXCLUDES = '**/{bin,obj,node_modules,.git,out,dist}/**';

export class DotnetDiscoveryService {
  public async discover(): Promise<DetectedDotnetProject[]> {
    const projectFiles = await vscode.workspace.findFiles(
      '**/*.csproj',
      DOTNET_EXCLUDES,
      200
    );

    const discoveredProjects = await Promise.all(
      projectFiles.map(projectFile => this.readProject(projectFile))
    );

    return discoveredProjects
      .filter(
        (project): project is DetectedDotnetProject => project !== undefined
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private async readProject(
    projectUri: vscode.Uri
  ): Promise<DetectedDotnetProject | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(projectUri);

    if (!workspaceFolder) {
      return undefined;
    }

    const rawProject = await vscode.workspace.fs.readFile(projectUri);
    const projectXml = Buffer.from(rawProject).toString('utf8');
    const targetFrameworks = this.extractTargetFrameworks(projectXml);
    const projectKind = this.detectProjectKind(projectXml);
    const launchProfiles = await this.readLaunchProfiles(projectUri);

    if (projectKind === 'library' && launchProfiles.length === 0) {
      return undefined;
    }

    return {
      type: 'dotnetProject',
      workspaceFolder,
      projectPath: projectUri.fsPath,
      name: path.basename(projectUri.fsPath, '.csproj'),
      targetFrameworks,
      projectKind,
      launchProfiles
    };
  }

  private async readLaunchProfiles(
    projectUri: vscode.Uri
  ): Promise<LaunchSettingsProfile[]> {
    const launchSettingsUri = vscode.Uri.joinPath(
      vscode.Uri.file(path.dirname(projectUri.fsPath)),
      'Properties',
      'launchSettings.json'
    );

    try {
      const rawLaunchSettings = await vscode.workspace.fs.readFile(
        launchSettingsUri
      );

      return parseLaunchSettings(
        Buffer.from(rawLaunchSettings).toString('utf8')
      );
    } catch {
      return [];
    }
  }

  private extractTargetFrameworks(projectXml: string): string[] {
    const singleMatch = projectXml.match(/<TargetFramework>([^<]+)<\/TargetFramework>/i);
    if (singleMatch) {
      return [singleMatch[1].trim()];
    }

    const multiMatch = projectXml.match(/<TargetFrameworks>([^<]+)<\/TargetFrameworks>/i);
    if (multiMatch) {
      return multiMatch[1]
        .split(';')
        .map(value => value.trim())
        .filter(Boolean);
    }

    return [];
  }

  private detectProjectKind(
    projectXml: string
  ): DetectedDotnetProject['projectKind'] {
    if (/Sdk="Microsoft\.NET\.Sdk\.Web"/i.test(projectXml)) {
      return 'web';
    }

    const outputTypeMatch = projectXml.match(/<OutputType>([^<]+)<\/OutputType>/i);
    const outputType = outputTypeMatch?.[1].trim().toLowerCase();

    if (outputType === 'exe' || outputType === 'winexe') {
      return 'console';
    }

    if (outputType === 'library') {
      return 'library';
    }

    return 'unknown';
  }
}