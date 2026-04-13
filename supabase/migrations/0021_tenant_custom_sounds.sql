-- ================================================================
-- テナント共有カスタム音源テーブル
-- カスタムブザー音源をテナント単位で管理し、複数プリセットで共有可能にする
-- ================================================================

CREATE TABLE IF NOT EXISTS tenant_custom_sounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  file_url text NOT NULL,
  file_size integer NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('audio/mpeg', 'audio/wav', 'audio/ogg')),
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_custom_sounds_tenant_id ON tenant_custom_sounds(tenant_id);
