-- 0037_prospect_targets_report.sql
-- Adds prospect_targets table for Fortune 500 targeting and target_id FK on prospect_leads.
-- Seed data: 250+ major companies organized by GICS sector.

-- ---------------------------------------------------------------------------
-- 1. DDL: prospect_targets table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS prospect_targets (
  target_id  TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  ticker     TEXT,
  cik        TEXT,
  domains    TEXT,   -- JSON array
  industry   TEXT,
  sector     TEXT,
  keywords   TEXT,   -- JSON array
  products   TEXT,   -- JSON array
  status     TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_targets_name ON prospect_targets(name);
CREATE INDEX IF NOT EXISTS idx_prospect_targets_ticker ON prospect_targets(ticker);
CREATE INDEX IF NOT EXISTS idx_prospect_targets_status ON prospect_targets(status);

-- ---------------------------------------------------------------------------
-- 2. ALTER TABLE: add target_id FK to prospect_leads
-- ---------------------------------------------------------------------------

ALTER TABLE prospect_leads ADD COLUMN target_id TEXT REFERENCES prospect_targets(target_id);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_target ON prospect_leads(target_id);

-- ---------------------------------------------------------------------------
-- 3. Fortune 500 seed data (250+ companies, grouped by sector)
-- ---------------------------------------------------------------------------

-- =========================================================================
-- FINANCIALS — Banks, Brokers, Exchanges, Payments, Insurance, Fintech
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-jpmorgan-chase', 'JPMorgan Chase', 'JPM', '0000019617', '["jpmorgan.com","chase.com","jpmorganchase.com"]', 'Diversified Banks', 'Financials', '["investment banking","asset management","commercial banking","trading","custody"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-goldman-sachs', 'Goldman Sachs', 'GS', '0000886982', '["goldmansachs.com","gs.com","marquee.gs.com"]', 'Investment Banking', 'Financials', '["investment banking","securities","trading","asset management","wealth management"]', '["Marquee","GS Financial Cloud"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-bank-of-america', 'Bank of America', 'BAC', '0000070858', '["bankofamerica.com","bofa.com"]', 'Diversified Banks', 'Financials', '["retail banking","wealth management","commercial banking","trading"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-morgan-stanley', 'Morgan Stanley', 'MS', '0000895421', '["morganstanley.com"]', 'Investment Banking', 'Financials', '["investment banking","wealth management","securities","trading"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-wells-fargo', 'Wells Fargo', 'WFC', '0000072971', '["wellsfargo.com"]', 'Diversified Banks', 'Financials', '["retail banking","commercial banking","mortgage","wealth management"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-citigroup', 'Citigroup', 'C', '0000831001', '["citigroup.com","citi.com"]', 'Diversified Banks', 'Financials', '["global banking","treasury services","trade finance","securities"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-charles-schwab', 'Charles Schwab', 'SCHW', '0000316709', '["schwab.com"]', 'Brokerage', 'Financials', '["brokerage","wealth management","financial planning","trading"]', '["Schwab Intelligent Portfolios","thinkorswim"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-blackrock', 'BlackRock', 'BLK', '0001364742', '["blackrock.com"]', 'Asset Management', 'Financials', '["asset management","ETF","risk analytics","index funds"]', '["Aladdin","iShares"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-visa', 'Visa', 'V', '0001403161', '["visa.com"]', 'Payment Networks', 'Financials', '["payments","card network","digital payments","fintech"]', '["VisaNet","Visa Direct"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-mastercard', 'Mastercard', 'MA', '0001141391', '["mastercard.com"]', 'Payment Networks', 'Financials', '["payments","card network","digital payments","fraud prevention"]', '["Mastercard Network","Mastercard Send"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-american-express', 'American Express', 'AXP', '0000004962', '["americanexpress.com","amex.com"]', 'Consumer Finance', 'Financials', '["credit cards","charge cards","merchant services","travel"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-state-street', 'State Street', 'STT', '0000093751', '["statestreet.com"]', 'Custody Banks', 'Financials', '["custody","asset servicing","ETF","index funds"]', '["State Street Alpha","SPDR ETFs"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-bny-mellon', 'Bank of New York Mellon', 'BK', '0001390777', '["bnymellon.com"]', 'Custody Banks', 'Financials', '["custody","clearing","securities servicing","treasury services"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-cme-group', 'CME Group', 'CME', '0001156375', '["cmegroup.com"]', 'Exchanges', 'Financials', '["derivatives","futures","options","clearing","commodities"]', '["CME Globex","CME ClearPort"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-intercontinental-exchange', 'Intercontinental Exchange', 'ICE', '0001571949', '["theice.com","nyse.com"]', 'Exchanges', 'Financials', '["exchanges","clearing","data services","fixed income"]', '["NYSE","ICE Data Services"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-nasdaq', 'Nasdaq', 'NDAQ', '0001120193', '["nasdaq.com"]', 'Exchanges', 'Financials', '["stock exchange","market technology","listing services","data analytics"]', '["Nasdaq MarketSite","Nasdaq Financial Framework"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-cboe-global-markets', 'Cboe Global Markets', 'CBOE', '0001374310', '["cboe.com"]', 'Exchanges', 'Financials', '["options","volatility","exchange","index products"]', '["VIX","Cboe EDGX"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-capital-one', 'Capital One Financial', 'COF', '0000927628', '["capitalone.com"]', 'Consumer Finance', 'Financials', '["credit cards","consumer banking","auto lending","digital banking"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-us-bancorp', 'U.S. Bancorp', 'USB', '0000036104', '["usbank.com"]', 'Regional Banks', 'Financials', '["retail banking","commercial banking","payments","wealth management"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-pnc-financial', 'PNC Financial Services', 'PNC', '0000713676', '["pnc.com"]', 'Regional Banks', 'Financials', '["retail banking","commercial banking","asset management"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-truist', 'Truist Financial', 'TFC', '0000092230', '["truist.com"]', 'Regional Banks', 'Financials', '["retail banking","commercial banking","insurance","wealth management"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-northern-trust', 'Northern Trust', 'NTRS', '0000073124', '["northerntrust.com"]', 'Custody Banks', 'Financials', '["custody","asset servicing","wealth management","institutional"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-fidelity-national', 'Fidelity National Information Services', 'FIS', '0001136893', '["fisglobal.com"]', 'Financial Technology', 'Financials', '["banking technology","payments","capital markets technology","processing"]', '["Modern Banking Platform","Worldpay"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-fiserv', 'Fiserv', 'FISV', '0000798354', '["fiserv.com"]', 'Financial Technology', 'Financials', '["payments","financial technology","merchant acquiring","core banking"]', '["Clover","Carat","DNA"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-paypal', 'PayPal', 'PYPL', '0001633917', '["paypal.com","venmo.com"]', 'Payment Processing', 'Financials', '["digital payments","e-commerce","P2P payments","checkout"]', '["PayPal Checkout","Venmo","Braintree"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-block', 'Block', 'SQ', '0001512673', '["block.xyz","squareup.com","cash.app"]', 'Payment Processing', 'Financials', '["payments","point of sale","bitcoin","P2P payments"]', '["Square","Cash App","TIDAL","TBD"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-robinhood', 'Robinhood Markets', 'HOOD', '0001783879', '["robinhood.com"]', 'Brokerage', 'Financials', '["commission-free trading","retail brokerage","crypto trading","options"]', '["Robinhood Gold","Robinhood Crypto"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-coinbase', 'Coinbase Global', 'COIN', '0001679788', '["coinbase.com"]', 'Crypto Exchange', 'Financials', '["cryptocurrency","digital assets","blockchain","exchange"]', '["Coinbase Pro","Coinbase Cloud","Base"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-interactive-brokers', 'Interactive Brokers', 'IBKR', '0001381197', '["interactivebrokers.com"]', 'Brokerage', 'Financials', '["electronic brokerage","global trading","market making","prime brokerage"]', '["Trader Workstation","IBKR GlobalTrader"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-sp-global', 'S&P Global', 'SPGI', '0000064040', '["spglobal.com"]', 'Financial Data & Analytics', 'Financials', '["credit ratings","market intelligence","indices","analytics"]', '["Capital IQ","S&P 500","Platts"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-moodys', 'Moody''s', 'MCO', '0001059556', '["moodys.com"]', 'Financial Data & Analytics', 'Financials', '["credit ratings","risk assessment","analytics","ESG"]', '["Moody''s Analytics","Moody''s Investors Service"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-msci', 'MSCI', 'MSCI', '0001408198', '["msci.com"]', 'Financial Data & Analytics', 'Financials', '["index provider","ESG ratings","risk analytics","portfolio analytics"]', '["MSCI World","MSCI ACWI","Barra"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-broadridge', 'Broadridge Financial Solutions', 'BR', '0001383312', '["broadridge.com"]', 'Financial Technology', 'Financials', '["investor communications","proxy services","securities processing","fintech"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-dtcc', 'DTCC', NULL, NULL, '["dtcc.com"]', 'Financial Market Infrastructure', 'Financials', '["clearing","settlement","post-trade","CSD","derivatives"]', '["NSCC","DTC","ITP"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-citadel-securities', 'Citadel Securities', NULL, NULL, '["citadelsecurities.com"]', 'Market Making', 'Financials', '["market making","liquidity provision","electronic trading","equities"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-two-sigma', 'Two Sigma', NULL, NULL, '["twosigma.com"]', 'Quantitative Hedge Fund', 'Financials', '["quantitative trading","machine learning","data science","alternative investments"]', '["Venn","Two Sigma Insurance Quantified"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-jane-street', 'Jane Street', NULL, NULL, '["janestreet.com"]', 'Market Making', 'Financials', '["market making","quantitative trading","ETF","liquidity"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-virtu-financial', 'Virtu Financial', 'VIRT', '0001592386', '["virtu.com"]', 'Market Making', 'Financials', '["market making","electronic trading","execution services","analytics"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-marketaxess', 'MarketAxess', 'MKTX', '0001278021', '["marketaxess.com"]', 'Electronic Trading', 'Financials', '["fixed income","electronic trading","bonds","credit"]', '["Open Trading"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-tradeweb', 'Tradeweb Markets', 'TW', '0001758730', '["tradeweb.com"]', 'Electronic Trading', 'Financials', '["fixed income","derivatives","electronic trading","rates"]', '["Tradeweb Direct"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-affirm', 'Affirm', 'AFRM', '0001820953', '["affirm.com"]', 'Consumer Finance', 'Financials', '["buy now pay later","consumer credit","point of sale lending","fintech"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-stripe', 'Stripe', NULL, NULL, '["stripe.com"]', 'Payment Processing', 'Financials', '["payments API","online payments","billing","financial infrastructure"]', '["Stripe Connect","Stripe Atlas","Stripe Radar"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-plaid', 'Plaid', NULL, NULL, '["plaid.com"]', 'Financial Technology', 'Financials', '["open banking","financial data API","account linking","fintech infrastructure"]', '["Plaid Link","Plaid Transfer"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-blackstone', 'Blackstone', 'BX', '0001393818', '["blackstone.com"]', 'Alternative Asset Management', 'Financials', '["private equity","real estate","hedge funds","credit"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-kkr', 'KKR & Co.', 'KKR', '0001404912', '["kkr.com"]', 'Alternative Asset Management', 'Financials', '["private equity","infrastructure","credit","real estate"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-apollo-global', 'Apollo Global Management', 'APO', '0001411494', '["apollo.com"]', 'Alternative Asset Management', 'Financials', '["private equity","credit","insurance","retirement services"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-marsh-mclennan', 'Marsh McLennan', 'MMC', '0000062996', '["marshmclennan.com","marsh.com"]', 'Insurance Brokerage', 'Financials', '["insurance brokerage","risk management","consulting","reinsurance"]', '["Marsh","Mercer","Oliver Wyman","Guy Carpenter"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-aon', 'Aon', 'AON', '0000315293', '["aon.com"]', 'Insurance Brokerage', 'Financials', '["insurance brokerage","risk solutions","reinsurance","human capital"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-progressive', 'Progressive', 'PGR', '0000080661', '["progressive.com"]', 'Property & Casualty Insurance', 'Financials', '["auto insurance","home insurance","commercial insurance","telematics"]', '["Snapshot"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-metlife', 'MetLife', 'MET', '0001099219', '["metlife.com"]', 'Life Insurance', 'Financials', '["life insurance","annuities","employee benefits","retirement"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-prudential-financial', 'Prudential Financial', 'PRU', '0001137774', '["prudential.com"]', 'Life Insurance', 'Financials', '["life insurance","retirement","asset management","annuities"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-aig', 'American International Group', 'AIG', '0000005272', '["aig.com"]', 'Multi-line Insurance', 'Financials', '["commercial insurance","personal insurance","life insurance","retirement"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-travelers', 'Travelers', 'TRV', '0000086312', '["travelers.com"]', 'Property & Casualty Insurance', 'Financials', '["property insurance","casualty insurance","commercial insurance","bonds"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-allstate', 'Allstate', 'ALL', '0000899629', '["allstate.com"]', 'Property & Casualty Insurance', 'Financials', '["auto insurance","home insurance","life insurance"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-discover', 'Discover Financial Services', 'DFS', '0001393612', '["discover.com"]', 'Consumer Finance', 'Financials', '["credit cards","personal loans","savings","payment network"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-synchrony', 'Synchrony Financial', 'SYF', '0001601712', '["synchrony.com"]', 'Consumer Finance', 'Financials', '["private label credit","consumer financing","digital banking"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-raymond-james', 'Raymond James Financial', 'RJF', '0000720005', '["raymondjames.com"]', 'Brokerage', 'Financials', '["wealth management","investment banking","brokerage"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-fifth-third-bancorp', 'Fifth Third Bancorp', 'FITB', '0000035527', '["53.com"]', 'Regional Banks', 'Financials', '["retail banking","commercial banking","wealth management"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-hartford-financial', 'Hartford Financial Services', 'HIG', '0000874766', '["thehartford.com"]', 'Multi-line Insurance', 'Financials', '["commercial insurance","personal insurance","group benefits"]', NULL);

-- =========================================================================
-- INFORMATION TECHNOLOGY — Hardware, Software, Semiconductors, Cybersecurity, IT Services
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-apple', 'Apple', 'AAPL', '0000320193', '["apple.com","developer.apple.com"]', 'Technology Hardware', 'Information Technology', '["consumer electronics","smartphones","computers","services"]', '["iPhone","Mac","iPad","Apple Pay"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-microsoft', 'Microsoft', 'MSFT', '0000789019', '["microsoft.com","azure.com","github.com"]', 'Software', 'Information Technology', '["cloud computing","operating systems","productivity software","AI"]', '["Azure","Office 365","Windows","GitHub","Teams"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-alphabet', 'Alphabet', 'GOOGL', '0001652044', '["google.com","alphabet.com","youtube.com","cloud.google.com"]', 'Internet Services', 'Information Technology', '["search","advertising","cloud computing","AI","mobile OS"]', '["Google Cloud","Android","Chrome","YouTube"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-amazon', 'Amazon.com', 'AMZN', '0001018724', '["amazon.com","aws.amazon.com"]', 'Internet Retail / Cloud', 'Information Technology', '["e-commerce","cloud computing","logistics","AI","streaming"]', '["AWS","Alexa","Prime","Kindle"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-meta-platforms', 'Meta Platforms', 'META', '0001326801', '["meta.com","facebook.com","instagram.com"]', 'Internet Services', 'Information Technology', '["social media","advertising","VR","metaverse","messaging"]', '["Facebook","Instagram","WhatsApp","Oculus"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-nvidia', 'NVIDIA', 'NVDA', '0001045810', '["nvidia.com","developer.nvidia.com"]', 'Semiconductors', 'Information Technology', '["GPU","AI chips","data center","gaming","autonomous vehicles"]', '["CUDA","TensorRT","DGX","GeForce"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-intel', 'Intel', 'INTC', '0000050863', '["intel.com"]', 'Semiconductors', 'Information Technology', '["processors","data center","foundry","FPGA"]', '["Core","Xeon","Arc","Altera"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-amd', 'Advanced Micro Devices', 'AMD', '0000002488', '["amd.com"]', 'Semiconductors', 'Information Technology', '["processors","GPU","data center","embedded"]', '["Ryzen","EPYC","Radeon","Instinct"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-broadcom', 'Broadcom', 'AVGO', '0001649338', '["broadcom.com"]', 'Semiconductors', 'Information Technology', '["networking chips","storage","wireless","infrastructure software"]', '["VMware","Symantec","CA Technologies"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-texas-instruments', 'Texas Instruments', 'TXN', '0000097476', '["ti.com"]', 'Semiconductors', 'Information Technology', '["analog chips","embedded processors","industrial","automotive"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-salesforce', 'Salesforce', 'CRM', '0001108524', '["salesforce.com"]', 'Software', 'Information Technology', '["CRM","cloud","enterprise software","AI","marketing automation"]', '["Sales Cloud","Service Cloud","Tableau","Slack","Einstein"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-oracle', 'Oracle', 'ORCL', '0001341439', '["oracle.com","cloud.oracle.com"]', 'Software', 'Information Technology', '["database","cloud infrastructure","ERP","enterprise software"]', '["Oracle Cloud","Oracle Database","MySQL","Java"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-sap', 'SAP', 'SAP', '0001000184', '["sap.com"]', 'Software', 'Information Technology', '["ERP","enterprise software","business intelligence","supply chain"]', '["S/4HANA","SAP BTP","SuccessFactors","Ariba"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-adobe', 'Adobe', 'ADBE', '0000796343', '["adobe.com"]', 'Software', 'Information Technology', '["creative software","digital marketing","PDF","design"]', '["Creative Cloud","Experience Cloud","Photoshop","Acrobat"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-servicenow', 'ServiceNow', 'NOW', '0001373715', '["servicenow.com"]', 'Software', 'Information Technology', '["ITSM","workflow automation","enterprise platform","AI ops"]', '["Now Platform"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-cisco', 'Cisco Systems', 'CSCO', '0000858877', '["cisco.com"]', 'Networking Equipment', 'Information Technology', '["networking","security","collaboration","observability"]', '["IOS","Webex","Meraki","Splunk","AppDynamics"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-palo-alto-networks', 'Palo Alto Networks', 'PANW', '0001327567', '["paloaltonetworks.com"]', 'Cybersecurity', 'Information Technology', '["network security","cloud security","SASE","SOC"]', '["Prisma Cloud","Cortex XDR","Strata"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-crowdstrike', 'CrowdStrike', 'CRWD', '0001535527', '["crowdstrike.com"]', 'Cybersecurity', 'Information Technology', '["endpoint security","threat intelligence","cloud security","XDR"]', '["Falcon"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-fortinet', 'Fortinet', 'FTNT', '0001262039', '["fortinet.com"]', 'Cybersecurity', 'Information Technology', '["firewall","network security","SD-WAN","SASE"]', '["FortiGate","FortiOS","FortiSASE"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-snowflake', 'Snowflake', 'SNOW', '0001640147', '["snowflake.com"]', 'Software', 'Information Technology', '["data warehouse","data lake","data sharing","cloud analytics"]', '["Snowflake Data Cloud"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-palantir', 'Palantir Technologies', 'PLTR', '0001321655', '["palantir.com"]', 'Software', 'Information Technology', '["data analytics","government","defense","AI platform"]', '["Gotham","Foundry","Apollo","AIP"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-datadog', 'Datadog', 'DDOG', '0001561550', '["datadoghq.com"]', 'Software', 'Information Technology', '["observability","monitoring","APM","cloud security","log management"]', '["Datadog APM","Datadog SIEM"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-ibm', 'IBM', 'IBM', '0000051143', '["ibm.com"]', 'IT Services', 'Information Technology', '["hybrid cloud","AI","consulting","mainframe","quantum computing"]', '["Red Hat","watsonx","z16"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-accenture', 'Accenture', 'ACN', '0001281761', '["accenture.com"]', 'IT Services', 'Information Technology', '["consulting","digital transformation","cloud","managed services"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-infosys', 'Infosys', 'INFY', '0001067491', '["infosys.com"]', 'IT Services', 'Information Technology', '["IT outsourcing","consulting","digital services","engineering"]', '["Infosys Cobalt","Infosys Nia"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-qualcomm', 'Qualcomm', 'QCOM', '0000804328', '["qualcomm.com"]', 'Semiconductors', 'Information Technology', '["mobile chips","5G","wireless","automotive"]', '["Snapdragon"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-intuit', 'Intuit', 'INTU', '0000896878', '["intuit.com","turbotax.com","quickbooks.com"]', 'Software', 'Information Technology', '["tax software","accounting","small business","personal finance"]', '["TurboTax","QuickBooks","Mailchimp","Credit Karma"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-applied-materials', 'Applied Materials', 'AMAT', '0000006951', '["appliedmaterials.com"]', 'Semiconductor Equipment', 'Information Technology', '["semiconductor fabrication","display manufacturing","materials engineering"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-lam-research', 'Lam Research', 'LRCX', '0000707549', '["lamresearch.com"]', 'Semiconductor Equipment', 'Information Technology', '["wafer fabrication","etch","deposition","semiconductor equipment"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-micron-technology', 'Micron Technology', 'MU', '0000723125', '["micron.com"]', 'Semiconductors', 'Information Technology', '["memory","DRAM","NAND","storage","HBM"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-synopsys', 'Synopsys', 'SNPS', '0000883241', '["synopsys.com"]', 'Electronic Design Automation', 'Information Technology', '["EDA","chip design","verification","IP"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-cadence', 'Cadence Design Systems', 'CDNS', '0000813672', '["cadence.com"]', 'Electronic Design Automation', 'Information Technology', '["EDA","simulation","PCB design","IP"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-arista-networks', 'Arista Networks', 'ANET', '0001313545', '["arista.com"]', 'Networking Equipment', 'Information Technology', '["cloud networking","data center switches","network observability"]', '["EOS","CloudVision"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-workday', 'Workday', 'WDAY', '0001327811', '["workday.com"]', 'Software', 'Information Technology', '["HCM","financial management","enterprise planning","cloud ERP"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-autodesk', 'Autodesk', 'ADSK', '0000769397', '["autodesk.com"]', 'Software', 'Information Technology', '["CAD","BIM","3D design","manufacturing","construction"]', '["AutoCAD","Revit","Fusion","Maya"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-dell-technologies', 'Dell Technologies', 'DELL', '0001571996', '["dell.com"]', 'Technology Hardware', 'Information Technology', '["PCs","servers","storage","infrastructure"]', '["PowerEdge","PowerStore","APEX"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-hp', 'HP', 'HPQ', '0000047217', '["hp.com"]', 'Technology Hardware', 'Information Technology', '["PCs","printers","peripherals","3D printing"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-klac', 'KLA Corporation', 'KLAC', '0000319201', '["kla.com"]', 'Semiconductor Equipment', 'Information Technology', '["process control","inspection","metrology","semiconductor"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-marvell-technology', 'Marvell Technology', 'MRVL', '0001058057', '["marvell.com"]', 'Semiconductors', 'Information Technology', '["data infrastructure","5G","cloud","storage controllers"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-analog-devices', 'Analog Devices', 'ADI', '0000006281', '["analog.com"]', 'Semiconductors', 'Information Technology', '["analog semiconductors","signal processing","power management"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-motorola-solutions', 'Motorola Solutions', 'MSI', '0000068505', '["motorolasolutions.com"]', 'Communications Equipment', 'Information Technology', '["public safety","two-way radio","command center","video security"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-on-semiconductor', 'ON Semiconductor', 'ON', '0000861374', '["onsemi.com"]', 'Semiconductors', 'Information Technology', '["power semiconductors","sensors","automotive chips"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-te-connectivity', 'TE Connectivity', 'TEL', '0001385157', '["te.com"]', 'Electronic Components', 'Information Technology', '["connectors","sensors","automotive","industrial"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-amphenol', 'Amphenol', 'APH', '0000820313', '["amphenol.com"]', 'Electronic Components', 'Information Technology', '["connectors","interconnect","sensors","fiber optics"]', NULL);

-- =========================================================================
-- HEALTH CARE — Pharma, Biotech, Medical Devices, Managed Care, Distribution
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-unitedhealth', 'UnitedHealth Group', 'UNH', '0000731766', '["unitedhealthgroup.com","uhc.com","optum.com"]', 'Managed Care', 'Health Care', '["health insurance","pharmacy benefits","data analytics","care delivery"]', '["Optum","UnitedHealthcare"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-cvs-health', 'CVS Health', 'CVS', '0000064803', '["cvshealth.com","cvs.com"]', 'Health Care Services', 'Health Care', '["pharmacy","health insurance","retail clinics","PBM"]', '["Aetna","Caremark","MinuteClinic"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-cigna-group', 'Cigna Group', 'CI', '0001739940', '["cigna.com","evernorth.com"]', 'Managed Care', 'Health Care', '["health insurance","pharmacy benefits","behavioral health"]', '["Evernorth","Express Scripts"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-elevance-health', 'Elevance Health', 'ELV', '0001156039', '["elevancehealth.com"]', 'Managed Care', 'Health Care', '["health insurance","Medicaid","Medicare","behavioral health"]', '["Anthem","Carelon"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-johnson-johnson', 'Johnson & Johnson', 'JNJ', '0000200406', '["jnj.com"]', 'Pharmaceuticals', 'Health Care', '["pharmaceuticals","medical devices","consumer health"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-pfizer', 'Pfizer', 'PFE', '0000078003', '["pfizer.com"]', 'Pharmaceuticals', 'Health Care', '["pharmaceuticals","vaccines","oncology","rare disease"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-merck', 'Merck & Co.', 'MRK', '0000310158', '["merck.com"]', 'Pharmaceuticals', 'Health Care', '["pharmaceuticals","vaccines","oncology","animal health"]', '["Keytruda"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-abbvie', 'AbbVie', 'ABBV', '0001551152', '["abbvie.com"]', 'Pharmaceuticals', 'Health Care', '["pharmaceuticals","immunology","oncology","neuroscience"]', '["Humira","Skyrizi","Rinvoq"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-eli-lilly', 'Eli Lilly', 'LLY', '0000059478', '["lilly.com"]', 'Pharmaceuticals', 'Health Care', '["pharmaceuticals","diabetes","oncology","neuroscience"]', '["Mounjaro","Trulicity"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-mckesson', 'McKesson', 'MCK', '0000927653', '["mckesson.com"]', 'Health Care Distribution', 'Health Care', '["pharmaceutical distribution","medical supplies","health IT"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-cardinal-health', 'Cardinal Health', 'CAH', '0000721371', '["cardinalhealth.com"]', 'Health Care Distribution', 'Health Care', '["pharmaceutical distribution","medical products","nuclear pharmacy"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-cencora', 'Cencora', 'COR', '0001140859', '["cencora.com"]', 'Health Care Distribution', 'Health Care', '["pharmaceutical distribution","specialty pharma","animal health"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-abbott-laboratories', 'Abbott Laboratories', 'ABT', '0000001800', '["abbott.com"]', 'Medical Devices', 'Health Care', '["diagnostics","medical devices","nutrition","pharmaceuticals"]', '["FreeStyle Libre"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-thermo-fisher', 'Thermo Fisher Scientific', 'TMO', '0000097745', '["thermofisher.com"]', 'Life Sciences Tools', 'Health Care', '["analytical instruments","lab equipment","diagnostics","biopharma services"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-danaher', 'Danaher', 'DHR', '0000313616', '["danaher.com"]', 'Life Sciences Tools', 'Health Care', '["life sciences","diagnostics","environmental","water quality"]', '["Beckman Coulter","Pall","Leica"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-medtronic', 'Medtronic', 'MDT', '0001613103', '["medtronic.com"]', 'Medical Devices', 'Health Care', '["medical devices","cardiac","surgical","diabetes"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-amgen', 'Amgen', 'AMGN', '0000318154', '["amgen.com"]', 'Biotechnology', 'Health Care', '["biotechnology","oncology","cardiovascular","bone health"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-gilead-sciences', 'Gilead Sciences', 'GILD', '0000882095', '["gilead.com"]', 'Biotechnology', 'Health Care', '["biotechnology","HIV","hepatitis","oncology"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-regeneron', 'Regeneron Pharmaceuticals', 'REGN', '0000872589', '["regeneron.com"]', 'Biotechnology', 'Health Care', '["biotechnology","immunology","oncology","ophthalmology"]', '["Dupixent","Eylea"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-bristol-myers-squibb', 'Bristol-Myers Squibb', 'BMY', '0000014272', '["bms.com"]', 'Pharmaceuticals', 'Health Care', '["pharmaceuticals","oncology","hematology","cardiovascular"]', '["Opdivo","Eliquis"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-intuitive-surgical', 'Intuitive Surgical', 'ISRG', '0001035267', '["intuitive.com"]', 'Medical Devices', 'Health Care', '["robotic surgery","surgical systems","minimally invasive"]', '["da Vinci","Ion"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-stryker', 'Stryker', 'SYK', '0000310764', '["stryker.com"]', 'Medical Devices', 'Health Care', '["orthopedics","surgical equipment","neurotechnology"]', '["Mako"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-boston-scientific', 'Boston Scientific', 'BSX', '0000885725', '["bostonscientific.com"]', 'Medical Devices', 'Health Care', '["interventional cardiology","rhythm management","endoscopy"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-hca-healthcare', 'HCA Healthcare', 'HCA', '0000860730', '["hcahealthcare.com"]', 'Health Care Facilities', 'Health Care', '["hospitals","surgery centers","emergency rooms"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-humana', 'Humana', 'HUM', '0000049071', '["humana.com"]', 'Managed Care', 'Health Care', '["Medicare Advantage","health insurance","home health"]', '["CenterWell"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-centene', 'Centene', 'CNC', '0001071739', '["centene.com"]', 'Managed Care', 'Health Care', '["Medicaid","managed care","health insurance","marketplace"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-becton-dickinson', 'Becton Dickinson', 'BDX', '0000010795', '["bd.com"]', 'Medical Devices', 'Health Care', '["syringes","diagnostics","medication management"]', NULL);

-- =========================================================================
-- ENERGY — Oil & Gas, Services, Midstream
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-exxonmobil', 'Exxon Mobil', 'XOM', '0000034088', '["exxonmobil.com"]', 'Integrated Oil & Gas', 'Energy', '["oil","natural gas","refining","chemicals","LNG"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-chevron', 'Chevron', 'CVX', '0000093410', '["chevron.com"]', 'Integrated Oil & Gas', 'Energy', '["oil","natural gas","refining","LNG","renewables"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-conocophillips', 'ConocoPhillips', 'COP', '0001163165', '["conocophillips.com"]', 'Oil & Gas Exploration', 'Energy', '["oil exploration","natural gas","LNG","shale"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-phillips-66', 'Phillips 66', 'PSX', '0001534701', '["phillips66.com"]', 'Oil & Gas Refining', 'Energy', '["refining","midstream","chemicals","marketing"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-valero-energy', 'Valero Energy', 'VLO', '0001035002', '["valero.com"]', 'Oil & Gas Refining', 'Energy', '["refining","ethanol","renewable diesel"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-marathon-petroleum', 'Marathon Petroleum', 'MPC', '0001510295', '["marathonpetroleum.com"]', 'Oil & Gas Refining', 'Energy', '["refining","midstream","retail fuel"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-baker-hughes', 'Baker Hughes', 'BKR', '0001701605', '["bakerhughes.com"]', 'Oil & Gas Equipment & Services', 'Energy', '["oilfield services","industrial technology","LNG equipment"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-halliburton', 'Halliburton', 'HAL', '0000045012', '["halliburton.com"]', 'Oil & Gas Equipment & Services', 'Energy', '["oilfield services","drilling","completions","fracking"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-schlumberger', 'SLB', 'SLB', '0000087347', '["slb.com"]', 'Oil & Gas Equipment & Services', 'Energy', '["oilfield services","drilling","digital solutions","subsea"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-eog-resources', 'EOG Resources', 'EOG', '0000821189', '["eogresources.com"]', 'Oil & Gas Exploration', 'Energy', '["shale oil","natural gas","exploration","Permian Basin"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-devon-energy', 'Devon Energy', 'DVN', '0001090012', '["devonenergy.com"]', 'Oil & Gas Exploration', 'Energy', '["shale oil","natural gas","Delaware Basin"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-hess', 'Hess', 'HES', '0000004447', '["hess.com"]', 'Oil & Gas Exploration', 'Energy', '["oil exploration","Guyana","Bakken","offshore"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-diamondback-energy', 'Diamondback Energy', 'FANG', '0001539838', '["diamondbackenergy.com"]', 'Oil & Gas Exploration', 'Energy', '["Permian Basin","shale oil","horizontal drilling"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-williams-companies', 'Williams Companies', 'WMB', '0000107263', '["williams.com"]', 'Oil & Gas Midstream', 'Energy', '["natural gas pipelines","gathering","processing","transmission"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-oneok', 'ONEOK', 'OKE', '0000275880', '["oneok.com"]', 'Oil & Gas Midstream', 'Energy', '["NGL pipelines","natural gas gathering","fractionation"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-kinder-morgan', 'Kinder Morgan', 'KMI', '0001110805', '["kindermorgan.com"]', 'Oil & Gas Midstream', 'Energy', '["natural gas pipelines","terminals","CO2 transport"]', NULL);

-- =========================================================================
-- CONSUMER DISCRETIONARY — Retail, Automotive, Hotels, Restaurants
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-tesla', 'Tesla', 'TSLA', '0001318605', '["tesla.com"]', 'Automobile Manufacturers', 'Consumer Discretionary', '["electric vehicles","energy storage","solar","autonomous driving"]', '["Model 3","Model Y","Powerwall","Autopilot"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-home-depot', 'Home Depot', 'HD', '0000354950', '["homedepot.com"]', 'Home Improvement Retail', 'Consumer Discretionary', '["home improvement","building materials","tools","pro supply"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-mcdonalds', 'McDonald''s', 'MCD', '0000063908', '["mcdonalds.com"]', 'Restaurants', 'Consumer Discretionary', '["fast food","franchise","restaurants","QSR"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-nike', 'Nike', 'NKE', '0000320187', '["nike.com"]', 'Footwear & Apparel', 'Consumer Discretionary', '["athletic footwear","apparel","sportswear","DTC"]', '["Air Jordan","Nike+"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-starbucks', 'Starbucks', 'SBUX', '0000829224', '["starbucks.com"]', 'Restaurants', 'Consumer Discretionary', '["coffee","restaurants","franchise","mobile ordering"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-lowes', 'Lowe''s', 'LOW', '0000060667', '["lowes.com"]', 'Home Improvement Retail', 'Consumer Discretionary', '["home improvement","hardware","appliances","building materials"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-target', 'Target', 'TGT', '0000027419', '["target.com"]', 'General Merchandise', 'Consumer Discretionary', '["general merchandise","grocery","apparel","fulfillment"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-general-motors', 'General Motors', 'GM', '0001467858', '["gm.com"]', 'Automobile Manufacturers', 'Consumer Discretionary', '["automobiles","electric vehicles","trucks","autonomous"]', '["Chevrolet","GMC","Cadillac","Cruise"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-ford', 'Ford Motor', 'F', '0000037996', '["ford.com"]', 'Automobile Manufacturers', 'Consumer Discretionary', '["automobiles","electric vehicles","trucks","commercial fleet"]', '["F-150 Lightning","Mustang Mach-E","Ford Pro"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-booking-holdings', 'Booking Holdings', 'BKNG', '0001075531', '["bookingholdings.com","booking.com","priceline.com"]', 'Online Travel', 'Consumer Discretionary', '["online travel","hotel bookings","rental cars","experiences"]', '["Booking.com","Priceline","Kayak","Agoda"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-marriott', 'Marriott International', 'MAR', '0001048286', '["marriott.com"]', 'Hotels & Resorts', 'Consumer Discretionary', '["hotels","hospitality","loyalty program","franchise"]', '["Bonvoy"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-hilton', 'Hilton Worldwide', 'HLT', '0001585689', '["hilton.com"]', 'Hotels & Resorts', 'Consumer Discretionary', '["hotels","hospitality","loyalty program","franchise"]', '["Hilton Honors"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-tjx-companies', 'TJX Companies', 'TJX', '0000109198', '["tjx.com"]', 'Apparel Retail', 'Consumer Discretionary', '["off-price retail","apparel","home goods"]', '["TJ Maxx","Marshalls","HomeGoods"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-chipotle', 'Chipotle Mexican Grill', 'CMG', '0001058090', '["chipotle.com"]', 'Restaurants', 'Consumer Discretionary', '["fast casual","restaurants","digital ordering"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-ross-stores', 'Ross Stores', 'ROST', '0000745732', '["rossstores.com"]', 'Apparel Retail', 'Consumer Discretionary', '["off-price retail","apparel","home decor"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-ebay', 'eBay', 'EBAY', '0001065088', '["ebay.com"]', 'Internet Retail', 'Consumer Discretionary', '["online marketplace","auctions","e-commerce"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-autozone', 'AutoZone', 'AZO', '0000866787', '["autozone.com"]', 'Auto Parts Retail', 'Consumer Discretionary', '["auto parts","automotive retail","DIY"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-oreilly-automotive', 'O''Reilly Automotive', 'ORLY', '0000898173', '["oreillyauto.com"]', 'Auto Parts Retail', 'Consumer Discretionary', '["auto parts","professional installers","automotive retail"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-best-buy', 'Best Buy', 'BBY', '0000764478', '["bestbuy.com"]', 'Electronics Retail', 'Consumer Discretionary', '["consumer electronics","appliances","tech services"]', '["Geek Squad"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-dollar-general', 'Dollar General', 'DG', '0000034067', '["dollargeneral.com"]', 'Discount Stores', 'Consumer Discretionary', '["discount retail","rural retail","consumables"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-yum-brands', 'Yum! Brands', 'YUM', '0001041061', '["yum.com"]', 'Restaurants', 'Consumer Discretionary', '["fast food","franchise","QSR"]', '["KFC","Taco Bell","Pizza Hut"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-royal-caribbean', 'Royal Caribbean Group', 'RCL', '0000884887', '["royalcaribbean.com"]', 'Cruise Lines', 'Consumer Discretionary', '["cruises","hospitality","leisure travel"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-las-vegas-sands', 'Las Vegas Sands', 'LVS', '0001300514', '["sands.com"]', 'Casinos & Gaming', 'Consumer Discretionary', '["casinos","gaming","hospitality","entertainment"]', NULL);

-- =========================================================================
-- INDUSTRIALS — Aerospace, Defense, Machinery, Transportation, Logistics
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-boeing', 'Boeing', 'BA', '0000012927', '["boeing.com"]', 'Aerospace & Defense', 'Industrials', '["aircraft","defense","space","services"]', '["737","787","AH-64 Apache"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-lockheed-martin', 'Lockheed Martin', 'LMT', '0000936468', '["lockheedmartin.com"]', 'Aerospace & Defense', 'Industrials', '["defense","aerospace","missiles","space systems"]', '["F-35","Black Hawk","THAAD"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-rtx', 'RTX Corporation', 'RTX', '0000101829', '["rtx.com","raytheon.com","prattwhitney.com"]', 'Aerospace & Defense', 'Industrials', '["defense","aerospace","engines","missiles","avionics"]', '["Patriot","Pratt & Whitney","Collins Aerospace"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-general-dynamics', 'General Dynamics', 'GD', '0000040533', '["gd.com"]', 'Aerospace & Defense', 'Industrials', '["defense","aerospace","marine systems","IT"]', '["Gulfstream","Abrams"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-caterpillar', 'Caterpillar', 'CAT', '0000018230', '["caterpillar.com","cat.com"]', 'Construction Machinery', 'Industrials', '["construction equipment","mining","engines","power generation"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-deere', 'Deere & Company', 'DE', '0000315189', '["deere.com","johndeere.com"]', 'Farm Machinery', 'Industrials', '["agriculture","construction","forestry","precision ag"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-honeywell', 'Honeywell International', 'HON', '0000773840', '["honeywell.com"]', 'Industrial Conglomerate', 'Industrials', '["aerospace","building technologies","performance materials","safety"]', '["Forge"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-3m', '3M', 'MMM', '0000066740', '["3m.com"]', 'Industrial Conglomerate', 'Industrials', '["industrial products","safety","electronics","health care"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-ge-aerospace', 'GE Aerospace', 'GE', '0000040554', '["geaerospace.com","ge.com"]', 'Aerospace & Defense', 'Industrials', '["jet engines","avionics","defense systems","services"]', '["LEAP","GE9X"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-ups', 'United Parcel Service', 'UPS', '0001090727', '["ups.com"]', 'Air Freight & Logistics', 'Industrials', '["package delivery","freight","logistics","supply chain"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-fedex', 'FedEx', 'FDX', '0001048911', '["fedex.com"]', 'Air Freight & Logistics', 'Industrials', '["express shipping","freight","logistics","e-commerce"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-union-pacific', 'Union Pacific', 'UNP', '0000100885', '["up.com"]', 'Railroads', 'Industrials', '["railroad","freight transport","intermodal","bulk commodities"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-csx', 'CSX', 'CSX', '0000277948', '["csx.com"]', 'Railroads', 'Industrials', '["railroad","freight transport","intermodal"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-norfolk-southern', 'Norfolk Southern', 'NSC', '0000073309', '["nscorp.com"]', 'Railroads', 'Industrials', '["railroad","freight transport","intermodal"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-northrop-grumman', 'Northrop Grumman', 'NOC', '0001133421', '["northropgrumman.com"]', 'Aerospace & Defense', 'Industrials', '["defense","aerospace","unmanned systems","space"]', '["B-21 Raider","James Webb Space Telescope"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-l3harris', 'L3Harris Technologies', 'LHX', '0000202058', '["l3harris.com"]', 'Aerospace & Defense', 'Industrials', '["defense electronics","communication systems","space","ISR"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-waste-management', 'Waste Management', 'WM', '0000823768', '["wm.com"]', 'Waste Management', 'Industrials', '["waste collection","recycling","landfill","sustainability"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-eaton', 'Eaton', 'ETN', '0000031462', '["eaton.com"]', 'Electrical Equipment', 'Industrials', '["electrical systems","power management","industrial automation"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-emerson-electric', 'Emerson Electric', 'EMR', '0000032604', '["emerson.com"]', 'Industrial Automation', 'Industrials', '["process automation","industrial IoT","measurement","control systems"]', '["DeltaV","Plantweb"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-illinois-tool-works', 'Illinois Tool Works', 'ITW', '0000049826', '["itw.com"]', 'Industrial Machinery', 'Industrials', '["welding","automotive OEM","food equipment","test & measurement"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-parker-hannifin', 'Parker-Hannifin', 'PH', '0000076334', '["parker.com"]', 'Industrial Machinery', 'Industrials', '["hydraulics","pneumatics","filtration","motion control"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-ge-vernova', 'GE Vernova', 'GEV', '0001974640', '["gevernova.com"]', 'Electrical Equipment', 'Industrials', '["wind turbines","gas turbines","grid solutions","electrification"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-transdigm', 'TransDigm Group', 'TDG', '0001260221', '["transdigm.com"]', 'Aerospace & Defense', 'Industrials', '["aerospace components","aftermarket","defense"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-carrier-global', 'Carrier Global', 'CARR', '0001783180', '["carrier.com"]', 'HVAC & Building Systems', 'Industrials', '["HVAC","refrigeration","fire safety","building automation"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-republic-services', 'Republic Services', 'RSG', '0001060391', '["republicservices.com"]', 'Waste Management', 'Industrials', '["waste collection","recycling","landfill","environmental services"]', NULL);

-- =========================================================================
-- CONSUMER STAPLES — Grocery, Packaged Foods, Beverages, Household
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-walmart', 'Walmart', 'WMT', '0000104169', '["walmart.com"]', 'Retail', 'Consumer Staples', '["retail","supply chain","e-commerce","grocery"]', '["Walmart+","Sam''s Club"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-costco', 'Costco Wholesale', 'COST', '0000909832', '["costco.com"]', 'Warehouse Clubs', 'Consumer Staples', '["warehouse club","bulk retail","grocery","membership"]', '["Kirkland Signature"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-procter-gamble', 'Procter & Gamble', 'PG', '0000080424', '["pg.com"]', 'Household Products', 'Consumer Staples', '["consumer goods","household products","personal care","grooming"]', '["Tide","Pampers","Gillette","Oral-B"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-coca-cola', 'Coca-Cola', 'KO', '0000021344', '["coca-colacompany.com","coca-cola.com"]', 'Beverages', 'Consumer Staples', '["beverages","soft drinks","bottling","distribution"]', '["Coca-Cola","Sprite","Dasani","Minute Maid"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-pepsico', 'PepsiCo', 'PEP', '0000077476', '["pepsico.com"]', 'Beverages', 'Consumer Staples', '["beverages","snacks","food","distribution"]', '["Pepsi","Frito-Lay","Gatorade","Quaker"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-mondelez', 'Mondelez International', 'MDLZ', '0001103982', '["mondelezinternational.com"]', 'Packaged Foods', 'Consumer Staples', '["snacks","chocolate","biscuits","confectionery"]', '["Oreo","Cadbury","Ritz"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-colgate-palmolive', 'Colgate-Palmolive', 'CL', '0000021665', '["colgatepalmolive.com"]', 'Household Products', 'Consumer Staples', '["oral care","personal care","home care","pet nutrition"]', '["Colgate","Palmolive","Hill''s"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-kroger', 'Kroger', 'KR', '0000056873', '["kroger.com"]', 'Grocery Retail', 'Consumer Staples', '["grocery","pharmacy","fuel","private label"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-walgreens', 'Walgreens Boots Alliance', 'WBA', '0001618921', '["walgreens.com"]', 'Pharmacy Retail', 'Consumer Staples', '["pharmacy","retail","healthcare services"]', '["Walgreens","Boots"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-general-mills', 'General Mills', 'GIS', '0000040704', '["generalmills.com"]', 'Packaged Foods', 'Consumer Staples', '["cereal","snacks","baking","pet food"]', '["Cheerios","Häagen-Dazs","Blue Buffalo"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-kraft-heinz', 'Kraft Heinz', 'KHC', '0001637459', '["kraftheinzcompany.com"]', 'Packaged Foods', 'Consumer Staples', '["condiments","packaged food","beverages","cheese"]', '["Heinz","Kraft","Oscar Mayer","Philadelphia"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-sysco', 'Sysco', 'SYY', '0000823313', '["sysco.com"]', 'Food Distribution', 'Consumer Staples', '["food distribution","foodservice","restaurants","hospitality"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-philip-morris', 'Philip Morris International', 'PM', '0001413329', '["pmi.com"]', 'Tobacco', 'Consumer Staples', '["tobacco","reduced risk products","heated tobacco"]', '["IQOS","Marlboro"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-altria', 'Altria Group', 'MO', '0000764180', '["altria.com"]', 'Tobacco', 'Consumer Staples', '["tobacco","oral nicotine","wine"]', '["Marlboro","NJOY"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-archer-daniels-midland', 'Archer-Daniels-Midland', 'ADM', '0000007084', '["adm.com"]', 'Agricultural Products', 'Consumer Staples', '["agricultural processing","nutrition","animal feed","biofuels"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-estee-lauder', 'Estee Lauder', 'EL', '0001001250', '["elcompanies.com"]', 'Personal Products', 'Consumer Staples', '["cosmetics","skincare","fragrance","luxury beauty"]', '["Clinique","MAC","La Mer"]');

-- =========================================================================
-- COMMUNICATION SERVICES — Telecom, Media, Entertainment
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-att', 'AT&T', 'T', '0000732717', '["att.com"]', 'Telecom Services', 'Communication Services', '["wireless","broadband","fiber","5G"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-verizon', 'Verizon Communications', 'VZ', '0000732712', '["verizon.com"]', 'Telecom Services', 'Communication Services', '["wireless","broadband","5G","fiber"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-t-mobile', 'T-Mobile US', 'TMUS', '0001283699', '["t-mobile.com"]', 'Telecom Services', 'Communication Services', '["wireless","5G","broadband","mobile"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-comcast', 'Comcast', 'CMCSA', '0001166691', '["comcast.com","xfinity.com","nbcuniversal.com"]', 'Cable & Satellite', 'Communication Services', '["cable","broadband","media","entertainment","streaming"]', '["Xfinity","NBCUniversal","Peacock"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-charter-communications', 'Charter Communications', 'CHTR', '0001091667', '["charter.com","spectrum.com"]', 'Cable & Satellite', 'Communication Services', '["cable","broadband","video","mobile"]', '["Spectrum"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-walt-disney', 'Walt Disney', 'DIS', '0001744489', '["disney.com","disneyplus.com"]', 'Entertainment', 'Communication Services', '["entertainment","streaming","theme parks","media"]', '["Disney+","ESPN","Hulu","Marvel","Lucasfilm"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-netflix', 'Netflix', 'NFLX', '0001065280', '["netflix.com"]', 'Entertainment', 'Communication Services', '["streaming","content production","entertainment","subscription"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-warner-bros-discovery', 'Warner Bros. Discovery', 'WBD', '0001437107', '["wbd.com"]', 'Entertainment', 'Communication Services', '["entertainment","streaming","news","sports"]', '["Max","CNN","HBO","Discovery+"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-electronic-arts', 'Electronic Arts', 'EA', '0000712515', '["ea.com"]', 'Interactive Media & Gaming', 'Communication Services', '["video games","sports games","mobile gaming"]', '["FIFA","Madden","Apex Legends","The Sims"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-live-nation', 'Live Nation Entertainment', 'LYV', '0001335258', '["livenationentertainment.com"]', 'Entertainment', 'Communication Services', '["live events","concerts","ticketing","venues"]', '["Ticketmaster"]');

-- =========================================================================
-- UTILITIES — Electric, Multi-Utility
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-nextera-energy', 'NextEra Energy', 'NEE', '0000753308', '["nexteraenergy.com"]', 'Electric Utilities', 'Utilities', '["renewable energy","wind","solar","electric utility"]', '["FPL","NextEra Energy Resources"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-duke-energy', 'Duke Energy', 'DUK', '0001326160', '["duke-energy.com"]', 'Electric Utilities', 'Utilities', '["electric utility","natural gas","nuclear","grid modernization"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-southern-company', 'Southern Company', 'SO', '0000092122', '["southerncompany.com"]', 'Electric Utilities', 'Utilities', '["electric utility","natural gas","nuclear","transmission"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-dominion-energy', 'Dominion Energy', 'D', '0000715957', '["dominionenergy.com"]', 'Electric Utilities', 'Utilities', '["electric utility","natural gas","solar","offshore wind"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-american-electric-power', 'American Electric Power', 'AEP', '0000004904', '["aep.com"]', 'Electric Utilities', 'Utilities', '["electric utility","transmission","distribution","renewable energy"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-exelon', 'Exelon', 'EXC', '0001109357', '["exeloncorp.com"]', 'Electric Utilities', 'Utilities', '["electric utility","nuclear","transmission","distribution"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-sempra', 'Sempra', 'SRE', '0001032208', '["sempra.com"]', 'Multi-Utilities', 'Utilities', '["natural gas utility","electric utility","LNG","infrastructure"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-xcel-energy', 'Xcel Energy', 'XEL', '0000072903', '["xcelenergy.com"]', 'Electric Utilities', 'Utilities', '["electric utility","natural gas","wind energy","carbon-free"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-consolidated-edison', 'Consolidated Edison', 'ED', '0000023632', '["coned.com"]', 'Electric Utilities', 'Utilities', '["electric utility","gas utility","steam","New York"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-wec-energy', 'WEC Energy Group', 'WEC', '0000783325', '["wecenergygroup.com"]', 'Electric Utilities', 'Utilities', '["electric utility","natural gas","generation","distribution"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-entergy', 'Entergy', 'ETR', '0000065984', '["entergy.com"]', 'Electric Utilities', 'Utilities', '["electric utility","nuclear","natural gas","transmission"]', NULL);

-- =========================================================================
-- REAL ESTATE — REITs, Services
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-american-tower', 'American Tower', 'AMT', '0001053507', '["americantower.com"]', 'Telecom Tower REITs', 'Real Estate', '["cell towers","wireless infrastructure","edge data centers"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-prologis', 'Prologis', 'PLD', '0001045609', '["prologis.com"]', 'Industrial REITs', 'Real Estate', '["logistics real estate","warehouses","supply chain","e-commerce"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-crown-castle', 'Crown Castle', 'CCI', '0001051470', '["crowncastle.com"]', 'Telecom Tower REITs', 'Real Estate', '["cell towers","small cells","fiber","wireless infrastructure"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-equinix', 'Equinix', 'EQIX', '0001101239', '["equinix.com"]', 'Data Center REITs', 'Real Estate', '["data centers","colocation","interconnection","cloud on-ramp"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-digital-realty', 'Digital Realty Trust', 'DLR', '0001365135', '["digitalrealty.com"]', 'Data Center REITs', 'Real Estate', '["data centers","colocation","hybrid cloud"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-public-storage', 'Public Storage', 'PSA', '0000077890', '["publicstorage.com"]', 'Self-Storage REITs', 'Real Estate', '["self-storage","storage facilities"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-simon-property-group', 'Simon Property Group', 'SPG', '0001063761', '["simon.com"]', 'Retail REITs', 'Real Estate', '["shopping malls","premium outlets","retail real estate"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-welltower', 'Welltower', 'WELL', '0000766704', '["welltower.com"]', 'Health Care REITs', 'Real Estate', '["senior housing","medical office","health care real estate"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-realty-income', 'Realty Income', 'O', '0000726728', '["realtyincome.com"]', 'Net Lease REITs', 'Real Estate', '["net lease","retail real estate","monthly dividends"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-cbre-group', 'CBRE Group', 'CBRE', '0001138118', '["cbre.com"]', 'Real Estate Services', 'Real Estate', '["commercial real estate","property management","investment management"]', NULL);

-- =========================================================================
-- MATERIALS — Chemicals, Mining, Metals, Construction Materials
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-linde', 'Linde', 'LIN', '0001707925', '["linde.com"]', 'Industrial Gases', 'Materials', '["industrial gases","engineering","healthcare gases"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-air-products', 'Air Products & Chemicals', 'APD', '0000002969', '["airproducts.com"]', 'Industrial Gases', 'Materials', '["industrial gases","hydrogen","LNG equipment"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-sherwin-williams', 'Sherwin-Williams', 'SHW', '0000089800', '["sherwin-williams.com"]', 'Specialty Chemicals', 'Materials', '["paints","coatings","architectural","industrial"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-ecolab', 'Ecolab', 'ECL', '0000032604', '["ecolab.com"]', 'Specialty Chemicals', 'Materials', '["water treatment","hygiene","infection prevention","food safety"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-freeport-mcmoran', 'Freeport-McMoRan', 'FCX', '0000831259', '["fcx.com"]', 'Copper Mining', 'Materials', '["copper","gold","molybdenum","mining"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-nucor', 'Nucor', 'NUE', '0000073124', '["nucor.com"]', 'Steel', 'Materials', '["steel","steel products","recycled steel","EAF"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-newmont', 'Newmont', 'NEM', '0001164727', '["newmont.com"]', 'Gold Mining', 'Materials', '["gold mining","copper","silver","sustainability"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-dow', 'Dow', 'DOW', '0001751788', '["dow.com"]', 'Commodity Chemicals', 'Materials', '["chemicals","plastics","packaging","infrastructure"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-dupont', 'DuPont de Nemours', 'DD', '0001666700', '["dupont.com"]', 'Specialty Chemicals', 'Materials', '["specialty chemicals","electronics materials","water solutions"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-vulcan-materials', 'Vulcan Materials', 'VMC', '0000102426', '["vulcanmaterials.com"]', 'Construction Materials', 'Materials', '["aggregates","asphalt","concrete","construction materials"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-martin-marietta', 'Martin Marietta Materials', 'MLM', '0000916076', '["martinmarietta.com"]', 'Construction Materials', 'Materials', '["aggregates","cement","magnesia","construction materials"]', NULL);

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-international-paper', 'International Paper', 'IP', '0000049826', '["internationalpaper.com"]', 'Paper & Packaging', 'Materials', '["packaging","paper","corrugated boxes","fiber"]', NULL);

-- =========================================================================
-- TRANSPORTATION — Airlines
-- =========================================================================

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-delta-air-lines', 'Delta Air Lines', 'DAL', '0000027904', '["delta.com"]', 'Airlines', 'Industrials', '["airline","passenger travel","cargo","loyalty program"]', '["SkyMiles"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-united-airlines', 'United Airlines Holdings', 'UAL', '0000100517', '["united.com"]', 'Airlines', 'Industrials', '["airline","passenger travel","cargo","international routes"]', '["MileagePlus"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-american-airlines', 'American Airlines Group', 'AAL', '0000006201', '["aa.com"]', 'Airlines', 'Industrials', '["airline","passenger travel","cargo","oneworld"]', '["AAdvantage"]');

INSERT OR IGNORE INTO prospect_targets (target_id, name, ticker, cik, domains, industry, sector, keywords, products) VALUES
  ('t-southwest-airlines', 'Southwest Airlines', 'LUV', '0000092380', '["southwest.com"]', 'Airlines', 'Industrials', '["airline","low-cost carrier","domestic travel"]', '["Rapid Rewards"]');
