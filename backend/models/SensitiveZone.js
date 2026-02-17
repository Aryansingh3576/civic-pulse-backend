const mongoose = require('mongoose');

const sensitiveZoneSchema = new mongoose.Schema({
    name: { type: String },
    type: { type: String }, // Hospital, School, Government Office
    latitude: { type: Number },
    longitude: { type: Number },
    radius_meters: { type: Number, default: 100 },
});

module.exports = mongoose.model('SensitiveZone', sensitiveZoneSchema);
