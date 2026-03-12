# Visual Configurator

Visual Configurator is a VS Code extension that brings a JetBrains-style run configuration workflow into the **Run and Debug** area of VS Code.

Instead of hand-editing `launch.json` and `tasks.json` first, you create and manage configurations in a dedicated tree view. The extension can then run/debug directly and optionally sync to workspace files for compatibility.

## What It Does

Visual Configurator currently supports:

- .NET project discovery (`*.csproj`)
- .NET launch profile import from `Properties/launchSettings.json`
- npm/yarn/pnpm script discovery from `package.json`
- Docker / Podman run configurations
- Docker / Podman Compose configurations
- Custom run configuration types (template-driven shell commands)
- In-place editing through a webview editor
- Run, debug (where supported), stop, delete, and activate actions
- Optional sync to `.vscode/launch.json` and `.vscode/tasks.json`
- Persistent workspace-level storage in `.vscode/visual-configurator.json`

## Extension UI

### Run Configurations View

The extension contributes a **Run Configurations** view in the **Run and Debug** panel.

From this view, you can:

- Add a new configuration
- Refresh the tree
- Run selected or active configuration
- Debug selected or active configuration
- Stop running task/debug sessions started by the extension
- Sync launch/tasks files
- Open and manage custom type definitions

### Status Bar Integration

A status bar item shows the active configuration:

- If active: `$(debug-alt) <Configuration Name>`
- If none: `$(debug-alt) No active config`

Clicking the status bar item runs the active configuration.

## Supported Configuration Kinds

### 1) .NET Project (`dotnet-project`)

Created from discovered `.csproj` files.

Run behavior:

- Executes `dotnet run --project <path>`
- Adds `--framework <tfm>` if configured
- Appends runtime args and program args (`-- <programArgs...>`) when present

Debug behavior:

- Uses `coreclr` launch config
- Program path inferred as:
  - `<projectDir>/bin/Debug/<targetFramework>/<projectName>.dll`
- Supports browser auto-open via server-ready pattern when enabled

### 2) .NET Launch Profile (`dotnet-launch-profile`)

Imported from `launchSettings.json` profiles with `commandName == "Project"`.

Includes:

- Profile command-line args
- Profile environment variables
- Launch browser setting
- Optional application URL

Run/debug behavior is similar to `.NET Project`, with profile passed as:

- `--launch-profile <profileName>`

### 3) npm Script (`npm-script`)

Imported from `package.json` scripts, with package manager auto-detected by lockfile:

- `pnpm-lock.yaml` -> `pnpm`
- `yarn.lock` -> `yarn`
- otherwise -> `npm`

Run behavior:

- `<packageManager> run <script> -- <scriptArgs...>` (args only when provided)

Debug behavior:

- Uses `pwa-node`
- Launches via selected package manager executable
- Enables `autoAttachChildProcesses`

### 4) Docker / Podman (`docker`)

Manual configuration for container image runs.

Run behavior:

- `<runtime> run --rm ...`
- Applies:
  - `-p` for each port mapping
  - `-v` for each volume mapping
  - `-e KEY=VALUE` for each environment variable
  - extra container args
  - image name
  - command split by whitespace (if provided)

Debug behavior:

- Not currently supported by extension debug command

### 5) Docker / Podman Compose (`docker-compose`)

Manual configuration for compose-based service runs.

Run behavior:

- `<runtime> compose -f <composeFile> [composeArgs] [--profile ...] up [upArgs] [services...]`

Stop behavior:

- Terminates tracked task executions
- Optionally runs `compose down` when `downOnStop` is enabled

Debug behavior:

- Not currently supported by extension debug command

### 6) Custom (`custom`)

Custom template-based command configuration.

Run behavior:

- Executes configured shell command and args in chosen working directory with environment overrides

Debug behavior:

- Not currently supported by extension debug command

## Commands

The extension contributes these commands:

- `Visual Configurator: Refresh`
- `Visual Configurator: Add Configuration`
- `Visual Configurator: Set Active Configuration`
- `Visual Configurator: Run Configuration`
- `Visual Configurator: Debug Configuration`
- `Visual Configurator: Edit Configuration`
- `Visual Configurator: Delete Configuration`
- `Visual Configurator: Stop Configuration`
- `Visual Configurator: Sync launch/tasks Files`
- `Visual Configurator: Manage Custom Types`

## Typical Workflow

1. Open a folder/workspace in VS Code.
2. Open Run and Debug -> Run Configurations.
3. Select **Add Configuration**.
4. Choose a built-in type (or a custom type).
5. Edit fields in the webview editor and save.
6. Run or debug from tree item actions or title actions.
7. Optionally sync to `.vscode/launch.json` and `.vscode/tasks.json`.

## Persistence Model

Workspace configuration is stored in:

- `.vscode/visual-configurator.json`

Top-level schema (version 1):

```json
{
  "version": 1,
  "activeConfigurationId": "optional-id",
  "customTypes": [],
  "configurations": []
}
```

Notes:

- Configurations are persisted per workspace folder.
- The extension watches this file for external edits and reloads automatically.
- Legacy `workspaceState` data is migrated into this file when found.

## Auto-Populate on First Run

When no existing config file or legacy state exists, the extension auto-discovers and imports:

- eligible .NET projects
- npm package scripts

Imported entries become regular saved configurations and can be edited immediately.

## Sync to launch.json / tasks.json

`Sync launch/tasks Files` writes:

- `.vscode/launch.json`
- `.vscode/tasks.json`

Behavior:

- `.NET` and `npm` configurations produce both launch + task entries
- `docker`, `docker-compose`, and `custom` currently produce task entries only

This sync is one-way (extension store -> workspace files).

## Configuration Editor

`Edit Configuration` opens a webview editor with:

- General section
  - name
  - working directory
  - allow multiple instances
  - kind-specific fields
- Environment Variables table
- Advanced section
  - capture output (currently persisted only)
  - show timestamps (currently persisted only)
  - compose `downOnStop` toggle for compose configs

## Custom Types

Use `Manage Custom Types` to open/create `.vscode/visual-configurator.json` and define templates under `customTypes`.

Each custom type includes:

- `id`
- `label`
- optional `description`
- optional codicon `icon`
- `command`
- `defaultArgs`
- `defaultEnv`

When a custom configuration is created, it snapshots type label and command defaults into the configuration entry.

## Current Limitations

- Debug command currently supports only `.NET` and `npm-script` configurations.
- .NET debug assumes DLL output under `bin/Debug/<targetFramework>/`.
- `captureOutput` and `showTimestamps` are stored but not yet used by execution output formatting.
- Sync rewrites launch/tasks files from extension state; it does not merge from existing manual entries.

## Requirements

- VS Code `^1.95.0`
- For .NET runs/debug: .NET SDK + C# debug capability (`coreclr`) in your VS Code setup
- For npm runs/debug: Node.js tooling and relevant package manager binary (`npm`, `yarn`, or `pnpm`)
- For container runs: Docker or Podman CLI available in PATH

## Development

Install and build:

```bash
npm install
npm run compile
```

Watch mode:

```bash
npm run watch
```

Run extension in development:

1. Open this project in VS Code.
2. Press `F5` to launch the Extension Development Host.

## Project Structure

- `src/extension.ts`: activation, command wiring, first-run bootstrap
- `src/core/configTypes.ts`: shared type system
- `src/core/configStore.ts`: persistence and migration logic
- `src/core/dotnetDiscoveryService.ts`: `.csproj` + launch profile discovery
- `src/core/npmDiscoveryService.ts`: package script discovery + package manager detection
- `src/core/executionService.ts`: run/debug/stop orchestration
- `src/core/fileSyncService.ts`: launch/tasks generation
- `src/views/configTreeProvider.ts`: tree view model and labels/icons
- `src/views/configEditorPanel.ts`: configuration edit webview
- `src/views/statusBar.ts`: active configuration status item

## Roadmap Direction

Near-term themes already reflected in the repo plan:

- richer configuration editing and validation
- expanded debug/runtime support across more config kinds
- future compound run orchestration
