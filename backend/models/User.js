const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    role: { type: String, enum: ['citizen', 'admin', 'worker'], default: 'citizen' },
    points: { type: Number, default: 0 },
    // OTP verification
    isVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpiry: { type: Date },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password_hash')) return next();
    // Only hash if it's not already hashed (for migration)
    if (this.password_hash.startsWith('$2')) return next();
    const salt = await bcrypt.genSalt(12);
    this.password_hash = await bcrypt.hash(this.password_hash, salt);
    next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password_hash);
};

module.exports = mongoose.model('User', userSchema);
