const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../utils/authMiddleware');

const router = express.Router();

// Public
router.post('/register', userController.register);
router.post('/verify-otp', userController.verifyOTP);
router.post('/resend-otp', userController.resendOTP);
router.post('/login', userController.login);
router.get('/leaderboard', userController.getLeaderboard);

// Protected
router.get('/profile', authMiddleware.protect, userController.getProfile);

module.exports = router;
