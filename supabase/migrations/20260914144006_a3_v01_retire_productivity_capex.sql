-- A3 v0.1-structural, part 3 of 4. Retire productivity_capex.
--
-- Ruling section 3, resolving a conflict CC flagged and correctly did not act on:
-- master spec section 9.1 carries TWO pre-authorised branches that both apply here,
-- the 0-1 detection branch ("stop, do not tune") and a theme-specific branch
-- ("productivity_capex fails -> retire it"). The owner has resolved it: the
-- retire branch governs.
--
-- WHY IT IS A RETIREMENT AND NOT A RECALIBRATION. `emg_concentration_narrow`
-- requires the concentration axis at >= 1 sigma held 60 sessions. The longest
-- such run IN THE ENTIRE HISTORY OF THE SERIES is 30. The row cannot be
-- satisfied by any data, which makes the theme's detection vacuous rather than
-- strict -- it was never capable of firing, so its 0 detections carry no
-- information about the thresholds.
--
-- Lowering 60 to fit the observed maximum would be tuning to the sample and is
-- refused. A3.1 section 3 had already flagged this theme as the weakest of the
-- four in writing, before any of this ran: it has no independent macro series
-- and was detected mostly off the market-structure axis it was meant to be
-- CONFIRMED by.
--
-- The trigger rows stay at both logic versions and the state history stays.
-- Retiring a theme is not deleting it; `active` is what the engine reads.

update public.regime_themes
   set active        = false,
       retired_reason = 'Retired at v0 per the 2026-09-13 ruling section 3, master spec section 9.1 '
                     || 'theme-specific branch. emg_concentration_narrow requires concentration '
                     || '>= 1 sigma held 60 sessions; the longest such run in the whole series is 30, '
                     || 'so the emergence row is unsatisfiable against observed series '
                     || 'behaviour and the theme''s 0 detections carry no information about '
                     || 'its thresholds. Lowering the hold to fit the observed maximum '
                     || 'would be tuning to the sample and was refused. A3.1 section 3 had '
                     || 'already recorded this theme as the weakest of the four: no '
                     || 'independent macro series, detected mostly off the axis meant to '
                     || 'confirm it.',
       retired_at    = now()
 where theme_key = 'productivity_capex';

do $$
declare v_active int;
begin
  select count(*) into v_active from public.regime_themes where active;
  if v_active <> 3 then
    raise exception 'expected 3 active themes after retirement, found %', v_active;
  end if;
  if not exists (select 1 from public.regime_themes
                  where theme_key='productivity_capex' and not active
                    and retired_reason is not null) then
    raise exception 'productivity_capex is not retired with a reason';
  end if;
end $$;
