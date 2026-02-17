-- Load sample schools directly into database
-- Run this with: psql -U postgres -d silent_auction_gallery < load-sample-schools.sql

INSERT INTO schools (name, city, state_province, address_line1, postal_code, account_status, created_at)
VALUES 
  ('Lincoln High School', 'Springfield', 'IL', '1000 Lincoln Ave', '62701', 'ACTIVE', NOW()),
  ('Central High School', 'Chicago', 'IL', '2000 Central St', '60601', 'ACTIVE', NOW()),
  ('Washington High School', 'Atlanta', 'GA', '3000 Washington Dr', '30303', 'ACTIVE', NOW()),
  ('Jefferson Middle School', 'Atlanta', 'GA', '4000 Jefferson Way', '30304', 'ACTIVE', NOW()),
  ('Madison Academy', 'Marietta', 'GA', '5000 Madison St', '30060', 'ACTIVE', NOW()),
  ('Franklin High School', 'Dallas', 'TX', '6000 Franklin Blvd', '75201', 'ACTIVE', NOW()),
  ('Roosevelt Middle', 'Austin', 'TX', '7000 Roosevelt Ave', '78701', 'ACTIVE', NOW()),
  ('Kennedy High School', 'Los Angeles', 'CA', '8000 Kennedy Rd', '90001', 'ACTIVE', NOW()),
  ('Adams Academy', 'New York', 'NY', '9000 Adams St', '10001', 'ACTIVE', NOW()),
  ('Monroe High School', 'Miami', 'FL', '10000 Monroe Dr', '33101', 'ACTIVE', NOW()),
  ('Jackson Academy', 'Austin', 'TX', '11000 Jackson Ln', '78702', 'ACTIVE', NOW()),
  ('Grant High School', 'Portland', 'OR', '12000 Grant Way', '97201', 'ACTIVE', NOW()),
  ('Eisenhower Academy', 'Denver', 'CO', '13000 Eisenhower Blvd', '80202', 'ACTIVE', NOW()),
  ('Taft High School', 'Cincinnati', 'OH', '14000 Taft Ave', '45202', 'ACTIVE', NOW()),
  ('Wilson Charter School', 'Phoenix', 'AZ', '15000 Wilson Rd', '85001', 'ACTIVE', NOW())
ON CONFLICT DO NOTHING;

-- Verify the import
SELECT 'Schools loaded successfully!' as status;
SELECT COUNT(*) as total_active_schools FROM schools WHERE account_status = 'ACTIVE';
SELECT state_province, COUNT(*) as count FROM schools WHERE account_status = 'ACTIVE' GROUP BY state_province ORDER BY state_province;
