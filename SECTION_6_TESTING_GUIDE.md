# Public School API Integration - Quick Testing Guide

**Last Updated**: February 3, 2025  
**Status**: Implementation complete, ready for deployment  
**Time to Test**: ~10 minutes

---

## Quick Test (5 minutes)

### 1. Verify Git Commit
```bash
cd c:\Users\dwarren\OneDrive\projects\SAG2026\Silent-Auction-Gallery
git log --oneline -2
# Expected: Should see "Section 6: Implement Public School API integration..."
```

✅ **Status**: [PASS/FAIL]

### 2. Check Files Exist
```bash
# Check all new files created
ls -la {src/routes/schoolRoutes.js,public/register.html,public/js/auth-pages.js,import-schools.js,PUBLIC_SCHOOL_API_INTEGRATION.md}
# Expected: All files exist
```

✅ **Status**: [PASS/FAIL]

### 3. Verify Code Quality
```bash
# Check for syntax errors in key files
node -c src/routes/schoolRoutes.js 2>&1 | grep -i "error" || echo "✓ No syntax errors"
node -c import-schools.js 2>&1 | grep -i "error" || echo "✓ No syntax errors"
```

✅ **Status**: [PASS/FAIL]

---

## Full Integration Test (10 minutes)

### Prerequisites
- Docker installed and running
- Node.js 18+ installed
- PostgreSQL connection available
- Network connectivity to VPS (for real deployment)

### Test Scenario 1: School Routes API

**Endpoint**: GET /api/schools/states

```bash
# The API should support getting list of states
# After deployment, test with:
curl -s https://sag.live/api/schools/states | jq '.'

# Expected Response:
# {
#   "success": true,
#   "data": ["IL", "CA", "TX", "NY", ...],
#   "count": 2+
# }
```

**Test Result**: [PASS/FAIL]

### Test Scenario 2: School Search

**Endpoint**: GET /api/schools/search/:query

```bash
# Should return schools matching search term
curl -s https://sag.live/api/schools/search/Lincoln | jq '.count'

# Expected: Returns number > 0 (at least one school with "Lincoln" in name/city)
```

**Test Result**: [PASS/FAIL]

### Test Scenario 3: Filter by State

**Endpoint**: GET /api/schools/by-state/:state

```bash
# Should return schools for specific state
curl -s https://sag.live/api/schools/by-state/IL | jq '.count'

# Expected: Returns count > 0 for Illinois schools
```

**Test Result**: [PASS/FAIL]

### Test Scenario 4: Frontend Search UI

**Location**: https://sag.live/register.html

**Steps**:
1. Open registration page
2. Scroll to "Find Your School" section
3. Type "Lincoln" in search box
4. Verify dropdown updates with matches
5. Select a school from dropdown
6. Verify school_id is captured in form

**Test Result**: [PASS/FAIL]

### Test Scenario 5: Import Script

**Command**: `node import-schools.js`

```bash
# SSH to VPS
ssh root@15.204.210.161

# Navigate to app directory
cd /app

# Run import (should check if schools already exist)
node import-schools.js

# Expected Output:
# 📚 Starting school data import from sample NCES data...
# ✅ Imported: 30/30
# ✨ Import complete!
#    Imported: 30 schools
```

**Test Result**: [PASS/FAIL]

---

## API Endpoint Testing

### Endpoint 1: GET /api/schools (List/Filter)

```bash
# Basic list (all schools)
curl -s https://sag.live/api/schools | jq '.data[0]'

# Filter by state
curl -s "https://sag.live/api/schools?state=IL" | jq '.count'

# Filter by city
curl -s "https://sag.live/api/schools?city=Chicago" | jq '.count'

# Combined filters
curl -s "https://sag.live/api/schools?state=IL&city=Chicago" | jq '.data | length'
```

**Expected**: All queries return valid JSON with "success": true

### Endpoint 2: GET /api/schools/by-state/:state

```bash
# Get all schools in California
curl -s https://sag.live/api/schools/by-state/CA | jq '.count'

# Get all schools in Illinois
curl -s https://sag.live/api/schools/by-state/IL | jq '.count'

# Should return different counts for different states
```

**Expected**: Both return > 0 school count

### Endpoint 3: GET /api/schools/search/:query

```bash
# Search for schools
curl -s https://sag.live/api/schools/search/Lincoln | jq '.count'
curl -s https://sag.live/api/schools/search/High | jq '.count'

# Random searches
curl -s https://sag.live/api/schools/search/Springfield | jq '.count'
```

**Expected**: Relevant schools returned for each query

### Endpoint 4: GET /api/schools/states

```bash
# Get list of states with schools
curl -s https://sag.live/api/schools/states | jq '.'

# Count states
curl -s https://sag.live/api/schools/states | jq '.count'

# Get first state
curl -s https://sag.live/api/schools/states | jq '.data[0]'
```

**Expected**: Array of state codes like ["IL", "CA", "TX", "NY", ...]

---

## Frontend Integration Testing

### Test Case 1: School Search Box Renders

```javascript
// Open browser console on https://sag.live/register.html and run:
document.getElementById('school-search');
// Expected: HTMLInputElement (search box exists)

document.querySelector('select[name="school_id"]');
// Expected: HTMLSelectElement (dropdown exists)
```

### Test Case 2: Search Functionality Works

```javascript
// Simulate user typing in search
const searchBox = document.getElementById('school-search');
searchBox.value = 'Lincoln';
searchBox.dispatchEvent(new Event('input'));

// Wait 350ms (debounce time + 50ms buffer)
setTimeout(() => {
  const dropdown = document.querySelector('select[name="school_id"]');
  console.log('Options in dropdown:', dropdown.options.length);
  // Expected: Options > 1 (more than just placeholder)
}, 350);
```

### Test Case 3: Selection Captures ID

```javascript
// Manually select a school
const dropdown = document.querySelector('select[name="school_id"]');
dropdown.value = dropdown.options[1].value; // Select first real option

// Check form data
const form = document.getElementById('register-form');
const formData = new FormData(form);
console.log('school_id:', formData.get('school_id'));
// Expected: Returns UUID or ID value
```

---

## Performance Testing

### Query Performance

```bash
# Measure time for various queries
time curl -s https://sag.live/api/schools > /dev/null
# Expected: < 500ms

time curl -s https://sag.live/api/schools/by-state/CA > /dev/null
# Expected: < 500ms

time curl -s https://sag.live/api/schools/search/Lincoln > /dev/null
# Expected: < 500ms
```

### Response Size

```bash
# Check response payload size
curl -s https://sag.live/api/schools | jq '. | @json | length'
# Expected: < 100KB (for 500 schools)

curl -s https://sag.live/api/schools/search/Lincoln | jq '. | @json | length'
# Expected: < 10KB (for ~40 schools)
```

---

## Code Quality Checks

### JavaScript Syntax

```bash
# Check import-schools.js for syntax errors
node -c import-schools.js
# Expected: No output (silent success)

# Check auth-pages.js in browser console
// Copy and paste into browser console
// Expected: No errors
```

### SQL Query Review

```bash
# Check database queries in schoolRoutes.js
# Key queries to verify:
# 1. LIMIT 500 on list query (prevents large payloads)
# 2. ILIKE for case-insensitive search
# 3. WHERE account_status = 'ACTIVE' (filters soft-deleted)
```

---

## Error Scenarios

### Scenario 1: Empty Result

```bash
# Search for non-existent school
curl -s https://sag.live/api/schools/search/XXXNONEXIST | jq '.'

# Expected: {"success": true, "data": [], "count": 0}
# Should NOT error, just return empty array
```

### Scenario 2: Invalid State Code

```bash
# Request with invalid state
curl -s https://sag.live/api/schools/by-state/ZZ | jq '.count'

# Expected: 0 (no error, just no results)
```

### Scenario 3: API Unavailable

```bash
# If API is down or database is unreachable
curl -s https://sag.live/api/schools 2>&1

# Expected: Should return error response or HTTP 500
# Check server logs for error details
```

---

## Verification Checklist

- [ ] All 5 files committed to Git
- [ ] Docker image builds without errors
- [ ] Files copied to VPS
- [ ] Docker containers restarted
- [ ] GET /api/schools returns results
- [ ] GET /api/schools/search/:query works
- [ ] GET /api/schools/by-state/:state works
- [ ] GET /api/schools/states returns state list
- [ ] School search input renders on register.html
- [ ] Dropdown populates when searching
- [ ] School selection captures school_id
- [ ] import-schools.js runs successfully
- [ ] No syntax errors in code
- [ ] API response times < 500ms
- [ ] Graceful handling of empty results

---

## Troubleshooting

### Issue: API returns 404

**Solution**: Verify routes are mounted in src/index.js
```javascript
// Should see in src/index.js:
const schoolRoutes = require('./routes/schoolRoutes');
app.use('/api/schools', schoolRoutes(db));
```

### Issue: Dropdown is empty

**Solution**: Check if schools exist in database
```sql
SELECT COUNT(*) FROM schools WHERE account_status = 'ACTIVE';
-- Should return > 0
```

### Issue: Search doesn't work

**Solution**: Check browser console for fetch errors
```javascript
// In browser console, check:
fetch('/api/schools/search/test').then(r => console.log(r.status))
// Should return 200
```

### Issue: Import script fails

**Solution**: Verify database connection
```bash
psql postgres://user:pass@localhost/auction_gallery -c "SELECT 1"
# Should return 1 if connection works
```

---

## Quick Commands for Deployment

### Copy Files to VPS
```bash
# From local machine
scp src/routes/schoolRoutes.js root@15.204.210.161:/app/src/routes/
scp public/register.html root@15.204.210.161:/app/public/
scp public/js/auth-pages.js root@15.204.210.161:/app/public/js/
scp import-schools.js root@15.204.210.161:/app/
```

### Restart Containers
```bash
# On VPS
ssh root@15.204.210.161
cd /app
docker compose down
docker compose up -d
docker compose ps
```

### Check Logs
```bash
# On VPS
docker logs sag-app -f  # Follow logs
docker logs sag-db     # Check database
```

### Run Import
```bash
# On VPS
cd /app
node import-schools.js
```

---

## Success Criteria

✅ All tests passing  
✅ Git committed  
✅ Files deployed to VPS  
✅ Containers restarted  
✅ APIs returning results  
✅ Frontend search working  
✅ No errors in logs  
✅ Response times acceptable  

---

**Next Steps After Testing**:
1. Verify all test cases pass
2. Get feedback from team
3. If needed, import full NCES dataset
4. Monitor API performance in production
5. Collect user feedback on school search UX

---

*For questions or issues, refer to PUBLIC_SCHOOL_API_INTEGRATION.md for detailed troubleshooting*
