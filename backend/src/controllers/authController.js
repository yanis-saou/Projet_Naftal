const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logAuditAction } = require('../utils/auditLogger');
const { invalidateUser, primeUserCache } = require('../middlewares/auth');

const JWT_SECRET = process.env.JWT_SECRET;
// ================================
// REGISTER
// ================================
const register = async (req, res) => {
    try {
        let { nom, prenom, email, mot_de_passe, role, id_structure } = req.body;
        const adminConnecte = req.user;
        if (!adminConnecte) {
            return res.status(401).json({ error: "Authentification requise" });
        }
        //  Validation inputs
        if (!nom || !prenom || !email || !mot_de_passe || !role || !id_structure) {
            return res.status(400).json({ error: "Champs obligatoires manquants" });
        }
        role = role?.toUpperCase();
        if (!role) return res.status(400).json({ error: "Role obligatoire" });
        const createurRole = adminConnecte.role;

        // Vérifier que le rôle existe en DB
        const roleExiste = await prisma.role.findUnique({
            where: { libelle: role }
        });
        if (!roleExiste) {
            return res.status(400).json({ error: "Role invalide" });
        }

        //=======================================================
        // Vérification de la structure (cohérence avec le rôle et existence en DB)
        //=======================================================
        const structureCible = await prisma.structure.findUnique({
            where: { idstructure: Number(id_structure) }
        });

        if (!structureCible) {
            return res.status(400).json({
                error: "La structure spécifiée n'existe pas dans la base de données."
            });
        }

        // Vérification de la structure du créateur
        const structureCreateur = await prisma.utilisateur.findUnique({
            where: { id_utilisateur: adminConnecte.id },
            include: { structure: true }
        });

        if (!structureCreateur || !structureCreateur.structure) {
            return res.status(400).json({ error: "Structure du créateur introuvable" });
        }

        //=============================================================
        // Vérification des droits de création selon le rôle du créateur
        //=============================================================
        // ADMIN_DPE → accès total
        if (createurRole === 'ADMIN_DPE') {
            // accès total, pas de restrictions
        }
        // MEMBRE_DISTRICT
        else if (createurRole === 'MEMBRE_DISTRICT') {
            const rolesAutorises = [
                'MEMBRE_AGENCE',
                'CONSULTANT_AGENCE',
                'MEMBRE_ANTENNE',
                'CONSULTANT_ANTENNE'
            ];

            if (!rolesAutorises.includes(role)) {
                return res.status(403).json({
                    error: "Un District ne peut créer que Agence ou bien Antenne (membre ou consultant)"
                });
            }

            if (structureCible.code_parent !== structureCreateur.structure.code) {
                return res.status(403).json({
                    error: "La structure cible n'est pas rattachée à votre district"
                });
            }

            if ((role === 'MEMBRE_AGENCE' || role === 'CONSULTANT_AGENCE') && structureCible.type_structure !== 'AGENCE') {
                return res.status(400).json({ error: "La structure n'est pas une agence" });
            }
            if ((role === 'MEMBRE_ANTENNE' || role === 'CONSULTANT_ANTENNE') && structureCible.type_structure !== 'ANTENNE') {
                return res.status(400).json({ error: "La structure n'est pas une antenne" });
            }
        }
        // Les antennes et agences ne peuvent pas créer d'utilisateurs
        else if (
            createurRole === 'CONSULTANT_DISTRICT' ||
            createurRole === 'CONSULTANT_DPE' ||
            createurRole === 'MEMBRE_ANTENNE' ||
            createurRole === 'CONSULTANT_ANTENNE' ||
            createurRole === 'MEMBRE_AGENCE' ||
            createurRole === 'CONSULTANT_AGENCE'
        ) {
            return res.status(403).json({
                error: "Vous n'avez pas le droit de créer des utilisateurs"
            });
        } else {
            return res.status(403).json({
                error: "Rôle du créateur non reconnu"
            });
        }

        //===========================================
        // Vérification cohérence type STRUCTURE
        //===========================================
        if (role === 'MEMBRE_DISTRICT' && structureCible.type_structure !== 'DISTRICT') {
            return res.status(400).json({ error: "La structure n'est pas un district" });
        }

        if (role === 'ADMIN_DPE' && structureCible.type_structure !== 'DPE') {
            return res.status(400).json({ error: "La structure n'est pas la DPE" });
        }

        //====================
        // EMAIL UNIQUE
        //====================
        const exist = await prisma.utilisateur.findFirst({ where: { email } });
        if (exist) {
            return res.status(400).json({ error: "Utilisateur déjà existant" });
        }

        // HASH MOT DE PASSE
        const hashedPassword = await bcrypt.hash(mot_de_passe, 10);

        //============================
        // Création de l'utilisateur
        //============================
        const user = await prisma.utilisateur.create({
            data: {
                nom,
                prenom,
                email,
                mot_de_passe: hashedPassword,
                role,
                id_structure: Number(id_structure),
                cree_par_id: adminConnecte.id,
                structure_cree: structureCreateur.structure.nom_structure,
                est_valide: createurRole === 'ADMIN_DPE',
                date_creation: createurRole === 'ADMIN_DPE' ? new Date() : null
            }
        });
        await logAuditAction(
            "Création utilisateur",
            `${nom} ${prenom}`,
            adminConnecte.email
        );
        const message = createurRole === 'ADMIN_DPE'
            ? "Utilisateur créé et validé avec succès."
            : "Utilisateur créé. En attente de validation par l'administrateur.";

        res.status(201).json({ message, user });

    } catch (error) {
        res.status(500).json({ error: "Erreur serveur", details: error.message });
    }
};

//=====================================
// VALIDATION (ADMIN_DPE seulement)
//=====================================
const validateUser = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN_DPE') {
            return res.status(403).json({ error: "Action réservée à l'administrateur" });
        }

        const { id_a_valider } = req.params;

        await prisma.utilisateur.update({
            where: { id_utilisateur: parseInt(id_a_valider) },
            data: { est_valide: true, date_creation: new Date() }
        });

        invalidateUser(parseInt(id_a_valider));

        await logAuditAction(
            "Validation utilisateur",
            id_a_valider,
            req.user.email
        );

        res.json({ message: "Utilisateur validé avec succès. Il peut désormais se connecter." });
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la validation" });
    }
};

// ================================
// LOGIN
// ================================
const login = async (req, res) => {
    const t0 = Date.now();
    const mark = (label, since) => {
        const now = Date.now();
        const step = now - since;
        const total = now - t0;
        console.log(`[LOGIN] ${label.padEnd(22)} ${String(step).padStart(5)} ms  |  total ${total} ms`);
        return now;
    };

    try {
        const { email, mot_de_passe } = req.body;
        let t = t0;
        console.log(`\n[LOGIN] ── début pour ${email} ──`);

        const user = await prisma.utilisateur.findUnique({
            where: { email },
            select: {
                id_utilisateur: true,
                nom: true,
                prenom: true,
                email: true,
                role: true,
                id_structure: true,
                mot_de_passe: true,
                est_valide: true,
                supprime: true
            }
        });
        t = mark('findUnique(email)', t);

        if (!user || user.supprime) {
            console.log(`[LOGIN] ✗ utilisateur introuvable (total ${Date.now() - t0} ms)\n`);
            return res.status(404).json({ error: "Utilisateur non trouvé" });
        }

        // Vérification de la validation par l'admin pour les rôles autres que ADMIN_DPE
        if (user.role !== 'ADMIN_DPE' && user.est_valide !== true) {
            console.log(`[LOGIN] ✗ compte non validé (total ${Date.now() - t0} ms)\n`);
            return res.status(403).json({ error: "Votre compte n'a pas encore été validé par l'administrateur." });
        }

        const valid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
        t = mark('bcrypt.compare', t);
        if (!valid) {
            console.log(`[LOGIN] ✗ mot de passe incorrect (total ${Date.now() - t0} ms)\n`);
            return res.status(401).json({ error: "Mot de passe incorrect" });
        }

        const token = jwt.sign(
            { id: user.id_utilisateur, role: user.role },
            JWT_SECRET, { expiresIn: "1d" }
        );
        t = mark('jwt.sign', t);

        // Pré-remplir le cache d'auth pour que le burst de requêtes
        // immédiatement après login ne paie pas la latence DB.
        primeUserCache(user);

        res.json({
            message: "Connexion réussie",
            token,
            user: {
                id: user.id_utilisateur,
                nom: user.nom,
                prenom: user.prenom,
                email: user.email,
                role: user.role
            },
        });
        t = mark('res.json envoyé', t);
        console.log(`[LOGIN] ✓ TOTAL côté serveur: ${Date.now() - t0} ms\n`);

        // Audit assuré par le frontend (addAudit("Connexion", "Session", ...))
        // pour éviter le doublon avec l'appel backend direct
    } catch (error) {
        console.error(`[LOGIN] ✗ erreur après ${Date.now() - t0} ms:`, error);
        res.status(500).json({ error: "Erreur serveur", details: error.message });
    }
};

// ================================
// DELETE (Strictement ADMIN_DPE)
// ================================
const deleteUser = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN_DPE') {
            return res.status(403).json({ error: "Seul l'Administrateur central a le droit de suppression." });
        }

        const { id_a_supprimer } = req.params;

        const deletedUser = await prisma.utilisateur.update({
            where: { id_utilisateur: parseInt(id_a_supprimer) },
            data: {
                est_valide: false
            }
        });

        invalidateUser(parseInt(id_a_supprimer));

        await logAuditAction(
            "Suppression utilisateur",
            deletedUser.email,
            req.user.email
        );
        res.json({
            message: "Utilisateur supprimé avec succès",
            user: {
                id: deletedUser.id_utilisateur,
                nom: deletedUser.nom,
                prenom: deletedUser.prenom,
                email: deletedUser.email,
                role: deletedUser.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: "Erreur serveur" });
    }
};


//-------------------------
// DEMANDES ADMIN DE REINITIALISATION MOT DE PASSE
//-------------------------
const RESET_STATUS = {
    PENDING: 'EN_ATTENTE',
    APPROVED: 'VALIDEE',
    REFUSED: 'REFUSEE',
    RESET: 'REINITIALISEE'
};
const OPEN_RESET_STATUSES = [RESET_STATUS.PENDING, RESET_STATUS.APPROVED];

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function serializeResetRequest(request) {
    if (!request) return null;
    const user = request.utilisateur || {};
    const admin = request.admin || {};
    return {
        id_demande: request.id_demande,
        id_utilisateur: request.id_utilisateur,
        email_demande: request.email_demande,
        statut: request.statut,
        date_demande: request.date_demande,
        date_validation: request.date_validation,
        date_refus: request.date_refus,
        date_reinitialisation: request.date_reinitialisation,
        commentaire: request.commentaire,
        utilisateur: {
            id_utilisateur: user.id_utilisateur,
            nom: user.nom,
            prenom: user.prenom,
            email: user.email,
            role: user.role,
            id_structure: user.id_structure,
            structure: user.structure || null
        },
        admin: admin.id_utilisateur ? {
            id_utilisateur: admin.id_utilisateur,
            nom: admin.nom,
            prenom: admin.prenom,
            email: admin.email
        } : null
    };
}

const resetRequestInclude = {
    utilisateur: {
        select: {
            id_utilisateur: true,
            nom: true,
            prenom: true,
            email: true,
            role: true,
            id_structure: true,
            structure: {
                select: { nom_structure: true, code: true, type_structure: true }
            }
        }
    },
    admin: {
        select: {
            id_utilisateur: true,
            nom: true,
            prenom: true,
            email: true
        }
    }
};

// Demande publique: cree une entree admin, sans token ni lien terminal.
const forgotPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        if (!email) {
            return res.status(400).json({ error: "Email obligatoire" });
        }

        const genericMessage = "Votre demande de reinitialisation a ete transmise a l'administrateur.";

        const user = await prisma.utilisateur.findFirst({
            where: { email, supprime: false },
            select: { id_utilisateur: true, email: true, nom: true, prenom: true }
        });

        // Ne pas reveler si l'adresse existe ou non.
        if (!user) return res.json({ message: genericMessage });

        const existing = await prisma.demande_reinitialisation_mot_de_passe.findFirst({
            where: {
                id_utilisateur: user.id_utilisateur,
                statut: { in: OPEN_RESET_STATUSES }
            },
            orderBy: { date_demande: 'desc' }
        });

        if (existing) {
            await prisma.demande_reinitialisation_mot_de_passe.update({
                where: { id_demande: existing.id_demande },
                data: {
                    email_demande: user.email,
                    date_demande: new Date()
                }
            });
        } else {
            await prisma.demande_reinitialisation_mot_de_passe.create({
                data: {
                    id_utilisateur: user.id_utilisateur,
                    email_demande: user.email,
                    statut: RESET_STATUS.PENDING
                }
            });
        }

        await logAuditAction(
            "Demande reset mot de passe",
            user.email,
            "Systeme"
        );

        res.json({ message: genericMessage });
    } catch (error) {
        console.error("forgotPassword request error:", error);
        res.status(500).json({ error: "Erreur lors de la creation de la demande" });
    }
};

const listPasswordResetRequests = async (req, res) => {
    try {
        const requests = await prisma.demande_reinitialisation_mot_de_passe.findMany({
            where: { statut: { in: OPEN_RESET_STATUSES } },
            include: resetRequestInclude,
            orderBy: { date_demande: 'desc' }
        });

        res.json({
            success: true,
            total: requests.length,
            requests: requests.map(serializeResetRequest)
        });
    } catch (error) {
        console.error("listPasswordResetRequests error:", error);
        res.status(500).json({ error: "Erreur lors de la recuperation des demandes" });
    }
};

const validatePasswordResetRequest = async (req, res) => {
    try {
        const id = parseInt(req.params.id_demande, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: "Identifiant invalide" });
        }

        const current = await prisma.demande_reinitialisation_mot_de_passe.findUnique({
            where: { id_demande: id }
        });
        if (!current) return res.status(404).json({ error: "Demande introuvable" });
        if (current.statut !== RESET_STATUS.PENDING) {
            return res.status(400).json({ error: "Cette demande ne peut pas etre validee" });
        }

        const request = await prisma.demande_reinitialisation_mot_de_passe.update({
            where: { id_demande: id },
            data: {
                statut: RESET_STATUS.APPROVED,
                date_validation: new Date(),
                traite_par: req.user.id
            },
            include: resetRequestInclude
        });

        await logAuditAction(
            "Validation demande reset mot de passe",
            request.email_demande,
            req.user.email
        );

        res.json({
            message: "Demande validee.",
            request: serializeResetRequest(request)
        });
    } catch (error) {
        console.error("validatePasswordResetRequest error:", error);
        res.status(500).json({ error: "Erreur lors de la validation de la demande" });
    }
};

const refusePasswordResetRequest = async (req, res) => {
    try {
        const id = parseInt(req.params.id_demande, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: "Identifiant invalide" });
        }

        const current = await prisma.demande_reinitialisation_mot_de_passe.findUnique({
            where: { id_demande: id }
        });
        if (!current) return res.status(404).json({ error: "Demande introuvable" });
        if (!OPEN_RESET_STATUSES.includes(current.statut)) {
            return res.status(400).json({ error: "Cette demande est deja traitee" });
        }

        const request = await prisma.demande_reinitialisation_mot_de_passe.update({
            where: { id_demande: id },
            data: {
                statut: RESET_STATUS.REFUSED,
                date_refus: new Date(),
                traite_par: req.user.id,
                commentaire: req.body?.commentaire || null
            },
            include: resetRequestInclude
        });

        await logAuditAction(
            "Refus demande reset mot de passe",
            request.email_demande,
            req.user.email
        );

        res.json({
            message: "Demande refusee.",
            request: serializeResetRequest(request)
        });
    } catch (error) {
        console.error("refusePasswordResetRequest error:", error);
        res.status(500).json({ error: "Erreur lors du refus de la demande" });
    }
};

const resetPasswordFromRequest = async (req, res) => {
    try {
        const id = parseInt(req.params.id_demande, 10);
        const newPassword = String(req.body?.newPassword || '');

        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: "Identifiant invalide" });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caracteres" });
        }

        const current = await prisma.demande_reinitialisation_mot_de_passe.findUnique({
            where: { id_demande: id },
            include: { utilisateur: true }
        });
        if (!current) return res.status(404).json({ error: "Demande introuvable" });
        if (!OPEN_RESET_STATUSES.includes(current.statut)) {
            return res.status(400).json({ error: "Cette demande est deja traitee" });
        }
        if (!current.utilisateur || current.utilisateur.supprime) {
            return res.status(400).json({ error: "Utilisateur introuvable ou desactive" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const request = await prisma.$transaction(async (tx) => {
            await tx.utilisateur.update({
                where: { id_utilisateur: current.id_utilisateur },
                data: {
                    mot_de_passe: hashedPassword,
                    reset_password_token: null,
                    reset_password_expires: null
                }
            });

            return tx.demande_reinitialisation_mot_de_passe.update({
                where: { id_demande: id },
                data: {
                    statut: RESET_STATUS.RESET,
                    date_reinitialisation: new Date(),
                    date_validation: current.date_validation || new Date(),
                    traite_par: req.user.id
                },
                include: resetRequestInclude
            });
        });

        invalidateUser(current.id_utilisateur);

        await logAuditAction(
            "Reinitialisation mot de passe admin",
            request.email_demande,
            req.user.email
        );

        res.json({
            message: "Mot de passe reinitialise avec succes.",
            request: serializeResetRequest(request)
        });
    } catch (error) {
        console.error("resetPasswordFromRequest error:", error);
        res.status(500).json({ error: "Erreur lors de la reinitialisation du mot de passe" });
    }
};



// ================================
// LISTE UTILISATEURS (ADMIN_DPE + CONSULTANT_DPE)
// ================================
const listUsers = async (req, res) => {
    try {
        const role = req.user?.role;
        if (!['ADMIN_DPE', 'CONSULTANT_DPE'].includes(role)) {
            return res.status(403).json({ error: "Accès refusé" });
        }
        const users = await prisma.utilisateur.findMany({
            where: { supprime: false },
            select: {
                id_utilisateur: true,
                nom: true,
                prenom: true,
                email: true,
                role: true,
                id_structure: true,
                structure_cree: true,
                est_valide: true,
                date_creation: true,
                structure: {
                    select: { nom_structure: true, code: true, type_structure: true },
                },
            },
            orderBy: { id_utilisateur: 'asc' },
        });
        res.json({ success: true, total: users.length, users });
    } catch (error) {
        console.error("listUsers error:", error);
        res.status(500).json({ error: "Erreur lors de la récupération des utilisateurs" });
    }
};
const logout = async (req, res) => {
    try {
        // Enregistrer dans le journal d'audit
        await logAuditAction('Déconnexion', 'Session', `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim() || req.user?.email || 'Utilisateur inconnu', req);
        res.json({ message: "Déconnexion enregistrée" });
    } catch (error) {
        console.error("Erreur Logout:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
};
const addAudit = async (req, res) => {
    try {
        const { action, target, detail } = req.body;
        await logAuditAction(action, target, `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim() || req.user?.email || 'Utilisateur inconnu', req);
        res.json({ message: "Audit enregistré" });
    } catch (error) {
        console.error("Erreur Add Audit:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
};
const getAuditLogs = async (req, res) => {
    try {
        const logs = await prisma.audit_log.findMany({
            orderBy: { date: 'desc' },
            take: 100
        });

        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ error: "Erreur audit logs" });
    }
};
module.exports = {
    register,
    validateUser,
    login,
    forgotPassword,
    listPasswordResetRequests,
    validatePasswordResetRequest,
    refusePasswordResetRequest,
    resetPasswordFromRequest,
    logout,
    addAudit,
    deleteUser,
    listUsers,
    getAuditLogs
};
