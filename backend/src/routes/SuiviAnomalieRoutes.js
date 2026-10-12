const express = require("express");
const router = express.Router();
const suiviController = require("../controllers/SuiviAnomalieController");
const { authMiddleware } = require("../middlewares/auth");

router.use(authMiddleware);

// GET  /api/suivi/                        → Liste tous les suivis (avec durée calculée)
// GET  /api/suivi/carte/:numerocarte      → Historique suivi d'une carte
// PUT  /api/suivi/update-etape            → Mettre à jour une date TRS (transmission)
// PUT  /api/suivi/carte                   → Mettre à jour le suivi d'une carte (date retour, état panne)
router.get("/", suiviController.getAllSuivis);
router.get("/carte/:numerocarte", suiviController.getSuiviByCarte);
router.put("/update-etape", suiviController.updateEtapeTechnique);
router.put("/carte", suiviController.updateSuiviCarte);

module.exports = router;
