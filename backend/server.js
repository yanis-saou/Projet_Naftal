const express = require('express');
const cors = require('cors');
require('dotenv').config();

const prisma = require('./src/config/prisma');

prisma.$connect()
  .then(() => console.log('✅ DB connectée :)'))
  .catch(err => {
    console.error('❌ Connexion DB échouée au démarrage:', err.message);
    console.error('   Le serveur reste démarré, Prisma retentera à la 1ère requête.');
  });

// Filet de sécurité : ne pas tuer le process si une promesse oubliée échoue
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ unhandledRejection:', reason?.message || reason);
});

// Garder Supabase éveillé — un seul ping, espacé, pour ne pas saturer le pool
setInterval(() => {
  prisma.$queryRaw`SELECT 1`.catch(() => {});
}, 4 * 60 * 1000); // toutes les 4 minutes

// Fail fast si le secret JWT n'est pas défini — pas de valeur par défaut
// pour éviter de signer les tokens avec une chaîne publique.
if (!process.env.JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET must be set in the environment (see .env).');
    process.exit(1);
}

BigInt.prototype.toJSON = function () {
    return this.toString();
};

const app = express();
app.disable('etag');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// ================================================
// ROUTES
// ================================================
const authRoutes      = require('./src/routes/authRoutes');
const cartesRoutes    = require('./src/routes/cartes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const dechargeRoutes  = require('./src/routes/dechargeRoutes');
const rapportRoutes   = require('./src/routes/rapportRoutes');
const stationRoutes   = require('./src/routes/station');
const structureRoutes = require('./src/routes/structureRoutes');
const suiviRoutes     = require('./src/routes/SuiviAnomalieRoutes');
const tpeRoutes       = require('./src/routes/tpe');
const archiveRoutes   = require('./src/routes/archiveRoutes');
const errorHandler    = require('./src/middlewares/errorHandler');

app.use('/api/auth',      authRoutes);
app.use('/api/cartes',    cartesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/decharges', dechargeRoutes);
app.use('/api/rapports',  rapportRoutes);
app.use('/api/station',   stationRoutes);
app.use('/api/structure', structureRoutes);
app.use('/api/suivi',     suiviRoutes);
app.use('/api/tpe',       tpeRoutes);
app.use('/api/archives',  archiveRoutes);
// ================================================
// HEALTH CHECK
// ================================================
app.get('/', (req, res) => {
    res.json({ message: 'Serveur NAFTAL fonctionne !' });
});

// Gestionnaire d'erreurs centralisé — doit être en dernier
app.use(errorHandler);

// ================================================
// DÉMARRAGE
// ================================================
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
    console.log(`Serveur NAFTAL démarré sur http://localhost:${PORT}`);
});
