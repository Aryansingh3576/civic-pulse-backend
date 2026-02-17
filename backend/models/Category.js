const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    department: { type: String },
    sla_hours: { type: Number, default: 24 },
    base_priority: { type: Number, default: 1 },
    // Store old SQLite id for migration reference
    _sqlite_id: { type: Number },
});

module.exports = mongoose.model('Category', categorySchema);
