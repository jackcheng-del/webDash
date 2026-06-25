# Web Dashboard for Control Center

A high-contrast, web-based dashboard for satellite constellation control centers,
optimized for visibility and usability on large screens.

Built with Vite, React, TypeScript, Tailwind CSS, and shadcn/ui.

## Local development

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build into ./dist
```

## Deployment (GitHub Pages)

This repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`)
that builds the app and publishes it to GitHub Pages on every push to `main`.

One-time setup after pushing the repo to GitHub:

1. Go to the repository's **Settings -> Pages**.
2. Under **Build and deployment -> Source**, select **GitHub Actions**.
3. Push to `main` (or re-run the workflow from the **Actions** tab).

The site will be published at:

```
https://<your-username>.github.io/<repo-name>/
```

The workflow automatically sets the correct base path for the subdirectory and
adds a `404.html` SPA fallback so client-side routes work on refresh.

## Deploying elsewhere (Netlify / Vercel / static host)

The default base path is `/`, so a plain `npm run build` produces a `dist/`
folder ready for any static host. Set the build command to `npm run build` and
the publish/output directory to `dist`.
