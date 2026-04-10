// Vercel serverless entry point
// Wraps the Express app as a Vercel Function
require('dotenv').config()
const app = require('../src/app')

module.exports = app
