
CREATE TABLE public.atlas_memory (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  category    TEXT        NOT NULL,
  key         TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  tags        TEXT[]      DEFAULT '{}',
  priority    INT         DEFAULT 0,
  source      TEXT        DEFAULT 'manual',
  session_id  TEXT,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE (category, key)
);

CREATE INDEX idx_memory_category ON public.atlas_memory (category);
CREATE INDEX idx_memory_priority ON public.atlas_memory (priority DESC);
CREATE INDEX idx_memory_tags     ON public.atlas_memory USING GIN (tags);
CREATE INDEX idx_memory_fts      ON public.atlas_memory USING GIN (to_tsvector('english', content));

CREATE OR REPLACE FUNCTION public.atlas_memory_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER atlas_memory_updated_at
  BEFORE UPDATE ON public.atlas_memory
  FOR EACH ROW EXECUTE FUNCTION public.atlas_memory_set_updated_at();

ALTER TABLE public.atlas_memory ENABLE ROW LEVEL SECURITY;

-- Service role (Vercel functions) gets full access
CREATE POLICY "service_role_full_access" ON public.atlas_memory
  FOR ALL USING (auth.role() = 'service_role');

-- Anon can read (useful for future read-only embeds)
CREATE POLICY "anon_read_access" ON public.atlas_memory
  FOR SELECT USING (true);
