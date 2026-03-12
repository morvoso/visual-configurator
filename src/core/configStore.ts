import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  CustomTypeDefinition,
  PersistedConfigState,
  RunConfiguration,
  WorkspaceConfigFile
} from './configTypes';

const LEGACY_STATE_KEY = 'visualConfigurator.configState';
const CONFIG_FILE = 'visual-configurator.json';

export class ConfigStore {
  private state: WorkspaceConfigFile;
  private readonly filePath: string | undefined;

  /** True when neither the workspace config file nor any legacy workspaceState data was found. */
  public readonly isFirstRun: boolean;

  public constructor(private readonly workspaceState: vscode.Memento) {
    this.filePath = this.resolveFilePath();
    const { state, isFirstRun } = this.loadState();
    this.state = state;
    this.isFirstRun = isFirstRun;
  }

  // ---------------------------------------------------------------------------
  // Configurations
  // ---------------------------------------------------------------------------

  public list(): RunConfiguration[] {
    return [...this.state.configurations].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  public getActiveConfigurationId(): string | undefined {
    return this.state.activeConfigurationId;
  }

  public getActiveConfiguration(): RunConfiguration | undefined {
    return this.state.configurations.find(
      c => c.id === this.state.activeConfigurationId
    );
  }

  public getById(id: string): RunConfiguration | undefined {
    return this.state.configurations.find(c => c.id === id);
  }

  public async upsert(configuration: RunConfiguration): Promise<void> {
    const existingIndex = this.state.configurations.findIndex(
      c => c.id === configuration.id
    );

    if (existingIndex >= 0) {
      this.state.configurations[existingIndex] = configuration;
    } else {
      this.state.configurations.push(configuration);
    }

    if (!this.state.activeConfigurationId) {
      this.state.activeConfigurationId = configuration.id;
    }

    await this.save();
  }

  public async setActiveConfiguration(id: string): Promise<void> {
    this.state.activeConfigurationId = id;
    await this.save();
  }

  public async remove(id: string): Promise<void> {
    this.state.configurations = this.state.configurations.filter(
      c => c.id !== id
    );

    if (this.state.activeConfigurationId === id) {
      this.state.activeConfigurationId = this.state.configurations[0]?.id;
    }

    await this.save();
  }

  // ---------------------------------------------------------------------------
  // Custom Types
  // ---------------------------------------------------------------------------

  public listCustomTypes(): CustomTypeDefinition[] {
    return this.state.customTypes ?? [];
  }

  public getCustomType(id: string): CustomTypeDefinition | undefined {
    return (this.state.customTypes ?? []).find(t => t.id === id);
  }

  // ---------------------------------------------------------------------------
  // File management
  // ---------------------------------------------------------------------------

  /** Absolute path to .vscode/visual-configurator.json, or undefined if no workspace is open. */
  public getFilePath(): string | undefined {
    return this.filePath;
  }

  /** Re-reads the config file from disk (called when an external change is detected). */
  public reload(): void {
    if (!this.filePath) {
      return;
    }

    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.state = JSON.parse(raw) as WorkspaceConfigFile;
      }
    } catch {
      // Ignore parse errors on external edits — keep last good state
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private resolveFilePath(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder
      ? path.join(folder.uri.fsPath, '.vscode', CONFIG_FILE)
      : undefined;
  }

  private loadState(): { state: WorkspaceConfigFile; isFirstRun: boolean } {
    // 1. Try reading the workspace config file
    if (this.filePath) {
      try {
        if (fs.existsSync(this.filePath)) {
          const raw = fs.readFileSync(this.filePath, 'utf-8');
          const parsed = JSON.parse(raw) as WorkspaceConfigFile;
          return { state: parsed, isFirstRun: false };
        }
      } catch {
        // File is corrupt — fall through to migration/fresh start
      }
    }

    // 2. Migrate legacy workspaceState data (pre-file-storage versions)
    const legacy = this.workspaceState.get<PersistedConfigState>(
      LEGACY_STATE_KEY,
      { configurations: [] }
    );

    if (legacy.configurations.length > 0) {
      const migrated: WorkspaceConfigFile = {
        version: 1,
        activeConfigurationId: legacy.activeConfigurationId,
        customTypes: [],
        configurations: legacy.configurations
      };
      void this.writeToFile(migrated);
      return { state: migrated, isFirstRun: false };
    }

    // 3. Brand-new workspace
    return {
      state: { version: 1, customTypes: [], configurations: [] },
      isFirstRun: true
    };
  }

  private async save(): Promise<void> {
    await this.writeToFile(this.state);
  }

  private async writeToFile(state: WorkspaceConfigFile): Promise<void> {
    if (!this.filePath) {
      return;
    }

    try {
      const dir = path.dirname(this.filePath);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(
        this.filePath,
        `${JSON.stringify(state, null, 2)}\n`,
        'utf-8'
      );
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Visual Configurator: failed to save config file — ${String(err)}`
      );
    }
  }
}
