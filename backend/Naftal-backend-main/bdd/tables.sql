
-- CLEAN DROP 
DROP VIEW IF EXISTS DASHBOARD_GLOBAL, DASHBOARD_ETATS, view_dashboard_stats, view_liste_cartes_complete, view_liste_tpe_complete CASCADE;
DROP TABLE IF EXISTS 
    HISTORIQUE_MOUVEMENTS, COMMANDE_TPE, LIGNE_DECHARGE, DECHARGE, 
    SUIVI_TPE, SUIVI_CARTE, SUIVI_EQUIPEMENT, DETAIL_TPE, 
    DETAIL_CARTE, STOCK_EQUIPEMENT, UTILISATEUR, STRUCTURE 
CASCADE;
DROP TABLE IF EXISTS structure_import, carte_import, tpe_import;

-- STRUCTURE
-- ==========================================

CREATE TABLE STRUCTURE (
    idStructure SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    nom_structure VARCHAR(255) NOT NULL,
    type_structure VARCHAR(50) CHECK (
        type_structure IN ('DPE', 'DISTRICT', 'AGENCE', 'ANTENNE','CELLULE')
    ),
    id_parent INT REFERENCES STRUCTURE(idStructure),
    adresse TEXT
);

CREATE INDEX idx_structure_code ON STRUCTURE(code);

-- ==========================================
-- UTILISATEUR
-- ==========================================

CREATE TABLE UTILISATEUR (
    idUtilisateur SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    telephone VARCHAR(20),
    motDePasse VARCHAR(255) NOT NULL,
    role VARCHAR(50) CHECK (
        role IN ('Administrateur', 'Membre DPE', 'Membre District', 'Membre Agence', 'Membre Antenne')
    ),
    idStructure INT NOT NULL REFERENCES STRUCTURE(idStructure),
    actif BOOLEAN DEFAULT TRUE,
    dateCreation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- STOCK
-- ==========================================

CREATE TABLE STOCK_EQUIPEMENT (
    idEquipement SERIAL PRIMARY KEY,
    type_entite VARCHAR(10) NOT NULL CHECK (type_entite IN ('CARTE', 'TPE')),
    etat VARCHAR(50) NOT NULL DEFAULT 'Neuf' CHECK (
        etat IN ('Neuf', 'En stock', 'Attribué', 'En circulation', 'En service',
                 'En panne', 'Volé', 'Perdu', 'Expiré', 'Restitué', 'En cours de traitement')
    ),
    idStructureActuelle INT REFERENCES STRUCTURE(idStructure),
    dateReception DATE DEFAULT CURRENT_DATE,
    dateDerniereMiseAJour TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stock_structure ON STOCK_EQUIPEMENT(idStructureActuelle);

-- ==========================================
-- DETAIL CARTE
-- ==========================================

CREATE TABLE DETAIL_CARTE (
    idEquipement INT PRIMARY KEY REFERENCES STOCK_EQUIPEMENT(idEquipement) ON DELETE CASCADE,
    numeroCarte VARCHAR(50) UNIQUE NOT NULL,
    typeCarte VARCHAR(50) CHECK (typeCarte IN ('Nominatif', 'Numéroté', 'Véhiculé')),
    codeClient VARCHAR(50),
    raisonSocialeClient VARCHAR(255),
    numeroBTS VARCHAR(50),
    dateExpiration DATE,
    dateRemise DATE
);

-- ==========================================
-- DETAIL TPE
-- ==========================================

CREATE TABLE DETAIL_TPE (
    idEquipement INT PRIMARY KEY REFERENCES STOCK_EQUIPEMENT(idEquipement) ON DELETE CASCADE,
    numeroSerieTPE VARCHAR(50) UNIQUE NOT NULL,
    idTPE VARCHAR(50),
    numeroCompteBancaire VARCHAR(50),
    numeroContrat VARCHAR(50),
    operateurMobile VARCHAR(50),
    nom_commercial TEXT,
    numeroSerieSIM VARCHAR(50),
    numeroTelephoneSIM VARCHAR(20),
    adresse TEXT,
    wilaya VARCHAR(100),
    amortissement INT,
    dateInstallation DATE,
    dateExpiration DATE
);

CREATE INDEX idx_carte_numero ON DETAIL_CARTE(numeroCarte);
CREATE INDEX idx_tpe_serie ON DETAIL_TPE(numeroSerieTPE);

-- ==========================================
-- SUIVI
-- ==========================================

CREATE TABLE SUIVI_EQUIPEMENT (
    idSuivi SERIAL PRIMARY KEY,
    idEquipement INT NOT NULL REFERENCES STOCK_EQUIPEMENT(idEquipement) ON DELETE CASCADE,
    dateOperation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modeOperation VARCHAR(100),
    diagnostic VARCHAR(255),
    etat_constate VARCHAR(50),
    commentaire TEXT
);

CREATE TABLE SUIVI_CARTE (
    idSuivi INT PRIMARY KEY REFERENCES SUIVI_EQUIPEMENT(idSuivi) ON DELETE CASCADE,
    dateAnomalie DATE,
    carteSubstitution VARCHAR(50)
);

CREATE TABLE SUIVI_TPE (
    idSuivi INT PRIMARY KEY REFERENCES SUIVI_EQUIPEMENT(idSuivi) ON DELETE CASCADE,
    numeroCompteBancaire VARCHAR(50),
    dateInstallation DATE,
    dateRemise DATE,
    dotation VARCHAR(50) CHECK (dotation IN ('Initiale', 'Supplémentaire', 'Remplacement')),
    nbrChargeurs INT DEFAULT 0
);

-- ==========================================
-- DECHARGE
-- ==========================================

CREATE TABLE DECHARGE (
    idDecharge SERIAL PRIMARY KEY,
    annee INT NOT NULL,
    numeroSequence INT NOT NULL,
    numeroDecharge VARCHAR(20) UNIQUE,
    idSource INT REFERENCES STRUCTURE(idStructure),
    idDestination INT REFERENCES STRUCTURE(idStructure),
    dateEmission DATE DEFAULT CURRENT_DATE,
    destinataire_nom VARCHAR(100),
    statut VARCHAR(50) DEFAULT 'En attente'
);

CREATE TABLE LIGNE_DECHARGE (
    idLigne SERIAL PRIMARY KEY,
    idDecharge INT REFERENCES DECHARGE(idDecharge) ON DELETE CASCADE,
    idEquipement INT REFERENCES STOCK_EQUIPEMENT(idEquipement),
    commentaire TEXT
);

-- ==========================================
-- HISTORIQUE
-- ==========================================

CREATE TABLE HISTORIQUE_MOUVEMENTS (
    idHistorique SERIAL PRIMARY KEY,
    type_entite VARCHAR(10),
    idEquipement INT REFERENCES STOCK_EQUIPEMENT(idEquipement),
    ancien_etat VARCHAR(50),
    nouvel_etat VARCHAR(50),
    ancienne_structure_id INT REFERENCES STRUCTURE(idStructure),
    nouvelle_structure_id INT REFERENCES STRUCTURE(idStructure),
    dateMouvement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    commentaire TEXT
);

--==========================================
-- 5 - TABLES POUR L'IMPORTATION 
-- ==========================================

CREATE  TABLE structure_import (
    code TEXT,
    nom_structure TEXT,
    type_structure TEXT,
    code_parent TEXT
);

CREATE TABLE carte_import (
    "Raison_Client" TEXT,
    "Porteur (N)" TEXT,
    "Code_Entite" TEXT,
    "Libele_Entite" TEXT,
    "MOTMETH" TEXT,
    "Date_Reception" TEXT,
    "IDSTK" TEXT,
    "Statut" TEXT
);

CREATE TABLE tpe_import (
    "N_serie TPE" TEXT,
    "ID_Terminal" TEXT,
    "N_ Compte" TEXT,
    "N_Contrat" TEXT,
    "Libelle_TPE" TEXT,
    "Nom_Commercial" TEXT,
    "Adresse" TEXT,
    "Tarification" TEXT
);

-- ==========================================
-- TRIGGERS
-- ==========================================

-- Format décharge
CREATE OR REPLACE FUNCTION format_decharge() RETURNS TRIGGER AS $$
BEGIN
    NEW.numeroDecharge := NEW.annee || ' / ' || LPAD(NEW.numeroSequence::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_num_decharge
BEFORE INSERT ON DECHARGE
FOR EACH ROW EXECUTE FUNCTION format_decharge();

-- Historique 
CREATE OR REPLACE FUNCTION historiser_mouvement() RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.etat IS DISTINCT FROM NEW.etat OR
        OLD.idStructureActuelle IS DISTINCT FROM NEW.idStructureActuelle)
    THEN
        INSERT INTO HISTORIQUE_MOUVEMENTS (
            type_entite, idEquipement, ancien_etat, nouvel_etat,
            ancienne_structure_id, nouvelle_structure_id, commentaire
        ) VALUES (
            NEW.type_entite, NEW.idEquipement, OLD.etat, NEW.etat,
            OLD.idStructureActuelle, NEW.idStructureActuelle,
            'Mise à jour automatique'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_historique_auto
AFTER UPDATE ON STOCK_EQUIPEMENT
FOR EACH ROW EXECUTE FUNCTION historiser_mouvement();

-- Décharge 
CREATE OR REPLACE FUNCTION maj_stock_par_decharge()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE STOCK_EQUIPEMENT
    SET 
        idStructureActuelle = (
            SELECT idDestination FROM DECHARGE WHERE idDecharge = NEW.idDecharge
        ),
        etat = CASE 
            WHEN etat IN ('En panne', 'Volé', 'Perdu') THEN etat
            WHEN type_entite = 'CARTE' THEN 'En circulation'
            ELSE 'Attribué'
        END,
        dateDerniereMiseAJour = CURRENT_TIMESTAMP
    WHERE idEquipement = NEW.idEquipement;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_maj_stock_decharge
AFTER INSERT ON LIGNE_DECHARGE
FOR EACH ROW EXECUTE FUNCTION maj_stock_par_decharge();

-- ==========================================
-- DASHBOARD
-- ==========================================

CREATE VIEW DASHBOARD_GLOBAL AS
SELECT 
    (SELECT COUNT(*) FROM STOCK_EQUIPEMENT) AS total_equipements,
    (SELECT COUNT(*) FROM DETAIL_CARTE) AS total_cartes,
    (SELECT COUNT(*) FROM DETAIL_TPE) AS total_tpe;

CREATE VIEW DASHBOARD_ETATS AS
SELECT type_entite, etat, COUNT(*) AS nombre
FROM STOCK_EQUIPEMENT
GROUP BY type_entite, etat;

CREATE OR REPLACE VIEW view_dashboard_stats AS
SELECT 
    (SELECT COUNT(*) FROM STOCK_EQUIPEMENT WHERE type_entite = 'CARTE') as total_cartes,
    (SELECT COUNT(*) FROM STOCK_EQUIPEMENT WHERE type_entite = 'TPE') as total_tpe,
    (SELECT COUNT(*) FROM STOCK_EQUIPEMENT WHERE etat = 'En panne') as total_en_panne,
    (SELECT COUNT(*) FROM DECHARGE WHERE statut = 'En attente') as transferts_en_cours;

CREATE OR REPLACE VIEW view_liste_cartes_complete AS
SELECT 
    dc.numeroCarte,
    dc.raisonSocialeClient,
    dc.typeCarte,
    e.etat,
    s.nom_structure as localisation,
    e.dateDerniereMiseAJour
FROM STOCK_EQUIPEMENT e
JOIN DETAIL_CARTE dc ON e.idEquipement = dc.idEquipement
LEFT JOIN STRUCTURE s ON e.idStructureActuelle = s.idStructure
WHERE e.type_entite = 'CARTE';

CREATE OR REPLACE VIEW view_liste_tpe_complete AS
SELECT 
    dt.numeroSerieTPE,
    dt.nom_commercial, 
    e.etat,
    s.nom_structure as structure_actuelle,
    dt.dateInstallation,
    dt.numeroCompteBancaire
FROM STOCK_EQUIPEMENT e
JOIN DETAIL_TPE dt ON e.idEquipement = dt.idEquipement
LEFT JOIN STRUCTURE s ON e.idStructureActuelle = s.idStructure
WHERE e.type_entite = 'TPE';

-- ==========================================
-- 7. FONCTION DE RECHERCHE 
-- ==========================================
CREATE OR REPLACE FUNCTION chercher_equipement(search_term TEXT)
RETURNS TABLE (id_eq INT, type_e VARCHAR, num_identifiant TEXT, etat_actuel VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT e.idEquipement, e.type_entite, dc.numeroCarte::TEXT, e.etat
    FROM STOCK_EQUIPEMENT e
    JOIN DETAIL_CARTE dc ON e.idEquipement = dc.idEquipement
    WHERE dc.numeroCarte ILIKE '%' || search_term || '%'
    UNION ALL
    SELECT e.idEquipement, e.type_entite, dt.numeroSerieTPE::TEXT, e.etat
    FROM STOCK_EQUIPEMENT e
    JOIN DETAIL_TPE dt ON e.idEquipement = dt.idEquipement
    WHERE dt.numeroSerieTPE ILIKE '%' || search_term || '%';
END;
$$ LANGUAGE plpgsql;