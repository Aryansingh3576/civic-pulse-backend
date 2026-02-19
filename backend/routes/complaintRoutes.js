const express = require('express');
const complaintController = require('../controllers/complaintController');
const authMiddleware = require('../utils/authMiddleware');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Optional auth — populates req.user if token exists, but doesn't block
const optionalAuth = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key');
            const user = await User.findById(decoded.id).select('-password_hash');
            if (user) req.user = user;
        }
    } catch (e) { /* ignore — just means no auth */ }
    next();
};

// Public
router.get('/', complaintController.getAllComplaints);
router.get('/community', complaintController.getCommunityFeed);
router.get('/stats', complaintController.getStats);
router.get('/public-stats', complaintController.getPublicStats);
router.get('/analytics', complaintController.getAnalytics);
router.get('/heatmap', complaintController.getHeatmapData);
router.post('/check-duplicate', complaintController.checkDuplicate);

// Image verification (public — used before submission)
router.post('/verify-image', async (req, res) => {
    try {
        const { image, category, description } = req.body;
        if (!image) {
            return res.status(400).json({ status: 'fail', message: 'Image data is required' });
        }
        const { verifyImage } = require('../utils/imageVerifier');
        const result = await verifyImage(image, category || 'Other', description || '');
        res.status(200).json({ status: 'success', data: result });
    } catch (err) {
        console.error('Image verification error:', err.message);
        res.status(200).json({
            status: 'success',
            data: {
                isRelevant: true,
                confidence: 0,
                detectedIssue: 'Verification unavailable',
                suggestedCategory: 'Other',
                explanation: 'Service temporarily unavailable',
            },
        });
    }
});

// Text-based issue classification (public — used before/during submission)
router.post('/classify-text', async (req, res) => {
    try {
        const { title, description } = req.body;
        if (!title && !description) {
            return res.status(400).json({ status: 'fail', message: 'Title or description is required' });
        }
        const { classifyText } = require('../utils/textCategorizer');
        const result = await classifyText(title || '', description || '');
        res.status(200).json({ status: 'success', data: result });
    } catch (err) {
        console.error('Text classification error:', err.message);
        res.status(200).json({
            status: 'success',
            data: {
                suggestedCategory: 'Other',
                severity: 'Medium',
                confidence: 0,
                explanation: 'Service temporarily unavailable',
            },
        });
    }
});

// Protected (these MUST come before /:id to avoid being caught by the wildcard)
router.post('/', authMiddleware.protect, complaintController.createComplaint);
router.get('/mine', authMiddleware.protect, complaintController.getMyComplaints);
router.get('/notifications', authMiddleware.protect, complaintController.getNotifications);
router.get('/user/fraud-check', authMiddleware.protect, complaintController.checkFraud);

// Parameterized routes (must come AFTER all literal routes)
router.get('/:id', optionalAuth, complaintController.getComplaintById);
router.get('/:id/timeline', complaintController.getTimeline);
router.post('/:id/upvote', authMiddleware.protect, complaintController.upvoteComplaint);
router.patch('/:id/status', authMiddleware.protect, complaintController.updateStatus);

module.exports = router;
