# GitHub Actions cleanup

This package deliberately overwrites `.github/workflows/build-windows.yml` and `.github/workflows/validate.yml`.

If your repository still contains an older workflow such as `.github/workflows/build-desktop.yml`, delete that old file once. Keeping two desktop-build workflows would intentionally run two independent pipelines.

The new desktop workflow does not require a lockfile because npm caching is explicitly disabled in `actions/setup-node`.
