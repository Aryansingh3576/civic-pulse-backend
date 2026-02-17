const User = require('../models/User');
const Issue = require('../models/Issue');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'super-secret-key', {
        expiresIn: process.env.JWT_EXPIRES_IN || '90d',
    });
};

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Badge tiers
function getBadge(points) {
    if (points >= 5000) return 'Civic Hero';
    if (points >= 2500) return 'Neighborhood Guardian';
    if (points >= 1000) return 'Verified Reporter';
    return 'Active Citizen';
}

// ─── Register (sends OTP, does NOT return token) ───
exports.register = catchAsync(async (req, res, next) => {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
        return next(new AppError('Please provide name, email, and password', 400));
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        // If user exists but is not verified, allow re-registration (resend OTP)
        if (!existingUser.isVerified) {
            const otp = generateOTP();
            existingUser.otp = otp;
            existingUser.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
            existingUser.name = name;
            existingUser.password_hash = password; // will be re-hashed by pre-save
            await existingUser.save();

            // Send OTP email
            try {
                const { sendOTPEmail } = require('../utils/emailService');
                await sendOTPEmail(email, otp, name);
            } catch (e) {
                console.error('Failed to send OTP email:', e.message);
            }

            return res.status(200).json({
                status: 'success',
                message: 'OTP resent to your email. Please verify to complete registration.',
                data: { email, requiresOTP: true },
            });
        }
        return next(new AppError('Email already in use', 400));
    }

    // Generate OTP
    const otp = generateOTP();

    // Create unverified user
    const newUser = await User.create({
        name,
        email,
        password_hash: password,
        points: 10,
        isVerified: false,
        otp,
        otpExpiry: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    });

    // Send OTP email
    try {
        const { sendOTPEmail } = require('../utils/emailService');
        await sendOTPEmail(email, otp, name);
    } catch (e) {
        console.error('Failed to send OTP email:', e.message);
    }

    res.status(201).json({
        status: 'success',
        message: 'Registration successful! Please check your email for the OTP to verify your account.',
        data: { email, requiresOTP: true },
    });
});

// ─── Verify OTP ───
exports.verifyOTP = catchAsync(async (req, res, next) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return next(new AppError('Please provide email and OTP', 400));
    }

    const user = await User.findOne({ email });
    if (!user) {
        return next(new AppError('User not found', 404));
    }

    if (user.isVerified) {
        return next(new AppError('Account is already verified', 400));
    }

    if (!user.otp || user.otp !== otp) {
        return next(new AppError('Invalid OTP. Please try again.', 400));
    }

    if (user.otpExpiry && user.otpExpiry < new Date()) {
        return next(new AppError('OTP has expired. Please register again.', 400));
    }

    // Verify user
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Generate token
    const token = signToken(user._id);

    // Send welcome email
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

// ─── Resend OTP ───
exports.resendOTP = catchAsync(async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        return next(new AppError('Please provide email', 400));
    }

    const user = await User.findOne({ email });
    if (!user) {
        return next(new AppError('User not found', 404));
    }

    if (user.isVerified) {
        return next(new AppError('Account is already verified', 400));
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    try {
        const { sendOTPEmail } = require('../utils/emailService');
        await sendOTPEmail(email, otp, user.name);
    } catch (e) {
        console.error('Failed to send OTP email:', e.message);
    }

    res.status(200).json({
        status: 'success',
        message: 'OTP resent successfully. Check your email.',
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
        // Resend OTP automatically
        const otp = generateOTP();
        user.otp = otp;
        user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        try {
            const { sendOTPEmail } = require('../utils/emailService');
            await sendOTPEmail(email, otp, user.name);
        } catch (e) {
            console.error('Failed to send OTP email:', e.message);
        }

        return res.status(403).json({
            status: 'fail',
            message: 'Account not verified. A new OTP has been sent to your email.',
            data: { email, requiresOTP: true },
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

    const user = await User.findById(userId).select('-password_hash -otp -otpExpiry');
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
