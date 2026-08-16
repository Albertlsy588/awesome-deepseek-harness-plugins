-- AI 自动分类：让 catalog_metadata 也能容纳采集条目的分类与双语描述。
--
-- catalog_metadata 原本只接受人工策展数据（CHECK (source = 'github_pr')）。
-- SQLite 无法就地修改 CHECK 约束，只能重建表。表很小（人工条目量级几百行），
-- 重建是秒级操作。
--
-- 新增两列：
--   classifier_version — AI 写入时记录，是去重与重跑的唯一开关
--   description_origin — 描述来源追溯（作者原文 / AI 生成），不对外展示
--
-- 人工与 AI 数据的隔离不依赖本表的 source 字段，而是依赖
-- catalog_repository_sources 里有无 'github_pr' 行（那张表由 syncCuratedEntries
-- 正确维护）。因此 syncCuratedEntries 无需任何改动。

PRAGMA foreign_keys = OFF;

CREATE TABLE catalog_metadata_new (
  repository_id INTEGER PRIMARY KEY
    REFERENCES catalog_repositories (id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description_en TEXT NOT NULL,
  description_zh TEXT NOT NULL,
  added TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'github_pr'
    CHECK (source IN ('github_pr', 'ai')),
  classifier_version TEXT,
  description_origin TEXT
    CHECK (description_origin IS NULL
           OR description_origin IN ('author_en', 'author_zh', 'generated')),
  updated_at TEXT NOT NULL
);

-- 必须显式列出列名：新表在 source 与 updated_at 之间插入了两列，
-- 用 SELECT * 会让 updated_at 错位到 classifier_version。
INSERT INTO catalog_metadata_new (
  repository_id, display_name, category, description_en, description_zh,
  added, source, updated_at
)
SELECT repository_id, display_name, category, description_en, description_zh,
       added, source, updated_at
  FROM catalog_metadata;

DROP TABLE catalog_metadata;
ALTER TABLE catalog_metadata_new RENAME TO catalog_metadata;

CREATE INDEX catalog_metadata_source_version_idx
  ON catalog_metadata (source, classifier_version);

PRAGMA foreign_keys = ON;
