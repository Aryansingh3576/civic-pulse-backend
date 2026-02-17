/**
 * cleanup_citizens.js — Deletes all citizen users and their data from MongoDB
 * Usage: node scripts/cleanup_citizens.js
 *
 * This removes:
 * - All users with role='citizen'
 * - All issues created by those users
 * - All votes by those users
 * - All timeline entries for those issues
 *
 * Admin and worker users are preserved.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Issue = require('../models/Issue');
const Vote = require('../models/Vote');
const Timeline = require('../models/Timeline');

async function cleanup() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find all citizen users
        const citizens = await User.find({ role: 'citizen' });
        const citizenIds = citizens.map(u => u._id);

        console.log(`Found ${citizens.length} citizen users to remove.\n`);

        if (citizenIds.length === 0) {
            console.log('No citizen users found. Nothing to clean up.');
            await mongoose.disconnect();
            process.exit(0);
            return;
        }

        // Find all issues by citizens
        const issues = await Issue.find({ user_id: { $in: citizenIds } });
        const issueIds = issues.map(i => i._id);

        // Delete timeline entries for those issues
        const timelineResult = await Timeline.deleteMany({ issue_id: { $in: issueIds } });
        console.log(`🗑️  Deleted ${timelineResult.deletedCount} timeline entries`);

        // Delete votes by those users
        const voteResult = await Vote.deleteMany({ user_id: { $in: citizenIds } });
        console.log(`🗑️  Deleted ${voteResult.deletedCount} votes`);

        // Delete votes on those issues (by any user)
        const voteOnIssues = await Vote.deleteMany({ issue_id: { $in: issueIds } });
        console.log(`🗑️  Deleted ${voteOnIssues.deletedCount} additional votes on citizen issues`);

        // Delete all issues by citizens
        const issueResult = await Issue.deleteMany({ user_id: { $in: citizenIds } });
        console.log(`🗑️  Deleted ${issueResult.deletedCount} issues`);

        // Delete citizen users
        const userResult = await User.deleteMany({ role: 'citizen' });
        console.log(`🗑️  Deleted ${userResult.deletedCount} citizen users`);

        console.log('\n═══════════════════════════════════════');
        console.log('✅ Cleanup complete!');
        console.log('   Admin and worker users preserved.');
        console.log('═══════════════════════════════════════');
    } catch (err) {
        console.error('❌ Cleanup failed:', err.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

cleanup();
