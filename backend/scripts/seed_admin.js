/**
 * seed_admin.js — Seeds the admin user into MongoDB
 * Usage: node scripts/seed_admin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const ADMIN_EMAIL = 'weareteamclarity@gmail.com';
const ADMIN_PASSWORD = 'oxifin';
const ADMIN_NAME = 'CivicPulse Admin';

async function seedAdmin() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Check if admin already exists
        const existing = await User.findOne({ email: ADMIN_EMAIL });
        if (existing) {
            if (existing.role !== 'admin') {
                existing.role = 'admin';
                await existing.save();
                console.log(`✅ User "${ADMIN_EMAIL}" upgraded to admin role`);
            } else {
                console.log(`⏭️  Admin user "${ADMIN_EMAIL}" already exists`);
            }
        } else {
            // Hash password
            const salt = await bcrypt.genSalt(12);
            const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, salt);

            const admin = new User({
                name: ADMIN_NAME,
                email: ADMIN_EMAIL,
                password_hash: passwordHash,
                role: 'admin',
                points: 0,
            });

            await admin.save();
            console.log(`✅ Admin user created successfully!`);
            console.log(`   Email: ${ADMIN_EMAIL}`);
            console.log(`   Password: ${ADMIN_PASSWORD}`);
            console.log(`   Role: admin`);
        }
    } catch (err) {
        console.error('❌ Failed to seed admin:', err.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

seedAdmin();
