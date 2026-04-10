require('dotenv').config()
const fs = require('fs')
const path = require('path')
const db = require('./sqlite')

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')

db.exec(schema)

console.log('✓ Database initialized:', process.env.DB_PATH || './data/app.db')
