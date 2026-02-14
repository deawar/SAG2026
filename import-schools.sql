-- Create temporary table to import CSV
CREATE TEMP TABLE temp_schools_import (
  ceeb_code VARCHAR(20),
  school_name VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  postcode VARCHAR(20)
);

-- Import CSV data
\COPY temp_schools_import(ceeb_code, school_name, city, state, postcode) FROM '/tmp/ceeb.csv' WITH (FORMAT csv, HEADER true);

-- Count imported records
SELECT COUNT(*) as imported_records FROM temp_schools_import;

-- Insert into schools table from temporary table
INSERT INTO schools (name, city, state_province, postal_code, address_line1, account_status)
SELECT 
  TRIM(school_name) as name,
  TRIM(city) as city,
  TRIM(state) as state_province,
  TRIM(postcode) as postal_code,
  '' as address_line1,
  'ACTIVE' as account_status
FROM temp_schools_import
WHERE TRIM(school_name) != '' AND TRIM(city) != '' AND TRIM(state) != '' AND TRIM(postcode) != '';

-- Show summary
SELECT COUNT(*) as total_schools_in_db FROM schools;
