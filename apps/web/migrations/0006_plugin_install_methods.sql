-- Per-plugin install-method facts, and one definition of "published".
--
-- The catalog offers a plugin two ways to install: from GitHub, and from npm
-- when a published package can be tied back to the plugin's source. Whether
-- either actually works is an observed fact about somebody else's repository,
-- so it is crawled and refreshed here rather than submitted. Only facts live in
-- these tables; the verdict shown to a reader is derived from them at snapshot
-- time (apps/web/worker/lib/install-methods.ts), so changing how a fact is
-- judged is a deploy, not a re-crawl of every plugin.
--
-- Verification never gates inclusion. A plugin whose every install method is
-- unverified is still catalogued and still served; the reader is simply told.

PRAGMA foreign_keys = ON;

-- What a git install of this plugin would produce.
--
-- pnpm runs `prepare` after a git install and otherwise ships only committed
-- files, so a plugin whose entry point is a build artifact produced at
-- npm-publish time installs cleanly and then fails at startup. That is the
-- distinction entry_committed / has_prepare captures.
CREATE TABLE catalog_plugin_manifests (
  repository_id   INTEGER NOT NULL
    REFERENCES catalog_repositories (id) ON DELETE CASCADE,
  -- In-repo plugin directory; '' for a repository-level plugin. Stored raw:
  -- git paths are case-sensitive and this joins catalog_metadata's key.
  plugin_path     TEXT NOT NULL DEFAULT '',
  manifest_path   TEXT,
  package_name    TEXT,
  package_version TEXT,
  bundle_patch    TEXT,
  entry_point     TEXT,
  entry_committed INTEGER NOT NULL DEFAULT 0 CHECK (entry_committed IN (0, 1)),
  has_prepare     INTEGER NOT NULL DEFAULT 0 CHECK (has_prepare IN (0, 1)),
  inspect_status  TEXT NOT NULL DEFAULT 'pending'
    CHECK (inspect_status IN ('pending', 'ok', 'absent', 'error')),
  -- The GitInstallCode the derivation reads; NULL until first inspected.
  inspect_code    TEXT,
  inspect_reason  TEXT,
  -- Default-branch commit the facts came from, so a push can invalidate them.
  head_sha        TEXT,
  checked_at      TEXT,
  PRIMARY KEY (repository_id, plugin_path)
);

CREATE INDEX catalog_plugin_manifests_queue_idx
  ON catalog_plugin_manifests (inspect_status, checked_at);

-- The npm package a plugin claims, and how firmly it is tied back to it.
--
-- `binding` is the whole point: a name that merely exists on npm is not
-- evidence. Only `strict` (repository.url and repository.directory both point
-- back here, and the published manifest declares a DSH bundle) is safe to
-- recommend; the rest are recorded so an author can be told what to fix.
CREATE TABLE catalog_plugin_npm (
  repository_id        INTEGER NOT NULL
    REFERENCES catalog_repositories (id) ON DELETE CASCADE,
  plugin_path          TEXT NOT NULL DEFAULT '',
  package_name         TEXT NOT NULL,
  probe_status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (probe_status IN ('pending', 'found', 'absent', 'error')),
  npm_version          TEXT,
  repository_url       TEXT,
  repository_directory TEXT,
  bundle_declared      INTEGER NOT NULL DEFAULT 0 CHECK (bundle_declared IN (0, 1)),
  entry_point          TEXT,
  tarball_url          TEXT,
  integrity            TEXT,
  -- Reserved: npm provenance attestations bind a tarball to a source commit,
  -- but adoption is far too low to probe for yet.
  provenance           INTEGER NOT NULL DEFAULT 0 CHECK (provenance IN (0, 1)),
  binding              TEXT NOT NULL DEFAULT 'unknown'
    CHECK (binding IN ('strict', 'name_only', 'mismatch', 'no_bundle', 'absent', 'unknown')),
  http_status          INTEGER,
  checked_at           TEXT,
  PRIMARY KEY (repository_id, plugin_path)
);

CREATE INDEX catalog_plugin_npm_queue_idx
  ON catalog_plugin_npm (probe_status, checked_at);

-- One definition of the published set.
--
-- This is the structural fix, not a convenience. The set served to readers and
-- the set fed to the validation queue were two different predicates in two
-- different places, and they disagreed: syncCuratedEntries inserts repository
-- rows with github_id NULL and topic_present 0, while the queue only ever
-- selected github_id IS NOT NULL AND topic_present = 1. Every curated plugin
-- was therefore published without ever being inspected. Both sides read this
-- view now, so "published but never checked" cannot recur.
--
-- A repository with curated metadata contributes one row per curated plugin; a
-- topic-only repository contributes one row at its accepted manifest's
-- directory (13 = length('/package.json'), mirroring pluginPathFromPackagePath
-- in worker/lib/plugin-id.ts).
CREATE VIEW catalog_published_plugins AS
SELECT r.id AS repository_id,
       COALESCE(
         m.plugin_path,
         CASE
           WHEN r.package_path IS NULL OR r.package_path = 'package.json' THEN ''
           WHEN r.package_path LIKE '%/package.json'
             THEN substr(r.package_path, 1, length(r.package_path) - 13)
           ELSE ''
         END
       ) AS plugin_path,
       r.normalized_full_name,
       r.full_name,
       r.owner,
       r.repository_name,
       r.default_branch,
       r.pushed_at,
       r.github_id
FROM catalog_repositories r
LEFT JOIN catalog_metadata m ON m.repository_id = r.id
WHERE (r.topic_present = 1 AND r.validation_status = 'accepted')
   OR EXISTS (
     SELECT 1 FROM catalog_repository_sources s
      WHERE s.repository_id = r.id AND s.source = 'github_pr'
   );

-- Seed the queue so the first cron tick has work instead of discovering the
-- backlog a week later. Facts stay 'pending': package_name carried over from
-- the repository row was never accompanied by entry/prepare data.
INSERT INTO catalog_plugin_manifests (
  repository_id, plugin_path, manifest_path, package_name, package_version, bundle_patch, inspect_status
)
SELECT p.repository_id, p.plugin_path, r.package_path, r.package_name, r.package_version, r.bundle_patch, 'pending'
  FROM catalog_published_plugins p
  JOIN catalog_repositories r ON r.id = p.repository_id
ON CONFLICT (repository_id, plugin_path) DO NOTHING;
