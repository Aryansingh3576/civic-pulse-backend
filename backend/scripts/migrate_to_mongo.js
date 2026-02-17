/**
 * migrate_to_mongo.js — Migrates all data from SQLite (database.sqlite) to MongoDB
 * Usage: node scripts/migrate_to_mongo.js
 *
 * This script reads the existing SQLite database and inserts all records
 * into MongoDB collections. It preserves relationships using ID mappings.
 * The SQLite database file is NOT deleted.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const User = require('../models/User');
const Category = require('../models/Category');
const Issue = require('../models/Issue');
const Vote = require('../models/Vote');
const SensitiveZone = require('../models/SensitiveZone');

const DB_PATH = path.resolve(__dirname, '../database.sqlite');

function queryAll(db, sql) {
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function migrate() {
    console.log('🔄 Starting SQLite → MongoDB migration...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Open SQLite
    const sqliteDb = new sqlite3.Database(DB_PATH);
    console.log('✅ Opened SQLite database:', DB_PATH, '\n');

    // ID mappings: SQLite ID → MongoDB ObjectId
    const userIdMap = {};
    const categoryIdMap = {};
    const issueIdMap = {};

    try {
        // ── 1. Migrate Categories ──
        console.log('📂 Migrating categories...');
        const categories = await queryAll(sqliteDb, 'SELECT * FROM categories');
        for (const cat of categories) {
            const existing = await Category.findOne({ name: cat.name });
            if (existing) {
                categoryIdMap[cat.id] = existing._id;
                console.log(`   ⏭️  Category "${cat.name}" already exists, skipped`);
            } else {
                const newCat = await Category.create({
                    name: cat.name,
                    department: cat.department,
                    sla_hours: cat.sla_hours,
                    base_priority: cat.base_priority,
                    _sqlite_id: cat.id,
                });
                categoryIdMap[cat.id] = newCat._id;
                console.log(`   ✅ Category "${cat.name}" migrated`);
            }
        }
        console.log(`   → ${categories.length} categories processed\n`);

        // ── 2. Migrate Users ──
        console.log('👤 Migrating users...');
        const users = await queryAll(sqliteDb, 'SELECT * FROM users');
        for (const user of users) {
            const existing = await User.findOne({ email: user.email });
            if (existing) {
                userIdMap[user.id] = existing._id;
                console.log(`   ⏭️  User "${user.email}" already exists, skipped`);
            } else {
                const newUser = new User({
                    name: user.name,
                    email: user.email,
                    password_hash: user.password_hash, // already hashed
                    role: user.role || 'citizen',
                    points: user.points || 0,
                });
                // Skip pre-save hash since password_hash is already bcrypt-hashed
                await newUser.save();
                userIdMap[user.id] = newUser._id;
                console.log(`   ✅ User "${user.email}" migrated`);
            }
        }
        console.log(`   → ${users.length} users processed\n`);

        // ── 3. Migrate Issues ──
        console.log('📋 Migrating issues...');
        const issues = await queryAll(sqliteDb, 'SELECT * FROM issues');
        for (const issue of issues) {
            const newIssue = await Issue.create({
                user_id: userIdMap[issue.user_id] || undefined,
                category_id: categoryIdMap[issue.category_id] || undefined,
                title: issue.title,
                description: issue.description,
                latitude: issue.latitude,
                longitude: issue.longitude,
                address: issue.address,
                photo_url: issue.photo_url,
                status: issue.status || 'Submitted',
                priority: issue.priority || 'Medium',
                priority_score: issue.priority_score || 0,
                assigned_to: userIdMap[issue.assigned_to] || undefined,
                resolution_photo_url: issue.resolution_photo_url,
                resolution_type: issue.resolution_type,
                upvotes: issue.upvotes || 0,
                is_escalated: issue.is_escalated === 1,
                _sqlite_id: issue.id,
            });
            issueIdMap[issue.id] = newIssue._id;
        }
        console.log(`   → ${issues.length} issues migrated\n`);

        // ── 4. Migrate Votes ──
        console.log('👍 Migrating votes...');
        const votes = await queryAll(sqliteDb, 'SELECT * FROM votes');
        let voteCount = 0;
        for (const vote of votes) {
            const issueMongoId = issueIdMap[vote.issue_id];
            const userMongoId = userIdMap[vote.user_id];
            if (issueMongoId && userMongoId) {
                try {
                    await Vote.create({ issue_id: issueMongoId, user_id: userMongoId });
                    voteCount++;
                } catch (e) {
                    // Duplicate vote, skip
                }
            }
        }
        console.log(`   → ${voteCount} votes migrated\n`);

        // ── 5. Migrate Sensitive Zones ──
        console.log('🏥 Migrating sensitive zones...');
        const zones = await queryAll(sqliteDb, 'SELECT * FROM sensitive_zones');
        for (const zone of zones) {
            await SensitiveZone.create({
                name: zone.name,
                type: zone.type,
                latitude: zone.latitude,
                longitude: zone.longitude,
                radius_meters: zone.radius_meters,
            });
        }
        console.log(`   → ${zones.length} sensitive zones migrated\n`);

        console.log('═══════════════════════════════════════');
        console.log('✅ Migration complete!');
        console.log(`   Categories: ${categories.length}`);
        console.log(`   Users: ${users.length}`);
        console.log(`   Issues: ${issues.length}`);
        console.log(`   Votes: ${voteCount}`);
        console.log(`   Sensitive Zones: ${zones.length}`);
        console.log('═══════════════════════════════════════');
        console.log('\n⚠️  SQLite database file was NOT deleted.');
        console.log('   You can find it at:', DB_PATH);
    } catch (err) {
        console.error('\n❌ Migration failed:', err);
    } finally {
        sqliteDb.close();
        await mongoose.disconnect();
        process.exit(0);
    }
}

migrate();
