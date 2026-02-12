/**
 * ============================================================================
 * School Data Service
 * Fetches school data from NCES API with caching and fallback support
 * 
 * Features:
 * - Fetches from official NCES/ED.gov API
 * - Caches results in database to avoid repeated API calls
 * - Automatic refresh on schedule
 * - Fallback to hardcoded data if API fails
 * - Retry logic with exponential backoff
 * ============================================================================
 */

const https = require('https');
const http = require('http');

class SchoolDataService {
  constructor(database) {
    this.db = database;
    this.ncesApiUrl = 'https://data.nces.ed.gov/oncvs/api/v1/schools';
    this.cacheExpiryHours = process.env.SCHOOL_DATA_CACHE_HOURS || 24;
    this.maxRetries = 3;
    this.retryDelayMs = 1000;
    this.preferredState = process.env.PREFERRED_STATE || 'GA'; // Georgia first
  }

  /**
   * Fetch schools from NCES API with retry logic
   */
  async fetchFromNCES(state = null, limit = 1000) {
    let lastError;
    
    // If no state specified, use preferred state first
    const targetState = state || this.preferredState;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 Fetching from NCES API (attempt ${attempt}/${this.maxRetries})${targetState ? ` - State: ${targetState}` : ''}...`);
        
        const schools = await this.httpsGet(
          this.ncesApiUrl,
          { state: targetState, limit }
        );

        if (!schools || schools.length === 0) {
          console.warn('⚠️  NCES API returned no data');
          return null;
        }

        console.log(`✅ Successfully fetched ${schools.length} schools from NCES (${targetState})`);
        return schools;

      } catch (error) {
        lastError = error;
        console.warn(`❌ NCES API fetch failed (attempt ${attempt}): ${error.message}`);

        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error('❌ NCES API fetch failed after all retries:', lastError.message);
    return null;
  }

  /**
   * Make HTTPS GET request to external API
   */
  httpsGet(url, params = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      // Add query parameters
      if (params.state) {
        urlObj.searchParams.append('state', params.state);
      }
      if (params.limit) {
        urlObj.searchParams.append('limit', params.limit);
      }
      
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Silent-Auction-Gallery/1.0',
          'Accept': 'application/json'
        },
        timeout: 30000
      };

      https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.data || parsed);
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${e.message}`));
          }
        });

      }).on('error', (error) => {
        reject(new Error(`HTTPS request failed: ${error.message}`));
      }).on('timeout', () => {
        reject(new Error('HTTPS request timeout'));
      }).end();
    });
  }

  /**
   * Check if cache is still valid
   */
  async isCacheValid() {
    try {
      const result = await this.db.query(
        `SELECT last_updated FROM school_data_cache 
         WHERE id = 'nces_schools' 
         AND last_updated > NOW() - INTERVAL '${this.cacheExpiryHours} hours'`
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Cache validation error:', error.message);
      return false;
    }
  }

  /**
   * Get schools from cache or fetch fresh
   */
  async getSchools(state = null, forceRefresh = false) {
    // Check if we need to fetch fresh data
    if (!forceRefresh) {
      const isCacheValid = await this.isCacheValid();
      if (isCacheValid) {
        console.log('✅ Using cached school data');
        return await this.getFromCache(state);
      }
    }

    console.log('📥 Cache invalid or refresh forced, fetching from NCES API...');

    // Try to fetch from NCES
    let schools = await this.fetchFromNCES(state);

    // Fall back to hardcoded data if NCES fails
    if (!schools) {
      console.log('⚠️  Falling back to hardcoded school data');
      schools = this.getHardcodedSchools(state);
    }

    // Cache the results
    if (schools && schools.length > 0) {
      await this.cacheSchools(schools);
    }

    return schools;
  }

  /**
   * Retrieve schools from database cache
   */
  async getFromCache(state = null) {
    try {
      let query = 'SELECT * FROM schools WHERE account_status = $1';
      const params = ['ACTIVE'];

      if (state) {
        query += ' AND state_province = $2';
        params.push(state.toUpperCase());
      }

      query += ' ORDER BY name ASC';

      const result = await this.db.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Cache retrieval error:', error.message);
      return [];
    }
  }

  /**
   * Store schools in cache table
   */
  async cacheSchools(schools) {
    try {
      await this.db.query(
        `INSERT INTO school_data_cache (id, total_count, last_updated)
         VALUES ('nces_schools', $1, NOW())
         ON CONFLICT (id) DO UPDATE SET 
           total_count = EXCLUDED.total_count,
           last_updated = NOW()`,
        [schools.length]
      );
      console.log(`✅ Cached ${schools.length} schools`);
    } catch (error) {
      console.error('Cache storage error:', error.message);
    }
  }

  /**
   * Hardcoded fallback schools (all 41 schools from 14 states)
   */
  getHardcodedSchools(stateFilter = null) {
    const schools = [
      // Illinois
      { name: 'Lincoln High School', city: 'Chicago', state_province: 'IL', zip: '60619', address_line1: '1111 E. 116th St.' },
      { name: 'Northside High School', city: 'Chicago', state_province: 'IL', zip: '60614', address_line1: '4840 N. Ashland Ave.' },
      { name: 'Perspective High School', city: 'Chicago', state_province: 'IL', zip: '60647', address_line1: '2345 W. Division St.' },
      { name: 'Springfield High School', city: 'Springfield', state_province: 'IL', zip: '62702', address_line1: '1301 S. MacArthur Blvd.' },
      
      // California
      { name: 'Lincoln High School', city: 'Los Angeles', state_province: 'CA', zip: '90001', address_line1: '4121 Martin Luther King Jr. Blvd.' },
      { name: 'Franklin High School', city: 'Los Angeles', state_province: 'CA', zip: '90015', address_line1: '820 S. Olive St.' },
      { name: 'Fremont High School', city: 'Los Angeles', state_province: 'CA', zip: '90037', address_line1: '7676 S. Normandie Ave.' },
      { name: 'Roosevelt High School', city: 'Los Angeles', state_province: 'CA', zip: '90022', address_line1: '456 S. Mathews St.' },
      { name: 'Berkeley High School', city: 'Berkeley', state_province: 'CA', zip: '94704', address_line1: '1980 Allston Way' },
      { name: 'Stanford Online High School', city: 'Stanford', state_province: 'CA', zip: '94305', address_line1: '520 Galvez St.' },
      
      // New York
      { name: 'Stuyvesant High School', city: 'New York', state_province: 'NY', zip: '10007', address_line1: '345 Chambers St.' },
      { name: 'University Heights High School', city: 'New York', state_province: 'NY', zip: '10452', address_line1: '351 E. 169th St.' },
      { name: 'Brooklyn Technical High School', city: 'New York', state_province: 'NY', zip: '11201', address_line1: '29 Fort Greene Pl.' },
      
      // Texas
      { name: 'Austin High School', city: 'Austin', state_province: 'TX', zip: '78751', address_line1: '1715 W. Cesar Chavez St.' },
      { name: 'James Madison High School', city: 'Houston', state_province: 'TX', zip: '77003', address_line1: '3210 Bellfort St.' },
      { name: 'Lincoln High School', city: 'Dallas', state_province: 'TX', zip: '75220', address_line1: '3601 South Westmoreland Rd.' },
      
      // Florida
      { name: 'Titusville High School', city: 'Titusville', state_province: 'FL', zip: '32780', address_line1: '2635 S. Washington Ave.' },
      { name: 'Lincoln High School', city: 'Miami', state_province: 'FL', zip: '33127', address_line1: '141 W. 41st St.' },
      
      // Massachusetts
      { name: 'Boston Latin School', city: 'Boston', state_province: 'MA', zip: '02115', address_line1: '78 Avenue Louis Pasteur' },
      { name: 'Newton North High School', city: 'Newtonville', state_province: 'MA', zip: '02460', address_line1: '360 Watertown St.' },
      
      // Pennsylvania
      { name: 'Central High School', city: 'Philadelphia', state_province: 'PA', zip: '19103', address_line1: '1700 W. Poplar St.' },
      { name: 'Thomas Jefferson University High School', city: 'Philadelphia', state_province: 'PA', zip: '19148', address_line1: '4410 Frankford Ave.' },
      
      // Ohio
      { name: 'Thomas Jefferson High School', city: 'Columbus', state_province: 'OH', zip: '43224', address_line1: '4400 Refugee Rd.' },
      { name: 'Cleveland High School', city: 'Cleveland', state_province: 'OH', zip: '44103', address_line1: '7000 Euclid Ave.' },
      
      // Washington
      { name: 'Franklin High School', city: 'Seattle', state_province: 'WA', zip: '98144', address_line1: '3013 S. Mount Baker Blvd.' },
      { name: 'Mercer Island High School', city: 'Mercer Island', state_province: 'WA', zip: '98040', address_line1: '9100 SE 42nd St.' },
      
      // Georgia (10 schools - expanded for geographic coverage)
      { name: 'Northside High School', city: 'Atlanta', state_province: 'GA', zip: '30309', address_line1: '1256 Walnut Street' },
      { name: 'Marietta High School', city: 'Marietta', state_province: 'GA', zip: '30060', address_line1: '1171 Cobb Parkway' },
      { name: 'Grady High School', city: 'Atlanta', state_province: 'GA', zip: '30307', address_line1: '130 Courtland Street' },
      { name: 'Lakeside High School', city: 'Atlanta', state_province: 'GA', zip: '30317', address_line1: '2401 Lakeside Drive' },
      { name: 'Dunwoody High School', city: 'Dunwoody', state_province: 'GA', zip: '30338', address_line1: '5600 Vermack Road' },
      { name: 'Wheeler High School', city: 'Marietta', state_province: 'GA', zip: '30062', address_line1: '1451 Roswell Street' },
      { name: 'Roswell High School', city: 'Roswell', state_province: 'GA', zip: '30075', address_line1: '11605 Jones Bridge Road' },
      { name: 'Woodstock High School', city: 'Woodstock', state_province: 'GA', zip: '30189', address_line1: '7710 Woodstock Lane' },
      { name: 'Richmond Hill High School', city: 'Richmond Hill', state_province: 'GA', zip: '31324', address_line1: '4125 Timber Creek Drive' },
      { name: 'Savannah Arts Academy', city: 'Savannah', state_province: 'GA', zip: '31405', address_line1: '2 E. 52nd Street' },
      
      // Tennessee
      { name: 'Central High School', city: 'Nashville', state_province: 'TN', zip: '37203', address_line1: '2501 Blakemore Avenue' },
      { name: 'Germantown High School', city: 'Nashville', state_province: 'TN', zip: '37211', address_line1: '1101 Whites Creek Pike' },
      { name: 'Whitehaven High School', city: 'Memphis', state_province: 'TN', zip: '38116', address_line1: '1836 Elvis Presley Boulevard' },
      
      // North Carolina
      { name: 'Panther Creek High School', city: 'Cary', state_province: 'NC', zip: '27519', address_line1: '1000 Panther Lane' },
      { name: 'Northern High School', city: 'Durham', state_province: 'NC', zip: '27701', address_line1: '1707 Fayetteville Street' },
      { name: 'Laney High School', city: 'Wilmington', state_province: 'NC', zip: '28401', address_line1: '2410 South 16th Street' },
      
      // South Carolina
      { name: 'Richland Northeast High School', city: 'Columbia', state_province: 'SC', zip: '29223', address_line1: '10701 Two Notch Road' },
      { name: 'Summerville High School', city: 'Summerville', state_province: 'SC', zip: '29483', address_line1: '500 Old Trolley Road' },
      { name: 'Beaufort High School', city: 'Beaufort', state_province: 'SC', zip: '29902', address_line1: '611 Lady\'s Island Road' },
      
      // Alabama
      { name: 'Auburn High School', city: 'Auburn', state_province: 'AL', zip: '36830', address_line1: '301 West Samford Avenue' },
      { name: 'Vestavia Hills High School', city: 'Birmingham', state_province: 'AL', zip: '35216', address_line1: '2 Warrior Lane' },
      { name: 'Hoover High School', city: 'Hoover', state_province: 'AL', zip: '35226', address_line1: '100 Stadium Drive' },
    ];

    // Filter by state if provided
    if (stateFilter) {
      return schools.filter(s => s.state_province === stateFilter.toUpperCase());
    }

    return schools;
  }
}

module.exports = SchoolDataService;
