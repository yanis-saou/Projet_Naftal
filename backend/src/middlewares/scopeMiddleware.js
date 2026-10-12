const prisma = require('../config/prisma');

const DPE_ROLES = ['ADMIN_DPE', 'MEMBRE_DPE', 'CONSULTANT_DPE'];
const DISTRICT_ROLES = ['MEMBRE_DISTRICT', 'CONSULTANT_DISTRICT'];
const AGENCE_ROLES = ['MEMBRE_AGENCE', 'CONSULTANT_AGENCE'];
const ANTENNE_ROLES = ['MEMBRE_ANTENNE', 'CONSULTANT_ANTENNE'];

const normalizeRole = (role) => String(role || '').trim().toUpperCase();
const normalizeValue = (value) => String(value || '').trim().toUpperCase();

const uniqStrings = (values) => {
  const seen = new Set();
  const result = [];

  for (const value of values || []) {
    const raw = value == null ? '' : String(value).trim();
    if (!raw) continue;

    const key = normalizeValue(raw);
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(raw);
  }

  return result;
};

const makeLookupSet = (values) => new Set(uniqStrings(values).map(normalizeValue));

const combineWhere = (...clauses) => {
  const cleanClauses = clauses.filter(
    (clause) => clause && typeof clause === 'object' && Object.keys(clause).length > 0,
  );

  if (!cleanClauses.length) return {};
  if (cleanClauses.length === 1) return cleanClauses[0];

  return { AND: cleanClauses };
};

const getNoMatchClause = ({ codeFields = [], nameFields = [], stationFields = [], idFields = [] }) => {
  if (codeFields[0]) return { [codeFields[0]]: '__NO_SCOPE__' };
  if (nameFields[0]) return { [nameFields[0]]: '__NO_SCOPE__' };
  if (stationFields[0]) return { [stationFields[0]]: '__NO_SCOPE__' };
  if (idFields[0]) return { [idFields[0]]: -1 };
  return { OR: [{ id: -1 }, { id: -2 }] };
};

const collectDescendantStructures = (rootCode, allStructures) => {
  const byParent = new Map();

  for (const structure of allStructures || []) {
    const parentCode = structure.code_parent || '__ROOT__';
    if (!byParent.has(parentCode)) {
      byParent.set(parentCode, []);
    }
    byParent.get(parentCode).push(structure);
  }

  const result = [];
  const queue = [rootCode];
  const visited = new Set();

  while (queue.length > 0) {
    const parentCode = queue.shift();
    const children = byParent.get(parentCode) || [];

    for (const child of children) {
      const key = normalizeValue(child.code);
      if (!key || visited.has(key)) continue;

      visited.add(key);
      result.push(child);
      queue.push(child.code);
    }
  }

  return result;
};

const getUserScope = async (req) => {
  const userRole = normalizeRole(req.user?.role);
  const userStructureId = Number(req.user?.id_structure);

  if (DPE_ROLES.includes(userRole)) {
    return {
      userRole,
      isGlobal: true,
      structure: null,
      structures: [],
      structureIds: [],
      structureCodes: [],
      structureNames: [],
      stationCodes: [],
      structureCodeSet: new Set(),
      structureNameSet: new Set(),
      stationCodeSet: new Set(),
    };
  }

  if (!Number.isInteger(userStructureId) || userStructureId <= 0) {
    return {
      userRole,
      isGlobal: false,
      structure: null,
      structures: [],
      structureIds: [],
      structureCodes: [],
      structureNames: [],
      stationCodes: [],
      structureCodeSet: new Set(),
      structureNameSet: new Set(),
      stationCodeSet: new Set(),
    };
  }

  const currentStructure = await prisma.structure.findUnique({
    where: { idstructure: userStructureId },
    select: {
      idstructure: true,
      code: true,
      nom_structure: true,
      type_structure: true,
      code_parent: true,
    },
  });

  if (!currentStructure) {
    return {
      userRole,
      isGlobal: false,
      structure: null,
      structures: [],
      structureIds: [],
      structureCodes: [],
      structureNames: [],
      stationCodes: [],
      structureCodeSet: new Set(),
      structureNameSet: new Set(),
      stationCodeSet: new Set(),
    };
  }

  let allowedStructures = [currentStructure];

  if (DISTRICT_ROLES.includes(userRole)) {
    const allStructures = await prisma.structure.findMany({
      select: {
        idstructure: true,
        code: true,
        nom_structure: true,
        type_structure: true,
        code_parent: true,
      },
    });

    allowedStructures = [
      currentStructure,
      ...collectDescendantStructures(currentStructure.code, allStructures),
    ];
  } else if (!AGENCE_ROLES.includes(userRole) && !ANTENNE_ROLES.includes(userRole)) {
    allowedStructures = [currentStructure];
  }

  const structureIds = [...new Set(allowedStructures.map((item) => item.idstructure).filter(Boolean))];
  const structureCodes = uniqStrings(allowedStructures.map((item) => item.code));
  const structureNames = uniqStrings(allowedStructures.map((item) => item.nom_structure));

  const stations = structureIds.length
    ? await prisma.station.findMany({
        where: { idstructure: { in: structureIds } },
        select: { code_station: true },
      })
    : [];

  const stationCodes = uniqStrings(stations.map((station) => station.code_station));

  return {
    userRole,
    isGlobal: false,
    structure: currentStructure,
    structures: allowedStructures,
    structureIds,
    structureCodes,
    structureNames,
    stationCodes,
    structureCodeSet: makeLookupSet(structureCodes),
    structureNameSet: makeLookupSet(structureNames),
    stationCodeSet: makeLookupSet(stationCodes),
  };
};

const buildScopedWhere = (
  scope,
  {
    codeFields = [],
    nameFields = [],
    stationFields = [],
    idFields = [],
  } = {},
) => {
  if (!scope || scope.isGlobal) return {};

  const clauses = [];

  if (scope.structureCodes.length) {
    for (const field of codeFields) {
      clauses.push({ [field]: { in: scope.structureCodes } });
    }
  }

  if (scope.structureNames.length) {
    for (const field of nameFields) {
      clauses.push({ [field]: { in: scope.structureNames } });
    }
  }

  if (scope.stationCodes.length) {
    for (const field of stationFields) {
      clauses.push({ [field]: { in: scope.stationCodes } });
    }
  }

  if (scope.structureIds.length) {
    for (const field of idFields) {
      clauses.push({ [field]: { in: scope.structureIds } });
    }
  }

  if (!clauses.length) {
    return getNoMatchClause({ codeFields, nameFields, stationFields, idFields });
  }

  return clauses.length === 1 ? clauses[0] : { OR: clauses };
};

const matchesScope = (scope, candidate = {}) => {
  if (!scope || scope.isGlobal) return true;

  if (candidate.idstructure != null && scope.structureIds.includes(Number(candidate.idstructure))) {
    return true;
  }

  const codeValues = [
    candidate.code,
    candidate.code_structure,
    candidate.structure_code,
    candidate.district_concerne,
    candidate.structure_ancienne,
    candidate.structure_actuelle,
  ]
    .map(normalizeValue)
    .filter(Boolean);

  if (codeValues.some((value) => scope.structureCodeSet.has(value))) {
    return true;
  }

  const nameValues = [
    candidate.nom_structure,
    candidate.district,
    candidate.raisonsocialestructure,
    candidate.raison_sociale_structure,
    candidate.structure,
    candidate.structure_concernee,
    candidate.structure_concerne,
    candidate.str_ancienne,
    candidate.str_nouvelle,
  ]
    .map(normalizeValue)
    .filter(Boolean);

  if (nameValues.some((value) => scope.structureNameSet.has(value))) {
    return true;
  }

  const stationValues = [candidate.code_station]
    .map(normalizeValue)
    .filter(Boolean);

  return stationValues.some((value) => scope.stationCodeSet.has(value));
};

const getScopeFilters = async (req) => {
  const scope = await getUserScope(req);

  return {
    scope,
    whereTPE: buildScopedWhere(scope, {
      codeFields: ['code_structure'],
      nameFields: ['district', 'raisonsocialestructure'],
      stationFields: ['code_station'],
    }),
    whereCarte: buildScopedWhere(scope, {
      codeFields: ['code_structure'],
      nameFields: ['district', 'raisonsocialestructure'],
    }),
    whereCirculationTPE: buildScopedWhere(scope, {
      codeFields: ['code_structure'],
      nameFields: ['district', 'raison_sociale_structure'],
      stationFields: ['code_station'],
    }),
    whereCirculationCarte: buildScopedWhere(scope, {
      codeFields: ['code_structure'],
      nameFields: ['district', 'raisonsocialestructure'],
    }),
    whereSuiviTPE: buildScopedWhere(scope, {
      nameFields: ['district', 'structure_concerne'],
      stationFields: ['code_station'],
    }),
    whereSuiviCarte: buildScopedWhere(scope, {
      codeFields: ['code_structure'],
      nameFields: ['district', 'raisonsocialestructure'],
    }),
    whereRestitutionTPE: buildScopedWhere(scope, {
      codeFields: ['str_ancienne', 'str_nouvelle'],
      nameFields: ['str_ancienne', 'str_nouvelle'],
      stationFields: ['code_station_ancienne', 'code_station_nouvelle'],
    }),
    whereStation: buildScopedWhere(scope, {
      idFields: ['idstructure'],
      nameFields: ['district'],
    }),
    whereStructure: buildScopedWhere(scope, {
      idFields: ['idstructure'],
      codeFields: ['code'],
      nameFields: ['nom_structure'],
    }),
  };
};

module.exports = {
  combineWhere,
  getScopeFilters,
  getUserScope,
  matchesScope,
};
