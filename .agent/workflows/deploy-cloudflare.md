---
description: Deploying React/Vite app to Cloudflare Pages
---

To deploy this application to **Cloudflare Pages**, ensure your settings match the following configuration. The `npm error enoent` typically occurs if the "Root directory" is incorrect or if the build command is trying to access a missing file.

1.  **Log in to Cloudflare Dashboard** and go to **Pages**.
2.  Create a new project or select your existing `random-generator` project.
3.  Go to **Settings** -> **Builds & deployments**.
4.  Verify the **Build configuration**:
    *   **Framework preset**: Select `Vite` (or `Create React App`).
    *   **Build command**: `npm run build`
    *   **Build output directory**: `dist`
    *   **Root directory**: `/` (Leave empty or set to `/` if your `package.json` is in the repository root. If your project is in a subdirectory like `random-generator`, set this to `random-generator`).

### Troubleshooting `npm error enoent`

If you still see `npm error enoent`:

1.  **Check Repo Structure**: Ensure your `package.json` is exactly where Cloudflare thinks it is.
    *   If your repo looks like `my-repo -> package.json`, Root directory should be empty/`/`.
    *   If your repo looks like `my-repo -> random-generator -> package.json`, Root directory **MUST** be `random-generator`.

2.  **Node Version**: Sometimes default Node versions are old.
    *   Go to **Settings** -> **Environment variables**.
    *   Add a variable: `NODE_VERSION` = `18` (or `20`).

3.  **Clean Cache**:
    *   Go to **Deployments**.
    *   Click **Retry deployment** -> **Retry with clear cache**.

### Local Verification
Run this command locally to ensure the build script works:
```powershell
npm run build
```
If this works locally, the issue is almost certainly the **Root directory** setting in Cloudflare.
