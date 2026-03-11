import * as vscode from 'vscode';

import { PersistedConfigState, RunConfiguration } from './configTypes';

const STATE_KEY = 'visualConfigurator.configState';

export class ConfigStore {
  private state: PersistedConfigState;

  public constructor(private readonly workspaceState: vscode.Memento) {
    this.state = this.workspaceState.get<PersistedConfigState>(STATE_KEY, {
      configurations: []
    });
  }

  public list(): RunConfiguration[] {
    return [...this.state.configurations].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }

  public getActiveConfigurationId(): string | undefined {
    return this.state.activeConfigurationId;
  }

  public getActiveConfiguration(): RunConfiguration | undefined {
    const activeId = this.getActiveConfigurationId();

    return this.state.configurations.find(
      configuration => configuration.id === activeId
    );
  }

  public getById(id: string): RunConfiguration | undefined {
    return this.state.configurations.find(configuration => configuration.id === id);
  }

  public async upsert(configuration: RunConfiguration): Promise<void> {
    const existingIndex = this.state.configurations.findIndex(
      current => current.id === configuration.id
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
      configuration => configuration.id !== id
    );

    if (this.state.activeConfigurationId === id) {
      this.state.activeConfigurationId = this.state.configurations[0]?.id;
    }

    await this.save();
  }

  private async save(): Promise<void> {
    await this.workspaceState.update(STATE_KEY, this.state);
  }
}