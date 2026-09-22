-- I-1: atlas_chain_stage_status() contract.
--
-- The two cases that matter are 6 and 7. They are the whole reason the probe
-- exists: a dispatch row reading 'success' while the handler is still working
-- must NOT report success. Case 7 says "still working" and case 6 says "we
-- stopped being able to tell" -- and 'unobserved' is neither success nor error,
-- because a stage whose completion cannot be seen has not been seen to complete.
--
-- Every fixture uses sentinel stages and sentinel sync_log sources so it cannot
-- match a real row. That matters more than usual here: running this through the
-- Supabase MCP COMMITS each call, so a fixture that touched real function_name
-- or source values would leave residue in the live log.
--
-- Run under psql:  psql "$SUPABASE_DB_URL" -f this_file.sql

begin;

insert into public.atlas_chain_stages
    (seq, stage, kind, target, gate_prices, depends_on, hard, dow,
     completion_log_name, completion_source, max_wait_s)
values
 (9001,'i1t1','sql','atlas_chain_base()',false,null,false,'{0,1,2,3,4,5,6}', null,        null,         600),
 (9002,'i1t2','sql','atlas_chain_base()',false,null,false,'{0,1,2,3,4,5,6}', null,        null,         600),
 (9003,'i1t3','sql','atlas_chain_base()',false,null,false,'{0,1,2,3,4,5,6}', null,        null,         600),
 (9004,'i1t4','sql','atlas_chain_base()',false,null,false,'{0,1,2,3,4,5,6}', null,        null,         600),
 (9005,'i1t5','sql','atlas_chain_base()',false,null,false,'{0,1,2,3,4,5,6}', null,        null,         600),
 (9006,'i1t6','sql','atlas_chain_base()',false,null,false,'{0,1,2,3,4,5,6}','i1w6','test:i1-src',30),
 (9007,'i1t7','sql','atlas_chain_base()',false,null,false,'{0,1,2,3,4,5,6}','i1w7','test:i1-src',3600),
 (9008,'i1t8','sql','atlas_chain_base()',false,null,false,'{0,1,2,3,4,5,6}','i1w8','test:i1-src',3600),
 (9009,'i1t9','sql','atlas_chain_base()',false,null,false,'{0,1,2,3,4,5,6}','i1w9','test:i1-src',3600),
 (9010,'i1t10','sql','atlas_chain_base()',false,null,false,'{0,1,2,3,4,5,6}','i1w10','test:i1-src',3600);

-- Dispatch rows. i1t1 deliberately gets none.
insert into sync_log (function_name, status, source, started_at, finished_at) values
 ('i1t2','running','test:i1-disp', clock_timestamp(),              null),
 ('i1t3','skipped','test:i1-disp', clock_timestamp(),              clock_timestamp()),
 ('i1t4','error',  'test:i1-disp', clock_timestamp(),              clock_timestamp()),
 ('i1t5','success','test:i1-disp', clock_timestamp(),              clock_timestamp()),
 ('i1t6','success','test:i1-disp', clock_timestamp() - interval '120 seconds', clock_timestamp() - interval '119 seconds'),
 ('i1t7','success','test:i1-disp', clock_timestamp(),              clock_timestamp()),
 ('i1t8','success','test:i1-disp', clock_timestamp(),              clock_timestamp()),
 ('i1t9','success','test:i1-disp', clock_timestamp(),              clock_timestamp()),
 ('i1t10','success','test:i1-disp',clock_timestamp(),              clock_timestamp());

-- Probe rows for 8/9/10 only. 6 and 7 get none on purpose.
insert into sync_log (function_name, status, source, started_at, finished_at) values
 ('i1w8','success','test:i1-src', clock_timestamp(), clock_timestamp()),
 ('i1w9','error',  'test:i1-src', clock_timestamp(), clock_timestamp()),
 ('i1w10','partial','test:i1-src',clock_timestamp(), clock_timestamp());

select
  c.stage,
  public.atlas_chain_stage_status(c.stage,'test:i1-disp','1900-01-01'::timestamptz) as got,
  c.want,
  case when public.atlas_chain_stage_status(c.stage,'test:i1-disp','1900-01-01'::timestamptz) = c.want
       then 'PASS' else 'FAIL' end as result,
  c.why
from (values
  ('i1t1','not_started','no dispatch row at all'),
  ('i1t2','running',    'dispatch still open'),
  ('i1t3','skipped',    'dispatch declined before doing work; terminal'),
  ('i1t4','error',      'dispatch itself failed'),
  ('i1t5','success',    'no probe configured -> dispatch row IS the completion signal'),
  ('i1t6','unobserved', 'CRITICAL: dispatch said success, probe never appeared, past max_wait'),
  ('i1t7','running',    'CRITICAL: dispatch said success but handler still working'),
  ('i1t8','success',    'probe succeeded'),
  ('i1t9','error',      'probe failed even though the dispatch was acknowledged'),
  ('i1t10','success',   'partial is the healthy outcome on this platform')
) as c(stage, want, why)
order by c.stage;

rollback;

-- ---------------------------------------------------------------------------
-- atlas_chain_day(): the chain night spans midnight.
--
-- The tick window is 20:00-01:59 UTC. Scoping the chain to current_date meant
-- that at 00:00 it stopped being able to see the night it was running: every
-- stage still in flight read its dependency as 'not_started' and waited
-- forever, and the 00:00-01:59 half of the window could never do anything.
--
-- Found by the shadow tick at 00:20, not by the traversal test -- that ran
-- entirely before midnight, which is precisely why it could not see this.
--
-- The last case is the one that matters: as a bare time-of-day comparison a
-- 22:00 head reads 00:20 < 22:00 and can NEVER fire after midnight, so a night
-- that slipped could not resume. Anchored on the chain day it can.

select 'chain_day' as suite, c.at, public.atlas_chain_day(c.at) as got, c.want,
       case when public.atlas_chain_day(c.at) = c.want then 'PASS' else 'FAIL' end as result
from (values
  ('2026-09-21 20:44:00+00'::timestamptz, '2026-09-21'::date),  -- before window
  ('2026-09-21 23:50:00+00'::timestamptz, '2026-09-21'::date),  -- late evening
  ('2026-09-22 00:00:00+00'::timestamptz, '2026-09-21'::date),  -- exactly midnight
  ('2026-09-22 00:20:00+00'::timestamptz, '2026-09-21'::date),  -- where it was found
  ('2026-09-22 01:59:00+00'::timestamptz, '2026-09-21'::date),  -- window end
  ('2026-09-22 02:00:00+00'::timestamptz, '2026-09-22'::date),  -- rollover
  ('2026-09-22 09:00:00+00'::timestamptz, '2026-09-22'::date)   -- next morning
) as c(at, want);

select 'not_before_form' as suite,
       ('00:20'::time >= '22:00'::time) as old_time_of_day_test,
       ('2026-09-22 00:20:00+00'::timestamptz
          >= public.atlas_chain_day('2026-09-22 00:20:00+00'::timestamptz)::timestamptz
             + '22:00'::time) as new_timestamp_test,
       case when ('00:20'::time >= '22:00'::time) = false
             and ('2026-09-22 00:20:00+00'::timestamptz
                   >= public.atlas_chain_day('2026-09-22 00:20:00+00'::timestamptz)::timestamptz
                      + '22:00'::time) = true
            then 'PASS' else 'FAIL' end as result;
