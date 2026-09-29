# MinecraftAccountLauncher — GitHub App Builds

GitHub Actions builds the desktop app on native GitHub-hosted runners for Windows, macOS, and Linux.

## Included targets

- Windows x64: NSIS installer + portable `.exe`
- Windows ARM64: NSIS installer + portable `.exe`
- macOS x64: `.dmg` + `.zip`
- macOS ARM64: `.dmg` + `.zip`
- Linux x64: AppImage + `.deb`
- Linux ARM64: AppImage + `.deb`

The workflow uses Node.js 24 and disables npm package-manager caching, so the repository does not need a lockfile just to configure the cache. The install step intentionally uses `npm install` rather than `npm ci`.

## Workflows

`.github/workflows/build-windows.yml` is kept under its existing filename so uploading this repository overwrites the older workflow instead of leaving a legacy workflow behind.

`.github/workflows/validate.yml` performs the same Node 24 validation without npm caching.

## Releases

Push a tag such as `v1.0.1`. After the native platform builds finish, the release job collects the build artifacts and publishes them to the GitHub release.
