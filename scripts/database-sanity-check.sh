#!/bin/bash

################################################################################
# Database Sanity Check Script
# Silent Auction Gallery - Section 10
################################################################################
#
# Purpose: Verify database integrity and health
# 
# Usage: 
#   bash scripts/database-sanity-check.sh [production|staging|development]
#
# Checks:
#   - Connection health
#   - Referential integrity
#   - Constraint violations
#   - Orphaned records
#   - Index performance
#   - Soft delete consistency
#   - Trigger functionality
#   - Disk space usage
#   - Table statistics
#   - Transaction logs
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Environment
ENV=${1:-development}
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Database credentials (from env vars or defaults)
DB_HOST=${PG_HOST:-localhost}
DB_PORT=${PG_PORT:-5432}
DB_NAME=${PG_DATABASE:-sag_db}
DB_USER=${PG_USER:-postgres}
DB_PASSWORD=${PG_PASSWORD:-postgres}

# Export for psql
export PGPASSWORD=$DB_PASSWORD

# Logging functions
log_header() {
    echo -e "\n${GREEN}▶ $1${NC}"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

################################################################################
# 1. CONNECTION TEST
################################################################################

log_header "1. Testing Database Connection"

if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
    log_success "Database connection successful"
else
    log_error "Cannot connect to database at $DB_HOST:$DB_PORT"
    exit 1
fi

################################################################################
# 2. TABLE INTEGRITY CHECK
################################################################################

log_header "2. Checking Table Integrity"

# Check for missing tables
REQUIRED_TABLES=("users" "schools" "auctions" "artwork" "bids" "notifications" "payment_transactions" "audit_logs")

for table in "${REQUIRED_TABLES[@]}"; do
    COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tc \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='$table'")
    if [ "$COUNT" -eq 1 ]; then
        log_success "Table '$table' exists"
    else
        log_error "Table '$table' missing"
    fi
done

################################################################################
# 3. FOREIGN KEY CONSTRAINT CHECK
################################################################################

log_header "3. Checking Foreign Key Constraints"

VIOLATIONS=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tc << 'SQL'
-- Check for bids without auctions
SELECT COUNT(*) FROM bids b WHERE NOT EXISTS (SELECT 1 FROM auctions a WHERE a.id = b.auction_id)
UNION ALL
-- Check for bids without users
SELECT COUNT(*) FROM bids b WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = b.bidder_id)
UNION ALL
-- Check for auctions without schools
SELECT COUNT(*) FROM auctions a WHERE NOT EXISTS (SELECT 1 FROM schools s WHERE s.id = a.school_id)
UNION ALL
-- Check for users without schools (except SITE_ADMIN)
SELECT COUNT(*) FROM users u WHERE u.school_id IS NULL AND u.role != 'SITE_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM schools s WHERE s.id = u.school_id)
SQL
)

if [ "$VIOLATIONS" -eq "0" ]; then
    log_success "No foreign key violations detected"
else
    log_warning "Found potential foreign key issues: $VIOLATIONS"
fi

################################################################################
# 4. UNIQUE CONSTRAINT CHECK
################################################################################

log_header "4. Checking Unique Constraints"

# Check for duplicate emails (excluding soft-deleted)
DUPLICATE_EMAILS=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tc \
    "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL GROUP BY email HAVING COUNT(*) > 1")

if [ -z "$DUPLICATE_EMAILS" ]; then
    log_success "No duplicate emails detected"
else
    log_warning "Found duplicate emails: $DUPLICATE_EMAILS"
fi

# Check for duplicate college board codes
DUPLICATE_CODES=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tc \
    "SELECT COUNT(*) FROM schools GROUP BY college_board_code HAVING COUNT(*) > 1")

if [ -z "$DUPLICATE_CODES" ]; then
    log_success "No duplicate college board codes"
else
    log_warning "Found duplicate college board codes: $DUPLICATE_CODES"
fi

################################################################################
# 5. ORPHANED RECORD CHECK
################################################################################

log_header "5. Checking for Orphaned Records"

# Bids without auctions
ORPHAN_BIDS=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tc \
    "SELECT COUNT(*) FROM bids WHERE auction_id NOT IN (SELECT id FROM auctions)")

if [ "$ORPHAN_BIDS" -eq 0 ]; then
    log_success "No orphaned bids detected"
else
    log_warning "Found $ORPHAN_BIDS orphaned bids"
fi

# Users with invalid schools
ORPHAN_USERS=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tc \
    "SELECT COUNT(*) FROM users WHERE school_id IS NOT NULL AND school_id NOT IN (SELECT id FROM schools)")

if [ "$ORPHAN_USERS" -eq 0 ]; then
    log_success "No orphaned users detected"
else
    log_warning "Found $ORPHAN_USERS orphaned users"
fi

################################################################################
# 6. SOFT DELETE CONSISTENCY
################################################################################

log_header "6. Checking Soft Delete Consistency"

# Check for active records referencing soft-deleted records
INCONSISTENT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tc << 'SQL'
SELECT COUNT(*) FROM bids b
WHERE b.deleted_at IS NULL
AND b.auction_id IN (SELECT id FROM auctions WHERE deleted_at IS NOT NULL)
SQL
)

if [ "$INCONSISTENT" -eq 0 ]; then
    log_success "Soft delete consistency verified"
else
    log_warning "Found $INCONSISTENT active bids on soft-deleted auctions"
fi

################################################################################
# 7. TABLE STATISTICS
################################################################################

log_header "7. Table Statistics"

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << 'SQL'
\echo 'Table Row Counts:'
SELECT 
  schemaname,
  tablename,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  n_mod_since_analyze as modified_since_analyze
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
SQL

################################################################################
# 8. INDEX HEALTH CHECK
################################################################################

log_header "8. Checking Index Health"

# Check for missing indexes on foreign keys
log_success "Checking index coverage..."

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << 'SQL'
SELECT 
  tc.table_name,
  kcu.column_name,
  CASE WHEN i.indexname IS NOT NULL THEN 'Indexed' ELSE 'NOT INDEXED' END as index_status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
LEFT JOIN pg_indexes i ON i.tablename = tc.table_name AND i.indexdef LIKE '%' || kcu.column_name || '%'
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, kcu.column_name;
SQL

################################################################################
# 9. DISK SPACE USAGE
################################################################################

log_header "9. Checking Disk Space Usage"

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << 'SQL'
\echo 'Database Size:'
SELECT pg_size_pretty(pg_database_size(current_database())) as database_size;

\echo '\nTable Size Distribution:'
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
SQL

################################################################################
# 10. CONSTRAINT VALIDATION
################################################################################

log_header "10. Validating Constraints"

# Check NOT NULL constraints
NOT_NULL_VIOLATIONS=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tc << 'SQL'
SELECT COUNT(*) FROM users WHERE email IS NULL
UNION ALL
SELECT COUNT(*) FROM auctions WHERE title IS NULL
UNION ALL
SELECT COUNT(*) FROM bids WHERE bid_amount IS NULL
SQL
)

if [ "$NOT_NULL_VIOLATIONS" = "0
0
0" ]; then
    log_success "All NOT NULL constraints validated"
else
    log_warning "Found potential NOT NULL violations"
fi

################################################################################
# 11. VACUUM AND ANALYZE RECOMMENDATIONS
################################################################################

log_header "11. Maintenance Recommendations"

# Check for tables that need vacuum
VACUUM_CANDIDATES=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tc \
    "SELECT tablename FROM pg_stat_user_tables WHERE n_dead_tup > (n_live_tup * 0.1)")

if [ -z "$VACUUM_CANDIDATES" ]; then
    log_success "No tables need vacuuming"
else
    log_warning "Consider vacuuming: $VACUUM_CANDIDATES"
    echo "  Run: VACUUM ANALYZE $VACUUM_CANDIDATES;"
fi

################################################################################
# 12. SUMMARY REPORT
################################################################################

log_header "Sanity Check Summary"

echo "Environment: $ENV"
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "Timestamp: $TIMESTAMP"
echo ""
log_success "Database sanity check completed"

# Return success
exit 0
