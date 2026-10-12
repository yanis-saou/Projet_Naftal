const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { authMiddleware, authorizeRoles } = require('../middlewares/auth');

// ================================
// AUTHENTIFICATION
// ================================

// Login : public
router.post('/login', authController.login);

// Logout : authentifié
router.post('/logout', authMiddleware, authController.logout);

// Add audit : authentifié
router.post('/add-audit', authMiddleware, authController.addAudit);

// Demande publique: cree une demande traitee par l'admin.
router.post('/forgot-password', authController.forgotPassword);

router.get(
    '/password-reset-requests',
    authMiddleware,
    authorizeRoles('ADMIN_DPE'),
    authController.listPasswordResetRequests
);

router.put(
    '/password-reset-requests/:id_demande/validate',
    authMiddleware,
    authorizeRoles('ADMIN_DPE'),
    authController.validatePasswordResetRequest
);

router.put(
    '/password-reset-requests/:id_demande/refuse',
    authMiddleware,
    authorizeRoles('ADMIN_DPE'),
    authController.refusePasswordResetRequest
);

router.put(
    '/password-reset-requests/:id_demande/reset-password',
    authMiddleware,
    authorizeRoles('ADMIN_DPE'),
    authController.resetPasswordFromRequest
);

// Liste des utilisateurs (ADMIN_DPE / CONSULTANT_DPE)
router.get(
    '/users',
    authMiddleware,
    authorizeRoles('ADMIN_DPE', 'CONSULTANT_DPE'),
    authController.listUsers
);



// ================================
// GESTION DES UTILISATEURS
// ================================

// REGISTER → seulement rôles autorisés
router.post(
    '/register',
    authMiddleware,
    authorizeRoles('ADMIN_DPE', 'CONSULTANT_DPE', 'MEMBRE_DISTRICT'),
    authController.register
);

// VALIDATION → ADMIN_DPE seulement
router.put(
    '/validate/:id_a_valider',
    authMiddleware,
    authorizeRoles('ADMIN_DPE'),
    authController.validateUser
);

// DELETE → ADMIN_DPE seulement
router.delete(
    '/delete/:id_a_supprimer',
    authMiddleware,
    authorizeRoles('ADMIN_DPE'),
    authController.deleteUser
);
//audit logs → ADMIN_DPE + CONSULTANT_DPE
router.get(
    '/audit',
    authMiddleware,
    authorizeRoles('ADMIN_DPE', 'CONSULTANT_DPE'),
    authController.getAuditLogs
);
module.exports = router;
