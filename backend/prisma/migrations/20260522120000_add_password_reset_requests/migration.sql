CREATE TABLE "demande_reinitialisation_mot_de_passe" (
    "id_demande" SERIAL NOT NULL,
    "id_utilisateur" INTEGER NOT NULL,
    "email_demande" VARCHAR(150) NOT NULL,
    "statut" VARCHAR(20) NOT NULL DEFAULT 'EN_ATTENTE',
    "date_demande" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_validation" TIMESTAMP(6),
    "date_refus" TIMESTAMP(6),
    "date_reinitialisation" TIMESTAMP(6),
    "traite_par" INTEGER,
    "commentaire" TEXT,

    CONSTRAINT "demande_reinitialisation_mot_de_passe_pkey" PRIMARY KEY ("id_demande")
);

CREATE INDEX "demande_reinitialisation_mot_de_passe_id_utilisateur_idx" ON "demande_reinitialisation_mot_de_passe"("id_utilisateur");
CREATE INDEX "demande_reinitialisation_mot_de_passe_statut_idx" ON "demande_reinitialisation_mot_de_passe"("statut");
CREATE INDEX "demande_reinitialisation_mot_de_passe_date_demande_idx" ON "demande_reinitialisation_mot_de_passe"("date_demande");

ALTER TABLE "demande_reinitialisation_mot_de_passe"
ADD CONSTRAINT "demande_reinit_mdp_utilisateur_fkey"
FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateur"("id_utilisateur")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "demande_reinitialisation_mot_de_passe"
ADD CONSTRAINT "demande_reinit_mdp_admin_fkey"
FOREIGN KEY ("traite_par") REFERENCES "utilisateur"("id_utilisateur")
ON DELETE NO ACTION ON UPDATE NO ACTION;
