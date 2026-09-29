# MinecraftAccountLauncher

**NEXUS Control — packaged as a real Windows desktop application.**

The desktop build embeds the existing Node/Mineflayer runtime inside the Electron main process. End users do **not** need to keep a Command Prompt window open. Closing the application requests a graceful shutdown, disconnects active bot sessions and stops the local service before the app exits.

## Download

After this repository is published on GitHub, GitHub Actions builds two Windows artifacts:

- `MinecraftAccountLauncher-Setup-1.0.0.exe` — installer
- `MinecraftAccountLauncher-Portable-1.0.0.exe` — portable build

The workflow also publishes the artifacts to a GitHub Release when a `v*` tag is pushed.

## Development

```text
npm install
npm start
```

`npm start:web` is optional and is only for browser-based development. It is not needed by the packaged application.

## User data

Installed builds store editable accounts, settings and uploaded skins in the platform app-data directory rather than inside the read-only installation folder.

## Build on GitHub

Push the repository to GitHub and run **Actions → Build Windows app**. The workflow installs dependencies, validates the source, builds NSIS + portable Windows artifacts and uploads them to the workflow run. Tagging a release such as `v1.0.0` additionally publishes those files to GitHub Releases.
