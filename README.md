# Visual Configurator

Visual Configurator is a VS Code extension under development that brings a JetBrains-inspired run configuration experience to the Run and Debug view.

The first implementation slice includes:

- .NET project and launch profile discovery
- npm, yarn, and pnpm script discovery
- persisted saved configurations
- a Run and Debug sidebar view for importing and activating configurations
- task-backed run execution for imported configurations

The current iteration also includes:

- debug actions for saved .NET and npm configurations
- configuration editing for saved entries
- stop actions for task and debug sessions started by the extension

## Development

```bash
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.
