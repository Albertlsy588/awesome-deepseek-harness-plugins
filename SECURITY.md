# Security Policy

## Reporting a vulnerability

Do not open a public issue for an exploitable vulnerability in the catalog automation (the submission review workflow, sync scripts, or README generation). Use GitHub's private vulnerability reporting for this repository when available, and include the affected workflow or script, reproduction steps, and impact. Vulnerabilities in the deepseek1024.com site, its API, or the `dsh1024` CLI belong to [imsai-sh/dsh-1024store](https://github.com/imsai-sh/dsh-1024store).

## Third-party packages

Catalog entries point to independently maintained repositories. Report vulnerabilities in a listed package to that package's maintainer. Catalog inclusion is not a security review or endorsement.

Harness plugins execute as trusted local code. Users should inspect source and dependencies, avoid unreviewed package lifecycle scripts, and pin a reviewed revision in sensitive environments.
