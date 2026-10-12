-- CreateTable
CREATE TABLE "carte_import" (
    "Raison_Client" TEXT,
    "Porteur (N)" TEXT,
    "Code_Entite" TEXT,
    "Libele_Entite" TEXT,
    "MOTMETH" TEXT,
    "Date_Reception" TEXT,
    "IDSTK" TEXT,
    "Statut" TEXT
);

-- CreateTable
CREATE TABLE "decharge" (
    "iddecharge" SERIAL NOT NULL,
    "annee" INTEGER NOT NULL,
    "numerosequence" INTEGER NOT NULL,
    "numerodecharge" VARCHAR(20),
    "idsource" INTEGER,
    "iddestination" INTEGER,
    "dateemission" DATE DEFAULT CURRENT_DATE,
    "destinataire_nom" VARCHAR(100),
    "statut" VARCHAR(50) DEFAULT 'En attente',

    CONSTRAINT "decharge_pkey" PRIMARY KEY ("iddecharge")
);

-- CreateTable
CREATE TABLE "detail_carte" (
    "idequipement" INTEGER NOT NULL,
    "numerocarte" VARCHAR(50) NOT NULL,
    "typecarte" VARCHAR(50),
    "codeclient" VARCHAR(50),
    "raisonsocialeclient" VARCHAR(255),
    "numerobts" VARCHAR(50),
    "dateexpiration" DATE,
    "dateremise" DATE,

    CONSTRAINT "detail_carte_pkey" PRIMARY KEY ("idequipement")
);

-- CreateTable
CREATE TABLE "detail_tpe" (
    "idequipement" INTEGER NOT NULL,
    "numeroserietpe" VARCHAR(50) NOT NULL,
    "idtpe" VARCHAR(50),
    "numerocomptebancaire" VARCHAR(50),
    "numerocontrat" VARCHAR(50),
    "operateurmobile" VARCHAR(50),
    "nom_commercial" TEXT,
    "numeroseriesim" VARCHAR(50),
    "numerotelephonesim" VARCHAR(20),
    "adresse" TEXT,
    "wilaya" VARCHAR(100),
    "amortissement" INTEGER,
    "dateinstallation" DATE,
    "dateexpiration" DATE,

    CONSTRAINT "detail_tpe_pkey" PRIMARY KEY ("idequipement")
);

-- CreateTable
CREATE TABLE "historique_mouvements" (
    "idhistorique" SERIAL NOT NULL,
    "type_entite" VARCHAR(10),
    "idequipement" INTEGER,
    "ancien_etat" VARCHAR(50),
    "nouvel_etat" VARCHAR(50),
    "ancienne_structure_id" INTEGER,
    "nouvelle_structure_id" INTEGER,
    "datemouvement" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "commentaire" TEXT,

    CONSTRAINT "historique_mouvements_pkey" PRIMARY KEY ("idhistorique")
);

-- CreateTable
CREATE TABLE "ligne_decharge" (
    "idligne" SERIAL NOT NULL,
    "iddecharge" INTEGER,
    "idequipement" INTEGER,
    "commentaire" TEXT,

    CONSTRAINT "ligne_decharge_pkey" PRIMARY KEY ("idligne")
);

-- CreateTable
CREATE TABLE "stock_equipement" (
    "idequipement" SERIAL NOT NULL,
    "type_entite" VARCHAR(10) NOT NULL,
    "etat" VARCHAR(50) NOT NULL DEFAULT 'Neuf',
    "idstructureactuelle" INTEGER,
    "datereception" DATE DEFAULT CURRENT_DATE,
    "datedernieremiseajour" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_equipement_pkey" PRIMARY KEY ("idequipement")
);

-- CreateTable
CREATE TABLE "structure" (
    "idstructure" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "nom_structure" VARCHAR(255) NOT NULL,
    "type_structure" VARCHAR(50),
    "id_parent" INTEGER,
    "adresse" TEXT,

    CONSTRAINT "structure_pkey" PRIMARY KEY ("idstructure")
);

-- CreateTable
CREATE TABLE "structure_import" (
    "code" TEXT,
    "nom_structure" TEXT,
    "type_structure" TEXT,
    "code_parent" TEXT
);

-- CreateTable
CREATE TABLE "suivi_carte" (
    "idsuivi" INTEGER NOT NULL,
    "dateanomalie" DATE,
    "cartesubstitution" VARCHAR(50),

    CONSTRAINT "suivi_carte_pkey" PRIMARY KEY ("idsuivi")
);

-- CreateTable
CREATE TABLE "suivi_equipement" (
    "idsuivi" SERIAL NOT NULL,
    "idequipement" INTEGER NOT NULL,
    "dateoperation" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "modeoperation" VARCHAR(100),
    "diagnostic" VARCHAR(255),
    "etat_constate" VARCHAR(50),
    "commentaire" TEXT,

    CONSTRAINT "suivi_equipement_pkey" PRIMARY KEY ("idsuivi")
);

-- CreateTable
CREATE TABLE "suivi_tpe" (
    "idsuivi" INTEGER NOT NULL,
    "numerocomptebancaire" VARCHAR(50),
    "dateinstallation" DATE,
    "dateremise" DATE,
    "dotation" VARCHAR(50),
    "nbrchargeurs" INTEGER DEFAULT 0,

    CONSTRAINT "suivi_tpe_pkey" PRIMARY KEY ("idsuivi")
);

-- CreateTable
CREATE TABLE "tpe_import" (
    "N_serie TPE" TEXT,
    "ID_Terminal" TEXT,
    "N_ Compte" TEXT,
    "N_Contrat" TEXT,
    "Libelle_TPE" TEXT,
    "Nom_Commercial" TEXT,
    "Adresse" TEXT,
    "Tarification" TEXT
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "idutilisateur" SERIAL NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "prenom" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "telephone" VARCHAR(20),
    "motdepasse" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50),
    "idstructure" INTEGER NOT NULL,
    "actif" BOOLEAN DEFAULT true,
    "datecreation" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("idutilisateur")
);

-- CreateIndex
CREATE UNIQUE INDEX "decharge_numerodecharge_key" ON "decharge"("numerodecharge");

-- CreateIndex
CREATE UNIQUE INDEX "detail_carte_numerocarte_key" ON "detail_carte"("numerocarte");

-- CreateIndex
CREATE INDEX "idx_carte_numero" ON "detail_carte"("numerocarte");

-- CreateIndex
CREATE UNIQUE INDEX "detail_tpe_numeroserietpe_key" ON "detail_tpe"("numeroserietpe");

-- CreateIndex
CREATE INDEX "idx_tpe_serie" ON "detail_tpe"("numeroserietpe");

-- CreateIndex
CREATE INDEX "idx_stock_structure" ON "stock_equipement"("idstructureactuelle");

-- CreateIndex
CREATE UNIQUE INDEX "structure_code_key" ON "structure"("code");

-- CreateIndex
CREATE INDEX "idx_structure_code" ON "structure"("code");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- AddForeignKey
ALTER TABLE "decharge" ADD CONSTRAINT "decharge_iddestination_fkey" FOREIGN KEY ("iddestination") REFERENCES "structure"("idstructure") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "decharge" ADD CONSTRAINT "decharge_idsource_fkey" FOREIGN KEY ("idsource") REFERENCES "structure"("idstructure") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "detail_carte" ADD CONSTRAINT "detail_carte_idequipement_fkey" FOREIGN KEY ("idequipement") REFERENCES "stock_equipement"("idequipement") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "detail_tpe" ADD CONSTRAINT "detail_tpe_idequipement_fkey" FOREIGN KEY ("idequipement") REFERENCES "stock_equipement"("idequipement") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "historique_mouvements" ADD CONSTRAINT "historique_mouvements_ancienne_structure_id_fkey" FOREIGN KEY ("ancienne_structure_id") REFERENCES "structure"("idstructure") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "historique_mouvements" ADD CONSTRAINT "historique_mouvements_idequipement_fkey" FOREIGN KEY ("idequipement") REFERENCES "stock_equipement"("idequipement") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "historique_mouvements" ADD CONSTRAINT "historique_mouvements_nouvelle_structure_id_fkey" FOREIGN KEY ("nouvelle_structure_id") REFERENCES "structure"("idstructure") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ligne_decharge" ADD CONSTRAINT "ligne_decharge_iddecharge_fkey" FOREIGN KEY ("iddecharge") REFERENCES "decharge"("iddecharge") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ligne_decharge" ADD CONSTRAINT "ligne_decharge_idequipement_fkey" FOREIGN KEY ("idequipement") REFERENCES "stock_equipement"("idequipement") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_equipement" ADD CONSTRAINT "stock_equipement_idstructureactuelle_fkey" FOREIGN KEY ("idstructureactuelle") REFERENCES "structure"("idstructure") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "structure" ADD CONSTRAINT "structure_id_parent_fkey" FOREIGN KEY ("id_parent") REFERENCES "structure"("idstructure") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "suivi_carte" ADD CONSTRAINT "suivi_carte_idsuivi_fkey" FOREIGN KEY ("idsuivi") REFERENCES "suivi_equipement"("idsuivi") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "suivi_equipement" ADD CONSTRAINT "suivi_equipement_idequipement_fkey" FOREIGN KEY ("idequipement") REFERENCES "stock_equipement"("idequipement") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "suivi_tpe" ADD CONSTRAINT "suivi_tpe_idsuivi_fkey" FOREIGN KEY ("idsuivi") REFERENCES "suivi_equipement"("idsuivi") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_idstructure_fkey" FOREIGN KEY ("idstructure") REFERENCES "structure"("idstructure") ON DELETE NO ACTION ON UPDATE NO ACTION;
