-- Curated catalog metadata becomes one row per PLUGIN instead of one row per
-- repository, so a monorepo can contribute several plugins. `catalog_repositories`
-- stays one row per GitHub repository and keeps owning repository facts
-- (stars, forks, pushed_at); the plugin's in-repo directory lives here.
--
-- SQLite cannot alter a primary key in place, so the table is rebuilt. Existing
-- rows migrate to the repository-level plugin (plugin_path = '').

PRAGMA foreign_keys = OFF;

CREATE TABLE catalog_metadata_v2 (
  repository_id INTEGER NOT NULL
    REFERENCES catalog_repositories (id) ON DELETE CASCADE,
  -- In-repo plugin directory; '' for a repository-level plugin.
  plugin_path TEXT NOT NULL DEFAULT '',
  -- Full plugin id in its submitted case: owner/repository[/sub/dir].
  plugin_id TEXT NOT NULL,
  -- Lowercased plugin_id; the catalog's uniqueness key.
  normalized_plugin_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description_en TEXT NOT NULL,
  description_zh TEXT NOT NULL,
  added TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'github_pr' CHECK (source = 'github_pr'),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (repository_id, plugin_path)
);

INSERT INTO catalog_metadata_v2 (
  repository_id, plugin_path, plugin_id, normalized_plugin_id,
  display_name, category, description_en, description_zh, added, source, updated_at
)
SELECT
  m.repository_id, '', r.full_name, r.normalized_full_name,
  m.display_name, m.category, m.description_en, m.description_zh, m.added, m.source, m.updated_at
FROM catalog_metadata m
JOIN catalog_repositories r ON r.id = m.repository_id;

DROP TABLE catalog_metadata;

ALTER TABLE catalog_metadata_v2 RENAME TO catalog_metadata;

CREATE UNIQUE INDEX catalog_metadata_plugin_id_idx
  ON catalog_metadata (normalized_plugin_id);

PRAGMA foreign_keys = ON;
