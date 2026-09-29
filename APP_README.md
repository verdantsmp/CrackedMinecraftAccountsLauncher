# MinecraftAccountLauncher

A Windows desktop app for the existing NEXUS Control interface. The Electron shell starts the local bot service inside the app process, so there is no Command Prompt window to keep open. Closing the app triggers a graceful shutdown of the web service and all running bot sessions.

## Build on GitHub

1. Put this folder into a GitHub repository.
2. Push to `main`.
3. Open **Actions** and run **Build Windows app**.
4. The workflow creates a Windows installer (`MinecraftAccountLauncher-Setup-1.0.0.exe`) and a portable build.
5. Create a GitHub Release with a tag such as `v1.0.0` to publish both installers as release assets automatically.

## Local development

```text
npm install
npm start
```

The app opens its own desktop window. `npm start:web` is only for web development and is not required for normal app use.

## Shutdown behavior

The renderer is not the owner of the bot runtime. Electron owns the runtime, and `before-quit` calls the server shutdown hook. This means closing the window also stops background bot connections and timers.
