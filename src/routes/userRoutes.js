/**
 * User Routes
 * Defines all user-related routes
 * Requires database instance to be passed as a function parameter
 */

const express = require('express');
const UserController = require('../controllers/userController');
const { UserModel } = require('../models');
const authenticationService = require('../services/authenticationService');

module.exports = (db) => {
  const router = express.Router();

  // Initialize controller with dependencies
  const userModel = new UserModel(db);
  const userController = new UserController(userModel, authenticationService);

  /**
   * GET /api/user/profile
   * Retrieve authenticated user's profile
   * Requires: Authorization header with valid JWT token
   * Returns: User profile data (non-sensitive fields)
   */
  router.get('/profile', (req, res, next) => {
    userController.getProfile(req, res, next);
  });

  return router;
};

