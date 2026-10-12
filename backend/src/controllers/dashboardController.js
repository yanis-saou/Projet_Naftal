const prisma = require('../config/prisma');
const { getScopeFilters } = require('../middlewares/scopeMiddleware');

const getDashboardTPECarte = async (req, res) => {
    try {
        const userRole = req.user?.role?.toUpperCase();

        const allowedRoles = [
            'ADMIN_DPE', 'CONSULTANT_DPE', 'MEMBRE_DPE',
            'MEMBRE_DISTRICT', 'CONSULTANT_DISTRICT',
            'MEMBRE_ANTENNE', 'CONSULTANT_ANTENNE',
            'MEMBRE_AGENCE', 'CONSULTANT_AGENCE',
        ];

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({ error: 'AccÃ¨s refusÃ©' });
        }

        const {
            whereTPE,
            whereCarte,
            whereCirculationTPE,
            whereCirculationCarte,
            whereSuiviTPE,
            whereSuiviCarte,
            
            whereStation,
        } = await getScopeFilters(req);

        const [
            stockTPE,
            maintenanceTPE,
            circulationTPE,
            
            stockCarte,
            maintenanceCarte,
            circulationCarte,
            allStations,
            dechargesTPE,
            dechargesCarte,
        ] = await Promise.all([
            prisma.stock_tpe.findMany({ where: whereTPE }),
            prisma.suivi_maintenance_tpe.findMany({ where: whereSuiviTPE }),
            prisma.circulation_tpe.findMany({ where: whereCirculationTPE }),
            



            prisma.stock_carte.findMany({ where: whereCarte }),
            prisma.suivi_maintenance_cartes.findMany({ where: whereSuiviCarte }),
            prisma.circulation_carte.findMany({ where: whereCirculationCarte }),
            prisma.station.findMany({
                where: whereStation,
                select: {
                    code_station: true,
                    nom_station: true,
                    wilaya: true,
                    district: true,
                    adresse: true,
                    latitude: true,
                    longitude: true,
                    _count: { select: { stock_tpe: true } },
                },
            }),
            prisma.decharge_tpe.findMany() || [],
            prisma.decharge_carte.findMany() || [],
        ]);

        const isPanne = (value) => value && (
            value.toUpperCase().includes('PANNE')
            || value.toUpperCase().includes('EN_COURS')
            || value.toUpperCase().includes('DEFECT')
        );

        const isNonFonctionnel = (value) => value && (
            value.toUpperCase().includes('VOLE')
            || value.toUpperCase().includes('ENDOMMAGE')
            || value.toUpperCase().includes('PERDU')
            || value.toUpperCase().includes('PANNE')
            || value.toUpperCase().includes('TRAITEMENT')
            || value.toUpperCase().includes('RAPAT')
        );

        const isCirculation = (value) => value && value.toUpperCase().includes('CIRCULATION');
        const isStock = (value) => value && value.toUpperCase().includes('STOCK');
        const isService = (value) => value && (
            value.toUpperCase().includes('SERVICE')
            || value.toUpperCase().includes('CIRCULATION')
        );

        const normalizeCardEtat = (value) => String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/_/g, ' ')
            .trim()
            .toUpperCase();
        const isCardCirculationState = (value) => normalizeCardEtat(value).includes('CIRCULATION');
        const isCardStockState = (value) => normalizeCardEtat(value).includes('STOCK');
        const isCardTreatmentState = (value) => {
            const etat = normalizeCardEtat(value);
            return etat.includes('TRAITEMENT') || etat.includes('EN COURS');
        };
        const isCardHardAnomalyState = (value) => {
            const etat = normalizeCardEtat(value);
            return ['DEFECTUEUSE', 'PERDUE', 'VOLEE', 'PERDUE/VOLEE', 'EXPIREE'].includes(etat);
        };
        const isCardAlertState = (value) => isCardTreatmentState(value) || isCardHardAnomalyState(value);
        const isCardChartAnomalyState = (value) => normalizeCardEtat(value) === 'DEFECTUEUSE';

        const getTpeKey = (item) => item ? String(item.numeroserietpe || item.numero_serie_tpe || '').trim() : '';
        const getCardKey = (item) => item ? String(item.numerocarte || item.number || '').trim() : '';

        const allTpeSerials = new Set([
            ...stockTPE.map(getTpeKey),
            ...circulationTPE.map(getTpeKey),
            ...maintenanceTPE.map(getTpeKey),
        ].filter(Boolean));

        const totalTPE = allTpeSerials.size;
        const panneSetTPE = new Set(maintenanceTPE.filter((item) => isPanne(item.etat_panne)).map(getTpeKey));
        const nonFonctionnelSetTPE = new Set(
            maintenanceTPE.filter((item) => isNonFonctionnel(item.etat_panne)).map(getTpeKey),
        );
        const circulationSetTPE = new Set(circulationTPE.map(getTpeKey).filter(Boolean));
        const serviceSetTPE = new Set(circulationTPE.filter((item) => isService(item.etat)).map(getTpeKey));
        // ✅ CORRECTION 2: Compter SEULEMENT les TPE avec le statut "En service" (pas en circulation)
        const serviceTPESet = new Set(
            stockTPE.filter((item) => {
                const etat = (item.etat_tpe || '').trim().toUpperCase();
                // Inclure 'SERVICE' mais exclure 'CIRCULATION'
                return etat.includes('SERVICE') && !etat.includes('CIRCULATION');
            }).map(getTpeKey).filter(Boolean),
        );

        const stockOnlyTPE = new Set(
            stockTPE.filter((item) => isStock(item.etat_tpe)).map(getTpeKey).filter(Boolean),
        ).size;
        const tauxPanneTPE = totalTPE ? Number(((panneSetTPE.size / totalTPE) * 100).toFixed(2)) : 0;
        const tauxServiceTPE = totalTPE ? Number(((serviceTPESet.size / totalTPE) * 100).toFixed(2)) : 0;

        const allCardNumbers = new Set([
            ...stockCarte.map(getCardKey),
            ...circulationCarte.map(getCardKey),
            ...maintenanceCarte.map(getCardKey),
        ].filter(Boolean));

        const totalCarte = allCardNumbers.size;
        const panneSetCarte = new Set(maintenanceCarte.filter((item) => isPanne(item.etat_panne)).map(getCardKey));
        const nonFonctionnelSetCarte = new Set(
            maintenanceCarte.filter((item) => isNonFonctionnel(item.etat_panne)).map(getCardKey),
        );
        const circulationSetCarte = new Set(
            stockCarte.filter((item) => isCardCirculationState(item.etat)).map(getCardKey).filter(Boolean),
        );
        const activeCarteSet = new Set(circulationSetCarte);
        const activeCarte = activeCarteSet.size;
        const availableCarte = new Set(
            stockCarte.filter((item) => isCardStockState(item.etat)).map(getCardKey).filter(Boolean),
        ).size;
        // ✅ CORRECTION 1: Compter SEULEMENT les cartes avec le statut "En cours traitement"
        const inProcessCarte = new Set(
            stockCarte.filter((item) => isCardTreatmentState(item.etat)).map(getCardKey).filter(Boolean),
        ).size;
        const tauxPanneCarte = totalCarte ? Number(((panneSetCarte.size / totalCarte) * 100).toFixed(2)) : 0;

        const now = new Date();
        const tpeNonRepare = new Set();
        const tpeNonFonctionnel = new Set();
        const tpeRecurrent = new Set();
        const carteNonFonctionnel = new Set();
        const carteRecurrent = new Set();



// ✅ Compter depuis stock_carte directement (pas suivi_maintenance_cartes)
const tpeEnMaintenance = new Set();
const tpeHorsService = new Set();
const carteEnMaintenance = new Set();
const carteHorsService = new Set();

// TPE
stockTPE.forEach((item) => {
    const numero = getTpeKey(item);
    if (!numero) return;
    const etat = (item.etat_tpe || "").trim();
    
    if (etat === 'En_panne' || etat === 'Volé') {
        tpeHorsService.add(numero);
    } else if (etat.includes('traitement') || etat.includes('Traitement')) {
        tpeEnMaintenance.add(numero);
    }
});

// CARTES
stockCarte.forEach((item) => {
    const numero = getCardKey(item);
    if (!numero) return;
    const etat = (item.etat || "").trim();
    
    if (isCardHardAnomalyState(etat)) {
        carteHorsService.add(numero);
    } else if (isCardTreatmentState(etat)) {
        carteEnMaintenance.add(numero);
    }
});

const alerts = [
    { type: 'tpe', count: tpeHorsService.size, label: 'TPE hors service', icon: 'fa-ban', class: 'danger' },
    { type: 'tpe', count: tpeEnMaintenance.size, label: 'TPE en maintenance', icon: 'fa-tools', class: 'warning' },
    { type: 'cards', count: carteHorsService.size, label: 'Cartes hors service', icon: 'fa-triangle-exclamation', class: 'danger' },
    { type: 'cards', count: carteEnMaintenance.size, label: 'Cartes en maintenance', icon: 'fa-screwdriver-wrench', class: 'warning' },
].filter(a => a.count > 0);



        const [historiqueCarte, historiqueTpe] = await Promise.all([
            allCardNumbers.size
                ? prisma.historique_carte.findMany({
                    where: { numerocarte: { in: [...allCardNumbers] } },
                    orderBy: { dateoperation: 'desc' },
                    take: 12,
                })
                : [],
            allTpeSerials.size
                ? prisma.historique_tpe.findMany({
                    where: { numeroserietpe: { in: [...allTpeSerials] } },
                    orderBy: { dateoperation: 'desc' },
                    take: 12,
                })
                : [],
        ]);

        const activity = [
            ...historiqueCarte.map((item) => ({
                date: item.dateoperation,
                action: item.ancienetat && item.nouveletat
                    ? `${item.ancienetat} â†’ ${item.nouveletat}`
                    : (item.commentaire || 'Carte'),
                target: item.numerocarte || '-',
                user: item.id_utilisateur ? `Utilisateur #${item.id_utilisateur}` : 'SystÃ¨me',
            })),
            ...historiqueTpe.map((item) => ({
                date: item.dateoperation,
                action: item.ancienetat && item.nouveletat
                    ? `${item.ancienetat} â†’ ${item.nouveletat}`
                    : (item.commentaire || 'TPE'),
                target: item.numeroserietpe || '-',
                user: item.id_utilisateur ? `Utilisateur #${item.id_utilisateur}` : 'SystÃ¨me',
            })),
        ]
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
            .slice(0, 12);

        const getMonthlyData = (items, dateField) => {
            const months = {};
            const current = new Date();

            for (let index = 5; index >= 0; index -= 1) {
                const date = new Date(current.getFullYear(), current.getMonth() - index, 1);
                const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
                months[key] = 0;
            }

            items.forEach((item) => {
                const date = new Date(item[dateField]);
                const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
                if (months[key] !== undefined) {
                    months[key] += 1;
                }
            });

            return Object.values(months);
        };

        const monthlyCards = getMonthlyData(circulationCarte, 'dateoperation');
        const monthlyTpe = getMonthlyData(circulationTPE, 'dateoperation');
        const monthlyCardAlerts = getMonthlyData(maintenanceCarte, 'date_anomalie');
        const monthlyTpeAlerts = getMonthlyData(maintenanceTPE, 'date_panne');

        // Calculate monthly evolution for cards and TPE
        function getMonthlyEvolution() {
            const current = new Date();
            const months = [];
            const labels = [];

            // Generate last 6 months
            for (let index = 5; index >= 0; index -= 1) {
                const date = new Date(current.getFullYear(), current.getMonth() - index, 1);
                const monthLabel = date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' });
                labels.push(monthLabel);
                months.push({
                    date: new Date(date.getFullYear(), date.getMonth(), 1),
                    cardsInCirculation: 0,
                    cardsInAnomaly: 0,
                    tpeInService: 0,
                    tpeInAnomaly: 0
                });
            }

            const toDate = (value) => {
                if (!value) return null;
                const date = new Date(value);
                return Number.isNaN(date.getTime()) ? null : date;
            };

            const latestCirculationDateByCard = new Map();
            circulationCarte.forEach((card) => {
                const key = getCardKey(card);
                if (!key) return;
                const date = toDate(card.date_sortie || card.date_reception);
                if (!date) return;
                const previous = latestCirculationDateByCard.get(key);
                if (!previous || date > previous) latestCirculationDateByCard.set(key, date);
            });

            const latestAlertDateByCard = new Map();
            maintenanceCarte.forEach((card) => {
                const key = getCardKey(card);
                if (!key) return;
                const date = toDate(card.date_anomalie);
                if (!date) return;
                const previous = latestAlertDateByCard.get(key);
                if (!previous || date > previous) latestAlertDateByCard.set(key, date);
            });

            const uniqueCards = new Map();
            stockCarte.forEach((card) => {
                const key = getCardKey(card);
                if (key && !uniqueCards.has(key)) uniqueCards.set(key, card);
            });

            uniqueCards.forEach((card, key) => {
                const etat = card.etat || '';
                const circulationStart =
                    toDate(card.date_remise) ||
                    latestCirculationDateByCard.get(key) ||
                    toDate(card.date_reception);
                const alertStart =
                    latestAlertDateByCard.get(key) ||
                    toDate(card.date_remise) ||
                    toDate(card.date_reception);

                for (let i = 0; i < months.length; i++) {
                    const monthEnd = new Date(months[i].date.getFullYear(), months[i].date.getMonth() + 1, 0, 23, 59, 59, 999);

                    if (isCardCirculationState(etat) && circulationStart && circulationStart <= monthEnd) {
                        months[i].cardsInCirculation++;
                    }

                    if (isCardChartAnomalyState(etat) && alertStart && alertStart <= monthEnd) {
                        months[i].cardsInAnomaly++;
                    }
                }
            });

            // Create unique sets to avoid double counting
            const uniqueTPEs = new Map();
            
            // Process stock TPE first
            stockTPE.forEach(tpe => {
                const serial = tpe.numeroserietpe;
                if (serial && !uniqueTPEs.has(serial)) {
                    uniqueTPEs.set(serial, {
                        receptionDate: tpe.date_reception ? new Date(tpe.date_reception) : null,
                        etat: tpe.etat_tpe || '',
                        isService: ['EN_SERVICE', 'SERVICE', 'CIRCULATION', 'En_service', 'EN_CIRCULATION'].includes((tpe.etat_tpe || '').toUpperCase()),
                        isAnomaly: ['En_panne', 'Volé', 'EN_PANNE', 'VOLÉ'].includes(tpe.etat_tpe || '')
                    });
                }
            });

            // Update with circulation TPE data (only if not already in stock)
            circulationTPE.forEach(tpe => {
                const serial = tpe.numeroserietpe;
                if (serial && !uniqueTPEs.has(serial)) {
                    uniqueTPEs.set(serial, {
                        receptionDate: tpe.date_remise ? new Date(tpe.date_remise) : null,
                        etat: tpe.etat || '',
                        isService: true, // TPE in circulation is considered in service
                        isAnomaly: ['En_panne', 'Volé', 'EN_PANNE', 'VOLÉ'].includes(tpe.etat || '')
                    });
                }
            });

            // Calculate TPE evolution using unique data
            uniqueTPEs.forEach((tpe) => {
                for (let i = 0; i < months.length; i++) {
                    const monthStart = months[i].date;
                    const monthEnd = new Date(months[i].date.getFullYear(), months[i].date.getMonth() + 1, 0);
                    
                    // TPE exists during this month (received/remis before or during this month)
                    if (tpe.receptionDate && tpe.receptionDate <= monthEnd) {
                        // TPE exists by this month
                        if (tpe.isService) {
                            months[i].tpeInService++;
                        }
                        
                        // Check if TPE is in anomaly status during this month
                        if (tpe.isAnomaly) {
                            months[i].tpeInAnomaly++;
                        }
                    }
                }
            });

            return {
                labels,
                cards: {
                    circulation: months.map(m => m.cardsInCirculation),
                    alerts: months.map(m => m.cardsInAnomaly)
                },
                tpe: {
                    service: months.map(m => m.tpeInService),
                    alerts: months.map(m => m.tpeInAnomaly)
                }
            };
        }

        const evolutionData = getMonthlyEvolution();

        const chartData = {
            cards: {
                circulation: evolutionData.cards.circulation,
                alerts: evolutionData.cards.alerts,
            },
            tpe: {
                service: evolutionData.tpe.service,
                alerts: evolutionData.tpe.alerts,
            },
            labels: evolutionData.labels,
            monthlyCards,
            monthlyTpe,
            monthlyCardAlerts,
            monthlyTpeAlerts,
        };

        const panneParStation = {};
        maintenanceTPE.forEach((item) => {
            const code = item.code_station || item.code_structure;
            if (!code) return;
            panneParStation[code] = (panneParStation[code] || 0) + 1;
        });

        const stationsGeo = allStations.map((station) => {
            const tpeCount = station._count?.stock_tpe || 0;
            const pannes = panneParStation[station.code_station] || 0;

            let status = 'ok';
            if (pannes > 2) status = 'alert';
            else if (pannes > 0) status = 'maintenance';

            return {
                code: station.code_station,
                name: station.nom_station || station.code_station,
                wilaya: station.wilaya || '',
                district: station.district || '',
                adresse: station.adresse || '',
                tpe: tpeCount,
                pannes,
                status,
                lat: station.latitude ? Number(station.latitude) : null,
                lng: station.longitude ? Number(station.longitude) : null,
            };
        }).filter((station) => station.lat !== null && station.lng !== null);

        const transferSetTPE = new Set([...circulationSetTPE]);

        // ✅ CORRECTION 3: Compter séparément les décharges TPE et Cartes
        const dechargesTPETotal = (Array.isArray(dechargesTPE) ? dechargesTPE : []).length;
        const dechargesCarteTotal = (Array.isArray(dechargesCarte) ? dechargesCarte : []).length;
        const transfersTotal = dechargesTPETotal + dechargesCarteTotal;

        res.json({
            cardsTotal: totalCarte,
            cardsActive: activeCarte,
            cardsAvailable: availableCarte,
            cardsInProcess: inProcessCarte,
            tpeTotal: totalTPE,
            tpeStock: stockOnlyTPE,
            tpeServiceRate: tauxServiceTPE,
            tpeService: serviceTPESet.size,
            transfersTotal,
            dechargesTPETotal,
            dechargesCarteTotal,
            alertsTotal: alerts.reduce((sum, alert) => sum + (alert.count || 0), 0),
            alerts,
            activity,
            chartData,
            stationsGeo,
            dashboard: {
                TPE: {
                    total: totalTPE,
                    taux_panne: `${tauxPanneTPE}%`,
                    Service: serviceTPESet.size,
                    en_panne: panneSetTPE.size,
                    non_fonctionnel: nonFonctionnelSetTPE.size,
                    en_circulation: circulationSetTPE.size,
                    restitue: 0,
                },
                CARTE: {
                    total: totalCarte,
                    taux_panne: `${tauxPanneCarte}%`,
                    en_panne: panneSetCarte.size,
                    non_fonctionnel: nonFonctionnelSetCarte.size,
                    en_circulation: circulationSetCarte.size,
                },
                alertes: alerts,
            },
        });
    } catch (error) {
        console.error('getDashboardTPECarte error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getDashboardTPECarte };
