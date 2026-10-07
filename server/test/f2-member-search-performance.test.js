const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const { performance } = require("node:perf_hooks");
const User = require("../src/models/User");
const memberRoutes = require("../src/routes/memberRoutes");

const N = 5000;
const RUNS = 20;
const TIME_LIMIT_MS = 300;

let mongo;
let app;
const adminToken = () =>
  jwt.sign({ sub: new mongoose.Types.ObjectId().toString(), role: "admin" }, process.env.JWT_SECRET);

test.before(async () => {
  process.env.JWT_SECRET = "nfr-f2-test-secret";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.insertMany(
    Array.from({ length: N }, (_, i) => ({
      name: `Seed Member ${i}`,
      email: `member${i}@seed.test`,
      passwordHash: "x",
      role: "member",
    }))
  );
  app = express();
  app.use("/api/members", memberRoutes);
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test(`NFR-F2: member search over ${N} members p95 under ${TIME_LIMIT_MS} ms`, async () => {
  const token = adminToken();
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const res = await request(app)
      .get("/api/members?search=Member 42")
      .set("Authorization", `Bearer ${token}`);
    times.push(performance.now() - start);
    assert.equal(res.status, 200);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(RUNS / 2)];
  const p95 = times[Math.ceil(RUNS * 0.95) - 1];
  console.log(`N=${N} median=${median.toFixed(1)}ms p95=${p95.toFixed(1)}ms`);
  assert.ok(p95 < TIME_LIMIT_MS);
});
