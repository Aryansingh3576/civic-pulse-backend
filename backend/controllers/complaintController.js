const Issue = require('../models/Issue');
const Category = require('../models/Category');
const User = require('../models/User');
const Vote = require('../models/Vote');
const Timeline = require('../models/Timeline');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { logEvent } = require('../utils/timelineLogger');

// Strict check for valid MongoDB ObjectId (24-char hex string)
function isObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(id);
}

exports.createComplaint = catchAsync(async (req, res, next) => {
    const { title, description, category, category_id, latitude, longitude, photo_url, address, is_public, is_anonymous } = req.body;
    const userId = req.user._id;

    // Resolve category_id and get SLA
    let resolvedCategoryId = category_id;
    let slaHours = 24;

    if (category_id) {
        const cat = await Category.findById(category_id);
        if (cat) slaHours = cat.sla_hours;
    } else if (category) {
        const cat = await Category.findOne({ name: { $regex: new RegExp(category, 'i') } });
        if (cat) {
            resolvedCategoryId = cat._id;
            slaHours = cat.sla_hours;
        }
    }

    // Calculate Deadline
    const deadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    // Basic validation
    if (!title && !description) {
        return next(new AppError('Please provide a title or description for the complaint', 400));
    }

    // Check complaint limit (10 per day)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const complaintCount = await Issue.countDocuments({
        user_id: userId,
        created_at: { $gte: todayStart },
    });

    if (complaintCount >= 10) {
        return next(new AppError('You have reached the daily limit of 10 complaints.', 429));
    }

    const complaintTitle = title || (description ? description.substring(0, 80) : 'Untitled Report');

    // Create issue
    const newIssue = await Issue.create({
        user_id: userId,
        category_id: resolvedCategoryId || undefined,
        title: complaintTitle,
        description: description || '',
        latitude: latitude || undefined,
        longitude: longitude || undefined,
        address: address || '',
        photo_url: photo_url || undefined,
        sla_deadline: deadline,
        is_public: is_public || false,
        is_anonymous: is_anonymous || false,
    });

    // Award +10 gamification points
    await User.findByIdAndUpdate(userId, { $inc: { points: 10 } });

    // Log Creation Event
    await logEvent(newIssue._id, userId, 'Created', 'Report submitted successfully');

    // Send emails (non-blocking)
    try {
        const { sendComplaintConfirmation, sendAdminAlert } = require('../utils/emailService');
        const reporter = await User.findById(userId);
        if (reporter) {
            sendComplaintConfirmation(reporter.email, newIssue).catch(console.error);
        }
        sendAdminAlert(newIssue).catch(console.error);
    } catch (e) {
        console.error('Email service not configured:', e.message);
    }

    res.status(201).json({
        status: 'success',
        data: {
            complaint: {
                id: newIssue._id,
                title: newIssue.title,
                status: newIssue.status,
                priority: newIssue.priority,
                created_at: newIssue.created_at,
            },
        },
    });
});

exports.getAllComplaints = catchAsync(async (req, res, next) => {
    const issues = await Issue.find()
        .populate('category_id', 'name department')
        .populate('user_id', 'name email')
        .sort({ created_at: -1 })
        .lean();

    const complaints = issues.map((i) => ({
        id: i._id,
        title: i.title,
        description: i.description,
        status: i.status,
        priority: i.priority,
        priority_score: i.priority_score,
        address: i.address,
        photo_url: i.photo_url,
        upvotes: i.upvotes,
        created_at: i.created_at,
        updated_at: i.updated_at,
        sla_deadline: i.sla_deadline,
        category: i.category_id?.name || 'General',
        department: i.category_id?.department || null,
        reporter_name: i.user_id?.name || 'Anonymous',
        latitude: i.latitude,
        longitude: i.longitude,
    }));

    res.status(200).json({
        status: 'success',
        results: complaints.length,
        data: { complaints },
    });
});

exports.getComplaintById = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    let issue;
    if (isObjectId(id)) {
        issue = await Issue.findById(id)
            .populate('category_id', 'name department sla_hours')
            .populate('user_id', 'name email')
            .lean();
    }
    // Fallback: try finding by legacy SQLite id
    if (!issue && /^\d+$/.test(id)) {
        issue = await Issue.findOne({ _sqlite_id: parseInt(id) })
            .populate('category_id', 'name department sla_hours')
            .populate('user_id', 'name email')
            .lean();
    }

    if (!issue) {
        return next(new AppError('Complaint not found', 404));
    }

    let fraudFlags = [];

    // Admin-only Fraud Check (only if authenticated user is admin/worker)
    if (req.user && (req.user.role === 'admin' || req.user.role === 'worker')) {
        const reporterId = issue.user_id?._id;

        // 1. High Velocity Submission
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        const recentCount = await Issue.countDocuments({
            user_id: reporterId,
            created_at: { $gte: tenMinAgo },
        });
        if (recentCount > 5) {
            fraudFlags.push({ type: 'rate_limit', message: 'High submission rate (Potential Spam)' });
        }

        // 2. Duplicate Titles
        const dupCount = await Issue.countDocuments({
            user_id: reporterId,
            title: issue.title,
        });
        if (dupCount > 1) {
            fraudFlags.push({ type: 'duplicate', message: 'User has submitted multiple reports with this title' });
        }
    }

    // Determine viewer's relationship to this complaint
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'worker');
    const isOwner = req.user && issue.user_id?._id?.toString() === req.user._id?.toString();
    const canSeeReporterDetails = isAdmin || isOwner;

    // Build reporter info based on privacy rules
    let reporterName, reporterEmail, reporterUserId;
    if (canSeeReporterDetails) {
        // Admins and owners always see full details
        reporterName = issue.user_id?.name || 'Anonymous';
        reporterEmail = issue.user_id?.email || null;
        reporterUserId = issue.user_id?._id || null;
    } else if (issue.is_anonymous) {
        // Anonymous complaints hide everything for public viewers
        reporterName = 'Anonymous Citizen';
        reporterEmail = null;
        reporterUserId = null;
    } else {
        // Non-anonymous: show name but hide email for public
        reporterName = issue.user_id?.name || 'Anonymous';
        reporterEmail = null;
        reporterUserId = null;
    }

    const complaint = {
        id: issue._id,
        user_id: reporterUserId,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        priority_score: issue.priority_score,
        address: issue.address,
        photo_url: issue.photo_url,
        upvotes: issue.upvotes,
        latitude: issue.latitude,
        longitude: issue.longitude,
        resolution_photo_url: issue.resolution_photo_url,
        resolution_type: issue.resolution_type,
        is_escalated: issue.is_escalated,
        is_anonymous: issue.is_anonymous,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        sla_deadline: issue.sla_deadline,
        category: issue.category_id?.name || 'General',
        department: issue.category_id?.department || null,
        sla_hours: issue.category_id?.sla_hours || 24,
        reporter_name: reporterName,
        reporter_email: reporterEmail,
        fraud_flags: canSeeReporterDetails ? fraudFlags : [],
    };

    res.status(200).json({
        status: 'success',
        data: { complaint },
    });
});

exports.getMyComplaints = catchAsync(async (req, res, next) => {
    const userId = req.user._id;

    const issues = await Issue.find({ user_id: userId })
        .populate('category_id', 'name')
        .sort({ created_at: -1 })
        .lean();

    const complaints = issues.map((i) => ({
        id: i._id,
        title: i.title,
        description: i.description,
        status: i.status,
        priority: i.priority,
        priority_score: i.priority_score,
        address: i.address,
        photo_url: i.photo_url,
        upvotes: i.upvotes,
        created_at: i.created_at,
        updated_at: i.updated_at,
        sla_deadline: i.sla_deadline,
        category: i.category_id?.name || 'General',
    }));

    res.status(200).json({
        status: 'success',
        results: complaints.length,
        data: { complaints },
    });
});

exports.getStats = catchAsync(async (req, res, next) => {
    const [total, submitted, inProgress, resolved, closed, escalated] = await Promise.all([
        Issue.countDocuments(),
        Issue.countDocuments({ status: 'Submitted' }),
        Issue.countDocuments({ status: 'In Progress' }),
        Issue.countDocuments({ status: 'Resolved' }),
        Issue.countDocuments({ status: 'Closed' }),
        Issue.countDocuments({ is_escalated: true }),
    ]);

    res.status(200).json({
        status: 'success',
        data: { total, submitted, in_progress: inProgress, resolved, closed, escalated },
    });
});

// ─── Upvote a complaint ───
exports.upvoteComplaint = catchAsync(async (req, res, next) => {
    const issueId = req.params.id;
    const userId = req.user._id;

    let issue;
    if (isObjectId(issueId)) {
        issue = await Issue.findById(issueId);
    }
    // Fallback: try finding by legacy SQLite id
    if (!issue && /^\d+$/.test(issueId)) {
        issue = await Issue.findOne({ _sqlite_id: parseInt(issueId) });
    }
    if (!issue) {
        return next(new AppError('Issue not found', 404));
    }

    const realId = issue._id; // Always use the MongoDB _id for vote operations

    // Check if already voted
    const existingVote = await Vote.findOne({ issue_id: realId, user_id: userId });

    if (existingVote) {
        // Remove vote (toggle)
        await Vote.deleteOne({ _id: existingVote._id });
        await Issue.findByIdAndUpdate(realId, { $inc: { upvotes: -1 } });
        return res.status(200).json({ status: 'success', message: 'Vote removed', voted: false });
    }

    // Insert vote
    await Vote.create({ issue_id: realId, user_id: userId });
    await Issue.findByIdAndUpdate(realId, { $inc: { upvotes: 1 } });

    // Award +5 points
    await User.findByIdAndUpdate(userId, { $inc: { points: 5 } });

    res.status(201).json({ status: 'success', message: 'Vote added', voted: true });
});

// ─── Update complaint status (admin only) ───
exports.updateStatus = catchAsync(async (req, res, next) => {
    const paramId = req.params.id;
    const { status: newStatus, resolution_photo_url } = req.body;
    const validStatuses = ['Submitted', 'Assigned', 'In Progress', 'Resolved', 'Closed'];

    if (!newStatus || !validStatuses.includes(newStatus)) {
        return next(new AppError('Invalid status. Must be one of: ' + validStatuses.join(', '), 400));
    }

    // Require resolution photo when resolving
    if (newStatus === 'Resolved' && !resolution_photo_url) {
        return next(new AppError('A resolution photo is required when marking a complaint as Resolved.', 400));
    }

    if (req.user.role !== 'admin' && req.user.role !== 'worker') {
        return next(new AppError('Only admins can update complaint status', 403));
    }

    // Resolve the real MongoDB _id
    let issueId = paramId;
    if (!isObjectId(paramId) && /^\d+$/.test(paramId)) {
        const found = await Issue.findOne({ _sqlite_id: parseInt(paramId) }).select('_id');
        if (found) issueId = found._id;
    }

    const updateData = {
        status: newStatus,
        updated_at: new Date(),
    };

    if (resolution_photo_url) {
        updateData.resolution_photo_url = resolution_photo_url;
    }

    if (newStatus === 'Resolved') {
        updateData.resolved_at = new Date();
    }

    const updatedIssue = await Issue.findByIdAndUpdate(issueId, updateData, { new: true });

    if (!updatedIssue) {
        return next(new AppError('Issue not found', 404));
    }

    // Log Status Change
    await logEvent(issueId, req.user._id, 'Status Update', `Status changed to ${newStatus}`);

    // Award +50 points to reporter when resolved
    if (newStatus === 'Resolved') {
        await User.findByIdAndUpdate(updatedIssue.user_id, { $inc: { points: 50 } });
    }

    // Send status update email (non-blocking)
    try {
        const { sendStatusUpdate } = require('../utils/emailService');
        const reporter = await User.findById(updatedIssue.user_id);
        if (reporter) {
            sendStatusUpdate(reporter.email, updatedIssue, newStatus).catch(console.error);
        }
    } catch (e) {
        console.error('Email service not configured:', e.message);
    }

    res.status(200).json({
        status: 'success',
        data: {
            id: updatedIssue._id,
            status: updatedIssue.status,
            updated_at: updatedIssue.updated_at,
            resolution_photo_url: updatedIssue.resolution_photo_url,
        },
    });
});

// ─── Analytics ───
exports.getAnalytics = catchAsync(async (req, res, next) => {
    // Category breakdown
    const byCategory = await Issue.aggregate([
        { $lookup: { from: 'categories', localField: 'category_id', foreignField: '_id', as: 'cat' } },
        { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
        { $group: { _id: '$cat.name', count: { $sum: 1 } } },
        { $project: { category: { $ifNull: ['$_id', 'Uncategorized'] }, count: 1, _id: 0 } },
        { $sort: { count: -1 } },
    ]);

    // Status distribution
    const byStatus = await Issue.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
    ]);

    // Monthly trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrends = await Issue.aggregate([
        { $match: { created_at: { $gte: sixMonthsAgo } } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$created_at' } },
                total: { $sum: 1 },
                resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } },
            },
        },
        { $project: { month: '$_id', total: 1, resolved: 1, _id: 0 } },
        { $sort: { month: 1 } },
    ]);

    // Top areas
    const topAreas = await Issue.aggregate([
        { $match: { address: { $ne: null, $ne: '' } } },
        { $group: { _id: '$address', count: { $sum: 1 } } },
        { $project: { address: '$_id', count: 1, _id: 0 } },
        { $sort: { count: -1 } },
        { $limit: 5 },
    ]);

    res.status(200).json({
        status: 'success',
        data: { byCategory, byStatus, monthlyTrends, topAreas },
    });
});

// ─── Check for duplicate complaints ───
exports.checkDuplicate = catchAsync(async (req, res, next) => {
    const { category, latitude, longitude, title } = req.body;

    if (!latitude || !longitude) {
        return res.status(200).json({ status: 'success', data: { duplicates: [] } });
    }

    // Find complaints within ~1km (0.009 degrees ≈ 1km)
    const duplicates = await Issue.find({
        latitude: { $gte: latitude - 0.009, $lte: latitude + 0.009 },
        longitude: { $gte: longitude - 0.009, $lte: longitude + 0.009 },
        status: { $nin: ['Resolved', 'Closed'] },
    })
        .populate('category_id', 'name')
        .sort({ upvotes: -1 })
        .limit(5)
        .lean();

    const result = duplicates.map((d) => ({
        id: d._id,
        title: d.title,
        description: d.description,
        status: d.status,
        upvotes: d.upvotes,
        address: d.address,
        photo_url: d.photo_url,
        created_at: d.created_at,
        category: d.category_id?.name || 'General',
    }));

    res.status(200).json({
        status: 'success',
        data: { duplicates: result },
    });
});

// ─── Heatmap data for Red Zone visualization ───
exports.getHeatmapData = catchAsync(async (req, res, next) => {
    const period = parseInt(req.query.period) || 30;
    const cutoff = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

    const points = await Issue.aggregate([
        {
            $match: {
                latitude: { $ne: null },
                longitude: { $ne: null },
                created_at: { $gte: cutoff },
            },
        },
        {
            $lookup: { from: 'categories', localField: 'category_id', foreignField: '_id', as: 'cat' },
        },
        { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                latitude: 1,
                longitude: 1,
                status: 1,
                priority_score: 1,
                category: '$cat.name',
                created_at: 1,
            },
        },
    ]);

    // Most neglected areas
    const neglected = await Issue.aggregate([
        { $match: { status: { $nin: ['Resolved', 'Closed'] }, address: { $ne: '', $ne: null } } },
        {
            $group: {
                _id: '$address',
                count: { $sum: 1 },
                oldest: { $min: '$created_at' },
            },
        },
        {
            $project: {
                address: '$_id',
                count: 1,
                oldest_days: {
                    $floor: { $divide: [{ $subtract: [new Date(), '$oldest'] }, 86400000] },
                },
                _id: 0,
            },
        },
        { $sort: { count: -1, oldest_days: -1 } },
        { $limit: 10 },
    ]);

    // Category dominance per area
    const dominance = await Issue.aggregate([
        {
            $match: {
                address: { $ne: '', $ne: null },
                created_at: { $gte: cutoff },
            },
        },
        {
            $lookup: { from: 'categories', localField: 'category_id', foreignField: '_id', as: 'cat' },
        },
        { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
        {
            $group: { _id: { address: '$address', category: '$cat.name' }, count: { $sum: 1 } },
        },
        {
            $project: { address: '$_id.address', category: '$_id.category', count: 1, _id: 0 },
        },
        { $sort: { count: -1 } },
        { $limit: 20 },
    ]);

    res.status(200).json({
        status: 'success',
        data: {
            points,
            neglectedAreas: neglected,
            categoryDominance: dominance,
        },
    });
});

// ─── Fraud detection scoring ───
exports.checkFraud = catchAsync(async (req, res, next) => {
    const userId = req.user._id;
    const flags = [];

    // Rule 1: More than 5 reports in last 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentCount = await Issue.countDocuments({
        user_id: userId,
        created_at: { $gte: tenMinAgo },
    });
    if (recentCount >= 5) {
        flags.push({ type: 'rate_limit', severity: 'high', message: 'Unusually high submission rate' });
    }

    // Rule 2: Duplicate titles
    const dupTitles = await Issue.aggregate([
        { $match: { user_id: userId } },
        { $group: { _id: '$title', count: { $sum: 1 } } },
        { $match: { count: { $gt: 2 } } },
    ]);
    if (dupTitles.length > 0) {
        flags.push({ type: 'duplicate_title', severity: 'medium', message: 'Multiple complaints with identical titles' });
    }

    res.status(200).json({
        status: 'success',
        data: { flags, isFlagged: flags.length > 0 },
    });
});

exports.getTimeline = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    // Resolve real MongoDB _id if legacy integer ID is used
    let issueId = id;
    if (!isObjectId(id) && /^\d+$/.test(id)) {
        const found = await Issue.findOne({ _sqlite_id: parseInt(id) }).select('_id');
        if (found) issueId = found._id;
    }

    const timeline = await Timeline.find({ issue_id: issueId })
        .populate('user_id', 'name role')
        .sort({ created_at: -1 })
        .lean();

    const result = timeline.map((t) => ({
        id: t._id,
        issue_id: t.issue_id,
        user_id: t.user_id?._id,
        user_name: t.user_id?.name,
        user_role: t.user_id?.role,
        action: t.action,
        details: t.details,
        created_at: t.created_at,
    }));

    res.status(200).json({
        status: 'success',
        data: { timeline: result },
    });
});

// ─── Community Feed (public issues only) ───
exports.getCommunityFeed = catchAsync(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const sort = req.query.sort || 'newest'; // newest, most_voted
    const category = req.query.category;

    const filter = {};
    if (category && category !== 'all') {
        const cat = await Category.findOne({ name: { $regex: new RegExp(category, 'i') } });
        if (cat) filter.category_id = cat._id;
    }

    const sortBy = sort === 'most_voted' ? { upvotes: -1 } : { created_at: -1 };

    const [issues, total] = await Promise.all([
        Issue.find(filter)
            .populate('category_id', 'name')
            .populate('user_id', 'name')
            .sort(sortBy)
            .skip(skip)
            .limit(limit)
            .lean(),
        Issue.countDocuments(filter),
    ]);

    const posts = issues.map((i) => ({
        id: i._id,
        title: i.title,
        description: i.description,
        status: i.status,
        category: i.category_id?.name || 'General',
        address: i.address,
        photo_url: i.photo_url,
        upvotes: i.upvotes,
        created_at: i.created_at,
        // If anonymous, hide reporter name
        reporter_name: i.is_anonymous ? 'Anonymous Citizen' : (i.user_id?.name || 'Anonymous'),
        is_anonymous: i.is_anonymous,
    }));

    res.status(200).json({
        status: 'success',
        results: posts.length,
        total,
        page,
        pages: Math.ceil(total / limit),
        data: { posts },
    });
});

// ─── Dynamic Notifications for Authenticated User ───
exports.getNotifications = catchAsync(async (req, res, next) => {
    const userId = req.user._id;

    // Get user's issues
    const userIssues = await Issue.find({ user_id: userId }).select('_id title').lean();
    const issueIds = userIssues.map((i) => i._id);
    const issueTitleMap = {};
    userIssues.forEach((i) => { issueTitleMap[i._id.toString()] = i.title; });

    // Get timeline events for those issues (last 50)
    const events = await Timeline.find({ issue_id: { $in: issueIds } })
        .sort({ created_at: -1 })
        .limit(50)
        .lean();

    // Get upvote count changes (votes on user's issues)
    const recentVotes = await Vote.find({ issue_id: { $in: issueIds } })
        .sort({ created_at: -1 })
        .limit(20)
        .lean();

    // Map timeline events to notifications
    const notifications = events.map((e) => {
        const issueTitle = issueTitleMap[e.issue_id?.toString()] || 'Your complaint';
        let type = 'system';
        let title = 'Update';
        let message = e.description || '';

        if (e.event_type === 'status_change') {
            type = 'status_change';
            const newStatus = e.new_value || '';
            if (newStatus === 'Resolved') {
                type = 'resolution';
                title = 'Issue Resolved!';
                message = `"${issueTitle}" has been resolved.`;
            } else if (newStatus === 'Assigned') {
                title = 'Assigned to Worker';
                message = `"${issueTitle}" has been assigned to a department worker.`;
            } else if (newStatus === 'In Progress') {
                title = 'Work Started';
                message = `"${issueTitle}" is now being worked on.`;
            } else if (newStatus === 'Closed') {
                title = 'Issue Closed';
                message = `"${issueTitle}" has been closed.`;
            } else {
                title = 'Status Updated';
                message = `"${issueTitle}" status changed to ${newStatus}.`;
            }
        } else if (e.event_type === 'created') {
            type = 'system';
            title = 'Report Submitted';
            message = `Your report "${issueTitle}" was successfully submitted.`;
        } else if (e.event_type === 'escalated') {
            type = 'status_change';
            title = 'Escalated!';
            message = `SLA deadline passed — "${issueTitle}" has been escalated.`;
        }

        return {
            id: e._id,
            type,
            title,
            message,
            time: e.created_at,
            read: false,
            link: `/dashboard/${e.issue_id}`,
        };
    });

    // Add upvote notifications (group by issue)
    const votesByIssue = {};
    recentVotes.forEach((v) => {
        const key = v.issue_id?.toString();
        if (!votesByIssue[key]) votesByIssue[key] = { count: 0, latest: v.created_at };
        votesByIssue[key].count++;
        if (v.created_at > votesByIssue[key].latest) votesByIssue[key].latest = v.created_at;
    });

    Object.keys(votesByIssue).forEach((issueId) => {
        const title = issueTitleMap[issueId] || 'Your complaint';
        const data = votesByIssue[issueId];
        notifications.push({
            id: `vote_${issueId}`,
            type: 'upvote',
            title: 'New Upvotes!',
            message: `"${title}" received ${data.count} new upvote${data.count > 1 ? 's' : ''}.`,
            time: data.latest,
            read: false,
            link: `/dashboard/${issueId}`,
        });
    });

    // Sort by time descending
    notifications.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.status(200).json({
        status: 'success',
        data: { notifications: notifications.slice(0, 30) },
    });
});

// ─── Public Stats for Homepage ───
exports.getPublicStats = catchAsync(async (req, res, next) => {
    const [totalComplaints, resolvedCount, userCount] = await Promise.all([
        Issue.countDocuments(),
        Issue.countDocuments({ status: { $in: ['Resolved', 'Closed'] } }),
        User.distinct('_id', { role: 'citizen' }).then((ids) => ids.length),
    ]);

    res.status(200).json({
        status: 'success',
        data: {
            total_complaints: totalComplaints,
            resolved: resolvedCount,
            active_citizens: userCount,
        },
    });
});

