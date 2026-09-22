const path = require("path");

module.exports = {
  apps: [
    {
      name: "pilatesflow-a2",
      cwd: path.join(__dirname, "server"),
      script: "src/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M",
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
