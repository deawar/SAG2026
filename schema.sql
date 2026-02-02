-- ============================================================================
-- Section 1.1: Database Schema - Silent Auction Gallery
-- Production-grade PostgreSQL schema with GDPR, COPPA, FERPA compliance
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================================
-- 1. Core Entity Tables (ordered by dependencies)
-- ============================================================================

-- Schools Table (created first - no dependencies)
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  district VARCHAR(255),
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state_province VARCHAR(50) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  country VARCHAR(2) DEFAULT 'US',
  phone_number VARCHAR(20),
  website_url VARCHAR(2083),
  primary_contact_user_id UUID,
  account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION')),
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT school_name_check CHECK (length(trim(name)) > 0),
  CONSTRAINT school_phone_check CHECK (phone_number ~ '^\+?[1-9]\d{1,14}$' OR phone_number IS NULL)
);

CREATE INDEX idx_schools_name ON schools(name);
CREATE INDEX idx_schools_status ON schools(account_status);

-- Users Table (references schools via school_id)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email CITEXT UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20),
  date_of_birth DATE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('SITE_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'BIDDER')),
  school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'LOCKED', 'INACTIVE')),
  two_fa_enabled BOOLEAN DEFAULT FALSE,
  two_fa_secret VARCHAR(32),
  backup_codes TEXT[], -- JSON array of encrypted backup codes
  last_login TIMESTAMP WITH TIME ZONE,
  failed_login_attempts INT DEFAULT 0,
  account_locked_until TIMESTAMP WITH TIME ZONE,
  password_changed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT user_email_check CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_school_id ON users(school_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_account_status ON users(account_status);

-- Now add foreign key from schools back to users
ALTER TABLE schools ADD CONSTRAINT fk_schools_user FOREIGN KEY (primary_contact_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Payment Gateways Configuration (created before auctions)
CREATE TABLE payment_gateways (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  gateway_type VARCHAR(50) NOT NULL CHECK (gateway_type IN ('STRIPE', 'SQUARE', 'PAYPAL', 'AUTHORIZE_NET')),
  gateway_name VARCHAR(255),
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  public_key VARCHAR(500),
  webhook_url VARCHAR(2083),
  webhook_secret_encrypted TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_primary BOOLEAN DEFAULT FALSE,
  currency_code VARCHAR(3) DEFAULT 'USD',
  settlement_account_name VARCHAR(255),
  settlement_account_last_four VARCHAR(4),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_payment_gateways_school_id ON payment_gateways(school_id);
CREATE INDEX idx_payment_gateways_primary ON payment_gateways(is_primary) WHERE is_primary = TRUE;

-- Auctions Table (references schools and users)
CREATE TABLE auctions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  auction_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (auction_status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'LIVE', 'ENDED', 'CANCELLED')),
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approval_notes TEXT,
  payment_gateway_id UUID NOT NULL REFERENCES payment_gateways(id) ON DELETE RESTRICT,
  platform_fee_percentage DECIMAL(5, 2) NOT NULL DEFAULT 3.5,
  platform_fee_minimum DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
  platform_fee_waivable BOOLEAN DEFAULT TRUE,
  charity_beneficiary_name VARCHAR(255),
  charity_website_url VARCHAR(2083),
  visibility VARCHAR(20) NOT NULL DEFAULT 'SCHOOL_ONLY' CHECK (visibility IN ('PUBLIC', 'SCHOOL_ONLY', 'INVITED_ONLY')),
  require_approval_for_bids BOOLEAN DEFAULT FALSE,
  auto_extend_minutes INT DEFAULT 0,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT auction_title_check CHECK (length(trim(title)) > 0),
  CONSTRAINT auction_date_check CHECK (starts_at < ends_at),
  CONSTRAINT auction_fee_check CHECK (platform_fee_percentage >= 0 AND platform_fee_percentage <= 100)
);

CREATE INDEX idx_auctions_school_id ON auctions(school_id);
CREATE INDEX idx_auctions_status ON auctions(auction_status);
CREATE INDEX idx_auctions_starts_at ON auctions(starts_at);
CREATE INDEX idx_auctions_ends_at ON auctions(ends_at);

-- Artwork Table
CREATE TABLE artwork (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  artist_name VARCHAR(255) NOT NULL,
  artist_grade VARCHAR(20),
  medium VARCHAR(100),
  dimensions_width_cm DECIMAL(10, 2),
  dimensions_height_cm DECIMAL(10, 2),
  dimensions_depth_cm DECIMAL(10, 2),
  estimated_value DECIMAL(10, 2),
  starting_bid_amount DECIMAL(10, 2) NOT NULL,
  reserve_bid_amount DECIMAL(10, 2),
  image_url VARCHAR(2083),
  image_storage_key VARCHAR(500),
  artwork_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (artwork_status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'SOLD', 'UNSOLD')),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT artwork_title_check CHECK (length(trim(title)) > 0),
  CONSTRAINT artwork_bid_check CHECK (starting_bid_amount >= 0),
  CONSTRAINT artwork_reserve_check CHECK (reserve_bid_amount IS NULL OR reserve_bid_amount >= starting_bid_amount)
);

CREATE INDEX idx_artwork_auction_id ON artwork(auction_id);
CREATE INDEX idx_artwork_status ON artwork(artwork_status);
CREATE INDEX idx_artwork_created_by ON artwork(created_by_user_id);

-- Bids Table
CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  artwork_id UUID NOT NULL REFERENCES artwork(id) ON DELETE CASCADE,
  placed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  bid_amount DECIMAL(10, 2) NOT NULL,
  is_auto_bid BOOLEAN DEFAULT FALSE,
  auto_bid_max_amount DECIMAL(10, 2),
  bid_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (bid_status IN ('ACTIVE', 'OUTBID', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
  placed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT bid_amount_check CHECK (bid_amount > 0),
  CONSTRAINT bid_auto_check CHECK (auto_bid_max_amount IS NULL OR auto_bid_max_amount >= bid_amount)
);

CREATE INDEX idx_bids_auction_id ON bids(auction_id);
CREATE INDEX idx_bids_artwork_id ON bids(artwork_id);
CREATE INDEX idx_bids_placed_by ON bids(placed_by_user_id);
CREATE INDEX idx_bids_status ON bids(bid_status);
CREATE INDEX idx_bids_placed_at ON bids(placed_at);

-- ============================================================================
-- 2. Payment Tables
-- ============================================================================

-- Payment Methods (Tokenized - no card storage)
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gateway_id UUID NOT NULL REFERENCES payment_gateways(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL,
  card_brand VARCHAR(20),
  card_last_four VARCHAR(4),
  card_expiry_month INT,
  card_expiry_year INT,
  billing_name VARCHAR(255),
  billing_email CITEXT,
  billing_zip_code VARCHAR(20),
  is_default BOOLEAN DEFAULT FALSE,
  payment_method_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (payment_method_status IN ('ACTIVE', 'EXPIRED', 'DELETED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT card_expiry_check CHECK (card_expiry_year >= 2026 AND card_expiry_month >= 1 AND card_expiry_month <= 12)
);

CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX idx_payment_methods_default ON payment_methods(is_default) WHERE is_default = TRUE;

-- Transactions (Audit Trail)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE RESTRICT,
  artwork_id UUID NOT NULL REFERENCES artwork(id) ON DELETE RESTRICT,
  buyer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  gateway_id UUID NOT NULL REFERENCES payment_gateways(id) ON DELETE RESTRICT,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('SALE', 'REFUND', 'DISPUTE', 'CHARGEBACK')),
  hammer_amount DECIMAL(10, 2) NOT NULL,
  platform_fee DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  gateway_transaction_id VARCHAR(500) NOT NULL UNIQUE,
  transaction_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (transaction_status IN ('PENDING', 'AUTHORIZED', 'CHARGED', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'CHARGEBACK')),
  payment_gateway_response JSONB,
  idempotency_key UUID UNIQUE,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT amount_check CHECK (hammer_amount >= 0 AND platform_fee >= 0 AND total_amount > 0)
);

CREATE INDEX idx_transactions_auction_id ON transactions(auction_id);
CREATE INDEX idx_transactions_buyer_user_id ON transactions(buyer_user_id);
CREATE INDEX idx_transactions_status ON transactions(transaction_status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_gateway_id ON transactions(gateway_transaction_id);

-- Refunds
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT UNIQUE,
  refund_amount DECIMAL(10, 2) NOT NULL,
  refund_reason VARCHAR(50) NOT NULL CHECK (refund_reason IN ('BUYER_REQUEST', 'SELLER_REQUEST', 'FRAUD', 'CHARGEBACK', 'AUCTION_CANCELLED', 'TECHNICAL_ERROR')),
  refund_notes TEXT,
  gateway_refund_id VARCHAR(500),
  refund_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (refund_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT refund_amount_check CHECK (refund_amount > 0)
);

CREATE INDEX idx_refunds_transaction_id ON refunds(transaction_id);
CREATE INDEX idx_refunds_status ON refunds(refund_status);

-- ============================================================================
-- 3. Authentication & Session Tables
-- ============================================================================

-- User Sessions (JWT tracking)
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_jti UUID NOT NULL UNIQUE,
  token_type VARCHAR(20) NOT NULL CHECK (token_type IN ('ACCESS', 'REFRESH')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  device_fingerprint VARCHAR(500),
  two_fa_verified BOOLEAN DEFAULT FALSE,
  two_fa_verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT session_not_expired CHECK (expires_at > CURRENT_TIMESTAMP)
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_jti ON user_sessions(token_jti);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Password Reset Tokens
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT token_not_expired CHECK (expires_at > CURRENT_TIMESTAMP)
);

CREATE INDEX idx_password_reset_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_expires ON password_reset_tokens(expires_at);

-- ============================================================================
-- 4. Compliance & Audit Tables
-- ============================================================================

-- User Consents (GDPR, COPPA, FERPA)
CREATE TABLE user_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type VARCHAR(50) NOT NULL CHECK (consent_type IN ('GDPR_DATA_PROCESSING', 'GDPR_MARKETING', 'COPPA_PARENTAL', 'FERPA_ACKNOWLEDGMENT', 'CCPA_DISCLOSURE', 'TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'EMAIL_MARKETING')),
  consented_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  consent_version VARCHAR(20),
  ip_address INET,
  user_agent TEXT,
  withdrawn_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_consents_user_id ON user_consents(user_id);
CREATE INDEX idx_user_consents_type ON user_consents(consent_type);

-- Audit Logs (Security & Compliance)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_category VARCHAR(50) NOT NULL CHECK (action_category IN ('AUTH', 'USER', 'AUCTION', 'BID', 'PAYMENT', 'ADMIN', 'COMPLIANCE', 'SECURITY')),
  action_type VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  action_details JSONB,
  ip_address INET,
  user_agent TEXT,
  http_method VARCHAR(10),
  http_status INT,
  response_time_ms INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT audit_details_check CHECK (action_details IS NULL OR jsonb_typeof(action_details) = 'object')
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_category ON audit_logs(action_category);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Data Access Logs (GDPR/FERPA tracking)
CREATE TABLE data_access_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  accessed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  data_subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  access_type VARCHAR(50) NOT NULL CHECK (access_type IN ('PARENT_ACCESS', 'STUDENT_ACCESS', 'ADMIN_ACCESS', 'COMPLIANCE_AUDIT', 'DATA_EXPORT')),
  purpose TEXT NOT NULL,
  data_elements_accessed TEXT[],
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_data_access_logs_subject ON data_access_logs(data_subject_user_id);
CREATE INDEX idx_data_access_logs_accessor ON data_access_logs(accessed_by_user_id);

-- Compliance Reports
CREATE TABLE compliance_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('GDPR', 'COPPA', 'FERPA', 'CCPA', 'PCI_DSS', 'GENERAL')),
  report_period_start DATE NOT NULL,
  report_period_end DATE NOT NULL,
  total_transactions INT,
  total_revenue DECIMAL(15, 2),
  failed_transactions INT,
  data_breaches INT,
  unauthorized_accesses INT,
  user_data_requests INT,
  data_deletions INT,
  consent_withdrawals INT,
  report_content JSONB,
  generated_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_compliance_reports_school ON compliance_reports(school_id);
CREATE INDEX idx_compliance_reports_type ON compliance_reports(report_type);

-- ============================================================================
-- 5. Feature Tables
-- ============================================================================

-- QR Codes
CREATE TABLE qr_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  artwork_id UUID NOT NULL REFERENCES artwork(id) ON DELETE CASCADE,
  qr_code_url VARCHAR(2083),
  qr_code_storage_key VARCHAR(500),
  qr_metadata JSONB,
  scans_count INT DEFAULT 0,
  offline_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_qr_codes_auction_id ON qr_codes(auction_id);
CREATE INDEX idx_qr_codes_artwork_id ON qr_codes(artwork_id);

-- QR Code Scans
CREATE TABLE qr_code_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  scanned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  device_type VARCHAR(50),
  offline_scan BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_qr_scans_qr_code_id ON qr_code_scans(qr_code_id);
CREATE INDEX idx_qr_scans_user_id ON qr_code_scans(scanned_by_user_id);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('BID_OUTBID', 'AUCTION_ENDING', 'AUCTION_ENDED', 'BID_ACCEPTED', 'BID_REJECTED', 'PAYMENT_SUCCESSFUL', 'PAYMENT_FAILED', 'ARTWORK_APPROVED', 'ARTWORK_REJECTED', 'SYSTEM_ALERT', 'AUCTION_PUBLISHED', 'ACCOUNT_SECURITY', 'DATA_REQUEST')),
  notification_channel VARCHAR(50) NOT NULL CHECK (notification_channel IN ('IN_APP', 'EMAIL', 'SMS')) ,
  subject VARCHAR(255),
  message TEXT NOT NULL,
  related_resource_type VARCHAR(50),
  related_resource_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- ============================================================================
-- 6. System Configuration Tables
-- ============================================================================

-- System Settings
CREATE TABLE system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  setting_type VARCHAR(20) NOT NULL CHECK (setting_type IN ('STRING', 'INTEGER', 'BOOLEAN', 'DECIMAL', 'JSON')),
  description TEXT,
  is_sensitive BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Email Template Settings
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_name VARCHAR(100) UNIQUE NOT NULL,
  subject_template VARCHAR(500),
  html_template TEXT,
  text_template TEXT,
  variables JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 7. Trigger for updated_at timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER schools_updated_at BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER auctions_updated_at BEFORE UPDATE ON auctions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER artwork_updated_at BEFORE UPDATE ON artwork
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER bids_updated_at BEFORE UPDATE ON bids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER payment_methods_updated_at BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER payment_gateways_updated_at BEFORE UPDATE ON payment_gateways
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER user_consents_updated_at BEFORE UPDATE ON user_consents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER qr_codes_updated_at BEFORE UPDATE ON qr_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. Create Views for Common Queries
-- ============================================================================

-- Active auctions view
CREATE VIEW active_auctions AS
SELECT id, school_id, title, starts_at, ends_at, auction_status
FROM auctions
WHERE auction_status = 'LIVE'
  AND starts_at <= CURRENT_TIMESTAMP
  AND ends_at > CURRENT_TIMESTAMP
  AND deleted_at IS NULL;

-- Auction winners view
CREATE VIEW auction_winners AS
SELECT 
  a.id as auction_id,
  a.school_id,
  aw.id as artwork_id,
  aw.title as artwork_title,
  u.id as winner_user_id,
  u.email as winner_email,
  u.first_name,
  u.last_name,
  b.bid_amount,
  b.placed_at as winning_bid_time,
  CASE 
    WHEN t.id IS NOT NULL THEN 'PAID'
    ELSE 'AWAITING_PAYMENT'
  END as payment_status
FROM auctions a
JOIN artwork aw ON a.id = aw.auction_id
JOIN bids b ON aw.id = b.artwork_id AND b.bid_status = 'ACTIVE'
JOIN users u ON b.placed_by_user_id = u.id
LEFT JOIN transactions t ON a.id = t.auction_id AND aw.id = t.artwork_id AND u.id = t.buyer_user_id
WHERE a.auction_status = 'ENDED'
  AND b.placed_at = (
    SELECT MAX(placed_at) 
    FROM bids 
    WHERE artwork_id = aw.id 
      AND bid_status = 'ACTIVE'
  );

-- User active sessions view
CREATE VIEW user_active_sessions AS
SELECT id, user_id, token_type, expires_at, ip_address, created_at
FROM user_sessions
WHERE revoked_at IS NULL
  AND expires_at > CURRENT_TIMESTAMP;

-- Revenue summary view
CREATE VIEW revenue_summary AS
SELECT 
  a.school_id,
  EXTRACT(MONTH FROM t.created_at)::int as month,
  EXTRACT(YEAR FROM t.created_at)::int as year,
  COUNT(DISTINCT t.id) as total_transactions,
  SUM(t.hammer_amount) as total_auction_revenue,
  SUM(t.platform_fee) as total_platform_fees,
  SUM(t.total_amount) as total_transaction_amount
FROM auctions a
JOIN transactions t ON a.id = t.auction_id
WHERE t.transaction_status = 'COMPLETED'
GROUP BY a.school_id, EXTRACT(YEAR FROM t.created_at), EXTRACT(MONTH FROM t.created_at);
-- ============================================================================
-- 9. Admin Dashboard Tables (Section 8)
-- ============================================================================

-- Admin Audit Logs - Track all administrative actions for compliance
CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  reason VARCHAR(500),
  ip_address INET,
  user_agent VARCHAR(1000),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_audit_admin_id ON admin_audit_logs(admin_id, created_at);
CREATE INDEX idx_admin_audit_resource ON admin_audit_logs(resource_type, resource_id, created_at);
CREATE INDEX idx_admin_audit_action ON admin_audit_logs(action, created_at);

-- Admin Actions Registry - Define available admin actions
CREATE TABLE admin_actions (
  id SERIAL PRIMARY KEY,
  action_name VARCHAR(100) UNIQUE NOT NULL,
  description VARCHAR(255),
  required_role VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_actions_name ON admin_actions(action_name);
CREATE INDEX idx_admin_actions_role ON admin_actions(required_role);

-- Dashboard Metrics - Real-time system metrics
CREATE TABLE dashboard_metrics (
  id BIGSERIAL PRIMARY KEY,
  metric_type VARCHAR(50) NOT NULL, -- 'active_auctions', 'pending_approval', 'daily_revenue', 'total_users'
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  value INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dashboard_metrics_school_type ON dashboard_metrics(school_id, metric_type, recorded_at);
CREATE INDEX idx_dashboard_metrics_recorded ON dashboard_metrics(recorded_at);

-- ============================================================================
-- 10. Additional Constraints for Data Integrity
-- ============================================================================

-- Note: Subquery constraints are enforced at application level
-- Cannot use subqueries in CHECK constraints in PostgreSQL

-- ============================================================================
-- 11. Create Partitions for Large Tables (optional, for >1M rows)
-- ============================================================================

-- Audit logs can be partitioned by date for performance
-- CREATE TABLE audit_logs_y2026m01 PARTITION OF audit_logs
--   FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- ============================================================================
-- End of Schema - Ready for Production
-- ============================================================================
