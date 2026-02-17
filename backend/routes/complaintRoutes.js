const express = require('express');
const complaintController = require('../controllers/complaintController');
const authMiddleware = require('../utils/authMiddleware');

const router = express.Router();

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

router.get('/:id', complaintController.getComplaintById);
router.get('/:id/timeline', complaintController.getTimeline);

// Protected
router.post('/', authMiddleware.protect, complaintController.createComplaint);
router.get('/mine', authMiddleware.protect, complaintController.getMyComplaints);
router.get('/notifications', authMiddleware.protect, complaintController.getNotifications);
router.post('/:id/upvote', authMiddleware.protect, complaintController.upvoteComplaint);
router.patch('/:id/status', authMiddleware.protect, complaintController.updateStatus);
router.get('/user/fraud-check', authMiddleware.protect, complaintController.checkFraud);

module.exports = router;
