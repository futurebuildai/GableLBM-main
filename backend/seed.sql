-- GableLBM Comprehensive Seed Data
-- Simulates a mid-size Pacific Northwest LBM dealer: Cascade Building Supply
-- All INSERT statements use ON CONFLICT DO NOTHING for idempotency

-- ============================================================
-- PRICE LEVELS
-- ============================================================
INSERT INTO price_levels (id, name, multiplier) VALUES
    ('10000000-0000-4000-8000-000000000001', 'Retail',       1.0000),
    ('10000000-0000-4000-8000-000000000002', 'Contractor',   0.8500),
    ('10000000-0000-4000-8000-000000000003', 'Wholesale',    0.7500),
    ('10000000-0000-4000-8000-000000000004', 'Premium',      0.9000)
ON CONFLICT DO NOTHING;

-- ============================================================
-- LOCATIONS (Yard hierarchy: Zone → Aisle → Bin)
-- ============================================================
INSERT INTO locations (id, parent_id, path, type, code, description) VALUES
    -- Zones
    ('20000000-0000-4000-8000-000000000001', NULL, 'LUMBER-YARD',   'ZONE', 'LY',  'Main Lumber Yard'),
    ('20000000-0000-4000-8000-000000000002', NULL, 'SHEET-GOODS',   'ZONE', 'SG',  'Sheet Goods Bay'),
    ('20000000-0000-4000-8000-000000000003', NULL, 'HARDWARE',      'ZONE', 'HW',  'Hardware Store'),
    ('20000000-0000-4000-8000-000000000004', NULL, 'MILLWORK',      'ZONE', 'MW',  'Doors, Windows & Millwork'),
    ('20000000-0000-4000-8000-000000000005', NULL, 'RECEIVING',     'ZONE', 'RCV', 'Receiving Dock'),
    ('20000000-0000-4000-8000-000000000006', NULL, 'WILL-CALL',     'ZONE', 'WC',  'Will-Call Staging'),
    -- Lumber Yard Aisles
    ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', 'LUMBER-YARD/A', 'AISLE', 'A', 'Framing Lumber'),
    ('20000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000001', 'LUMBER-YARD/B', 'AISLE', 'B', 'Treated Lumber'),
    ('20000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000001', 'LUMBER-YARD/C', 'AISLE', 'C', 'Decking & Fencing'),
    ('20000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000001', 'LUMBER-YARD/D', 'AISLE', 'D', 'Hardwood & Specialty'),
    -- Sheet Goods Aisles
    ('20000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000002', 'SHEET-GOODS/A', 'AISLE', 'A', 'Plywood & OSB'),
    ('20000000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-000000000002', 'SHEET-GOODS/B', 'AISLE', 'B', 'Drywall & Cement Board'),
    -- Bins
    ('20000000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-000000000010', 'LUMBER-YARD/A/1', 'BIN', 'A-1',  '2x4 Framing'),
    ('20000000-0000-4000-8000-000000000031', '20000000-0000-4000-8000-000000000010', 'LUMBER-YARD/A/2', 'BIN', 'A-2',  '2x6 Framing'),
    ('20000000-0000-4000-8000-000000000032', '20000000-0000-4000-8000-000000000010', 'LUMBER-YARD/A/3', 'BIN', 'A-3',  '2x8 Framing'),
    ('20000000-0000-4000-8000-000000000033', '20000000-0000-4000-8000-000000000010', 'LUMBER-YARD/A/4', 'BIN', 'A-4',  '2x10 & 2x12'),
    ('20000000-0000-4000-8000-000000000034', '20000000-0000-4000-8000-000000000011', 'LUMBER-YARD/B/1', 'BIN', 'B-1',  'ACQ Treated 2x4'),
    ('20000000-0000-4000-8000-000000000035', '20000000-0000-4000-8000-000000000011', 'LUMBER-YARD/B/2', 'BIN', 'B-2',  'ACQ Treated 2x6'),
    ('20000000-0000-4000-8000-000000000036', '20000000-0000-4000-8000-000000000020', 'SHEET-GOODS/A/1', 'BIN', 'SGA-1', '1/2" Plywood'),
    ('20000000-0000-4000-8000-000000000037', '20000000-0000-4000-8000-000000000020', 'SHEET-GOODS/A/2', 'BIN', 'SGA-2', '3/4" Plywood'),
    ('20000000-0000-4000-8000-000000000038', '20000000-0000-4000-8000-000000000021', 'SHEET-GOODS/B/1', 'BIN', 'SGB-1', '1/2" Drywall')
ON CONFLICT DO NOTHING;

-- ============================================================
-- VENDORS
-- ============================================================
INSERT INTO vendors (id, name, contact_email, phone, address_line1, city, state, zip, payment_terms, average_lead_time_days, fill_rate) VALUES
    ('30000000-0000-4000-8000-000000000001', 'Weyerhaeuser',                'orders@weyco.com',         '253-924-2345', '220 Occidental Ave S',   'Seattle',      'WA', '98104', 'Net 30',  5.0,  97.50),
    ('30000000-0000-4000-8000-000000000002', 'Boise Cascade',               'boise-orders@bc.com',      '208-384-6161', '1111 W Jefferson St',    'Boise',        'ID', '83702', 'Net 30',  7.0,  95.00),
    ('30000000-0000-4000-8000-000000000003', 'Pacific Woodtech',            'sales@pacwoodtech.com',    '360-336-1111', '450 Industrial Way',     'Burlington',   'WA', '98233', 'Net 15',  3.0,  98.00),
    ('30000000-0000-4000-8000-000000000004', 'Georgia-Pacific Building',    'gp-lbm@gp.com',           '404-652-4000', '133 Peachtree NE',       'Atlanta',      'GA', '30303', 'Net 45', 10.0,  94.00),
    ('30000000-0000-4000-8000-000000000005', 'US LBM Holdings',             'supply@uslbm.com',         '847-770-4000', '900 N Meacham Rd',       'Schaumburg',   'IL', '60173', 'Net 30',  4.0,  96.00),
    ('30000000-0000-4000-8000-000000000006', 'Simpson Strong-Tie',          'orders@strongtie.com',     '925-560-9000', '5956 W Las Positas Blvd','Pleasanton',   'CA', '94588', 'Net 30',  8.0,  99.00),
    ('30000000-0000-4000-8000-000000000007', 'National Nail Corp',          'sales@nationalnail.com',   '616-299-9963', '2201 Patterson SE',      'Grand Rapids', 'MI', '49512', 'Net 30',  6.0,  98.50)
ON CONFLICT DO NOTHING;

-- ============================================================
-- PRODUCTS (50+ LBM SKUs)
-- ============================================================
INSERT INTO products (id, sku, description, uom_primary, vendor, upc) VALUES
    -- Framing Lumber (SPF #2 & Better)
    ('40000000-0000-4000-8000-000000000001', 'LBR-2X4-8',    '2x4x8 SPF #2 Framing',             'PCS',    'Weyerhaeuser', '012345678901'),
    ('40000000-0000-4000-8000-000000000002', 'LBR-2X4-10',   '2x4x10 SPF #2 Framing',            'PCS',    'Weyerhaeuser', '012345678902'),
    ('40000000-0000-4000-8000-000000000003', 'LBR-2X4-12',   '2x4x12 SPF #2 Framing',            'PCS',    'Weyerhaeuser', '012345678903'),
    ('40000000-0000-4000-8000-000000000004', 'LBR-2X4-16',   '2x4x16 SPF #2 Framing',            'PCS',    'Weyerhaeuser', '012345678904'),
    ('40000000-0000-4000-8000-000000000005', 'LBR-2X6-8',    '2x6x8 SPF #2 Framing',             'PCS',    'Weyerhaeuser', '012345678905'),
    ('40000000-0000-4000-8000-000000000006', 'LBR-2X6-10',   '2x6x10 SPF #2 Framing',            'PCS',    'Weyerhaeuser', '012345678906'),
    ('40000000-0000-4000-8000-000000000007', 'LBR-2X6-12',   '2x6x12 SPF #2 Framing',            'PCS',    'Weyerhaeuser', '012345678907'),
    ('40000000-0000-4000-8000-000000000008', 'LBR-2X6-16',   '2x6x16 SPF #2 Framing',            'PCS',    'Weyerhaeuser', '012345678908'),
    ('40000000-0000-4000-8000-000000000009', 'LBR-2X8-16',   '2x8x16 SPF #2 Framing',            'PCS',    'Weyerhaeuser', '012345678909'),
    ('40000000-0000-4000-8000-000000000010', 'LBR-2X10-16',  '2x10x16 SPF #2 Framing',           'PCS',    'Weyerhaeuser', '012345678910'),
    ('40000000-0000-4000-8000-000000000011', 'LBR-2X12-16',  '2x12x16 SPF #2 Framing',           'PCS',    'Weyerhaeuser', '012345678911'),
    -- Treated Lumber (ACQ Ground Contact)
    ('40000000-0000-4000-8000-000000000012', 'TRT-2X4-8',    '2x4x8 ACQ Treated #2',             'PCS',    'Pacific Woodtech', '012345678912'),
    ('40000000-0000-4000-8000-000000000013', 'TRT-2X6-8',    '2x6x8 ACQ Treated #2',             'PCS',    'Pacific Woodtech', '012345678913'),
    ('40000000-0000-4000-8000-000000000014', 'TRT-4X4-8',    '4x4x8 ACQ Treated Post',           'PCS',    'Pacific Woodtech', '012345678914'),
    ('40000000-0000-4000-8000-000000000015', 'TRT-4X4-10',   '4x4x10 ACQ Treated Post',          'PCS',    'Pacific Woodtech', '012345678915'),
    ('40000000-0000-4000-8000-000000000016', 'TRT-6X6-8',    '6x6x8 ACQ Treated Post',           'PCS',    'Pacific Woodtech', '012345678916'),
    -- Sheet Goods — Plywood
    ('40000000-0000-4000-8000-000000000020', 'PLY-1/2-4X8',  '1/2" 4x8 BC Sanded Plywood',       'PCS',    'Boise Cascade', '012345678920'),
    ('40000000-0000-4000-8000-000000000021', 'PLY-5/8-4X8',  '5/8" 4x8 BC Sanded Plywood',       'PCS',    'Boise Cascade', '012345678921'),
    ('40000000-0000-4000-8000-000000000022', 'PLY-3/4-4X8',  '3/4" 4x8 BC Sanded Plywood',       'PCS',    'Boise Cascade', '012345678922'),
    ('40000000-0000-4000-8000-000000000023', 'OSB-7/16-4X8', '7/16" 4x8 OSB Sheathing',          'PCS',    'Georgia-Pacific Building', '012345678923'),
    ('40000000-0000-4000-8000-000000000024', 'OSB-1/2-4X8',  '1/2" 4x8 OSB Sheathing',           'PCS',    'Georgia-Pacific Building', '012345678924'),
    ('40000000-0000-4000-8000-000000000025', 'OSB-5/8-4X8',  '5/8" 4x8 OSB Tongue & Groove',     'PCS',    'Georgia-Pacific Building', '012345678925'),
    -- Drywall
    ('40000000-0000-4000-8000-000000000026', 'DW-1/2-4X8',   '1/2" 4x8 Drywall Standard',        'PCS',    'Georgia-Pacific Building', '012345678926'),
    ('40000000-0000-4000-8000-000000000027', 'DW-5/8-4X8',   '5/8" 4x8 Type X Fire Drywall',     'PCS',    'Georgia-Pacific Building', '012345678927'),
    ('40000000-0000-4000-8000-000000000028', 'DW-1/2-4X12',  '1/2" 4x12 Drywall Standard',       'PCS',    'Georgia-Pacific Building', '012345678928'),
    -- Decking
    ('40000000-0000-4000-8000-000000000030', 'DCK-2X6-16TRT', '2x6x16 Premium Treated Decking',  'PCS',    'Pacific Woodtech', '012345678930'),
    ('40000000-0000-4000-8000-000000000031', 'DCK-5/4X6-16', '5/4x6x16 Treated Deck Board',      'PCS',    'Pacific Woodtech', '012345678931'),
    -- Engineered Lumber (LVL/LSL)
    ('40000000-0000-4000-8000-000000000035', 'ENG-LVL-1.75X9.5X20', '1-3/4"x9-1/2"x20'' LVL Beam', 'PCS', 'Weyerhaeuser', '012345678935'),
    ('40000000-0000-4000-8000-000000000036', 'ENG-LVL-1.75X11.875X20', '1-3/4"x11-7/8"x20'' LVL', 'PCS', 'Weyerhaeuser', '012345678936'),
    -- Concrete & Masonry
    ('40000000-0000-4000-8000-000000000040', 'CON-SACRETE-60', 'Quikrete 60lb Concrete Mix',     'BAG',    'US LBM Holdings', '012345678940'),
    ('40000000-0000-4000-8000-000000000041', 'CON-SACRETE-80', 'Quikrete 80lb Concrete Mix',     'BAG',    'US LBM Holdings', '012345678941'),
    -- Hardware — Fasteners
    ('40000000-0000-4000-8000-000000000050', 'HW-NAIL-16D-5LB', '16d Sinker Nails 5lb Box',      'BOX',    'National Nail Corp', '012345678950'),
    ('40000000-0000-4000-8000-000000000051', 'HW-NAIL-8D-5LB',  '8d Common Nails 5lb Box',       'BOX',    'National Nail Corp', '012345678951'),
    ('40000000-0000-4000-8000-000000000052', 'HW-SCREW-3IN-1LB', '#10 x 3" Deck Screws 1lb',    'BOX',    'National Nail Corp', '012345678952'),
    ('40000000-0000-4000-8000-000000000053', 'HW-SCREW-2.5IN-1LB', '#8 x 2-1/2" Wood Screws 1lb', 'BOX', 'National Nail Corp', '012345678953'),
    -- Hardware — Structural Connectors
    ('40000000-0000-4000-8000-000000000054', 'SST-LUS26',    'Simpson LUS26 2x6 Joist Hanger',   'EA',     'Simpson Strong-Tie', '012345678954'),
    ('40000000-0000-4000-8000-000000000055', 'SST-LUS28',    'Simpson LUS28 2x8 Joist Hanger',   'EA',     'Simpson Strong-Tie', '012345678955'),
    ('40000000-0000-4000-8000-000000000056', 'SST-A23',      'Simpson A23 Angle 18ga',            'EA',     'Simpson Strong-Tie', '012345678956'),
    ('40000000-0000-4000-8000-000000000057', 'SST-HPAHD-22', 'Simpson HPAHD22 Holdown',          'EA',     'Simpson Strong-Tie', '012345678957'),
    -- Insulation
    ('40000000-0000-4000-8000-000000000060', 'INS-R15-3.5-15-40', 'R-15 3.5" Kraft Batts 15"x40''', 'RL', 'Georgia-Pacific Building', '012345678960'),
    ('40000000-0000-4000-8000-000000000061', 'INS-R21-5.5-15-40', 'R-21 5.5" Kraft Batts 15"x40''', 'RL', 'Georgia-Pacific Building', '012345678961'),
    -- Roofing
    ('40000000-0000-4000-8000-000000000065', 'ROOF-SHINGLE-ARCH-BLK', 'Architectural Shingles Black 3-Tab Bundle', 'BUNDLE', 'Georgia-Pacific Building', '012345678965'),
    ('40000000-0000-4000-8000-000000000066', 'ROOF-FELT-30LB',  '30lb Roofing Felt 4sq Roll',     'RL',     'Georgia-Pacific Building', '012345678966'),
    ('40000000-0000-4000-8000-000000000067', 'ROOF-ICE-36IN',   'Ice & Water Shield 36" x 75'' Roll', 'RL', 'Georgia-Pacific Building', '012345678967'),
    -- Housewrap & Vapor
    ('40000000-0000-4000-8000-000000000070', 'WRAP-TYVEK-9X100', 'Tyvek HomeWrap 9''x100'' Roll', 'RL',   'Georgia-Pacific Building', '012345678970')
ON CONFLICT (sku) DO NOTHING;

-- Set product prices (base_price column)
UPDATE products SET base_price = 6.49   WHERE sku = 'LBR-2X4-8';
UPDATE products SET base_price = 7.99   WHERE sku = 'LBR-2X4-10';
UPDATE products SET base_price = 9.49   WHERE sku = 'LBR-2X4-12';
UPDATE products SET base_price = 12.49  WHERE sku = 'LBR-2X4-16';
UPDATE products SET base_price = 9.99   WHERE sku = 'LBR-2X6-8';
UPDATE products SET base_price = 12.49  WHERE sku = 'LBR-2X6-10';
UPDATE products SET base_price = 14.99  WHERE sku = 'LBR-2X6-12';
UPDATE products SET base_price = 19.99  WHERE sku = 'LBR-2X6-16';
UPDATE products SET base_price = 24.99  WHERE sku = 'LBR-2X8-16';
UPDATE products SET base_price = 29.99  WHERE sku = 'LBR-2X10-16';
UPDATE products SET base_price = 39.99  WHERE sku = 'LBR-2X12-16';
UPDATE products SET base_price = 11.99  WHERE sku = 'TRT-2X4-8';
UPDATE products SET base_price = 15.99  WHERE sku = 'TRT-2X6-8';
UPDATE products SET base_price = 19.99  WHERE sku = 'TRT-4X4-8';
UPDATE products SET base_price = 24.99  WHERE sku = 'TRT-4X4-10';
UPDATE products SET base_price = 44.99  WHERE sku = 'TRT-6X6-8';
UPDATE products SET base_price = 49.99  WHERE sku = 'PLY-1/2-4X8';
UPDATE products SET base_price = 54.99  WHERE sku = 'PLY-5/8-4X8';
UPDATE products SET base_price = 64.99  WHERE sku = 'PLY-3/4-4X8';
UPDATE products SET base_price = 24.99  WHERE sku = 'OSB-7/16-4X8';
UPDATE products SET base_price = 28.99  WHERE sku = 'OSB-1/2-4X8';
UPDATE products SET base_price = 34.99  WHERE sku = 'OSB-5/8-4X8';
UPDATE products SET base_price = 14.49  WHERE sku = 'DW-1/2-4X8';
UPDATE products SET base_price = 18.49  WHERE sku = 'DW-5/8-4X8';
UPDATE products SET base_price = 19.99  WHERE sku = 'DW-1/2-4X12';
UPDATE products SET base_price = 22.99  WHERE sku = 'DCK-2X6-16TRT';
UPDATE products SET base_price = 14.99  WHERE sku = 'DCK-5/4X6-16';
UPDATE products SET base_price = 189.99 WHERE sku = 'ENG-LVL-1.75X9.5X20';
UPDATE products SET base_price = 229.99 WHERE sku = 'ENG-LVL-1.75X11.875X20';
UPDATE products SET base_price = 6.99   WHERE sku = 'CON-SACRETE-60';
UPDATE products SET base_price = 8.49   WHERE sku = 'CON-SACRETE-80';
UPDATE products SET base_price = 11.99  WHERE sku = 'HW-NAIL-16D-5LB';
UPDATE products SET base_price = 9.99   WHERE sku = 'HW-NAIL-8D-5LB';
UPDATE products SET base_price = 14.99  WHERE sku = 'HW-SCREW-3IN-1LB';
UPDATE products SET base_price = 12.99  WHERE sku = 'HW-SCREW-2.5IN-1LB';
UPDATE products SET base_price = 3.49   WHERE sku = 'SST-LUS26';
UPDATE products SET base_price = 3.99   WHERE sku = 'SST-LUS28';
UPDATE products SET base_price = 2.49   WHERE sku = 'SST-A23';
UPDATE products SET base_price = 79.99  WHERE sku = 'SST-HPAHD-22';
UPDATE products SET base_price = 54.99  WHERE sku = 'INS-R15-3.5-15-40';
UPDATE products SET base_price = 64.99  WHERE sku = 'INS-R21-5.5-15-40';
UPDATE products SET base_price = 34.99  WHERE sku = 'ROOF-SHINGLE-ARCH-BLK';
UPDATE products SET base_price = 29.99  WHERE sku = 'ROOF-FELT-30LB';
UPDATE products SET base_price = 79.99  WHERE sku = 'ROOF-ICE-36IN';
UPDATE products SET base_price = 119.99 WHERE sku = 'WRAP-TYVEK-9X100';

-- ============================================================
-- CUSTOMERS (Contractors, Builders, and Retail)
-- ============================================================
INSERT INTO customers (id, name, account_number, email, phone, address, price_level_id, credit_limit, balance_due, tier, payment_terms, salesperson_id) VALUES
    ('50000000-0000-4000-8000-000000000001', 'Rainier Construction LLC',      'C-00001', 'orders@rainier-construction.com',  '503-555-1001', '4521 Pacific Hwy, Tacoma WA 98402',         '10000000-0000-4000-8000-000000000002', 75000.00,  12430.50, 'GOLD',     'Net 30', 'a1b2c3d4-0002-4000-8000-000000000002'),
    ('50000000-0000-4000-8000-000000000002', 'Summit Home Builders',          'C-00002', 'purchasing@summit-homes.com',       '503-555-1002', '889 NE Broadway, Portland OR 97232',        '10000000-0000-4000-8000-000000000002', 50000.00,   8900.00, 'GOLD',     'Net 30', 'a1b2c3d4-0001-4000-8000-000000000001'),
    ('50000000-0000-4000-8000-000000000003', 'Cascade Framing Inc.',          'C-00003', 'ops@cascadeframing.net',            '360-555-1003', '2200 Industrial Blvd, Bellingham WA 98225', '10000000-0000-4000-8000-000000000002', 40000.00,   3250.00, 'SILVER',   'Net 30', 'a1b2c3d4-0003-4000-8000-000000000003'),
    ('50000000-0000-4000-8000-000000000004', 'Evergreen Deck & Fence',        'C-00004', 'mike@evergreendeckfence.com',       '253-555-1004', '112 Oak Ave, Puyallup WA 98371',            '10000000-0000-4000-8000-000000000002', 25000.00,   1100.00, 'SILVER',   'Net 30', 'a1b2c3d4-0004-4000-8000-000000000004'),
    ('50000000-0000-4000-8000-000000000005', 'Northwest Roofing Solutions',   'C-00005', 'orders@nwroofing.com',              '206-555-1005', '3400 Airport Way S, Seattle WA 98108',      '10000000-0000-4000-8000-000000000002', 30000.00,   5600.00, 'GOLD',     'Net 30', 'a1b2c3d4-0002-4000-8000-000000000002'),
    ('50000000-0000-4000-8000-000000000006', 'Olympic Peninsula Builders',    'C-00006', 'buying@olympicbuilders.com',        '360-555-1006', '87 Marine Dr, Port Angeles WA 98362',       '10000000-0000-4000-8000-000000000003', 100000.00, 22100.00, 'PLATINUM', 'Net 45', 'a1b2c3d4-0001-4000-8000-000000000001'),
    ('50000000-0000-4000-8000-000000000007', 'Puget Sound Remodel Group',     'C-00007', 'po@psremodel.com',                 '206-555-1007', '5532 Rainier Ave S, Seattle WA 98118',      '10000000-0000-4000-8000-000000000002', 20000.00,   4450.00, 'SILVER',   'Net 30', 'a1b2c3d4-0005-4000-8000-000000000005'),
    ('50000000-0000-4000-8000-000000000008', 'Smith Residential Construction','C-00008', 'tom.smith@smithresi.com',           '253-555-1008', '901 S Meridian, Puyallup WA 98371',         '10000000-0000-4000-8000-000000000002', 15000.00,    890.00, 'SILVER',   'Net 30', 'a1b2c3d4-0005-4000-8000-000000000005'),
    ('50000000-0000-4000-8000-000000000009', 'Island County Builders',        'C-00009', 'orders@islandbuilders.net',         '360-555-1009', '124 NW Coveland St, Coupeville WA 98239',   '10000000-0000-4000-8000-000000000002', 35000.00,   6700.00, 'GOLD',     'Net 30', 'a1b2c3d4-0003-4000-8000-000000000003'),
    ('50000000-0000-4000-8000-000000000010', 'Dave Henley (DIY)',             'C-00010', 'dave.h@gmail.com',                 '253-555-1010', '412 Maple St, Auburn WA 98002',             '10000000-0000-4000-8000-000000000001',  1000.00,      0.00, 'RETAIL',   'Net 0',  'a1b2c3d4-0006-4000-8000-000000000006'),
    ('50000000-0000-4000-8000-000000000011', 'Pioneer Framing & Drywall',     'C-00011', 'orders@pioneerframe.com',           '503-555-1011', '7812 SE Powell Blvd, Portland OR 97206',    '10000000-0000-4000-8000-000000000002', 45000.00,   9980.00, 'GOLD',     'Net 30', 'a1b2c3d4-0004-4000-8000-000000000004'),
    ('50000000-0000-4000-8000-000000000012', 'Tacoma Commercial Build',       'C-00012', 'gm@tacomacommercial.com',           '253-555-1012', '2100 S Tacoma Way, Tacoma WA 98409',        '10000000-0000-4000-8000-000000000003', 200000.00, 41500.00, 'PLATINUM', 'Net 45', 'a1b2c3d4-0001-4000-8000-000000000001')
ON CONFLICT (account_number) DO NOTHING;

-- Customer Jobs
INSERT INTO customer_jobs (id, customer_id, name, is_active) VALUES
    ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Rainier - 12-Unit Auburn Complex',      true),
    ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'Rainier - Federal Way Townhomes',        true),
    ('51000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000002', 'Summit - Maple Valley Custom Home',      true),
    ('51000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000002', 'Summit - Fall City Reframe',             false),
    ('51000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000006', 'Olympic - Port Townsend Addition',       true),
    ('51000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000006', 'Olympic - Sequim New Construction',      true),
    ('51000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000012', 'Tacoma Commercial - Fife Warehouse',     true),
    ('51000000-0000-4000-8000-000000000008', '50000000-0000-4000-8000-000000000004', 'Evergreen - Sumner Deck Project',        true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- INVENTORY (realistic stock levels per location)
-- ============================================================
INSERT INTO inventory (product_id, location_id, location, quantity, allocated) VALUES
    -- Framing lumber — Bin A-1
    ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000030', 'LUMBER-YARD/A/1', 1200.0000, 350.0000),
    ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000030', 'LUMBER-YARD/A/1',  800.0000, 100.0000),
    ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000030', 'LUMBER-YARD/A/1',  600.0000, 150.0000),
    ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000030', 'LUMBER-YARD/A/1',  400.0000,  80.0000),
    -- 2x6 — Bin A-2
    ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000031', 'LUMBER-YARD/A/2',  900.0000, 200.0000),
    ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000031', 'LUMBER-YARD/A/2',  500.0000, 100.0000),
    ('40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000031', 'LUMBER-YARD/A/2',  400.0000,  75.0000),
    ('40000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000031', 'LUMBER-YARD/A/2',  350.0000,  50.0000),
    -- 2x8, 2x10, 2x12 — Bin A-3/A-4
    ('40000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000032', 'LUMBER-YARD/A/3',  200.0000,  30.0000),
    ('40000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000033', 'LUMBER-YARD/A/4',  150.0000,  20.0000),
    ('40000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000033', 'LUMBER-YARD/A/4',  100.0000,  10.0000),
    -- Treated — Bin B-1, B-2
    ('40000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000034', 'LUMBER-YARD/B/1',  600.0000,  80.0000),
    ('40000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000034', 'LUMBER-YARD/B/1',  400.0000,  60.0000),
    ('40000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000035', 'LUMBER-YARD/B/2',  300.0000,  40.0000),
    ('40000000-0000-4000-8000-000000000015', '20000000-0000-4000-8000-000000000035', 'LUMBER-YARD/B/2',  200.0000,  20.0000),
    ('40000000-0000-4000-8000-000000000016', '20000000-0000-4000-8000-000000000035', 'LUMBER-YARD/B/2',   80.0000,   5.0000),
    -- Sheet goods — SGA-1, SGA-2
    ('40000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000036', 'SHEET-GOODS/A/1',  350.0000, 100.0000),
    ('40000000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-000000000036', 'SHEET-GOODS/A/1',  200.0000,  50.0000),
    ('40000000-0000-4000-8000-000000000022', '20000000-0000-4000-8000-000000000037', 'SHEET-GOODS/A/2',  180.0000,  40.0000),
    ('40000000-0000-4000-8000-000000000023', '20000000-0000-4000-8000-000000000036', 'SHEET-GOODS/A/1',  500.0000, 120.0000),
    ('40000000-0000-4000-8000-000000000024', '20000000-0000-4000-8000-000000000036', 'SHEET-GOODS/A/1',  400.0000, 100.0000),
    ('40000000-0000-4000-8000-000000000025', '20000000-0000-4000-8000-000000000036', 'SHEET-GOODS/A/1',  250.0000,  60.0000),
    -- Drywall — SGB-1
    ('40000000-0000-4000-8000-000000000026', '20000000-0000-4000-8000-000000000038', 'SHEET-GOODS/B/1',  600.0000, 200.0000),
    ('40000000-0000-4000-8000-000000000027', '20000000-0000-4000-8000-000000000038', 'SHEET-GOODS/B/1',  300.0000,  75.0000),
    ('40000000-0000-4000-8000-000000000028', '20000000-0000-4000-8000-000000000038', 'SHEET-GOODS/B/1',  250.0000,  50.0000),
    -- Decking
    ('40000000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-000000000032', 'LUMBER-YARD/A/3',  300.0000,  40.0000),
    ('40000000-0000-4000-8000-000000000031', '20000000-0000-4000-8000-000000000032', 'LUMBER-YARD/A/3',  400.0000,  60.0000),
    -- Engineered
    ('40000000-0000-4000-8000-000000000035', '20000000-0000-4000-8000-000000000033', 'LUMBER-YARD/A/4',   40.0000,  10.0000),
    ('40000000-0000-4000-8000-000000000036', '20000000-0000-4000-8000-000000000033', 'LUMBER-YARD/A/4',   25.0000,   5.0000),
    -- Concrete (Hardware zone)
    ('40000000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         200.0000,  30.0000),
    ('40000000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         180.0000,  20.0000),
    -- Hardware fasteners
    ('40000000-0000-4000-8000-000000000050', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         500.0000,  50.0000),
    ('40000000-0000-4000-8000-000000000051', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         600.0000,  80.0000),
    ('40000000-0000-4000-8000-000000000052', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         400.0000,  60.0000),
    ('40000000-0000-4000-8000-000000000053', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         350.0000,  40.0000),
    -- Simpson connectors
    ('40000000-0000-4000-8000-000000000054', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         800.0000, 100.0000),
    ('40000000-0000-4000-8000-000000000055', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         600.0000,  80.0000),
    ('40000000-0000-4000-8000-000000000056', '20000000-0000-4000-8000-000000000003', 'HARDWARE',        1200.0000, 200.0000),
    ('40000000-0000-4000-8000-000000000057', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         100.0000,  10.0000),
    -- Insulation
    ('40000000-0000-4000-8000-000000000060', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         150.0000,  30.0000),
    ('40000000-0000-4000-8000-000000000061', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         120.0000,  20.0000),
    -- Roofing
    ('40000000-0000-4000-8000-000000000065', '20000000-0000-4000-8000-000000000003', 'HARDWARE',         200.0000,  40.0000),
    ('40000000-0000-4000-8000-000000000066', '20000000-0000-4000-8000-000000000003', 'HARDWARE',          80.0000,  10.0000),
    ('40000000-0000-4000-8000-000000000067', '20000000-0000-4000-8000-000000000003', 'HARDWARE',          60.0000,   5.0000),
    -- Housewrap
    ('40000000-0000-4000-8000-000000000070', '20000000-0000-4000-8000-000000000003', 'HARDWARE',          40.0000,   5.0000)
ON CONFLICT DO NOTHING;

-- ============================================================
-- DELIVERY FLEET
-- ============================================================
INSERT INTO vehicles (id, name, vehicle_type, license_plate, capacity_weight_lbs) VALUES
    ('60000000-0000-4000-8000-000000000001', 'Flatbed 1',  'Flatbed',   'WA-LBM-001', 40000),
    ('60000000-0000-4000-8000-000000000002', 'Flatbed 2',  'Flatbed',   'WA-LBM-002', 40000),
    ('60000000-0000-4000-8000-000000000003', 'Box Truck 1','Box Truck', 'WA-LBM-003', 15000),
    ('60000000-0000-4000-8000-000000000004', 'Boom Truck', 'Boom',      'WA-LBM-004', 35000),
    ('60000000-0000-4000-8000-000000000005', 'Pickup 1',   'Pickup',    'WA-LBM-005',  3000)
ON CONFLICT DO NOTHING;

INSERT INTO drivers (id, name, license_number, status, phone_number) VALUES
    ('61000000-0000-4000-8000-000000000001', 'Carlos Mendez',   'WA-CDL-10001', 'ACTIVE', '253-555-9001'),
    ('61000000-0000-4000-8000-000000000002', 'Tony Vasquez',    'WA-CDL-10002', 'ACTIVE', '253-555-9002'),
    ('61000000-0000-4000-8000-000000000003', 'James Kim',       'WA-CDL-10003', 'ACTIVE', '253-555-9003'),
    ('61000000-0000-4000-8000-000000000004', 'Maria Solano',    'WA-CDL-10004', 'ACTIVE', '253-555-9004'),
    ('61000000-0000-4000-8000-000000000005', 'Derek Whitmore',  'WA-CDL-10005', 'ON_LEAVE', '253-555-9005')
ON CONFLICT DO NOTHING;

-- ============================================================
-- GL FISCAL PERIODS (current + recent)
-- ============================================================
INSERT INTO gl_fiscal_periods (id, name, start_date, end_date, status) VALUES
    ('70000000-0000-4000-8000-000000000001', 'Jan 2026', '2026-01-01', '2026-01-31', 'CLOSED'),
    ('70000000-0000-4000-8000-000000000002', 'Feb 2026', '2026-02-01', '2026-02-28', 'CLOSED'),
    ('70000000-0000-4000-8000-000000000003', 'Mar 2026', '2026-03-01', '2026-03-31', 'CLOSED'),
    ('70000000-0000-4000-8000-000000000004', 'Apr 2026', '2026-04-01', '2026-04-30', 'CLOSED'),
    ('70000000-0000-4000-8000-000000000005', 'May 2026', '2026-05-01', '2026-05-31', 'OPEN'),
    ('70000000-0000-4000-8000-000000000006', 'Jun 2026', '2026-06-01', '2026-06-30', 'OPEN')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SAMPLE ORDERS (3 confirmed with lines)
-- ============================================================
INSERT INTO orders (id, customer_id, status, total_amount, salesperson_id) VALUES
    ('80000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'CONFIRMED',  4895.20, 'a1b2c3d4-0002-4000-8000-000000000002'),
    ('80000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000006', 'CONFIRMED', 18420.75, 'a1b2c3d4-0001-4000-8000-000000000001'),
    ('80000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000012', 'FULFILLED', 31200.00, 'a1b2c3d4-0001-4000-8000-000000000001'),
    ('80000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000003', 'DRAFT',      1250.00, 'a1b2c3d4-0003-4000-8000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO order_lines (id, order_id, product_id, quantity, price_each) VALUES
    -- Order 1: Rainier - framing package
    ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 200.0000, 6.49),
    ('81000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 100.0000, 9.49),
    ('81000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000023', 100.0000, 24.99),
    -- Order 2: Olympic - large framing job
    ('81000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 500.0000, 5.52),
    ('81000000-0000-4000-8000-000000000005', '80000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000005', 300.0000, 8.49),
    ('81000000-0000-4000-8000-000000000006', '80000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000022', 150.0000, 48.74),
    -- Order 3: Tacoma Commercial - warehouse build
    ('81000000-0000-4000-8000-000000000007', '80000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000004', 600.0000, 12.49),
    ('81000000-0000-4000-8000-000000000008', '80000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000024', 400.0000, 28.99)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SAMPLE INVOICES
-- ============================================================
INSERT INTO invoices (id, order_id, customer_id, status, total_amount, subtotal, tax_rate, tax_amount, due_date, payment_terms) VALUES
    ('90000000-0000-4000-8000-000000000001',
     '80000000-0000-4000-8000-000000000001',
     '50000000-0000-4000-8000-000000000001',
     'UNPAID', 5179.18, 4895.20, 0.0880, 430.98,
     NOW() + INTERVAL '30 days', 'Net 30'),
    ('90000000-0000-4000-8000-000000000002',
     '80000000-0000-4000-8000-000000000003',
     '50000000-0000-4000-8000-000000000012',
     'PAID',  32985.60, 31200.00, 0.0880, 2745.60,
     NOW() - INTERVAL '15 days', 'Net 45')
ON CONFLICT DO NOTHING;

INSERT INTO invoice_lines (id, invoice_id, product_id, quantity, price_each) VALUES
    ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 200.0000, 6.49),
    ('91000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 100.0000, 9.49),
    ('91000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000023', 100.0000, 24.99),
    ('91000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000004', 600.0000, 12.49),
    ('91000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000024', 400.0000, 28.99)
ON CONFLICT DO NOTHING;

-- Payment on the paid invoice
INSERT INTO payments (id, invoice_id, amount, method, reference, notes) VALUES
    ('92000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', 32985.60, 'CHECK', 'CHK-4421', 'Tacoma Commercial - Fife warehouse full payment')
ON CONFLICT DO NOTHING;

-- ============================================================
-- DELIVERY ROUTE SAMPLE
-- ============================================================
INSERT INTO delivery_routes (id, vehicle_id, driver_id, scheduled_date, status, notes) VALUES
    ('A0000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', CURRENT_DATE + 1, 'SCHEDULED', '5-stop run, south Puget Sound'),
    ('A0000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', CURRENT_DATE + 1, 'SCHEDULED', '3-stop north King County')
ON CONFLICT DO NOTHING;

INSERT INTO deliveries (id, route_id, order_id, stop_sequence, status, delivery_instructions) VALUES
    ('A1000000-0000-4000-8000-000000000001', 'A0000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 1, 'PENDING', 'Deliver to staging area behind building B. Call Mike on arrival: 253-555-1001'),
    ('A1000000-0000-4000-8000-000000000002', 'A0000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', 1, 'PENDING', 'Job site on Port Angeles waterfront. Gate code: 4821')
ON CONFLICT DO NOTHING;

-- ============================================================
-- PRICING RULES
-- ============================================================
INSERT INTO pricing_rules (id, name, rule_type, customer_id, discount_pct, min_quantity, is_active, priority) VALUES
    ('B0000000-0000-4000-8000-000000000001',
     'Olympic Peninsula Platinum Volume Discount',
     'QUANTITY_BREAK',
     '50000000-0000-4000-8000-000000000006',
     0.0500, 500.0000, true, 10),
    ('B0000000-0000-4000-8000-000000000002',
     'Tacoma Commercial Platinum Discount',
     'QUANTITY_BREAK',
     '50000000-0000-4000-8000-000000000012',
     0.0750, 1000.0000, true, 10)
ON CONFLICT DO NOTHING;

-- ============================================================
-- DONE
-- ============================================================
-- Summary: Cascade Building Supply seed data
--   Price levels:  4
--   Locations:    19
--   Vendors:       7
--   Products:     40+  (with unit prices)
--   Customers:    12   (with jobs, credit limits, salespeople)
--   Inventory:    45+  rows across locations
--   Fleet:         5 vehicles, 5 drivers
--   GL periods:    6 fiscal periods
--   Orders:        4 (with lines)
--   Invoices:      2 (with lines and payment)
--   Delivery routes: 2 (scheduled for tomorrow)
--   Pricing rules: 2 (platinum customer discounts)
