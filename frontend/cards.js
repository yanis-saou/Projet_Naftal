// Importe des cartes à partir du texte d'un fichier CSV.

function importCardsFromCsv(text) {
  if (!requireWrite()) return;
  const rows = csvParse(text);
  if (!rows.length) {
    showToast("CSV cartes vide.", true);
    return;
  }
  let added = 0;
  rows.forEach((row) => {
    const number =
      row.number || row["N° Carte"] || row.numero || row["numero_carte"];
    if (!number || state.cards.some((card) => card.number === number)) return;
    const createdAt =
      row.createdAt || row.date_creation || nowIso().slice(0, 10);
    const card = {
      id: uid("card"),
      number,
      type: row.type || row["Type"] || "Numéroté",
      status: "Nouvelle carte",
      isNouvelle: true,
      district: row.district || row["District"] || "DISTRICT COM ANNABA",
      owner: row.owner || row["Propriétaire"] || row.client || "Client importé",
      station: row.station || row["Station"] || "AGENCE COM SKIKDA",
      expirationDate:
        row.expirationDate || row["Expiration"] || addYears(createdAt, 3),
      location: row.location || row["Localisation"] || "Coffre DPE",
      codeClient:
        row.codeClient ||
        row["Code client"] ||
        row["Code Client"] ||
        `CLI-${Math.floor(Math.random() * 9000 + 1000)}`,
      company: row.company || row["Raison sociale"] || row.owner || "—",
      anomaly: row.anomaly || row["Anomalie"] || "",
      bts: row.bts || row["BTS"] || "Non spécifié", // Préremplissage BTS amélioré
      createdAt,
      transferState: "",
      selected: false,
      archived: false,
      sentToDistrictForAnomaly: false,
      events: [],
    };
    state.cards.unshift(card);
    logCardEvent(
      card.id,
      "Import carte",
      "Carte importée comme nouvelle carte",
    );
    added += 1;
  });
  saveState();
  populateScopeFilters();
  renderAll();
  showToast(`${added} carte(s) importée(s).`);
}

// Exporte les cartes visibles au format CSV.

function exportCardsCSV() {
  const rows = visibleCards().map((card) => ({
    district: card.district,
    number: card.number,
    type: card.type,
    status: card.status,
    owner: card.owner,
    station: card.station,
    expirationDate: card.expirationDate,
    location: card.location,
    codeClient: card.codeClient,
    company: card.company,
    bts: card.bts,
  }));
  const csv = csvStringify(rows, [
    "district",
    "number",
    "type",
    "status",
    "owner",
    "station",
    "expirationDate",
    "location",
    "codeClient",
    "company",
    "bts",
  ]);
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    "stock-cartes.csv",
  );
  showToast("Export CSV cartes terminé.");
}

// Active ou désactive le mode de sélection multiple des cartes.

function toggleCardsSelectionMode() {
  if (!requireWrite()) return;
  cardsSelectionMode = !cardsSelectionMode;
  if (!cardsSelectionMode) {
    state.cards.forEach((card) => {
      card.selected = false;
    });
    const selectAll = el("cardsSelectAll");
    if (selectAll) selectAll.checked = false;
  }
  saveState();
  syncRoleUI();
  renderCards();
}

// Coche ou décoche une carte dans la sélection multiple.

function toggleCardSelection(id, checked) {
  if (!requireWrite()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  card.selected = checked;
  saveState();
  renderCards();
}

// Sélectionne ou désélectionne toutes les cartes visibles autorisées.

function toggleSelectAllVisibleCards(flag) {
  if (!requireWrite()) return;
  visibleCards().forEach((card) => {
    if (card.status === "Nouvelle carte") card.selected = !!flag;
  });
  saveState();
  renderCards();
}

// Vide complètement la sélection des cartes.

function clearCardsSelection() {
  if (!requireWrite()) return;
  state.cards.forEach((card) => {
    card.selected = false;
  });
  const selectAll = el("cardsSelectAll");
  if (selectAll) selectAll.checked = false;
  saveState();
  renderCards();
}

// Prépare la mise en circulation groupée des cartes sélectionnées.

async function bulkSetSelectedCardsToCirculation() {
  if (!requireWrite()) return;
  const selected = state.cards.filter(
    (card) => card.selected && card.status === "Nouvelle carte",
  );
  if (!selected.length) {
    showToast("Aucune carte en stock sélectionnée.", true);
    return;
  }
  // Vérification : toutes les cartes doivent être de la même structure (station)
  const stations = [
    ...new Set(selected.map((c) => c.station || c.codeStructure || "INCONNUE")),
  ];
  if (stations.length > 1) {
    showToast(
      `Les cartes sélectionnées appartiennent à ${stations.length} structures différentes. Veuillez sélectionner uniquement des cartes de la même structure.`,
      true,
    );
    return;
  }

  // Récupère les structures valides pour remplir le dropdown "Structure".
  // Le backend exige un code FK existant dans `structure.code`
  // pas un libellé libre — sinon Prisma renvoie P2003 (Référence invalide)
  let structures = [];
  try {
    const resp = await API.structure.list();
    structures = resp?.structures || [];
  } catch (err) {
    showToast(
      err?.message || "Impossible de charger la liste des structures.",
      true,
    );
    return;
  }
  if (!structures.length) {
    showToast("Aucune structure disponible pour votre compte.", true);
    return;
  }

  const preselect = structures.find(
    (s) => s.nom_structure === stations[0] || s.code === stations[0],
  );
  const structureOptions = structures
    .map(
      (s) =>
        `<option value="${escapeHtml(s.code)}" ${preselect && s.code === preselect.code ? "selected" : ""}>${escapeHtml(s.nom_structure)} (${escapeHtml(s.code)})</option>`,
    )
    .join("");

  const body = `
    <div class="form-grid">
      <div class="field"><label>Bénéficiaire *</label><input id="type1Beneficiary" placeholder="Nom du bénéficiaire" required></div>
      <div class="field"><label>Fonction *</label><input id="type1Function" placeholder="Ex: Chauffeur" required></div>
      <div class="field"><label>Structure *</label><select id="type1Structure" required>${structureOptions}</select></div>
      <div class="field"><label>Structure rattachement</label><input id="type1District" value="DISTRICT COM ANNABA"></div>
      <div class="field"><label>N° BTS *</label><input id="type1Bts" readonly required placeholder="Génération automatique..."></div>
      <div class="field"><label>Date de sortie *</label><input id="type1Date" type="date" value="${nowIso().slice(0, 10)}" required></div>
    </div>
    <div style="margin-top:12px;" class="muted">${selected.length} carte(s) — décharge type 1 sera générée.</div>`;
  openModal(
    "Mise en circulation - Décharge type 1",
    body,
    `
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="confirmBulkCirculation()">Confirmer</button>
  `,
  );
  // Génération automatique du N° BTS
  API.decharges.getNextBTS().then((resp) => {
    const input = el("type1Bts");
    if (input && resp?.data?.numero_bordereau_bts) {
      input.value = resp.data.numero_bordereau_bts;
    }
  }).catch(() => {
    const input = el("type1Bts");
    if (input) input.placeholder = "Erreur de génération";
  });
}

// Valide la mise en circulation groupée et génère la décharge associée.

async function confirmBulkCirculation() {
  if (!requireWrite()) return;
  const selected = state.cards.filter(
    (card) => card.selected && card.status === "Nouvelle carte",
  );
  if (!selected.length) return;

  const stations = [
    ...new Set(selected.map((c) => c.station || c.codeStructure || "INCONNUE")),
  ];
  if (stations.length > 1) {
    showToast("Les cartes appartiennent à des structures différentes.", true);
    return;
  }

  const beneficiary = el("type1Beneficiary").value.trim();
  const functionLabel = el("type1Function").value.trim();
  const structure = el("type1Structure").value.trim();
  const district = el("type1District").value.trim();
  const bts = el("type1Bts").value.trim();
  const date = el("type1Date").value;

  // Validation des champs obligatoires
  if (!beneficiary) {
    showToast("Le bénéficiaire est obligatoire.", true);
    return;
  }
  if (!functionLabel) {
    showToast("La fonction est obligatoire.", true);
    return;
  }
  if (!bts || bts === "Non spécifié") {
    showToast("Le N° BTS est obligatoire.", true);
    return;
  }
  if (!date) {
    showToast("La date de sortie est obligatoire.", true);
    return;
  }

  const meta = {
    beneficiary: beneficiary || "Bénéficiaire non renseigné",
    functionLabel: functionLabel || "Non spécifiée",
    structure: structure || "AGENCE COM SKIKDA",
    district: district || "DISTRICT COM ANNABA",
    bts: bts || "Non spécifié",
    date: date || nowIso().slice(0, 10),
  };

  try {
    // Création backend de la décharge Type 1 (Distribution DPE → Structure).
    // Les cartes passent directement en "En_circulation".
    const response = await API.decharges.createType1({
      source: "DPE_CENTRE",
      destination: meta.structure,
      nom_beneficiaire: meta.beneficiary,
      fonction_beneficiaire: meta.functionLabel,
      date_sortie: meta.date,
      numero_bordereau_bts: meta.bts,
      cartes: selected.map((c) => ({
        numero: c.number,
        code_client: c.codeClient,
        raisonsocialeclient: c.company,
      })),
    });

    // Mise à jour état local et logique existante
    selected.forEach((card) => {
      card.status = "En circulation";
      card.isNouvelle = false;
      card.location = meta.structure;
      card.station = meta.structure;
      card.district = meta.district;
      card.transferState = "Remise initiale DPE -> Structure";
      card.selected = false;
      card.bts = meta.bts; //stockage BTS
      logCardEvent(
        card.id,
        "Mise en circulation",
        `Décharge type 1 vers ${meta.structure}`,
      );
    });

    const pdf = await generateDechargeType1(selected, meta);
    storeDecharge({
      kind: "type1",
      assetType: "Carte",
      object: "Décharge d'envoi initial des cartes",
      from: "DPE",
      to: meta.structure,
      date: meta.date,
      status: "Générée",
      cards: selected.map((card) => card.id),
      pdfDataUri: pdf,
      reference:
        response?.data?.numero_decharge || nextReference("type1", selected),
      nom_beneficiaire: meta.beneficiary,
      fonction_beneficiaire: meta.functionLabel,
      beneficiary: meta.beneficiary,
      functionLabel: meta.functionLabel,
      numero_bordereau_bts: meta.bts,
    });

    cardsSelectionMode = false;
    const selectAll = el("cardsSelectAll");
    if (selectAll) selectAll.checked = false;
    saveState();
    closeModal();
    syncRoleUI();
    renderAll();
    showToast("Cartes mises en circulation + décharge type 1 générée.");
  } catch (error) {
    showToast(error.message || "Erreur lors de la mise en circulation.", true);
  }
}

// Génère la prochaine référence de décharge ou de document.

function nextReference(kind, items = []) {
  const now = new Date();
  const year = now.getFullYear();
  const shortYear = String(year).slice(-2);
  const pad = (n) => String(n).padStart(3, "0");
  if (kind === "type1") return `${pad(state.sequence.type1++)}/${year}`;
  if (kind === "type2")
    return `${pad(state.sequence.type2++)}/DCSI/${shortYear}`;
  if (kind === "type3")
    return `${pad(state.sequence.type3++)}/STR/${shortYear}`;
  return `${pad(state.sequence.tpe++)}/TPE/${shortYear}`;
}

// Enregistre une décharge dans l'état de l'application.

function storeDecharge(payload) {
  const entry = { id: uid("dec"), ...payload };
  state.decharges.unshift(entry);
  addAudit(
    "Décharge générée",
    payload.reference,
    `${payload.object} - ${payload.assetType}`,
  );
  if (payload.pdfDataUri) {
    setTimeout(() => showDechargeModal(entry), 250);
  }
}

function showDechargeModal(decharge) {
  openModal(
    `Décharge générée — ${escapeHtml(decharge.reference)}`,
    `
    <div style="text-align:center;padding:8px 0 14px;">
      <div style="background:rgba(40,167,69,.12);border:1px solid rgba(40,167,69,.3);border-radius:14px;padding:16px;margin-bottom:16px;">
        <i class="fa-solid fa-circle-check" style="color:var(--secondary);font-size:2.2rem;display:block;margin-bottom:8px;"></i>
        <div style="font-weight:900;font-size:1.05rem;color:var(--secondary);">Décharge générée avec succès</div>
        <div style="color:var(--text-secondary);font-size:.88rem;margin-top:4px;">${escapeHtml(decharge.object)}</div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Référence</label><input disabled value="${escapeHtml(decharge.reference)}"></div>
        <div class="field"><label>Type</label><input disabled value="${escapeHtml(decharge.kind?.toUpperCase() || "—")}"></div>
        <div class="field"><label>De</label><input disabled value="${escapeHtml(decharge.from || "—")}"></div>
        <div class="field"><label>Vers</label><input disabled value="${escapeHtml(decharge.to || "—")}"></div>
        <div class="field"><label>Date</label><input disabled value="${formatDate(decharge.date)}"></div>
        <div class="field"><label>Statut</label><input disabled value="${escapeHtml(decharge.status || "—")}"></div>
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Fermer</button>
     <button class="btn btn-primary" onclick="downloadStoredPdf('${escapeHtml(decharge.id)}')"><i class="fa-solid fa-file-pdf"></i>Télécharger PDF</button>`,
  );
}

// Ouvre la fiche détaillée d'une carte.

function viewCard(id) {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  openModal(
    "Détail carte",
    `
    <div class="form-grid">
      <div class="field"><label>N° Carte</label><input disabled value="${escapeHtml(card.number)}"></div>
      <div class="field"><label>Type</label><input disabled value="${escapeHtml(card.type)}"></div>
      <div class="field"><label>Etat</label><input disabled value="${escapeHtml(card.status)}"></div>
      <div class="field"><label>Code client</label><input disabled value="${escapeHtml(card.codeClient)}"></div>
      <div class="field"><label>Raison sociale</label><input disabled value="${escapeHtml(card.company)}"></div>
      <div class="field"><label>Propriétaire</label><input disabled value="${escapeHtml(card.owner)}"></div>
      <div class="field"><label>Station</label><input disabled value="${escapeHtml(card.station)}"></div>
      <div class="field"><label>District</label><input disabled value="${escapeHtml(card.district)}"></div>
      <div class="field"><label>Expiration</label><input disabled value="${formatDate(card.expirationDate)}"></div>
      <div class="field"><label>BTS</label><input disabled value="${escapeHtml(card.bts)}"></div>
      <div class="field full"><label>Dernier état de transfert</label><input disabled value="${escapeHtml(card.transferState || "—")}"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Fermer</button>`,
  );
}

// Ouvre la fenêtre de modification du statut d'une carte.

function changeCardStatus(id) {
  if (!requireWrite()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  openModal(
    "Modifier état carte",
    `
    <div class="form-grid">
      <div class="field full"><label>Carte</label><input disabled value="${escapeHtml(card.number)}"></div>
      <div class="field"><label>Nouvel état</label>
        <select id="cardStatusSelect">${CARD_STATES.map((s) => `<option ${s === card.status ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Motif</label><input id="cardStatusReason" placeholder="Motif du changement"></div>
    </div>`,
    `
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="confirmChangeCardStatus('${escapeHtml(card.id)}')">Enregistrer</button>
  `,
  );
}

// Enregistre le nouveau statut d'une carte.

async function confirmChangeCardStatus(id) {
  if (!requireWrite()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  const newStatus = el("cardStatusSelect").value;
  const reason = el("cardStatusReason").value.trim() || "Mise à jour manuelle";

  try {
    // Backend `changerEtat` attend { etat, statut, commentaire, ancienEtat }
    // avec `etat` dans le vocabulaire canonique (voir BACKEND_CARD_STATUS).
    await API.cartes.updateEtat(id, {
      etat: uiCardStatusToBackend(newStatus),
      ancienEtat: uiCardStatusToBackend(card.status),
      commentaire: reason,
    });

    // Mise à jour état local et journal
    card.status = newStatus;
    logCardEvent(
      id,
      "Changement état",
      `${card.number} -> ${newStatus}. ${reason}`,
    );
    saveState();
    closeModal();
    renderAll();
    showToast("État carte mis à jour.");
  } catch (error) {
    showToast(error.message || "Erreur lors de la mise à jour.", true);
  }
}

// Affiche l'historique complet d'une carte.

function showCardHistory(id) {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;

  let dbHistory = [];
  let loading = true;

  function resolveUser(idu) {
    if (!idu) return "Système";
    const u = (state.users || []).find((x) => x.backendId === idu);
    return u?.name || `Utilisateur #${idu}`;
  }

  function combinedRows() {
    const dateFilter = el("historyCardDateFilter")?.value || "";
    const dbRows = dbHistory.map((h) => ({
      date: h.dateoperation,
      etats: `${escapeHtml(h.ancienetat || "—")} → ${escapeHtml(h.nouveletat || "—")}`,
      structures: `${escapeHtml(h.structure_ancienne || "—")} → ${escapeHtml(h.structure_actuelle || "—")}`,
      commentaire: h.commentaire || "—",
      user: resolveUser(h.id_utilisateur),
    }));
    const sessionRows = (card.events || []).map((ev) => ({
      date: ev.date,
      etats: escapeHtml(ev.action || "—"),
      structures: "—",
      commentaire: ev.detail || "—",
      user: ev.user || "Système",
    }));
    return [...dbRows, ...sessionRows]
      .filter(
        (r) =>
          !dateFilter || (r.date && new Date(r.date) >= new Date(dateFilter)),
      )
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  function renderFilteredCardHistory() {
    const target = el("historyCardTable");
    if (!target) return;
    if (loading) {
      target.innerHTML =
        '<p class="muted" style="padding:12px;">Chargement de l\'historique…</p>';
      return;
    }
    const rows =
      combinedRows()
        .map(
          (r) => `
      <tr>
        <td>${formatDateTime(r.date)}</td>
        <td>${r.etats}</td>
        <td>${r.structures}</td>
        <td>${escapeHtml(r.commentaire)}</td>
        <td>${escapeHtml(r.user)}</td>
      </tr>
    `,
        )
        .join("") ||
      '<tr><td colspan="5" class="muted">Aucun historique.</td></tr>';
    target.innerHTML = `<table><thead><tr><th>Horodatage</th><th>État (ancien → nouveau)</th><th>Structure (ancienne → actuelle)</th><th>Commentaire</th><th>Utilisateur</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  window.renderFilteredCardHistory = renderFilteredCardHistory;

  openModal(
    "Historique carte",
    `
    <div class="advanced-filters-grid" style="margin-bottom:16px;">
      <div class="field">
        <label>Afficher à partir du</label>
        <input id="historyCardDateFilter" type="date" oninput="renderFilteredCardHistory()">
      </div>
    </div>
    <div class="table-wrap" id="historyCardTable"></div>`,
    `<button class="btn btn-ghost" onclick="el('historyCardDateFilter').value=''; renderFilteredCardHistory()">Réinitialiser</button>
     <button class="btn btn-primary" onclick="closeModal()">Fermer</button>`,
  );

  renderFilteredCardHistory();

  API.cartes
    .getHistorique(card.number)
    .then((resp) => {
      dbHistory = Array.isArray(resp?.historique) ? resp.historique : [];
    })
    .catch((err) => {
      console.error("getHistorique carte failed:", err);
      dbHistory = [];
    })
    .finally(() => {
      loading = false;
      renderFilteredCardHistory();
    });
}

// Ouvre la fenêtre de transfert ou de retour d'une carte.

function transferCard(id) {
  if (!requireWrite()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  const returnAllowed = canReturnCard(card);
  openModal(
    "Transférer carte",
    `
    <div class="form-grid">
      <div class="field full"><label>Carte</label><input disabled value="${escapeHtml(card.number)}"></div>
      <div class="field"><label>Option</label>
        <select id="transferMode">
          <option value="district">Transférer vers district</option>
          <option value="retour" ${returnAllowed ? "" : "disabled"}>Retour</option>
        </select>
        ${returnAllowed ? '<small class="muted">Retour autorisé : la carte a déjà été envoyée vers district pour anomalie.</small>' : "<small class=\"muted\">Le retour n'est possible qu'après un transfert vers district pour anomalie.</small>"}
      </div>
      <div class="field"><label>Destinataire / structure</label><input id="transferDestination" value="${escapeHtml(card.district || "DISTRICT COM SBA")}"></div>
      <div class="field"><label>Bénéficiaire</label><input id="transferBeneficiary" placeholder="Nom du bénéficiaire"></div>
      <div class="field"><label>Fonction</label><input id="transferFunction" placeholder="Ex: ingénieur"></div>
      <div class="field"><label>N° BTS</label><input id="transferBts" value="${escapeHtml(card.bts || "Non spécifié")}"></div>
      <div class="field full"><label>Motif (obligatoire)</label><textarea id="transferReason" placeholder="Anomalie ou raison du transfert"></textarea></div>
      <div class="field"><label>Date</label><input id="transferDate" type="date" value="${nowIso().slice(0, 10)}"></div>
      <div class="field"><label>Carte substitution (si retour)</label><input id="transferSubstitution" placeholder="Optionnel"></div>
    </div>`,
    `
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="confirmTransferCard('${escapeHtml(card.id)}')">Valider</button>
  `,
  );
}

// Valide un transfert de carte et génère la décharge correspondante.

async function confirmTransferCard(id) {
  if (!requireWrite()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  const mode = el("transferMode").value;
  const destination = el("transferDestination").value.trim();
  const beneficiary = el("transferBeneficiary").value.trim() || "Non spécifié";
  const functionLabel = el("transferFunction").value.trim() || "Non spécifiée";
  const bts = el("transferBts").value.trim() || "Non spécifié";
  const reason = el("transferReason").value.trim();
  const date = el("transferDate").value || nowIso().slice(0, 10);
  const substitution = el("transferSubstitution").value.trim();
  if (!reason) {
    showToast("Le motif du transfert est obligatoire.", true);
    return;
  }

  let pdfDataUri = null;
  let reference = "";
  let object = "";
  try {
    if (mode === "district") {
      // Type-2 : la carte part en maintenance. Le backend ouvre un dossier suivi.
      const resp = await API.decharges.createType2({
        destination: destination || "DCSI_MAINTENANCE",
        nom_beneficiaire: beneficiary,
        fonction_beneficiaire: functionLabel,
        date_sortie: date,
        numero_bordereau_bts: bts,
        cartesAnomalies: [
          {
            numero: card.number,
            anomalie: reason,
            raisonsocialeclient: card.company,
          },
        ],
      });
      reference = resp?.data?.numero_decharge || nextReference("type2");

      card.status = "En cours traitement";
      card.treatmentStartDate = date;
      card.transferState = `Transférée vers district - ${destination}`;
      card.location = destination || "District";
      card.anomaly = reason;
      card.sentToDistrictForAnomaly = true;
      object = "Transmission vers district / DCSI";
      pdfDataUri = await generateDechargeType2([card], {
        destination,
        beneficiary,
        functionLabel,
        bts,
        reason,
        date,
        reference,
      });
      storeDecharge({
        kind: "type2",
        assetType: "Carte",
        object,
        from: "DPE",
        to: destination || "District",
        date,
        status: "Générée",
        cards: [card.id],
        pdfDataUri,
        reference,
        nom_beneficiaire: beneficiary,
        fonction_beneficiaire: functionLabel,
        beneficiary,
        functionLabel,
        numero_bordereau_bts: bts,
      });
      logCardEvent(id, "Transfert vers district", reason);
    } else {
      if (!canReturnCard(card)) {
        showToast(
          "Le retour est autorisé uniquement après un transfert vers district pour anomalie.",
          true,
        );
        return;
      }
      // Type-3 : retour maintenance. Le backend clôture le dossier suivi.
      // On privilégie la structure métier courante de la carte, car l'ancien code technique
      // peut encore pointer vers DPE_CENTRE et provoquer un rejet côté backend.
      const backendDestination = resolveCardRetourDestination(
        card,
        destination,
      );
      const resp = await API.decharges.createType3({
        destination: backendDestination,
        nom_beneficiaire: beneficiary,
        fonction_beneficiaire: functionLabel,
        date_sortie: date,
        numero_bordereau_bts: bts,
        operations: [
          {
            ancienne: card.number,
            substitution: substitution || card.number,
            diagnostic: reason,
            etatFinal: "Réparée",
          },
        ],
      });
      reference = resp?.data?.numero_decharge || nextReference("type3");

      card.status = "En circulation";
      card.transferState = "Retour en circulation";
      card.location = destination || card.station;
      card.sentToDistrictForAnomaly = false;
      if (substitution) card.substitutionCard = substitution;
      object = "Retour en circulation";
      pdfDataUri = await generateDechargeType3([card], {
        destination,
        beneficiary,
        functionLabel,
        bts,
        reason,
        date,
        substitution,
        reference,
      });
      storeDecharge({
        kind: "type3",
        assetType: "Carte",
        object,
        from: "STR / DPE",
        to: destination || card.station,
        date,
        status: "Générée",
        cards: [card.id],
        pdfDataUri,
        reference,
        nom_beneficiaire: beneficiary,
        fonction_beneficiaire: functionLabel,
        beneficiary,
        functionLabel,
        numero_bordereau_bts: bts,
      });
      logCardEvent(id, "Retour", reason);
    }
  } catch (err) {
    showToast(err?.message || "Erreur lors du transfert.", true);
    return;
  }
  saveState();
  closeModal();
  renderAll();
  showToast(`Décharge ${mode === "district" ? "type 2" : "type 3"} générée.`);
}

// Archive une carte avec un motif.

async function archiveCard(id, reason = "", silent = false) {
  if (!requireWrite()) return;
  const card = state.cards.find((c) => c.id === id);
  if (!card) return;
  const finalReason =
    reason ||
    prompt("Motif d'archivage :", card.anomaly || card.status || "") ||
    "";
  if (!finalReason) return;
  try {
    const res = await API.archives.create({
      numerocarte: card.number,
      motif: finalReason,
    });
    const arch = res.archive;
    card.archived = true;
    state.archives.unshift({
      id: String(arch.id_archive),
      number: arch.numerocarte || card.number,
      status: "Archivée",
      district: arch.district || card.district,
      owner: arch.proprietaire || card.owner,
      reason: arch.motif || finalReason,
      user: arch.archive_par || currentUser?.name || "Système",
      archivedAt: arch.date_archivage || nowIso(),
      codeClient: arch.code_client || card.codeClient,
      station: card.station,
      bts: arch.bts || card.bts || "",
    });
    logCardEvent(id, "Archivage", finalReason);
    renderAll();
    if (!silent) showToast("Carte archivée.");
  } catch (err) {
    showToast(err?.message || "Erreur lors de l'archivage.", true);
  }
}

// Affiche le détail d'un élément archivé.

function viewArchiveItem(id) {
  const item = state.archives.find((a) => a.id === id);
  if (!item) return;
  const card = state.cards.find((c) => c.number === item.number);
  const station = item.station || card?.station || "—";
  openModal(
    "Carte archivée",
    `
    <div class="form-grid">
      <div class="field"><label>Carte</label><input disabled value="${escapeHtml(item.number)}"></div>
      <div class="field"><label>Etat</label><input disabled value="${escapeHtml(item.status)}"></div>
      <div class="field"><label>District</label><input disabled value="${escapeHtml(item.district)}"></div>
      <div class="field full"><label>Motif</label><textarea disabled>${escapeHtml(item.reason)}</textarea></div>
    </div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Fermer</button>`,
  );
}

// Restaure une carte depuis l'archive vers la liste active.

async function restoreArchivedCard(id) {
  if (!requireWrite()) return;
  const index = state.archives.findIndex((a) => a.id === id);
  if (index === -1) return;
  const item = state.archives[index];
  try {
    await API.archives.remove(id);
    const card =
      state.cards.find((c) => c.id === item.originalCardId) ||
      state.cards.find((c) => c.number === item.number);
    if (card) {
      card.archived = false;
      card.status = "Renouvelée";
      card.isRenouvelee = true;
      card.isNouvelle = false;
      card.nature = "Renouveler";
      card.transferState = card.transferState || "Restaurée depuis archive";
      logCardEvent(
        card.id,
        "Restauration archive",
        `Carte restaurée depuis archive vers Renouvelée. Motif initial: ${item.reason}`,
      );
      state.archives.splice(index, 1);
    } else {
      await loadState();
    }
    closeModal();
    renderAll();
    showToast("Carte restaurée depuis les archives.");
  } catch (err) {
    showToast(err?.message || "Erreur lors de la restauration.", true);
  }
}

// Supprime tout le contenu de l'archive des cartes.

function exportCardsArchiveCSV() {
  const search = (el("cardsArchiveSearch")?.value || "").trim().toLowerCase();
  const rows = state.archives
    .filter((a) => hasScope(a))
    .filter((item) => {
      const hay = [
        item.number,
        item.status,
        item.owner,
        item.reason,
        item.district,
      ]
        .join(" ")
        .toLowerCase();
      return !search || hay.includes(search);
    })
    .map((item) => ({
      archivedAt: item.archivedAt
        ? item.archivedAt.slice(0, 16).replace("T", " ")
        : "",
      number: item.number,
      status: item.status,
      district: item.district,
      owner: item.owner,
      bts: item.bts || "",
      reason: item.reason,
      user: item.user,
    }));
  const csv = csvStringify(rows, [
    "archivedAt",
    "number",
    "status",
    "district",
    "owner",
    "bts",
    "reason",
    "user",
  ]);
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    "archive-cartes.csv",
  );
  showToast("Export CSV archive terminé.");
}

async function clearCardsArchive() {
  if (!requireWrite()) return;
  if (!confirm("Vider toute l'archive des cartes ?")) return;
  try {
    await API.archives.clearAll();
    state.archives = [];
    addAudit("Suppression archive", "Archive cartes", "Archive vidée");
    renderCardsArchive();
    renderAudit();
    showToast("Archive vidée.");
  } catch (err) {
    showToast(err?.message || "Erreur lors du vidage de l'archive.", true);
  }
}

function toggleCardsAdvancedFilters() {
  const box = el("cardsAdvancedFilters");
  if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

function resetCardsFilters() {
  [
    "cardsSearch",
    "cardsType",
    "cardsStatus",
    "cardsDistrict",
    "cardsStation",
  ].forEach((id) => {
    if (el(id)) el(id).value = "";
  });
  renderCards();
}

let renouvCardsSelectionMode = false;

function isRenouvCard(card) {
  if (!card) return false;
  return card.isRenouvelee === true;
}

function isNouvelleCard(card) {
  if (!card) return false;
  if (card.isNouvelle === true) return true;
  return !isRenouvCard(card);
}

function visibleRenouvCards() {
  refreshStatuses();
  const search = (el("renouvCardsSearch")?.value || "").trim().toLowerCase();
  const type = el("renouvCardsType")?.value || "";
  const district = el("renouvCardsDistrict")?.value || "";
  const dateReceptionDebut = el("renouvCardsDateReceptionDebut")?.value || "";
  const dateReceptionFin = el("renouvCardsDateReceptionFin")?.value || "";
  return state.cards
    .filter((card) => {
      // Cartes Renouvelée par lignée (nature) et encore en stock à la DPE
      // (côté UI, "Nouvelle carte" = etat backend "En_stock").
      return (
        !card.archived &&
        hasScope(card) &&
        isRenouvCard(card) &&
        card.status === "Renouvelée"
      );
    })
    .filter((card) => {
      const hay = [
        card.number,
        card.owner,
        card.station,
        card.codeClient,
        card.company,
        card.location,
        card.district,
        card.type,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!search || hay.includes(search)) &&
        (!type || card.type === type) &&
        (!district || card.district === district) &&
        (!dateReceptionDebut || (card.createdAt && card.createdAt >= dateReceptionDebut)) &&
        (!dateReceptionFin || (card.createdAt && card.createdAt <= dateReceptionFin))
      );
    });
}

function renderRenouvCardsSummary() {
  const rows = visibleRenouvCards();
  const total = state.cards.filter(
    (c) => !c.archived && hasScope(c) && isRenouvCard(c),
  ).length;
  const circulation = state.cards.filter(
    (c) =>
      !c.archived &&
      c.status === "En circulation" &&
      hasScope(c) &&
      isRenouvCard(c),
  ).length;
  const stock = circulation;
  const rate = total ? Math.round((circulation / total) * 100) : 0;
  if (el("renouvCardsKpiTotal"))
    el("renouvCardsKpiTotal").textContent = String(rows.length);
  if (el("renouvCardsKpiStock"))
    el("renouvCardsKpiStock").textContent = String(stock);
  if (el("renouvCardsKpiRate"))
    el("renouvCardsKpiRate").textContent = `${rate}%`;

  const chunks = [
    ["Total visible", rows.length, "fa-solid fa-layer-group"],
    [
      "Renouvelées",
      rows.filter((c) => c.status === "Renouvelée").length,
      "fa-solid fa-box",
    ],
    ["En circulation", circulation, "fa-solid fa-route"],
  ];
  const chipsHtml = chunks
    .map(
      ([label, value, icon]) =>
        `<span class="chip"><i class="${icon}"></i>${escapeHtml(label)} : ${value}</span>`,
    )
    .join("");
  if (el("renouvCardsSummary")) {
    const selectBtnText = renouvCardsSelectionMode
      ? '<i class="fa-solid fa-square-xmark"></i>Quitter sélection'
      : '<i class="fa-solid fa-square-check"></i>Sélectionner';
    const selectBtn =
      isDpeAdmin()
        ? `<button class="btn btn-ghost btn-sm" onclick="toggleRenouvCardsSelectionMode()">${selectBtnText}</button>`
        : "";
    const circulateBtn =
      isDpeAdmin() && renouvCardsSelectionMode
        ? `<button class="btn btn-primary btn-sm" onclick="bulkSetRenouvCardsToCirculation()"><i class="fa-solid fa-circle-check"></i>Mettre en circulation</button>`
        : "";

    const actionsHtml = [selectBtn, circulateBtn].filter(Boolean).join("");
    el("renouvCardsSummary").innerHTML =
      `<div style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">${chipsHtml}</div>
    <div style="display:flex;gap:8px;">
      ${actionsHtml}
    </div></div>`;
  }
}

//tab carte renouvelée *******************************************************************************************************************
function renderRenouvCards() {
  const rows = visibleRenouvCards();
  renderRenouvCardsSummary();
  const body = el("renouvCardsBody");
  if (!body) return;

  const selectTh = el("renouvCardsSelectTh");
  if (selectTh)
    selectTh.style.display =
      isDpeAdmin() && renouvCardsSelectionMode ? "" : "none";

  body.innerHTML =
    rows
      .map(
        (card) => `
    <tr>
       ${isDpeAdmin() && renouvCardsSelectionMode ? `<td><input type="checkbox" ${card.renouvSelected ? "checked" : ""} onchange="toggleRenouvCardSelection('${escapeHtml(card.id)}', this.checked)"></td>` : ""}

      <td>${escapeHtml(card.number)}</td>
      <td>${badge(card.status)}</td>
      <td><span class="badge info">${escapeHtml(card.type)}</span></td>
      <td>${escapeHtml(card.district)}</td>
      <td>${escapeHtml(card.codeStructure)}</td>

      <td>${escapeHtml(card.codeClient)}</td>
      <td>${escapeHtml(card.owner)}</td>
      <td>${escapeHtml(card.numeroPorteur ||  "—")}</td>      
      <td>${formatDate(card.expirationDate)}</td>
      <td>${formatDate(card.createdAt)}</td>
      <td><span class="badge info">${escapeHtml(card.amortissement || "—")}</span></td>
      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" title="Voir" onclick="viewCard('${escapeHtml(card.id)}')"><i class="fa-solid fa-eye"></i></button>
        </div>
      </td>
    </tr>
  `,
      )
      .join("") ||
    `<tr><td colspan="${isDpeAdmin() && renouvCardsSelectionMode ? 15 : 14}" class="muted">Aucune carte renouvelée trouvée.</td></tr>`;
}

function toggleRenouvCardsAdvancedFilters() {
  const box = el("renouvCardsAdvancedFilters");
  if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

// Importe des cartes renouvelées à partir du texte d'un fichier CSV.
function importRenouvCardsFromCsv(text) {
  if (!requireWrite()) return;
  const rows = csvParse(text);
  if (!rows.length) {
    showToast("CSV cartes renouvelées vide.", true);
    return;
  }
  // Log pour afficher les headers disponibles
  console.log("=== Headers du CSV ===");
  if (rows.length > 0) {
    console.log(Object.keys(rows[0]));
  }
  let added = 0;
  rows.forEach((row, rowIndex) => {
    const number =
      row.number || row["N° Carte"] || row.numero || row["numero_carte"];
    if (!number || state.cards.some((card) => card.number === number)) return;
    const createdAt =
      row.createdAt || row.date_creation || nowIso().slice(0, 10);
    // Extraction du BTS — recherche d'abord par cles exactes, puis fallback insensible a la casse
    const btsKeys = [
      "bts",
      "BTS",
      "Numero BTS",
      "N° BTS",
      "N BTS",
      "bts_number",
      "num bts",
      "Num BTS",
      "Num_BTS",
      "NUM_BTS",
      "numBts",
      "numBTS",
      "num_bts",
      "Numéro BTS",
      "numero_bts",
      "numeroBts",
      "numero_bordereau_bts",
      "N_BTS",
      "nbts",
      "NBTS",
    ];
    let btsValue = null;
    // 1) Recherche par cles exactes
    for (const key of btsKeys) {
      const val = row[key];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        btsValue = String(val).trim();
        break;
      }
    }
    // 2) Fallback : recherche insensible a la casse sur toutes les cles du row
    if (!btsValue) {
      const rowKeys = Object.keys(row);
      const fallbackKey = rowKeys.find((k) =>
        k
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .includes("bts"),
      );
      if (fallbackKey) {
        const val = String(row[fallbackKey]).trim();
        if (val !== "") btsValue = val;
      }
    }
    console.log(
      `Ligne ${rowIndex}: numero=${number}, btsValue=${btsValue}, row:`,
      row,
    );
    const card = {
      id: uid("card"),
      number,
      type: row.type || row["Type"] || "Numéroté",
      status: "Renouvelée",
      isRenouvelee: true,
      district: row.district || row["District"] || "DISTRICT COM ANNABA",
      owner: row.owner || row["Propriétaire"] || row.client || "Client importé",
      station: row.station || row["Station"] || "AGENCE COM SKIKDA",
      expirationDate:
        row.expirationDate || row["Expiration"] || addYears(createdAt, 3),
      location: row.location || row["Localisation"] || "Coffre DPE",
      codeClient:
        row.codeClient ||
        row["Code client"] ||
        row["Code Client"] ||
        `CLI-${Math.floor(Math.random() * 9000 + 1000)}`,
      company: row.company || row["Raison sociale"] || row.owner || "—",
      anomaly: row.anomaly || row["Anomalie"] || "",
      bts: btsValue || "", // Stocke la valeur extraite ou une string vide
      createdAt,
      transferState: "",
      selected: false,
      archived: false,
      sentToDistrictForAnomaly: false,
      events: [],
    };
    state.cards.unshift(card);
    logCardEvent(
      card.id,
      " Import carte renouvelée",
      "Carte renouvelée importée au stock ",
    );
    added += 1;
  });
  saveState();
  populateScopeFilters();
  renderAll();
  showToast(`${added} carte(s) renouvelée(s) importée(s).`);
}

function resetRenouvCardsFilters() {
  [
    "renouvCardsSearch",
    "renouvCardsType",
    "renouvCardsDistrict",
  ].forEach((id) => {
    if (el(id)) el(id).value = "";
  });
  // Reset date filters
  if (el("renouvCardsDateReceptionDebut")) el("renouvCardsDateReceptionDebut").value = "";
  if (el("renouvCardsDateReceptionFin")) el("renouvCardsDateReceptionFin").value = "";
  renderRenouvCards();
}

function toggleRenouvCardsSelectionMode() {
  if (!requireDpeAdmin()) return;
  renouvCardsSelectionMode = !renouvCardsSelectionMode;
  if (!renouvCardsSelectionMode) {
    state.cards.forEach((card) => {
      card.renouvSelected = false;
    });
    const selectAll = el("renouvCardsSelectAll");
    if (selectAll) selectAll.checked = false;
  }
  saveState();
  renderRenouvCardsSummary(); // Refresh button text
  renderRenouvCards();
}

function toggleRenouvCardSelection(id, checked) {
  if (!requireDpeAdmin()) return;
  const card = state.cards.find((c) => c.id === id || c.number === id);
  if (!card) return;
  card.renouvSelected = checked;
  // Ne pas appeler renderRenouvCards() qui reset tout via refreshStatuses
  // Juste mettre à jour la checkbox visuellement
  const checkbox = document.querySelector(`input[onchange*="'${id}'"]`);
  if (checkbox) checkbox.checked = checked;
  renderRenouvCardsSummary();
}

function toggleSelectAllVisibleRenouvCards(flag) {
  if (!requireDpeAdmin()) return;
  visibleRenouvCards().forEach((card) => {
    card.renouvSelected = !!flag;
  });
  saveState();
  renderRenouvCards();
}

async function bulkSetRenouvCardsToCirculation() {
  if (!requireDpeAdmin()) return;
  const selected = state.cards.filter((card) => card.renouvSelected === true);
  if (!selected.length) {
    showToast("Aucune carte renouvelée sélectionnée.", true);
    return;
  }

  const stations = [...new Set(selected.map((c) => c.station))];
  if (stations.length > 1) {
    showToast(
      "Toutes les cartes sélectionnées doivent appartenir à la même structure.",
      true,
    );
    return;
  }

  let structures = [];
  try {
    const resp = await API.structure.list();
    structures = resp?.structures || [];
  } catch (err) {
    showToast(
      err?.message || "Impossible de charger la liste des structures.",
      true,
    );
    return;
  }
  if (!structures.length) {
    showToast("Aucune structure disponible pour votre compte.", true);
    return;
  }

  const preselect = structures.find(
    (s) => s.nom_structure === stations[0] || s.code === stations[0],
  );
  const structureOptions = structures
    .map(
      (s) =>
        `<option value="${escapeHtml(s.code)}" ${preselect && s.code === preselect.code ? "selected" : ""}>${escapeHtml(s.nom_structure)} (${escapeHtml(s.code)})</option>`,
    )
    .join("");

  const body = `
    <div class="form-grid">
      <div class="field"><label>Bénéficiaire *</label><input id="renouvType1Beneficiary" placeholder="Nom du bénéficiaire" required></div>
      <div class="field"><label>Fonction *</label><input id="renouvType1Function" placeholder="Ex: Chauffeur" required></div>
      <div class="field"><label>Structure *</label><select id="renouvType1Structure" required>${structureOptions}</select></div>
      <div class="field"><label>Structure rattachement</label><input id="renouvType1District" value="DISTRICT COM ANNABA"></div>
      <div class="field"><label>N° BTS *</label><input id="renouvType1Bts" readonly required placeholder="Génération automatique..."></div>
      <div class="field"><label>Date de sortie *</label><input id="renouvType1Date" type="date" value="${nowIso().slice(0, 10)}" required></div>
    </div>
    <div style="margin-top:12px;" class="muted">${selected.length} carte(s) renouvelée(s) — décharge type 1 sera générée.</div>`;
  openModal(
    "Mise en circulation - Décharge type 1 (Renouvelée)",
    body,
    `
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="confirmBulkCirculationRenouv()">Confirmer</button>
  `,
  );
  // Génération automatique du N° BTS
  API.decharges.getNextBTS().then((resp) => {
    const input = el("renouvType1Bts");
    if (input && resp?.data?.numero_bordereau_bts) {
      input.value = resp.data.numero_bordereau_bts;
    }
  }).catch(() => {
    const input = el("renouvType1Bts");
    if (input) input.placeholder = "Erreur de génération";
  });
}

async function confirmBulkCirculationRenouv() {
  if (!requireWrite()) return;
  const selected = state.cards.filter((card) => card.renouvSelected === true);
  if (!selected.length) return;

  const beneficiary = el("renouvType1Beneficiary").value.trim();
  const functionLabel = el("renouvType1Function").value.trim();
  const structure = el("renouvType1Structure").value.trim();
  const district = el("renouvType1District").value.trim();
  const bts = el("renouvType1Bts").value.trim();
  const date = el("renouvType1Date").value;

  if (!beneficiary) {
    showToast("Le bénéficiaire est obligatoire.", true);
    return;
  }
  if (!functionLabel) {
    showToast("La fonction est obligatoire.", true);
    return;
  }
  if (!bts || bts === "Non spécifié") {
    showToast("Le N° BTS est obligatoire.", true);
    return;
  }
  if (!date) {
    showToast("La date de sortie est obligatoire.", true);
    return;
  }

  const meta = {
    beneficiary,
    functionLabel,
    structure: structure || "AGENCE COM SKIKDA",
    district: district || "DISTRICT COM ANNABA",
    bts,
    date: date || nowIso().slice(0, 10),
  };

  try {
    const response = await API.decharges.createType1({
      source: "DPE_CENTRE",
      destination: meta.structure,
      nom_beneficiaire: meta.beneficiary,
      fonction_beneficiaire: meta.functionLabel,
      date_sortie: meta.date,
      numero_bordereau_bts: meta.bts,
      cartes: selected.map((c) => ({
        numero: c.number,
        code_client: c.codeClient,
        raisonsocialeclient: c.company,
      })),
    });

    selected.forEach((card) => {
      card.status = "En circulation";
      card.isRenouvelee = false;
      card.isNouvelle = false;
      card.location = meta.structure;
      card.station = meta.structure;
      card.district = meta.district;
      card.transferState = "Remise initiale DPE -> Structure";
      card.renouvSelected = false;
      card.archived = false;
      card.bts = meta.bts; //stockage BTS
      logCardEvent(
        card.id,
        "Mise en circulation",
        `Décharge type 1 (renouvelée) vers ${meta.structure}`,
      );
    });

    const pdf = await generateDechargeType1(selected, meta);
    storeDecharge({
      kind: "type1",
      assetType: "Carte",
      object: "Décharge d'envoi initial des cartes renouvelées",
      from: "DPE",
      to: meta.structure,
      date: meta.date,
      status: "Générée",
      cards: selected.map((card) => card.id),
      pdfDataUri: pdf,
      reference:
        response?.data?.numero_decharge || nextReference("type1", selected),
      nom_beneficiaire: meta.beneficiary,
      fonction_beneficiaire: meta.functionLabel,
      beneficiary: meta.beneficiary,
      functionLabel: meta.functionLabel,
      numero_bordereau_bts: meta.bts,
    });

    renouvCardsSelectionMode = false;
    const selectAll = el("renouvCardsSelectAll");
    if (selectAll) selectAll.checked = false;
    saveState();
    await loadState(); // ← recharge depuis la DB

    renderAll();
    showToast("Cartes renouvelées mises en circulation + décharge générée.");
  } catch (error) {
    showToast(error?.message || "Erreur lors de la mise en circulation.", true);
  }
}