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
      async (message: SaveMessage) => {
        if (message.type !== 'save') {
          return;
        }

        await onSave(message.payload);
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
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
  />
  <title>Edit Configuration</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      margin: 16px;
    }
    h1 {
      margin-top: 0;
      font-size: 18px;
    }
    .grid {
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: 10px 14px;
      align-items: center;
    }
    label {
      font-size: 12px;
      opacity: 0.9;
    }
    input, textarea, select {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 7px;
      border-radius: 4px;
    }
    textarea {
      min-height: 70px;
      resize: vertical;
    }
    .actions {
      margin-top: 16px;
      display: flex;
      gap: 8px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 8px 14px;
      cursor: pointer;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
  </style>
</head>
<body>
  <h1>Edit Configuration</h1>
  <div class="grid">
    <label for="name">Name</label>
    <input id="name" />

    <label for="kind">Kind</label>
    <input id="kind" disabled />

    <label for="workingDirectory">Working Directory</label>
    <input id="workingDirectory" />

    <label for="environment">Environment (KEY=value;...)</label>
    <textarea id="environment"></textarea>

    <label for="allowMultipleInstances">Allow Multiple Instances</label>
    <select id="allowMultipleInstances">
      <option value="false">false</option>
      <option value="true">true</option>
    </select>

    <label for="fieldA">Primary Args</label>
    <input id="fieldA" />

    <label for="fieldB">Secondary Args</label>
    <input id="fieldB" />

    <label for="fieldC">Browser Launch</label>
    <select id="fieldC">
      <option value="false">false</option>
      <option value="true">true</option>
    </select>
  </div>

  <div class="actions">
    <button id="saveButton">Save</button>
    <button id="cancelButton" class="secondary">Cancel</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const configuration = ${serialized};

    const ids = [
      'name',
      'kind',
      'workingDirectory',
      'environment',
      'allowMultipleInstances',
      'fieldA',
      'fieldB',
      'fieldC'
    ];
    const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

    el.name.value = configuration.name;
    el.kind.value = configuration.kind;
    el.workingDirectory.value = configuration.workingDirectory;
    el.environment.value = Object.entries(configuration.environment || {})
      .map(([k, v]) => k + '=' + v)
      .join(';');
    el.allowMultipleInstances.value = String(configuration.allowMultipleInstances);

    if (configuration.kind === 'npm-script') {
      el.fieldA.previousElementSibling.textContent = 'Script Args';
      el.fieldA.value = (configuration.scriptArgs || []).join(' ');
      el.fieldB.previousElementSibling.textContent = 'Script';
      el.fieldB.value = configuration.script || '';
      el.fieldC.previousElementSibling.textContent = 'Package Manager';
      el.fieldC.innerHTML = ['npm', 'yarn', 'pnpm']
        .map(pm => '<option value="' + pm + '">' + pm + '</option>')
        .join('');
      el.fieldC.value = configuration.packageManager;
    } else {
      el.fieldA.previousElementSibling.textContent = 'Program Args';
      el.fieldA.value = (configuration.programArgs || []).join(' ');
      el.fieldB.previousElementSibling.textContent = 'Runtime Args';
      el.fieldB.value = (configuration.runtimeArgs || []).join(' ');
      el.fieldC.previousElementSibling.textContent = 'Launch Browser';
      el.fieldC.innerHTML = '<option value="false">false</option><option value="true">true</option>';
      el.fieldC.value = String(Boolean(configuration.launchBrowser));
    }

    document.getElementById('cancelButton').addEventListener('click', () => {
      window.close();
    });

    document.getElementById('saveButton').addEventListener('click', () => {
      const updated = structuredClone(configuration);
      updated.name = el.name.value.trim() || configuration.name;
      updated.workingDirectory = el.workingDirectory.value.trim() || configuration.workingDirectory;
      updated.allowMultipleInstances = el.allowMultipleInstances.value === 'true';
      updated.environment = parseEnvironment(el.environment.value);
      updated.updatedAt = new Date().toISOString();

      if (updated.kind === 'npm-script') {
        updated.scriptArgs = splitArgs(el.fieldA.value);
        updated.script = el.fieldB.value.trim() || updated.script;
        updated.packageManager = el.fieldC.value;
      } else {
        updated.programArgs = splitArgs(el.fieldA.value);
        updated.runtimeArgs = splitArgs(el.fieldB.value);
        updated.launchBrowser = el.fieldC.value === 'true';
      }

      vscode.postMessage({ type: 'save', payload: updated });
    });

    function splitArgs(value) {
      return value
        .split(/\s+/)
        .map(part => part.trim())
        .filter(Boolean);
    }

    function parseEnvironment(value) {
      return value
        .split(';')
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(entry => {
          const i = entry.indexOf('=');
          if (i < 1) return undefined;
          return [entry.slice(0, i).trim(), entry.slice(i + 1).trim()];
        })
        .filter(Boolean)
        .reduce((acc, [k, v]) => {
          acc[k] = v;
          return acc;
        }, {});
    }
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
