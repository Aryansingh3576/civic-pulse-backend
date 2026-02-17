/**
 * cleanup_admins.js — Deletes all admin users EXCEPT weareteamclarity@gmail.com
 * Usage: node scripts/cleanup_admins.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function cleanup() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find admins to remove (exclude the team email)
        const adminsToRemove = await User.find({
            role: 'admin',
            email: { $ne: 'weareteamclarity@gmail.com' },
        });

        console.log(`Found ${adminsToRemove.length} admin(s) to remove (keeping weareteamclarity@gmail.com).\n`);

        if (adminsToRemove.length === 0) {
            console.log('No extra admin users found. Nothing to clean up.');
        } else {
            adminsToRemove.forEach((a) => console.log(`  ❌ ${a.email} (${a.name})`));
            const result = await User.deleteMany({
                role: 'admin',
                email: { $ne: 'weareteamclarity@gmail.com' },
            });
            console.log(`\n🗑️  Deleted ${result.deletedCount} admin user(s)`);
        }

        // Verify the kept admin
        const kept = await User.findOne({ email: 'weareteamclarity@gmail.com' });
        if (kept) {
            console.log(`\n✅ Preserved: ${kept.email} (${kept.name}) — role: ${kept.role}`);
        } else {
            console.log('\n⚠️  weareteamclarity@gmail.com not found in database.');
        }

        console.log('\n═══════════════════════════════════════');
        console.log('✅ Admin cleanup complete!');
        console.log('═══════════════════════════════════════');
    } catch (err) {
        console.error('❌ Cleanup failed:', err.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

cleanup();
