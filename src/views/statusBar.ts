import * as vscode from 'vscode';

import { ConfigStore } from '../core/configStore';

export class ActiveConfigurationStatusBar {
  private readonly item: vscode.StatusBarItem;

  public constructor(private readonly configStore: ConfigStore) {
    this.item = vscode.window.createStatusBarItem(
      'visualConfigurator.activeConfiguration',
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.name = 'Visual Configurator Active Configuration';
    this.item.command = 'visualConfigurator.runConfiguration';
  }

  public show(): void {
    this.refresh();
    this.item.show();
  }

  public refresh(): void {
    const activeConfiguration = this.configStore.getActiveConfiguration();
    this.item.text = activeConfiguration
      ? `$(debug-alt) ${activeConfiguration.name}`
      : '$(debug-alt) No active config';
    this.item.tooltip = activeConfiguration
      ? `Run ${activeConfiguration.name}`
      : 'Import and activate a configuration to run it';
  }

  public dispose(): void {
    this.item.dispose();
  }
}