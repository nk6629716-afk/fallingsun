import {
  CreateIncidentInput,
  UpdateIncidentInput,
  SyncBatchRequest,
  CreateGeoObservationInput,
  UpdateGeoObservationInput,
  CreatePatientInput,
  UpdatePatientInput,
  CreateHazardInput,
  RouteCalculationRequest,
  GeoPoint,
  PriorityLevel,
  SourceModule,
  IncidentType,
  CreateSoldierVitalsInput,
} from '../../../shared/types';
import { ERROR_CODES } from '../../../shared/contracts';

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export class ValidationError extends Error {
  public code: string;
  public details: ValidationErrorDetail[];

  constructor(message: string, details: ValidationErrorDetail[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.code = ERROR_CODES.VALIDATION_ERROR;
    this.details = details;
  }
}

// Helper: validate coordinates
export function validateGeoPoint(point: unknown, fieldName = 'location'): GeoPoint {
  if (!point || typeof point !== 'object') {
    throw new ValidationError(`Invalid ${fieldName}: must be an object with lat and lng`);
  }

  const p = point as Record<string, unknown>;
  const lat = Number(p.lat);
  const lng = Number(p.lng);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    throw new ValidationError(`Invalid ${fieldName}.lat: must be a number between -90 and 90`, [
      { field: `${fieldName}.lat`, message: 'Latitude must be between -90 and 90' },
    ]);
  }

  if (isNaN(lng) || lng < -180 || lng > 180) {
    throw new ValidationError(`Invalid ${fieldName}.lng: must be a number between -180 and 180`, [
      { field: `${fieldName}.lng`, message: 'Longitude must be between -180 and 180' },
    ]);
  }

  return {
    lat,
    lng,
    name: typeof p.name === 'string' ? p.name.trim() : undefined,
  };
}

// --------------------------------------------------------------------------
// Incident Validators
// --------------------------------------------------------------------------
const VALID_SOURCE_MODULES: SourceModule[] = ['fieldlink', 'skywatch', 'geointel', 'mediroute', 'system'];
const VALID_PRIORITIES: PriorityLevel[] = ['critical', 'high', 'medium', 'low'];
const VALID_INCIDENT_TYPES: IncidentType[] = [
  'security_breach',
  'medical_evac',
  'drone_incursion',
  'recon_anomaly',
  'infrastructure_damage',
  'communication_loss',
  'road_blockage',
  'medical',
  'hazard',
  'hostile_drone',
  'infrastructure',
  'recon',
  'general',
];
const VALID_INCIDENT_STATUSES = ['active', 'in_progress', 'resolved', 'archived'];

export function validateCreateIncident(body: unknown): CreateIncidentInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const b = body as Record<string, unknown>;
  const errors: ValidationErrorDetail[] = [];

  // Title
  if (!b.title || typeof b.title !== 'string' || b.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required and must not be empty' });
  } else if (b.title.length > 200) {
    errors.push({ field: 'title', message: 'Title must not exceed 200 characters' });
  }

  // Priority
  if (!b.priority || typeof b.priority !== 'string' || !VALID_PRIORITIES.includes(b.priority as PriorityLevel)) {
    errors.push({
      field: 'priority',
      message: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}`,
    });
  }

  // Source Module
  if (!b.sourceModule || typeof b.sourceModule !== 'string' || !VALID_SOURCE_MODULES.includes(b.sourceModule as SourceModule)) {
    errors.push({
      field: 'sourceModule',
      message: `Source module must be one of: ${VALID_SOURCE_MODULES.join(', ')}`,
    });
  }

  // Type
  if (!b.type || typeof b.type !== 'string' || !VALID_INCIDENT_TYPES.includes(b.type as IncidentType)) {
    errors.push({
      field: 'type',
      message: `Incident type must be one of: ${VALID_INCIDENT_TYPES.join(', ')}`,
    });
  }

  // Notes
  if (b.notes !== undefined && typeof b.notes !== 'string') {
    errors.push({ field: 'notes', message: 'Notes must be a string' });
  }

  // Location
  let validatedLocation: GeoPoint = { lat: 0, lng: 0 };
  try {
    validatedLocation = validateGeoPoint(b.location, 'location');
  } catch (err) {
    if (err instanceof ValidationError) {
      errors.push(...err.details);
    } else {
      errors.push({ field: 'location', message: 'Invalid location object' });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed for incident creation', errors);
  }

  return {
    clientId: typeof b.clientId === 'string' ? b.clientId.trim() : undefined,
    sourceModule: b.sourceModule as SourceModule,
    type: b.type as IncidentType,
    priority: b.priority as PriorityLevel,
    title: (b.title as string).trim(),
    notes: typeof b.notes === 'string' ? b.notes.trim() : '',
    location: validatedLocation,
    status: typeof b.status === 'string' && VALID_INCIDENT_STATUSES.includes(b.status)
      ? (b.status as any)
      : 'active',
    createdAt: typeof b.createdAt === 'string' ? b.createdAt : undefined,
  };
}

export function validateUpdateIncident(body: unknown): UpdateIncidentInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object');
  }
  const b = body as Record<string, unknown>;
  const errors: ValidationErrorDetail[] = [];

  if (b.status !== undefined) {
    if (typeof b.status !== 'string' || !VALID_INCIDENT_STATUSES.includes(b.status)) {
      errors.push({ field: 'status', message: `Status must be one of: ${VALID_INCIDENT_STATUSES.join(', ')}` });
    }
  }

  if (b.priority !== undefined) {
    if (typeof b.priority !== 'string' || !VALID_PRIORITIES.includes(b.priority as PriorityLevel)) {
      errors.push({ field: 'priority', message: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }
  }

  if (b.title !== undefined) {
    if (typeof b.title !== 'string' || b.title.trim().length === 0 || b.title.length > 200) {
      errors.push({ field: 'title', message: 'Title must be between 1 and 200 characters' });
    }
  }

  if (b.notes !== undefined && typeof b.notes !== 'string') {
    errors.push({ field: 'notes', message: 'Notes must be a string' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed for incident update', errors);
  }

  return {
    status: b.status as any,
    priority: b.priority as any,
    title: typeof b.title === 'string' ? b.title.trim() : undefined,
    notes: typeof b.notes === 'string' ? b.notes.trim() : undefined,
  };
}

// --------------------------------------------------------------------------
// Batch Sync Validator
// --------------------------------------------------------------------------
export function validateSyncBatchRequest(body: unknown): SyncBatchRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Sync request body must be a valid JSON object');
  }
  const b = body as Record<string, unknown>;

  // Canonical schema is { items: [...] }. For backward compatibility, also accept { reports: [...] }
  const rawList = Array.isArray(b.items) ? b.items : Array.isArray(b.reports) ? b.reports : null;

  if (!rawList) {
    throw new ValidationError('Sync request must contain an "items" array', [
      { field: 'items', message: 'Expected an array of sync items' },
    ]);
  }

  return {
    batchId: typeof b.batchId === 'string' ? b.batchId : undefined,
    items: rawList as any,
  };
}

// --------------------------------------------------------------------------
// GeoIntel Validators
// --------------------------------------------------------------------------
export function validateCreateGeoObservation(body: unknown): CreateGeoObservationInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Observation body must be a valid JSON object');
  }
  const b = body as Record<string, unknown>;
  const errors: ValidationErrorDetail[] = [];

  if (!b.samplePairId || typeof b.samplePairId !== 'string') {
    errors.push({ field: 'samplePairId', message: 'samplePairId is required' });
  }
  if (!b.beforeImageId || typeof b.beforeImageId !== 'string') {
    errors.push({ field: 'beforeImageId', message: 'beforeImageId is required' });
  }
  if (!b.afterImageId || typeof b.afterImageId !== 'string') {
    errors.push({ field: 'afterImageId', message: 'afterImageId is required' });
  }

  // Normalized coordinates: { x, y, width, height }
  if (!b.normalizedCoordinates || typeof b.normalizedCoordinates !== 'object') {
    errors.push({ field: 'normalizedCoordinates', message: 'normalizedCoordinates object is required' });
  } else {
    const coords = b.normalizedCoordinates as Record<string, unknown>;
    const x = Number(coords.x);
    const y = Number(coords.y);
    const w = Number(coords.width);
    const h = Number(coords.height);

    if (isNaN(x) || x < 0 || x > 1 || isNaN(y) || y < 0 || y > 1 || isNaN(w) || w <= 0 || isNaN(h) || h <= 0) {
      errors.push({
        field: 'normalizedCoordinates',
        message: 'Coordinates must be valid normalized numbers between 0.0 and 1.0',
      });
    }
  }

  const diffScore = Number(b.differenceScore);
  if (isNaN(diffScore) || diffScore < 0 || diffScore > 1) {
    errors.push({ field: 'differenceScore', message: 'differenceScore must be a number between 0.0 and 1.0' });
  }

  if (!b.explanation || typeof b.explanation !== 'string') {
    errors.push({ field: 'explanation', message: 'explanation is required' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed for GeoObservation creation', errors);
  }

  let geoCoords: GeoPoint | undefined;
  if (b.geoCoordinates) {
    geoCoords = validateGeoPoint(b.geoCoordinates, 'geoCoordinates');
  }

  return {
    id: typeof b.id === 'string' ? b.id.trim() : undefined,
    clientId: typeof b.clientId === 'string' ? b.clientId.trim() : undefined,
    samplePairId: (b.samplePairId as string).trim(),
    beforeImageId: (b.beforeImageId as string).trim(),
    afterImageId: (b.afterImageId as string).trim(),
    normalizedCoordinates: b.normalizedCoordinates as any,
    geoCoordinates: geoCoords,
    differenceScore: diffScore,
    algorithmSettings: (b.algorithmSettings as any) || { threshold: 0.25, minRegionSize: 50 },
    explanation: (b.explanation as string).trim(),
    analystNotes: typeof b.analystNotes === 'string' ? b.analystNotes.trim() : '',
  };
}

export function validateUpdateGeoObservation(body: unknown): UpdateGeoObservationInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Update body must be a valid JSON object');
  }
  const b = body as Record<string, unknown>;
  const validStatuses = ['pending_review', 'confirmed_candidate', 'dismissed_false_positive'];

  if (b.reviewStatus !== undefined) {
    if (typeof b.reviewStatus !== 'string' || !validStatuses.includes(b.reviewStatus)) {
      throw new ValidationError(`reviewStatus must be one of: ${validStatuses.join(', ')}`);
    }
  }

  return {
    reviewStatus: b.reviewStatus as any,
    analystNotes: typeof b.analystNotes === 'string' ? b.analystNotes.trim() : undefined,
  };
}

// --------------------------------------------------------------------------
// MediRoute Validators
// --------------------------------------------------------------------------
const VALID_TRIAGE_CATEGORIES = ['immediate', 'delayed', 'minimal', 'expectant'];
const VALID_WORKFLOW_STATUSES = ['awaiting_assessment', 'assessed', 'assigned', 'evacuated'];

export function validateCreatePatient(body: unknown): CreatePatientInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Patient body must be a valid JSON object');
  }
  const b = body as Record<string, unknown>;
  const errors: ValidationErrorDetail[] = [];

  if (!b.fictionalName || typeof b.fictionalName !== 'string') {
    errors.push({ field: 'fictionalName', message: 'fictionalName is required' });
  }

  const age = Number(b.age);
  if (isNaN(age) || age < 0 || age > 130) {
    errors.push({ field: 'age', message: 'Age must be a valid number between 0 and 130' });
  }

  let location: GeoPoint = { lat: 0, lng: 0 };
  try {
    location = validateGeoPoint(b.location, 'location');
  } catch (err) {
    if (err instanceof ValidationError) {
      errors.push(...err.details);
    } else {
      errors.push({ field: 'location', message: 'Invalid location' });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed for patient creation', errors);
  }

  return {
    fictionalName: (b.fictionalName as string).trim(),
    age,
    gender: typeof b.gender === 'string' ? b.gender : undefined,
    triageCategory: typeof b.triageCategory === 'string' && VALID_TRIAGE_CATEGORIES.includes(b.triageCategory)
      ? (b.triageCategory as any)
      : undefined,
    vitals: (b.vitals as any) || {},
    location,
    workflowStatus: typeof b.workflowStatus === 'string' && VALID_WORKFLOW_STATUSES.includes(b.workflowStatus)
      ? (b.workflowStatus as any)
      : 'awaiting_assessment',
  };
}

export function validateUpdatePatient(body: unknown): UpdatePatientInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Update body must be a valid JSON object');
  }
  const b = body as Record<string, unknown>;

  if (b.workflowStatus !== undefined && (!b.workflowStatus || !VALID_WORKFLOW_STATUSES.includes(b.workflowStatus as string))) {
    throw new ValidationError(`workflowStatus must be one of: ${VALID_WORKFLOW_STATUSES.join(', ')}`);
  }

  if (b.triageCategory !== undefined && (!b.triageCategory || !VALID_TRIAGE_CATEGORIES.includes(b.triageCategory as string))) {
    throw new ValidationError(`triageCategory must be one of: ${VALID_TRIAGE_CATEGORIES.join(', ')}`);
  }

  return {
    workflowStatus: b.workflowStatus as any,
    triageCategory: b.triageCategory as any,
    assignedFacilityId: typeof b.assignedFacilityId === 'string' ? b.assignedFacilityId : undefined,
    triageReason: typeof b.triageReason === 'string' ? b.triageReason : undefined,
  };
}

export function validateCreateHazard(body: unknown): CreateHazardInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Hazard body must be a valid JSON object');
  }
  const b = body as Record<string, unknown>;
  const errors: ValidationErrorDetail[] = [];

  if (!b.edgeId || typeof b.edgeId !== 'string') {
    errors.push({ field: 'edgeId', message: 'edgeId is required' });
  }
  if (!b.fromNode || typeof b.fromNode !== 'string') {
    errors.push({ field: 'fromNode', message: 'fromNode is required' });
  }
  if (!b.toNode || typeof b.toNode !== 'string') {
    errors.push({ field: 'toNode', message: 'toNode is required' });
  }
  if (typeof b.blocked !== 'boolean') {
    errors.push({ field: 'blocked', message: 'blocked flag must be a boolean' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed for hazard creation', errors);
  }

  return {
    edgeId: (b.edgeId as string).trim(),
    fromNode: (b.fromNode as string).trim(),
    toNode: (b.toNode as string).trim(),
    hazardType: b.hazardType as any,
    blocked: b.blocked as boolean,
    reportedBy: typeof b.reportedBy === 'string' ? b.reportedBy.trim() : 'Field Unit',
  };
}

export function validateRouteCalculation(body: unknown): RouteCalculationRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Route calculation request body must be a valid JSON object');
  }
  const b = body as Record<string, unknown>;

  if (!b.startNodeId || typeof b.startNodeId !== 'string') {
    throw new ValidationError('startNodeId is required');
  }
  if (!b.destinationNodeId || typeof b.destinationNodeId !== 'string') {
    throw new ValidationError('destinationNodeId is required');
  }

  return {
    startNodeId: (b.startNodeId as string).trim(),
    destinationNodeId: (b.destinationNodeId as string).trim(),
    avoidHazards: b.avoidHazards !== false, // default true
  };
}

export function validateCreateSoldierVitals(body: unknown): CreateSoldierVitalsInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Soldier vitals request body must be a valid JSON object');
  }
  const b = body as Record<string, unknown>;
  const errors: ValidationErrorDetail[] = [];

  if (!b.soldierId || typeof b.soldierId !== 'string' || b.soldierId.trim().length === 0) {
    errors.push({ field: 'soldierId', message: 'soldierId is required and must not be empty' });
  }

  if (b.heartRateBpm !== undefined && b.heartRateBpm !== null) {
    const hr = Number(b.heartRateBpm);
    if (isNaN(hr) || hr < 30 || hr > 250) {
      errors.push({ field: 'heartRateBpm', message: 'Heart rate must be between 30 and 250 bpm' });
    }
  }

  if (b.bloodPressureSystolic !== undefined && b.bloodPressureSystolic !== null) {
    const sys = Number(b.bloodPressureSystolic);
    if (isNaN(sys) || sys < 50 || sys > 260) {
      errors.push({ field: 'bloodPressureSystolic', message: 'Systolic blood pressure must be between 50 and 260 mmHg' });
    }
  }

  if (b.bloodPressureDiastolic !== undefined && b.bloodPressureDiastolic !== null) {
    const dia = Number(b.bloodPressureDiastolic);
    if (isNaN(dia) || dia < 30 || dia > 160) {
      errors.push({ field: 'bloodPressureDiastolic', message: 'Diastolic blood pressure must be between 30 and 160 mmHg' });
    }
  }

  if (b.temperatureCelsius !== undefined && b.temperatureCelsius !== null) {
    const temp = Number(b.temperatureCelsius);
    if (isNaN(temp) || temp < 30 || temp > 45) {
      errors.push({ field: 'temperatureCelsius', message: 'Body temperature must be between 30.0 and 45.0 °C' });
    }
  }

  if (b.oxygenSaturationPct !== undefined && b.oxygenSaturationPct !== null) {
    const spo2 = Number(b.oxygenSaturationPct);
    if (isNaN(spo2) || spo2 < 50 || spo2 > 100) {
      errors.push({ field: 'oxygenSaturationPct', message: 'Oxygen saturation must be between 50% and 100%' });
    }
  }

  if (b.respiratoryRateBpm !== undefined && b.respiratoryRateBpm !== null) {
    const rr = Number(b.respiratoryRateBpm);
    if (isNaN(rr) || rr < 4 || rr > 60) {
      errors.push({ field: 'respiratoryRateBpm', message: 'Respiratory rate must be between 4 and 60 breaths/min' });
    }
  }

  if (b.clinicalNotes !== undefined && b.clinicalNotes !== null) {
    if (typeof b.clinicalNotes !== 'string') {
      errors.push({ field: 'clinicalNotes', message: 'Clinical notes must be a string' });
    } else if (b.clinicalNotes.length > 1000) {
      errors.push({ field: 'clinicalNotes', message: 'Clinical notes must not exceed 1000 characters' });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed for soldier vitals record', errors);
  }

  return {
    soldierId: (b.soldierId as string).trim(),
    timestamp: typeof b.timestamp === 'string' ? b.timestamp : new Date().toISOString(),
    heartRateBpm: b.heartRateBpm !== undefined && b.heartRateBpm !== null ? Number(b.heartRateBpm) : undefined,
    bloodPressureSystolic: b.bloodPressureSystolic !== undefined && b.bloodPressureSystolic !== null ? Number(b.bloodPressureSystolic) : undefined,
    bloodPressureDiastolic: b.bloodPressureDiastolic !== undefined && b.bloodPressureDiastolic !== null ? Number(b.bloodPressureDiastolic) : undefined,
    temperatureCelsius: b.temperatureCelsius !== undefined && b.temperatureCelsius !== null ? Number(b.temperatureCelsius) : undefined,
    oxygenSaturationPct: b.oxygenSaturationPct !== undefined && b.oxygenSaturationPct !== null ? Number(b.oxygenSaturationPct) : undefined,
    respiratoryRateBpm: b.respiratoryRateBpm !== undefined && b.respiratoryRateBpm !== null ? Number(b.respiratoryRateBpm) : undefined,
    clinicalNotes: typeof b.clinicalNotes === 'string' ? b.clinicalNotes.trim() : undefined,
  };
}
