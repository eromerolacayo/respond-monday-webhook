// vercel.json
{
  "functions": {
    "api/webhook.js": {
      "runtime": "@vercel/node"
    }
  }
}

// package.json
{
  "name": "respond-monday-webhook",
  "version": "1.0.0",
  "description": "Webhook middleware to connect Respond.io to Monday.com",
  "main": "api/webhook.js",
  "scripts": {
    "dev": "vercel dev",
    "deploy": "vercel"
  },
  "dependencies": {
    "node-fetch": "^3.3.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}