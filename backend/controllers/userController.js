const User = require('../models/User');
const Issue = require('../models/Issue');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClerkClient } = require('@clerk/backend');

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'super-secret-key', {
        expiresIn: process.env.JWT_EXPIRES_IN || '90d',
    });
};

// Badge tiers
function getBadge(points) {
    if (points >= 5000) return 'Civic Hero';
    if (points >= 2500) return 'Neighborhood Guardian';
    if (points >= 1000) return 'Verified Reporter';
    return 'Active Citizen';
}

// ─── Register (creates unverified user, Clerk handles OTP on frontend) ───
exports.register = catchAsync(async (req, res, next) => {
    const { name, email, password, phone, clerkUserId } = req.body;

    if (!name || !email || !password) {
        return next(new AppError('Please provide name, email, and password', 400));
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        if (!existingUser.isVerified) {
            // Update existing unverified user
            existingUser.name = name;
            existingUser.password_hash = password;
            if (clerkUserId) existingUser.clerkId = clerkUserId;
            await existingUser.save();

            return res.status(200).json({
                status: 'success',
                message: 'User updated. Complete Clerk verification to activate.',
                data: { email, requiresClerkVerification: true },
            });
        }
        return next(new AppError('Email already in use', 400));
    }

    // Create unverified user
    await User.create({
        name,
        email,
        password_hash: password,
        points: 10,
        isVerified: false,
        clerkId: clerkUserId || undefined,
    });

    res.status(201).json({
        status: 'success',
        message: 'User created. Complete Clerk email verification to activate your account.',
        data: { email, requiresClerkVerification: true },
    });
});

// ─── Clerk Verify (called after Clerk OTP success on frontend) ───
exports.clerkVerify = catchAsync(async (req, res, next) => {
    const { email, clerkUserId } = req.body;

    if (!email || !clerkUserId) {
        return next(new AppError('Please provide email and clerkUserId', 400));
    }

    // Verify the Clerk user actually exists and is verified via Clerk API
    try {
        const clerkUser = await clerk.users.getUser(clerkUserId);
        if (!clerkUser) {
            return next(new AppError('Clerk user not found', 404));
        }

        // Check that the Clerk user's primary email matches and is verified
        const primaryEmail = clerkUser.emailAddresses.find(
            (e) => e.emailAddress === email
        );
        if (!primaryEmail) {
            return next(new AppError('Email mismatch with Clerk account', 400));
        }
        // Clerk marks email as verified after OTP success
        if (primaryEmail.verification?.status !== 'verified') {
            return next(new AppError('Email not yet verified via Clerk', 400));
        }
    } catch (err) {
        console.error('Clerk verification error:', err.message);
        return next(new AppError('Failed to verify with Clerk', 500));
    }

    // Find and verify the local user
    const user = await User.findOne({ email });
    if (!user) {
        return next(new AppError('User not found. Please register first.', 404));
    }

    if (user.isVerified) {
        // Already verified — just issue token
        const token = signToken(user._id);
        return res.status(200).json({
            status: 'success',
            message: 'Account already verified.',
            token,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    points: user.points,
                },
            },
        });
    }

    // Mark as verified
    user.isVerified = true;
    user.clerkId = clerkUserId;
    await user.save();

    const token = signToken(user._id);

    // Send welcome email via SMTP
    try {
        const { sendWelcomeEmail } = require('../utils/emailService');
        await sendWelcomeEmail(user.email, user.name);
    } catch (e) {
        console.error('Failed to send welcome email:', e.message);
    }

    res.status(200).json({
        status: 'success',
        message: 'Account verified successfully!',
        token,
        data: {
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                points: user.points,
            },
        },
    });
});

// ─── Login ───
exports.login = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return next(new AppError('Please provide email and password', 400));
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
        return next(new AppError('Incorrect email or password', 401));
    }

    // Block unverified users
    if (!user.isVerified) {
        return res.status(403).json({
            status: 'fail',
            message: 'Account not verified. Please complete email verification via the registration page.',
            data: { email, requiresClerkVerification: true },
        });
    }

    const token = signToken(user._id);

    res.status(200).json({
        status: 'success',
        token,
        data: {
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                points: user.points,
                created_at: user.created_at,
            },
        },
    });
});

exports.getProfile = catchAsync(async (req, res, next) => {
    const userId = req.user._id;

    const user = await User.findById(userId).select('-password_hash');
    if (!user) {
        return next(new AppError('User not found', 404));
    }

    const totalReports = await Issue.countDocuments({ user_id: userId });

    res.status(200).json({
        status: 'success',
        data: {
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                points: user.points,
                created_at: user.created_at,
                total_reports: totalReports,
                badge: getBadge(user.points),
                isVerified: user.isVerified,
            },
        },
    });
});

exports.getLeaderboard = catchAsync(async (req, res, next) => {
    const users = await User.aggregate([
        { $match: { role: 'citizen', isVerified: true } },
        {
            $lookup: {
                from: 'issues',
                localField: '_id',
                foreignField: 'user_id',
                as: 'issues',
            },
        },
        {
            $project: {
                id: '$_id',
                name: 1,
                points: 1,
                reports: { $size: '$issues' },
            },
        },
        { $sort: { points: -1 } },
        { $limit: 20 },
    ]);

    const result = users.map((row) => ({
        id: String(row._id),
        name: row.name,
        points: row.points || 0,
        reports: row.reports || 0,
        badge: getBadge(row.points || 0),
    }));

    res.status(200).json({
        status: 'success',
        data: result,
    });
});
