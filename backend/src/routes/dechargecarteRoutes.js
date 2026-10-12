const express = require("express");
const router = express.Router();
const dechargeController = require("../controllers/DechargeController");
const { authMiddleware } = require("../middlewares/auth");

// Déléguer à dechargeRoutes — cette route duplique la fonctionnalité
// Les vraies routes décharges sont dans dechargeRoutes.js
router.get("/", authMiddleware, dechargeController.getAllDecharges);

module.exports = router;
