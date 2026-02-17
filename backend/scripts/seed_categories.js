/**
 * seed_categories.js — Seeds default categories into MongoDB
 * Usage: node scripts/seed_categories.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');

const defaultCategories = [
    { name: 'Pothole', department: 'Roads', sla_hours: 168, base_priority: 5 },
    { name: 'Garbage', department: 'Sanitation', sla_hours: 24, base_priority: 4 },
    { name: 'Street Light', department: 'Electricity', sla_hours: 48, base_priority: 4 },
    { name: 'Water Leakage', department: 'Water Supply', sla_hours: 24, base_priority: 6 },
    { name: 'Stray Animals', department: 'Animal Control', sla_hours: 48, base_priority: 3 },
    { name: 'Road Damage', department: 'Roads', sla_hours: 168, base_priority: 5 },
    { name: 'Drainage', department: 'Water Supply', sla_hours: 48, base_priority: 5 },
    { name: 'Public Safety', department: 'Safety', sla_hours: 12, base_priority: 8 },
    { name: 'Electricity', department: 'Electricity', sla_hours: 24, base_priority: 6 },
];

async function seedCategories() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        for (const cat of defaultCategories) {
            const existing = await Category.findOne({ name: cat.name });
            if (existing) {
                console.log(`⏭️  Category "${cat.name}" already exists`);
            } else {
                await Category.create(cat);
                console.log(`✅ Category "${cat.name}" created`);
            }
        }

        console.log('\n✅ Category seeding complete!');
    } catch (err) {
        console.error('❌ Failed to seed categories:', err.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

seedCategories();
