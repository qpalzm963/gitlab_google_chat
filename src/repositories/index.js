const type = (process.env.DB_TYPE || 'sqlite').trim()
module.exports = require(`./${type}`)
