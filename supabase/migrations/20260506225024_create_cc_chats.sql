
-- Command Centre chat history table.
-- All access goes through the Vercel /api/chats serverless function
-- using the service role key, so no anon policies are needed.

CREATE TABLE public.cc_chats (
  id         text        PRIMARY KEY,
  agent_id   text        NOT NULL CHECK (agent_id IN ('archivist','architect','engineer','strategist')),
  title      text,
  messages   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cc_chats_agent_updated ON public.cc_chats (agent_id, updated_at DESC);

-- RLS on — no anon/authenticated policies. Only service role can access.
ALTER TABLE public.cc_chats ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.cc_chats_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cc_chats_updated_at
  BEFORE UPDATE ON public.cc_chats
  FOR EACH ROW EXECUTE FUNCTION public.cc_chats_set_updated_at();
