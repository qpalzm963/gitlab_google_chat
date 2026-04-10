const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const repo = require('../repositories')

const router = express.Router()

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' })
  }

  const user = await repo.user.findByEmail(email)
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  await repo.user.updateLastLogin(user.id)

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  )

  res.json({ token, role: user.role, name: user.name })
})

module.exports = router
