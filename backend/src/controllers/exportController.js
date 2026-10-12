// src/controllers/exportController.js
const ExcelJS = require('exceljs');
const prisma = require('../config/prisma');

const exporterCommandeExcel = async (req, res) => {
    try {
        const { numeroCommande } = req.params;

        // Récupération de la commande avec ses lignes et relations
        const commande = await prisma.commande_cib.findUnique({
            where: { numero_commande: numeroCommande },
            include: {
                ligne_commande_cib: true,
                station: true,
                structure: true
            }
        });

        if (!commande) return res.status(404).json({ error: "Commande non trouvée" });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Commande');

        // Style des colonnes
        sheet.columns = [
            { header: 'Numéro de Commande', key: 'numero_commande', width: 25 },
            { header: 'Date de Commande', key: 'date_commande', width: 20 },
            { header: 'Structure émettrice', key: 'structure_emmetrice', width: 25 },
            { header: 'Code Station', key: 'code_station', width: 20 },
            { header: 'Compte Bancaire', key: 'n_compte_bancaire', width: 25 },
            { header: 'Modèle TPE', key: 'modele_tpe', width: 25 },
            { header: 'Quantité', key: 'quantite', width: 15 },
            { header: 'Tarification', key: 'tarification', width: 20 },
        ];

        // Ligne d'information générale (commande)
        sheet.addRow({
            numero_commande: commande.numero_commande,
            date_commande: commande.date_commande?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
            structure_emmetrice: commande.structure?.nom_structure || 'N/A',
            code_station: commande.station?.code_station || 'N/A',
            n_compte_bancaire: commande.n_compte_bancaire || 'N/A'
        });

        // Lignes des TPE commandés
        commande.ligne_commande_cib.forEach(ligne => {
            sheet.addRow({
                modele_tpe: ligne.modele_tpe || 'N/A',
                quantite: ligne.quantite || 0,
                tarification: ligne.tarification || 'STANDARD'
            });
        });

        // En-têtes pour le téléchargement
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=Commande-${numeroCommande}.xlsx`
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur lors de l\'export Excel' });
    }
};

module.exports = { exporterCommandeExcel };