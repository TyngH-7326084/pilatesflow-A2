require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

const N = Number(process.argv[2]) || 5000;

(async () => {
    await connectDB();
    await User.deleteMany({ email: /@seed\.test$/ });
    const passwordHash = await bcrypt.hash("password123", 10); //hash once, reuse for all users\
    const docs = Array.from({ length: N }, (_, i) => ({
        name : `Seed Member ${i}`,
        email: `member${i}@seed.test`,
        passwordHash,
        role: "member",
        tier: i % 4 === 0 ? "premium" : "basic"
    }));
    await User.insertMany(docs);
    console.log(`Inserted ${N} seed members.`);
    mongoose.connection.close();
})();
