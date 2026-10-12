const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { getRapportsTPE } = require('../controllers/rapportcontroller');

// GET /api/rapports/tpe → Rapports TPE+Carte avec filtres (periode, dateDebut, dateFin, etat, numeroSerie)
router.get('/tpe', authMiddleware, getRapportsTPE);

module.exports = router;
