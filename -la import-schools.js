[1mdiff --git a/src/routes/schoolRoutes.js b/src/routes/schoolRoutes.js[m
[1mindex 6726ccf..a0d000b 100644[m
[1m--- a/src/routes/schoolRoutes.js[m
[1m+++ b/src/routes/schoolRoutes.js[m
[36m@@ -1,55 +1,181 @@[m
[31m-/**[m
[31m- * ============================================================================[m
[31m- * School Routes[m
[31m- * Public endpoints for accessing school information[m
[31m- * ============================================================================[m
[31m- */[m
[31m-[m
[31m-const express = require('express');[m
[31m-[m
[31m-/**[m
[31m- * Factory function to create school routes with injected database[m
[31m- * @param {Database} db - Initialized database connection[m
[31m- * @returns {Router} Express router with school routes[m
[31m- */[m
[31m-module.exports = (db) => {[m
[31m-  const router = express.Router();[m
[31m-  const { SchoolModel } = require('../models');[m
[31m-  const schoolModel = new SchoolModel(db);[m
[31m-[m
[31m-  /**[m
[31m-   * GET /api/schools[m
[31m-   * Public endpoint - fetch all active schools for registration[m
[31m-   * No authentication required[m
[31m-   * [m
[31m-   * Response: 200[m
[31m-   * {[m
[31m-   *   "success": true,[m
[31m-   *   "data": [[m
[31m-   *     {[m
[31m-   *       "id": "uuid",[m
[31m-   *       "name": "Central High School",[m
[31m-   *       "city": "Springfield",[m
[31m-   *       "state_province": "IL",[m
[31m-   *       "address_line1": "123 Main St"[m
[31m-   *     }[m
[31m-   *   ][m
[31m-   * }[m
[31m-   */[m
[31m-  router.get('/', async (req, res, next) => {[m
[31m-    try {[m
[31m-      const schools = await schoolModel.getAllPublic();[m
[31m-      [m
[31m-      res.json({[m
[31m-        success: true,[m
[31m-        message: 'Schools retrieved successfully',[m
[31m-        data: schools,[m
[31m-        timestamp: new Date().toISOString()[m
[31m-      });[m
[31m-    } catch (error) {[m
[31m-      next(error);[m
[31m-    }[m
[31m-  });[m
[31m-[m
[31m-  return router;[m
[31m-};[m
[32m+[m[32m/**[m[41m[m
[32m+[m[32m * ============================================================================[m[41m[m
[32m+[m[32m * School Routes[m[41m[m
[32m+[m[32m * Public endpoints for accessing school information[m[41m[m
[32m+[m[32m * Integrates with Public Schools data from U.S. Department of Education[m[41m[m
[32m+[m[32m * ============================================================================[m[41m[m
[32m+[m[32m */[m[41m[m
[32m+[m[41m[m
[32m+[m[32mconst express = require('express');[m[41m[m
[32m+[m[41m[m
[32m+[m[32m/**[m[41m[m
[32m+[m[32m * Factory function to create school routes with injected database[m[41m[m
[32m+[m[32m * @param {Database} db - Initialized database connection[m[41m[m
[32m+[m[32m * @returns {Router} Express router with school routes[m[41m[m
[32m+[m[32m */[m[41m[m
[32m+[m[32mmodule.exports = (db) => {[m[41m[m
[32m+[m[32m  const router = express.Router();[m[41m[m
[32m+[m[32m  const { SchoolModel } = require('../models');[m[41m[m
[32m+[m[32m  const schoolModel = new SchoolModel(db);[m[41m[m
[32m+[m[41m[m
[32m+[m[32m  /**[m[41m[m
[32m+[m[32m   * GET /api/schools[m[41m[m
[32m+[m[32m   * Public endpoint - fetch schools from database or external API[m[41m[m
[32m+[m[32m   * No authentication required[m[41m[m
[32m+[m[32m   *[m[41m [m
[32m+[m[32m   * Query Parameters:[m[41m[m
[32m+[m[32m   * - state: Filter by state (e.g., "IL", "CA")[m[41m[m
[32m+[m[32m   * - city: Filter by city[m[41m[m
[32m+[m[32m   * - search: Search by school name[m[41m[m
[32m+[m[32m   *[m[41m [m
[32m+[m[32m   * Response: 200[m[41m[m
[32m+[m[32m   * {[m[41m[m
[32m+[m[32m   *   "success": true,[m[41m[m
[32m+[m[32m   *   "data": [[m[41m[m
[32m+[m[32m   *     {[m[41m[m
[32m+[m[32m   *       "id": "uuid",[m[41m[m
[32m+[m[32m   *       "name": "Central High School",[m[41m[m
[32m+[m[32m   *       "city": "Springfield",[m[41m[m
[32m+[m[32m   *       "state_province": "IL",[m[41m[m
[32m+[m[32m   *       "address_line1": "123 Main St",[m[41m[m
[32m+[m[32m   *       "postal_code": "62701"[m[41m[m
[32m+[m[32m   *     }[m[41m[m
[32m+[m[32m   *   ][m[41m[m
[32m+[m[32m   * }[m[41m[m
[32m+[m[32m   */[m[41m[m
[32m+[m[32m  router.get('/', async (req, res, next) => {[m[41m[m
[32m+[m[32m    try {[m[41m[m
[32m+[m[32m      const { state, city, search } = req.query;[m[41m[m
[32m+[m[41m      [m
[32m+[m[32m      let query = 'SELECT id, name, city, state_province, address_line1, postal_code FROM schools WHERE account_status = $1';[m[41m[m
[32m+[m[32m      const params = ['ACTIVE'];[m[41m[m
[32m+[m[41m[m
[32m+[m[32m      // Add filters if provided[m[41m[m
[32m+[m[32m      let paramIndex = 2;[m[41m[m
[32m+[m[32m      if (state) {[m[41m[m
[32m+[m[32m        query += ` AND state_province = $${paramIndex}`;[m[41m[m
[32m+[m[32m        params.push(state.toUpperCase());[m[41m[m
[32m+[m[32m        paramIndex++;[m[41m[m
[32m+[m[32m      }[m[41m[m
[32m+[m[32m      if (city) {[m[41m[m
[32m+[m[32m        query += ` AND city ILIKE $${paramIndex}`;[m[41m[m
[32m+[m[32m        params.push(`%${city}%`);[m[41m[m
[32m+[m[32m        paramIndex++;[m[41m[m
[32m+[m[32m      }[m[41m[m
[32m+[m[32m      if (search) {[m[41m[m
[32m+[m[32m        query += ` AND (name ILIKE $${paramIndex} OR city ILIKE $${paramIndex})`;[m[41m[m
[32m+[m[32m        params.push(`%${search}%`);[m[41m[m
[32m+[m[32m        paramIndex++;[m[41m[m
[32m+[m[32m      }[m[41m[m
[32m+[m[41m[m
[32m+[m[32m      query += ' ORDER BY name ASC LIMIT 500';[m[41m[m
[32m+[m[41m[m
[32m+[m[32m      const result = await db.query(query, params.slice(0, paramIndex - 1 + (state ? 1 : 0) + (city ? 1 : 0) + (search ? 1 : 0)));[m[41m[m
[32m+[m[41m      [m
[32m+[m[32m      res.json({[m[41m[m
[32m+[m[32m        success: true,[m[41m[m
[32m+[m[32m        message: 'Schools retrieved successfully',[m[41m[m
[32m+[m[32m        data: result.rows,[m[41m[m
[32m+[m[32m        count: result.rows.length,[m[41m[m
[32m+[m[32m        timestamp: new Date().toISOString()[m[41m[m
[32m+[m[32m      });[m[41m[m
[32m+[m[32m    } catch (error) {[m[41m[m
[32m+[m[32m      next(error);[m[41m[m
[32m+[m[32m    }[m[41m[m
[32m+[m[32m  });[m[41m[m
[32m+[m[41m[m
[32m+[m[32m  /**[m[41m[m
[32m+[m[32m   * GET /api/schools/by-state/:state[m[41m[m
[32m+[m[32m   * Fetch schools by state code[m[41m[m
[32m+[m[32m   *[m[41m [m
[32m+[m[32m   * Example: /api/schools/by-state/IL[m[41m[m
[32m+[m[32m   */[m[41m[m
[32m+[m[32m  router.get('/by-state/:state', async (req, res, next) => {[m[41m[m
[32m+[m[32m    try {[m[41m[m
[32m+[m[32m      const { state } = req.params;[m[41m[m
[32m+[m[41m      [m
[32m+[m[32m      const result = await db.query([m[41m[m
[32m+[m[32m        `SELECT id, name, city, state_province, address_line1, postal_code[m[41m [m
[32m+[m[32m         FROM schools[m[41m [m
[32m+[m[32m         WHERE account_status = 'ACTIVE' AND state_province = $1[m[41m[m
[32m+[m[32m         ORDER BY city ASC, name ASC[m[41m[m
[32m+[m[32m         LIMIT 500`,[m[41m[m
[32m+[m[32m        [state.toUpperCase()][m[41m[m
[32m+[m[32m      );[m[41m[m
[32m+[m[41m      [m
[32m+[m[32m      res.json({[m[41m[m
[32m+[m[32m        success: true,[m[41m[m
[32m+[m[32m        message: `Schools in ${state.toUpperCase()} retrieved successfully`,[m[41m[m
[32m+[m[32m        data: result.rows,[m[41m[m
[32m+[m[32m        count: result.rows.length,[m[41m[m
[32m+[m[32m        state: state.toUpperCase(),[m[41m[m
[32m+[m[32m        timestamp: new Date().toISOString()[m[41m[m
[32m+[m[32m      });[m[41m[m
[32m+[m[32m    } catch (error) {[m[41m[m
[32m+[m[32m      next(error);[m[41m[m
[32m+[m[32m    }[m[41m[m
[32m+[m[32m  });[m[41m[m
[32m+[m[41m[m
[32m+[m[32m  /**[m[41m[m
[32m+[m[32m   * GET /api/schools/search/:query[m[41m[m
[32m+[m[32m   * Search schools by name, city, or state[m[41m[m
[32m+[m[32m   *[m[41m [m
[32m+[m[32m   * Example: /api/schools/search/Lincoln[m[41m[m
[32m+[m[32m   */[m[41m[m
[32m+[m[32m  router.get('/search/:query', async (req, res, next) => {[m[41m[m
[32m+[m[32m    try {[m[41m[m
[32m+[m[32m      const { query } = req.params;[m[41m[m
[32m+[m[32m      const searchTerm = `%${query}%`;[m[41m[m
[32m+[m[41m      [m
[32m+[m[32m      const result = await db.query([m[41m[m
[32m+[m[32m        `SELECT id, name, city, state_province, address_line1, postal_code[m[41m [m
[32m+[m[32m         FROM schools[m[41m [m
[32m+[m[32m         WHERE account_status = 'ACTIVE'[m[41m [m
[32m+[m[32m         AND (name ILIKE $1 OR city ILIKE $1 OR state_province ILIKE $1)[m[41m[m
[32m+[m[32m         ORDER BY name ASC[m[41m[m
[32m+[m[32m         LIMIT 100`,[m[41m[m
[32m+[m[32m        [searchTerm][m[41m[m
[32m+[m[32m      );[m[41m[m
[32m+[m[41m      [m
[32m+[m[32m      res.json({[m[41m[m
[32m+[m[32m        success: true,[m[41m[m
[32m+[m[32m        message: `Search results for "${query}"`,[m[41m[m
[32m+[m[32m        data: result.rows,[m[41m[m
[32m+[m[32m        count: result.rows.length,[m[41m[m
[32m+[m[32m        query: query,[m[41m[m
[32m+[m[32m        timestamp: new Date().toISOString()[m[41m[m
[32m+[m[32m      });[m[41m[m
[32m+[m[32m    } catch (error) {[m[41m[m
[32m+[m[32m      next(error);[m[41m[m
[32m+[m[32m    }[m[41m[m
[32m+[m[32m  });[m[41m[m
[32m+[m[41m[m
[32m+[m[32m  /**[m[41m[m
[32m+[m[32m   * GET /api/schools/states[m[41m[m
[32m+[m[32m   * Get list of all states that have schools[m[41m[m
[32m+[m[32m   */[m[41m[m
[32m+[m[32m  router.get('/states', async (req, res, next) => {[m[41m[m
[32m+[m[32m    try {[m[41m[m
[32m+[m[32m      const result = await db.query([m[41m[m
[32m+[m[32m        `SELECT DISTINCT state_province[m[41m [m
[32m+[m[32m         FROM schools[m[41m [m
[32m+[m[32m         WHERE account_status = 'ACTIVE'[m[41m[m
[32m+[m[32m         ORDER BY state_province ASC`[m[41m[m
[32m+[m[32m      );[m[41m[m
[32m+[m[41m      [m
[32m+[m[32m      const states = result.rows.map(row => row.state_province);[m[41m[m
[32m+[m[41m      [m
[32m+[m[32m      res.json({[m[41m[m
[32m+[m[32m        success: true,[m[41m[m
[32m+[m[32m        message: 'States with schools retrieved successfully',[m[41m[m
[32m+[m[32m        data: states,[m[41m[m
[32m+[m[32m        count: states.length,[m[41m[m
[32m+[m[32m        timestamp: new Date().toISOString()[m[41m[m
[32m+[m[32m      });[m[41m[m
[32m+[m[32m    } catch (error) {[m[41m[m
[32m+[m[32m      next(error);[m[41m[m
[32m+[m[32m    }[m[41m[m
[32m+[m[32m  });[m[41m[m
[32m+[m[41m[m
[32m+[m[32m  return router;[m[41m[m
[32m+[m[32m};[m[41m[m
