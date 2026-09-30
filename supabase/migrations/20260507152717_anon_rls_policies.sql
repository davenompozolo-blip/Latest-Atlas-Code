
-- cc_chats: allow anon full access (terminal is single-user, no auth)
CREATE POLICY "anon_select_chats" ON cc_chats FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_chats" ON cc_chats FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_chats" ON cc_chats FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_chats" ON cc_chats FOR DELETE TO anon USING (true);

-- atlas_memory: allow anon write access (SELECT policy already exists)
CREATE POLICY "anon_insert_memory" ON atlas_memory FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_memory" ON atlas_memory FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_memory" ON atlas_memory FOR DELETE TO anon USING (true);
