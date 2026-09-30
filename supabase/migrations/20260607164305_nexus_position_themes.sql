create table if not exists public.position_themes (
  symbol text primary key,
  theme text not null,
  updated_at timestamptz default now()
);
alter table public.position_themes enable row level security;
drop policy if exists position_themes_read on public.position_themes;
create policy position_themes_read on public.position_themes for select using (true);
grant select on public.position_themes to anon, authenticated;

insert into public.position_themes (symbol, theme) values
('NVDA','AI / accelerated compute'),('AMD','AI / accelerated compute'),('AVGO','AI / accelerated compute'),('ASML','AI / accelerated compute'),('TSM','AI / accelerated compute'),('MU','AI / accelerated compute'),('SNDK','AI / accelerated compute'),('TSLA','AI / accelerated compute'),
('MSFT','Mega-cap platforms'),('GOOGL','Mega-cap platforms'),('AMZN','Mega-cap platforms'),('META','Mega-cap platforms'),('AAPL','Mega-cap platforms'),
('BABA','China internet (ADRs)'),('TCEHY','China internet (ADRs)'),('NPSNY','China internet (ADRs)'),('PROSY','China internet (ADRs)'),('BIDU','China internet (ADRs)'),
('HAL','Energy'),('PBR','Energy'),('CVX','Energy'),('KMI','Energy'),('BKR','Energy'),
('GEV','Energy transition'),
('RGLD','Precious metals / miners'),('GDX','Precious metals / miners'),('SBSW','Precious metals / miners'),('HMY','Precious metals / miners'),
('DD','Materials'),
('JPM','Financials'),('C','Financials'),('BAC','Financials'),('FIDU','Financials'),
('ABBV','Healthcare / defensives'),('JNJ','Healthcare / defensives'),('BIIB','Healthcare / defensives'),('BMY','Healthcare / defensives'),('PFE','Healthcare / defensives'),('GILD','Healthcare / defensives'),
('NKE','Consumer / autos'),('TGT','Consumer / autos'),('TM','Consumer / autos'),('SONY','Consumer / autos'),('VWAGY','Consumer / autos'),
('EWY','International / EM ETFs'),('EWA','International / EM ETFs'),('UAE','International / EM ETFs'),('EZA','International / EM ETFs'),('ACWI','International / EM ETFs'),('DFEV','International / EM ETFs'),('AVEM','International / EM ETFs'),('AVEE','International / EM ETFs'),
('BOND','Fixed income / duration'),('BSV','Fixed income / duration'),('SHY','Fixed income / duration'),('IBIE','Fixed income / duration'),('PTRB','Fixed income / duration'),
('KMTUY','Industrials / electrification'),('NVT','Industrials / electrification'),
('XLRE','Real estate'),('AHR','Real estate')
on conflict (symbol) do update set theme=excluded.theme, updated_at=now();
