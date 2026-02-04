/**
 * Routes Index
 * Aggregates and exports all application routes
 */

const express = require('express');
const userRoutes = require('./userRoutes');
const auctionRoutes = require('./auctionRoutes');
const bidRoutes = require('./bidRoutes');
const teacherRoutes = require('./teacherRoutes');

const router = express.Router();

router.use('/users', userRoutes);
router.use('/auctions', auctionRoutes);
router.use('/bids', bidRoutes);
router.use('/teacher', teacherRoutes);

module.exports = router;
