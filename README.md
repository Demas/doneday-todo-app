# DoneDay

DoneDay is a browser-based to-do list built with React, TypeScript, and Vite. Tasks are stored in the browser's local storage, so the app does not require a backend, authentication service, or environment variables.

## Requirements

- Node.js 20 or later
- npm 10 or later

## Local development

```bash
npm install
npm run dev
```

Vite will print the local URL when the development server is ready.

## Verification

```bash
npm test
npm run build
```

The production build runs TypeScript checking and writes deployable static files to `dist/`.

## Deploying to Vercel

1. Push this repository to a Git provider and import it in Vercel, or run `vercel` from this directory.
2. Leave the framework preset as **Vite**.
3. Use `npm run build` as the build command.
4. Use `dist` as the output directory.
5. Do not add environment variables; this app does not use any.
6. Deploy.

Vercel detects Vite from `package.json`, so no `vercel.json` is necessary. The app currently has one document route and switches views in the browser, so it does not need an SPA rewrite rule.

## Data and privacy

Tasks and settings are saved locally in the browser. Export a JSON backup from Settings before moving browsers or clearing browser data.
