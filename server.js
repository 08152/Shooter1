const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// static files (HTML, JS, CSS)
app.use(express.static(path.join(__dirname)));

// start page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// start server
app.listen(PORT, () => {
  console.log("Server läuft auf http://localhost:" + PORT);
});
