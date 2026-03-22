-- =============================================================================
-- TradeJournal — Seed Data
-- Run in Supabase SQL Editor → https://supabase.com/dashboard/project/kxwgzwasioqgkhfyudub/sql
-- =============================================================================

DO $$
DECLARE
  uid UUID := 'c9d6b052-ed01-4f63-a2e2-c49826d86bd2';

  strat_breakout INTEGER;
  strat_reversal INTEGER;
  strat_trend    INTEGER;
  strat_gap      INTEGER;

  acct_main INTEGER;

  tag_aplus      INTEGER;
  tag_fomo       INTEGER;
  tag_revenge    INTEGER;
  tag_conviction INTEGER;
  tag_news       INTEGER;
  tag_oversize   INTEGER;

  t1  INTEGER; t2  INTEGER; t3  INTEGER; t4  INTEGER; t5  INTEGER;
  t6  INTEGER; t7  INTEGER; t8  INTEGER; t9  INTEGER; t10 INTEGER;
  t11 INTEGER; t12 INTEGER; t13 INTEGER; t14 INTEGER; t15 INTEGER;
  t16 INTEGER; t17 INTEGER; t18 INTEGER; t19 INTEGER; t20 INTEGER;
  t21 INTEGER; t22 INTEGER; t23 INTEGER; t24 INTEGER; t25 INTEGER;
  t26 INTEGER; t27 INTEGER; t28 INTEGER;

  j1 INTEGER; j2 INTEGER; j3 INTEGER; j4 INTEGER;
  j5 INTEGER; j6 INTEGER; j7 INTEGER; j8 INTEGER;

BEGIN

  -- ============================================================
  -- STRATEGIES
  -- ============================================================
  INSERT INTO strategies (name, description, entry_rules, exit_rules, timeframe, user_id)
  VALUES (
    'Breakout',
    'Trade breakouts above key resistance with volume confirmation',
    'Price closes above resistance, volume >1.5x average, momentum positive on 1H',
    'Exit at 2R target or if price closes back below breakout level on 15m',
    '15m, 1H', uid
  ) RETURNING id INTO strat_breakout;

  INSERT INTO strategies (name, description, entry_rules, exit_rules, timeframe, user_id)
  VALUES (
    'Reversal',
    'Fade extended moves at key support/resistance levels',
    'Price extended 2+ ATR from VWAP, reversal candle printed at key level, volume drying up',
    'Scale out 50% at VWAP, remainder at opposite key level or EOD',
    '5m, 15m', uid
  ) RETURNING id INTO strat_reversal;

  INSERT INTO strategies (name, description, entry_rules, exit_rules, timeframe, user_id)
  VALUES (
    'Trend Follow',
    'Enter pullbacks in the direction of the established daily trend',
    'Daily trend confirmed, pullback to 20 EMA on 1H, RSI > 50 on daily, no earnings within 3 days',
    'Trail stop below each swing low, exit on trend reversal candle on 4H',
    '1H, 4H', uid
  ) RETURNING id INTO strat_trend;

  INSERT INTO strategies (name, description, entry_rules, exit_rules, timeframe, user_id)
  VALUES (
    'Gap & Go',
    'Trade stocks gapping up or down on news with opening momentum',
    'Gap >2% on catalyst news, pre-market volume >500k, first 5m candle holds gap, no fade',
    'Exit at prior day high/low or if gap fills completely',
    '1m, 5m', uid
  ) RETURNING id INTO strat_gap;

  -- ============================================================
  -- ACCOUNT
  -- ============================================================
  INSERT INTO accounts (name, broker_name, currency, starting_balance, commission_type, commission_value, pnl_method, is_default, user_id)
  VALUES ('Main Account', 'TD Ameritrade', 'USD', 25000, 'fixed', 0, 'basic', 1, uid)
  RETURNING id INTO acct_main;

  INSERT INTO account_transactions (account_id, type, amount, date, notes, user_id)
  VALUES (acct_main, 'deposit', 25000, '2025-12-01', 'Initial funding', uid);

  -- ============================================================
  -- TAGS
  -- ============================================================
  INSERT INTO tags (name, color, user_id) VALUES ('A+ Setup',       '#22c55e', uid) RETURNING id INTO tag_aplus;
  INSERT INTO tags (name, color, user_id) VALUES ('FOMO',           '#f87171', uid) RETURNING id INTO tag_fomo;
  INSERT INTO tags (name, color, user_id) VALUES ('Revenge Trade',  '#fb923c', uid) RETURNING id INTO tag_revenge;
  INSERT INTO tags (name, color, user_id) VALUES ('High Conviction','#60a5fa', uid) RETURNING id INTO tag_conviction;
  INSERT INTO tags (name, color, user_id) VALUES ('News Catalyst',  '#a78bfa', uid) RETURNING id INTO tag_news;
  INSERT INTO tags (name, color, user_id) VALUES ('Oversize',       '#f59e0b', uid) RETURNING id INTO tag_oversize;

  -- ============================================================
  -- TRADES  (28 trades, Dec 2025 – Mar 2026, ~70% win rate)
  -- ============================================================

  -- 1. AAPL Long WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2025-12-02','AAPL','long',230.00,238.20,225.00,100,16.00,
    strat_breakout,'1H','Clean breakout above 230 resistance with strong volume. Held through minor pullback to 232. Took profit at 2R target.',
    'closed',804.00,3.49,1.61,'2025-12-03',8,'calm',acct_main,uid)
  RETURNING id INTO t1;

  -- 2. TSLA Long WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2025-12-05','TSLA','long',350.00,365.50,340.00,50,17.00,
    strat_trend,'4H','Trend continuation entry on pullback to 20 EMA. Strong sector momentum. Held overnight, sold into open strength.',
    'closed',758.00,4.33,1.52,'2025-12-06',9,'confident',acct_main,uid)
  RETURNING id INTO t2;

  -- 3. SPY Short WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2025-12-10','SPY','short',600.00,592.40,606.00,30,12.00,
    strat_reversal,'15m','Extended from VWAP with clear rejection candle at HOD. Quick intraday reversal. In and out same day.',
    'closed',216.00,1.20,1.27,'2025-12-10',7,'calm',acct_main,uid)
  RETURNING id INTO t3;

  -- 4. NVDA Long LOSS
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2025-12-12','NVDA','long',145.00,138.20,141.00,80,16.00,
    strat_breakout,'1H','False breakout — price reversed hard after initial move. Volume was below average, should have been a red flag. Lesson: wait for volume confirmation.',
    'closed',-560.00,-4.83,-1.73,'2025-12-12',6,'frustrated',acct_main,uid)
  RETURNING id INTO t4;

  -- 5. META Long WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2025-12-15','META','long',595.00,612.50,587.00,20,14.00,
    strat_trend,'4H','AI product announcement catalyst with strong daily trend. Perfect entry on 1H pullback to EMA. Let it run.',
    'closed',336.00,2.82,2.10,'2025-12-16',9,'confident',acct_main,uid)
  RETURNING id INTO t5;

  -- 6. QQQ Long WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2025-12-18','QQQ','long',520.00,528.40,515.00,25,13.00,
    strat_trend,'1H','Index long into year-end seasonality. Clean trend structure, good RR.',
    'closed',197.00,1.52,1.58,'2025-12-19',7,'calm',acct_main,uid)
  RETURNING id INTO t6;

  -- 7. AMD Short LOSS
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2025-12-20','AMD','short',130.00,140.20,135.00,50,16.00,
    strat_reversal,'15m','Revenge trade after NVDA loss. Chased the short too early, sector strength was too strong. Should not have entered.',
    'closed',-526.00,-8.09,-2.05,'2025-12-20',5,'anxious',acct_main,uid)
  RETURNING id INTO t7;

  -- 8. MSFT Long WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2025-12-23','MSFT','long',445.00,455.20,439.00,15,14.00,
    strat_trend,'4H','Low-risk trade into holiday week. Small size due to thin volume. Nice steady grind higher.',
    'closed',139.00,2.09,1.57,'2025-12-24',7,'calm',acct_main,uid)
  RETURNING id INTO t8;

  -- 9. AAPL Short WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-01-05','AAPL','short',242.00,234.80,247.00,80,16.00,
    strat_reversal,'1H','New year sell-off momentum. Faded the opening gap up. Clean breakdown through key support at 238.',
    'closed',560.00,2.90,1.45,'2026-01-06',8,'confident',acct_main,uid)
  RETURNING id INTO t9;

  -- 10. TSLA Long LOSS
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-01-08','TSLA','long',385.00,381.20,377.00,30,12.00,
    strat_breakout,'1H','Breakout attempt failed, volume did not confirm the move above resistance. Cut quickly at -1R.',
    'closed',-126.00,-1.09,-0.99,'2026-01-08',6,'neutral',acct_main,uid)
  RETURNING id INTO t10;

  -- 11. NVDA Long WIN (big)
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-01-12','NVDA','long',152.00,167.80,146.00,60,16.00,
    strat_trend,'4H','CES conference catalyst with strong GPU demand narrative. Held 2 days. Sold into strength at 2.6R. Best trade of January.',
    'closed',932.00,10.22,2.62,'2026-01-14',9,'confident',acct_main,uid)
  RETURNING id INTO t11;

  -- 12. SPY Long WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-01-15','SPY','long',592.00,601.20,586.00,20,13.00,
    strat_trend,'1H','Index long after bullish CPI data release. Clean breakout structure, solid execution.',
    'closed',171.00,1.45,1.42,'2026-01-16',7,'calm',acct_main,uid)
  RETURNING id INTO t12;

  -- 13. AMZN Long LOSS
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-01-18','AMZN','long',225.00,218.40,220.00,40,16.00,
    strat_breakout,'1H','Entered too early before setup fully developed. Lesson: wait for the candle to close, not anticipate the close.',
    'closed',-280.00,-3.11,-1.49,'2026-01-18',5,'impatient',acct_main,uid)
  RETURNING id INTO t13;

  -- 14. META Short WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-01-22','META','short',620.00,607.80,628.00,15,14.00,
    strat_reversal,'15m','Overbought on daily, rejection at key resistance. Clean reversal setup, quick execution.',
    'closed',169.00,1.82,1.53,'2026-01-22',8,'calm',acct_main,uid)
  RETURNING id INTO t14;

  -- 15. GOOGL Long WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-01-26','GOOGL','long',195.00,205.20,189.00,50,16.00,
    strat_trend,'4H','Post-earnings continuation. Strong ad revenue beat. Multi-day hold, trailed stop perfectly below each swing low.',
    'closed',494.00,5.07,1.65,'2026-01-28',9,'confident',acct_main,uid)
  RETURNING id INTO t15;

  -- 16. QQQ Short WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-01-29','QQQ','short',532.00,518.60,540.00,20,13.00,
    strat_reversal,'1H','Macro headwinds, index stalling at ATH rejection. Quick intraday reversal, clean entry and exit.',
    'closed',255.00,2.40,1.69,'2026-01-29',8,'calm',acct_main,uid)
  RETURNING id INTO t16;

  -- 17. TSLA Short WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-02-03','TSLA','short',410.00,395.40,420.00,25,13.00,
    strat_reversal,'1H','TSLA failing at key resistance with weak delivery data. Held overnight short position, covered into morning weakness.',
    'closed',350.00,3.41,1.45,'2026-02-04',8,'confident',acct_main,uid)
  RETURNING id INTO t17;

  -- 18. NVDA Long LOSS
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-02-06','NVDA','long',162.00,155.20,157.00,50,16.00,
    strat_breakout,'1H','Stop hit on market-wide selloff from inflation data. Setup itself was fine, just wrong macro timing.',
    'closed',-356.00,-4.40,-1.44,'2026-02-06',7,'frustrated',acct_main,uid)
  RETURNING id INTO t18;

  -- 19. AAPL Long WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-02-10','AAPL','long',248.00,258.40,243.00,60,16.00,
    strat_trend,'4H','Strong bounce off key support after prior week selloff. Held 2 days. Followed the trend playbook perfectly.',
    'closed',608.00,4.10,2.02,'2026-02-12',8,'confident',acct_main,uid)
  RETURNING id INTO t19;

  -- 20. AMD Long LOSS (FOMO)
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-02-13','AMD','long',128.00,124.80,123.00,80,16.00,
    strat_breakout,'15m','FOMO entry — saw the move happening and jumped in without confirmation. Chased price, got caught in the reversal. Classic mistake.',
    'closed',-272.00,-2.66,-0.93,'2026-02-13',4,'anxious',acct_main,uid)
  RETURNING id INTO t20;

  -- 21. SPY Long WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-02-18','SPY','long',605.00,618.20,598.00,15,13.00,
    strat_trend,'1H','Index reclaim of key level after consolidation. Small size due to uncertainty, good RR result.',
    'closed',185.00,2.04,1.87,'2026-02-19',7,'calm',acct_main,uid)
  RETURNING id INTO t21;

  -- 22. META Long LOSS
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-02-21','META','long',635.00,621.80,629.00,20,14.00,
    strat_trend,'4H','Trend trade that failed. Stop was too tight relative to daily ATR — gave the trade no room to breathe.',
    'closed',-278.00,-2.19,-2.19,'2026-02-21',6,'frustrated',acct_main,uid)
  RETURNING id INTO t22;

  -- 23. MSFT Long WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-02-25','MSFT','long',452.00,465.40,445.00,20,14.00,
    strat_trend,'4H','Azure cloud revenue beat catalyst. Trend continuation to resistance. Let it breathe overnight, sold into gap up.',
    'closed',254.00,2.81,1.92,'2026-02-26',8,'calm',acct_main,uid)
  RETURNING id INTO t23;

  -- 24. NVDA Long WIN (GTC)
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-03-03','NVDA','long',165.00,178.20,159.00,45,16.00,
    strat_trend,'4H','GTC conference week — perfect catalyst. Strong GPU demand narrative, daily structure flawless. Added size at the breakout. Best trade of the year so far.',
    'closed',577.00,7.78,2.18,'2026-03-05',9,'confident',acct_main,uid)
  RETURNING id INTO t24;

  -- 25. QQQ Long WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-03-06','QQQ','long',538.00,548.60,532.00,20,13.00,
    strat_trend,'1H','Index long on breakout above prior swing high. Good structure, clean entry and exit.',
    'closed',199.00,1.85,1.77,'2026-03-07',7,'calm',acct_main,uid)
  RETURNING id INTO t25;

  -- 26. TSLA Long LOSS
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-03-10','TSLA','long',395.00,390.20,385.00,30,12.00,
    strat_breakout,'1H','Breakout failed on macro reversal. Cut quickly without hesitation — good discipline on this one despite the loss.',
    'closed',-156.00,-1.32,-0.94,'2026-03-10',6,'neutral',acct_main,uid)
  RETURNING id INTO t26;

  -- 27. AAPL Short WIN
  INSERT INTO trades (date, ticker, direction, entry_price, exit_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, pnl, pnl_percent, r_multiple, exit_date,
    confidence, emotions, account_id, user_id)
  VALUES ('2026-03-13','AAPL','short',255.00,247.80,261.00,50,16.00,
    strat_reversal,'1H','Sell-the-news reaction after product event. Clean short setup at prior support turned resistance.',
    'closed',344.00,2.70,1.20,'2026-03-14',8,'calm',acct_main,uid)
  RETURNING id INTO t27;

  -- 28. NVDA Long OPEN
  INSERT INTO trades (date, ticker, direction, entry_price, stop_loss, position_size, fees,
    strategy_id, timeframe, notes, status, account_id, user_id)
  VALUES ('2026-03-14','NVDA','long',172.00,165.00,40,0,
    strat_trend,'4H','Strong bounce from key support zone. Holding overnight. Target at 185.',
    'open',acct_main,uid)
  RETURNING id INTO t28;

  -- ============================================================
  -- TRADE TAGS
  -- ============================================================
  INSERT INTO trade_tags VALUES (t1,  tag_aplus),      (t1,  tag_conviction);
  INSERT INTO trade_tags VALUES (t2,  tag_aplus),      (t2,  tag_conviction);
  INSERT INTO trade_tags VALUES (t3,  tag_aplus);
  INSERT INTO trade_tags VALUES (t4,  tag_fomo);
  INSERT INTO trade_tags VALUES (t5,  tag_news),       (t5,  tag_aplus);
  INSERT INTO trade_tags VALUES (t6,  tag_conviction);
  INSERT INTO trade_tags VALUES (t7,  tag_revenge),    (t7,  tag_oversize);
  INSERT INTO trade_tags VALUES (t8,  tag_conviction);
  INSERT INTO trade_tags VALUES (t9,  tag_aplus);
  INSERT INTO trade_tags VALUES (t11, tag_aplus),      (t11, tag_news),    (t11, tag_conviction);
  INSERT INTO trade_tags VALUES (t12, tag_conviction);
  INSERT INTO trade_tags VALUES (t13, tag_fomo);
  INSERT INTO trade_tags VALUES (t14, tag_aplus);
  INSERT INTO trade_tags VALUES (t15, tag_aplus),      (t15, tag_news);
  INSERT INTO trade_tags VALUES (t16, tag_aplus);
  INSERT INTO trade_tags VALUES (t17, tag_conviction);
  INSERT INTO trade_tags VALUES (t18, tag_conviction);
  INSERT INTO trade_tags VALUES (t19, tag_aplus);
  INSERT INTO trade_tags VALUES (t20, tag_fomo),       (t20, tag_oversize);
  INSERT INTO trade_tags VALUES (t21, tag_conviction);
  INSERT INTO trade_tags VALUES (t22, tag_revenge);
  INSERT INTO trade_tags VALUES (t23, tag_news);
  INSERT INTO trade_tags VALUES (t24, tag_aplus),      (t24, tag_news),    (t24, tag_conviction);
  INSERT INTO trade_tags VALUES (t25, tag_aplus);
  INSERT INTO trade_tags VALUES (t27, tag_aplus);
  INSERT INTO trade_tags VALUES (t28, tag_conviction);

  -- ============================================================
  -- JOURNAL ENTRIES
  -- ============================================================
  INSERT INTO journal_entries (date, entry_type, title, content, mood, user_id)
  VALUES ('2025-12-06','weekly','Week 1 — Strong Start',
    '<p>Great first week of December. Two solid wins on AAPL and TSLA, both exactly following the plan. The AAPL breakout was textbook — waited for the retest, volume confirmed, executed cleanly.</p><p><strong>Key takeaway:</strong> patience paid off this week. Did not chase any setups.</p>',
    'great',uid) RETURNING id INTO j1;

  INSERT INTO journal_entries (date, entry_type, title, content, mood, user_id)
  VALUES ('2025-12-13','daily','Tough Loss on NVDA',
    '<p>Took a hit on NVDA today. The breakout looked clean but it was a false move. In hindsight, volume was below average at the breakout point — I skipped the confirmation step.</p><p><strong>Lesson:</strong> always check volume. No confirmation = no entry. The setup looked right but the evidence was not there.</p>',
    'bad',uid) RETURNING id INTO j2;

  INSERT INTO journal_entries (date, entry_type, title, content, mood, user_id)
  VALUES ('2025-12-21','daily','Revenge Trade on AMD — Need to Stop This',
    '<p>Got blown out on AMD short today. Worst part is I knew it was a borderline setup but entered anyway because I was trying to make back the NVDA loss from last week. Classic revenge trading.</p><p><strong>Action:</strong> No more trading when emotionally reactive. If I lose 2 in a row I walk away for the day.</p>',
    'terrible',uid) RETURNING id INTO j3;

  INSERT INTO journal_entries (date, entry_type, title, content, mood, user_id)
  VALUES ('2026-01-04','weekly','2026 Goals',
    '<p>Setting clear goals for 2026:</p><ul><li>Minimum 2:1 RR on every trade</li><li>No revenge trades — 2 losses in a row = done for the day</li><li>Journal every trade within 24 hours</li><li>Target: $2,000/month net profit</li></ul><p>December was profitable despite two bad emotional trades. Starting the year fresh.</p>',
    'great',uid) RETURNING id INTO j4;

  INSERT INTO journal_entries (date, entry_type, title, content, mood, user_id)
  VALUES ('2026-01-14','daily','NVDA — Best Trade of January',
    '<p>NVDA delivered a 2.6R trade. CES catalyst was the trigger but the setup had been building for days on the daily chart. Held overnight which was the right call — structure was extremely clean.</p><p>This is what execution feels like when you follow the plan completely. No doubt, no second-guessing.</p>',
    'great',uid) RETURNING id INTO j5;

  INSERT INTO journal_entries (date, entry_type, title, content, mood, user_id)
  VALUES ('2026-02-14','daily','FOMO Trade on AMD — Same Old Mistake',
    '<p>Chased AMD again. Saw the move happening and jumped in without waiting for my entry criteria to be met. Lost money and confidence.</p><p><strong>Action item:</strong> Add a personal rule — AMD specifically requires a 15m candle close above the level before entry. No anticipating.</p>',
    'bad',uid) RETURNING id INTO j6;

  INSERT INTO journal_entries (date, entry_type, title, content, mood, user_id)
  VALUES ('2026-03-01','weekly','February Review — Solid Month',
    '<p>February ended profitably despite two emotional mistakes (AMD FOMO, META tight stop). Net P&L positive, win rate above 60%.</p><p>The AAPL and NVDA trades were excellent. Execution on the winners was clean.</p><p><strong>March focus:</strong> Only A+ setups. Quality over quantity. No more chasing.</p>',
    'good',uid) RETURNING id INTO j7;

  INSERT INTO journal_entries (date, entry_type, title, content, mood, user_id)
  VALUES ('2026-03-05','daily','GTC Week — NVDA Crushes It',
    '<p>GTC conference week delivered exactly what I expected. Perfect catalyst, perfect daily structure, perfect execution. Added size at the breakout level which worked beautifully.</p><p>These are the trades that make months. When the A+ setup arrives, you have to size up and press it.</p>',
    'great',uid) RETURNING id INTO j8;

  -- ============================================================
  -- JOURNAL TRADE LINKS
  -- ============================================================
  INSERT INTO journal_trade_links VALUES (j1, t1);
  INSERT INTO journal_trade_links VALUES (j1, t2);
  INSERT INTO journal_trade_links VALUES (j2, t4);
  INSERT INTO journal_trade_links VALUES (j3, t7);
  INSERT INTO journal_trade_links VALUES (j5, t11);
  INSERT INTO journal_trade_links VALUES (j6, t20);
  INSERT INTO journal_trade_links VALUES (j8, t24);

  -- ============================================================
  -- PLANNED TRADES
  -- ============================================================
  INSERT INTO planned_trades (ticker, strategy_id, direction, planned_entry, stop_loss, target_price, notes, confidence, status, user_id)
  VALUES ('AAPL', strat_breakout, 'long', 262.00, 256.00, 278.00,
    'Watching for breakout above 262 all-time high. Volume must be >1.5x average to confirm.', 8, 'active', uid);

  INSERT INTO planned_trades (ticker, strategy_id, direction, planned_entry, stop_loss, target_price, notes, confidence, status, user_id)
  VALUES ('TSLA', strat_trend, 'long', 408.00, 398.00, 430.00,
    'If TSLA reclaims 408 on volume, trend trade back toward prior high zone at 430.', 7, 'active', uid);

  INSERT INTO planned_trades (ticker, strategy_id, direction, planned_entry, stop_loss, target_price, notes, confidence, status, user_id)
  VALUES ('SPY', strat_reversal, 'short', 622.00, 628.00, 608.00,
    'Watching 622 as key resistance. If rejection candle prints there on elevated volume, will short.', 7, 'active', uid);

  INSERT INTO planned_trades (ticker, strategy_id, direction, planned_entry, stop_loss, target_price, notes, confidence, status, user_id)
  VALUES ('GOOGL', strat_gap, 'long', 200.00, 194.00, 215.00,
    'Potential analyst upgrade catalyst. Watching pre-market for gap and go setup above 200.', 6, 'active', uid);

  -- ============================================================
  -- MISSED TRADES
  -- ============================================================
  INSERT INTO missed_trades (date, ticker, strategy_id, direction, entry_would_have_been, exit_would_have_been, position_size, simulated_pnl, reason_missed, notes, user_id)
  VALUES ('2026-01-20','NVDA',strat_breakout,'long',158.00,172.00,60,840.00,
    'Was managing an open SPY position at the same time',
    'Perfect breakout setup that played out without me. Need to manage open positions better so capacity exists for new A+ setups.', uid);

  INSERT INTO missed_trades (date, ticker, strategy_id, direction, entry_would_have_been, exit_would_have_been, position_size, simulated_pnl, reason_missed, notes, user_id)
  VALUES ('2026-02-07','META',strat_trend,'long',615.00,638.00,20,460.00,
    'No clear entry signal on my intraday timeframe',
    'Daily chart was obvious in hindsight. Should check daily chart more consistently for trend setups rather than only watching intraday.', uid);

  INSERT INTO missed_trades (date, ticker, strategy_id, direction, entry_would_have_been, exit_would_have_been, position_size, simulated_pnl, reason_missed, notes, user_id)
  VALUES ('2026-02-25','TSLA',strat_gap,'long',398.00,418.00,30,600.00,
    'Avoided due to earnings week uncertainty',
    'Gap and go would have worked perfectly. Consider sizing down and taking these setups rather than skipping entirely.', uid);

  INSERT INTO missed_trades (date, ticker, strategy_id, direction, entry_would_have_been, exit_would_have_been, position_size, simulated_pnl, reason_missed, notes, user_id)
  VALUES ('2026-03-08','AMD',strat_trend,'long',132.00,145.00,50,650.00,
    'Was not watching the market that day',
    'Strong sector move, easy trend follow. Need better watchlist alerts so I do not miss these when away from screens.', uid);

  -- ============================================================
  -- GOALS
  -- ============================================================
  INSERT INTO goals (name, metric, target_value, timeframe, direction, active, user_id)
  VALUES ('Monthly P&L Target', 'pnl',          2000.00, 'monthly', 'above', 1, uid);

  INSERT INTO goals (name, metric, target_value, timeframe, direction, active, user_id)
  VALUES ('Win Rate',           'win_rate',        60.00, 'monthly', 'above', 1, uid);

  INSERT INTO goals (name, metric, target_value, timeframe, direction, active, user_id)
  VALUES ('Trades Per Month',   'trade_count',      8.00, 'monthly', 'above', 1, uid);

  INSERT INTO goals (name, metric, target_value, timeframe, direction, active, user_id)
  VALUES ('Max Daily Loss',     'max_daily_loss',  500.00, 'daily',   'below', 1, uid);

  -- ============================================================
  -- ACHIEVEMENTS
  -- ============================================================
  INSERT INTO achievements (key, name, description, icon, category, earned_at, custom, user_id)
  VALUES ('first_trade',     'First Trade',   'Completed your first trade',              '🎯', 'milestone',    '2025-12-02', 0, uid);

  INSERT INTO achievements (key, name, description, icon, category, earned_at, custom, user_id)
  VALUES ('ten_trades',      '10 Trades',     'Completed 10 trades',                     '📈', 'milestone',    '2026-01-05', 0, uid);

  INSERT INTO achievements (key, name, description, icon, category, earned_at, custom, user_id)
  VALUES ('first_green_month','Green Month',  'Finished a calendar month in profit',     '💚', 'consistency',  '2025-12-31', 0, uid);

  INSERT INTO achievements (key, name, description, icon, category, earned_at, custom, user_id)
  VALUES ('big_winner',      'Big Winner',    'Single trade profit over $900',           '🚀', 'performance',  '2026-01-14', 0, uid);

  INSERT INTO achievements (key, name, description, icon, category, earned_at, custom, user_id)
  VALUES ('twenty_trades',   '20 Trades',     'Completed 20 trades',                     '🏅', 'milestone',    '2026-02-10', 0, uid);

END $$;
