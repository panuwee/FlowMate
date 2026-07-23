# GitLab Quick Guide

## Repository

For self-service applications, create your repository under:
https://gitlab.garena.in.th/self-service-apps

## Clone Repository

Clone the repository to your local machine:
```bash
git clone <repository-url>
cd <repository-folder>
```

If the project uses pre-commit hooks (e.g. Husky), run `npm install` once after cloning so the hooks are active.

## Creating a New Branch

`main` is a protected branch — nobody pushes to it directly. All changes go through a new branch first, then a Merge Request.

1. Go to Code → Branches.
2. Click New branch.
3. Enter a branch name following the **Branch Naming Convention** below, and create the branch.
4. Make your code changes in this branch.
5. After testing is complete, create a Merge Request to merge your changes into the main branch.

### Branch Naming Convention

Since `main` is protected, branch names follow a simple incrementing version pattern — no spaces (git branch names cannot contain spaces):

```
version1, version2, version3, ...
```

- Start a new round of changes → create the next number in the sequence (e.g. if `version3` is the latest existing branch, the next one is `version4`).
- Don't reuse or go back to an old version branch once its Merge Request has been merged into `main`.
- This is separate from the deployment tag version (see **Tag Naming Convention** below) — the branch number just tracks the order changes were made, it doesn't need to match the tag's semantic version.

## Push Code

Make sure you are on your feature branch (not main):
```bash
git checkout -b version1
```

Stage and commit your changes:
```bash
git add .
git commit -m "your message"
```

Push the branch to GitLab:
```bash
git push -u origin version1
```

Then open a Merge Request as described below.

## Creating a Merge Request

After you have finished editing and testing your code:

1. Go to Code → Merge Requests.
2. Click Create merge request.
3. Select:
   - Source branch: Your feature branch
   - Target branch: main
4. Review the changes and submit the Merge Request.
5. Once approved, merge it into the main branch.

## Creating Tags for Deployment

1. Go to Code → Tags.
2. Click New tag.
3. Create a tag from the appropriate branch:
   - **Test**: Tag the feature/sub branch that you want to deploy.
   - **UAT**: Tag the main branch after the changes have been merged.
   - **Production**: Tag the main branch.

### Tag Naming Convention

All deployment tags must start with `auto-detect-version`.

| Environment | Example Tag |
|---|---|
| Test | `auto-detect-version-1.0.0-alpha` |
| UAT | `auto-detect-version-1.0.0-beta` |
| Production | `auto-detect-version-1.0.0` |

Note: Always follow semantic versioning when increasing the version number (e.g., `1.0.1`, `1.1.0`, `2.0.0`).
