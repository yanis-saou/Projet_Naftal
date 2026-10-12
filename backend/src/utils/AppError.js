/**
 * Classe d'erreur opérationnelle.
 * Distingue les erreurs métier prévisibles (400, 403, 404, 409)
 * des erreurs serveur inattendues (500).
 *
 * Utilisation :
 *   throw new AppError("Carte non trouvée", 404);
 *   throw new AppError("Carte non disponible en stock", 400);
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // Erreur connue, pas un bug
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
