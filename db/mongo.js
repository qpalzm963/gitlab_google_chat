require('dotenv').config()
const mongoose = require('mongoose')

// Reuse connection across Vercel cold starts / hot reloads
let cached = global._mongooseCache
if (!cached) cached = global._mongooseCache = { conn: null, promise: null }

async function connectMongo() {
  if (cached.conn) return cached.conn

  if (!cached.promise) {
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('MONGODB_URI is not set')

    cached.promise = mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
  }

  cached.conn = await cached.promise
  return cached.conn
}

module.exports = { connectMongo }
