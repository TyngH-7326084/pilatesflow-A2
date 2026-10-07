// US2.8: Member management coverage (US2.1-US2.4, NFR-F2 access control).
// Runs the real auth and member routes over HTTP against an in-memory MongoDB.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const User = require("../src/models/User");
const authRoutes = require("../src/routes/authRoutes");
const memberRoutes = require("../src/routes/memberRoutes");
const errorHandler = require("../src/middleware/errorHandler");

const PASSWORD = "Password123";

let mongo;
let app;
let passwordHash;

function createTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use("/api/auth", authRoutes);
  testApp.use("/api/members", memberRoutes);
  testApp.use(errorHandler);
  return testApp;
}

const tokenFor = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "5m",
  });
const auth = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

test.before(async () => {
  process.env.JWT_SECRET = "us28-members-secret";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "pilatesflow_us28_members" });
  await User.syncIndexes();
  passwordHash = await bcrypt.hash(PASSWORD, 4);
  app = createTestApp();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

// Fresh admin + two members before every test, so tests never depend on each other.
let admin;
let alice;
let bob;
test.beforeEach(async () => {
  await User.deleteMany({});
  [admin, alice, bob] = await User.create([
    { name: "Admin", email: "admin@pf.test", passwordHash, role: "admin" },
    { name: "Alice Smith", email: "alice@pf.test", passwordHash, role: "member" },
    { name: "Bob Jones", email: "bob@pf.test", passwordHash, role: "member" },
  ]);
});

// ---- US2.1 Member list & search ----

test("US2.1: admin lists members only, without password hashes", async () => {
  const res = await request(app).get("/api/members").set(auth(admin));

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((m) => m.email).sort(), ["alice@pf.test", "bob@pf.test"]);
  assert.ok(res.body.every((m) => m.passwordHash === undefined));
});

test("US2.1: search matches name or email, case-insensitive", async () => {
  const byName = await request(app).get("/api/members?search=ALICE").set(auth(admin));
  const byEmail = await request(app).get("/api/members?search=bob@").set(auth(admin));

  assert.deepEqual(byName.body.map((m) => m.email), ["alice@pf.test"]);
  assert.deepEqual(byEmail.body.map((m) => m.email), ["bob@pf.test"]);
});

test("NFR-F2: regex characters in search are treated as plain text, not a 500", async () => {
  const res = await request(app).get("/api/members?search=(").set(auth(admin));

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

// ---- US2.2 Edit member ----

test("US2.2: admin edits a member's name and email", async () => {
  const res = await request(app)
    .put(`/api/members/${alice._id}`)
    .set(auth(admin))
    .send({ name: "Alice Brown", email: "ALICE.BROWN@pf.test" });

  assert.equal(res.status, 200);
  assert.equal(res.body.name, "Alice Brown");
  assert.equal(res.body.email, "alice.brown@pf.test");
  assert.equal(res.body.passwordHash, undefined);
});

test("US2.2: invalid email or empty name returns 400", async () => {
  const badEmail = await request(app)
    .put(`/api/members/${alice._id}`)
    .set(auth(admin))
    .send({ email: "not-an-email" });
  const emptyName = await request(app)
    .put(`/api/members/${alice._id}`)
    .set(auth(admin))
    .send({ name: "   " });

  assert.equal(badEmail.status, 400);
  assert.equal(emptyName.status, 400);
});

test("US2.2: email already used by another account returns 409", async () => {
  const res = await request(app)
    .put(`/api/members/${alice._id}`)
    .set(auth(admin))
    .send({ email: "bob@pf.test" });

  assert.equal(res.status, 409);
  assert.equal((await User.findById(alice._id)).email, "alice@pf.test");
});

test("US2.2: unknown member id returns 404", async () => {
  const res = await request(app)
    .put(`/api/members/${new mongoose.Types.ObjectId()}`)
    .set(auth(admin))
    .send({ name: "Nobody" });

  assert.equal(res.status, 404);
});

test("US2.2: a member can edit their own name", async () => {
  const res = await request(app)
    .put(`/api/members/${alice._id}`)
    .set(auth(alice))
    .send({ name: "Alice Self-Edit" });

  assert.equal(res.status, 200);
  assert.equal(res.body.name, "Alice Self-Edit");
});

test("US2.2: a member cannot edit another member (403)", async () => {
  const res = await request(app)
    .put(`/api/members/${bob._id}`)
    .set(auth(alice))
    .send({ name: "Hacked" });

  assert.equal(res.status, 403);
  assert.equal((await User.findById(bob._id)).name, "Bob Jones");
});

// ---- US2.3 Deactivate member ----

test("US2.3: admin deactivates a member; repeating it is a no-op, not an error", async () => {
  const first = await request(app).patch(`/api/members/${alice._id}/deactivate`).set(auth(admin));
  const second = await request(app).patch(`/api/members/${alice._id}/deactivate`).set(auth(admin));

  assert.equal(first.status, 200);
  assert.equal(first.body.status, "inactive");
  assert.equal(second.status, 200);
  assert.equal(second.body.status, "inactive");
});

test("US2.3: deactivating an unknown member returns 404", async () => {
  const res = await request(app)
    .patch(`/api/members/${new mongoose.Types.ObjectId()}/deactivate`)
    .set(auth(admin));

  assert.equal(res.status, 404);
});

test("US2.3: a deactivated member cannot log in (403)", async () => {
  await User.updateOne({ _id: alice._id }, { status: "inactive" });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "alice@pf.test", password: PASSWORD });

  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
});

test("US2.3: a member cannot reactivate themselves (403)", async () => {
  await User.updateOne({ _id: alice._id }, { status: "inactive" });

  const res = await request(app)
    .put(`/api/members/${alice._id}`)
    .set(auth(alice))
    .send({ status: "active" });

  assert.equal(res.status, 403);
  assert.equal((await User.findById(alice._id)).status, "inactive");
});

// ---- US2.4 Membership tier assignment ----

test("US2.4: admin sets a valid tier", async () => {
  const res = await request(app)
    .put(`/api/members/${alice._id}`)
    .set(auth(admin))
    .send({ tier: "premium" });

  assert.equal(res.status, 200);
  assert.equal((await User.findById(alice._id)).tier, "premium");
});

test("US2.4: tier outside the allowed set returns 400 and the record is unchanged", async () => {
  const res = await request(app)
    .put(`/api/members/${alice._id}`)
    .set(auth(admin))
    .send({ tier: "gold" });

  assert.equal(res.status, 400);
  assert.equal((await User.findById(alice._id)).tier, "basic");
});

test("US2.4: a member cannot change their own tier (403) and the record is unchanged", async () => {
  const res = await request(app)
    .put(`/api/members/${alice._id}`)
    .set(auth(alice))
    .send({ tier: "premium" });

  assert.equal(res.status, 403);
  assert.equal((await User.findById(alice._id)).tier, "basic");
});

// ---- NFR-F2 Access control ----

test("NFR-F2: every member-management endpoint returns 401 without a token", async () => {
  const responses = await Promise.all([
    request(app).get("/api/members"),
    request(app).put(`/api/members/${alice._id}`).send({ name: "x" }),
    request(app).patch(`/api/members/${alice._id}/deactivate`),
  ]);

  assert.deepEqual(responses.map((r) => r.status), [401, 401, 401]);
});

test("NFR-F2: admin-only member endpoints return 403 for a member token", async () => {
  const list = await request(app).get("/api/members").set(auth(alice));
  const deactivate = await request(app)
    .patch(`/api/members/${bob._id}/deactivate`)
    .set(auth(alice));

  assert.equal(list.status, 403);
  assert.equal(deactivate.status, 403);
  assert.equal((await User.findById(bob._id)).status, "active");
});

test("NFR-F2: signup ignores tier and role in the payload", async () => {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ email: "sneaky@pf.test", password: PASSWORD, tier: "premium", role: "admin" });

  assert.equal(res.status, 201);
  const created = await User.findOne({ email: "sneaky@pf.test" });
  assert.equal(created.tier, "basic");
  assert.equal(created.role, "member");
});
