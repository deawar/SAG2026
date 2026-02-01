/**
 * ============================================================================
 * Database Seed Data
 * Silent Auction Gallery - Section 10: Data Migration & Validation
 * ============================================================================
 * 
 * This file contains seed data for development and testing.
 * Run with: psql -U postgres -d sag_db -f seeds.sql
 * 
 * Includes:
 * - Sample schools
 * - Sample users (teachers, students, admins)
 * - Sample auctions
 * - Sample artwork
 * - Sample bids
 * - Sample notifications
 */

-- Clear existing data (be careful in production!)
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE activity_logs CASCADE;
TRUNCATE TABLE notifications CASCADE;
TRUNCATE TABLE bid_history CASCADE;
TRUNCATE TABLE bids CASCADE;
TRUNCATE TABLE artwork CASCADE;
TRUNCATE TABLE auctions CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE schools CASCADE;
TRUNCATE TABLE payment_methods CASCADE;
TRUNCATE TABLE payment_transactions CASCADE;

-- ============================================================================
-- SCHOOLS
-- ============================================================================

INSERT INTO schools (id, name, college_board_code, city, state, zip, contact_email, admin_id, created_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Lincoln High School', 'LHS001', 'Springfield', 'IL', '62701', 'admin@lincolnhs.edu', NULL, NOW()),
  ('550e8400-e29b-41d4-a716-446655440002', 'Central Middle School', 'CMS002', 'Chicago', 'IL', '60601', 'admin@centralms.edu', NULL, NOW()),
  ('550e8400-e29b-41d4-a716-446655440003', 'Riverside Academy', 'RA003', 'Riverside', 'CA', '92501', 'admin@riversideacad.edu', NULL, NOW());

-- ============================================================================
-- USERS - SITE ADMINS
-- ============================================================================

INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role, email_verified, totp_secret, totp_enabled, account_status, created_at, last_login)
VALUES
  ('550e8400-e29b-41d4-a716-446655550001', NULL, 'siteadmin@sag.live', '$2b$12$N9qo8uLOickgx2ZMRZoMye', 'Site', 'Admin', 'SITE_ADMIN', true, NULL, false, 'ACTIVE', NOW(), NOW());

-- Update school admin_id
UPDATE schools SET admin_id = '550e8400-e29b-41d4-a716-446655550001' WHERE id = '550e8400-e29b-41d4-a716-446655440001';

-- ============================================================================
-- USERS - SCHOOL ADMINS
-- ============================================================================

INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role, email_verified, totp_secret, totp_enabled, account_status, created_at, last_login)
VALUES
  ('550e8400-e29b-41d4-a716-446655550101', '550e8400-e29b-41d4-a716-446655440001', 'admin@lincolnhs.edu', '$2b$12$N9qo8uLOickgx2ZMRZoMye', 'John', 'Principal', 'SCHOOL_ADMIN', true, NULL, false, 'ACTIVE', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550102', '550e8400-e29b-41d4-a716-446655440002', 'admin@centralms.edu', '$2b$12$N9qo8uLOickgx2ZMRZoMye', 'Sarah', 'Director', 'SCHOOL_ADMIN', true, NULL, false, 'ACTIVE', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550103', '550e8400-e29b-41d4-a716-446655440003', 'admin@riversideacad.edu', '$2b$12$N9qo8uLOickgx2ZMRZoMye', 'Michael', 'Headmaster', 'SCHOOL_ADMIN', true, NULL, false, 'ACTIVE', NOW(), NOW());

-- ============================================================================
-- USERS - TEACHERS
-- ============================================================================

INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role, email_verified, totp_secret, totp_enabled, account_status, created_at, last_login)
VALUES
  ('550e8400-e29b-41d4-a716-446655550201', '550e8400-e29b-41d4-a716-446655440001', 'teacher1@lincolnhs.edu', '$2b$12$N9qo8uLOickgx2ZMRZoMye', 'Emily', 'Johnson', 'TEACHER', true, NULL, false, 'ACTIVE', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550202', '550e8400-e29b-41d4-a716-446655440001', 'teacher2@lincolnhs.edu', '$2b$12$N9qo8uLOickgx2ZMRZoMye', 'David', 'Smith', 'TEACHER', true, NULL, false, 'ACTIVE', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550203', '550e8400-e29b-41d4-a716-446655440002', 'teacher3@centralms.edu', '$2b$12$N9qo8uLOickgx2ZMRZoMye', 'Lisa', 'Williams', 'TEACHER', true, NULL, false, 'ACTIVE', NOW(), NOW());

-- ============================================================================
-- USERS - STUDENTS
-- ============================================================================

INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role, email_verified, totp_secret, totp_enabled, date_of_birth, account_status, created_at, last_login)
VALUES
  ('550e8400-e29b-41d4-a716-446655550301', '550e8400-e29b-41d4-a716-446655440001', 'student1@lincolnhs.edu', '$2b$12$N9qo8uLOickgx2ZMRZoMye', 'Alex', 'Brown', 'STUDENT', true, NULL, false, '2007-05-15', 'ACTIVE', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550302', '550e8400-e29b-41d4-a716-446655440001', 'student2@lincolnhs.edu', '$2b$12$N9qo8uLOickgx2ZMRZoMye', 'Jordan', 'Davis', 'STUDENT', true, NULL, false, '2006-08-22', 'ACTIVE', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550303', '550e8400-e29b-41d4-a716-446655440001', 'student3@lincolnhs.edu', '$2b$12$N9qo8uLOickgx2ZMRZoMye', 'Taylor', 'Miller', 'STUDENT', true, NULL, false, '2007-03-10', 'ACTIVE', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655550304', '550e8400-e29b-41d4-a716-446655440002', 'student4@centralms.edu', '$2b$12$N9qo8uLOickgx2ZMRZoMye', 'Casey', 'Wilson', 'STUDENT', true, NULL, false, '2010-11-05', 'ACTIVE', NOW(), NOW());

-- ============================================================================
-- ARTWORK
-- ============================================================================

INSERT INTO artwork (id, school_id, artist_name, artist_id, title, description, medium, dimensions, estimated_value, image_url, submission_status, teacher_id, created_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655660001', '550e8400-e29b-41d4-a716-446655440001', 'Emma Garcia', '550e8400-e29b-41d4-a716-446655550301', 'Sunset Over Mountains', 'A vibrant acrylic painting of sunset', 'Acrylic on Canvas', '24x36', 500.00, 'https://example.com/sunset.jpg', 'APPROVED', '550e8400-e29b-41d4-a716-446655550201', NOW()),
  ('550e8400-e29b-41d4-a716-446655660002', '550e8400-e29b-41d4-a716-446655440001', 'Marcus Lee', '550e8400-e29b-41d4-a716-446655550302', 'Urban Abstract', 'Mixed media street art inspired piece', 'Mixed Media', '30x40', 750.00, 'https://example.com/abstract.jpg', 'APPROVED', '550e8400-e29b-41d4-a716-446655550201', NOW()),
  ('550e8400-e29b-41d4-a716-446655660003', '550e8400-e29b-41d4-a716-446655440001', 'Sophie Turner', '550e8400-e29b-41d4-a716-446655550303', 'Digital Dreams', 'Digital art exploring technology and nature', 'Digital Print', '20x24', 300.00, 'https://example.com/digital.jpg', 'APPROVED', '550e8400-e29b-41d4-a716-446655550202', NOW()),
  ('550e8400-e29b-41d4-a716-446655660004', '550e8400-e29b-41d4-a716-446655440002', 'James Park', '550e8400-e29b-41d4-a716-446655550304', 'Sculpture Study', 'Bronze sculpture', 'Bronze', '12x12x18', 1200.00, 'https://example.com/sculpture.jpg', 'APPROVED', '550e8400-e29b-41d4-a716-446655550203', NOW());

-- ============================================================================
-- AUCTIONS
-- ============================================================================

INSERT INTO auctions (id, school_id, title, description, charity_name, artwork_id, status, start_time, end_time, reserve_price, current_bid, current_bidder_id, payment_gateway, platform_fee_percent, created_by, created_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655770001', '550e8400-e29b-41d4-a716-446655440001', 'Spring Art Auction 2026', 'Annual spring fundraiser', 'Local Food Bank', '550e8400-e29b-41d4-a716-446655660001', 'LIVE', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '23 hours', 400.00, 525.00, '550e8400-e29b-41d4-a716-446655550301', 'STRIPE', 4.5, '550e8400-e29b-41d4-a716-446655550201', NOW() - INTERVAL '2 hours'),
  ('550e8400-e29b-41d4-a716-446655770002', '550e8400-e29b-41d4-a716-446655440001', 'Modern Art Collection', 'Contemporary art showcase', 'Children\'s Hospital', '550e8400-e29b-41d4-a716-446655660002', 'LIVE', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '22 hours', 600.00, 850.00, '550e8400-e29b-41d4-a716-446655550302', 'SQUARE', 4.5, '550e8400-e29b-41d4-a716-446655550201', NOW() - INTERVAL '3 hours'),
  ('550e8400-e29b-41d4-a716-446655770003', '550e8400-e29b-41d4-a716-446655440001', 'Digital Art Show', 'Digital and print auction', 'Youth Mentorship Program', '550e8400-e29b-41d4-a716-446655660003', 'DRAFT', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 250.00, NULL, NULL, 'STRIPE', 4.5, '550e8400-e29b-41d4-a716-446655550202', NOW()),
  ('550e8400-e29b-41d4-a716-446655770004', '550e8400-e29b-41d4-a716-446655440002', 'Sculpture Showcase', 'Bronze and stone works', 'Arts Education Fund', '550e8400-e29b-41d4-a716-446655660004', 'CLOSED', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', 1000.00, 1500.00, '550e8400-e29b-41d4-a716-446655550304', 'STRIPE', 5.0, '550e8400-e29b-41d4-a716-446655550203', NOW() - INTERVAL '4 days');

-- ============================================================================
-- BIDS
-- ============================================================================

INSERT INTO bids (id, auction_id, bidder_id, bid_amount, is_auto_bid, proxy_bid_limit, created_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655880001', '550e8400-e29b-41d4-a716-446655770001', '550e8400-e29b-41d4-a716-446655550301', 525.00, false, NULL, NOW() - INTERVAL '10 minutes'),
  ('550e8400-e29b-41d4-a716-446655880002', '550e8400-e29b-41d4-a716-446655770001', '550e8400-e29b-41d4-a716-446655550302', 500.00, false, NULL, NOW() - INTERVAL '20 minutes'),
  ('550e8400-e29b-41d4-a716-446655880003', '550e8400-e29b-41d4-a716-446655770001', '550e8400-e29b-41d4-a716-446655550303', 475.00, true, 550.00, NOW() - INTERVAL '30 minutes'),
  ('550e8400-e29b-41d4-a716-446655880004', '550e8400-e29b-41d4-a716-446655770002', '550e8400-e29b-41d4-a716-446655550301', 850.00, false, NULL, NOW() - INTERVAL '5 minutes'),
  ('550e8400-e29b-41d4-a716-446655880005', '550e8400-e29b-41d4-a716-446655770002', '550e8400-e29b-41d4-a716-446655550302', 800.00, true, 900.00, NOW() - INTERVAL '15 minutes'),
  ('550e8400-e29b-41d4-a716-446655880006', '550e8400-e29b-41d4-a716-446655770004', '550e8400-e29b-41d4-a716-446655550304', 1500.00, false, NULL, NOW() - INTERVAL '1 day');

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

INSERT INTO notifications (id, user_id, type, subject, message, data, sent_at, delivery_status, created_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655990001', '550e8400-e29b-41d4-a716-446655550302', 'OUTBID', 'You''ve been outbid', 'You were outbid in auction: Spring Art Auction 2026', '{"auctionId": "550e8400-e29b-41d4-a716-446655770001"}', NOW() - INTERVAL '10 minutes', 'SENT', NOW() - INTERVAL '10 minutes'),
  ('550e8400-e29b-41d4-a716-446655990002', '550e8400-e29b-41d4-a716-446655550303', 'WINNING_BID', 'You are winning!', 'You currently have the highest bid in auction: Spring Art Auction 2026', '{"auctionId": "550e8400-e29b-41d4-a716-446655770001"}', NOW() - INTERVAL '5 minutes', 'SENT', NOW() - INTERVAL '5 minutes'),
  ('550e8400-e29b-41d4-a716-446655990003', '550e8400-e29b-41d4-a716-446655550304', 'AUCTION_CLOSED', 'Congratulations!', 'You won auction: Sculpture Showcase', '{"auctionId": "550e8400-e29b-41d4-a716-446655770004"}', NOW() - INTERVAL '1 day', 'SENT', NOW() - INTERVAL '1 day');

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify counts
SELECT 'Schools' as entity, COUNT(*) as count FROM schools UNION ALL
SELECT 'Users', COUNT(*) FROM users UNION ALL
SELECT 'Artwork', COUNT(*) FROM artwork UNION ALL
SELECT 'Auctions', COUNT(*) FROM auctions UNION ALL
SELECT 'Bids', COUNT(*) FROM bids UNION ALL
SELECT 'Notifications', COUNT(*) FROM notifications;

-- Verify schools have admins
SELECT s.name, u.email, u.role FROM schools s LEFT JOIN users u ON s.admin_id = u.id;

-- Verify auction relationships
SELECT a.title, art.title as artwork_title, COUNT(b.id) as bid_count 
FROM auctions a 
LEFT JOIN artwork art ON a.artwork_id = art.id 
LEFT JOIN bids b ON a.id = b.auction_id 
GROUP BY a.id, a.title, art.title;

-- Verify users have schools
SELECT u.email, u.role, s.name FROM users u LEFT JOIN schools s ON u.school_id = s.id WHERE u.role != 'SITE_ADMIN' ORDER BY u.role;

COMMIT;
