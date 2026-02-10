/**
 * ============================================================================
 * School Routes
 * Public endpoints for accessing school information
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
   * Public endpoint - fetch all active schools for registration
   * No authentication required
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
   *       "address_line1": "123 Main St"
   *     }
   *   ]
   * }
   */
  router.get('/', async (req, res, next) => {
    try {
      const schools = await schoolModel.getAllPublic();
      
      res.json({
        success: true,
        message: 'Schools retrieved successfully',
        data: schools,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
