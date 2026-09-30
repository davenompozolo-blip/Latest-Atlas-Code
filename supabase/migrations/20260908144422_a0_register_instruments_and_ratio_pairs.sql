-- Phase A0 registry. inception_date on every row is the provider's own
-- firstTradeDate, cross-checked against the first bar actually returned in the
-- series; the two agree for all 16. data_source records the provider the rows
-- were actually loaded from -- see the migration that loads market_prices.

insert into public.market_instruments
  (symbol, name, asset_class, proxies_for, inception_date, data_source, caveats)
values
('SPY', 'SPDR S&P 500 ETF Trust', 'equity_etf', 'broad US large cap', date '1993-01-29', 'yahoo',
 $t$Cap-weighted and top-heavy: the largest handful of constituents dominate the return. Structured as a unit investment trust, so dividends are held in cash until quarterly distribution -- a small drag versus an open-ended fund. SPY is the denominator of seven of the twelve registered pairs, so any distortion in this leg propagates widely.$t$),

('DIA', 'SPDR Dow Jones Industrial Average ETF Trust', 'equity_etf', 'US blue-chip large cap (price-weighted 30)', date '1998-01-20', 'yahoo',
 $t$Price-weighted, 30 constituents, no utilities or transports. Not a cap-weighted value index. Because weighting is by share price, a high-priced constituent moves the series more than a larger company with a lower share price.$t$),

('RSP', 'Invesco S&P 500 Equal Weight ETF', 'equity_etf', 'the average S&P 500 constituent (equal weighted)', date '2003-05-01', 'yahoo',
 $t$Inception 2003-05-01, so any pair using RSP cannot reach the 1990s. Quarterly rebalance introduces its own turnover effect that the underlying index does not have. Equal weighting tilts toward the smaller half of the index, so the leg carries a size exposure as well as a breadth one.$t$),

('IWM', 'iShares Russell 2000 ETF', 'equity_etf', 'US small cap', date '2000-05-26', 'yahoo',
 $t$Annual June reconstitution is a large, well-documented turnover event visible in the series independently of small-cap fundamentals. Russell 2000 membership differs materially from the S&P 600 -- notably a persistent share of unprofitable constituents -- so "small cap" here is index-specific and carries a credit and rate sensitivity.$t$),

('QQQ', 'Invesco QQQ Trust', 'equity_etf', 'Nasdaq-100 mega-cap growth', date '1999-03-10', 'yahoo',
 $t$Nasdaq-100 membership is determined by exchange listing, not by size, sector or style: comparable NYSE-listed large caps are excluded by construction. Heavily concentrated in mega-cap technology, with special rebalances when concentration limits bind (2011, 2023, 2024). Not a clean growth basket.$t$),

('XLY', 'Consumer Discretionary Select Sector SPDR Fund', 'equity_etf', 'US consumer discretionary', date '1998-12-22', 'yahoo',
 $t$S&P 500 slice: large cap only, no mid or small cap. GICS redefinitions are structural breaks in the series -- the 2018 creation of Communication Services moved major constituents out of Consumer Discretionary. Concentrated in a small number of mega-caps whose moves can dominate the leg.$t$),

('XLP', 'Consumer Staples Select Sector SPDR Fund', 'equity_etf', 'US consumer staples', date '1998-12-22', 'yahoo',
 $t$S&P 500 slice: large cap only. Roughly 30-40 constituents with heavy single-name concentration at the top, so the leg is not a diversified read on staples demand.$t$),

('XLI', 'Industrial Select Sector SPDR Fund', 'equity_etf', 'US industrials', date '1998-12-22', 'yahoo',
 $t$S&P 500 slice: large cap only. Bundles aerospace and defence, capital goods and transports into one series, so divergent sub-industry cycles net off inside the leg. Dividend yield around 1.5%, roughly half XLU -- the gap is why adj_close is mandatory for XLI/XLU.$t$),

('XLU', 'Utilities Select Sector SPDR Fund', 'equity_etf', 'US utilities', date '1998-12-22', 'yahoo',
 $t$S&P 500 slice: large cap only, around 30 constituents. Dividend yield around 3%, high relative to the market, so the adjusted-close requirement matters most here and in XLE. Strongly rate-sensitive, so a leg using XLU as the defensive side partly tracks the long end rather than risk appetite.$t$),

('XLF', 'Financial Select Sector SPDR Fund', 'equity_etf', 'US financials', date '1998-12-22', 'yahoo',
 $t$S&P 500 slice: large cap only. Real estate was separated from the GICS Financials sector in 2016 and left the fund -- a composition break in the middle of the series, not a market event. Dominated by a handful of money-centre banks.$t$),

('XLE', 'Energy Select Sector SPDR Fund', 'equity_etf', 'US energy', date '1998-12-22', 'yahoo',
 $t$S&P 500 slice: large cap only. Extremely concentrated -- the two largest constituents are a substantial share of the fund, so the leg is close to a two-stock series. High dividend yield relative to the market, so the adjusted-close requirement matters most here and in XLU.$t$),

('GLD', 'SPDR Gold Shares', 'commodity_etf', 'spot gold', date '2004-11-18', 'yahoo',
 $t$Physically backed gold trust. The expense ratio is met by selling metal, so one share represents a slowly declining quantity of gold and the series drifts below spot over long horizons. Not a claim on gold miners: GDX carries equity beta and operating leverage and is not a substitute here.$t$),

('CPER', 'United States Copper Index Fund', 'commodity_etf', 'copper', date '2011-11-15', 'yahoo',
 $t$Copper ETF, inception 2011-11-15. The copper/gold ratio as conventionally cited runs on HG/GC futures back to the 1970s; CPER truncates it to roughly 2011 and adds roll and expense drag, so levels are not comparable to published futures-based history. Registered now with futures flagged as a later upgrade. Do NOT substitute GDX for the gold leg -- GDX is gold miners, carrying equity beta and operating leverage, and is not a gold proxy. Earlier drafts of this framework made that error.$t$),

('HYG', 'iShares iBoxx High Yield Corporate Bond ETF', 'fixed_income_etf', 'US high yield credit', date '2007-04-11', 'yahoo',
 $t$Inception 2007-04-11. This is the binding constraint on how far back any full-set analysis can reach. Bond ETF: NAV is struck on evaluated (matrix) prices rather than exchange trades, and the premium or discount to NAV widens under stress, so the price series carries a liquidity component that is not credit spread.$t$),

('TLT', 'iShares 20+ Year Treasury Bond ETF', 'fixed_income_etf', 'US long-duration Treasuries', date '2002-07-30', 'yahoo',
 $t$Duration is not constant -- it moves with the yield level and with index rebalancing -- so the series cannot be read as a fixed-duration rate instrument. Convexity means equal yield moves do not produce equal price moves across the series history.$t$),

('EEM', 'iShares MSCI Emerging Markets ETF', 'equity_etf', 'emerging market equity', date '2003-04-14', 'yahoo',
 $t$Dominated by the dollar and the China domestic cycle. Weak as a standalone tariff or trade-policy proxy. Large Taiwan and Korea semiconductor weight makes it partly a technology-cycle series rather than a clean emerging-growth read.$t$)

on conflict (symbol) do update set
  name = excluded.name, asset_class = excluded.asset_class,
  proxies_for = excluded.proxies_for, inception_date = excluded.inception_date,
  data_source = excluded.data_source, caveats = excluded.caveats;


-- Pairs. dimension values are the CLAIMED groupings from the source documents,
-- provisional and organisational only; A1 tests whether they survive.
-- thesis states what a RISING ratio is claimed to indicate -- a claim under
-- test, not a finding.

insert into public.ratio_pairs
  (pair_key, numerator_symbol, denominator_symbol, dimension, thesis, caveats)
values
('dia_spy', 'DIA', 'SPY', 'breadth',
 $t$Rising = old-economy blue chips leading the broad market; cited as participation broadening beyond mega-cap growth.$t$,
 $t$DIA is price-weighted over 30 names, so the ratio moves on the share-price level of a few high-priced constituents rather than on breadth. A poor breadth measure despite the label; rsp_spy tests the same claim directly and should be preferred.$t$),

('rsp_spy', 'RSP', 'SPY', 'breadth',
 $t$Rising = the average S&P 500 constituent outperforming the cap-weighted index, i.e. participation broadening.$t$,
 $t$The cleanest breadth pair of the four, but still confounded by size: equal weighting tilts toward the smaller half of the index, so the ratio partly tracks a size factor. RSP quarterly rebalancing adds turnover the index does not have. Cannot start before 2003-05-01.$t$),

('iwm_spy', 'IWM', 'SPY', 'breadth',
 $t$Rising = small caps leading large caps; cited as risk appetite and broadening participation.$t$,
 $t$This is a size spread, not a breadth measure: it can rise while breadth inside the S&P 500 narrows, and the two readings are routinely conflated. The Russell 2000 share of unprofitable constituents makes the ratio track credit conditions and rates as well as risk appetite.$t$),

('qqq_spy', 'QQQ', 'SPY', 'breadth',
 $t$Rising = the Nasdaq-100 leading the broad market.$t$,
 $t$Grouped under breadth in the source documents, but a rising QQQ/SPY is mega-cap concentration increasing -- arguably the opposite of breadth. This is the weakest of the four breadth groupings and the most likely to fail the A1 study. Nasdaq-100 membership is set by exchange listing, so the numerator is not a clean growth or technology basket.$t$),

('xly_xlp', 'XLY', 'XLP', 'cyclicality',
 $t$Rising = consumers favouring discretionary over staples spending; cited as expansionary.$t$,
 $t$Both legs are S&P 500 large-cap slices, so this measures large-cap sector rotation, not consumer behaviour. The 2018 GICS reshuffle moved major constituents out of Consumer Discretionary, a composition break inside the series. XLY concentration means a few mega-caps can carry the ratio.$t$),

('xli_xlu', 'XLI', 'XLU', 'cyclicality',
 $t$Rising = industrial and cyclical expansion preferred over defensive utilities.$t$,
 $t$The dividend-yield gap between the legs (XLU around 3%, XLI around 1.5%) makes a price-only version of this ratio drift downward roughly 1.5%/yr for reasons that have nothing to do with industrial expansion. This pair is the reason adj_close is mandatory. XLU rate sensitivity means the ratio partly tracks the long end rather than the cycle.$t$),

('xlf_spy', 'XLF', 'SPY', 'cyclicality',
 $t$Rising = financials leading the market; cited as credit availability and a steepening curve.$t$,
 $t$Real estate left GICS Financials in 2016 and left the fund, a composition break mid-series. The ratio responds to the yield curve and to regulation at least as much as to the cycle, and is dominated by a handful of money-centre banks.$t$),

('xle_xlu', 'XLE', 'XLU', 'safe_haven',
 $t$Rising = energy leading defensive utilities.$t$,
 $t$Both legs are high-yield relative to the market, so the adjusted-close requirement matters most here. XLE is extremely concentrated in two names and is largely an oil-price series, so the safe_haven grouping is doubtful -- this behaves more like a commodity or inflation pair than a risk-appetite one.$t$),

('gld_spy', 'GLD', 'SPY', 'safe_haven',
 $t$Rising = gold preferred to equities; cited as risk aversion.$t$,
 $t$Gold responds to real rates and the dollar as much as to risk aversion, and has had long stretches of rising alongside equities, so the risk-aversion reading is not reliable. GLD expense drag makes the numerator decay slowly against spot gold.$t$),

('hyg_tlt', 'HYG', 'TLT', 'growth_inflation',
 $t$Rising = high-yield credit preferred to long Treasuries; cited as growth expectations and risk appetite.$t$,
 $t$The legs have very different durations, so this is a mixed credit-and-duration spread rather than a clean credit signal. HYG NAV is struck on evaluated prices and its premium or discount widens under stress, which enters the ratio as liquidity rather than spread. Cannot start before 2007-04-11, the binding constraint on full-set analysis.$t$),

('eem_spy', 'EEM', 'SPY', 'growth_inflation',
 $t$Rising = emerging markets leading US equities; cited as global growth and a weak dollar.$t$,
 $t$Dominated by the dollar and the China domestic cycle; weak as a standalone tariff or trade-policy proxy. Large Taiwan and Korea semiconductor weight makes it partly a technology-cycle series, so its placement under growth_inflation is provisional.$t$),

('cper_gld', 'CPER', 'GLD', 'growth_inflation',
 $t$Rising = copper leading gold; the copper/gold ratio, cited as real growth versus safety and often read against the 10-year yield.$t$,
 $t$The conventionally cited copper/gold ratio runs on HG/GC futures back to the 1970s. This ETF version cannot start before 2011-11-15 and both legs carry expense and roll drag, so its level is not comparable to published futures-based history and only its direction is usable. Futures are a later upgrade.$t$)

on conflict (pair_key) do update set
  numerator_symbol = excluded.numerator_symbol,
  denominator_symbol = excluded.denominator_symbol,
  dimension = excluded.dimension, thesis = excluded.thesis,
  caveats = excluded.caveats;
