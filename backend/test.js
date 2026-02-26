const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/hello-local')
    .then(async () => {
        const db = mongoose.connection.db;
        const cats = await db.collection('headercategories').find({}).toArray();
        console.log(JSON.stringify(cats, null, 2));
        process.exit(0);
    });
