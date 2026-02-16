/**
 * ============================================================================
 * School Routes
 * Public endpoints for accessing school information
 * Integrates with Public Schools data from U.S. Department of Education
 * ============================================================================
 */

const express = require('express');

/**
 * Factory function to create school routes with injected database
 * @param {Database} db - Initialized database connection
 * @returns {Router} Express router with school routes
 */
module.exports = (db) => {
  const router = express.Router();
  const { SchoolModel } = require('../models');
  const schoolModel = new SchoolModel(db);

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

  return router;
};
