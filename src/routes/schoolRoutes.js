/**
 * ============================================================================
 * School Routes
 * Public endpoints for accessing school information
 * Integrates with Public Schools data from U.S. Department of Education
 * ============================================================================
 */

const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');

// Preset color values — must stay in sync with public/css/theme.css school-theme-* classes
const PRESET_COLORS = {
    'crimson-gold':  { primary: '#9B1B30', primaryDark: '#7A1525', primaryLight: '#C2223D', secondary: '#B8860B', secondaryDark: '#956D09', secondaryLight: '#D4A017' },
    'navy-gold':     { primary: '#003087', primaryDark: '#00246B', primaryLight: '#0040A8', secondary: '#C5A028', secondaryDark: '#A08020', secondaryLight: '#E0B830' },
    'forest-gold':   { primary: '#1B5E20', primaryDark: '#155118', primaryLight: '#217328', secondary: '#B7820A', secondaryDark: '#8F6508', secondaryLight: '#D49A10' },
    'purple-gold':   { primary: '#4A1D7B', primaryDark: '#39165E', primaryLight: '#5E2599', secondary: '#C5A028', secondaryDark: '#A08020', secondaryLight: '#E0B830' },
    'scarlet-gray':  { primary: '#BB0000', primaryDark: '#960000', primaryLight: '#D90000', secondary: '#666666', secondaryDark: '#444444', secondaryLight: '#888888' },
    'royal-blue':    { primary: '#003FA5', primaryDark: '#002D7A', primaryLight: '#0050D0', secondary: '#4A90C4', secondaryDark: '#3373A0', secondaryLight: '#65ABDF' },
    'orange-black':  { primary: '#C85200', primaryDark: '#A34200', primaryLight: '#E06000', secondary: '#1A1A1A', secondaryDark: '#000000', secondaryLight: '#333333' },
};

const VALID_PRESETS = Object.keys(PRESET_COLORS);
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function resolveTheme(preset, colors) {
    if (preset && PRESET_COLORS[preset]) return PRESET_COLORS[preset];
    if (colors?.primary) return colors;
    return null;
}

/**
 * Factory function to create school routes with injected database
 * @param {Database} db - Initialized database connection
 * @returns {Router} Express router with school routes
 */
module.exports = (db) => {
  const router = express.Router();


  /**
   * GET /api/schools
   * Public endpoint - fetch schools from database or external API
   * No authentication required
   * 
   * Query Parameters:
   * - state: Filter by state (e.g., "IL", "CA")
   * - city: Filter by city
   * - search: Search by school name
   * 
   * Response: 200
   * {
   *   "success": true,
   *   "data": [
   *     {
   *       "id": "uuid",
   *       "name": "Central High School",
   *       "city": "Springfield",
   *       "state_province": "IL",
   *       "address_line1": "123 Main St",
   *       "postal_code": "62701"
   *     }
   *   ]
   * }
   */
  router.get('/', async (req, res, next) => {
    try {
      const { state, city, search } = req.query;
      
      // Build query - don't filter by status, get all schools
      let query = 'SELECT id, name, city, state_province, address_line1, postal_code FROM schools WHERE 1=1';
      const params = [];

      // Add filters if provided
      let paramIndex = 1;
      if (state) {
        query += ` AND state_province = $${paramIndex}`;
        params.push(state.toUpperCase());
        paramIndex++;
      }
      if (city) {
        query += ` AND city ILIKE $${paramIndex}`;
        params.push(`%${city}%`);
        paramIndex++;
      }
      if (search) {
        query += ` AND (name ILIKE $${paramIndex} OR city ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      query += ' ORDER BY name ASC LIMIT 500';

      const result = await db.query(query, params);
      
      // Log for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SCHOOLS API] Query returned ${result.rows.length} schools`, { state, city, search });
      }
      
      res.json({
        success: true,
        message: 'Schools retrieved successfully',
        data: result.rows,
        count: result.rows.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/schools/states
   * Get list of all states that have schools
   * MUST be defined before /search/:query to avoid being caught by :query parameter
   */
  router.get('/states', async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT DISTINCT state_province 
         FROM schools 
         ORDER BY state_province ASC`
      );
      
      const states = result.rows.map(row => row.state_province);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SCHOOLS API] /states returned ${states.length} states`);
      }
      
      res.json({
        success: true,
        message: 'States with schools retrieved successfully',
        data: states,
        count: states.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/schools/by-state/:state
   * Fetch schools by state code
   * 
   * Example: /api/schools/by-state/IL
   */
  router.get('/by-state/:state', async (req, res, next) => {
    try {
      const { state } = req.params;
      
      const result = await db.query(
        `SELECT id, name, city, state_province, address_line1, postal_code 
         FROM schools 
         WHERE state_province = $1
         ORDER BY city ASC, name ASC
         LIMIT 500`,
        [state.toUpperCase()]
      );
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SCHOOLS API] /by-state/${state} returned ${result.rows.length} schools`);
      }
      
      res.json({
        success: true,
        message: `Schools in ${state.toUpperCase()} retrieved successfully`,
        data: result.rows,
        count: result.rows.length,
        state: state.toUpperCase(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/schools/search/:query
   * Search schools by name, city, or state
   * MUST be defined after /states to avoid catching /states in :query
   * 
   * Example: /api/schools/search/Lincoln
   */
  router.get('/search/:query', async (req, res, next) => {
    try {
      const { query } = req.params;
      const searchTerm = `%${query}%`;
      
      const result = await db.query(
        `SELECT id, name, city, state_province, address_line1, postal_code 
         FROM schools 
         WHERE (name ILIKE $1 OR city ILIKE $1 OR state_province ILIKE $1)
         ORDER BY name ASC
         LIMIT 100`,
        [searchTerm]
      );
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SCHOOLS API] /search/${query} returned ${result.rows.length} schools`);
      }
      
      res.json({
        success: true,
        message: `Search results for "${query}"`,
        data: result.rows,
        count: result.rows.length,
        query: query,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/schools/:schoolId/theme
   * Return the school's colour theme (public — needed by unauthenticated bidders)
   *
   * Response 200:
   * {
   *   "success": true,
   *   "data": {
   *     "schoolId": "uuid",
   *     "preset": "navy-gold" | null,
   *     "colors": { ... } | null,
   *     "resolved": { primary, primaryDark, primaryLight, secondary, secondaryDark, secondaryLight } | null
   *   }
   * }
   */
  router.get('/:schoolId/theme', async (req, res, next) => {
    try {
      const { schoolId } = req.params;

      const result = await db.query(
        'SELECT theme_preset, theme_colors FROM schools WHERE id = $1',
        [schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'School not found' });
      }

      const { theme_preset: preset, theme_colors: colors } = result.rows[0];

      return res.json({
        success: true,
        data: {
          schoolId,
          preset: preset || null,
          colors: colors || null,
          resolved: resolveTheme(preset, colors),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/schools/:schoolId/theme
   * Set the school's colour theme.
   * Auth: SITE_ADMIN (any school) | SCHOOL_ADMIN or TEACHER (own school only)
   *
   * Body: { preset: string|null, colors: object|null }
   */
  router.put('/:schoolId/theme', authMiddleware.verifyToken, async (req, res, next) => {
    try {
      const { schoolId } = req.params;
      const { role, schoolId: userSchoolId } = req.user;

      // Authorisation: only admins/teachers of this specific school
      if (role !== 'SITE_ADMIN' && userSchoolId !== schoolId) {
        return res.status(403).json({
          success: false,
          message: 'You can only update the theme for your own school',
        });
      }
      if (!['SITE_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'].includes(role)) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions' });
      }

      const { preset = null, colors = null } = req.body;

      // Validate preset
      if (preset !== null && !VALID_PRESETS.includes(preset)) {
        return res.status(400).json({
          success: false,
          message: `Invalid preset. Valid values: ${VALID_PRESETS.join(', ')}`,
        });
      }

      // Validate custom colors when provided
      if (colors !== null) {
        const required = ['primary', 'primaryDark', 'primaryLight', 'secondary', 'secondaryDark', 'secondaryLight'];
        for (const key of required) {
          if (!HEX_RE.test(colors[key])) {
            return res.status(400).json({
              success: false,
              message: `Invalid hex color for ${key}. Expected format: #RRGGBB`,
            });
          }
        }
      }

      const result = await db.query(
        `UPDATE schools
         SET theme_preset = $1, theme_colors = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING id, theme_preset, theme_colors`,
        [preset, colors ? JSON.stringify(colors) : null, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'School not found' });
      }

      const { theme_preset: savedPreset, theme_colors: savedColors } = result.rows[0];

      return res.json({
        success: true,
        message: 'School theme updated',
        data: {
          schoolId,
          preset: savedPreset || null,
          colors: savedColors || null,
          resolved: resolveTheme(savedPreset, savedColors),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
