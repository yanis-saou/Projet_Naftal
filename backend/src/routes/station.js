const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { getStation, getAllStations, updateStation } = require('../controllers/stationController');


//liste toutes les stations avec TPE count
router.get('/', authMiddleware, getAllStations);
// GET /api/station/:code
router.get('/:code', authMiddleware, getStation);

// PUT /api/station/:code  ← vérifiez que cette ligne existe
router.put('/:code', authMiddleware, updateStation);

module.exports = router;