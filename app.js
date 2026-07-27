const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello, GitHub!");
});

app.get("/api", (req, res) => {
  res.json({
    message: "Welcome to the API",
    status: "success"
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "app.js",
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}

npm install
npm start
