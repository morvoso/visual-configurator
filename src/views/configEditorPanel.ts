import * as vscode from 'vscode';

import {
  DotnetProjectConfiguration,
  NpmScriptConfiguration,
  RunConfiguration
} from '../core/configTypes';

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

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <title>Edit Configuration</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 18px;
      line-height: 1.35;
    }
    .container {
      max-width: 920px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 14px;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .section {
      border: 1px solid var(--vscode-input-border);
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-editorWidget-background) 8%);
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      cursor: pointer;
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 85%, var(--vscode-editor-background) 15%);
      border-bottom: 1px solid var(--vscode-input-border);
      user-select: none;
    }
    .section-header h2 {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .section-toggle {
      width: 14px;
      display: inline-block;
      text-align: center;
      opacity: 0.85;
    }
    .section.collapsed .section-content { display: none; }
    .section-content {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .row {
      display: grid;
      grid-template-columns: 200px minmax(0, 1fr);
      gap: 12px;
      align-items: start;
    }
    .row label {
      font-size: 12px;
      font-weight: 600;
      opacity: 0.9;
      padding-top: 8px;
    }
    .control {
      min-width: 0;
    }
    input, select, textarea {
      width: 100%;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 5px;
      padding: 8px 9px;
      font-size: 12px;
      display: block;
    }
    input[disabled] {
      opacity: 0.8;
    }
    textarea {
      min-height: 70px;
      resize: vertical;
    }
    .inline {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 6px;
    }
    .inline input[type="checkbox"] {
      width: auto;
      margin: 0;
    }
    .hint {
      font-size: 11px;
      opacity: 0.72;
      margin-top: 4px;
    }
    .full {
      width: 100%;
    }
    .env-table {
      width: 100%;
      border-collapse: collapse;
    }
    .env-table th,
    .env-table td {
      border-bottom: 1px solid var(--vscode-input-border);
      padding: 6px;
      vertical-align: top;
    }
    .env-table th {
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      opacity: 0.85;
    }
    .env-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    button {
      border: none;
      border-radius: 5px;
      padding: 7px 12px;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 12px;
      font-weight: 600;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 14px;
      justify-content: flex-end;
    }
    .docker-extra { display: none; }
    .docker-extra.show { display: contents; }
    @media (max-width: 760px) {
      .row { grid-template-columns: 1fr; gap: 6px; }
      .row label { padding-top: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Edit Configuration</h1>

    <div class="section">
      <div class="section-header" data-toggle="general"><span class="section-toggle">▼</span><h2>General</h2></div>
      <div class="section-content" id="general">
        <div class="row">
          <label for="name">Name</label>
          <div class="control"><input id="name" /></div>
        </div>

        <div class="row">
          <label for="kind">Kind</label>
          <div class="control"><input id="kind" disabled /></div>
        </div>

        <div class="row">
          <label for="workingDirectory">Working Directory</label>
          <div class="control"><input id="workingDirectory" /></div>
        </div>

        <div class="row">
          <label for="allowMultipleInstances">Execution</label>
          <div class="control inline"><input id="allowMultipleInstances" type="checkbox" /><span>Allow multiple instances</span></div>
        </div>

        <div class="row">
          <label for="fieldA" id="fieldALabel">Program Args</label>
          <div class="control">
            <input id="fieldA" />
            <div class="hint" id="fieldAHint"></div>
          </div>
        </div>

        <div class="row">
          <label for="fieldB" id="fieldBLabel">Runtime Args</label>
          <div class="control">
            <input id="fieldB" />
            <div class="hint" id="fieldBHint"></div>
          </div>
        </div>

        <div class="row">
          <label for="fieldC" id="fieldCLabel">Option</label>
          <div class="control">
            <select id="fieldC"></select>
            <div class="hint" id="fieldCHint"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="section collapsed">
      <div class="section-header" data-toggle="env"><span class="section-toggle">▶</span><h2>Environment Variables</h2></div>
      <div class="section-content" id="env">
        <div class="full">
          <table class="env-table">
            <thead><tr><th style="width:30%">Name</th><th>Value</th><th style="width:72px"></th></tr></thead>
            <tbody id="envBody"></tbody>
          </table>
          <div class="env-actions">
            <button type="button" id="addEnv">Add Variable</button>
            <button type="button" id="clearEnv" class="secondary">Clear</button>
          </div>
        </div>
      </div>
    </div>

    <div class="section collapsed">
      <div class="section-header" data-toggle="docker"><span class="section-toggle">▶</span><h2>Docker / Podman</h2></div>
      <div class="section-content" id="docker">
        <div class="row">
          <label for="useDocker">Container Mode</label>
          <div class="control inline"><input id="useDocker" type="checkbox" /><span>Run in Docker/Podman</span></div>
        </div>

        <div class="docker-extra" id="dockerExtra">
          <div class="row">
            <label for="dockerImageOverride">Image Override</label>
            <div class="control">
              <input id="dockerImageOverride" placeholder="Optional (auto if empty)" />
              <div class="hint" id="dockerHint"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section collapsed">
      <div class="section-header" data-toggle="advanced"><span class="section-toggle">▶</span><h2>Advanced</h2></div>
      <div class="section-content" id="advanced">
        <div class="row">
          <label for="captureOutput">Output</label>
          <div class="control inline"><input id="captureOutput" type="checkbox" /><span>Capture output</span></div>
        </div>

        <div class="row">
          <label for="showTimestamps">Formatting</label>
          <div class="control inline"><input id="showTimestamps" type="checkbox" /><span>Show timestamps</span></div>
        </div>
      </div>
    </div>

    <div class="actions">
      <button id="saveButton" type="button">Save</button>
      <button id="cancelButton" type="button" class="secondary">Cancel</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const configuration = ${serialized};

    const byId = (id) => document.getElementById(id);

    const defaultDockerImage = () => {
      if (configuration.kind === 'npm-script') return 'node:lts-alpine';
      if (configuration.kind === 'dotnet-project' || configuration.kind === 'dotnet-launch-profile') {
        return 'mcr.microsoft.com/dotnet/sdk:10.0';
      }
      return 'not detected';
    };

    const splitArgs = (value) =>
      value.split(/\s+/).map((p) => p.trim()).filter(Boolean);

    const setDockerHint = () => {
      const override = byId('dockerImageOverride').value.trim();
      byId('dockerHint').textContent = override
        ? 'Using override: ' + override
        : 'Using default: ' + defaultDockerImage();
    };

    const renderEnvRow = (key = '', value = '') => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input value="' + escapeHtml(key) + '" /></td>' +
        '<td><input value="' + escapeHtml(value) + '" /></td>' +
        '<td><button type="button" class="secondary">Delete</button></td>';
      tr.querySelector('button').addEventListener('click', () => tr.remove());
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

    const toggleSection = (header) => {
      const section = header.closest('.section');
      section.classList.toggle('collapsed');
      header.querySelector('.section-toggle').textContent = section.classList.contains('collapsed') ? '▶' : '▼';
    };

    const setupKindSpecificFields = () => {
      const fieldA = byId('fieldA');
      const fieldB = byId('fieldB');
      const fieldC = byId('fieldC');
      if (configuration.kind === 'npm-script') {
        byId('fieldALabel').textContent = 'Script Args';
        byId('fieldBLabel').textContent = 'Script';
        byId('fieldCLabel').textContent = 'Package Manager';
        byId('fieldAHint').textContent = 'Arguments passed to the selected script';
        byId('fieldBHint').textContent = 'Script name from package.json';
        byId('fieldCHint').textContent = 'Package manager used to run the script';
        fieldA.value = (configuration.scriptArgs || []).join(' ');
        fieldB.value = configuration.script || '';
        fieldC.innerHTML = '<option value="npm">npm</option><option value="yarn">yarn</option><option value="pnpm">pnpm</option>';
        fieldC.value = configuration.packageManager;
      } else {
        byId('fieldALabel').textContent = 'Program Args';
        byId('fieldBLabel').textContent = 'Runtime Args';
        byId('fieldCLabel').textContent = 'Launch Browser';
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
      byId('useDocker').checked = Boolean(configuration.useDocker);
      byId('dockerImageOverride').value = configuration.dockerImageOverride || '';
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
      byId('dockerExtra').classList.toggle('show', byId('useDocker').checked);
      setDockerHint();
    };

    byId('addEnv').addEventListener('click', () => renderEnvRow('', ''));
    byId('clearEnv').addEventListener('click', () => {
      byId('envBody').innerHTML = '';
      renderEnvRow('', '');
    });

    byId('useDocker').addEventListener('change', () => {
      byId('dockerExtra').classList.toggle('show', byId('useDocker').checked);
      setDockerHint();
    });
    byId('dockerImageOverride').addEventListener('input', setDockerHint);

    document.querySelectorAll('.section-header').forEach((header) => {
      header.addEventListener('click', () => toggleSection(header));
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
      updated.useDocker = byId('useDocker').checked;
      updated.dockerImageOverride = byId('dockerImageOverride').value.trim() || undefined;
      updated.captureOutput = byId('captureOutput').checked;
      updated.showTimestamps = byId('showTimestamps').checked;
      updated.updatedAt = new Date().toISOString();

      if (updated.kind === 'npm-script') {
        updated.scriptArgs = splitArgs(byId('fieldA').value);
        updated.script = byId('fieldB').value.trim() || updated.script;
        updated.packageManager = byId('fieldC').value;
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

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 16; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
