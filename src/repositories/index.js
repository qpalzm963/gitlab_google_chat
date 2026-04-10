const type = process.env.DB_TYPE || 'sqlite'
module.exports = require(`./${type}`)
