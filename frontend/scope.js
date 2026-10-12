'use strict';

// Frontend mock en mémoire uniquement (sans localStorage psq apres we gonna use bdd)
let memoryTheme = 'light';
const PASSWORD = 'test';

const ROLE_LABELS = {
  admin_dpe: 'Administrateur DPE',
  ADMIN_DPE: 'Administrateur DPE',
  lecteur_district: 'Lecteur District',
  MEMBRE_DISTRICT: 'Membre District',
  CONSULTANT_DISTRICT: 'Consultant District',
  lecteur_agence: 'Lecteur Agence',
  MEMBRE_AGENCE: 'Membre Agence',
  CONSULTANT_AGENCE: 'Consultant Agence',
  MEMBRE_ANTENNE: 'Membre Antenne',
  CONSULTANT_ANTENNE: 'Consultant Antenne',
  CONSULTANT_DPE: 'Consultant DPE',
  lecteur_dpe: 'Lecteur DPE',
  membre_district: 'Membre District',
  membre_agence: 'Membre Agence'
};

const STRUCTURE_SCOPE = {
  admin_dpe: { level: 'DPE', district: null, station: null },
  ADMIN_DPE: { level: 'DPE', district: null, station: null },
  lecteur_district: { level: 'District', district: 'DISTRICT COM ANNABA', station: null },
  MEMBRE_DISTRICT: { level: 'District', district: 'DISTRICT COM ANNABA', station: null },
  CONSULTANT_DISTRICT: { level: 'District', district: 'DISTRICT COM ANNABA', station: null },
  lecteur_agence: { level: 'Agence', district: 'DISTRICT COM ANNABA', station: 'AGENCE COM SKIKDA' },
  MEMBRE_AGENCE: { level: 'Agence', district: 'DISTRICT COM ANNABA', station: 'AGENCE COM SKIKDA' },
  CONSULTANT_AGENCE: { level: 'Agence', district: 'DISTRICT COM ANNABA', station: 'AGENCE COM SKIKDA' },
  MEMBRE_ANTENNE: { level: 'Agence', district: 'DISTRICT COM ANNABA', station: 'AGENCE COM SKIKDA' },
  CONSULTANT_ANTENNE: { level: 'Agence', district: 'DISTRICT COM ANNABA', station: 'AGENCE COM SKIKDA' },
  CONSULTANT_DPE: { level: 'DPE', district: null, station: null },
  lecteur_dpe: { level: 'DPE', district: null, station: null }
};

const USERS = [
  { id: 'u1', username: 'admin.dpe', email: 'admin.dpe@naftal.dz', name: 'Admin DPE', role: 'admin_dpe', initials: 'AD', structure: 'DPE', disabled: false, password: 'admin' },
  { id: 'u2', username: 'lecteur.district', email: 'lecteur.district@naftal.dz', name: 'Lecteur District', role: 'lecteur_district', initials: 'LD', structure: 'District COM Annaba', disabled: false, password: 'district' },
  { id: 'u3', username: 'lecteur.agence', email: 'lecteur.agence@naftal.dz', name: 'Lecteur Agence', role: 'lecteur_agence', initials: 'LA', structure: 'Agence COM Skikda', disabled: false, password: 'agence' },
  { id: 'u4', username: 'membre.district', email: 'membre.district@naftal.dz', name: 'Membre District', role: 'membre_district', initials: 'MD', structure: 'District COM Annaba', disabled: false, password: 'district' },
  { id: 'u5', username: 'membre.agence', email: 'membre.agence@naftal.dz', name: 'Membre Agence', role: 'membre_agence', initials: 'MA', structure: 'Agence COM Skikda', disabled: false, password: 'agence' }
];

const STATUS_BADGES = {
  'En stock': 'b-success',
  'Nouvelle carte': 'b-success',
  'Renouvelée': 'b-success',
  'En circulation': 'b-info',
  'En cours traitement': 'b-warning',
  'Expire bientôt': 'b-warning',
  'Expirée': 'b-danger',
  'Défectueuse': 'b-danger',
  'Perdue': 'b-danger',
  'Volée': 'b-danger',
  'Bloquée': 'b-neutral',
  'Traitée': 'b-success',
  'En attente': 'b-warning',
  'Confirmé': 'b-info',
  'Disponible': 'b-success',
  'Réservé': 'b-warning',
  'En service': 'b-info',
  'En_panne': 'b-danger',
  'En panne': 'b-danger',
  'En traitement': 'b-warning',
  'Volé': 'b-danger',
  'Active': 'b-success',
  'Archivée': 'b-warning'
};

const CARD_STATES = ['En_stock', 'En_circulation', 'En_traitement', 'Traité', 'Archivée', 'Défectueuse', 'Expirée', 'Volée', 'Perdue', 'Débloquée', 'Illisible'];
// Libellés affichés à l'utilisateur (espaces). Convertis en valeur canonique
// backend (avec underscore) via `uiTpeStatusToBackend()` avant envoi.
const TPE_STATES = ['En service', 'En stock', 'En panne', 'Volé', 'En traitement', 'À restituer', 'Reconfiguré', 'Remplacé', 'RAS'];
const ARCHIVE_STATES = ['Défectueuse', 'Perdue', 'Volée', 'Expirée'];

// Vérifie si l'état d'une carte permet son archivage sinon on archive passssssssss.

function isArchivableCardStatus(status) {
  return ['Défectueuse', 'Perdue', 'Volée', 'Bloquée', 'Expirée', 'Expire bientôt'].includes(status);
}

// Vérifie si une carte peut être remise en circulation après un retour sinon nonnnnnnnnnnnn.

function canReturnCard(card) {
  return !!card?.sentToDistrictForAnomaly;
}

let state;
let currentUser = null;
let toastTimer = null;
let cardsSelectionMode = false;

// Fonctions globales pour session (implementees dans core.js)
function saveSession() {}
function loadSession() {}
function setLoginLoading() {}
function setupLoginUi() {}

