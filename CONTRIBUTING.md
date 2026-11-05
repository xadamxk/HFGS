# Contributing

When contributing to this repository, please first discuss the change you wish to make via issue,
email, or any other method with the owners of this repository before making a change.

Please note we have a code of conduct, please follow it in all your interactions with the project.

## Pull Request Process

1. Before you begin to code be sure the changes are appropriate and do not break the code of conduct.
2. Run `npm run typecheck`, `npm test` and `npm run lint` before opening a pull request. See [BUILDING.md](BUILDING.md) and the Development section of the [README](README.md).
3. Wait patiently until the lead developer gets to the pull request.

## Code of Conduct

### Feature Limitations

Hack Forums rate-limits game actions (its flood control rejects actions sent about a second apart). All requests to Hack Forums must go through `HfClient` (`src/core/HfClient.ts`), which sends one request at a time, keeps the "Delay between actions" setting (2 seconds by default) between them, and retries HF's flood page. Don't add requests that bypass it, and don't lower the minimum delay.

Bots must never place a bet the user hasn't started: every session starts from the panel's Start button, and the "Confirm before starting" setting stays on by default.

### Our Standards

Examples of behavior that contributes to creating a positive environment
include:

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

Examples of unacceptable behavior by participants include:

- The use of sexualized language or imagery and unwelcome sexual attention or
  advances
- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information, such as a physical or electronic
  address, without explicit permission
- Other conduct which could reasonably be considered inappropriate in a
  professional setting

### Our Responsibilities

Project maintainers are responsible for clarifying the standards of acceptable
behavior and are expected to take appropriate and fair corrective action in
response to any instances of unacceptable behavior.

Project maintainers have the right and responsibility to remove, edit, or
reject comments, commits, code, wiki edits, issues, and other contributions
that are not aligned to this Code of Conduct, or to ban temporarily or
permanently any contributor for other behaviors that they deem inappropriate,
threatening, offensive, or harmful.

### Attribution

This Code of Conduct is adapted from the [Contributor Covenant][homepage], version 1.4,
available at [http://contributor-covenant.org/version/1/4][version]

[homepage]: http://contributor-covenant.org
[version]: http://contributor-covenant.org/version/1/4/
