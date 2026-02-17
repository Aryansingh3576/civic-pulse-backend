const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    title: { type: String, trim: true },
    description: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String },
    photo_url: { type: String },
    status: {
        type: String,
        enum: ['Submitted', 'Assigned', 'In Progress', 'Resolved', 'Closed'],
        default: 'Submitted'
    },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    priority_score: { type: Number, default: 0 },
    assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolution_photo_url: { type: String },
    resolution_type: { type: String, enum: ['Temporary', 'Permanent', null] },
    upvotes: { type: Number, default: 0 },
    is_escalated: { type: Boolean, default: false },
    // Community sharing
    is_public: { type: Boolean, default: false },
    is_anonymous: { type: Boolean, default: false },
    // Store old SQLite id for migration reference
    _sqlite_id: { type: Number },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Index for geo queries
issueSchema.index({ latitude: 1, longitude: 1 });
issueSchema.index({ status: 1 });
issueSchema.index({ category_id: 1 });
issueSchema.index({ user_id: 1 });
issueSchema.index({ is_public: 1, created_at: -1 }); // Community feed index

module.exports = mongoose.model('Issue', issueSchema);
