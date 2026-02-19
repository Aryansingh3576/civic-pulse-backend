const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const result = await mongoose.connection.db.collection('users').updateOne(
        { email: 'weareteamclarity@gmail.com' },
        { $set: { role: 'admin' } }
    );
    console.log('Matched:', result.matchedCount, 'Modified:', result.modifiedCount);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
