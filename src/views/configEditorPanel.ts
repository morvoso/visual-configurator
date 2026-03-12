import * as vscode from 'vscode';

import { RunConfiguration } from '../core/configTypes';

interface SaveMessage {
  type: 'save';
  payload: RunConfiguration;
}

export class ConfigEditorPanel {
  public async open(
    context: vscode.ExtensionContext,
    configuration: RunConfiguration,
    onSave: (updated: RunConfiguration) => Promise<void>
  ): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'visualConfigurator.configEditor',
      `Edit: ${configuration.name}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri]
      }
    );

    panel.webview.html = this.getHtml(panel.webview, configuration);

    panel.webview.onDidReceiveMessage(
      async (message: SaveMessage | { type: string }) => {
        if (message.type === 'cancel') {
          panel.dispose();
          return;
        }
        if (message.type !== 'save') {
          return;
        }

        await onSave((message as SaveMessage).payload);
        panel.dispose();
      },
      undefined,
      context.subscriptions
    );
  }

  private getHtml(
    webview: vscode.Webview,
    configuration: RunConfiguration
  ): string {
    const nonce = createNonce();
    const serialized = JSON.stringify(configuration).replace(/</g, '\\u003c');
    const kindLabel = describeConfigurationKind(configuration);
    const kindDetail = describeConfigurationDetail(configuration);
    const badgeClass = getConfigurationBadgeClass(configuration);
    const escapedName = escapeForHtml(configuration.name);
    const escapedWorkingDirectory = escapeForHtml(configuration.workingDirectory);
    const executionMode = configuration.allowMultipleInstances
      ? 'Parallel launches enabled'
      : 'Single active instance';


    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <title>Edit Configuration</title>
  <style nonce="${nonce}">
    :root {
      --jb-background: var(--vscode-editor-background);
      --jb-panel-bg: color-mix(in srgb, var(--vscode-editor-background) 96%, var(--vscode-foreground) 4%);
      --jb-border: color-mix(in srgb, var(--vscode-input-border) 80%, transparent 20%);
      --jb-text: var(--vscode-editor-foreground);
      --jb-text-muted: color-mix(in srgb, var(--vscode-editor-foreground) 60%, transparent 40%);
      --jb-input-bg: var(--vscode-input-background);
      --jb-button-bg: var(--vscode-button-background);
      --jb-button-fg: var(--vscode-button-foreground);
      --jb-selection: var(--vscode-list-activeSelectionBackground);
      --jb-selection-fg: var(--vscode-list-activeSelectionForeground);
      --jb-hover: var(--vscode-list-hoverBackground);
      
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
    }
    
    * { box-sizing: border-box; }
    
    body {
      font-family: var(--font-family);
      color: var(--jb-text);
      background: var(--jb-background);
      margin: 0;
      padding: 0;
      font-size: 13px;
      line-height: 1.5;
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    /* Layout */
    .layout-root {
      display: flex;
      width: 100%;
      height: 100%;
    }

    /* Sidebar (Tabs/Nav) */
    .sidebar {
      width: 220px;
      background: var(--jb-panel-bg);
      border-right: 1px solid var(--jb-border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    
    .sidebar-header {
      padding: 12px 16px;
      font-weight: 600;
      font-size: 12px;
      color: var(--jb-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--jb-border);
    }
    
    .section-nav {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .section-nav-button {
      background: transparent;
      border: none;
      color: var(--jb-text);
      text-align: left;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--font-family);
      font-size: 13px;
      display: flex;
      flex-direction: column;
    }
    
    .section-nav-button:hover {
      background: var(--jb-hover);
    }
    
    .section-nav-button.active {
      background: var(--jb-selection);
      color: var(--jb-selection-fg);
    }

    /* Main Content */
    .main-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: var(--jb-background);
    }
    
    .header-bar {
      padding: 16px 24px;
      border-bottom: 1px solid var(--jb-border);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .header-bar h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--jb-panel-bg);
      border: 1px solid var(--jb-border);
      color: var(--jb-text-muted);
    }

    .scroll-container {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }
    
    .sections-wrapper {
      max-width: 800px;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    /* JetBrains Style Section Headers */
    .jb-section {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .jb-section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .jb-section-title {
      font-weight: 600;
      font-size: 13px;
      white-space: nowrap;
    }

    .jb-section-line {
      height: 1px;
      background: var(--jb-border);
      flex: 1;
    }

    /* Form Rows */
    .row {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }

    .field-label {
      width: 140px;
      flex-shrink: 0;
      text-align: right;
      padding-top: 6px;
      color: var(--jb-text);
      display: flex;
      flex-direction: column;
    }

    .control {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      justify-content: flex-start;
      padding-top: 2px;
    }

    input[type="text"], 
    select, 
    textarea {
      width: 100%;
      background: var(--jb-input-bg);
      color: var(--jb-text);
      border: 1px solid var(--jb-border);
      border-radius: 3px;
      padding: 5px 8px;
      font-family: var(--font-family);
      font-size: 13px;
      min-height: 28px;
      transition: border-color 0.15s ease;
    }
    
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    input:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    textarea {
      resize: vertical;
      min-height: 60px;
    }

    /* Checkboxes */
    .jb-checkbox {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
      user-select: none;
      margin-top: 4px;
    }

    .jb-checkbox input[type="checkbox"] {
      margin: 2px 0 0 0;
      cursor: pointer;
    }

    .jb-checkbox-text {
      display: flex;
      flex-direction: column;
    }

    .hint {
      font-size: 12px;
      color: var(--jb-text-muted);
    }

    /* Tables */
    .table-wrap {
      border: 1px solid var(--jb-border);
      border-radius: 3px;
      background: var(--jb-input-bg);
    }

    .env-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    .env-table th, .env-table td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--jb-border);
    }

    .env-table th {
      background: var(--jb-panel-bg);
      font-weight: normal;
      color: var(--jb-text-muted);
      font-size: 12px;
    }

    .env-table tr:last-child td {
      border-bottom: none;
    }

    .env-table input {
      border: 1px solid transparent;
      background: transparent;
      padding: 4px;
      border-radius: 2px;
      min-height: 24px;
    }
    
    .env-table input:focus {
      background: var(--jb-input-bg);
      border: 1px solid var(--vscode-focusBorder);
    }

    /* Buttons */
    .actions-bar {
      padding: 12px 24px;
      border-top: 1px solid var(--jb-border);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      background: var(--jb-panel-bg);
    }

    button {
      background: var(--jb-button-bg);
      color: var(--jb-button-fg);
      border: 1px solid transparent;
      border-radius: 3px;
      padding: 5px 16px;
      font-family: var(--font-family);
      font-size: 13px;
      cursor: pointer;
      min-height: 26px;
      min-width: 80px;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--jb-border);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    
    button.ghost {
      background: transparent;
      color: var(--jb-text);
      border: 1px solid var(--jb-border);
    }

    button.ghost:hover {
      background: var(--jb-hover);
    }
    
    .env-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      justify-content: space-between;
      align-items: center;
    }

  </style>
</head>
<body>
  <div class="layout-root">
    <aside class="sidebar">
      <div class="sidebar-header">Run Configuration</div>
      <nav class="section-nav" aria-label="Configuration sections">
        <button class="section-nav-button active" type="button" data-section="general">
          <span>General</span>
        </button>
        <button class="section-nav-button" type="button" data-section="env">
          <span>Environment Variables</span>
        </button>
        <button class="section-nav-button" type="button" data-section="advanced">
          <span>Advanced Diagnostics</span>
        </button>
      </nav>
    </aside>

    <main class="main-area">
      <header class="header-bar">
        <h1 id="configurationTitle">${escapedName}</h1>
        <span class="badge ${badgeClass}">${kindLabel}</span>
      </header>
      
      <div class="scroll-container">
        <div class="sections-wrapper">
          
          <div class="jb-section" id="general">
            <div class="jb-section-header">
              <div class="jb-section-title">General</div>
              <div class="jb-section-line"></div>
            </div>
            
            <div class="row">
              <label for="name" class="field-label">Name:</label>
              <div class="control">
                <input id="name" type="text" placeholder="Configuration name" />
              </div>
            </div>

            <div class="row">
              <label for="kind" class="field-label">Kind:</label>
              <div class="control">
                <input id="kind" type="text" disabled />
              </div>
            </div>

            <div class="row">
              <label for="workingDirectory" class="field-label">Working directory:</label>
              <div class="control">
                <input id="workingDirectory" type="text" placeholder="/path/to/working-directory" />
              </div>
            </div>

            <div class="row">
              <label class="field-label">Execution:</label>
              <div class="control">
                <label class="jb-checkbox" for="allowMultipleInstances">
                  <input id="allowMultipleInstances" type="checkbox" />
                  <span class="jb-checkbox-text">
                    <span>Allow multiple instances</span>
                    <span class="hint">Enable parallel runs instead of reusing a single active process slot.</span>
                  </span>
                </label>
              </div>
            </div>

            <div class="row">
              <label for="fieldA" id="fieldALabel" class="field-label">Program arguments:</label>
              <div class="control">
                <input id="fieldA" type="text" placeholder="--flag value" />
                <div class="hint" id="fieldAHint"></div>
              </div>
            </div>

            <div class="row">
              <label for="fieldB" id="fieldBLabel" class="field-label">Runtime arguments:</label>
              <div class="control">
                <input id="fieldB" type="text" placeholder="Runtime or script target" />
                <div class="hint" id="fieldBHint"></div>
              </div>
            </div>

            <div class="row">
              <label for="fieldC" id="fieldCLabel" class="field-label">Option:</label>
              <div class="control">
                <select id="fieldC"></select>
                <div class="hint" id="fieldCHint"></div>
              </div>
            </div>
          </div>

          <div class="jb-section" id="env">
            <div class="jb-section-header">
              <div class="jb-section-title">Environment Variables</div>
              <div class="jb-section-line"></div>
            </div>
            
            <div class="row">
              <label class="field-label">Variables:</label>
              <div class="control">
                <div class="table-wrap">
                  <table class="env-table">
                    <thead><tr><th style="width: 40%">Name</th><th>Value</th><th style="width: 80px"></th></tr></thead>
                    <tbody id="envBody"></tbody>
                  </table>
                </div>
                <div class="env-actions">
                  <span class="hint">Empty variables are ignored.</span>
                  <div>
                    <button type="button" id="addEnv" class="ghost">+ Add</button>
                    <button type="button" id="clearEnv" class="ghost">Clear All</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="jb-section" id="advanced">
            <div class="jb-section-header">
              <div class="jb-section-title">Advanced</div>
              <div class="jb-section-line"></div>
            </div>
            
            <div class="row">
              <label class="field-label">Output:</label>
              <div class="control">
                <label class="jb-checkbox" for="captureOutput">
                  <input id="captureOutput" type="checkbox" />
                  <span class="jb-checkbox-text">
                    <span>Capture output</span>
                  </span>
                </label>
              </div>
            </div>

            <div class="row">
              <label class="field-label">Formatting:</label>
              <div class="control">
                <label class="jb-checkbox" for="showTimestamps">
                  <input id="showTimestamps" type="checkbox" />
                  <span class="jb-checkbox-text">
                    <span>Show timestamps</span>
                  </span>
                </label>
              </div>
            </div>
          </div>
          
        </div>
      </div>
      
      <footer class="actions-bar">
        <button id="cancelButton" type="button" class="ghost">Cancel</button>
        <button id="saveButton" type="button">OK</button>
      </footer>
    </main>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const configuration = ${serialized};

    const byId = (id) => document.getElementById(id);

    const splitArgs = (value) =>
      value.split(/\s+/).map((p) => p.trim()).filter(Boolean);

    const renderEnvRow = (key = '', value = '') => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input style="width:100%" value="' + escapeHtml(key) + '" /></td>' +
        '<td><input style="width:100%" value="' + escapeHtml(value) + '" /></td>' +
        '<td><button type="button" class="ghost delete-row">Delete</button></td>';
      tr.querySelector('.delete-row').addEventListener('click', () => tr.remove());
      byId('envBody').appendChild(tr);
    };

    const getEnvMap = () => {
      const map = {};
      for (const row of byId('envBody').querySelectorAll('tr')) {
        const inputs = row.querySelectorAll('input');
        const key = inputs[0].value.trim();
        const value = inputs[1].value.trim();
        if (key) map[key] = value;
      }
      return map;
    };

    const setupKindSpecificFields = () => {
      const fieldA = byId('fieldA');
      const fieldB = byId('fieldB');
      const fieldC = byId('fieldC');
      if (configuration.kind === 'npm-script') {
        byId('fieldALabel').textContent = 'Script arguments:';
        byId('fieldBLabel').textContent = 'Script:';
        byId('fieldCLabel').textContent = 'Package Manager:';
        byId('fieldAHint').textContent = 'Arguments passed to the selected script';
        byId('fieldBHint').textContent = 'Script name from package.json';
        byId('fieldCHint').textContent = 'Package manager used to run the script';
        fieldA.value = (configuration.scriptArgs || []).join(' ');
        fieldB.value = configuration.script || '';
        fieldC.innerHTML = '<option value="npm">npm</option><option value="yarn">yarn</option><option value="pnpm">pnpm</option>';
        fieldC.value = configuration.packageManager;
      } else if (configuration.kind === 'docker') {
        byId('fieldALabel').textContent = 'Image:';
        byId('fieldBLabel').textContent = 'Command:';
        byId('fieldCLabel').textContent = 'Container Runtime:';
        byId('fieldAHint').textContent = 'Docker / Podman image to run';
        byId('fieldBHint').textContent = 'Command to execute inside the container';
        byId('fieldCHint').textContent = 'Container engine to use';
        fieldA.value = configuration.image || '';
        fieldB.value = configuration.command || '';
        fieldC.innerHTML = '<option value="docker">Docker</option><option value="podman">Podman</option>';
        fieldC.value = configuration.containerRuntime;
      } else if (configuration.kind === 'docker-compose') {
        byId('fieldALabel').textContent = 'Compose file:';
        byId('fieldBLabel').textContent = 'Services:';
        byId('fieldCLabel').textContent = 'Container Runtime:';
        byId('fieldAHint').textContent = 'Path to docker-compose.yml or compose.yaml';
        byId('fieldBHint').textContent = 'Comma-separated service names (blank = all)';
        byId('fieldCHint').textContent = 'Container engine to use';
        fieldA.value = configuration.composeFilePath || '';
        fieldB.value = (configuration.services || []).join(', ');
        fieldC.innerHTML = '<option value="docker">Docker</option><option value="podman">Podman</option>';
        fieldC.value = configuration.containerRuntime;
      } else {
        byId('fieldALabel').textContent = 'Program args:';
        byId('fieldBLabel').textContent = 'Runtime args:';
        byId('fieldCLabel').textContent = 'Launch Browser:';
        byId('fieldAHint').textContent = 'Arguments passed to the application';
        byId('fieldBHint').textContent = 'Arguments passed to dotnet runtime';
        byId('fieldCHint').textContent = 'Open browser after launch';
        fieldA.value = (configuration.programArgs || []).join(' ');
        fieldB.value = (configuration.runtimeArgs || []).join(' ');
        fieldC.innerHTML = '<option value="false">No</option><option value="true">Yes</option>';
        fieldC.value = String(Boolean(configuration.launchBrowser));
      }
    };

    const init = () => {
      byId('name').value = configuration.name;
      byId('kind').value = configuration.kind;
      byId('workingDirectory').value = configuration.workingDirectory;
      byId('allowMultipleInstances').checked = Boolean(configuration.allowMultipleInstances);
      byId('captureOutput').checked = Boolean(configuration.captureOutput);
      byId('showTimestamps').checked = Boolean(configuration.showTimestamps);

      const env = configuration.environment || {};
      const keys = Object.keys(env);
      if (keys.length === 0) {
        renderEnvRow('', '');
      } else {
        keys.forEach((key) => renderEnvRow(key, env[key]));
      }

      setupKindSpecificFields();
    };

    byId('addEnv').addEventListener('click', () => renderEnvRow('', ''));
    byId('clearEnv').addEventListener('click', () => {
      byId('envBody').innerHTML = '';
      renderEnvRow('', '');
    });

    byId('name').addEventListener('input', () => {
      byId('configurationTitle').textContent = byId('name').value.trim() || configuration.name;
    });

    document.querySelectorAll('.section-nav-button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.section-nav-button').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-section');
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    byId('cancelButton').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    byId('saveButton').addEventListener('click', () => {
      const updated = structuredClone(configuration);
      updated.name = byId('name').value.trim() || configuration.name;
      updated.workingDirectory = byId('workingDirectory').value.trim() || configuration.workingDirectory;
      updated.allowMultipleInstances = byId('allowMultipleInstances').checked;
      updated.environment = getEnvMap();
      updated.captureOutput = byId('captureOutput').checked;
      updated.showTimestamps = byId('showTimestamps').checked;
      updated.updatedAt = new Date().toISOString();

      if (updated.kind === 'npm-script') {
        updated.scriptArgs = splitArgs(byId('fieldA').value);
        updated.script = byId('fieldB').value.trim() || updated.script;
        updated.packageManager = byId('fieldC').value;
      } else if (updated.kind === 'docker') {
        updated.image = byId('fieldA').value.trim() || updated.image;
        updated.command = byId('fieldB').value.trim();
        updated.containerRuntime = byId('fieldC').value;
      } else if (updated.kind === 'docker-compose') {
        updated.composeFilePath = byId('fieldA').value.trim() || updated.composeFilePath;
        updated.services = byId('fieldB').value.split(',').map(s => s.trim()).filter(Boolean);
        updated.containerRuntime = byId('fieldC').value;
      } else {
        updated.programArgs = splitArgs(byId('fieldA').value);
        updated.runtimeArgs = splitArgs(byId('fieldB').value);
        updated.launchBrowser = byId('fieldC').value === 'true';
      }

      vscode.postMessage({ type: 'save', payload: updated });
    });

    function escapeHtml(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    init();
  </script>
</body>
</html>`;
  }
}

function describeConfigurationKind(configuration: RunConfiguration): string {
  switch (configuration.kind) {
    case 'npm-script':
      return 'npm Script';
    case 'dotnet-launch-profile':
      return '.NET Launch Profile';
    case 'dotnet-project':
      return '.NET Project';
    case 'docker':
      return `Container (${configuration.containerRuntime})`;
    case 'docker-compose':
      return `Compose (${configuration.containerRuntime})`;
  }
}

function describeConfigurationDetail(configuration: RunConfiguration): string {
  switch (configuration.kind) {
    case 'npm-script':
      return 'Script execution with package-manager specific arguments and environment overrides.';
    case 'dotnet-launch-profile':
      return 'Launch profile settings imported from launchSettings.json with editable runtime behavior.';
    case 'dotnet-project':
      return 'Project-level .NET execution settings, runtime arguments, and browser launch options.';
    case 'docker':
      return 'Container-based execution using Docker or Podman with image, port, and volume configuration.';
    case 'docker-compose':
      return 'Multi-service orchestration using a Docker or Podman Compose file.';
  }
}

function getConfigurationBadgeClass(configuration: RunConfiguration): string {
  switch (configuration.kind) {
    case 'npm-script':
      return 'kind-npm';
    case 'docker':
    case 'docker-compose':
      return 'kind-docker';
    default:
      return 'kind-dotnet';
  }
}

function escapeForHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 16; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
