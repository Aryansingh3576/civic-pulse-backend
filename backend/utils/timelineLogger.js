const Timeline = require('../models/Timeline');

exports.logEvent = async (issueId, userId, action, details) => {
    try {
        await Timeline.create({
            issue_id: issueId,
            user_id: userId,
            action,
            details,
        });
    } catch (err) {
        console.error("Failed to log timeline event", err);
    }
};
