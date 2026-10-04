// scripts/generate-master-pin-hash.js
const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Enter master PIN: ", (pin) => {
  rl.close();
  if (!pin) {
    console.error("No PIN entered.");
    process.exit(1);
  }
  bcrypt.hash(pin, 10).then((hash) => {
    console.log("\nNew MASTER_PIN_HASH value:\n");
    console.log(hash);
    console.log("\nPaste this into Vercel → Settings → Environment Variables → MASTER_PIN_HASH (new variable), then redeploy.\n");
  });
});