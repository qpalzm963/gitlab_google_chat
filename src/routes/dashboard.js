const express = require('express')
const auth = require('../middlewares/auth')
const repo = require('../repositories')
const { normalizeRangeDays } = require('../repositories/dashboardMetrics')

const router = express.Router()

router.use(auth)

router.get('/', async (req, res) => {
  const rangeDays = normalizeRangeDays(req.query.range)
  const allDepartments = await repo.dept.findAll()
  const departments = req.user.role === 'admin'
    ? allDepartments
    : allDepartments.filter(dept => (req.user.dept_ids || []).includes(dept.id))

  const overview = await repo.log.getDashboardOverview({
    rangeDays,
    departments
  })

  res.json({
    range: `${rangeDays}d`,
    summary: overview.summary,
    trend: overview.trend,
    departments: overview.departments,
    alerts: overview.alerts,
    last_updated_at: overview.last_updated_at
  })
})

module.exports = router
