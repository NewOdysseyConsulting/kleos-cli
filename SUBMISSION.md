# Publishing the Kleos CLI

The package is `kleos` on npm (the name was free on 2026-11-11; `@getkleos/cli` is the fallback if that changes
before the first publish). This directory is the whole package: it is meant to live in its own public repository,
https://github.com/NewOdysseyConsulting/kleos-cli, which package.json already points at.

## Owner steps

1. **Public repository.** Create `NewOdysseyConsulting/kleos-cli` (public, MIT) and push this directory's contents to
   its root: `src/`, `tests/`, `scripts/`, `.github/workflows/publish.yml`, `package.json`, `package-lock.json`,
   `tsconfig*.json`, `README.md`, `LICENSE`, `.gitignore`. Public matters for provenance and for the directories
   below, which read the repository link from the package.
2. **npm account.** Sign in at https://www.npmjs.com (or create an account for support@getkleos.ai, with 2FA on).
   The `kleos` name is unscoped, so no npm organisation is needed. If the name is gone by then, set `"name":
   "@getkleos/cli"` in package.json, create the `getkleos` organisation on npm (free for public packages), and
   change `npm i -g kleos` to `npm i -g @getkleos/cli` in the README.
3. **Token.** On npm: Access Tokens → Generate New Token → **Granular**, packages and scopes: read and write, limited
   to `kleos` (after the first publish; before it, "all packages"), and tick "Bypass 2FA" so the workflow can use it
   (automation tokens cannot answer a 2FA prompt). Copy it into the GitHub repository as the secret `NPM_TOKEN`
   (Settings → Secrets and variables → Actions).
4. **First publish.** Either from a terminal in the repository:
   ```sh
   npm ci
   npm test && npm run smoke
   npm login
   npm publish --access public
   ```
   or by publishing a GitHub release tagged `v0.1.0` (Releases → Draft a new release → tag `v0.1.0`), which runs
   `.github/workflows/publish.yml`: typecheck, tests, smoke, a check that the tag matches package.json, then
   `npm publish --access public --provenance`. Provenance only works from the workflow, so prefer the release path
   from the second version on; the first can be either.
5. **Each later version.** `npm version patch` (or `minor`), push with tags, draft a release for the new tag. The
   workflow publishes it.
6. **Check.** `npx kleos@latest --version` from a clean folder, and the package page at https://www.npmjs.com/package/kleos
   shows the README, the repository link and the provenance badge.

Nothing is published until the owner does step 4. The monorepo's CI does not run this package (it only knows apps/ and
packages/); the workflow above runs its tests on each release, and `npm test` runs them locally.

## Where it gets picked up on its own

Once the package is on npm, these list it without a submission:

- **npm** search and the package page (README, keywords, repository, provenance), within minutes.
- **Libraries.io** (https://libraries.io/npm/kleos) indexes every npm package, usually within a day, and tracks
  dependents and releases.
- **jsDelivr** serves it at https://cdn.jsdelivr.net/npm/kleos/ (and shows download stats at
  https://www.jsdelivr.com/package/npm/kleos) as soon as it exists on npm.
- **deps.dev** (https://deps.dev/npm/kleos) shows its dependencies, licence and security advisories, within a day.
- **Socket.dev**, **Snyk Advisor** and **npm trends** pick up npm packages automatically as well.
- **unpkg** mirrors it at https://unpkg.com/kleos/.

Worth doing by hand afterwards: link the package from https://getkleos.ai/agents next to the MCP server, and add it
to the awesome-cli-apps style lists once it has a few versions behind it.
