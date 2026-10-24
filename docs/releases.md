# Package releases

GitHub Actions runs `npm run verify:release` for pull requests and pushes to
`main`. This command runs type checks, Vitest, compiler contract checks, Oxlint,
and the clean installed-package checks. The release workflow also runs it on the
exact release commit before publishing.

## One-time npm setup

The package must exist on npm before its trusted publisher can be configured.
The initial version is `0.1.0`; publish it once from the renamed package source:

```sh
npm ci
npm login
npm publish --access public
```

The publish lifecycle runs all release checks and builds the package. Complete
the npm browser login and any two-factor authentication prompts yourself.

In the npm package settings, add a GitHub Actions trusted publisher with:

- Organization or user: `TiagoJacinto`
- Repository: `vitest-cucumber-context-mapper`
- Workflow filename: `release.yml`
- Environment: leave empty
- Allowed actions: enable direct `npm publish`

The workflow uses npm 11 with OIDC and requires no `NPM_TOKEN` secret. Complete a
successful automatic publication within two days of creating the trusted
publisher; npm expires an unvalidated configuration after that period. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

In GitHub repository settings, Actions must be allowed to create pull requests.
This setting has been enabled for this repository. Workflow permissions are
declared per job; the repository default can remain read-only.

## Normal releases

Use Conventional Commit titles when squash-merging PRs:

- `fix: ...` creates a patch release, such as `0.1.0` to `0.1.1`.
- `feat: ...` creates a minor release, such as `0.1.0` to `0.2.0`.
- A breaking change, such as `feat!: ...`, creates a minor release while below
  `1.0.0`, and a major release after `1.0.0`.
- `chore: ...`, `docs: ...`, and other non-release commits do not independently
  create a release.

Release Please maintains a release PR with the version and changelog changes.
It explicitly dispatches CI for that branch, so the bot can use GitHub's built-in
token. Merge the release PR when ready. The same workflow creates the GitHub
release, validates its exact commit, and publishes the package to npm. Publishing
occurs inside that workflow rather than relying on a second workflow triggered
by a bot-created tag.

The manifest records `0.1.0` as the initial manual release baseline. Existing
history before the automation setup is excluded from version calculation.

## Recovering a failed publication

If npm publishing fails after the GitHub release is created, fix the cause and
run **Actions → Release → Run workflow** on `main`, entering the existing tag
(for example `v0.1.1`). Equivalently:

```sh
gh workflow run release.yml --ref main -f tag=v0.1.1
```

This retries the existing release after validation; it does not create a new
version. The workflow checks that the tag matches `package.json`, points to the
checked-out commit, belongs to `main`, and has a published GitHub release.
If that version is already on npm, do not retry it: npm versions are immutable.

Run **Release** with the tag input empty to refresh the release PR without a new
push. See [Release Please](https://github.com/googleapis/release-please-action)
for release PR behavior.
