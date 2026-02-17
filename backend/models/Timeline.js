const mongoose = require('mongoose');

const timelineSchema = new mongoose.Schema({
    issue_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    details: { type: String },
}, { timestamps: { createdAt: 'created_at' } });

timelineSchema.index({ issue_id: 1 });

module.exports = mongoose.model('Timeline', timelineSchema);
