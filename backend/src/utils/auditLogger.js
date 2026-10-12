const prisma = require('../config/prisma');

/**
 * Enregistre une action dans le journal d'audit
 * @param {string} action - Description de l'action effectuée
 * @param {string} target - Cible de l'action (numéro de carte, TPE, etc.)
 * @param {string} user - Utilisateur qui a effectué l'action
 * @param {Object} req - Objet requête pour extraire l'utilisateur authentifié
 */

async function logAuditAction(action, target = null, user = null, req = null) {
    try {

   

        // Extraire l'utilisateur depuis la requête si non fourni
        if (!user && req && req.user) {
            const prenom = req.user.prenom || '';
            const nom = req.user.nom || '';
            const email = req.user.email || '';

            
            
            if (prenom || nom) {
                user = `${prenom} ${nom}`.trim();
            } else if (email) {
                user = email;
            } else {
                user = 'Utilisateur inconnu';
            }
        } else if (!user) {
            user = 'Utilisateur inconnu';
        }


        await prisma.audit_log.create({
            data: {
                action,
                target,
                user,
                date: new Date()
            }
        });
    } catch (err) {
        console.error("Erreur journal d'audit:", err);
    }
}

module.exports = { logAuditAction };
