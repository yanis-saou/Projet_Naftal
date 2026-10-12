const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma'); // <-- singleton Prisma

const JWT_SECRET = process.env.JWT_SECRET;

// Cache utilisateur en RAM — évite un findUnique à chaque appel API.
// TTL de 60s : un changement côté admin (suppression, rôle) prend max 60s
// à se propager. Acceptable pour cette app interne.
const USER_CACHE_TTL_MS = 60 * 1000;
const userCache = new Map();      // id_utilisateur -> { user, expiresAt }
const inflightUsers = new Map();  // id_utilisateur -> Promise<user>  (single-flight)

function getCachedUser(id) {
    const entry = userCache.get(id);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        userCache.delete(id);
        return null;
    }
    return entry.user;
}

function setCachedUser(id, user) {
    userCache.set(id, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

// Récupère l'utilisateur en évitant le cache stampede :
// si plusieurs requêtes arrivent en parallèle pour le même id, une seule
// touche la DB, les autres attendent la même promesse.
function fetchUserDeduped(id) {
    const inflight = inflightUsers.get(id);
    if (inflight) return inflight;

    const promise = prisma.utilisateur.findUnique({
        where: { id_utilisateur: id },
        select: { id_utilisateur: true, role: true, id_structure: true, email: true, nom: true, prenom: true }
    })
        .then(user => {
            if (user) setCachedUser(id, user);
            return user;
        })
        .finally(() => {
            inflightUsers.delete(id);
        });

    inflightUsers.set(id, promise);
    return promise;
}

// Exporté pour invalider depuis d'autres contrôleurs (delete, update user)
function invalidateUser(id) {
    userCache.delete(id);
}

// Exporté pour pré-remplir le cache après un login réussi.
// Évite que le middleware refasse une requête DB juste après le login.
function primeUserCache(user) {
    if (!user || !user.id_utilisateur) return;
    setCachedUser(user.id_utilisateur, {
        id_utilisateur: user.id_utilisateur,
        role: user.role,
        id_structure: user.id_structure,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom
    });
}

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: "Authentification requise" });

        const [scheme, token] = authHeader.split(' ');
        if (scheme !== 'Bearer' || !token) {
            return res.status(401).json({ error: "Format invalide. Utiliser: Bearer TOKEN" });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') return res.status(401).json({ error: "Token expiré" });
            return res.status(401).json({ error: "Token invalide" });
        }

        if (!decoded.id) return res.status(401).json({ error: "Token invalide : id manquant" });

        const tAuth = Date.now();
        const route = `${req.method} ${req.originalUrl}`;

        // 1) Tenter le cache RAM
        let userFromDb = getCachedUser(decoded.id);

        // 2) Si absent : passer par fetchUserDeduped (single-flight)
        if (userFromDb) {
            console.log(`[AUTH] cache HIT       id=${decoded.id}  ${String(Date.now() - tAuth).padStart(5)} ms  ${route}`);
        } else {
            const wasInflight = inflightUsers.has(decoded.id);
            userFromDb = await fetchUserDeduped(decoded.id);
            const ms = Date.now() - tAuth;
            const tag = wasInflight ? 'cache WAIT (dedup)' : 'cache MISS        ';
            console.log(`[AUTH] ${tag} id=${decoded.id}  ${String(ms).padStart(5)} ms  ${route}`);
        }

        if (!userFromDb) return res.status(401).json({ error: "Utilisateur introuvable" });

        req.user = {
            id: userFromDb.id_utilisateur,
            role: userFromDb.role,
            id_structure: userFromDb.id_structure,
            email: userFromDb.email,
            nom: userFromDb.nom,
            prenom: userFromDb.prenom
        };

        next();

    } catch (err) {
        console.error("Erreur authMiddleware :", err);
        return res.status(500).json({ error: "Authentification invalide ou expirée" });
        
    }
};

// ================================
// AUTHORIZE ROLES
// ================================
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: "Non authentifié" });

        const userRole = req.user.role;

        const isConsultant = [
            'CONSULTANT_DPE',
            'CONSULTANT_DISTRICT',
            'CONSULTANT_AGENCE',
            'CONSULTANT_ANTENNE'
        ].includes(userRole);

        if (isConsultant && req.method !== 'GET') {
            return res.status(403).json({ error: "Accès refusé : lecture seule" });
        }

        if (roles.length > 0 && !roles.includes(userRole)) {
            return res.status(403).json({ error: "Accès refusé pour votre rôle" });
        }

        next();
    };
};

module.exports = {
    authMiddleware,
    authorizeRoles,
    invalidateUser,
    primeUserCache
};