const express = require('express');
const router = express.Router();
const structureController = require('../controllers/structureControllers');
const { authMiddleware, authorizeRoles } = require('../middlewares/auth');

// ================================
//  Liste de toutes les structures
// ================================
router.get(
    '/',
    authMiddleware,
    authorizeRoles(...['ADMIN_DPE',
        'MEMBRE_DPE',
        'MEMBRE_DISTRICT',
        'CONSULTANT_DISTRICT',
        'MEMBRE_ANTENNE',
        'CONSULTANT_ANTENNE',
        'MEMBRE_AGENCE',
        'CONSULTANT_AGENCE']),
    structureController.getAllStructures
);

// ================================
//  Fiche DPE complète (HIÉRARCHIE + STATS)
// ================================
router.get(
    '/dpe/:idOrCode',
    authMiddleware,
    authorizeRoles(...['ADMIN_DPE',
        'CONSULTANT_DPE',
        'MEMBRE_DISTRICT',
        'CONSULTANT_DISTRICT',
        'MEMBRE_ANTENNE',
        'CONSULTANT_ANTENNE',
        'MEMBRE_AGENCE',
        'CONSULTANT_AGENCE']),
    structureController.getDPEWithDistricts
);

// ================================
//  Fiche structure simple (District / Agence / Antenne)
// ================================
router.get(
    '/details/:idOrCode',
    authMiddleware,
    authorizeRoles(
        'ADMIN_DPE',
        'CONSULTANT_DPE',
        'MEMBRE_DISTRICT',
        'CONSULTANT_DISTRICT',
        'MEMBRE_ANTENNE',
        'CONSULTANT_ANTENNE',
        'MEMBRE_AGENCE',
        'CONSULTANT_AGENCE'
    ),
    structureController.getStructureDetails
);

module.exports = router;