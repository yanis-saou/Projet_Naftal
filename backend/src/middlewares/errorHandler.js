const AppError = require("../utils/AppError");

/**
 * Middleware de gestion centralisée des erreurs.
 * Doit être monté EN DERNIER dans server.js (après toutes les routes).
 *
 * Distingue :
 *  - AppError (isOperational = true) : erreur métier prévisible → on retourne le message tel quel
 *  - Erreurs Prisma connues (P2002, P2025...) → message lisible
 *  - Toute autre erreur → 500 générique (on ne leak pas les détails en prod)
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  // --- 1. Erreurs opérationnelles (AppError) ---
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // --- 2. Erreurs Prisma connues ---
  if (err.code) {
    switch (err.code) {
      case "P2002":
        return res.status(409).json({
          success: false,
          message: `Doublon détecté : une entrée avec cette valeur existe déjà (${err.meta?.target?.join(", ") || "clé unique"}).`,
        });
      case "P2025":
        return res.status(404).json({
          success: false,
          message: "Enregistrement introuvable dans la base de données.",
        });
      case "P2003": {
        const fkDetail =
          err.meta?.field_name ||
          err.meta?.constraint ||
          err.meta?.modelName;
        console.error("[P2003]", { meta: err.meta, message: err.message });
        return res.status(400).json({
          success: false,
          message: fkDetail
            ? `Référence invalide sur '${fkDetail}' : la valeur fournie ne correspond à aucun enregistrement lié.`
            : "Référence invalide : la valeur fournie ne correspond à aucun enregistrement lié.",
        });
      }
      default:
        break;
    }
  }

  // --- 3. Erreur inattendue (bug, problème BDD, etc.) ---
  const isDev = process.env.NODE_ENV === "development";

  console.error("[ERROR]", {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  return res.status(500).json({
    success: false,
    message: "Une erreur interne est survenue.",
    // En développement, on affiche le détail pour faciliter le débogage
    ...(isDev && { erreur: err.message, stack: err.stack }),
  });
};

module.exports = errorHandler;
