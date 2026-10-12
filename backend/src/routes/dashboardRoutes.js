const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { getDashboardTPECarte } = require('../controllers/dashboardController');

router.use(authMiddleware);

// Endpoint global attendu par le frontend
router.get('/global', getDashboardTPECarte);
router.get('/dashboard/tpe/carte', getDashboardTPECarte);

module.exports = router;