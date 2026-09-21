require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const classRoutes = require("./routes/classRoutes");
const errorHandler = require("./middleware/errorHandler");
const bookingRoutes = require("./routes/bookingRoutes");
const instructorRoutes = require("./routes/instructorRoutes")
const memberRoutes = require("./routes/memberRoutes")

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/instructors", instructorRoutes);
app.use("/api/members", memberRoutes);

// Serve React build in production
app.use(express.static(path.join(__dirname, "../../client/dist")));

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../../client/dist/index.html"));
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });