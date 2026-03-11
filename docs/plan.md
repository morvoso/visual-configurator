## Plan

This repository is implementing a VS Code extension that mimics the workflow of JetBrains run configurations while staying within VS Code's native extension model.

## MVP Targets

- .NET Core and ASP.NET Core projects
- npm, yarn, and pnpm package scripts

## Architecture

- Extension-managed configuration store as the source of truth
- Run and Debug view integration for discovery and management
- Separate adapters for .NET and npm execution
- Optional sync to launch.json and tasks.json for compatibility

## First Implementation Slice

1. Scaffold the extension project and build pipeline.
2. Define shared configuration types and persistence.
3. Discover runnable .NET projects, launch profiles, and npm scripts.
4. Surface discovered items and saved configurations in a Tree View.
5. Allow importing discovered items into saved configurations.
6. Run saved configurations through VS Code tasks.

## Next Steps

1. Add a webview configuration editor.
2. Add debug execution support for .NET and Node-capable npm scripts.
3. Add compound runs and stop controls.
4. Add launch.json/tasks.json sync.
