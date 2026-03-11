import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  DetectedNpmPackage,
  DetectedNpmScript,
  PackageManager
} from './configTypes';

const PACKAGE_EXCLUDES = '**/{node_modules,.git,out,dist,bin,obj}/**';

interface RawPackageJson {
  name?: string;
  scripts?: Record<string, string>;
}

export class NpmDiscoveryService {
  public async discover(): Promise<DetectedNpmPackage[]> {
    const packageFiles = await vscode.workspace.findFiles(
      '**/package.json',
      PACKAGE_EXCLUDES,
      200
    );

    const discoveredPackages = await Promise.all(
      packageFiles.map(packageFile => this.readPackage(packageFile))
    );

    return discoveredPackages
      .filter(
        (pkg): pkg is DetectedNpmPackage => pkg !== undefined
      )
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  private async readPackage(
    packageJsonUri: vscode.Uri
  ): Promise<DetectedNpmPackage | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(packageJsonUri);

    if (!workspaceFolder) {
      return undefined;
    }

    const rawPackageJson = await vscode.workspace.fs.readFile(packageJsonUri);
    const packageJson = JSON.parse(
      Buffer.from(rawPackageJson).toString('utf8')
    ) as RawPackageJson;
    const scripts = packageJson.scripts ?? {};

    if (Object.keys(scripts).length === 0) {
      return undefined;
    }

    const packageManager = await this.detectPackageManager(packageJsonUri);
    const displayName =
      packageJson.name ?? path.basename(path.dirname(packageJsonUri.fsPath));

    const detectedScripts: DetectedNpmScript[] = Object.entries(scripts)
      .map(([scriptName, command]): DetectedNpmScript => ({
        type: 'npmScript',
        workspaceFolder,
        packageJsonPath: packageJsonUri.fsPath,
        packageManager,
        packageDisplayName: displayName,
        scriptName,
        command
      }))
      .sort((left, right) => left.scriptName.localeCompare(right.scriptName));

    return {
      workspaceFolder,
      packageJsonPath: packageJsonUri.fsPath,
      displayName,
      packageManager,
      scripts: detectedScripts
    };
  }

  private async detectPackageManager(
    packageJsonUri: vscode.Uri
  ): Promise<PackageManager> {
    const packageDir = vscode.Uri.file(path.dirname(packageJsonUri.fsPath));

    if (await this.pathExists(vscode.Uri.joinPath(packageDir, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }

    if (await this.pathExists(vscode.Uri.joinPath(packageDir, 'yarn.lock'))) {
      return 'yarn';
    }

    return 'npm';
  }

  private async pathExists(fileUri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(fileUri);
      return true;
    } catch {
      return false;
    }
  }
}