(function () {
  // Configuration
  const API_BASE_URL = "http://localhost:8081/api";

  // Helper pour obtenir le token JWT
  function getAuthToken() {
    return localStorage.getItem("jwt_token");
  }

  // Helper pour sauvegarder le token
  function setAuthToken(token) {
    if (token) {
      localStorage.setItem("jwt_token", token);
    } else {
      localStorage.removeItem("jwt_token");
    }
  }

  // Fonction fetch générique avec gestion des headers et erreurs
  function fetchAPI(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = getAuthToken();

    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const config = {
      method: options.method || "GET",
      headers: headers,

      ...options,
    };

    if (options.body) {
      config.body = JSON.stringify(options.body);
    }

    return fetch(url, config)
      .then((response) => {
        const isLoginEndpoint = endpoint === "/auth/login";
        if (response.status === 401 && !isLoginEndpoint) {
          setAuthToken(null);
          return Promise.reject({
            status: response.status,
            message: "Session invalide",
          });
        }

        // 304 Not Modified: body is empty, the browser normally substitutes
        // the cached response, but if it doesn't, don't treat it as an error.
        if (response.status === 304) {
          return {};
        }

        // Handle non-JSON responses properly
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          return response.text().then((text) => {
            return Promise.reject({
              status: response.status,
              message: `Erreur serveur (${response.status})`,
              rawResponse: text,
            });
          });
        }

        return response.json().then((data) => {
          if (!response.ok) {
            return Promise.reject(
              data || { status: response.status, message: "Erreur serveur" },
            );
          }
          return data;
        });
      })
      .catch((error) => {
        console.error("API Error:", error);
        throw error;
      });
  }

  // Méthodes HTTP standard
  function get(endpoint) {
    return fetchAPI(endpoint, { method: "GET" });
  }

  function post(endpoint, body) {
    return fetchAPI(endpoint, { method: "POST", body });
  }

  function put(endpoint, body) {
    return fetchAPI(endpoint, { method: "PUT", body });
  }

  function del(endpoint) {
    return fetchAPI(endpoint, { method: "DELETE" });
  }

  function patch(endpoint, body) {
    return fetchAPI(endpoint, { method: "PATCH", body });
  }

  // Upload a single file via multipart/form-data (field name defaults to "file").
  function uploadFile(endpoint, file, fieldName = "file") {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = getAuthToken();
    const formData = new FormData();
    formData.append(fieldName, file);

    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    return fetch(url, { method: "POST", headers, body: formData })
      .then((response) => {
        if (response.status === 401) {
          setAuthToken(null);
          return Promise.reject({ status: 401, message: "Session invalide" });
        }
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          return response.text().then((text) => {
            if (!response.ok) {
              return Promise.reject({
                status: response.status,
                message: `Erreur serveur (${response.status})`,
                rawResponse: text,
              });
            }
            return { raw: text };
          });
        }
        return response.json().then((data) => {
          if (!response.ok) return Promise.reject(data);
          return data;
        });
      })
      .catch((error) => {
        console.error("Upload error:", error);
        throw error;
      });
  }

  // ==============================================
  //                  ENDPOINTS AUTH
  // ==============================================
  const auth = {
    /**
     * POST /api/auth/login  — public
     */
    login: function (email, mot_de_passe) {
      return post("/auth/login", { email, mot_de_passe }).then((data) => {
        if (data.token) {
          setAuthToken(data.token);
        }
        return data;
      });
    },

    logout: function () {
      return post("/auth/logout").then(() => {
        setAuthToken(null);
      });
    },

    /** POST /api/auth/add-audit — authentifié */
    addAudit: function (data) {
      return post("/auth/add-audit", data);
    },

    /** GET /api/auth/audit — ADMIN_DPE / CONSULTANT_DPE */
    getAuditLogs: function () {
      return get("/auth/audit");
    },

    /** POST /api/auth/register  — ADMIN_DPE / MEMBRE_DPE / MEMBRE_DISTRICT */
    register: function (payload) {
      return post("/auth/register", payload);
    },

    /** GET /api/auth/users  — ADMIN_DPE / CONSULTANT_DPE */
    listUsers: function () {
      return get("/auth/users");
    },

    /** PUT /api/auth/validate/:id  — ADMIN_DPE uniquement */
    validateUser: function (id) {
      return put(`/auth/validate/${id}`);
    },

    /** DELETE /api/auth/delete/:id  — ADMIN_DPE uniquement */
    deleteUser: function (id) {
      return del(`/auth/delete/${id}`);
    },
    forgotPassword: function (email) {
      return post("/auth/forgot-password", { email });
    },

    listPasswordResetRequests: function () {
      return get("/auth/password-reset-requests");
    },

    validatePasswordResetRequest: function (id) {
      return put(`/auth/password-reset-requests/${id}/validate`);
    },

    refusePasswordResetRequest: function (id, commentaire) {
      return put(`/auth/password-reset-requests/${id}/refuse`, { commentaire });
    },

    resetPasswordFromRequest: function (id, newPassword) {
      return put(`/auth/password-reset-requests/${id}/reset-password`, { newPassword });
    }
  };
  window.auth = auth;



 

  // ==============================================
  //                  ENDPOINTS CARTES
  // ==============================================
  const cartes = {
    /**
     * Récupérer le stock de cartes
     * GET /api/cartes/stock
     */
    getStock: function () {
      return get("/cartes/stock");
    },

    /**
     * Importer un fichier Excel/CSV de cartes
     * POST /api/cartes/import (multipart: file)
     */
    import: function (file) {
      return uploadFile("/cartes/import", file);
    },

    /** POST /api/cartes/import?nature=Renouveler (multipart: file) */
    importRenouv: function (file) {
      return uploadFile("/cartes/import?nature=Renouveler", file);
    },

    /**
     * Récupérer les cartes en circulation
     * GET /api/cartes/circulation
     */
    getCirculation: function () {
      return get("/cartes/circulation");
    },

    /**
     * Rechercher des cartes
     * GET /api/cartes/search
     */
    search: function () {
      return get("/cartes/search");
    },

    /**
     * Récupérer les statistiques des cartes
     * GET /api/cartes/statistiques
     */
    getStatistiques: function () {
      return get("/cartes/statistiques");
    },

    /**
     * Récupérer les alertes d'expiration des cartes
     * GET /api/cartes/alertes/expiration
     */
    getAlertesExpiration: function () {
      return get("/cartes/alertes/expiration");
    },

    /**
     * Récupérer une carte par son identifiant
     * GET /api/cartes/:id
     * @param {string|number} id - Identifiant de la carte
     */
    getById: function (id) {
      return get(`/cartes/${id}`);
    },

    /**
     * Mettre à jour une carte
     * PUT /api/cartes/:id
     * @param {string|number} id - Identifiant de la carte
     * @param {object} carteData - Données de la carte à mettre à jour
     */
    update: function (id, carteData) {
      return put(`/cartes/${id}`, carteData);
    },

    /**
     * Supprimer une carte
     * DELETE /api/cartes/:id
     * @param {string|number} id - Identifiant de la carte
     */
    delete: function (id) {
      return del(`/cartes/${id}`);
    },

    /**
     * Modifier l'état d'une carte
     * PUT /api/cartes/:id/etat
     * @param {string|number} id - Identifiant de la carte
     * @param {object} etatData - Données de l'état à modifier
     */
    updateEtat: function (id, etatData) {
      return put(`/cartes/${id}/etat`, etatData);
    },

    /** POST /api/cartes/:id/renouveler */
    renouveler: function (id, payload) {
      return post(`/cartes/${id}/renouveler`, payload);
    },

    /** POST /api/cartes/:id/porteur */
    assignerPorteur: function (id, payload) {
      return post(`/cartes/${id}/porteur`, payload);
    },

    /** GET /api/cartes/:id/historique */
    getHistorique: function (id) {
      return get(`/cartes/${id}/historique`);
    },

    /** GET /api/cartes/suivi */
    getSuiviCartes: function () {
      return get("/cartes/suivi");
    },

    /** GET /api/cartes/statistiques/avancees */
    getStatistiquesAvancees: function () {
      return get("/cartes/statistiques/avancees");
    },

    /** GET /api/cartes/export?format=csv|xlsx&... */
    exportUrl: function (params = {}) {
      const qs = new URLSearchParams(params).toString();
      return `${API_BASE_URL}/cartes/export${qs ? `?${qs}` : ""}`;
    },
  };

  // ==============================================
  //                   ENDPOINTS TPE
  // ==============================================
  const tpe = {
    /**
     * Récupérer le stock de TPE
     * GET /api/tpe/stock
     */
    getStock: function () {
      return get("/tpe/stock");
    },

    /**
     * Récupérer les TPE non En_stock (tout état hors stock).
     * GET /api/tpe/maintenance-stock
     */
    getMaintenanceStock: function () {
      return get("/tpe/maintenance-stock");
    },

    /**
     * Récupérer le parc de TPE
     * GET /api/tpe/parc
     */
    getParc: function () {
      return get("/tpe/parc");
    },

    /**
     * Récupérer les maintenances de TPE
     * GET /api/tpe/maintenance
     */
    getMaintenance: function () {
      return get("/tpe/maintenance");
    },

    /**
     * Récupérer les transferts de TPE
     * GET /api/tpe/transferts
     */
    getTransferts: function () {
      return get("/tpe/transferts");
    },

    /**
     * Récupérer les commandes de TPE
     * GET /api/tpe/commandes
     */
    getCommandes: function () {
      return get("/tpe/commandes");
    },

    /**
     * Récupérer les stations de TPE
     * GET /api/tpe/stations
     */
    getStations: function () {
      return get("/tpe/stations");
    },

    /**
     * Récupérer un TPE par son identifiant
     * GET /api/tpe/:id
     * @param {string|number} id - Identifiant du TPE
     */
    getById: function (id) {
      return get(`/tpe/${id}`);
    },

    /**
     * Créer un nouveau TPE
     * POST /api/tpe/
     * @param {object} tpeData - Données du TPE à créer
     */
    create: function (tpeData) {
      return post("/tpe/", tpeData);
    },

    /**
     * Modifier l'état d'un TPE
     * PUT /api/tpe/:id/etat
     * @param {string|number} id - Identifiant du TPE
     * @param {object} etatData - Données de l'état à modifier
     */
    updateEtat: function (id, etatData) {
      return put(`/tpe/${id}/etat`, etatData);
    },

    /** POST /api/tpe/commandes */
    createCommande: function (commandeData) {
      return post("/tpe/commandes", commandeData);
    },

    /** POST /api/tpe/import (multipart: file) */
    import: function (file) {
      return uploadFile("/tpe/import", file);
    },

    /** POST /api/tpe/transfert/type1  — DPE → Structure */
    transfertType1: function (payload) {
      return post("/tpe/transfert/type1", payload);
    },

    /** POST /api/tpe/transfert/type2  — Structure → DPE (envoi BEA / maintenance) */
    transfertType2: function (payload) {
      return post("/tpe/transfert/type2", payload);
    },

    /** POST /api/tpe/transfert/type3  — Retour maintenance */
    transfertType3: function (payload) {
      return post("/tpe/transfert/type3", payload);
    },

    /** PUT /api/tpe/transferts/:id/reception  — accusé de réception */
    accuseReception: function (id, payload) {
      return put(`/tpe/transferts/${id}/reception`, payload);
    },

    /** POST /api/tpe/restitution */
    restituer: function (payload) {
      return post("/tpe/restitution", payload);
    },

    /** POST /api/tpe/reconfigurer */
    reconfigurer: function (payload) {
      return post("/tpe/reconfigurer", payload);
    },

    /** POST /api/tpe/:id/suivi  — ouvrir un dossier de suivi */
    creerSuivi: function (id, payload) {
      return post(`/tpe/${id}/suivi`, payload);
    },

    /** PUT /api/tpe/:id/suivi/:sid  — mettre à jour un dossier de suivi */ /* hnaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa */
   

    /** POST /api/tpe/panne/signaler */
    signalerPanne: function (payload) {
      return post("/tpe/panne/signaler", payload);
    },

    /** GET /api/tpe/maintenance/suivi/:id */
    getSuiviMaintenance: function (id) {
      return get(`/tpe/maintenance/suivi/${id}`);
    },

    /** PUT /api/tpe/suivi */
    updateSuivi: function (payload) {
      return put("/tpe/suivi", payload);
    },

    /** GET /api/tpe/suivi */
    getSuiviTpes: function () {
      return get("/tpe/suivi");
    },

    /** GET /api/tpe/:id/historique */
    getHistorique: function (id) {
      return get(`/tpe/${id}/historique`);
    },

    /** GET /api/tpe/structures */
    getStructures: function () {
      return get("/tpe/structures");
    },

    /** GET /api/tpe/stations/structure/:idstructure */
    getStationsByStructure: function (idstructure) {
      return get(`/tpe/stations/structure/${idstructure}`);
    },

    /** GET /api/tpe/commandes/:id */
    getCommandeById: function (id) {
      return get(`/tpe/commandes/${id}`);
    },

    /** GET /api/tpe/commandes/stats */
    getCommandesStats: function () {
      return get("/tpe/commandes/stats");
    },

    /** GET /api/tpe/commandes/export/bea */
    exporterVersBEA: function (params = {}) {
      const qs = new URLSearchParams(params).toString();
      return get(`/tpe/commandes/export/bea${qs ? `?${qs}` : ""}`);
    },

    /** POST /api/tpe/commandes/regrouper */
    regrouperCommandes: function (payload) {
      return post("/tpe/commandes/regrouper", payload);
    },

    /** PUT /api/tpe/commandes/:id/statut */
    changerStatutCommande: function (id, payload) {
      return put(`/tpe/commandes/${id}/statut`, payload);
    },

    /** POST /api/tpe/commandes/:id/confirmer — confirme + intègre les TPE au stock */
    confirmerCommande: function (id, payload) {
      return post(`/tpe/commandes/${id}/confirmer`, payload || {});
    },

    /** GET /api/tpe/types-tpe — liste des modèles TPE pour dropdown */
    getTypesTpe: function () {
      return get('/tpe/types-tpe');
    },

    /** URL d'impression HTML d'une décharge TPE (pour ouvrir dans un nouvel onglet) */
    printDechargeUrl: function (numero) {
      return `${API_BASE_URL}/tpe/decharge/${encodeURIComponent(numero)}/print`;
    },
  };

  // ==============================================
  //                ENDPOINTS DECHARGES
  // ==============================================
  const decharges = {
    /** GET /api/decharges/next-bts — Prochain numéro BTS */
    getNextBTS: function () {
      return get("/decharges/next-bts");
    },

    /** POST /api/decharges/type1  — Distribution DPE → Structure */
    createType1: function (dechargeData) {
      return post("/decharges/type1", dechargeData);
    },

    /** POST /api/decharges/type2  — Envoi en maintenance (ouvre dossier suivi) */
    createType2: function (dechargeData) {
      return post("/decharges/type2", dechargeData);
    },

    /** POST /api/decharges/type3  — Retour maintenance (clôture dossier suivi) */
    createType3: function (dechargeData) {
      return post("/decharges/type3", dechargeData);
    },

    /** GET /api/decharges/liste  — liste paginée */
    list: function () {
      return get("/decharges/liste");
    },

    /** GET /api/decharges/details/:id */
    getDetails: function (id) {
      return get(`/decharges/details/${id}`);
    },

    /** GET /api/decharges/:numero/imprimer  — URL du HTML imprimable */
    imprimerUrl: function (numero) {
      return `${API_BASE_URL}/decharges/${encodeURIComponent(numero)}/imprimer`;
    },

    /** PUT /api/decharges/:numero/accuse-reception */
    accuseReception: function (numero, payload) {
      return put(`/decharges/${encodeURIComponent(numero)}/accuse-reception`, payload);
    },

    /** PATCH /api/decharges/:numero/bts */
    updateBTS: function (numero, payload) {
      return patch(`/decharges/${encodeURIComponent(numero)}/bts`, payload);
    },

    /** DELETE /api/decharges/annuler/:numero */
    annuler: function (numero) {
      return del(`/decharges/annuler/${encodeURIComponent(numero)}`);
    },

    /** GET /api/decharges/historique/:numerocarte */
    getHistoriqueByCarte: function (numerocarte) {
      return get(`/decharges/historique/${encodeURIComponent(numerocarte)}`);
    },
  };

  // ==============================================
  //                ENDPOINTS STRUCTURE
  // ==============================================
  const structure = {
    /** GET /api/structure */
    list: function () {
      return get("/structure");
    },
    /** GET /api/structure/dpe/:idOrCode */
    getDpe: function (idOrCode) {
      return get(`/structure/dpe/${encodeURIComponent(idOrCode)}`);
    },
    /** GET /api/structure/details/:idOrCode */
    getDetails: function (idOrCode) {
      return get(`/structure/details/${encodeURIComponent(idOrCode)}`);
    },
  };

  // ==============================================
  //                ENDPOINTS STATION
  // ==============================================
  const station = {
    // Méthodes existantes
    get: function (idOrCode) {
      return get(`/station/${encodeURIComponent(idOrCode)}`);
    },
    update: function (idOrCode, payload) {
      return put(`/station/${encodeURIComponent(idOrCode)}`, payload);
    },

    // ✅ AJOUTÉS — renderers.js appelle getStation() et updateStation()
    getStation: function (idOrCode) {
      return get(`/station/${encodeURIComponent(idOrCode)}`);
    },
    updateStation: function (idOrCode, payload) {
      return put(`/station/${encodeURIComponent(idOrCode)}`, payload);
    },
  };

  // ==============================================
  //                ENDPOINTS SUIVI CARTES
  // ==============================================
  const suivi = {
    /** GET /api/suivi/ */
    getAll: function () {
      return get("/suivi/");
    },
    
    /** GET /api/suivi/carte/:numerocarte */
    getByCarte: function (numerocarte) {
      return get(`/suivi/carte/${encodeURIComponent(numerocarte)}`);
    },
    
    /** PUT /api/suivi/carte */
    updateCarte: function (payload) {
      return put("/suivi/carte", payload);
    },
    
    /** PUT /api/suivi/update-etape */
    updateEtape: function (payload) {
      return put("/suivi/update-etape", payload);
    },
  };

  // ==============================================
  //                ENDPOINTS ARCHIVES
  // ==============================================
  const archives = {
    /** GET /api/archives */
    list: function () {
      return get("/archives");
    },

    /** POST /api/archives */
    create: function (payload) {
      return post("/archives", payload);
    },

    /** DELETE /api/archives/:id */
    remove: function (id) {
      return del(`/archives/${id}`);
    },

    /** DELETE /api/archives */
    clearAll: function () {
      return del("/archives");
    },
  };

  // ==============================================
  //                ENDPOINTS RAPPORTS
  // ==============================================
  const rapports = {
    /** GET /api/rapports/tpe */
    getTpe: function () {
      return get("/rapports/tpe");
    },
  };

  // ==============================================
  //                ENDPOINTS DASHBOARD
  // ==============================================
  const dashboard = {
    /**
     * Récupérer les statistiques du dashboard
     * GET /api/dashboard/global
     */
    getStats: function () {
      return get("/dashboard/global");
    },
  };

  // Attacher l'API globalement à window
  window.API = {
    BASE_URL: API_BASE_URL,
    fetchAPI,
    get,
    post,
    put,
    patch,
    delete: del,
    auth,
    cartes,
    decharges,
    tpe,
    dashboard,
    structure,
    station,
    rapports,
    suivi,
    archives,
    getAuthToken,
    setAuthToken,
  };

  console.log("API module loaded successfully");
})();
