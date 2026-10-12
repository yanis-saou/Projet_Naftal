const prisma = require('../config/prisma');

// ================================
// GET ONE STATION (fiche détail)
// ================================
const getStation = async (req, res) => {
    try {
        const { code } = req.params;

        const station = await prisma.station.findFirst({
            where: { code_station: code }
        });
        if (!station) return res.status(404).json({ error: "Station introuvable" });

        const tpeList = await prisma.stock_tpe.findMany({
            where: { code_station: station.code_station },
            select: {
                numeroserietpe: true,
                idtpe: true,
                etat_tpe: true,
                date_reception: true
            }
        });

        res.json({
            fiche: {
                identite: {
                    nom: station.nom_station,
                    name: station.nom_station,
                    code: station.code_station,
                    wilaya: station.wilaya,
                    district: station.district,
                    adresse: station.adresse || "",
                },
                equipements: {
                    // ✅ tpeCount exposé pour le frontend
                    tpeCount: tpeList.length,
                    tpe: tpeList.map(t => ({
                        serial: t.numeroserietpe,
                        idTerminal: t.idtpe,
                        status: t.etat_tpe || "—",
                        maintenanceDate: t.date_reception
                    }))
                }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const getAllStations = async (req, res) => {
    try {
        const userRole = req.user?.role?.toUpperCase();
        const userStructureId = req.user?.id_structure;

        // Filtre structure selon rôle (même logique que dashboard)
        let stationWhere = {};
        if (!["ADMIN_DPE", "CONSULTANT_DPE", "MEMBRE_DPE"].includes(userRole) && userStructureId) {
            const structure = await prisma.structure.findUnique({
                where: { idstructure: userStructureId },
                select: { code: true }
            });
            if (structure) {
                if (userRole?.includes("DISTRICT")) {
                    const childStructures = await prisma.structure.findMany({
                        where: { code_parent: structure.code },
                        select: { code: true }
                    });
                    const codes = [structure.code, ...childStructures.map(s => s.code)];
                    // Filtrer les stations dont le code_structure est dans ces codes
                    stationWhere.stock_tpe = { some: { code_structure: { in: codes } } };
                } else if (userRole?.includes("ANTENNE") || userRole?.includes("AGENCE")) {
                    stationWhere.stock_tpe = { some: { code_structure: structure.code } };
                }
            }
        }

        const stations = await prisma.station.findMany({
            where: stationWhere,
            select: {
                code_station: true,
                nom_station: true,
                wilaya: true,
                district: true,
                adresse: true,
                latitude: true,
                longitude: true,
                _count: { select: { stock_tpe: true } }
            },
            orderBy: { nom_station: 'asc' }
        });

        // ✅ Format normalisé attendu par le frontend (normalizeStationRecord)
        const result = stations.map(st => ({
            id: st.code_station,
            code: st.code_station,
            name: st.nom_station || st.code_station,
            wilaya: st.wilaya || '',
            district: st.district || '',
            adresse: st.adresse || '',
            tpeCount: st._count?.stock_tpe || 0,
            // coordonnées pour la carte Leaflet
            lat: st.latitude ? Number(st.latitude) : null,
            lng: st.longitude ? Number(st.longitude) : null,
            status: 'Active',
        }));

        res.json(result);
    } catch (error) {
        console.error('getAllStations error:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateStation = async (req, res) => {
    try {
        const { code } = req.params;
        const { nom_station, wilaya, adresse, district } = req.body;

        // Vérifier que la station existe
        const existing = await prisma.station.findFirst({
            where: { code_station: code }
        });

        if (!existing) {
            return res.status(404).json({ error: "Station introuvable" });
        }

        // ✅ Uniquement les champs qui existent dans le schéma Prisma
        const updateData = {};
        if (nom_station !== undefined && nom_station !== "") updateData.nom_station = nom_station;
        if (wilaya !== undefined && wilaya !== "") updateData.wilaya = wilaya;
        if (adresse !== undefined) updateData.adresse = adresse;
        if (district !== undefined && district !== "") updateData.district = district;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
        }

        const updated = await prisma.station.update({
            where: { code_station: code },
            data: updateData
        });

        res.json({
            success: true,
            station: {
                code: updated.code_station,
                nom: updated.nom_station,
                wilaya: updated.wilaya,
                adresse: updated.adresse,
                district: updated.district
            }
        });

    } catch (error) {
        console.error(error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: "Station introuvable" });
        }
        res.status(500).json({ error: error.message });
    }
};


module.exports = { getStation, getAllStations, updateStation };