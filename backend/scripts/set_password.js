const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const hashed = await bcrypt.hash('oxifixrev', 12);
    const result = await mongoose.connection.db.collection('users').updateOne(
        { email: 'weareteamclarity@gmail.com' },
        { $set: { password_hash: hashed } }
    );
    console.log('Matched:', result.matchedCount, 'Modified:', result.modifiedCount);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
